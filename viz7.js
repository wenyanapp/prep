"use strict";
// Teaching widgets, part 7: symmetry (PLAN R18). group (a finite group as the symmetries of
// a polygon, with its Cayley table: compose, subgroups and cosets, orbits and stabilisers)
// and equiv (the equivariance test as a commuting square on a 2-D point cloud; p4 lifting
// convolution on a small image). Registered into viz.js; fields documented in
// CONTENT_SPEC.md ("Symmetry and equivariance widgets").
(() => {
  if (!window.Viz) return;
  const { h, s, cssv, mix, clamp, rng, randn, animator, shell, slider, btn, seg, legend, arrowPath, textWidth } = Viz.util;
  const zh = () => (document.documentElement.lang || "").startsWith("zh");
  const L = (en, cn) => (zh() ? cn : en);
  const cap = (foot) => { const c = h("div", { class: "viz-caption" }); foot.append(c); return c; };
  const n = (v, d = 2) => { const r = (+v).toFixed(d); return (/^-0\.?0*$/.test(r) ? r.slice(1) : r).replace(/^-/, "−"); };
  const colors = () => {
    const g = (k) => cssv(k);
    return { fg: g("--fg"), fg2: g("--fg-2"), muted: g("--muted"), faint: g("--faint"), border: g("--border"), border2: g("--border-2"), surface: g("--surface"), surface2: g("--surface-2"), cell: g("--viz-cell"), v: [g("--v1"), g("--v2"), g("--v3"), g("--v4"), g("--v5"), g("--v6")] };
  };
  const txt = (x, y, str, o = {}) => s("text", { x, y, "font-size": o.size || 13, fill: o.fill, "font-weight": o.weight ?? 600, "text-anchor": o.anchor || "start", ...(o.attrs || {}) }, str);
  const ln = (x1, y1, x2, y2, stroke, w = 1.5, extra = {}) => s("line", { x1, y1, x2, y2, stroke, "stroke-width": w, ...extra });
  const arrow = (x1, y1, x2, y2, color, w = 2.6, size = 8, extra = {}) =>
    s("path", { d: arrowPath(x1, y1, x2, y2, size), stroke: color, "stroke-width": w, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", ...extra });
  const narrowOf = (el) => (el.clientWidth || 700) < 520;
  const toView = (svg, ev, W, H) => { const r = svg.getBoundingClientRect(); return [((ev.clientX - r.left) / r.width) * W, ((ev.clientY - r.top) / r.height) * H]; };
  const picker = (options, value, onPick) => {
    const el = h("select", { style: "height:34px;border:1px solid var(--border-2);border-radius:6px;background:var(--surface);color:var(--fg);font-size:14px;font-weight:600;padding:0 8px;max-width:100%" });
    for (const [k, l] of options) { const o = h("option", { value: k }, l); if (k === value) o.selected = true; el.append(o); }
    el.addEventListener("change", () => onPick(el.value));
    return el;
  };
  const wide = (row) => { row.style.flex = "1 1 300px"; return row; };
  const rowBox = () => h("div", { class: "viz-ctrls", style: "margin-top:0;flex:1 1 100%" });

  // ------------------------------------------------------------------ 2×2 helpers
  const mm = (A, B) => [[A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]], [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]]];
  const mv = (A, v) => [A[0][0] * v[0] + A[0][1] * v[1], A[1][0] * v[0] + A[1][1] * v[1]];
  const rotM = (a) => [[Math.cos(a), -Math.sin(a)], [Math.sin(a), Math.cos(a)]];
  const I2 = [[1, 0], [0, 1]];
  const FLIP = [[-1, 0], [0, 1]]; // mirror across the vertical axis: (x, y) → (−x, y)
  const closeM = (A, B) => Math.abs(A[0][0] - B[0][0]) + Math.abs(A[0][1] - B[0][1]) + Math.abs(A[1][0] - B[1][0]) + Math.abs(A[1][1] - B[1][1]) < 1e-6;
  // element names: "sr3" is shown as sr³ — <sup> in HTML, a raised tspan in SVG (the Unicode
  // superscripts ⁴⁵ come from another block and render smaller than ²³)
  const sup = (name) => name.replace(/\d+/g, (d) => `<sup>${d}</sup>`);
  function nameText(x, y, list, o = {}) {
    const size = o.size || 13, t = s("text", { x, y, "font-size": size, fill: o.fill, "font-weight": o.weight ?? 600, "text-anchor": o.anchor || "start", ...(o.attrs || {}) });
    let raised = false;
    list.forEach((name, i) => {
      const m = String(name).match(/^(\D*)(\d*)(.*)$/), base = (i ? ", " : "") + m[1];
      t.append(s("tspan", raised ? { dy: size * 0.36 } : {}, base)); raised = false;
      if (m[2]) { t.append(s("tspan", { dy: -size * 0.36, "font-size": size * 0.74 }, m[2])); raised = true; }
      if (m[3]) { t.append(s("tspan", raised ? { dy: size * 0.36 } : {}, m[3])); raised = false; }
    });
    return t;
  }

  // ================================================================== group
  // Elements are 2×2 orthogonal matrices acting on the left. r = counter-clockwise turn by
  // 2π/n, s = mirror across the vertical axis through corner 1; "sr^k" = S·R^k: rotate
  // first, then mirror. Corners are numbered 1…n counter-clockwise from the top.
  const GROUPS = ["C2", "C3", "C4", "C5", "C6", "D3", "D4", "D5", "D6", "S3", "V4"];
  function makeGroup(name) {
    if (!GROUPS.includes(name)) name = "D4";
    let kind = name[0], ng = +name.slice(1), shape = "ngon", nrot, raw = [], alias = "";
    if (name === "S3") { kind = "D"; ng = 3; alias = "S3"; }
    if (name === "V4") { nrot = 2; shape = "rect"; raw = [["e", 0, 0], ["a", 1, 0], ["b", 0, 1], ["ab", 1, 1]]; }
    else {
      nrot = ng; if (kind === "C" && ng === 2) shape = "S";
      for (let k = 0; k < ng; k++) raw.push([k === 0 ? "e" : k === 1 ? "r" : "r" + k, k, 0]);
      if (kind === "D") for (let k = 0; k < ng; k++) raw.push([k === 0 ? "s" : k === 1 ? "sr" : "sr" + k, k, 1]);
    }
    const els = raw.map(([nm, k, f]) => { const R = rotM((2 * Math.PI * k) / nrot); return { name: nm, k, f, th: (2 * Math.PI * k) / nrot, M: f ? mm(FLIP, R) : R }; });
    const find = (M) => els.findIndex((e) => closeM(e.M, M));
    const mul = els.map((a) => els.map((b) => find(mm(a.M, b.M))));
    const inv = mul.map((row) => row.indexOf(0));
    let verts, tips = null;
    if (shape === "ngon") verts = Array.from({ length: ng }, (_, i) => [88 * Math.cos(Math.PI / 2 + (2 * Math.PI * i) / ng), 88 * Math.sin(Math.PI / 2 + (2 * Math.PI * i) / ng)]);
    else if (shape === "rect") verts = [[100, 58], [-100, 58], [-100, -58], [100, -58]];
    else { verts = [[62, 72], [-62, 72], [-62, 0], [62, 0], [62, -72], [-62, -72]]; tips = [0, 5]; }
    const corners = tips ? tips.map((i) => verts[i]) : verts;
    const mids = shape === "S" ? [] : verts.map((v, i) => { const w = verts[(i + 1) % verts.length]; return [(v[0] + w[0]) / 2, (v[1] + w[1]) / 2]; });
    // permutation of corner positions: position i → position perm[i]
    const perms = els.map((e) => corners.map((c) => { const p = mv(e.M, c); return corners.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6); }));
    return { name, alias, kind, shape, nrot, els, mul, inv, verts, corners, mids, perms, chiral: kind === "C" && shape === "ngon", idx: (nm) => els.findIndex((e) => e.name === nm) };
  }
  // cycle notation of a permutation of positions (1-based)
  const cycles = (perm) => {
    const seen = new Array(perm.length).fill(false); let out = "";
    for (let i = 0; i < perm.length; i++) { if (seen[i] || perm[i] === i) { seen[i] = true; continue; } let c = [], j = i; while (!seen[j]) { seen[j] = true; c.push(j + 1); j = perm[j]; } out += "(" + c.join(" ") + ")"; }
    return out || "()";
  };

  Viz.register("group", (root, cfg) => {
    const { stage, ctrls, foot } = shell(root, cfg);
    let G = makeGroup(typeof cfg.group === "string" ? cfg.group : "D4");
    let mode = ["compose", "subgroup", "orbit"].includes(cfg.mode) ? cfg.mode : "compose";
    let first = -1, second = -1;          // compose: first is applied first (h), second on top (g)
    let gens = [], right = false, sorted = false;   // subgroup
    let target = null;                     // orbit: point in shape coordinates
    let P = I2, anim = null, queue = [];   // pose of the shape, running animation
    let W = 660, H = 320, geo = null;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "viz-svg" });
    svg.style.touchAction = "manipulation";
    stage.append(svg);
    const c = cap(foot);
    const names = (ids) => ids.map((i) => sup(G.els[i].name)).join(", ");
    function fromCfg(init) {
      first = second = -1; gens = []; P = I2; anim = null; queue = [];
      target = { kind: "corner", i: 0, p: G.corners[0] };
      if (!init) return;
      if (typeof cfg.first === "string" && G.idx(cfg.first) >= 0) first = G.idx(cfg.first);
      if (first >= 0 && typeof cfg.second === "string" && G.idx(cfg.second) >= 0) second = G.idx(cfg.second);
      if (Array.isArray(cfg.subgroup)) gens = [...new Set(cfg.subgroup.map((x) => G.idx(String(x))).filter((i) => i > 0))];
      if (mode === "compose") { if (first >= 0) P = G.els[first].M; if (second >= 0) P = mm(G.els[second].M, P); }
    }
    function closure(seed) {
      const set = new Set([0, ...seed]);
      for (let grew = true; grew;) { grew = false; for (const a of [...set]) for (const b of [...set]) { const p = G.mul[a][b]; if (!set.has(p)) { set.add(p); grew = true; } } }
      return [...set].sort((a, b) => a - b);
    }
    function cosetInfo() {
      const Hs = closure(gens), N = G.els.length;
      const part = (rt) => { const of = new Array(N).fill(-1), list = []; for (let g = 0; g < N; g++) { if (of[g] >= 0) continue; const co = Hs.map((x) => (rt ? G.mul[x][g] : G.mul[g][x])).sort((a, b) => a - b); co.forEach((x) => (of[x] = list.length)); list.push(co); } return { of, list }; };
      const Lp = part(false), Rp = part(true);
      let witness = -1;
      for (let g = 0; g < N && witness < 0; g++) { const a = Hs.map((x) => G.mul[g][x]).sort((x, y) => x - y).join(), b = Hs.map((x) => G.mul[x][g]).sort((x, y) => x - y).join(); if (a !== b) witness = g; }
      return { Hs, left: Lp, right: Rp, normal: witness < 0, witness };
    }
    function orbitInfo() {
      const x = target.p, pts = [], stab = [];
      G.els.forEach((e, i) => { const y = mv(e.M, x); if (Math.hypot(y[0] - x[0], y[1] - x[1]) < 1e-6) stab.push(i); let k = pts.findIndex((q) => Math.hypot(q.p[0] - y[0], q.p[1] - y[1]) < 1e-6); if (k < 0) { pts.push({ p: y, by: [] }); k = pts.length - 1; } pts[k].by.push(i); });
      return { pts, stab };
    }
    root.__test = { get group() { return G; }, cycles, closure: (nm) => closure(nm.map((x) => G.idx(x))), cosets: () => cosetInfo(), orbit: () => orbitInfo(), get state() { return { first, second, mode, P, target }; } };

    // ---- drawing
    function poseAt() {
      if (!anim) return P;
      const e = G.els[anim.el], t = anim.t, both = e.f && e.k;
      const t1 = e.k ? (both ? Math.min(1, 2 * t) : t) : 1, t2 = e.f ? (both ? Math.max(0, 2 * t - 1) : t) : 0;
      const ease = (u) => u * u * (3 - 2 * u);
      let M = rotM(e.th * ease(t1));
      if (e.f) M = mm([[1 - 2 * ease(t2), 0], [0, 1]], M);
      return mm(M, P);
    }
    function drawShape(C, cx, cy, M, ghost, under) {
      const X = (p) => { const q = mv(M, p); return [cx + q[0], cy - q[1]]; };
      const pts = G.verts.map(X);
      const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("") + (G.shape === "S" ? "" : "Z");
      if (ghost) {
        svg.append(s("path", { d, fill: "none", stroke: C.faint, "stroke-width": G.shape === "S" ? 10 : 1.5, "stroke-dasharray": G.shape === "S" ? "none" : "5 4", "stroke-opacity": G.shape === "S" ? 0.25 : 1, "stroke-linecap": "round", "stroke-linejoin": "round" }));
        G.corners.forEach((p, i) => { const q = X(p), r = Math.hypot(p[0], p[1]) || 1, o = 22; svg.append(txt(q[0] + (p[0] / r) * o, q[1] - (p[1] / r) * o + 4, String(i + 1), { fill: C.muted, size: 12, anchor: "middle", attrs: { stroke: C.surface, "stroke-width": 4, "paint-order": "stroke" } })); });
        return;
      }
      svg.append(s("path", { d, fill: G.shape === "S" ? "none" : C.surface2, "fill-opacity": 0.85, stroke: C.fg2, "stroke-width": G.shape === "S" ? 10 : 2.5, "stroke-linecap": "round", "stroke-linejoin": "round" }));
      // C_n: a small filled flag on every corner, all pointing the same way round, so the shape has
      // no mirror symmetry (a line through a corner would look like a mirror axis)
      if (G.chiral) G.verts.forEach((v, i) => {
        const u = G.verts[(i + G.verts.length - 1) % G.verts.length], dx = v[0] - u[0], dy = v[1] - u[1], l = Math.hypot(dx, dy), d = [dx / l, dy / l], o = [d[1], -d[0]]; // o: outward normal of edge u→v (corners run counter-clockwise)
        const p0 = [v[0] - d[0] * 30, v[1] - d[1] * 30], p1 = [v[0] - d[0] * 30 + o[0] * 15, v[1] - d[1] * 30 + o[1] * 15], p2 = [v[0] - d[0] * 12, v[1] - d[1] * 12];
        const q = [p0, p1, p2].map(X);
        svg.append(s("path", { d: `M${q.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L")}Z`, fill: C.fg2, "fill-opacity": 0.85, stroke: C.fg2, "stroke-width": 1, "stroke-linejoin": "round" }));
      });
      under?.(); // the mirror axes: over the shape, under the numbered corners
      G.corners.forEach((p, i) => { const q = X(p); svg.append(s("circle", { cx: q[0], cy: q[1], r: 12, fill: C.v[i % 6], stroke: C.surface, "stroke-width": 2 })); svg.append(txt(q[0], q[1] + 4.5, String(i + 1), { fill: "#fff", size: 13, weight: 800, anchor: "middle" })); });
    }
    function drawTable(C, x0, y0, cell, info) {
      const N = G.els.length, fs = N > 8 ? 12 : N > 6 ? 13.5 : 15;
      let order = G.els.map((_, i) => i);
      if (mode === "subgroup" && sorted) { const of = (right ? info.right : info.left).of; order = order.slice().sort((a, b) => of[a] - of[b] || a - b); }
      const tint = (i) => C.v[i % 6], op = (i) => (i >= 6 ? 0.42 : 0.22);
      const coset = info ? (right ? info.right : info.left).of : null;
      svg.append(txt(x0 + cell / 2, y0 + cell / 2 + 4, "g·h", { fill: C.muted, size: 11, anchor: "middle" }));
      order.forEach((el, a) => {
        for (const hdr of [0, 1]) {
          const x = hdr ? x0 : x0 + (a + 1) * cell, y = hdr ? y0 + (a + 1) * cell : y0;
          const on = mode === "compose" && ((hdr && el === second) || (!hdr && el === first));
          const inH = info && info.Hs.includes(el);
          const r = s("rect", { x: x + 1, y: y + 1, width: cell - 2, height: cell - 2, rx: 4, fill: on ? (hdr ? C.v[0] : C.v[1]) : coset ? tint(coset[el]) : C.cell, "fill-opacity": on ? 1 : coset ? op(coset[el]) + 0.12 : 1, stroke: inH ? C.fg : "none", "stroke-width": 1.6, style: "cursor:pointer" });
          r.addEventListener("click", () => tap(el));
          svg.append(r);
          svg.append(nameText(x + cell / 2, y + cell / 2 + fs * 0.36, [G.els[el].name], { fill: on ? "#fff" : C.fg, size: fs, weight: 800, anchor: "middle", attrs: { style: "pointer-events:none" } }));
        }
        order.forEach((el2, b) => {
          const p = G.mul[el][el2], x = x0 + (b + 1) * cell, y = y0 + (a + 1) * cell;
          const hit = mode === "compose" && el === second && el2 === first;
          const inRowCol = mode === "compose" && (el === second || el2 === first);
          if (hit) svg.append(s("rect", { x: x + 1, y: y + 1, width: cell - 2, height: cell - 2, rx: 4, fill: C.v[2] }));
          else if (coset) svg.append(s("rect", { x: x + 1, y: y + 1, width: cell - 2, height: cell - 2, rx: 3, fill: tint(coset[p]), "fill-opacity": op(coset[p]) }));
          else if (inRowCol) svg.append(s("rect", { x: x + 1, y: y + 1, width: cell - 2, height: cell - 2, rx: 3, fill: el === second ? C.v[0] : C.v[1], "fill-opacity": 0.13 }));
          svg.append(nameText(x + cell / 2, y + cell / 2 + fs * 0.36, [G.els[p].name], { fill: hit ? "#fff" : C.fg, size: fs, weight: hit ? 800 : 500, anchor: "middle" }));
        });
      });
      svg.append(s("rect", { x: x0 + cell, y: y0 + cell, width: N * cell, height: N * cell, fill: "none", stroke: C.border2 }));
    }
    function draw() {
      const C = colors(), nar = narrowOf(stage), N = G.els.length;
      const info = mode === "subgroup" ? cosetInfo() : null;
      const cell = nar ? Math.min(44, 384 / (N + 1)) : Math.min(42, 364 / (N + 1));
      const cx = nar ? 200 : 142, cy = nar ? 140 : 152, tx0 = nar ? (400 - (N + 1) * cell) / 2 : 286, ty0 = nar ? 282 : 14;
      W = nar ? 400 : 660; H = nar ? ty0 + (N + 1) * cell + 10 : Math.max(308, ty0 + (N + 1) * cell + 12);
      geo = { cx, cy };
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.innerHTML = "";
      // polygon panel
      const pad = s("rect", { x: nar ? 0 : 0, y: 0, width: nar ? 400 : 280, height: nar ? 276 : H, fill: "transparent" });
      svg.append(pad);
      // the fixed mirror axes, drawn over the shape; their names sit inside it, away from the corner labels
      const halo = { stroke: C.surface, "stroke-width": 3.5, "paint-order": "stroke", "stroke-linejoin": "round" };
      const ext = Math.max(...G.verts.map((v) => Math.hypot(v[0], v[1]))) + 8; // a little beyond the shape, short of the corner labels
      const mirrors = () => {
        if (G.kind === "D" || G.name === "V4") { svg.append(ln(cx, cy - ext, cx, cy + ext, C.v[3], 1.3, { "stroke-dasharray": "6 5" })); svg.append(txt(cx + 7, cy - 34, G.name === "V4" ? L("mirror b", "镜面 b") : L("mirror s", "镜面 s"), { fill: C.v[3], size: 11.5, attrs: halo })); }
        // V4: b is the mirror in the vertical axis, ab = b·a (half-turn, then b) the one in the horizontal axis
        if (G.name === "V4") { svg.append(ln(cx - ext, cy, cx + ext, cy, C.v[4], 1.3, { "stroke-dasharray": "6 5" })); svg.append(txt(cx + 22, cy - 7, L("mirror ab", "镜面 ab"), { fill: C.v[4], size: 11.5, attrs: halo })); }
      };
      // the faint home outline and grey numbers show where the shape started; in orbit mode the
      // shape never moves, so they would only sit next to the real numbers and the labels
      if (mode !== "orbit") drawShape(C, cx, cy, I2, true);
      if (mode === "orbit") {
        drawShape(C, cx, cy, I2, false, mirrors);
        const tg = [...G.corners.map((p, i) => ({ kind: "corner", i, p })), ...G.mids.map((p, i) => ({ kind: "mid", i, p })), { kind: "centre", i: 0, p: [0, 0] }];
        tg.forEach((t) => { if (t.kind !== "corner") svg.append(s("circle", { cx: cx + t.p[0], cy: cy - t.p[1], r: 5, fill: C.surface, stroke: C.muted, "stroke-width": 1.5 })); });
        const { pts } = orbitInfo(), labels = [];
        pts.forEach((q, k) => {
          const x = cx + q.p[0], y = cy - q.p[1];
          // a ring, so a corner's number stays readable inside it; x itself gets the thicker ring
          const onCorner = G.corners.some((c0) => Math.hypot(c0[0] - q.p[0], c0[1] - q.p[1]) < 1e-6);
          if (onCorner) svg.append(s("circle", { cx: x, cy: y, r: k === 0 ? 17 : 16, fill: "none", stroke: C.v[2], "stroke-width": k === 0 ? 4.5 : 3 }));
          else svg.append(s("circle", { cx: x, cy: y, r: k === 0 ? 9 : 7, fill: C.v[2], stroke: C.fg, "stroke-width": k === 0 ? 2.5 : 1.2, "fill-opacity": 0.92 }));
          // the label sits outside the ring, on the side away from the centre: beside it for a point
          // to the left or right, above or below it otherwise
          const r = Math.hypot(q.p[0], q.p[1]), ux = r > 1 ? q.p[0] / r : 0, uy = r > 1 ? q.p[1] / r : -1, off = onCorner ? 22 : 12;
          const lab = q.by.length > 3 ? [...q.by.slice(0, 2).map((i) => G.els[i].name), "… (" + q.by.length + ")"] : q.by.map((i) => G.els[i].name);
          const pw = nar ? 400 : 280, lw = textWidth(lab.join(", "), 12.5, 800) + 4;
          let anc = ux > 0.4 ? "start" : ux < -0.4 ? "end" : "middle", lx = x + ux * off, ly = y - uy * off + 4.5 + (uy < -0.4 ? 8 : uy > 0.4 ? -4 : 0);
          // no room beside it (it would run into the table or off the edge): put it above the ring
          if ((anc === "start" && lx + lw > pw - 4) || (anc === "end" && lx - lw < 4)) { anc = "middle"; lx = x; ly = y - off - 6; }
          if (anc === "middle") lx = clamp(lx, lw / 2 + 4, pw - lw / 2 - 4);
          ly = clamp(ly, 14, nar ? 272 : H - 6);
          labels.push(nameText(lx, ly, lab, { fill: C.fg, size: 12.5, weight: 800, anchor: anc, attrs: { stroke: C.surface, "stroke-width": 3.5, "paint-order": "stroke", "stroke-linejoin": "round" } }));
        });
        svg.append(...labels);
        pad.style.cursor = "crosshair";
      } else drawShape(C, cx, cy, poseAt(), false, mirrors);
      svg.append(txt(nar ? 8 : 6, 18, (G.alias ? "S₃ ≅ D₃" : G.name[0] + G.name.slice(1).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[d])) + ` · |G| = ${N}`, { fill: C.fg, size: 14, weight: 800 }));
      drawTable(C, tx0, ty0, cell, info);
      caption(info);
      paintButtons(info);
    }
    function caption(info) {
      const N = G.els.length, nm = (i) => sup(G.els[i].name);
      const note = G.name === "V4" ? L(" Here a is the half-turn, b the mirror in the vertical axis and ab = b·a the mirror in the horizontal axis.", " 这里 a 是转半圈，b 是关于竖直轴的镜像，ab = b·a 是关于水平轴的镜像。")
        : G.chiral ? L(" The flags on the corners all point the same way round, so no mirror maps the shape to itself: only the turns are symmetries.", " 各个角上的小旗都朝同一个转向，所以没有镜像能把图形映回自身：对称只有旋转。")
        : G.alias ? L(" S₃ (all permutations of 3 things) is drawn as D₃: the six symmetries of a triangle permute its 3 corners in all six ways.", " S₃（3 个东西的全部置换）画成 D₃：三角形的六个对称正好给出三个角的全部六种排列。") : "";
      let t;
      if (mode === "compose") {
        const cyc = (i) => (G.corners.length > 1 ? ` ${cycles(G.perms[i])}` : "");
        if (first < 0) t = L("Tap an element (a button or a table header): the shape performs it. Then tap a second one — it is applied on top. The faint outline and grey numbers are the fixed home positions; the coloured numbers travel with the shape.", "点一个元素（按钮或表头）：图形会执行它。再点第二个，它会接着作用上去。浅色轮廓和灰色数字是固定不动的初始位置；彩色数字跟着图形走。");
        else if (second < 0) t = L(`First: h = ${nm(first)}${cyc(first)}. Now tap a second element g; it acts on top of h.`, `先做 h = ${nm(first)}${cyc(first)}。再点第二个元素 g，它接着 h 作用。`);
        else {
          const gh = G.mul[second][first], hg = G.mul[first][second], same = gh === hg;
          t = L(`<b>${nm(second)} · ${nm(first)} = ${nm(gh)}</b>${cyc(gh)} — the right-hand factor acts first: do ${nm(first)}, then ${nm(second)}. In the table: row g = ${nm(second)}, column h = ${nm(first)}, entry g·h. Other order: ${nm(first)} · ${nm(second)} = ${nm(hg)} — ${same ? "the same; these two commute" : "<b>different</b>: the order matters, the group is not commutative"}.`,
            `<b>${nm(second)} · ${nm(first)} = ${nm(gh)}</b>${cyc(gh)}——右边的因子先作用：先做 ${nm(first)}，再做 ${nm(second)}。表里：行 g = ${nm(second)}，列 h = ${nm(first)}，格子是 g·h。换个顺序：${nm(first)} · ${nm(second)} = ${nm(hg)}——${same ? "结果一样，这两个元素可交换" : "<b>结果不同</b>：顺序有关系，这个群不可交换"}。`);
        }
      } else if (mode === "subgroup") {
        const { Hs, left, right: rp, normal, witness } = info, m = Hs.length, part = right ? rp : left;
        const sets = part.list.map((co) => "{" + names(co) + "}").join(", ");
        t = L(`${gens.length ? "Generated by " + names(gens) + ": " : "Tap elements to generate a subgroup. "}<b>H = {${names(Hs)}}</b>, |H| = ${m}. Lagrange: |G| = ${N} = ${m} × ${N / m}, so |H| divides |G| and there are ${N / m} cosets. ${right ? "Right cosets Hg" : "Left cosets gH"}: ${sets}. ${normal ? "H is <b>normal</b>: left and right cosets agree for every g." : `H is <b>not normal</b>: for g = ${nm(witness)}, gH ≠ Hg (switch left/right to see the colouring change).`}`,
          `${gens.length ? "由 " + names(gens) + " 生成：" : "点元素来生成一个子群。"}<b>H = {${names(Hs)}}</b>，|H| = ${m}。拉格朗日定理：|G| = ${N} = ${m} × ${N / m}，所以 |H| 整除 |G|，共有 ${N / m} 个陪集。${right ? "右陪集 Hg" : "左陪集 gH"}：${sets}。${normal ? "H 是<b>正规子群</b>：对每个 g，左右陪集都相同。" : `H <b>不是正规子群</b>：取 g = ${nm(witness)}，gH ≠ Hg（切换左/右陪集，看着色怎么变）。`}`);
      } else {
        const { pts, stab } = orbitInfo();
        const what = target.kind === "corner" ? L(`corner ${target.i + 1}`, `角 ${target.i + 1}`) : target.kind === "mid" ? L("an edge midpoint", "一条边的中点") : target.kind === "centre" ? L("the centre", "中心") : L("a generic point", "一个一般位置的点");
        t = L(`x = ${what}. Orbit G·x: ${pts.length} point${pts.length > 1 ? "s" : ""}. Stabiliser G<sub>x</sub> = {${names(stab)}}: ${stab.length} element${stab.length > 1 ? "s" : ""}. <b>${pts.length} × ${stab.length} = ${N} = |G|</b>. Each orbit point is labelled with the elements that send x there — one coset of the stabiliser each. Tap a corner, an edge midpoint, the centre or anywhere else.`,
          `x = ${what}。轨道 G·x 有 ${pts.length} 个点。稳定子 G<sub>x</sub> = {${names(stab)}}，有 ${stab.length} 个元素。<b>${pts.length} × ${stab.length} = ${N} = |G|</b>。每个轨道点旁边标着把 x 送到那里的元素——正好是稳定子的一个陪集。可以点角、边的中点、中心，或任意别的位置。`);
      }
      c.innerHTML = t + note;
    }
    // ---- interaction
    const an = animator(root, (dt) => {
      if (!anim) { if (!queue.length) { draw(); return false; } anim = { el: queue.shift(), t: 0 }; }
      anim.t += dt / 0.6;
      if (anim.t >= 1) { P = mm(G.els[anim.el].M, P); anim = null; if (!queue.length) { draw(); return false; } }
      draw();
    });
    function play(list, reset) { an.stop(); anim = null; if (reset) P = I2; queue = list.filter((i) => i > 0); if (queue.length) an.start(); else draw(); }
    function tap(el) {
      if (mode === "compose") {
        if (first < 0 || second >= 0) { first = el; second = -1; play([el], true); }
        else { second = el; an.stop(); if (anim) { P = mm(G.els[anim.el].M, P); anim = null; } queue = []; play([el], false); }
      } else if (mode === "subgroup") {
        if (el === 0) gens = []; else if (gens.includes(el)) gens = gens.filter((x) => x !== el); else gens.push(el);
        play([el], true);
      } else draw();
      draw();
    }
    svg.addEventListener("click", (ev) => {
      if (mode !== "orbit" || !geo) return;
      const [x, y] = toView(svg, ev, W, H), nar = narrowOf(stage);
      if (x > (nar ? 400 : 280) || y > (nar ? 276 : H)) return;
      let p = [x - geo.cx, geo.cy - y];
      const tg = [...G.corners.map((q, i) => ({ kind: "corner", i, p: q })), ...G.mids.map((q, i) => ({ kind: "mid", i, p: q })), { kind: "centre", i: 0, p: [0, 0] }];
      let best = null, bd = 16;
      for (const t of tg) { const d = Math.hypot(t.p[0] - p[0], t.p[1] - p[1]); if (d < bd) { bd = d; best = t; } }
      const r = Math.hypot(p[0], p[1]); if (r > 118) p = [(p[0] / r) * 118, (p[1] / r) * 118];
      target = best || { kind: "free", i: 0, p };
      draw();
    });
    // ---- controls
    const elBox = h("div", { style: "display:flex;flex-wrap:wrap;gap:6px;flex:1 1 100%" });
    const extra = rowBox();
    let elBtns = [];
    function paintButtons(info) {
      const C = colors(), coset = info ? (right ? info.right : info.left).of : null;
      elBtns.forEach((b, i) => {
        const on = mode === "compose" && (i === first || i === second);
        b.style.background = on ? (i === second ? C.v[0] : C.v[1]) : coset ? mix(C.surface, C.v[coset[i] % 6], coset[i] >= 6 ? 0.5 : 0.3) : "";
        b.style.color = on ? "#fff" : coset ? C.fg : "";
        b.style.borderColor = info && info.Hs.includes(i) ? C.fg : "";
        b.style.borderWidth = info && info.Hs.includes(i) ? "2px" : "";
      });
    }
    function buildButtons() {
      elBox.innerHTML = ""; elBtns = [];
      G.els.forEach((e, i) => { const b = btn("", () => tap(i)); b.innerHTML = sup(e.name); b.style.padding = "0 10px"; b.style.minWidth = "42px"; b.dataset.el = e.name; elBtns.push(b); elBox.append(b); });
      elBox.style.display = mode === "orbit" ? "none" : "flex";
      extra.innerHTML = "";
      if (mode === "compose") {
        extra.append(btn("⇄ " + L("swap the order", "交换顺序"), () => { if (first >= 0 && second >= 0) { [first, second] = [second, first]; play([first, second], true); draw(); } }));
        extra.append(btn("▶ " + L("replay", "重放"), () => { if (first >= 0) { play([first, second].filter((x) => x >= 0), true); draw(); } }));
        extra.append(btn("↺ " + L("reset", "重置"), () => { first = second = -1; play([], true); }));
      } else if (mode === "subgroup") {
        extra.append(seg([["l", L("left cosets gH", "左陪集 gH")], ["r", L("right cosets Hg", "右陪集 Hg")]], right ? "r" : "l", (v) => { right = v === "r"; draw(); }));
        extra.append(btn(L("sort table by coset", "按陪集排表"), () => { sorted = !sorted; draw(); }));
        extra.append(btn("↺ " + L("clear", "清空"), () => { gens = []; play([], true); }));
      }
    }
    const modeSeg = seg([["compose", L("compose", "复合")], ["subgroup", L("subgroups & cosets", "子群与陪集")], ["orbit", L("orbits", "轨道")]], mode, (m) => { mode = m; an.stop(); anim = null; queue = []; P = I2; first = second = -1; buildButtons(); draw(); });
    const gpick = picker(GROUPS.map((g) => [g, g]), G.name, (g) => { G = makeGroup(g); an.stop(); fromCfg(false); buildButtons(); draw(); });
    ctrls.append(modeSeg, gpick, elBox, extra);
    fromCfg(true);
    buildButtons();
    draw();
  });

  // ================================================================== equiv
  const SHAPES = {
    L: [[1.0, -0.6], [1.0, 0.0], [1.0, 0.6], [1.0, 1.2], [1.0, 1.8], [1.6, -0.6], [2.2, -0.6]],
    triangle: [[0.6, 0.3], [2.2, 0.6], [1.1, 2.0]],
    arrow: [[-0.3, 0.7], [0.3, 0.7], [0.9, 0.7], [1.5, 0.7], [2.2, 0.7], [1.6, 1.25], [1.75, 0.3]],
  };
  const FNAMES = ["centroid", "farthest", "pca-axis", "distances", "max-x", "mlp", "canon-mlp", "avg-mlp"];
  const centroidOf = (X) => { const c = [0, 0]; for (const p of X) { c[0] += p[0] / X.length; c[1] += p[1] / X.length; } return c; };
  function pcaAxis(X) {
    const c = centroidOf(X); let a = 0, b = 0, d = 0;
    for (const p of X) { const x = p[0] - c[0], y = p[1] - c[1]; a += x * x; b += x * y; d += y * y; }
    const th = 0.5 * Math.atan2(2 * b, a - d);
    return [Math.cos(th), Math.sin(th)];
  }
  function makeMlp(N, seed) {
    const r = rng(seed * 131 + N * 7 + 5), Hn = 8;
    const W1 = Array.from({ length: Hn }, () => Array.from({ length: 2 * N }, () => randn(r) * 0.55)), b1 = Array.from({ length: Hn }, () => randn(r) * 0.3);
    const W2 = Array.from({ length: 2 }, () => Array.from({ length: Hn }, () => randn(r) * 0.6));
    return (X) => { const v = X.flat(); const hid = W1.map((row, i) => Math.tanh(row.reduce((a, w, j) => a + w * v[j], b1[i]))); return W2.map((row) => 0.6 * row.reduce((a, w, j) => a + w * hid[j], 0)); };
  }
  // Standard pose: centre, principal axis to +x (sign from the third moment), second axis
  // sign from its third moment, then sort the points. Invariant to E(2) and to reordering.
  function canonical(X) {
    const c = centroidOf(X); let u = pcaAxis(X);
    const Y = X.map((p) => [p[0] - c[0], p[1] - c[1]]);
    let m3 = Y.reduce((a, p) => a + (p[0] * u[0] + p[1] * u[1]) ** 3, 0);
    if (m3 < 0) u = [-u[0], -u[1]];
    let w = [-u[1], u[0]];
    let n3 = Y.reduce((a, p) => a + (p[0] * w[0] + p[1] * w[1]) ** 3, 0);
    if (n3 < 0) w = [-w[0], -w[1]];
    const Z = Y.map((p) => [p[0] * u[0] + p[1] * u[1], p[0] * w[0] + p[1] * w[1]]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    return { Z, m3, n3, u };
  }
  function evalF(name, X, mlp, nAvg) {
    const c = centroidOf(X);
    if (name === "centroid") return { type: "point", v: c };
    if (name === "farthest") { let best = X[0], bd = -1; for (const p of X) { const d = Math.hypot(p[0] - c[0], p[1] - c[1]); if (d > bd + 1e-12) { bd = d; best = p; } } return { type: "vector", v: [best[0] - c[0], best[1] - c[1]] }; }
    if (name === "pca-axis") { let u = pcaAxis(X); if (u[0] < 0 || (Math.abs(u[0]) < 1e-12 && u[1] < 0)) u = [-u[0], -u[1]]; return { type: "axis", v: [1.4 * u[0], 1.4 * u[1]] }; }
    if (name === "distances") return { type: "scalars", v: X.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1])).sort((a, b) => a - b) };
    if (name === "max-x") return { type: "scalars", v: [Math.max(...X.map((p) => p[0]))] };
    if (name === "mlp") return { type: "vector", v: mlp(X) };
    if (name === "canon-mlp") return { type: "scalars", v: mlp(canonical(X).Z) };
    // avg-mlp: f_avg(x) = (1/n) Σ_k R_k f(R_k⁻¹ (x − centroid)) — exactly C_n-equivariant
    const Y = X.map((p) => [p[0] - c[0], p[1] - c[1]]), out = [0, 0];
    for (let k = 0; k < nAvg; k++) { const R = rotM((2 * Math.PI * k) / nAvg), Rt = rotM((-2 * Math.PI * k) / nAvg); const o = mv(R, mlp(Y.map((p) => mv(Rt, p)))); out[0] += o[0] / nAvg; out[1] += o[1] / nAvg; }
    return { type: "vector", v: out };
  }
  const gMat = (g) => mm(rotM(g.angle), g.reflect ? FLIP : I2);
  const applyG = (X, g) => { const A = gMat(g); let Y = X.map((p) => { const q = mv(A, p); return [q[0] + g.t[0], q[1] + g.t[1]]; }); if (g.perm) Y = g.perm.map((j) => Y[j]); return Y; };
  const rhoOut = (o, g) => { const A = gMat(g); if (o.type === "point") { const q = mv(A, o.v); return [q[0] + g.t[0], q[1] + g.t[1]]; } if (o.type === "scalars") return o.v.slice(); return mv(A, o.v); };
  const dist = (a, b) => Math.sqrt(a.reduce((acc, v, i) => acc + (v - b[i]) ** 2, 0));

  function equivPoints(root, cfg) {
    const { stage, ctrls, foot } = shell(root, cfg);
    const seed = Number.isFinite(cfg.seed) ? cfg.seed : 3;
    let shape = ["L", "triangle", "arrow", "random"].includes(cfg.shape) ? cfg.shape : "L";
    let fname = FNAMES.includes(cfg.f) ? cfg.f : "centroid";
    let group = ["SO2", "O2", "SE2", "Sn"].includes(cfg.group) ? cfg.group : "SO2";
    let nAvg = clamp(Math.round(Number.isFinite(cfg.n_avg) ? cfg.n_avg : 4), 1, 16);
    const angle0 = Number.isFinite(cfg.angle) ? cfg.angle : 0.7;
    // optional start state of g: reflect (O2 only) opens with the mirror on, shift [x, y] (SE2 only)
    // replaces the default shift (0.4, −0.3); reset returns to this start
    const reflect0 = cfg.reflect === true;
    const shift0 = Array.isArray(cfg.shift) && cfg.shift.length === 2 && cfg.shift.every(Number.isFinite) ? cfg.shift.map((v) => clamp(v, -0.6, 0.6)) : [0.4, -0.3];
    let g, X, mlp, W = 660, H = 400, geo = null, drag = -1;
    const shapePts = (nm) => { if (nm !== "random") return SHAPES[nm].map((p) => p.slice()); const r = rng(seed * 17 + 3); return Array.from({ length: 6 }, () => [0.2 + 1.8 * r(), -0.6 + 2.2 * r()]); };
    const resetG = () => { g = { angle: group === "Sn" ? 0 : angle0, reflect: group === "O2" && reflect0, t: group === "SE2" ? shift0.slice() : [0, 0], perm: null }; if (group === "Sn") shuffle(); };
    function shuffle() { const N = X.length, r = rng(Math.floor(Math.random() * 1e9) + 1); let p; do { p = X.map((_, i) => i); for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } } while (N > 1 && p.every((v, i) => v === i)); g.perm = p; }
    function setShape(nm) { shape = nm; X = shapePts(nm); mlp = makeMlp(X.length, seed); if (g && g.perm) shuffle(); }
    setShape(shape); resetG();
    const F = (Y) => evalF(fname, Y, mlp, nAvg);
    function randomG(r) {
      const N = X.length;
      if (group === "Sn") { const p = X.map((_, i) => i); for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return { angle: 0, reflect: false, t: [0, 0], perm: p }; }
      return { angle: (r() * 2 - 1) * Math.PI, reflect: group === "O2" && r() < 0.5, t: group === "SE2" ? [r() * 1.2 - 0.6, r() * 1.2 - 0.6] : [0, 0], perm: null };
    }
    function verdict() {
      const r = rng(4242), fx = F(X), tol = 1e-6 * (1 + Math.hypot(...fx.v));
      let eq = 0, inv = 0, sign = 0;
      for (let i = 0; i < 24; i++) { const gg = randomG(r), a = F(applyG(X, gg)).v, b = rhoOut(fx, gg); eq = Math.max(eq, dist(a, b)); inv = Math.max(inv, dist(a, fx.v)); sign = Math.max(sign, Math.min(dist(a, b), dist(a, b.map((v) => -v)))); }
      if (inv < tol) return { key: "invariant", eq, inv };
      if (eq < tol) return { key: "equivariant", eq, inv };
      if (fx.type === "axis" && sign < tol) return { key: "sign", eq, inv };
      if (fname === "avg-mlp" && group !== "Sn") {
        let cn = 0;
        for (let k = 0; k < nAvg; k++) { const gg = { angle: (2 * Math.PI * k) / nAvg, reflect: false, t: [0, 0], perm: null }; cn = Math.max(cn, dist(F(applyG(X, gg)).v, rhoOut(fx, gg))); }
        if (cn < tol) return { key: "cn", eq, inv };
      }
      return { key: "neither", eq, inv };
    }
    root.__test = { verdict: () => verdict().key, mismatch: () => { const fx = F(X); return dist(F(applyG(X, g)).v, rhoOut(fx, g)); }, set: (o) => { if (o.f) fname = o.f; if (o.shape) setShape(o.shape); if (o.group) { group = o.group; resetG(); } if (o.angle != null) g.angle = o.angle; if (o.n_avg) nAvg = o.n_avg; build(); draw(); }, get g() { return g; } };

    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "viz-svg" });
    svg.style.touchAction = "none";
    stage.append(svg);
    foot.append(legend([[L("x (drag the points)", "x（可以拖动这些点）"), cssv("--v1")], ["g·x", cssv("--v3")], ["f(x)", cssv("--v1")], [L("ρ(g) f(x): transform the output", "ρ(g) f(x)：把输出变过去"), cssv("--v2"), true], [L("f(g·x): transform the input first", "f(g·x)：先变输入"), cssv("--v4")]]));
    const c = cap(foot);
    const WHY = {
      centroid: ["The mean of the moved points is the moved mean: averaging is linear, so it commutes with g.", "把点变过去再求平均，等于先求平均再变过去：求平均是线性的，所以和 g 可交换。"],
      farthest: ["g does not change distances, so the same point stays farthest; the arrow to it turns with the cloud.", "g 不改变距离，所以最远的还是同一个点；指向它的箭头跟着点云一起转。"],
      "pca-axis": ["The principal line turns with the cloud, but a line has no arrowhead. Any rule that picks one end (here: x-component ≥ 0) flips for some g — equivariant only up to sign.", "主轴这条直线会跟着点云转，但直线没有箭头。任何「挑一头」的规则（这里取 x 分量 ≥ 0 的那头）都会对某些 g 翻转——只在差一个正负号的意义下等变。"],
      distances: ["Distances to the centroid do not change under rotation, reflection, translation or reordering (they are sorted): an invariant.", "各点到质心的距离在旋转、反射、平移、重排（已排序）下都不变：这是一个不变量。"],
      "max-x": ["The largest x-coordinate depends on where the axes are: it changes when the cloud turns, and not in a way a fixed ρ(g) could undo.", "最大的 x 坐标取决于坐标轴怎么摆：点云一转它就变，而且不是某个固定的 ρ(g) 能补回来的那种变法。"],
      mlp: ["A generic network on raw coordinates knows nothing about g: the two paths disagree. It can only learn the symmetry approximately, from augmented data.", "直接吃原始坐标的普通网络对 g 一无所知：两条路径的结果对不上。它只能靠数据增广近似地学到对称性。"],
      "canon-mlp": ["First move the cloud to a standard pose (centre it, align the principal axis, sort the points), then apply the network: x and g·x have the same standard pose, so the output is <b>invariant</b> — to rotation, mirroring, shifting and reordering. Moving the rotate slider therefore never changes the bars; <b>only dragging a point</b> (changing the shape) does, and the output can jump where the standard pose flips.", "先把点云摆到标准姿态（去质心、对齐主轴、给点排序），再过网络：x 和 g·x 的标准姿态相同，所以输出<b>不变</b>——对旋转、镜像、平移、重排都不变。因此拖动旋转滑块时柱子永远不动；<b>只有拖动某个点</b>（改变形状）才会改变输出，而且在标准姿态翻转的地方输出会跳变。"],
      "avg-mlp": ["Average the network over n rotated copies: exactly equivariant for rotations by multiples of 360°/n, only approximately in between; raise n and the error shrinks.", "把网络在 n 个旋转副本上取平均：对 360°/n 的整数倍旋转严格等变，中间的角度只是近似；n 越大误差越小。"],
    };
    function draw() {
      const C = colors(), nar = narrowOf(stage), S = 400, fx = F(X), gX = applyG(X, g), fgx = F(gX), gfx = rhoOut(fx, g);
      const isS = fx.type === "scalars", vd = verdict(), mis = dist(fgx.v, gfx);
      W = nar ? 400 : 660; H = nar ? 400 + 132 + (isS ? 118 : 0) : 400;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.innerHTML = "";
      const k = S / 6.2, PX = (p) => [S / 2 + p[0] * k, S / 2 - p[1] * k];
      geo = { k, S };
      svg.append(s("rect", { x: 1, y: 1, width: S - 2, height: S - 2, rx: 8, fill: C.cell, "fill-opacity": 0.55, stroke: C.border }));
      svg.append(ln(S / 2 - 14, S / 2, S / 2 + 14, S / 2, C.faint, 1.4)); svg.append(ln(S / 2, S / 2 - 14, S / 2, S / 2 + 14, C.faint, 1.4));
      svg.append(txt(S / 2 - 8, S / 2 + 18, L("origin", "原点"), { fill: C.muted, size: 12, anchor: "end" }));
      const poly = (Y, col) => svg.append(s("path", { d: Y.map((p, i) => { const q = PX(p); return `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`; }).join(""), fill: "none", stroke: col, "stroke-width": 1.6, "stroke-opacity": 0.45, "stroke-linejoin": "round" }));
      poly(X, C.v[0]); if (!g.perm) poly(gX, C.v[2]);
      if (group !== "Sn" && Math.abs(g.angle) > 0.02 && !g.reflect) { const c0 = centroidOf(X), r0 = Math.hypot(c0[0], c0[1]) * k, a0 = Math.atan2(c0[1], c0[0]); if (r0 > 12) { const a1 = a0 + g.angle, pt = (a) => `${(S / 2 + r0 * Math.cos(a)).toFixed(1)},${(S / 2 - r0 * Math.sin(a)).toFixed(1)}`; svg.append(s("path", { d: `M${pt(a0)}A${r0},${r0} 0 ${Math.abs(g.angle) > Math.PI ? 1 : 0} ${g.angle > 0 ? 0 : 1} ${pt(a1)}`, fill: "none", stroke: C.faint, "stroke-width": 1.3, "stroke-dasharray": "4 4" })); } }
      gX.forEach((p, j) => { const q = PX(p); svg.append(s("circle", { cx: q[0], cy: q[1], r: 5.5, fill: C.v[2], stroke: C.surface, "stroke-width": 1.2 })); if (g.perm) svg.append(txt(q[0] + 9, q[1] + 14, String(j + 1), { fill: C.v[2], size: 12, weight: 800 })); });
      X.forEach((p, i) => { const q = PX(p); svg.append(s("circle", { cx: q[0], cy: q[1], r: g.perm ? 3.5 : 6.5, fill: C.v[0], stroke: C.surface, "stroke-width": 1.2 })); if (g.perm) svg.append(txt(q[0] - 9, q[1] - 7, String(i + 1), { fill: C.v[0], size: 12, weight: 800, anchor: "end" })); });
      // outputs
      if (fx.type === "point") {
        const a = PX(fx.v), b = PX(gfx), d = PX(fgx.v);
        svg.append(s("circle", { cx: a[0], cy: a[1], r: 9, fill: "none", stroke: C.v[0], "stroke-width": 3 }));
        svg.append(s("circle", { cx: b[0], cy: b[1], r: 13, fill: "none", stroke: C.v[1], "stroke-width": 2.6, "stroke-dasharray": "5 4" }));
        svg.append(s("path", { d: `M${d[0] - 7},${d[1] - 7}L${d[0] + 7},${d[1] + 7}M${d[0] - 7},${d[1] + 7}L${d[0] + 7},${d[1] - 7}`, stroke: C.v[3], "stroke-width": 3.2, "stroke-linecap": "round" }));
      } else if (!isS) {
        const c0 = PX(centroidOf(X)), c1 = PX(centroidOf(gX)), tip = (o, v) => [o[0] + v[0] * k, o[1] - v[1] * k];
        const a = tip(c0, fx.v), b = tip(c1, gfx), d = tip(c1, fgx.v);
        svg.append(arrow(c0[0], c0[1], a[0], a[1], C.v[0], 3.4, 9));
        svg.append(arrow(c1[0], c1[1], d[0], d[1], C.v[3], 3.4, 9));
        svg.append(arrow(c1[0], c1[1], b[0], b[1], C.v[1], 2.6, 9, { "stroke-dasharray": "6 5" }));
      }
      // side panel: the commuting square, the mismatch, the verdict
      const sx = nar ? 6 : 412, sy = nar ? 408 : 8;
      const node = (x, y, label, col, w = 86) => { svg.append(s("rect", { x: x - w / 2, y: y - 15, width: w, height: 30, rx: 7, fill: C.surface, stroke: col, "stroke-width": 2 })); svg.append(txt(x, y + 4.5, label, { fill: C.fg, size: 13, weight: 700, anchor: "middle" })); };
      const ax = sx + (nar ? 44 : 48), bx = sx + (nar ? 168 : 190), ay = sy + 20, by = sy + 98;
      svg.append(arrow(ax + 46, ay, bx - 50, ay, C.v[2], 2, 7)); svg.append(txt((ax + bx) / 2, ay - 7, "g", { fill: C.v[2], size: 13, weight: 800, anchor: "middle" }));
      svg.append(arrow(ax, ay + 17, ax, by - 18, C.fg2, 2, 7)); svg.append(txt(ax + 7, (ay + by) / 2 + 4, "f", { fill: C.fg2, size: 13, weight: 800 }));
      svg.append(arrow(bx, ay + 17, bx, by - 18, C.v[3], 2, 7)); svg.append(txt(bx + 7, (ay + by) / 2 + 4, "f", { fill: C.v[3], size: 13, weight: 800 }));
      svg.append(arrow(ax + 46, by, bx - 50, by, C.v[1], 2, 7, { "stroke-dasharray": "5 4" })); svg.append(txt((ax + bx) / 2, by - 7, "ρ(g)", { fill: C.v[1], size: 13, weight: 800, anchor: "middle" }));
      node(ax, ay, "x", C.v[0]); node(bx, ay, "g·x", C.v[2]); node(ax, by, "f(x)", C.v[0]); node(bx, by, "f(g·x) ≟", C.v[3], 92);
      const tx = nar ? sx + 228 : sx + 4, ty = nar ? sy + 26 : sy + 150;
      const VT = { equivariant: [L("equivariant", "等变"), C.v[1]], invariant: [L("invariant", "不变"), C.v[1]], sign: [L("equivariant up to sign", "差一个正负号的等变"), C.v[2]], cn: [L(`equivariant to C${nAvg} only`, `只对 C${nAvg} 等变`), C.v[2]], neither: [L("neither", "两者都不是"), C.v[3]] }[vd.key];
      svg.append(txt(tx, ty, L("mismatch for this g", "当前这个 g 的偏差"), { fill: C.muted, size: 12 }));
      svg.append(txt(tx, ty + 24, nar ? n(mis, 3) : `‖f(g·x) − ρ(g)f(x)‖ = ${n(mis, 3)}`, { fill: mis < 1e-6 ? C.v[1] : C.v[3], size: nar ? 18 : 14, weight: 800 }));
      svg.append(txt(tx, ty + 52, L("verdict over 24 random g", "随机取 24 个 g 的结论"), { fill: C.muted, size: 12 }));
      svg.append(txt(tx, ty + 76, VT[0], { fill: VT[1], size: nar ? 13 : 17, weight: 800 }));
      if (isS) {
        const bx0 = nar ? 20 : sx + 6, bw = nar ? 360 : 232, by0 = nar ? sy + 240 : sy + 388, bh = nar ? 86 : 110, m = fx.v.length;
        const top = Math.max(1e-6, ...fx.v.map(Math.abs), ...fgx.v.map(Math.abs)), gw = bw / m, anyNeg = [...fx.v, ...fgx.v].some((v) => v < 0), y0 = anyNeg ? by0 - bh / 2 : by0, sc = (anyNeg ? bh / 2 : bh) / top;
        svg.append(ln(bx0, y0, bx0 + bw, y0, C.border2, 1.2));
        for (let i = 0; i < m; i++) {
          const w = Math.min(22, gw * 0.36), x = bx0 + gw * (i + 0.5);
          const bar = (v, dx, col) => svg.append(s("rect", { x: x + dx, y: v >= 0 ? y0 - v * sc : y0, width: w, height: Math.abs(v) * sc, fill: col, rx: 2 }));
          bar(fx.v[i], -w - 1, C.v[0]); bar(fgx.v[i], 1, C.v[3]);
        }
        svg.append(txt(bx0, by0 - bh - 8, L("outputs: f(x) blue, f(g·x) red", "输出：蓝色 f(x)，红色 f(g·x)"), { fill: C.muted, size: 12 }));
      }
      const gt = group === "Sn" ? L(`g = reorder the points as (${g.perm.map((j) => j + 1).join(" ")})`, `g = 把点重排成 (${g.perm.map((j) => j + 1).join(" ")})`) : L(`g = ${g.reflect ? "mirror, then " : ""}rotate ${n((g.angle * 180) / Math.PI, 0)}° about the origin${group === "SE2" ? `, then shift by (${n(g.t[0], 1)}, ${n(g.t[1], 1)})` : ""}`, `g = ${g.reflect ? "先镜像，再" : ""}绕原点转 ${n((g.angle * 180) / Math.PI, 0)}°${group === "SE2" ? `，再平移 (${n(g.t[0], 1)}, ${n(g.t[1], 1)})` : ""}`);
      const out = (v) => "(" + v.slice(0, 4).map((x) => n(x, 2)).join(", ") + (v.length > 4 ? ", …" : "") + ")";
      let extra = "";
      if (fname === "canon-mlp") { const cn = canonical(X); extra = L(` Third moment along the principal axis: ${n(cn.m3, 2)} (its sign picks the direction; near 0 the pose is about to flip).`, ` 沿主轴的三阶矩：${n(cn.m3, 2)}（它的正负决定方向；接近 0 时姿态就要翻转了）。`); }
      if (fname === "avg-mlp") extra = L(` n = ${nAvg}: zero mismatch at multiples of ${n(360 / nAvg, 0)}°; worst case over random angles ${n(vd.eq, 3)}.`, ` n = ${nAvg}：在 ${n(360 / nAvg, 0)}° 的整数倍处偏差为零；随机角度下最大偏差 ${n(vd.eq, 3)}。`);
      c.innerHTML = `${gt} · f(g·x) = ${out(fgx.v)} · ρ(g)f(x) = ${out(gfx)} · <b>${L("mismatch", "偏差")} ${n(mis, 3)}</b><br>${L(...WHY[fname])}${extra}`;
    }
    // drag the input points
    const world = (ev) => { const [x, y] = toView(svg, ev, W, H); return [(x - geo.S / 2) / geo.k, (geo.S / 2 - y) / geo.k]; };
    svg.addEventListener("pointerdown", (ev) => { if (!geo) return; const p = world(ev); let bd = 0.35; drag = -1; X.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; drag = i; } }); if (drag >= 0) { svg.setPointerCapture(ev.pointerId); ev.preventDefault(); } });
    svg.addEventListener("pointermove", (ev) => { if (drag < 0) return; let p = world(ev); const r = Math.hypot(p[0], p[1]); if (r > 2.35) p = [(p[0] / r) * 2.35, (p[1] / r) * 2.35]; X[drag] = p; draw(); });
    const up = () => (drag = -1);
    svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
    // controls
    const box = rowBox();
    function build() {
      box.innerHTML = "";
      const FL = { centroid: L("centroid", "质心"), farthest: L("vector to the farthest point", "指向最远点的向量"), "pca-axis": L("principal axis", "主轴方向"), distances: L("sorted distances to the centroid", "到质心的距离（排序）"), "max-x": L("largest x-coordinate", "最大的 x 坐标"), mlp: L("MLP on raw coordinates", "直接吃坐标的 MLP"), "canon-mlp": L("canonicalise, then MLP", "先规范化再过 MLP"), "avg-mlp": L("MLP averaged over n rotations", "在 n 个旋转上取平均的 MLP") };
      box.append(h("span", { class: "viz-lbl", style: "font-weight:700;font-size:14px" }, "f ="), picker(FNAMES.map((k) => [k, FL[k]]), fname, (v) => { fname = v; build(); draw(); }));
      box.append(picker([["L", L("shape: L", "形状：L")], ["triangle", L("shape: triangle", "形状：三角形")], ["arrow", L("shape: arrow", "形状：箭头")], ["random", L("shape: random", "形状：随机")]], shape, (v) => { setShape(v); draw(); }));
      box.append(seg([["SO2", "SO(2)"], ["O2", "O(2)"], ["SE2", "SE(2)"], ["Sn", "Sₙ"]], group, (v) => { group = v; resetG(); build(); draw(); }));
      if (group !== "Sn") box.append(wide(slider(L("rotate (°)", "旋转（°）"), { min: -180, max: 180, value: Math.round((g.angle * 180) / Math.PI), step: 1 }, (v) => { g.angle = (v * Math.PI) / 180; draw(); })));
      if (group === "O2") box.append(btn(L("mirror on/off", "镜像 开/关"), () => { g.reflect = !g.reflect; draw(); }));
      if (group === "SE2") box.append(wide(slider(L("shift x", "平移 x"), { min: -0.6, max: 0.6, value: g.t[0], step: 0.05 }, (v) => { g.t[0] = v; draw(); })), wide(slider(L("shift y", "平移 y"), { min: -0.6, max: 0.6, value: g.t[1], step: 0.05 }, (v) => { g.t[1] = v; draw(); })));
      if (group === "Sn") box.append(btn("🔀 " + L("shuffle the order", "打乱顺序"), () => { shuffle(); draw(); }, "primary"));
      if (fname === "avg-mlp") box.append(wide(slider(L("copies n", "副本数 n"), { min: 1, max: 16, value: nAvg, step: 1 }, (v) => { nAvg = Math.round(v); draw(); })));
      box.append(btn("↺ " + L("reset", "重置"), () => { setShape(shape); resetG(); build(); draw(); }));
    }
    ctrls.append(box);
    build();
    draw();
  }

  // ---- p4 lifting convolution on a small image
  const GK = { "sobel-x": [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], "sobel-y": [[-1, -2, -1], [0, 0, 0], [1, 2, 1]], blur: [[1, 1, 1], [1, 1, 1], [1, 1, 1]].map((r) => r.map((v) => v / 9)), sharpen: [[0, -1, 0], [-1, 5, -1], [0, -1, 0]] };
  const GI = { digit: ["0000000", "0111110", "0000010", "0000100", "0001000", "0010000", "0010000"].map((r) => [...r].map(Number)), edge: Array.from({ length: 7 }, () => [0, 0, 0, 1, 1, 1, 1]) };
  const rot90 = (M) => { const m = M.length; return M.map((row, i) => row.map((_, j) => M[j][m - 1 - i])); }; // counter-clockwise
  const rotK = (M, q) => { let R = M; for (let i = 0; i < ((q % 4) + 4) % 4; i++) R = rot90(R); return R; };
  const corr = (X, K) => { const m = X.length, k = K.length, o = m - k + 1; return Array.from({ length: o }, (_, i) => Array.from({ length: o }, (_, j) => { let a = 0; for (let u = 0; u < k; u++) for (let v = 0; v < k; v++) a += X[i + u][j + v] * K[u][v]; return a; })); };
  const maxDiff = (A, B) => { let d = 0; for (let i = 0; i < A.length; i++) for (let j = 0; j < A.length; j++) d = Math.max(d, Math.abs(A[i][j] - B[i][j])); return d; };
  const squareOK = (M, lo, hi) => Array.isArray(M) && M.length >= lo && M.length <= hi && M.every((r) => Array.isArray(r) && r.length === M.length && r.every((v) => Number.isFinite(v)));

  function equivGconv(root, cfg) {
    const { stage, ctrls, foot } = shell(root, cfg);
    const X0 = squareOK(cfg.input, 4, 9) ? cfg.input : GI[cfg.input] || GI.digit;
    let kname = squareOK(cfg.kernel, 2, 3) ? "custom" : GK[cfg.kernel] ? cfg.kernel : "sobel-x";
    let K = kname === "custom" ? cfg.kernel : GK[kname];
    // turn: how many quarter turns the input starts with (0–3). Default 1, so the figure opens on a
    // turned input and the read-out already shows that one ordinary filter is not equivariant.
    let q = Number.isInteger(cfg.turn) ? ((cfg.turn % 4) + 4) % 4 : 1, W = 660, H = 500;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "viz-svg" });
    stage.append(svg);
    const c = cap(foot);
    const check = () => {
      const A = [0, 1, 2, 3].map((k) => corr(X0, rotK(K, k))), Xq = rotK(X0, q), B = [0, 1, 2, 3].map((k) => corr(Xq, rotK(K, k)));
      let g = 0; for (let k = 0; k < 4; k++) g = Math.max(g, maxDiff(B[k], rotK(A[(((k - q) % 4) + 4) % 4], q)));
      const plain = maxDiff(corr(Xq, K), rotK(A[0], q));
      return { A, B, Xq, g, plain };
    };
    root.__test = { check: (qq) => { const keep = q; q = qq; const r = check(); q = keep; return { g: r.g, plain: r.plain }; }, setKernel: (nm) => { kname = nm; K = GK[nm]; draw(); } };
    function draw() {
      const C = colors(), nar = narrowOf(stage), { A, B, Xq, g, plain } = check();
      const m = X0.length, o = A[0].length, top = Math.max(1e-9, ...A.flat(2).map(Math.abs));
      const u = nar ? 1 : 1.12, ci = 13 * u, ck = 13 * u, cm = Math.min(17 * u, (nar ? 86 : 96) / o * 1); // cell sizes
      const mapW = cm * o, gap = nar ? (400 - 4 * mapW) / 5 : 22, gx0 = nar ? gap : 16;
      const y0 = 26, yA = y0 + m * ci + 58, yB = yA + mapW + 64, yC = nar ? yB + mapW + 62 : 0;
      const pm = nar ? cm : cm * 0.74, pmW = pm * o;
      W = nar ? 400 : 660; H = nar ? yC + mapW + 22 : Math.max(yB + mapW + 28, yA + 2 * (pmW + 36) + pmW + 22);
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.innerHTML = "";
      const img = (M, x, y, cs, sc, frame) => {
        M.forEach((row, i) => row.forEach((v, j) => { const t = clamp(Math.abs(v) / sc, 0, 1); svg.append(s("rect", { x: x + j * cs, y: y + i * cs, width: cs - 0.6, height: cs - 0.6, fill: v >= 0 ? mix(C.cell, C.v[0], t) : mix(C.cell, C.v[3], t) })); }));
        svg.append(s("rect", { x: x - 1, y: y - 1, width: M.length * cs + 1.4, height: M.length * cs + 1.4, fill: "none", stroke: frame || C.border2, "stroke-width": frame ? 2 : 1 }));
      };
      // row 0: original input, rotated input, the four filters
      const kx = nar ? 2 * m * ci + 3 * 14 : 2 * m * ci + 80, kmax = Math.max(1e-9, ...K.flat().map(Math.abs));
      svg.append(txt(gx0, 16, L("input x", "输入 x"), { fill: C.fg2, size: 12.5 }));
      img(X0, gx0, y0, ci, 1);
      const rx = gx0 + m * ci + (nar ? 16 : 44);
      svg.append(txt(rx, 16, q ? L(`g·x: ${q * 90}°`, `g·x：转 ${q * 90}°`) : "g·x", { fill: C.v[2], size: 12.5, weight: 700 }));
      img(Xq, rx, y0, ci, 1, C.v[2]);
      svg.append(txt(gx0 + kx, 16, L("one filter, 4 rotations", "一个卷积核，4 个朝向"), { fill: C.fg2, size: 12.5 }));
      for (let k = 0; k < 4; k++) { const x = gx0 + kx + (nar ? (k % 2) * (3 * ck + 26) : k * (3 * ck + 26)), y = y0 + (nar ? Math.floor(k / 2) * (3 * ck + 22) : 4); img(rotK(K, k), x, y, ck, kmax); svg.append(txt(x + 3 * ck + 3, y + 3 * ck - 2, "k" + "₀₁₂₃"[k], { fill: C.muted, size: 12 })); }
      // rows A and B: the four maps of x and of g·x, with the channel-shift arrows
      const mx = (k) => gx0 + k * (mapW + gap);
      svg.append(txt(gx0, yA - 10, L("maps of the original x: one per filter rotation", "原始 x 的四张特征图：每个朝向一张"), { fill: C.fg2, size: 12.5 }));
      svg.append(txt(gx0, yB + mapW + 17, q ? L(`maps of g·x: each one turned ${q * 90}° and moved ${q} channel${q > 1 ? "s" : ""} along`, `g·x 的特征图：每张都转了 ${q * 90}°，并沿通道挪了 ${q} 格`) : L("maps of g·x (no rotation yet: the same maps)", "g·x 的特征图（还没旋转：和上面一样）"), { fill: C.v[2], size: 12.5, weight: 700 }));
      for (let k = 0; k < 4; k++) {
        img(A[k], mx(k), yA, cm, top); svg.append(txt(mx(k) + mapW / 2, yA + mapW + 14, "k = " + k, { fill: C.muted, size: 12, anchor: "middle" }));
        img(B[k], mx(k), yB, cm, top, C.v[2]);
        const from = (((k - q) % 4) + 4) % 4;
        svg.append(arrow(mx(from) + mapW / 2, yA + mapW + 20, mx(k) + mapW / 2, yB - 5, C.v[2], 1.8, 7, { "stroke-opacity": 0.9 }));
      }
      // plain convolution comparison
      const px = nar ? gap : 4 * (mapW + gap) + 40, py = nar ? yC : yA, step = nar ? mapW + gap : 0, vstep = nar ? 0 : pmW + 36;
      const P1 = corr(Xq, K), P2 = rotK(A[0], q), D = P1.map((r, i) => r.map((v, j) => v - P2[i][j]));
      svg.append(txt(px, py - 10, L("plain convolution, 1 filter", "普通卷积（一个核）"), { fill: C.fg2, size: 12 }));
      [[P1, L("conv(g·x)", "conv(g·x)"), C.v[3]], [P2, L("g·conv(x)", "g·conv(x)"), C.v[1]], [D, L("difference", "两者之差"), null]].forEach(([M, lab, fr], i) => { const x = px + i * step, y = py + i * vstep; img(M, x, y, pm, top, fr); svg.append(txt(x + pmW / 2, y + pmW + 14, lab, { fill: fr || C.muted, size: 12, anchor: "middle", weight: 700 })); });
      c.innerHTML = L(`Map k is the image correlated with the filter turned by k·90°. Turn the input by 90° and every map turns <b>and</b> moves one channel along: map k of g·x = map k−1 of x, rotated. Checked numerically: <b>max difference ${n(g, 3)}</b>. One ordinary filter cannot do this: conv(g·x) vs g·conv(x) differ by up to <b>${n(plain, 3)}</b>${plain < 1e-9 ? (q === 0 ? " (zero here because the input has not been turned yet: turn it)" : " (zero here only because this filter itself has 90° symmetry)") : ""}.`,
        `第 k 张特征图是图像与「转了 k·90° 的卷积核」做相关的结果。把输入转 90°，每张图都会跟着转，<b>并且</b>沿通道挪一格：g·x 的第 k 张 = x 的第 k−1 张再旋转。数值检验：<b>最大差 ${n(g, 3)}</b>。只有一个核的普通卷积做不到：conv(g·x) 与 g·conv(x) 最大相差 <b>${n(plain, 3)}</b>${plain < 1e-9 ? (q === 0 ? "（这里为零，是因为输入还没有转：先转一下）" : "（这里为零，只是因为这个核本身有 90° 对称）") : ""}。`);
    }
    ctrls.append(btn("⟲ " + L("rotate input 90°", "把输入转 90°"), () => { q = (q + 1) % 4; draw(); }, "primary"));
    const opts = [["sobel-x", L("filter: Sobel x", "卷积核：Sobel x")], ["sobel-y", L("filter: Sobel y", "卷积核：Sobel y")], ["blur", L("filter: blur (symmetric)", "卷积核：模糊（对称）")], ["sharpen", L("filter: sharpen (symmetric)", "卷积核：锐化（对称）")]];
    if (kname === "custom") opts.unshift(["custom", L("filter: from the lesson", "卷积核：课文给定")]);
    const custom = K;
    ctrls.append(picker(opts, kname, (v) => { kname = v; K = v === "custom" ? custom : GK[v]; draw(); }));
    ctrls.append(btn("↺ " + L("reset", "重置"), () => { q = 0; draw(); }));
    draw();
  }

  Viz.register("equiv", (root, cfg) => (cfg.mode === "gconv" ? equivGconv : equivPoints)(root, cfg));
})();
