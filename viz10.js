"use strict";
// robot3d — robots in real 3-D with their physics drawn on them (PLAN R19).
//
//   ```viz
//   {"type": "robot3d", "scene": "stance", "robot": "humanoid", "support": "left"}
//   ```
//
// This file holds the shared scaffold (Viz.r3) and the reference scene "stance"; the other
// scenes live in viz11.js, viz12.js … and register with Viz.r3.scene(name, fn). The renderer
// is viz3d.js (Viz.g3), the robot models and their kinematics/statics are rob3d.js (Viz.rob).
// Fields of every scene are documented in CONTENT_SPEC.md and validated by tools/build.mjs.
//
// Rules every scene follows (so that all 3-D figures read the same way):
//   · the default state shows the point of the figure without touching anything;
//   · colours have one meaning everywhere (Viz.g3.palette()): CoM orange, gravity violet,
//     contact force red, support polygon green (red when violated), ZMP/CoP red dot, DCM blue,
//     friction cone amber, joint torque gold, velocity teal, target pink;
//   · a legend names every colour used, a read-out line gives the live numbers as formulas
//     ("$f_z = 343$ N"), a status chip says the conclusion in words, and the caption says
//     what to do and what to notice;
//   · all text is bilingual through L(en, zh); quantities carry units.
(() => {
  if (!window.Viz || !Viz.g3 || !Viz.rob) return;
  const { h, math, shell, slider, btn, seg, clamp } = Viz.util;
  const rob = Viz.rob, V = rob.V, M = rob.M;
  const zh = () => (document.documentElement.lang || "").startsWith("zh");
  const L = (en, cn) => (zh() ? cn : en);
  const SCENES = {};
  const NAMES = {
    com: ["centre of mass (CoM)", "质心 (CoM)"], gravity: ["weight $m g_0$", "重力 $m g_0$"], force: ["contact force", "接触力"], support: ["support polygon", "支撑多边形"],
    zmp: ["ZMP / centre of pressure", "ZMP / 压力中心"], dcm: ["DCM (capture point)", "DCM（捕获点）"], cone: ["friction cone", "摩擦锥"], torque: ["joint torque", "关节力矩"],
    velocity: ["velocity", "速度"], target: ["target (drag it)", "目标（可拖动）"], ghost: ["reference", "参考"], x: ["$x$ axis", "$x$ 轴"], y: ["$y$ axis", "$y$ 轴"], z: ["$z$ axis", "$z$ 轴"],
  };
  // fixed-point text; never "-0", "-0.0" … (a value that rounds to zero has no sign)
  const nz = (t) => (/^-0(\.0*)?$/.test(t) ? t.slice(1) : t);
  const f0 = (x) => nz(x.toFixed(0)), f1 = (x) => nz(x.toFixed(1)), f2 = (x) => nz(x.toFixed(2)), f3 = (x) => nz(x.toFixed(3));
  const cm = (x) => nz((100 * x).toFixed(1));

  function makeUI(stage, ctrls, foot, cfg) {
    const P = Viz.g3.palette();
    const status = h("div", { class: "r3-status" }), read = h("div", { class: "r3-read" }), lg = h("div", { class: "viz-legend" }), cap = h("div", { class: "viz-caption" });
    foot.append(read, lg, cap);
    const ui = {
      P, cfg, L, ctrls, stage,
      // the 3-D view; cfg.view = { yaw, pitch, dist, target } overrides the scene's camera
      view(o) { const v = Viz.g3.view(stage, { ...o, ...(cfg.view || {}), height: cfg.height || o.height || 400 }); v.wrap.append(status); ui.v = v; return v; },
      // conclusion in words, on the picture: kind "ok" | "warn" | "bad" | "info"
      status(text, kind = "ok") { const key = kind + text; if (status._t !== key) { math(status, text || ""); status.className = "r3-status " + kind; status._t = key; } status.style.display = text ? "" : "none"; },
      // live numbers under the picture, one string per line, "$…$" typeset
      say(lines) { lines = lines.filter(Boolean); const key = lines.join("\n"); if (read._t === key) return; read._t = key; read.replaceChildren(...lines.map((t) => math(h("div", {}), t))); },
      caption(t) { math(cap, cfg.caption || t); },
      // legend entries: a palette key ("com", "force", …) or [colour, label]
      legend(keys) { lg.replaceChildren(...keys.map((k) => { const [col, label] = Array.isArray(k) ? k : [P[k], NAMES[k] ? NAMES[k][zh() ? 1 : 0] : k]; return h("span", {}, h("i", { style: `background:${col};border-color:${col}` }), h("span", { class: "viz-lg" }, label)); })); },
      slider(label, o, cb) { const s = slider(label, o, cb); ctrls.append(s); return s; },
      seg(options, value, cb) { const s = seg(options, value, cb); ctrls.append(s); return s; },
      btn(label, cb, cls) { const b = btn(label, cb, cls); ctrls.append(b); return b; },
      // an on/off chip
      toggle(label, on, cb) { const b = btn(label, () => { on = !on; b.classList.toggle("on", on); cb(on); }, "r3-toggle" + (on ? " on" : "")); ctrls.append(b); return b; },
    };
    return ui;
  }

  // ------------------------------------------------------------------ shared drawing
  const R3 = {
    L, zh, NAMES, fmt: { f0, f1, f2, f3, cm },
    scene(name, fn) { SCENES[name] = fn; },
    // metres of arrow per newton, so that the robot's weight is `len` metres long
    forceScale: (rb, len = 0.42) => len / (rb.totalMass * rob.G),
    centroid(poly) { const c = [0, 0]; for (const p of poly) { c[0] += p[0] / poly.length; c[1] += p[1] / poly.length; } return c; },
    // CoM marker, plumb line to the floor, its ground point, and (optionally) the weight arrow
    drawCom(g, c, o = {}) {
      const P = g.P;
      g.sphere(c, o.r ?? 0.038, P.com, { onTop: true });
      if (o.label !== false) g.label(c, o.label || "CoM", { color: P.com, dx: 9 });
      if (o.plumb !== false) { g.line(c, [c[0], c[1], 0], P.com, { w: 2, dash: 0.035, onTop: true }); g.disc([c[0], c[1], 0.004], [0, 0, 1], 0.02, P.com, { ground: true }); }
      if (o.weight) g.arrow(c, [c[0], c[1], c[2] - o.weight], P.gravity, { w: 5, label: o.weightLabel ?? "$m g_0$" });
    },
    // support polygon on the floor from [[x, y] …]; red when ok is false
    drawSupport(g, poly, ok = true, o = {}) { if (poly.length >= 3) g.poly(poly.map((p) => [p[0], p[1], 0]), ok ? g.P.support : g.P.force, { ground: true, alpha: o.alpha ?? 0.26, w: 2.5 }); else if (poly.length === 2) g.line([poly[0][0], poly[0][1], 0.002], [poly[1][0], poly[1][1], 0.002], ok ? g.P.support : g.P.force, { w: 4, ground: true }); },
    // result of rb.distributeForces(): one arrow per contact patch at its centre of pressure (+ thin arrows at the corners)
    drawForces(g, dist, k, o = {}) {
      const P = g.P;
      if (o.corners !== false) for (const fc of dist.forces) if (V.norm(fc.f) > 2) g.arrow(fc.p, V.add(fc.p, V.scale(fc.f, k)), P.force, { w: 2, alpha: 0.5 });
      for (const [name, fr] of Object.entries(dist.frames)) {
        if (!fr.cop || fr.f[2] < 0.5) continue;
        if (o.cones) g.coneShell(fr.cop, [0, 0, 1], o.coneH ?? 0.22, (o.coneH ?? 0.22) * (o.mu ?? 0.6), P.cone, { alpha: 0.22 });
        // the label sits at the arrow tip, pushed outward (away from the other contacts on screen) so it does not cover the leg
        let lo = {};
        if (o.outward && g.project) { const s = g.project(fr.cop), others = Object.values(dist.frames).filter((x) => x !== fr && x.cop && x.f[2] >= 0.5).map((x) => g.project(x.cop)[0]); const ref = others.length ? others.reduce((a, b) => a + b, 0) / others.length : o.outward(); lo = s[0] < ref ? { anchor: "right", dx: -10, dy: 0 } : { dx: 10, dy: 0 }; }
        g.arrow(fr.cop, V.add(fr.cop, V.scale(fr.f, k)), P.force, { w: 5, label: o.labels === false ? null : (o.label ? o.label(name, fr) : `${f0(V.norm(fr.f))} N`), labelOpt: lo });
        g.disc([fr.cop[0], fr.cop[1], 0.005], [0, 0, 1], 0.014, P.zmp, { ground: true });
      }
    },
    // whole-body posture from tasks: n steps of the robot's strict-priority IK; levels() is rebuilt every step
    solve(rb, levels, n = 30, opts = {}) { for (let i = 0; i < n; i++) { rb.fk(); rb.ik(levels(), { damping: 0.03, ...opts }); } rb.fk(); },
    // tasks that keep the base link at a height and upright (R0), from its point Jacobian
    baseTasks(rb, z, R0) { const b = rb.pointJac(0, [0, 0, 0]); return [{ J: [b.Jv[2]], e: [z - rb.base.p[2]] }, { J: b.Jw, e: M.log(M.mul(R0, M.T(rb.base.R))) }]; },
    snapshot: (rb) => ({ p: rb.base.p.slice(), R: rb.base.R.map((r) => r.slice()), q: Float64Array.from(rb.q) }),
    restore(rb, s) { rb.base.p = s.p.slice(); rb.base.R = s.R.map((r) => r.slice()); rb.q.set(s.q); rb.fk(); },
  };
  Viz.r3 = R3;

  Viz.register("robot3d", (root, cfg) => {
    const fn = SCENES[cfg.scene];
    if (!fn) throw new Error(`unknown scene "${cfg.scene}"`);
    if (!Viz.g3.ok) { const { stage } = shell(root, cfg); stage.append(h("div", { class: "viz-caption" }, L("This 3-D figure needs WebGL, which is not available on this device.", "这个 3D 图需要 WebGL，这台设备不支持。"))); return; }
    const { stage, ctrls, foot } = shell(root, cfg);
    fn(makeUI(stage, ctrls, foot, cfg), cfg);
  });

  // ================================================================== stance
  // Standing still: where the weight goes. The CoM's ground point must lie inside the support
  // polygon; the floor answers with forces whose resultant passes through that point.
  // cfg: robot "humanoid" | "quadruped"; support "both" | "left" | "right" (humanoid) or
  //      "all" | "three" | "diag" (quadruped); lean [x, y] (m, CoM offset from the middle of the
  //      support); stand (0.75–1.03, fraction of the standing height); mu; cones (bool); corners (bool);
  //      split "min" | "lever" (humanoid on both feet: how the two feet share the weight, which statics
  //      alone does not fix — "min" (default) the smallest corner forces min Σ‖f‖², as a QP picks them,
  //      so the far foot keeps a little load until the CoM is ≈ 2 cm past the middle of the near foot;
  //      "lever" the lever rule along the line between the feet, each CoP at the middle of its foot,
  //      the far foot unloaded as soon as the CoM is over the middle of the near one)
  //      acc [ax, ay] (m/s², default none = standing still): the CoM is being accelerated (a push on the body, or the
  //      robot starting to move); the floor must then give m a sideways as well, so the foot forces tilt inside their
  //      cones and the ZMP p = c − (c_z/g₀) a moves away from the CoM ground point; it slips when friction cannot give
  //      m a. With acc set, two sliders for a_x and a_y appear (the lever rule then does not apply).
  // When the CoM is outside the polygon no pushing-only forces exist: the picture then draws the floor
  // force at the tipping edge (faint) and the weight's unbalanced moment about that edge.
  R3.scene("stance", (ui, cfg) => {
    const P = ui.P, quad = cfg.robot === "quadruped";
    const rb = rob.build(quad ? "quadruped" : "humanoid");
    rb.fk();
    const feet = quad ? ["lf_foot", "rf_foot", "lh_foot", "rh_foot"] : ["l_foot", "r_foot"];
    const home = R3.snapshot(rb), footHome = Object.fromEntries(feet.map((f) => [f, rb.framePose(f)]));
    const S = { lean: (cfg.lean || [0, 0]).slice(), height: cfg.stand ?? 1, support: cfg.support || (quad ? "all" : "both"), mu: cfg.mu ?? 0.6, cones: !!cfg.cones, corners: cfg.corners !== false, split: !quad && cfg.split === "lever" ? "lever" : "min", acc: Array.isArray(cfg.acc) && cfg.acc.length === 2 && cfg.acc.every((x) => Number.isFinite(+x)) ? cfg.acc.map((x) => clamp(+x, -6, 6)) : null };
    const contacts = () => (quad ? (S.support === "three" ? ["lf_foot", "lh_foot", "rh_foot"] : S.support === "diag" ? ["lf_foot", "rh_foot"] : feet) : S.support === "left" ? ["l_foot"] : S.support === "right" ? ["r_foot"] : feet);
    const k = R3.forceScale(rb), W = rb.totalMass * rob.G;
    // the point of the polygon (or segment) nearest to pt
    const nearest = (pt, poly) => { let best = poly[0] || [0, 0], bd = Infinity; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 > 0 ? clamp(((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2, 0, 1) : 0, q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(pt[0] - q[0], pt[1] - q[1]); if (d < bd) { bd = d; best = q; } } return best; };

    function pose(n = 40) {
      const cf = contacts();
      R3.solve(rb, () => {
        const cen = R3.centroid(rb.supportPolygon(cf)), tgt = [cen[0] + S.lean[0], cen[1] + S.lean[1]];
        const L1 = feet.map((f) => { const hp = footHome[f], up = cf.includes(f) ? 0 : quad ? 0.1 : 0.12, p = [hp.p[0], hp.p[1], hp.p[2] + up]; return quad ? rb.taskPos(f, p) : rb.taskPose(f, p, hp.R); });
        return [L1, [rb.taskCom(tgt), ...R3.baseTasks(rb, home.p[2] * S.height, home.R)], [rb.taskPosture(home.q, { gain: 0.3 })]];
      }, n);
    }

    const name = (f) => (quad ? { lf_foot: L("front left", "左前"), rf_foot: L("front right", "右前"), lh_foot: L("hind left", "左后"), rh_foot: L("hind right", "右后") }[f] : f === "l_foot" ? L("left foot", "左脚") : L("right foot", "右脚"));
    const view = ui.view({ height: 420, target: quad ? [0, 0, 0.25] : [0, 0, 0.8], dist: quad ? 2.3 : 3.5, yaw: 0.95, pitch: 0.4, draw(g) {
      const cf = contacts(), poly = rb.supportPolygon(cf), c = rb.com(), acc = S.acc && Math.hypot(...S.acc) > 1e-6 ? S.acc : null;
      // the point the floor's resultant must pass through: the CoM ground point, or the ZMP when the CoM accelerates
      const zp = acc ? [c[0] - (c[2] / rob.G) * acc[0], c[1] - (c[2] / rob.G) * acc[1]] : [c[0], c[1]];
      // a polygon: signed distance to its edge; two point feet: a line, so the point must lie on the segment (5 mm tolerance)
      const line = poly.length === 2, segD = line ? (() => { const q = nearest(zp, poly); return Math.hypot(zp[0] - q[0], zp[1] - q[1]); })() : 0;
      const margin = poly.length >= 3 ? rob.distToPoly(zp, poly) : line ? (segD <= 0.005 ? 0 : -segD) : -Math.hypot(zp[0] - (poly[0]?.[0] ?? 0), zp[1] - (poly[0]?.[1] ?? 0));
      const lever = S.split === "lever" && cf.length === 2;
      let dist = margin >= 0 ? rb.distributeForces(cf, acc ? { mu: S.mu, comAcc: [acc[0], acc[1], 0] } : { mu: S.mu, split: lever ? "lever" : undefined }) : null;
      const slips = !!(acc && dist && !dist.ok), ok = margin >= 0 && !slips;
      if (slips) dist = null;
      g.robot(rb, ok ? {} : { color: () => "#e9a3a0" });
      R3.drawSupport(g, poly, margin >= 0);
      R3.drawCom(g, c, { weight: W * k, weightLabel: `$m g_0 = ${f0(W)}$ N` });
      if (acc) {
        const an = Math.hypot(...acc), d = [acc[0] / an, acc[1] / an, 0];
        g.arrow(c, V.add(c, V.scale(d, 0.12 + 0.05 * an)), P.velocity, { w: 5, label: `$a = ${f1(an)}$ m/s², $m a = ${f0(rb.totalMass * an)}$ N`, labelOpt: { small: true } });
        g.disc([zp[0], zp[1], 0.006], [0, 0, 1], 0.022, P.zmp, { onTop: true }); g.label([zp[0], zp[1], 0], "ZMP", { color: P.zmp, small: true, dy: 14 });
      }
      let edge = null;
      if (slips) { /* friction cannot give m a: no forces inside the cones exist */ }
      else if (ok) R3.drawForces(g, dist, k, { cones: S.cones, mu: S.mu, corners: S.corners, label: (f, fr) => `${name(f)} ${f0(fr.f[2])} N`, outward: () => g.project(c)[0] });
      else {
        // no pushing-only forces can hold the robot: the floor can push only at the edge it tips over, and the weight
        // has a moment about that edge that nothing cancels
        const q = nearest(zp, poly), d = Math.hypot(zp[0] - q[0], zp[1] - q[1]), n = d > 1e-9 ? [(zp[0] - q[0]) / d, (zp[1] - q[1]) / d, 0] : [1, 0, 0];
        edge = { q, d };
        const e = [q[0], q[1], 0];
        g.arrow(e, [q[0], q[1], W * k], P.force, { w: 4, alpha: 0.4, label: L("floor: only at the edge", "地面：只能在边上推"), labelOpt: { small: true } });
        g.disc([q[0], q[1], 0.005], [0, 0, 1], 0.014, P.zmp, { ground: true });
        g.turn([q[0], q[1], 0.05], [-n[1], n[0], 0], 0.09, 1, P.torque, { w: 3.5, onTop: true, sweep: 1.1 * Math.PI, label: `$m g_0\\,d = ${f1(W * d)}$ N·m` });
      }
      const parts = ok ? cf.map((f) => { const fr = dist.frames[f], fz = fr.f[2], ft = Math.hypot(fr.f[0], fr.f[1]); return `${name(f)} $f_z = ${f0(fz)}$ N (${f0((100 * fz) / W)} %)` + (acc ? L(`, sideways ${f0(ft)} N`, `，水平 ${f0(ft)} N`) : ""); }) : [];
      if (slips) ui.status(L("slips: the feet cannot give the sideways force $m a$ inside their friction cones", "打滑：双脚在摩擦锥内给不出水平力 $m a$"), "bad");
      else if (acc) ui.status(ok ? L("held: the ZMP is inside the support polygon and the forces fit in their cones", "撑得住：ZMP 在支撑多边形内，力都在摩擦锥里") : L("tips: the ZMP has left the support polygon", "会翻：ZMP 已经出了支撑多边形"), ok ? "ok" : "bad");
      else if (line) ui.status(ok ? L("balanced only on the line: two feet support a line, and the CoM sits exactly on it — any sideways offset tips it, so a trotting robot relies on dynamics (the other pair lands within half a cycle)", "只在这条线上平衡：两只脚撑起的是一条线，质心正好在线上——稍有偏离就会翻，所以小跑靠的是动态（另一对脚半个周期内就落地）") : L("falls: the CoM ground point is off the support line", "会倒：质心投影离开了支撑线"), ok ? "warn" : "bad");
      else ui.status(ok ? L("balanced: the CoM is above the support polygon", "平衡：质心在支撑多边形的正上方") : L("falls: the CoM has left the support polygon", "会倒：质心已经出了支撑多边形"), ok ? "ok" : "bad");
      // how two feet share the weight (statics fixes only the total and where it acts)
      let share = null;
      if (ok && !acc && !quad && cf.length === 2) {
        if (lever && dist.lever) {
          const fl = rb.framePose("l_foot").p, fr = rb.framePose("r_foot").p, D = Math.hypot(fl[0] - fr[0], fl[1] - fr[1]), dL = dist.lever.t * D, dR = D - dL;
          share = L(`lever rule: each foot takes the weight in proportion to the CoM's distance from the other foot, $f_{z,L} = m g_0 \\frac{d_R}{d_L + d_R} = ${f0(W)} \\times \\frac{${f3(dR)}}{${f3(D)}} = ${f0(W * dR / D)}$ N; each CoP stays at the middle of its foot (the least ankle torque), so the far foot is empty once the CoM is over the middle of the near one`,
            `杠杆法则：每只脚分到的重量与质心到另一只脚的距离成正比，$f_{z,L} = m g_0 \\frac{d_R}{d_L + d_R} = ${f0(W)} \\times \\frac{${f3(dR)}}{${f3(D)}} = ${f0(W * dR / D)}$ N；每只脚的压力中心都留在脚的中间（踝关节力矩最小），所以质心一到近侧那只脚的中间，远侧的脚就不再受力`);
        } else share = L("how the two feet share it: statics fixes only the total and where it acts (the CoM ground point); this scene takes the smallest corner forces, $\\min \\sum_i \\|f_i\\|^2$, as a QP with a force-regularising cost does — so the far foot keeps a little load until the CoM is about 2 cm past the middle of the near foot (the lever rule would empty it right at the middle)",
          "两只脚怎么分：静力学只规定了总力和它的作用点（质心投影）；本图取角点力最小的那一组解 $\\min \\sum_i \\|f_i\\|^2$，带力正则项的 QP 就是这样选的——所以质心越过近侧脚的中间约 2 cm 之前，远侧的脚还会分到一点力（按杠杆法则，质心到脚中间时它就已经是 0 了）");
      }
      ui.say([
        L(`mass $m = ${f0(rb.totalMass)}$ kg, weight $m g_0 = ${f0(rb.totalMass)} \\times 9.81 = ${f0(W)}$ N`, `质量 $m = ${f0(rb.totalMass)}$ kg，重力 $m g_0 = ${f0(rb.totalMass)} \\times 9.81 = ${f0(W)}$ N`),
        slips ? L(`the floor must push the robot sideways with $m a = ${f0(rb.totalMass)} \\times ${f1(Math.hypot(...acc))} = ${f0(rb.totalMass * Math.hypot(...acc))}$ N, but with $\\mu = ${f2(S.mu)}$ the feet can give at most about $\\mu\\, m g_0 = ${f0(S.mu * W)}$ N (less along a diagonal of the pyramid) — they slide`, `地面得给机器人 $m a = ${f0(rb.totalMass)} \\times ${f1(Math.hypot(...acc))} = ${f0(rb.totalMass * Math.hypot(...acc))}$ N 的水平力，但 $\\mu = ${f2(S.mu)}$ 时双脚最多只能给大约 $\\mu\\, m g_0 = ${f0(S.mu * W)}$ N（沿棱锥对角方向更少）——脚会滑`) : ok ? parts.join(" · ") : L(`no set of pushing-only floor forces can balance the weight here: the floor can push only up to the edge (faint red arrow), and about that edge the weight has a moment $m g_0\\, d = ${f0(W)} \\times ${f3(edge.d)} = ${f1(W * edge.d)}$ N·m that nothing cancels (gold) — the robot rotates over the edge`, `这时地面只靠向上推的力已经无法平衡重力：地面最多只能在边上推（淡红箭头），而重力绕这条边有力矩 $m g_0\\, d = ${f0(W)} \\times ${f3(edge.d)} = ${f1(W * edge.d)}$ N·m，没有任何力能抵消（金色）——机器人绕这条边翻倒`),
        share,
        acc ? L(`accelerating: $\\sum f = m (a - g)$, so the floor adds $m a$ sideways and the resultant passes through the ZMP $p = c - \\frac{c_z}{g_0} a = (${f2(zp[0])}, ${f2(zp[1])})$ m, not through the CoM ground point · ${margin >= 0 ? `ZMP ${cm(margin)} cm inside the nearest edge` : `ZMP outside by ${cm(-margin)} cm`}`, `加速中：$\\sum f = m (a - g)$，地面要多给 $m a$ 的水平力，合力穿过 ZMP $p = c - \\frac{c_z}{g_0} a = (${f2(zp[0])}, ${f2(zp[1])})$ m，而不是质心投影 · ${margin >= 0 ? `ZMP 离最近的边 ${cm(margin)} cm` : `ZMP 超出 ${cm(-margin)} cm`}`) : null,
        L(`CoM ground point $(x, y) = (${f2(c[0])}, ${f2(c[1])})$ m, CoM height $c_z = ${f2(c[2])}$ m · `, `质心在地面的投影 $(x, y) = (${f2(c[0])}, ${f2(c[1])})$ m，质心高度 $c_z = ${f2(c[2])}$ m · `) + (acc ? L("the ZMP is the red dot on the floor", "ZMP 是地面上的红点") : line ? L(`${cm(segD)} cm from the support line (a line has no inside: 0 is the only safe distance)`, `离支撑线 ${cm(segD)} cm（一条线没有“内部”：只有 0 才安全）`) : ok ? L(`distance to the nearest edge: ${cm(margin)} cm`, `到最近一条边的距离：${cm(margin)} cm`) : L(`outside by ${cm(-margin)} cm`, `超出 ${cm(-margin)} cm`)),
      ]);
    } });

    const redo = () => { pose(); view.redraw(); };
    ui.seg(quad ? [["all", L("four feet", "四脚着地")], ["three", L("lift front right", "抬起右前脚")], ["diag", L("diagonal pair (trot)", "对角两脚（小跑）")]] : [["both", L("both feet", "双脚")], ["left", L("left foot only", "只用左脚")], ["right", L("right foot only", "只用右脚")]], S.support, (v) => { S.support = v; S.lean = [0, 0]; sx.set(0); sy.set(0); R3.restore(rb, home); redo(); });
    const sx = ui.slider(L("CoM forward / back (cm)", "质心前 / 后 (cm)"), { min: -25, max: 25, step: 0.5, value: S.lean[0] * 100 }, (v) => { S.lean[0] = v / 100; redo(); });
    const sy = ui.slider(L("CoM left / right (cm)", "质心左 / 右 (cm)"), { min: -25, max: 25, step: 0.5, value: S.lean[1] * 100 }, (v) => { S.lean[1] = v / 100; redo(); });
    ui.slider(L("height (%)", "站立高度 (%)"), { min: 75, max: 103, step: 1, value: S.height * 100 }, (v) => { S.height = v / 100; redo(); });
    ui.toggle(L("friction cones", "摩擦锥"), S.cones, (on) => { S.cones = on; view.redraw(); });
    ui.toggle(L("force at each corner", "每个角点的力"), S.corners, (on) => { S.corners = on; view.redraw(); });
    if (!quad) ui.toggle(L("lever rule", "杠杆法则"), S.split === "lever", (on) => { S.split = on ? "lever" : "min"; view.redraw(); });
    if (S.acc) for (const i of [0, 1]) ui.slider(i ? L("CoM acceleration $a_y$ (m/s²)", "质心加速度 $a_y$（m/s²）") : L("CoM acceleration $a_x$ (m/s²)", "质心加速度 $a_x$（m/s²）"), { min: -6, max: 6, step: 0.1, value: S.acc[i] }, (v) => { S.acc[i] = v; view.redraw(); });
    ui.legend(["com", "gravity", "force", "zmp", "support", ...(S.cones ? ["cone"] : []), ...(S.acc ? [[P.velocity, L("CoM acceleration $a$", "质心加速度 $a$")]] : [])]);
    ui.caption(L(
      "Do: slide the CoM forward, back and sideways, or lift a foot. Notice: the red floor forces always add up to the weight, and they shift toward the side the CoM moves to (the red dots are each foot's centre of pressure); the moment the orange CoM point crosses the green edge, no upward push can hold the robot and it tips. Drag sideways on the picture to orbit.",
      "操作：把质心往前、往后、往两侧移，或者抬起一只脚。观察：红色的地面反力加起来始终等于重力，并且随质心偏向哪一侧就往哪一侧集中（红点是每只脚的压力中心）；橙色的质心投影一越过绿色边界，地面再怎么向上推也撑不住，机器人就会翻倒。在图上左右拖动可以转动视角。"));
    pose(60);
  });
})();
