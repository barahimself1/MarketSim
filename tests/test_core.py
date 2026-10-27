import unittest, json, tempfile
from pathlib import Path
from marketsim.engine import Book, apply
from marketsim.simulation import generate, replay
from marketsim.execution import run, allocate, STRATEGIES
from marketsim.data import load
from marketsim.analytics import summarize_runs


class EngineTests(unittest.TestCase):
    def test_fifo(self):
        b = Book()
        b.submit("a", "SELL", 20, 100)
        b.submit("b", "SELL", 30, 100)
        r = b.submit("c", "BUY", 40)
        self.assertEqual(
            [(t["maker"], t["quantity"]) for t in r["fills"]], [("a", 20), ("b", 20)]
        )
        b.assert_invariants()

    def test_price_priority(self):
        b = Book()
        b.submit("a", "SELL", 10, 101)
        b.submit("b", "SELL", 10, 100)
        self.assertEqual(b.submit("c", "BUY", 15)["fills"][0]["maker"], "b")
        b.assert_invariants()

    def test_crossing_limit_rests(self):
        b = Book()
        b.submit("a", "SELL", 10, 100)
        b.submit("b", "BUY", 20, 101)
        self.assertEqual(b.best("BUY"), 101)
        self.assertEqual(b.orders["b"].remaining, 10)
        b.assert_invariants()

    def test_cancel(self):
        b = Book()
        b.submit("a", "BUY", 10, 100)
        b.cancel("a")
        self.assertEqual(b.submit("b", "SELL", 10)["fills"], [])

    def test_invalid_cancel(self):
        with self.assertRaises(ValueError):
            Book().cancel("missing")

    def test_empty_market_ioc(self):
        self.assertEqual(Book().submit("a", "BUY", 10)["order"]["state"], "CANCELLED")

    def test_insufficient(self):
        b = Book()
        b.submit("a", "SELL", 10, 100)
        r = b.submit("b", "BUY", 20)
        self.assertEqual(r["order"]["remaining"], 10)
        b.assert_invariants()

    def test_duplicate_identity(self):
        b = Book()
        b.submit("a", "BUY", 1)
        with self.assertRaises(ValueError):
            b.submit("a", "BUY", 1)

    def test_invalid_values(self):
        for q in [-1, 0, 1.2, True]:
            with self.assertRaises(ValueError):
                Book().submit("a", "BUY", q)

    def test_instruction_validation(self):
        for event in [
            {"type": "UNKNOWN"},
            {"type": "LIMIT", "price": None},
            {"type": "MARKET", "price": 100},
        ]:
            with self.assertRaises(ValueError):
                apply(Book(), event)

    def test_reused_price_after_cancel(self):
        b = Book()
        b.submit("a", "SELL", 10, 100)
        b.cancel("a")
        b.submit("b", "SELL", 20, 100)
        b.submit("c", "SELL", 20, 101)
        r = b.submit("d", "BUY", 40)
        self.assertEqual([f["price"] for f in r["fills"]], [100, 101])
        self.assertIsNone(b.best("SELL"))
        b.assert_invariants()

    def test_microprice(self):
        b = Book()
        b.submit("a", "BUY", 300, 99)
        b.submit("b", "SELL", 100, 101)
        s = b.snapshot()
        self.assertEqual(s["mid"], 100)
        self.assertEqual(s["microprice"], 100.5)
        self.assertEqual(s["imbalance"], 0.5)

    def test_randomized_invariants(self):
        b = Book()
        for e in generate(9, 150):
            apply(b, e)
            b.assert_invariants()

    def test_replay_determinism(self):
        self.assertEqual(replay(generate(42, 60)), replay(generate(42, 60)))

    def test_serialization(self):
        events = generate(42, 50)
        self.assertEqual(replay(events), replay(json.loads(json.dumps(events))))

    def test_sequence_rejected(self):
        es = generate(42, 30)
        es[2]["sequence"] = 1
        with self.assertRaises(ValueError):
            replay(es)

    def test_loader(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "events.jsonl"
            es = generate(42, 30)
            p.write_text("\n".join(map(json.dumps, es)))
            self.assertEqual(load(p), es)


class ExecutionTests(unittest.TestCase):
    def test_schedule_conserves_lots(self):
        self.assertEqual(sum(allocate(5003, [1] * 10)), 5003)

    def test_invalid_profile(self):
        for weights in [[], [0, 0], [float("nan")], [float("inf")], [-1, 2], [True]]:
            with self.assertRaises(ValueError):
                allocate(10, weights)

    def test_invalid_horizon_types(self):
        for start, duration in [(20.5, 100), (20, 1.5), (20, True)]:
            with self.assertRaises(ValueError):
                run(generate(42, 30), start=start, duration=duration)

    def test_completed_cost_without_terminal_mid(self):
        es = generate(42, 20)
        b = Book()
        for e in es:
            apply(b, e)
        quantity = sum(r["quantity"] for r in b.snapshot()["asks"])
        es.append(
            {
                "type": "MARKET",
                "order_id": "terminal",
                "side": "BUY",
                "quantity": 1,
                "price": None,
                "timestamp_ms": 2000,
                "sequence": 21,
            }
        )
        result = run(es, "Market", quantity=quantity, duration=1)
        self.assertIsNone(result["terminal_mid"])
        self.assertEqual(result["opportunity_bps"], 0)
        self.assertIsNotNone(result["shortfall_bps"])

    def test_parent_id_collision(self):
        es = generate(42, 200)
        original = es[0]["order_id"]
        for e in es:
            if e["order_id"] == original:
                e["order_id"] = "P-0"
        result = run(es, "Passive")
        self.assertNotEqual(result["children"][0]["order_id"], "P-0")
        self.assertLessEqual(result["filled"], result["requested"])

    def test_empirical_percentile_and_missing_count(self):
        values = [
            {"strategy": "Market", "shortfall_bps": i, "fill_pct": 1}
            for i in range(1, 21)
        ]
        result = summarize_runs(values)[0]
        self.assertEqual(result["p95"], 19)
        values.append({"strategy": "Market", "shortfall_bps": None, "fill_pct": 0})
        result = summarize_runs(values)[0]
        self.assertEqual(result["episodes"], 21)
        self.assertEqual(result["cost_observations"], 20)

    def test_no_overfills(self):
        es = generate(42, 200)
        for s in STRATEGIES:
            r = run(es, s, quantity=5000)
            self.assertLessEqual(r["filled"], 5000)
            self.assertEqual(r["filled"], sum(f["quantity"] for f in r["fills"]))

    def test_cost_identity(self):
        for side in ["BUY", "SELL"]:
            for s in STRATEGIES:
                r = run(generate(42, 200), s, side=side, fee_bps=2)
                if r["shortfall_bps"] is not None:
                    self.assertAlmostEqual(
                        r["shortfall_bps"],
                        r["spread_walk_bps"]
                        + r["delay_bps"]
                        + r["fees_bps"]
                        + r["opportunity_bps"],
                    )

    def test_market_vwap_and_slippage(self):
        r = run(generate(42, 100), "Market", quantity=100)
        self.assertEqual(r["filled"], 100)
        self.assertAlmostEqual(
            r["average_price"],
            sum(f["price"] * f["quantity"] for f in r["fills"]) / 100,
        )
        self.assertAlmostEqual(
            r["slippage_bps"],
            (r["average_price"] - r["arrival"]) / r["arrival"] * 10000,
        )

    def test_uniform_vwap_matches_twap(self):
        es = generate(6, 200)
        a = run(es, "TWAP")
        b = run(es, "VWAP")
        self.assertEqual(a["fills"], b["fills"])

    def test_incomplete_time_null(self):
        r = run(generate(42, 30), "Passive", quantity=100000, duration=1)
        self.assertIsNone(r["duration_ms"])

    def test_deterministic_execution(self):
        es = generate(12, 200)
        self.assertEqual(run(es, "Passive"), run(es, "Passive"))


if __name__ == "__main__":
    unittest.main()
