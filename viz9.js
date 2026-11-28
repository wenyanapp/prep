"use strict";
// Teaching widgets, part 9: graphs and objects for the symmetry course (PLAN R18).
// graphnet (message passing with a node-relabelling test; an EGNN-style layer with an
// E(2) test) and slotattn (Slot Attention as competition between slots). Registered
// into viz.js; fields documented in CONTENT_SPEC.md ("Symmetry and equivariance widgets").
(() => {
  if (!window.Viz) return;
  const { h, s, cssv, pal, rgb, clamp, rng, randn, T, animator, shell, slider, btn, seg, playButton, legend, arrowPath, wrapText, svgLines } = Viz.util;
  const zh = () => (document.documentElement.lang || "").startsWith("zh");
  const L = (en, cn) => (zh() ? cn : en);
  const cap = (foot) => { const c = h("div", { class: "viz-caption" }); foot.append(c); return c; };
  const narrowOf = (el) => (el.clientWidth || 700) < 520;
  const wide = (row) => { row.style.flex = "1 1 300px"; return row; };
  // Number with a real minus sign, no "-0.00", and no trailing zeros.
  const nf = (v, d = 2) => { let r = (+v).toFixed(d); if (r.includes(".")) r = r.replace(/0+$/, "").replace(/\.$/, ""); if (/^-0*$/.test(r)) r = "0"; return r.replace(/^-/, "−"); };
  const n3 = (v) => { const r = (+v).toFixed(3); return (/^-0\.0*$/.test(r) ? r.slice(1) : r).replace(/^-/, "−"); };
  const txt = (x, y, str, o = {}) => s("text", { x, y, "font-size": o.size || 13, fill: o.fill, "font-weight": o.weight ?? 600, "text-anchor": o.anchor || "start", ...(o.attrs || {}) }, str);
  const ln = (x1, y1, x2, y2, stroke, w = 1.5, extra = {}) => s("line", { x1, y1, x2, y2, stroke, "stroke-width": w, ...extra });
  const arrow = (x1, y1, x2, y2, color, w = 2.4, size = 7, extra = {}) => s("path", { d: arrowPath(x1, y1, x2, y2, size), stroke: color, "stroke-width": w, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", ...extra });
  const toView = (svg, ev, W, H) => { const r = svg.getBoundingClientRect(); return [((ev.clientX - r.left) / r.width) * W, ((ev.clientY - r.top) / r.height) * H]; };
  const colors = () => { const g = (k) => cssv(k); return { fg: g("--fg"), fg2: g("--fg-2"), muted: g("--muted"), faint: g("--faint"), border: g("--border"), border2: g("--border-2"), surface: g("--surface"), cell: g("--viz-cell"), v1: g("--v1"), v2: g("--v2"), v3: g("--v3"), v4: g("--v4"), v5: g("--v5"), v6: g("--v6") }; };
  const sub = (k) => String(k).split("").map((c) => "₀₁₂₃₄₅₆₇₈₉"[+c] ?? c).join("");
  const int = (v, lo, hi, def) => { const x = Math.round(+v); return Number.isFinite(x) ? clamp(x, lo, hi) : def; };

  // ------------------------------------------------------------------ graphs
  // Positions in [-1, 1]² (y up), undirected edges.
  function makeGraph(kind, n, seed) {
    const pos = [], edges = [];
    if (kind === "molecule") {
      return { pos: [[-0.95, 0.3], [-0.5, -0.4], [0.0, 0.22], [0.5, -0.8], [0.42, 0.85], [0.95, 0.6]], edges: [[0, 1], [1, 2], [2, 3], [2, 4], [3, 4], [4, 5]] };
    }
    if (kind === "path") {
      for (let i = 0; i < n; i++) { pos.push([n === 1 ? 0 : -0.9 + (1.8 * i) / (n - 1), i % 2 ? -0.38 : 0.38]); if (i) edges.push([i - 1, i]); }
    } else if (kind === "star") {
      pos.push([0, 0]);
      for (let i = 1; i < n; i++) { const a = Math.PI / 2 + (2 * Math.PI * (i - 1)) / (n - 1); pos.push([0.9 * Math.cos(a), 0.92 * Math.sin(a)]); edges.push([0, i]); }
    } else if (kind === "random") {
      const r = rng(seed * 7919 + 13);
      for (let i = 0; i < n; i++) { const a = Math.PI / 2 + (2 * Math.PI * i) / n + (r() - 0.5) * 0.3; const rad = n >= 6 ? (i % 2 ? 0.5 : 0.94) + (r() - 0.5) * 0.08 : 0.68 + 0.26 * r(); pos.push([rad * Math.cos(a), rad * Math.sin(a)]); }
      const has = new Set();
      const add = (u, v) => { const k = u < v ? `${u}-${v}` : `${v}-${u}`; if (u === v || has.has(k)) return; has.add(k); edges.push(u < v ? [u, v] : [v, u]); };
      for (let i = 1; i < n; i++) add(i, Math.floor(r() * i)); // spanning tree: connected
      const extra = Math.max(1, Math.round(n / 3));
      for (let k = 0; k < extra * 4 && edges.length < n - 1 + extra; k++) add(Math.floor(r() * n), Math.floor(r() * n));
    } else { // ring
      for (let i = 0; i < n; i++) { const a = Math.PI / 2 - (2 * Math.PI * i) / n; pos.push([0.9 * Math.cos(a), 0.92 * Math.sin(a)]); if (n > 2 || i === 0) edges.push([i, (i + 1) % n]); }
      if (n === 2) edges.length = 1;
    }
    return { pos, edges };
  }
  const AGG = {
    sum: (a) => a.reduce((x, y) => x + y, 0),
    mean: (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0),
    max: (a) => (a.length ? Math.max(...a) : 0),
  };
  // Message passing on arrays indexed by node id: h_i ← h_i + ⊕_{j ∈ N(i)} h_j.
  // Returns per round the values, what each node received and the aggregate.
  function runMP(values, nbrs, agg, rounds) {
    const hist = [values.slice()], recv = [], aggs = [];
    for (let r = 0; r < rounds; r++) {
      const cur = hist[r];
      const got = nbrs.map((ns) => ns.map((j) => cur[j]));
      const a = got.map((m) => AGG[agg](m));
      recv.push(got); aggs.push(a);
      hist.push(cur.map((v, i) => v + a[i]));
    }
    return { hist, recv, aggs };
  }

  // ================================================================== graphnet
  Viz.register("graphnet", (root, cfg) => {
    const { stage, ctrls, foot } = shell(root, cfg);
    let mode = cfg.mode === "egnn" ? "egnn" : "mp";
    let kind = ["path", "ring", "star", "molecule", "random"].includes(cfg.graph) ? cfg.graph : mode === "egnn" ? "random" : "ring";
    const n0 = int(cfg.n, 3, 8, 5);
    const seed = int(cfg.seed, 0, 1e6, 1);
    let an = null;
    stage.style.flexWrap = "wrap";
    stage.style.gap = "10px 18px";
    stage.style.alignItems = "flex-start";
    const modeSeg = () => seg([["mp", L("message passing", "消息传递")], ["egnn", L("EGNN layer", "EGNN 层")]], mode, (m) => { mode = m; build(); });
    const graphSeg = () => seg([["path", L("path", "链")], ["ring", L("ring", "环")], ["star", L("star", "星形")], ["molecule", L("molecule", "分子")], ["random", L("random", "随机")]], kind, (k) => { kind = k; build(); });
    function build() {
      an?.stop();
      stage.innerHTML = ""; ctrls.innerHTML = ""; foot.innerHTML = "";
      (mode === "mp" ? buildMP : buildEGNN)();
    }

    // ---------------------------------------------------------------- mp
    function buildMP() {
      const G = makeGraph(kind, n0, seed);
      const n = G.pos.length;
      const R = int(cfg.rounds, 1, 6, 3);
      let agg = ["sum", "mean", "max"].includes(cfg.agg) ? cfg.agg : "sum";
      const r0 = rng(seed * 101 + 7);
      const given = Array.isArray(cfg.values) ? cfg.values.map(Number).filter(Number.isFinite) : [];
      // Initial value of each physical node; `values` lists them in the original id order.
      const h0 = Array.from({ length: n }, (_, p) => (p < given.length ? given[p] : 1 + Math.floor(r0() * 4)));
      const physNbrs = Array.from({ length: n }, () => []);
      for (const [u, v] of G.edges) { physNbrs[u].push(v); physNbrs[v].push(u); }
      let label = Array.from({ length: n }, (_, p) => p); // label[p] = id of physical node p
      let shuffles = 0, k = 0, sending = false, t = 0, hold = 0, auto = false;
      let res, base;
      // The computation really runs on the relabelled arrays (X' = PX, A' = PAPᵀ), in id order.
      function compute() {
        const phys = new Array(n);
        label.forEach((id, p) => (phys[id] = p));
        const values = phys.map((p) => h0[p]);
        const nbrs = phys.map((p) => physNbrs[p].map((q) => label[q]).sort((a, b) => a - b));
        res = { ...runMP(values, nbrs, agg, R), phys, nbrs };
        if (!shuffles) base = { final: label.map((id) => res.hist[R][id]), sum: AGG.sum(res.hist[R]), max: Math.max(...res.hist[R]) };
      }
      function computeBase() { const keep = label; label = Array.from({ length: n }, (_, p) => p); const sh = shuffles; shuffles = 0; compute(); shuffles = sh; label = keep; compute(); }
      computeBase();

      const W = 420, H = 300;
      const wrap = h("div", { style: "flex:1 1 300px;max-width:400px;min-width:0" });
      const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "viz-svg" });
      wrap.append(svg);
      const side = h("div", { style: "flex:1 1 280px;min-width:0;max-width:100%;overflow-x:auto" });
      stage.append(wrap, side);
      const c = cap(foot);
      const P = (p) => [W / 2 + G.pos[p][0] * (W / 2 - 64), H / 2 - G.pos[p][1] * (H / 2 - 58)];
      const NR = n >= 7 ? 18 : 21;
      const cen = (() => { let x = 0, y = 0; for (let p = 0; p < n; p++) { const q = P(p); x += q[0] / n; y += q[1] / n; } return [x, y]; })();
      const aggName = () => ({ sum: L("sum", "求和"), mean: L("mean", "平均"), max: L("max", "最大") }[agg]);

      function drawTable(r, ph) {
        side.innerHTML = "";
        const cell = "padding:3px 7px;text-align:right;font-variant-numeric:tabular-nums;border-bottom:1px solid var(--border);white-space:nowrap";
        const head = "padding:3px 7px;text-align:right;color:var(--muted);font-weight:700;border-bottom:1px solid var(--border-2);white-space:nowrap";
        const tb = h("table", { style: "border-collapse:collapse;font-size:13.5px;color:var(--fg);margin:0 auto" });
        const hr = h("tr", {}, h("th", { style: head }, L("node id", "节点 id")));
        if (shuffles) hr.append(h("th", { style: head }, L("was", "原 id")));
        for (let q = 0; q <= R; q++) hr.append(h("th", { style: head + (q === r ? ";color:var(--blue)" : "") }, L(`round ${q}`, `第 ${q} 轮`)));
        tb.append(hr);
        const val = (q, id) => (q <= r ? nf(res.hist[q][id]) : "·");
        for (let id = 0; id < n; id++) {
          const tr = h("tr", {}, h("td", { style: cell + ";font-weight:700" }, String(id + 1)));
          if (shuffles) tr.append(h("td", { style: cell + ";color:var(--muted)" }, String(res.phys[id] + 1)));
          for (let q = 0; q <= R; q++) tr.append(h("td", { style: cell + (q === r ? ";font-weight:700" : "") + (q > r ? ";color:var(--faint)" : "") }, val(q, id)));
          tb.append(tr);
        }
        for (const [name, f] of [["Σᵢ hᵢ", AGG.sum], [L("maxᵢ hᵢ", "maxᵢ hᵢ"), (a) => Math.max(...a)]]) {
          const tr = h("tr", {}, h("td", { style: cell + ";font-weight:700;color:var(--blue)" }, name));
          if (shuffles) tr.append(h("td", { style: cell }, ""));
          for (let q = 0; q <= R; q++) tr.append(h("td", { style: cell + ";color:var(--blue);font-weight:700" }, q <= r ? nf(f(res.hist[q])) : "·"));
          tb.append(tr);
        }
        side.append(tb);
        if (shuffles) {
          const map = Array.from({ length: n }, (_, p) => `${p + 1}→${label[p] + 1}`).join("  ");
          side.append(h("div", { style: "font-size:13px;color:var(--fg-2);margin-top:6px;text-align:center" }, L("relabelling (old id → new id): ", "重新编号（旧 id → 新 id）：") + map));
        }
      }
      function collision(r) {
        if (agg === "sum") return null;
        const got = res.recv[r], a = res.aggs[r];
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
          const A = got[i].slice().sort((x, y) => x - y), B = got[j].slice().sort((x, y) => x - y);
          if (A.join(",") !== B.join(",") && Math.abs(a[i] - a[j]) < 1e-9) return [i, j, A, B, a[i]];
        }
        return null;
      }
      function draw() {
        const C = colors();
        const r = Math.min(R, Math.floor(k / 3)), ph = k >= 3 * R ? 0 : k % 3;
        svg.innerHTML = "";
        for (const [u, v] of G.edges) { const a = P(u), b = P(v); svg.append(ln(a[0], a[1], b[0], b[1], C.border2, 2.2)); }
        const cur = (p) => res.hist[r][label[p]];
        // messages in flight
        if (sending) {
          for (const [u, v] of G.edges) for (const [from, to] of [[u, v], [v, u]]) {
            const a = P(from), b = P(to);
            const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
            const e = 0.5 - 0.5 * Math.cos(Math.PI * t);
            const sx = a[0] + dx * (0.16 + 0.68 * e) - (dy / len) * 8, sy = a[1] + dy * (0.16 + 0.68 * e) + (dx / len) * 8;
            svg.append(s("circle", { cx: sx, cy: sy, r: 11.5, fill: C.v3, stroke: C.surface, "stroke-width": 1.5 }));
            svg.append(txt(sx, sy + 4.2, nf(cur(from), 1), { size: 12, fill: "#fff", anchor: "middle", weight: 700 }));
          }
        }
        for (let p = 0; p < n; p++) {
          const [x, y] = P(p);
          const id = label[p];
          svg.append(s("circle", { cx: x, cy: y, r: NR, fill: C.surface, stroke: C.v1, "stroke-width": 3 }));
          svg.append(txt(x, y + 5.5, nf(cur(p)), { size: 15, fill: C.fg, anchor: "middle", weight: 700 }));
          // id tag, towards the outside of the graph
          let ox = x - cen[0], oy = y - cen[1];
          const ol = Math.hypot(ox, oy);
          const hub = ol < 6;
          if (hub) { ox = 0.7; oy = 0.7; } else { ox /= ol; oy /= ol; }
          // The note goes on the outward side; the id tag takes an upper corner the note does not use.
          const tagLeft = !(ox < -0.25 && oy < 0.1);
          svg.append(txt(x + (tagLeft ? -NR - 6 : NR + 6), y - NR + 1, `i=${id + 1}`, { size: 12.5, fill: C.muted, anchor: "middle", attrs: { stroke: C.surface, "stroke-width": 3, "paint-order": "stroke" } }));
          let note = null, fill = C.v2;
          if (!sending && ph >= 1 && r < R) {
            const got = res.recv[r][id];
            note = `{${got.map((v) => nf(v, 1)).join(", ")}}` + (ph >= 2 ? ` → ${nf(res.aggs[r][id])}` : "");
            fill = ph >= 2 ? C.v2 : C.v3;
          } else if (!sending && ph === 0 && r > 0) note = `+${nf(res.aggs[r - 1][id])}`;
          if (note) {
            const horiz = hub || (Math.abs(ox) > 0.8 && note.length <= 8);
            const nx = hub ? x + NR + 4 : horiz ? x + Math.sign(ox) * (NR + 7) : clamp(x + ox * 14, 8 + note.length * 3.6, W - 8 - note.length * 3.6);
            const ny = hub ? y + NR + 12 : horiz ? y + 5 : oy >= -0.15 ? y + NR + 18 : y - NR - 9;
            svg.append(txt(nx, ny, note, { size: 13, fill, anchor: horiz ? (ox > 0 ? "start" : "end") : "middle", weight: 700, attrs: { stroke: C.surface, "stroke-width": 3, "paint-order": "stroke" } }));
          }
        }
        drawTable(r, ph);
        const rule = `hᵢ ← hᵢ + ${agg}{ hⱼ : j ∈ N(i) }`;
        const sum = AGG.sum(res.hist[r]);
        let line;
        if (sending) line = L(`Round ${r + 1}, step 1 — every node sends its value to each neighbour (message mᵢⱼ = hⱼ).`, `第 ${r + 1} 轮第 1 步——每个节点把自己的值发给每个邻居（消息 mᵢⱼ = hⱼ）。`);
        else if (k >= 3 * R) line = L(`Done: ${R} rounds. After ${R} rounds a node has heard from everything within ${R} edges.`, `完成：共 ${R} 轮。${R} 轮之后，每个节点听到了 ${R} 条边以内的全部信息。`);
        else if (ph === 0) line = L(`Round ${r + 1} of ${R}. Press step: send → aggregate → update.`, `第 ${r + 1} 轮（共 ${R} 轮）。按“单步”：发送 → 聚合 → 更新。`);
        else if (ph === 1) line = L(`Round ${r + 1}, step 1 done — each node holds the multiset of what it received (the order does not matter).`, `第 ${r + 1} 轮第 1 步完成——每个节点手里是一个多重集（收到的值，不分先后）。`);
        else line = L(`Round ${r + 1}, step 2 — aggregate with ${aggName()}; next, add it to the node's own value.`, `第 ${r + 1} 轮第 2 步——用“${aggName()}”聚合；下一步把它加到节点自己的值上。`);
        let extra = "";
        const col = !sending && ph >= 2 && r < R ? collision(r) : null;
        if (col) extra = "<br>" + L(`⚠ Nodes ${col[0] + 1} and ${col[1] + 1} received different multisets {${col[2].map((v) => nf(v, 1)).join(", ")}} and {${col[3].map((v) => nf(v, 1)).join(", ")}} but the same ${agg} ${nf(col[4])}: ${agg} cannot tell them apart (it cannot count).`, `⚠ 节点 ${col[0] + 1} 和 ${col[1] + 1} 收到的多重集不同：{${col[2].map((v) => nf(v, 1)).join(", ")}} 与 {${col[3].map((v) => nf(v, 1)).join(", ")}}，但${aggName()}都是 ${nf(col[4])}：${aggName()}分不清它们（它不会数个数）。`);
        if (shuffles) {
          const fin = label.map((id) => res.hist[R][id]);
          const diff = Math.max(...fin.map((v, p) => Math.abs(v - base.final[p])));
          const sumR = AGG.sum(res.hist[R]);
          extra += "<br>" + L(`Relabelled: the same graph with shuffled ids. Each node kept its values (largest change ${nf(diff, 3)}) — the table rows moved with the ids: <b>equivariant</b>. Readout Σ = ${nf(sumR)} (before: ${nf(base.sum)}), max = ${nf(Math.max(...res.hist[R]))} (before: ${nf(base.max)}): <b>invariant</b>.`, `重新编号：同一张图，只是 id 被打乱。每个节点的值都没变（最大变化 ${nf(diff, 3)}），表格的行跟着 id 换了位置：<b>等变</b>。读出 Σ = ${nf(sumR)}（之前 ${nf(base.sum)}），max = ${nf(Math.max(...res.hist[R]))}（之前 ${nf(base.max)}）：<b>不变</b>。`);
        }
        c.innerHTML = `${rule} · ${L("readout", "读出")} Σᵢ hᵢ = ${nf(sum)} · ${line}${extra}`;
      }
      an = animator(root, (dt) => {
        if (sending) {
          t += dt / 0.9;
          if (t >= 1) { sending = false; t = 0; k++; hold = 0; draw(); return auto; }
          draw(); return true;
        }
        if (!auto) return false;
        hold += dt;
        if (hold < 0.8) return true;
        hold = 0;
        if (k >= 3 * R) { draw(); return false; }
        if (k % 3 === 0) { sending = true; t = 0; } else k++;
        draw();
        return true;
      });
      const play = playButton(an, () => { auto = true; hold = 0.5; if (k >= 3 * R) k = 0; });
      const step = () => {
        if (sending) return;
        play.reset(); auto = false;
        if (k >= 3 * R) return;
        if (k % 3 === 0) { sending = true; t = 0; an.start(); } else { k++; draw(); }
      };
      const reset = () => { play.reset(); sending = false; auto = false; k = 0; draw(); };
      const shuffle = () => {
        play.reset(); sending = false; auto = false;
        const r = rng(seed * 31 + 977 * ++shuffles);
        let perm;
        for (let tries = 0; tries < 20; tries++) {
          perm = Array.from({ length: n }, (_, i) => i);
          for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
          if (perm.some((v, i) => v !== label[i]) && perm.some((v, i) => v !== i)) break;
        }
        label = perm;
        compute();
        k = 3 * R;
        draw();
      };
      ctrls.append(modeSeg(), play, btn("⏭ " + T().step, step), btn("↺ " + T().reset, reset), btn("🔀 " + L("shuffle node ids", "打乱节点编号"), shuffle));
      ctrls.append(seg([["sum", L("sum", "求和")], ["mean", L("mean", "平均")], ["max", L("max", "最大")]], agg, (a) => { agg = a; play.reset(); sending = false; auto = false; computeBase(); k = Math.min(k, 3 * R); draw(); }), graphSeg());
      root.__vizTest = {
        get state() { return { mode, kind, n, agg, R, k, label: label.slice(), h0: h0.slice(), edges: G.edges.map((e) => e.slice()), hist: res.hist.map((a) => a.slice()), finalByPhys: label.map((id) => res.hist[R][id]), base: { ...base, final: base.final.slice() } }; },
        step, reset, shuffle, finish() { sending = false; k = 3 * R; draw(); },
      };
      draw();
    }

    // ---------------------------------------------------------------- egnn
    function buildEGNN() {
      const G = makeGraph(kind, n0, seed);
      const n = G.pos.length;
      const cc = 0.3;
      const init = () => G.pos.map(([x, y]) => [x * 1.55, y * 1.35]);
      let X = init();
      // optional start transform g: `rot` (degrees, −180…180) and `shift` ([x, y], each −1…1); default identity
      const rot0 = Number.isFinite(+cfg.rot) && cfg.rot != null ? clamp(+cfg.rot, -180, 180) : 0;
      const sh0 = Array.isArray(cfg.shift) && cfg.shift.length === 2 && cfg.shift.every((v) => Number.isFinite(+v)) ? cfg.shift.map((v) => clamp(+v, -1, 1)) : [0, 0];
      let ang = (rot0 * Math.PI) / 180, tx = sh0[0], ty = sh0[1], raw = false, drag = -1;
      // One EGNN-style layer on positions (h = 1, v = 0 on input).
      function layer(Xs, useRaw) {
        const out = [], hh = [], vv = [];
        for (let i = 0; i < Xs.length; i++) {
          let dx = 0, dy = 0, hs = 1;
          for (let j = 0; j < Xs.length; j++) {
            if (j === i) continue;
            const ex = Xs[i][0] - Xs[j][0], ey = Xs[i][1] - Xs[j][1];
            const m = 1 / (1 + ex * ex + ey * ey) + (useRaw ? 0.25 * Xs[j][0] : 0);
            dx += cc * ex * m; dy += cc * ey * m; hs += m;
          }
          vv.push([dx, dy]); out.push([Xs[i][0] + dx, Xs[i][1] + dy]); hh.push(hs);
        }
        return { x: out, h: hh, v: vv };
      }
      const act = (p) => { const cs = Math.cos(ang), sn = Math.sin(ang); return [cs * p[0] - sn * p[1] + tx, sn * p[0] + cs * p[1] + ty]; };
      const actInv = (p) => { const cs = Math.cos(ang), sn = Math.sin(ang); const a = p[0] - tx, b = p[1] - ty; return [cs * a + sn * b, -sn * a + cs * b]; };
      function evalAll() {
        const f0 = layer(X, raw);            // f(x)
        const gX = X.map(act);               // g·x
        const f1 = layer(gX, raw);           // f(g·x)
        const gf0 = f0.x.map(act);           // g·f(x)
        const err = Math.max(...f1.x.map((p, i) => Math.hypot(p[0] - gf0[i][0], p[1] - gf0[i][1])));
        const herr = Math.max(...f1.h.map((v, i) => Math.abs(v - f0.h[i])));
        return { f0, gX, f1, gf0, err, herr };
      }
      const svg = s("svg", { class: "viz-svg" });
      svg.style.touchAction = "none";
      svg.style.overflow = "hidden";
      const verdict = h("div", { style: "font-weight:700;font-size:14.5px;margin-bottom:4px" });
      const leg = h("div", {});
      stage.append(h("div", { style: "width:100%;min-width:0" }, verdict, svg, leg));
      const c = cap(foot);
      let W = 660, H = 360, sc = 74;
      const V = (p) => [W / 2 + p[0] * sc, H / 2 - p[1] * sc];
      const Vinv = (q) => [(q[0] - W / 2) / sc, (H / 2 - q[1]) / sc];
      function draw() {
        const C = colors();
        const nar = narrowOf(stage);
        W = nar ? 400 : 660; H = nar ? 380 : 360; sc = nar ? 60 : 74;
        svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
        svg.innerHTML = "";
        const E = evalAll();
        // origin and axes (the raw-coordinate message depends on them)
        const o = V([0, 0]);
        svg.append(ln(0, o[1], W, o[1], C.border, 1), ln(o[0], 0, o[0], H, C.border, 1));
        svg.append(txt(o[0] + 5, o[1] - 5, "O", { size: 12, fill: C.muted }));
        // original input as a ghost
        if (Math.abs(ang) > 1e-9 || Math.abs(tx) > 1e-9 || Math.abs(ty) > 1e-9) {
          for (let i = 0; i < n; i++) { const a = V(X[i]); svg.append(s("circle", { cx: a[0], cy: a[1], r: 7, fill: "none", stroke: C.faint, "stroke-width": 1.6, "stroke-dasharray": "3 3" })); }
        }
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const a = V(E.gX[i]), b = V(E.gX[j]); svg.append(ln(a[0], a[1], b[0], b[1], C.border2, 1.1)); }
        for (let i = 0; i < n; i++) {
          const a = V(E.gX[i]), b = V(E.f1.x[i]), d = V(E.gf0[i]);
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 9) svg.append(arrow(a[0], a[1], b[0], b[1], C.v1, 2.2, 6));
          svg.append(s("circle", { cx: d[0], cy: d[1], r: 11, fill: "none", stroke: C.v3, "stroke-width": 2.4, "stroke-dasharray": "5 4" }));
          svg.append(s("circle", { cx: b[0], cy: b[1], r: 5.5, fill: C.v1 }));
          svg.append(s("circle", { cx: a[0], cy: a[1], r: 9, fill: C.surface, stroke: C.fg2, "stroke-width": 2.4 }));
          svg.append(txt(a[0], a[1] - 14, String(i + 1), { size: 12.5, fill: C.fg2, anchor: "middle" }));
        }
        leg.innerHTML = "";
        leg.append(legend([[L("input g·x (drag a node)", "输入 g·x（可拖动节点）"), C.fg2], [L("f(g·x): the layer applied to the moved input", "f(g·x)：对移动后的输入算一层"), C.v1], [L("g·f(x): the original output, moved (dashed ring)", "g·f(x)：把原来的输出移动过去（虚线圈）"), C.v3, true], [L("x before g (faint)", "作用 g 之前的 x（淡色）"), C.faint, true]]));
        const ok = E.err < 1e-9;
        verdict.style.color = ok ? C.v2 : C.v4;
        verdict.textContent = ok ? L("Equivariant: f(g·x) and g·f(x) coincide", "等变：f(g·x) 与 g·f(x) 完全重合") : L("Not equivariant: f(g·x) and g·f(x) separate", "不等变：f(g·x) 与 g·f(x) 分开了");
        const msg = "mᵢⱼ = 1/(1 + ‖xᵢ − xⱼ‖²)" + (raw ? L(" + 0.25·(x-coordinate of xⱼ)", " + 0.25·（xⱼ 的 x 坐标）") : "");
        const hs = E.f1.h.slice(0, 5).map((v) => nf(v)).join(", ") + (n > 5 ? ", …" : "");
        c.innerHTML = `${msg} · xᵢ′ = xᵢ + 0.3·Σⱼ (xᵢ − xⱼ)·mᵢⱼ · hᵢ′ = 1 + Σⱼ mᵢⱼ (j ≠ i)<br>`
          + `g = ${L("rotate", "旋转")} ${nf((ang * 180) / Math.PI, 0)}°, ${L("translate", "平移")} (${nf(tx)}, ${nf(ty)}) · maxᵢ ‖f(g·x)ᵢ − g·f(x)ᵢ‖ = <b>${n3(E.err)}</b> · h′ = [${hs}], maxᵢ |h′(g·x) − h′(x)| = <b>${n3(E.herr)}</b><br>`
          + (raw ? L("The message now also reads an absolute coordinate, so it changes when the cloud is moved: positions no longer follow, and h′ is no longer invariant.", "消息里现在多用了一个绝对坐标，点云一移动消息就变：位置输出不再跟着走，h′ 也不再不变。")
            : L("Messages use only distances (invariant); positions move along relative vectors xᵢ − xⱼ (which rotate with the input). So positions come out equivariant and h′ invariant, for every rotation and translation.", "消息只用距离（不变量）；位置沿相对向量 xᵢ − xⱼ 移动（它们跟着输入一起转）。所以对任何旋转和平移，位置输出等变，h′ 不变。"));
      }
      const pick = (ev) => { const q = toView(svg, ev, W, H); const E = evalAll(); let best = -1, bd = 26; E.gX.forEach((p, i) => { const a = V(p); const d = Math.hypot(a[0] - q[0], a[1] - q[1]); if (d < bd) { bd = d; best = i; } }); return best; };
      svg.addEventListener("pointerdown", (ev) => { drag = pick(ev); if (drag >= 0) { svg.setPointerCapture(ev.pointerId); ev.preventDefault(); } });
      svg.addEventListener("pointermove", (ev) => {
        if (drag < 0) return;
        const q = toView(svg, ev, W, H);
        const w = Vinv([clamp(q[0], 10, W - 10), clamp(q[1], 10, H - 10)]);
        X[drag] = actInv(w);
        draw();
      });
      const end = () => { drag = -1; };
      svg.addEventListener("pointerup", end);
      svg.addEventListener("pointercancel", end);
      const sA = wide(slider(L("rotate input (°)", "旋转输入（°）"), { min: -180, max: 180, value: rot0, step: 1 }, (v) => { ang = (v * Math.PI) / 180; draw(); }));
      const sX = wide(slider(L("translate x", "平移 x"), { min: -1, max: 1, value: tx, step: 0.01 }, (v) => { tx = v; draw(); }));
      const sY = wide(slider(L("translate y", "平移 y"), { min: -1, max: 1, value: ty, step: 0.01 }, (v) => { ty = v; draw(); }));
      const rawSeg = seg([["rel", L("distances only", "只用距离")], ["raw", L("use raw coordinates in the message", "消息里用原始坐标")]], "rel", (v) => { raw = v === "raw"; draw(); });
      const reset = () => { X = init(); ang = (rot0 * Math.PI) / 180; tx = sh0[0]; ty = sh0[1]; sA.set(rot0); sX.set(tx); sY.set(ty); draw(); };
      ctrls.append(modeSeg(), rawSeg, btn("↺ " + T().reset, reset), graphSeg(), sA, sX, sY);
      root.__vizTest = {
        get state() { const E = evalAll(); return { mode, kind, n, raw, ang, tx, ty, err: E.err, herr: E.herr, X: X.map((p) => p.slice()) }; },
        set(o) { if (o.ang != null) ang = o.ang; if (o.tx != null) tx = o.tx; if (o.ty != null) ty = o.ty; if (o.raw != null) raw = !!o.raw; if (o.X) X = o.X.map((p) => p.slice()); sA.set((ang * 180) / Math.PI); sX.set(tx); sY.set(ty); draw(); },
        layer,
      };
      draw();
    }
    build();
  });

  // ================================================================== slotattn
  Viz.register("slotattn", (root, cfg) => {
    const { stage, ctrls, foot } = shell(root, cfg);
    let nObj = int(cfg.objects, 2, 5, 3), K = int(cfg.slots, 2, 6, 3);
    const iters = int(cfg.iters, 1, 30, 5);
    let norm = cfg.normalize === "inputs" ? "inputs" : "slots";
    let temp = Number.isFinite(+cfg.temperature) && +cfg.temperature > 0 ? clamp(+cfg.temperature, 0.2, 5) : 1;
    const seed = int(cfg.seed, 0, 1e6, 1);
    let slotSeed = 0; // advanced by "re-sample slots"
    const N = 60;
    let pts, owner, blobs, tau0, mean;
    let S, trail, attn, it, prevAssign = null, anim = 0, from = null;
    const svg = s("svg", { class: "viz-svg" });
    stage.append(svg);
    const c = cap(foot);
    const names = "ABCDE";

    function makeData() {
      const r = rng(seed * 2654435 + 17 + nObj * 101);
      const rot = r() * Math.PI * 2;
      const w = [1, 0.75, 0.55, 0.45, 0.4].slice(0, nObj);
      const wsum = w.reduce((a, b) => a + b, 0);
      const counts = w.map((v) => Math.max(5, Math.round((N * v) / wsum)));
      counts[0] += N - counts.reduce((a, b) => a + b, 0);
      blobs = []; pts = []; owner = [];
      for (let b = 0; b < nObj; b++) {
        const a = rot + (2 * Math.PI * b) / nObj + (r() - 0.5) * 0.35;
        const rad = nObj === 2 ? 0.5 : 0.6 + (r() - 0.5) * 0.12;
        const sd = 0.085 + 0.045 * (w[b] / w[0]);
        const cx = rad * Math.cos(a), cy = rad * Math.sin(a);
        let mx = 0, my = 0;
        for (let q = 0; q < counts[b]; q++) { const p = [cx + sd * randn(r), cy + sd * randn(r)]; pts.push(p); owner.push(b); mx += p[0] / counts[b]; my += p[1] / counts[b]; }
        blobs.push({ c: [mx, my], sd, n: counts[b] });
      }
      mean = [0, 0];
      for (const p of pts) { mean[0] += p[0] / pts.length; mean[1] += p[1] / pts.length; }
      const rms = Math.sqrt(pts.reduce((a, p) => a + (p[0] - mean[0]) ** 2 + (p[1] - mean[1]) ** 2, 0) / pts.length);
      tau0 = (0.25 * rms) ** 2; // data-scaled temperature constant
    }
    function initSlots() {
      const r = rng(seed * 7717 + 3 + 1009 * slotSeed);
      S = Array.from({ length: K }, () => [mean[0] + 0.3 * randn(r), mean[1] + 0.3 * randn(r)]);
      trail = S.map((p) => [p.slice()]);
      it = 0; anim = 0; from = null;
      attn = attention(S);
    }
    // attn[i][k]; normalize over slots (Slot Attention) or over inputs (ordinary cross-attention).
    function attention(Sl) {
      const tau = temp * tau0;
      const lg = pts.map((p) => Sl.map((q) => -((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2) / (2 * tau)));
      const A = pts.map(() => new Array(Sl.length).fill(0));
      if (norm === "slots") {
        lg.forEach((row, i) => { const m = Math.max(...row); const e = row.map((v) => Math.exp(v - m)); const z = e.reduce((a, b) => a + b, 0); e.forEach((v, k) => (A[i][k] = v / z)); });
      } else {
        for (let k = 0; k < Sl.length; k++) { let m = -Infinity; for (const row of lg) m = Math.max(m, row[k]); let z = 0; const e = lg.map((row) => { const v = Math.exp(row[k] - m); z += v; return v; }); e.forEach((v, i) => (A[i][k] = v / z)); }
      }
      return A;
    }
    function iterate() {
      const A = attention(S);
      const next = S.map((q, k) => {
        let z = 0, x = 0, y = 0;
        A.forEach((row, i) => { z += row[k]; x += row[k] * pts[i][0]; y += row[k] * pts[i][1]; });
        return z > 1e-12 ? [x / z, y / z] : q.slice();
      });
      from = S; S = next; it++;
      S.forEach((p, k) => trail[k].push(p.slice()));
      attn = attention(S);
    }
    const nearestBlob = (q) => { let best = 0, bd = Infinity; blobs.forEach((b, j) => { const d = Math.hypot(q[0] - b.c[0], q[1] - b.c[1]); if (d < bd) { bd = d; best = j; } }); return [best, bd]; };
    const assignment = () => S.map((q) => nearestBlob(q)[0]);
    const covered = () => blobs.map((b) => Math.min(...S.map((q) => Math.hypot(q[0] - b.c[0], q[1] - b.c[1]))) <= 2 * b.sd);
    // what "objects covered k / n" counts, said on the figure
    const coveredNote = () => L("An object counts as covered when some slot's centre is within 2σ of the object's centre (σ: its spread).", "某个 slot 的中心落在物体中心 2σ 以内（σ：该物体的散布），这个物体就算被找到。");
    const mass = () => S.map((_, k) => attn.reduce((a, row) => a + row[k], 0));
    const assignStr = (as) => as.map((b, k) => `s${sub(k + 1)}→${names[b]}`).join(", ");

    function draw() {
      const C = colors(), P = pal();
      const nar = narrowOf(stage);
      const PW = 400, PH = 340, W = nar ? 400 : 660, H = nar ? 340 + 32 + K * 26 + 12 + 20 + 17 * wrapText(coveredNote(), 384, 13, 500, 3).length + 6 : 340;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.innerHTML = "";
      const sc = 150;
      const V = (p) => [PW / 2 + p[0] * sc, PH / 2 - p[1] * sc];
      svg.append(s("rect", { x: 1, y: 1, width: PW - 2, height: PH - 2, rx: 8, fill: C.cell, stroke: C.border }));
      // object labels
      blobs.forEach((b, j) => {
        const a = V(b.c); const dx = b.c[0] - mean[0], dy = b.c[1] - mean[1], l = Math.hypot(dx, dy) || 1;
        svg.append(txt(clamp(a[0] + (dx / l) * (b.sd * 2.4 * sc + 12), 14, PW - 14), clamp(a[1] - (dy / l) * (b.sd * 2.4 * sc + 12) + 5, 16, PH - 8), names[j], { size: 14, fill: C.muted, anchor: "middle", weight: 700 }));
      });
      // inputs coloured by their attention mixture
      const cols = P.slice(0, K).map(rgb);
      pts.forEach((p, i) => {
        const row = attn[i];
        let z = row.reduce((a, b) => a + b, 0);
        let col = C.faint, op = 0.9;
        if (norm === "slots" || z > 1e-9) {
          const mx = [0, 0, 0];
          row.forEach((v, k) => { for (let ch = 0; ch < 3; ch++) mx[ch] += (v / (z || 1)) * cols[k][ch]; });
          col = `rgb(${mx.map(Math.round).join(",")})`;
          if (norm === "inputs") { const big = Math.max(...row) * pts.length; op = clamp(0.25 + 0.75 * Math.min(1, big / 2), 0.25, 1); }
        }
        const a = V(p);
        svg.append(s("circle", { cx: a[0], cy: a[1], r: 4.6, fill: col, "fill-opacity": op, stroke: C.surface, "stroke-width": 0.8 }));
      });
      // slot trails and crosses
      const e = from && anim < 1 ? 0.5 - 0.5 * Math.cos(Math.PI * anim) : 1;
      S.forEach((q, k) => {
        const tr = trail[k];
        const cur = from && anim < 1 ? [from[k][0] + (q[0] - from[k][0]) * e, from[k][1] + (q[1] - from[k][1]) * e] : q;
        const ptsTr = (from && anim < 1 ? tr.slice(0, -1).concat([cur]) : tr).map(V);
        if (ptsTr.length > 1) svg.append(s("path", { d: ptsTr.map((p, j) => `${j ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(""), fill: "none", stroke: P[k], "stroke-width": 1.8, "stroke-opacity": 0.75, "stroke-dasharray": "4 3" }));
        const a0 = V(tr[0]);
        svg.append(s("circle", { cx: a0[0], cy: a0[1], r: 3, fill: "none", stroke: P[k], "stroke-width": 1.5 }));
        const a = V(cur);
        const x = clamp(a[0], 10, PW - 10), y = clamp(a[1], 10, PH - 10);
        svg.append(s("path", { d: `M${x - 9},${y - 9}L${x + 9},${y + 9}M${x - 9},${y + 9}L${x + 9},${y - 9}`, stroke: C.surface, "stroke-width": 7, "stroke-linecap": "round" }));
        svg.append(s("path", { d: `M${x - 9},${y - 9}L${x + 9},${y + 9}M${x - 9},${y + 9}L${x + 9},${y - 9}`, stroke: P[k], "stroke-width": 4, "stroke-linecap": "round" }));
        svg.append(txt(clamp(x + 13, 12, PW - 26), clamp(y - 10, 14, PH - 6), `s${sub(k + 1)}`, { size: 13, fill: P[k], weight: 700, attrs: { stroke: C.surface, "stroke-width": 3, "paint-order": "stroke" } }));
      });
      svg.append(txt(12, 20, L(`iteration ${it}`, `第 ${it} 次迭代`), { size: 13, fill: C.fg2, weight: 700 }));
      // readout panel: mass per slot
      const px = nar ? 8 : PW + 18, py = nar ? PH + 24 : 26, pw = nar ? W - 16 : W - PW - 26;
      const fs = nar ? 15 : 13, rh = nar ? 26 : 24;
      const m = mass();
      const mmax = norm === "slots" ? pts.length : 1;
      svg.append(txt(px, py, norm === "slots" ? L("mass per slot  Σᵢ attnᵢₖ", "每个 slot 的质量  Σᵢ attnᵢₖ") : L("Σᵢ attnᵢₖ = 1 for every slot", "每个 slot 都有 Σᵢ attnᵢₖ = 1"), { size: fs, fill: C.fg2, weight: 700 }));
      const as = assignment();
      S.forEach((_, k) => {
        const y = py + 12 + k * rh;
        const bw = pw - (nar ? 130 : 118);
        svg.append(txt(px, y + 14, `s${sub(k + 1)}`, { size: fs, fill: P[k], weight: 700 }));
        svg.append(s("rect", { x: px + 26, y: y + 2, width: bw, height: 15, rx: 3, fill: C.cell, stroke: C.border }));
        svg.append(s("rect", { x: px + 26, y: y + 2, width: Math.max(1, (bw * m[k]) / mmax), height: 15, rx: 3, fill: P[k] }));
        svg.append(txt(px + 26 + bw + 7, y + 14.5, `${nf(m[k], 1)}  → ${names[as[k]]}`, { size: fs - 0.5, fill: C.fg2 }));
      });
      if (!nar) {
        const cv = covered(), nc = cv.filter(Boolean).length;
        const y0 = py + 12 + K * rh + 24;
        svg.append(txt(px, y0, L(`objects covered: ${nc} / ${nObj}`, `找到的物体：${nc} / ${nObj}`), { size: 14, fill: nc === nObj ? C.v2 : C.v4, weight: 700 }));
        svg.append(txt(px, y0 + 20, norm === "slots" ? L("softmax over slots:", "对 slot 做 softmax：") : L("softmax over inputs:", "对输入做 softmax："), { size: 12.5, fill: C.muted }));
        svg.append(txt(px, y0 + 37, norm === "slots" ? L("slots compete for inputs", "slot 之间争夺输入") : L("no competition", "没有竞争"), { size: 12.5, fill: C.muted }));
        svg.append(svgLines({ x: px, y: y0 + 64, "font-size": 12, fill: C.muted, "font-weight": 500 }, wrapText(coveredNote(), pw, 12, 500, 4), 16));
      } else {
        // narrow: the same read-out under the mass bars
        const cv = covered(), nc = cv.filter(Boolean).length, y0 = py + 12 + K * rh + 22;
        svg.append(txt(px, y0, L(`objects covered: ${nc} / ${nObj}`, `找到的物体：${nc} / ${nObj}`), { size: fs, fill: nc === nObj ? C.v2 : C.v4, weight: 700 }));
        svg.append(svgLines({ x: px, y: y0 + 20, "font-size": 13, fill: C.muted, "font-weight": 500 }, wrapText(coveredNote(), pw, 13, 500, 3), 17));
      }
      caption();
    }
    function caption() {
      const cv = covered(), nc = cv.filter(Boolean).length;
      const as = assignment();
      const law = norm === "slots"
        ? `attnᵢₖ = softmaxₖ(−‖xᵢ − sₖ‖²/2τ) · sₖ ← Σᵢ attnᵢₖ xᵢ / Σᵢ attnᵢₖ`
        : `attnᵢₖ = softmaxᵢ(−‖xᵢ − sₖ‖²/2τ) · sₖ ← Σᵢ attnᵢₖ xᵢ`;
      let line = `${law} · τ = ${nf(temp)} × ${nf(tau0, 3)} · ${L("iteration", "迭代")} ${it} · ${L("objects covered", "找到的物体")} <b>${nc}/${nObj}</b> · ${assignStr(as)}`;
      if (prevAssign) line += "<br>" + L(`Before re-sampling: ${assignStr(prevAssign)}. Same objects, different slot order when both runs cover them — slots are a set, their order carries no meaning.`, `重新采样之前：${assignStr(prevAssign)}。两次都找全时，找到的是同样的物体，只是 slot 的顺序不同——slot 是一个集合，顺序没有含义。`);
      let note;
      const dup = as.some((b, k) => as.indexOf(b) !== k);
      if (norm === "inputs") note = L("Ordinary attention (softmax over inputs): each slot looks for its own favourite inputs and nothing stops two slots from choosing the same object, so objects are left out.", "普通注意力（对输入做 softmax）：每个 slot 各找各的，没有什么能阻止两个 slot 选中同一个物体，于是有物体被漏掉。");
      else if (K > nObj) note = L("More slots than objects: an object is split between slots, or a slot is left with almost no mass (over-segmentation / empty slots).", "slot 比物体多：有的物体被几个 slot 瓜分，或者有 slot 几乎拿不到质量（过分割 / 空 slot）。");
      else if (K < nObj) note = L("Fewer slots than objects: one slot has to cover two objects and sits between them (merging).", "slot 比物体少：有一个 slot 只好同时负责两个物体，停在它们中间（合并）。");
      else if (it >= 3 && nc < nObj && dup) note = L("This start got stuck: two slots share one object and another slot covers two. Soft clustering has such local optima; re-sample the slots.", "这次初始化卡住了：两个 slot 共用一个物体，另一个 slot 同时盖住两个。软聚类有这种局部最优；重新采样 slot 再试。");
      else note = L("Softmax over slots makes the slots compete: an input's attention sums to 1 across slots, so an object taken by one slot is not available to the others. This is the geometric skeleton — the real model uses dot-product attention with learned projections and a GRU update.", "对 slot 做 softmax 让 slot 互相竞争：每个输入在各 slot 上的注意力加起来是 1，被一个 slot 拿走的物体，别的 slot 就拿不到。这里只画了几何骨架——真实模型用带可学习投影的点积注意力，并用 GRU 更新。");
      c.innerHTML = line + "<br>" + note;
    }
    let playing = false, hold = 0;
    const an = animator(root, (dt) => {
      if (from && anim < 1) { anim += dt / 0.45; if (anim >= 1) { anim = 1; from = null; hold = 0; draw(); return playing && it < iters; } draw(); return true; }
      if (!playing) return false;
      hold += dt;
      if (hold < 0.35) return true;
      if (it >= iters) { playing = false; return false; }
      iterate(); anim = 0; draw();
      return true;
    });
    const play = playButton(an, () => { playing = true; hold = 0.3; if (it >= iters) { initSlots(); draw(); } });
    const stopPlay = () => { play.reset(); playing = false; if (from) { anim = 1; from = null; } };
    const step = () => { stopPlay(); iterate(); anim = 0; draw(); an.start(); };
    const reset = () => { stopPlay(); initSlots(); draw(); };
    const converge = () => { for (let q = 0; q < 60; q++) iterate(); anim = 1; from = null; };
    const resample = () => {
      stopPlay();
      // compare converged runs: finish the current one, remember its assignment, start the next
      while (it < iters) iterate();
      prevAssign = assignment();
      slotSeed++;
      initSlots();
      draw();
      play.click();
    };
    const rebuild = () => { stopPlay(); prevAssign = null; makeData(); initSlots(); draw(); };
    ctrls.append(play, btn("⏭ " + T().step, step), btn("↺ " + T().reset, reset), btn("🎲 " + L("re-sample slots", "重新采样 slot"), resample));
    ctrls.append(seg([["slots", L("softmax over slots", "对 slot 归一化")], ["inputs", L("softmax over inputs", "对输入归一化")]], norm, (v) => { norm = v; stopPlay(); prevAssign = null; initSlots(); draw(); }));
    ctrls.append(
      wide(slider(L("slots K", "slot 数 K"), { min: 2, max: 6, value: K, step: 1 }, (v) => { K = Math.round(v); stopPlay(); prevAssign = null; initSlots(); draw(); })),
      wide(slider(L("objects", "物体数"), { min: 2, max: 5, value: nObj, step: 1 }, (v) => { nObj = Math.round(v); rebuild(); })),
      wide(slider(L("temperature", "温度"), { min: 0.2, max: 5, value: temp }, (v) => { temp = v; attn = attention(S); draw(); }, true)));
    root.__vizTest = {
      get state() { return { K, nObj, norm, temp, it, iters, slotSeed, S: S.map((p) => p.slice()), blobs: blobs.map((b) => ({ c: b.c.slice(), sd: b.sd, n: b.n })), covered: covered(), assign: assignment(), mass: mass(), rowSums: attn.slice(0, 5).map((r) => r.reduce((a, b) => a + b, 0)), tau0 }; },
      step() { stopPlay(); iterate(); anim = 1; from = null; draw(); },
      converge() { stopPlay(); converge(); draw(); },
      setSlotSeed(v) { stopPlay(); slotSeed = v; prevAssign = null; initSlots(); draw(); },
      setNorm(v) { norm = v; stopPlay(); initSlots(); draw(); },
      reset, resample,
    };
    makeData();
    initSlots();
    draw();
  });
})();
