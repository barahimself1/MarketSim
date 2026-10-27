"""Stateless research API; manual books are reconstructed from client commands.
Serve behind a TLS reverse proxy for public deployment. Request budgets bound
simulation work. No shared trading state or credentials exist.
"""

import json, os, time, threading
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from .engine import Book, apply
from .simulation import generate, replay, REGIMES
from .execution import run, STRATEGIES
from .analytics import describe, summarize_runs

ROOT = Path(__file__).resolve().parents[1]
BUDGET = threading.BoundedSemaphore(4)


def dispatch(path, p):
    if path == "/api/session":
        events = generate(int(p.get("seed", 42)), 500, p.get("regime", "Deep"))
        frames = replay(events)
        return {
            "frames": frames,
            "metrics": describe(frames),
            "kind": "SYNTHETIC",
            "instrument": "SIM-USD",
            "seed": int(p.get("seed", 42)),
        }
    if path == "/api/execute":
        events = generate(int(p.get("seed", 42)), 500, p.get("regime", "Deep"))
        args = {
            k: p[k]
            for k in (
                "side",
                "quantity",
                "start",
                "duration",
                "participation",
                "fee_bps",
                "profile",
            )
            if k in p
        }
        return [run(events, strategy=s, **args) for s in STRATEGIES]
    if path == "/api/manual":
        commands = p.get("commands", [])
        if not isinstance(commands, list) or len(commands) > 200:
            raise ValueError("Maximum 200 commands")
        book = Book()
        reports = []
        for e in generate(42, 20):
            apply(book, e)
        for command in commands:
            before = book.snapshot()
            result = apply(book, command)
            reports.append(
                {"before": before, "after": book.snapshot(), "result": result}
            )
        return {
            "book": book.snapshot(),
            "reports": reports,
            "orders": [
                vars(o)
                for o in book.orders.values()
                if o.state in ("NEW", "PARTIALLY_FILLED")
            ],
        }
    if path == "/api/experiment":
        count = int(p.get("episodes", 10))
        if not 2 <= count <= 20:
            raise ValueError("Episodes must be 2–20")
        started = time.perf_counter()
        results = []
        for seed in range(int(p.get("seed", 42)), int(p.get("seed", 42)) + count):
            events = generate(seed, 250, p.get("regime", "Deep"))
            results.extend(
                {
                    **run(
                        events, s, quantity=int(p.get("quantity", 5000)), duration=100
                    ),
                    "seed": seed,
                }
                for s in STRATEGIES
            )
        definition = {
            "hypothesis": "Compare completion-adjusted execution cost across five methods under common synthetic event instructions.",
            "dataset": "Seeded synthetic generator v1",
            "regime": p.get("regime", "Deep"),
            "seed": int(p.get("seed", 42)),
            "episodes": count,
            "quantity": int(p.get("quantity", 5000)),
            "side": "BUY",
            "start_event": 20,
            "horizon_events": 100,
            "session_events": 250,
            "participation": 0.1,
            "fee_bps": 0,
            "prior_volume_profile": [1] * 10,
        }
        return {
            "definition": definition,
            "status": "SIMULATION ONLY",
            "version": "1.0.0",
            "results": summarize_runs(results),
            "episode_results": [
                {k: v for k, v in r.items() if k not in ("fills", "children")}
                for r in results
            ],
            "runtime_ms": (time.perf_counter() - started) * 1000,
        }
    raise ValueError("Unknown API route")


class Handler(SimpleHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT / "web"), **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'self'",
        )
        super().end_headers()

    def do_POST(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 100000:
                raise ValueError("Invalid request size")
            origin = self.headers.get("Origin")
            if origin and origin.split("://")[-1] != self.headers.get("Host"):
                raise ValueError("Cross-origin request rejected")
            payload = json.loads(self.rfile.read(size))
            if not isinstance(payload, dict):
                raise ValueError("Request must be an object")
            if not BUDGET.acquire(blocking=False):
                raise ValueError("Server busy; retry shortly")
            try:
                result = dispatch(self.path, payload)
            finally:
                BUDGET.release()
            data = json.dumps(result, allow_nan=False).encode()
            self.send_response(200)
        except (ValueError, TypeError, KeyError, OverflowError) as error:
            data = json.dumps({"error": str(error)}).encode()
            self.send_response(400)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"MarketSim: http://localhost:{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
