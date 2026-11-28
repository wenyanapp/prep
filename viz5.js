"use strict";
// Teaching widgets, part 5: physical pictures for the foundations lessons (PLAN R17).
// lipm (balance and push recovery, walking, cart–table), contact (friction cone; CoP and
// pressure under a foot) and vec2 (vector sum, dot product, projection, cross product,
// torque). Registered into viz.js; fields documented in CONTENT_SPEC.md
// ("Physical and foundations widgets").
(() => {
  if (!window.Viz) return;
  const { h, s, cssv, clamp, T, animator, shell, slider, btn, seg, playButton, axes, arrowPath, mathNodes } = Viz.util;
  const zh = () => (document.documentElement.lang || "").startsWith("zh");
  const L = (en, cn) => (zh() ? cn : en);
  const cap = (foot) => { const c = h("div", { class: "viz-caption" }); foot.append(c); return c; };
  // Caption lines with "$…$" typeset by KaTeX; a node (e.g. a muted hint) is appended as is.
  const capSet = (el, ...lines) => el.replaceChildren(...lines.filter((l) => l != null && l !== "").flatMap((l, i) => [...(i ? [h("br")] : []), ...(typeof l === "string" ? mathNodes(l) : [l])]));
  const hint = (str) => h("span", { style: "color:var(--muted)" }, str);
  // Move SVG labels apart: each label (in order) that overlaps an earlier one tries a few
  // nearby positions and takes the first free one inside [x0, x1] × [y0, y1].
  function declutter(labels, box) {
    const placed = [];
    const hit = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
    for (const t of labels) {
      if (!t || !t.isConnected) continue;
      let bb;
      try { bb = t.getBBox(); } catch { continue; }
      if (!bb.width) continue;
      const x = +t.getAttribute("x"), y = +t.getAttribute("y"), dy = bb.height + 2;
      const inside = (b) => !box || (b.x >= box[0] && b.x + b.width <= box[2] && b.y >= box[1] && b.y + b.height <= box[3]);
      let best = bb;
      if (placed.some((p) => hit(bb, p)) || !inside(bb)) {
        for (const [ox, oy] of [[0, -dy], [0, dy], [0, -2 * dy], [0, 2 * dy], [bb.width / 2 + 6, 0], [-bb.width / 2 - 6, 0], [0, -3 * dy], [0, 3 * dy]]) {
          const c = { x: bb.x + ox, y: bb.y + oy, width: bb.width, height: bb.height };
          if (!placed.some((p) => hit(c, p)) && inside(c)) { t.setAttribute("x", x + ox); t.setAttribute("y", y + oy); best = c; break; }
        }
      }
      placed.push(best);
    }
  }
  const G = 9.81;
  const DEG = Math.PI / 180;
  let uid = 0;
  // Number with a real minus sign and no "-0.00".
  const n = (v, d = 2) => { const r = (+v).toFixed(d); return (/^-0\.?0*$/.test(r) ? r.slice(1) : r).replace(/^-/, "−"); };
  const np = (v, d = 1) => { const t = n(v, d); return t.startsWith("−") ? `(${t})` : t; }; // a factor inside a product
  const colors = () => {
    const g = (k) => cssv(k);
    return { fg: g("--fg"), fg2: g("--fg-2"), muted: g("--muted"), faint: g("--faint"), border: g("--border"), border2: g("--border-2"), surface: g("--surface"), surface2: g("--surface-2"), v1: g("--v1"), v2: g("--v2"), v3: g("--v3"), v4: g("--v4"), v5: g("--v5"), v6: g("--v6") };
  };
  const arrow = (x1, y1, x2, y2, color, w = 2.6, size = 8, extra = {}) =>
    s("path", { d: arrowPath(x1, y1, x2, y2, size), stroke: color, "stroke-width": w, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", ...extra });
  const txt = (x, y, str, o = {}) => s("text", { x, y, "font-size": o.size || 13, fill: o.fill, "font-weight": o.weight ?? 600, "text-anchor": o.anchor || "start", ...(o.attrs || {}) }, str);
  const ln = (x1, y1, x2, y2, stroke, w = 1.5, extra = {}) => s("line", { x1, y1, x2, y2, stroke, "stroke-width": w, ...extra });
  const narrowOf = (el) => (el.clientWidth || 700) < 520;
  // Sliders with long labels: two per row on an iPad, one per row on a phone.
  const wide = (row) => { row.style.flex = "1 1 300px"; return row; };
  const toView = (svg, ev, W, H) => { const r = svg.getBoundingClientRect(); return [((ev.clientX - r.left) / r.width) * W, ((ev.clientY - r.top) / r.height) * H]; };
  function ground(svg, x0, x1, y, color) {
    svg.append(ln(x0, y, x1, y, color, 2));
    for (let x = x0 + 6; x < x1; x += 14) svg.append(ln(x, y + 1.5, x - 8, y + 10, color, 1.1));
  }
  // Arc from math angle a0 to a1 (y up), drawn on the screen (y down).
  function arcPath(cx, cy, r, a0, a1) {
    const p = (a) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy - r * Math.sin(a)).toFixed(1)}`;
    const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    return `M${p(a0)}A${r},${r} 0 ${large} ${a1 > a0 ? 0 : 1} ${p(a1)}`;
  }
  const diamond = (x, y, r, stroke, fill, w = 2.2) => s("path", { d: `M${x},${y - r}L${x + r},${y}L${x},${y + r}L${x - r},${y}Z`, stroke, fill, "stroke-width": w });
  const tri = (x, y, r, fill) => s("path", { d: `M${x},${y - r}L${x + r * 0.9},${y + r * 0.6}L${x - r * 0.9},${y + r * 0.6}Z`, fill });

  // ================================================================== lipm
  Viz.register("lipm", (root, cfg) => {
    const { stage, ctrls, foot } = shell(root, cfg);
    const fc = Array.isArray(cfg.foot) && cfg.foot.length === 2 && +cfg.foot[0] < 0 && +cfg.foot[1] > 0 ? cfg.foot.map(Number) : [-0.1, 0.1];
    const heel = fc[0], toe = fc[1], mid = (heel + toe) / 2;
    let mode = ["balance", "walk", "cart"].includes(cfg.mode) ? cfg.mode : "balance";
    let z0 = clamp(Number(cfg.z0) || 0.9, 0.4, 1.4);
    let push = clamp(Number(cfg.push) || 0.4, 0.05, 1.5);
    let control = ["none", "ankle", "step"].includes(cfg.control) ? cfg.control : "ankle";
    let speed = clamp(Number(cfg.speed ?? 0.5) || 0, 0, 1.2), Ts = clamp(Number(cfg.step_time) || 0.5, 0.3, 0.8);
    let accel = clamp(Number(cfg.accel) || 0, -10, 10), cartX = 0;
    const phaseOn = cfg.phase !== false;
    // push0: the figure opens right after a push of push0 m/s (sign = direction); autoplay: run on load.
    const push0 = clamp(Number(cfg.push0) || 0, -1.5, 1.5), autoplay = cfg.autoplay === true;
    let rate = 1;
    const om = () => Math.sqrt(G / z0);
    const svg = s("svg", { class: "viz-svg" });
    stage.append(svg);
    const cp = cap(foot);
    const clipA = "lipm-a-" + ++uid, clipB = "lipm-b-" + uid;
    let W = 660, H = 320;

    // ---------------------------------------------------------------- balance
    // c: CoM (absolute x, m), cd: CoM velocity, p: ZMP, ankle: stance ankle position.
    const B = {};
    const resetB = () => Object.assign(B, { ankle: 0, c: mid, cd: push0, p: mid, pOff: mid, fell: false, swing: null, ghost: null, trace: [[mid, push0]], cam: 0, steps: 0 }) && (B.p = zmpB());
    resetB();
    function xiB() { return B.c + B.cd / om(); }
    function zmpB() {
      const lo = B.ankle + heel, hi = B.ankle + toe;
      if (control === "none") return clamp(B.ankle + B.pOff, lo, hi);
      if (B.swing) return B.swing.p; // held at the edge while the other foot swings
      const xi = xiB();
      return clamp(xi + (xi - (B.ankle + mid)), lo, hi); // DCM feedback, k = 1, saturated by the sole
    }
    function stepB(dt) {
      if (B.fell) return;
      const w = om(), xi = xiB(), lo = B.ankle + heel, hi = B.ankle + toe;
      if (control === "step" && !B.swing && (xi > hi + 1e-6 || xi < lo - 1e-6)) {
        const p = xi > hi ? hi : lo, Tsw = 0.25;
        // ξ(t + T) = p + (ξ − p) e^{ωT}: put the new foot's centre there.
        const maxStep = 0.75 * z0;
        const to = clamp(p + (xi - p) * Math.exp(w * Tsw) - mid, B.ankle - maxStep, B.ankle + maxStep);
        B.swing = { t: 0, T: Tsw, p, from: B.ankle, to };
      }
      B.p = zmpB();
      // Exact LIPM solution over dt with the ZMP held constant: c̈ = ω²(c − p).
      const x0 = B.c - B.p, v0 = B.cd, ch = Math.cosh(w * dt), sh = Math.sinh(w * dt);
      B.c = B.p + x0 * ch + (v0 / w) * sh;
      B.cd = x0 * w * sh + v0 * ch;
      if (B.swing) {
        B.swing.t += dt;
        if (B.swing.t >= B.swing.T) {
          B.ghost = B.ankle; B.ankle = B.swing.to; B.swing = null; B.steps++; B.trace = [];
          B.p = zmpB();
        }
      }
      if (Math.abs(B.c - B.p) > z0 * Math.tan(35 * DEG)) B.fell = true;
    }
    const settledB = () => !B.swing && Math.abs(B.cd) < 2e-3 && Math.abs(B.c - B.p) < 3e-4 && Math.abs(B.cam - B.ankle) < 2e-3;

    function drawBalance(C) {
      const nar = narrowOf(stage);
      W = nar ? 400 : 660;
      const sceneW = phaseOn && !nar ? 440 : W;
      H = phaseOn ? (nar ? 566 : 322) : 312;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const k = 190 / Math.max(z0, 0.8), gy = 258, cx = sceneW / 2;
      const X = (x) => cx + (x - B.cam) * k;
      const w = om(), xi = xiB(), lo = B.ankle + heel, hi = B.ankle + toe;
      const inside = xi >= lo - 1e-9 && xi <= hi + 1e-9;
      const defs = s("defs", {}, s("clipPath", { id: clipA }, s("rect", { x: 0, y: 0, width: sceneW, height: 312 })));
      svg.append(defs);
      const g = s("g", { "clip-path": `url(#${clipA})` });
      svg.append(g);
      ground(g, 0, sceneW, gy, C.faint);
      const sole = (a, cls) => s("rect", { x: X(a + heel), y: gy - 9, width: (toe - heel) * k, height: 9, rx: 3, ...cls });
      if (B.ghost != null) g.append(sole(B.ghost, { fill: "none", stroke: C.faint, "stroke-dasharray": "4 3", "stroke-width": 1.5 }));
      const good = inside ? C.v2 : C.v4;
      g.append(sole(B.ankle, { fill: good, "fill-opacity": 0.28, stroke: good, "stroke-width": 2 }));
      g.append(s("circle", { cx: X(B.ankle), cy: gy - 13, r: 4, fill: C.fg2 }));
      if (B.swing) {
        const u = clamp(B.swing.t / B.swing.T, 0, 1), sm = u * u * (3 - 2 * u);
        const a = B.swing.from + (B.swing.to - B.swing.from) * sm, lift = Math.sin(Math.PI * u) * 0.08 * k;
        g.append(sole(B.swing.to, { fill: "none", stroke: C.v1, "stroke-dasharray": "5 4", "stroke-width": 1.8 }));
        g.append(s("rect", { x: X(a + heel), y: gy - 9 - lift, width: (toe - heel) * k, height: 9, rx: 3, fill: C.v1, "fill-opacity": 0.5 }));
        g.append(ln(X(B.c), gy - z0 * k, X(a), gy - 9 - lift, C.faint, 3, { "stroke-linecap": "round" }));
      }
      // the virtual leg from the ZMP to the CoM, the CoM, its velocity
      const comY = gy - z0 * k;
      g.append(ln(X(B.p), gy - 2, X(B.c), comY, B.fell ? C.v4 : C.fg2, 4, { "stroke-linecap": "round" }));
      g.append(ln(X(B.c), comY, X(B.c), gy, C.faint, 1, { "stroke-dasharray": "3 4" }));
      if (Math.abs(B.cd) > 0.02) g.append(arrow(X(B.c), comY - 22, X(B.c) + clamp(B.cd * 70, -90, 90), comY - 22, C.v3, 2.6));
      g.append(s("circle", { cx: X(B.c), cy: comY, r: 13, fill: C.v3, stroke: C.surface, "stroke-width": 2 }));
      g.append(txt(X(B.c) + 18, comY + 5, L("CoM", "质心"), { fill: C.fg2 }));
      // ZMP and DCM on the ground
      g.append(tri(X(B.p), gy - 1, 7, C.v4));
      g.append(diamond(X(xi), gy, 7, C.v1, "none"));
      g.append(ln(X(xi), gy - 8, X(xi), comY + 18, C.v1, 1.2, { "stroke-dasharray": "2 4" }));
      const lab = (x, y, str, fill) => {
        const half = str.length * (zh() ? 6.5 : 3.6);
        const off = x < -2 ? "◀ " : x > sceneW + 2 ? " ▶" : "";
        const at = x - half < 6 ? { x: 6, anchor: "start" } : x + half > sceneW - 6 ? { x: sceneW - 6, anchor: "end" } : { x, anchor: "middle" };
        g.append(txt(at.x, y, off === "◀ " ? off + str : str + off, { fill, anchor: at.anchor }));
      };
      lab(X(B.p), gy + 24, L("ZMP p", "ZMP p"), C.v4);
      lab(X(xi), gy + 42, L("DCM ξ (capture point)", "DCM ξ（捕获点）"), C.v1);
      // status
      let st, stc;
      if (B.fell) { st = L("Fell — press reset", "摔倒了——点“重置”"); stc = C.v4; }
      else if (B.swing) { st = L("Stepping to the capture point", "正在迈向捕获点"); stc = C.v1; }
      else if (control === "none") { st = L("No controller: the ZMP stays put", "无控制：ZMP 停在原处"); stc = C.muted; }
      else if (inside) { st = L("ξ on the foot: the ankle can recover", "ξ 在脚掌内：踝关节能救回来"); stc = C.v2; }
      else { st = control === "step" ? L("ξ off the foot: step!", "ξ 出了脚掌：迈步！") : L("ξ off the foot: the ankle cannot save it", "ξ 出了脚掌：踝关节救不回来"); stc = C.v4; }
      g.append(txt(10, 22, st, { fill: stc, size: 14, weight: 700 }));
      if (B.steps) g.append(txt(10, 42, L(`steps: ${B.steps}`, `已迈步：${B.steps}`), { fill: C.muted, size: 12 }));

      if (phaseOn) {
        // Phase plane of (c − ankle, ċ). The band heel ≤ x + y/ω ≤ toe is "ξ on the foot".
        const bx = nar ? 58 : 470, by = nar ? 344 : 30, bw = nar ? W - 80 : 176, bh = nar ? 130 : 176;
        const rx = Math.max(0.3, 1.8 * Math.max(-heel, toe)), ry = Math.max(0.8, rx * w * 1.1);
        const PX = (x) => bx + ((x + rx) / (2 * rx)) * bw, PY = (y) => by + bh - ((y + ry) / (2 * ry)) * bh;
        defs.append(s("clipPath", { id: clipB }, s("rect", { x: bx, y: by, width: bw, height: bh })));
        const pg = s("g", { "clip-path": `url(#${clipB})` });
        svg.append(pg);
        const band = [[heel - ry / w, ry], [toe - ry / w, ry], [toe + ry / w, -ry], [heel + ry / w, -ry]];
        // Colours as in the `phase` widget: the stable line (ξ = p) is green; the band where
        // ξ is on the foot takes the DCM's blue.
        pg.append(s("path", { d: band.map(([x, y], i) => `${i ? "L" : "M"}${PX(x).toFixed(1)},${PY(y).toFixed(1)}`).join("") + "Z", fill: C.v1, "fill-opacity": 0.13, stroke: C.v1, "stroke-opacity": 0.45 }));
        pg.append(ln(PX(-rx), PY(0), PX(rx), PY(0), C.border2, 1));
        pg.append(ln(PX(0), PY(-ry), PX(0), PY(ry), C.border2, 1));
        const pr = B.p - B.ankle; // the line ξ = p for the current ZMP: ċ = −ω₀(c − p)
        pg.append(ln(PX(pr - ry / w), PY(ry), PX(pr + ry / w), PY(-ry), C.v2, 2, { "stroke-dasharray": "6 4" }));
        if (B.trace.length > 1) pg.append(s("path", { d: B.trace.map(([x, y], i) => `${i ? "L" : "M"}${PX(x).toFixed(1)},${PY(y).toFixed(1)}`).join(""), fill: "none", stroke: C.v3, "stroke-width": 2 }));
        pg.append(s("circle", { cx: PX(B.c - B.ankle), cy: PY(B.cd), r: 4.5, fill: C.v3 }));
        svg.append(s("rect", { x: bx, y: by, width: bw, height: bh, fill: "none", stroke: C.border2 }));
        svg.append(txt(bx, by - 8, L("phase plane", "相平面"), { fill: C.fg2, size: 12.5, weight: 700 }));
        svg.append(txt(bx + bw, by - 8, L("↑ ċ (m/s)", "↑ ċ（m/s）"), { fill: C.muted, size: 12, anchor: "end" }));
        for (const v of [ry, 0, -ry]) svg.append(txt(bx - 5, PY(v) + 4, n(v, 1), { fill: C.muted, size: 11, anchor: "end", weight: 400 }));
        svg.append(txt(bx, by + bh + 14, n(-rx, 2), { fill: C.muted, size: 11, weight: 400 }));
        svg.append(txt(bx + bw / 2, by + bh + 14, "0", { fill: C.muted, size: 11, anchor: "middle", weight: 400 }));
        svg.append(txt(bx + bw, by + bh + 14, n(rx, 2), { fill: C.muted, size: 11, anchor: "end", weight: 400 }));
        svg.append(txt(bx + bw / 2, by + bh + 30, L("c − ankle (m) →", "c − 踝（m）→"), { fill: C.muted, size: 12, anchor: "middle" }));
        svg.append(txt(bx, by + bh + 48, L("blue band: ξ on the foot", "蓝带：ξ 在脚掌内"), { fill: C.v1, size: 12 }));
        svg.append(txt(bx, by + bh + 64, L("green dashed: ξ = p", "绿虚线：ξ = p"), { fill: C.v2, size: 12 }));
        svg.append(txt(bx, by + bh + 80, L("(the CoM comes to rest)", "（质心能停下）"), { fill: C.muted, size: 12, weight: 400 }));
      }
      const rel = (x) => n(x - B.ankle, 3);
      const fallTxt = control === "none"
        ? L("No controller: $\\xi \\ne p$, so the CoM ran away from the ZMP exponentially (leg past 35°). Press reset.", "无控制：$\\xi \\ne p$，质心按指数离开 ZMP（腿倾角超过 35°）。点“重置”。")
        : L("The DCM left the foot, the ZMP saturated at the edge, and the CoM ran away (leg past 35°). Press reset.", "DCM 离开了脚掌，ZMP 卡在边缘，质心跑掉了（腿倾角超过 35°）。点“重置”。");
      let why;
      if (B.fell) why = fallTxt;
      else if (B.swing) why = L(`The DCM left the foot, so the robot steps: the new foot is centred where $\\xi$ will be at touchdown, $p + (\\xi - p)\\,e^{\\omega_0 T}$ with $T$ = ${B.swing.T} s.`, `DCM 离开了脚掌，于是迈步：新脚掌的中心放在着地时刻 $\\xi$ 将到达的位置 $p + (\\xi - p)\\,e^{\\omega_0 T}$，$T$ = ${B.swing.T} s。`);
      else if (control === "none") why = L("No controller: the ZMP stays where the slider puts it, and the CoM runs away from it exponentially unless $\\xi = p$ exactly.", "无控制：ZMP 停在滑块设定的位置，除非恰好 $\\xi = p$，质心会按指数离它而去。");
      else if (inside) why = L("The DCM is on the foot: the ankle can put the ZMP beyond it, so ξ moves back and the CoM comes to rest over the foot.", "DCM 在脚掌内：踝关节能把 ZMP 放到它外侧，于是 ξ 往回走，质心停在脚掌上方。");
      else why = control === "step" ? L("The DCM is off the foot: no ZMP on this sole can stop it — a step is coming.", "DCM 在脚掌外：这只脚上的任何 ZMP 都拦不住它——马上迈步。") : L("The DCM is off the foot: even with the ZMP at the edge, ξ keeps moving away — the ankles alone cannot stop this (try “ankle + step”).", "DCM 在脚掌外：ZMP 已经顶到边缘，ξ 仍在远离——光靠踝关节拦不住（试试“踝 + 迈步”）。");
      const atRest = !B.fell && settledB() && Math.abs(B.c - mid) < 1e-6;
      capSet(cp, `$\\omega_0 = \\sqrt{g_0/z_0}$ = ${n(w)} s⁻¹ ($1/\\omega_0$ = ${n(1 / w)} s) · ${L("from the ankle", "相对踝关节")}: $c$ = ${rel(B.c)} m, $\\dot c$ = ${n(B.cd)} m/s, $p$ = ${rel(B.p)} m, $\\xi = c + \\dot c/\\omega_0$ = ${rel(xi)} m · ${L("sole", "脚掌")} [${n(heel)}, ${n(toe)}] m`, why,
        atRest ? hint(L(`Press Play (a push of ${n(push0 || push)} m/s) or push ◀ / ▶.`, `按“播放”（推一下 ${n(push0 || push)} m/s），或按 ◀ / ▶ 推。`)) : null);
    }

    // ---------------------------------------------------------------- walk
    // DCM footstep placement: ξ(t) = p + (ξ₀ − p)e^{ωt}; next foot p⁺ = ξ_end − b, b = L/(e^{ωT} − 1).
    const Wk = {};
    const bOff = () => (speed * Ts) / (Math.exp(om() * Ts) - 1);
    function resetW() {
      const w = om(), Ls = speed * Ts, b = bOff();
      const alpha = Ls > 0 ? -(Ls / 2) / (1 - Math.exp(-w * Ts)) : 0; // start on the periodic gait
      Object.assign(Wk, { p: 0, t: 0, k: 0, time: 0, xi: b + push0 / w, c: alpha + b / 2, feet: [{ x: -Ls, side: 1 }, { x: 0, side: 0 }], hist: [], pushed: push0 ? 2 : 0, last: -1 });
    }
    resetW();
    const nextFoot = () => Wk.p + (Wk.xi - Wk.p) * Math.exp(om() * Math.max(0, Ts - Wk.t)) - bOff();
    function stepW(dt) {
      const w = om(), d = Wk.xi - Wk.p, a0 = Wk.c - Wk.p - d / 2, e1 = Math.exp(w * dt), e2 = Math.exp(-w * dt);
      Wk.xi = Wk.p + d * e1;
      Wk.c = Wk.p + a0 * e2 + (d / 2) * e1; // exact: ċ = −ω(c − ξ)
      Wk.t += dt; Wk.time += dt;
      if (Wk.t >= Ts) {
        const np = Wk.xi - bOff();
        Wk.feet.push({ x: np, side: 1 - Wk.feet[Wk.feet.length - 1].side });
        if (Wk.feet.length > 12) Wk.feet.shift();
        Wk.p = np; Wk.t -= Ts; Wk.k++;
        if (Wk.pushed > 0) Wk.pushed--;
      }
      if (Wk.time - Wk.last >= 1 / 60) {
        Wk.hist.push([Wk.time, Wk.c, Wk.p, Wk.xi]); Wk.last = Wk.time;
        while (Wk.hist.length && Wk.hist[0][0] < Wk.time - 4.2) Wk.hist.shift();
      }
    }
    function drawWalk(C) {
      const nar = narrowOf(stage);
      W = nar ? 400 : 660; H = 380;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const k = 140 / Math.max(z0, 0.8), gy = 178, cx = W * 0.42;
      const X = (x) => cx + (x - Wk.c) * k;
      const w = om(), b = bOff(), nf = nextFoot();
      const defs = s("defs", {}, s("clipPath", { id: clipA }, s("rect", { x: 0, y: 0, width: W, height: 205 })));
      svg.append(defs);
      const g = s("g", { "clip-path": `url(#${clipA})` });
      svg.append(g);
      ground(g, 0, W, gy, C.faint);
      const sideC = (sd) => (sd ? C.v6 : C.v5);
      const cur = Wk.feet[Wk.feet.length - 1], prev = Wk.feet[Wk.feet.length - 2];
      for (const f of Wk.feet) {
        if (f === prev) continue; // that one is the swing foot now
        g.append(s("rect", { x: X(f.x + heel), y: gy - 8, width: (toe - heel) * k, height: 8, rx: 2.5, fill: sideC(f.side), "fill-opacity": f === cur ? 0.85 : 0.22 }));
      }
      const nside = 1 - cur.side;
      g.append(s("rect", { x: X(nf + heel), y: gy - 8, width: (toe - heel) * k, height: 8, rx: 2.5, fill: "none", stroke: sideC(nside), "stroke-dasharray": "4 3", "stroke-width": 1.6 }));
      const u = clamp(Wk.t / Ts, 0, 1), sm = u * u * (3 - 2 * u);
      const from = prev ? prev.x : Wk.p - speed * Ts, sw = from + (nf - from) * sm, lift = Math.sin(Math.PI * u) * 0.07 * k;
      const comY = gy - z0 * k;
      g.append(ln(X(Wk.c), comY, X(sw), gy - 8 - lift, C.faint, 3, { "stroke-linecap": "round" }));
      g.append(s("rect", { x: X(sw + heel), y: gy - 8 - lift, width: (toe - heel) * k, height: 8, rx: 2.5, fill: sideC(nside), "fill-opacity": 0.75 }));
      g.append(ln(X(Wk.p), gy - 2, X(Wk.c), comY, C.fg2, 4, { "stroke-linecap": "round" }));
      g.append(s("circle", { cx: X(Wk.c), cy: comY, r: 12, fill: C.v3, stroke: C.surface, "stroke-width": 2 }));
      g.append(tri(X(Wk.p), gy - 1, 6.5, C.v4));
      g.append(diamond(X(Wk.xi), gy, 6.5, C.v1, "none"));
      g.append(txt(10, 22, L(`step ${Wk.k} · next foot (dashed) = $\\xi_{\\mathrm{end}} - b$`, `第 ${Wk.k} 步 · 下一步落脚（虚线）= $\\xi_{\\mathrm{end}} - b$`), { fill: Wk.pushed ? C.v1 : C.fg2, size: 13.5, weight: 700 }));
      // legend + time strip
      const lg = [[L("CoM c", "质心 c"), C.v3], [L("ZMP p", "ZMP p"), C.v4], [L("DCM ξ (dashed)", "DCM ξ（虚线）"), C.v1]];
      let lxp = 46;
      for (const [t, c] of lg) { svg.append(txt(lxp, 202, t, { fill: c, size: 12.5, weight: 700 })); lxp += (nar ? 112 : 150); }
      // At rest the strip shows the next 4 s as planned (computed on a copy of the state).
      let rows = Wk.hist, preview = false;
      if (rows.length <= 1) {
        const save = JSON.stringify(Wk);
        for (let i = 0; i < 4 * 240; i++) stepW(1 / 240);
        rows = Wk.hist; preview = true;
        Object.assign(Wk, JSON.parse(save));
      }
      const t1 = preview ? 4 : Math.max(4, Wk.time), t0 = t1 - 4;
      let lo = Infinity, hi = -Infinity;
      for (const r of rows) for (let i = 1; i < 4; i++) { lo = Math.min(lo, r[i]); hi = Math.max(hi, r[i]); }
      if (!(hi - lo >= 0.4)) { const m = isFinite(hi + lo) ? (hi + lo) / 2 : 0; lo = m - 0.2; hi = m + 0.2; }
      const pad = (hi - lo) * 0.08;
      const { X: TX, Y: TY } = axes(svg, W, H, { l: 46, r: 12, t: 214, b: 34 }, [t0, t1], [lo - pad, hi + pad], L("time (s)", "时间（s）"), "$c, p, \\xi$ (m)");
      const shown = rows.filter((r) => r[0] >= t0);
      const path = (i) => shown.map((r, j) => `${j ? "L" : "M"}${TX(r[0]).toFixed(1)},${TY(r[i]).toFixed(1)}`).join("");
      const op = preview ? 0.6 : 1;
      svg.append(s("path", { d: path(2), class: "curve", stroke: C.v4, "stroke-opacity": op }));
      svg.append(s("path", { d: path(1), class: "curve", stroke: C.v3, "stroke-opacity": op }));
      svg.append(s("path", { d: path(3), class: "curve dashed", stroke: C.v1, "stroke-opacity": op }));
      if (preview) svg.append(txt(W - 10, nar ? 42 : 22, L("strip: the next 4 s as planned", "下图：接下来 4 s 的规划"), { fill: C.muted, size: 12, anchor: "end" }));
      const E = Math.exp(w * Ts);
      capSet(cp, `$\\omega_0$ = ${n(w)} s⁻¹ · $T$ = ${n(Ts)} s · ${L("step length", "步长")} $L = vT$ = ${n(speed * Ts)} m · $b = L/(e^{\\omega_0 T} - 1)$ = ${n(speed * Ts)}/${n(E - 1)} = ${n(b, 3)} m · $\\xi - p$ = ${n(Wk.xi - Wk.p, 3)} m`,
        Wk.pushed ? L("A push moved $\\xi$; the next foot (dashed) moved with it, so one step absorbs the push and the gait is back on its cycle.", "一次推扰改变了 $\\xi$；下一步的落脚点（虚线）跟着移动，一步就把推扰吸收掉，步态回到原来的周期。")
          : L("The ZMP sits on the stance foot; the DCM runs ahead of it, and each new foot goes $b$ behind where $\\xi$ will be at the end of the step — so every step starts with $\\xi$ exactly $b$ in front of the foot. Forward direction only (no sideways sway).", "ZMP 在支撑脚上；DCM 跑在它前面。每一步的落脚点放在本步结束时 $\\xi$ 所在位置之后 $b$ 处——所以每一步开始时 $\\xi$ 都恰好在脚前方 $b$。只画前进方向（不画左右摆动）。"));
    }

    // ---------------------------------------------------------------- cart–table
    const Cs = { tilt: 0 };
    const zmpCart = () => cartX - (z0 * accel) / G;
    const tiltTarget = () => { const p = zmpCart(); return p > toe ? 16 : p < heel ? -16 : 0; };
    function drawCart(C) {
      const nar = narrowOf(stage);
      W = nar ? 400 : 660; H = 318;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const k = 200 / Math.max(z0, 0.8), gy = 262, cx = W / 2;
      const X = (x) => cx + x * k, Y = (z) => gy - z * k;
      const p = zmpCart(), inside = p >= heel - 1e-9 && p <= toe + 1e-9, good = inside ? C.v2 : C.v4;
      ground(svg, 0, W, gy, C.faint);
      svg.append(ln(X(heel), gy + 1, X(toe), gy + 1, good, 5, { "stroke-opacity": 0.7 }));
      const pivot = Cs.tilt > 0 ? toe : heel;
      const g = s("g", { transform: `rotate(${Cs.tilt.toFixed(2)} ${X(pivot).toFixed(1)} ${gy})` });
      svg.append(g);
      const halfTop = Math.min(0.5, (W / 2 - 20) / k);
      g.append(s("rect", { x: X(heel), y: gy - 8, width: (toe - heel) * k, height: 8, rx: 2, fill: C.fg2 }));
      g.append(s("rect", { x: X(0) - 5, y: Y(z0) + 4, width: 10, height: z0 * k - 12, fill: C.border2, stroke: C.faint }));
      g.append(s("rect", { x: X(-halfTop), y: Y(z0) - 2, width: 2 * halfTop * k, height: 7, rx: 2, fill: C.fg2 }));
      const cw = 0.09 * k, chh = 0.07 * k, top = Y(z0) - 2;
      g.append(s("rect", { x: X(cartX) - cw, y: top - chh - 7, width: 2 * cw, height: chh, rx: 4, fill: C.v3 }));
      g.append(s("circle", { cx: X(cartX) - cw * 0.55, cy: top - 4, r: 4, fill: C.fg2 }));
      g.append(s("circle", { cx: X(cartX) + cw * 0.55, cy: top - 4, r: 4, fill: C.fg2 }));
      const ay = top - chh - 22;
      if (Math.abs(accel) > 0.05) g.append(arrow(X(cartX), ay, X(cartX) + clamp(accel * 14, -150, 150), ay, C.v3, 3));
      g.append(txt(X(cartX), ay - 10, `$\\ddot c$ = ${n(accel, 1)} m/s²`, { fill: C.v3, anchor: "middle" }));
      // the line of the total ground force runs from the ZMP through the cart's mass
      svg.append(ln(X(p), gy, X(cartX), top - chh / 2 - 7, good, 1.6, { "stroke-dasharray": "5 4" }));
      svg.append(tri(clamp(X(p), 8, W - 8), gy - 1, 8, good));
      svg.append(txt(clamp(X(p), 40, W - 40), gy + 26, L("ZMP p", "ZMP p"), { fill: good, anchor: "middle", weight: 700 }));
      svg.append(txt(clamp(X(mid), 50, W - 50), gy + 46, L("table foot (support)", "桌脚（支撑区）"), { fill: C.muted, anchor: "middle", size: 12 }));
      svg.append(txt(10, 22, inside ? L("ZMP inside the foot: the table stands", "ZMP 在桌脚内：桌子站得住") : L("ZMP outside the foot: the table tips", "ZMP 超出桌脚：桌子翻倒"), { fill: good, size: 14, weight: 700 }));
      capSet(cp, `$p = c - (z_0/g_0)\\,\\ddot c$ = ${n(cartX)} − (${n(z0)}/9.81)·${np(accel, 1)} = ${n(p, 3)} m · ${L("foot", "桌脚")} [${n(heel)}, ${n(toe)}] m · ${L("accelerations that keep the table standing", "桌子不倒允许的加速度范围")}: ${n((G * (cartX - toe)) / z0, 1)} ≤ $\\ddot c$ ≤ ${n((G * (cartX - heel)) / z0, 1)} m/s²`,
        L("All the mass sits in the cart at height z₀; the massless table stands on a small foot. Speeding up pushes the ZMP back, braking pushes it forward; once it would have to leave the foot, the table tips about that edge. A wheeled base braking too hard is the same picture: the ZMP runs past the front wheels and the robot pitches forward.",
          "全部质量都在高 z₀ 的小车里，没有质量的桌子立在一个小桌脚上。加速把 ZMP 往后推，刹车把它往前推；一旦它必须离开桌脚，桌子就绕那条边翻倒。轮式底盘刹车太猛也是同一幅图：ZMP 跑到前轮之外，机器人向前栽。"));
    }

    // ---------------------------------------------------------------- loop and controls
    let play = null;
    const an = animator(root, (dt) => {
      const hstep = dt * rate, N = Math.max(1, Math.ceil(hstep * 480));
      if (mode === "balance") {
        for (let i = 0; i < N; i++) stepB(hstep / N);
        B.cam += (B.ankle - B.cam) * Math.min(1, dt * 3);
        B.trace.push([B.c - B.ankle, B.cd]);
        if (B.trace.length > 600) B.trace.shift();
        draw();
        return !B.fell && !settledB();
      }
      if (mode === "walk") { for (let i = 0; i < N; i++) stepW(hstep / N); draw(); return true; }
      const tgt = tiltTarget(), sp = 60 * dt;
      if (tgt !== 0 && Math.sign(Cs.tilt) === -Math.sign(tgt)) Cs.tilt = Math.abs(Cs.tilt) <= sp ? 0 : Cs.tilt - Math.sign(Cs.tilt) * sp;
      else Cs.tilt = Math.abs(tgt - Cs.tilt) <= sp ? tgt : Cs.tilt + Math.sign(tgt - Cs.tilt) * sp;
      draw();
      return Cs.tilt !== tgt;
    });
    const run = () => { an.start(); if (play && mode !== "cart") play.textContent = "❚❚ " + T().pause; };
    function draw() {
      svg.innerHTML = "";
      const C = colors();
      if (mode === "balance") drawBalance(C);
      else if (mode === "walk") drawWalk(C);
      else drawCart(C);
    }
    const box = h("div", { class: "viz-ctrls", style: "margin-top:0;flex:1 1 100%" });
    function buildCtrls() {
      box.innerHTML = "";
      // Play from rest in balance mode applies the push (push0, else push to the right).
      play = playButton(an, () => { if (mode !== "balance") return; if (B.fell) resetB(); if (settledB()) B.cd += push0 || push; });
      const rateSeg = seg([["1", "1×"], ["0.5", L("½× slow", "½× 慢放")]], String(rate), (v) => (rate = +v));
      const zSl = wide(slider(L("CoM height z₀ (m)", "质心高度 z₀（m）"), { min: 0.5, max: 1.2, value: z0, step: 0.05 }, (v) => { z0 = v; if (mode === "cart") run(); else if (!an.on) draw(); }));
      if (mode === "balance") {
        const kick = (sg) => { if (B.fell) return; B.cd += sg * push; run(); };
        box.append(play, btn(L("◀ push", "◀ 推"), () => kick(-1)), btn(L("push ▶", "推 ▶"), () => kick(1)),
          btn(T().reset, () => { an.stop(); play.reset(); resetB(); draw(); }),
          seg([["none", L("no control", "无控制")], ["ankle", L("ankle", "踝关节")], ["step", L("ankle + step", "踝 + 迈步")]], control, (v) => { control = v; buildCtrls(); draw(); if (!B.fell) run(); }));
        if (control === "none") box.append(wide(slider(L("ZMP p (m from ankle)", "ZMP p（相对踝，m）"), { min: heel, max: toe, value: B.pOff, step: 0.005 }, (v) => { B.pOff = v; B.p = zmpB(); run(); })));
        box.append(wide(slider(L("push size (m/s)", "推力大小（m/s）"), { min: 0.05, max: 1.2, value: push, step: 0.05 }, (v) => (push = v))), zSl, rateSeg);
      } else if (mode === "walk") {
        const kick = (sg) => { Wk.xi += (sg * push) / om(); Wk.pushed = 2; run(); };
        box.append(play, btn(L("◀ push", "◀ 推"), () => kick(-1)), btn(L("push ▶", "推 ▶"), () => kick(1)),
          btn(T().reset, () => { an.stop(); play.reset(); resetW(); draw(); }),
          wide(slider(L("speed v (m/s)", "速度 v（m/s）"), { min: 0, max: 1.2, value: speed, step: 0.05 }, (v) => { speed = v; if (!an.on) draw(); })),
          wide(slider(L("step time T (s)", "步周期 T（s）"), { min: 0.3, max: 0.8, value: Ts, step: 0.02 }, (v) => { Ts = v; if (!an.on) draw(); })),
          wide(slider(L("push size (m/s)", "推力大小（m/s）"), { min: 0.05, max: 1.2, value: push, step: 0.05 }, (v) => (push = v))), zSl, rateSeg);
      } else {
        box.append(wide(slider(L("cart acceleration $\\ddot c$ (m/s²)", "小车加速度 $\\ddot c$（m/s²）"), { min: -10, max: 10, value: accel, step: 0.1 }, (v) => { accel = v; run(); })),
          wide(slider(L("cart position $c$ (m)", "小车位置 $c$（m）"), { min: -0.4, max: 0.4, value: cartX, step: 0.01 }, (v) => { cartX = v; run(); })), zSl,
          btn(T().reset, () => { accel = Number(cfg.accel) || 0; cartX = 0; Cs.tilt = 0; buildCtrls(); run(); }));
      }
    }
    ctrls.append(seg([["balance", L("balance & push", "平衡与推扰")], ["walk", L("walking", "行走")], ["cart", L("cart–table", "小车–桌子")]], mode, (v) => {
      an.stop(); mode = v; resetB(); resetW(); Cs.tilt = 0; buildCtrls(); if (mode === "cart") run(); else draw();
    }), box);
    buildCtrls();
    if (mode === "cart") { Cs.tilt = tiltTarget(); }
    draw();
    if (autoplay && mode !== "cart") { if (mode === "balance" && settledB()) B.cd += push0 || push; run(); }
  });

  // ================================================================== contact
  Viz.register("contact", (root, cfg) => {
    const { stage, ctrls, foot } = shell(root, cfg);
    let mode = ["cone", "foot"].includes(cfg.mode) ? cfg.mode : "cone";
    let mu = clamp(Number(cfg.mu) || 0.6, 0.05, 2);
    const f0 = Array.isArray(cfg.force) && cfg.force.length === 2 ? cfg.force.map(Number) : [200, 600];
    let ft = f0[0], fn = f0[1];
    // fmax (N): the force the drawing is scaled for (default 1000 N; small given forces scale down).
    const fGiven = Math.hypot(f0[0], f0[1]);
    const fmax = Number(cfg.fmax) > 0 ? Number(cfg.fmax) : fGiven > 0 && fGiven < 100 ? 10 ** Math.ceil(Math.log10(fGiven * 1.6)) : 1000;
    const fStep = fmax / 200, fDig = fStep >= 1 ? 0 : fStep >= 0.1 ? 1 : 2;
    const fN = (v) => n(Math.round(v / fStep) * fStep, fDig);
    const body = typeof cfg.body === "string" && cfg.body ? cfg.body : null;
    const fc = Array.isArray(cfg.foot) && cfg.foot.length === 2 && +cfg.foot[0] < 0 && +cfg.foot[1] > 0 ? cfg.foot.map(Number) : [-0.08, 0.16];
    const heel = fc[0], toe = fc[1], Lf = toe - heel, mid = (heel + toe) / 2;
    const tau0 = Number(cfg.tau) || 0;
    let Wn = clamp(Number(cfg.weight) || 686.7, 50, 3000), tau = tau0, fh = 0, tilt = 0;
    const svg = s("svg", { class: "viz-svg" });
    svg.style.touchAction = "none";
    svg.style.overflow = "hidden";
    stage.append(svg);
    const cp = cap(foot);
    let W = 660, H = 330, geo = null;

    function drawCone(C) {
      const nar = narrowOf(stage);
      W = nar ? 400 : 660; H = 330;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const gy = 270, cx = nar ? W / 2 : W * 0.42, kf = 200 / fmax; // px per newton
      geo = { gy, cx, kf };
      const beta = Math.atan(mu), R = 215;
      const tx = cx + ft * kf, ty = gy - fn * kf;
      const pull = fn < 0, inside = !pull && Math.abs(ft) <= mu * fn + 1e-9;
      const col = pull ? C.faint : inside ? C.v2 : C.v4;
      // block
      const bw = nar ? 170 : 230;
      svg.append(s("rect", { x: cx - bw / 2, y: gy - 120, width: bw, height: 120, rx: 6, fill: C.surface2, stroke: C.border2, "stroke-width": 1.5 }));
      ground(svg, 0, W, gy, C.faint);
      // the body's name sits under the ground line, clear of the cone edges
      svg.append(txt(cx - bw / 2, gy + 26, "▲ " + (body || L("robot foot / block", "机器人脚 / 方块")), { fill: C.muted, size: 12 }));
      // friction cone: apex at the contact, half-angle atan μ around the normal
      const ex = R * Math.sin(beta), ey = R * Math.cos(beta);
      svg.append(s("path", { d: `M${cx},${gy}L${cx - ex},${gy - ey}L${cx + ex},${gy - ey}Z`, fill: C.v2, "fill-opacity": 0.13 }));
      svg.append(ln(cx, gy, cx - ex, gy - ey, C.v2, 1.6, { "stroke-dasharray": "6 4" }));
      svg.append(ln(cx, gy, cx + ex, gy - ey, C.v2, 1.6, { "stroke-dasharray": "6 4" }));
      const sd = ft >= 0 ? -1 : 1; // draw the half-angle on the side away from the force
      svg.append(s("path", { d: arcPath(cx, gy, 46, Math.PI / 2, Math.PI / 2 - sd * beta), fill: "none", stroke: C.v2, "stroke-width": 1.4 }));
      svg.append(txt(cx + sd * (46 * Math.sin(beta) + 8), gy - 14, `atan μ = ${(beta / DEG).toFixed(0)}°`, { fill: C.v2, size: 12, anchor: sd > 0 ? "start" : "end" }));
      svg.append(txt(cx + ex + 6, gy - ey + 4, L("friction cone", "摩擦锥"), { fill: C.v2, size: 12.5, weight: 700 }));
      // components
      if (!pull) {
        svg.append(ln(cx, gy, cx, ty, C.muted, 1.4, { "stroke-dasharray": "4 3" }));
        svg.append(ln(cx, ty, tx, ty, C.muted, 1.4, { "stroke-dasharray": "4 3" }));
        // component labels: f_n beside the vertical, f_t on the side of the horizontal away from the tip
        if (Math.abs(gy - ty) > 24) svg.append(txt(cx + (ft >= 0 ? -6 : 6), (gy + ty) / 2 + 4, "$f_n$", { fill: C.muted, anchor: ft >= 0 ? "end" : "start", size: 13 }));
        if (Math.abs(tx - cx) > 34) svg.append(txt(cx + (tx - cx) * 0.4, ty - 7, "$f_t$", { fill: C.muted, anchor: "middle", size: 13 }));
      }
      if (!pull && !inside) {
        // what the ground can actually supply while sliding: the cone edge
        const mx = cx + Math.sign(ft) * mu * fn * kf;
        svg.append(arrow(cx, gy, mx, ty, C.v2, 2.4, 8, { "stroke-dasharray": "6 4" }));
        svg.append(txt(mx + Math.sign(ft) * 6, ty + 16, L("max: $\\mu f_n$", "最多：$\\mu f_n$"), { fill: C.v2, anchor: Math.sign(ft) > 0 ? "start" : "end", size: 12 }));
      }
      if (Math.hypot(tx - cx, ty - gy) > 6) svg.append(arrow(cx, gy, tx, ty, col, 4, 11));
      svg.append(s("circle", { cx: tx, cy: ty, r: 10, fill: col, "fill-opacity": 0.25, stroke: col, "stroke-width": 2 }));
      svg.append(s("circle", { cx, cy: gy, r: 4.5, fill: C.fg }));
      svg.append(txt(tx + (ft >= 0 ? 15 : -15), ty - 13, "f", { fill: col, size: 15, weight: 700, anchor: ft >= 0 ? "start" : "end" }));
      const st = pull ? L("$f_n < 0$: the ground cannot pull", "$f_n < 0$：地面不能往下拉") : inside ? L("inside the cone: the contact sticks", "在锥内：接触点不打滑") : L("outside the cone: the contact slips", "在锥外：接触点打滑");
      svg.append(txt(10, 22, st, { fill: col, size: 14, weight: 700 }));
      svg.append(txt(10, 42, L("drag the tip of f", "拖动力 f 的箭头尖"), { fill: C.muted, size: 12 }));
      const ratio = fn > 0 ? Math.abs(ft) / fn : Infinity;
      capSet(cp, `$f_n$ = ${fN(fn)} N, $f_t$ = ${fN(ft)} N · $|f_t|/f_n$ = ${isFinite(ratio) ? n(ratio) : "—"} ${inside ? "≤" : ">"} $\\mu$ = ${n(mu)} · ${L("half-angle", "半角")} $\\arctan\\mu$ = ${(beta / DEG).toFixed(1)}°`,
        pull ? L("A foot on the ground can only be pushed, never pulled: $f_n \\ge 0$ is the first contact constraint.", "地面只能推脚，不能拉脚：$f_n \\ge 0$ 是第一条接触约束。")
          : inside ? L("The tangential part is at most $\\mu$ times the normal part, so static friction can supply it and the contact holds.", "切向分量不超过法向分量的 $\\mu$ 倍，静摩擦给得起，接触保持不动。")
            : L(`Friction can supply at most $\\mu f_n$ = ${fN(mu * fn)} N sideways; asking for ${fN(Math.abs(ft))} N makes the contact slide. In 3-D the cone is round; QP controllers often use a 4-sided pyramid inside it.`, `摩擦最多只能提供 $\\mu f_n$ = ${fN(mu * fn)} N 的侧向力；要 ${fN(Math.abs(ft))} N 接触点就会滑。三维里摩擦锥是圆锥；QP 控制器常用锥内的四棱锥来近似。`));
    }

    function pressure(sp) {
      // Linear pressure on the sole with resultant Wn at sp. Returns { kind, a, b, fn(u) }.
      const d = Math.min(sp - heel, toe - sp);
      if (d <= 1e-6) return { kind: "edge", a: sp, b: sp, at: clamp(sp, heel, toe) };
      if (Math.abs(sp - mid) <= Lf / 6) return { kind: "trap", a: heel, b: toe, f: (u) => (Wn / Lf) * (1 + (12 * (sp - mid) * (u - mid)) / (Lf * Lf)) };
      if (sp > mid) { const a = toe - 3 * d; return { kind: "tri", a, b: toe, f: (u) => (u < a ? 0 : ((2 * Wn) / (3 * d)) * ((u - a) / (3 * d))) }; }
      const b = heel + 3 * d;
      return { kind: "tri", a: heel, b, f: (u) => (u > b ? 0 : ((2 * Wn) / (3 * d)) * ((b - u) / (3 * d))) };
    }
    const copOf = () => tau / Wn;
    // CoP past the toe: the foot rolls about the toe, heel up (clockwise on screen, +);
    // past the heel: it rolls about the heel, toe up (−).
    const tiltTarget = () => { const sp = copOf(); return sp > toe + 1e-9 ? 12 : sp < heel - 1e-9 ? -12 : 0; };
    function drawFoot(C) {
      const nar = narrowOf(stage);
      W = nar ? 400 : 660; H = 340;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const k = (nar ? 300 : 400) / Math.max(Lf, 0.15), gy = 200;
      const cx = W / 2 - mid * k, X = (x) => cx + x * k;
      const sRaw = copOf(), sp = clamp(sRaw, heel, toe), pr = pressure(sp);
      const atEdge = pr.kind === "edge";
      const slip = Math.abs(fh) > mu * Wn;
      ground(svg, 0, W, gy, C.faint);
      // the foot (sole + upper + shin), tilted about the edge while tipping
      const pivot = tilt > 0 ? toe : heel;
      const g = s("g", { transform: `rotate(${tilt.toFixed(2)} ${X(pivot).toFixed(1)} ${gy})` });
      svg.append(g);
      const ay = gy - 62;
      g.append(s("path", { d: `M${X(heel)},${gy}L${X(toe)},${gy}L${X(toe)},${gy - 12}Q${X(toe - 0.03)},${gy - 30} ${X(0.04)},${gy - 46}L${X(0.025)},${ay}L${X(-0.03)},${ay}L${X(heel)},${gy - 26}Z`, fill: C.surface2, stroke: C.fg2, "stroke-width": 2, "stroke-linejoin": "round" }));
      g.append(ln(X(0), ay, X(0), 18, C.fg2, 12, { "stroke-linecap": "round" }));
      g.append(s("circle", { cx: X(0), cy: ay, r: 8, fill: C.surface, stroke: C.v1, "stroke-width": 3 }));
      if (Math.abs(tau) > 0.5) {
        // positive τ presses the toe down and moves the CoP forward: clockwise on screen
        const a0 = tau > 0 ? Math.PI * 0.85 : Math.PI * 0.15, a1 = tau > 0 ? Math.PI * 0.15 : Math.PI * 0.85, e0 = a1 + (tau > 0 ? 0.3 : -0.3);
        g.append(s("path", { d: arcPath(X(0), ay, 24, a0, a1), fill: "none", stroke: C.v5, "stroke-width": 2.4 }));
        g.append(arrow(X(0) + 24 * Math.cos(e0), ay - 24 * Math.sin(e0), X(0) + 24 * Math.cos(a1), ay - 24 * Math.sin(a1), C.v5, 2.4, 7));
      }
      g.append(txt(X(0) + 32, ay - 12, `τ = ${n(tau, 0)} N·m`, { fill: C.v5, size: 12.5 }));
      // pressure distribution under the sole (arrows push up on it)
      const kp = 34 / (Wn / Lf); // px per (N/m) — the uniform case is 34 px tall
      if (!atEdge && tilt === 0) {
        const N = 26, pts = [];
        for (let i = 0; i <= N; i++) { const u = heel + (Lf * i) / N; pts.push([u, Math.min(110, pr.f(u) * kp)]); }
        svg.append(s("path", { d: `M${X(heel)},${gy}` + pts.map(([u, v]) => `L${X(u).toFixed(1)},${(gy + v).toFixed(1)}`).join("") + `L${X(toe)},${gy}Z`, fill: C.v1, "fill-opacity": 0.14, stroke: C.v1, "stroke-width": 1.4 }));
        for (let i = 1; i < N; i += 2) { const [u, v] = pts[i]; if (v > 5) svg.append(arrow(X(u), gy + v, X(u), gy + 2, C.v1, 1.5, 5)); }
      }
      const sx = X(atEdge || tilt !== 0 ? (sRaw > mid ? toe : heel) : sp);
      svg.append(arrow(sx, gy + 118, sx, gy + 3, C.v4, 3.6, 10));
      svg.append(txt(sx + 8, gy + 112, L("W at the CoP", "W 作用在 CoP"), { fill: C.v4, size: 12.5, weight: 700 }));
      if (Math.abs(fh) > 2) {
        const len = clamp((fh / Wn) * 160, -170, 170);
        svg.append(arrow(sx, gy + 8, sx + len, gy + 8, slip ? C.v4 : C.v3, 3, 9));
        svg.append(txt(sx + len + (len > 0 ? 6 : -6), gy + 24, `$f_t$ = ${n(fh, 0)} N`, { fill: slip ? C.v4 : C.v3, size: 12, anchor: len > 0 ? "start" : "end" }));
      }
      svg.append(tri(sx, gy - 1, 6.5, C.v4));
      // sole extent ticks
      for (const [u, lab] of [[heel, L("heel", "脚跟")], [toe, L("toe", "脚尖")]]) g.append(txt(X(u), gy - (u === toe ? 18 : 32) - 4, lab, { fill: C.muted, size: 12, anchor: "middle" }));
      let st, stc;
      if (tilt !== 0 || atEdge) { st = L("CoP at the edge: the foot tips", "CoP 到了边缘：脚掌翻转"); stc = C.v4; }
      else if (pr.kind === "tri") { st = L("part of the sole is unloaded", "脚掌一部分已经不受力"); stc = C.v3; }
      else { st = L("the whole sole is pressed", "整个脚掌都在受压"); stc = C.v2; }
      svg.append(txt(10, 22, st, { fill: stc, size: 14, weight: 700 }));
      if (slip) svg.append(txt(10, 42, L(`$|f_t| > \\mu W$ = ${n(mu * Wn, 0)} N: the foot slides`, `$|f_t| > \\mu W$ = ${n(mu * Wn, 0)} N：脚会滑`), { fill: C.v4, size: 12.5, weight: 700 }));
      const d = Math.min(sp - heel, toe - sp);
      const shape = atEdge || tilt !== 0 ? L("all the load on the edge", "全部载荷压在边缘") : pr.kind === "trap" ? L(`trapezoid (|s − mid| = ${n(Math.abs(sp - mid), 3)} ≤ L/6 = ${n(Lf / 6, 3)} m)`, `梯形（|s − 中点| = ${n(Math.abs(sp - mid), 3)} ≤ L/6 = ${n(Lf / 6, 3)} m）`) : L(`triangle over 3d = ${n(3 * d, 3)} m (d = distance to the nearer edge)`, `三角形，长度 3d = ${n(3 * d, 3)} m（d = 到较近边缘的距离）`);
      capSet(cp, `CoP $s = \\tau/W$ = ${n(tau, 0)}/${n(Wn, 0)} = ${n(sRaw, 3)} m ${L("from the ankle", "（相对踝关节）")} · ${L("sole", "脚掌")} [${n(heel)}, ${n(toe)}] m · ${L("pressure", "压力分布")}: ${shape}`,
        (tilt !== 0 || atEdge ? L("The CoP cannot leave the sole: once it reaches the edge, extra ankle torque no longer moves it — it rotates the whole foot about that edge.", "CoP 不能离开脚掌：一旦到了边缘，再加踝力矩也推不动它，只会让整只脚绕这条边转起来。")
          : L("The ground pushes on every point of the sole; the CoP is where that spread-out push acts as one force. Ankle torque slides the CoP forward or back, but only within the sole.", "地面推着脚底的每一点；CoP 就是这些分散推力合成一个力的作用点。踝力矩能让 CoP 前后移动，但只能在脚掌范围内。")));
    }

    const an = animator(root, (dt) => {
      const tgt = mode === "foot" ? tiltTarget() : 0, sp = 50 * dt;
      tilt = Math.abs(tgt - tilt) <= sp ? tgt : tilt + Math.sign(tgt - tilt) * sp;
      draw();
      return tilt !== tgt;
    });
    function draw() { svg.innerHTML = ""; const C = colors(); if (mode === "cone") drawCone(C); else drawFoot(C); }
    let drag = false;
    const setF = (ev) => {
      if (mode !== "cone" || !geo) return;
      const [x, y] = toView(svg, ev, W, H);
      let a = (x - geo.cx) / geo.kf, b = (geo.gy - y) / geo.kf;
      const m = Math.hypot(a, b), mx = 1.3 * fmax; if (m > mx) { a *= mx / m; b *= mx / m; }
      ft = Math.round(a / fStep) * fStep; fn = Math.round(b / fStep) * fStep; draw();
    };
    svg.addEventListener("pointerdown", (ev) => { if (mode !== "cone") return; drag = true; svg.setPointerCapture(ev.pointerId); setF(ev); ev.preventDefault(); });
    svg.addEventListener("pointermove", (ev) => { if (drag) setF(ev); });
    svg.addEventListener("pointerup", () => (drag = false));
    svg.addEventListener("pointercancel", () => (drag = false));
    const box = h("div", { class: "viz-ctrls", style: "margin-top:0;flex:1 1 100%" });
    function buildCtrls() {
      box.innerHTML = "";
      const muSl = wide(slider(L("friction μ", "摩擦系数 μ"), { min: 0.1, max: 1.5, value: mu, step: 0.05 }, (v) => { mu = v; draw(); }));
      if (mode === "cone") box.append(muSl, btn(T().reset, () => { ft = f0[0]; fn = f0[1]; mu = clamp(Number(cfg.mu) || 0.6, 0.05, 2); buildCtrls(); draw(); }));
      else {
        const tmax = Math.ceil((Wn * Math.max(-heel, toe) * 1.35) / 5) * 5;
        box.append(wide(slider(L("ankle torque τ (N·m)", "踝力矩 τ（N·m）"), { min: -tmax, max: tmax, value: tau, step: 1 }, (v) => { tau = v; an.start(); draw(); })),
          wide(slider(L("horizontal force $f_t$ (N)", "水平力 $f_t$（N）"), { min: -Math.round(mu * Wn * 1.6), max: Math.round(mu * Wn * 1.6), value: fh, step: 5 }, (v) => { fh = v; draw(); })),
          wide(slider(L("load W (N)", "载荷 W（N）"), { min: 100, max: 1500, value: Wn, step: 10 }, (v) => { Wn = v; an.start(); draw(); })),
          muSl, btn(T().reset, () => { tau = tau0; fh = 0; Wn = clamp(Number(cfg.weight) || 686.7, 50, 3000); tilt = 0; buildCtrls(); draw(); }));
      }
    }
    ctrls.append(seg([["cone", L("friction cone", "摩擦锥")], ["foot", L("CoP under a foot", "脚底 CoP")]], mode, (v) => { mode = v; tilt = 0; buildCtrls(); draw(); }), box);
    buildCtrls();
    if (mode === "foot") tilt = tiltTarget();
    draw();
  });

  // ================================================================== vec2
  Viz.register("vec2", (root, cfg) => {
    const { stage, ctrls, foot } = shell(root, cfg);
    const MODES = ["sum", "dot", "project", "cross", "torque"];
    let mode = MODES.includes(cfg.mode) ? cfg.mode : "dot";
    const ok = (v) => Array.isArray(v) && v.length === 2 && v.every((x) => isFinite(+x));
    const a0 = ok(cfg.a) ? cfg.a.map(Number) : mode === "torque" ? [3, 0] : [3, 1];
    const b0 = ok(cfg.b) ? cfg.b.map(Number) : mode === "torque" ? [0.5, 2] : [1, 2];
    let a = a0.slice(), b = b0.slice();
    // View: `range` = half-height in vector units. Without it the grid is 1 unit per cell as
    // before, unless every vector is shorter than 1, then the view zooms in to fit them.
    const niceUp = (v) => { const m = 10 ** Math.floor(Math.log10(v)), e = v / m; return (e <= 1 ? 1 : e <= 2 ? 2 : e <= 2.5 ? 2.5 : e <= 5 ? 5 : 10) * m; };
    const ext0 = Math.max(...[...a0, ...b0, a0[0] + b0[0], a0[1] + b0[1]].map(Math.abs));
    const R = Number(cfg.range) > 0 ? Number(cfg.range) : ext0 > 0 && ext0 < 1 ? niceUp(ext0 * 1.4) : null;
    const gstep = R ? niceUp(R / 4.5) : 1, gdig = [0, 1, 2, 3].find((d) => Math.abs(gstep * 10 ** d - Math.round(gstep * 10 ** d)) < 1e-9) ?? 3, vdig = Math.max(1, gdig);
    const svg = s("svg", { class: "viz-svg" });
    svg.style.touchAction = "none";
    svg.style.overflow = "hidden";
    stage.append(svg);
    const cp = cap(foot);
    let W = 640, H = 380, u = 46, ox = 320, oy = 190;
    const dot = (p, q) => p[0] * q[0] + p[1] * q[1], crs = (p, q) => p[0] * q[1] - p[1] * q[0], len = (p) => Math.hypot(p[0], p[1]);
    const P = (v) => [ox + v[0] * u, oy - v[1] * u];
    const vs = (v) => `(${n(v[0], vdig)}, ${n(v[1], vdig)})`;
    // Which handle a drag moves, and where each handle sits.
    const handles = () => (mode === "sum" || mode === "torque" ? { a, b: [a[0] + b[0], a[1] + b[1]] } : { a, b });
    const labs = []; // in-picture labels, moved apart after drawing
    function vec(from, v, color, label, w = 3.2, at = 1) {
      const [x1, y1] = P(from), [x2, y2] = P([from[0] + v[0], from[1] + v[1]]);
      const g = s("g", {});
      if (Math.hypot(x2 - x1, y2 - y1) > 3) g.append(arrow(x1, y1, x2, y2, color, w, 11));
      if (label) {
        const dx = x2 - x1, dy = y2 - y1, m = Math.hypot(dx, dy) || 1;
        const lx = x1 + dx * at, ly = y1 + dy * at, along = at === 1 ? 6 : 0;
        const t = txt(lx + (-dy / m) * 16 + (dx / m) * along, ly + (dx / m) * 16 + (dy / m) * along + 4, label, { fill: color, size: 14, weight: 700, anchor: "middle" });
        g.append(t); labs.push(t);
      }
      return g;
    }
    function draw() {
      svg.innerHTML = "";
      labs.length = 0;
      const C = colors();
      const nar = narrowOf(stage);
      W = nar ? 400 : 640; H = nar ? 360 : 380; ox = W / 2; oy = H / 2; u = R ? (oy - 8) / R : nar ? 38 : 46;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const gu = gstep * u, nx = Math.floor(ox / gu), ny = Math.floor(oy / gu), gl = (i) => n(i * gstep, gdig);
      for (let i = -nx; i <= nx; i++) svg.append(ln(ox + i * gu, 0, ox + i * gu, H, i ? C.border : C.border2, i ? 1 : 1.6));
      for (let j = -ny; j <= ny; j++) svg.append(ln(0, oy - j * gu, W, oy - j * gu, j ? C.border : C.border2, j ? 1 : 1.6));
      for (let i = -nx; i <= nx; i++) if (i && Math.abs(i * gu) < ox - 16) svg.append(txt(ox + i * gu, oy + 14, gl(i), { fill: C.faint, size: 11, anchor: "middle", weight: 400 }));
      for (let j = -ny; j <= ny; j++) if (j && Math.abs(j * gu) < oy - 4) svg.append(txt(ox - 6, oy - j * gu + 4, gl(j), { fill: C.faint, size: 11, anchor: "end", weight: 400 }));
      const O = [0, 0], A = C.v1, Bc = C.v2;
      const th = Math.atan2(crs(a, b), dot(a, b)); // signed angle a → b
      const angA = Math.atan2(a[1], a[0]), angB = Math.atan2(b[1], b[0]);
      let msg;
      if (mode === "sum") {
        const sum = [a[0] + b[0], a[1] + b[1]];
        svg.append(s("g", { opacity: 0.35 }, vec(O, b, Bc, null, 2), vec(b, a, A, null, 2)));
        // "a + b" sits at the middle of its arrow (its tip is b's tip, where "b" is written)
        const tiny = len(sum) * u < 30;
        svg.append(vec(O, sum, C.v5, tiny ? null : "a + b", 4, 0.5), vec(O, a, A, "a"), vec(a, b, Bc, "b"));
        if (tiny) { const t = txt(ox + 14, oy + 30, L(`a + b ≈ 0`, `a + b ≈ 0`), { fill: C.v5, size: 14, weight: 700 }); svg.append(t); labs.push(t); }
        msg = `$a$ = ${vs(a)}, $b$ = ${vs(b)} → $a + b = (a_x + b_x,\\ a_y + b_y)$ = ${vs(sum)}, $\\lVert a + b \\rVert$ = ${n(len(sum))}<br>` + L("Put b's tail on a's tip: the sum is the arrow from the start to the end. The faint arrows go b first, then a — same end point, so the order does not matter.", "把 b 的尾巴接到 a 的箭头尖上：和就是从起点指向终点的箭头。淡色箭头先走 b 再走 a——终点相同，所以顺序无关。");
      } else if (mode === "dot" || mode === "project") {
        const d = dot(a, b), la = len(a) || 1e-9, k = d / (la * la), pr = [k * a[0], k * a[1]];
        // the line through a, extended
        const ext = 30, [ex1, ey1] = P([-a[0] / la * ext, -a[1] / la * ext]), [ex2, ey2] = P([a[0] / la * ext, a[1] / la * ext]);
        svg.append(ln(ex1, ey1, ex2, ey2, C.faint, 1, { "stroke-dasharray": "3 5" }));
        const [bx, by] = P(b), [px, py] = P(pr);
        svg.append(ln(bx, by, px, py, mode === "project" ? C.v5 : C.faint, mode === "project" ? 2.4 : 1.2, { "stroke-dasharray": "5 4" }));
        if (len(pr) > 0.15 && Math.hypot(bx - px, by - py) > 12) {
          const ua = [a[0] / la, a[1] / la], up = [(b[0] - pr[0]), (b[1] - pr[1])], lp = len(up) || 1, q = 0.22;
          const c1 = P([pr[0] - Math.sign(k) * ua[0] * q, pr[1] - Math.sign(k) * ua[1] * q]), c2 = P([pr[0] - Math.sign(k) * ua[0] * q + (up[0] / lp) * q, pr[1] - Math.sign(k) * ua[1] * q + (up[1] / lp) * q]), c3 = P([pr[0] + (up[0] / lp) * q, pr[1] + (up[1] / lp) * q]);
          svg.append(s("path", { d: `M${c1[0]},${c1[1]}L${c2[0]},${c2[1]}L${c3[0]},${c3[1]}`, fill: "none", stroke: C.muted, "stroke-width": 1.2 }));
        }
        if (mode === "project") svg.append(vec(O, pr, C.v3, L("proj", "投影"), 5, 0.55));
        const sc = d > 1e-9 ? C.v2 : d < -1e-9 ? C.v4 : C.muted;
        if (mode === "dot" && len(a) > 0.2 && len(b) > 0.2) {
          svg.append(s("path", { d: arcPath(ox, oy, 34, angA, angA + th), fill: "none", stroke: sc, "stroke-width": 2 }));
          const mA = angA + th / 2;
          svg.append(txt(ox + 52 * Math.cos(mA), oy - 52 * Math.sin(mA) + 4, `θ = ${Math.abs(th / DEG).toFixed(0)}°`, { fill: sc, size: 13, anchor: "middle" }));
        }
        svg.append(vec(O, a, A, "a"), vec(O, b, Bc, "b"));
        if (mode === "dot") {
          svg.append(txt(10, 24, `a·b = ${n(d, 2)}`, { fill: sc, size: 16, weight: 700 }));
          svg.append(txt(10, 44, d > 1e-9 ? L("positive: roughly the same way", "正：大致同向") : d < -1e-9 ? L("negative: roughly opposite ways", "负：大致反向") : L("zero: perpendicular", "零：互相垂直"), { fill: sc, size: 12.5 }));
          msg = `$a \\cdot b = a_x b_x + a_y b_y$ = ${np(a[0])}·${np(b[0])} + ${np(a[1])}·${np(b[1])} = ${n(d)} = $\\lVert a\\rVert \\lVert b\\rVert \\cos\\theta$ = ${n(len(a))} × ${n(len(b))} × cos ${Math.abs(th / DEG).toFixed(0)}°<br>` + L("The dot product measures how much two arrows point the same way: the length of a times the length of b's shadow on a.", "点积衡量两个箭头有多同向：等于 a 的长度乘以 b 在 a 上投下的影子的长度。");
        } else {
          const rem = [b[0] - pr[0], b[1] - pr[1]];
          svg.append(txt(10, 24, L(`shadow of b on a: ${n(d / la)}`, `b 在 a 上的影长：${n(d / la)}`), { fill: C.v3, size: 15, weight: 700 }));
          msg = `$\\mathrm{proj}_a b = \\dfrac{a\\cdot b}{\\lVert a\\rVert^2}\\, a$ = (${n(d)}/${n(la * la)}) a = ${vs(pr)} · ${L("signed length", "带符号长度")} $a\\cdot b/\\lVert a\\rVert$ = ${n(d / la)} · ${L("remainder", "剩余部分")} $b - \\mathrm{proj}$ = ${vs(rem)}, $(b - \\mathrm{proj})\\cdot a$ = ${n(dot(rem, a))}<br>` + L("The projection is b's shadow on the line of a when the light shines straight down onto that line. What is left over is perpendicular to a — that is why least squares works.", "投影是光线垂直照向 a 所在直线时 b 投下的影子。剩下的部分与 a 垂直——最小二乘就是靠这一点。");
        }
      } else if (mode === "cross") {
        const cz = crs(a, b), col = cz > 1e-9 ? C.v2 : cz < -1e-9 ? C.v4 : C.muted;
        const pts = [O, a, [a[0] + b[0], a[1] + b[1]], b].map(P);
        svg.append(s("path", { d: pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join("") + "Z", fill: col, "fill-opacity": 0.18, stroke: col, "stroke-width": 1.2, "stroke-dasharray": "4 3" }));
        if (len(a) > 0.2 && len(b) > 0.2) {
          svg.append(s("path", { d: arcPath(ox, oy, 30, angA, angA + th), fill: "none", stroke: col, "stroke-width": 2 }));
          const e = angA + th, e0 = e - Math.sign(th) * 0.25;
          svg.append(arrow(ox + 30 * Math.cos(e0), oy - 30 * Math.sin(e0), ox + 30 * Math.cos(e), oy - 30 * Math.sin(e), col, 2, 7));
        }
        svg.append(vec(O, a, A, "a"), vec(O, b, Bc, "b"));
        svg.append(txt(10, 24, `a × b = ${n(cz)}`, { fill: col, size: 16, weight: 700 }));
        svg.append(txt(10, 44, cz > 1e-9 ? L("positive: b is counter-clockwise from a", "正：b 在 a 的逆时针方向") : cz < -1e-9 ? L("negative: b is clockwise from a", "负：b 在 a 的顺时针方向") : L("zero: parallel", "零：平行"), { fill: col, size: 12.5 }));
        msg = `$a \\times b = a_x b_y - a_y b_x$ = ${np(a[0])}·${np(b[1])} − ${np(a[1])}·${np(b[0])} = ${n(cz)} = $\\lVert a\\rVert \\lVert b\\rVert \\sin\\theta$ = ${L("signed area of the parallelogram", "平行四边形的带符号面积")}<br>` + L("In 3-D, a × b is a vector perpendicular to both; for two arrows in the screen plane it points straight out of the screen, and this number is its length (with a sign).", "在三维里，a × b 是同时垂直于两者的向量；两个箭头都在屏幕平面内时，它垂直指出屏幕，这个数就是它的（带符号）长度。");
      } else {
        // torque: lever r = a from the pivot, force F = b at r's tip
        const r = a, F = b, tz = crs(r, F), lf = len(F), dArm = lf > 1e-9 ? Math.abs(tz) / lf : 0;
        const col = tz > 1e-9 ? C.v2 : tz < -1e-9 ? C.v4 : C.muted;
        if (lf > 1e-9) {
          const uf = [F[0] / lf, F[1] / lf], q1 = P([r[0] - uf[0] * 30, r[1] - uf[1] * 30]), q2 = P([r[0] + uf[0] * 30, r[1] + uf[1] * 30]);
          svg.append(ln(q1[0], q1[1], q2[0], q2[1], C.faint, 1.2, { "stroke-dasharray": "6 5" }));
          const t = -dot(r, uf), foot = [r[0] + uf[0] * t, r[1] + uf[1] * t], [fx, fy] = P(foot);
          if (dArm > 0.05) {
            svg.append(ln(ox, oy, fx, fy, C.v5, 2.2, { "stroke-dasharray": "5 4" }));
            const m = Math.hypot(fx - ox, fy - oy) || 1;
            svg.append(txt((ox + fx) / 2 + ((fy - oy) / m) * 14, (oy + fy) / 2 - ((fx - ox) / m) * 14 + 4, "d", { fill: C.v5, size: 14, weight: 700, anchor: "middle" }));
          }
        }
        const [rx, ry] = P(r);
        svg.append(ln(ox, oy, rx, ry, C.fg2, 9, { "stroke-linecap": "round", opacity: 0.8 }));
        svg.append(s("path", { d: `M${ox},${oy}L${ox - 11},${oy + 18}L${ox + 11},${oy + 18}Z`, fill: C.faint }));
        svg.append(s("circle", { cx: ox, cy: oy, r: 7, fill: C.surface, stroke: C.v1, "stroke-width": 3 }));
        if (Math.abs(tz) > 1e-9) {
          const start = Math.PI * 0.3, end = start + Math.sign(tz) * Math.PI * 1.2;
          svg.append(s("path", { d: arcPath(ox, oy, 26, start, end), fill: "none", stroke: col, "stroke-width": 2.4 }));
          const e0 = end - Math.sign(tz) * 0.3;
          svg.append(arrow(ox + 26 * Math.cos(e0), oy - 26 * Math.sin(e0), ox + 26 * Math.cos(end), oy - 26 * Math.sin(end), col, 2.4, 8));
        }
        svg.append(vec(O, r, A, "r"), vec(r, F, C.v4, "F"));
        svg.append(txt(10, 24, `τ = r × F = ${n(tz)} N·m`, { fill: col, size: 16, weight: 700 }));
        svg.append(txt(10, 44, (tz > 1e-9 ? L("counter-clockwise", "逆时针") : tz < -1e-9 ? L("clockwise", "顺时针") : L("no turning", "不转")) + L(` · lever arm d = ${n(dArm)} m`, ` · 力臂 d = ${n(dArm)} m`), { fill: col, size: 12.5 }));
        msg = `$\\tau = r_x F_y - r_y F_x$ = ${np(r[0])}·${np(F[1])} − ${np(r[1])}·${np(F[0])} = ${n(tz)} N·m = $${tz < -1e-9 ? "-" : ""}\\lVert F\\rVert\\, d$ = ${tz < -1e-9 ? "−" : ""}${n(lf)} × ${n(dArm)} · $r$ ${L("in m", "单位 m")}, $F$ ${L("in N", "单位 N")}<br>` + L("Only the part of the force across the lever turns it; push along the lever (d = 0) and nothing turns. Positive torque turns counter-clockwise.", "只有垂直于杠杆的那部分力才能让它转；顺着杠杆推（d = 0）就转不动。正力矩表示逆时针。");
      }
      const hs = handles();
      for (const [key, v] of Object.entries(hs)) { const [x, y] = P(v); svg.append(s("circle", { cx: x, cy: y, r: 9, fill: key === "a" ? A : mode === "torque" ? C.v4 : Bc, "fill-opacity": 0.22, stroke: key === "a" ? A : mode === "torque" ? C.v4 : Bc, "stroke-width": 1.5 })); }
      declutter(labs, [0, 0, W, H]);
      capSet(cp, ...msg.split("<br>"), hint(L("Drag the round handles.", "拖动圆形手柄。")));
    }
    let grab = null;
    const snap = (v) => +(Math.round(v / (gstep / 10)) * (gstep / 10)).toFixed(gdig + 1);
    const lim = (v) => [clamp(v[0], -(ox / u - 0.2), ox / u - 0.2), clamp(v[1], -(oy / u - 0.2), oy / u - 0.2)];
    function move(ev) {
      const [x, y] = toView(svg, ev, W, H);
      const pt = lim([snap((x - ox) / u), snap((oy - y) / u)]);
      if (grab === "a") a = pt;
      else if (mode === "sum" || mode === "torque") b = [snap(pt[0] - a[0]), snap(pt[1] - a[1])];
      else b = pt;
      draw();
    }
    svg.addEventListener("pointerdown", (ev) => {
      const [x, y] = toView(svg, ev, W, H), hs = handles();
      const d = (v) => { const [px, py] = P(v); return Math.hypot(px - x, py - y); };
      grab = d(hs.a) <= d(hs.b) ? "a" : "b";
      svg.setPointerCapture(ev.pointerId); move(ev); ev.preventDefault();
    });
    svg.addEventListener("pointermove", (ev) => { if (grab) move(ev); });
    svg.addEventListener("pointerup", () => (grab = null));
    svg.addEventListener("pointercancel", () => (grab = null));
    ctrls.append(seg([["sum", "a + b"], ["dot", L("dot a·b", "点积 a·b")], ["project", L("projection", "投影")], ["cross", L("cross a×b", "叉积 a×b")], ["torque", L("torque r×F", "力矩 r×F")]], mode, (v) => { mode = v; draw(); }),
      btn(T().reset, () => { a = a0.slice(); b = b0.slice(); draw(); }));
    draw();
  });
})();
