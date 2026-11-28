"use strict";
// Teaching widgets, part 6 (PLAN R17): `phase` (phase portraits of 2-state systems),
// `qp2d` (a two-variable QP: weighted vs strict task priorities, limits and the KKT
// picture), `mpc` (receding-horizon control of a cart with an input limit) and
// `nullspace` (null-space motion of a redundant planar arm). Registered into viz.js;
// fields documented in CONTENT_SPEC.md ("Physical and foundations widgets").
(() => {
  if (!window.Viz) return;
  const { h, s, cssv, mix, clamp, fmt, T, animator, shell, slider, btn, seg, playButton, axes, legend, arrowPath, mathNodes } = Viz.util;
  const zh = () => (document.documentElement.lang || "").startsWith("zh");
  const L = (en, cn) => (zh() ? cn : en);
  const cap = (foot) => { const c = h("div", { class: "viz-caption" }); foot.append(c); return c; };
  // Caption lines with "$…$" typeset by KaTeX; a node (e.g. a muted hint) is appended as is.
  const capSet = (el, ...lines) => el.replaceChildren(...lines.filter((l) => l != null && l !== "").flatMap((l, i) => [...(i ? [h("br")] : []), ...(typeof l === "string" ? mathNodes(l) : [l])]));
  const hint = (str) => h("span", { style: "color:var(--muted)" }, str);
  const bold = (str) => h("b", {}, str);
  // Keep an SVG label inside [x0, x1] × [y0, y1] (measured after it is drawn) and away from
  // the boxes in `taken`; candidates are offsets tried in order. Returns the box it took.
  function place(t, box, taken = [], cands = [[0, 0]]) {
    let bb;
    try { bb = t.getBBox(); } catch { return null; }
    if (!bb.width) return null;
    const x = +t.getAttribute("x"), y = +t.getAttribute("y");
    const hit = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
    const fit = (b) => { const dx = Math.max(0, box[0] - b.x) - Math.max(0, b.x + b.width - box[2]), dy = Math.max(0, box[1] - b.y) - Math.max(0, b.y + b.height - box[3]); return [dx, dy]; };
    let first = null;
    for (const [ox, oy] of cands) {
      const c0 = { x: bb.x + ox, y: bb.y + oy, width: bb.width, height: bb.height };
      const [dx, dy] = fit(c0), c = { ...c0, x: c0.x + dx, y: c0.y + dy };
      first ||= [c, ox + dx, oy + dy];
      if (!taken.some((b) => hit(c, b))) { t.setAttribute("x", x + ox + dx); t.setAttribute("y", y + oy + dy); return c; }
    }
    t.setAttribute("x", x + first[1]); t.setAttribute("y", y + first[2]);
    return first[0];
  }
  const finite = (v) => typeof v === "number" && isFinite(v);
  // Fixed decimals without "-0.00"; Unicode minus.
  const nf = (v, d = 2) => {
    if (!isFinite(v)) return "—";
    let t = v.toFixed(d);
    if (/^-0\.?0*$/.test(t)) t = t.slice(1);
    return t.replace("-", "−");
  };
  // Pointer position in viewBox units (the SVG keeps its aspect ratio).
  const ptr = (svg, ev, W, H) => { const r = svg.getBoundingClientRect(); return [((ev.clientX - r.left) / r.width) * W, ((ev.clientY - r.top) / r.height) * H]; };
  const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
  let uid = 0;
  const syncPlay = (an, play) => { an.start(); play.textContent = "❚❚ " + T().pause; };

  // Gaussian elimination with partial pivoting; null when (numerically) singular.
  function solveLin(M, b) {
    const n = b.length, A = M.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null;
      [A[c], A[p]] = [A[p], A[c]];
      for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (f) for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) { let v = A[r][n]; for (let k = r + 1; k < n; k++) v -= A[r][k] * x[k]; x[r] = v / A[r][r]; }
    return x;
  }
  // Cholesky solve of an SPD system; null if not positive definite.
  function cholSolve(M, b) {
    const n = b.length, C = M.map((r) => r.slice());
    for (let j = 0; j < n; j++) {
      let d = C[j][j];
      for (let k = 0; k < j; k++) d -= C[j][k] * C[j][k];
      if (!(d > 1e-14)) return null;
      d = Math.sqrt(d); C[j][j] = d;
      for (let i = j + 1; i < n; i++) { let v = C[i][j]; for (let k = 0; k < j; k++) v -= C[i][k] * C[j][k]; C[i][j] = v / d; }
    }
    const y = new Array(n), x = new Array(n);
    for (let i = 0; i < n; i++) { let v = b[i]; for (let k = 0; k < i; k++) v -= C[i][k] * y[k]; y[i] = v / C[i][i]; }
    for (let i = n - 1; i >= 0; i--) { let v = y[i]; for (let k = i + 1; k < n; k++) v -= C[k][i] * x[k]; x[i] = v / C[i][i]; }
    return x;
  }
  // Eigenvalues (and real eigenvectors) of a 2×2 matrix.
  function eig2(A) {
    const [[a, b], [c, d]] = A, tr = a + d, det = a * d - b * c, disc = tr * tr - 4 * det;
    if (disc < -1e-12) { const re = tr / 2, im = Math.sqrt(-disc) / 2; return { tr, det, real: false, l: [[re, im], [re, -im]], vecs: [] }; }
    const sq = Math.sqrt(Math.max(0, disc)), l1 = (tr + sq) / 2, l2 = (tr - sq) / 2;
    const vec = (l) => {
      const v = Math.abs(b) > 1e-9 ? [b, l - a] : Math.abs(c) > 1e-9 ? [l - d, c] : Math.abs(l - a) <= Math.abs(l - d) ? [1, 0] : [0, 1];
      const nn = Math.hypot(v[0], v[1]) || 1;
      return [v[0] / nn, v[1] / nn];
    };
    const scalar = sq < 1e-9 && Math.abs(b) < 1e-9 && Math.abs(c) < 1e-9; // λI: every direction is an eigenvector
    return { tr, det, real: true, l: [[l1, 0], [l2, 0]], vecs: scalar ? [] : sq > 1e-9 ? [vec(l1), vec(l2)] : [vec(l1)] };
  }
  function classify(e) {
    if (Math.abs(e.det) < 1e-9) return { key: "degenerate", en: "zero eigenvalue", zh: "有零特征值" };
    if (e.det < 0) return { key: "saddle", en: "saddle (unstable)", zh: "鞍点（不稳定）" };
    if (e.real) return e.tr < 0 ? { key: "snode", en: "stable node", zh: "稳定结点" } : { key: "unode", en: "unstable node", zh: "不稳定结点" };
    if (Math.abs(e.tr) < 1e-9) return { key: "centre", en: "centre", zh: "中心" };
    return e.tr < 0 ? { key: "sfocus", en: "stable focus", zh: "稳定焦点" } : { key: "ufocus", en: "unstable focus", zh: "不稳定焦点" };
  }
  const eigStr = (e) => e.real
    ? (Math.abs(e.l[0][0] - e.l[1][0]) < 1e-9 ? `λ₁ = λ₂ = ${nf(e.l[0][0])}` : `λ₁ = ${nf(e.l[0][0])}, λ₂ = ${nf(e.l[1][0])}`)
    : `λ = ${nf(e.l[0][0])} ± ${nf(e.l[0][1])}i`;
  // Wrap a label into lines no wider than `max` em (CJK ≈ 1 em, Latin ≈ 0.55 em).
  function wrap(text, max) {
    const wid = (str) => [...str].reduce((a, ch) => a + (ch.codePointAt(0) > 0x2e80 ? 1 : 0.55), 0);
    const tokens = String(text).match(/[⺀-￿]|[^\s⺀-￿]+|\s+/g) || [];
    const lines = [];
    let cur = "";
    for (const tk of tokens) {
      if (/^\s+$/.test(tk)) { if (cur) cur += " "; continue; }
      if (cur && wid(cur + tk) > max) { lines.push(cur.trim()); cur = tk; } else cur += tk;
    }
    if (cur.trim()) lines.push(cur.trim());
    return lines.length ? lines : [""];
  }
  const svgText = (x, y, str, attrs = {}) => s("text", { x, y, ...attrs }, str);

  // ================================================================== phase
  // Phase portrait of ẋ = f(x) with x = (position, velocity). Linear presets show the
  // eigenvectors, the eigenvalues in the complex plane and the classification; the
  // pendulum (θ̈ = −ω² sin θ − b θ̇, ω = √(g/l)) shows its two linearisations (hanging
  // θ = 0, upside down θ = ±π). For inverted/pd, ω is the LIPM ω = √(g/z₀).
  Viz.register("phase", (root, cfg) => {
    const { stage, ctrls, foot } = shell(root, cfg);
    const PRESETS = ["spring", "pendulum", "inverted", "pd", "custom"];
    const preset = PRESETS.includes(cfg.preset) ? cfg.preset : "spring";
    const pend = preset === "pendulum";
    // inverted/pd describe the LIPM (x = c − p) unless system = "joint": one upright joint,
    // θ̈ = ω₀²θ + u with ω₀² = m g l / I (the same matrix, other names).
    const joint = cfg.system === "joint" && (preset === "inverted" || preset === "pd");
    const lipm = (preset === "inverted" || preset === "pd") && !joint;
    const P = {
      k: finite(cfg.k) ? cfg.k : 4,
      b: finite(cfg.b) ? cfg.b : pend ? 0.3 : 0.5,
      // pendulum: ω = √(g/l), default the pid widget's 0.5 m pendulum; inverted/pd: LIPM ω
      omega: finite(cfg.omega) && cfg.omega > 0 ? cfg.omega : pend ? (finite(cfg.k) && cfg.k > 0 ? Math.sqrt(cfg.k) : Math.sqrt(9.81 / 0.5)) : 3.3,
      kp: finite(cfg.kp) ? cfg.kp : 20,
      kd: finite(cfg.kd) ? cfg.kd : 4,
    };
    const Ac = Array.isArray(cfg.A) && cfg.A.length === 2 && cfg.A.every((r) => Array.isArray(r) && r.length === 2 && r.every(finite)) ? cfg.A.map((r) => r.slice()) : [[0, 1], [-2, -0.5]];
    const RANGE = { spring: [2, 4], pendulum: [7, 12], inverted: [0.3, 1], pd: [0.3, 1], custom: [2, 2] }[preset];
    const [XM, VM] = Array.isArray(cfg.range) && cfg.range.length === 2 && cfg.range.every((v) => finite(v) && v > 0) ? cfg.range : RANGE;
    const STARTS = {
      spring: [[1.5, 0], [-1, 3]],
      pendulum: [[1, 0], [2.8, 0], [-2 * Math.PI + 0.3, 10.5]],
      inverted: [[0.1, 0], [0.1, -0.33], [0.1, -0.5], [-0.2, 0.5]],
      pd: [[0.2, 0], [-0.2, 0.8]],
      custom: [[1.5, 0.5], [-1.2, -1]],
    }[preset];
    const starts = (Array.isArray(cfg.starts) ? cfg.starts.filter((p) => Array.isArray(p) && p.length === 2 && p.every(finite)) : STARTS).slice(0, 6);
    const speed = { spring: 1, pendulum: 1, inverted: 0.25, pd: 0.5, custom: 1 }[preset];
    const linA = () => preset === "spring" ? [[0, 1], [-P.k, -P.b]]
      : preset === "inverted" ? [[0, 1], [P.omega ** 2, 0]]
      : preset === "pd" ? [[0, 1], [P.omega ** 2 - P.kp, -P.kd]]
      : preset === "custom" ? Ac : null;
    let A = linA();
    const f = (x, v) => pend ? [v, -(P.omega ** 2) * Math.sin(x) - P.b * v] : [A[0][0] * x + A[0][1] * v, A[1][0] * x + A[1][1] * v];
    const HS = 0.01, TMAX = 25;
    function path(x0) {
      const pts = [x0.slice()];
      let [x, v] = x0;
      for (let i = 0; i < TMAX / HS; i++) {
        const k1 = f(x, v), k2 = f(x + (HS / 2) * k1[0], v + (HS / 2) * k1[1]), k3 = f(x + (HS / 2) * k2[0], v + (HS / 2) * k2[1]), k4 = f(x + HS * k3[0], v + HS * k3[1]);
        x += (HS / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        v += (HS / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        if (!isFinite(x) || !isFinite(v)) break;
        pts.push([x, v]);
        if (Math.abs(x) > 1.5 * XM || Math.abs(v) > 1.5 * VM) break;
        const fx = f(x, v);
        if (Math.hypot(fx[0] / XM, fx[1] / VM) < 2e-4) break; // at rest
      }
      return pts;
    }
    let trajs = starts.map((st) => ({ st, pts: path(st), i: 0 }));
    const recompute = () => trajs.forEach((tr) => { tr.pts = path(tr.st); tr.i = Math.min(tr.i, tr.pts.length - 1); });

    const W = 480, HH = 410, AW = 480, pad = { l: 56, r: 12, t: 14, b: 44 };
    const PW = AW - pad.l - pad.r, PH = HH - pad.t - pad.b;
    // Plot and eigenvalue panel side by side; the panel wraps below the plot on a phone.
    // overflow hidden: trajectories leave the plot (clipped), and their ink must not widen the page
    const svg = s("svg", { viewBox: `0 0 ${W} ${HH}`, class: "viz-svg", style: "flex:1 1 340px;max-width:560px;min-width:0;overflow:hidden" });
    const isvg = s("svg", { viewBox: "0 0 190 330", class: "viz-svg", style: "flex:0 1 190px;max-width:230px;min-width:0" });
    stage.append(h("div", { style: "display:flex;flex-wrap:wrap;gap:6px 10px;justify-content:center;align-items:flex-start;width:100%" }, svg, isvg));
    const c = cap(foot);
    const cid = "ph" + ++uid;
    // `xlabel` / `ylabel` (optional, any preset) replace the preset's axis names; for `custom` they
    // also switch the caption to wording without "oscillation / energy / damping" (a non-mechanical system)
    const ownAxes = typeof cfg.xlabel === "string" || typeof cfg.ylabel === "string";
    const generic = ownAxes && preset === "custom";
    const xlabel = typeof cfg.xlabel === "string" ? cfg.xlabel : pend || joint ? L("angle $\\theta$ (rad)", "角度 $\\theta$（rad）") : lipm ? L("$c - p$ (m)", "$c - p$（m）") : L("position $x$", "位置 $x$");
    const ylabel = typeof cfg.ylabel === "string" ? cfg.ylabel : pend || joint ? L("$\\dot\\theta$ (rad/s)", "$\\dot\\theta$（rad/s）") : lipm ? L("$\\dot c$ (m/s)", "$\\dot c$（m/s）") : L("velocity $\\dot x$", "速度 $\\dot x$");
    const Xi = (px) => -XM + ((px - pad.l) / PW) * 2 * XM, Yi = (py) => VM - ((py - pad.t) / PH) * 2 * VM;
    let X = Xi, Y = Yi;
    const gDyn = s("g", { "clip-path": `url(#${cid})` });
    const TRC = ["--v3", "--v5", "--v6", "--v2", "--v4", "--v1"];

    function drawStatic() {
      svg.innerHTML = "";
      svg.append(s("defs", {}, s("clipPath", { id: cid }, s("rect", { x: pad.l, y: pad.t, width: PW, height: PH }))));
      ({ X, Y } = axes(svg, AW, HH, pad, [-XM, XM], [-VM, VM], xlabel, ylabel));
      // Vector field: unit-length arrows tinted by speed.
      const gF = s("g", { "clip-path": `url(#${cid})` });
      const nx = 19, ny = 15, cw = PW / nx, ch = PH / ny, sx = PW / (2 * XM), sy = PH / (2 * VM);
      const cells = [];
      let mx = 0;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const px = pad.l + (i + 0.5) * cw, py = pad.t + (j + 0.5) * ch;
        const [fx, fv] = f(Xi(px), Yi(py));
        const dx = fx * sx, dy = -fv * sy, sp = Math.hypot(dx, dy);
        cells.push([px, py, dx, dy, sp]);
        if (isFinite(sp)) mx = Math.max(mx, sp);
      }
      const len = 0.42 * Math.min(cw, ch), c0 = cssv("--faint"), c1 = cssv("--v1");
      for (const [px, py, dx, dy, sp] of cells) {
        if (!(sp > 1e-9) || !isFinite(sp)) { gF.append(s("circle", { cx: px, cy: py, r: 1.5, fill: c0 })); continue; }
        const t = Math.sqrt(sp / mx), ux = (dx / sp) * len, uy = (dy / sp) * len;
        gF.append(s("path", { d: arrowPath(px - ux / 2, py - uy / 2, px + ux / 2, py + uy / 2, 4.5), stroke: mix(c0, c1, t), "stroke-width": 1.3, fill: "none", opacity: (0.35 + 0.5 * t).toFixed(2), "stroke-linecap": "round" }));
      }
      svg.append(gF);
      // Equilibria and eigenvector lines.
      const gE = s("g", { "clip-path": `url(#${cid})` });
      const okC = cssv("--v2"), badC = cssv("--v4");
      const eqMark = (x, stable, centre) => gE.append(s("circle", { cx: X(x), cy: Y(0), r: 6.5, fill: stable ? okC : cssv("--surface"), stroke: centre ? cssv("--fg") : stable ? cssv("--surface") : badC, "stroke-width": 2.5 }));
      const eigLine = (x0, u, l, frac, label = true) => {
        const lim = Math.min(Math.abs(u[0]) > 1e-9 ? XM / Math.abs(u[0]) : Infinity, Math.abs(u[1]) > 1e-9 ? VM / Math.abs(u[1]) : Infinity);
        const tt = frac * lim;
        const col = l < 0 ? okC : badC;
        gE.append(s("line", { x1: X(x0 - tt * u[0]), y1: Y(-tt * u[1]), x2: X(x0 + tt * u[0]), y2: Y(tt * u[1]), stroke: col, "stroke-width": 2, "stroke-dasharray": "8 5" }));
        const te = 0.8 * Math.min(tt, lim), lx = X(x0 + te * u[0]), ly = Y(te * u[1]);
        const right = lx > pad.l + PW / 2;
        if (label) gE.append(svgText(lx + (right ? -8 : 8), ly + (u[0] * u[1] >= 0 === right ? 16 : -8), `λ = ${nf(l)}`, { class: "label", fill: col, "font-size": 13, "text-anchor": right ? "end" : "start" }));
      };
      if (!pend) {
        const e = eig2(A), k = classify(e);
        if (e.real) e.vecs.forEach((u, i) => eigLine(0, u, e.l[i][0], 1.3));
        if (k.key !== "degenerate") eqMark(0, k.key === "snode" || k.key === "sfocus", k.key === "centre");
      } else {
        const eS = eig2([[0, 1], [P.omega ** 2, -P.b]]), km = Math.floor(XM / Math.PI + 1e-9);
        for (let kk = -km; kk <= km; kk++) {
          const th = kk * Math.PI;
          if (Math.abs(th) > XM + 1e-9) continue;
          if (kk % 2 !== 0) eS.vecs.forEach((u, i) => eigLine(th, u, eS.l[i][0], 0.22, kk === 1)); // label one saddle only
          eqMark(th, kk % 2 === 0 && P.b > 0, kk % 2 === 0 && P.b <= 0);
        }
      }
      svg.append(gE);
      svg.append(gDyn);
      drawInset();
    }
    function drawInset() {
      isvg.innerHTML = "";
      const svg = isvg; // the panel has its own SVG
      const ix = 18, iy = 24, isz = 150, icx = ix + isz / 2, icy = iy + isz / 2;
      const sets = pend
        ? [[eig2([[0, 1], [-(P.omega ** 2), -P.b]]), "--v1", "θ = 0"], [eig2([[0, 1], [P.omega ** 2, -P.b]]), "--v4", "θ = ±π"]]
        : [[eig2(A), "--v1", ""]];
      let sc = 1;
      for (const [e] of sets) for (const [re, im] of e.l) sc = Math.max(sc, Math.abs(re), Math.abs(im));
      sc *= 1.35;
      const ps = isz / 2 / sc;
      svg.append(svgText(ix, iy - 8, L("eigenvalues (complex plane)", "特征值（复平面）"), { class: "label", "font-size": 12.5 }));
      svg.append(s("rect", { x: ix, y: iy, width: isz / 2, height: isz, fill: cssv("--v2"), "fill-opacity": 0.09 }));
      svg.append(s("rect", { x: ix, y: iy, width: isz, height: isz, fill: "none", stroke: cssv("--border-2") }));
      svg.append(s("line", { x1: ix, x2: ix + isz, y1: icy, y2: icy, stroke: cssv("--faint") }));
      svg.append(s("line", { x1: icx, x2: icx, y1: iy, y2: iy + isz, stroke: cssv("--faint") }));
      svg.append(svgText(ix + isz - 4, icy - 5, "Re", { class: "tick", "text-anchor": "end" }));
      svg.append(svgText(icx + 4, iy + 13, "Im", { class: "tick" }));
      svg.append(svgText(ix, iy + isz + 15, L("◧ stable: Re λ < 0", "◧ 稳定：Re λ < 0"), { class: "tick", fill: cssv("--v2") }));
      svg.append(svgText(ix + isz, iy + isz + 15, `±${fmt(sc)}`, { class: "tick", "text-anchor": "end" }));
      for (const [e, col] of sets) for (const [re, im] of e.l) svg.append(s("circle", { cx: icx + re * ps, cy: icy - im * ps, r: 5.5, fill: cssv(col), stroke: cssv("--surface"), "stroke-width": 1.5 }));
      let y = iy + isz + 40;
      for (const [e, col, lab] of sets) {
        const k = classify(e);
        if (lab) { svg.append(s("circle", { cx: ix + 5, cy: y - 4.5, r: 5, fill: cssv(col) })); }
        svg.append(svgText(ix + (lab ? 15 : 0), y, (lab ? lab + ": " : "") + L(k.en, k.zh), { class: "label strong", "font-size": 13 }));
        y += 18;
        const es = eigStr(e);
        for (const part of es.includes(", ") ? es.split(", ") : [es]) { svg.append(svgText(ix + (lab ? 15 : 0), y, part, { class: "tick", "font-size": 12.5 })); y += 16; }
        y += 8;
      }
      isvg.setAttribute("viewBox", `0 0 190 ${Math.ceil(y)}`);
    }
    const poly = (pts, a, b, step = 1) => {
      let d = "";
      for (let i = a; i <= b; i += step) d += (d ? "L" : "M") + X(pts[i][0]).toFixed(1) + "," + Y(pts[i][1]).toFixed(1);
      if ((b - a) % step) d += "L" + X(pts[b][0]).toFixed(1) + "," + Y(pts[b][1]).toFixed(1);
      return d;
    };
    function drawDyn() {
      gDyn.innerHTML = "";
      trajs.forEach((tr, k) => {
        const col = cssv(TRC[k % TRC.length]), pts = tr.pts, i = Math.min(pts.length - 1, Math.floor(tr.i));
        if (pts.length > 1) gDyn.append(s("path", { d: poly(pts, 0, pts.length - 1, 3), fill: "none", stroke: col, "stroke-width": 1.5, "stroke-opacity": 0.3 }));
        const span = 150, sg = 25;
        for (let a = Math.max(0, i - span); a < i; a += sg) {
          const b = Math.min(i, a + sg);
          gDyn.append(s("path", { d: poly(pts, a, b), fill: "none", stroke: col, "stroke-width": 2.8, "stroke-linecap": "round", "stroke-opacity": (0.2 + (0.8 * (b - (i - span))) / span).toFixed(2) }));
        }
        gDyn.append(s("circle", { cx: X(tr.st[0]), cy: Y(tr.st[1]), r: 3.5, fill: "none", stroke: col, "stroke-width": 1.6 }));
        gDyn.append(s("circle", { cx: X(pts[i][0]), cy: Y(pts[i][1]), r: 6.5, fill: col, stroke: cssv("--surface"), "stroke-width": 2 }));
      });
    }
    function caption() {
      const q = joint ? "\\theta" : "(c - p)", qd = joint ? "\\dot\\theta" : "\\dot c", qdd = joint ? "\\ddot\\theta" : "\\ddot c";
      const w0 = joint ? L(`$\\omega_0^2 = m g l / I$, $\\omega_0$ = ${nf(P.omega)} s⁻¹`, `$\\omega_0^2 = m g l / I$，$\\omega_0$ = ${nf(P.omega)} s⁻¹`) : `$\\omega_0 = \\sqrt{g_0/z_0}$ = ${nf(P.omega)} s⁻¹`;
      const eqs = {
        spring: `$\\ddot x = -k x - b \\dot x$ ($k$ = ${nf(P.k, 1)} s⁻², $b$ = ${nf(P.b)} s⁻¹)`,
        pendulum: `$\\ddot\\theta = -\\omega^2 \\sin\\theta - b \\dot\\theta$ ($\\omega = \\sqrt{g/l}$ = ${nf(P.omega)} s⁻¹, $b$ = ${nf(P.b)} s⁻¹)`,
        inverted: `$${qdd} = \\omega_0^2 ${q}$ (${w0})`,
        pd: `$${qdd} = \\omega_0^2 ${q} + u$, $u = -K_p ${q} - K_d ${qd}$ (${w0}, $\\omega_0^2$ = ${nf(P.omega ** 2, 1)}, $K_p$ = ${nf(P.kp, 1)}, $K_d$ = ${nf(P.kd, 1)})`,
        custom: `$\\dot x = A x$, A = [[${nf(Ac[0][0], 1)}, ${nf(Ac[0][1], 1)}], [${nf(Ac[1][0], 1)}, ${nf(Ac[1][1], 1)}]]`,
      }[preset];
      const MEAN = {
        sfocus: L("Trajectories spiral into the equilibrium: it oscillates, and the oscillation dies out.", "轨迹螺旋着进入平衡点：会振荡，但振荡逐渐消失。"),
        snode: L("Trajectories slide into the equilibrium without oscillating (heavily damped).", "轨迹不振荡地滑进平衡点（阻尼很大）。"),
        ufocus: L("Trajectories spiral outwards: the oscillation grows.", "轨迹向外螺旋：振荡越来越大。"),
        unode: L("Trajectories run away from the equilibrium without oscillating.", "轨迹不振荡地远离平衡点。"),
        centre: L("Closed orbits: it oscillates forever with constant energy (no damping).", "闭合轨道：能量不变，永远振荡（没有阻尼）。"),
        saddle: L("A saddle: almost every trajectory runs away; only those starting exactly on the stable eigenvector (green) come in.", "鞍点：几乎所有轨迹都会跑掉，只有恰好从稳定特征向量（绿线）上出发的轨迹会进来。"),
        degenerate: L("A zero eigenvalue: a whole line of equilibria; nothing pulls the state back along it.", "有零特征值：一整条平衡点，沿这条线没有任何力把状态拉回来。"),
      };
      const tip = hint(L("Tap the plot to start a trajectory; drag the sliders and watch the arrows and eigenvalues move.", "点图中任意位置放一条新轨迹；拖动滑块，看箭头和特征值怎么变。"));
      if (pend) {
        const k0 = classify(eig2([[0, 1], [-(P.omega ** 2), -P.b]]));
        capSet(c, `${eqs} · $\\theta = 0$: ${L(k0.en, k0.zh)} · $\\theta = \\pm\\pi$: ${L("saddle", "鞍点")}`, L("Hanging down ($\\theta = 0$) the pendulum swings around a stable point; upside down ($\\theta = \\pm\\pi$) it is a saddle — the same picture as the LIPM. Trajectories that start with enough speed go over the top.", "竖直向下（$\\theta = 0$）时摆在稳定点附近摆动；倒立（$\\theta = \\pm\\pi$）时是鞍点——和 LIPM 是同一张图。初速度够大的轨迹会翻过顶点。"), tip);
        return;
      }
      const GEN = {
        sfocus: L("Trajectories spiral into the equilibrium (complex eigenvalues with negative real part).", "轨迹螺旋着进入平衡点（复特征值，实部为负）。"),
        snode: L("Trajectories approach the equilibrium without circling it (real negative eigenvalues).", "轨迹不绕圈地趋向平衡点（实特征值，均为负）。"),
        ufocus: L("Trajectories spiral outwards (complex eigenvalues with positive real part).", "轨迹向外螺旋（复特征值，实部为正）。"),
        unode: L("Trajectories run away from the equilibrium without circling it.", "轨迹不绕圈地远离平衡点。"),
        centre: L("Closed orbits: the state circles the equilibrium forever, neither growing nor shrinking (purely imaginary eigenvalues).", "闭合轨道：状态绕平衡点一直转，既不变大也不变小（纯虚特征值）。"),
        saddle: MEAN.saddle,
        degenerate: L("A zero eigenvalue: a whole line of equilibria; nothing pulls the state back along it.", "有零特征值：一整条平衡点，沿这条线没有任何力把状态拉回来。"),
      };
      const e = eig2(A), k = classify(e);
      let more = (generic ? GEN : MEAN)[k.key];
      if (preset === "inverted") more += " " + (lipm
        ? L("For the LIPM the stable eigenvector $\\dot c = -\\omega_0 (c - p)$ is the capture-point line: start on it ($\\xi = c + \\dot c/\\omega_0 = p$) and the CoM comes to rest over the ZMP.", "对 LIPM，稳定特征向量 $\\dot c = -\\omega_0 (c - p)$ 就是捕获点那条线：从线上出发（$\\xi = c + \\dot c/\\omega_0 = p$），质心最终停在 ZMP 正上方。")
        : L("For the upright joint the stable eigenvector $\\dot\\theta = -\\omega_0 \\theta$ is the one start that coasts exactly to the top and stops there.", "对竖直向上的关节，稳定特征向量 $\\dot\\theta = -\\omega_0 \\theta$ 是唯一一种恰好滑到顶点并停住的初始状态。"));
      if (preset === "pd") more += " " + (lipm
        ? L("Feedback changes the matrix: without it ($K_p = K_d = 0$) this is the LIPM saddle, whose stable eigenvector $\\dot c = -\\omega_0 (c - p)$ is the capture-point line; with $K_p > \\omega_0^2$ and $K_d > 0$ it becomes a stable focus or node. Drawn for the LIPM ($u$: extra CoM acceleration).", "反馈改变了矩阵：没有反馈（$K_p = K_d = 0$）时这是 LIPM 的鞍点，它的稳定特征向量 $\\dot c = -\\omega_0 (c - p)$ 就是捕获点线；$K_p > \\omega_0^2$ 且 $K_d > 0$ 时它变成稳定焦点或结点。图按 LIPM 画（$u$：附加的质心加速度）。")
        : L("Feedback changes the matrix: without it ($K_p = K_d = 0$) the upright joint is a saddle and falls; with $K_p > \\omega_0^2$ (the gain beats gravity's $m g l / I$) and $K_d > 0$ it becomes a stable focus or node. $u$ = motor torque / $I$.", "反馈改变了矩阵：没有反馈（$K_p = K_d = 0$）时竖直的关节是鞍点，会倒下；$K_p > \\omega_0^2$（增益压过重力项 $m g l / I$）且 $K_d > 0$ 时它变成稳定焦点或结点。$u$ = 电机力矩 / $I$。"));
      c.replaceChildren(...mathNodes(`${eqs} · ${eigStr(e)} · `), bold(L(k.en, k.zh)), h("br"), ...mathNodes(more), h("br"), tip);
    }
    const redraw = () => { A = linA(); recompute(); drawStatic(); drawDyn(); caption(); };
    const an = animator(root, (dt) => {
      let moving = false;
      for (const tr of trajs) if (tr.i < tr.pts.length - 1) { tr.i = Math.min(tr.pts.length - 1, tr.i + (dt * speed) / HS); moving = true; }
      drawDyn();
      return moving;
    });
    const play = playButton(an, () => { if (trajs.every((tr) => tr.i >= tr.pts.length - 1)) trajs.forEach((tr) => (tr.i = 0)); });
    ctrls.append(play, btn("↺ " + T().reset, () => { play.reset(); trajs = starts.map((st) => ({ st, pts: path(st), i: 0 })); drawDyn(); }));
    svg.addEventListener("click", (ev) => {
      const [px, py] = ptr(svg, ev, W, HH);
      if (px < pad.l || px > AW - pad.r || py < pad.t || py > HH - pad.b) return;
      const st = [Xi(px), Yi(py)];
      trajs.push({ st, pts: path(st), i: 0 });
      if (trajs.length > 6) trajs.shift();
      drawDyn();
      syncPlay(an, play);
    });
    const sl = (label, key, o) => ctrls.append(slider(label, { ...o, value: P[key] }, (v) => { P[key] = v; redraw(); }));
    // Slider ranges scale with the starting values so lessons can say "slide K_p past ω²".
    const w0 = P.omega;
    if (preset === "spring") { sl(L("stiffness $k$ (s⁻²)", "刚度 $k$（s⁻²）"), "k", { min: 0, max: Math.max(3 * P.k, 40), step: 0.1 }); sl(L("damping $b$ (s⁻¹)", "阻尼 $b$（s⁻¹）"), "b", { min: Math.min(0, P.b), max: Math.max(10, P.b), step: 0.05 }); }
    if (pend) { sl("$\\omega = \\sqrt{g/l}$ (s⁻¹)", "omega", { min: 1, max: Math.max(8, P.omega), step: 0.01 }); sl(L("damping $b$ (s⁻¹)", "阻尼 $b$（s⁻¹）"), "b", { min: 0, max: 2, step: 0.02 }); }
    if (preset === "inverted" || preset === "pd") sl("$\\omega_0$ (s⁻¹)", "omega", { min: 1, max: Math.max(6, P.omega), step: 0.01 });
    if (preset === "pd") {
      sl("$K_p$ (s⁻²)", "kp", { min: 0, max: Math.max(3 * w0 * w0, 40, P.kp), step: 0.05 });
      sl("$K_d$ (s⁻¹)", "kd", { min: 0, max: Math.max(3 * w0, 15, P.kd), step: 0.05 });
    }
    if (preset === "custom") [[0, 0], [0, 1], [1, 0], [1, 1]].forEach(([i, j]) => ctrls.append(slider(`$a_{${i + 1}${j + 1}}$`, { min: -5, max: 5, step: 0.1, value: Ac[i][j] }, (v) => { Ac[i][j] = v; redraw(); })));
    redraw();
  });

  // ================================================================== qp2d
  // A QP in two variables drawn exactly. Task 1: the line a·x = b. Task 2: a target point.
  // weighted: min w(a·x − b)² + ‖x − t‖²; hierarchy: min ‖x − t‖² s.t. a·x = b* (b* = b,
  // or the closest value the limits allow); constraints: the weighted problem with the
  // limits and the KKT picture. Solved by enumerating active sets (≤ 2 rows in 2-D).
  Viz.register("qp2d", (root, cfg) => {
    const { stage, ctrls, foot } = shell(root, cfg);
    let mode = ["weighted", "hierarchy", "constraints"].includes(cfg.mode) ? cfg.mode : "weighted";
    const R = finite(cfg.range) && cfg.range > 0 ? cfg.range : 3;
    const v2ok = (a) => Array.isArray(a) && a.length === 2 && a.every(finite);
    const t1ok = cfg.task1 && v2ok(cfg.task1.a) && finite(cfg.task1.b) && Math.hypot(cfg.task1.a[0], cfg.task1.a[1]) > 1e-9;
    // Names. `labels` name the axes (units in brackets are dropped for the symbols); `var`
    // names the decision variable when there are no labels; `multiplier` is the TeX symbol of
    // the KKT multipliers (default λ).
    const labIn = Array.isArray(cfg.labels) && cfg.labels.length === 2 ? cfg.labels.map(String) : null;
    const strip = (l) => l.replace(/\s*[（(][^()（）]*[)）]\s*$/, "").trim();
    const mSym = labIn && /^\$(.+?)_\{?1\}?\$$/.exec(strip(labIn[0]));
    const v = typeof cfg.var === "string" && /^\\?[A-Za-z]+$/.test(cfg.var) ? cfg.var : mSym ? mSym[1] : "x";
    const mult = typeof cfg.multiplier === "string" && cfg.multiplier ? cfg.multiplier : "\\lambda";
    const task1 = { a: t1ok ? cfg.task1.a.slice() : [1, 0.5], b: t1ok ? cfg.task1.b : 1, label: (cfg.task1 && cfg.task1.label) || L(`task 1: $a \\cdot ${v} = b$`, `任务 1：$a \\cdot ${v} = b$`) };
    const tgt = cfg.task2 && v2ok(cfg.task2.target) ? cfg.task2.target.slice() : [-1, 1.5];
    const t2label = (cfg.task2 && cfg.task2.label) || L("task 2: target", "任务 2：目标点");
    let w = finite(cfg.w) && cfg.w > 0 ? cfg.w : 1;
    const limits = (Array.isArray(cfg.limits) ? cfg.limits : []).filter((l) => l && v2ok(l.a) && finite(l.b) && Math.hypot(l.a[0], l.a[1]) > 1e-9).map((l) => ({ a: l.a.slice(), b: l.b, label: l.label || "" }));
    const hasBounds = Array.isArray(cfg.bounds) && cfg.bounds.length === 2 && cfg.bounds.every(finite) && cfg.bounds[0] < cfg.bounds[1];
    const autoBounds = !hasBounds && !limits.length; // the constraints mode then adds a default box
    const b0 = hasBounds ? cfg.bounds.slice() : [-1.2, 1.2];
    let bnd = b0.slice();
    const labels = labIn || [`$${v}_1$`, `$${v}_2$`];
    const sy = labels.map(strip); // the symbols of the two axes
    const vStar = `$${v}^*$`;
    const useBounds = () => hasBounds || (autoBounds && mode === "constraints");
    function cons() {
      const C = [];
      if (useBounds()) {
        const [lo, hi] = bnd;
        C.push({ n: [1, 0], d: hi, label: `${sy[0]} ≤ ${nf(hi, 2)}` }, { n: [-1, 0], d: -lo, label: `${sy[0]} ≥ ${nf(lo, 2)}` }, { n: [0, 1], d: hi, label: `${sy[1]} ≤ ${nf(hi, 2)}` }, { n: [0, -1], d: -lo, label: `${sy[1]} ≥ ${nf(lo, 2)}` });
      }
      for (const l of limits) C.push({ n: l.a, d: l.b, label: l.label || `${nf(l.a[0], 1)}·${sy[0]} + ${nf(l.a[1], 1)}·${sy[1]} ≤ ${nf(l.b, 1)}` });
      return C;
    }
    const weightedObj = () => {
      const [a1, a2] = task1.a, b = task1.b;
      return { H: [[2 * (w * a1 * a1 + 1), 2 * w * a1 * a2], [2 * w * a1 * a2, 2 * (w * a2 * a2 + 1)]], g: [-2 * (w * b * a1 + tgt[0]), -2 * (w * b * a2 + tgt[1])] };
    };
    const strictObj = () => ({ H: [[2, 0], [0, 2]], g: [-2 * tgt[0], -2 * tgt[1]] });
    const fval = ({ H, g }, x) => 0.5 * (x[0] * (H[0][0] * x[0] + H[0][1] * x[1]) + x[1] * (H[1][0] * x[0] + H[1][1] * x[1])) + g[0] * x[0] + g[1] * x[1];
    function qpSolve(obj, C, eq) {
      const Hr = [[obj.H[0][0] + 1e-9, obj.H[0][1]], [obj.H[1][0], obj.H[1][1] + 1e-9]];
      const subsets = [[]];
      for (let i = 0; i < C.length; i++) subsets.push([i]);
      for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) subsets.push([i, j]);
      let best = null, bestAny = null;
      for (const S of subsets) {
        const rows = S.map((i) => C[i]).concat(eq ? [eq] : []);
        if (rows.length > 2) continue;
        const m = rows.length, M = [], rhs = [];
        for (let r = 0; r < 2; r++) { M.push([Hr[r][0], Hr[r][1], ...rows.map((cc) => cc.n[r])]); rhs.push(-obj.g[r]); }
        for (const cc of rows) { M.push([cc.n[0], cc.n[1], ...new Array(m).fill(0)]); rhs.push(cc.d); }
        const z = solveLin(M, rhs);
        if (!z) continue;
        const x = [z[0], z[1]];
        if (!C.every((cc) => dot2(cc.n, x) <= cc.d + 1e-7 * (1 + Math.abs(cc.d)))) continue;
        const cand = { x, cost: fval(obj, x), active: S, lam: z.slice(2, 2 + S.length), mu: eq ? z[2 + S.length] : null };
        if (!bestAny || cand.cost < bestAny.cost - 1e-12) bestAny = cand;
        if (cand.lam.some((l) => l < -1e-7)) continue;
        if (!best || cand.cost < best.cost - 1e-12) best = cand;
      }
      return best || bestAny;
    }
    function clipPoly(poly, n, d) {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const Pp = poly[i], Qp = poly[(i + 1) % poly.length], fp = dot2(n, Pp) - d, fq = dot2(n, Qp) - d;
        if (fp <= 0) out.push(Pp);
        if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const t = fp / (fp - fq); out.push([Pp[0] + t * (Qp[0] - Pp[0]), Pp[1] + t * (Qp[1] - Pp[1])]); }
      }
      return out;
    }
    function solve() {
      const C = cons();
      let poly = [[-1e3, -1e3], [1e3, -1e3], [1e3, 1e3], [-1e3, 1e3]];
      for (const cc of C) poly = clipPoly(poly, cc.n, cc.d);
      const Wsol = poly.length ? qpSolve(weightedObj(), C, null) : null;
      let Ssol = null, bStar = task1.b;
      if (mode === "hierarchy" && poly.length) {
        if (C.length) { const vals = poly.map((p) => dot2(task1.a, p)); bStar = clamp(task1.b, Math.min(...vals), Math.max(...vals)); }
        Ssol = qpSolve(strictObj(), C, { n: task1.a, d: bStar });
      }
      return { C, poly, Wsol, Ssol, bStar, sol: mode === "hierarchy" ? Ssol : Wsol, obj: mode === "hierarchy" ? strictObj() : weightedObj() };
    }

    const W = 460, HH = 456, pad = { l: 46, r: 14, t: 16, b: 40 }, AW = 460, SZ = 400;
    const X = (x) => pad.l + ((x + R) / (2 * R)) * SZ, Y = (y) => pad.t + ((R - y) / (2 * R)) * SZ, PX = SZ / (2 * R);
    const Xi = (px) => -R + ((px - pad.l) / SZ) * 2 * R, Yi = (py) => R - ((py - pad.t) / SZ) * 2 * R;
    const svg = s("svg", { viewBox: `0 0 ${W} ${HH}`, class: "viz-svg viz-square" });
    stage.append(svg);
    const leg = h("div", { class: "viz-legend" });
    foot.append(leg);
    const c = cap(foot);
    const cid = "qp" + ++uid;
    const sw = (...kids) => s("svg", { width: 24, height: 14, viewBox: "0 0 24 14", style: "flex:none" }, ...kids);
    // Part of the line n·x = d inside the view square, or null.
    function lineInView(n, d) {
      const nn = dot2(n, n), p0 = [(n[0] * d) / nn, (n[1] * d) / nn], u = [-n[1] / Math.sqrt(nn), n[0] / Math.sqrt(nn)];
      let t0 = -Infinity, t1 = Infinity;
      for (let i = 0; i < 2; i++) {
        if (Math.abs(u[i]) < 1e-12) { if (Math.abs(p0[i]) > R) return null; continue; }
        const a = (-R - p0[i]) / u[i], b = (R - p0[i]) / u[i];
        t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
      }
      return t1 > t0 ? [[p0[0] + t0 * u[0], p0[1] + t0 * u[1]], [p0[0] + t1 * u[0], p0[1] + t1 * u[1]]] : null;
    }
    const arrowW = (x0, vx, vy, k, col, width, label) => {
      const x1 = X(x0[0]), y1 = Y(x0[1]), x2 = x1 + vx * k, y2 = y1 - vy * k;
      if (Math.hypot(x2 - x1, y2 - y1) < 3) return;
      svg.append(s("path", { d: arrowPath(x1, y1, x2, y2, 9), stroke: col, "stroke-width": width, fill: "none", "stroke-linecap": "round" }));
      if (!label) return null;
      const t = svgText(x2 + (x2 >= x1 ? 5 : -5), y2 + (y2 >= y1 ? 14 : -6), label, { class: "label", fill: col, "text-anchor": x2 >= x1 ? "start" : "end", "font-size": 13 });
      svg.append(t);
      return t;
    };
    function contours(obj, xs) {
      const xu = solveLin(obj.H, [-obj.g[0], -obj.g[1]]);
      if (!xu) return null;
      const [[a, b], [, d]] = obj.H, tr = a + d, dt = Math.sqrt(Math.max(0, ((a - d) / 2) ** 2 + b * b));
      const l1 = tr / 2 + dt, l2 = Math.max(1e-9, tr / 2 - dt), th = 0.5 * Math.atan2(2 * b, a - d);
      const g = s("g", { "clip-path": `url(#${cid})` });
      const col = cssv("--v5");
      const ell = (D, width, op) => g.append(s("ellipse", { cx: X(xu[0]), cy: Y(xu[1]), rx: Math.sqrt((2 * D) / l1) * PX, ry: Math.sqrt((2 * D) / l2) * PX, transform: `rotate(${((-th * 180) / Math.PI).toFixed(2)} ${X(xu[0]).toFixed(1)} ${Y(xu[1]).toFixed(1)})`, fill: "none", stroke: col, "stroke-width": width, "stroke-opacity": op }));
      for (let k = 1; k <= 7; k++) ell(0.5 * l2 * ((R * k) / 4) ** 2, 1.1, 0.35);
      if (xs) {
        const Ds = 0.5 * ((xs[0] - xu[0]) * (a * (xs[0] - xu[0]) + b * (xs[1] - xu[1])) + (xs[1] - xu[1]) * (b * (xs[0] - xu[0]) + d * (xs[1] - xu[1])));
        if (Ds > 1e-9) ell(Ds, 2.2, 0.9);
      }
      svg.append(g);
      const ux = X(xu[0]), uy = Y(xu[1]);
      if (ux > pad.l && ux < pad.l + SZ && uy > pad.t && uy < pad.t + SZ) svg.append(s("path", { d: `M${ux - 6},${uy - 6}L${ux + 6},${uy + 6}M${ux - 6},${uy + 6}L${ux + 6},${uy - 6}`, stroke: col, "stroke-width": 2 }));
      return xu;
    }
    function draw() {
      const r = solve();
      svg.innerHTML = "";
      svg.append(s("defs", {}, s("clipPath", { id: cid }, s("rect", { x: pad.l, y: pad.t, width: SZ, height: SZ }))));
      axes(svg, AW, HH, pad, [-R, R], [-R, R], labels[0], labels[1]);
      const red = cssv("--v4"), blue = cssv("--v1"), orange = cssv("--v3"), green = cssv("--v2"), purple = cssv("--v5");
      // Feasible region.
      if (r.C.length && r.poly.length >= 3) {
        let vp = r.poly;
        for (const [n, d] of [[[1, 0], R], [[-1, 0], R], [[0, 1], R], [[0, -1], R]]) vp = clipPoly(vp, n, d);
        if (vp.length >= 3) svg.append(s("path", { d: vp.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("") + "Z", fill: green, "fill-opacity": 0.12, stroke: "none" }));
      }
      contours(r.obj, r.sol ? r.sol.x : null);
      // Labels inside the plot are kept inside it and away from each other (measured boxes).
      const box = [pad.l + 2, pad.t + 2, pad.l + SZ - 2, pad.t + SZ - 2], taken = [];
      const ptBox = (x, y, r) => ({ x: x - r, y: y - r, width: 2 * r, height: 2 * r });
      taken.push(ptBox(X(tgt[0]), Y(tgt[1]), 10));
      if (r.sol) taken.push(ptBox(X(r.sol.x[0]), Y(r.sol.x[1]), 10));
      const near = [[0, 0], [0, -16], [0, 16], [-40, 0], [40, 0], [0, -32], [0, 32]];
      // Limits: dashed when inactive, red when active.
      r.C.forEach((cc, i) => {
        const seg2 = lineInView(cc.n, cc.d);
        if (!seg2) return;
        const act = r.sol && r.sol.active.includes(i);
        svg.append(s("line", { x1: X(seg2[0][0]), y1: Y(seg2[0][1]), x2: X(seg2[1][0]), y2: Y(seg2[1][1]), stroke: act ? red : cssv("--faint"), "stroke-width": act ? 3 : 1.6, "stroke-dasharray": act ? "" : "6 5" }));
        if (act || i >= r.C.length - limits.length) {
          const m = [0.15 * seg2[0][0] + 0.85 * seg2[1][0], 0.15 * seg2[0][1] + 0.85 * seg2[1][1]];
          const nn = Math.hypot(cc.n[0], cc.n[1]);
          // beside the line on its outer side (normal direction), clear of the line
          const t = svgText(0, 0, cc.label, { class: "label", fill: act ? red : cssv("--muted"), "text-anchor": "middle", "font-size": 12.5 });
          svg.append(t);
          let bw = 80, bh = 14;
          try { const b0 = t.getBBox(); if (b0.width) { bw = b0.width; bh = b0.height; } } catch {}
          const ux = cc.n[0] / nn, uy = -cc.n[1] / nn, off = Math.abs(ux) * bw / 2 + Math.abs(uy) * bh / 2 + 5;
          t.setAttribute("x", X(m[0]) + ux * off); t.setAttribute("y", Y(m[1]) + uy * off + bh * 0.32);
          const bb = place(t, box, taken, [[0, 0], [0, -16], [0, 16], [0, -32], [0, 32], [-2 * ux * off, -2 * uy * off]]);
          if (bb) taken.push(bb);
        }
      });
      // Task 1 line (and the best achievable line when the limits cut it off). The label goes
      // beside the line on the side away from the target, far enough that its box clears it.
      const avoid = [[X(tgt[0]), Y(tgt[1])]];
      if (r.sol) avoid.push([X(r.sol.x[0]), Y(r.sol.x[1])]);
      const drawTask = (d, dashed, label) => {
        const sg = lineInView(task1.a, d);
        if (!sg) return;
        svg.append(s("line", { x1: X(sg[0][0]), y1: Y(sg[0][1]), x2: X(sg[1][0]), y2: Y(sg[1][1]), stroke: blue, "stroke-width": dashed ? 2 : 2.8, "stroke-dasharray": dashed ? "8 6" : "" }));
        const t = svgText(0, 0, label, { class: "label", fill: blue, "text-anchor": "middle", "font-size": 13 });
        svg.append(t);
        let bw = 80, bh = 14;
        try { const bb0 = t.getBBox(); if (bb0.width) { bw = bb0.width; bh = bb0.height; } } catch {}
        const nn = Math.hypot(...task1.a), side = dot2(task1.a, tgt) - d > 0 ? -1 : 1; // away from the target
        const ux = (side * task1.a[0]) / nn, uy = (-side * task1.a[1]) / nn; // screen normal
        const off = Math.abs(ux) * bw / 2 + Math.abs(uy) * bh / 2 + 6;
        let best = null, bd = -1;
        for (const fr of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
          const m = [(1 - fr) * sg[0][0] + fr * sg[1][0], (1 - fr) * sg[0][1] + fr * sg[1][1]];
          const lx = clamp(X(m[0]) + ux * off, pad.l + bw / 2 + 2, pad.l + SZ - bw / 2 - 2), ly = clamp(Y(m[1]) + uy * off, pad.t + bh / 2 + 2, pad.t + SZ - bh / 2 - 2);
          const dmin = Math.min(...avoid.map(([ax, ay]) => Math.hypot(lx - ax, ly - ay)));
          if (dmin > bd) { bd = dmin; best = [lx, ly]; }
        }
        avoid.push(best);
        t.setAttribute("x", best[0]); t.setAttribute("y", best[1] + bh * 0.32);
        const bb = place(t, box, taken, [[0, 0], [ux * 14, uy * 14], [ux * 28, uy * 28]]);
        if (bb) taken.push(bb);
      };
      drawTask(task1.b, false, task1.label);
      if (mode === "hierarchy" && Math.abs(r.bStar - task1.b) > 1e-9) drawTask(r.bStar, true, L("best achievable", "最多能做到"));
      // Target, solution, ghost.
      const sol = r.sol;
      if (sol) svg.append(s("line", { x1: X(tgt[0]), y1: Y(tgt[1]), x2: X(sol.x[0]), y2: Y(sol.x[1]), stroke: cssv("--muted"), "stroke-width": 1.4, "stroke-dasharray": "3 4" }));
      if (mode === "hierarchy" && r.Wsol) {
        svg.append(s("circle", { cx: X(r.Wsol.x[0]), cy: Y(r.Wsol.x[1]), r: 7, fill: "none", stroke: purple, "stroke-width": 2.2, "stroke-dasharray": "3 3" }));
      }
      svg.append(s("circle", { cx: X(tgt[0]), cy: Y(tgt[1]), r: 8, fill: orange, stroke: cssv("--surface"), "stroke-width": 2 }));
      if (sol) {
        svg.append(s("circle", { cx: X(sol.x[0]), cy: Y(sol.x[1]), r: 7.5, fill: cssv("--fg"), stroke: cssv("--surface"), "stroke-width": 2.5 }));
        const t = svgText(X(sol.x[0]) - 10, Y(sol.x[1]) + 20, vStar, { class: "label strong", "text-anchor": "end", "font-size": 14 });
        svg.append(t);
        const bb = place(t, box, taken, [[0, 0], [20, 0], [0, -32], [20, -32]]);
        if (bb) taken.push(bb);
      }
      // KKT picture: −∇f = Σ λᵢ nᵢ (+ μ a in strict mode).
      if (mode === "constraints" && sol) {
        const gr = [r.obj.H[0][0] * sol.x[0] + r.obj.H[0][1] * sol.x[1] + r.obj.g[0], r.obj.H[1][0] * sol.x[0] + r.obj.H[1][1] * sol.x[1] + r.obj.g[1]];
        const vecs = [[-gr[0], -gr[1]], ...sol.active.map((i, k) => [-sol.lam[k] * r.C[i].n[0], -sol.lam[k] * r.C[i].n[1]])];
        const mx = Math.max(...vecs.map((v) => Math.hypot(v[0], v[1])));
        if (mx > 1e-9) {
          const kk = 80 / mx;
          const labs = [arrowW(sol.x, vecs[0][0], vecs[0][1], kk, orange, 3.2, "$-\\nabla f$")];
          sol.active.forEach((i, k) => labs.push(arrowW(sol.x, vecs[k + 1][0], vecs[k + 1][1], kk, red, 2.4, sol.active.length > 1 ? `$-${mult}_${k + 1} n_${k + 1}$` : `$-${mult} n$`)));
          for (const t of labs) if (t) { const bb = place(t, box, taken, near); if (bb) taken.push(bb); }
        }
      }
      {
        const t = svgText(X(tgt[0]) + 11, Y(tgt[1]) - 9, t2label, { class: "label", fill: orange, "font-size": 13 });
        svg.append(t);
        let w0 = 60;
        try { w0 = t.getBBox().width || 60; } catch {}
        place(t, box, taken, [[0, 0], [-w0 - 22, 0], [0, 26], [-w0 - 22, 26], [0, -18], [-w0 / 2 - 11, -14], [-w0 / 2 - 11, 32]]);
      }
      // Legend (HTML, below the plot).
      leg.innerHTML = "";
      const item = (swatch, text) => leg.append(h("span", {}, swatch, text));
      item(sw(s("line", { x1: 1, x2: 23, y1: 7, y2: 7, stroke: blue, "stroke-width": 3 })), task1.label);
      item(sw(s("circle", { cx: 12, cy: 7, r: 5.5, fill: orange })), t2label);
      item(sw(s("circle", { cx: 12, cy: 7, r: 5.5, fill: cssv("--fg") })), L(`solution ${vStar}`, `解 ${vStar}`));
      item(sw(s("ellipse", { cx: 12, cy: 7, rx: 10, ry: 5, fill: "none", stroke: purple, "stroke-width": 2 })), mode === "hierarchy" ? L(`contours of $\\lVert ${v} - t\\rVert^2$ ($t$ = target)`, `$\\lVert ${v} - t\\rVert^2$ 的等高线（$t$ = 目标）`) : L("cost contours (× = unconstrained minimum)", "代价等高线（× 为无约束最小点）"));
      if (mode === "hierarchy") item(sw(s("circle", { cx: 12, cy: 7, r: 5.5, fill: "none", stroke: purple, "stroke-width": 2, "stroke-dasharray": "3 3" })), L(`weighted solution (w = ${fmt(w)})`, `加权解（w = ${fmt(w)}）`));
      if (r.C.length) {
        item(sw(s("rect", { x: 1, y: 1, width: 22, height: 12, fill: green, "fill-opacity": 0.3 })), L("feasible region", "可行域"));
        item(sw(s("line", { x1: 1, x2: 23, y1: 7, y2: 7, stroke: red, "stroke-width": 3 })), L("active limit", "起作用的约束"));
      }
      if (mode === "constraints") item(sw(s("path", { d: arrowPath(2, 7, 22, 7, 6), stroke: orange, "stroke-width": 2.5, fill: "none" })), L(`pull $-\\nabla f$ and pushes $-${mult}_i n_i$ cancel at ${vStar}`, `${vStar} 处拉力 $-\\nabla f$ 与推力 $-${mult}_i n_i$ 抵消`));
      // Caption.
      if (!sol) { c.replaceChildren(document.createTextNode(L("The limits leave no feasible point.", "这些约束没有可行点。"))); return; }
      const res = dot2(task1.a, sol.x) - task1.b, dist = Math.hypot(sol.x[0] - tgt[0], sol.x[1] - tgt[1]);
      const head = `${vStar} = (${nf(sol.x[0])}, ${nf(sol.x[1])}) · ${L("task-1 error", "任务 1 误差")} $a \\cdot ${v}^* - b$ = ${nf(res, 3)} · ${L("distance to the target", "到目标的距离")} $\\lVert ${v}^* - t\\rVert$ = ${nf(dist)}`;
      let txt = "";
      if (mode === "weighted") txt += L(`A weighted sum trades the tasks off: neither is met exactly. Raise $w$ and the solution slides onto task 1's line; lower it and it slides towards the target.`, `加权求和是在两个任务之间折中：两个都做不到完全满足。增大 $w$，解滑向任务 1 的直线；减小 $w$，解滑向目标点。`);
      if (mode === "hierarchy") txt += L(`Strict priority: task 1 is met exactly (${vStar} is on the line); task 2 gets the best it can among task 1's solutions — the point of the line nearest the target. The dashed purple circle is the weighted answer for comparison.`, `严格优先级：任务 1 被精确满足（${vStar} 在直线上）；任务 2 只能在任务 1 的所有解里取最好的——直线上离目标最近的点。紫色虚线圈是加权解，用来对比。`) + (Math.abs(r.bStar - task1.b) > 1e-9 ? " " + L(`The limits make task 1 impossible: the best achievable is $a \\cdot ${v}$ = ${nf(r.bStar)} (dashed blue line).`, `约束让任务 1 无法完全满足：最多只能做到 $a \\cdot ${v}$ = ${nf(r.bStar)}（蓝色虚线）。`) : "");
      if (mode === "constraints") {
        const lm = `$${mult}_i$`;
        txt += sol.active.length
          ? L(`Active: `, `起作用的约束：`) + sol.active.map((i, k) => `${r.C[i].label} ($${mult}$ = ${nf(sol.lam[k])})`).join(", ") + ". " + L(`At the optimum the pull of the cost ($-\\nabla f$, orange: the way the cost wants to go) is cancelled exactly by the push of the active limits ($-${mult}_i n_i$, red, pointing back into the green region), with every ${lm} ≥ 0: $\\nabla f + \\sum_i ${mult}_i n_i = 0$ — the KKT conditions.`, `在最优点，代价的“拉力”（$-\\nabla f$，橙色：代价想去的方向）正好被起作用约束的“推力”（$-${mult}_i n_i$，红色，指回绿色区域）抵消，且每个 ${lm} ≥ 0：$\\nabla f + \\sum_i ${mult}_i n_i = 0$——这就是 KKT 条件。`)
          : L(`No limit is active: the unconstrained optimum is feasible, $\\nabla f = 0$ and every ${lm} = 0. Drag the target outside the green region.`, `没有约束起作用：无约束最优点本身可行，$\\nabla f = 0$，所有 ${lm} = 0。把目标拖到绿色区域外面试试。`);
      }
      capSet(c, head, txt, hint(L("Drag the orange target.", "拖动橙色目标点。")));
      wRow.style.opacity = mode === "hierarchy" ? 0.6 : 1;
      if (bRow) bRow.style.display = useBounds() ? "" : "none";
    }
    svg.style.touchAction = "none";
    let drag = false;
    const setT = (ev) => { const [px, py] = ptr(svg, ev, W, HH); tgt[0] = clamp(Xi(px), -R, R); tgt[1] = clamp(Yi(py), -R, R); draw(); };
    svg.addEventListener("pointerdown", (ev) => {
      const [px, py] = ptr(svg, ev, W, HH);
      if (px < pad.l || px > pad.l + SZ || py < pad.t || py > pad.t + SZ) return;
      drag = true; svg.setPointerCapture(ev.pointerId); setT(ev); ev.preventDefault();
    });
    svg.addEventListener("pointermove", (ev) => { if (drag) setT(ev); });
    svg.addEventListener("pointerup", () => (drag = false));
    svg.addEventListener("pointercancel", () => (drag = false));
    ctrls.append(seg([["weighted", L("weighted", "加权")], ["hierarchy", L("strict priority", "严格优先级")], ["constraints", L("limits + KKT", "约束 + KKT")]], mode, (m) => { mode = m; draw(); }));
    const wRow = slider(L("weight w", "权重 w"), { min: 0.01, max: 100, value: w }, (v) => { w = v; draw(); }, true);
    ctrls.append(wRow);
    let bRow = null;
    if (b0[1] > 0) {
      const sym = Math.abs(b0[0] + b0[1]) < 1e-9;
      bRow = slider(sym ? L(`box limit $|${v}_i| \\le$`, `方框限幅 $|${v}_i| \\le$`) : L(`box limit $${v}_i \\le$`, `方框上限 $${v}_i \\le$`), { min: 0.1, max: R, value: b0[1], step: 0.05 }, (val) => { bnd = [(b0[0] * val) / b0[1], val]; draw(); });
      ctrls.append(bRow);
    }
    draw();
  });

  // ================================================================== mpc
  // Receding-horizon control of a cart (double integrator ẍ = u, |u| ≤ u_max). Each tick:
  // condense the N-step problem into a box-constrained QP in the inputs, solve it exactly
  // with a primal active-set method, apply only u₀, shift, repeat. The ghost is the
  // infinite-horizon LQR for the same stage cost with its input clipped.
  function boxQP(Q, c, lo, hi, x0) {
    const n = c.length, x = x0.map((v) => clamp(v, lo, hi)), Wk = new Int8Array(n);
    for (let i = 0; i < n; i++) Wk[i] = x[i] >= hi - 1e-12 ? 1 : x[i] <= lo + 1e-12 ? -1 : 0;
    for (let it = 0; it < 6 * n + 20; it++) {
      const F = [];
      for (let i = 0; i < n; i++) if (!Wk[i]) F.push(i);
      let y = [];
      if (F.length) {
        const M = F.map((i) => F.map((j) => Q[i][j]));
        const rhs = F.map((i) => { let v = -c[i]; for (let j = 0; j < n; j++) if (Wk[j]) v -= Q[i][j] * x[j]; return v; });
        y = cholSolve(M, rhs);
        if (!y) return x;
      }
      let alpha = 1, block = -1, side = 0, pn = 0;
      F.forEach((i, k) => {
        const p = y[k] - x[i];
        pn = Math.max(pn, Math.abs(p));
        if (p > 1e-14 && x[i] + p > hi) { const a = (hi - x[i]) / p; if (a < alpha) { alpha = a; block = i; side = 1; } }
        else if (p < -1e-14 && x[i] + p < lo) { const a = (lo - x[i]) / p; if (a < alpha) { alpha = a; block = i; side = -1; } }
      });
      if (pn < 1e-10) {
        let worst = -1, wv = -1e-9;
        for (let i = 0; i < n; i++) {
          if (!Wk[i]) continue;
          let g = c[i];
          for (let j = 0; j < n; j++) g += Q[i][j] * x[j];
          const lam = Wk[i] > 0 ? -g : g; // must be ≥ 0 at an optimum
          if (lam < wv) { wv = lam; worst = i; }
        }
        if (worst < 0) return x;
        Wk[worst] = 0;
        continue;
      }
      F.forEach((i, k) => { x[i] += alpha * (y[k] - x[i]); });
      if (block >= 0) { x[block] = side > 0 ? hi : lo; Wk[block] = side; }
    }
    return x;
  }
  Viz.register("mpc", (root, cfg) => {
    const { stage, ctrls, foot } = shell(root, cfg);
    let N = clamp(Math.round(finite(cfg.horizon) ? cfg.horizon : 15), 1, 60);
    const dt = finite(cfg.dt) && cfg.dt >= 0.01 && cfg.dt <= 1 ? cfg.dt : 0.1;
    let umax = finite(cfg.u_max) && cfg.u_max > 0 ? cfg.u_max : 2;
    let target = finite(cfg.target) ? cfg.target : 1;
    let r = finite(cfg.r) && cfg.r > 0 ? cfg.r : 0.1;
    const compare = cfg.compare !== false;
    // Start state (x0 m, v0 m/s — v0 is a push before t = 0), and `prerun` seconds simulated
    // before the first picture so the figure can open on the outcome.
    const x0 = finite(cfg.x0) ? clamp(cfg.x0, -3, 4) : 0, v0 = finite(cfg.v0) ? clamp(cfg.v0, -5, 5) : 0;
    const prerun = finite(cfg.prerun) ? clamp(cfg.prerun, 0, 20) : 0, autoplay = cfg.autoplay === true;
    const qp = 1, qv = 0.1;
    let Gx, Gv, Q, K;
    function build() {
      Gx = []; Gv = [];
      for (let k = 1; k <= N; k++) {
        const rx = new Array(N).fill(0), rv = new Array(N).fill(0);
        for (let j = 0; j < k; j++) { rx[j] = dt * dt * (k - j - 0.5); rv[j] = dt; }
        Gx.push(rx); Gv.push(rv);
      }
      Q = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => {
        let v = 0;
        for (let k = 0; k < N; k++) v += qp * Gx[k][i] * Gx[k][j] + qv * Gv[k][i] * Gv[k][j];
        return 2 * v + (i === j ? 2 * r : 0);
      }));
      // Discrete algebraic Riccati equation by fixed-point iteration (same stage cost).
      const B = [0.5 * dt * dt, dt];
      let P = [[qp, 0], [0, qv]], BPA = [0, 0], sden = r;
      for (let it = 0; it < 20000; it++) {
        const PA = [[P[0][0], P[0][0] * dt + P[0][1]], [P[1][0], P[1][0] * dt + P[1][1]]];
        const PB = [P[0][0] * B[0] + P[0][1] * B[1], P[1][0] * B[0] + P[1][1] * B[1]];
        sden = r + B[0] * PB[0] + B[1] * PB[1];
        BPA = [B[0] * PA[0][0] + B[1] * PA[1][0], B[0] * PA[0][1] + B[1] * PA[1][1]];
        const APA = [[PA[0][0], PA[0][1]], [dt * PA[0][0] + PA[1][0], dt * PA[0][1] + PA[1][1]]];
        const Pn = [[qp + APA[0][0] - (BPA[0] * BPA[0]) / sden, APA[0][1] - (BPA[0] * BPA[1]) / sden], [APA[1][0] - (BPA[1] * BPA[0]) / sden, qv + APA[1][1] - (BPA[1] * BPA[1]) / sden]];
        const diff = Math.abs(Pn[0][0] - P[0][0]) + Math.abs(Pn[0][1] - P[0][1]) + Math.abs(Pn[1][1] - P[1][1]);
        P = Pn;
        if (diff < 1e-11 * (1 + Math.abs(P[0][0]))) break;
      }
      K = [BPA[0] / sden, BPA[1] / sden];
    }
    let st, gh, t, nextT, planT, U, pred, hist, uNow, gNow, over, overG, sgn, yr, planState;
    function plan() {
      if (U.length !== N) U = U.length > N ? U.slice(0, N) : U.concat(new Array(N - U.length).fill(U.length ? U[U.length - 1] : 0));
      const warm = U.slice(1).concat([U[U.length - 1]]);
      const ex = [], ev = [];
      for (let k = 1; k <= N; k++) { ex.push(st.x + k * dt * st.v - target); ev.push(st.v); }
      const cvec = Array.from({ length: N }, (_, i) => { let v = 0; for (let k = 0; k < N; k++) v += qp * Gx[k][i] * ex[k] + qv * Gv[k][i] * ev[k]; return 2 * v; });
      U = boxQP(Q, cvec, -umax, umax, warm);
      uNow = U[0];
      pred = [[st.x, st.v]];
      let x = st.x, v = st.v;
      for (const u of U) { x += v * dt + 0.5 * u * dt * dt; v += u * dt; pred.push([x, v]); }
      gNow = compare ? clamp(-(K[0] * (gh.x - target) + K[1] * gh.v), -umax, umax) : 0;
      planT = t; nextT = t + dt; planState = [st.x, st.v];
      hist.push({ t, x: st.x, u: uNow, gx: gh.x, gu: gNow });
      if (hist.length > 600) hist.shift();
      grow();
    }
    function grow() {
      const vals = [target, st.x, ...pred.map((p) => p[0])];
      if (compare) vals.push(gh.x);
      for (const v of vals) if (isFinite(v)) { yr[0] = Math.min(yr[0], v - 0.15); yr[1] = Math.max(yr[1], v + 0.15); }
    }
    function markTarget() { sgn = Math.sign(target - st.x) || 1; over = 0; overG = 0; }
    function reset() {
      st = { x: x0, v: v0 }; gh = { x: x0, v: v0 }; t = 0; U = new Array(N).fill(0); hist = [];
      yr = [Math.min(x0, target) - 0.4, Math.max(x0, target) + 0.4];
      markTarget(); plan();
    }
    function adv(tau) {
      st.x += st.v * tau + 0.5 * uNow * tau * tau; st.v += uNow * tau;
      if (compare) { gh.x += gh.v * tau + 0.5 * gNow * tau * tau; gh.v += gNow * tau; }
      t += tau;
      over = Math.max(over, sgn * (st.x - target));
      overG = Math.max(overG, sgn * (gh.x - target));
    }
    function run(Tm) {
      let rem = Tm;
      while (rem > 1e-12) { const tau = Math.min(rem, nextT - t); adv(tau); rem -= tau; if (t >= nextT - 1e-9) plan(); }
    }
    const settled = () => Math.abs(st.x - target) < 2e-3 && Math.abs(st.v) < 2e-3 && (!compare || (Math.abs(gh.x - target) < 2e-3 && Math.abs(gh.v) < 2e-3));

    const W = 540, HH = 430, myId = ++uid;
    const svg = s("svg", { viewBox: `0 0 ${W} ${HH}`, class: "viz-svg" });
    stage.append(svg);
    const c = cap(foot);
    function draw() {
      svg.innerHTML = "";
      const blue = cssv("--v1"), red = cssv("--v4"), ghostC = cssv("--muted");
      // a fixed-width window: the last 4 s and the horizon ahead, never before t = 0
      const span = 4 + Math.max(N * dt, 1), t0 = Math.max(0, t - 4), t1 = t0 + span;
      const padT = { l: 58, r: 14, t: 12, b: 22 }, padB = { l: 58, r: 14, t: 206, b: 24 };
      const { X, Y } = axes(svg, W, 186, padT, [t0, t1], yr, "", L("position x (m)", "位置 x（m）"));
      const uLim = Math.max(umax, ...U.map(Math.abs), ...hist.map((e) => Math.abs(e.u))) * 1.2;
      const { Y: Yu } = axes(svg, W, 310, padB, [t0, t1], [-uLim, uLim], "", L("input u (m/s²)", "输入 u（m/s²）"));
      svg.append(svgText(W - padT.r, 324, L("time t (s)", "时间 t（s）"), { class: "label", "text-anchor": "end" }));
      const xin = (tt) => tt >= t0 && tt <= t1;
      const cidT = "mpcT" + myId, cidB = "mpcB" + myId;
      svg.append(s("defs", {}, s("clipPath", { id: cidT }, s("rect", { x: padT.l, y: padT.t, width: W - padT.l - padT.r, height: 186 - padT.t - padT.b })), s("clipPath", { id: cidB }, s("rect", { x: padB.l, y: padB.t, width: W - padB.l - padB.r, height: 310 - padB.t - padB.b }))));
      const gT = s("g", { "clip-path": `url(#${cidT})` }), gB = s("g", { "clip-path": `url(#${cidB})` });
      svg.append(gT, gB);
      // now line
      for (const [y1, y2] of [[padT.t, 186 - padT.b], [padB.t, 310 - padB.b]]) svg.append(s("line", { x1: X(t), x2: X(t), y1, y2, stroke: cssv("--border-2"), "stroke-width": 1.5 }));
      gT.append(s("line", { x1: X(t0), x2: X(t1), y1: Y(target), y2: Y(target), stroke: red, "stroke-width": 1.8, "stroke-dasharray": "7 5" }));
      const pathOf = (pts) => pts.map(([a, b], i) => `${i ? "L" : "M"}${X(a).toFixed(1)},${Y(b).toFixed(1)}`).join("");
      const H1 = hist.filter((e) => e.t >= t0 - dt);
      if (compare) gT.append(s("path", { d: pathOf([...H1.map((e) => [e.t, e.gx]), [t, gh.x]]), fill: "none", stroke: ghostC, "stroke-width": 2.2, "stroke-dasharray": "2 4", "stroke-linecap": "round" }));
      gT.append(s("path", { d: pathOf([...H1.map((e) => [e.t, e.x]), [t, st.x]]), fill: "none", stroke: blue, "stroke-width": 2.8 }));
      gT.append(s("path", { d: pathOf(pred.map((p, k) => [planT + k * dt, p[0]])), fill: "none", stroke: blue, "stroke-width": 2.2, "stroke-dasharray": "7 5" }));
      pred.forEach((p, k) => { if (k) gT.append(s("circle", { cx: X(planT + k * dt), cy: Y(p[0]), r: 2.6, fill: blue })); });
      gT.append(s("circle", { cx: X(t), cy: Y(st.x), r: 5.5, fill: blue, stroke: cssv("--surface"), "stroke-width": 1.5 }));
      // inputs
      for (const v of [umax, -umax]) gB.append(s("line", { x1: X(t0), x2: X(t1), y1: Yu(v), y2: Yu(v), stroke: red, "stroke-width": 1.5, "stroke-dasharray": "6 5" }));
      gB.append(s("line", { x1: X(t0), x2: X(t1), y1: Yu(0), y2: Yu(0), stroke: cssv("--faint") }));
      const bw = Math.max(1, (X(planT + dt) - X(planT)) * 0.78);
      U.forEach((u, k) => {
        const tx = planT + k * dt;
        if (!xin(tx)) return;
        gB.append(s("rect", { x: X(tx) + 0.5, y: Math.min(Yu(0), Yu(u)), width: bw, height: Math.max(0.5, Math.abs(Yu(u) - Yu(0))), fill: blue, "fill-opacity": k ? 0.35 : 0.85 }));
      });
      const stepPath = (key) => { let d = ""; H1.forEach((e, i) => { const nt = i + 1 < H1.length ? H1[i + 1].t : t; d += `${d ? "L" : "M"}${X(e.t).toFixed(1)},${Yu(e[key]).toFixed(1)}L${X(nt).toFixed(1)},${Yu(e[key]).toFixed(1)}`; }); return d; };
      if (compare) gB.append(s("path", { d: stepPath("gu"), fill: "none", stroke: ghostC, "stroke-width": 2, "stroke-dasharray": "2 4" }));
      gB.append(s("path", { d: stepPath("u"), fill: "none", stroke: blue, "stroke-width": 2.4 }));
      svg.append(svgText(W - padB.r - 4, Yu(umax) + 16, `$|u| \\le u_{\\max}$ = ${nf(umax, 1)}`, { class: "label", fill: red, "text-anchor": "end" }));
      // cart on a track
      const ty = 392, xl = 70, xr = W - 30, Xc = (x) => xl + ((x - yr[0]) / (yr[1] - yr[0])) * (xr - xl);
      svg.append(s("line", { x1: xl - 20, x2: xr + 10, y1: ty, y2: ty, stroke: cssv("--fg-2"), "stroke-width": 2.5 }));
      const fx = Xc(target);
      svg.append(s("line", { x1: fx, x2: fx, y1: ty, y2: ty - 44, stroke: red, "stroke-width": 1.6, "stroke-dasharray": "4 3" }));
      svg.append(s("path", { d: `M${fx},${ty + 3}L${fx - 8},${ty + 15}L${fx + 8},${ty + 15}Z`, fill: red }));
      svg.append(svgText(fx, ty + 31, L("target $x^*$", "目标 $x^*$"), { class: "label", fill: red, "text-anchor": "middle" }));
      const cart = (x, ghost) => {
        const cx = Xc(x), wd = 46, ht = 24;
        if (ghost) { svg.append(s("rect", { x: cx - wd / 2, y: ty - ht - 9, width: wd, height: ht, rx: 4, fill: "none", stroke: ghostC, "stroke-width": 2, "stroke-dasharray": "4 3" })); return; }
        svg.append(s("rect", { x: cx - wd / 2, y: ty - ht - 9, width: wd, height: ht, rx: 4, fill: blue }));
        for (const dx of [-13, 13]) svg.append(s("circle", { cx: cx + dx, cy: ty - 5, r: 5, fill: cssv("--surface"), stroke: cssv("--fg-2"), "stroke-width": 2 }));
        svg.append(svgText(cx, ty - 9 - ht / 2 + 4.5, "MPC", { "text-anchor": "middle", fill: "#fff", "font-size": 12.5, "font-weight": 700 }));
        const ua = uNow / Math.max(umax, 1e-9);
        if (Math.abs(ua) > 0.02) svg.append(s("path", { d: arrowPath(cx + Math.sign(ua) * (wd / 2 + 2), ty - 21, cx + Math.sign(ua) * (wd / 2 + 2) + ua * 34, ty - 21, 7), stroke: cssv("--v3"), "stroke-width": 3, fill: "none" }));
      };
      if (compare) cart(gh.x, true);
      cart(st.x, false);
      const ovs = (o) => (o > 0.005 ? `${nf(o * 100, 0)} cm` : L("none", "无"));
      capSet(c, `$t$ = ${nf(t, 1)} s · $x$ = ${nf(st.x)} m · $v$ = ${nf(st.v)} m/s · $u_0$ = ${nf(uNow)} m/s² ($|u| \\le$ ${nf(umax, 1)}) · ${L("horizon", "预测时域")} $N\\,\\Delta t$ = ${nf(N * dt, 1)} s`,
        L("Every tick MPC plans $N$ inputs that respect the limit (bars and the dashed path), applies only the first, then re-plans from the new state.", "每个控制周期，MPC 规划 $N$ 个满足限幅的输入（柱状图和虚线），只执行第一个，然后从新状态重新规划。")
        + (compare ? ` ${L("Overshoot", "超调")}: MPC ${ovs(over)} · ${L("clipped LQR (dotted)", "截断的 LQR（点线）")} ${ovs(overG)}. ` + (overG > over + 0.02
          ? L("The clipped LQR ignores the limit when it plans, so it brakes too late; MPC sees the limit coming inside its horizon and brakes earlier.", "截断的 LQR 规划时不知道有限幅，所以刹车太晚；MPC 在预测时域里提前看到限幅，更早开始刹车。")
          : over > overG + 0.02
            ? L("Here MPC overshoots more: its horizon is too short to see that it must brake — lengthen N.", "这里 MPC 超调更大：预测时域太短，看不到该刹车了——把 N 调长。")
            : over > 0.05
              ? L(`Both overshoot by the same amount: at this speed no controller can stop in time — the braking distance is $v^2/(2u_{\\max})$.`, `两者超调一样多：这个速度下任何控制器都来不及停住——刹车距离是 $v^2/(2u_{\\max})$。`)
              : L("Here both stop cleanly. Make the gains aggressive (lower $r$) with a tight $u_{\\max}$ and the clipped LQR overshoots while MPC still brakes in time.", "这里两者都停得很干净。把 $r$ 调小（增益更激进）、把 $u_{\\max}$ 调紧，截断的 LQR 会超调，而 MPC 仍能及时刹车。")) : ""));
    }
    build(); reset();
    const an = animator(root, (dtr) => { run(Math.min(dtr, 0.1)); draw(); return !settled(); });
    const play = playButton(an);
    const kick = () => { if (!an.on) syncPlay(an, play); };
    ctrls.append(
      play,
      btn("⏭ " + T().step, () => { if (an.on) return; run(nextT - t); draw(); }),
      btn(L("push +1 m/s", "推一下 +1 m/s"), () => { st.v += 1; gh.v += 1; markTarget(); plan(); draw(); kick(); }),
      btn("↺ " + T().reset, () => { play.reset(); reset(); draw(); }),
    );
    ctrls.append(
      slider(L("horizon $N$", "时域 $N$"), { min: 1, max: 60, value: N, step: 1 }, (v) => { N = Math.round(v); build(); plan(); draw(); }),
      slider(L("input limit $u_{\\max}$", "输入限幅 $u_{\\max}$"), { min: 0.2, max: 5, value: umax, step: 0.05 }, (v) => { umax = v; plan(); draw(); }),
      slider(L("input weight $r$", "输入权重 $r$"), { min: 0.001, max: 10, value: r }, (v) => { r = v; build(); plan(); draw(); }, true),
      slider(L("target $x^*$ (m)", "目标 $x^*$（m）"), { min: -2, max: 3, value: target, step: 0.05 }, (v) => { target = v; markTarget(); plan(); draw(); kick(); }),
    );
    foot.prepend(legend([[L("MPC: past", "MPC：已走过"), cssv("--v1")], [L("MPC: plan", "MPC：规划"), cssv("--v1"), true], ...(compare ? [[L("clipped LQR", "截断的 LQR"), cssv("--muted"), true]] : []), [L("target / limit", "目标 / 限幅"), cssv("--v4"), true]]));
    if (prerun > 0) run(prerun);
    draw();
    if (autoplay && !settled()) syncPlay(an, play);
  });

  // ================================================================== nullspace
  // Redundant planar arm: q̇ = J⁺·k(x* − x) + (I − J⁺J)·q̇₀. The secondary task is a
  // posture preference on joint 2 only: q̇₀ = (0, k₀(q_pref − q₂), 0, …); the other
  // joints are free. Its projection (I − J⁺J)q̇₀ moves the arm without moving the hand.
  Viz.register("nullspace", (root, cfg) => {
    const { stage, ctrls, foot } = shell(root, cfg);
    const Ls = Array.isArray(cfg.links) && cfg.links.length >= 3 && cfg.links.length <= 5 && cfg.links.every((v) => finite(v) && v > 0) ? cfg.links.slice() : [1, 0.8, 0.6];
    const n = Ls.length;
    const Q0 = [0.35, 1.0, 0.8, 0.6, 0.5].slice(0, n);
    const qStart = Array.isArray(cfg.q) && cfg.q.length === n && cfg.q.every(finite) ? cfg.q.slice() : Q0;
    const q = qStart.slice();
    const pref0 = finite(cfg.posture) ? cfg.posture : q[1];
    let pref = pref0;
    const reach = Ls.reduce((a, b) => a + b, 0);
    const S = 440, k = S / (2.3 * reach), P = (x, y) => [S / 2 + x * k, S / 2 - y * k];
    const svg = s("svg", { viewBox: `0 0 ${S} ${S}`, class: "viz-svg viz-square" });
    stage.append(svg);
    const c = cap(foot);
    const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const fk = () => { const pts = [[0, 0]]; let a = 0, x = 0, y = 0; for (let i = 0; i < n; i++) { a += q[i]; x += Ls[i] * Math.cos(a); y += Ls[i] * Math.sin(a); pts.push([x, y]); } return pts; };
    // Jacobian (2×n) of the end of link m (m = n is the hand).
    const jacTo = (m) => {
      const J = [new Array(n).fill(0), new Array(n).fill(0)], cum = [];
      let a = 0;
      for (let i = 0; i < n; i++) { a += q[i]; cum.push(a); }
      for (let i = 0; i < m; i++) for (let j = i; j < m; j++) { J[0][i] -= Ls[j] * Math.sin(cum[j]); J[1][i] += Ls[j] * Math.cos(cum[j]); }
      return J;
    };
    // J⁺ = Jᵀ(JJᵀ + λ²I)⁻¹ with a tiny λ, larger only near a singularity.
    const pinv = (J) => {
      let a = 0, b = 0, d = 0;
      for (let i = 0; i < n; i++) { a += J[0][i] ** 2; b += J[0][i] * J[1][i]; d += J[1][i] ** 2; }
      const l2 = a * d - b * b < 1e-3 ? 1e-3 : 1e-9, A = a + l2, D = d + l2, det = A * D - b * b;
      const inv = [[D / det, -b / det], [-b / det, A / det]];
      return Array.from({ length: n }, (_, i) => [J[0][i] * inv[0][0] + J[1][i] * inv[1][0], J[0][i] * inv[0][1] + J[1][i] * inv[1][1]]);
    };
    const project = (J, Jp, v) => { const Jv = [0, 1].map((r) => J[r].reduce((acc, x, i) => acc + x * v[i], 0)); return v.map((x, i) => x - (Jp[i][0] * Jv[0] + Jp[i][1] * Jv[1])); };
    let target = fk()[n].slice(), sweeping = false, sweepT = 0, err = 0, nsNorm = 0, nsDir = null;
    const KP = 20, K0 = 4;
    const prefNow = () => (sweeping ? pref + 0.9 * Math.sin((2 * Math.PI * sweepT) / 5) : pref);
    function step(hh) {
      const pts = fk(), e = [target[0] - pts[n][0], target[1] - pts[n][1]];
      const J = jacTo(n), Jp = pinv(J);
      const qd0 = new Array(n).fill(0);
      qd0[1] = K0 * wrapA(prefNow() - q[1]);
      const ns = project(J, Jp, qd0);
      const dq = Jp.map((row, i) => KP * (row[0] * e[0] + row[1] * e[1]) + ns[i]);
      const mx = Math.max(...dq.map(Math.abs)), sc = mx > 6 ? 6 / mx : 1;
      for (let i = 0; i < n; i++) q[i] = wrapA(q[i] + dq[i] * sc * hh);
      nsNorm = Math.hypot(...ns);
      nsDir = nsNorm > 1e-6 ? ns.map((v) => v / nsNorm) : null;
      const p2 = fk()[n];
      err = Math.hypot(target[0] - p2[0], target[1] - p2[1]);
    }
    function draw() {
      const pts = fk();
      svg.innerHTML = "";
      svg.append(s("circle", { cx: S / 2, cy: S / 2, r: reach * k, class: "reach" }));
      // preferred direction of link 2 (the secondary task)
      const purple = cssv("--v5");
      const j1 = pts[1], ang = q[0] + prefNow(), tip = [j1[0] + Ls[1] * Math.cos(ang), j1[1] + Ls[1] * Math.sin(ang)];
      const [ax, ay] = P(...j1), [bx, by] = P(...tip);
      for (let i = 0; i < n; i++) { const [x1, y1] = P(...pts[i]), [x2, y2] = P(...pts[i + 1]); svg.append(s("line", { x1, y1, x2, y2, class: "link" })); }
      // drawn over the links, so the dashes show even when link 2 is at its preferred angle
      svg.append(s("line", { x1: ax, y1: ay, x2: bx, y2: by, stroke: purple, "stroke-width": 3, "stroke-dasharray": "7 5", "stroke-linecap": "round" }));
      svg.append(svgText(bx + 6, by - 6, L("preferred", "偏好姿态"), { class: "label", fill: purple }));
      pts.forEach((p, i) => { const [x, y] = P(...p); svg.append(s("circle", { cx: x, cy: y, r: i === n ? 7 : 8, class: i === n ? "ee" : "joint" })); });
      const [tx, ty] = P(...target);
      svg.append(s("path", { d: `M${tx - 10},${ty}L${tx + 10},${ty}M${tx},${ty - 10}L${tx},${ty + 10}`, class: "target" }));
      // null-space direction: velocity of every joint for a unit null-space joint motion
      const J = jacTo(n), Jp = pinv(J);
      let z = nsDir;
      if (!z) {
        const e2 = new Array(n).fill(0); e2[1] = 1;
        let v = project(J, Jp, e2);
        if (Math.hypot(...v) < 1e-6) { const e1 = new Array(n).fill(0); e1[0] = 1; v = project(J, Jp, e1); }
        const nv = Math.hypot(...v) || 1;
        z = v.map((x) => x / nv);
      }
      const vel = [];
      for (let m = 1; m <= n; m++) { const Jm = jacTo(m); vel.push([Jm[0].reduce((a, x, i) => a + x * z[i], 0) * k, -Jm[1].reduce((a, x, i) => a + x * z[i], 0) * k]); }
      const vm = Math.max(...vel.map((v) => Math.hypot(v[0], v[1])), 1e-9), sc = 46 / vm;
      vel.forEach((v, i) => {
        const len = Math.hypot(v[0], v[1]) * sc;
        if (len < 3) return;
        const [px, py] = P(...pts[i + 1]);
        svg.append(s("path", { d: arrowPath(px, py, px + v[0] * sc, py + v[1] * sc, 8), stroke: purple, "stroke-width": 2.8, fill: "none", "stroke-linecap": "round" }));
      });
      capSet(c, `${L("hand error", "手的误差")} $\\lVert x^* - x\\rVert$ = ${err.toFixed(4)} m · ${L("joints", "关节数")} $n$ = ${n}, ${L("task", "任务维数")} = 2 ($x, y$) → ${L("null-space dimension", "零空间维数")} $n - 2$ = ${n - 2} · $\\lVert (I - J^{\\dagger} J)\\,\\dot q_0 \\rVert$ = ${nf(nsNorm)} rad/s`,
        L("The posture task (purple dashes) acts only through $I - J^{\\dagger} J$: joint motions that leave the hand where it is. Purple arrows: how each joint moves along the null space — the hand's arrow is zero.", "姿态任务（紫色虚线）只能通过 $I - J^{\\dagger} J$ 起作用：只允许那些不移动手的关节运动。紫色箭头：沿零空间运动时每个关节怎么动——手的箭头为零。"),
        hint(L("Drag to move the hand target; press “sweep null space” and watch the arm fold while the hand stays put.", "拖动改变手的目标；按“扫过零空间”，看手臂折叠展开而手不动。")));
    }
    const busy = () => sweeping || err > 1e-4 || nsNorm > 1e-3;
    const an = animator(root, (dt) => {
      const Tm = Math.min(dt, 0.05), nsub = Math.max(1, Math.ceil(Tm / 0.002)), hh = Tm / nsub;
      for (let i = 0; i < nsub; i++) { if (sweeping) sweepT += hh; step(hh); }
      draw();
      return busy();
    });
    const toWorld = (ev) => { const [x, y] = ptr(svg, ev, S, S); let wx = (x - S / 2) / k, wy = (S / 2 - y) / k; const rr = Math.hypot(wx, wy), mx = 0.97 * reach; if (rr > mx) { wx *= mx / rr; wy *= mx / rr; } return [wx, wy]; };
    let dragging = false;
    svg.style.touchAction = "none";
    svg.addEventListener("pointerdown", (ev) => { dragging = true; svg.setPointerCapture(ev.pointerId); target = toWorld(ev); an.start(); ev.preventDefault(); });
    svg.addEventListener("pointermove", (ev) => { if (!dragging) return; target = toWorld(ev); an.start(); });
    svg.addEventListener("pointerup", () => (dragging = false));
    svg.addEventListener("pointercancel", () => (dragging = false));
    const sweepBtn = btn("↔ " + L("sweep null space", "扫过零空间"), () => {
      sweeping = !sweeping;
      sweepBtn.textContent = sweeping ? "■ " + L("stop", "停止") : "↔ " + L("sweep null space", "扫过零空间");
      sweepBtn.classList.toggle("primary", sweeping);
      an.start();
    });
    const prefRow = slider(L("preferred joint-2 angle (rad)", "关节 2 的偏好角（rad）"), { min: -Math.PI, max: Math.PI, value: pref, step: 0.01 }, (v) => { pref = v; an.start(); });
    ctrls.append(sweepBtn, btn("↺ " + T().reset, () => {
      sweeping = false; sweepT = 0; sweepBtn.textContent = "↔ " + L("sweep null space", "扫过零空间"); sweepBtn.classList.remove("primary");
      for (let i = 0; i < n; i++) q[i] = qStart[i];
      pref = pref0; prefRow.set(pref); target = fk()[n].slice(); err = 0; nsNorm = 0; nsDir = null; an.stop(); draw();
    }), prefRow);
    { // initial numbers (the posture may differ from q₂)
      const J = jacTo(n), Jp = pinv(J), qd0 = new Array(n).fill(0);
      qd0[1] = K0 * wrapA(pref - q[1]);
      nsNorm = Math.hypot(...project(J, Jp, qd0));
    }
    draw();
    if (nsNorm > 1e-3) an.start();
  });
})();
