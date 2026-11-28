"use strict";
// robot3d scenes (PLAN R19) — see viz10.js for the scaffold.
//   contact  one foot on the floor: friction cone / pyramid, pressure under the sole, centre of
//            pressure and tipping, the six rows of the contact wrench cone
//   wheeled  a wheeled mobile manipulator accelerating and braking: cart-table ZMP, wheel loads,
//            tipping, whole-body compensation
//   frames   coordinate frames and rigid transforms on a robot: one point written in four frames
//   anatomy  what a robot is made of: joint axes, floating base, degrees of freedom, link masses
(() => {
  if (!window.Viz || !Viz.r3 || !Viz.g3 || !Viz.rob) return;
  const R3 = Viz.r3, { L } = R3, { f0 } = R3.fmt;
  const rob = Viz.rob, V = rob.V, M = rob.M, G = rob.G;
  const { h, clamp } = Viz.util;
  const DEG = 180 / Math.PI;
  // fixed-point text without "-0.00"
  const nf = (v, d = 2) => { if (!Number.isFinite(v)) return "—"; const s = v.toFixed(d); return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s; };
  const tup = (p, d = 2) => `(${p.map((x) => nf(x, d)).join(", ")})`;
  const tick = (b) => (b ? "✓" : "✗");
  const unit2 = (v) => { const n = Math.hypot(v[0], v[1]); return n > 1e-12 ? [v[0] / n, v[1] / n] : [1, 0]; };
  // a slider whose value text uses our own format (Viz.util's switches to 1.0e+3 above 999)
  function slide(ui, label, o, cb, fmt) {
    const s = ui.slider(label, o, (v) => { cb(v); if (fmt) val.textContent = fmt(v); });
    const val = s.querySelector(".viz-val"), set = s.set;
    s.set = (v) => { set(v); if (fmt) val.textContent = fmt(v); };
    if (fmt) val.textContent = fmt(o.value);
    return s;
  }
  // world point = pivot + R (p − pivot)
  const about = (R, pivot, p) => V.add(pivot, M.mulv(R, V.sub(p, pivot)));
  // move a scalar toward a target at `rate` per second; returns the new value
  const approach = (x, tgt, rate, dt) => (Math.abs(tgt - x) <= rate * dt ? tgt : x + Math.sign(tgt - x) * rate * dt);

  // ------------------------------------------------------------------ contact physics (pure)
  function solve3(A, b) {
    const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(A);
    if (!(Math.abs(D) > 1e-300)) return null;
    return [0, 1, 2].map((k) => det(A.map((r, i) => r.map((x, j) => (j === k ? b[i] : x)))) / D);
  }
  // Pressure under a rectangular sole [−X, X] × [−Y, Y] carrying the normal load fz with its centre of
  // pressure at (px, py): the linear field p = max(0, a + b x + c y) (a rigid sole on a stiff floor)
  // whose resultant is fz at (px, py). Inside the middle "core" |px|/X + |py|/Y ≤ 1/3 the plain linear
  // field is positive everywhere; outside it part of the sole lifts off and (a, b, c) are found by a
  // semismooth Newton iteration on a grid. Returns { k: [a, b, c], p(x, y) (Pa), unloaded (fraction
  // of the sole area), peak (Pa), err (relative residual) }.
  function pressureField(fz, px, py, X, Y, nx = 56, ny = 26) {
    const dx = (2 * X) / nx, dy = (2 * Y) / ny, dA = dx * dy, A = 4 * X * Y;
    let k = [fz / A, (3 * fz * px) / (A * X * X), (3 * fz * py) / (A * Y * Y)];
    const res = (k) => {
      let s0 = 0, s1 = 0, s2 = 0, n = 0, peak = 0;
      const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let i = 0; i < nx; i++) {
        const x = -X + (i + 0.5) * dx;
        for (let j = 0; j < ny; j++) {
          const y = -Y + (j + 0.5) * dy, p = k[0] + k[1] * x + k[2] * y;
          if (p <= 0) continue;
          n++; s0 += p; s1 += x * p; s2 += y * p; if (p > peak) peak = p;
          J[0][0] += 1; J[0][1] += x; J[0][2] += y; J[1][1] += x * x; J[1][2] += x * y; J[2][2] += y * y;
        }
      }
      J[1][0] = J[0][1]; J[2][0] = J[0][2]; J[2][1] = J[1][2];
      const r = [s0 * dA - fz, s1 * dA - fz * px, s2 * dA - fz * py];
      return { r, J: J.map((row) => row.map((v) => v * dA)), err: Math.hypot(r[0] / fz, r[1] / (fz * X), r[2] / (fz * Y)), loaded: n / (nx * ny), peak };
    };
    let cur = res(k);
    for (let it = 0; it < 50 && cur.err > 1e-9; it++) {
      const d = solve3(cur.J, cur.r.map((v) => -v));
      if (!d) break;
      let t = 1, nk = k, nr = cur;
      for (let ls = 0; ls < 14; ls++, t *= 0.5) { nk = k.map((v, i) => v + t * d[i]); nr = res(nk); if (nr.err < cur.err) break; }
      if (!(nr.err < cur.err)) break;
      k = nk; cur = nr;
    }
    return { k, p: (x, y) => Math.max(0, k[0] + k[1] * x + k[2] * y), unloaded: 1 - cur.loaded, peak: cur.peak, err: cur.err };
  }
  // Contact wrench cone of a rectangular sole with half-lengths X, Y and pyramid friction coefficient
  // mt at the four corners (Caron, Pham, Nakamura 2015). w = [fx, fy, fz, τx, τy, τz] is the wrench
  // the floor exerts on the foot, about the sole centre O. Returns the six rows.
  function cwcRows(w, X, Y, mt) {
    const [fx, fy, fz, tx, ty, tz] = w;
    const tmin = -mt * (X + Y) * fz + Math.abs(Y * fx - mt * tx) + Math.abs(X * fy - mt * ty);
    const tmax = mt * (X + Y) * fz - Math.abs(Y * fx + mt * tx) - Math.abs(X * fy + mt * ty);
    const e = 1e-9;
    return { tmin, tmax, ok: [fz >= -e, Math.abs(fx) <= mt * fz + e, Math.abs(fy) <= mt * fz + e, Math.abs(tx) <= Y * fz + e, Math.abs(ty) <= X * fz + e, tz >= tmin - e && tz <= tmax + e] };
  }
  // Four wheel loads (N) on contacts (±a, ±b) for total load W with its ZMP at (px, py): the bilinear
  // split, which satisfies the force and both moment balances. Past an axle the ZMP is clamped (that
  // axle carries everything; the robot pivots about it).
  function wheelLoads(W, px, py, a, b) {
    const x = clamp(px, -a, a), y = clamp(py, -b, b);
    return { fl: (W / 4) * (1 + x / a) * (1 + y / b), fr: (W / 4) * (1 + x / a) * (1 - y / b), rl: (W / 4) * (1 - x / a) * (1 + y / b), rr: (W / 4) * (1 - x / a) * (1 - y / b), tip: px > a + 1e-9 ? 1 : px < -a - 1e-9 ? -1 : 0 };
  }
  R3.physics13 = { pressureField, cwcRows, wheelLoads };

  // ================================================================== contact
  // One robot foot on the floor, close up. The reader sets the contact wrench: the force and moment
  // the floor must give the foot (about O, the centre of the sole, right under the ankle) to hold
  // what the leg pushes into it — the leg's wrench at the ankle is the same with opposite sign.
  // Shows the friction cone (half-angle atan μ) or its inner pyramid with the reaction force in it,
  // the pressure field under the sole (arrows below the floor, seen through it), the centre of
  // pressure p = (−τ_y/f_z, τ_x/f_z), tipping about an edge when p reaches it, lift-off when f_z ≤ 0,
  // and the six rows of the contact wrench cone of the rectangular sole.
  // cfg:
  //   mode     string  "wrench"  "cone" (friction: f_x, f_y, f_z, μ) | "cop" (pressure and tipping:
  //                              f_z, τ_x, τ_y) | "wrench" (all six components and all six rows)
  //   force    [fx, fy, fz]  N   per mode: cone [220, 90, 600], cop [0, 0, 600], wrench [150, 60, 600]
  //   torque   [τx, τy, τz]  N·m per mode: cone [0, 0, 0], cop [0, −36, 0], wrench [6, −24, 3]
  //   mu       number  0.6       friction coefficient (0.1–1.5)
  //   sole     [length, width]  m   [0.22, 0.10]   size of the sole (length 0.1–0.4, width 0.05–0.2), centred on O
  //   cop      [x, y]   m        none   cop / wrench mode: start with the centre of pressure here (sets τ_x = y f_z,
  //                              τ_y = −x f_z, replacing those of `torque`); e.g. [-0.1, 0] starts at the heel
  //   pyramid  bool    false in "cone", true in "wrench"   draw the inner friction pyramid
  //            (|f_x|, |f_y| ≤ μ f_z/√2) and judge slipping with it instead of the round cone
  //   view, height, caption      as for every robot3d scene
  R3.scene("contact", (ui, cfg) => {
    const P = ui.P, mode = ["cone", "cop", "wrench"].includes(cfg.mode) ? cfg.mode : "wrench";
    const sole = Array.isArray(cfg.sole) && cfg.sole.length === 2 && cfg.sole.every((x) => Number.isFinite(+x)) ? cfg.sole.map(Number) : [0.22, 0.1];
    const X = clamp(sole[0], 0.1, 0.4) / 2, Y = clamp(sole[1], 0.05, 0.2) / 2, HA = 0.08; // half sole length and width (m), ankle height above the sole
    const D = { cone: { f: [220, 90, 600], t: [0, 0, 0] }, cop: { f: [0, 0, 600], t: [0, -36, 0] }, wrench: { f: [150, 60, 600], t: [6, -24, 3] } }[mode];
    const arr3 = (v, d) => (Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(+x)) ? v.map(Number) : d.slice());
    const init = () => {
      const o = { f: arr3(cfg.force, D.f), t: mode === "cone" ? [0, 0, 0] : arr3(cfg.torque, D.t), mu: clamp(Number(cfg.mu) || 0.6, 0.1, 1.5), pyr: cfg.pyramid ?? mode === "wrench" };
      if (mode !== "cone" && Array.isArray(cfg.cop) && cfg.cop.length === 2 && cfg.cop.every((x) => Number.isFinite(+x))) { const [px, py] = cfg.cop.map(Number); o.t[0] = py * o.f[2]; o.t[1] = -px * o.f[2]; }
      return o;
    };
    const S = init();
    const kF = 0.2 / 600, kP = 0.04 / (600 / (4 * X * Y)); // m per N; m per Pa (600 N spread evenly → 3.5 cm)
    let tilt = 0, lift = 0, lastTip = null, view = null;

    function analyse() {
      const [fx, fy, fz] = S.f, [tx, ty, tz] = S.t, mu = S.mu, mt = mu / Math.SQRT2;
      const lifted = !(fz > 1e-6), ft = Math.hypot(fx, fy);
      const inCone = !lifted && ft <= mu * fz + 1e-9, inPyr = !lifted && Math.abs(fx) <= mt * fz + 1e-9 && Math.abs(fy) <= mt * fz + 1e-9;
      const cop = lifted ? null : [-ty / fz, tx / fz];
      let tip = null;
      if (cop && (Math.abs(cop[0]) > X || Math.abs(cop[1]) > Y)) {
        const at = [clamp(cop[0], -X, X), clamp(cop[1], -Y, Y)], ex = Math.abs(cop[0]) > X, ey = Math.abs(cop[1]) > Y;
        const n = unit2([cop[0] - at[0], cop[1] - at[1]]);
        const sx = cop[0] > 0 ? L("toe", "脚尖") : L("heel", "脚跟"), sy = cop[1] > 0 ? L("left edge", "左侧边") : L("right edge", "右侧边");
        tip = { at, n, ex, ey, name: ex && ey ? L(`${sx}-${cop[1] > 0 ? "left" : "right"} corner`, `${sx}${cop[1] > 0 ? "左" : "右"}角`) : ex ? sx : sy };
      }
      const field = cop && !tip ? pressureField(fz, clamp(cop[0], -0.985 * X, 0.985 * X), clamp(cop[1], -0.985 * Y, 0.985 * Y), X, Y) : null;
      const cwc = cwcRows([fx, fy, fz, tx, ty, tz], X, Y, mt);
      return { fx, fy, fz, tx, ty, tz, mu, mt, lifted, ft, inCone, inPyr, sticks: S.pyr ? inPyr : inCone, cop, tip, field, cwc, core: cop ? Math.abs(cop[0]) / X + Math.abs(cop[1]) / Y : 0 };
    }

    view = ui.view({ height: 440, target: [0.01, 0, mode === "cop" ? 0.04 : 0.08], dist: mode === "cop" ? 0.78 : 0.9, yaw: 0.5, pitch: 0.17, groundSize: 0.9, grid: 0.1, draw(g, dt) {
      const A = analyse();
      // ---- animate the tilt (tipping) and the lift (no contact)
      const tTgt = A.tip ? 0.16 : 0, lTgt = A.lifted ? 0.035 : 0;
      if (A.tip) lastTip = A.tip;
      tilt = approach(tilt, tTgt, 0.5, dt); lift = approach(lift, lTgt, 0.15, dt);
      const moving = tilt !== tTgt || lift !== lTgt;
      if (moving !== view.animating) view.animate(moving);
      const tp = lastTip || { at: [X, 0], n: [1, 0] };
      const Rt = M.axisAngle([-tp.n[1], tp.n[0], 0], tilt), pivot = [tp.at[0], tp.at[1], 0];
      const W = (p) => V.add(about(Rt, pivot, p), [0, 0, lift]);
      // ---- the sole on the floor: support area (green; red while tipping)
      const rect = [[X, Y], [-X, Y], [-X, -Y], [X, -Y]];
      R3.drawSupport(g, rect, !A.tip, { alpha: A.lifted ? 0.08 : 0.18 });
      if (A.tip) {
        if (A.tip.ex) { const x = Math.sign(A.cop[0]) * X; g.line([x, -Y, 0.003], [x, Y, 0.003], P.force, { w: 6, onTop: true }); }
        if (A.tip.ey) { const y = Math.sign(A.cop[1]) * Y; g.line([-X, y, 0.003], [X, y, 0.003], P.force, { w: 6, onTop: true }); }
      }
      // ---- the foot: a see-through sole (so the pressure under it shows), ankle and a stub of shin
      g.box(W([0, 0, 0.02]), Rt, [2 * X, 2 * Y, 0.04], P.foot, { alpha: 0.42 });
      g.box(W([0, 0, 0.055]), Rt, [0.07, 0.07, 0.03], P.limb);
      g.sphere(W([0, 0, HA]), 0.03, P.joint);
      g.capsule(W([0, 0, HA + 0.03]), W([0, 0, 0.19]), 0.032, P.limb);
      g.label(W([X + 0.012, 0, 0.045]), L("toe", "脚尖"), { small: true, color: "--fg-2" });
      g.label(W([-X - 0.012, 0, 0.045]), L("heel", "脚跟"), { small: true, color: "--fg-2", anchor: "right" });
      if (mode !== "cone") g.frame(W([0, 0, 0.002]), Rt, 0.05, { w: 2, onTop: true });
      // ---- pressure under the sole: arrows pushing up on it, from below the floor
      if (A.field) {
        const F = A.field, nx = 9, ny = 3;
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          const x = -X + ((i + 0.5) * 2 * X) / nx, y = -Y + ((j + 0.5) * 2 * Y) / ny, len = Math.min(0.16, F.p(x, y) * kP);
          if (len > 0.004) g.arrow([x, y, -len], [x, y, -0.002], P.force, { r: 0.0024 });
        }
        // the clipped pressure plane: the tails of the arrows lie on it
        const k = F.k, pv = (q) => k[0] + k[1] * q[0] + k[2] * q[1];
        let poly = rect.map((q) => q.slice());
        const out = [];
        for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], va = pv(a), vb = pv(b); if (va >= 0) out.push(a); if ((va >= 0) !== (vb >= 0)) { const t = va / (va - vb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); } }
        poly = out;
        if (poly.length >= 3) g.poly(poly.map((q) => [q[0], q[1], -Math.min(0.16, Math.max(0, pv(q)) * kP)]), P.force, { alpha: 0.12, outline: false });
        if (F.unloaded > 0.005) {
          const zs = poly.filter((q) => Math.abs(pv(q)) < 1e-6 * Math.abs(k[0]) + 1e-3);
          if (zs.length >= 2) g.line([zs[0][0], zs[0][1], 0.003], [zs[1][0], zs[1][1], 0.003], P.ghost, { w: 2.5, dash: 0.012, onTop: true });
        }
      } else if (A.tip) g.arrow([A.tip.at[0], A.tip.at[1], -0.12], [A.tip.at[0], A.tip.at[1], -0.002], P.force, { r: 0.004 });
      // frosted floor: what hangs below it (the pressure) is seen through it
      g.box([0, 0, -0.003], null, [1.6, 1.6, 0.002], P.ground, { alpha: 0.32, shadow: false });
      g.polyline(rect.map((q) => [q[0], q[1], 0.001]), A.tip ? P.force : P.support, { w: 2.5, closed: true, onTop: true });
      // the middle core: CoP inside it ⇔ every point of the sole is pressed
      if (mode === "cop") { g.polyline([[X / 3, 0, 0.003], [0, Y / 3, 0.003], [-X / 3, 0, 0.003], [0, -Y / 3, 0.003]], P.ghost, { w: 1.8, dash: 0.008, closed: true, onTop: true }); g.label([-X / 3, 0, 0], L("core", "核心区"), { small: true, color: P.ghost, anchor: "right", dx: -4, dy: 10 }); }
      // ---- torques (gold) at the ankle
      const Aa = W([0, 0, HA]), sw = (v, s) => 0.35 * Math.PI + 1.4 * Math.PI * Math.min(1, Math.abs(v) / s);
      if (mode !== "cone") {
        const ax = M.mulv(Rt, [1, 0, 0]), ay = M.mulv(Rt, [0, 1, 0]), az = M.mulv(Rt, [0, 0, 1]);
        if (Math.abs(A.tx) > 0.4) g.turn(V.add(Aa, V.scale(ax, 0.02)), ax, 0.06, A.tx, P.torque, { sweep: sw(A.tx, 30), w: 3, onTop: true, label: "$\\tau_x$" });
        if (Math.abs(A.ty) > 0.4) g.turn(V.add(Aa, V.scale(ay, 0.045)), ay, 0.065, A.ty, P.torque, { sweep: sw(A.ty, 66), w: 3, onTop: true, label: "$\\tau_y$" });
        if (Math.abs(A.tz) > 0.4) g.turn(W([0, 0, 0.16]), az, 0.07, A.tz, P.torque, { sweep: sw(A.tz, 30), w: 3, onTop: true, label: "$\\tau_z$" });
      }
      // ---- the reaction force at the CoP, in its friction cone
      if (A.lifted) {
        if (A.fz < -1) g.arrow([0.06, 0, lift], [0.06, 0, lift - Math.max(0.07, -A.fz * kF * 2)], P.ghost, { w: 4, onTop: true, label: L("the floor cannot pull", "地面不能往下拉"), labelColor: "--fg-2", labelOpt: { dx: 10, dy: 8 } });
      } else {
        const c = A.tip ? A.tip.at : A.cop, o = [c[0], c[1], 0], top = A.fz * kF, Hc = Math.max(0.1, top * 1.22);
        if (mode !== "cop") g.coneShell(o, [0, 0, 1], Hc, Hc * A.mu, P.cone, { alpha: S.pyr ? 0.1 : 0.2 });
        if (mode !== "cop") g.label([c[0] - Hc * A.mu * 0.55, c[1] - Hc * A.mu * 0.55, Hc * 0.55], `$\\mu = ${nf(A.mu)}$`, { color: P.cone, small: true, anchor: "right", dx: -8, dy: 0 }); // on the cone's side, half way up
        if (S.pyr && mode !== "cop") {
          const s = (A.mt * Hc), q = [[s, s], [-s, s], [-s, -s], [s, -s]].map((d) => [c[0] + d[0], c[1] + d[1], Hc]);
          for (let i = 0; i < 4; i++) g.poly([o, q[i], q[(i + 1) % 4]], P.cone, { alpha: 0.16, w: 1.5 });
        }
        const tipP = [c[0] + A.fx * kF, c[1] + A.fy * kF, top], ctr = [c[0], c[1], top];
        // the circle (or square) of allowed tangential force at the height of the arrow tip
        if (mode === "cop") { /* no friction in this mode */ } else if (S.pyr) { const s = A.mt * top; g.polyline([[s, s], [-s, s], [-s, -s], [s, -s]].map((d) => [c[0] + d[0], c[1] + d[1], top]), P.cone, { w: 2.5, closed: true, onTop: true }); }
        else g.circle(ctr, [0, 0, 1], A.mu * top, P.cone, { w: 2.5, onTop: true });
        if (A.ft > 1) { g.line(ctr, tipP, P.ghost, { w: 2, dash: 0.012, onTop: true }); g.line(o, ctr, P.ghost, { w: 1.5, dash: 0.012, onTop: true }); }
        if (!A.sticks && A.ft > 1) {
          // what friction can give at most, in the direction asked for
          const u = [A.fx / A.ft, A.fy / A.ft], lim = S.pyr ? A.mt * top / Math.max(Math.abs(u[0]), Math.abs(u[1])) : A.mu * top;
          g.arrow(o, [c[0] + u[0] * lim, c[1] + u[1] * lim, top], P.cone, { w: 3, onTop: true, label: L("most friction can give", "摩擦最多能给的"), labelColor: P.cone });
        }
        g.arrow(o, tipP, P.force, { w: 5, onTop: true, label: `$f$ = ${f0(Math.hypot(A.fx, A.fy, A.fz))} N` });
        if (mode !== "cop") g.sphere(tipP, 0.009, A.sticks ? P.support : P.force, { onTop: true });
        // the centre of pressure, and in "cop" mode its two coordinates
        if (mode === "cop" && !A.tip) {
          if (Math.abs(A.cop[0]) > 0.002) g.line([0, 0, 0.004], [A.cop[0], 0, 0.004], P.x, { w: 3, onTop: true });
          if (Math.abs(A.cop[1]) > 0.002) g.line([A.cop[0], 0, 0.004], [A.cop[0], A.cop[1], 0.004], P.y, { w: 3, onTop: true });
        }
        g.sphere([c[0], c[1], 0.004], 0.009, P.zmp, { onTop: true });
        g.label([c[0], c[1], 0], A.tip ? L("CoP stuck at the edge", "CoP 停在边上") : "CoP", { color: P.zmp, dx: 8, dy: 12 });
      }
      // ---- words and numbers
      const r = A.cwc, bad = r.ok.findIndex((x) => !x);
      let st, kind = "ok";
      if (A.lifted) { st = L("no contact: $f_z \\le 0$ and the floor can only push", "没有接触：$f_z \\le 0$，地面只能推不能拉"); kind = "warn"; }
      else if (A.tip) { st = L(`tips about the ${A.tip.name}: the CoP has reached the edge`, `绕${A.tip.name}翻转：压力中心已经到了边缘`); kind = "bad"; }
      else if (mode === "wrench" && bad >= 0) { st = bad <= 2 ? L("slips: the force is outside the friction pyramid", "打滑：力超出了摩擦棱锥") : L("spins: friction cannot resist this yaw torque", "打转：摩擦抵抗不了这个偏航力矩"); kind = "bad"; }
      else if (!A.sticks) { st = L(`slips: the force is outside the friction ${S.pyr ? "pyramid" : "cone"}`, `打滑：力超出了摩擦${S.pyr ? "棱锥" : "锥"}`); kind = "bad"; }
      else if (mode === "cop") { st = A.core <= 1 / 3 + 1e-9 ? L("flat and fully pressed: the CoP is inside the core", "平稳，整个脚底都受压：压力中心在核心区内") : L("flat, but part of the sole is unloaded", "平稳，但脚底有一部分已经不受力"); kind = A.core <= 1 / 3 + 1e-9 ? "ok" : "warn"; }
      else if (mode === "wrench") st = L("holds: all six rows of the contact wrench cone are met", "稳住：接触力旋量锥的六行全部满足");
      else st = L(`sticks: the force is inside the friction ${S.pyr ? "pyramid" : "cone"}`, `不打滑：力在摩擦${S.pyr ? "棱锥" : "锥"}之内`);
      ui.status(st, kind);

      const lines = [];
      const copLine = () => (A.cop ? L(`centre of pressure $p = \\left(-\\frac{\\tau_y}{f_z},\\ \\frac{\\tau_x}{f_z}\\right) = \\left(\\frac{${nf(-A.ty, 0)}}{${nf(A.fz, 0)}},\\ \\frac{${nf(A.tx, 0)}}{${nf(A.fz, 0)}}\\right) = (${nf(100 * A.cop[0], 1)}, ${nf(100 * A.cop[1], 1)})$ cm; the sole reaches $X = ${nf(100 * X, 1)}$, $Y = ${nf(100 * Y, 1)}$ cm`, `压力中心 $p = \\left(-\\frac{\\tau_y}{f_z},\\ \\frac{\\tau_x}{f_z}\\right) = \\left(\\frac{${nf(-A.ty, 0)}}{${nf(A.fz, 0)}},\\ \\frac{${nf(A.tx, 0)}}{${nf(A.fz, 0)}}\\right) = (${nf(100 * A.cop[0], 1)}, ${nf(100 * A.cop[1], 1)})$ cm；脚底的范围是 $X = ${nf(100 * X, 1)}$、$Y = ${nf(100 * Y, 1)}$ cm`) : L("centre of pressure: none — nothing presses on the floor", "压力中心：不存在——脚底没有压在地上"));
      if (mode === "cone") {
        lines.push(`$f = (f_x, f_y, f_z) = (${nf(A.fx, 0)}, ${nf(A.fy, 0)}, ${nf(A.fz, 0)})$ N · ` + L(`tangential $\\|f_t\\| = \\sqrt{f_x^2 + f_y^2} = ${nf(A.ft, 0)}$ N`, `切向 $\\|f_t\\| = \\sqrt{f_x^2 + f_y^2} = ${nf(A.ft, 0)}$ N`));
        if (!A.lifted) {
          lines.push(L(`cone: $\\|f_t\\| \\le \\mu f_z$: $${nf(A.ft, 0)} \\le ${nf(A.mu)} \\times ${nf(A.fz, 0)} = ${nf(A.mu * A.fz, 0)}$ N ${tick(A.inCone)} · ratio $\\|f_t\\|/f_z = ${nf(A.ft / A.fz)}$ · half-angle $\\arctan\\mu = ${nf(Math.atan(A.mu) * DEG, 0)}°$`, `圆锥：$\\|f_t\\| \\le \\mu f_z$：$${nf(A.ft, 0)} \\le ${nf(A.mu)} \\times ${nf(A.fz, 0)} = ${nf(A.mu * A.fz, 0)}$ N ${tick(A.inCone)} · 比值 $\\|f_t\\|/f_z = ${nf(A.ft / A.fz)}$ · 半角 $\\arctan\\mu = ${nf(Math.atan(A.mu) * DEG, 0)}°$`));
          lines.push(L(`inner pyramid (linear, what a QP uses): $|f_x|, |f_y| \\le \\frac{\\mu}{\\sqrt2} f_z = ${nf(A.mt * A.fz, 0)}$ N: $|f_x| = ${nf(Math.abs(A.fx), 0)}$ ${tick(Math.abs(A.fx) <= A.mt * A.fz + 1e-9)}, $|f_y| = ${nf(Math.abs(A.fy), 0)}$ ${tick(Math.abs(A.fy) <= A.mt * A.fz + 1e-9)} — its corners touch the cone, so it is safe but gives up the slices between square and circle`, `内接棱锥（线性，QP 用的就是它）：$|f_x|, |f_y| \\le \\frac{\\mu}{\\sqrt2} f_z = ${nf(A.mt * A.fz, 0)}$ N：$|f_x| = ${nf(Math.abs(A.fx), 0)}$ ${tick(Math.abs(A.fx) <= A.mt * A.fz + 1e-9)}，$|f_y| = ${nf(Math.abs(A.fy), 0)}$ ${tick(Math.abs(A.fy) <= A.mt * A.fz + 1e-9)}——棱锥的棱贴着圆锥，所以偏保守，丢掉了方形和圆之间的那几块`));
        } else lines.push(L("$f_z \\le 0$: the first contact constraint $f_z \\ge 0$ fails — a foot can only be pushed by the floor, never pulled", "$f_z \\le 0$：第一条接触约束 $f_z \\ge 0$ 不满足——地面只能推脚，不能拉脚"));
      } else if (mode === "cop") {
        lines.push(copLine());
        if (A.field) lines.push(L(`pressure: peak ${nf(A.field.peak / 1000, 0)} kPa (even spread: ${nf(A.fz / (4 * X * Y) / 1000, 0)} kPa) · unloaded ${nf(100 * A.field.unloaded, 0)} % of the sole · core test $\\frac{|p_x|}{X} + \\frac{|p_y|}{Y} = ${nf(A.core)} ${A.core <= 1 / 3 + 1e-9 ? "\\le" : ">"} \\frac13$`, `压强：峰值 ${nf(A.field.peak / 1000, 0)} kPa（均匀分布时 ${nf(A.fz / (4 * X * Y) / 1000, 0)} kPa）· 不受力的部分占脚底 ${nf(100 * A.field.unloaded, 0)} % · 核心区判据 $\\frac{|p_x|}{X} + \\frac{|p_y|}{Y} = ${nf(A.core)} ${A.core <= 1 / 3 + 1e-9 ? "\\le" : ">"} \\frac13$`));
        if (A.tip) { const ty = Math.abs(A.ty) > X * A.fz, tx = Math.abs(A.tx) > Y * A.fz; lines.push((ty ? `$|\\tau_y| = ${nf(Math.abs(A.ty), 0)} > X f_z = ${nf(X * A.fz, 0)}$ N·m` : "") + (tx && ty ? L(" and ", " 且 ") : "") + (tx ? `$|\\tau_x| = ${nf(Math.abs(A.tx), 0)} > Y f_z = ${nf(Y * A.fz, 0)}$ N·m` : "") + L(": a floor that can only push cannot make this moment — the extra torque rotates the whole foot about the edge", "：只能推不能拉的地面给不出这么大的力矩——多出来的力矩让整只脚绕边缘转动")); }
        else if (!A.lifted) lines.push(L(`moment limits: $|\\tau_y| \\le X f_z = ${nf(X * A.fz, 0)}$ N·m, $|\\tau_x| \\le Y f_z = ${nf(Y * A.fz, 0)}$ N·m — the same as "CoP inside the sole"; a heavier load allows more ankle torque`, `力矩上限：$|\\tau_y| \\le X f_z = ${nf(X * A.fz, 0)}$ N·m，$|\\tau_x| \\le Y f_z = ${nf(Y * A.fz, 0)}$ N·m——等价于"压力中心在脚底内"；压得越重，踝关节能用的力矩越大`));
      } else {
        const row = (tex, nums, okk, mean) => `${tex} & ${nums} & ${okk ? "\\textcolor{#1f8354}{\\checkmark}" : "\\textcolor{#d93025}{\\boldsymbol\\times}"} & \\text{${mean}}`;
        const mt = A.mt, fz = A.fz;
        const rows = [
          row("f_z \\ge 0", `${nf(fz, 0)} \\ge 0`, r.ok[0], L("the floor only pushes", "地面只推不拉")),
          row("|f_x| \\le \\tilde\\mu f_z", `${nf(Math.abs(A.fx), 0)} \\le ${nf(mt * fz, 0)}`, r.ok[1], L("no slip forward/back", "前后不打滑")),
          row("|f_y| \\le \\tilde\\mu f_z", `${nf(Math.abs(A.fy), 0)} \\le ${nf(mt * fz, 0)}`, r.ok[2], L("no slip sideways", "左右不打滑")),
          row("|\\tau_x| \\le Y f_z", `${nf(Math.abs(A.tx), 0)} \\le ${nf(Y * fz, 1)}`, r.ok[3], L("CoP inside the sole across (no roll-over)", "压力中心横向在脚内（不侧翻）")),
          row("|\\tau_y| \\le X f_z", `${nf(Math.abs(A.ty), 0)} \\le ${nf(X * fz, 1)}`, r.ok[4], L("CoP inside the sole along (no tip on toe/heel)", "压力中心纵向在脚内（不前后翻）")),
          row("\\tau_{min} \\le \\tau_z \\le \\tau_{max}", `${nf(r.tmin, 1)} \\le ${nf(A.tz, 1)} \\le ${nf(r.tmax, 1)}`, r.ok[5], L("no spinning about the vertical", "不绕竖直轴打转")),
        ];
        lines.push(L("contact wrench cone of the rectangular sole (forces in N, moments in N·m):", "矩形脚底的接触力旋量锥（力单位 N，力矩单位 N·m）："));
        lines.push(`$\\begin{array}{llcl} ${rows.join(" \\\\ ")} \\end{array}$`);
        lines.push(L(`with $\\tilde\\mu = \\mu/\\sqrt2 = ${nf(mt)}$ (inner pyramid at the four corners), half sole $X = ${nf(X, 3)}$, $Y = ${nf(Y, 3)}$ m, $\\tau_{max} = \\tilde\\mu (X{+}Y) f_z - |Y f_x + \\tilde\\mu \\tau_x| - |X f_y + \\tilde\\mu \\tau_y|$ and $\\tau_{min} = -\\tilde\\mu (X{+}Y) f_z + |Y f_x - \\tilde\\mu \\tau_x| + |X f_y - \\tilde\\mu \\tau_y|$`, `其中 $\\tilde\\mu = \\mu/\\sqrt2 = ${nf(mt)}$（四个角点用内接棱锥），半脚长 $X = ${nf(X, 3)}$、半脚宽 $Y = ${nf(Y, 3)}$ m，$\\tau_{max} = \\tilde\\mu (X{+}Y) f_z - |Y f_x + \\tilde\\mu \\tau_x| - |X f_y + \\tilde\\mu \\tau_y|$，$\\tau_{min} = -\\tilde\\mu (X{+}Y) f_z + |Y f_x - \\tilde\\mu \\tau_x| + |X f_y - \\tilde\\mu \\tau_y|$`));
        lines.push(copLine());
        if (!A.lifted) lines.push(L(`an ankle force/torque sensor $h = 8$ cm above $O$ reads $\\tau^A_y = \\tau_y - h f_x = ${nf(A.ty - HA * A.fx, 1)}$ and $\\tau^A_x = \\tau_x + h f_y = ${nf(A.tx + HA * A.fy, 1)}$ N·m, so from the sensor $p_x = (-\\tau^A_y - h f_x)/f_z$, $p_y = (\\tau^A_x - h f_y)/f_z$`, `踝关节上的六维力传感器在 $O$ 上方 $h = 8$ cm，读数是 $\\tau^A_y = \\tau_y - h f_x = ${nf(A.ty - HA * A.fx, 1)}$、$\\tau^A_x = \\tau_x + h f_y = ${nf(A.tx + HA * A.fy, 1)}$ N·m，所以用传感器算压力中心是 $p_x = (-\\tau^A_y - h f_x)/f_z$，$p_y = (\\tau^A_x - h f_y)/f_z$`));
      }
      ui.say(lines);
    } });

    const redraw = () => view.redraw();
    const N = (v) => nf(v, 0), Nm = (v) => nf(v, 0);
    const sliders = [];
    const add = (s) => (sliders.push(s), s);
    if (mode !== "cop") {
      add(slide(ui, L("$f_x$ forward (N)", "$f_x$ 向前 (N)"), { min: -600, max: 600, step: 5, value: S.f[0] }, (v) => { S.f[0] = v; redraw(); }, N));
      add(slide(ui, L("$f_y$ sideways (N)", "$f_y$ 侧向 (N)"), { min: -600, max: 600, step: 5, value: S.f[1] }, (v) => { S.f[1] = v; redraw(); }, N));
    }
    add(slide(ui, L("$f_z$ normal load (N)", "$f_z$ 法向载荷 (N)"), { min: -100, max: 1000, step: 5, value: S.f[2] }, (v) => { S.f[2] = v; redraw(); }, N));
    if (mode !== "cone") {
      add(slide(ui, L("$\\tau_x$ roll (N·m)", "$\\tau_x$ 侧倾 (N·m)"), { min: -60, max: 60, step: 0.5, value: S.t[0] }, (v) => { S.t[0] = v; redraw(); }, Nm));
      add(slide(ui, L("$\\tau_y$ pitch (N·m)", "$\\tau_y$ 俯仰 (N·m)"), { min: -120, max: 120, step: 0.5, value: S.t[1] }, (v) => { S.t[1] = v; redraw(); }, Nm));
    }
    if (mode === "wrench") add(slide(ui, L("$\\tau_z$ yaw (N·m)", "$\\tau_z$ 偏航 (N·m)"), { min: -40, max: 40, step: 0.5, value: S.t[2] }, (v) => { S.t[2] = v; redraw(); }, (v) => nf(v, 1)));
    let muS = null;
    if (mode !== "cop") muS = slide(ui, L("friction $\\mu$", "摩擦系数 $\\mu$"), { min: 0.1, max: 1.5, step: 0.05, value: S.mu }, (v) => { S.mu = v; redraw(); }, (v) => nf(v));
    let pyrB = null;
    const legend = () => ui.legend(mode === "cop" ? ["force", "zmp", "support", "torque", [P.ghost, L("core (dashed): CoP inside ⇒ whole sole pressed", "核心区（虚线）：压力中心在里面 ⇒ 整个脚底受压")]] : ["force", "cone", [P.support, L(`tip inside the ${S.pyr ? "pyramid" : "cone"}: sticks`, `箭头尖在${S.pyr ? "棱锥" : "锥"}内：不打滑`)], "zmp", "support", ...(mode === "wrench" ? ["torque"] : [])]);
    if (mode !== "cop") pyrB = ui.toggle(L("inner pyramid", "内接棱锥"), S.pyr, (on) => { S.pyr = on; legend(); redraw(); });
    ui.btn(L("reset", "复位"), () => {
      const s0 = init(); Object.assign(S, s0);
      const vals = [...(mode !== "cop" ? [S.f[0], S.f[1]] : []), S.f[2], ...(mode !== "cone" ? [S.t[0], S.t[1]] : []), ...(mode === "wrench" ? [S.t[2]] : [])];
      sliders.forEach((s, i) => s.set(vals[i]));
      if (muS) muS.set(S.mu);
      if (pyrB) pyrB.classList.toggle("on", S.pyr);
      legend(); redraw();
    });
    legend();
    ui.caption({
      cone: L("Do: push the force sideways with $f_x$, $f_y$, or lower the load $f_z$ or $\\mu$. Notice: the foot holds while the red force stays inside the amber cone (green tip); friction can give at most $\\mu f_z$ sideways, so the same push that holds under a heavy load slips under a light one — and with $f_z \\le 0$ there is no contact at all. Switch on the inner pyramid: it is what a QP controller actually uses, four flat faces instead of the round cone. The small red arrows under the sole (seen through the floor) are the pressure; drag on the picture to orbit.", "操作：用 $f_x$、$f_y$ 把力往侧面推，或者减小载荷 $f_z$、减小 $\\mu$。观察：只要红色的力还在橙色的锥里（箭头尖是绿的），脚就站得住；摩擦在侧向最多只能给 $\\mu f_z$，所以同样的侧推，压得重时站得住，压得轻时就滑——$f_z \\le 0$ 时干脆就没有接触了。打开内接棱锥：QP 控制器实际用的就是它，四个平面代替圆锥。脚底下的红色小箭头（透过地面看到）是压强分布；在图上拖动可以转视角。"),
      cop: L("Do: add ankle pitch torque $\\tau_y$ (or roll $\\tau_x$), or lower the load $f_z$. Notice: the red CoP moves forward as $p_x = -\\tau_y/f_z$; the pressure under the sole (red arrows below the floor) tilts, and once the CoP leaves the dashed core part of the sole carries nothing. When the CoP reaches the sole's edge it cannot go further — the floor can only push — so the foot starts to tip about that edge. A heavier load lets the same torque through without tipping.", "操作：加大踝关节俯仰力矩 $\\tau_y$（或侧倾力矩 $\\tau_x$），或者减小载荷 $f_z$。观察：红色的压力中心按 $p_x = -\\tau_y/f_z$ 往前移；脚底的压强分布（地面下的红箭头）跟着倾斜，压力中心一出虚线核心区，脚底就有一部分不再受力。压力中心到了脚底边缘就再也走不动了——地面只能推——于是脚开始绕这条边翻转。载荷越大，同样的力矩越不容易翻。"),
      wrench: L("Do: change any of the six wrench components and $\\mu$. Notice: each row of the table is one way the contact can fail — lift off, slip, tip about an edge, spin about the vertical — and the 3-D picture shows the same thing: the force in the friction pyramid, the red CoP inside the green sole, the pressure under it. A whole-body controller keeps every contact wrench inside this cone; all six rows are linear in the wrench, so they go straight into its QP.", "操作：改变力旋量的六个分量和 $\\mu$。观察：表里的每一行对应接触失效的一种方式——离地、打滑、绕边翻转、绕竖直轴打转——三维图里看到的是同一件事：力在摩擦棱锥里，红色的压力中心在绿色脚底内，脚底下是压强分布。全身控制器要让每个接触的力旋量都留在这个锥里；六行对力旋量都是线性的，所以可以直接放进 QP。"),
    }[mode]);
  });

  // ================================================================== wheeled
  // A wheeled mobile manipulator (120 kg, wheelbase 0.40 m, track 0.57 m) accelerating, braking and
  // reaching. Cart-table model: every part has the base's acceleration a, so the zero-moment point is
  // p = c_xy − (c_z/g) a; the four wheel loads follow from force and moment balance. Braking moves
  // the ZMP forward; past the front axle the rear wheels lift and the robot tips. Whole-body
  // compensation leans the waist and lowers the lift until the ZMP is back in the middle.
  // cfg:
  //   accel       number  −2.0   base acceleration a_x, m/s² (−4…4; negative = braking)
  //   reach       number  0.6    how far the arms are held out in front, 0 (hands at the chest) … 1 (arms straight)
  //   payload     number  8      mass held in the hands, kg (0–15)
  //   lift        number  0.3    lift (prismatic torso) height, m (0–0.4)
  //   compensate  bool    false  whole-body compensation on at the start
  //   view, height, caption      as for every robot3d scene
  R3.scene("wheeled", (ui, cfg) => {
    const P = ui.P, rb = rob.build("wheeled"), ghost = rob.build("wheeled");
    const home = R3.snapshot(rb), XF = 0.2, YW = 0.285, RW = 0.1;
    const num = (v, d, lo, hi) => clamp(Number.isFinite(+v) && v !== null && v !== "" ? +v : d, lo, hi);
    const init = () => ({ a: num(cfg.accel, -2, -4, 4), reach: num(cfg.reach, 0.6, 0, 1), payload: num(cfg.payload, 8, 0, 15), lift: num(cfg.lift, 0.3, 0, 0.4), comp: !!cfg.compensate });
    const S = init();
    let baseX = 0, phi = 0, tilt = 0, drive = null, view = null;
    const J = (n) => rb.ji(n);

    function setPose(r, waist, lift) {
      r.base.p = [home.p[0] + baseX, home.p[1], home.p[2]]; r.base.R = home.R.map((x) => x.slice()); r.q.set(home.q);
      for (const s of ["l", "r"]) { r.q[J(s + "_shoulder_pitch")] = -0.25 - 1.3 * S.reach; r.q[J(s + "_elbow")] = -1.35 * (1 - S.reach); }
      r.q[J("lift")] = lift; r.q[J("waist_pitch")] = waist; r.fk();
    }
    const handsMid = (r) => V.scale(V.add(r.framePose("l_hand").p, r.framePose("r_hand").p), 0.5);
    // CoM of robot + payload (world) and the ZMP x relative to the base centre
    function system(r, a) {
      const m0 = r.totalMass, m = m0 + S.payload, hp = handsMid(r);
      const c = V.scale(V.add(V.scale(r.com(), m0), V.scale(hp, S.payload)), 1 / m);
      const cx = c[0] - r.base.p[0];
      return { c, cx, cy: c[1] - r.base.p[1], m, hp, p: cx - (c[2] / G) * a, py: c[1] - r.base.p[1] };
    }
    // posture for acceleration a: the user's, or the compensated one (waist first, then the lift)
    function pose(a) {
      setPose(ghost, 0, S.lift);
      const before = system(ghost, a);
      if (!S.comp) { setPose(rb, 0, S.lift); return { before, after: before, waist: 0, lift: S.lift, full: true }; }
      const f = (w, l) => { setPose(rb, w, l); return system(rb, a).p; };
      const bis = (fn, lo, hi) => { let flo = fn(lo); for (let i = 0; i < 40; i++) { const m = 0.5 * (lo + hi), fm = fn(m); if (Math.sign(fm) === Math.sign(flo)) { lo = m; flo = fm; } else hi = m; } return 0.5 * (lo + hi); };
      let w = 0, l = S.lift, full = true;
      const wl = rb.links[rb.jointLink[J("waist_pitch")]].joint;
      const flo = f(wl.lo, l), fhi = f(wl.hi, l);
      if (Math.sign(flo) !== Math.sign(fhi)) w = bis((x) => f(x, l), wl.lo, wl.hi);
      else {
        w = Math.abs(flo) < Math.abs(fhi) ? wl.lo : wl.hi;
        const g0 = f(w, 0), g1 = f(w, S.lift);
        if (Math.sign(g0) !== Math.sign(g1)) l = bis((x) => f(w, x), 0, S.lift);
        else { l = Math.abs(g0) < Math.abs(g1) ? 0 : S.lift; full = false; }
      }
      setPose(rb, w, l);
      return { before, after: system(rb, a), waist: w, lift: l, full };
    }

    view = ui.view({ height: 440, target: [0.1, 0, 0.6], dist: 3.5, yaw: 0.2, pitch: 0.3, groundSize: 4, draw(g, dt) {
      // ---- drive: accelerate → cruise → brake → stop
      if (drive) {
        drive.t += dt;
        const brake = S.a < -0.3 ? S.a : -2.5;
        let a = 0;
        if (drive.t < 1.6) a = 1.5; else if (drive.t < 2.8) a = 0; else if (drive.v > 0) a = brake;
        if (drive.v <= 0 && drive.t >= 2.8) { a = 0; drive.v = 0; drive.hold += dt; }
        drive.v = Math.max(0, drive.v + a * dt); baseX += drive.v * dt; phi = baseX / RW; drive.a = a;
        if (drive.hold > 1.0) { drive = null; playB.textContent = "▶ " + L("drive", "开车"); aS.set(S.a); }
      }
      const a = drive ? drive.a : S.a, ps = pose(a), sy = ps.after, W = sy.m * G;
      const ld = wheelLoads(W, sy.p, sy.py, XF, YW);
      const margin = XF - Math.abs(sy.p);
      // tipping: rotate the whole robot a little about the axle it pivots on (for drawing only)
      const TILT = 0.17, tTgt = ld.tip ? TILT * ld.tip : 0; // drawn tilt (≈ 10°) about the axle it pivots on
      tilt = approach(tilt, tTgt, 0.45, dt);
      const moving = !!drive || tilt !== tTgt;
      if (moving !== view.animating) view.animate(moving);
      const piv = [rb.base.p[0] + (tilt >= 0 ? XF : -XF), 0, 0], Rt = M.Ry(tilt);
      const tw = (p) => about(Rt, piv, p);
      if (tilt !== 0) { rb.base.p = tw(rb.base.p); rb.base.R = M.mul(Rt, rb.base.R); rb.fk(); }
      if (drive) view.cam.target = [rb.base.p[0] + 0.12, 0, 0.62];
      // ---- robot, wheels turning, payload
      if (S.comp && Math.abs(ps.before.p - sy.p) > 0.005) { setPose(ghost, 0, S.lift); if (tilt !== 0) { ghost.base.p = tw(ghost.base.p); ghost.base.R = M.mul(Rt, ghost.base.R); ghost.fk(); } g.robot(ghost, { alpha: 0.2, color: () => P.ghost, shadow: false }); }
      g.robot(rb);
      const bp = rb.base.p, BR = rb.base.R, wpt = (q) => V.add(bp, M.mulv(BR, q));
      for (const [x, y] of [[XF, YW], [XF, -YW], [-XF, YW], [-XF, -YW]]) for (const k of [0, 1]) {
        const c = wpt([x, y + Math.sign(y) * 0.032, -0.11]), R = M.mul(BR, M.Ry(phi + (k * Math.PI) / 2));
        g.box(c, R, [0.16, 0.006, 0.022], P.limb);
      }
      if (S.payload > 0.05) { const s = 0.85 + 0.15 * (S.payload / 15); g.box(handsMid(rb), BR, [0.2 * s, 0.3, 0.17 * s], "#b5835a"); }
      // ---- floor: wheel rectangle, ZMP (before / after), wheel loads
      const x0 = home.p[0] + baseX, rect = [[x0 + XF, YW], [x0 - XF, YW], [x0 - XF, -YW], [x0 + XF, -YW]];
      R3.drawSupport(g, rect, !ld.tip);
      const k = 0.3 / 600; // m per N
      const cw = V.add([x0, 0, 0], [sy.cx, sy.cy, 0]);
      R3.drawCom(g, tilt !== 0 ? tw(sy.c) : sy.c, { weight: 0.5 * W * k, weightLabel: "$(m+m_p)\\,g_0$" });
      const zp = [x0 + clamp(sy.p, -0.6, 0.6), sy.py, 0];
      g.line(tilt !== 0 ? tw(sy.c) : sy.c, [zp[0], zp[1], 0.004], P.zmp, { w: 2, dash: 0.05, onTop: true });
      if (S.comp && Math.abs(ps.before.p - sy.p) > 0.005) {
        const zb = [x0 + clamp(ps.before.p, -0.6, 0.6), ps.before.py, 0.004];
        g.circle(zb, [0, 0, 1], 0.03, P.zmp, { w: 2.5, onTop: true });
        g.label(zb, L("without", "未补偿"), { color: P.zmp, small: true, dy: 14 });
        g.arrow([zb[0], zb[1] + 0.06, 0.01], [zp[0], zp[1] + 0.06, 0.01], P.zmp, { w: 2.5, onTop: true });
      }
      g.sphere([zp[0], zp[1], 0.006], 0.026, P.zmp, { onTop: true });
      g.label(zp, "ZMP", { color: P.zmp, dy: 16, dx: -12 });
      const wl = [["fl", XF, YW], ["fr", XF, -YW], ["rl", -XF, YW], ["rr", -XF, -YW]];
      for (const [n, x, y] of wl) {
        const N = ld[n], c = tw([x0 + x, y, 0]);
        if (N > 2) g.arrow(c, V.add(c, [0, 0, N * k]), P.force, { w: 4, onTop: true, label: `${f0(N)} N`, labelOpt: { small: true, cls: "bg", dx: x > 0 ? 8 : -8, anchor: x > 0 ? null : "right" } });
        else g.label(c, "0 N", { color: P.force, small: true, dy: -10 });
      }
      // acceleration of the base (teal)
      if (Math.abs(a) > 0.05) { const s0 = tw([bp[0], 0, 0.42]); g.arrow(s0, V.add(s0, [0.14 * a, 0, 0]), P.velocity, { w: 5, label: `$a = ${nf(a, 1)}$ m/s²`, labelOpt: { dy: -14 } }); }
      if (Math.abs(tilt) > 0.02) { const ax = [x0 + (tilt > 0 ? XF : -XF), 0, RW]; g.turn(ax, [0, 1, 0], 0.16, tilt, P.force, { w: 3.5, onTop: true, sweep: 1.2 * Math.PI, label: L("tips about the axle", "绕轴翻转"), labelOpt: { small: true, dx: 12, dy: 24 } }); }
      if (tilt !== 0) setPose(rb, ps.waist, ps.lift);
      // the lift slider shows the user's height; with compensation also the height actually used
      { const vt = lS.querySelector(".viz-val"); if (vt) vt.textContent = S.comp && Math.abs(ps.lift - S.lift) > 0.005 ? `${nf(S.lift, 2)} → ${nf(ps.lift, 2)}` : nf(S.lift, 2); }
      // ---- words and numbers
      const cz = sy.c[2], amax = (G * (XF - sy.cx)) / cz, aacc = (G * (sy.cx + XF)) / cz, amax0 = (G * (XF - ps.before.cx)) / ps.before.c[2], aacc0 = (G * (ps.before.cx + XF)) / ps.before.c[2];
      const brk = a <= 0, lim0 = brk ? amax0 : aacc0, lim1 = brk ? amax : aacc, limEn = brk ? "braking limit" : "acceleration limit", limZh = brk ? "制动极限" : "加速极限";
      const front = ld.fl + ld.fr, rear = ld.rl + ld.rr;
      if (ld.tip > 0) ui.status(L("tips forward: the ZMP has passed the front axle, the rear wheels lift (drawn tilted 10°; it would keep turning)", "向前翻：ZMP 越过了前轴，后轮离地（图中画成倾斜 10°；实际会一直转下去）"), "bad");
      else if (ld.tip < 0) ui.status(L("tips backward: the ZMP has passed the rear axle, the front wheels lift (drawn tilted 10°; it would keep turning)", "向后翻：ZMP 越过了后轴，前轮离地（图中画成倾斜 10°；实际会一直转下去）"), "bad");
      else if (S.comp && !ps.full) ui.status(L(`compensation at its joint limits: ${limEn} ${nf(lim0, 1)} → ${nf(lim1, 1)} m/s², the ZMP ${nf(100 * margin, 0)} cm inside the axle`, `补偿已到关节极限：${limZh} ${nf(lim0, 1)} → ${nf(lim1, 1)} m/s²，ZMP 离轴还有 ${nf(100 * margin, 0)} cm`), margin < 0.05 ? "warn" : "ok");
      else if (margin < 0.05) ui.status(L(`close to tipping: the ZMP is ${nf(100 * margin, 0)} cm from the ${sy.p > 0 ? "front" : "rear"} axle`, `快要翻了：ZMP 离${sy.p > 0 ? "前" : "后"}轴只有 ${nf(100 * margin, 0)} cm`), "warn");
      else ui.status(S.comp ? L("compensated: the ZMP is back in the middle of the wheels", "已补偿：ZMP 回到了四轮中间") : L("stable: the ZMP is inside the wheel rectangle", "稳定：ZMP 在四个轮子围成的矩形内"), "ok");
      const lines = [
        L(`$p_x = c_x - \\frac{c_z}{g_0}\\,a_x = ${nf(sy.cx)} - \\frac{${nf(cz)}}{9.81} \\times (${nf(a, 1)}) = ${nf(sy.p)}$ m from the base centre; the front axle is at $x_f = 0.20$ m, the rear at $-0.20$ m`, `$p_x = c_x - \\frac{c_z}{g_0}\\,a_x = ${nf(sy.cx)} - \\frac{${nf(cz)}}{9.81} \\times (${nf(a, 1)}) = ${nf(sy.p)}$ m（相对底盘中心）；前轴在 $x_f = 0.20$ m，后轴在 $-0.20$ m`),
        L(`hardest braking before tipping $a_{max} = g_0\\,\\frac{x_f - c_x}{c_z} = 9.81 \\times \\frac{0.20 - ${nf(sy.cx)}}{${nf(cz)}} = ${nf(Math.max(0, amax), 1)}$ m/s² · hardest acceleration $g_0\\,\\frac{c_x - x_r}{c_z} = ${nf(Math.max(0, aacc), 1)}$ m/s²`, `不翻车的最大制动减速度 $a_{max} = g_0\\,\\frac{x_f - c_x}{c_z} = 9.81 \\times \\frac{0.20 - ${nf(sy.cx)}}{${nf(cz)}} = ${nf(Math.max(0, amax), 1)}$ m/s² · 最大加速度 $g_0\\,\\frac{c_x - x_r}{c_z} = ${nf(Math.max(0, aacc), 1)}$ m/s²`),
        L(`axle loads: front $N_f = ${f0(front)}$ N (${f0((100 * front) / W)} %), rear $N_r = ${f0(rear)}$ N; $N_f + N_r = (m + m_p)\\,g_0 = (${f0(rb.totalMass)} + ${nf(S.payload, 0)}) \\times 9.81 = ${f0(W)}$ N · the floor also pushes the wheels sideways with $|m a| = ${f0(sy.m * Math.abs(a))}$ N (needs $\\mu \\ge |a|/g_0 = ${nf(Math.abs(a) / G)}$)`, `轴荷：前轴 $N_f = ${f0(front)}$ N（${f0((100 * front) / W)} %），后轴 $N_r = ${f0(rear)}$ N；$N_f + N_r = (m + m_p)\\,g_0 = (${f0(rb.totalMass)} + ${nf(S.payload, 0)}) \\times 9.81 = ${f0(W)}$ N · 地面还要给轮子 $|m a| = ${f0(sy.m * Math.abs(a))}$ N 的水平力（需要 $\\mu \\ge |a|/g_0 = ${nf(Math.abs(a) / G)}$）`),
        S.comp ? L(`whole-body compensation: waist pitch ${nf(ps.waist * DEG, 0)}°, lift ${nf(ps.lift, 2)} m → ZMP ${nf(ps.before.p)} m → ${nf(sy.p)} m${ps.full ? "" : " (at the joint limits)"}; ${limEn} ${nf(lim0, 1)} → ${nf(lim1, 1)} m/s²`, `全身补偿：腰俯仰 ${nf(ps.waist * DEG, 0)}°，升降 ${nf(ps.lift, 2)} m → ZMP ${nf(ps.before.p)} m → ${nf(sy.p)} m${ps.full ? "" : "（已到关节极限）"}；${limZh} ${nf(lim0, 1)} → ${nf(lim1, 1)} m/s²`) : null,
      ];
      ui.say(lines);
    } });

    const redraw = () => view.redraw();
    const aS = slide(ui, L("acceleration $a_x$ (m/s²)", "加速度 $a_x$ (m/s²)"), { min: -4, max: 4, step: 0.1, value: S.a }, (v) => { S.a = v; redraw(); }, (v) => nf(v, 1));
    const rS = slide(ui, L("arm reach (%)", "手臂前伸 (%)"), { min: 0, max: 100, step: 1, value: S.reach * 100 }, (v) => { S.reach = v / 100; redraw(); }, (v) => nf(v, 0));
    const pS = slide(ui, L("payload $m_p$ (kg)", "手中负载 $m_p$ (kg)"), { min: 0, max: 15, step: 0.5, value: S.payload }, (v) => { S.payload = v; redraw(); }, (v) => nf(v, 1));
    const lS = slide(ui, L("lift height (m)", "升降高度 (m)"), { min: 0, max: 0.4, step: 0.01, value: S.lift }, (v) => { S.lift = v; redraw(); }, (v) => nf(v, 2));
    const cB = ui.toggle(L("whole-body compensation", "全身补偿"), S.comp, (on) => { S.comp = on; redraw(); });
    const playB = ui.btn("▶ " + L("drive", "开车"), () => {
      if (drive) { drive = null; playB.textContent = "▶ " + L("drive", "开车"); aS.set(S.a); redraw(); return; }
      drive = { t: 0, v: 0, a: 0, hold: 0 }; playB.textContent = "❚❚ " + L("stop", "停"); view.animate(true);
    }, "primary");
    ui.btn(L("reset", "复位"), () => { drive = null; playB.textContent = "▶ " + L("drive", "开车"); Object.assign(S, init()); baseX = 0; phi = 0; aS.set(S.a); rS.set(S.reach * 100); pS.set(S.payload); lS.set(S.lift); cB.classList.toggle("on", S.comp); view.resetView(); redraw(); });
    ui.legend(["com", "gravity", "zmp", ["#d93025", L("wheel loads (floor on wheels)", "轮子受到的支撑力")], "support", [P.velocity, L("acceleration $a$", "加速度 $a$")], ["#b5835a", L("payload", "负载")], [P.ghost, L("posture without compensation", "未补偿时的姿态")]]);
    ui.caption(L("Do: brake harder (drag $a_x$ to the left: negative is braking), hold the arms further out, add payload, raise the lift — or press ▶ drive. Notice: braking throws the ZMP forward by $(c_z/g_0)\\,|a|$, so the load moves onto the front wheels; when the ZMP passes the front axle the rear wheels have nothing left to give and the robot tips. A high, forward CoM (lift up, arms out, payload) lowers the braking limit. Switch on whole-body compensation: leaning the waist back and lowering the lift pulls the ZMP back to the middle — the base controller and the upper body must be planned together, which is why a wheeled humanoid needs whole-body control.", "操作：加大制动（把 $a_x$ 往左拖，负值就是制动）、把手臂伸得更远、加负载、升高升降柱——或者按 ▶ 开车。观察：制动会把 ZMP 往前推 $(c_z/g_0)\\,|a|$，载荷转移到前轮上；ZMP 越过前轴时，后轮已经没有力可给，机器人就会翻。质心越高、越靠前（升降柱高、手臂前伸、拿着负载），能承受的制动就越小。打开全身补偿：腰向后仰、升降柱降低，把 ZMP 拉回中间——底盘和上半身必须一起规划，这正是轮式人形机器人需要全身控制的原因。"));
  });

  // ================================================================== frames
  // Coordinate frames and rigid transforms on a real robot. World W, base B, hand H and head camera C
  // are drawn as frames; a cube on a table is one point P written in each of them:
  //   p_B = R_WBᵀ (p_W − t_WB)  …  and the chain T_WH = T_WB T_BH.
  // Moving the robot changes p_B, p_H, p_C but not p_W; dragging the cube changes them all. The
  // selected frame shows the coordinates as three steps along its axes.
  // cfg:
  //   robot   string  "humanoid"   "humanoid" | "arm" (fixed-base 7-DoF arm; C is a camera on a stand) | "wheeled"
  //   frame   string  "B"          frame highlighted at the start: "W" | "B" | "H" | "C"
  //   base    [x, y, yawDeg]  [0, 0, 20] ([−0.15, 0.15, 20] for the arm)   base offset (m) and yaw (°) at the start
  //   object  [x, y]  per robot    position of the cube on the table (world, m)
  //   camera  string  "body"       axes of the camera frame C: "body" (x forward, y left, z up, like B) or
  //                                "optical" (the computer-vision convention: z forward along the view, x right, y down)
  //   status  string  none         replaces the status line on the picture (may contain $…$); without it the
  //                                default line "one point, four frames …" shows only when the figure has no title
  //   view, height, caption        as for every robot3d scene
  // The base x / y sliders show t_WB itself. `base` stays an offset from the robot's standing pose, whose
  // base origin is not over the world origin for the humanoid: its pelvis sits 0.054 m behind the point
  // between the feet (the knees are bent), so base x = −0.20 gives t_WB,x = −0.25 and the slider reads −0.25.
  R3.scene("frames", (ui, cfg) => {
    const P = ui.P, kind = ["arm", "wheeled"].includes(cfg.robot) ? cfg.robot : "humanoid";
    const rb = rob.build(kind), home = R3.snapshot(rb);
    const T = { humanoid: { table: [0.62, -0.1, 0.78, 0.4, 0.7], obj: [0.5, -0.2], joint: "r_shoulder_pitch", q: -0.9, hand: "r_hand", base: "pelvis", view: { target: [0.18, -0.12, 0.98], dist: 3.7, yaw: 0.5, pitch: 0.26 } },
      wheeled: { table: [0.85, -0.1, 0.72, 0.4, 0.7], obj: [0.74, -0.2], joint: "r_shoulder_pitch", q: -1.0, hand: "r_hand", base: "base", view: { target: [0.3, -0.1, 0.6], dist: 3.6, yaw: 0.5, pitch: 0.3 } },
      arm: { table: [0.55, 0, 0.15, 0.45, 0.9], obj: [0.5, 0.18], joint: "joint1", q: 0.3, hand: "tcp", base: "base", view: { target: [0.5, 0.2, 0.38], dist: 2.7, yaw: 0.45, pitch: 0.32 } } }[kind];
    const ji = rb.ji(T.joint), jt = rb.links[rb.jointLink[ji]].joint;
    const b0 = Array.isArray(cfg.base) && cfg.base.length === 3 ? cfg.base.map(Number) : kind === "arm" ? [-0.15, 0.15, 20] : [0, 0, 20];
    const o0 = Array.isArray(cfg.object) && cfg.object.length === 2 ? cfg.object.map(Number) : T.obj;
    const [tx, ty, tz, tl, twd] = T.table, ch = 0.05; // table centre x, y, top height, length, width; cube side
    const clampObj = (x, y) => [clamp(x, tx - tl / 2 + 0.04, tx + tl / 2 - 0.04), clamp(y, ty - twd / 2 + 0.04, ty + twd / 2 - 0.04)];
    const init = () => ({ x: clamp(b0[0], -0.4, 0.3), y: clamp(b0[1], -0.4, 0.4), yaw: clamp(b0[2], -90, 90) / DEG, q: T.q, obj: [...clampObj(o0[0], o0[1]), tz + ch / 2], sel: ["W", "B", "H", "C"].includes(cfg.frame) ? cfg.frame : "B" });
    const S = init();
    let last = null, view = null;
    // the arm has no head: its camera stands on a tripod, looking at the table
    const camFixed = (() => { const p = [1.05, 0.55, 0.7], d = V.unit(V.sub([0.4, 0, 0.2], p)), y = V.unit(V.cross([0, 0, 1], d)), z = V.cross(d, y); return { p, R: [[d[0], y[0], z[0]], [d[1], y[1], z[1]], [d[2], y[2], z[2]]] }; })();
    if (kind === "humanoid" || kind === "wheeled") { for (const s of ["l", "r"]) rb.q[rb.ji(s + "_elbow")] = -0.7; home.q.set(rb.q); }
    function place() {
      rb.base.p = V.add(home.p, [S.x, S.y, 0]); rb.base.R = M.mul(M.Rz(S.yaw), home.R); rb.q.set(home.q); rb.q[ji] = clamp(S.q, jt.lo, jt.hi); rb.fk();
    }
    const frames = () => {
      const bl = rb.links[rb.linkIndex[kind === "humanoid" ? "pelvis" : kind === "arm" ? "link0" : "base"]];
      const hp = rb.framePose(T.hand);
      const cb = kind === "arm" ? camFixed : rb.framePose("head");
      return { W: { p: [0, 0, 0], R: M.I() }, B: { p: bl.pw.slice(), R: bl.Rw }, H: hp, C: optical ? { p: cb.p, R: M.mul(cb.R, OPT) } : cb };
    };
    const inF = (F, p) => M.mulv(M.T(F.R), V.sub(p, F.p));
    // optical camera axes in body axes: x_c = −y_b (right), y_c = −z_b (down), z_c = x_b (forward)
    const optical = cfg.camera === "optical", OPT = [[0, 0, 1], [-1, 0, 0], [0, -1, 0]];
    const NM = { W: L("world", "世界"), B: L("base", "基座"), H: L("hand", "手"), C: kind === "arm" ? L("camera", "相机") : L("head camera", "头部相机") };
    const SZ = { W: 0.3, B: 0.2, H: 0.12, C: 0.14 };

    view = ui.view({ height: 440, ...T.view, draw(g) {
      place();
      const F = frames(), p = S.obj;
      // table and the cube on it
      const wood = document.documentElement.dataset.theme === "dark" ? "#6d604f" : "#c9b79c";
      g.box([tx, ty, tz - 0.015], null, [tl, twd, 0.03], wood);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.box([tx + sx * (tl / 2 - 0.03), ty + sy * (twd / 2 - 0.03), (tz - 0.03) / 2], null, [0.03, 0.03, tz - 0.03], wood);
      g.box(p, null, [ch, ch, ch], P.target);
      g.robot(rb);
      if (kind === "arm") { const c = camFixed.p; g.box(c, camFixed.R, [0.06, 0.1, 0.06], P.joint); g.cyl([c[0], c[1], 0], [c[0], c[1], c[2] - 0.03], 0.012, P.limb); }
      // frames: the selected one large with axis names, the rest plain
      for (const k of ["W", "B", "H", "C"]) {
        const on = k === S.sel;
        g.frame(F[k].p, F[k].R, SZ[k] * (on ? 1.25 : 1), { w: on ? 4 : 2.5, onTop: true, alpha: on ? 1 : 0.75, names: on ? ["x", "y", "z"] : null });
        g.label(F[k].p, `$${k}$`, { dx: -16, dy: 12, cls: on ? "bg" : "" });
      }
      g.line([0, 0, 0], F.B.p, P.ghost, { w: 1.5, dash: 0.04, onTop: true });
      g.label(V.scale(F.B.p, 0.55), "$t_{WB}$", { small: true, color: P.ghost, dx: 6 });
      // the coordinates of P in the selected frame, as three steps along its axes
      const Fs = F[S.sel], c = inF(Fs, p), col = [P.x, P.y, P.z];
      let a = Fs.p.slice();
      for (let i = 0; i < 3; i++) {
        const e = [Fs.R[0][i], Fs.R[1][i], Fs.R[2][i]], b = V.add(a, V.scale(e, c[i]));
        if (Math.abs(c[i]) > 0.004) { g.arrow(a, b, col[i], { w: 4.5, onTop: true }); g.label(V.lerp(a, b, 0.5), `${nf(c[i])}`, { color: col[i], small: true, cls: "bg", dx: -14, dy: i === 2 ? 0 : -12 }); }
        a = b;
      }
      g.label(p, "$P$", { dx: 10, dy: -12, color: P.target });
      // ---- words and numbers
      const pB = inF(F.B, p), pH = inF(F.H, p), pC = inF(F.C, p);
      const RB = F.B.R, tB = F.B.p, tBH = inF(F.B, F.H.p);
      const cx = ["#d93025", "#1f8354", "#0056d2"];
      const mat = `T_{WB} = \\begin{bmatrix} ${[0, 1, 2].map((r) => [0, 1, 2].map((j) => `\\textcolor{${cx[j]}}{${nf(RB[r][j])}}`).join(" & ") + ` & \\mathbf{${nf(tB[r])}}`).join(" \\\\ ")} \\\\ \\textcolor{#888}{0} & \\textcolor{#888}{0} & \\textcolor{#888}{0} & \\textcolor{#888}{1} \\end{bmatrix} = \\begin{bmatrix} R_{WB} & t_{WB} \\\\ 0 & 1 \\end{bmatrix}`;
      const sel = S.sel, ps = { W: p, B: pB, H: pH, C: pC }[sel];
      ui.say([
        L(`$p_W = ${tup(p)}$ m — the cube in the world frame`, `$p_W = ${tup(p)}$ m——方块在世界坐标系里的坐标`),
        L(`$p_B = {R_{WB}}^{\\top}(p_W - t_{WB}) = ${tup(pB)}$ m · $p_H = ${tup(pH)}$ m · $p_C = ${tup(pC)}$ m`, `$p_B = {R_{WB}}^{\\top}(p_W - t_{WB}) = ${tup(pB)}$ m · $p_H = ${tup(pH)}$ m · $p_C = ${tup(pC)}$ m`),
        optical ? L("$C$ uses the optical (camera) convention: $z_C$ along the line of sight, $x_C$ to the right of the image, $y_C$ down — so $p_C$ has the depth in its last entry", "$C$ 用光学（相机）约定：$z_C$ 沿视线向前，$x_C$ 指向图像右侧，$y_C$ 向下——所以 $p_C$ 的最后一个分量就是深度")
          : L("$C$ uses body axes like $B$ ($x$ forward, $y$ left, $z$ up); camera and vision code use the optical convention instead ($z$ along the line of sight, $x$ right, $y$ down)", "$C$ 用和 $B$ 一样的机体轴（$x$ 向前、$y$ 向左、$z$ 向上）；相机和视觉代码用的是光学约定（$z$ 沿视线、$x$ 向右、$y$ 向下）"),
        L(`chain $T_{WH} = T_{WB}\\,T_{BH}$: the hand at $t_{WH} = t_{WB} + R_{WB}\\,t_{BH} = ${tup(tB)} + R_{WB}\\,${tup(tBH)} = ${tup(F.H.p)}$ m`, `链式相乘 $T_{WH} = T_{WB}\\,T_{BH}$：手的位置 $t_{WH} = t_{WB} + R_{WB}\\,t_{BH} = ${tup(tB)} + R_{WB}\\,${tup(tBH)} = ${tup(F.H.p)}$ m`),
        `$${mat}$`,
        L(`the columns of $R_{WB}$ are $B$'s axes $x$, $y$, $z$ written in $W$; the last column is where $B$'s origin is. Highlighted: $p_${sel} = ${tup(ps)}$ — walk ${nf(ps[0])} m along ${sel}'s $x$, ${nf(ps[1])} m along its $y$, ${nf(ps[2])} m along its $z$`, `$R_{WB}$ 的三列就是 $B$ 的 $x$、$y$、$z$ 轴在 $W$ 里的写法；最后一列是 $B$ 的原点位置。高亮的是 $p_${sel} = ${tup(ps)}$——沿 ${sel} 的 $x$ 走 ${nf(ps[0])} m，沿 $y$ 走 ${nf(ps[1])} m，沿 $z$ 走 ${nf(ps[2])} m`),
      ]);
      if (last === "robot") ui.status(L("robot moved: $p_W$ stays, $p_B$, $p_H$, $p_C$ change", "机器人动了：$p_W$ 不变，$p_B$、$p_H$、$p_C$ 变了"), "info");
      else if (last === "arm") ui.status(L("arm moved: only $p_H$ changes — the base did not move", "手臂动了：只有 $p_H$ 变——基座没有动"), "info");
      else if (last === "object") ui.status(L("cube moved: its coordinates change in every frame", "方块动了：它在每个坐标系里的坐标都变了"), "info");
      else if (cfg.status) ui.status(cfg.status, "info");
      else ui.status(cfg.title ? "" : L("one point, four frames, four sets of coordinates", "同一个点，四个坐标系，四组坐标"), "info");
    } });
    view.handle({ get: () => S.obj, set: (q) => { const c = clampObj(q[0], q[1]); S.obj = [c[0], c[1], S.obj[2]]; last = "object"; }, plane: "ground", r: 0.02 });
    const redraw = () => view.redraw();
    ui.seg([["W", L("world $W$", "世界 $W$")], ["B", L("base $B$", "基座 $B$")], ["H", L("hand $H$", "手 $H$")], ["C", (kind === "arm" ? L("camera", "相机") : L("head", "头")) + " $C$"]], S.sel, (v) => { S.sel = v; redraw(); });
    // the sliders read t_WB (the base origin in W), not the offset from the standing pose: they agree with T_WB
    const ox = home.p[0], oy = home.p[1];
    const sx = slide(ui, L("base $x$ (m)", "基座 $x$ (m)"), { min: -0.4 + ox, max: 0.3 + ox, step: 0.01, value: S.x + ox }, (v) => { S.x = v - ox; last = "robot"; redraw(); }, (v) => nf(v));
    const sy = slide(ui, L("base $y$ (m)", "基座 $y$ (m)"), { min: -0.4 + oy, max: 0.4 + oy, step: 0.01, value: S.y + oy }, (v) => { S.y = v - oy; last = "robot"; redraw(); }, (v) => nf(v));
    const sw = slide(ui, L("base yaw (°)", "基座偏航 (°)"), { min: -90, max: 90, step: 1, value: S.yaw * DEG }, (v) => { S.yaw = v / DEG; last = "robot"; redraw(); }, (v) => nf(v, 0));
    const sq = slide(ui, `${L(jt.label.en, jt.label.zh)} (°)`, { min: Math.round(jt.lo * DEG), max: Math.round(jt.hi * DEG), step: 1, value: S.q * DEG }, (v) => { S.q = v / DEG; last = "arm"; redraw(); }, (v) => nf(v, 0));
    ui.btn(L("reset", "复位"), () => { Object.assign(S, init()); last = null; sx.set(S.x + ox); sy.set(S.y + oy); sw.set(S.yaw * DEG); sq.set(S.q * DEG); redraw(); });
    ui.legend([[P.x, L("$x$ axis", "$x$ 轴")], [P.y, L("$y$ axis", "$y$ 轴")], [P.z, L("$z$ axis", "$z$ 轴")], [P.target, L("the cube $P$ (drag it on the table)", "方块 $P$（可在桌面上拖动）")]]);
    ui.caption(L("Do: move and turn the base with the sliders, then drag the pink cube on the table; pick a frame to see the point's coordinates in it as three steps along that frame's own axes. Notice: moving the robot leaves $p_W$ alone and changes $p_B$ — the point did not move, the frame did; dragging the cube changes every set of coordinates. The 4×4 matrix $T_{WB}$ holds both answers to \"where is $B$\": its rotation columns are $B$'s axes (same colours as in the picture) and its last column is $B$'s origin.", "操作：用滑块移动、转动基座，再在桌面上拖动粉色方块；选一个坐标系，看这个点在它里面的坐标——沿该坐标系自己的三根轴走三步。观察：机器人动的时候 $p_W$ 不变，$p_B$ 变——点没有动，动的是坐标系；拖动方块时，所有坐标都变。4×4 齐次变换 $T_{WB}$ 同时回答了“$B$ 在哪里”的两部分：旋转块的三列是 $B$ 的三根轴（颜色和图中一致），最后一列是 $B$ 的原点。"));
  });

  // ================================================================== anatomy
  // What the robot is made of: every joint axis as a short rod with a curved arrow (roll about x red,
  // pitch about y green, yaw about z blue; a prismatic joint gets a straight double arrow), the
  // floating base and the degree-of-freedom count, the selected joint highlighted with its range and a
  // slider, and optionally the link masses as spheres (volume ∝ mass) with the total CoM.
  // cfg:
  //   robot   string  "humanoid"  "humanoid" | "quadruped" | "wheeled" | "arm"
  //   group   string  "all"       joints shown at the start: "all" | "legs" | "arms" | "waist"
  //   joint   string  per robot   name of the joint selected at the start (e.g. "l_knee", "lf_kfe", "lift", "joint4")
  //   masses  bool    false       link masses and the total CoM shown at the start
  //   angle   number  none        start angle of the selected joint: degrees for a revolute joint, metres for the
  //                               lift (prismatic); clamped to the joint's range; none = the robot's home pose
  //   status  string  per robot   replaces the status line on the picture (may contain $…$)
  //   legLabels bool  false       name the feet: FL, FR, RL, RR on the quadruped, L and R on the humanoid
  //   mirror  bool    false       draw the left–right (sagittal, y = 0 of the base) mirror plane, humanoid and quadruped
  //   view, height, caption       as for every robot3d scene
  R3.scene("anatomy", (ui, cfg) => {
    const P = ui.P, kind = ["quadruped", "wheeled", "arm"].includes(cfg.robot) ? cfg.robot : "humanoid";
    const rb = rob.build(kind), n = rb.nq;
    // the humanoid is shown standing taller than its controller home (the H1 crouch, knees at 46°): knees at 23°, soles
    // flat on the floor — a display pose for this scene only, so every other scene's numbers stay the same
    if (kind === "humanoid") {
      for (const sd of ["l", "r"]) { rb.q[rb.ji(sd + "_hip_pitch")] = -0.2; rb.q[rb.ji(sd + "_knee")] = 0.4; rb.q[rb.ji(sd + "_ankle_pitch")] = -0.2; }
      rb.fk(); const z = (rb.framePose("l_foot").p[2] + rb.framePose("r_foot").p[2]) / 2; rb.base.p = V.sub(rb.base.p, [0, 0, z]); rb.fk();
    }
    const home = R3.snapshot(rb);
    const groupOf = (name) => (kind === "arm" ? "arms" : /hip|knee|ankle|haa|hfe|kfe/.test(name) ? "legs" : /shoulder|elbow/.test(name) ? "arms" : "waist");
    const groups = ["all", ...["legs", "arms", "waist"].filter((gname) => rb.jointNames.some((j) => groupOf(j) === gname))];
    const GN = { all: L("all", "全部"), legs: L("legs", "腿"), arms: L("arms", "手臂"), waist: kind === "wheeled" ? L("lift and waist", "升降和腰") : L("waist", "腰") };
    const defJ = { humanoid: "l_knee", quadruped: "lf_kfe", wheeled: "lift", arm: "joint4" }[kind];
    const S = { group: groups.includes(cfg.group) ? cfg.group : "all", sel: Math.max(0, rb.jointNames.indexOf(rb.jointNames.includes(cfg.joint) ? cfg.joint : defJ)), masses: !!cfg.masses };
    if (S.group !== "all" && groupOf(rb.jointNames[S.sel]) !== S.group) S.sel = rb.jointNames.findIndex((j) => groupOf(j) === S.group);
    const com0 = rb.com(); // the home pose's CoM: the read-out gives the shift from it
    if (cfg.angle != null && Number.isFinite(+cfg.angle)) { const jl0 = rb.links[rb.jointLink[S.sel]].joint, v = jl0.type === "P" ? +cfg.angle : (+cfg.angle * Math.PI) / 180; rb.q[S.sel] = clamp(v, jl0.lo, jl0.hi); rb.fk(); }
    const scale = { humanoid: 1, quadruped: 0.7, wheeled: 1, arm: 0.9 }[kind];
    const joint = (i) => rb.links[rb.jointLink[i]].joint;
    const label = (i) => L(joint(i).label.en, joint(i).label.zh);
    const inGroup = (i) => S.group === "all" || groupOf(rb.jointNames[i]) === S.group;
    // links moved by joint i: the joint's link and everything below it
    const subtree = (i) => { const root = rb.jointLink[i], out = new Set(); rb.links.forEach((l, k) => { for (let a = k; a >= 0; a = rb.links[a].parent) if (a === root) { out.add(k); break; } }); return out; };
    const axisCol = (a) => { const m = [Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2])], i = m[0] >= m[1] && m[0] >= m[2] ? 0 : m[1] >= m[2] ? 1 : 2; return [P.x, P.y, P.z][i]; };
    const PRE = { l: ["left", "左"], r: ["right", "右"], lf: ["left front", "左前"], rf: ["right front", "右前"], lh: ["left hind", "左后"], rh: ["right hind", "右后"] };
    const PART = { thigh: ["thigh", "大腿"], shank: ["shank", "小腿"], torso: ["torso", "躯干"], pelvis: ["pelvis", "骨盆"], head: ["head", "头"], body: ["body", "机身"], base: ["base", "底盘"], lift: ["lift", "升降柱"], upper_arm: ["upper arm", "上臂"], forearm: ["forearm", "前臂"], foot: ["foot", "脚"], hip: ["hip", "髋"], waist: ["waist", "腰"], hand: ["gripper", "夹爪"] };
    const linkName = (l) => { const m = l.name.match(/^(lf|rf|lh|rh|l|r)_(.+)$/), part = m ? m[2] : l.name, pre = m ? PRE[m[1]] : null, pp = PART[part] || (/^link(\d)$/.test(part) ? [`link ${part.slice(4)}`, `连杆 ${part.slice(4)}`] : [part, part]); return pre ? L(`${pre[0]} ${pp[0]}`, pre[1] + pp[1]) : L(pp[0], pp[1]); };
    const axisName = (a) => { const m = [Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2])], i = m[0] >= m[1] && m[0] >= m[2] ? 0 : m[1] >= m[2] ? 1 : 2; return kind === "arm" ? L(`axis closest to world $${"xyz"[i]}$`, `转轴最接近世界 $${"xyz"[i]}$ 轴`) : [L("roll, about $x$", "侧倾，绕 $x$"), L("pitch, about $y$", "俯仰，绕 $y$"), L("yaw, about $z$", "偏航，绕 $z$")][i]; };
    const HL = "#e3a6d6", MIR = "#7b3ff2";
    const legged = kind === "humanoid" || kind === "quadruped";
    const showMirror = legged && cfg.mirror === true, showLegs = legged && cfg.legLabels === true;
    const FEET = kind === "quadruped" ? [["lf_foot", "FL"], ["rf_foot", "FR"], ["lh_foot", "RL"], ["rh_foot", "RR"]] : [["l_foot", "L"], ["r_foot", "R"]];
    const view = ui.view({ height: 460, ...{ humanoid: { target: [0, 0, 0.86], dist: 3.2, yaw: 0.62, pitch: 0.2 }, quadruped: { target: [0, 0, 0.3], dist: 2.2, yaw: 0.7, pitch: 0.3 }, wheeled: { target: [0, 0, 0.75], dist: 3.5, yaw: 0.62, pitch: 0.2 }, arm: { target: [0.15, 0, 0.45], dist: 2.4, yaw: 0.55, pitch: 0.25 } }[kind], draw(g) {
      const sub = subtree(S.sel), selL = rb.jointLink[S.sel];
      g.robot(rb, { color: (li) => (sub.has(li) ? HL : null), alpha: S.masses ? 0.55 : 1 });
      // the base: floating (6 DoF, no motor), wheeled (3 planar DoF through the wheels) or bolted down
      const b = rb.links[0];
      if (kind === "arm") { g.box([b.pw[0], b.pw[1], 0.006], null, [0.26, 0.26, 0.012], P.joint); g.label([b.pw[0] + 0.13, b.pw[1] - 0.13, 0.01], L("bolted down: 0 base DoF", "固定在地上：基座 0 个自由度"), { small: true, cls: "bg" }); }
      else {
        const o = V.add(b.pw, kind === "wheeled" ? [0, 0, 0.14] : [0, 0, 0]);
        g.frame(o, b.Rw, 0.22 * scale, { w: 3.5, onTop: true });
        const lab = kind === "wheeled" ? L("mobile base: $x$, $y$, yaw through the wheels", "移动底盘：$x$、$y$、偏航靠轮子驱动") : L("floating base: 6 DoF, no motor", "浮动基座：6 个自由度，没有电机");
        g.label(V.add(o, [0, -0.25 * scale, 0]), lab, { small: true, cls: "bg", anchor: "right", dx: -8 });
      }
      // the sagittal mirror plane: through the base origin, spanned by the base's forward axis and the vertical
      if (showMirror) {
        const R0 = b.Rw, fx = V.unit([R0[0][0], R0[1][0], 0]);
        let x0 = Infinity, x1 = -Infinity, zt = 0;
        rb.links.forEach((l) => { const d = V.dot(V.sub(l.pw, b.pw), fx); x0 = Math.min(x0, d); x1 = Math.max(x1, d); zt = Math.max(zt, l.pw[2]); });
        const m = 0.18 * scale, top = zt + (kind === "humanoid" ? 0.04 : m), at = (d, z) => [b.pw[0] + fx[0] * d, b.pw[1] + fx[1] * d, z];
        const pts = [at(x0 - m, 0.002), at(x1 + m, 0.002), at(x1 + m, top), at(x0 - m, top)];
        g.poly(pts, MIR, { alpha: 0.12, w: 1.5 });
        g.label(pts[3], L("mirror plane $y = 0$", "镜像平面 $y = 0$"), { color: MIR, small: true, cls: "bg", dx: 8, dy: kind === "humanoid" ? 32 : 12 });
      }
      // foot names, set off sideways (away from the mirror plane) so they never sit under the frame's edge
      if (showLegs) { const ly = [b.Rw[0][1], b.Rw[1][1], 0]; for (const [f, nm] of FEET) { const fp = rb.framePose(f).p, sd = V.dot(V.sub(fp, b.pw), ly) >= 0 ? 1 : -1; g.label(V.add(fp, V.scale(ly, sd * 0.13 * scale)), nm, { cls: "bg", small: true, anchor: "center", dx: 0, dy: -4 }); } }
      // joint axes
      for (let i = 0; i < n; i++) {
        const ja = rb.jointAxisWorld(i), on = i === S.sel, vis = inGroup(i) || on;
        if (!vis) continue;
        const col = axisCol(ja.axis), Lr = (on ? 0.2 : 0.12) * scale, a = V.sub(ja.p, V.scale(ja.axis, Lr / 2)), e = V.add(ja.p, V.scale(ja.axis, Lr / 2));
        if (ja.type === "P") {
          const jl = joint(i), q = rb.q[i];
          g.cyl(V.add(ja.p, V.scale(ja.axis, -(q - jl.lo))), V.add(ja.p, V.scale(ja.axis, jl.hi - q)), 0.03, col, { alpha: 0.25 });
          g.arrow(ja.p, V.add(ja.p, V.scale(ja.axis, 0.12)), col, { w: on ? 5 : 3, onTop: true }); g.arrow(ja.p, V.sub(ja.p, V.scale(ja.axis, 0.12)), col, { w: on ? 5 : 3, onTop: true });
        } else {
          g.cyl(a, e, (on ? 0.011 : 0.007) * scale, col, { onTop: true });
          g.turn(V.add(ja.p, V.scale(ja.axis, Lr * 0.32)), ja.axis, (on ? 0.06 : 0.035) * scale, 1, col, { sweep: 1.4 * Math.PI, w: on ? 3 : 2, onTop: true });
        }
      }
      // the selected joint: its range as a fan, the current angle as a line
      {
        const i = S.sel, ja = rb.jointAxisWorld(i), jl = joint(i), q = rb.q[i], col = axisCol(ja.axis);
        if (ja.type === "R") {
          let d = [0, 0, 0], ms = 0;
          rb.links.forEach((l, k) => { if (sub.has(k) && l.mass) { d = V.add(d, V.scale(l.cw, l.mass)); ms += l.mass; } });
          const proj = (v) => V.sub(v, V.scale(ja.axis, V.dot(v, ja.axis)));
          d = proj(V.sub(V.scale(d, 1 / ms), ja.p));
          if (V.norm(d) < 0.03) { const Rl = rb.links[selL].Rw; d = proj([Rl[0][0], Rl[1][0], Rl[2][0]]); if (V.norm(d) < 0.3) d = proj([Rl[0][1], Rl[1][1], Rl[2][1]]); }
          const u = V.unit(d), r = 0.16 * scale, pts = [ja.p];
          for (let s = 0; s <= 32; s++) { const th = jl.lo - q + ((jl.hi - jl.lo) * s) / 32; pts.push(V.add(ja.p, V.scale(M.mulv(M.axisAngle(ja.axis, th), u), r))); }
          g.poly(pts, col, { alpha: 0.16, w: 1.5, onTop: false });
          g.line(ja.p, V.add(ja.p, V.scale(u, r * 1.15)), col, { w: 3, onTop: true });
        }
        g.label(V.add(ja.p, [0, 0, 0.04]), `${label(i)} · ${ja.type === "P" ? nf(q, 2) + " m" : nf(q * DEG, 0) + "°"}`, { cls: "bg", dx: 14, dy: -16 });
      }
      // link masses: spheres with volume ∝ mass at each link's CoM, and the total CoM
      if (S.masses) {
        // radius ∝ ∛m, so the volume is ∝ m (10 kg → 4.5 cm)
        rb.links.forEach((l) => { if (l.mass > 0.05) g.sphere(l.cw, 0.045 * scale * Math.cbrt(l.mass / 10), P.com, { alpha: 0.6, onTop: true }); });
        const heavy = rb.links.filter((l) => l.mass > 0).sort((a, c) => c.mass - a.mass).slice(0, 3);
        heavy.forEach((l) => g.label(l.cw, `${nf(l.mass, 1)} kg`, { color: P.com, small: true, cls: "bg", dx: 16, dy: -10 }));
        R3.drawCom(g, rb.com(), { r: 0.04 * scale, label: false }); g.label(rb.com(), L("total CoM", "总质心"), { color: P.com, anchor: "right", dx: -14, dy: 12, cls: "bg" });
      }
      // ---- words and numbers
      const ja = rb.jointAxisWorld(S.sel), jl = joint(S.sel), q = rb.q[S.sel];
      const dofLine = {
        humanoid: L(`${n} joints, all driven by motors · floating base: 6 more DoF (3 position + 3 orientation) that no motor moves directly — only the feet pushing on the floor do · $n_v = 6 + ${n} = ${6 + n}$ DoF, $n_{act} = ${n}$; the configuration $q$ stores the orientation as a quaternion, so it has $7 + ${n} = ${7 + n}$ numbers`, `${n} 个关节，全部由电机驱动 · 浮动基座：另外 6 个自由度（3 个位置 + 3 个姿态），没有任何电机直接驱动它——只能靠脚推地面 · $n_v = 6 + ${n} = ${6 + n}$ 个自由度，$n_{act} = ${n}$；位形 $q$ 用四元数存姿态，所以有 $7 + ${n} = ${7 + n}$ 个数`),
        quadruped: L(`${n} joints (3 per leg), all driven by motors · floating base: 6 more DoF that no motor moves directly — only the feet pushing on the floor do · $n_v = 6 + ${n} = ${6 + n}$ DoF, $n_{act} = ${n}$ ($q$ has $7 + ${n} = ${7 + n}$ numbers with a quaternion)`, `${n} 个关节（每条腿 3 个），全部由电机驱动 · 浮动基座：另外 6 个自由度，没有电机直接驱动——只能靠脚推地面 · $n_v = 6 + ${n} = ${6 + n}$ 个自由度，$n_{act} = ${n}$（用四元数时 $q$ 有 $7 + ${n} = ${7 + n}$ 个数）`),
        wheeled: L(`${n} joints (lift, waist, 2 × 4 arm) · the base moves in the plane ($x$, $y$, yaw: 3 DoF) through its wheel motors; the floor holds its height, roll and pitch · $n = 3 + ${n} = ${3 + n}$ DoF, all actuated — but the base can only push on the floor, it can tip (see the wheeled scene)`, `${n} 个关节（升降、腰、2 × 4 个手臂关节）· 底盘靠轮子电机在平面内运动（$x$、$y$、偏航：3 个自由度），高度、侧倾、俯仰由地面约束 · 共 $3 + ${n} = ${3 + n}$ 个自由度，全部可驱动——但底盘只能推地面，会翻（见轮式场景）`),
        arm: L(`${n} joints, all driven by motors · base bolted down: 0 base DoF, the floor can pull as well as push · $n = ${n}$ DoF, $n_{act} = ${n}$ — fully actuated, nothing to balance`, `${n} 个关节，全部由电机驱动 · 基座用螺栓固定：基座 0 个自由度，地面能拉也能推 · $n = ${n}$ 个自由度，$n_{act} = ${n}$——完全驱动，不需要平衡`),
      }[kind];
      const selLine = L(`selected: ${label(S.sel)} — ${ja.type === "P" ? "prismatic (slides)" : "revolute, " + axisName(ja.axis)}, range ${ja.type === "P" ? `${nf(jl.lo)} … ${nf(jl.hi)} m, now ${nf(q)} m` : `${nf(jl.lo * DEG, 0)}° … ${nf(jl.hi * DEG, 0)}°, now ${nf(q * DEG, 0)}°`} · it moves the pink links (${[...subtree(S.sel)].reduce((s, k) => s + rb.links[k].mass, 0).toFixed(1)} kg)`, `选中：${label(S.sel)}——${ja.type === "P" ? "移动关节（滑动）" : "转动关节，" + axisName(ja.axis)}，范围 ${ja.type === "P" ? `${nf(jl.lo)} … ${nf(jl.hi)} m，当前 ${nf(q)} m` : `${nf(jl.lo * DEG, 0)}° … ${nf(jl.hi * DEG, 0)}°，当前 ${nf(q * DEG, 0)}°`} · 它带动粉色的连杆（${[...subtree(S.sel)].reduce((s, k) => s + rb.links[k].mass, 0).toFixed(1)} kg）`);
      const lines = [dofLine, selLine];
      if (S.masses) {
        const heavy = rb.links.filter((l) => l.mass > 0).sort((a, c) => c.mass - a.mass), c = rb.com(), nm = linkName;
        const top = heavy.slice(0, 3).map((l) => `${nf(l.mass, 1)} \\times ${nf(l.cw[2])}`).join(" + ");
        lines.push(L(`$c = \\frac{\\sum m_i c_i}{\\sum m_i}$, height: $c_z = \\frac{${top} + \\dots}{${nf(rb.totalMass, 1)}} = ${nf(c[2])}$ m (heaviest: ${heavy.slice(0, 3).map(nm).join(", ")}; ${heavy.length} links in all) · shift from the home pose: forward $${nf(100 * (c[0] - com0[0]), 1)}$ cm, sideways $${nf(100 * (c[1] - com0[1]), 1)}$ cm, up $${nf(100 * (c[2] - com0[2]), 1)}$ cm`, `$c = \\frac{\\sum m_i c_i}{\\sum m_i}$，高度：$c_z = \\frac{${top} + \\dots}{${nf(rb.totalMass, 1)}} = ${nf(c[2])}$ m（最重的三个：${heavy.slice(0, 3).map(nm).join("、")}；共 ${heavy.length} 个连杆）· 相对初始姿态的移动：向前 $${nf(100 * (c[0] - com0[0]), 1)}$ cm，向侧面 $${nf(100 * (c[1] - com0[1]), 1)}$ cm，向上 $${nf(100 * (c[2] - com0[2]), 1)}$ cm`));
      }
      ui.say(lines);
      if (cfg.status) ui.status(cfg.status, "info"); else ui.status(kind === "arm" ? L(`fixed base: ${n} DoF, all actuated`, `固定基座：${n} 个自由度，全部可驱动`) : kind === "wheeled" ? L(`${3 + n} DoF: ${n} joints + 3 for the base on its wheels`, `${3 + n} 个自由度：${n} 个关节 + 底盘 3 个`) : L(`${6 + n} DoF, only ${n} have motors: the 6 of the base are unactuated`, `${6 + n} 个自由度，只有 ${n} 个有电机：基座的 6 个不可直接驱动`), "info");
    } });

    // controls: group, prev / list / next, the joint's slider, masses
    const sel = h("select", { class: "viz-btn", style: "max-width: 15em; padding: 6px 8px; font: inherit; font-size: 13.5px;" });
    const fill = () => { sel.replaceChildren(...rb.jointNames.map((nm, i) => (inGroup(i) ? h("option", { value: String(i) }, label(i)) : null)).filter(Boolean)); sel.value = String(S.sel); };
    sel.addEventListener("change", () => pick(+sel.value));
    const members = () => rb.jointNames.map((_, i) => i).filter(inGroup);
    let js = null;
    const jsFmt = () => (joint(S.sel).type === "P" ? (v) => nf(v / 100, 2) + " m" : (v) => nf(v, 0) + "°");
    function makeSlider() {
      const jl = joint(S.sel), P_ = jl.type === "P", k = P_ ? 100 : DEG;
      const s = slide(ui, L("move it", "转动它"), { min: jl.lo * k, max: jl.hi * k, step: P_ ? 1 : 1, value: rb.q[S.sel] * k }, (v) => { rb.q[S.sel] = v / k; rb.fk(); view.redraw(); }, jsFmt());
      if (js) js.replaceWith(s); js = s;
    }
    function pick(i) { S.sel = i; sel.value = String(i); makeSlider(); view.redraw(); }
    if (groups.length > 2) ui.seg(groups.map((gname) => [gname, GN[gname]]), S.group, (v) => { S.group = v; fill(); if (!inGroup(S.sel)) pick(members()[0]); else view.redraw(); });
    const step = (d) => { const m = members(), k = m.indexOf(S.sel); pick(m[(k + d + m.length) % m.length]); };
    ui.btn("◀", () => step(-1)); ui.ctrls.append(sel); ui.btn("▶", () => step(1));
    fill(); makeSlider();
    ui.toggle(L("link masses", "连杆质量"), S.masses, (on) => { S.masses = on; legend(); view.redraw(); });
    ui.btn(L("reset pose", "复位姿态"), () => { R3.restore(rb, home); makeSlider(); view.redraw(); });
    const legend = () => ui.legend([[P.x, L("roll joint (about $x$)", "侧倾关节（绕 $x$）")], [P.y, L("pitch joint (about $y$)", "俯仰关节（绕 $y$）")], [P.z, L("yaw joint (about $z$)", "偏航关节（绕 $z$）")], [HL, L("links the selected joint moves", "选中关节带动的连杆")], ...(showMirror ? [[MIR, L("left–right mirror plane (sagittal, $y = 0$)", "左右镜像平面（矢状面，$y = 0$）")]] : []), ...(S.masses ? [[P.com, L("link masses (volume ∝ mass) and the total CoM", "连杆质量（体积 ∝ 质量）和总质心")]] : [])]);
    legend();
    const capHL = L("Do: step through the joints with ◀ ▶ (or pick a group or a joint from the list) and move each one with its slider; switch on the link masses. Notice: the colour of a rod says which way the joint turns (red roll about $x$, green pitch about $y$, blue yaw about $z$); the pink links are everything the selected joint carries. ", "操作：用 ◀ ▶ 逐个选关节（或从列表里选组、选关节），用滑块转动它；打开连杆质量。观察：轴的颜色说明关节绕哪个方向转（红色绕 $x$ 侧倾，绿色绕 $y$ 俯仰，蓝色绕 $z$ 偏航）；粉色的是选中关节带动的全部连杆。");
    const capCoM = L(" With masses on, the total CoM is the mass-weighted average of the orange spheres.", "打开质量后，总质心就是这些橙色球按质量加权的平均位置。");
    ui.caption({
      humanoid: capHL + L("Hips and shoulders stack three axes in one point, like a ball joint. The pelvis frame has no rod: its 6 degrees of freedom have no motor, the robot can only move them by pushing on the floor — that is why whole-body control is about contact forces.", "髋和肩是三根轴交在一点，相当于一个球关节。骨盆坐标系没有转轴：它的 6 个自由度没有电机，机器人只能靠推地面来移动它——所以全身控制的核心是接触力。") + capCoM,
      quadruped: capHL + L("Each leg has three joints: hip abduction (red), hip pitch and knee (green) — enough to put a point foot anywhere nearby. The body frame has no rod: its 6 degrees of freedom have no motor, only the feet pushing on the floor move it.", "每条腿三个关节：髋外展（红）、髋俯仰和膝（绿）——足以把点足放到附近任意位置。机身坐标系没有转轴：它的 6 个自由度没有电机，只能靠脚推地面来移动。") + capCoM,
      wheeled: capHL + L("The lift is a prismatic joint (a straight double arrow): it slides instead of turning. The base needs no legs: its wheel motors drive $x$, $y$ and yaw directly, while the floor holds its height, roll and pitch — but it can only push on the floor, so the robot can still tip.", "升降柱是移动关节（直的双向箭头）：它滑动而不是转动。底盘不需要腿：轮子电机直接驱动 $x$、$y$ 和偏航，高度、侧倾、俯仰由地面约束——但地面只能推，所以机器人仍然可能翻倒。") + capCoM,
      arm: capHL + L("The arm's axes are tilted, so the colour only names the world axis each one is closest to. The arm is bolted to the floor, so every one of its 7 degrees of freedom has a motor and nothing has to be balanced — the contrast with a legged robot.", "机械臂的转轴是斜的，颜色只表示它最接近哪根世界坐标轴。机械臂用螺栓固定在地上，7 个自由度每个都有电机，不需要平衡——和腿式机器人形成对比。") + capCoM,
    }[kind]);
  });
})();
