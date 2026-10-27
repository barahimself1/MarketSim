"""Descriptive microstructure statistics, without causal interpretation."""

from statistics import mean, median, pstdev
from math import ceil


def describe(frames):
    valid = [f for f in frames if f["book"]["mid"] is not None]
    spreads = [f["book"]["spread"] for f in valid]
    trades = [
        {**t, "index": i, "pre_mid": f["before"]["mid"]}
        for i, f in enumerate(frames)
        for t in f["fills"]
    ]
    volume = sum(t["quantity"] for t in trades)
    effective = [
        2 * (1 if t["side"] == "BUY" else -1) * (t["price"] - t["pre_mid"])
        for t in trades
        if t["pre_mid"] is not None
    ]
    return {
        "events": len(frames),
        "trades": len(trades),
        "mean_spread": mean(spreads) if spreads else None,
        "median_depth": (
            median(
                [
                    sum(r["quantity"] for r in f["book"]["bids"] + f["book"]["asks"])
                    for f in valid
                ]
            )
            if valid
            else None
        ),
        "vwap": (
            sum(t["price"] * t["quantity"] for t in trades) / volume if volume else None
        ),
        "volume": volume,
        "effective_spread": mean(effective) if effective else None,
        "duration_ms": (
            frames[-1]["event"]["timestamp_ms"] - frames[0]["event"]["timestamp_ms"]
            if frames
            else 0
        ),
    }


def summarize_runs(results):
    output = []
    for strategy in dict.fromkeys(r["strategy"] for r in results):
        group = [r for r in results if r["strategy"] == strategy]
        cost = sorted(
            r["shortfall_bps"] for r in group if r["shortfall_bps"] is not None
        )
        output.append(
            {
                "strategy": strategy,
                "episodes": len(group),
                "cost_observations": len(cost),
                "mean": mean(cost) if cost else None,
                "median": median(cost) if cost else None,
                "p95": cost[max(0, ceil(0.95 * len(cost)) - 1)] if cost else None,
                "std": pstdev(cost) if cost else None,
                "completion": mean(r["fill_pct"] == 1 for r in group),
                "costs": cost,
            }
        )
    return output
