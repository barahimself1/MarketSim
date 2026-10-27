import {
  panel,
  table,
  metrics,
  n,
  price,
  esc,
  line,
  scatter,
  histogram,
  costBars,
} from "./components.js?v=1.0.2";
export const strategiesTable = (r) =>
  table(
    [
      "Strategy",
      "Filled",
      "Fill %",
      "Avg price",
      "Slippage bps",
      "Total IS bps",
      "Completion",
      "Children",
    ],
    r.map((x) => [
      x.strategy,
      n(x.filled),
      n(x.fill_pct * 100) + "%",
      price(x.average_price),
      n(x.slippage_bps),
      n(x.shortfall_bps),
      x.duration_ms == null ? "Incomplete" : n(x.duration_ms / 1000) + "s",
      x.children.length,
    ]),
  );
export function micro(session) {
  const fs = session.frames.filter((f) => f.book.mid != null),
    frames = session.frames,
    depth = (f) =>
      f.book.bids.concat(f.book.asks).reduce((s, r) => s + r.quantity, 0);
  const pairs = frames
    .slice(0, -1)
    .filter((f, i) => f.book.mid != null && frames[i + 1].book.mid != null)
    .map((f) => {
      const i = frames.indexOf(f);
      return [f.book.imbalance, frames[i + 1].book.mid - f.book.mid];
    });
  const vols = frames.map((f, i) => {
    const ms = frames.slice(Math.max(0, i - 20), i + 1).map((v) => v.book.mid),
      d = ms
        .slice(1)
        .map((v, j) => (v == null || ms[j] == null ? null : v - ms[j]))
        .filter((v) => v != null);
    if (d.length < 20) return null;
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    return Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length);
  });
  const trades = frames
    .flatMap((f) => f.fills.map((t) => ({ ...t, mid: f.before.mid })))
    .filter((t) => t.mid != null);
  return (
    metrics([
      [
        "Mean spread",
        n(session.metrics.mean_spread) + "¢",
        "Event-weighted quotes",
      ],
      [
        "Effective spread",
        n(session.metrics.effective_spread) + "¢",
        "Equal weight per eligible fill",
      ],
      ["Traded volume", n(session.metrics.volume), "Synthetic matched lots"],
      [
        "Session VWAP",
        price(session.metrics.vwap),
        "Ex-post descriptive benchmark",
      ],
    ]) +
    `<div class="research-grid">` +
    panel(
      "Spread distribution",
      "How often is displayed liquidity expensive to cross?",
      histogram(
        fs.map((f) => f.book.spread),
        "Quoted spread (cents)",
      ),
    ) +
    panel(
      "Quoted depth",
      "Available lots across the ten best levels on each side",
      line(frames.map(depth), "Quoted lots"),
    ) +
    panel(
      "Imbalance and the next price change",
      "Adjacent two-sided states; no observations bridged across missing quotes",
      scatter(pairs, "Top-ten imbalance", "Next midprice change (cents)"),
    ) +
    panel(
      "Spread and local volatility",
      "Population standard deviation of 20 adjacent midprice changes",
      scatter(
        frames
          .map((f, i) => [vols[i], f.book.spread])
          .filter((p) => p[0] != null && p[1] != null),
        "Rolling volatility (cents)",
        "Quoted spread (cents)",
      ),
    ) +
    panel(
      "Trade size and immediate cost",
      "Individual synthetic fills against the pre-instruction midpoint",
      scatter(
        trades.map((t) => [
          t.quantity,
          (((t.side === "BUY" ? 1 : -1) * (t.price - t.mid)) / t.mid) * 10000,
        ]),
        "Fill size (lots)",
        "Signed fill slippage (bps)",
      ),
    ) +
    panel(
      "Signed executed volume",
      "Buyer-initiated volume less seller-initiated volume per event",
      line(
        frames.map((f) =>
          f.fills.reduce(
            (s, t) => s + (t.side === "BUY" ? 1 : -1) * t.quantity,
            0,
          ),
        ),
        "Signed lots",
      ),
    ) +
    `</div>` +
    panel(
      "Midprice and microprice",
      "First twenty two-sided states after initial book construction; next means next instruction",
      table(
        ["Event", "Midprice", "Microprice", "Next mid Δ (ticks)"],
        frames
          .slice(20, 40)
          .map((f, i) => [
            f.event.sequence,
            price(f.book.mid),
            price(f.book.microprice),
            f.book.mid == null || frames[i + 21]?.book.mid == null
              ? "—"
              : n(frames[i + 21].book.mid - f.book.mid),
          ]),
      ),
    ) +
    '<div class="callout">Descriptive synthetic observations, with no causal or predictive claim. Serial dependence and overlapping volatility windows prevent treating these points as independent samples; no naive confidence interval or significance claim is reported.</div>'
  );
}
export function costs(results) {
  if (!results)
    return '<div class="empty">Run a parent order in Execution Lab to inspect its costs.</div>';
  return (
    panel(
      "Implementation shortfall decomposition",
      "Basis: arrival mid × requested quantity; positive costs are adverse",
      costBars(results) +
        table(
          [
            "Strategy",
            "Spread + book walk",
            "Delay",
            "Fees",
            "Unfilled opportunity",
            "Total bps",
          ],
          results.map((r) => [
            r.strategy,
            n(r.spread_walk_bps),
            n(r.delay_bps),
            n(r.fees_bps),
            n(r.opportunity_bps),
            n(r.shortfall_bps),
          ]),
        ),
    ) +
    panel(
      "What this decomposition supports",
      "All terms come from simulated fills or the terminal quote",
      '<div class="prose"><p>Filled cost is signed (fill price − arrival mid) × filled quantity. Unfilled opportunity is signed (terminal mid − arrival mid) × unfilled quantity. Fees are added on executed notional.</p><p>The filled component is partitioned into fill-versus-contemporaneous-mid and contemporaneous-mid-versus-arrival. The first combines spread crossing and book walking; it is not an identified causal market-impact estimate. Passive fills can have negative spread cost.</p><p>Slippage uses filled quantity; total implementation shortfall uses the entire parent notional. An incomplete strategy is not awarded zero cost for missing the market. Terminal mid may itself reflect counterfactual depletion, so terminal marks are model-dependent.</p></div>',
    )
  );
}
export function architecture() {
  return (
    panel(
      "One engine. Every execution path.",
      "Python is the source of truth for replay, manual orders and strategy evaluation",
      `<div class="arch-grid">${[
        ["01 · Sources", "Seeded generator / canonical JSONL"],
        [
          "02 · Event normalization",
          "Integer ticks, lots and monotonic sequences",
        ],
        ["03 · Matching engine", "Price maps + heaps + FIFO order queues"],
        ["04 · Replay / execution", "Independent mutable book per scenario"],
        [
          "05 · Cost attribution",
          "Fills, benchmarks and unfilled opportunities",
        ],
        ["06 · Research interface", "Replay, experiments, event inspection"],
      ]
        .map(
          ([a, b]) =>
            `<div class="arch-node"><strong>${a}</strong><small>${b}</small></div>`,
        )
        .join("")}</div>`,
    ) +
    panel(
      "Supporting systems",
      "Tests · measurements · provenance",
      '<div class="prose">Invariant tests protect price-time priority and quantity conservation. Benchmarks measure the engine independently of chart rendering. Experiment records store seeds, configuration, version and simulation-only status. The public API is stateless; manual sessions are rebuilt from the browser’s command list.</div>',
    )
  );
}
export function methodology() {
  return panel(
    "The numerical contract",
    "Exact mechanics; bounded research claims",
    '<div class="prose"><h3>Prices, quantity and priority</h3><p>Prices are integer cents; quantities are integer lots. Resting orders execute at the maker price. Better prices execute first; orders at the same price execute FIFO. Market orders are immediate-or-cancel; an unfilled remainder is cancelled. Crossing limit orders match first and then rest any remaining quantity.</p><h3>Microprice and imbalance</h3><p>Microprice = (ask × bid quantity + bid × ask quantity) / (bid quantity + ask quantity), using the best levels. Midprice is the arithmetic mean. Imbalance uses signed depth difference divided by total depth. One-sided books produce unavailable midprice and microprice.</p><h3>Execution assumptions</h3><p>Every strategy receives the same exogenous event instructions and an independent mutable book. Its fills consume liquidity permanently within that scenario. Background agents do not react strategically. Passive orders join behind all displayed same-price orders; future crossing orders can execute them. This exact synthetic queue assumption is not transferable to aggregate historical L2 data.</p><h3>Scheduling</h3><p>TWAP uses ten equal allocations with integer remainder conservation. VWAP uses a prior volume curve, uniform by default; the evaluated session’s future volume is never used for scheduling. POV reacts to the previous event’s external executed volume. Completion time is null for incomplete orders.</p><h3>Research limits</h3><p>There are no hidden orders, auctions, self-trade prevention, venue routing, stochastic latency, permanent impact or agent response. Historical aggregate snapshots cannot recover FIFO identities. The canonical replay contract requires order-level instructions; exchange L2 adapters require a separate model.</p></div>',
  );
}
