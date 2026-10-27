# Project descriptions and interview preparation

## Resume sentence

Built MarketSim, a Python market microstructure laboratory combining FIFO matching, deterministic replay, five execution methods and reconciled transaction cost analytics.

## Three resume bullets

- Engineered an event-driven order book using price maps, heaps and FIFO queues, supporting crossing limits, partial fills, cancellations and deterministic replay, validated by 29 automated tests.
- Implemented market, passive, TWAP, prior-profile VWAP and lagged-POV simulations on independent mutable books, with implementation shortfall accounting for explicit fees and unfilled opportunity cost.
- Benchmarked one million insert/cancel commands at approximately 101,113 commands/second on the recorded Python 3.12 Linux host; built a 16-section research interface for replay, queue inspection, liquidity scenarios and execution analysis.

The benchmark describes that specific no-match workload, not exchange capacity. Be prepared to explain the code and limitations before using the bullets.

## LinkedIn description

MarketSim studies what happens between deciding to trade and getting executed. I built a Python price-time matching engine and a research interface for inspecting order books, replaying synthetic events, comparing execution methods and reconciling transaction costs. Each strategy receives its own mutable book so earlier fills consume later liquidity. VWAP uses a prior volume curve, and passive execution explicitly assumes a fully observed synthetic FIFO queue. The project includes invariant tests, reproducible benchmarks and experiment exports. Its emphasis is market mechanics and research discipline, with no live trading or profitability claims.

## GitHub description and topics

Market microstructure and execution research laboratory: FIFO matching, deterministic replay, execution schedules and transaction cost analytics in Python.

python, market-microstructure, limit-order-book, matching-engine, execution, transaction-cost-analysis, simulation, quantitative-research, event-driven, fintech, market-infrastructure

## Technical summary

MarketSim is a Python market microstructure and execution research laboratory with a custom browser interface. Its matching engine uses integer prices and quantities, price-level dictionaries, lazy heaps and FIFO order queues. It supports crossing limit orders, market orders, cancellations and partial fills while preserving quantity and priority invariants. Deterministic event streams drive replay and independent execution scenarios. Market, passive, TWAP, prior-profile VWAP and lagged participation methods consume their own mutable liquidity. Transaction cost analysis reconciles filled costs, fees and terminal opportunity costs for unfilled quantity, with explicit limitations around market impact. The interface exposes order books, event transitions, microstructure diagnostics, scenario comparisons and experiment exports. A regression suite tests mechanics and numerical identities, while benchmark artifacts record actual host performance. The public dataset is synthetic and requires no credentials. Historical adapters and uncertain queue models remain extensions rather than claims of completed historical reconstruction or predictive performance in real financial markets.

## Recruiter summary

A working market-mechanics system that makes price-time matching, liquidity consumption and execution tradeoffs visible. Its strongest technical evidence is the shared Python engine, explicit assumptions, quantity-conservation tests and measured benchmark artifacts.

## Quant interview explanation

Start with the difference between mechanical correctness and model validity. FIFO matching can be exactly correct within a synthetic fully observed queue while the surrounding order-flow model remains unrealistic. Explain why the simulation uses common background instructions across strategies, then acknowledge the absence of strategic response. Show how filled-only averages favor noncompletion and how terminal opportunity cost changes that comparison. Explain that microprice is a contemporaneous queue-weighted quote, not a calibrated forecast. Finish with the difference between the measured insert/cancel workload and matching-heavy end-to-end latency.

## Five interview questions and example answers

**Why heaps plus ordered dictionaries?** Price lookup and per-level cancellation need different structures. The heap finds the best price; the price map finds its queue; the ordered dictionary preserves FIFO while removing a known order in expected constant time. Lazy heap entries simplify deletion but increase memory and occasional cleanup costs. I document that tradeoff rather than claiming strict constant-time best-price access under all workloads.

**How do partial fills reconcile?** Each execution decrements both participants by the same positive minimum quantity. An order retains its original quantity and remaining amount; original equals remaining plus all fills. A fully filled maker is removed from its queue. The tests verify conservation and that cancelled or filled orders cannot subsequently execute.

**Why is historical passive execution difficult?** An aggregated book tells me displayed depth, not my exact order identity or queue position. I would need a queue uncertainty model, hidden-liquidity assumptions and feed-gap handling. MarketSim's exact FIFO claim applies only to its synthetic order-level event stream.

**How do you avoid VWAP lookahead?** I allocate using an explicit prior curve, uniform by default. I do not derive the schedule from the future realized volume of the evaluated session. A historical study should estimate that curve from earlier sessions and freeze it before evaluation. POV instead reacts to already observed external volume one event later.

**Can you call book walking market impact?** It is a mechanical liquidity-consumption cost in this model, but it does not identify permanent or behavioral impact. Background agents do not react. I report spread-plus-walk cost separately from delay and opportunity cost, and do not claim a causal impact estimate.
