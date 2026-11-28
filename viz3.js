"use strict";
// Teaching widgets, part 3: robotics (so3, arm3d, robotstack, pid) and ML basics
// (nn, conv2d, bayes, bpe). Registered into viz.js; fields documented in CONTENT_SPEC.md.
(() => {
  if (!window.Viz) return;
  const { h, s, cssv, pal, mix, clamp, fmt, rng, randn, T, animator, shell, slider, btn, seg, playButton, fitPre, axes, legend, arrowPath, mathNodes } = Viz.util;
  const zh = () => (document.documentElement.lang || "").startsWith("zh");
  const L = (en, cn) => (zh() ? cn : en);
  const cap = (foot) => { const c = h("div", { class: "viz-caption" }); foot.append(c); return c; };
  // Caption lines with "$…$" typeset by KaTeX; a node is appended as is.
  const capSet = (el, ...lines) => el.replaceChildren(...lines.filter((l) => l != null && l !== "").flatMap((l, i) => [...(i ? [h("br")] : []), ...(typeof l === "string" ? mathNodes(l) : [l])]));
  const hint = (str) => h("span", { style: "color:var(--muted)" }, str);
  const deg = (r) => ((r * 180) / Math.PI).toFixed(0) + "°";
  // three decimals, Unicode minus, no "−0.000"
  const n3 = (v) => { const r = (+v).toFixed(3); return (/^-0\.0*$/.test(r) ? r.slice(1) : r).replace(/^-/, "−"); };

  // ------------------------------------------------------------------ 3-D math
  const M3 = {
    mul: (A, B) => A.map((r, i) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j])),
    vec: (A, v) => [0, 1, 2].map((i) => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2]),
    Rx: (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]],
    Ry: (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]],
    Rz: (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]],
    I: () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  };
  // 4×4 homogeneous transforms
  const H4 = {
    mul: (A, B) => A.map((r) => [0, 1, 2, 3].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j] + r[3] * B[3][j])),
    I: () => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
    rotz: (t) => [[Math.cos(t), -Math.sin(t), 0, 0], [Math.sin(t), Math.cos(t), 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
    rotx: (a) => [[1, 0, 0, 0], [0, Math.cos(a), -Math.sin(a), 0], [0, Math.sin(a), Math.cos(a), 0], [0, 0, 0, 1]],
    tz: (d) => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, d], [0, 0, 0, 1]],
    tx: (a) => [[1, 0, 0, a], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
  };
  const quatFromR = (R) => {
    const tr = R[0][0] + R[1][1] + R[2][2];
    let w, x, y, z;
    if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; w = S / 4; x = (R[2][1] - R[1][2]) / S; y = (R[0][2] - R[2][0]) / S; z = (R[1][0] - R[0][1]) / S; }
    else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) { const S = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2; w = (R[2][1] - R[1][2]) / S; x = S / 4; y = (R[0][1] + R[1][0]) / S; z = (R[0][2] + R[2][0]) / S; }
    else if (R[1][1] > R[2][2]) { const S = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2; w = (R[0][2] - R[2][0]) / S; x = (R[0][1] + R[1][0]) / S; y = S / 4; z = (R[1][2] + R[2][1]) / S; }
    else { const S = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2; w = (R[1][0] - R[0][1]) / S; x = (R[0][2] + R[2][0]) / S; y = (R[1][2] + R[2][1]) / S; z = S / 4; }
    return [w, x, y, z];
  };
  const Rfromq = ([w, x, y, z]) => [[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)], [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)], [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]];
  function slerp(q0, q1, t) {
    let d = q0.reduce((a, v, i) => a + v * q1[i], 0);
    let b = q1;
    if (d < 0) { d = -d; b = q1.map((v) => -v); }
    if (d > 0.9995) { const r = q0.map((v, i) => v + t * (b[i] - v)); const n = Math.hypot(...r); return r.map((v) => v / n); }
    const om = Math.acos(d), so = Math.sin(om);
    return q0.map((v, i) => (Math.sin((1 - t) * om) / so) * v + (Math.sin(t * om) / so) * b[i]);
  }
  // Orbitable orthographic 3-D view drawn into an SVG.
  function view3d(svg, size, k, onChange) {
    // Right-handed camera looking down from above: x1 to the right, y1 away from the viewer, z up.
    const st = { yaw: 0.65, pitch: 0.42, k, cx: size / 2, cy: size * 0.6 };
    const P = (p) => {
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
      const x1 = cy * p[0] + sy * p[1], y1 = -sy * p[0] + cy * p[1], z1 = p[2];
      const z2 = z1 * cp + y1 * sp, depth = z1 * sp - y1 * cp; // depth: larger is nearer
      return [st.cx + st.k * x1, st.cy - st.k * z2, depth];
    };
    let drag = null;
    svg.style.touchAction = "none";
    svg.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY]; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener("pointermove", (e) => { if (!drag) return; st.yaw -= (e.clientX - drag[0]) * 0.01; st.pitch = clamp(st.pitch + (e.clientY - drag[1]) * 0.01, -1.4, 1.4); drag = [e.clientX, e.clientY]; onChange(); });
    svg.addEventListener("pointerup", () => (drag = null));
    return { st, P };
  }
  const line3 = (svg, P, a, b, cls, extra = {}) => { const A = P(a), B = P(b); svg.append(s("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1], class: cls, ...extra })); };
  const arrow3 = (svg, P, a, b, color, w = 3) => { const A = P(a), B = P(b); svg.append(s("path", { d: arrowPath(A[0], A[1], B[0], B[1], 7), stroke: color, "stroke-width": w, fill: "none", "stroke-linecap": "round" })); };
  function frame3(svg, P, o, R, len, w = 3, labels = false) {
    const cols = ["#d93025", "#1f8354", "#0056d2"];
    for (let i = 0; i < 3; i++) {
      const e = [R[0][i] * len + o[0], R[1][i] * len + o[1], R[2][i] * len + o[2]];
      arrow3(svg, P, o, e, cols[i], w);
      if (labels) { const E = P(e); svg.append(s("text", { x: E[0] + 4, y: E[1] - 4, class: "label", fill: cols[i] }, "xyz"[i])); }
    }
  }
  function groundGrid(svg, P, n, step) {
    for (let i = -n; i <= n; i++) { line3(svg, P, [i * step, -n * step, 0], [i * step, n * step, 0], "grid3"); line3(svg, P, [-n * step, i * step, 0], [n * step, i * step, 0], "grid3"); }
  }
  const matText = (R) => R.map((r) => "[" + r.map((v) => (v >= 0 ? " " : "") + v.toFixed(2)).join(" ") + " ]").join("\n");

  // ================================================================== so3
  Viz.register("so3", (root, cfg) => {
    const { stage: st, ctrls, foot } = shell(root, cfg);
    let mode = cfg.mode || "euler";
    let e = { r: 0.4, p: 0.3, y: 0.6 }, aa = { az: 0.6, el: 0.7, ang: 1.2 }, tgt = { r: 2.2, p: -0.5, y: 2.6 }, t = 0.5;
    // Start fields: angles [φ, θ, ψ] (rad, ZYX) = the Euler angles, and the slerp target in
    // quaternion mode; axis [x, y, z] + angle (rad) for axis–angle; t (0–1) for slerp.
    const okA = Array.isArray(cfg.angles) && cfg.angles.length === 3 && cfg.angles.every((v) => typeof v === "number" && isFinite(v));
    if (okA) { const [r0, p0, y0] = cfg.angles; e = { r: r0, p: clamp(p0, -Math.PI / 2, Math.PI / 2), y: y0 }; tgt = { r: r0, p: clamp(p0, -Math.PI / 2, Math.PI / 2), y: y0 }; }
    if (Array.isArray(cfg.axis) && cfg.axis.length === 3 && cfg.axis.every((v) => typeof v === "number") && Math.hypot(...cfg.axis) > 1e-9) {
      const [ax, ay, az] = cfg.axis.map((v) => v / Math.hypot(...cfg.axis));
      aa = { az: Math.atan2(ay, ax), el: clamp(Math.asin(clamp(az, -1, 1)), -1.5, 1.5), ang: aa.ang };
    }
    if (typeof cfg.angle === "number" && isFinite(cfg.angle)) aa.ang = clamp(cfg.angle, 0, 2 * Math.PI);
    if (typeof cfg.t === "number" && isFinite(cfg.t)) t = clamp(cfg.t, 0, 1);
    // q and −q are the same rotation: every quaternion is shown with w ≥ 0
    const canon = (q) => (q[0] < 0 || (q[0] === 0 && q.slice(1).find((v) => v !== 0) < 0) ? q.map((v) => -v) : q);
    const S = 420;
    // shaded 3-D through Viz.g3 when WebGL is there; the SVG drawing otherwise
    const G3 = !!(Viz.g3 && Viz.g3.ok);
    const svg = G3 ? null : s("svg", { viewBox: `0 0 ${S} ${S}`, class: "viz-svg viz-square" });
    const pre = h("pre", { class: "so3-mat" });
    const wrap = h("div", { class: "tf-wrap" });
    const box3 = G3 ? h("div", { class: "tf-g3" }) : null;
    wrap.append(G3 ? box3 : svg, pre);
    st.append(wrap);
    const c = cap(foot);
    const V = G3 ? null : view3d(svg, S, 120, () => draw());
    let cur = null; // what the 3-D view draws: { R, ghost, axis }
    const view = G3 ? Viz.g3.view(box3, { height: 360, target: [0, 0, 0], dist: 3.8, yaw: 0.55, pitch: 0.42, ground: false, shadows: false, views: false, draw: draw3 }) : null;
    // the same body as the SVG version (1.8 × 1.0 × 0.36 units), at 0.5 m per unit
    function draw3(g) {
      if (!cur) return;
      const P = g.P, k = 0.5;
      for (let i = -4; i <= 4; i++) { g.line([i * 0.2, -0.8, 0], [i * 0.2, 0.8, 0], P.grid, { w: 1, ground: true }); g.line([-0.8, i * 0.2, 0], [0.8, i * 0.2, 0], P.grid, { w: 1, ground: true }); }
      g.frame([0, 0, 0], M3.I(), 1.6 * k, { w: 1.5, names: ["$x$", "$y$", "$z$"], alpha: 0.8 });
      if (cur.axis) g.line(cur.axis.map((v) => -1.8 * k * v), cur.axis.map((v) => 1.8 * k * v), "--v5", { w: 2.5, dash: 0.07 });
      const bodyG = (R, ghost) => {
        g.box([0, 0, 0], R, [1.8 * k, 1.0 * k, 0.36 * k], ghost ? P.ghost : P.body, ghost ? { alpha: 0.22 } : {});
        g.cyl(M3.vec(R, [0.9 * k, 0, 0]), M3.vec(R, [1.25 * k, 0, 0]), ghost ? 0.012 : 0.02, "--v3", ghost ? { alpha: 0.35 } : {});
      };
      if (cur.ghost) bodyG(cur.ghost, true);
      bodyG(cur.R, false);
      g.frame([0, 0, 0], cur.R, 1.25 * k, { w: 4, onTop: true });
    }
    const euler = (o) => M3.mul(M3.Rz(o.y), M3.mul(M3.Ry(o.p), M3.Rx(o.r))); // ZYX: R = Rz(ψ)·Ry(θ)·Rx(φ)
    function rodrigues(u, w) { const K = [[0, -u[2], u[1]], [u[2], 0, -u[0]], [-u[1], u[0], 0]]; const K2 = M3.mul(K, K); return [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? 1 : 0) + Math.sin(w) * K[i][j] + (1 - Math.cos(w)) * K2[i][j])); }
    function bodySvg(R, ghost) {
      const hx = 0.9, hy = 0.5, hz = 0.18;
      const corners = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push(M3.vec(R, [sx * hx, sy * hy, sz * hz]));
      const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
      for (const [a, b] of edges) line3(svg, V.P, corners[a], corners[b], "", { stroke: ghost ? cssv("--faint") : cssv("--fg-2"), "stroke-width": ghost ? 1.2 : 1.8, "stroke-dasharray": ghost ? "4 4" : null });
      const nose = M3.vec(R, [hx + 0.35, 0, 0]);
      line3(svg, V.P, M3.vec(R, [hx, 0, 0]), nose, "", { stroke: cssv("--v3"), "stroke-width": ghost ? 1.5 : 3 });
    }
    function draw() {
      if (G3) { cur = { R: null, ghost: null, axis: null }; }
      else { svg.innerHTML = ""; groundGrid(svg, V.P, 4, 0.4); frame3(svg, V.P, [0, 0, 0], M3.I(), 1.6, 1.2, true); }
      const body = (R, ghost) => { if (G3) { if (ghost) cur.ghost = R; else cur.R = R; } else bodySvg(R, ghost); };
      let R, extra = "";
      if (mode === "euler") {
        R = euler(e);
        const lock = Math.abs(Math.cos(e.p)) < 0.06;
        extra = `$\\phi$ (roll, x) = ${deg(e.r)}, $\\theta$ (pitch, y) = ${deg(e.p)}, $\\psi$ (yaw, z) = ${deg(e.y)} · $R = R_z(\\psi)\\,R_y(\\theta)\\,R_x(\\phi)$` + (lock ? L(" · ⚠ gimbal lock: at $\\theta = \\pm 90°$ roll and yaw turn about the same axis — one degree of freedom is lost", " · ⚠ 万向节锁：$\\theta = \\pm 90°$ 时 roll 与 yaw 绕同一根轴转动，丢失一个自由度") : "");
      } else if (mode === "axis-angle") {
        const u = [Math.cos(aa.el) * Math.cos(aa.az), Math.cos(aa.el) * Math.sin(aa.az), Math.sin(aa.el)];
        R = rodrigues(u, aa.ang);
        if (G3) cur.axis = u; else line3(svg, V.P, u.map((v) => -1.8 * v), u.map((v) => 1.8 * v), "", { stroke: cssv("--v5"), "stroke-width": 2.5, "stroke-dasharray": "7 5" });
        // the angle is θ and the unit axis û, as in content/sym/_notation (ω is the angular velocity);
        // the config fields stay `axis` and `angle`
        extra = [L(`axis $\\hat u$ = (${u.map((v) => v.toFixed(2)).join(", ")}), angle $\\theta$ = ${deg(aa.ang)}`, `转轴 $\\hat u$ = (${u.map((v) => v.toFixed(2)).join(", ")})，转角 $\\theta$ = ${deg(aa.ang)}`), L("Rodrigues: $R = I + \\sin\\theta\\,[\\hat u]_\\times + (1 - \\cos\\theta)\\,[\\hat u]_\\times^2$", "罗德里格斯公式：$R = I + \\sin\\theta\\,[\\hat u]_\\times + (1 - \\cos\\theta)\\,[\\hat u]_\\times^2$")];
      } else {
        const q0 = [1, 0, 0, 0], q1 = quatFromR(euler(tgt));
        const q = slerp(q0, q1, t);
        R = Rfromq(q);
        const lin = euler({ r: tgt.r * t, p: tgt.p * t, y: tgt.y * t });
        body(lin, true);
        const ang = 2 * Math.acos(Math.min(1, Math.abs(q1[0])));
        extra = [`$q(t) = \\mathrm{slerp}(q_0, q_1, t)$ = (${canon(q).map(n3).join(", ")}), $t$ = ${t.toFixed(2)}`, `${L("from the identity $q_0$ to the target $q_1$ (target roll / pitch / yaw, ZYX)", "从单位四元数 $q_0$ 转到目标 $q_1$（目标 roll / pitch / yaw，ZYX）")} = (${canon(q1).map(n3).join(", ")}) · ${L("total rotation", "总转角")} ${deg(ang)}`, L("dashed: naive linear interpolation of Euler angles (not the shortest path, uneven speed)", "虚线：对欧拉角直接线性插值（不是最短路径，角速度不均匀）")];
      }
      body(R, false);
      if (G3) view.redraw(); else frame3(svg, V.P, [0, 0, 0], R, 1.25, 3.5, false);
      pre.textContent = `R =\n${matText(R)}\n\ndet R = ${(R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0])).toFixed(3)}\nRᵀR = I\nq = (w, x, y, z), w ≥ 0\n  = (${canon(quatFromR(R)).map((v) => n3(v)).join(", ")})`;
      fitPre(pre);
      capSet(c, ...(Array.isArray(extra) ? extra : [extra]), hint(L("q and −q are the same rotation; shown with w ≥ 0. Drag the view to orbit." + (G3 ? " Thin axes: the world frame; thick: the body frame." : ""), "q 与 −q 表示同一个旋转；这里取 w ≥ 0。拖动画面可旋转视角。" + (G3 ? "细轴：世界坐标系；粗轴：物体坐标系。" : ""))));
    }
    const box = h("span", { class: "tf-toggles" });
    function controls() {
      box.innerHTML = "";
      const sl = (lab, o, k, lo, hi) => slider(lab, { min: lo, max: hi, value: o[k], step: 0.01 }, (v) => { o[k] = v; draw(); });
      if (mode === "euler") box.append(sl("φ roll", e, "r", -Math.PI, Math.PI), sl("θ pitch", e, "p", -Math.PI / 2, Math.PI / 2), sl("ψ yaw", e, "y", -Math.PI, Math.PI), btn(L("pitch → 90°", "pitch → 90°"), () => { e.p = Math.PI / 2; controls(); draw(); }));
      else if (mode === "axis-angle") box.append(sl(L("axis azimuth", "轴方位角"), aa, "az", -Math.PI, Math.PI), sl(L("axis elevation", "轴仰角"), aa, "el", -1.5, 1.5), sl(L("angle $\\theta$", "转角 $\\theta$"), aa, "ang", 0, 2 * Math.PI));
      else {
        const ts = slider("t", { min: 0, max: 1, value: t, step: 0.01 }, (v) => { t = v; draw(); });
        const an = animator(root, (dt) => { t += dt * 0.35; if (t >= 1) { t = 1; ts.set(t); draw(); return false; } ts.set(t); draw(); });
        box.append(ts, playButton(an, () => { if (t >= 1) t = 0; }), sl(L("target roll", "目标 roll"), tgt, "r", -Math.PI, Math.PI), sl(L("target pitch", "目标 pitch"), tgt, "p", -Math.PI / 2, Math.PI / 2), sl(L("target yaw", "目标 yaw"), tgt, "y", -Math.PI, Math.PI));
      }
    }
    ctrls.append(seg([["euler", L("Euler ZYX", "欧拉角 ZYX")], ["axis-angle", L("axis–angle", "轴角")], ["quaternion", L("quaternion slerp", "四元数 slerp")]], mode, (m) => { mode = m; controls(); draw(); }), box);
    controls();
    draw();
  });

  // ================================================================== arm3d
  const ARMS = {
    planar3: { conv: "standard", rows: [[0.4, 0, 0, 0, "R"], [0.3, 0, 0, 0, "R"], [0.2, 0, 0, 0, "R"]], q: [0.3, 0.5, 0.4], name: "planar 3R" },
    scara: { conv: "standard", rows: [[0.4, 0, 0.4, 0, "R"], [0.3, Math.PI, 0, 0, "R"], [0, 0, 0, 0, "P"], [0, 0, 0.05, 0, "R"]], q: [0.3, 0.6, 0.1, 0], name: "SCARA (RRPR)" },
    ur5: { conv: "standard", rows: [[0, Math.PI / 2, 0.089159, 0, "R"], [-0.425, 0, 0, 0, "R"], [-0.39225, 0, 0, 0, "R"], [0, Math.PI / 2, 0.10915, 0, "R"], [0, -Math.PI / 2, 0.09465, 0, "R"], [0, 0, 0.0823, 0, "R"]], q: [0, -1.2, 1.4, -1.8, -1.57, 0], name: "UR5 (standard DH)" },
    panda: { conv: "modified", rows: [[0, 0, 0.333, 0, "R"], [0, -Math.PI / 2, 0, 0, "R"], [0, Math.PI / 2, 0.316, 0, "R"], [0.0825, Math.PI / 2, 0, 0, "R"], [-0.0825, -Math.PI / 2, 0.384, 0, "R"], [0, Math.PI / 2, 0, 0, "R"], [0.088, Math.PI / 2, 0, 0, "R"]], flange: 0.107, q: [0, -Math.PI / 4, 0, -3 * Math.PI / 4, 0, Math.PI / 2, Math.PI / 4], name: "Franka Panda (modified DH)" },
  };
  Viz.register("arm3d", (root, cfg) => {
    const { stage: st, ctrls, foot } = shell(root, cfg);
    let arm = ARMS[cfg.preset] ? JSON.parse(JSON.stringify(ARMS[cfg.preset])) : cfg.dh ? { conv: cfg.convention || "standard", rows: cfg.dh, q: cfg.q || cfg.dh.map(() => 0), name: L("custom DH", "自定义 DH") } : JSON.parse(JSON.stringify(ARMS.ur5));
    let q = (cfg.q && ARMS[cfg.preset] ? cfg.q : arm.q).slice();
    const S = 440;
    // shaded 3-D through Viz.g3 when WebGL is there; the SVG drawing otherwise
    const G3 = !!(Viz.g3 && Viz.g3.ok);
    const svg = G3 ? null : s("svg", { viewBox: `0 0 ${S} ${S}`, class: "viz-svg viz-square" });
    const panel = h("div", { class: "tf-panel" });
    const wrap = h("div", { class: "tf-wrap" });
    const box3 = G3 ? h("div", { class: "tf-g3" }) : null;
    wrap.append(G3 ? box3 : svg, panel);
    st.append(wrap);
    const c = cap(foot);
    const reach = () => arm.rows.reduce((a, r) => a + Math.abs(r[0]) + Math.abs(r[2]), 0) + (arm.flange || 0) + 0.1;
    const V = G3 ? null : view3d(svg, S, 150, () => draw());
    const view = G3 ? Viz.g3.view(box3, { height: 400, groundSize: 2.5, grid: 0.25, ...fitView(), draw: draw3 }) : null;
    // camera aimed at the middle of the arm (base included) at the current pose, far enough to see it whole
    function fitView() {
      const pos = chain().map((Tm) => [Tm[0][3], Tm[1][3], Tm[2][3]]), lo = [0, 0, 0], hi = [0, 0, 0];
      for (const p of pos) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
      const target = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2), rad = Math.max(0.25, ...pos.map((p) => Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]))) + 0.06 * reach();
      return { target, dist: (1.4 * rad) / Math.sin((16 * Math.PI) / 180), yaw: 0.65, pitch: 0.35 }; // 1.4: room for the zoom buttons on the right
    }
    function draw3(g) {
      const P = g.P, F = chain(), rr = reach(), rad = 0.028 * rr, n = arm.rows.length;
      const pos = F.map((Tm) => [Tm[0][3], Tm[1][3], Tm[2][3]]), Rof = (Tm) => [0, 1, 2].map((r) => [Tm[r][0], Tm[r][1], Tm[r][2]]);
      g.cyl([0, 0, 0], [0, 0, 0.025 * rr], 0.08 * rr, P.joint);
      for (let i = 0; i < pos.length - 1; i++) if (Math.hypot(pos[i + 1][0] - pos[i][0], pos[i + 1][1] - pos[i][1], pos[i + 1][2] - pos[i][2]) > 1e-6) g.capsule(pos[i], pos[i + 1], rad, P.limb);
      // joint i turns (or slides) about z of frame i − 1 (standard DH) or of frame i (modified DH)
      for (let j = 1; j <= n; j++) {
        const fi = arm.conv === "modified" ? j : j - 1, Tm = F[fi], p = pos[fi], z = [Tm[0][2], Tm[1][2], Tm[2][2]], hl = 0.045 * rr;
        if (arm.rows[j - 1][4] === "P") g.box(p, Rof(Tm), [rad * 2.6, rad * 2.6, hl * 2], P.joint);
        else g.cyl([p[0] - z[0] * hl, p[1] - z[1] * hl, p[2] - z[2] * hl], [p[0] + z[0] * hl, p[1] + z[1] * hl, p[2] + z[2] * hl], rad * 1.45, P.joint);
      }
      F.forEach((Tm, i) => { const last = i === F.length - 1; g.frame(pos[i], Rof(Tm), rr * (last ? 0.16 : 0.09), { w: last ? 3 : 2, onTop: true }); });
      g.sphere(pos[pos.length - 1], rad * 0.8, P.target, { onTop: true });
      // frame numbers; the renderer keeps labels from sitting on each other
      for (let i = 1; i <= n && i < pos.length; i++) g.label(pos[i], `${i}`, { small: true, cls: "bg", dx: 8, dy: 12 });
    }
    function chain() {
      let Tm = H4.I();
      const frames = [Tm];
      arm.rows.forEach(([a, al, d, off, type], i) => {
        const th = type === "R" ? q[i] + off : off, dd = type === "P" ? d + q[i] : d;
        const Ti = arm.conv === "modified" ? H4.mul(H4.mul(H4.rotx(al), H4.tx(a)), H4.mul(H4.rotz(th), H4.tz(dd))) : H4.mul(H4.mul(H4.rotz(th), H4.tz(dd)), H4.mul(H4.tx(a), H4.rotx(al)));
        Tm = H4.mul(Tm, Ti);
        frames.push(Tm);
      });
      if (arm.flange) { Tm = H4.mul(Tm, H4.tz(arm.flange)); frames.push(Tm); }
      return frames;
    }
    function draw() {
      const F = chain();
      if (G3) view.redraw();
      else drawSvg(F);
      table(F);
    }
    function drawSvg(F) {
      V.st.k = (S * 0.42) / reach();
      svg.innerHTML = "";
      groundGrid(svg, V.P, 4, reach() / 4);
      const pos = F.map((Tm) => [Tm[0][3], Tm[1][3], Tm[2][3]]);
      for (let i = 0; i < pos.length - 1; i++) line3(svg, V.P, pos[i], pos[i + 1], "link3");
      F.forEach((Tm, i) => {
        const R = [0, 1, 2].map((r) => [Tm[r][0], Tm[r][1], Tm[r][2]]);
        const last = i === F.length - 1;
        frame3(svg, V.P, pos[i], R, reach() * (last ? 0.16 : 0.09), last ? 3 : 2);
        const p = V.P(pos[i]);
        svg.append(s("circle", { cx: p[0], cy: p[1], r: last ? 5 : 4, class: last ? "ee" : "joint" }));
        if (i > 0 && i <= arm.rows.length) svg.append(s("text", { x: p[0] + 7, y: p[1] + 14, class: "tick" }, `${i}`));
      });
    }
    function table(F) {
      const E = F[F.length - 1];
      const R = [0, 1, 2].map((r) => [E[r][0], E[r][1], E[r][2]]);
      const dh = arm.rows.map(([a, al, d, off, type], i) => `<tr><td>${i + 1}</td><td>${(type === "P" ? d + q[i] : d).toFixed(3)}</td><td>${type === "R" ? deg(q[i] + off) : deg(off)}</td><td>${a.toFixed(3)}</td><td>${deg(al)}</td><td>${type}</td></tr>`).join("");
      panel.innerHTML = `<table class="tf-stats"><tr><th>i</th><th>d</th><th>θ</th><th>a</th><th>α</th><th></th></tr>${dh}</table>
        <pre class="so3-mat">p_ee = (${E[0][3].toFixed(3)}, ${E[1][3].toFixed(3)}, ${E[2][3].toFixed(3)}) m\nR_ee =\n${matText(R)}</pre>`;
      const mod = "${}^{i-1}T_i = \\mathrm{Rot}_x(\\alpha_{i-1})\\,\\mathrm{Trans}_x(a_{i-1})\\,\\mathrm{Rot}_z(\\theta_i)\\,\\mathrm{Trans}_z(d_i)$";
      const std = "${}^{i-1}T_i = \\mathrm{Rot}_z(\\theta_i)\\,\\mathrm{Trans}_z(d_i)\\,\\mathrm{Trans}_x(a_i)\\,\\mathrm{Rot}_x(\\alpha_i)$";
      const chainTex = "${}^0T_{ee} = {}^0T_1\\,{}^1T_2 \\cdots$";
      capSet(c, `${arm.name} · ${arm.conv === "modified" ? L("modified DH (Craig): ", "改进 DH（Craig）：") + mod : L("standard DH: ", "标准 DH：") + std} · ${chainTex} · ${L("blue arrows = joint axes $z_i$; drag the view to orbit", "蓝色箭头 = 关节轴 $z_i$；拖动画面可旋转视角")}${G3 ? L(" · dark cylinders: the joints, pink: the end effector", " · 深色圆柱：关节，粉色：末端") : ""}`);
    }
    const sliders = h("span", { class: "tf-toggles" });
    function buildSliders() {
      sliders.innerHTML = "";
      arm.rows.forEach((r, i) => sliders.append(slider(`q${i + 1}${r[4] === "P" ? " (m)" : ""}`, r[4] === "P" ? { min: 0, max: 0.3, value: q[i], step: 0.005 } : { min: -Math.PI, max: Math.PI, value: q[i], step: 0.01 }, (v) => { q[i] = v; draw(); })));
    }
    ctrls.append(seg(Object.entries(ARMS).map(([k, v]) => [k, v.name.split(" ")[0]]), ARMS[cfg.preset] ? cfg.preset : null, (k) => { arm = JSON.parse(JSON.stringify(ARMS[k])); q = arm.q.slice(); buildSliders(); if (G3) view.setView(fitView(), true); draw(); }), sliders);
    buildSliders();
    draw();
  });

  // ================================================================== robotstack
  Viz.register("robotstack", (root, cfg) => {
    const { stage: st, ctrls, foot } = shell(root, cfg);
    let mode = cfg.mode || "vla", lat = cfg.latency_ms || 120, H = cfg.chunk || 50, hz = cfg.hz || 50;
    let exec = ["all", "naive", "ensemble", "rtc"].includes(cfg.exec) ? cfg.exec : "rtc";
    const W = 680;
    const svg = s("svg", { viewBox: `0 0 ${W} 330`, class: "viz-svg" });
    st.append(svg);
    const c = cap(foot);
    let tAnim = 0;
    const STACKS = () => ({
      modular: [
        [L("Sensors", "传感器"), L("cameras 30 Hz · encoders 1 kHz · IMU 400 Hz · F/T 1 kHz", "相机 30 Hz · 编码器 1 kHz · IMU 400 Hz · 力矩 1 kHz"), 30],
        [L("State estimation", "状态估计"), L("EKF / factor graph 100–400 Hz; perception (pose, segmentation) 10–30 Hz", "EKF / 因子图 100–400 Hz；感知（位姿、分割）10–30 Hz"), 200],
        [L("Task & motion planning", "任务与运动规划"), L("grasp / path / trajectory, 1–10 Hz; MPC 10–100 Hz", "抓取 / 路径 / 轨迹 1–10 Hz；MPC 10–100 Hz"), 5],
        [L("Trajectory controller", "轨迹跟踪控制"), L("impedance / inverse dynamics / WBC, 0.5–1 kHz", "阻抗 / 逆动力学 / WBC，0.5–1 kHz"), 1000],
        [L("Motor drivers", "电机驱动"), L("current loop 10–20 kHz, safety limits", "电流环 10–20 kHz，安全限位"), 10000],
      ],
      vla: [
        [L("Sensors", "传感器"), L("2–3 cameras 15–30 Hz · proprioception 50–1000 Hz", "2–3 个相机 15–30 Hz · 本体感知 50–1000 Hz"), 30],
        [L("System 2: VLM", "System 2：VLM"), L("language + images → subtask / latent, ~1–10 Hz (billions of params)", "语言 + 图像 → 子任务 / 隐变量，约 1–10 Hz（数十亿参数）"), 5],
        [L("System 1: action expert", "System 1：动作专家"), L(`flow-matching / diffusion head → chunk of ${H} actions, executed at ${hz} Hz`, `flow matching / 扩散头 → 一段 ${H} 步动作块，以 ${hz} Hz 执行`), hz],
        [L("Joint / whole-body control", "关节 / 全身控制"), L("PD / impedance tracking of the action targets, 0.5–1 kHz", "PD / 阻抗跟踪动作目标，0.5–1 kHz"), 1000],
        [L("Safety monitor", "安全监控"), L("torque / workspace / speed limits, e-stop, watchdog", "力矩 / 工作空间 / 速度限制，急停，看门狗"), 1000],
      ],
    });
    // `labels` (for the configured mode): one entry per layer, top down — a name, or
    // {name, detail, hz}; null keeps the default; extra entries add layers (up to 7).
    function rowsOf() {
      const rows = STACKS()[mode === "modular" ? "modular" : "vla"].map((r) => r.slice());
      if (Array.isArray(cfg.labels) && mode === (cfg.mode || "vla")) cfg.labels.slice(0, 7).forEach((e, i) => {
        if (e == null) return;
        const d = rows[i] || ["", "", null];
        rows[i] = typeof e === "string" ? [e, d[1], d[2]] : [e.name ?? d[0], e.detail ?? d[1], Number(e.hz) > 0 ? Number(e.hz) : d[2]];
      });
      return rows;
    }
    // Write `str` into the SVG at (x, y); if it is wider than `max`, break it into two lines.
    function fitText(str, x, y, max, cls) {
      const t = s("text", { x, y, class: cls }, str);
      svg.append(t);
      let w = 0;
      try { w = t.getComputedTextLength(); } catch {}
      if (!(w > max)) return 1;
      const words = String(str).split(" ");
      let cut = words.length - 1;
      t.textContent = words.slice(0, cut).join(" ");
      try { while (cut > 1 && t.getComputedTextLength() > max) { cut--; t.textContent = words.slice(0, cut).join(" "); } } catch {}
      svg.append(s("text", { x, y: y + 13, class: cls }, words.slice(cut).join(" ")));
      return 2;
    }
    const rateTxt = (rate) => (rate >= 1000 ? `${rate / 1000} kHz` : `${rate} Hz`);
    // the VLA caption is built from the layers actually drawn (names and rates from `labels`, chunk and hz)
    function vlaCaption() {
      const rows = rowsOf(), named = (r) => (r[2] > 0 ? `${r[0]} (${rateTxt(r[2])})` : r[0]);
      const slow = rows[1], chunk = rows[2], fast = rows.slice(3).filter((r) => r[2] > 0);
      return L(`Hierarchical VLA stack, top down: ${rows.map(named).join(" → ")}. ${slow ? `${slow[0]} decides what to do; ` : ""}${chunk ? `${chunk[0]} outputs chunks of ${H} actions, executed one per control tick at ${hz} Hz (the strip: a fresh chunk arrives before the old one runs out); ` : ""}${fast.length ? `${fast.map((r) => r[0]).join(" and ")} track${fast.length > 1 ? "" : "s"} them at ${rateTxt(Math.max(...fast.map((r) => r[2])))}. ` : ""}The blinking rate of each dot is the loop frequency (log-scaled). Press Play.`,
        `分层 VLA 系统，自上而下：${rows.map(named).join(" → ")}。${slow ? `${slow[0]} 决定做什么；` : ""}${chunk ? `${chunk[0]} 输出 ${H} 步一段的动作块，每个控制周期执行一步，频率 ${hz} Hz（色条：旧块用完之前新块就到）；` : ""}${fast.length ? `${fast.map((r) => r[0]).join("和")} 以 ${rateTxt(Math.max(...fast.map((r) => r[2])))} 跟踪这些动作。` : ""}圆点闪烁速度表示回路频率（对数缩放）。按“播放”。`);
    }
    function drawStack() {
      const rows = rowsOf();
      const vla = mode === "vla", chunkRow = vla && rows.length > 3 ? 2 : -1;
      const bw = 370, bh = 56, x0 = 24, gap = 14, gapChunk = 40;
      const ys = [];
      let y = 12;
      rows.forEach((_, i) => { ys.push(y); y += bh + (i === chunkRow ? gapChunk : gap); });
      const Htot = ys[ys.length - 1] + bh + 10;
      svg.setAttribute("viewBox", `0 0 ${W} ${Htot}`);
      const colors = pal();
      rows.forEach(([name, sub, rate], i) => {
        const yy = ys[i];
        const hot = Math.floor(tAnim * 1.2) % rows.length === i;
        svg.append(s("rect", { x: x0, y: yy, width: bw, height: bh, rx: 8, class: "rs-box" + (hot ? " hot" : "") }));
        svg.append(s("text", { x: x0 + 12, y: yy + 20, class: "label strong" }, name));
        if (sub) fitText(sub, x0 + 12, yy + 37, bw - 24, "tick");
        // rate and a dot whose blink speed shows the loop rate (log-scaled)
        const px = x0 + bw + 16;
        if (rate) {
          svg.append(s("text", { x: px + 26, y: yy + bh / 2 + 5, class: "label" }, rateTxt(rate)));
          const phase = (tAnim * Math.log10(rate + 1) * 2) % 1;
          svg.append(s("circle", { cx: px + 10, cy: yy + bh / 2, r: 8, fill: colors[i % 6], "fill-opacity": 0.25 + 0.75 * (phase < 0.5 ? 1 : 0.2), class: "rs-dot" }));
        }
        if (i < rows.length - 1 && i !== chunkRow) svg.append(s("path", { d: arrowPath(x0 + bw / 2, yy + bh + 1, x0 + bw / 2, yy + bh + gap - 1, 6), class: "garrow" }));
      });
      if (chunkRow >= 0) {
        // The action chunk on its way down: H actions, one executed per control tick (faded);
        // a new chunk replaces the rest when half of it has run (shown slowed if needed).
        const n = Math.max(2, Math.min(H, 100)), half = Math.max(1, Math.round(n / 2));
        const period = half / hz, slow = Math.max(1, 0.9 / period);
        const tt = tAnim / slow + 0.35 * period, k = Math.floor((tt % period) * hz);
        const sy = ys[chunkRow] + bh + 8, cw = (bw - 24) / n, ch = 14;
        for (let j = 0; j < n; j++) svg.append(s("rect", { x: x0 + 12 + j * cw + 0.5, y: sy, width: Math.max(1, cw - 1), height: ch, rx: 1.5, fill: colors[2 % 6], "fill-opacity": j < k ? 0.15 : j < half ? 0.9 : 0.5 }));
        svg.append(s("path", { d: arrowPath(x0 + 12 + k * cw + cw / 2, sy + ch + 2, x0 + 12 + k * cw + cw / 2, ys[chunkRow + 1] - 1, 5), class: "garrow" }));
        svg.append(s("text", { x: x0 + bw + 16, y: sy + 4, class: "tick" }, L(`chunk of ${H} actions,`, `${H} 步动作块，`)));
        svg.append(s("text", { x: x0 + bw + 16, y: sy + 18, class: "tick" }, L("one executed per tick", "每个周期执行一步")));
        if (slow > 1.01) svg.append(s("text", { x: x0 + bw + 16, y: sy + 32, class: "tick" }, L(`(shown ${slow.toFixed(1)}× slower)`, `（放慢 ${slow.toFixed(1)} 倍显示）`)));
      }
      const yTop = ys[0] + bh / 2, yBot = ys[ys.length - 1] + bh / 2, ax = x0 + bw + 180, mid = (yTop + yBot) / 2;
      svg.append(s("path", { d: `M${ax},${yBot} C${ax + 56},${yBot} ${ax + 56},${yTop} ${ax},${yTop}`, class: "rs-loop", stroke: cssv("--faint"), "stroke-dasharray": "5 5", fill: "none" }));
      svg.append(s("path", { d: arrowPath(ax + 8, yTop, ax, yTop, 6), class: "garrow" }));
      svg.append(s("text", { x: ax + 58, y: mid, class: "tick", "text-anchor": "middle", transform: `rotate(90 ${ax + 58} ${mid})` }, L("robot + world → sensors", "机器人 + 环境 → 传感器")));
    }
    // Asynchronous chunk execution: compare naive switching, temporal ensembling and RTC-style inpainting.
    function drawAsync() {
      const dt = 1 / hz, d = Math.max(1, Math.round((lat / 1000) * hz)), Hs = H, sExec = Math.max(d + 1, Math.round(Hs / 2));
      const N = 4 * sExec + Hs;
      const r = rng(5);
      const truth = (k) => Math.sin(k * dt * 2.2) * 0.8;
      const chunks = [];
      for (let i = 0; i * sExec < N; i++) { const t0 = i * sExec, bias = randn(r) * 0.25; chunks.push({ t0, f: (k) => truth(k) + bias + 0.05 * Math.sin(k * 0.9 + i) }); }
      const execNaive = [], execEns = [], execRtc = [];
      let prevR = null;
      for (let k = 0; k < N; k++) {
        // a chunk requested at t0 becomes available d steps later
        const avail = chunks.filter((ch) => ch.t0 + d <= k);
        const cur = avail[avail.length - 1] || chunks[0];
        execNaive.push(cur.f(k));
        const win = avail.filter((ch) => k < ch.t0 + Hs);
        execEns.push(win.length ? win.reduce((a, ch, j) => a + ch.f(k) * Math.exp(-0.3 * j), 0) / win.reduce((a, _, j) => a + Math.exp(-0.3 * j), 0) : cur.f(k));
        // RTC: the new chunk must agree with the old one on the steps already committed, then blends in
        const idx = avail.length - 1;
        if (idx >= 1) {
          const old = avail[idx - 1], since = k - (cur.t0 + d);
          const w = clamp(since / Math.max(2, Math.round(Hs / 4)), 0, 1);
          execRtc.push((1 - w) * old.f(k) + w * cur.f(k));
        } else execRtc.push(cur.f(k));
        prevR = cur;
      }
      const x0 = 40, w = W - 60, y0 = 30, hh = 230;
      const X = (k) => x0 + (k / (N - 1)) * w, Y = (v) => y0 + hh / 2 - v * (hh / 3.2);
      svg.append(s("rect", { x: x0, y: y0, width: w, height: hh, fill: "none", stroke: cssv("--border-2") }));
      chunks.forEach((ch, i) => { const xa = X(ch.t0), xb = X(Math.min(N - 1, ch.t0 + d)); svg.append(s("rect", { x: xa, y: y0, width: Math.max(1, xb - xa), height: hh, fill: cssv("--v3"), "fill-opacity": 0.08 })); svg.append(s("line", { x1: X(ch.t0 + d), x2: X(ch.t0 + d), y1: y0, y2: y0 + hh, stroke: cssv("--faint"), "stroke-dasharray": "3 4" })); });
      const colors = pal();
      const pathOf = (arr) => arr.map((v, k) => `${k ? "L" : "M"}${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join("");
      const show = { naive: execNaive, ensemble: execEns, rtc: execRtc };
      svg.append(s("path", { d: pathOf(Array.from({ length: N }, (_, k) => truth(k))), class: "curve dashed", stroke: cssv("--faint") }));
      for (const [key, arr, col] of [["naive", execNaive, colors[3]], ["ensemble", execEns, colors[1]], ["rtc", execRtc, colors[0]]]) {
        svg.append(s("path", { d: pathOf(arr), class: "curve", stroke: col, "stroke-opacity": exec === key || exec === "all" ? 1 : 0.15 }));
      }
      const jump = (arr) => Math.max(...arr.slice(1).map((v, k) => Math.abs(v - arr[k])));
      svg.append(s("text", { x: x0, y: 20, class: "label strong" }, L("executed action over time (shaded: inference latency after each request)", "执行的动作随时间变化（阴影：每次请求后的推理延迟）")));
      c.innerHTML = `${L("latency", "延迟")} ${lat} ms = ${d} ${L("control steps", "个控制步")} @ ${hz} Hz · ${L("chunk", "动作块")} H = ${Hs}, ${L("new request every", "每")} ${sExec} ${L("steps", "步请求一次")} · ${L("max step-to-step jump", "相邻步最大跳变")}: <b style="color:${colors[3]}">${L("naive switch", "直接切换")} ${jump(execNaive).toFixed(2)}</b> · <b style="color:${colors[1]}">${L("temporal ensembling", "时间集成")} ${jump(execEns).toFixed(2)}</b> · <b style="color:${colors[0]}">${L("RTC-style inpainting", "RTC 式补全")} ${jump(execRtc).toFixed(2)}</b>. ${L("Toy signals for intuition only — not results from any paper.", "示意用的玩具信号，不是任何论文的结果。")}`;
    }
    function draw() {
      svg.innerHTML = "";
      if (mode === "async") { svg.setAttribute("viewBox", `0 0 ${W} 280`); drawAsync(); }
      else { drawStack(); if (mode === "vla") capSet(c, vlaCaption()); else c.innerHTML = L("Classic modular stack: each layer has its own model, rate and failure modes; interfaces are explicit (poses, trajectories, torques). The blinking rate of each dot is the loop frequency (log-scaled).", "经典模块化系统：每一层有自己的模型、频率和失效方式；接口是显式的（位姿、轨迹、力矩）。圆点闪烁速度表示回路频率（对数缩放）。"); }
    }
    const an = animator(root, (dt) => { tAnim += dt; if (mode !== "async") draw(); });
    const play = playButton(an);
    const extras = h("span", { class: "tf-toggles" });
    function buildExtras() {
      extras.innerHTML = "";
      if (mode === "async") extras.append(seg([["all", L("all", "全部")], ["naive", L("naive", "直接切换")], ["ensemble", L("ensembling", "时间集成")], ["rtc", "RTC"]], exec, (v) => { exec = v; draw(); }), slider(L("latency (ms)", "延迟（ms）"), { min: 0, max: 400, value: lat, step: 10 }, (v) => { lat = v; draw(); }), slider(L("chunk H", "动作块 H"), { min: 4, max: 100, value: H, step: 1 }, (v) => { H = Math.round(v); draw(); }));
    }
    ctrls.append(seg([["modular", L("modular stack", "模块化")], ["vla", L("VLA System 1/2", "VLA 双系统")], ["async", L("async chunks", "异步动作块")]], mode, (m) => { mode = m; buildExtras(); draw(); }), play, extras);
    buildExtras();
    draw();
  });

  // ================================================================== pid
  Viz.register("pid", (root, cfg) => {
    const { stage: st, ctrls, foot } = shell(root, cfg);
    let plant = cfg.plant || "pendulum", ctrl = cfg.ctrl || "pd", kp = cfg.kp ?? 20, kd = cfg.kd ?? 2, ki = cfg.ki ?? 10, target = cfg.target ?? 1.0, tmax = cfg.tau_max ?? 8, noise = cfg.noise ?? 0;
    // delay (s, optional): the torque reaches the joint this late (a slow bus, a filter) — 0 by default
    const hasDelay = typeof cfg.delay === "number" && isFinite(cfg.delay);
    let delay = hasDelay ? clamp(cfg.delay, 0, 0.5) : 0;
    const m = 1, l = 0.5, g = 9.81, b = 0.05, I = m * l * l;
    function sim() {
      const dt = 0.001, N = 3000, r = rng(3);
      let th = 0, w = 0, integ = 0, clampT = 0;
      const out = [], tau = [], dk = Math.round(delay / dt), buf = new Float64Array(dk + 1);
      for (let k = 0; k < N; k++) {
        const meas = th + (noise ? randn(r) * noise : 0);
        const e = target - meas;
        const grav = plant === "pendulum" ? m * g * l * Math.sin(meas) : 0;
        let u;
        if (ctrl === "p") u = kp * e;
        else if (ctrl === "pd") u = kp * e - kd * w;
        else if (ctrl === "pid") { const lim = tmax / Math.max(ki, 1e-6), raw = integ + e * dt; integ = clamp(raw, -lim, lim); if (integ !== raw) clampT += dt; u = kp * e + ki * integ - kd * w; }
        else if (ctrl === "pd-gravity") u = kp * e - kd * w + grav;
        else u = (plant === "pendulum" ? I : m) * (kp * e - kd * w) + grav + b * w; // computed torque
        u = clamp(u, -tmax, tmax);
        // the joint gets the torque computed dk steps ago (zero before the first one arrives)
        if (dk > 0) { buf[k % (dk + 1)] = u; u = k >= dk ? buf[(k - dk) % (dk + 1)] : 0; }
        const acc = plant === "pendulum" ? (u - m * g * l * Math.sin(th) - b * w) / I : (u - 0.5 * w) / m;
        w += acc * dt; th += w * dt;
        if (k % 10 === 0) { out.push(th); tau.push(u); }
      }
      return { out, tau, clampT };
    }
    const W = 660;
    const svg = s("svg", { viewBox: `0 0 ${W} 316`, class: "viz-svg" });
    st.append(svg);
    const c = cap(foot);
    let res, tShow = 1;
    function draw() {
      res = res || sim();
      svg.innerHTML = "";
      const n = res.out.length, shown = Math.max(2, Math.floor(n * tShow));
      const x0 = 50, w = 380, y0 = 16, hh = 170;
      const lo = Math.min(0, ...res.out, target) - 0.1, hi = Math.max(...res.out, target) + 0.1;
      const X = (k) => x0 + (k / (n - 1)) * w, Y = (v) => y0 + hh - ((v - lo) / (hi - lo)) * hh;
      // 40 px under the plot: tick numbers, then the axis title below them
      axes(svg, x0 + w + 10, y0 + hh + 40, { l: x0, r: 10, t: y0, b: 40 }, [0, 3], [lo, hi], L("time (s)", "时间（s）"), "θ (rad)");
      svg.append(s("line", { x1: x0, x2: x0 + w, y1: Y(target), y2: Y(target), class: "curve dashed", stroke: cssv("--v3") }));
      svg.append(s("path", { d: res.out.slice(0, shown).map((v, k) => `${k ? "L" : "M"}${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join(""), class: "curve", stroke: cssv("--v1") }));
      // torque strip
      const ty = y0 + hh + 62, th2 = 50;
      svg.append(s("text", { x: x0, y: ty - 6, class: "tick" }, L(`torque $\\tau$ (N·m), $|\\tau| \\le$ ${tmax}`, `力矩 $\\tau$（N·m），$|\\tau| \\le$ ${tmax}`)));
      svg.append(s("path", { d: res.tau.slice(0, shown).map((v, k) => `${k ? "L" : "M"}${X(k).toFixed(1)},${(ty + th2 / 2 - (v / tmax) * (th2 / 2)).toFixed(1)}`).join(""), class: "curve", stroke: cssv("--v2") }));
      svg.append(s("rect", { x: x0, y: ty, width: w, height: th2, fill: "none", stroke: cssv("--border-2") }));
      // its scale: the limits and zero
      svg.append(s("line", { x1: x0, x2: x0 + w, y1: ty + th2 / 2, y2: ty + th2 / 2, stroke: cssv("--border-2"), "stroke-dasharray": "3 3" }));
      for (const [v, yy] of [[tmax, ty + 4], [0, ty + th2 / 2 + 4], [-tmax, ty + th2]]) svg.append(s("text", { x: x0 - 5, y: yy, "text-anchor": "end", class: "tick" }, v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v)}`));
      // pendulum drawing
      const thN = res.out[shown - 1], px = 560, py = 120, Lp = 90;
      svg.append(s("line", { x1: px - 40, x2: px + 40, y1: py, y2: py, stroke: cssv("--fg-2"), "stroke-width": 3 }));
      if (plant === "pendulum") {
        const ex = px + Lp * Math.sin(thN), ey = py + Lp * Math.cos(thN);
        const tx = px + Lp * Math.sin(target), tyy = py + Lp * Math.cos(target);
        svg.append(s("line", { x1: px, y1: py, x2: tx, y2: tyy, stroke: cssv("--v3"), "stroke-dasharray": "5 4", "stroke-width": 2 }));
        svg.append(s("line", { x1: px, y1: py, x2: ex, y2: ey, class: "link" }));
        svg.append(s("circle", { cx: ex, cy: ey, r: 10, class: "ee" }));
        svg.append(s("circle", { cx: px, cy: py, r: 6, class: "joint" }));
        svg.append(s("text", { x: px, y: py + Lp + 34, "text-anchor": "middle", class: "tick" }, L("θ = 0: hanging down", "θ = 0：竖直向下")));
        svg.append(s("text", { x: px, y: py + Lp + 50, "text-anchor": "middle", class: "tick" }, L("gravity torque $m g l \\sin\\theta$", "重力力矩 $m g l \\sin\\theta$")));
      }
      // Overshoot and settling are measured against the FINAL value (mean of the last 0.5 s),
      // so an arm that overshoots and then settles short of the target still shows both.
      const last = res.out.slice(-50);
      const fin = last.reduce((a, v) => a + v, 0) / last.length;
      const ss = target - fin, span = Math.abs(fin - res.out[0]), dir = Math.sign(fin - res.out[0]) || 1;
      const unit = L("s", "s");
      let os = "—", settle = "—";
      if (span > 1e-3) {
        const peak = dir > 0 ? Math.max(...res.out) : Math.min(...res.out);
        os = (Math.max(0, (dir * (peak - fin)) / span) * 100).toFixed(1) + " %";
        settle = "0.00 " + unit;
        for (let k = res.out.length - 1; k >= 0; k--) if (Math.abs(res.out[k] - fin) > 0.02 * span) { settle = ((k + 1) * 0.01).toFixed(2) + " " + unit; break; }
      }
      const moving = Math.max(...last) - Math.min(...last) > 0.01 * Math.max(span, 1e-3);
      const law = { p: "$\\tau = K_p e$", pd: "$\\tau = K_p e - K_d \\dot\\theta$", pid: "$\\tau = K_p e + K_i \\int e\\,dt - K_d \\dot\\theta$", "pd-gravity": "$\\tau = K_p e - K_d \\dot\\theta + m g l \\sin\\theta$", "computed-torque": "$\\tau = M(\\theta)(K_p e - K_d \\dot\\theta) + g(\\theta) + b\\dot\\theta$" }[ctrl];
      capSet(c, `${law}, $e = \\theta^* - \\theta$ · ${L("final value", "终值")} ${fin.toFixed(3)} rad (${L("target", "目标")} ${target.toFixed(2)}) · ${L("steady-state error", "稳态误差")} ${ss.toFixed(3)} rad`,
        `${L("relative to the final value", "相对终值")}: ${L("overshoot", "超调")} ${os} · ${L("settling (±2 %)", "调节时间（±2 %）")} ${settle}${moving ? L(" (still moving at 3 s)", "（3 s 时仍在动）") : ""}` +
        (plant === "pendulum" && (ctrl === "p" || ctrl === "pd") ? L(" · with gravity, P/PD stop where $K_p e$ balances $m g l \\sin\\theta$", " · 有重力时，P/PD 停在 $K_p e$ 与 $m g l \\sin\\theta$ 平衡处") : ""),
        ctrl === "pid" && res.clampT > 0 ? L(`anti-windup: the integral was clamped at $|K_i \\int e\\,dt| \\le \\tau_{\\max}$ for ${res.clampT.toFixed(2)} s`, `抗积分饱和：积分项在 $|K_i \\int e\\,dt| \\le \\tau_{\\max}$ 处被截断了 ${res.clampT.toFixed(2)} s`) : null,
        delay > 0 ? L(`input delay $d = ${(1000 * delay).toFixed(0)}$ ms: the torque reaches the joint $d$ late`, `输入延迟 $d = ${(1000 * delay).toFixed(0)}$ ms：力矩晚 $d$ 才作用到关节上`) : null);
    }
    const rerun = () => { res = sim(); draw(); };
    const an = animator(root, (dt) => { tShow += dt / 3; if (tShow >= 1) { tShow = 1; draw(); return false; } draw(); });
    ctrls.append(playButton(an, () => { tShow = 0; }));
    ctrls.append(seg([["p", "P"], ["pd", "PD"], ["pid", "PID"], ["pd-gravity", L("PD + gravity comp.", "PD + 重力补偿")], ["computed-torque", L("computed torque", "计算力矩")]], ctrl, (v) => { ctrl = v; rerun(); }));
    ctrls.append(slider("$K_p$", { min: 0, max: Math.max(100, kp), value: kp, step: 0.5 }, (v) => { kp = v; rerun(); }), slider("$K_d$", { min: 0, max: Math.max(20, kd), value: kd, step: 0.1 }, (v) => { kd = v; rerun(); }), slider("$K_i$", { min: 0, max: Math.max(60, ki), value: ki, step: 0.5 }, (v) => { ki = v; rerun(); }));
    ctrls.append(slider(L("target $\\theta^*$", "目标 $\\theta^*$"), { min: -2.5, max: 2.5, value: target, step: 0.05 }, (v) => { target = v; rerun(); }), slider("$\\tau_{\\max}$", { min: 0.5, max: Math.max(20, tmax), value: tmax, step: 0.5 }, (v) => { tmax = v; rerun(); }), slider(L("sensor noise", "传感器噪声"), { min: 0, max: 0.05, value: noise, step: 0.001 }, (v) => { noise = v; rerun(); }));
    if (hasDelay) ctrls.append(slider(L("input delay $d$ (ms)", "输入延迟 $d$ (ms)"), { min: 0, max: 200, value: Math.round(delay * 1000), step: 5 }, (v) => { delay = v / 1000; rerun(); }));
    draw();
  });

  // ================================================================== nn (backprop)
  Viz.register("nn", (root, cfg) => {
    const { stage: st, ctrls, foot } = shell(root, cfg);
    const sizes = cfg.layers || [2, 3, 1];
    const act = cfg.act || "tanh";
    let lr = cfg.lr ?? 0.5, x = (cfg.x || [0.5, -1]).slice(0, sizes[0]), y = cfg.y ?? 1;
    const f = { tanh: Math.tanh, relu: (z) => Math.max(0, z), sigmoid: (z) => 1 / (1 + Math.exp(-z)) }[act];
    const df = { tanh: (z, a) => 1 - a * a, relu: (z) => (z > 0 ? 1 : 0), sigmoid: (z, a) => a * (1 - a) }[act];
    let Wt, B, Z, A, D, G, loss, stage, epoch, hist;
    function init() {
      const r = rng(cfg.seed || 2);
      Wt = sizes.slice(1).map((n, l) => Array.from({ length: n }, () => Array.from({ length: sizes[l] }, () => randn(r) * 0.8)));
      B = sizes.slice(1).map((n) => new Array(n).fill(0));
      stage = 0; epoch = 0; hist = []; Z = A = D = G = null; loss = NaN;
    }
    init();
    function forward() {
      A = [x.slice()]; Z = [null];
      for (let l = 0; l < Wt.length; l++) {
        const z = Wt[l].map((row, j) => row.reduce((a, w, i) => a + w * A[l][i], B[l][j]));
        const last = l === Wt.length - 1;
        Z.push(z); A.push(last ? z.slice() : z.map(f));
      }
      const yhat = A[A.length - 1][0];
      loss = 0.5 * (yhat - y) ** 2;
    }
    function backward() {
      const Lr = Wt.length;
      D = new Array(Lr + 1);
      D[Lr] = [A[Lr][0] - y];
      for (let l = Lr - 1; l >= 1; l--) D[l] = A[l].map((a, i) => Wt[l].reduce((acc, row, j) => acc + row[i] * D[l + 1][j], 0) * df(Z[l][i], a));
      G = Wt.map((Wl, l) => Wl.map((row, j) => row.map((_, i) => D[l + 1][j] * A[l][i])));
    }
    function update() { Wt = Wt.map((Wl, l) => Wl.map((row, j) => row.map((w, i) => w - lr * G[l][j][i]))); B = B.map((bl, l) => bl.map((b, j) => b - lr * D[l + 1][j])); epoch++; hist.push(loss); }
    function advance() { if (stage === 0 || stage === 4) { forward(); stage = 1; } else if (stage === 1) stage = 2; else if (stage === 2) { backward(); stage = 3; } else if (stage === 3) { update(); stage = 4; } }
    const W = 640, Hh = 300;
    const svg = s("svg", { viewBox: `0 0 ${W} ${Hh}`, class: "viz-svg" });
    st.append(svg);
    const c = cap(foot);
    const pos = (l, i) => [70 + l * ((W - 260) / (sizes.length - 1)), 40 + (i + 0.5) * ((Hh - 80) / sizes[l])];
    function draw() {
      svg.innerHTML = "";
      const wmax = Math.max(...Wt.flat(2).map(Math.abs), 1e-6);
      const gmax = G ? Math.max(...G.flat(2).map(Math.abs), 1e-9) : 1;
      Wt.forEach((Wl, l) => Wl.forEach((row, j) => row.forEach((w, i) => {
        const [x1, y1] = pos(l, i), [x2, y2] = pos(l + 1, j);
        const showG = stage >= 3 && G;
        const col = showG ? cssv("--v3") : w >= 0 ? cssv("--v1") : cssv("--v4");
        const width = showG ? 0.8 + 5 * (Math.abs(G[l][j][i]) / gmax) : 0.8 + 4 * (Math.abs(w) / wmax);
        svg.append(s("line", { x1, y1, x2, y2, stroke: col, "stroke-width": width, "stroke-opacity": 0.75, class: "nn-edge" }));
        if (sizes.flat().length <= 8 && Wt.flat(2).length <= 12) svg.append(s("text", { x: (x1 * 0.4 + x2 * 0.6), y: (y1 * 0.4 + y2 * 0.6) - 4, class: "tick", "text-anchor": "middle" }, showG ? `∂=${G[l][j][i].toFixed(2)}` : `w=${w.toFixed(2)}`));
      })));
      sizes.forEach((n, l) => { for (let i = 0; i < n; i++) {
        const [cx, cy] = pos(l, i);
        const a = A && stage >= 1 ? A[l][i] : l === 0 ? x[i] : null;
        svg.append(s("circle", { cx, cy, r: 20, class: "nn-node", fill: a == null ? cssv("--surface") : mix(cssv("--viz-cell"), a >= 0 ? cssv("--v1") : cssv("--v4"), Math.min(1, Math.abs(a))) }));
        svg.append(s("text", { x: cx, y: cy + 4, "text-anchor": "middle", class: "cell" + (a != null && Math.abs(a) > 0.6 ? " inv" : "") }, a == null ? "?" : a.toFixed(2)));
        if (stage >= 3 && D && D[l]) svg.append(s("text", { x: cx, y: cy + 34, "text-anchor": "middle", class: "tick", fill: cssv("--v3") }, `δ=${D[l][i].toFixed(2)}`));
      } });
      sizes.forEach((n, l) => svg.append(s("text", { x: pos(l, 0)[0], y: 22, "text-anchor": "middle", class: "label" }, l === 0 ? L("input x", "输入 x") : l === sizes.length - 1 ? "ŷ" : `${L("hidden", "隐层")} ${l} (${act})`)));
      // loss curve
      if (hist.length > 1) {
        const lx = W - 170, ly = 60, lw = 150, lh = 120, mx = Math.max(...hist);
        svg.append(s("rect", { x: lx, y: ly, width: lw, height: lh, fill: "none", stroke: cssv("--border-2") }));
        svg.append(s("path", { d: hist.map((v, i) => `${i ? "L" : "M"}${(lx + (i / (hist.length - 1)) * lw).toFixed(1)},${(ly + lh - (v / mx) * lh).toFixed(1)}`).join(""), class: "curve", stroke: cssv("--v2") }));
        svg.append(s("text", { x: lx, y: ly - 6, class: "tick" }, L(`loss over ${hist.length} steps`, `${hist.length} 步的损失`)));
      }
      const txt = [
        L("Press ›: forward pass, then loss, backward pass, update.", "按 ›：前向 → 损失 → 反向 → 更新。"),
        L(`Forward: z⁽ˡ⁾ = W⁽ˡ⁾a⁽ˡ⁻¹⁾ + b⁽ˡ⁾, a⁽ˡ⁾ = ${act}(z⁽ˡ⁾) (output layer linear). ŷ = ${A ? A[A.length - 1][0].toFixed(3) : "?"}`, `前向：z⁽ˡ⁾ = W⁽ˡ⁾a⁽ˡ⁻¹⁾ + b⁽ˡ⁾，a⁽ˡ⁾ = ${act}(z⁽ˡ⁾)（输出层为线性）。ŷ = ${A ? A[A.length - 1][0].toFixed(3) : "?"}`),
        L(`Loss: L = ½(ŷ − y)² = ½(${A ? A[A.length - 1][0].toFixed(3) : "?"} − ${y})² = ${isFinite(loss) ? loss.toFixed(4) : "?"}`, `损失：L = ½(ŷ − y)² = ½(${A ? A[A.length - 1][0].toFixed(3) : "?"} − ${y})² = ${isFinite(loss) ? loss.toFixed(4) : "?"}`),
        L("Backward: δ⁽ᴸ⁾ = ŷ − y; δ⁽ˡ⁾ = (W⁽ˡ⁺¹⁾ᵀ δ⁽ˡ⁺¹⁾) ⊙ f′(z⁽ˡ⁾); ∂L/∂W⁽ˡ⁾ = δ⁽ˡ⁾ a⁽ˡ⁻¹⁾ᵀ (edge thickness = |gradient|)", "反向：δ⁽ᴸ⁾ = ŷ − y；δ⁽ˡ⁾ = (W⁽ˡ⁺¹⁾ᵀ δ⁽ˡ⁺¹⁾) ⊙ f′(z⁽ˡ⁾)；∂L/∂W⁽ˡ⁾ = δ⁽ˡ⁾ a⁽ˡ⁻¹⁾ᵀ（边的粗细 = 梯度大小）"),
        L(`Update: W ← W − η ∂L/∂W with η = ${lr}`, `更新：W ← W − η ∂L/∂W，η = ${lr}`),
      ][stage];
      c.innerHTML = `<b>${L("step", "步骤")} ${stage}/4</b> ${txt}`;
    }
    let acc = 0;
    const an = animator(root, (dt) => { acc += dt; if (acc > 0.5) { acc = 0; advance(); draw(); if (epoch > 60) return false; } });
    const play = playButton(an);
    ctrls.append(btn("›", () => { play.reset(); advance(); draw(); }), play, btn(T().reset, () => { play.reset(); init(); draw(); }), slider("η", { min: 0.01, max: 2, value: lr, step: 0.01 }, (v) => (lr = v), true), slider(L("target y", "目标 y"), { min: -1, max: 1, value: y, step: 0.05 }, (v) => { y = v; }));
    draw();
  });

  // ================================================================== conv2d
  const KERNELS = { "sobel-x": [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], "sobel-y": [[-1, -2, -1], [0, 0, 0], [1, 2, 1]], blur: [[1, 1, 1], [1, 1, 1], [1, 1, 1]].map((r) => r.map((v) => v / 9)), sharpen: [[0, -1, 0], [-1, 5, -1], [0, -1, 0]] };
  const INPUTS = {
    digit: ["0000000", "0111110", "0000010", "0000100", "0001000", "0010000", "0010000"].map((r) => [...r].map(Number)),
    edge: Array.from({ length: 7 }, () => [0, 0, 0, 1, 1, 1, 1]),
  };
  Viz.register("conv2d", (root, cfg) => {
    const { stage: st, ctrls, foot } = shell(root, cfg);
    let X = Array.isArray(cfg.input) ? cfg.input : INPUTS[cfg.input] || INPUTS.digit;
    let kname = Array.isArray(cfg.kernel) ? "custom" : cfg.kernel || "sobel-x";
    let K = Array.isArray(cfg.kernel) ? cfg.kernel : KERNELS[kname];
    let stride = cfg.stride || 1, pad = cfg.padding ?? 0, pos = 0;
    const W = 680;
    const svg = s("svg", { viewBox: `0 0 ${W} 300`, class: "viz-svg" });
    st.append(svg);
    const c = cap(foot);
    function geom() {
      const n = X.length, k = K.length;
      const P = Array.from({ length: n + 2 * pad }, (_, i) => Array.from({ length: n + 2 * pad }, (_, j) => (i < pad || j < pad || i >= n + pad || j >= n + pad ? 0 : X[i - pad][j - pad])));
      const o = Math.floor((n + 2 * pad - k) / stride) + 1;
      const out = Array.from({ length: o }, (_, i) => Array.from({ length: o }, (_, j) => { let sum = 0; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) sum += P[i * stride + a][j * stride + b] * K[a][b]; return sum; }));
      return { n, k, P, o, out };
    }
    function draw() {
      const { n, k, P, o, out } = geom();
      svg.innerHTML = "";
      const cs = 26, x0 = 20, y0 = 30;
      const total = o * o;
      pos = clamp(pos, 0, total - 1);
      const oi = Math.floor(pos / o), oj = pos % o;
      svg.append(s("text", { x: x0, y: 18, class: "label strong" }, L(`input ${n}×${n}${pad ? ` + padding ${pad}` : ""}`, `输入 ${n}×${n}${pad ? ` + 填充 ${pad}` : ""}`)));
      P.forEach((row, i) => row.forEach((v, j) => { const isPad = i < pad || j < pad || i >= n + pad || j >= n + pad; svg.append(s("rect", { x: x0 + j * cs, y: y0 + i * cs, width: cs - 2, height: cs - 2, rx: 3, fill: isPad ? cssv("--viz-masked") : mix(cssv("--viz-cell"), cssv("--fg"), v * 0.75) })); }));
      svg.append(s("rect", { x: x0 + oj * stride * cs - 2, y: y0 + oi * stride * cs - 2, width: k * cs + 2, height: k * cs + 2, rx: 4, class: "conv-win" }));
      // kernel
      const kx = x0 + (n + 2 * pad) * cs + 30;
      svg.append(s("text", { x: kx, y: 18, class: "label strong" }, L(`kernel ${k}×${k}`, `卷积核 ${k}×${k}`)));
      const kmax = Math.max(...K.flat().map(Math.abs));
      K.forEach((row, a) => row.forEach((v, b) => { svg.append(s("rect", { x: kx + b * cs, y: y0 + a * cs, width: cs - 2, height: cs - 2, rx: 3, fill: mix(cssv("--viz-cell"), v < 0 ? cssv("--v4") : cssv("--v1"), Math.abs(v) / kmax) })); svg.append(s("text", { x: kx + b * cs + cs / 2 - 1, y: y0 + a * cs + cs / 2 + 3, "text-anchor": "middle", class: "cell", style: "font-size:9px" }, Number.isInteger(v) ? v : v.toFixed(2))); }));
      // output
      const ox = kx + k * cs + 40;
      svg.append(s("text", { x: ox, y: 18, class: "label strong" }, L(`output ${o}×${o}`, `输出 ${o}×${o}`)));
      const omax = Math.max(...out.flat().map(Math.abs), 1e-9);
      out.forEach((row, i) => row.forEach((v, j) => { const idx = i * o + j; svg.append(s("rect", { x: ox + j * cs, y: y0 + i * cs, width: cs - 2, height: cs - 2, rx: 3, fill: idx <= pos ? mix(cssv("--viz-cell"), v < 0 ? cssv("--v4") : cssv("--v1"), Math.abs(v) / omax) : cssv("--surface"), stroke: idx === pos ? cssv("--v3") : cssv("--border"), "stroke-width": idx === pos ? 2.5 : 1 })); }));
      const terms = [];
      for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) { const pv = P[oi * stride + a][oj * stride + b], kv = K[a][b]; if (pv !== 0 && kv !== 0) terms.push(`${(+kv.toFixed(2))}·${pv}`); }
      capSet(c, `y[${oi},${oj}] = $\\sum_{a,b} K[a,b]$ · x[${oi * stride}+a, ${oj * stride}+b] = ${terms.length ? terms.slice(0, 9).join(" + ") + (terms.length > 9 ? " + …" : "") : "0"} = ${out[oi][oj].toFixed(2)} · ${L("output size", "输出尺寸")} $\\lfloor (n + 2p - k)/s \\rfloor + 1$ = ⌊(${n} + ${2 * pad} − ${k})/${stride}⌋ + 1 = ${o}`);
    }
    let acc = 0;
    const an = animator(root, (dt) => { acc += dt; if (acc > 0.35) { acc = 0; const { o } = geom(); if (pos >= o * o - 1) return false; pos++; draw(); } });
    const play = playButton(an, () => { const { o } = geom(); if (pos >= o * o - 1) pos = 0; });
    ctrls.append(btn("‹", () => { play.reset(); pos--; draw(); }), play, btn("›", () => { play.reset(); pos++; draw(); }));
    if (!Array.isArray(cfg.kernel)) ctrls.append(seg(Object.keys(KERNELS).map((k) => [k, k]), kname, (v) => { kname = v; K = KERNELS[v]; draw(); }));
    ctrls.append(seg([[1, "stride 1"], [2, "stride 2"]], stride, (v) => { stride = +v; pos = 0; draw(); }), seg([[0, "pad 0"], [1, "pad 1"]], pad, (v) => { pad = +v; pos = 0; draw(); }));
    draw();
  });

  // ================================================================== bayes
  function lgamma(z) {
    const g = 7, C = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
    z -= 1;
    let x = C[0];
    for (let i = 1; i < g + 2; i++) x += C[i] / (z + i);
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  const betaPdf = (x, a, b) => (x <= 0 || x >= 1 ? 0 : Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - (lgamma(a) + lgamma(b) - lgamma(a + b))));
  const normPdf = (x, m, sd) => Math.exp(-0.5 * ((x - m) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
  Viz.register("bayes", (root, cfg) => {
    const { stage: st, ctrls, foot } = shell(root, cfg);
    let model = cfg.model || "beta-binomial";
    // data: [heads, tails] (beta-binomial) or a list of samples (gaussian) observed at the start
    const d0 = Array.isArray(cfg.data) ? cfg.data.filter((v) => typeof v === "number" && isFinite(v)) : [];
    const bb0 = model === "beta-binomial" && d0.length === 2;
    const h0 = bb0 ? Math.max(0, Math.round(d0[0])) : 0, t0 = bb0 ? Math.max(0, Math.round(d0[1])) : 0;
    const xs0 = model === "gaussian" ? d0.slice(0, 200) : [];
    let a0 = (cfg.prior || [2, 2])[0], b0 = (cfg.prior || [2, 2])[1], heads = h0, tails = t0, truth = cfg.truth ?? 0.7;
    let mu0 = model === "gaussian" ? (cfg.prior || [0, 2])[0] : 0, s0 = model === "gaussian" ? (cfg.prior || [0, 2])[1] : 2, sig = cfg.sigma ?? 1, xs = xs0.slice();
    const r = rng(cfg.seed || 8);
    const W = 640;
    const svg = s("svg", { viewBox: `0 0 ${W} 300`, class: "viz-svg" });
    st.append(svg);
    const lgBox = h("div", {});
    foot.append(lgBox);
    const c = cap(foot);
    const colors = pal();
    // a legend in the colours actually drawn (the palette depends on the theme)
    const setLegend = () => lgBox.replaceChildren(legend(model === "beta-binomial"
      ? [[L("prior", "先验"), colors[2], true], [L("likelihood (rescaled)", "似然（已缩放）"), colors[1]], [L("posterior", "后验"), colors[0]], [L("true θ", "真实 θ"), cssv("--v4")]]
      : [[L("prior", "先验"), colors[2], true], [L("posterior", "后验"), colors[0]], [L("samples $x_i$", "样本 $x_i$"), colors[1]], [L("true μ", "真实 μ"), cssv("--v4")]]));
    function draw() {
      svg.innerHTML = "";
      setLegend();
      const pad = { l: 46, r: 14, t: 14, b: 36 };
      if (model === "beta-binomial") {
        const a = a0 + heads, b = b0 + tails, n = heads + tails;
        const grid = Array.from({ length: 301 }, (_, i) => i / 300);
        const prior = grid.map((x) => betaPdf(x, a0, b0)), post = grid.map((x) => betaPdf(x, a, b));
        const likRaw = grid.map((x) => (n ? Math.exp(heads * Math.log(Math.max(x, 1e-12)) + tails * Math.log(Math.max(1 - x, 1e-12))) : 0));
        const lmax = Math.max(...likRaw, 1e-300), pmax = Math.max(...post, ...prior, 1);
        const lik = likRaw.map((v) => (v / lmax) * pmax * 0.9);
        const { X, Y } = axes(svg, W, 300, pad, [0, 1], [0, pmax * 1.1], L("θ = P(heads)", "θ = P(正面)"), L("density", "密度"));
        for (const [arr, col, dash] of [[prior, colors[2], true], [lik, colors[1], false], [post, colors[0], false]]) svg.append(s("path", { d: grid.map((x, i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(arr[i]).toFixed(1)}`).join(""), class: "curve" + (dash ? " dashed" : ""), stroke: col, "stroke-opacity": arr === lik && !n ? 0 : 1 }));
        svg.append(s("line", { x1: X(truth), x2: X(truth), y1: pad.t, y2: 300 - pad.b, class: "cursor" }));
        // 95% credible interval from the CDF
        let cdf = 0; const dx = 1 / 300; let lo = 0, hi = 1, gotLo = false;
        for (let i = 0; i < grid.length; i++) { cdf += post[i] * dx; if (!gotLo && cdf >= 0.025) { lo = grid[i]; gotLo = true; } if (cdf >= 0.975) { hi = grid[i]; break; } }
        const mean = a / (a + b), map = a > 1 && b > 1 ? (a - 1) / (a + b - 2) : NaN;
        capSet(c, `${L("prior", "先验")} Beta(${a0.toFixed(1)}, ${b0.toFixed(1)}) · ${L("data", "数据")} ${heads} ${L("heads", "正")} / ${tails} ${L("tails", "反")} → ${L("posterior", "后验")} $\\mathrm{Beta}(\\alpha_0 + h, \\beta_0 + t)$ = Beta(${a.toFixed(1)}, ${b.toFixed(1)}) · ${L("mean", "均值")} $(\\alpha_0 + h)/(\\alpha_0 + \\beta_0 + n)$ = ${mean.toFixed(3)} · MAP = ${isFinite(map) ? map.toFixed(3) : "—"} · ${L("95% credible interval", "95% 可信区间")} [${lo.toFixed(2)}, ${hi.toFixed(2)}]`);
      } else {
        const n = xs.length, sum = xs.reduce((a, v) => a + v, 0);
        const prec = 1 / s0 ** 2 + n / sig ** 2, sN = Math.sqrt(1 / prec), mN = (mu0 / s0 ** 2 + sum / sig ** 2) / prec;
        const lo = Math.min(mu0 - 3 * s0, truth - 3 * sig), hi = Math.max(mu0 + 3 * s0, truth + 3 * sig);
        const grid = Array.from({ length: 301 }, (_, i) => lo + ((hi - lo) * i) / 300);
        const prior = grid.map((x) => normPdf(x, mu0, s0)), post = grid.map((x) => normPdf(x, mN, sN));
        const ymax = Math.max(...post, ...prior) * 1.1;
        const { X, Y } = axes(svg, W, 300, pad, [lo, hi], [0, ymax], "μ", L("density", "密度"));
        svg.append(s("path", { d: grid.map((x, i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(prior[i]).toFixed(1)}`).join(""), class: "curve dashed", stroke: colors[2] }));
        svg.append(s("path", { d: grid.map((x, i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(post[i]).toFixed(1)}`).join(""), class: "curve", stroke: colors[0] }));
        xs.forEach((v) => svg.append(s("line", { x1: X(v), x2: X(v), y1: 300 - pad.b, y2: 300 - pad.b - 10, stroke: colors[1], "stroke-width": 2 })));
        svg.append(s("line", { x1: X(truth), x2: X(truth), y1: pad.t, y2: 300 - pad.b, class: "cursor" }));
        capSet(c, `${L("prior", "先验")} $\\mathcal N(\\mu_0, \\sigma_0^2)$ = N(${mu0}, ${(s0 ** 2).toFixed(2)}), ${L("known noise", "已知噪声")} $\\sigma$ = ${sig}, $n$ = ${n} · $1/\\sigma_n^2 = 1/\\sigma_0^2 + n/\\sigma^2$ = ${prec.toFixed(2)} · $\\mu_n = \\sigma_n^2 (\\mu_0/\\sigma_0^2 + \\sum_i x_i/\\sigma^2)$ = ${mN.toFixed(3)}, $\\sigma_n$ = ${sN.toFixed(3)} · ${L("ticks = samples; the posterior narrows like $1/\\sqrt n$", "刻度 = 样本；后验宽度按 $1/\\sqrt n$ 收窄")}`);
      }
    }
    const box = h("span", { class: "tf-toggles" });
    function controls() {
      box.innerHTML = "";
      if (model === "beta-binomial") box.append(btn(L("Heads", "正面"), () => { heads++; draw(); }), btn(L("Tails", "反面"), () => { tails++; draw(); }), btn(L("+10 flips", "+10 次"), () => { for (let i = 0; i < 10; i++) r() < truth ? heads++ : tails++; draw(); }), btn(T().reset, () => { heads = h0; tails = t0; draw(); }), slider("α₀", { min: 0.5, max: 20, value: a0, step: 0.5 }, (v) => { a0 = v; draw(); }), slider("β₀", { min: 0.5, max: 20, value: b0, step: 0.5 }, (v) => { b0 = v; draw(); }), slider(L("true θ", "真实 θ"), { min: 0.05, max: 0.95, value: truth, step: 0.01 }, (v) => { truth = v; draw(); }));
      else box.append(btn(L("+1 sample", "+1 个样本"), () => { xs.push(truth + randn(r) * sig); draw(); }), btn(L("+10 samples", "+10 个样本"), () => { for (let i = 0; i < 10; i++) xs.push(truth + randn(r) * sig); draw(); }), btn(T().reset, () => { xs = xs0.slice(); draw(); }), slider("μ₀", { min: -3, max: 3, value: mu0, step: 0.1 }, (v) => { mu0 = v; draw(); }), slider("σ₀", { min: 0.2, max: 4, value: s0, step: 0.1 }, (v) => { s0 = v; draw(); }), slider("σ", { min: 0.2, max: 3, value: sig, step: 0.1 }, (v) => { sig = v; draw(); }));
    }
    ctrls.append(seg([["beta-binomial", "Beta–Binomial"], ["gaussian", L("Gaussian mean", "高斯均值")]], model, (m) => { model = m; if (m === "gaussian") truth = 1.2; else truth = 0.7; controls(); draw(); }), box);
    controls();
    draw();
  });

  // ================================================================== bpe
  Viz.register("bpe", (root, cfg) => {
    const { stage: st, ctrls, foot } = shell(root, cfg);
    const corpus = cfg.corpus || "low low low low low lower lower newest newest newest newest newest newest widest widest widest";
    const maxMerges = cfg.merges || 10;
    let words, merges;
    function reset() {
      const freq = {};
      corpus.trim().split(/\s+/).forEach((w) => (freq[w] = (freq[w] || 0) + 1));
      words = Object.entries(freq).map(([w, n]) => ({ syms: [...w, "</w>"], n }));
      merges = [];
    }
    const pairCounts = () => {
      const cnt = new Map();
      for (const w of words) for (let i = 0; i < w.syms.length - 1; i++) { const k = w.syms[i] + "\u0001" + w.syms[i + 1]; cnt.set(k, (cnt.get(k) || 0) + w.n); }
      return [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    };
    function step() {
      if (merges.length >= maxMerges) return false;
      const pc = pairCounts();
      if (!pc.length) return false;
      const [a, b] = pc[0][0].split("\u0001");
      merges.push([a, b, pc[0][1]]);
      for (const w of words) { const out = []; for (let i = 0; i < w.syms.length; i++) { if (i < w.syms.length - 1 && w.syms[i] === a && w.syms[i + 1] === b) { out.push(a + b); i++; } else out.push(w.syms[i]); } w.syms = out; }
      return true;
    }
    reset();
    const panel = h("div", { class: "bpe-panel" });
    st.append(panel);
    const c = cap(foot);
    const e = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    function draw() {
      const pc = pairCounts().slice(0, 8);
      const vocab = new Set(words.flatMap((w) => w.syms));
      const mx = Math.max(...pc.map((p) => p[1]), 1);
      panel.innerHTML = `<div class="tf-wrap"><div class="tf-panel"><b>${L("most frequent adjacent pairs", "最常见的相邻符号对")}</b>${pc.map(([k, n], i) => `<div class="bpe-row"><span class="bpe-pair${i === 0 ? " top" : ""}">${k.split("\u0001").map((x) => `<code>${e(x)}</code>`).join(" ")}</span><span class="bpe-bar" style="width:${(n / mx) * 120}px"></span>${n}</div>`).join("")}</div>
        <div class="tf-panel"><b>${L("corpus (word × frequency)", "语料（词 × 频次）")}</b>${words.map((w) => `<div class="bpe-row">${w.syms.map((x) => `<code class="bpe-tok">${e(x)}</code>`).join("")} <span class="muted">× ${w.n}</span></div>`).join("")}
        <b style="display:block;margin-top:8px">${L("merges so far", "已执行的合并")}</b><div>${merges.map(([a, b, n], i) => `<code>${i + 1}. ${e(a)} + ${e(b)} → ${e(a + b)}</code> <span class="muted">(${n})</span>`).join("<br>") || "—"}</div></div></div>`;
      c.innerHTML = `${L("vocabulary size", "词表大小")} ${vocab.size} · ${L("total tokens in corpus", "语料总 token 数")} ${words.reduce((a, w) => a + w.syms.length * w.n, 0)} · ${L("each step merges the most frequent adjacent pair everywhere and adds it to the vocabulary; the ordered merge list is the tokenizer", "每一步把出现最多的相邻对在所有地方合并，并加入词表；按顺序记录的合并规则就是分词器")}`;
    }
    let acc = 0;
    const an = animator(root, (dt) => { acc += dt; if (acc > 0.9) { acc = 0; const ok = step(); draw(); if (!ok) return false; } });
    const play = playButton(an);
    ctrls.append(btn(L("merge once", "合并一次"), () => { play.reset(); step(); draw(); }), play, btn(T().reset, () => { play.reset(); reset(); draw(); }));
    draw();
  });
})();
