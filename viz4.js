"use strict";
// Algorithm visualisers: `trace` (authored step-by-step execution on arrays, grids,
// trees, graphs, linked lists) and `dptable` (DP table fill with dependencies).
// Step notes and the DP formula arrive pre-rendered (Markdown + KaTeX) from the build.
(() => {
  if (!window.Viz) return;
  const { h, s, cssv, pal, mix, clamp, T, animator, shell, slider, btn, playButton, arrowPath } = Viz.util;
  const zh = () => (document.documentElement.lang || "").startsWith("zh");
  const L = (en, cn) => (zh() ? cn : en);
  const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const has = (list, v) => (list || []).some((x) => (Array.isArray(x) && Array.isArray(v) ? x[0] === v[0] && x[1] === v[1] : x === v));

  function stepper(root, n, onShow, interval = 1.3) {
    let i = 0;
    const dots = h("span", { class: "viz-dots" });
    const show = (k) => { i = clamp(k, 0, n - 1); dots.innerHTML = ""; for (let j = 0; j < n; j++) dots.append(h("button", { type: "button", class: j === i ? "on" : "", onclick: () => { play.reset(); show(j); } })); onShow(i); };
    let acc = 0;
    const an = animator(root, (dt) => { acc += dt; if (acc > interval) { acc = 0; if (i >= n - 1) return false; show(i + 1); } });
    const play = playButton(an, () => { acc = 0; if (i >= n - 1) show(0); });
    const ctr = [btn("‹", () => { play.reset(); show(i - 1); }), play, btn("›", () => { play.reset(); show(i + 1); }), dots];
    return { ctr, show, get i() { return i; } };
  }

  // ================================================================== trace
  Viz.register("trace", (root, cfg) => {
    const { stage: st, ctrls, foot } = shell(root, cfg);
    const kind = cfg.kind || "array";
    const steps = cfg.steps || [{ note: "" }];
    const svg = s("svg", { class: "viz-svg" });
    const aux = h("div", { class: "trace-aux" });
    const wrap = h("div", { class: "tf-wrap" });
    wrap.append(svg, aux);
    st.append(wrap);
    const cap = h("div", { class: "viz-caption" });
    foot.append(cap);
    const colors = pal();
    // State at step k: per-field "latest value so far" for data / links, current value for the rest.
    const stateAt = (k) => {
      let data = cfg.data, links = cfg.links;
      for (let j = 0; j <= k; j++) { if (steps[j].data) data = steps[j].data; if (steps[j].links) links = steps[j].links; }
      return { ...steps[k], data, links };
    };
    const fillFor = (S, key) => (has(S.hl, key) ? mix(cssv("--viz-cell"), cssv("--v3"), 0.75) : has(S.path, key) ? mix(cssv("--viz-cell"), cssv("--v5"), 0.6) : has(S.done, key) ? mix(cssv("--viz-cell"), cssv("--v2"), 0.55) : has(S.frontier, key) ? mix(cssv("--viz-cell"), cssv("--v1"), 0.35) : cssv("--viz-cell"));
    const textCol = (S, key) => (has(S.hl, key) || has(S.done, key) || has(S.path, key) ? "#fff" : cssv("--fg"));
    function ptrLabels(S, keyOf) {
      const out = {};
      for (const [name, at] of Object.entries(S.ptr || {})) { const k = keyOf(at); (out[k] ||= []).push(name); }
      return out;
    }
    function drawArray(S) {
      const a = S.data || [], n = a.length;
      const cs = clamp(Math.floor(600 / Math.max(n, 1)), 30, 56), x0 = 20, y0 = 44;
      const W = x0 * 2 + n * cs, H = 150;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      if (S.window) { const [l, r] = S.window; svg.append(s("path", { d: `M${x0 + l * cs + 2},${y0 - 8} V${y0 - 16} H${x0 + (r + 1) * cs - 4} V${y0 - 8}`, fill: "none", stroke: colors[4], "stroke-width": 3 })); svg.append(s("text", { x: x0 + ((l + r + 1) * cs) / 2, y: y0 - 22, "text-anchor": "middle", class: "tick", fill: colors[4] }, L("window", "窗口"))); }
      a.forEach((v, i) => {
        svg.append(s("rect", { x: x0 + i * cs, y: y0, width: cs - 4, height: cs - 4, rx: 6, fill: fillFor(S, i), stroke: cssv("--border-2") }));
        svg.append(s("text", { x: x0 + i * cs + (cs - 4) / 2, y: y0 + (cs - 4) / 2 + 5, "text-anchor": "middle", class: "label strong", style: `fill:${textCol(S, i)};font-size:${cs > 40 ? 15 : 12}px` }, String(v ?? "")));
        svg.append(s("text", { x: x0 + i * cs + (cs - 4) / 2, y: y0 + cs + 10, "text-anchor": "middle", class: "tick" }, i));
      });
      const P = ptrLabels(S, (at) => at);
      for (const [k, names] of Object.entries(P)) names.forEach((nm, j) => { const cx = x0 + +k * cs + (cs - 4) / 2, yy = y0 + cs + 22 + j * 18; svg.append(s("path", { d: arrowPath(cx, yy + 8, cx, y0 + cs + 14, 5), class: "garrow" })); svg.append(s("text", { x: cx, y: yy + 20, "text-anchor": "middle", class: "label strong", fill: colors[0] }, nm)); });
    }
    function drawGrid(S) {
      const g = S.data || [[]], R = g.length, C = g[0].length;
      const cs = clamp(Math.floor(520 / Math.max(R, C)), 22, 46), x0 = 16, y0 = 16;
      svg.setAttribute("viewBox", `0 0 ${x0 * 2 + C * cs} ${y0 * 2 + R * cs + 6}`);
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const v = g[r][c], key = [r, c], wall = v === "#" || v === "X";
        svg.append(s("rect", { x: x0 + c * cs, y: y0 + r * cs, width: cs - 2, height: cs - 2, rx: 4, fill: wall ? cssv("--fg-2") : fillFor(S, key) }));
        if (!wall && v !== "" && v != null) svg.append(s("text", { x: x0 + c * cs + cs / 2 - 1, y: y0 + r * cs + cs / 2 + 4, "text-anchor": "middle", class: "cell", style: `fill:${textCol(S, key)}` }, String(v)));
      }
      for (const [nm, at] of Object.entries(S.ptr || {})) svg.append(s("text", { x: x0 + at[1] * cs + cs / 2, y: y0 + at[0] * cs + 11, "text-anchor": "middle", class: "label strong", fill: colors[3], style: "font-size:10px" }, nm));
    }
    function drawTree(S) {
      const a = S.data || [];
      const depth = Math.max(1, Math.ceil(Math.log2(a.length + 1)));
      const W = Math.max(360, 2 ** (depth - 1) * 56), lh = 64;
      svg.setAttribute("viewBox", `0 0 ${W} ${depth * lh + 20}`);
      const pos = (i) => { const d = Math.floor(Math.log2(i + 1)), k = i - (2 ** d - 1), n = 2 ** d; return [((k + 0.5) / n) * W, 28 + d * lh]; };
      a.forEach((v, i) => { if (v == null || i === 0) return; const p = Math.floor((i - 1) / 2); if (a[p] == null) return; const [x1, y1] = pos(p), [x2, y2] = pos(i); svg.append(s("line", { x1, y1, x2, y2, stroke: has(S.ehl, [p, i]) ? colors[2] : cssv("--border-2"), "stroke-width": has(S.ehl, [p, i]) ? 3.5 : 2 })); });
      a.forEach((v, i) => { if (v == null) return; const [x, y] = pos(i); svg.append(s("circle", { cx: x, cy: y, r: 17, fill: fillFor(S, i), stroke: cssv("--fg-2"), "stroke-width": 1.5 })); svg.append(s("text", { x, y: y + 5, "text-anchor": "middle", class: "label strong", style: `fill:${textCol(S, i)}` }, String(v))); });
      for (const [nm, at] of Object.entries(S.ptr || {})) { const [x, y] = pos(at); svg.append(s("text", { x: x + 20, y: y - 14, class: "label strong", fill: colors[0] }, nm)); }
    }
    function drawGraph(S) {
      const nodes = S.data || [], n = nodes.length, W = 440, H = 360;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const P = (i) => (cfg.pos ? [30 + cfg.pos[i][0] * (W - 60), 30 + cfg.pos[i][1] * (H - 60)] : [W / 2 + 150 * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), H / 2 + 140 * Math.sin((2 * Math.PI * i) / n - Math.PI / 2)]);
      for (const [u, v, wgt] of cfg.edges || []) {
        const [x1, y1] = P(u), [x2, y2] = P(v), hot = has(S.ehl, [u, v]) || (!cfg.directed && has(S.ehl, [v, u]));
        const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, r = 19;
        const a1 = [x1 + (dx / d) * r, y1 + (dy / d) * r], a2 = [x2 - (dx / d) * r, y2 - (dy / d) * r];
        svg.append(s("path", { d: cfg.directed ? arrowPath(a1[0], a1[1], a2[0], a2[1], 8) : `M${a1[0]},${a1[1]}L${a2[0]},${a2[1]}`, stroke: hot ? colors[2] : cssv("--faint"), "stroke-width": hot ? 3.5 : 2, fill: "none" }));
        if (wgt != null) svg.append(s("text", { x: (x1 + x2) / 2 + 6, y: (y1 + y2) / 2 - 6, class: "tick" }, wgt));
      }
      nodes.forEach((lab, i) => { const [x, y] = P(i); svg.append(s("circle", { cx: x, cy: y, r: 18, fill: fillFor(S, i), stroke: cssv("--fg-2"), "stroke-width": 1.5 })); svg.append(s("text", { x, y: y + 5, "text-anchor": "middle", class: "label strong", style: `fill:${textCol(S, i)}` }, String(lab))); });
      for (const [nm, at] of Object.entries(S.ptr || {})) { const [x, y] = P(at); svg.append(s("text", { x: x + 21, y: y - 16, class: "label strong", fill: colors[0] }, nm)); }
    }
    function drawList(S) {
      const a = S.data || [], n = a.length, cs = 78, x0 = 30, y0 = 60;
      svg.setAttribute("viewBox", `0 0 ${x0 * 2 + n * cs + 40} 190`);
      const links = S.links || a.map((_, i) => (i + 1 < n ? i + 1 : null));
      a.forEach((v, i) => {
        const x = x0 + i * cs;
        svg.append(s("rect", { x, y: y0, width: 46, height: 36, rx: 6, fill: fillFor(S, i), stroke: cssv("--fg-2"), "stroke-width": 1.5 }));
        svg.append(s("text", { x: x + 23, y: y0 + 23, "text-anchor": "middle", class: "label strong", style: `fill:${textCol(S, i)}` }, String(v)));
        const nx = links[i];
        if (nx == null) { svg.append(s("text", { x: x + 23, y: y0 - 10, "text-anchor": "middle", class: "tick" }, "→ null")); return; }
        const tx = x0 + nx * cs;
        if (nx > i) svg.append(s("path", { d: arrowPath(x + 46, y0 + 18, tx - 2, y0 + 18, 7), class: "garrow" }));
        else svg.append(s("path", { d: `M${x + 10},${y0 + 36} C${x + 10},${y0 + 80} ${tx + 36},${y0 + 80} ${tx + 36},${y0 + 40}`, fill: "none", stroke: colors[3], "stroke-width": 2 })), svg.append(s("path", { d: arrowPath(tx + 36, y0 + 52, tx + 36, y0 + 38, 7), stroke: colors[3], "stroke-width": 2, fill: "none" }));
      });
      const P = ptrLabels(S, (at) => at);
      for (const [k, names] of Object.entries(P)) names.forEach((nm, j) => { const x = k === "null" ? x0 + n * cs : x0 + +k * cs + 23; svg.append(s("text", { x, y: y0 + 100 + j * 16, "text-anchor": "middle", class: "label strong", fill: colors[0] }, nm)); });
    }
    function show(k) {
      const S = stateAt(k);
      svg.innerHTML = "";
      ({ array: drawArray, grid: drawGrid, tree: drawTree, graph: drawGraph, list: drawList })[kind](S);
      aux.innerHTML = S.aux ? Object.entries(S.aux).map(([k2, v]) => `<div><b>${esc(k2)}</b> <code>${esc(v)}</code></div>`).join("") : "";
      aux.style.display = S.aux ? "" : "none";
      cap.innerHTML = `<b>${k + 1}/${steps.length}</b> ${S.note || ""}`;
    }
    const sp = stepper(root, steps.length, show, cfg.interval || 1.3);
    ctrls.append(...sp.ctr);
    sp.show(0);
  });

  // ================================================================== dptable
  Viz.register("dptable", (root, cfg) => {
    const { stage: st, ctrls, foot } = shell(root, cfg);
    const V = cfg.values, R = V.length, C = V[0].length;
    const deps = cfg.deps || [[-1, 0], [0, -1], [-1, -1]];
    const order = [];
    if (cfg.order === "col-major") { for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) order.push([r, c]); }
    else if (cfg.order === "diag") { for (let d = 0; d < R + C - 1; d++) for (let r = 0; r < R; r++) { const c = d - r; if (c >= 0 && c < C) order.push([r, c]); } }
    else for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) order.push([r, c]);
    const path = cfg.path || [];
    const svg = s("svg", { class: "viz-svg" });
    st.append(svg);
    const cap = h("div", { class: "viz-caption" });
    foot.append(cap);
    const rows = cfg.rows || [], cols = cfg.cols || [];
    // the row-label column is as wide as the longest label (CJK included)
    const tw = (t) => (Viz.util.textWidth ? Viz.util.textWidth(String(t), 12.5, 700) : String(t).length * 8);
    const cs = clamp(Math.floor(440 / (C + 1)), 26, 40), x0 = rows.length ? Math.max(44, Math.ceil(Math.max(...rows.map(tw))) + 16) : 12, y0 = cols.length ? 34 : 12;
    svg.setAttribute("viewBox", `0 0 ${x0 + C * cs + 12} ${y0 + R * cs + 12}`);
    const total = order.length + (path.length ? 1 : 0);
    function show(k) {
      svg.innerHTML = "";
      const filled = new Set(order.slice(0, Math.min(k + 1, order.length)).map(([r, c]) => r + "," + c));
      const cur = k < order.length ? order[k] : null;
      const showPath = k >= order.length && path.length;
      cols.forEach((t, j) => svg.append(s("text", { x: x0 + j * cs + cs / 2, y: y0 - 10, "text-anchor": "middle", class: "label strong" }, String(t))));
      rows.forEach((t, i) => svg.append(s("text", { x: x0 - 8, y: y0 + i * cs + cs / 2 + 4, "text-anchor": "end", class: "label strong" }, String(t))));
      const vals = V.flat().filter((v) => typeof v === "number" && isFinite(v));
      const vmax = Math.max(1, ...vals.map(Math.abs));
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const on = filled.has(r + "," + c), isCur = cur && cur[0] === r && cur[1] === c;
        const isDep = cur && deps.some(([dr, dc]) => r === cur[0] + dr && c === cur[1] + dc);
        const onPath = showPath && path.some(([pr, pc]) => pr === r && pc === c);
        const v = V[r][c];
        const fill = onPath ? mix(cssv("--viz-cell"), cssv("--v5"), 0.65) : isCur ? mix(cssv("--viz-cell"), cssv("--v3"), 0.8) : isDep ? mix(cssv("--viz-cell"), cssv("--v1"), 0.45) : on ? mix(cssv("--viz-cell"), cssv("--v2"), typeof v === "number" ? 0.15 + 0.4 * (Math.abs(v) / vmax) : 0.3) : cssv("--surface");
        svg.append(s("rect", { x: x0 + c * cs, y: y0 + r * cs, width: cs - 2, height: cs - 2, rx: 4, fill, stroke: cssv("--border") }));
        if (on || onPath) svg.append(s("text", { x: x0 + c * cs + cs / 2 - 1, y: y0 + r * cs + cs / 2 + 4, "text-anchor": "middle", class: "cell", style: `font-size:${cs > 36 ? 13 : 11}px;${isCur || onPath ? "fill:#fff;font-weight:700" : ""}` }, typeof v === "number" && !Number.isInteger(v) ? v.toFixed(2) : String(v ?? "")));
      }
      if (cur) for (const [dr, dc] of deps) {
        const r = cur[0] + dr, c = cur[1] + dc;
        if (r < 0 || c < 0 || r >= R || c >= C) continue;
        svg.append(s("path", { d: arrowPath(x0 + c * cs + cs / 2, y0 + r * cs + cs / 2, x0 + cur[1] * cs + cs / 2 - (dc ? 8 * Math.sign(-dc) : 0), y0 + cur[0] * cs + cs / 2 - (dr ? 8 * Math.sign(-dr) : 0), 6), stroke: cssv("--v3"), "stroke-width": 2.2, fill: "none" }));
      }
      const where = cur ? `dp[${cur[0]}][${cur[1]}] = ${V[cur[0]][cur[1]]}` : L("traceback path", "回溯路径");
      cap.innerHTML = `${cfg.formula ? cfg.formula + " · " : ""}<b>${Math.min(k + 1, total)}/${total}</b> ${where}${cur ? L(" (blue cells: the entries it depends on)", "（蓝色格：它依赖的格子）") : ""}`;
    }
    const sp = stepper(root, total, show, cfg.interval || 0.45);
    ctrls.append(...sp.ctr);
    sp.show(0);
  });
})();
