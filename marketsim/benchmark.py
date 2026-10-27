"""Reproducible insertion/cancel workload; excludes I/O and charts."""

import json, platform, time, sys
from pathlib import Path
from .engine import Book


def measure(count):
    b = Book()
    start = time.perf_counter()
    for i in range(count // 2):
        oid = str(i)
        b.submit(oid, "BUY", 100, 9900 + i % 100)
        b.cancel(oid)
    elapsed = time.perf_counter() - start
    return {
        "events": count,
        "seconds": elapsed,
        "events_per_second": count / elapsed,
        "microseconds_per_event": elapsed / count * 1e6,
    }


if __name__ == "__main__":
    result = {
        "platform": platform.platform(),
        "python": sys.version.split()[0],
        "method": "Alternating insert/cancel commands across 100 prices, 100 lots per order; IDs retained, no executions. perf_counter wall time; one measured run per size. Total retained ID memory grows linearly.",
        "runs": [measure(n) for n in (10000, 100000, 1000000)],
    }
    dest = Path(__file__).resolve().parents[1] / "web/benchmarks.json"
    dest.write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
