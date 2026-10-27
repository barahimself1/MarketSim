import {
  esc,
  n,
  price,
  panel,
  table,
  metrics,
  book,
  line,
  depth,
} from "./components.js?v=1.0.2";
import {
  micro,
  costs,
  architecture,
  methodology,
  strategiesTable,
} from "./research.js?v=1.0.2";
const $ = (s) => document.querySelector(s),
  pages = [
    "Overview",
    "Order Book",
    "Market Replay",
    "Microstructure Lab",
    "Execution Lab",
    "Transaction Costs",
    "Matching Engine",
    "Liquidity Simulator",
    "Strategy Simulator",
    "Event Stream",
    "Performance",
    "Architecture",
    "Methodology",
    "Experiments",
    "Project History",
    "About",
  ];
const slug = (s) => s.toLowerCase().replaceAll(" ", "-");
let session,
  index = 20,
  page = "overview",
  timer = null,
  results = null,
  commands = [],
  manual = null,
  experiments = [],
  regime = "Deep",
  seed = 42,
  levels = 10,
  replaySpeed = "1×",
  eventFilter = "ALL",
  execConfig = {
    side: "BUY",
    qty: 5000,
    start: 20,
    duration: 100,
    participation: 10,
    fee: 0,
    profile: "Uniform",
  };
try {
  experiments = JSON.parse(
    localStorage.getItem("marketsim-experiments-v1") || "[]",
  );
  if (!Array.isArray(experiments)) experiments = [];
} catch {
  experiments = [];
}
const regimes = [
  "Deep",
  "Thin",
  "Volatile",
  "Liquidity shock",
  "One sided",
  "Wide spread",
];
async function api(path, p) {
  const response = await fetch("/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  const d = await response.json();
  if (!response.ok) throw Error(d.error);
  return d;
}
function select(id, label, values) {
  return `<label>${label}<select id="${id}">${values.map((v) => `<option>${v}</option>`).join("")}</select></label>`;
}
function input(id, label, value, type = "number") {
  return `<label>${label}<input id="${id}" type="${type}" value="${value}"></label>`;
}
function header() {
  return `<div class="page-heading"><div><p class="eyebrow">MarketSim / ${esc(regime)} regime / seed ${seed}</p><h1>${page === "overview" ? "Execution starts before the fill." : pages.find((p) => slug(p) === page)}</h1><p class="subtitle">${page === "overview" ? "Explore order books, liquidity and the mechanics between a trading decision and its execution." : "Market microstructure and execution laboratory"}</p></div><span class="tag">SIMULATION ONLY</span></div>`;
}
function replayControls() {
  return `<div class="controls"><button class="button" data-action="back">← Step</button><button class="button primary" data-action="play">${timer ? "Pause" : "Play replay"}</button><button class="button" data-action="step">Step →</button>${select("speed", "Replay speed", ["1×", "4×", "10×"])}${input("event", "Event index", index)}</div><input aria-label="Replay position" id="position" class="replay-slider" type="range" min="0" max="${session.frames.length - 1}" value="${index}"><div class="status-line">Event ${index + 1} / ${session.frames.length} · ${(session.frames[index].event.timestamp_ms / 1000).toFixed(1)} seconds · ${esc(session.frames[index].event.type)}</div>`;
}
function overview() {
  const s = session.frames[index].book,
    m = session.metrics;
  return (
    metrics([
      ["Events processed", n(m.events), "Deterministic synthetic session"],
      ["Trades matched", n(m.trades), "Individual maker/taker fills"],
      [
        "Average spread",
        n(m.mean_spread) + "¢",
        "Event-weighted, two-sided states",
      ],
      ["Median quoted depth", n(m.median_depth), "Top ten levels, both sides"],
    ]) +
    `<div class="grid-2">${panel("The market, one event at a time.", "SIM-USD · integer cents / integer lots", replayControls() + book(s, 5))}${panel(
      "Liquidity is part of the decision.",
      "Current replay state",
      metrics([
        ["Spread", n(s.spread) + "¢", "Best ask − best bid"],
        ["Microprice", price(s.microprice), "Top-level size weighting"],
        ["Imbalance", n(s.imbalance, 3), "Top ten signed depth"],
        ["Replay time", n(index / 10) + "s", "100 ms event interval"],
      ]) + depth(s, 10),
    )}</div>` +
    panel(
      "Compare the execution path",
      "Buy 5,000 lots from event 20; common 10-second horizon",
      results
        ? strategiesTable(results)
        : '<button class="button primary" data-action="execute-default">Run five execution methods →</button>',
    )
  );
}
function execution() {
  return (
    panel(
      "Define the parent order",
      "A ten-child schedule; maximum supported session horizon is 48 seconds",
      `<div class="controls">${select("side", "Side", ["BUY", "SELL"])}${input("qty", "Quantity", 5000)}${input("start", "Start event", 20)}${input("duration", "Horizon (events)", 100)}${input("participation", "POV participation %", 10)}${input("fee", "Fee bps", 0)}${select("profile", "Prior VWAP curve", ["Uniform", "Front loaded", "Back loaded"])}<button class="button primary" data-action="execute">Compare execution</button></div><p class="small muted">Urgency is expressed through horizon and strategy choice. Participation applies to POV only. Other schedules are not participation constrained.</p>`,
    ) +
    (results
      ? panel(
          "Execution comparison",
          "Positive costs are adverse; incomplete orders retain opportunity cost",
          strategiesTable(results),
        ) +
        panel(
          "Child orders and consumed levels",
          "Inspect every fill, including partial execution",
          table(
            ["Strategy", "Children", "Fills", ""],
            results.map((r, i) => [
              r.strategy,
              r.children.length,
              r.fills.length,
              `<button class="button small" data-result="${i}">Inspect fills ↗</button>`,
            ]),
          ),
        )
      : "")
  );
}
function eventTable() {
  const filtered = session.frames
    .map((f, i) => ({ f, i }))
    .filter(
      ({ f }) =>
        eventFilter === "ALL" ||
        f.event.type === eventFilter ||
        (eventFilter === "TRADE" && f.fills.length),
    );
  const nearby = filtered
    .filter(({ i }) => i >= Math.max(0, index - 10))
    .slice(0, 30);
  return (
    `<div class="controls">${select("filter", "Event type", ["ALL", "LIMIT", "MARKET", "CANCEL", "TRADE"])}<span class="small muted">${filtered.length} matching events · up to 30 near replay position</span></div>` +
    table(
      ["Seq", "Time", "Instruction", "Order", "Side", "Qty", "Fills", ""],
      nearby.map(({ f, i }) => [
        f.event.sequence,
        n(f.event.timestamp_ms / 1000) + "s",
        f.event.type,
        esc(f.event.order_id),
        f.event.side || "—",
        f.event.quantity || "—",
        f.fills.length,
        `<button class="button small" data-event="${i}">Inspect</button>`,
      ]),
    )
  );
}
function transition(report) {
  if (!report)
    return '<p class="muted">Submit a simulated order to inspect matching.</p>';
  const r = report.result,
    o = r.order || r.cancel;
  return (
    `<div class="callout">${esc(o.order_id)} · ${esc(o.side)} · ${esc(o.state)} · ${n(o.quantity - o.remaining)} filled of ${n(o.quantity)} lots</div>` +
    table(
      ["Match", "Maker / queue head", "Taker", "Price", "Lots"],
      (r.fills || []).map((f, i) => [
        i + 1,
        esc(f.maker),
        esc(f.taker),
        price(f.price),
        n(f.quantity),
      ]),
    )
  );
}
function matching() {
  return (
    panel(
      "A real matching engine, in a controlled sandbox",
      "Starts with a seeded ten-level book. Every command is processed by Python.",
      `<div class="controls">${select("order-type", "Instruction", ["LIMIT", "MARKET", "CANCEL"])}${select("order-side", "Side", ["BUY", "SELL"])}${input("order-qty", "Lots", 100)}${input("order-price", "Price (cents)", 9995)}${input("order-id", "Order ID", "USER-" + (commands.length + 1), "text")}<button class="button primary" data-action="submit">Submit simulation</button><button class="button" data-action="reset-book">Reset book</button></div><div class="callout">For cancellation, enter the resting order ID. A crossing limit matches immediately at maker prices; unfilled market quantity is cancelled.</div>`,
    ) +
    (manual
      ? panel(
          "Current matching state",
          "FIFO orders at each price",
          book(manual.book),
        ) +
        panel(
          "Resting orders",
          "Use an ID below to cancel a specific order",
          table(
            ["ID", "Side", "Price", "Remaining", "Priority"],
            manual.orders.map((o) => [
              esc(o.order_id),
              o.side,
              price(o.price),
              o.remaining,
              o.sequence,
            ]),
          ),
        ) +
        panel(
          "Execution reports",
          "Most recent command; before and after snapshots available",
          transition(manual.reports.at(-1)) +
            `<button class="button" data-action="manual-report">Inspect last transition</button>`,
        )
      : "")
  );
}
function experimentPage() {
  return (
    panel(
      "Common-random-number comparison",
      "Each strategy faces the same event instructions for each seed",
      `<div class="controls">${input("episodes", "Episodes (2–20)", 10)}${input("exp-qty", "Parent lots", 5000)}<button class="button primary" data-action="experiment">Run controlled experiment</button></div><p class="small muted">Buy side, event 20, 100-event horizon. Independent seeds are the experimental unit. Results are simulation-only and do not establish historical superiority.</p>`,
    ) +
    (experiments.length
      ? panel(
          "Latest experiment",
          "Distribution of total implementation shortfall, including missed fills",
          table(
            [
              "Strategy",
              "Episodes",
              "Valid costs",
              "Mean bps",
              "Median",
              "P95",
              "Std dev",
              "Completion %",
            ],
            experiments
              .at(-1)
              .results.map((r) => [
                r.strategy,
                r.episodes,
                r.cost_observations,
                n(r.mean),
                n(r.median),
                n(r.p95),
                n(r.std),
                n(r.completion * 100),
              ]),
          ),
        )
      : "")
  );
}
async function render() {
  const s = session.frames[index].book;
  let content = "";
  switch (page) {
    case "overview":
      content = overview();
      break;
    case "order-book":
    case "market-replay":
      content =
        replayControls() +
        `<div class="controls">${select("levels", "Visible depth", ["1", "5", "10"])}</div>` +
        panel(
          "Displayed order book",
          "Depth is quoted, not guaranteed executable after latency.",
          book(s, levels) + depth(s, levels),
        ) +
        panel(
          "State diagnostics",
          "Top 10 imbalance; microprice uses only best quotes",
          metrics([
            ["Midprice", price(s.mid), "Arithmetic midpoint"],
            ["Microprice", price(s.microprice), "Size-weighted best quotes"],
            ["Spread", n(s.spread) + "¢", "Quoted spread"],
            ["Imbalance", n(s.imbalance, 3), "Range −1 to +1"],
          ]) +
            line(
              session.frames.slice(0, index + 1).map((f) => f.book.mid),
              "Midprice (cents)",
            ),
        ) +
        panel(
          "Recent event transitions",
          "Inspect before/after book state",
          eventTable(),
        );
      break;
    case "microstructure-lab":
      content = micro(session);
      break;
    case "execution-lab":
      content = execution();
      break;
    case "transaction-costs":
      content = costs(results);
      break;
    case "matching-engine":
      content = matching();
      break;
    case "liquidity-simulator":
      content =
        panel(
          "Change the market, hold the order fixed",
          "Seeded synthetic regimes change depth, cancellation intensity, order flow and quote spacing.",
          `<div class="controls">${select("regime", "Regime", regimes)}${input("seed", "Random seed", seed)}<button class="button primary" data-action="regenerate">Generate session</button></div><p class="small muted">Volatility is emergent, not calibrated. “Liquidity shock” is a high-cancellation stress regime rather than a timestamped historical shock. Session generation replaces replay state and prior execution results.</p>`,
        ) +
        panel("Current regime", "Latest generated event stream", book(s, 5));
      break;
    case "strategy-simulator":
      content = experimentPage();
      break;
    case "event-stream":
      content =
        replayControls() +
        panel(
          "Event-sourced ledger",
          "Instruction plus derived fills. Click to inspect the complete transition.",
          eventTable(),
        );
      break;
    case "performance": {
      const b = await fetch("benchmarks.json").then((r) => r.json());
      content =
        panel(
          "Measured Python engine throughput",
          "Actual host measurements; not exchange-grade latency guarantees",
          table(
            ["Events", "Runtime seconds", "Events / second", "Mean μs / event"],
            b.runs.map((r) => [
              n(r.events),
              n(r.seconds, 4),
              n(r.events_per_second, 0),
              n(r.microseconds_per_event, 2),
            ]),
          ),
        ) +
        panel(
          "Measurement context",
          esc(b.platform),
          `<div class="prose">${esc(b.method)}<p>Python ${esc(b.python)}. These are single-run, end-to-end insertion/cancellation throughput measurements, not latency percentiles. Matching-heavy workloads and data/UI loading have different costs. No optimization speedup is claimed without an alternative baseline.</p></div>`,
        );
      break;
    }
    case "architecture":
      content = architecture();
      break;
    case "methodology":
      content = methodology();
      break;
    case "experiments":
      content = panel(
        "Experiment registry",
        "Saved in this browser · export JSON for portable research records",
        `<button class="button" data-action="export-experiments">Export JSON</button>` +
          table(
            ["Run", "Status", "Regime", "Episodes", "Runtime ms"],
            experiments.map((r, i) => [
              i + 1,
              r.status,
              esc(r.definition.regime),
              r.definition.episodes,
              n(r.runtime_ms),
            ]),
          ),
      );
      break;
    case "project-history":
      content = panel(
        "Implementation history",
        "One integrated v1.0 build; no invented historical releases",
        table(
          ["Delivered layer", "Implementation"],
          [
            [
              "Engine",
              "Integer tick/lot order book, FIFO matching and cancellations",
            ],
            [
              "Research",
              "Deterministic seeded replay and five execution methods",
            ],
            [
              "Analytics",
              "Microprice, imbalance, costs and scenario comparison",
            ],
            [
              "Product",
              "Custom interface, test suite, benchmarks and documentation",
            ],
          ],
        ),
      );
      break;
    case "about":
      content = panel(
        "Bara Mbaye",
        "Mechanical Engineering · University of Georgia · Expected May 2028",
        '<p class="big-statement">Understand the market between decision and execution.</p><div class="prose">MarketSim is a market mechanics and execution research platform. Interests: quantitative research, financial systems, data engineering, market infrastructure and institutional investing.<p>Its public dataset is synthetic. There are no credentials, brokerage integrations or real order controls.</p></div>',
      );
      break;
    default:
      content = overview();
  }
  $("#main").innerHTML = header() + content;
  if ($("#speed")) $("#speed").value = replaySpeed;
  if ($("#filter")) $("#filter").value = eventFilter;
  if ($("#levels")) $("#levels").value = String(levels);
  if ($("#regime")) $("#regime").value = regime;
  if (page === "execution-lab")
    Object.entries(execConfig).forEach(([k, v]) => {
      $("#" + k).value = v;
    });
  $("#crumb").textContent = pages.find((p) => slug(p) === page) || "Overview";
  document
    .querySelectorAll(".nav-item")
    .forEach((a) => a.classList.toggle("active", a.hash === "#" + page));
}
function show(value) {
  $("#detail-text").textContent = JSON.stringify(value, null, 2);
  $("#detail").showModal();
}
async function load() {
  session = await api("session", { seed, regime });
  index = 20;
  results = null;
  if (page === "matching-engine" && !manual)
    manual = await api("manual", { commands });
  await render();
}
async function act(action) {
  if (action === "play") {
    if (timer) {
      clearInterval(timer);
      timer = null;
    } else {
      const speed = parseInt(replaySpeed);
      timer = setInterval(() => {
        index = Math.min(index + 1, session.frames.length - 1);
        render();
        if (index === session.frames.length - 1) {
          clearInterval(timer);
          timer = null;
          render();
        }
      }, 500 / speed);
    }
    await render();
  }
  if (action === "step" || action === "back") {
    index = Math.max(
      0,
      Math.min(session.frames.length - 1, index + (action === "step" ? 1 : -1)),
    );
    await render();
  }
  if (action === "execute" || action === "execute-default") {
    let p = { seed, regime };
    if (action === "execute") {
      Object.keys(execConfig).forEach(
        (k) => (execConfig[k] = $("#" + k).value),
      );
      p = {
        ...p,
        side: $("#side").value,
        quantity: +$("#qty").value,
        start: +$("#start").value,
        duration: +$("#duration").value,
        participation: +$("#participation").value / 100,
        fee_bps: +$("#fee").value,
        profile:
          $("#profile").value === "Uniform"
            ? [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
            : $("#profile").value === "Front loaded"
              ? [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
              : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      };
    }
    results = await api("execute", p);
    await render();
  }
  if (action === "submit") {
    const type = $("#order-type").value,
      c = {
        type,
        order_id: $("#order-id").value,
        side: $("#order-side").value,
        quantity: +$("#order-qty").value,
        price: type === "LIMIT" ? +$("#order-price").value : null,
      };
    manual = await api("manual", { commands: [...commands, c] });
    commands.push(c);
    await render();
  }
  if (action === "reset-book") {
    commands = [];
    manual = await api("manual", { commands });
    await render();
  }
  if (action === "manual-report")
    show(manual.reports.at(-1) || { note: "No manual commands yet" });
  if (action === "regenerate") {
    regime = $("#regime").value;
    seed = +$("#seed").value;
    await load();
  }
  if (action === "experiment") {
    const result = await api("experiment", {
      regime,
      seed,
      episodes: +$("#episodes").value,
      quantity: +$("#exp-qty").value,
    });
    experiments.push({ ...result, created_at: new Date().toISOString() });
    try {
      localStorage.setItem(
        "marketsim-experiments-v1",
        JSON.stringify(experiments),
      );
    } catch {}
    await render();
  }
  if (action === "export-experiments") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(experiments, null, 2)], {
        type: "application/json",
      }),
    );
    a.download = "marketsim-experiments.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action],[data-event],[data-result]");
  if (!b) return;
  try {
    b.disabled = true;
    if (b.dataset.action) await act(b.dataset.action);
    if (b.dataset.event) show(session.frames[+b.dataset.event]);
    if (b.dataset.result) show(results[+b.dataset.result]);
  } catch (error) {
    show({ error: error.message });
  } finally {
    b.disabled = false;
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "speed") replaySpeed = e.target.value;
  if (e.target.id === "filter") {
    eventFilter = e.target.value;
    render();
  }
  if (e.target.id === "levels") {
    levels = +e.target.value;
    render();
  }
  if (["position", "event"].includes(e.target.id)) {
    index = Math.max(
      0,
      Math.min(session.frames.length - 1, Math.floor(+e.target.value) || 0),
    );
    render();
  }
});
$("#close").onclick = () => $("#detail").close();
$("#menu").onclick = () => document.body.classList.toggle("menu-open");
$("#navigation").innerHTML = pages
  .map(
    (p, i) =>
      `${[0, 6, 11].includes(i) ? `<div class="nav-heading">${i === 0 ? "RESEARCH" : i === 6 ? "SYSTEM" : "PROJECT"}</div>` : ""}<a class="nav-item" href="#${slug(p)}"><span>◇</span>${p}</a>`,
  )
  .join("");
window.addEventListener("hashchange", async () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  page = location.hash.slice(1) || "overview";
  document.body.classList.remove("menu-open");
  try {
    if (page === "matching-engine" && !manual)
      manual = await api("manual", { commands });
    await render();
  } catch (e) {
    show({ error: e.message });
  }
});
page = pages.some((p) => slug(p) === location.hash.slice(1))
  ? location.hash.slice(1)
  : "overview";
load().catch((e) => {
  $("#main").innerHTML =
    `<div class="empty">${esc(e.message)}. Run python -m marketsim.server, then open http://localhost:8000.</div>`;
});
