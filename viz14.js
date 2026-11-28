"use strict";
// robot3d scenes (PLAN R19) — see viz10.js for the scaffold.
//   imu    what an IMU on the torso measures (specific force and angular rate), the tilt it gives,
//          how a horizontal acceleration fools it, a complementary filter; mode "odometry": the base
//          position from a stance leg's forward kinematics, and how a slipping foot biases it
//   track  motion tracking: a reference "ghost" and the robot following it through a first-order lag,
//          key-point errors and the DeepMimic-style reward; mode "retarget": a human demonstration with
//          different limb lengths, copying joint angles versus matching key points with IK
(() => {
  if (!window.Viz || !Viz.r3 || !Viz.g3 || !Viz.rob) return;
  const R3 = Viz.r3, { L } = R3;
  const rob = Viz.rob, V = rob.V, M = rob.M, G = rob.G;
  const { h, clamp, math } = Viz.util;
  const DEG = 180 / Math.PI;
  const nf = (v, d = 2) => { if (!Number.isFinite(v)) return "—"; const s = v.toFixed(d); return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s; };
  const tup = (p, d = 2) => `(${p.map((x) => nf(x, d)).join(", ")})`;
  const num = (x, d) => (x != null && Number.isFinite(+x) ? +x : d);
  // a slider whose value text uses our own format
  function slide(ui, label, o, cb, fmt) {
    const s = ui.slider(label, o, (v) => { cb(v); if (fmt) val.textContent = fmt(v); });
    const val = s.querySelector(".viz-val"), set = s.set;
    s.set = (v) => { set(v); if (fmt) val.textContent = fmt(v); };
    if (fmt) val.textContent = fmt(o.value);
    return s;
  }
  // circular arc at c from direction u1 to direction u2 (radius r)
  function arc(g, c, u1, u2, r, color, o = {}) {
    const a = V.unit(u1), b = V.unit(u2), ang = Math.acos(clamp(V.dot(a, b), -1, 1));
    if (!(ang > 0.004)) return;
    const n = V.unit(V.cross(a, b)), pts = [];
    for (let i = 0; i <= 18; i++) pts.push(V.add(c, V.scale(M.mulv(M.axisAngle(n, (ang * i) / 18), a), r)));
    g.polyline(pts, color, { w: o.w ?? 2, onTop: true });
    if (o.label) g.label(pts[9], o.label, { color, small: true, ...(o.labelOpt || {}) });
  }
  // a task that moves the base link's origin to p (3 rows) and its orientation to R (3 rows)
  const baseTask = (rb, p, R) => { const b = rb.pointJac(0, [0, 0, 0]); return [{ J: b.Jv, e: V.sub(p, rb.base.p) }, { J: b.Jw, e: M.log(M.mul(R, M.T(rb.base.R))) }]; };
  const ARM_WAIST = (rb) => rb.jointNames.map((n, i) => (/shoulder|elbow|waist/.test(n) ? i : -1)).filter((i) => i >= 0);

  // ------------------------------------------------------------------ IMU physics (pure)
  // accelerometer: specific force in the sensor frame, a_m = R_WSᵀ (a − g) with g = (0, 0, −g₀)
  const accelReading = (R, a) => M.mulv(M.T(R), [a[0], a[1], a[2] + G]);
  // tilt from a specific force (exact only when a = 0), for R = R_y(θ) R_x(φ):
  //   roll φ̂ = atan2(a_y, a_z),  pitch θ̂ = atan2(−a_x, √(a_y² + a_z²))
  const tiltFromAcc = (m) => [Math.atan2(m[1], m[2]), Math.atan2(-m[0], Math.hypot(m[1], m[2]))];
  // Euler-angle rates (roll, pitch) from a body angular velocity, Z-Y-X angles with yaw 0
  const eulerRates = (phi, th, w) => [w[0] + Math.tan(th) * (Math.sin(phi) * w[1] + Math.cos(phi) * w[2]), Math.cos(phi) * w[1] - Math.sin(phi) * w[2]];
  R3.imu = { accelReading, tiltFromAcc, eulerRates };

  // ================================================================== imu
  // What an IMU bolted to the torso measures, and how a stance leg gives the base position.
  // cfg:
  //   mode    "tilt" | "odometry"   "tilt" (default): accelerometer, gyro and the tilt they give;
  //                                 "odometry": the base from the stance leg, p_B = p_foot − R_WB fk(q)
  //   roll    number °   0          trunk roll (> 0 leans right), −15…15
  //   pitch   number °   10         trunk pitch (> 0 leans forward), −20…25
  //   acc     [ax, ay]   [0, 0]     horizontal acceleration of the robot (m/s², each −5…5); fools the tilt estimate
  //   filter  bool       false      show the complementary-filter estimate (gyro over short times, accelerometer over long)
  //   slip    number m   0.06       odometry: how far the stance foot has slid forward since touch-down (−0.1…0.1)
  //   view, height, caption         as for every robot3d scene
  R3.scene("imu", (ui, cfg) => {
    const P = ui.P, rb = rob.build("humanoid"), home = R3.snapshot(rb);
    const ink = P.text, CHAIN = "#5c6bc0";
    const fh = { l_foot: rb.framePose("l_foot"), r_foot: rb.framePose("r_foot") };
    const lock = ARM_WAIST(rb);
    const acc0 = Array.isArray(cfg.acc) && cfg.acc.length === 2 ? cfg.acc.map((x) => clamp(num(x, 0), -5, 5)) : [0, 0];
    const S = { mode: cfg.mode === "odometry" ? "odometry" : "tilt", roll: clamp(num(cfg.roll, 0), -15, 15) / DEG, pitch: clamp(num(cfg.pitch, cfg.mode === "odometry" ? 0 : 10), -20, 25) / DEG, acc: acc0, filter: !!cfg.filter, slip: clamp(num(cfg.slip, 0.06), -0.1, 0.1), phase: 0, sway: false, swing: false, tau: clamp(num(cfg.tau, 1), 0.1, 5) };
    // simulated state of the tilt mode: true roll/pitch, previous IMU positions, lever-arm acceleration, filter, time
    const X = { phi: S.roll, th: S.pitch, t: 0, hist: [], arot: [0, 0, 0], w: [0, 0, 0], cf: [S.roll, S.pitch], jolt: -1, Rprev: null };
    const torso = rb.linkIndex.torso, IMU = [0.13, 0, 0.2];
    const imuPose = () => { const l = rb.links[torso]; return { p: V.add(l.pw, M.mulv(l.Rw, IMU)), R: l.Rw }; };
    const K = 0.024; // metres of arrow per m/s² (g₀ → 0.24 m, so the reading ends in front of the face)

    // ---- poses
    function poseTilt(n = 30) {
      const R0 = M.rpy(X.phi, X.th, 0), cen = [(fh.l_foot.p[0] + fh.r_foot.p[0]) / 2, 0];
      R3.solve(rb, () => {
        const b = rb.pointJac(0, [0, 0, 0]);
        return [[rb.taskPose("l_foot", fh.l_foot.p, fh.l_foot.R), rb.taskPose("r_foot", fh.r_foot.p, fh.r_foot.R)], [{ J: b.Jw, e: M.log(M.mul(R0, M.T(rb.base.R))) }, rb.taskCom(cen), { J: [b.Jv[2]], e: [home.p[2] - 0.01 - rb.base.p[2]] }], [rb.taskPosture(home.q, { gain: 0.3 })]];
      }, n, { lockJoints: lock });
    }
    // odometry: left foot in stance (slid by `slip` since touch-down), right foot swinging 6 cm up
    const tdL = fh.l_foot.p.slice();
    const footTrue = () => [tdL[0] + S.slip, tdL[1], tdL[2]];
    function poseOdo(n = 30) {
      const R0 = M.rpy(S.roll, S.pitch, 0), pb = [home.p[0] + 0.1 * S.phase, home.p[1] + 0.05, home.p[2] - 0.015], sw = V.add(fh.r_foot.p, [0.06 * S.phase, 0, 0.06]);
      R3.solve(rb, () => [[rb.taskPose("l_foot", footTrue(), fh.l_foot.R), rb.taskPose("r_foot", sw, fh.r_foot.R)], baseTask(rb, pb, R0), [rb.taskPosture(home.q, { gain: 0.3 })]], n, { lockJoints: lock });
    }

    // ---- one step of the tilt simulation (dt > 0): the trunk follows the sliders, the IMU feels its own motion
    const jolt = (t) => (X.jolt >= 0 && t - X.jolt >= 0 && t - X.jolt <= 0.5 ? 3 * Math.sin((Math.PI * (t - X.jolt)) / 0.5) : 0);
    const accNow = () => [S.acc[0] + jolt(X.t) + X.arot[0], S.acc[1] + X.arot[1], X.arot[2]];
    function stepTilt(dt) {
      X.t += dt;
      const thT = S.pitch + (S.sway ? (8 / DEG) * Math.sin(2 * Math.PI * 0.4 * X.t) : 0), k = 1 - Math.exp(-dt / 0.18);
      X.phi += (S.roll - X.phi) * k; X.th += (thT - X.th) * k;
      const Rold = rb.base.R.map((r) => r.slice());
      poseTilt(6);
      const ip = imuPose();
      // gyro: body angular velocity ω_m = R_WSᵀ ω, ω from the change of orientation over the step
      const wW = V.scale(M.log(M.mul(ip.R, M.T(Rold))), 1 / dt);
      X.w = M.mulv(M.T(ip.R), wW);
      // the IMU point's own acceleration (lever arm from the hips and ankles), second difference, lightly smoothed
      X.hist.push({ t: X.t, p: ip.p }); if (X.hist.length > 3) X.hist.shift();
      if (X.hist.length === 3) {
        const [a, b, c] = X.hist, v1 = V.scale(V.sub(b.p, a.p), 1 / (b.t - a.t)), v2 = V.scale(V.sub(c.p, b.p), 1 / (c.t - b.t)), raw = V.scale(V.sub(v2, v1), 2 / (c.t - a.t));
        X.arot = V.lerp(X.arot, raw, 1 - Math.exp(-dt / 0.05));
      }
      // complementary filter: integrate the gyro, pull toward the accelerometer tilt with time constant τ = 1 s
      const m = accelReading(ip.R, accNow()), ta = tiltFromAcc(m), rt = eulerRates(X.cf[0], X.cf[1], X.w), al = 1 / (1 + dt / S.tau);
      X.cf = [0, 1].map((i) => al * (X.cf[i] + rt[i] * dt) + (1 - al) * ta[i]);
    }
    const settledTilt = () => {
      if (S.sway || (X.jolt >= 0 && X.t - X.jolt < 0.6)) return false;
      if (Math.abs(S.roll - X.phi) > 2e-4 || Math.abs(S.pitch - X.th) > 2e-4 || V.norm(X.arot) > 0.004 || V.norm(X.w) > 0.002) return false;
      if (S.filter) { const ta = tiltFromAcc(accelReading(imuPose().R, accNow())); if (Math.abs(ta[0] - X.cf[0]) > 0.0015 || Math.abs(ta[1] - X.cf[1]) > 0.0015) return false; }
      return true;
    };

    const CAM = { tilt: { target: [0.05, -0.12, 0.78], dist: 3.3, yaw: 0.3, pitch: 0.12 }, odometry: { target: [0.0, 0.05, 0.8], dist: 3.9, yaw: 2.75, pitch: 0.15 } };
    const view = ui.view({ height: 440, ...CAM[S.mode], draw(g, dt) {
      if (S.mode === "tilt") drawTilt(g, dt); else drawOdo(g, dt);
    } });

    function drawTilt(g, dt) {
      if (dt > 0 && view.animating) { stepTilt(dt); if (settledTilt()) { X.arot = [0, 0, 0]; X.w = [0, 0, 0]; X.hist = []; X.jolt = -1; view.animate(false); syncBtns(); } }
      const ip = imuPose(), R = ip.R, c = ip.p, a = accNow(), m = accelReading(R, a), ta = tiltFromAcc(m);
      g.robot(rb);
      // the IMU and its sensor frame S (aligned with the base frame B: the waist joints are at zero)
      g.box(c, R, [0.03, 0.07, 0.05], P.joint);
      g.frame(c, R, 0.12, { w: 3, onTop: true, names: ["$x_S$", "$y_S$", "$z_S$"] });
      // gravity in the world: straight down; the reading: a − g in the world = R a_m, decomposed along the sensor axes
      const gp = V.add(c, [-0.34, -0.3, 0.12]);
      g.arrow(gp, V.add(gp, [0, 0, -G * K]), P.gravity, { w: 5, onTop: true, label: L("$g$ (world, straight down)", "$g$（世界系，竖直向下）"), labelOpt: { small: true, dx: 8 } });
      const am = M.mulv(R, m), tip = V.add(c, V.scale(am, K));
      g.arrow(c, tip, ink, { w: 5, onTop: true, label: "$a_m$", labelOpt: { dx: -24, dy: -10 } });
      let s = c;
      for (let i = 0; i < 3; i++) { const e = [R[0][i], R[1][i], R[2][i]], b = V.add(s, V.scale(e, m[i] * K)); if (Math.abs(m[i]) > 0.05) g.line(s, b, [P.x, P.y, P.z][i], { w: 2.5, dash: 0.018, onTop: true }); s = b; }
      // true tilt: the angle between the world vertical and z_S; the accelerometer believes "up" is along a_m
      const zS = [R[0][2], R[1][2], R[2][2]];
      g.line(c, V.add(c, [0, 0, 0.34]), P.ghost, { w: 1.5, dash: 0.02, onTop: true });
      const tilt = Math.acos(clamp(zS[2], -1, 1)), err = Math.acos(clamp(V.dot(V.unit(am), [0, 0, 1]), -1, 1));
      arc(g, c, [0, 0, 1], zS, 0.17, P.ghost, { label: `${nf(tilt * DEG, 1)}°`, labelOpt: { dx: 4, dy: -10 } });
      if (err > 0.5 / DEG) arc(g, c, [0, 0, 1], am, 0.29, P.force, { w: 2.5, label: L(`error ${nf(err * DEG, 1)}°`, `误差 ${nf(err * DEG, 1)}°`), labelOpt: { dx: 10, dy: 4 } });
      // gyro: the angular velocity while the trunk turns
      const wn = V.norm(X.w);
      if (wn > 0.02) g.turn(V.add(c, V.scale(M.mulv(R, V.unit(X.w)), 0.05)), M.mulv(R, X.w), 0.07, 1, P.velocity, { w: 3, onTop: true, sweep: Math.min(1.8 * Math.PI, 0.6 + 4 * wn), label: `$\\omega_m$` });
      // the robot's acceleration, drawn at the pelvis
      const ah = [a[0] - X.arot[0], a[1] - X.arot[1]], an = Math.hypot(...ah);
      if (an > 0.02) { const d = [ah[0] / an, ah[1] / an, 0], pb = V.add(rb.base.p, V.scale(d, 0.14)); g.arrow(pb, V.add(pb, V.scale(d, 0.05 + 0.06 * an)), P.velocity, { w: 5, onTop: true, label: `$a = ${nf(an, 1)}$ m/s²`, labelOpt: { small: true } }); }
      // complementary filter: where it believes "up" is (in the world, so it can be compared with the vertical)
      if (S.filter) {
        const Rcf = M.rpy(X.cf[0], X.cf[1], 0), up = M.mulv(R, M.mulv(M.T(Rcf), [0, 0, 1]));
        g.line(c, V.add(c, V.scale(up, 0.32)), P.dcm, { w: 3, onTop: true });
        g.label(V.add(c, V.scale(up, 0.33)), L("filter", "滤波"), { color: P.dcm, small: true, anchor: "right", dx: -8 });
      }
      // ---- words and numbers
      const ef = [ta[0] - X.phi, ta[1] - X.th].map((x) => x * DEG), aH = Math.hypot(a[0], a[1]);
      const lines = [
        L(`accelerometer: $a_m = {R_{WS}}^{\\top}(a - g) = ${tup(m, 2)}$ m/s², $\\|a_m\\| = ${nf(V.norm(m), 2)}$ m/s² — at rest $a = 0$, so it reads $-g$: $g_0 = 9.81$ m/s² pointing up, the floor's push, not the pull of gravity`,
          `加速度计：$a_m = {R_{WS}}^{\\top}(a - g) = ${tup(m, 2)}$ m/s²，$\\|a_m\\| = ${nf(V.norm(m), 2)}$ m/s²——静止时 $a = 0$，读数就是 $-g$：向上的 $g_0 = 9.81$ m/s²，是地面的支撑，而不是重力的“拉”`),
        L(`gyro: $\\omega_m = {R_{WS}}^{\\top}\\,\\omega = ${tup(X.w, 2)}$ rad/s${wn > 0.002 ? "" : " (the trunk is not turning)"}`, `陀螺仪：$\\omega_m = {R_{WS}}^{\\top}\\,\\omega = ${tup(X.w, 2)}$ rad/s${wn > 0.002 ? "" : "（躯干没有转动）"}`),
        L(`tilt from the accelerometer: $\\hat\\phi = \\operatorname{atan2}(a_y, a_z) = ${nf(ta[0] * DEG, 1)}°$, $\\hat\\theta = \\operatorname{atan2}(-a_x, \\sqrt{a_y^2 + a_z^2}) = ${nf(ta[1] * DEG, 1)}°$ · true roll $\\phi = ${nf(X.phi * DEG, 1)}°$, pitch $\\theta = ${nf(X.th * DEG, 1)}°$ · error ${nf(ef[0], 1)}°, ${nf(ef[1], 1)}°`,
          `由加速度计得到的倾角：$\\hat\\phi = \\operatorname{atan2}(a_y, a_z) = ${nf(ta[0] * DEG, 1)}°$，$\\hat\\theta = \\operatorname{atan2}(-a_x, \\sqrt{a_y^2 + a_z^2}) = ${nf(ta[1] * DEG, 1)}°$ · 真实横滚 $\\phi = ${nf(X.phi * DEG, 1)}°$，俯仰 $\\theta = ${nf(X.th * DEG, 1)}°$ · 误差 ${nf(ef[0], 1)}°、${nf(ef[1], 1)}°`),
        aH > 0.02 ? L(`with $a \\ne 0$ the reading leans away from the vertical by $\\arctan(\\|a_h\\| / g_0) = \\arctan(${nf(aH, 2)} / 9.81) = ${nf(Math.atan(aH / G) * DEG, 1)}°$ (upright trunk) — the accelerometer cannot tell a push from a tilt${V.norm(X.arot) > 0.02 ? L("; $a$ includes the IMU's own acceleration as the trunk turns", "") : ""}`,
          `$a \\ne 0$ 时读数偏离竖直方向 $\\arctan(\\|a_h\\| / g_0) = \\arctan(${nf(aH, 2)} / 9.81) = ${nf(Math.atan(aH / G) * DEG, 1)}°$（躯干直立时）——加速度计分不清是被推了还是倾斜了${V.norm(X.arot) > 0.02 ? "；$a$ 里也包含躯干转动时 IMU 自身的加速度" : ""}`) : null,
        S.filter ? L(`complementary filter $\\hat\\theta_{cf} \\leftarrow \\alpha\\,(\\hat\\theta_{cf} + \\dot\\theta_{gyro}\\,\\Delta t) + (1 - \\alpha)\\,\\hat\\theta_{acc}$, $\\alpha = \\frac{\\tau}{\\tau + \\Delta t}$, $\\tau = ${S.tau}$ s: roll ${nf(X.cf[0] * DEG, 1)}°, pitch ${nf(X.cf[1] * DEG, 1)}° (error ${nf((X.cf[0] - X.phi) * DEG, 1)}°, ${nf((X.cf[1] - X.th) * DEG, 1)}°)`,
          `互补滤波 $\\hat\\theta_{cf} \\leftarrow \\alpha\\,(\\hat\\theta_{cf} + \\dot\\theta_{gyro}\\,\\Delta t) + (1 - \\alpha)\\,\\hat\\theta_{acc}$，$\\alpha = \\frac{\\tau}{\\tau + \\Delta t}$，$\\tau = ${S.tau}$ s：横滚 ${nf(X.cf[0] * DEG, 1)}°，俯仰 ${nf(X.cf[1] * DEG, 1)}°（误差 ${nf((X.cf[0] - X.phi) * DEG, 1)}°、${nf((X.cf[1] - X.th) * DEG, 1)}°）`) : null,
      ];
      ui.say(lines);
      const eMax = Math.max(Math.abs(ef[0]), Math.abs(ef[1])), cfE = Math.max(Math.abs(X.cf[0] - X.phi), Math.abs(X.cf[1] - X.th)) * DEG;
      const pushed = Math.hypot(S.acc[0] + jolt(X.t), S.acc[1]) > 0.02;
      if (!pushed && eMax >= 0.3 && eMax < 3) ui.status(L(`the trunk's own motion adds ${nf(eMax, 1)}°: the IMU sits away from the centre of rotation`, `躯干自身的运动带来 ${nf(eMax, 1)}° 误差：IMU 不在转动中心上`), "warn");
      else if (eMax < 0.3) ui.status(L("no acceleration: the accelerometer gives the tilt exactly", "没有加速度：加速度计给出的倾角是准的"), "ok");
      else if (S.filter && cfE < 0.5 * eMax) ui.status(L(`accelerometer off by ${nf(eMax, 1)}°, the filter only by ${nf(cfE, 1)}° — it trusts the gyro over short times`, `加速度计偏了 ${nf(eMax, 1)}°，滤波只偏了 ${nf(cfE, 1)}°——短时间内它信陀螺仪`), "warn");
      else ui.status(L(`fooled: the acceleration looks like a tilt of ${nf(eMax, 1)}°`, `被骗了：加速度看起来像倾斜了 ${nf(eMax, 1)}°`), "bad");
    }

    function drawOdo(g, dt) {
      if (dt > 0 && view.animating) { S.t = (S.t || 0) + dt; S.phase = Math.sin(2 * Math.PI * 0.35 * S.t); poseOdo(6); phS.set(S.phase * 100); }
      const R = rb.base.R, pB = rb.base.p.slice(), pf = rb.framePose("l_foot").p, fkq = M.mulv(M.T(R), V.sub(pf, pB)), Rfk = M.mulv(R, fkq);
      const pHat = V.sub(tdL, Rfk), drift = V.sub(pHat, pB);
      // the estimate: the whole robot where the estimator believes it is (translucent)
      if (V.norm(drift) > 1e-3) { const s0 = R3.snapshot(rb); rb.base.p = V.add(rb.base.p, drift); rb.fk(); g.robot(rb, { alpha: 0.28, color: () => P.ghost }); R3.restore(rb, s0); }
      g.robot(rb);
      // touch-down footprint (where the estimator thinks the foot is) and the slip
      const fc = rb.frameCorners("l_foot").map((q) => [q[0] - S.slip, q[1], 0.003]);
      g.polyline(fc, P.ghost, { w: 2, dash: 0.02, closed: true, ground: true });
      g.label([tdL[0] - 0.08, tdL[1] + 0.06, 0], L("touch-down", "落地处"), { small: true, color: P.ghost, dy: 14 });
      if (Math.abs(S.slip) > 0.002) g.arrow([tdL[0], tdL[1] + 0.09, 0.01], [pf[0], tdL[1] + 0.09, 0.01], P.force, { w: 4, label: L(`slip ${nf(100 * S.slip, 1)} cm`, `打滑 ${nf(100 * S.slip, 1)} cm`), labelOpt: { small: true } });
      // the chain foot → ankle → knee → hip → pelvis and the vector it gives
      const pts = [pf, rb.links[rb.linkIndex.l_ankle_link].pw, rb.links[rb.linkIndex.l_shank].pw, rb.links[rb.linkIndex.l_thigh].pw, rb.links[rb.linkIndex.l_hip_yaw_link].pw, pB];
      g.polyline(pts, CHAIN, { w: 5, onTop: true });
      for (const q of pts.slice(1, -1)) g.sphere(q, 0.022, CHAIN, { onTop: true });
      [[1, L("ankle", "踝")], [2, L("knee", "膝")], [3, L("hip", "髋")]].forEach(([i, t]) => g.label(pts[i], t, { color: CHAIN, small: true, anchor: "right", dx: -10 }));
      g.arrow(pf, pB, CHAIN, { w: 2.5, alpha: 0.9, onTop: true });
      g.label(V.lerp(pf, pB, 0.55), "$-R_{WB}\\,\\mathrm{fk}(q)$", { color: CHAIN, small: true, cls: "bg", dx: 14 });
      g.sphere(pB, 0.03, P.com, { onTop: true }); g.label(pB, "$p_B$", { color: P.com, dx: 10, dy: -12 });
      if (V.norm(drift) > 1e-3) { g.sphere(pHat, 0.026, P.ghost, { onTop: true }); g.label(pHat, "$\\hat p_B$", { color: P.ghost, anchor: "right", dx: -10, dy: -12 }); g.line(pB, pHat, P.force, { w: 2.5, dash: 0.012, onTop: true }); }
      g.sphere(tdL, 0.016, CHAIN, { onTop: true }); g.label(tdL, "$p_{foot}$", { color: CHAIN, small: true, anchor: "right", dx: -8, dy: 12 });
      const e = V.norm(drift);
      ui.say([
        L(`leg odometry: $\\hat p_B = p_{foot} - R_{WB}\\,\\mathrm{fk}(q) = ${tup(tdL, 3)} - ${tup(Rfk, 3)} = ${tup(pHat, 3)}$ m`, `腿式里程计：$\\hat p_B = p_{foot} - R_{WB}\\,\\mathrm{fk}(q) = ${tup(tdL, 3)} - ${tup(Rfk, 3)} = ${tup(pHat, 3)}$ m`),
        L(`$\\mathrm{fk}(q) = ${tup(fkq, 3)}$ m is the stance foot in the base frame, from the joint encoders; $R_{WB}$ (roll ${nf(S.roll * DEG, 0)}°, pitch ${nf(S.pitch * DEG, 0)}°) comes from the IMU and turns it into the world; $p_{foot}$ is where the foot touched down`, `$\\mathrm{fk}(q) = ${tup(fkq, 3)}$ m 是支撑脚在基座坐标系里的位置，由关节编码器算出；$R_{WB}$（横滚 ${nf(S.roll * DEG, 0)}°，俯仰 ${nf(S.pitch * DEG, 0)}°）来自 IMU，把它转到世界坐标系；$p_{foot}$ 是脚落地的位置`),
        L(`true base $p_B = ${tup(pB, 3)}$ m · error $\\|\\hat p_B - p_B\\| = ${nf(100 * e, 1)}$ cm $=$ slip $|\\Delta| = ${nf(100 * Math.abs(S.slip), 1)}$ cm`, `真实基座 $p_B = ${tup(pB, 3)}$ m · 误差 $\\|\\hat p_B - p_B\\| = ${nf(100 * e, 1)}$ cm $=$ 打滑量 $|\\Delta| = ${nf(100 * Math.abs(S.slip), 1)}$ cm`),
      ]);
      if (e < 1e-3) ui.status(L("no slip: the leg gives the base position exactly", "没有打滑：腿给出的基座位置是准的"), "ok");
      else ui.status(L(`the foot slid ${nf(100 * Math.abs(S.slip), 1)} cm: the estimate is off by exactly that, and nothing in $q$ shows it`, `脚滑了 ${nf(100 * Math.abs(S.slip), 1)} cm：估计值正好偏了这么多，而关节角 $q$ 里看不出来`), "bad");
    }

    // ---- controls
    const tiltC = h("div", { class: "viz-ctrls-group", style: "display: contents" }), odoC = h("div", { style: "display: contents" });
    const go = () => { if (S.mode === "tilt") { view.animate(true); syncBtns(); } else { poseOdo(); view.redraw(); } };
    ui.seg([["tilt", L("tilt from the IMU", "IMU 测倾角")], ["odometry", L("leg odometry", "腿式里程计")]], S.mode, (v) => { S.mode = v; S.swing = false; S.sway = false; view.animate(false); view.setView(CAM[v], true); layout(); if (v === "tilt") { X.phi = S.roll; X.th = S.pitch; X.cf = [S.roll, S.pitch]; poseTilt(40); } else poseOdo(40); syncBtns(); view.redraw(); });
    slide(ui, L("roll $\\phi$ (°, > 0 leans right)", "横滚 $\\phi$（°，> 0 向右倾）"), { min: -15, max: 15, step: 1, value: S.roll * DEG }, (v) => { S.roll = v / DEG; go(); }, (v) => nf(v, 0));
    slide(ui, L("pitch $\\theta$ (°, > 0 leans forward)", "俯仰 $\\theta$（°，> 0 前倾）"), { min: -20, max: 25, step: 1, value: S.pitch * DEG }, (v) => { S.pitch = v / DEG; go(); }, (v) => nf(v, 0));
    ui.ctrls.append(tiltC, odoC);
    const into = (box, el) => { box.append(el); return el; };
    for (const i of [0, 1]) into(tiltC, slide(ui, L(`acceleration $a_${"xy"[i]}$ (m/s²)`, `加速度 $a_${"xy"[i]}$（m/s²）`), { min: -5, max: 5, step: 0.1, value: S.acc[i] }, (v) => { S.acc[i] = v; go(); }, (v) => nf(v, 1)));
    const swayB = into(tiltC, ui.btn("▶ " + L("sway", "摇摆"), () => { S.sway = !S.sway; go(); }));
    into(tiltC, ui.btn(L("jolt forward", "向前一顿"), () => { X.jolt = X.t; go(); }));
    into(tiltC, ui.toggle(L("complementary filter", "互补滤波"), S.filter, (on) => { S.filter = on; if (on) X.cf = [X.phi, X.th]; legend(); go(); }));
    const phS = into(odoC, slide(ui, L("stance phase: base behind → ahead of the foot (%)", "支撑相：基座从脚后方到前方 (%)"), { min: -100, max: 100, step: 1, value: 0 }, (v) => { S.phase = v / 100; poseOdo(); view.redraw(); }, (v) => nf(v, 0)));
    into(odoC, slide(ui, L("foot slips by $\\Delta$ (cm)", "脚打滑 $\\Delta$ (cm)"), { min: -10, max: 10, step: 0.5, value: S.slip * 100 }, (v) => { S.slip = v / 100; poseOdo(); view.redraw(); }, (v) => nf(v, 1)));
    const walkB = into(odoC, ui.btn("▶ " + L("walk over the foot", "走过支撑脚"), () => { S.swing = !S.swing; view.animate(S.swing); syncBtns(); if (!S.swing) view.redraw(); }));
    function syncBtns() { swayB.textContent = (S.sway ? "❚❚ " : "▶ ") + L("sway", "摇摆"); walkB.textContent = (S.swing && view.animating ? "❚❚ " : "▶ ") + L("walk over the foot", "走过支撑脚"); }
    function layout() { tiltC.style.display = S.mode === "tilt" ? "contents" : "none"; odoC.style.display = S.mode === "odometry" ? "contents" : "none"; legend(); caption(); }
    function legend() {
      ui.legend(S.mode === "tilt" ? [[P.x, L("sensor frame $S$ ($x$ red, $y$ green, $z$ blue)", "传感器坐标系 $S$（$x$ 红、$y$ 绿、$z$ 蓝）")], [P.gravity, L("gravity $g$ (world)", "重力加速度 $g$（世界系）")], [ink, L("accelerometer reading $a_m$ (specific force), dashed: its components", "加速度计读数 $a_m$（比力），虚线是它的分量")], [P.velocity, L("acceleration $a$, gyro $\\omega_m$", "加速度 $a$、陀螺仪 $\\omega_m$")], [P.force, L("tilt error of the accelerometer", "加速度计的倾角误差")], ...(S.filter ? [[P.dcm, L("complementary filter's \"up\"", "互补滤波认为的“上”")]] : [])]
        : [[CHAIN, L("stance leg's chain foot → ankle → knee → hip → base", "支撑腿的链：脚 → 踝 → 膝 → 髋 → 基座")], [P.com, L("true base $p_B$", "真实基座 $p_B$")], [P.ghost, L("estimated base $\\hat p_B$ and the robot there", "估计的基座 $\\hat p_B$ 及对应的机器人")], [P.force, L("slip and estimate error", "打滑和估计误差")]]);
    }
    function caption() {
      ui.caption(S.mode === "tilt"
        ? L("Do: tilt the trunk, then give the robot a horizontal acceleration (or press jolt forward); press sway, and switch on the complementary filter. Notice: at rest the accelerometer reads $g_0$ pointing up in the sensor frame (the floor pushing), so its direction gives roll and pitch — but an acceleration adds to it, and $a_x = 1.7$ m/s² already looks like a tilt of about 10°. The gyro reads only while the trunk turns. The filter follows the gyro for quick changes and the accelerometer over seconds, so a short jolt hardly moves it; a sustained acceleration still pulls it off within a few $\\tau$.",
          "操作：让躯干倾斜，再给机器人一个水平加速度（或按“向前一顿”）；按“摇摆”，再打开互补滤波。观察：静止时加速度计在传感器坐标系里读到向上的 $g_0$（地面的支撑力），所以它的方向就给出横滚和俯仰——但加速度会叠加进来，$a_x = 1.7$ m/s² 看起来就已经像倾斜了约 10°。陀螺仪只有在躯干转动时才有读数。互补滤波对快速变化跟陀螺仪，对几秒钟的趋势跟加速度计，所以短暂的一顿几乎骗不了它；持续的加速度在几个 $\\tau$ 之后仍会把它带偏。")
        : L("Do: move the stance phase (or press walk) and slide the foot. Notice: the base position comes from the stance foot's touch-down point and the leg's forward kinematics, $\\hat p_B = p_{foot} - R_{WB}\\,\\mathrm{fk}(q)$, exact whatever the posture; when the foot slips the joint angles cannot see it, so the estimate (grey robot) is off by exactly the slip — which is why leg odometry is fused with the IMU and a contact detector in a Kalman filter.",
          "操作：拖动支撑相（或按“走过支撑脚”），再让脚打滑。观察：基座位置由支撑脚的落地点和腿的正运动学给出，$\\hat p_B = p_{foot} - R_{WB}\\,\\mathrm{fk}(q)$，无论姿态如何都是准的；脚一打滑，关节角里看不出来，估计值（灰色机器人）正好偏离打滑的距离——所以腿式里程计要和 IMU、接触检测一起放进卡尔曼滤波里融合。"));
    }
    layout(); syncBtns();
    if (S.mode === "tilt") poseTilt(60); else poseOdo(60);
    view.redraw();
    if (S.mode === "tilt" && Math.hypot(...S.acc) > 0 && S.filter) { X.cf = [X.phi, X.th]; view.animate(true); syncBtns(); }
  });

  // ------------------------------------------------------------------ reference motions (joint angles, procedural)
  // Every motion starts from the home pose at t = 0 and is periodic; ω is its main frequency (rad/s).
  const MOTIONS = {
    squat: { T: 2.4, w: (2 * Math.PI) / 2.4, t0: 0.75 },
    wave: { T: 4, w: 2 * Math.PI * 1.2, t0: 1.75 },
    step: { T: 1.6, w: (2 * Math.PI) / 1.6, t0: 0.5 },
  };
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  function motionQ(rb, name, t) {
    const q = Float64Array.from(rb.qHome), J = (n, v) => { q[rb.ji(n)] = v; };
    t = Math.max(0, t);
    if (name === "squat") {
      const s = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / MOTIONS.squat.T), a = 0.55 * s;
      for (const sd of ["l", "r"]) { J(sd + "_hip_pitch", -0.4 - a); J(sd + "_knee", 0.8 + 2 * a); J(sd + "_ankle_pitch", -0.4 - a); J(sd + "_shoulder_pitch", -1.3 * s); }
    } else if (name === "wave") {
      const u = t % MOTIONS.wave.T, s = smooth(u / 0.8) * (1 - smooth((u - 3.2) / 0.8));
      J("r_shoulder_pitch", -1.25 * s); J("r_shoulder_roll", -0.12 - 0.7 * s); J("r_elbow", -0.4 - (1.0 + 0.45 * Math.sin(2 * Math.PI * 1.2 * t)) * s);
    } else {
      const u = Math.sin((2 * Math.PI * t) / MOTIONS.step.T), sw = Math.min(1, t / 0.4), lL = Math.max(0, u) * sw, lR = Math.max(0, -u) * sw, psi = 0.08 * (lL - lR);
      for (const [sd, l] of [["l", lL], ["r", lR]]) { J(sd + "_hip_pitch", -0.4 - 0.7 * l); J(sd + "_knee", 0.8 + 1.3 * l); J(sd + "_ankle_pitch", -0.4 - 0.6 * l); J(sd + "_hip_roll", psi); J(sd + "_ankle_roll", -psi); }
      J("l_shoulder_pitch", 0.35 * (lL - lR)); J("r_shoulder_pitch", -0.35 * (lL - lR));
    }
    return q;
  }
  // Put a robot (or the human) on the floor: the lower foot keeps its home sole position, the pelvis stays upright.
  function placer(rb) {
    rb.home();
    const soles = { l_foot: rb.framePose("l_foot").p, r_foot: rb.framePose("r_foot").p }, z0 = (soles.l_foot[2] + soles.r_foot[2]) / 2;
    rb.base.p = V.sub(rb.base.p, [0, 0, z0]); rb.fk();
    const home = { l_foot: rb.framePose("l_foot").p, r_foot: rb.framePose("r_foot").p }, base0 = rb.base.p.slice();
    return (q, offset = [0, 0, 0]) => {
      rb.q.set(q); rb.base.R = M.I(); rb.base.p = base0.slice(); rb.fk();
      const l = rb.framePose("l_foot").p, r = rb.framePose("r_foot").p, f = l[2] <= r[2] + 1e-9 ? "l_foot" : "r_foot", p = f === "l_foot" ? l : r;
      rb.base.p = V.add(V.add(rb.base.p, V.sub(home[f], p)), offset); rb.fk();
    };
  }
  const KP = ["l_hand", "r_hand", "l_foot", "r_foot", "head", "pelvis"];
  const kpName = (k) => ({ l_hand: L("left hand", "左手"), r_hand: L("right hand", "右手"), l_foot: L("left foot", "左脚"), r_foot: L("right foot", "右脚"), head: L("head", "头"), pelvis: L("pelvis", "骨盆") }[k]);
  // a human with the robot's joints but longer legs and shorter arms (thigh 0.48, shank 0.46, upper arm 0.27, forearm 0.25 m)
  function buildHuman() {
    const hb = rob.build("humanoid"), lk = (n) => hb.links[hb.linkIndex[n]];
    for (const s of ["l", "r"]) {
      lk(s + "_hip_yaw_link").joint.origin = [0, (s === "l" ? 1 : -1) * 0.09, -0.04];
      lk(s + "_shank").joint.origin = [0, 0, -0.48]; lk(s + "_ankle_link").joint.origin = [0, 0, -0.46];
      lk(s + "_forearm").joint.origin = [0, 0, -0.27]; hb.frames[s + "_hand"].p = [0, 0, -0.25];
    }
    hb.fk();
    return hb;
  }
  function drawHuman(g, hb, col) {
    const p = (n) => hb.links[hb.linkIndex[n]].pw, r = 0.024;
    const seg = (a, b) => g.capsule(a, b, r, col);
    for (const s of ["l", "r"]) {
      const hip = p(s + "_hip_yaw_link"), knee = p(s + "_shank"), ank = p(s + "_ankle_link"), fp = hb.framePose(s + "_foot"), toe = V.add(fp.p, M.mulv(fp.R, [0.11, 0, 0.01])), heel = V.add(fp.p, M.mulv(fp.R, [-0.1, 0, 0.01]));
      seg(p("pelvis"), hip); seg(hip, knee); seg(knee, ank); seg(ank, toe); seg(ank, heel); seg(heel, toe);
      const sh = p(s + "_shoulder_pitch_link"), el = p(s + "_forearm"), hd = hb.framePose(s + "_hand").p;
      seg(V.add(p("torso"), M.mulv(hb.links[hb.linkIndex.torso].Rw, [0, 0, 0.34])), sh); seg(sh, el); seg(el, hd); g.sphere(hd, 0.035, col);
    }
    const tor = hb.links[hb.linkIndex.torso], neck = V.add(tor.pw, M.mulv(tor.Rw, [0, 0, 0.4]));
    seg(p("pelvis"), neck); g.sphere(hb.framePose("head").p, 0.1, col);
  }

  // ================================================================== track
  // Motion tracking and retargeting.
  // cfg:
  //   mode    "track" | "retarget"   "track" (default): a reference ghost and the robot following it;
  //                                  "retarget": a human demonstration, copy joint angles or match key points
  //   motion  "squat" | "wave" | "step"   reference motion (default "squat")
  //   gain    number 1/s   8         tracking gain K of the first-order lag q̇ = K (q_ref(t − d) − q), 1…30
  //   delay   number s     0         delay d of the reference reaching the robot, 0…0.3
  //   k       number       40        reward sharpness in r = exp(−k ē²) (ē in m), 1…200
  //   autoplay bool        false     start playing at once (otherwise paused at a moment that shows the lag)
  //   view, height, caption          as for every robot3d scene
  R3.scene("track", (ui, cfg) => {
    const P = ui.P, mode0 = cfg.mode === "retarget" ? "retarget" : "track";
    const S = { mode: mode0, motion: MOTIONS[cfg.motion] ? cfg.motion : "squat", K: clamp(num(cfg.gain, 8), 1, 30), d: clamp(num(cfg.delay, 0), 0, 0.3), k: clamp(num(cfg.k, 40), 1, 200), match: false, t: 0 };
    const ref = rob.build("humanoid"), bot = rob.build("humanoid"), hum = buildHuman(), ikb = rob.build("humanoid");
    const placeRef = placer(ref), placeBot = placer(bot), placeHum = placer(hum), placeIk = placer(ikb);
    const HUMAN = document.documentElement.dataset.theme === "dark" ? "#d6a77f" : "#b8784a", OFF = [0, 0.95, 0];
    let qf = Float64Array.from(bot.qHome);
    // the follower's joints after simulating the lag up to time t (fixed 1/120 s steps; the lag forgets in ~5/K s)
    function simulate(t) {
      const t0 = Math.max(0, t - 4), dt = 1 / 120, n = Math.ceil((t - t0) / dt);
      qf = motionQ(bot, S.motion, t0 - S.d);
      for (let i = 1; i <= n; i++) { const ti = Math.min(t, t0 + i * dt), h_ = ti - (t0 + (i - 1) * dt), qr = motionQ(bot, S.motion, ti - S.d), a = 1 - Math.exp(-S.K * h_); for (let j = 0; j < qf.length; j++) qf[j] += a * (qr[j] - qf[j]); }
    }
    const stepLag = (dt) => { const qr = motionQ(bot, S.motion, S.t - S.d), a = 1 - Math.exp(-S.K * dt); for (let j = 0; j < qf.length; j++) qf[j] += a * (qr[j] - qf[j]); };
    // retargeting by IK: feet first (pose), then hands (position), then the human's joint angles
    function retargetIK(n) {
      const tg = (f) => V.add(hum.framePose(f).p, OFF);
      R3.solve(ikb, () => [[ikb.taskPose("l_foot", tg("l_foot"), hum.framePose("l_foot").R), ikb.taskPose("r_foot", tg("r_foot"), hum.framePose("r_foot").R)], [ikb.taskPos("l_hand", tg("l_hand")), ikb.taskPos("r_hand", tg("r_hand")), (() => { const b = ikb.pointJac(0, [0, 0, 0]); return { J: b.Jw, e: M.log(M.T(ikb.base.R)) }; })()], [ikb.taskPosture(hum.q, { gain: 0.2 })]], n);
    }
    function poseAll(full) {
      const qr = motionQ(ref, S.motion, S.t);
      if (S.mode === "track") { placeRef(motionQ(ref, S.motion, S.t)); placeBot(qf); }
      else {
        placeHum(qr); placeBot(qr, V.scale(OFF, 1)); // copy angles: the robot gets the human's joint angles
        if (full) { placeIk(qr, OFF); retargetIK(60); } else retargetIK(5);
      }
    }
    const err = (A, B, off = [0, 0, 0]) => Object.fromEntries((A === hum ? KP.slice(0, 4) : KP).map((k) => [k, V.dist(V.add(A.framePose(k).p, off), B.framePose(k).p)]));
    let meter = null;

    const view = ui.view({ height: 440, target: S.mode === "track" ? [0.05, 0, 0.9] : [0.05, 0.45, 0.9], dist: S.mode === "track" ? 3.3 : 3.9, yaw: 1.15, pitch: 0.18, draw(g, dt) {
      if (dt > 0 && view.animating) { S.t += dt; if (S.mode === "track") stepLag(dt); poseAll(false); tS.set(S.t % MOTIONS[S.motion].T); }
      if (S.mode === "track") drawTrack(g); else drawRetarget(g);
    } });
    meter = h("div", { class: "r3-meter" }, h("div", { class: "r3-meter-lbl" }), h("div", { class: "r3-meter-bar" }, h("i")));
    view.wrap.append(meter);
    const setMeter = (r, show) => { meter.style.display = show ? "" : "none"; if (!show) return; const t = `$r = e^{-k\\bar e^2} = ${nf(r, 2)}$`; const lb = meter.firstChild; if (lb._t !== t) { math(lb, t); lb._t = t; } meter.querySelector("i").style.width = `${(100 * clamp(r, 0, 1)).toFixed(1)}%`; meter.querySelector("i").style.background = r > 0.7 ? "var(--green)" : r > 0.4 ? "var(--orange)" : "var(--red)"; };

    function drawTrack(g) {
      g.robot(ref, { alpha: 0.38, color: () => P.ghost, shadow: false });
      g.robot(bot);
      const e = err(ref, bot), mean = KP.reduce((s, k) => s + e[k], 0) / KP.length, r = Math.exp(-S.k * mean * mean);
      for (const k of KP) {
        const a = ref.framePose(k).p, b = bot.framePose(k).p;
        g.sphere(a, 0.022, P.target, { onTop: true }); g.sphere(b, 0.018, P.force, { onTop: true });
        if (e[k] > 0.01) { g.line(a, b, P.force, { w: 2.5, onTop: true }); g.label(V.lerp(a, b, 0.5), `${nf(100 * e[k], 0)} cm`, { color: P.force, small: true, dx: 8 }); }
      }
      setMeter(r, true);
      const mo = MOTIONS[S.motion], wK = mo.w / S.K, lag = (Math.atan(wK) + mo.w * S.d) * DEG;
      ui.say([
        L(`key-point errors $e_i = \\|p_i^{ref} - p_i\\|$: ${KP.map((k) => `${kpName(k)} ${nf(100 * e[k], 1)}`).join(", ")} cm · mean $\\bar e = ${nf(100 * mean, 1)}$ cm`, `关键点误差 $e_i = \\|p_i^{ref} - p_i\\|$：${KP.map((k) => `${kpName(k)} ${nf(100 * e[k], 1)}`).join("，")} cm · 平均 $\\bar e = ${nf(100 * mean, 1)}$ cm`),
        L(`reward $r = \\exp(-k\\,\\bar e^2) = \\exp(-${nf(S.k, 0)} \\times ${nf(mean, 3)}^2) = ${nf(r, 3)}$ (1 = perfect; DeepMimic uses this shape per term)`, `奖励 $r = \\exp(-k\\,\\bar e^2) = \\exp(-${nf(S.k, 0)} \\times ${nf(mean, 3)}^2) = ${nf(r, 3)}$（1 表示完美；DeepMimic 的每一项都是这种形式）`),
        L(`tracking: $\\dot q = K\\,(q_{ref}(t - d) - q)$, $K = ${nf(S.K, 0)}$ s⁻¹, $d = ${nf(S.d, 2)}$ s · on the motion's main frequency $\\omega = ${nf(mo.w, 1)}$ rad/s the robot lags by $\\arctan(\\omega / K) + \\omega d = ${nf(lag, 0)}°$ and moves $1/\\sqrt{1 + (\\omega/K)^2} = ${nf(100 / Math.sqrt(1 + wK * wK), 0)}$ % as far`, `跟踪：$\\dot q = K\\,(q_{ref}(t - d) - q)$，$K = ${nf(S.K, 0)}$ s⁻¹，$d = ${nf(S.d, 2)}$ s · 在这个动作的主频 $\\omega = ${nf(mo.w, 1)}$ rad/s 上，机器人滞后 $\\arctan(\\omega / K) + \\omega d = ${nf(lag, 0)}°$，幅度只有 $1/\\sqrt{1 + (\\omega/K)^2} = ${nf(100 / Math.sqrt(1 + wK * wK), 0)}$ %`),
      ]);
      ui.status(mean < 0.03 ? L(`tracking well: mean error ${nf(100 * mean, 1)} cm, reward ${nf(r, 2)}`, `跟得很好：平均误差 ${nf(100 * mean, 1)} cm，奖励 ${nf(r, 2)}`) : L(`lagging behind the reference: mean error ${nf(100 * mean, 1)} cm, reward ${nf(r, 2)}`, `落后于参考动作：平均误差 ${nf(100 * mean, 1)} cm，奖励 ${nf(r, 2)}`), mean < 0.03 ? "ok" : mean < 0.08 ? "warn" : "bad");
    }

    function drawRetarget(g) {
      drawHuman(g, hum, HUMAN);
      { const b = hum.base.p; g.label([b[0], b[1], 0], L("human (demonstration)", "人（示范）"), { color: HUMAN, small: true, anchor: "center", cls: "bg", dy: 22 }); }
      const shown = S.match ? ikb : bot;
      g.robot(shown);
      g.label([shown.base.p[0], shown.base.p[1], 0], S.match ? L("robot: key points matched (IK)", "机器人：匹配关键点（IK）") : L("robot: joint angles copied", "机器人：照抄关节角"), { small: true, anchor: "center", cls: "bg", dy: 22 });
      const eC = err(hum, bot, OFF), eI = err(hum, ikb, OFF), e = S.match ? eI : eC;
      for (const k of KP.slice(0, 4)) {
        const a = V.add(hum.framePose(k).p, OFF), b = shown.framePose(k).p;
        g.line(hum.framePose(k).p, a, P.ghost, { w: 1, dash: 0.03, alpha: 0.5 });
        g.sphere(a, 0.026, P.target, { onTop: true });
        if (e[k] > 0.01) { g.line(a, b, P.force, { w: 2.5, onTop: true }); g.label(V.lerp(a, b, 0.5), `${nf(100 * e[k], 0)} cm`, { color: P.force, small: true, dx: 8 }); }
      }
      setMeter(0, false);
      const list = (E) => KP.slice(0, 4).map((k) => `${kpName(k)} ${nf(100 * E[k], 1)}`).join(L(", ", "，"));
      ui.say([
        L(`limb lengths — human: thigh 0.48, shank 0.46, upper arm 0.27, forearm 0.25 m; robot: 0.42, 0.41, 0.28, 0.28 m`, `肢体长度——人：大腿 0.48、小腿 0.46、上臂 0.27、前臂 0.25 m；机器人：0.42、0.41、0.28、0.28 m`),
        L(`copy angles $q_{robot} = q_{human}$: errors $\\|p_i^{robot} - p_i^{human}\\|$ ${list(eC)} cm`, `照抄关节角 $q_{robot} = q_{human}$：误差 $\\|p_i^{robot} - p_i^{human}\\|$ ${list(eC)} cm`),
        L(`match key points by IK (feet first, then hands, then the human's angles): ${list(eI)} cm`, `用 IK 匹配关键点（先脚，再手，最后贴近人的关节角）：${list(eI)} cm`),
      ]);
      const mx = Math.max(...KP.slice(0, 4).map((k) => e[k]));
      ui.status(S.match ? (mx < 0.02 ? L("key points matched: hands and feet where the human's are", "关键点对上了：手和脚都在人的位置") : L(`matched as far as the robot can reach (worst ${nf(100 * mx, 0)} cm)`, `尽机器人所能匹配（最大误差 ${nf(100 * mx, 0)} cm）`)) : L(`same angles, different limbs: hands and feet up to ${nf(100 * mx, 0)} cm off`, `关节角相同、肢体不同：手脚最多偏 ${nf(100 * mx, 0)} cm`), S.match ? (mx < 0.02 ? "ok" : "warn") : "bad");
    }

    // ---- controls
    let playing = false;
    const playB = ui.btn("▶ " + Viz.util.T().play, () => { playing = !playing; view.animate(playing); syncPlay(); if (!playing) { poseAll(true); view.redraw(); } }, "primary");
    const syncPlay = () => { playB.textContent = (playing ? "❚❚ " + Viz.util.T().pause : "▶ " + Viz.util.T().play); };
    const reset = (full = true) => { if (S.mode === "track") simulate(S.t); poseAll(full); view.redraw(); };
    ui.seg([["track", L("track a reference", "跟踪参考动作")], ["retarget", L("retarget a human", "人到机器人的重定向")]], S.mode, (v) => { S.mode = v; view.setView(v === "track" ? { target: [0.05, 0, 0.9], dist: 3.3 } : { target: [0.05, 0.45, 0.9], dist: 3.9 }, true); layout(); reset(); });
    ui.seg([["squat", L("squat", "下蹲")], ["wave", L("wave", "挥手")], ["step", L("step in place", "原地踏步")]], S.motion, (v) => { S.motion = v; S.t = MOTIONS[v].t0; tS.querySelector("input").max = MOTIONS[v].T; tS.set(S.t); reset(); });
    const tS = slide(ui, L("time $t$ (s)", "时间 $t$ (s)"), { min: 0, max: MOTIONS[S.motion].T, step: 0.01, value: 0 }, (v) => { const T = MOTIONS[S.motion].T; S.t = Math.floor(S.t / T) * T + v; reset(); }, (v) => nf(v, 2));
    const trC = h("div", { style: "display: contents" }), reC = h("div", { style: "display: contents" });
    ui.ctrls.append(trC, reC);
    trC.append(slide(ui, L("tracking gain $K$ (s⁻¹)", "跟踪增益 $K$ (s⁻¹)"), { min: 1, max: 30, step: 0.5, value: S.K }, (v) => { S.K = v; reset(); }, (v) => nf(v, 1)));
    trC.append(slide(ui, L("delay $d$ (s)", "延迟 $d$ (s)"), { min: 0, max: 0.3, step: 0.01, value: S.d }, (v) => { S.d = v; reset(); }, (v) => nf(v, 2)));
    trC.append(slide(ui, L("reward sharpness $k$ (m⁻²)", "奖励锐度 $k$ (m⁻²)"), { min: 1, max: 200, step: 1, value: S.k }, (v) => { S.k = v; view.redraw(); }, (v) => nf(v, 0)));
    const segM = Viz.util.seg([["copy", L("copy angles", "照抄关节角")], ["match", L("match key points", "匹配关键点")]], S.match ? "match" : "copy", (v) => { S.match = v === "match"; view.redraw(); });
    reC.append(segM);
    function layout() {
      trC.style.display = S.mode === "track" ? "contents" : "none"; reC.style.display = S.mode === "retarget" ? "contents" : "none";
      ui.legend(S.mode === "track" ? [[P.ghost, L("reference motion (ghost)", "参考动作（虚影）")], [P.target, L("reference key points", "参考关键点")], [P.force, L("robot key points and their errors", "机器人关键点及误差")]]
        : [[HUMAN, L("human demonstration", "人的示范")], [P.target, L("human's hands and feet, carried over to the robot", "人的手和脚的位置，平移到机器人这边")], [P.force, L("robot's error", "机器人的误差")]]);
      ui.caption(S.mode === "track"
        ? L("Do: press play, pick a motion, then lower and raise the gain $K$ and add a delay; change $k$. Notice: the solid robot is always behind the grey reference — a first-order lag answers a motion of frequency $\\omega$ late by $\\arctan(\\omega/K)$ and with a smaller amplitude, and a delay adds $\\omega d$ more; the fast wave suffers most. The red lines are the key-point errors a tracking policy is trained on: $r = \\exp(-k\\,\\bar e^2)$ is 1 for a perfect copy and falls off faster for a larger $k$, so $k$ sets how many centimetres count as \"close\".",
          "操作：按播放，选一个动作，再调低、调高增益 $K$，加一点延迟；改变 $k$。观察：实体机器人总是落后于灰色的参考动作——一阶滞后对频率为 $\\omega$ 的动作会晚 $\\arctan(\\omega/K)$，幅度也变小，延迟再多晚 $\\omega d$；快速的挥手受影响最大。红线就是训练跟踪策略时用的关键点误差：$r = \\exp(-k\\,\\bar e^2)$ 完美复现时为 1，$k$ 越大衰减越快，所以 $k$ 决定了几厘米算“够近”。")
        : L("Do: press play or move the time, and switch between copy angles and match key points. Notice: the human has longer legs and shorter arms, so the same joint angles put the robot's hands and feet somewhere else (red lines to the pink targets) — a lifted foot or a raised hand misses by many centimetres. Matching key points needs inverse kinematics on the robot's own body: feet first (they carry the weight), then hands, then the human's posture for the rest; the errors drop to what the robot can reach.",
          "操作：按播放或拖动时间，在“照抄关节角”和“匹配关键点”之间切换。观察：人的腿更长、手臂更短，同样的关节角会把机器人的手和脚放到别的地方（指向粉色目标的红线）——抬起的脚、举起的手会差好几厘米。要匹配关键点，就得在机器人自己的身体上做逆运动学：先保证脚（承重），再是手，其余的尽量贴近人的姿态；误差就降到机器人能达到的程度。"));
    }
    S.t = MOTIONS[S.motion].t0; tS.set(S.t);
    layout(); reset();
    if (cfg.autoplay) { playing = true; view.animate(true); syncPlay(); }
  });
})();
