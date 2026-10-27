"""Seeded endogenous synthetic flow. One event interval = 100 milliseconds."""

import random
from .engine import Book, apply

REGIMES = {
    "Deep": (900, 0.15, 1),
    "Thin": (140, 0.20, 2),
    "Volatile": (350, 0.35, 4),
    "Liquidity shock": (600, 0.65, 2),
    "One sided": (450, 0.20, 2),
    "Wide spread": (450, 0.20, 8),
}


def generate(seed=42, count=500, regime="Deep"):
    if regime not in REGIMES or not 20 <= count <= 5000:
        raise ValueError("Invalid simulation configuration")
    rng = random.Random(seed)
    depth, cancel, spacing = REGIMES[regime]
    book = Book()
    events = []

    def push(side, qty, price=None):
        event = {
            "sequence": len(events) + 1,
            "timestamp_ms": len(events) * 100,
            "type": "LIMIT" if price else "MARKET",
            "order_id": f"E{len(events)+1}",
            "side": side,
            "quantity": qty,
            "price": price,
        }
        apply(book, event)
        events.append(event)

    for level in range(10):
        for side in ["BUY", "SELL"]:
            push(
                side,
                depth + rng.randrange(depth),
                10000 + (-1 if side == "BUY" else 1) * (spacing + level),
            )
    for i in range(count - 20):
        active = [
            o
            for o in book.orders.values()
            if o.state in ("NEW", "PARTIALLY_FILLED") and o.price is not None
        ]
        draw = rng.random()
        if draw < cancel and active:
            o = rng.choice(active)
            event = {
                "sequence": len(events) + 1,
                "timestamp_ms": len(events) * 100,
                "type": "CANCEL",
                "order_id": o.order_id,
            }
            apply(book, event)
            events.append(event)
        elif draw < cancel + 0.25:
            push(
                (
                    "BUY"
                    if rng.random() < (0.8 if regime == "One sided" else 0.5)
                    else "SELL"
                ),
                rng.randint(20, depth * 2),
            )
        else:
            mid = book.snapshot()["mid"] or 10000
            side = rng.choice(["BUY", "SELL"])
            price = int(mid) + (-1 if side == "BUY" else 1) * (
                spacing + rng.randrange(10)
            )
            push(side, rng.randint(30, depth), max(1, price))
    return events


def replay(events):
    book = Book()
    frames = []
    last = -1
    for event in events:
        if event["sequence"] <= last:
            raise ValueError("Sequence must increase")
        last = event["sequence"]
        before = book.snapshot()
        report = apply(book, event)
        frames.append(
            {
                "event": event,
                "before": before,
                "book": book.snapshot(),
                "fills": report["fills"],
            }
        )
    return frames
