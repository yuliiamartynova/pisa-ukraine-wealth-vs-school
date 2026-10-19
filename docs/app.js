/* Family or school? PISA 2025 Ukraine.
   Data: docs/data/results.json and docs/data/students.json, produced by scripts/analyze.py */

const SUBJECTS = { math: "Mathematics", reading: "Reading", science: "Science" };
const SHORT = { math: "m", reading: "r", science: "sc" };
const POINTS_PER_YEAR = 20; // OECD rule of thumb: about 20 PISA points ≈ one year of schooling
const LOC_KEYS = ["1", "2", "3", "4", "5"];
const LOC_SHORT = { 1: "Village", 2: "Small town", 3: "Town", 4: "City", 5: "Large city" };

const state = { subject: "math", scale: "sd", locModel: "raw", school: null, locOn: new Set(LOC_KEYS) };
let R = null;      // results.json
let S = null;      // students.json, decoded

/* ---------- formatting ---------- */
const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const minus = (s) => s.replace("-", "−");
const f0 = (x) => minus(nf0.format(x));
const f1 = (x) => minus(nf1.format(x));
const f2 = (x) => minus(nf2.format(x));
const pct0 = (x) => `${nf0.format(x * 100)}%`;
const pct1 = (x) => `${nf1.format(x * 100)}%`;
const signed0 = (x) => (Math.round(x) > 0 ? "+" : "") + f0(x);

const D = () => R.domains[state.subject];
const est = (k) => D()[k].est;
const se = (k) => D()[k].se;
const sig = (k) => Math.abs(est(k)) > 1.96 * se(k);
const subjLower = () => SUBJECTS[state.subject].toLowerCase();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const T = (sel) => (reducedMotion ? sel : sel.transition().duration(650).ease(d3.easeCubicInOut));

/* ---------- tooltip ---------- */
const tip = document.getElementById("tooltip");
function showTip(html, event) {
  tip.innerHTML = html;
  tip.hidden = false;
  const pad = 14, r = tip.getBoundingClientRect();
  let x = event.clientX + pad, y = event.clientY + pad;
  if (x + r.width > window.innerWidth - 8) x = event.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = event.clientY - r.height - pad;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}
const hideTip = () => { tip.hidden = true; };
const ttRow = (k, v) => `<div class="tt-row"><span>${k}</span><b>${v}</b></div>`;

/* ---------- chart scaffolding ---------- */
function frame(id, height) {
  const el = document.getElementById(id);
  const width = Math.max(300, el.clientWidth);
  const svg = d3.select(el).selectAll("svg").data([0]).join("svg")
    .attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);
  return { svg, width, el };
}
function roundedBar(x, y, w, h, r = 3) {
  // square at the baseline (left), rounded at the data end (right)
  w = Math.max(0, w);
  r = Math.min(r, w, h / 2);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}
function xGrid(svg, x, y0, y1, ticks, fmt) {
  svg.append("g").attr("class", "grid").attr("transform", `translate(0,${y0})`)
    .call(d3.axisBottom(x).ticks(ticks).tickSize(y1 - y0).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${y1})`)
    .call(d3.axisBottom(x).ticks(ticks).tickSize(0).tickPadding(8).tickFormat(fmt));
}

/* ---------- text ---------- */
function fillText() {
  const d = D();
  const q = R.escs_quantiles, qs = R.school_escs_quantiles;
  const pred = (e, s) => d.m2_a.est + d.m2_b_own.est * e + d.m2_b_comp.est * s;
  const predLow = pred(q.p50, qs.p10), predHigh = pred(q.p50, qs.p90);
  const values = {
    nStudents: nf0.format(R.sample.n_students),
    nSchools: nf0.format(R.sample.n_schools),
    subjLower: subjLower(),
    escsBetween: pct0(R.escs.between_share.est),
    scoreBetween: pct0(est("between_share")),
    kfBetween: pct0(est("between_share")),
    kfComp: f0(est("m2_b_comp_sd")),
    kfOwn: f0(est("m2_b_own_sd")),
    kfGapRaw: f0(est("gap_raw_5")),
    kfGapComp: f0(est("gap_comp_5")),
    m1: f0(est("m1_b_sd")),
    own: f0(est("m2_b_own_sd")),
    comp: f0(est("m2_b_comp_sd")),
    r2m1: pct1(est("m1_r2")),
    r2m2: pct1(est("m2_r2")),
    r2m3: pct0(est("m3_r2")),
    sdEscs: f2(R.escs.sd.est),
    sdSchool: f2(R.escs.school_sd.est),
    gapRaw: f0(est("gap_raw_5")),
    gapEscs: f0(est("gap_escs_5")),
    gapComp: f0(est("gap_comp_5")),
    gapYears: f1(est("gap_raw_5") / POINTS_PER_YEAR),
    gapSig: sig("gap_comp_5") ? ", though it remains statistically significant" : ", which is no longer statistically significant",
    locN: `Based on ${nf0.format(R.sample.n_location)} students in ${R.sample.n_location_schools} schools with known location.`,
    predLow: f0(predLow),
    predHigh: f0(predHigh),
    predSchoolDiff: f0(predHigh - predLow),
    predFamDiff: f0(d.m2_b_own.est * (q.p90 - q.p10)),
    sampleText: `Of ${nf0.format(R.sample.n_students)} Ukrainian students in ${R.sample.n_schools} schools, ${nf0.format(R.sample.n_escs)} have a valid ESCS and enter the models; ${nf0.format(R.sample.n_location)} of them attend schools with a reported location.`,
  };
  document.querySelectorAll("[data-k]").forEach((el) => {
    const v = values[el.dataset.k];
    if (v !== undefined) el.textContent = v;
  });
}

/* ---------- Figure 1: variance between / within schools ---------- */
function fig1() {
  const rows = [
    { label: "Family status (ESCS)", v: R.escs.between_share.est },
    { label: `${SUBJECTS[state.subject]} score`, v: est("between_share") },
  ];
  const rowH = 62, barH = 26;
  const { svg, width } = frame("fig1", rows.length * rowH + 4);
  svg.selectAll("*").remove();
  const x = d3.scaleLinear().domain([0, 1]).range([0, width]);
  rows.forEach((r, i) => {
    const y0 = i * rowH;
    svg.append("text").attr("x", 0).attr("y", y0 + 14).attr("class", "t-strong").text(r.label);
    const yb = y0 + 24, gap = 2;
    const xb = x(r.v);
    svg.append("path").attr("d", `M3,${yb}H${xb - gap / 2}V${yb + barH}H3Q0,${yb + barH} 0,${yb + barH - 3}V${yb + 3}Q0,${yb} 3,${yb}Z`)
      .style("fill", "var(--accent)");
    svg.append("path").attr("d", roundedBar(xb + gap / 2, yb, width - xb - gap / 2, barH)).style("fill", "var(--mark)");
    svg.append("text").attr("x", 10).attr("y", yb + barH / 2).attr("dy", "0.35em").style("fill", "#fff").style("font-weight", 600).text(pct0(r.v));
    svg.append("text").attr("x", width - 10).attr("y", yb + barH / 2).attr("dy", "0.35em").attr("text-anchor", "end").attr("class", "t-strong").text(pct0(1 - r.v));
    const hit = svg.append("rect").attr("x", 0).attr("y", yb).attr("width", width).attr("height", barH).style("fill", "transparent");
    hit.on("pointermove", (e) => showTip(`<div class="tt-title">${r.label}</div>${ttRow("Between schools", pct1(r.v))}${ttRow("Within schools", pct1(1 - r.v))}`, e))
      .on("pointerleave", hideTip);
  });
}

/* ---------- Figure 2: coefficients ---------- */
function fig2() {
  const suf = state.scale === "sd" ? "_sd" : "";
  const rows = [
    { label: "Own family status", sub: "Model 1, alone", key: "m1_b" + suf, color: "var(--mark-strong)" },
    { label: "Own family status", sub: "Model 2, at equal school composition", key: "m2_b_own" + suf, color: "var(--mark-strong)" },
    { label: "School composition", sub: "Model 2, at equal own family status", key: "m2_b_comp" + suf, color: "var(--accent)" },
  ];
  const rowH = 64, top = 4, bottom = 28;
  const { svg, width } = frame("fig2", top + rows.length * rowH + bottom);
  svg.selectAll("*").remove();
  const hi = d3.max(rows, (r) => est(r.key) + 1.96 * se(r.key));
  const x = d3.scaleLinear().domain([0, hi * 1.12]).nice().range([0, width - 8]);
  const H = top + rows.length * rowH;
  xGrid(svg, x, top, H, 5, (v) => f0(v));
  rows.forEach((r, i) => {
    const y0 = top + i * rowH;
    const yd = y0 + 40;
    svg.append("text").attr("x", 0).attr("y", y0 + 16).attr("class", "t-strong").text(r.label)
      .append("tspan").attr("class", "t-muted").style("font-weight", 400).text(`  ${r.sub}`);
    const e = est(r.key), s = se(r.key);
    svg.append("line").attr("x1", x(Math.max(0, e - 1.96 * s))).attr("x2", x(e + 1.96 * s)).attr("y1", yd).attr("y2", yd)
      .style("stroke", r.color).style("stroke-width", 2).style("stroke-linecap", "round");
    svg.append("circle").attr("cx", x(e)).attr("cy", yd).attr("r", 6.5).style("fill", r.color).style("stroke", "var(--page)").style("stroke-width", 2);
    const lx = x(e + 1.96 * s) + 8;
    const fits = lx + 40 < width;
    svg.append("text").attr("x", fits ? lx : x(e)).attr("y", fits ? yd : yd - 12).attr("dy", fits ? "0.35em" : 0)
      .attr("text-anchor", fits ? "start" : "middle").attr("class", "t-strong t-num").text(f1(e));
    svg.append("rect").attr("x", 0).attr("y", y0).attr("width", width).attr("height", rowH).style("fill", "transparent")
      .on("pointermove", (ev) => showTip(`<div class="tt-title">${r.label}</div><div class="tt-note" style="margin:0 0 4px">${r.sub}</div>
        ${ttRow(state.scale === "sd" ? "Points per 1 SD" : "Points per ESCS unit", f1(e))}${ttRow("Standard error", f1(s))}
        ${ttRow("95% CI", `${f1(e - 1.96 * s)} to ${f1(e + 1.96 * s)}`)}`, ev))
      .on("pointerleave", hideTip);
  });
}

/* ---------- Figure 3: explained variance ---------- */
function fig3() {
  const rows = [
    { label: "Own family status", sub: "Model 1", key: "m1_r2", color: "var(--mark-strong)" },
    { label: "+ School composition", sub: "Model 2", key: "m2_r2", color: "var(--accent)" },
    { label: "School attended", sub: "Model 3, all differences between schools", key: "m3_r2", color: "var(--mark)" },
    { label: "School attended + own status", sub: "Model 4", key: "m4_r2", color: "var(--mark)" },
  ];
  const rowH = 48, top = 4, bottom = 28, barH = 18;
  const { svg, width } = frame("fig3", top + rows.length * rowH + bottom);
  svg.selectAll("*").remove();
  const hi = d3.max(rows, (r) => est(r.key));
  const x = d3.scaleLinear().domain([0, Math.min(1, hi * 1.2)]).nice().range([0, width - 8]);
  const H = top + rows.length * rowH;
  xGrid(svg, x, top, H, 5, (v) => pct0(v));
  rows.forEach((r, i) => {
    const y0 = top + i * rowH;
    svg.append("text").attr("x", 0).attr("y", y0 + 14).attr("class", "t-strong").text(r.label)
      .append("tspan").attr("class", "t-muted").style("font-weight", 400).text(`  ${r.sub}`);
    const e = est(r.key);
    svg.append("path").attr("d", roundedBar(0, y0 + 22, x(e), barH)).style("fill", r.color);
    svg.append("text").attr("x", x(e) + 6).attr("y", y0 + 22 + barH / 2).attr("dy", "0.35em").attr("class", "t-strong t-num").text(pct1(e));
    svg.append("rect").attr("x", 0).attr("y", y0).attr("width", width).attr("height", rowH).style("fill", "transparent")
      .on("pointermove", (ev) => showTip(`<div class="tt-title">${r.label}</div>${ttRow("R²", pct1(e))}${ttRow("Standard error", pct1(se(r.key)))}`, ev))
      .on("pointerleave", hideTip);
  });
}

/* ---------- Figure 4: village–city gap, stepped models ---------- */
const FIG4_TITLES = {
  raw: (g) => `Large-city schools score ${f0(g)} points higher than village schools`,
  escs: (g) => `Among students with the same family status, the gap is ${f0(g)} points`,
  comp: (g) => `At equal family status and school composition, the gap shrinks to ${f0(g)} points`,
};
function fig4(animate = false) {
  const m = state.locModel;
  document.getElementById("fig4-title").textContent = FIG4_TITLES[m](est(`gap_${m}_5`));
  document.querySelectorAll("#loc-model button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === m)));

  const keys = ["2", "3", "4", "5"];
  const labels = R.locations;
  const rowH = 46, top = 8, bottom = 30;
  const el = document.getElementById("fig4");
  const width = Math.max(300, el.clientWidth);
  const labelW = width < 560 ? 0 : 170;
  const height = top + (keys.length + 1) * rowH + bottom + (labelW ? 0 : (keys.length + 1) * 16);
  const rowY = (i) => top + i * (rowH + (labelW ? 0 : 16)) + (labelW ? rowH / 2 : 16 + rowH / 2 - 6);
  const { svg } = frame("fig4", height);

  // stable x-domain across the three models, so movement is meaningful
  const all = [];
  for (const mm of ["raw", "escs", "comp"]) for (const k of keys) {
    all.push(est(`gap_${mm}_${k}`) - 1.96 * se(`gap_${mm}_${k}`), est(`gap_${mm}_${k}`) + 1.96 * se(`gap_${mm}_${k}`));
  }
  const x = d3.scaleLinear().domain([Math.min(-10, d3.min(all)), d3.max(all) + 8]).nice().range([labelW, width - 40]);
  const H = height - bottom;

  if (!animate || svg.select(".rows").empty()) {
    svg.selectAll("*").remove();
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${top})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(H - top).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(0).tickPadding(8).tickFormat((v) => (v > 0 ? "+" : "") + f0(v)));
    svg.append("line").attr("class", "zero").attr("x1", x(0)).attr("x2", x(0)).attr("y1", top).attr("y2", H)
      .style("stroke", "var(--ink-2)").style("stroke-width", 1);
    svg.append("g").attr("class", "ghosts");
    svg.append("g").attr("class", "rows");
    // reference row
    const y = rowY(0);
    svg.append("text").attr("class", "halo").attr("x", labelW ? labelW - 14 : 0).attr("y", labelW ? y : y - 20).attr("dy", "0.35em")
      .attr("text-anchor", labelW ? "end" : "start").text(labels["1"]);
    svg.append("circle").attr("cx", x(0)).attr("cy", y).attr("r", 5).style("fill", "var(--ink-2)");
    svg.append("text").attr("x", x(0) + 10).attr("y", y).attr("dy", "0.35em").attr("class", "t-muted").text("reference");
  }

  // ghost markers: the unadjusted gaps, shown when a model with controls is active
  const ghosts = svg.select(".ghosts").selectAll("circle").data(m === "raw" ? [] : keys, (k) => k);
  ghosts.join(
    (enter) => enter.append("circle").attr("r", 4.5).style("fill", "none").style("stroke", "var(--mark)").style("stroke-width", 1.5)
      .attr("cx", (k) => x(est(`gap_raw_${k}`))).attr("cy", (k, i) => rowY(i + 1)).style("opacity", 0)
      .call((s) => T(s).style("opacity", 1)),
    (update) => update.attr("cx", (k) => x(est(`gap_raw_${k}`))),
    (exit) => exit.remove(),
  );

  const g = svg.select(".rows").selectAll("g.row").data(keys, (k) => k).join((enter) => {
    const r = enter.append("g").attr("class", "row");
    r.append("text").attr("class", "lab");
    r.append("line").attr("class", "ci").style("stroke", "var(--accent)").style("stroke-width", 2).style("stroke-linecap", "round");
    r.append("circle").attr("class", "pt").attr("r", 6.5).style("stroke-width", 2);
    r.append("text").attr("class", "val t-strong t-num").attr("dy", "0.35em");
    r.append("rect").attr("class", "hit").style("fill", "transparent");
    return r;
  });

  g.each(function (k, i) {
    const row = d3.select(this);
    const y = rowY(i + 1);
    const key = `gap_${m}_${k}`;
    const e = est(key), s = se(key), isSig = Math.abs(e) > 1.96 * s;
    row.select(".lab").attr("class", "lab halo").attr("x", labelW ? labelW - 14 : 0).attr("y", labelW ? y : y - 20).attr("dy", "0.35em")
      .attr("text-anchor", labelW ? "end" : "start").text(labels[k]);
    T(row.select(".ci")).attr("x1", x(e - 1.96 * s)).attr("x2", x(e + 1.96 * s)).attr("y1", y).attr("y2", y);
    T(row.select(".pt")).attr("cx", x(e)).attr("cy", y)
      .style("fill", isSig ? "var(--accent)" : "var(--page)").style("stroke", isSig ? "var(--page)" : "var(--accent)");
    // value label right of the interval; skip past the ghost marker if they would collide
    let lx = x(e + 1.96 * s) + 8;
    const gx = m === "raw" ? null : x(est(`gap_raw_${k}`));
    if (gx != null && gx > lx - 10 && gx < lx + 34) lx = gx + 10;
    T(row.select(".val")).attr("x", lx).attr("y", y).text(signed0(e));
    row.select(".hit").attr("x", 0).attr("y", y - rowH / 2).attr("width", width).attr("height", rowH)
      .on("pointermove", (ev) => showTip(`<div class="tt-title">${labels[k]} vs village</div>
          ${ttRow("No controls", `${signed0(est(`gap_raw_${k}`))} (${f1(se(`gap_raw_${k}`))})`)}
          ${ttRow("+ Student ESCS", `${signed0(est(`gap_escs_${k}`))} (${f1(se(`gap_escs_${k}`))})`)}
          ${ttRow("+ School mean ESCS", `${signed0(est(`gap_comp_${k}`))} (${f1(se(`gap_comp_${k}`))})`)}
          <div class="tt-note">Points; standard errors in brackets</div>`, ev))
      .on("pointerleave", hideTip);
  });
}

/* ---------- Figure 5: predicted score lines ---------- */
function fig5() {
  const d = D();
  const q = R.escs_quantiles, qs = R.school_escs_quantiles;
  const fams = [
    { key: "p90", label: "Advantaged family", sub: "90th percentile ESCS", e: q.p90, color: "var(--o5)" },
    { key: "p50", label: "Typical family", sub: "median ESCS", e: q.p50, color: "var(--o3)" },
    { key: "p10", label: "Disadvantaged family", sub: "10th percentile ESCS", e: q.p10, color: "var(--o1)" },
  ];
  const pred = (e, s) => d.m2_a.est + d.m2_b_own.est * e + d.m2_b_comp.est * s;
  const el = document.getElementById("fig5");
  const width0 = Math.max(300, el.clientWidth);
  const endLabels = width0 >= 640;
  const m = { l: 44, r: endLabels ? 170 : 12, t: 16, b: 44 };
  const height = Math.round(Math.min(440, Math.max(300, width0 * 0.48)));
  const { svg, width } = frame("fig5", height);
  svg.selectAll("*").remove();

  const x = d3.scaleLinear().domain([qs.p5, qs.p95]).range([m.l, width - m.r]);
  const ys = fams.flatMap((f) => [pred(f.e, qs.p5), pred(f.e, qs.p95)]);
  const y = d3.scaleLinear().domain([d3.min(ys) - 10, d3.max(ys) + 10]).nice().range([height - m.b, m.t]);

  svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(6).tickSize(-(width - m.l - m.r)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(6).tickSize(0).tickPadding(8));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - m.b})`)
    .call(d3.axisBottom(x).ticks(6).tickSize(0).tickPadding(8).tickFormat(f1));
  svg.append("text").attr("x", width - m.r).attr("y", height - 6).attr("text-anchor", "end").attr("class", "t-muted")
    .text("School mean ESCS (school composition) →");

  // reference lines at the 10th and 90th percentile of school composition
  for (const [p, lab] of [["p10", "10th pct school"], ["p90", "90th pct school"]]) {
    svg.append("line").attr("x1", x(qs[p])).attr("x2", x(qs[p])).attr("y1", m.t).attr("y2", height - m.b)
      .style("stroke", "var(--axis)").style("stroke-width", 1);
    svg.append("text").attr("x", x(qs[p]) + 4).attr("y", m.t + 10).attr("class", "t-muted").text(lab);
  }

  fams.forEach((f) => {
    svg.append("line").attr("x1", x(qs.p5)).attr("x2", x(qs.p95)).attr("y1", y(pred(f.e, qs.p5))).attr("y2", y(pred(f.e, qs.p95)))
      .style("stroke", f.color).style("stroke-width", 2.5).style("stroke-linecap", "round");
  });
  if (endLabels) {
    // two-line labels at the line ends, pushed apart so they never overlap (fams is ordered top to bottom)
    const minGap = 36;
    const ys = fams.map((f) => y(pred(f.e, qs.p95)));
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + minGap);
    fams.forEach((f, i) => {
      const ly = y(pred(f.e, qs.p95));
      if (Math.abs(ys[i] - ly) > 2) {
        svg.append("line").attr("x1", width - m.r + 3).attr("x2", width - m.r + 8).attr("y1", ly).attr("y2", ys[i] - 7)
          .style("stroke", "var(--axis)").style("stroke-width", 1);
      }
      svg.append("text").attr("x", width - m.r + 10).attr("y", ys[i] - 7).attr("dy", "0.35em").attr("class", "t-strong").text(f.label);
      svg.append("text").attr("x", width - m.r + 10).attr("y", ys[i] + 9).attr("dy", "0.35em").attr("class", "t-muted").text(f.sub);
    });
  }

  const legend = document.getElementById("fig5-legend");
  legend.hidden = endLabels;
  legend.innerHTML = fams.map((f) =>
    `<li><span class="sw line" style="background:${f.color}"></span>${f.label} (${f.sub})</li>`).join("");

  // crosshair
  const cross = svg.append("g").style("display", "none").style("pointer-events", "none");
  cross.append("line").attr("y1", m.t).attr("y2", height - m.b).style("stroke", "var(--ink-2)").style("stroke-width", 1);
  const dots = cross.selectAll("circle").data(fams).join("circle").attr("r", 5)
    .style("fill", (f) => f.color).style("stroke", "var(--page)").style("stroke-width", 2);
  svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", width - m.l - m.r).attr("height", height - m.t - m.b)
    .style("fill", "transparent")
    .on("pointermove", (ev) => {
      const [px] = d3.pointer(ev);
      const s = x.invert(Math.max(x.range()[0], Math.min(x.range()[1], px)));
      cross.style("display", null);
      cross.select("line").attr("x1", x(s)).attr("x2", x(s));
      dots.attr("cx", x(s)).attr("cy", (f) => y(pred(f.e, s)));
      showTip(`<div class="tt-title">School mean ESCS ${f2(s)}</div>${fams.map((f) => ttRow(f.label, f0(pred(f.e, s)))).join("")}
        <div class="tt-note">Predicted ${subjLower()} score, Model 2</div>`, ev);
    })
    .on("pointerleave", () => { cross.style("display", "none"); hideTip(); });
}

/* ---------- Figure 6: school explorer ---------- */
function fig6Legend() {
  const ul = document.getElementById("fig6-legend");
  ul.innerHTML = LOC_KEYS.map((k) =>
    `<li><button type="button" data-k="${k}" aria-pressed="${state.locOn.has(k)}"><span class="sw dot" style="background:var(--o${k})"></span>${R.locations[k]}</button></li>`).join("")
    + `<li><span class="sw line" style="background:var(--mark-strong)"></span>Fitted line</li>`;
  ul.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.k;
    if (state.locOn.has(k) && state.locOn.size > 1) state.locOn.delete(k); else state.locOn.add(k);
    state.school = null;
    fig6Legend();
    fig6();
  }));
}

function fig6() {
  const key = SHORT[state.subject];
  const all = S.schools;
  const schools = all.filter((s) => s.loc == null || state.locOn.has(String(s.loc)));
  const el = document.getElementById("fig6");
  const width0 = Math.max(300, el.clientWidth);
  const height = Math.round(Math.min(580, Math.max(340, width0 * 0.6)));
  const m = { l: 44, r: 12, t: 12, b: 44 };
  const { svg, width } = frame("fig6", height);
  svg.selectAll("*").remove();

  const sel = state.school != null ? S.students.filter((p) => p.s === state.school) : [];
  const xs = all.map((s) => s.e).concat(sel.map((p) => p.e));
  const yv = all.map((s) => s[key]).concat(sel.map((p) => p[key]));
  const x = d3.scaleLinear().domain(d3.extent(xs)).nice().range([m.l, width - m.r]);
  const y = d3.scaleLinear().domain(d3.extent(yv)).nice().range([height - m.b, m.t]);

  svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(6).tickSize(-(width - m.l - m.r)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(0).tickPadding(8));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - m.b})`)
    .call(d3.axisBottom(x).ticks(7).tickSize(0).tickPadding(8).tickFormat(f1));
  svg.append("text").attr("x", width - m.r).attr("y", height - 6).attr("text-anchor", "end").attr("class", "t-muted").text("School mean ESCS →");
  svg.append("text").attr("x", m.l + 6).attr("y", m.t + 2).attr("dy", "0.7em").attr("class", "t-muted").text(`Mean ${subjLower()} score`);

  // fitted line (weighted by number of students) over all schools
  const wsum = d3.sum(all, (s) => s.n);
  const mx = d3.sum(all, (s) => s.n * s.e) / wsum, my = d3.sum(all, (s) => s.n * s[key]) / wsum;
  const b = d3.sum(all, (s) => s.n * (s.e - mx) * (s[key] - my)) / d3.sum(all, (s) => s.n * (s.e - mx) ** 2);
  const [x0, x1] = d3.extent(all, (s) => s.e);
  svg.append("line").attr("x1", x(x0)).attr("x2", x(x1)).attr("y1", y(my + b * (x0 - mx))).attr("y2", y(my + b * (x1 - mx)))
    .style("stroke", "var(--mark-strong)").style("stroke-width", 2);

  const r = d3.scaleSqrt().domain([1, d3.max(all, (s) => s.n)]).range([2.5, 8.5]);
  const color = (s) => (s.loc == null ? "var(--mark)" : `var(--o${s.loc})`);

  svg.append("g").selectAll("circle").data(schools).join("circle")
    .attr("cx", (s) => x(s.e)).attr("cy", (s) => y(s[key])).attr("r", (s) => r(s.n))
    .style("fill", color).style("stroke", "var(--page)").style("stroke-width", 1.5)
    .style("opacity", state.school == null ? 0.9 : 0.25);

  if (state.school != null) {
    const sc = all.find((s) => s.id === state.school);
    svg.append("g").selectAll("circle").data(sel).join("circle")
      .attr("cx", (p) => x(p.e)).attr("cy", (p) => y(p[key])).attr("r", 3.5)
      .style("fill", "var(--ink)").style("stroke", "var(--page)").style("stroke-width", 1);
    svg.append("circle").attr("cx", x(sc.e)).attr("cy", y(sc[key])).attr("r", r(sc.n) + 3)
      .style("fill", color(sc)).style("stroke", "var(--ink)").style("stroke-width", 2);
    svg.append("text").attr("x", x(sc.e) + r(sc.n) + 8).attr("y", y(sc[key])).attr("dy", "0.35em").attr("class", "t-strong")
      .text(`School ${sc.id + 1}: ${sel.length} students`);
  }

  const delaunay = d3.Delaunay.from(schools, (s) => x(s.e), (s) => y(s[key]));
  const ring = svg.append("circle").style("fill", "none").style("stroke", "var(--ink)").style("stroke-width", 1.5)
    .style("display", "none").style("pointer-events", "none");
  const nearest = (ev) => {
    const [px, py] = d3.pointer(ev, svg.node());
    const s = schools[delaunay.find(px, py)];
    return s && Math.hypot(x(s.e) - px, y(s[key]) - py) < 24 ? s : null;
  };
  svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", width - m.l - m.r).attr("height", height - m.t - m.b)
    .style("fill", "transparent").style("cursor", "pointer")
    .on("pointermove", (ev) => {
      const s = nearest(ev);
      if (!s) { ring.style("display", "none"); hideTip(); return; }
      ring.style("display", null).attr("cx", x(s.e)).attr("cy", y(s[key])).attr("r", r(s.n) + 4);
      showTip(`<div class="tt-title">School ${s.id + 1}</div>
        ${ttRow("Location", s.loc == null ? "not reported" : R.locations[s.loc])}
        ${ttRow("Students tested", s.n)}
        ${ttRow("Mean ESCS", f2(s.e))}
        ${ttRow(`Mean ${subjLower()} score`, f0(s[key]))}
        <div class="tt-note">${s.id === state.school ? "Click to hide students" : "Click to show students"}</div>`, ev);
    })
    .on("pointerleave", () => { ring.style("display", "none"); hideTip(); })
    .on("click", (ev) => {
      const s = nearest(ev);
      state.school = s && s.id !== state.school ? s.id : null;
      hideTip();
      fig6();
    });
}

/* ---------- table ---------- */
function table() {
  const subs = Object.keys(SUBJECTS);
  const cell = (subj, k, kind) => {
    const v = R.domains[subj][k];
    return kind === "pct"
      ? `${pct1(v.est)}<span class="se">(${nf1.format(v.se * 100)})</span>`
      : `${f1(v.est)}<span class="se">(${nf1.format(v.se)})</span>`;
  };
  const rows = [
    ["group", "Mean score"],
    ["Mean score, all students", "mean_all", "num"],
    ["group", "Variance between schools"],
    ["Score", "between_share", "pct"],
    ["Family status (ESCS)", "__escs", "pct"],
    ["group", "Model 1: score ~ student ESCS"],
    ["Student ESCS, per SD", "m1_b_sd", "num"],
    ["Student ESCS, per unit", "m1_b", "num"],
    ["R²", "m1_r2", "pct"],
    ["group", "Model 2: + school mean ESCS"],
    ["Student ESCS, per SD", "m2_b_own_sd", "num"],
    ["School mean ESCS, per SD", "m2_b_comp_sd", "num"],
    ["Student ESCS, per unit", "m2_b_own", "num"],
    ["School mean ESCS, per unit", "m2_b_comp", "num"],
    ["R²", "m2_r2", "pct"],
    ["group", "Models 3–4: school fixed effects"],
    ["R², school fixed effects (M3)", "m3_r2", "pct"],
    ["R², + student ESCS (M4)", "m4_r2", "pct"],
    ["Student ESCS within schools, per unit (M4)", "m4_b", "num"],
    ["group", "Decomposition of variance"],
    ["Family only", "family_only", "pct"],
    ["Overlap of family and school", "overlap", "pct"],
    ["School only", "school_only", "pct"],
    ["Unexplained", "unexplained", "pct"],
  ];
  for (const [m, lab] of [["raw", "no controls"], ["escs", "+ student ESCS"], ["comp", "+ school mean ESCS"]]) {
    rows.push(["group", `Gap to village schools, ${lab}`]);
    for (const k of ["2", "3", "4", "5"]) rows.push([R.locations[k], `gap_${m}_${k}`, "num"]);
  }
  let html = `<thead><tr><th></th>${subs.map((s) => `<th>${SUBJECTS[s]}</th>`).join("")}</tr></thead><tbody>`;
  for (const [a, b, kind] of rows) {
    if (a === "group") { html += `<tr class="group"><td colspan="${subs.length + 1}">${b}</td></tr>`; continue; }
    html += `<tr><th scope="row">${a}</th>${subs.map((s) => {
      if (b === "__escs") { const v = R.escs.between_share; return `<td>${pct1(v.est)}<span class="se">(${nf1.format(v.se * 100)})</span></td>`; }
      return `<td>${cell(s, b, kind)}</td>`;
    }).join("")}</tr>`;
  }
  document.getElementById("table").innerHTML = html + "</tbody>";
}

/* ---------- wiring ---------- */
function bindSeg(id, onChange) {
  const root = document.getElementById(id);
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    root.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    onChange(b.dataset.v);
  });
}

function renderAll() {
  fillText();
  fig1(); fig2(); fig3(); fig4(); fig5(); fig6();
}

async function boot() {
  const [res, stu] = await Promise.all([
    fetch("data/results.json").then((r) => r.json()),
    fetch("data/students.json").then((r) => r.json()),
  ]);
  R = res;
  const i = Object.fromEntries(stu.columns.map((c, j) => [c, j]));
  S = {
    students: stu.rows.map((v) => ({ s: v[i.s], e: v[i.e], m: v[i.m], r: v[i.r], sc: v[i.sc] })),
    schools: stu.schools,
  };

  bindSeg("subject", (v) => { state.subject = v; renderAll(); });
  bindSeg("coef-scale", (v) => { state.scale = v; fig2(); });
  document.getElementById("loc-model").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.locModel = b.dataset.v;
    fig4(true);
  });

  fig6Legend();
  table();
  renderAll();

  let w = window.innerWidth, t;
  window.addEventListener("resize", () => {
    if (window.innerWidth === w) return;
    w = window.innerWidth;
    clearTimeout(t);
    t = setTimeout(renderAll, 150);
  });
}

boot().catch((err) => {
  console.error(err);
  document.querySelector(".dek").textContent = "The data could not be loaded. If you opened the file directly, serve the docs/ folder over HTTP (see README).";
});
