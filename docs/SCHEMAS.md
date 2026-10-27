# Numerical and data schemas

Prices use integer cents, quantities integer lots, event times integer milliseconds. One engine instance represents one instrument. JSON numbers that are fractional or booleans are not accepted as order quantities or limit prices. Analytics may contain fractional cents and use `null` for unavailable observations. The server rejects non-finite serialized results.

| Entity | Fields | Meaning |
|---|---|---|
| Market event | `sequence: int`, `timestamp_ms: int`, `type: LIMIT/MARKET/CANCEL`, `order_id: str`, optional `side`, `quantity`, `price` | External instruction. Sequences strictly increase; timestamps cannot move backwards in canonical imports. |
| Order | `order_id: str`, `side: BUY/SELL`, `quantity: int`, `remaining: int`, `price: int or null`, `sequence: int`, `state: str` | Original quantity and remaining quantity are separate. Sequence gives engine acceptance priority. |
| Trade/fill | `trade_id: int`, `sequence: int`, `maker: str`, `taker: str`, `side: str`, `price: int`, `quantity: int` | A single maker/taker match. Side is aggressor side. One taker can create several fills. |
| Price level | `price: int`, `quantity: int`, `orders: int` | Sum of remaining resting quantity and count of resting orders. |
| Snapshot | `sequence`, `bids: list`, `asks: list`, `mid`, `spread`, `microprice`, `imbalance` | Best-first top-ten quotes by default. Mid and microprice require both sides. |
| Replay frame | `event`, `before`, `book`, `fills` | Snapshots immediately before and after one instruction, plus its executions. |
| Parent settings | `side`, `quantity`, `start`, `duration`, `participation`, `fee_bps`, optional `profile` | Start and duration are event indices/counts. The strategy simulator fixes these explicitly in its registry definition. |
| Child order | `order_id`, `index`, `quantity`, `price` | Submission event and scheduled/requested quantity. Null price denotes a market IOC. |
| Execution result | `strategy`, `requested`, `filled`, `fill_pct`, `arrival`, `average_price`, `slippage_bps`, cost components, `duration_ms`, `horizon_ms`, `terminal_mid`, `children`, `fills` | Completion duration is null for incomplete parents. Fill records additionally contain event index and pre-instruction/current midpoint. |
| Experiment | `definition`, `status`, `version`, `created_at`, `results`, `episode_results`, `runtime_ms` | Provenance, frozen parameters, summary and individual seeded outcomes. Creation time is added by the caller/browser when recording a run. |

Order states are `NEW`, `PARTIALLY_FILLED`, `FILLED`, `CANCELLED`. A partially executed market IOC ends `CANCELLED` with a nonzero remainder; its fills remain in the ledger. Invalid submissions raise validation errors before insertion and do not create persistent `REJECTED` orders.

Engine acceptance sequences are distinct from external event sequence numbers: cancellations advance engine sequence, and counterfactual child submissions add extra engine commands. Never join historical events to child fills by assuming their sequence counters are identical. Execution records use the external event `index` for temporal alignment.

IDs are unique within an engine lifetime. Parent child IDs avoid every ID in the source stream. Currency conversion, corporate actions, fractional lots, multiple venues and instrument-specific tick tables are outside this contract.
