# Reproducible execution comparison

**Status: SIMULATION ONLY.** These runs test model behavior, not a claim about historical execution quality or profitability.

Protocol: seeds 42–61 inclusive in each of the six generator regimes; 250 instructions per session; BUY 5,000 lots; start before zero-based event 20; process 100 subsequent instructions; zero fees; POV at 10% of previously observed external volume; uniform prior VWAP profile. All five methods receive the same instructions for each seed, with independent mutable books. No episode was selected or removed for its result.

The JSON files `data/experiment-*.json` preserve configuration, version, creation time, all per-episode cost and completion observations, and aggregated summaries. Each regime has 20 independent seeded fixtures and 100 strategy evaluations, for 600 strategy evaluations across the six regimes.

## Completion matters

| Regime | Market full completion | Passive | TWAP | VWAP | POV |
|---|---:|---:|---:|---:|---:|
| Deep | 100% | 100% | 95% | 95% | 0% |
| Thin | 0% | 0% | 0% | 0% | 0% |
| Volatile | 80% | 30% | 0% | 0% | 0% |
| Liquidity shock | 100% | 100% | 0% | 0% | 0% |
| One sided | 100% | 0% | 10% | 10% | 0% |
| Wide spread | 100% | 35% | 50% | 50% | 0% |

These are model outputs with the fixed settings above. Small POV trades can produce a low aggregate shortfall while leaving most of the parent unfilled. Completion and terminal opportunity cost must be read alongside filled-order slippage.

## Missing marks are a result

In the liquidity-shock regime, all 20 TWAP, VWAP and POV outcomes lack a two-sided terminal midpoint and remain incomplete. Their total shortfall is unavailable, not zero. In the volatile regime, only 5 of 20 TWAP/VWAP episodes have a defined total shortfall. A cost mean based on that subset cannot be ranked fairly against a strategy with 20 available observations. Both the interface and records report valid-cost counts.

The passive method fills at the initial best same-side quote. Its favorable fill price in the deep regime is a mechanical result of this fixture's queue and flow model. It says nothing about real queue uncertainty, adverse selection, latency or profitability. Uniform prior-profile VWAP intentionally equals TWAP; differing curves need a separate prespecified experiment.

The regimes change multiple generator parameters together. This comparison does not identify which parameter caused a difference. An isolated spread or depth sensitivity experiment should vary one parameter while preserving others. Twenty episodes also provide little tail information; the nearest-rank P95 is an empirical description, not a stable risk estimate.

## Rerun

```python
from marketsim.server import dispatch

record = dispatch('/api/experiment', {
    'seed': 42, 'regime': 'Deep', 'episodes': 20, 'quantity': 5000
})
```

The Strategy Simulator exposes this experiment interactively. Browser records persist locally and can be exported from Experiments; they are not shared across devices.
