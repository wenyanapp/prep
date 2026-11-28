"use strict";
// Teaching widgets, part 8 (PLAN R18): `lie` (exponential and logarithm maps of SO(2),
// SO(3), SE(2), SE(3), and the first BCH term) and `irreps` (features that rotate "by
// frequency": Fourier modes on the circle, spherical harmonics with their Wigner-D
// matrix, and the tensor product 1 ⊗ 1 = 0 ⊕ 1 ⊕ 2). Registered into viz.js; fields
// documented in CONTENT_SPEC.md ("Symmetry and equivariance widgets"). Notation as in
// content/sym/_notation: rotation vector φ = θ û, hat [φ]×, twist ξ = (ω, v).
(() => {
  if (!window.Viz) return;
  const { h, s, cssv, mix, clamp, T, animator, shell, slider, btn, seg, playButton, fitPre, arrowPath, textWidth, texPlain } = Viz.util;
  const texPlainSafe = (str) => texPlain(String(str));
  const zh = () => (document.documentElement.lang || "").startsWith("zh");
  const L = (en, cn) => (zh() ? cn : en);
  const cap = (foot) => { const c = h("div", { class: "viz-caption" }); foot.append(c); return c; };
  const PI = Math.PI, TAU = 2 * Math.PI;
  // Fixed decimals without "-0.00"; Unicode minus.
  const n = (v, d = 2) => { if (!isFinite(v)) return "—"; const r = (+v).toFixed(d); return (/^-0\.?0*$/.test(r) ? r.slice(1) : r).replace(/^-/, "−"); };
  const sci = (v) => (v === 0 ? "0" : Math.abs(v) >= 0.01 ? n(v, 3) : v.toExponential(1).replace("-", "−"));
  const colors = () => {
    const g = (k) => cssv(k);
    return { fg: g("--fg"), fg2: g("--fg-2"), muted: g("--muted"), faint: g("--faint"), border: g("--border"), border2: g("--border-2"), surface: g("--surface"), surface2: g("--surface-2"), v1: g("--v1"), v2: g("--v2"), v3: g("--v3"), v4: g("--v4"), v5: g("--v5"), v6: g("--v6") };
  };
  const txt = (x, y, str, o = {}) => s("text", { x, y, "font-size": o.size || 13, fill: o.fill, "font-weight": o.weight ?? 600, "text-anchor": o.anchor || "start", ...(o.attrs || {}) }, str);
  const ln = (x1, y1, x2, y2, stroke, w = 1.5, extra = {}) => s("line", { x1, y1, x2, y2, stroke, "stroke-width": w, ...extra });
  const arrow = (x1, y1, x2, y2, color, w = 2.6, size = 8, extra = {}) =>
    s("path", { d: arrowPath(x1, y1, x2, y2, size), stroke: color, "stroke-width": w, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", ...extra });
  const poly = (pts, extra) => s("path", { d: pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(""), fill: "none", ...extra });
  // A flex cell that holds one SVG: two of them sit side by side on an iPad and stack on a phone.
  const cellOf = (svg) => { const d = h("div", {}); d.style.cssText = "flex:1 1 320px;max-width:460px;min-width:0"; d.append(svg); return d; };
  const wide = (row) => { row.style.flex = "1 1 240px"; return row; };
  const num = (v, d, lo, hi) => { const x = typeof v === "number" ? v : NaN; return Number.isFinite(x) ? clamp(x, lo, hi) : d; };
  const vecN = (v, d, k, lo, hi) => (Array.isArray(v) && v.length >= k && v.slice(0, k).every((x) => typeof x === "number" && Number.isFinite(x)) ? v.slice(0, k).map((x) => clamp(x, lo, hi)) : d.slice());

  // ------------------------------------------------------------------ linear algebra
  const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const sc3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const eye = (k) => Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
  const mm = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((a, v, k) => a + v * B[k][j], 0)));
  const mv = (A, v) => A.map((r) => r.reduce((a, x, k) => a + x * v[k], 0));
  const tr = (A) => A[0].map((_, j) => A.map((r) => r[j]));
  const madd = (A, B, kb = 1) => A.map((r, i) => r.map((v, j) => v + kb * B[i][j]));
  const msc = (A, k) => A.map((r) => r.map((v) => v * k));
  const fro = (A) => Math.sqrt(A.reduce((a, r) => a + r.reduce((b, v) => b + v * v, 0), 0));
  const hat = (w) => [[0, -w[2], w[1]], [w[2], 0, -w[0]], [-w[1], w[0], 0]];
  const Rz = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
  const Ry = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
  const det3 = (R) => dot3(R[0], cross3(R[1], R[2]));
  // Exp(φ) by Rodrigues' formula.
  function Exp3(phi) {
    const th = norm3(phi);
    if (th < 1e-10) return madd(eye(3), hat(phi));
    const K = hat(sc3(phi, 1 / th));
    return madd(madd(eye(3), msc(K, Math.sin(th))), msc(mm(K, K), 1 - Math.cos(th)));
  }
  // Log(R): the rotation vector with angle in [0, π].
  function Log3(R) {
    const v = [(R[2][1] - R[1][2]) / 2, (R[0][2] - R[2][0]) / 2, (R[1][0] - R[0][1]) / 2]; // sin θ · û
    const sn = norm3(v), c = (R[0][0] + R[1][1] + R[2][2] - 1) / 2;
    const th = Math.atan2(sn, c);
    if (th < 1e-9) return v;
    // Small angles (c > 0) must never reach the θ ≈ π branch below: it divides by 1 − c.
    if (sn > 1e-6 || c > 0) return sn > 1e-300 ? sc3(v, th / sn) : v;
    // θ ≈ π: û from the symmetric part, (R + Rᵀ)/2 = cos θ I + (1 − cos θ) û ûᵀ
    const U = [0, 1, 2].map((i) => [0, 1, 2].map((j) => ((R[i][j] + R[j][i]) / 2 - (i === j ? c : 0)) / (1 - c)));
    let k = 0;
    for (let i = 1; i < 3; i++) if (U[i][i] > U[k][k]) k = i;
    let u = [0, 1, 2].map((i) => U[i][k] / Math.sqrt(Math.max(U[k][k], 1e-12)));
    if (dot3(u, v) < 0) u = sc3(u, -1);
    return sc3(u, th);
  }
  const angleOf = (R) => norm3(Log3(R));
  // Matrix exponential by its power series (the independent check for the closed forms).
  function expmSeries(A, terms = 60) {
    let S = eye(A.length), P = eye(A.length);
    for (let k = 1; k <= terms; k++) { P = msc(mm(P, A), 1 / k); S = madd(S, P); }
    return S;
  }
  // SE(2): exp of ξ^ for ξ = (ω, vx, vy) → { R (2×2), p, V }.
  function expSE2(w, v, t = 1) {
    const a = w * t;
    const A = Math.abs(a) < 1e-9 ? 1 : Math.sin(a) / a, B = Math.abs(a) < 1e-9 ? a / 2 : (1 - Math.cos(a)) / a;
    const V = [[A, -B], [B, A]];
    return { R: [[Math.cos(a), -Math.sin(a)], [Math.sin(a), Math.cos(a)]], V, p: [(V[0][0] * v[0] + V[0][1] * v[1]) * t, (V[1][0] * v[0] + V[1][1] * v[1]) * t] };
  }
  // SE(3): exp of ξ^ for ξ = (ω, v) → { R, p, V }.
  function expSE3(w, v, t = 1) {
    const phi = sc3(w, t), th = norm3(phi), K = hat(phi);
    let V;
    if (th < 1e-9) V = madd(eye(3), msc(K, 0.5));
    else V = madd(madd(eye(3), msc(K, (1 - Math.cos(th)) / (th * th))), msc(mm(K, K), (th - Math.sin(th)) / (th * th * th)));
    return { R: Exp3(phi), V, p: mv(V, sc3(v, t)) };
  }
  const matLines = (M, d = 2) => M.map((r) => "[ " + r.map((v) => n(v, d).padStart(d + 3)).join(" ") + " ]");
  const vecStr = (v, d = 2) => "(" + v.map((x) => n(x, d)).join(", ") + ")";

  // ------------------------------------------------------------------ orbitable 3-D view
  // Right-handed orthographic camera: screen right = x1, screen up = z·cos p + y1·sin p,
  // nearness = z·sin p − y1·cos p, with (x1, y1) the world (x, y) turned by −yaw.
  function makeView(o) {
    const st = { yaw: o.yaw ?? 0.6, pitch: o.pitch ?? 0.4, k: o.k, cx: o.cx, cy: o.cy };
    const P = (p) => {
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
      const x1 = cy * p[0] + sy * p[1], y1 = -sy * p[0] + cy * p[1];
      return [st.cx + st.k * x1, st.cy - st.k * (p[2] * cp + y1 * sp), p[2] * sp - y1 * cp];
    };
    return { st, P };
  }
  function orbit(svg, getView, onChange) {
    let drag = null;
    svg.style.touchAction = "none";
    svg.addEventListener("pointerdown", (e) => { const V = getView(); if (!V) return; drag = [e.clientX, e.clientY]; try { svg.setPointerCapture(e.pointerId); } catch {} });
    svg.addEventListener("pointermove", (e) => {
      const V = getView();
      if (!drag || !V) return;
      V.st.yaw -= (e.clientX - drag[0]) * 0.01;
      V.st.pitch = clamp(V.st.pitch + (e.clientY - drag[1]) * 0.01, -1.45, 1.45);
      drag = [e.clientX, e.clientY];
      onChange();
    });
    const end = () => (drag = null);
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
  }
  const line3 = (svg, P, a, b, stroke, w = 1.5, extra = {}) => { const A = P(a), B = P(b); svg.append(ln(A[0], A[1], B[0], B[1], stroke, w, extra)); };
  const arrow3 = (svg, P, a, b, color, w = 3, size = 7, extra = {}) => { const A = P(a), B = P(b); if (Math.hypot(B[0] - A[0], B[1] - A[1]) < 2) return; svg.append(arrow(A[0], A[1], B[0], B[1], color, w, size, extra)); };
  // Frame with origin o and axes the columns of R: x red, y green, z blue.
  function frame3(svg, P, C, o, R, len, w = 3, labels = false, opacity = 1) {
    const cols = [C.v4, C.v2, C.v1];
    for (let i = 0; i < 3; i++) {
      const e = [o[0] + R[0][i] * len, o[1] + R[1][i] * len, o[2] + R[2][i] * len];
      arrow3(svg, P, o, e, cols[i], w, 7, { opacity });
      if (labels) { const E = P(e); svg.append(txt(E[0] + 5, E[1] - 4, "xyz"[i], { fill: cols[i], size: 13, weight: 700 })); }
    }
  }
  function ground3(svg, P, C, half, step) {
    for (let v = -half; v <= half + 1e-9; v += step) { line3(svg, P, [v, -half, 0], [v, half, 0], C.border, 1); line3(svg, P, [-half, v, 0], [half, v, 0], C.border, 1); }
  }
  const hint3 = (svg, C, W, H) => svg.append(txt(W - 8, H - 8, L("drag to orbit", "拖动可转动视角"), { fill: C.faint, size: 12, weight: 500, anchor: "end" }));

  // ================================================================== lie
  Viz.register("lie", (root, cfg) => {
    const { stage, ctrls, foot } = shell(root, cfg);
    const MODES = [["so2", "SO(2)"], ["so3", "SO(3)"], ["se2", "SE(2)"], ["se3", "SE(3)"], ["bch", "BCH"]];
    let mode = MODES.some((m) => m[0] === cfg.mode) ? cfg.mode : "so2";
    // Hard limits (tools/build.mjs --check reports a config beyond them); inside them a slider
    // whose default range is too small for the configured value is widened to hold it.
    let theta = num(cfg.theta, 1.2, -TAU, TAU);
    let phi = vecN(cfg.phi, [0.6, 0.4, 0.9], 3, -TAU, TAU);
    let w2 = num(cfg.omega, 1.2, -6, 6), v2 = vecN(cfg.v, [1.5, 0], 2, -6, 6);
    const st0 = vecN(cfg.start, [-1.2, -0.8, 0.4], 3, -1e3, 1e3);
    const start = [clamp(st0[0], -6, 6), clamp(st0[1], -6, 6), st0[2]];
    let frame = cfg.frame === "world" ? "world" : "body";
    let w3 = vecN(cfg.omega, [0, 0, 2.5], 3, -6, 6), v3 = vecN(cfg.v, [1, 0, 0.5], 3, -6, 6);
    const ba = vecN(cfg.a, [0.9, 0, 0.3], 3, -PI, PI), bb = vecN(cfg.b, [0, 0.8, 0.2], 3, -PI, PI);
    // slider range: the default ±lim, widened (to the next 0.5) when a configured value is larger
    const rng = (lim, ...vals) => Math.max(lim, ...vals.map((v) => Math.ceil(Math.abs(v) * 2 - 1e-9) / 2));
    let bscale = 1, bsep = 1, t = 1, played = false;
    const W = 400;
    const wrap = h("div", { class: "tf-wrap" });
    const svg = s("svg", { class: "viz-svg" });
    const pre = h("pre", { class: "so3-mat" });
    pre.style.flex = "1 1 230px";
    wrap.append(cellOf(svg), pre);
    stage.append(wrap);
    const cp = cap(foot);
    let view = null, draw = () => {}, hook = () => ({});
    orbit(svg, () => view, () => draw());
    // Play runs t from 0 to 1 in 3 s; once played, faint copies at t = ¼, ½, ¾ stay behind as a
    // trail (until a slider moves), so the motion can still be read after it has stopped.
    const an = animator(root, (dt) => { t += dt / 3; if (t >= 1) { t = 1; draw(); return false; } draw(); });
    let play = null;
    const stopPlay = () => { play?.reset(); t = 1; played = false; };
    const mkPlay = () => (play = playButton(an, () => { t = 0; played = true; }));
    const TRAIL = [0.25, 0.5, 0.75];
    const setBox = (H) => svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    // ---------------------------------------------------------------- so2
    function buildSO2() {
      view = null;
      const cx = 150, cy = 150, R = 95, tx = cx + R, lineY = 318, lx0 = 34, lx1 = 366;
      const LX = (a) => lx0 + ((a + TAU) / (2 * TAU)) * (lx1 - lx0);
      const pt = (a, r = R) => [cx + r * Math.cos(a), cy - r * Math.sin(a)];
      const series = (th, N) => { let c = 0, sn = 0, term = 1; for (let k = 0; k <= N; k++) { if (k) term *= th / k; const m = k % 4; if (m === 0) c += term; else if (m === 1) sn += term; else if (m === 2) c -= term; else sn -= term; } return [c, sn]; };
      draw = () => {
        const C = colors();
        setBox(350);
        svg.innerHTML = "";
        // the group: the unit circle
        svg.append(ln(cx - R - 22, cy, cx + R + 14, cy, C.border2, 1), ln(cx, cy - R - 18, cx, cy + R + 18, C.border2, 1));
        svg.append(s("circle", { cx, cy, r: R, fill: "none", stroke: C.fg2, "stroke-width": 1.8 }));
        svg.append(txt(cx - R - 20, cy - R - 2, "SO(2)", { fill: C.fg2, size: 13.5, weight: 700 }));
        // the algebra: the tangent line at the identity
        svg.append(ln(tx, 16, tx, 284, C.v5, 1.4, { "stroke-dasharray": "5 4" }));
        svg.append(txt(tx + 8, 262, L("tangent line", "切线"), { fill: C.v5, size: 12.5 }), txt(tx + 8, 279, "𝔰𝔬(2) ≅ ℝ", { fill: C.v5, size: 12.5 }));
        // partial sums of the series, as points S_N·e₁
        const ps = [];
        for (let N = 0; N <= 8; N++) { const [c, sn] = series(theta, N); ps.push([cx + R * c, cy - R * sn]); }
        const inBox = (p) => p[0] > 4 && p[0] < 300 && p[1] > 4 && p[1] < 296;
        for (let i = 1; i < ps.length; i++) if (inBox(ps[i - 1]) && inBox(ps[i])) svg.append(ln(ps[i - 1][0], ps[i - 1][1], ps[i][0], ps[i][1], C.v3, 1.2, { opacity: 0.8 }));
        ps.forEach((p, i) => { if (inBox(p)) svg.append(s("circle", { cx: p[0], cy: p[1], r: 2.6, fill: C.v3 })); if (i && i <= 3 && inBox(p)) svg.append(txt(p[0] + 5, p[1] - 4, "N=" + i, { fill: C.v3, size: 11, weight: 600 })); });
        // the segment of length θ: a part w·θ already wrapped onto the circle, the rest still straight
        const w = t, aw = w * theta, rest = (1 - w) * theta;
        const arc = [];
        const m = Math.max(2, Math.ceil(Math.abs(aw) * 14));
        for (let i = 0; i <= m; i++) { const a = (aw * i) / m; arc.push(pt(a, R + 5 + 1.4 * Math.abs(a))); }
        if (Math.abs(aw) > 1e-4) svg.append(poly(arc, { stroke: C.v1, "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round" }));
        if (Math.abs(rest) > 1e-4) {
          const p0 = pt(aw, R + 5 + 1.4 * Math.abs(aw)), dir = [-Math.sin(aw), -Math.cos(aw)];
          // the straight part, cut where it would leave the picture
          const sg = Math.sign(rest), d = [dir[0] * sg, dir[1] * sg];
          let room = Math.abs(rest) * R;
          if (d[0] > 1e-9) room = Math.min(room, (W - 14 - p0[0]) / d[0]); else if (d[0] < -1e-9) room = Math.min(room, (14 - p0[0]) / d[0]);
          if (d[1] > 1e-9) room = Math.min(room, (292 - p0[1]) / d[1]); else if (d[1] < -1e-9) room = Math.min(room, (12 - p0[1]) / d[1]);
          room = Math.max(room, 0);
          const q = [p0[0] + d[0] * room, p0[1] + d[1] * room];
          svg.append(ln(p0[0], p0[1], q[0], q[1], C.v1, 4, { "stroke-linecap": "round", opacity: 0.55 }));
          if (room < Math.abs(rest) * R - 0.5) svg.append(txt(clamp(q[0] - d[0] * 4, 16, W - 16), clamp(q[1] - d[1] * 4 - 8, 14, 290), "⋯", { fill: C.v1, size: 16, anchor: "middle" }));
        }
        // the rotated basis and the point exp(θJ)·e₁
        const e1 = pt(theta), e2 = pt(theta + PI / 2);
        svg.append(arrow(cx, cy, e1[0], e1[1], C.v4, 3), arrow(cx, cy, e2[0], e2[1], C.v2, 3));
        svg.append(s("circle", { cx: pt(0)[0], cy: pt(0)[1], r: 4.5, fill: C.surface, stroke: C.fg, "stroke-width": 2 }));
        svg.append(txt(pt(0)[0] - 8, pt(0)[1] + 17, "I", { fill: C.fg, size: 13, anchor: "end", attrs: { "font-style": "italic" } }));
        svg.append(s("circle", { cx: e1[0], cy: e1[1], r: 5.5, fill: C.v1, stroke: C.surface, "stroke-width": 1.5 }));
        // the number line of θ: every θ + 2πk lands on the same rotation
        svg.append(ln(lx0, lineY, lx1, lineY, C.fg2, 1.6));
        for (let k = -2; k <= 2; k++) { svg.append(ln(LX(k * PI), lineY - 5, LX(k * PI), lineY + 5, C.fg2, 1.4)); svg.append(txt(LX(k * PI), lineY + 20, ["−2π", "−π", "0", "π", "2π"][k + 2], { fill: C.muted, size: 12, weight: 500, anchor: "middle" })); }
        for (const d of [-TAU, TAU]) { const a = theta + d; if (a >= -TAU - 1e-9 && a <= TAU + 1e-9) { svg.append(s("circle", { cx: LX(a), cy: lineY, r: 6, fill: C.surface, stroke: C.v1, "stroke-width": 2 })); svg.append(txt(LX(a), lineY - 12, L("same R", "同一个 R"), { fill: C.v1, size: 12, anchor: "middle" })); } }
        svg.append(s("circle", { cx: LX(theta), cy: lineY, r: 6.5, fill: C.v1 }));
        svg.append(txt(LX(theta), lineY - 12, "θ", { fill: C.v1, size: 14, weight: 700, anchor: "middle" }));
        const c = Math.cos(theta), sn = Math.sin(theta);
        const rows = [];
        for (const N of [1, 2, 3, 4, 5, 6, 7, 8, 12, 16]) { const [a, b] = series(theta, N); rows.push(`${String(N).padEnd(2)} ${n(a, 3).padStart(8)} ${n(b, 3).padStart(8)}  ${sci(Math.hypot(a - c, b - sn)).padStart(8)}`); }
        pre.textContent = [
          `θ = ${n(theta)} rad (${n((theta * 180) / PI, 1)}°)`, "",
          "J = [ 0 −1 ]", "    [ 1  0 ]", "",
          "exp(θJ) = [ cos θ  −sin θ ]", "          [ sin θ   cos θ ]", "        =", ...matLines([[c, -sn], [sn, c]], 3), "",
          L("Series Σ (θJ)ᵏ/k!, k = 0…N, first column:", "级数 Σ (θJ)ᵏ/k!（k = 0…N）的第一列："),
          L("N      cos≈     sin≈     error", "N      cos≈     sin≈     误差"), ...rows,
        ].join("\n");
        fitPre(pre);
        cp.innerHTML = L(
          `The blue segment has length θ on the tangent line at the identity; the exponential map <b>wraps it onto the circle</b>, an arc of the same length. θ and θ ± 2π land on the same rotation, so the logarithm has many values. Orange dots: the partial sums of the series, converging to the blue point.`,
          `蓝色线段是单位元处切线上长度为 θ 的一段；指数映射把它<b>卷到圆上</b>，得到同样长的一段弧。θ 和 θ ± 2π 落在同一个旋转上，所以对数映射有多个值。橙色点是级数的部分和，逐步收敛到蓝点。`);
      };
      hook = () => { const S = expmSeries([[0, -theta], [theta, 0]]); return { mode, theta, R: [[Math.cos(theta), -Math.sin(theta)], [Math.sin(theta), Math.cos(theta)]], series: S }; };
      ctrls.append(mkPlay(), wide(slider("$\\theta$ (rad)", { min: -TAU, max: TAU, value: theta, step: 0.01 }, (v) => { theta = v; stopPlay(); draw(); })));
    }

    // ---------------------------------------------------------------- so3
    function buildSO3() {
      view = makeView({ k: 112, cx: 200, cy: 186, yaw: 0.65, pitch: 0.42 });
      draw = () => {
        const C = colors(), P = view.P;
        setBox(350);
        svg.innerHTML = "";
        const th = norm3(phi), u = th > 1e-9 ? sc3(phi, 1 / th) : [0, 0, 1];
        const Rt = Exp3(sc3(phi, t)), R = Exp3(phi);
        ground3(svg, P, C, 1, 0.5);
        frame3(svg, P, C, [0, 0, 0], eye(3), 1.15, 1.4, false, 0.45);
        if (th > 1e-6) {
          line3(svg, P, sc3(u, -1.3), sc3(u, 1.3), C.v5, 1.6, { "stroke-dasharray": "6 4" });
          arrow3(svg, P, [0, 0, 0], sc3(u, 1.3), C.v5, 2.2, 8);
          const U = P(sc3(u, 1.3));
          svg.append(txt(U[0] + 6, U[1] - 4, "û", { fill: C.v5, size: 14, weight: 700 }));
          // arcs swept by the tips of the three axes
          const cols = [C.v4, C.v2, C.v1];
          for (let i = 0; i < 3; i++) {
            const pts = [], m = Math.max(2, Math.ceil(th * t * 12));
            for (let k = 0; k <= m; k++) { const Rk = Exp3(sc3(phi, (t * k) / m)); const q = P([Rk[0][i], Rk[1][i], Rk[2][i]]); pts.push(q); }
            svg.append(poly(pts, { stroke: cols[i], "stroke-width": 1.5, "stroke-dasharray": "3 3", opacity: 0.9 }));
          }
        }
        if (played) for (const tt of TRAIL) if (tt <= t) frame3(svg, P, C, [0, 0, 0], Exp3(sc3(phi, tt)), 1, 1.6, false, 0.4);
        frame3(svg, P, C, [0, 0, 0], Rt, 1, 3.4, true);
        hint3(svg, C, W, 350);
        const K = hat(u), lg = Log3(R);
        pre.textContent = [
          `φ = ${vecStr(phi)}`, `θ = ‖φ‖ = ${n(th)} rad (${n((th * 180) / PI, 0)}°)`, `û = φ/θ = ${vecStr(u)}`, "",
          "R = I + sin θ [û]× + (1 − cos θ)[û]×²", "",
          "sin θ [û]× =", ...matLines(msc(K, Math.sin(th))), "",
          "(1 − cos θ)[û]×² =", ...matLines(msc(mm(K, K), 1 - Math.cos(th))), "",
          "R = Exp(φ) =", ...matLines(R), "",
          `Log(R) = ${vecStr(lg)}`,
        ].join("\n");
        fitPre(pre);
        let note = "";
        if (th > PI + 1e-6) note = L(` Here ‖φ‖ > π, so Log returns the shorter way round: ${n(TAU - th)} rad about −û.`, ` 这里 ‖φ‖ > π，Log 给出的是绕 −û 转 ${n(TAU - th)} rad 的那条更短的路。`);
        else if (PI - th < 0.03) note = L(" At θ ≈ π the axis sign is ambiguous: û and −û give the same rotation.", " θ ≈ π 时转轴的正负号不确定：û 和 −û 是同一个旋转。");
        cp.innerHTML = L(
          `The rotation vector φ lives in the flat space 𝔰𝔬(3) ≅ ℝ³; Exp turns it into a rotation by θ = ‖φ‖ about û = φ/θ. Thin frame: the identity; thick frame: R; dashed arcs: the path of each axis.${note}`,
          `旋转向量 φ 住在平直的 𝔰𝔬(3) ≅ ℝ³ 里；Exp 把它变成绕 û = φ/θ 转 θ = ‖φ‖ 的旋转。细坐标架是单位元，粗坐标架是 R，虚线弧是各轴走过的路径。${note}`);
      };
      hook = () => { const R = Exp3(phi); return { mode, phi: phi.slice(), R, RtR: fro(madd(mm(tr(R), R), eye(3), -1)), det: det3(R), log: Log3(R), series: fro(madd(expmSeries(hat(phi)), R, -1)) }; };
      ctrls.append(mkPlay());
      const rp = rng(PI, ...phi);
      ["$\\phi_x$", "$\\phi_y$", "$\\phi_z$"].forEach((lab, i) => ctrls.append(wide(slider(lab, { min: -rp, max: rp, value: phi[i], step: 0.01 }, (v) => { phi[i] = v; stopPlay(); draw(); }))));
    }

    // ---------------------------------------------------------------- se2
    function buildSE2() {
      view = null;
      // the view is fitted to the motion (both conventions, the start pose, the origin and a
      // centre of rotation that is not far away), so a small motion is not lost in a corner
      let k = 58, cx = 200, cy = 178;
      const H = 356, TOP = 52;
      const X = (p) => [cx + k * p[0], cy - k * p[1]];
      const body = [[-0.36, -0.2], [0.22, -0.2], [0.44, 0], [0.22, 0.2], [-0.36, 0.2]];
      const compose = (A, B) => ({ R: [[A.R[0][0] * B.R[0][0] + A.R[0][1] * B.R[1][0], A.R[0][0] * B.R[0][1] + A.R[0][1] * B.R[1][1]], [A.R[1][0] * B.R[0][0] + A.R[1][1] * B.R[1][0], A.R[1][0] * B.R[0][1] + A.R[1][1] * B.R[1][1]]], p: [A.p[0] + A.R[0][0] * B.p[0] + A.R[0][1] * B.p[1], A.p[1] + A.R[1][0] * B.p[0] + A.R[1][1] * B.p[1]] });
      const S0 = () => ({ R: [[Math.cos(start[2]), -Math.sin(start[2])], [Math.sin(start[2]), Math.cos(start[2])]], p: [start[0], start[1]] });
      const poseAt = (fr, tt) => (fr === "body" ? compose(S0(), expSE2(w2, v2, tt)) : compose(expSE2(w2, v2, tt), S0()));
      const at = (Tm, q) => [Tm.p[0] + Tm.R[0][0] * q[0] + Tm.R[0][1] * q[1], Tm.p[1] + Tm.R[1][0] * q[0] + Tm.R[1][1] * q[1]];
      const ang = (Tm) => Math.atan2(Tm.R[1][0], Tm.R[0][0]);
      function drawBody(Tm, C, o) {
        const pts = body.map((q) => X(at(Tm, q)));
        svg.append(s("path", { d: pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("") + "Z", fill: o.fill || "none", "fill-opacity": o.fillOpacity ?? 0.18, stroke: o.stroke, "stroke-width": o.w || 2, "stroke-dasharray": o.dash || null, "stroke-linejoin": "round" }));
        if (o.frame) { const O = X(Tm.p), ex = X(at(Tm, [0.62, 0])), ey = X(at(Tm, [0, 0.62])); svg.append(arrow(O[0], O[1], ex[0], ex[1], C.v4, 2.4, 6), arrow(O[0], O[1], ey[0], ey[1], C.v2, 2.4, 6)); }
      }
      function fit() {
        const pts = [[0, 0]];
        for (const fr of ["body", "world"]) for (let i = 0; i <= 24; i++) { const Tm = poseAt(fr, i / 24); for (const q of body) pts.push(at(Tm, q)); }
        for (const q of body) pts.push(at(S0(), q));
        if (Math.abs(w2) > 1e-6) { const cb = [-v2[1] / w2, v2[0] / w2], c = frame === "body" ? at(S0(), cb) : cb; if (Math.hypot(c[0] - start[0], c[1] - start[1]) < 4) pts.push(c); }
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const x0 = Math.min(...xs) - 0.3, x1 = Math.max(...xs) + 0.3, y0 = Math.min(...ys) - 0.3, y1 = Math.max(...ys) + 0.3;
        k = clamp(Math.min((W - 30) / (x1 - x0), (H - TOP - 26) / (y1 - y0)), 20, 130);
        cx = W / 2 - (k * (x0 + x1)) / 2;
        cy = TOP + (H - TOP - 14) / 2 + (k * (y0 + y1)) / 2;
      }
      draw = () => {
        const C = colors();
        setBox(H);
        svg.innerHTML = "";
        fit();
        // grid at whole units (every 2 when zoomed far out), numbered along the bottom and left edges
        const stp = k < 34 ? 2 : 1, nums = [], boxes = []; // grid numbers are drawn last, skipping any that would touch a label
        for (let g = Math.ceil((8 - cx) / k / stp) * stp; cx + k * g <= W - 8; g += stp) { svg.append(ln(cx + k * g, 8, cx + k * g, H - 8, g ? C.border : C.border2, g ? 1 : 1.4)); if (cx + k * g > 24 && cx + k * g < W - 24) nums.push([cx + k * g, H - 12, g, "middle"]); }
        for (let g = Math.ceil((cy - (H - 8)) / k / stp) * stp; cy - k * g >= 8; g += stp) { svg.append(ln(8, cy - k * g, W - 8, cy - k * g, g ? C.border : C.border2, g ? 1 : 1.4)); if (cy - k * g > TOP + 8 && cy - k * g < H - 26) nums.push([12, cy - k * g - 3, g, "start"]); }
        if (cy > TOP && cy < H - 20) svg.append(txt(W - 10, cy - 6, "x", { fill: C.muted, size: 12.5, anchor: "end", attrs: { "font-style": "italic" } }));
        if (cx > 20 && cx < W - 20) svg.append(txt(cx + 6, TOP + 14, "y", { fill: C.muted, size: 12.5, attrs: { "font-style": "italic" } }));
        const other = frame === "body" ? "world" : "body";
        const path = (fr, tt) => { const pts = []; for (let i = 0; i <= 40; i++) pts.push(X(poseAt(fr, (tt * i) / 40).p)); return pts; };
        // the other convention, ghosted
        svg.append(poly(path(other, 1), { stroke: C.v3, "stroke-width": 1.4, "stroke-dasharray": "4 4", opacity: 0.8 }));
        drawBody(poseAt(other, 1), C, { stroke: C.v3, dash: "5 4", w: 1.8, fill: C.v3, fillOpacity: 0.07 });
        const lbl = (fr) => (fr === "world" ? L("world: Exp(tξ)·T₀", "世界系：Exp(tξ)·T₀") : L("body: T₀·Exp(tξ)", "本体系：T₀·Exp(tξ)"));
        svg.append(s("rect", { x: 8, y: 6, width: 196, height: 42, rx: 6, fill: C.surface, "fill-opacity": 0.85 }));
        svg.append(ln(14, 18, 36, 18, C.v1, 3), txt(42, 22, lbl(frame), { fill: C.v1, size: 12.5, weight: 700 }));
        svg.append(ln(14, 36, 36, 36, C.v3, 1.8, { "stroke-dasharray": "5 4" }), txt(42, 40, lbl(other), { fill: C.v3, size: 12.5 }));
        // start pose
        drawBody(S0(), C, { stroke: C.fg2, w: 1.8, fill: C.fg2, fillOpacity: 0.08, frame: false });
        const O0 = X(at(S0(), [-0.62, 0])); // behind the start pose's tail
        boxes.push([O0[0] - 12, O0[1] - 10, O0[0] + 12, O0[1] + 9]);
        svg.append(txt(O0[0], O0[1] + 5, "$T_0$", { fill: C.fg2, size: 13.5, anchor: "middle", attrs: { "font-style": "italic", stroke: C.surface, "stroke-width": 3, "paint-order": "stroke" } }));
        // instantaneous centre of rotation
        let icr = null;
        if (Math.abs(w2) > 1e-6) { const cb = [-v2[1] / w2, v2[0] / w2]; icr = frame === "body" ? at(S0(), cb) : cb; }
        const Tc = poseAt(frame, t);
        if (icr) {
          const I = X(icr), O = X(Tc.p);
          if (I[0] > 6 && I[0] < W - 6 && I[1] > 6 && I[1] < H - 6) {
            svg.append(ln(I[0], I[1], O[0], O[1], C.v5, 1.2, { "stroke-dasharray": "3 3" }));
            svg.append(s("path", { d: `M${I[0] - 6},${I[1] - 6}L${I[0] + 6},${I[1] + 6}M${I[0] - 6},${I[1] + 6}L${I[0] + 6},${I[1] - 6}`, stroke: C.v5, "stroke-width": 2.6, "stroke-linecap": "round" }));
            // the label goes on the side of the cross away from the body
            const dl = Math.hypot(I[0] - O[0], I[1] - O[1]) || 1, ux = (I[0] - O[0]) / dl, uy = (I[1] - O[1]) / dl;
            const lab = L("centre of rotation", "瞬时转动中心"), lw = textWidth(lab, 12, 600);
            const anc = ux > 0.35 ? "start" : ux < -0.35 ? "end" : "middle", lx0 = I[0] + ux * 14, x0 = anc === "start" ? lx0 : anc === "end" ? lx0 - lw : lx0 - lw / 2;
            const xl = clamp(x0, 6, W - 6 - lw), yl = clamp(I[1] + uy * 16 + 4, TOP + 12, H - 24);
            boxes.push([xl - 2, yl - 12, xl + lw + 2, yl + 4]);
            svg.append(txt(xl, yl, lab, { fill: C.v5, size: 12, attrs: { stroke: C.surface, "stroke-width": 3, "paint-order": "stroke", "stroke-linejoin": "round" } }));
          }
        }
        svg.append(poly(path(frame, 1), { stroke: C.v1, "stroke-width": 1.2, opacity: 0.35 }));
        if (played) for (const tt of TRAIL) if (tt <= t) drawBody(poseAt(frame, tt), C, { stroke: C.v1, w: 1.2, fill: C.v1, fillOpacity: 0.05, dash: "3 3" });
        svg.append(poly(path(frame, t), { stroke: C.v1, "stroke-width": 3, "stroke-linecap": "round" }));
        drawBody(Tc, C, { stroke: C.v1, w: 2.4, fill: C.v1, fillOpacity: 0.2, frame: true });
        for (const [x, y, g, anc] of nums) {
          const w = 8 * String(g).length, x0 = anc === "middle" ? x - w / 2 : x, bx = [x0 - 2, y - 10, x0 + w + 2, y + 2];
          if (!boxes.some((o) => bx[0] < o[2] && o[0] < bx[2] && bx[1] < o[3] && o[1] < bx[3])) svg.append(txt(x, y, String(g).replace("-", "−"), { fill: C.faint, size: 10.5, weight: 500, anchor: anc }));
        }
        const E = expSE2(w2, v2), Tb = poseAt("body", 1), Tw = poseAt("world", 1);
        pre.textContent = [
          `ξ = (ω, v) = (${n(w2)}; ${n(v2[0])}, ${n(v2[1])})`, "",
          "Exp(ξ) = [ R(ω)  V(ω)v ]", "         [  0      1   ]", "",
          "V(ω) =", ...matLines(E.V, 3), "",
          "Exp(ξ) =", ...matLines([[E.R[0][0], E.R[0][1], E.p[0]], [E.R[1][0], E.R[1][1], E.p[1]], [0, 0, 1]], 3), "",
          L("End pose (x, y, angle):", "终点位姿 (x, y, 角度)："),
          // one pose per line, its name on the line above, so a narrow panel does not cut the numbers off
          `${L("body", "本体系")}  T₀·Exp(ξ):`, `  (${n(Tb.p[0])}, ${n(Tb.p[1])}, ${n(ang(Tb))})`,
          `${L("world", "世界系")} Exp(ξ)·T₀:`, `  (${n(Tw.p[0])}, ${n(Tw.p[1])}, ${n(ang(Tw))})`,
        ].join("\n");
        fitPre(pre);
        const icrTxt = Math.abs(w2) < 1e-6
          ? L("ω = 0: the path is a straight line and the centre of rotation is at infinity (pure translation).", "ω = 0：路径是直线，转动中心在无穷远处（纯平移）。")
          : L(`A constant twist moves the body on a circle about the centre of rotation, at (−v<sub>y</sub>/ω, v<sub>x</sub>/ω) = (${n(-v2[1] / w2)}, ${n(v2[0] / w2)}) in the ${frame === "body" ? "body frame of T₀" : "world frame"}.`, `恒定的旋量让物体绕瞬时转动中心走圆弧，中心在${frame === "body" ? " T₀ 的本体系" : "世界系"}里的 (−v<sub>y</sub>/ω, v<sub>x</sub>/ω) = (${n(-v2[1] / w2)}, ${n(v2[0] / w2)})。`);
        cp.innerHTML = icrTxt + " " + L("Blue: the selected convention; orange dashed: the same ξ applied on the other side. <b>Right-multiplying moves in the body frame, left-multiplying in the world frame</b> — the end poses differ.", "蓝色是当前选的约定，橙色虚线是把同一个 ξ 乘在另一侧。<b>右乘是在本体系里动，左乘是在世界系里动</b>，两个终点位姿不一样。");
      };
      hook = () => {
        const E = expSE2(w2, v2), S = expmSeries([[0, -w2, v2[0]], [w2, 0, v2[1]], [0, 0, 0]]);
        const M = [[E.R[0][0], E.R[0][1], E.p[0]], [E.R[1][0], E.R[1][1], E.p[1]], [0, 0, 1]];
        const Tb = poseAt("body", 1), Tw = poseAt("world", 1);
        const S0m = [[Math.cos(start[2]), -Math.sin(start[2]), start[0]], [Math.sin(start[2]), Math.cos(start[2]), start[1]], [0, 0, 1]];
        const Bm = mm(S0m, S), Wm = mm(S, S0m);
        return { mode, frame, w: w2, v: v2.slice(), closedVsSeries: fro(madd(M, S, -1)), bodyErr: Math.hypot(Tb.p[0] - Bm[0][2], Tb.p[1] - Bm[1][2], Tb.R[0][0] - Bm[0][0], Tb.R[1][0] - Bm[1][0]), worldErr: Math.hypot(Tw.p[0] - Wm[0][2], Tw.p[1] - Wm[1][2], Tw.R[0][0] - Wm[0][0], Tw.R[1][0] - Wm[1][0]), bodyWorldGap: Math.hypot(Tb.p[0] - Tw.p[0], Tb.p[1] - Tw.p[1]), t };
      };
      ctrls.append(mkPlay(), seg([["body", L("body (right)", "本体系（右乘）")], ["world", L("world (left)", "世界系（左乘）")]], frame, (f) => { frame = f; draw(); }));
      ctrls.append(wide(slider("$\\omega$ (rad/s)", { min: -rng(3, w2), max: rng(3, w2), value: w2, step: 0.01 }, (v) => { w2 = v; stopPlay(); draw(); })), wide(slider("$v_x$", { min: -rng(2, ...v2), max: rng(2, ...v2), value: v2[0], step: 0.01 }, (v) => { v2[0] = v; stopPlay(); draw(); })), wide(slider("$v_y$", { min: -rng(2, ...v2), max: rng(2, ...v2), value: v2[1], step: 0.01 }, (v) => { v2[1] = v; stopPlay(); draw(); })));
    }

    // ---------------------------------------------------------------- se3
    function buildSE3() {
      view = makeView({ k: 96, cx: 200, cy: 200, yaw: 0.7, pitch: 0.45 });
      draw = () => {
        const C = colors(), P = view.P;
        setBox(360);
        svg.innerHTML = "";
        // zoom out until the whole path, the end frame and the screw axis fit (rotation-invariant,
        // so orbiting never pushes anything out of the picture)
        {
          const wn0 = norm3(w3), pts = [];
          for (let i = 0; i <= 24; i++) { const E = expSE3(w3, v3, i / 24); pts.push(E.p, add3(E.p, sc3(E.R.map((r) => r[0]), 0.7)), add3(E.p, sc3(E.R.map((r) => r[2]), 0.7))); }
          if (wn0 > 1e-6) { const q0 = sc3(cross3(w3, v3), 1 / (wn0 * wn0)), d0 = sc3(w3, 1 / wn0); pts.push(add3(q0, sc3(d0, 1.3)), add3(q0, sc3(d0, -1.3))); }
          view.st.k = Math.min(96, 148 / Math.max(1.3, ...pts.map(norm3)));
        }
        ground3(svg, P, C, 1.5, 0.5);
        frame3(svg, P, C, [0, 0, 0], eye(3), 0.7, 1.4, false, 0.5);
        const wn = norm3(w3);
        let q = null, hp = null;
        if (wn > 1e-6) {
          q = sc3(cross3(w3, v3), 1 / (wn * wn));
          hp = dot3(w3, v3) / (wn * wn);
          const d = sc3(w3, 1 / wn);
          line3(svg, P, add3(q, sc3(d, -1.3)), add3(q, sc3(d, 1.3)), C.v5, 1.8, { "stroke-dasharray": "7 4" });
          arrow3(svg, P, add3(q, sc3(d, 1.0)), add3(q, sc3(d, 1.3)), C.v5, 2, 8);
          const Q = P(add3(q, sc3(d, 1.3)));
          svg.append(txt(Q[0] + 6, Q[1] - 4, L("screw axis", "螺旋轴"), { fill: C.v5, size: 12.5 }));
        }
        const pathPts = (tt) => { const pts = []; for (let i = 0; i <= 48; i++) pts.push(P(expSE3(w3, v3, (tt * i) / 48).p)); return pts; };
        svg.append(poly(pathPts(1), { stroke: C.v3, "stroke-width": 1.3, opacity: 0.45 }));
        svg.append(poly(pathPts(t), { stroke: C.v3, "stroke-width": 3, "stroke-linecap": "round" }));
        const E = expSE3(w3, v3, t);
        if (q) { // radius from the axis to the moving origin
          const d = sc3(w3, 1 / wn), rel = sub3(E.p, q), footp = add3(q, sc3(d, dot3(rel, d)));
          line3(svg, P, footp, E.p, C.v5, 1.1, { "stroke-dasharray": "3 3" });
        }
        if (played) for (const tt of TRAIL) if (tt <= t) { const Et = expSE3(w3, v3, tt); frame3(svg, P, C, Et.p, Et.R, 0.45, 1.6, false, 0.4); }
        frame3(svg, P, C, E.p, E.R, 0.62, 3.2, true);
        hint3(svg, C, W, 360);
        const E1 = expSE3(w3, v3, 1);
        const T4 = [[...E1.R[0], E1.p[0]], [...E1.R[1], E1.p[1]], [...E1.R[2], E1.p[2]], [0, 0, 0, 1]];
        pre.textContent = [
          `ξ = (ω, v)`, `ω = ${vecStr(w3)}`, `v = ${vecStr(v3)}`, "",
          `θ = ‖ω‖ = ${n(wn)} rad`,
          ...(wn > 1e-6 ? [`${L("pitch", "螺距")} h = ω·v/‖ω‖²`, `  = ${n(hp, 3)} ${L("m per rad", "米/弧度")}`, `${L("axis point", "轴上一点")} q = ω×v/‖ω‖²`, `  = ${vecStr(q)}`] : [L("ω = 0: pure translation", "ω = 0：纯平移")]), "",
          "T = Exp(ξ) = [ R  Vv ]", "             [ 0   1 ]", ...matLines(T4),
        ].join("\n");
        fitPre(pre);
        cp.innerHTML = wn > 1e-6
          ? L("Every rigid motion is a <b>screw</b>: a turn by θ about a fixed axis plus a slide of h·θ along it (Chasles). The orange curve is the path of the frame's origin for t from 0 to 1; with h = 0 it is a circular arc, with ω = 0 a straight line.", "每个刚体运动都是一次<b>螺旋运动</b>：绕一条固定轴转 θ，再沿轴滑 h·θ（Chasles 定理）。橙色曲线是坐标架原点在 t 从 0 到 1 时走过的路径；h = 0 时是圆弧，ω = 0 时是直线。")
          : L("With ω = 0 the twist is a pure translation: the frame slides along v without turning, and there is no screw axis at a finite distance.", "ω = 0 时旋量是纯平移：坐标架沿 v 滑动而不转动，有限远处没有螺旋轴。");
      };
      hook = () => {
        const E = expSE3(w3, v3, 1), K = hat(w3);
        const A = [[...K[0], v3[0]], [...K[1], v3[1]], [...K[2], v3[2]], [0, 0, 0, 0]];
        const T4 = [[...E.R[0], E.p[0]], [...E.R[1], E.p[1]], [...E.R[2], E.p[2]], [0, 0, 0, 1]];
        const wn = norm3(w3);
        return { mode, w: w3.slice(), v: v3.slice(), closedVsSeries: fro(madd(T4, expmSeries(A), -1)), pitch: wn > 1e-9 ? dot3(w3, v3) / (wn * wn) : null };
      };
      ctrls.append(mkPlay());
      const rw = rng(3, ...w3), rv = rng(1.5, ...v3);
      ["$\\omega_x$", "$\\omega_y$", "$\\omega_z$"].forEach((lab, i) => ctrls.append(wide(slider(lab, { min: -rw, max: rw, value: w3[i], step: 0.01 }, (v) => { w3[i] = v; stopPlay(); draw(); }))));
      ["$v_x$", "$v_y$", "$v_z$"].forEach((lab, i) => ctrls.append(wide(slider(lab, { min: -rv, max: rv, value: v3[i], step: 0.01 }, (v) => { v3[i] = v; stopPlay(); draw(); }))));
    }

    // ---------------------------------------------------------------- bch
    function buildBCH() {
      view = makeView({ k: 112, cx: 200, cy: 196, yaw: 0.65, pitch: 0.42 });
      // J_r⁻¹(φ) = I + ½[φ]× + (1/θ² − (1 + cos θ)/(2θ sin θ)) [φ]×²  (singular at θ = 2π, 4π, …)
      const JrInv = (p) => {
        const th = norm3(p), K = hat(p);
        if (th < 1e-6) return madd(eye(3), msc(K, 0.5));
        const sn = Math.sin(th);
        // at θ = π the last term's fraction tends to 0; at θ = 2π, 4π, … J_r⁻¹ does not exist
        const f = Math.abs(sn) < 1e-9 ? (Math.cos(th) < 0 ? 0 : null) : (1 + Math.cos(th)) / (2 * th * sn);
        if (f == null) return null;
        return madd(madd(eye(3), msc(K, 0.5)), msc(mm(K, K), 1 / (th * th) - f));
      };
      const errs = (sc) => {
        const a = sc3(ba, sc), b = sc3(bb, sc * bsep);
        const R = mm(Exp3(a), Exp3(b)), R1 = Exp3(add3(a, b)), R2 = Exp3(add3(add3(a, b), sc3(cross3(a, b), 0.5)));
        const J = JrInv(a), R3 = J ? Exp3(add3(a, mv(J, b))) : null;
        return { a, b, R, R1, R2, R3, e1: angleOf(mm(tr(R), R1)), e2: angleOf(mm(tr(R), R2)), e3: R3 ? angleOf(mm(tr(R), R3)) : NaN };
      };
      const sciF = (v) => (Number.isFinite(v) ? sci(v) : "—");
      let scaleSl = null, sepSl = null;
      draw = () => {
        const C = colors(), P = view.P, H = 476;
        setBox(H);
        svg.innerHTML = "";
        const E = errs(bscale), Eh = errs(bscale / 2);
        svg.append(s("circle", { cx: view.st.cx, cy: view.st.cy, r: view.st.k, fill: "none", stroke: C.border2, "stroke-width": 1, "stroke-dasharray": "3 4" }));
        frame3(svg, P, C, [0, 0, 0], eye(3), 1.12, 1.2, false, 0.4);
        const sets = [[E.R1, C.v3, 2.2], [E.R2, C.v2, 2.2], [E.R3, C.v5, 2.2, "5 3"], [E.R, C.v1, 3.2]];
        for (const [Rm, col, w, dash] of sets) if (Rm) for (let i = 0; i < 3; i++) arrow3(svg, P, [0, 0, 0], [Rm[0][i], Rm[1][i], Rm[2][i]], col, w, 7, dash ? { "stroke-dasharray": dash } : {});
        for (let i = 0; i < 3; i++) { const q = P([E.R[0][i] * 1.1, E.R[1][i] * 1.1, E.R[2][i] * 1.1]); svg.append(txt(q[0], q[1], "xyz"[i], { fill: C.v1, size: 13, weight: 700, anchor: "middle" })); }
        // legend: the exact product and the three approximations, with how fast each error falls
        const halo = { stroke: C.surface, "stroke-width": 3, "paint-order": "stroke", "stroke-linejoin": "round" };
        const leg = [["Exp(a)·Exp(b)", L("exact", "精确值"), C.v1], ["Exp(a + b)", L("error ∝ size²", "误差 ∝ 大小²"), C.v3], ["Exp(a + b + ½ a×b)", L("error ∝ size³", "误差 ∝ 大小³"), C.v2], ["$\\operatorname{Exp}(a + J_r^{-1}(a)\\,b)$", L("all orders in a", "对 a 不截断"), C.v5]];
        leg.forEach(([f, note, col], i) => { const y = 18 + 18 * i; svg.append(txt(10, y, f, { fill: col, size: 12.5, weight: 700, attrs: halo })); svg.append(txt(10 + textWidth(texPlainSafe(f), 12.5, 700) + 8, y, note, { fill: C.muted, size: 11.5, weight: 500, attrs: halo })); });
        // log–log strip: error against the joint scale of a and b
        const x0 = 50, x1 = 384, y0 = 352, y1 = 448;
        const scales = [1.5, 0.75, 0.375, 0.1875, 0.09375, 0.046875];
        const data = scales.map((sc) => errs(sc));
        const fin = (v) => Number.isFinite(v) && v > 0;
        const all = data.flatMap((d) => [d.e1, d.e2, d.e3]).filter(fin);
        const lo = Math.log10(Math.max(1e-12, Math.min(...all))), hi = Math.log10(Math.max(...all));
        const X = (sc) => x0 + ((Math.log2(1.5) - Math.log2(sc)) / 5) * (x1 - x0);
        const Y = (e) => y1 - ((Math.log10(Math.max(e, 1e-12)) - lo) / Math.max(1e-9, hi - lo)) * (y1 - y0);
        svg.append(s("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill: "none", stroke: C.border2 }));
        svg.append(txt(x0, y0 - 8, L("angle error to the exact product (log) against the scale of a, b (log)", "与精确乘积的角度误差（对数）随 a、b 缩放（对数）"), { fill: C.fg2, size: 11.5 }));
        scales.forEach((sc) => { svg.append(ln(X(sc), y1, X(sc), y1 + 4, C.fg2, 1)); svg.append(txt(X(sc), y1 + 16, n(sc, sc < 0.1 ? 3 : 2), { fill: C.muted, size: 11, weight: 500, anchor: "middle" })); });
        const line = (key, col, dash) => { const pts = scales.map((sc, i) => [X(sc), Y(data[i][key])]).filter((_, i) => fin(data[i][key])); if (pts.length > 1) svg.append(poly(pts, { stroke: col, "stroke-width": 2.2, "stroke-dasharray": dash || null })); };
        line("e1", C.v3); line("e2", C.v2); line("e3", C.v5, "5 3");
        const xs = clamp(X(bscale), x0, x1);
        svg.append(ln(xs, y0, xs, y1, C.fg2, 1, { "stroke-dasharray": "3 3" }));
        for (const [v, col] of [[E.e1, C.v3], [E.e2, C.v2], [E.e3, C.v5]]) if (fin(v)) svg.append(s("circle", { cx: xs, cy: clamp(Y(v), y0, y1), r: 4.5, fill: col }));
        svg.append(txt(x1 - 4, y0 + 14, L("smaller →", "更小 →"), { fill: C.muted, size: 11, weight: 500, anchor: "end" }));
        hint3(svg, C, W, 330);
        const deg = (r) => (Number.isFinite(r) ? n((r * 180) / PI, 2) + "°" : "—");
        const ratio = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b > 0 ? "÷" + n(a / b, 1) : "");
        pre.textContent = [
          `a = ${vecStr(E.a)}`, `b = ${vecStr(E.b)}`, `½ a×b = ${vecStr(sc3(cross3(E.a, E.b), 0.5), 3)}`, "",
          L("Angle to Exp(a)Exp(b):", "与 Exp(a)Exp(b) 的夹角："),
          ` Exp(a+b)          ${sciF(E.e1)} rad (${deg(E.e1)})`,
          ` Exp(a+b+½a×b)     ${sciF(E.e2)} rad (${deg(E.e2)})`,
          ` Exp(a+Jr⁻¹(a)b)   ${sciF(E.e3)} rad (${deg(E.e3)})`, "",
          L(`Halve a and b (scale ${n(bscale / 2, 3)}):`, `把 a、b 减半（缩放 ${n(bscale / 2, 3)}）：`),
          ` Exp(a+b)          ${sciF(Eh.e1)} ${ratio(E.e1, Eh.e1)}`,
          ` Exp(a+b+½a×b)     ${sciF(Eh.e2)} ${ratio(E.e2, Eh.e2)}`,
          ` Exp(a+Jr⁻¹(a)b)   ${sciF(Eh.e3)} ${ratio(E.e3, Eh.e3)}`,
        ].join("\n");
        fitPre(pre);
        cp.innerHTML = L(
          "Rotations do not commute, so Exp(a)·Exp(b) is <b>not</b> Exp(a + b). The first correction is half the bracket, ½ a×b. Shrink a and b together: the plain sum's error falls about 4× per halving (second order), the corrected one about 8× (third order). The violet dashed frame keeps every order in a and only the first order in b, Exp(a + J<sub>r</sub>⁻¹(a) b): it is the one to use for a small step b on top of a large a — make b alone small with its own slider and its error vanishes even though a is large.",
          "旋转不可交换，所以 Exp(a)·Exp(b) <b>不等于</b> Exp(a + b)。第一项修正是李括号的一半，½ a×b。把 a、b 一起缩小：直接相加的误差每减半约降到 1/4（二阶），加了修正后约降到 1/8（三阶）。紫色虚线坐标架对 a 保留所有阶、对 b 只保留一阶，即 Exp(a + J<sub>r</sub>⁻¹(a) b)：在很大的 a 上叠加一个小步长 b 时就用它——用 b 自己的滑块把 b 调小，即使 a 很大，它的误差也会消失。");
      };
      hook = () => { const E = errs(bscale), Eh = errs(bscale / 2); return { mode, scale: bscale, bScale: bsep, e1: E.e1, e2: E.e2, e3: E.e3, ratio1: E.e1 / Eh.e1, ratio2: E.e2 / Eh.e2, ratio3: E.e3 / Eh.e3 }; };
      scaleSl = wide(slider(L("scale of a and b", "a、b 一起缩放"), { min: 0.05, max: 1.5, value: bscale, step: 0.01 }, (v) => { bscale = v; draw(); }));
      sepSl = wide(slider(L("scale of b alone", "只缩放 b"), { min: 0, max: 3, value: bsep, step: 0.01 }, (v) => { bsep = v; draw(); }));
      ctrls.append(scaleSl, sepSl, btn(L("halve a and b", "a、b 减半"), () => { bscale = Math.max(0.05, bscale / 2); scaleSl.set(bscale); draw(); }), btn(T().reset, () => { bscale = 1; bsep = 1; scaleSl.set(1); sepSl.set(1); draw(); }));
    }

    const BUILD = { so2: buildSO2, so3: buildSO3, se2: buildSE2, se3: buildSE3, bch: buildBCH };
    function build() {
      an.stop();
      t = 1;
      play = null;
      ctrls.innerHTML = "";
      ctrls.append(seg(MODES, mode, (m) => { mode = m; build(); }));
      BUILD[mode]();
      draw();
    }
    root.__vizTest = () => hook();
    build();
  });

  // ------------------------------------------------------------------ spherical harmonics
  // Real spherical harmonics up to l = 3 as polynomials in (x, y, z) on the unit sphere,
  // orthonormal; index l² + l + m.
  const SHK = (() => {
    const q = Math.sqrt, p = Math.PI;
    return { c0: 0.5 * q(1 / p), c1: q(3 / (4 * p)), c2a: 0.5 * q(15 / p), c20: 0.25 * q(5 / p), c22: 0.25 * q(15 / p), c33: 0.25 * q(35 / (2 * p)), c32: 0.5 * q(105 / p), c31: 0.25 * q(21 / (2 * p)), c30: 0.25 * q(7 / p), c32b: 0.25 * q(105 / p) };
  })();
  function shEval(v, lmax) {
    const [x, y, z] = v, k = SHK, out = [k.c0];
    if (lmax >= 1) out.push(k.c1 * y, k.c1 * z, k.c1 * x);
    if (lmax >= 2) out.push(k.c2a * x * y, k.c2a * y * z, k.c20 * (3 * z * z - 1), k.c2a * x * z, k.c22 * (x * x - y * y));
    if (lmax >= 3) out.push(k.c33 * y * (3 * x * x - y * y), k.c32 * x * y * z, k.c31 * y * (5 * z * z - 1), k.c30 * z * (5 * z * z - 3), k.c31 * x * (5 * z * z - 1), k.c32b * z * (x * x - y * y), k.c33 * x * (x * x - 3 * y * y));
    return out;
  }
  // Gauss–Legendre nodes in cos θ times a uniform grid in the azimuth: exact for the
  // products of two harmonics with l ≤ 3 (polynomial degree ≤ 6).
  const QUAD = (() => {
    const nq = 8, pts = [];
    for (let i = 0; i < nq; i++) {
      let z = Math.cos((PI * (i + 0.75)) / (nq + 0.5)), pp = 1;
      for (let it = 0; it < 60; it++) {
        let p1 = 1, p2 = 0;
        for (let j = 1; j <= nq; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
        pp = (nq * (z * p1 - p2)) / (z * z - 1);
        const dz = p1 / pp;
        z -= dz;
        if (Math.abs(dz) < 1e-15) break;
      }
      const wz = 2 / ((1 - z * z) * pp * pp), r = Math.sqrt(1 - z * z);
      for (let j = 0; j < 16; j++) { const a = (TAU * (j + 0.5)) / 16; pts.push({ v: [r * Math.cos(a), r * Math.sin(a), z], w: (wz * TAU) / 16 }); }
    }
    return pts;
  })();
  // Wigner-D for real harmonics, all l ≤ lmax at once: D[m'][m] = ∫ Y_m'(n) Y_m(R⁻¹n) dn,
  // so the coefficients of the rotated function g(R⁻¹n) are c' = D c.
  function wignerD(R, lmax) {
    const N = (lmax + 1) ** 2, D = Array.from({ length: N }, () => new Array(N).fill(0)), Rt = tr(R);
    for (const q of QUAD) {
      const a = shEval(q.v, lmax), b = shEval(mv(Rt, q.v), lmax);
      for (let i = 0; i < N; i++) { const ai = a[i] * q.w; for (let j = 0; j < N; j++) D[i][j] += ai * b[j]; }
    }
    return D;
  }
  const heatColor = (v, C) => mix(C.surface, v >= 0 ? C.v1 : C.v4, clamp(Math.abs(v), 0, 1) * 0.85);

  // ================================================================== irreps
  Viz.register("irreps", (root, cfg) => {
    const { stage, ctrls, foot } = shell(root, cfg);
    const MODES = [["circle", L("circle · SO(2)", "圆 · SO(2)")], ["sphere", L("sphere · SO(3)", "球面 · SO(3)")], ["tensor", L("tensor product", "张量积")]];
    let mode = MODES.some((m) => m[0] === cfg.mode) ? cfg.mode : "circle";
    let alpha = num(cfg.alpha, 0.6, -TAU, TAU);
    // circle
    const flat = Array.isArray(cfg.coeffs) && cfg.coeffs.every((x) => typeof x === "number" && Number.isFinite(x));
    const amps = [1, 0.6, 0.3, 0, 0.15];
    if (flat) for (let m = 0; m < 5; m++) amps[m] = clamp(cfg.coeffs[m] ?? 0, -2, 2);
    let msel = 1;
    // sphere
    const nested = Array.isArray(cfg.coeffs) && cfg.coeffs.length > 0 && cfg.coeffs.every((x) => Array.isArray(x));
    let lmax = Number.isInteger(cfg.lmax) ? clamp(cfg.lmax, 0, 3) : nested ? clamp(cfg.coeffs.length - 1, 0, 3) : 2;
    const DEF = [[0.3], [0, 0.5, 0.3], [0, 0, 0.8, 0, 0.5], [0, 0, 0, 0.4, 0, 0, 0]];
    const mixCoeffs = () => { const c = []; for (let l = 0; l <= lmax; l++) for (let m = 0; m < 2 * l + 1; m++) { const src = nested ? cfg.coeffs[l] : DEF[l]; const v = src && typeof src[m] === "number" && Number.isFinite(src[m]) ? src[m] : 0; c.push(clamp(v, -3, 3)); } if (!c.some((v) => Math.abs(v) > 1e-9)) c[0] = 1; return c; };
    let coef = mixCoeffs(), preset = "mix";
    let yaw = clamp(alpha, -PI, PI), pitch = 0.5;
    // tensor
    // a and b are taken as given (up to ±10); the 3-D view zooms out to fit them
    const TP = { generic: [vecN(cfg.a, [1, 0, 0.5], 3, -10, 10), vecN(cfg.b, [0.2, 1, 0], 3, -10, 10)], parallel: [[1, 0.4, 0.3], [0.5, 0.2, 0.15]], perp: [[1, 0, 0.5], [0, 1, 0]] };
    let tp = "generic";
    const W = 400;
    const wrap = h("div", { class: "tf-wrap" });
    const svg = s("svg", { class: "viz-svg" }), svg2 = s("svg", { class: "viz-svg" });
    const cell1 = cellOf(svg), cell2 = cellOf(svg2);
    const pre = h("pre", { class: "so3-mat" });
    pre.style.flex = "1 1 230px";
    stage.append(wrap);
    const cp = cap(foot);
    let view = null, draw = () => {}, hook = () => ({}), tick = null;
    orbit(svg, () => view, () => draw());
    const an = animator(root, (dt) => (tick ? tick(dt) : false));

    // ---------------------------------------------------------------- circle
    function buildCircle() {
      view = null;
      wrap.innerHTML = "";
      wrap.append(cell1, pre);
      const cx = 200, cy = 128, R0 = 70, colW = 76, dialY = 368, dialR = 25, barBase = 332, barMax = 42;
      const F = () => Math.max(1e-6, amps.slice(1).reduce((a, v) => a + Math.abs(v), 0));
      const f = (th, al) => amps.reduce((a, A, m) => a + (m ? A * Math.cos(m * (th - al)) : 0), 0);
      // Fourier coefficients of the rotated signal, measured from 64 samples
      const measure = (al) => { const N = 64, a = new Array(5).fill(0), b = new Array(5).fill(0); for (let i = 0; i < N; i++) { const th = (TAU * i) / N, v = amps.reduce((s0, A, m) => s0 + A * Math.cos(m * (th - al)), 0); for (let m = 0; m < 5; m++) { a[m] += (v * Math.cos(m * th) * (m ? 2 : 1)) / N; b[m] += (v * Math.sin(m * th) * 2) / N; } } return { a, b }; };
      draw = () => {
        const C = colors();
        svg.setAttribute("viewBox", `0 0 ${W} 420`);
        svg.innerHTML = "";
        const Fn = F(), base = 0.7 + 0.3 * clamp(Math.abs(amps[0]), 0, 1.5), rr = (th, al) => Math.max(5, R0 * (base + (0.5 * f(th, al)) / Fn));
        const curve = (al) => { const pts = []; for (let i = 0; i <= 180; i++) { const th = (TAU * i) / 180, r = rr(th, al); pts.push([cx + r * Math.cos(th), cy - r * Math.sin(th)]); } return pts; };
        svg.append(s("circle", { cx, cy, r: R0 * base, fill: "none", stroke: C.border2, "stroke-dasharray": "3 4" }));
        svg.append(ln(cx - 118, cy, cx + 118, cy, C.border, 1), ln(cx, cy - 118, cx, cy + 118, C.border, 1));
        svg.append(poly(curve(0), { stroke: C.faint, "stroke-width": 1.6, "stroke-dasharray": "5 4" }));
        svg.append(s("path", { d: curve(alpha).map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("") + "Z", fill: C.v1, "fill-opacity": 0.1, stroke: C.v1, "stroke-width": 2.6, "stroke-linejoin": "round" }));
        // the rotation α as an arc
        const arcPts = []; const ma = Math.max(2, Math.ceil(Math.abs(alpha) * 12));
        for (let i = 0; i <= ma; i++) { const a = (alpha * i) / ma; arcPts.push([cx + 112 * Math.cos(a), cy - 112 * Math.sin(a)]); }
        if (Math.abs(alpha) > 0.02) svg.append(poly(arcPts, { stroke: C.v3, "stroke-width": 2.2 }));
        const tip = [cx + 112 * Math.cos(alpha), cy - 112 * Math.sin(alpha)];
        svg.append(s("circle", { cx: tip[0], cy: tip[1], r: 4.5, fill: C.v3 }), txt(tip[0] + (Math.cos(alpha) >= 0 ? 8 : -8), tip[1] - 6, "α", { fill: C.v3, size: 14, weight: 700, anchor: Math.cos(alpha) >= 0 ? "start" : "end" }));
        svg.append(txt(10, 18, L("signal on the circle", "圆上的信号"), { fill: C.fg2, size: 12.5 }), txt(10, 34, L("dashed: before the rotation", "虚线：旋转之前"), { fill: C.muted, size: 12, weight: 500 }));
        // one column per frequency: amplitude bar (does not change) and phase dial (turns by mα)
        const ms = measure(alpha), amax = Math.max(1e-6, ...amps.map(Math.abs));
        svg.append(txt(10, 258, L("amplitude $|c_m|$ (stays) and phase (turns by $m\\alpha$)", "幅值 $|c_m|$（不变）和相位（转过 $m\\alpha$）"), { fill: C.fg2, size: 12 }));
        for (let m = 0; m < 5; m++) {
          const x = 10 + m * colW, mid = x + colW / 2, amp = Math.hypot(ms.a[m], ms.b[m]);
          if (m === msel) svg.append(s("rect", { x: x + 2, y: 266, width: colW - 4, height: 150, rx: 8, fill: C.v1, "fill-opacity": 0.08, stroke: C.v1, "stroke-width": 1.4 }));
          const bh = (amp / amax) * barMax;
          svg.append(s("rect", { x: mid - 13, y: barBase - bh, width: 26, height: Math.max(bh, 0.8), rx: 3, fill: m === msel ? C.v1 : C.v6 }));
          svg.append(txt(mid, barBase - bh - 5, n(amp), { fill: C.fg2, size: 12, anchor: "middle" }));
          svg.append(s("circle", { cx: mid, cy: dialY, r: dialR, fill: C.surface, stroke: C.border2, "stroke-width": 1.5 }));
          if (amp > 1e-6) { const ph = Math.atan2(ms.b[m], ms.a[m]); svg.append(arrow(mid, dialY, mid + (dialR - 3) * Math.cos(ph), dialY - (dialR - 3) * Math.sin(ph), m === msel ? C.v1 : C.fg2, 2.6, 6)); }
          else svg.append(s("circle", { cx: mid, cy: dialY, r: 2.5, fill: C.faint }));
          svg.append(txt(mid, dialY + dialR + 13, "m = " + m, { fill: m === msel ? C.v1 : C.fg2, size: 12.5, weight: 700, anchor: "middle" }));
          const hit = s("rect", { x, y: 266, width: colW, height: 150, fill: "transparent" });
          hit.style.cursor = "pointer";
          hit.addEventListener("pointerdown", (e) => { e.stopPropagation(); msel = m; ampSl?.set(amps[msel]); ampLbl(); draw(); });
          svg.append(hit);
        }
        const m = msel, cm = Math.cos(m * alpha), sm = Math.sin(m * alpha);
        pre.textContent = [
          `α = ${n(alpha)} rad (${n((alpha * 180) / PI, 0)}°)`, "",
          L(`Frequency m = ${m}:`, `频率 m = ${m}：`),
          L("cos and sin coefficients (a, b)", "cos、sin 系数 (a, b)"),
          L(` before: (${n(amps[m], 3)}, ${n(0, 3)})`, ` 旋转前：(${n(amps[m], 3)}, ${n(0, 3)})`),
          L(` after:  (${n(ms.a[m], 3)}, ${n(ms.b[m], 3)})`, ` 旋转后：(${n(ms.a[m], 3)}, ${n(ms.b[m], 3)})`), "",
          `R(${m}α) =`, ...matLines([[cm, -sm], [sm, cm]], 3), "",
          L("after = R(mα) · before", "旋转后 = R(mα) · 旋转前"), "",
          L("m   |c_m| before  after   phase", "m   |c_m| 旋转前  旋转后  相位"),
          ...[0, 1, 2, 3, 4].map((k) => `${k}   ${n(Math.abs(amps[k]), 3).padStart(7)}  ${n(Math.hypot(ms.a[k], ms.b[k]), 3).padStart(7)}  ${n(Math.hypot(ms.a[k], ms.b[k]) > 1e-9 ? Math.atan2(ms.b[k], ms.a[k]) : 0, 2).padStart(6)}`),
        ].join("\n");
        fitPre(pre);
        cp.innerHTML = L(
          "Rotating the signal by α leaves every amplitude alone and turns the phase of frequency m by <b>mα</b>: each frequency is its own little 2-D space that rotates by R(mα) and never mixes with the others. These are the irreducible representations of SO(2). Tap a column to pick m.",
          "把信号转 α，各频率的幅值都不变，频率 m 的相位转过 <b>mα</b>：每个频率是一个独立的二维小空间，按 R(mα) 旋转，互不混合。这些就是 SO(2) 的不可约表示。点一列可以选 m。");
      };
      hook = () => { const ms = measure(alpha), m0 = measure(0); return { mode, alpha, ampAfter: ms.a.map((a, i) => Math.hypot(a, ms.b[i])), ampBefore: m0.a.map((a, i) => Math.hypot(a, m0.b[i])), phase: ms.a.map((a, i) => Math.atan2(ms.b[i], a)) }; };
      const alphaSl = wide(slider(L("rotation α (rad)", "旋转 α（rad）"), { min: -PI, max: PI, value: clamp(alpha, -PI, PI), step: 0.01 }, (v) => { alpha = v; play.reset(); draw(); }));
      alpha = clamp(alpha, -PI, PI);
      let ampSl = null;
      const ampHost = h("span", {});
      ampHost.style.cssText = "display:flex;flex:1 1 240px;min-width:200px";
      const ampLbl = () => { ampHost.innerHTML = ""; ampSl = slider(L(`amplitude of m = ${msel}`, `m = ${msel} 的幅值`), { min: 0, max: 1.5, value: Math.abs(amps[msel]), step: 0.01 }, (v) => { amps[msel] = v; draw(); }); ampSl.style.flex = "1 1 auto"; ampHost.append(ampSl); };
      ampLbl();
      tick = (dt) => { alpha += dt * 0.9; if (alpha > PI) alpha -= TAU; alphaSl.set(alpha); draw(); };
      const play = playButton(an);
      ctrls.append(play, alphaSl, ampHost);
    }

    // ---------------------------------------------------------------- sphere
    function buildSphere() {
      view = makeView({ k: 104, cx: 200, cy: 192, yaw: 0.7, pitch: 0.4 });
      wrap.innerHTML = "";
      wrap.append(cell1, cell2);
      const NT = 18, NP = 36;
      const dirs = [];
      for (let i = 0; i <= NT; i++) { const th = (PI * i) / NT, row = []; for (let j = 0; j <= NP; j++) { const ph = (TAU * j) / NP; row.push([Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)]); } dirs.push(row); }
      const basis = dirs.map((row) => row.map((v) => shEval(v, 3)));
      const rot = () => mm(Rz(yaw), Ry(pitch));
      const power = (c) => { const p = []; for (let l = 0; l <= lmax; l++) { let a = 0; for (let m = 0; m < 2 * l + 1; m++) a += c[l * l + m] ** 2; p.push(a); } return p; };
      draw = () => {
        const C = colors(), P = view.P, N = (lmax + 1) ** 2;
        const D = wignerD(rot(), lmax), c2 = mv(D, coef);
        // ---- the function as a radial surface r = |g|, coloured by the sign of g
        svg.setAttribute("viewBox", `0 0 ${W} 340`);
        svg.innerHTML = "";
        const g = dirs.map((row, i) => row.map((_, j) => { let a = 0; const b = basis[i][j]; for (let q = 0; q < N; q++) a += c2[q] * b[q]; return a; }));
        let gmax = 1e-9;
        for (const row of g) for (const v of row) gmax = Math.max(gmax, Math.abs(v));
        const sc = 1.25 / gmax;
        const pts = dirs.map((row, i) => row.map((v, j) => P(sc3(v, Math.abs(g[i][j]) * sc))));
        const quads = [];
        for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
          const a = pts[i][j], b = pts[i + 1][j], c = pts[i + 1][j + 1], d = pts[i][j + 1];
          const gv = (g[i][j] + g[i + 1][j] + g[i + 1][j + 1] + g[i][j + 1]) / 4;
          quads.push({ a, b, c, d, z: (a[2] + b[2] + c[2] + d[2]) / 4, gv });
        }
        quads.sort((p, q) => p.z - q.z);
        frame3(svg, P, C, [0, 0, 0], eye(3), 1.45, 1.2, true, 0.55);
        let zmin = Infinity, zmax = -Infinity;
        for (const q of quads) { zmin = Math.min(zmin, q.z); zmax = Math.max(zmax, q.z); }
        const frag = document.createDocumentFragment();
        for (const q of quads) {
          const shade = 0.35 + 0.65 * ((q.z - zmin) / Math.max(1e-9, zmax - zmin));
          const col = mix(C.surface, q.gv >= 0 ? C.v1 : C.v4, 0.25 + 0.7 * shade);
          frag.append(s("path", { d: `M${q.a[0].toFixed(1)},${q.a[1].toFixed(1)}L${q.b[0].toFixed(1)},${q.b[1].toFixed(1)}L${q.c[0].toFixed(1)},${q.c[1].toFixed(1)}L${q.d[0].toFixed(1)},${q.d[1].toFixed(1)}Z`, fill: col, stroke: col, "stroke-width": 0.6, "stroke-linejoin": "round" }));
        }
        svg.append(frag);
        svg.append(txt(10, 18, L("$g(n) = \\sum c_{lm} Y_{lm}(n)$: distance from the centre = $|g|$", "$g(n) = \\sum c_{lm} Y_{lm}(n)$：到原点的距离 = $|g|$"), { fill: C.fg2, size: 12.5 }));
        svg.append(s("rect", { x: 10, y: 28, width: 12, height: 12, rx: 2, fill: C.v1 }), txt(27, 39, "g > 0", { fill: C.fg2, size: 12, weight: 500 }), s("rect", { x: 76, y: 28, width: 12, height: 12, rx: 2, fill: C.v4 }), txt(93, 39, "g < 0", { fill: C.fg2, size: 12, weight: 500 }));
        hint3(svg, C, W, 340);
        // ---- coefficients grouped by l, and the Wigner-D matrix
        const cell = N === 1 ? 44 : clamp(208 / N, 13, 44), hw = cell * N, hx = (W - hw) / 2, hy = 192, H2 = hy + hw + 34;
        svg2.setAttribute("viewBox", `0 0 ${W} ${H2}`);
        svg2.innerHTML = "";
        const pw0 = power(coef), cmax = Math.sqrt(Math.max(...pw0, 1e-9));
        const bw = Math.min(26, (W - 30 - lmax * 14) / N), bx0 = (W - (bw * N + lmax * 14)) / 2, by = 86, bh = 52;
        svg2.append(txt(10, 16, L("coefficients $c_{lm}$: outline before, filled after the rotation", "系数 $c_{lm}$：空心是旋转前，实心是旋转后"), { fill: C.fg2, size: 12 }));
        const LC = [C.v6, C.v1, C.v5, C.v3];
        for (let l = 0; l <= lmax; l++) {
          const gx = bx0 + l * l * bw + l * 14, gw = (2 * l + 1) * bw;
          svg2.append(ln(gx, by, gx + gw, by, C.fg2, 1.2));
          for (let m = 0; m < 2 * l + 1; m++) {
            const i = l * l + m, x = gx + m * bw + 2, v0 = (coef[i] / cmax) * bh, v1 = (c2[i] / cmax) * bh;
            svg2.append(s("rect", { x, y: Math.min(by, by - v1), width: bw - 4, height: Math.max(Math.abs(v1), 0.6), fill: LC[l], "fill-opacity": 0.85 }));
            svg2.append(s("rect", { x, y: Math.min(by, by - v0), width: bw - 4, height: Math.max(Math.abs(v0), 0.6), fill: "none", stroke: C.fg, "stroke-width": 1.1, "stroke-dasharray": "3 2" }));
          }
          svg2.append(txt(gx + gw / 2, by + bh + 16, "l = " + l, { fill: LC[l], size: 12.5, weight: 700, anchor: "middle" }));
        }
        svg2.append(txt(10, hy - 10, L("Wigner-D matrix D(R): c′ = D c", "Wigner-D 矩阵 D(R)：c′ = D c"), { fill: C.fg2, size: 12 }));
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          svg2.append(s("rect", { x: hx + j * cell, y: hy + i * cell, width: cell, height: cell, fill: heatColor(D[i][j], C), stroke: C.border, "stroke-width": 0.5 }));
          if (cell >= 40) svg2.append(txt(hx + (j + 0.5) * cell, hy + (i + 0.5) * cell + 4, n(D[i][j]), { fill: C.fg, size: 11.5, weight: 500, anchor: "middle" }));
        }
        for (let l = 0; l <= lmax; l++) {
          const o = l * l * cell, sz = (2 * l + 1) * cell;
          svg2.append(s("rect", { x: hx + o, y: hy + o, width: sz, height: sz, fill: "none", stroke: LC[l], "stroke-width": 2.4 }));
          if (hx - 6 > 30) svg2.append(txt(hx - 6, hy + o + sz / 2 + 4, "l=" + l, { fill: LC[l], size: 12, weight: 700, anchor: "end" }));
        }
        const pw1 = power(c2);
        let off = 0, orth = 0;
        const DDt = mm(D, tr(D));
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { orth += (DDt[i][j] - (i === j ? 1 : 0)) ** 2; const li = Math.floor(Math.sqrt(i)), lj = Math.floor(Math.sqrt(j)); if (li !== lj) off = Math.max(off, Math.abs(D[i][j])); }
        svg2.append(txt(W / 2, hy + hw + 22, L(`blocks 1, 3, 5, 7 · largest entry outside the blocks: ${sci(off)}`, `块的大小 1、3、5、7 · 块外最大元素：${sci(off)}`), { fill: C.muted, size: 12, weight: 500, anchor: "middle" }));
        const pwTxt = pw0.map((p, l) => `l=${l}: ${n(p, 3)} → ${n(pw1[l], 3)}`).join(" · ");
        cp.innerHTML = L(
          `Rotate the function (yaw, pitch): its coefficients change by the matrix D(R), which is <b>block-diagonal</b> — degree l only mixes with degree l, in a block of size 2l + 1. So the power per degree does not change: ${pwTxt}. ‖D Dᵀ − I‖ = ${sci(Math.sqrt(orth))}.`,
          `转动这个函数（yaw、pitch）：系数按矩阵 D(R) 变化，而 D 是<b>分块对角</b>的——l 次的分量只和 l 次的混合，块的大小是 2l + 1。所以每个次数的能量不变：${pwTxt}。‖D Dᵀ − I‖ = ${sci(Math.sqrt(orth))}。`);
        lastD = { D, off, orth: Math.sqrt(orth), pw0, pw1 };
      };
      let lastD = null;
      hook = () => {
        draw();
        // independent check: the rotated function evaluated directly, against Σ c′ Y
        const R = rot(), Rt = tr(R), N = (lmax + 1) ** 2, c2 = mv(lastD.D, coef);
        let err = 0;
        for (const v of [[0.3, -0.5, 0.81], [-0.7, 0.1, 0.7], [0.2, 0.9, -0.38]]) { const u = sc3(v, 1 / norm3(v)); const a = shEval(mv(Rt, u), lmax).reduce((s0, y, i) => s0 + coef[i] * y, 0), b = shEval(u, lmax).reduce((s0, y, i) => s0 + c2[i] * y, 0); err = Math.max(err, Math.abs(a - b)); }
        return { mode, lmax, yaw, pitch, N, off: lastD.off, orth: lastD.orth, pw0: lastD.pw0, pw1: lastD.pw1, fnErr: err };
      };
      const presets = [["mix", L("mix", "混合")]];
      for (let l = 1; l <= lmax; l++) presets.push(["l" + l, "Y" + "₀₁₂₃"[l] + "⁰"]);
      const yawSl = wide(slider(L("yaw (about z)", "yaw（绕 z）"), { min: -PI, max: PI, value: yaw, step: 0.01 }, (v) => { yaw = v; play.reset(); draw(); }));
      tick = (dt) => { yaw += dt * 0.7; if (yaw > PI) yaw -= TAU; yawSl.set(yaw); draw(); };
      const play = playButton(an);
      ctrls.append(play);
      if (presets.length > 1) ctrls.append(seg(presets, preset, (p) => { preset = p; if (p === "mix") coef = mixCoeffs(); else { const l = +p.slice(1); coef = new Array((lmax + 1) ** 2).fill(0); coef[l * l + l] = 1; } draw(); }));
      ctrls.append(yawSl, wide(slider(L("pitch (about y)", "pitch（绕 y）"), { min: -PI, max: PI, value: pitch, step: 0.01 }, (v) => { pitch = v; draw(); })));
    }

    // ---------------------------------------------------------------- tensor
    function buildTensor() {
      view = makeView({ k: 96, cx: 200, cy: 180, yaw: 0.7, pitch: 0.42 });
      wrap.innerHTML = "";
      wrap.append(cell1, cell2);
      const rot = () => mm(Rz(yaw), Ry(pitch));
      const outer = (a, b) => a.map((x) => b.map((y) => x * y));
      const parts = (a, b) => {
        const M = outer(a, b), tr3 = M[0][0] + M[1][1] + M[2][2];
        const P0 = msc(eye(3), tr3 / 3), P1 = msc(madd(M, tr(M), -1), 0.5), S = madd(msc(madd(M, tr(M)), 0.5), P0, -1);
        const five = [Math.SQRT2 * S[0][1], Math.SQRT2 * S[1][2], (2 * S[2][2] - S[0][0] - S[1][1]) / Math.sqrt(6), Math.SQRT2 * S[0][2], (S[0][0] - S[1][1]) / Math.SQRT2];
        return { M, P0, P1, S, dot: tr3, cross: cross3(a, b), five };
      };
      draw = () => {
        const C = colors(), P = view.P, R = rot();
        const [a0, b0] = TP[tp], a = mv(R, a0), b = mv(R, b0);
        const A0 = parts(a0, b0), A = parts(a, b);
        const H1 = 340;
        svg.setAttribute("viewBox", `0 0 ${W} ${H1}`);
        svg.innerHTML = "";
        // zoom so that the longest of a, b, a×b (lengths do not change under rotation) stays inside
        // a disc of 140 px around the origin, whatever the rotation and the orbit
        // a long cross product is drawn at a round fraction of its length (and says so), so that it
        // does not shrink a and b to stubs
        const rab = Math.max(norm3(a0), norm3(b0)), cn = norm3(A0.cross);
        const cs = [1, 0.5, 0.25, 0.2, 0.1, 0.05, 0.02, 0.01].find((f) => cn * f <= Math.max(1.5, 1.4 * rab)) ?? 0.01;
        const rmax = Math.max(1.5, rab, cn * cs);
        view.st.k = Math.min(96, 140 / rmax);
        const u = rmax / 1.5; // world units per default unit: the grid and the axes grow with the data
        ground3(svg, P, C, 1.5 * u, 0.5 * u);
        frame3(svg, P, C, [0, 0, 0], eye(3), 1.5 * u, 1.2, false, 0.5);
        // labels: tried at four spots around the tip, the first that overlaps nothing placed so far
        const boxes = [];
        const place = (q, str, col, size = 13.5) => {
          const w = textWidth(str, size, 700), hgt = size;
          for (const [dx, dy] of [[5, -5], [5, size + 4], [-w - 5, -5], [-w - 5, size + 4], [-w / 2, -10], [-w / 2, size + 10]]) {
            const x = clamp(q[0] + dx, 4, W - w - 4), y = clamp(q[1] + dy, size + 2, H1 - 22);
            const bx = [x - 2, y - hgt, x + w + 2, y + 3];
            if (boxes.some((o) => bx[0] < o[2] && o[0] < bx[2] && bx[1] < o[3] && o[1] < bx[3])) continue;
            boxes.push(bx); svg.append(txt(x, y, str, { fill: col, size, weight: 700, attrs: { stroke: C.surface, "stroke-width": 3, "paint-order": "stroke", "stroke-linejoin": "round" } })); return;
          }
          const x = clamp(q[0] + 5, 4, W - w - 4), y = clamp(q[1] - 5, size + 2, H1 - 22);
          svg.append(txt(x, y, str, { fill: col, size, weight: 700 }));
        };
        boxes.push([0, 0, 200, 24]); // the "dashed: before" note
        arrow3(svg, P, [0, 0, 0], a0, C.v1, 1.6, 6, { opacity: 0.4, "stroke-dasharray": "4 3" });
        arrow3(svg, P, [0, 0, 0], b0, C.v2, 1.6, 6, { opacity: 0.4, "stroke-dasharray": "4 3" });
        arrow3(svg, P, [0, 0, 0], sc3(A0.cross, cs), C.v5, 1.6, 6, { opacity: 0.4, "stroke-dasharray": "4 3" });
        arrow3(svg, P, [0, 0, 0], a, C.v1, 3.2); arrow3(svg, P, [0, 0, 0], b, C.v2, 3.2); arrow3(svg, P, [0, 0, 0], sc3(A.cross, cs), C.v5, 3.2);
        place(P(a), "Ra", C.v1); place(P(b), "Rb", C.v2);
        if (norm3(A.cross) > 0.05) place(P(sc3(A.cross, cs)), "(Ra)×(Rb)" + (cs < 1 ? L(` drawn ×${cs}`, ` 画成 ×${cs}`) : ""), C.v5);
        ["x", "y", "z"].forEach((nm, i) => { const e = [0, 0, 0]; e[i] = 1.5 * u; place(P(e), nm, [C.v4, C.v2, C.v1][i], 12.5); });
        svg.append(txt(10, 18, L("dashed: before the rotation", "虚线：旋转之前"), { fill: C.muted, size: 12, weight: 500 }));
        if (u > 1.001) svg.append(txt(10, H1 - 8, L(`grid: ${n(0.5 * u, 2)} per square`, `网格：每格 ${n(0.5 * u, 2)}`), { fill: C.faint, size: 11.5, weight: 500 }));
        hint3(svg, C, W, H1);
        // ---- the nine products, split into l = 0, 1, 2
        svg2.setAttribute("viewBox", `0 0 ${W} 536`);
        svg2.innerHTML = "";
        const cell = 40, xs = [40, 240, 40, 240], ys = [30, 30, 184, 184];
        const mats = [A.M, A.P0, A.P1, A.S], titles = ["(Ra)(Rb)ᵀ", "l = 0", "l = 1", "l = 2"], tc = [C.fg, C.v6, C.v5, C.v3];
        const vmax = Math.max(1e-9, ...A.M.flat().map(Math.abs));
        mats.forEach((Mx, q) => {
          const y0 = ys[q];
          svg2.append(txt(xs[q] + 1.5 * cell, y0 - 9, titles[q], { fill: tc[q], size: 13, weight: 700, anchor: "middle" }));
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
            svg2.append(s("rect", { x: xs[q] + j * cell, y: y0 + i * cell, width: cell, height: cell, fill: heatColor(Mx[i][j] / vmax, C), stroke: C.border2, "stroke-width": 0.8 }));
            svg2.append(txt(xs[q] + (j + 0.5) * cell, y0 + (i + 0.5) * cell + 4.5, n(Mx[i][j]), { fill: C.fg, size: 12.5, weight: 500, anchor: "middle" }));
          }
          if (q) svg2.append(txt(xs[q] - 20, y0 + 1.5 * cell + 6, q === 1 ? "=" : "+", { fill: C.fg2, size: 18, weight: 700, anchor: "middle" }));
        });
        // a line longer than the picture is squeezed to fit (large inputs give long numbers)
        const fitT = (x, y, str, o) => { const t = txt(x, y, str, o); if (textWidth(str, o.size, o.weight) > W - 2 * x) { t.setAttribute("textLength", W - 2 * x); t.setAttribute("lengthAdjust", "spacingAndGlyphs"); } return t; };
        const row = (y, col, head, before, after) => { svg2.append(fitT(6, y, head, { fill: col, size: 12.5, weight: 700 })); svg2.append(fitT(6, y + 17, L("before ", "旋转前 ") + before, { fill: C.fg2, size: 12, weight: 500 })); svg2.append(fitT(6, y + 34, L("after  ", "旋转后 ") + after, { fill: C.fg, size: 12, weight: 600 })); };
        const dCross = norm3(sub3(mv(R, A0.cross), A.cross));
        row(340, C.v6, L("l = 0 · the dot product a·b (1 number, invariant)", "l = 0 · 点积 a·b（1 个数，不变）"), n(A0.dot, 3), n(A.dot, 3));
        row(400, C.v5, L("l = 1 · the cross product a×b (3 numbers, rotates with R)", "l = 1 · 叉积 a×b（3 个数，随 R 转）"), vecStr(A0.cross), vecStr(A.cross) + L(`  ‖R(a×b) − (Ra)×(Rb)‖ = ${n(dCross, 3)}`, `  ‖R(a×b) − (Ra)×(Rb)‖ = ${n(dCross, 3)}`));
        row(460, C.v3, L("l = 2 · symmetric traceless part (5 numbers, mix by D²(R))", "l = 2 · 对称无迹部分（5 个数，按 D²(R) 混合）"), vecStr(A0.five) + "  ‖·‖ = " + n(Math.hypot(...A0.five), 3), vecStr(A.five) + "  ‖·‖ = " + n(Math.hypot(...A.five), 3));
        svg2.append(txt(6, 526, "3 × 3 = 9 = 1 + 3 + 5", { fill: C.muted, size: 12.5, weight: 600 }));
        cp.innerHTML = L(
          "The nine products aᵢbⱼ of two vectors split into three pieces that never mix under rotation: the trace (a scalar, l = 0), the antisymmetric part (the cross product, a vector, l = 1) and the symmetric traceless part (five numbers, l = 2). This is 1 ⊗ 1 = 0 ⊕ 1 ⊕ 2. Rotate both inputs and watch: the scalar stays, the vector rotates with R, the five numbers change but keep their length.",
          "两个向量的九个乘积 aᵢbⱼ 可以拆成三块，旋转时互不混合：迹（标量，l = 0）、反对称部分（就是叉积，向量，l = 1）、对称无迹部分（五个数，l = 2）。这就是 1 ⊗ 1 = 0 ⊕ 1 ⊕ 2。转动两个输入看一看：标量不变，向量跟着 R 转，五个数会变但长度不变。");
        last = { A0, A, R, dCross };
      };
      let last = null;
      hook = () => {
        draw();
        const D2 = wignerD(last.R, 2).slice(4, 9).map((r) => r.slice(4, 9));
        const pred = mv(D2, last.A0.five);
        const rec = madd(madd(last.A.P0, last.A.P1), last.A.S);
        return { mode, tp, dotBefore: last.A0.dot, dotAfter: last.A.dot, crossErr: last.dCross, fiveNormBefore: Math.hypot(...last.A0.five), fiveNormAfter: Math.hypot(...last.A.five), fiveVsD2: Math.hypot(...pred.map((v, i) => v - last.A.five[i])), D2orth: fro(madd(mm(D2, tr(D2)), eye(5), -1)), recon: fro(madd(rec, last.A.M, -1)) };
      };
      const yawSl = wide(slider(L("yaw (about z)", "yaw（绕 z）"), { min: -PI, max: PI, value: yaw, step: 0.01 }, (v) => { yaw = v; play.reset(); draw(); }));
      tick = (dt) => { yaw += dt * 0.7; if (yaw > PI) yaw -= TAU; yawSl.set(yaw); draw(); };
      const play = playButton(an);
      ctrls.append(play, seg([["generic", L("generic", "一般情形")], ["parallel", L("a ∥ b", "a ∥ b")], ["perp", L("a ⊥ b", "a ⊥ b")]], tp, (p) => { tp = p; draw(); }));
      ctrls.append(yawSl, wide(slider(L("pitch (about y)", "pitch（绕 y）"), { min: -PI, max: PI, value: pitch, step: 0.01 }, (v) => { pitch = v; draw(); })));
    }

    const BUILD = { circle: buildCircle, sphere: buildSphere, tensor: buildTensor };
    function build() {
      an.stop();
      tick = null;
      ctrls.innerHTML = "";
      ctrls.append(seg(MODES, mode, (m) => { mode = m; build(); }));
      BUILD[mode]();
      draw();
    }
    root.__vizTest = () => hook();
    build();
  });
})();
