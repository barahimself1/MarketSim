export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const n = (v, d = 2) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("en-US", { maximumFractionDigits: d });
export const price = (v) => (v == null ? "—" : "$" + (v / 100).toFixed(3));
export const panel = (title, sub, content) =>
  `<section class="panel"><div class="panel-head"><div><h2>${title}</h2><p>${sub}</p></div></div><div class="panel-body">${content}</div></section>`;
export const table = (heads, rows) =>
  `<div class="table-wrap"><table><thead><tr>${heads.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
export const metrics = (items) =>
  `<div class="metrics">${items.map(([a, b, c]) => `<div class="metric"><div class="metric-label">${a}</div><div class="metric-value">${b}</div><small>${c}</small></div>`).join("")}</div>`;
export function book(s, levels = 10) {
  const max = Math.max(1, ...s.bids.concat(s.asks).map((r) => r.quantity));
  function side(rows, label, cls) {
    let cumulative = 0;
    return `<div><div class="book-title"><strong class="${cls}">${label}</strong><small>Price-time priority</small></div><div class="table-wrap"><table><thead><tr><th>Price</th><th>Size</th><th>Cumulative</th><th>Orders</th></tr></thead><tbody>${rows
      .slice(0, levels)
      .map((r) => {
        cumulative += r.quantity;
        return `<tr class="book-row ${cls === "ask" ? "ask-row" : ""}" style="--w:${(r.quantity / max) * 100}%"><td class="${cls}">${price(r.price)}</td><td>${n(r.quantity)}</td><td>${n(cumulative)}</td><td>${r.orders}</td></tr>`;
      })
      .join("")}</tbody></table></div></div>`;
  }
  return `<div class="book-center"><span>BEST BID<br><strong class="bid">${price(s.bids[0]?.price)}</strong></span><span>MIDPRICE<br><strong>${price(s.mid)}</strong></span><span>BEST ASK<br><strong class="ask">${price(s.asks[0]?.price)}</strong></span></div><div class="book-grid">${side(s.bids, "Bids", "bid")}${side(s.asks, "Asks", "ask")}</div>`;
}
export function line(values, label) {
  const vals = values.filter((v) => v != null);
  if (!vals.length) return "<p>No two-sided observations available.</p>";
  let lo = Math.min(...vals),
    hi = Math.max(...vals);
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const points = values
    .map((v, i) =>
      v == null
        ? null
        : `${45 + (i * 540) / Math.max(1, values.length - 1)},${170 - ((v - lo) / (hi - lo)) * 140}`,
    )
    .filter(Boolean)
    .join(" ");
  return `<svg class="trace" viewBox="0 0 610 200" role="img" aria-label="${esc(label)}"><path d="M45 20V170H590" fill="none" stroke="#dce3e8"/><text x="5" y="25">${n(hi)}</text><text x="5" y="170">${n(lo)}</text><polyline points="${points}" stroke="#337f73" stroke-width="2" fill="none"/><text x="45" y="195">Event sequence → ${esc(label)}</text></svg>`;
}

export function depth(s, levels = 10) {
  const sides = [s.bids.slice(0, levels), s.asks.slice(0, levels)],
    all = sides.flat();
  if (!all.length) return '<p class="muted">No displayed liquidity.</p>';
  const lo = Math.min(...all.map((r) => r.price)) - 1,
    hi = Math.max(...all.map((r) => r.price)) + 1,
    max = Math.max(
      1,
      ...sides.map((rs) => rs.reduce((a, r) => a + r.quantity, 0)),
    );
  const x = (p) => 48 + ((p - lo) / (hi - lo)) * 512,
    y = (q) => 175 - (q / max) * 140;
  const curves = sides
    .map((rows, i) => {
      if (!rows.length) return "";
      let total = 0,
        points = `${x(rows[0].price)},175`;
      for (const r of rows) {
        points += ` ${x(r.price)},${y(total)}`;
        total += r.quantity;
        points += ` ${x(r.price)},${y(total)}`;
      }
      const color = i ? "#b65e42" : "#337f73";
      return `<polygon points="${points} ${x(rows.at(-1).price)},175" fill="${color}" opacity=".10"/><polyline points="${points}" stroke="${color}" stroke-width="2" fill="none"/>`;
    })
    .join("");
  return `<svg class="trace depth-chart" viewBox="0 0 610 220" role="img" aria-label="Cumulative displayed depth by price"><path d="M48 30V175H560" fill="none" stroke="#dce3e8"/><path d="M48 105H560M48 35H560" stroke="#edf0f2"/>${curves}<text x="4" y="39">${n(max, 0)}</text><text x="26" y="177">0</text><text x="48" y="198">${price(lo)}</text><text x="495" y="198">${price(hi)}</text><text x="48" y="16">Cumulative lots · top ${levels} levels</text><text x="415" y="16" fill="#337f73">Bids</text><text x="480" y="16" fill="#b65e42">Asks</text></svg>`;
}

export function scatter(points, xlabel, ylabel) {
  const ps = points.filter((p) => p.every((v) => Number.isFinite(v)));
  if (!ps.length)
    return '<p class="muted">No eligible paired observations.</p>';
  let xmin = Math.min(...ps.map((p) => p[0])),
    xmax = Math.max(...ps.map((p) => p[0])),
    ymin = Math.min(...ps.map((p) => p[1])),
    ymax = Math.max(...ps.map((p) => p[1]));
  if (xmax === xmin) {
    xmin -= 1;
    xmax += 1;
  }
  if (ymax === ymin) {
    ymin -= 1;
    ymax += 1;
  }
  return `<svg class="trace" viewBox="0 0 610 220" role="img" aria-label="${esc(xlabel)} versus ${esc(ylabel)}"><path d="M55 25V170H570" fill="none" stroke="#dce3e8"/>${ps.map(([x, y]) => `<circle cx="${55 + (515 * (x - xmin)) / (xmax - xmin)}" cy="${170 - (140 * (y - ymin)) / (ymax - ymin)}" r="2.3" fill="#337f73" opacity=".35"/>`).join("")}<text x="55" y="16">${esc(ylabel)}</text><text x="4" y="35">${n(ymax)}</text><text x="4" y="170">${n(ymin)}</text><text x="55" y="188">${n(xmin)}</text><text x="530" y="188">${n(xmax)}</text><text x="200" y="212">${esc(xlabel)} · n = ${ps.length}</text></svg>`;
}

export function histogram(values, label) {
  const data = values.filter(Number.isFinite);
  if (!data.length) return "<p>No observations.</p>";
  const lo = Math.min(...data),
    hi = Math.max(...data),
    step = Math.max(1, (hi - lo) / 12),
    bins = Array(12).fill(0);
  data.forEach((v) => bins[Math.min(11, Math.floor((v - lo) / step))]++);
  const maximum = Math.max(...bins);
  return `<svg class="trace" viewBox="0 0 610 220" role="img" aria-label="${esc(label)} distribution"><path d="M45 25V175H580" fill="none" stroke="#dce3e8"/>${bins.map((v, i) => `<rect x="${48 + i * 44}" y="${175 - (v / maximum) * 140}" width="39" height="${(v / maximum) * 140}" rx="2" fill="#337f73" opacity=".7"><title>${n(lo + i * step)}–${n(lo + (i + 1) * step)}: ${v} observations</title></rect>`).join("")}<text x="5" y="38">${maximum}</text><text x="45" y="196">${n(lo)}</text><text x="535" y="196">${n(lo + 12 * step)}</text><text x="190" y="216">${esc(label)} · event counts</text></svg>`;
}

export function costBars(results) {
  const terms = [
    ["spread_walk_bps", "Spread + walk", "#337f73"],
    ["delay_bps", "Delay", "#788fa1"],
    ["fees_bps", "Fees", "#b4a38c"],
    ["opportunity_bps", "Opportunity", "#b65e42"],
  ];
  const eligible = results.filter((r) =>
    terms.every(([key]) => Number.isFinite(r[key])),
  );
  if (!eligible.length)
    return "<p>Cost components are unavailable for this horizon.</p>";
  const left = Math.min(
      0,
      ...eligible.map((r) =>
        terms.reduce((s, [k]) => s + Math.min(0, r[k]), 0),
      ),
    ),
    right = Math.max(
      1,
      ...eligible.map((r) =>
        terms.reduce((s, [k]) => s + Math.max(0, r[k]), 0),
      ),
    ),
    scale = 520 / (right - left),
    zero = 120 - left * scale;
  const rows = eligible
    .map((r, i) => {
      let positive = zero,
        negative = zero;
      return (
        `<text x="8" y="${61 + i * 44}">${esc(r.strategy)}</text>` +
        terms
          .map(([key, label, color]) => {
            const value = r[key],
              width = Math.abs(value) * scale;
            let x;
            if (value < 0) {
              negative -= width;
              x = negative;
            } else {
              x = positive;
              positive += width;
            }
            return `<rect x="${x}" y="${45 + i * 44}" width="${width}" height="22" rx="2" fill="${color}"><title>${esc(r.strategy)} · ${label}: ${n(value, 3)} bps</title></rect>`;
          })
          .join("")
      );
    })
    .join("");
  return `<svg class="cost-chart" viewBox="0 0 710 ${100 + eligible.length * 44}" role="img" aria-label="Signed implementation shortfall components in basis points">${terms.map(([, label, color], i) => `<rect x="${8 + i * 174}" y="8" width="10" height="10" rx="2" fill="${color}"/><text x="${23 + i * 174}" y="17">${label}</text>`).join("")}<path d="M${zero} 35V${eligible.length * 44 + 35}" stroke="#d5dee1"/>${rows}<text x="120" y="${eligible.length * 44 + 65}">${n(left)} bps</text><text x="590" y="${eligible.length * 44 + 65}">${n(right)} bps</text><text x="230" y="${eligible.length * 44 + 88}">Favorable ← 0 → Adverse · common scale</text></svg>`;
}
