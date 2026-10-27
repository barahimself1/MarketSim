"""Counterfactual execution against common exogenous event instructions.

Each strategy gets its own mutable book: its earlier fills deplete its later
liquidity. Background instructions are fixed; there is no behavioral response.
VWAP uses an explicitly supplied prior profile (uniform by default), never the
future realized volume of the evaluated session. POV reacts one event later.
"""

from .engine import Book, apply
from math import isfinite

STRATEGIES = ("Market", "Passive", "TWAP", "VWAP", "POV")


def allocate(quantity, weights):
    if (
        type(quantity) is not int
        or quantity < 1
        or not isinstance(weights, (list, tuple))
        or not 1 <= len(weights) <= 100
        or any(type(w) not in (int, float) or not isfinite(w) or w < 0 for w in weights)
        or not isfinite(sum(weights))
        or sum(weights) <= 0
    ):
        raise ValueError("Invalid volume profile")
    raw = [quantity * w / sum(weights) for w in weights]
    lots = [int(v) for v in raw]
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - lots[i], reverse=True)[
        : quantity - sum(lots)
    ]:
        lots[i] += 1
    return lots


def run(
    events,
    strategy="Market",
    side="BUY",
    quantity=5000,
    start=20,
    duration=100,
    participation=0.1,
    fee_bps=0,
    profile=None,
):
    if (
        strategy not in STRATEGIES
        or side not in ("BUY", "SELL")
        or type(quantity) is not int
        or not 1 <= quantity <= 1000000
    ):
        raise ValueError("Invalid parent order")
    if (
        type(start) is not int
        or type(duration) is not int
        or not 20 <= start < len(events)
        or not 1 <= duration <= 1000
        or not 0 < participation <= 1
        or not 0 <= fee_bps <= 100
    ):
        raise ValueError("Invalid horizon, fee or participation")
    book = Book()
    for e in events[:start]:
        apply(book, e)
    arrival = book.snapshot()["mid"]
    if arrival is None:
        raise ValueError("Two-sided arrival book required")
    end = min(len(events), start + duration)
    children = []
    fills = []
    sign = 1 if side == "BUY" else -1
    weights = profile if profile is not None else [1] * 10
    lots = allocate(quantity, weights if strategy == "VWAP" else [1] * 10)
    schedule = {}
    for i, q in enumerate(lots):
        at = start + i * (end - start) // len(lots)
        schedule[at] = schedule.get(at, 0) + q
    previous_volume = 0
    credit = 0.0
    done = 0
    reserved = {e["order_id"] for e in events}
    parent_ids = set()

    def child(q, at, price=None):
        nonlocal done
        q = min(q, quantity - done)
        if q <= 0:
            return
        oid = f"P-{len(children)}"
        while oid in reserved:
            oid = "_" + oid
        reserved.add(oid)
        parent_ids.add(oid)
        snap = book.snapshot()
        report = book.submit(oid, side, q, price)
        children.append({"order_id": oid, "index": at, "quantity": q, "price": price})
        for f in report["fills"]:
            fills.append({**f, "index": at, "mid_at_fill": snap["mid"]})
            done += f["quantity"]

    if strategy == "Passive":
        child(quantity, start, book.best(side))
    for at in range(start, end):
        if strategy == "Market" and at == start:
            child(quantity, at)
        elif strategy in ("TWAP", "VWAP") and at in schedule:
            child(schedule[at], at)
        elif strategy == "POV":
            credit += previous_volume * participation
            q = int(credit)
            credit -= q
            child(q, at)
        mid_before = book.snapshot()["mid"]
        try:
            report = apply(book, events[at])
        except ValueError:
            # Parent execution can remove an order before a scheduled cancellation.
            if events[at]["type"] != "CANCEL":
                raise
            report = {"fills": []}
        previous_volume = sum(
            f["quantity"] for f in report["fills"] if f["maker"] not in parent_ids
        )
        if strategy == "Passive":
            for f in report["fills"]:
                if f["maker"] in parent_ids:
                    fills.append({**f, "index": at, "mid_at_fill": mid_before})
                    done += f["quantity"]
    terminal = book.snapshot()["mid"]
    vwap = sum(f["price"] * f["quantity"] for f in fills) / done if done else None
    fees = sum(f["price"] * f["quantity"] for f in fills) * fee_bps / 10000
    filled_cost = sum(sign * (f["price"] - arrival) * f["quantity"] for f in fills)
    opportunity = (
        0
        if done == quantity
        else (
            sign * (terminal - arrival) * (quantity - done)
            if terminal is not None
            else None
        )
    )
    mids_available = all(f["mid_at_fill"] is not None for f in fills)
    spread_component = sum(
        sign * (f["price"] - f["mid_at_fill"]) * f["quantity"]
        for f in fills
        if f["mid_at_fill"] is not None
    )
    delay = sum(
        sign * (f["mid_at_fill"] - arrival) * f["quantity"]
        for f in fills
        if f["mid_at_fill"] is not None
    )
    basis = arrival * quantity
    return {
        "strategy": strategy,
        "side": side,
        "requested": quantity,
        "filled": done,
        "fill_pct": done / quantity,
        "arrival": arrival,
        "average_price": vwap,
        "slippage_bps": filled_cost / (arrival * done) * 10000 if done else None,
        "shortfall_bps": (
            (filled_cost + fees + opportunity) / basis * 10000
            if opportunity is not None
            else None
        ),
        "filled_cost_bps": filled_cost / basis * 10000,
        "fees_bps": fees / basis * 10000,
        "opportunity_bps": (
            opportunity / basis * 10000 if opportunity is not None else None
        ),
        "spread_walk_bps": spread_component / basis * 10000 if mids_available else None,
        "delay_bps": delay / basis * 10000 if mids_available else None,
        "duration_ms": (
            events[fills[-1]["index"]]["timestamp_ms"] - events[start]["timestamp_ms"]
            if done == quantity
            else None
        ),
        "children": children,
        "fills": fills,
        "terminal_mid": terminal,
        "horizon_ms": events[end - 1]["timestamp_ms"] - events[start]["timestamp_ms"],
    }
