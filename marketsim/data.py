"""Strict canonical event JSONL loader; no exchange schema guessing."""

import json
from .engine import Book, apply


def load(path):
    events = []
    book = Book()
    last = 0
    time = -1
    with open(path, encoding="utf8") as file:
        for line in file:
            e = json.loads(line)
            if (
                e.get("type") not in ("LIMIT", "MARKET", "CANCEL")
                or type(e.get("sequence")) is not int
                or e["sequence"] <= last
                or type(e.get("timestamp_ms")) is not int
                or e["timestamp_ms"] < time
            ):
                raise ValueError("Invalid event sequencing")
            if e["type"] == "LIMIT" and e.get("price") is None:
                raise ValueError("Limit price required")
            if e["type"] == "MARKET" and e.get("price") is not None:
                raise ValueError("Market price must be null")
            apply(book, e)
            last = e["sequence"]
            time = e["timestamp_ms"]
            events.append(e)
    return events
