"use strict";
// robot3d scenes (PLAN R19) — see viz10.js for the scaffold.
// This file: "reach" (whole-body control as a stack of tasks; null-space motion of a 7-DoF arm),
// "jacobian" (what a Jacobian column is; the manipulability ellipsoid) and "statics"
// (τ = Jᵀ f and gravity torques, for an arm and for a humanoid holding a box).
(() => {
  if (!window.Viz || !Viz.r3 || !Viz.rob) return;
  const R3 = Viz.r3, rob = Viz.rob, V = rob.V, M = rob.M, L = R3.L, zh = R3.zh;
  const { f0, f1, f2, cm } = R3.fmt;
  const { h } = Viz.util;
  const G = rob.G, DEG = 180 / Math.PI;
  // joint colours (one per Jacobian column / joint); none of them is a fixed palette meaning
  const JC = ["#2563eb", "#c2410c", "#15803d", "#9333ea", "#be123c", "#0e7490", "#a16207"];
  const fin = (x, d = 0) => (Number.isFinite(x) ? x : d);
  const nz = (s) => (s === "-0.00" ? "0.00" : s === "-0.0" ? "0.0" : s === "-0" ? "0" : s); // no "−0.00"
  const sf2 = (x) => nz(f2(fin(x))), sf1 = (x) => nz(f1(fin(x))), sf0 = (x) => nz(f0(fin(x)));
  const mm = (x) => (1000 * x).toFixed(1);
  const clampv = (x, a, b) => Math.max(a, Math.min(b, x));
  const jointName = (rb, qi) => { const lb = rb.links[rb.jointLink[qi]].joint.label; return zh() ? lb.zh : lb.en; };

  // eigen-decomposition of a symmetric 3×3 matrix (Jacobi rotations): values descending, vectors as unit 3-vectors
  function eigSym3(A) {
    const a = A.map((r) => r.slice()), v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let s = 0; s < 60; s++) {
      let p = 0, q = 1;
      if (Math.abs(a[0][2]) > Math.abs(a[p][q])) { p = 0; q = 2; }
      if (Math.abs(a[1][2]) > Math.abs(a[p][q])) { p = 1; q = 2; }
      if (Math.abs(a[p][q]) < 1e-18) break;
      const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), c = Math.cos(th), sn = Math.sin(th);
      for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - sn * y; a[k][q] = sn * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - sn * y; a[q][k] = sn * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = v[k][p], y = v[k][q]; v[k][p] = c * x - sn * y; v[k][q] = sn * x + c * y; }
    }
    return [0, 1, 2].map((i) => ({ val: a[i][i], vec: [v[0][i], v[1][i], v[2][i]] })).sort((x, y) => y.val - x.val);
  }
  // closest points of the lines o1 + s·d1 and o2 + t·d2 (null when parallel)
  function closestLines(o1, d1, o2, d2) {
    const r = V.sub(o1, o2), a = V.dot(d1, d1), b = V.dot(d1, d2), c = V.dot(d2, d2), d = V.dot(d1, r), e = V.dot(d2, r), den = a * c - b * b;
    if (Math.abs(den) < 1e-9) return null;
    const s = (b * e - c * d) / den, t = (a * e - b * d) / den;
    return [V.add(o1, V.scale(d1, s)), V.add(o2, V.scale(d2, t))];
  }
  // a direction in words (world frame: x forward, y left, z up)
  function dirWords(u) {
    const k = [0, 1, 2].reduce((b, i) => (Math.abs(u[i]) > Math.abs(u[b]) ? i : b), 0);
    return [[L("forward / back", "前后方向"), L("sideways", "左右方向"), L("up / down", "上下方向")][k], Math.abs(u[k])];
  }
  // the foot of the figure (read-out, legend, caption); bars go right under the read-out
  function barsBox(ui) {
    const foot = ui.ctrls.nextElementSibling, read = foot && foot.querySelector(".r3-read");
    const el = h("div", { class: "r3-bars", style: "display:grid;grid-template-columns:auto 1fr auto;gap:3px 10px;align-items:center;font-size:13.5px;margin:2px 0 8px;font-variant-numeric:tabular-nums;max-width:560px" });
    if (read) read.after(el); else ui.stage.append(el);
    let key = "";
    return {
      el,
      // rows: [label, fraction (0…∞), text, over]
      set(rows) {
        const k = JSON.stringify(rows);
        if (k === key) return;
        key = k;
        el.replaceChildren(...rows.flatMap(([lab, fr, txt, over]) => {
          const col = over ? "var(--red)" : ui.P.torque;
          const track = h("span", { style: "position:relative;height:9px;border-radius:5px;background:var(--border);overflow:hidden" }, h("span", { style: `position:absolute;left:0;top:0;bottom:0;width:${(100 * clampv(fin(fr), 0, 1)).toFixed(1)}%;background:${col};border-radius:5px` }));
          return [Viz.util.math(h("span", { style: "color:var(--fg-2)" }), lab), track, h("span", { style: `color:${over ? "var(--red)" : "var(--fg)"};font-weight:${over ? 700 : 500}` }, txt)];
        }));
      },
    };
  }
  // solve-on-input, animate only while converging: step(n) runs n IK steps and returns the largest |Δq|
  function converger(view, step, o = {}) {
    let busy = false, it = 0;
    const per = o.per ?? 8, tol = o.tol ?? 2e-4, max = o.max ?? 700;
    return {
      kick() { it = 0; if (!busy) { busy = true; view.animate(true); } },
      tick() { if (!busy) return; const mx = step(per); it += per; if (!(mx > tol) || it >= max) { busy = false; view.animate(false); } },
      settle(n = 1500) { for (let i = 0; i < n; i += 20) if (!(step(20) > tol)) break; },
      get busy() { return busy; },
    };
  }
  // n steps of rb.ik(levels()); returns the largest change of a joint or of the base position in the last step
  function ikSteps(rb, levels, n, opts) {
    let d = 0;
    for (let i = 0; i < n; i++) {
      rb.fk();
      const q0 = Float64Array.from(rb.q), p0 = rb.base.p.slice();
      rb.ik(levels(), { damping: 0.03, maxDq: 0.05, ...opts });
      d = 0;
      for (let j = 0; j < rb.nq; j++) d = Math.max(d, Math.abs(rb.q[j] - q0[j]));
      for (let j = 0; j < 3; j++) d = Math.max(d, Math.abs(rb.base.p[j] - p0[j]));
    }
    rb.fk();
    return d;
  }
  // min Σ‖f‖² floor forces at the corners of `frames` that carry a total mass Mt whose CoM is c (static):
  // Σ f = Mt·g·ẑ, Σ (p − c) × f = 0, f_z ≥ 0, |f_x|, |f_y| ≤ μ f_z — rob.distributeForces with an added load.
  function distributeLoad(rb, frameNames, Mt, c, mu = 0.6) {
    const pts = [];
    for (const f of frameNames) rb.frameCorners(f).forEach((p) => pts.push({ frame: f, p }));
    const n = 3 * pts.length, Z = rob.la.zeros, A = Z(6, n), Ain = [], bin = [], b = [0, 0, Mt * G, 0, 0, 0];
    pts.forEach((pt, k) => {
      const r = V.sub(pt.p, c), i = 3 * k;
      A[0][i] = A[1][i + 1] = A[2][i + 2] = 1;
      A[3][i + 1] = -r[2]; A[3][i + 2] = r[1]; A[4][i] = r[2]; A[4][i + 2] = -r[0]; A[5][i] = -r[1]; A[5][i + 1] = r[0];
      const row = (x, y, z) => { const q = new Array(n).fill(0); q[i] = x; q[i + 1] = y; q[i + 2] = z; Ain.push(q); bin.push(0); };
      row(0, 0, -1); row(1, 0, -mu); row(-1, 0, -mu); row(0, 1, -mu); row(0, -1, -mu);
    });
    // CoM outside the support polygon: no pushing-only forces exist. Skip the (slow) soft QP and put the weight on
    // the edge the robot tips over — the best the floor can do.
    const poly = rob.hull2d(pts.map((pt) => pt.p));
    if (poly.length >= 3 && !rob.inPoly([c[0], c[1]], poly)) {
      let best = 0, bd = Infinity;
      poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length], d = segD([c[0], c[1]], p, q); if (d < bd) { bd = d; best = i; } });
      const e0 = poly[best], e1 = poly[(best + 1) % poly.length], ln = V.unit([e1[1] - e0[1], e0[0] - e1[0], 0]), on = pts.map((pt) => Math.abs((pt.p[0] - e0[0]) * ln[0] + (pt.p[1] - e0[1]) * ln[1]) < 3e-3), k = on.filter(Boolean).length || 1;
      return finish(pts.map((pt, i) => (on[i] ? [0, 0, (Mt * G) / k] : [0, 0, 0])), false);
    }
    let sol = rob.qp(rob.la.eye(n).map((r) => r.map((x) => 2 * x)), new Array(n).fill(0), A, b, Ain, bin);
    const ok = sol.status === "optimal" || sol.status === "approx";
    if (!ok) {
      const w = [1, 1, 1, 4, 4, 4], H = Z(n, n), g = new Array(n).fill(0);
      for (let r = 0; r < 6; r++) for (let i = 0; i < n; i++) { if (A[r][i] === 0) continue; g[i] -= 2 * w[r] * A[r][i] * b[r]; for (let j = 0; j < n; j++) H[i][j] += 2 * w[r] * A[r][i] * A[r][j]; }
      for (let i = 0; i < n; i++) H[i][i] += 2e-4;
      sol = rob.qp(H, g, [], [], Ain, bin);
    }
    return finish(pts.map((_, k) => [fin(sol.x[3 * k]), fin(sol.x[3 * k + 1]), fin(sol.x[3 * k + 2])]), ok);
    function finish(fs, ok) {
    const forces = pts.map((pt, k) => ({ frame: pt.frame, p: pt.p, f: fs[k] }));
    const frames = {};
    for (const fn of frameNames) {
      let F = [0, 0, 0], cx = 0, cy = 0, cz = 0;
      for (const fc of forces) if (fc.frame === fn) { F = V.add(F, fc.f); cx += fc.p[0] * fc.f[2]; cy += fc.p[1] * fc.f[2]; cz += fc.p[2] * fc.f[2]; }
      frames[fn] = { f: F, cop: F[2] > 1e-9 ? [cx / F[2], cy / F[2], cz / F[2]] : null };
    }
    return { ok, forces, frames };
    }
  }
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 > 0 ? clampv(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };

  // ================================================================== reach
  // Whole-body control as a stack of tasks.
  // cfg (robot "humanoid", the default):
  //   robot     "humanoid" | "arm"   which robot (default "humanoid")
  //   target    [x, y, z] (m)        where the right hand should go; default [0.95, -0.25, 1.0], a
  //                                  target the hand cannot reach while the CoM stays over the middle of the feet
  //   mode      "strict" | "weighted"  strict priorities (levels of rb.ik) or one weighted least-squares level (default "strict")
  //   order     "balance" | "hand"   which of the two is the higher priority in strict mode (default "balance")
  //   balance   bool                 balance task on (CoM ground point → centre of the support polygon; default true)
  //   hand      bool                 right-hand task on (default true)
  //   posture   bool                 posture task on (stay near the neutral pose, lowest; default true)
  //   wBalance  number 0.1–10        weight of the balance task in weighted mode (default 1)
  //   wHand     number 0.1–10        weight of the hand task in weighted mode (default 1); posture weight is 0.3
  // cfg (robot "arm"): the hand holds its pose (6-D task) while the elbow is pulled around its self-motion circle
  //   psi       number (°)           where the pull on the elbow points along its circle (default 70; clamped to the
  //                                  joint-limited self-motion range, about −130…130)
  //   projector bool                 q̇₀ goes through the null-space projector I − J⁺J (default true); off: the hand is dragged away
  //   swing     bool                 the pull sweeps back and forth by itself (default false)
  // Feet are always the top priority. Drag the pink target; presets "lean", "low", "side", "high".
  R3.scene("reach", (ui, cfg) => (cfg.robot === "arm" ? reachArm(ui, cfg) : reachHumanoid(ui, cfg)));

  function reachHumanoid(ui, cfg) {
    const P = ui.P, rb = rob.build("humanoid");
    rb.fk();
    const feet = ["l_foot", "r_foot"], home = R3.snapshot(rb), footHome = Object.fromEntries(feet.map((f) => [f, rb.framePose(f)]));
    const poly = rb.supportPolygon(feet), cen = R3.centroid(poly);
    const PRE = { lean: [0.95, -0.25, 1.0], low: [0.45, -0.22, 0.25], side: [0.1, -0.85, 0.95], high: [0.3, -0.3, 1.75] };
    const okTarget = (t) => Array.isArray(t) && t.length === 3 && t.every(Number.isFinite);
    const S = {
      target: okTarget(cfg.target) ? cfg.target.slice() : PRE.lean.slice(), mode: cfg.mode === "weighted" ? "weighted" : "strict", order: cfg.order === "hand" ? "hand" : "balance",
      on: { balance: cfg.balance !== false, hand: cfg.hand !== false, posture: cfg.posture !== false }, wb: clampv(cfg.wBalance ?? 1, 0.1, 10), wh: clampv(cfg.wHand ?? 1, 0.1, 10),
    };
    const levels = () => {
      const L1 = feet.map((f) => rb.taskPose(f, footHome[f].p, footHome[f].R));
      // rows scaled by 0.1: with the solver's damping λ this is an effective damping of 10 λ for these tasks, which keeps
      // an unreachable target from making the arm chatter at its singular (stretched) pose
      const ws = 0.1, post = rb.taskPosture(home.q, { gain: 0.3 });
      if (S.mode === "weighted") return [L1, [...(S.on.balance ? [rb.taskCom(cen, { w: ws * S.wb })] : []), ...(S.on.hand ? [rb.taskPos("r_hand", S.target, { w: ws * S.wh })] : []), ...(S.on.posture ? [{ ...post, w: ws * 0.3 }] : [])]];
      const bal = rb.taskCom(cen, { w: ws }), hand = rb.taskPos("r_hand", S.target, { w: ws });
      const a = S.on.balance ? [bal] : [], b = S.on.hand ? [hand] : [];
      return [L1, ...(S.order === "balance" ? [a, b] : [b, a]), S.on.posture ? [post] : []];
    };
    const step = (n) => ikSteps(rb, levels, n);
    const errs = () => {
      const c = rb.com(), hp = rb.framePose("r_hand").p;
      let fe = 0;
      for (const f of feet) { const fp = rb.framePose(f); fe = Math.max(fe, V.dist(fp.p, footHome[f].p) + 0.1 * V.norm(M.log(M.mul(footHome[f].R, M.T(fp.R))))); }
      let pe = 0;
      for (let j = 0; j < rb.nq; j++) pe += (rb.q[j] - home.q[j]) ** 2;
      return { c, hp, feet: fe, bal: Math.hypot(c[0] - cen[0], c[1] - cen[1]), hand: V.dist(hp, S.target), post: Math.sqrt(pe), margin: rob.distToPoly([c[0], c[1]], poly) };
    };
    const prio = () => (S.mode === "weighted" ? { balance: 2, hand: 2, posture: 2 } : S.order === "balance" ? { balance: 2, hand: 3, posture: 4 } : { balance: 3, hand: 2, posture: 4 });
    const NUM = ["", "①", "②", "③", "④"];

    const view = ui.view({ height: 440, target: [0.3, -0.12, 0.92], dist: 3.5, yaw: 0.42, pitch: 0.22, draw(g) {
      solver.tick();
      const e = errs(), ok = e.margin >= 0;
      g.robot(rb, ok ? {} : { color: () => "#e9a3a0" });
      R3.drawSupport(g, poly, ok);
      if (S.on.balance) g.circle([cen[0], cen[1], 0.003], [0, 0, 1], 0.03, P.com, { w: 2, ground: true });
      R3.drawCom(g, e.c);
      if (S.on.hand && e.hand > 0.005) {
        g.line(e.hp, S.target, P.target, { w: 2.5, dash: 0.03, onTop: true });
        g.label(V.lerp(e.hp, S.target, 0.5), `${cm(e.hand)} cm`, { color: P.target, dy: 14, small: true });
      }
      g.sphere(e.hp, 0.025, P.hand, { onTop: true, alpha: 0.9 });
      const p = prio(), hs = S.on.hand ? e.hand : 0, short = S.on.hand && e.hand > 0.01;
      // status: the conclusion in words
      if (!ok && S.mode === "weighted" && short) ui.status(L(`compromise: hand ${cm(hs)} cm short and the CoM ${cm(-e.margin)} cm outside — it falls`, `折中：手差 ${cm(hs)} cm，质心还超出 ${cm(-e.margin)} cm——会摔倒`), "bad");
      else if (!ok) ui.status(S.on.hand && !short ? L(`reaches — and falls: the CoM is ${cm(-e.margin)} cm outside the support polygon`, `够到了——但会摔倒：质心已经超出支撑多边形 ${cm(-e.margin)} cm`) : L(`falls: the CoM is ${cm(-e.margin)} cm outside the support polygon`, `会摔倒：质心超出支撑多边形 ${cm(-e.margin)} cm`), "bad");
      else if (!S.on.hand) ui.status(L("hand task off: the right hand just follows the posture task", "手部任务已关闭：右手只跟着姿态任务走"), "info");
      else if (short) ui.status(S.mode === "weighted" ? L(`compromise: hand ${cm(hs)} cm short, CoM ${cm(e.bal)} cm off centre`, `折中：手差 ${cm(hs)} cm，质心偏离中心 ${cm(e.bal)} cm`) : L(`balance kept, hand ${cm(hs)} cm short`, `保住了平衡，手还差 ${cm(hs)} cm`), "warn");
      else ui.status(S.on.balance && e.bal < 0.01 ? L("balanced and on target", "既平衡又够到了目标") : L(`on target, CoM ${cm(e.margin)} cm inside the edge`, `够到了目标，质心离边界还有 ${cm(e.margin)} cm`), "ok");
      const wt = { balance: S.wb, hand: S.wh, posture: 0.3 }, wm = S.mode === "weighted";
      // strict: the level number; weighted: one level, so the weight instead
      const t = (on, k, name, val, key) => (on ? `${wm ? "" : NUM[k] + " "}${name}${wm ? ` ($w = ${f1(wt[key])}$)` : ""} $\\|e\\| = ${val}$` : `${name} ${L("(off)", "（关）")}`);
      ui.say([
        [[1, `${NUM[1]} ${L("feet", "双脚")} $\\|e\\| = ${mm(e.feet)}$ mm`], [p.balance + 0.1, t(S.on.balance, p.balance, L("balance", "平衡"), cm(e.bal) + "\\text{ cm}", "balance")], [p.hand + 0.2, t(S.on.hand, p.hand, L("hand", "手"), cm(e.hand) + "\\text{ cm}", "hand")], [p.posture + 0.3, t(S.on.posture, p.posture, L("posture", "姿态"), f2(e.post) + "\\text{ rad}", "posture")]].sort((x, y) => x[0] - y[0]).map((x) => x[1]).join(" · "),
        S.mode === "strict"
          ? L("strict priorities: level $k$ is solved inside the null space $N_{k-1}$ of every level above it, $\\dot q_k = \\dot q_{k-1} + (J_k N_{k-1})^{+}(e_k - J_k \\dot q_{k-1})$ — a lower task can never disturb a higher one, it only gets what is left.",
            "严格任务优先级：第 $k$ 层只在上面所有层的零空间 $N_{k-1}$ 里求解，$\\dot q_k = \\dot q_{k-1} + (J_k N_{k-1})^{+}(e_k - J_k \\dot q_{k-1})$——低优先级任务永远不会干扰高优先级任务，只能用剩下的自由度。")
          : L(`weighted sum: below the feet, one least-squares problem $\\min_{\\dot q} \\sum_i \\|w_i\\,(J_i \\dot q - e_i)\\|^2$ (each task's error scaled by its weight) with $w_{bal} = ${f1(S.wb)}$, $w_{hand} = ${f1(S.wh)}$, $w_{post} = 0.3$ — every task gives a little, none is exact.`,
            `加权求和：双脚之下只有一个最小二乘问题 $\\min_{\\dot q} \\sum_i \\|w_i\\,(J_i \\dot q - e_i)\\|^2$（每个任务的误差乘以它的权重），$w_{bal} = ${f1(S.wb)}$，$w_{hand} = ${f1(S.wh)}$，$w_{post} = 0.3$——每个任务都让一点，没有一个是精确满足的。`),
        L(`CoM ground point $(x, y) = (${sf2(e.c[0])}, ${sf2(e.c[1])})$ m · `, `质心投影 $(x, y) = (${sf2(e.c[0])}, ${sf2(e.c[1])})$ m · `) + (ok ? L(`${cm(e.margin)} cm inside the nearest edge`, `离最近的边 ${cm(e.margin)} cm`) : L(`${cm(-e.margin)} cm outside the support polygon`, `超出支撑多边形 ${cm(-e.margin)} cm`)) + L(` · target $(${sf2(S.target[0])}, ${sf2(S.target[1])}, ${sf2(S.target[2])})$ m`, ` · 目标 $(${sf2(S.target[0])}, ${sf2(S.target[1])}, ${sf2(S.target[2])})$ m`),
      ]);
    } });
    const solver = converger(view, step);
    view.handle({ get: () => S.target, set: (p) => { S.target = [clampv(p[0], -0.4, 1.4), clampv(p[1], -1.2, 1.0), clampv(p[2], 0.05, 2.1)]; solver.kick(); }, r: 0.04 });

    // controls
    const chips = {};
    const chipText = () => {
      const p = prio(), w = S.mode === "weighted";
      chips.feet.textContent = `${NUM[1]} ${L("feet planted (always)", "双脚不动（始终）")}`;
      chips.balance.textContent = `${w ? "" : NUM[p.balance] + " "}${L("balance: CoM over the feet", "平衡：质心在脚的上方")}`;
      chips.hand.textContent = `${w ? "" : NUM[p.hand] + " "}${L("right hand → target", "右手 → 目标")}`;
      chips.posture.textContent = `${w ? "" : NUM[p.posture] + " "}${L("posture (null space)", "姿态（零空间）")}`;
      orderSeg.style.display = w ? "none" : "";
      for (const s of wSl) s.style.display = w ? "" : "none";
    };
    ui.seg([["strict", L("strict priorities", "严格优先级")], ["weighted", L("weighted sum", "加权求和")]], S.mode, (v) => { S.mode = v; chipText(); solver.kick(); });
    const orderSeg = ui.seg([["balance", L("balance above hand", "平衡高于手")], ["hand", L("hand above balance", "手高于平衡")]], S.order, (v) => { S.order = v; chipText(); solver.kick(); });
    chips.feet = ui.btn("", () => {}, "r3-toggle on");
    chips.feet.disabled = true;
    for (const k of ["balance", "hand", "posture"]) chips[k] = ui.toggle("", S.on[k], (on) => { S.on[k] = on; chipText(); solver.kick(); });
    const wSl = [
      ui.slider(L("weight of balance $w_{bal}$", "平衡权重 $w_{bal}$"), { min: 0.1, max: 10, value: S.wb }, (v) => { S.wb = v; solver.kick(); }, true),
      ui.slider(L("weight of hand $w_{hand}$", "手部权重 $w_{hand}$"), { min: 0.1, max: 10, value: S.wh }, (v) => { S.wh = v; solver.kick(); }, true),
    ];
    ui.seg([["lean", L("needs a lean", "需要前倾")], ["low", L("low in front", "前方低处")], ["side", L("far to the side", "侧面远处")], ["high", L("high", "高处")]], "lean", (v) => { S.target = PRE[v].slice(); solver.kick(); });
    chipText();
    ui.legend(["target", "com", "support", ["#e9a3a0", L("robot tinted: it would fall", "机器人变红：会摔倒")]]);
    ui.caption(L(
      "Do: drag the pink target, switch tasks on and off, swap balance and hand, or try the weighted sum. Notice: with balance above the hand, the hips move back to keep the orange CoM over the middle of the green support polygon (orange ring) and the hand stops short (pink dashed line) — the lower task only gets the null space of the higher ones. Switch balance off: the hand arrives, but the CoM leaves the polygon and the robot would fall. In the weighted sum no task is exact: the weights decide who gives way.",
      "操作：拖动粉色目标，开关各个任务，交换平衡和手的优先级，或者改用加权求和。观察：平衡高于手时，机器人把髋往后送，让橙色质心保持在绿色支撑多边形中间（橙色圆圈）上方，手就差一截够不到（粉色虚线）——低优先级任务只能用高优先级任务的零空间。关掉平衡：手够到了，但质心跑出支撑多边形，机器人会摔倒。加权求和时没有一个任务是精确满足的，由权重决定谁让步。"));
    solver.settle(1500);
    view.redraw();
  }

  function reachArm(ui, cfg) {
    const P = ui.P, rb = rob.build("arm");
    rb.fk();
    const n = rb.nq, nv = rb.nv, ELB = rb.li("link4");
    const held = rb.framePose("tcp"), q0 = Float64Array.from(rb.q);
    const J6 = () => { const { Jv, Jw } = rb.frameJac("tcp"); return [...Jv, ...Jw]; };
    const herr = () => { const p = rb.framePose("tcp"); return [...V.sub(held.p, p.p), ...M.log(M.mul(held.R, M.T(p.R)))]; };
    const elbow = () => rb.links[ELB].pw.slice();
    // the self-motion manifold: walk along the 1-D null space of the 6×7 hand Jacobian in both directions
    const S0 = rb.links[rb.li("link2")].pw.slice(), W0 = rb.links[rb.li("link6")].pw.slice(), ax = V.unit(V.sub(W0, S0));
    const ux = V.unit(V.sub(V.sub(elbow(), S0), V.scale(ax, V.dot(V.sub(elbow(), S0), ax)))), uy = V.cross(ax, ux);
    const angOf = (e) => { const r = V.sub(e, S0); return Math.atan2(V.dot(r, uy), V.dot(r, ux)) * DEG; };
    const walk = (sign) => {
      rb.q.set(q0); rb.fk();
      const out = [];
      let prev = null, unwrap = 0, last = 0;
      for (let i = 0; i < 1200; i++) {
        const J = J6(), N = rob.nullProj(J, 1e-6);
        let t = N.map((r) => r[6 + 2]);
        const tn = Math.hypot(...t) || 1;
        t = t.map((x) => x / tn);
        if (prev ? t.reduce((s, x, k) => s + x * prev[k], 0) < 0 : sign < 0) t = t.map((x) => -x);
        prev = t;
        const corr = rob.solveLS(J, herr(), 1e-4);
        rb.integrate(t.map((x, k) => 0.008 * x + corr[k]), 1);
        let hit = false;
        for (let j = 0; j < n; j++) { const jt = rb.links[rb.jointLink[j]].joint; if (rb.q[j] > jt.hi - 0.02 || rb.q[j] < jt.lo + 0.02) hit = true; }
        if (hit) break;
        let a = angOf(elbow());
        if (a - last > 180) unwrap -= 360; else if (a - last < -180) unwrap += 360;
        last = a; a += unwrap;
        if (Math.abs(a) > 175) break;
        if (i % 3 === 0) out.push({ psi: a, el: elbow(), q: Float64Array.from(rb.q) });
      }
      return out;
    };
    const path = [...walk(-1).reverse(), { psi: 0, el: (rb.q.set(q0), rb.fk(), elbow()), q: Float64Array.from(q0) }, ...walk(1)].sort((a, b) => a.psi - b.psi);
    rb.q.set(q0); rb.fk();
    const psiLo = Math.ceil(path[0].psi + 3), psiHi = Math.floor(path[path.length - 1].psi - 3);
    const onPath = (psi) => { let i = 1; while (i < path.length - 1 && path[i].psi < psi) i++; const a = path[i - 1], b = path[i], t = clampv((psi - a.psi) / (b.psi - a.psi || 1), 0, 1); return V.lerp(a.el, b.el, t); };
    // the pull: a point 10 cm outside the elbow circle at angle ψ
    const pullPoint = (psi) => { const e = onPath(psi), r = V.sub(e, S0), rad = V.unit(V.sub(r, V.scale(ax, V.dot(r, ax)))); return V.add(e, V.scale(rad, 0.1)); };
    const S = { psi: clampv(cfg.psi ?? 70, psiLo, psiHi), proj: cfg.projector !== false, swing: !!cfg.swing, t: 0 };
    let pull = pullPoint(S.psi);
    // one control step: q̇ = J⁺(K e) + P q̇₀,  q̇₀ = J_elbow⁺ k (pull − elbow),  P = I − J⁺J (projector on) or I (off)
    const step = (k) => {
      let mx = 0;
      for (let s = 0; s < k; s++) {
        const J = J6(), e = herr();
        const vt = rob.solveLS(J, e.map((x) => 0.15 * x), 1e-4); // ẋ = K e, K = 0.15 per step
        const Je = rb.pointJac(ELB, [0, 0, 0]).Jv;
        let v0 = rob.solveLS(Je, V.scale(V.sub(pull, elbow()), 0.5), 0.05);
        if (S.proj) { const N = rob.nullProj(J, 1e-5); v0 = N.map((r) => r.reduce((a, x, j) => a + x * v0[j], 0)); }
        // the pull is limited to 0.006 rad per step; the hand feedback is not scaled
        let m = 0;
        for (let j = 6; j < nv; j++) m = Math.max(m, Math.abs(v0[j]));
        const sc = Math.min(1, 0.006 / (m || 1)), v = vt.map((x, j) => x + v0[j] * sc);
        rb.integrate(v, 1);
        rb.clampJoints(); rb.fk();
        for (let j = 6; j < nv; j++) mx = Math.max(mx, Math.abs(v[j]));
      }
      return mx;
    };
    const ring = path.map((p) => p.el), ringLabel = ring.reduce((b, p) => (V.dist(p, held.p) > V.dist(b, held.p) ? p : b), ring[0]);

    const view = ui.view({ height: 420, target: [0.15, 0, 0.5], dist: 1.75, yaw: 0.75, pitch: 0.32, draw(g, dt) {
      if (S.swing) { S.t += dt; const mid = (psiLo + psiHi) / 2, amp = (psiHi - psiLo) / 2 - 5; S.psi = mid + amp * Math.sin(0.6 * S.t); pull = pullPoint(S.psi); psl.set(Math.round(S.psi)); step(6); }
      else solver.tick();
      const tcp = rb.framePose("tcp").p, el = elbow(), he = V.dist(tcp, held.p), heR = V.norm(M.log(M.mul(held.R, M.T(rb.framePose("tcp").R))));
      g.robot(rb);
      for (let i = 1; i < ring.length; i++) if ((i - 1) % 4 < 2) g.line(ring[i - 1], ring[i], P.ghost, { w: 3 }); // dashed: every other pair of pieces
      g.frame(held.p, held.R, 0.09, { onTop: true, w: 2.5 });
      g.sphere(held.p, 0.022, P.target, { onTop: true, alpha: 0.5 });
      if (he > 0.002) { g.line(tcp, held.p, P.target, { w: 2.5, dash: 0.02, onTop: true }); g.label(V.lerp(tcp, held.p, 0.5), `${cm(he)} cm`, { color: P.target, small: true }); }
      g.sphere(el, 0.03, P.joint, { onTop: true });
      g.circle(pull, V.sub(pull, el), 0.03, P.velocity, { w: 3, onTop: true });
      if (V.dist(pull, el) > 0.03) g.arrow(el, V.lerp(el, pull, 0.85), P.velocity, { w: 3.5, onTop: true, label: "$\\dot q_0$" });
      g.label(ringLabel, L("elbow's self-motion", "肘的自运动轨迹"), { color: P.ghost, small: true, anchor: "right", dx: -8 });
      if (S.proj) ui.status(L(`hand held: error ${mm(he)} mm — the elbow swings in the null space`, `手保持不动：误差 ${mm(he)} mm——肘在零空间里摆动`), he < 0.001 ? "ok" : "warn");
      else ui.status(L(`projector off: the elbow pull drags the hand ${cm(he)} cm away`, `去掉投影：拉肘的运动把手拖偏了 ${cm(he)} cm`), "bad");
      ui.say([
        S.proj ? L("$\\dot q = J^{\\dagger}\\dot x + (I - J^{\\dagger}J)\\,\\dot q_0$: the first term holds the hand ($\\dot x = K e$), the projector $I - J^{\\dagger}J$ keeps only the part of $\\dot q_0$ that the hand cannot feel ($J(I - J^{\\dagger}J) = 0$)", "$\\dot q = J^{\\dagger}\\dot x + (I - J^{\\dagger}J)\\,\\dot q_0$：第一项保持手的位姿（$\\dot x = K e$），投影矩阵 $I - J^{\\dagger}J$ 只留下 $\\dot q_0$ 中手感觉不到的那部分（$J(I - J^{\\dagger}J) = 0$）")
          : L("$\\dot q = J^{\\dagger}\\dot x + \\dot q_0$ (no projector): $\\dot q_0$ also moves the hand, $J\\dot q_0 \\ne 0$, and the hand feedback can only fight it", "$\\dot q = J^{\\dagger}\\dot x + \\dot q_0$（没有投影）：$\\dot q_0$ 也在移动手，$J\\dot q_0 \\ne 0$，手的反馈只能和它对抗"),
        L(`hand: 6-D pose task, $J$ is $6 \\times 7$ → null space of dimension $7 - 6 = 1$: one self-motion, the elbow circle · hand error $\\|e_p\\| = ${mm(he)}$ mm, $\\|e_R\\| = ${f2(heR * DEG)}°$`, `手：6 维位姿任务，$J$ 是 $6 \\times 7$ → 零空间维数 $7 - 6 = 1$：只有一种自运动，即肘绕圈 · 手的误差 $\\|e_p\\| = ${mm(he)}$ mm，$\\|e_R\\| = ${f2(heR * DEG)}°$`),
        L(`$\\dot q_0$ pulls the elbow toward the teal ring at $\\psi = ${f0(S.psi)}°$ (10 cm outside its circle) · elbow ${cm(V.dist(el, pull))} cm from it `, `$\\dot q_0$ 把肘拉向 $\\psi = ${f0(S.psi)}°$ 处的青色圆环（在肘的圆外 10 cm）· 肘离它 ${cm(V.dist(el, pull))} cm `),
      ]);
    } });
    const solver = converger(view, step, { per: 10, tol: 2e-5, max: 1500 });
    const psl = ui.slider(L("null-space motion: pull the elbow to $\\psi$ (°)", "零空间运动：把肘拉到 $\\psi$ (°)"), { min: psiLo, max: psiHi, step: 1, value: S.psi }, (v) => { S.psi = v; pull = pullPoint(v); solver.kick(); });
    ui.toggle(L("null-space projector $I - J^{\\dagger}J$", "零空间投影 $I - J^{\\dagger}J$"), S.proj, (on) => { S.proj = on; solver.kick(); });
    ui.toggle(L("swing by itself", "自动摆动"), S.swing, (on) => { S.swing = on; S.t = Math.asin(clampv((2 * S.psi - psiLo - psiHi) / (psiHi - psiLo - 10), -1, 1)) / 0.6; view.animate(on || solver.busy); if (!on) solver.kick(); });
    ui.btn(L("reset", "复位"), () => { rb.q.set(q0); rb.fk(); solver.kick(); });
    ui.legend([[P.target, L("hand pose to hold (pink ball and frame)", "要保持的手部位姿（粉色球和坐标系）")], [P.ghost, L("elbow's self-motion circle", "肘的自运动圆")], [P.velocity, L("$\\dot q_0$: pull on the elbow toward the teal ring", "$\\dot q_0$：把肘拉向青色圆环的运动")]]);
    ui.caption(L(
      "Do: move the slider to pull the elbow around, or let it swing by itself; then switch the projector off. Notice: with the projector the hand does not move (its error stays well under a millimetre) while the elbow travels along its dashed circle — that circle is the null space of the hand task. The elbow cannot reach the teal ring, only the closest point of its circle. Without the projector the pull goes straight to the joints and drags the hand away (pink dashed line).",
      "操作：拖动滑块拉着肘绕圈，或者让它自动摆动；再关掉投影。观察：有投影时手纹丝不动（误差始终远小于 1 mm），肘沿着虚线圆移动——这个圆就是手部任务的零空间。肘到不了青色圆环，只能到圆上离它最近的点。没有投影时，这股拉力直接作用在关节上，把手拖离原位（粉色虚线）。"));
    solver.settle(2000);
    if (S.swing) view.animate(true);
    view.redraw();
  }

  // ================================================================== jacobian
  // What a Jacobian column is: 1 rad/s at joint i moves the hand at v_i = a_i × r_i, column i of J_v.
  // cfg:
  //   robot  "arm" | "humanoid"        7-DoF arm (default) or the humanoid's right arm (4 joints, base fixed)
  //   mode   "column" | "all" | "ellipsoid"   one column, every column, or the manipulability ellipsoid (default "column")
  //   joint  number 1…n                the selected joint (default 2)
  //   pose   "home" | "bent" | "stretched"    start pose; "stretched" is at the edge of the workspace (singular) (default "home")
  R3.scene("jacobian", (ui, cfg) => {
    const P = ui.P, hum = cfg.robot === "humanoid", rb = rob.build(hum ? "humanoid" : "arm");
    rb.fk();
    const joints = hum ? ["r_shoulder_pitch", "r_shoulder_roll", "r_shoulder_yaw", "r_elbow"].map((s) => rb.ji(s)) : [0, 1, 2, 3, 4, 5, 6];
    const n = joints.length, hand = hum ? "r_hand" : "tcp", K = 0.4, KE = 0.2; // metres of arrow (and of ellipsoid) per m/s
    const jname = (i) => (hum ? L(`joint ${i + 1} (${jointName(rb, joints[i])})`, `关节 ${i + 1}（${jointName(rb, joints[i])}）`) : jointName(rb, joints[i]));
    const fs = (x) => (x < 0.01 ? x.toFixed(3) : f2(x));
    const qh = Float64Array.from(rb.q);
    const POSES = hum
      ? { home: { r_shoulder_pitch: -0.6, r_shoulder_roll: -0.45, r_shoulder_yaw: 0, r_elbow: -1.0 }, bent: { r_shoulder_pitch: -0.9, r_shoulder_roll: -0.6, r_shoulder_yaw: 0, r_elbow: -1.6 }, stretched: { r_shoulder_pitch: -1.5708, r_shoulder_roll: -0.3, r_shoulder_yaw: 0, r_elbow: 0 } }
      : { home: [0, -0.4, 0, -2.0, 0, 1.6, 0.8], bent: [0, 0.3, 0, -1.8, 0, 2.1, 0.8], stretched: [0, 1.2252, 0, -0.4746, 0, 2.957, 0.8] };
    const setPose = (name) => { rb.q.set(qh); const p = POSES[name] || POSES.home; if (hum) for (const [k, v] of Object.entries(p)) rb.q[rb.ji(k)] = v; else rb.q.set(p); rb.fk(); };
    const S = { mode: ["all", "ellipsoid"].includes(cfg.mode) ? cfg.mode : "column", j: clampv(Math.round(cfg.joint ?? 2), 1, n) - 1, pose: POSES[cfg.pose] ? cfg.pose : "home" };
    setPose(S.pose);
    const lim = (i) => rb.links[rb.jointLink[joints[i]]].joint;
    const Jv = () => { const J = rb.frameJac(hand).Jv; return J.map((r) => joints.map((qi) => r[6 + qi])); };
    const svd = (J) => eigSym3(rob.la.gram(J)).map((e) => ({ s: Math.sqrt(Math.max(0, e.val)), u: e.vec }));

    const view = ui.view({ height: 430, ...(hum ? { target: [0.18, -0.3, 1.12], dist: 1.9, yaw: 0.42, pitch: 0.22 } : { target: [0.36, 0, 0.42], dist: 2.25, yaw: 0.6, pitch: 0.28 }), draw(g) {
      const J = Jv(), sv = svd(J), hp = rb.framePose(hand).p, i = S.j;
      const w = sv[0].s * sv[1].s * sv[2].s;
      g.robot(rb);
      g.sphere(hp, 0.018, P.velocity, { onTop: true });
      const col = (k) => [J[0][k], J[1][k], J[2][k]];
      if (S.mode === "column") {
        const A = rb.jointAxisWorld(joints[i]), a = A.axis, p = A.p, r = V.sub(hp, p), foot = V.add(p, V.scale(a, V.dot(r, a))), v = col(i), vn = V.norm(v);
        g.line(V.sub(p, V.scale(a, 0.28)), V.add(p, V.scale(a, 0.28)), JC[i], { w: 3, onTop: true });
        g.turn(p, a, 0.075, 1, JC[i], { w: 3, onTop: true });
        g.label(V.add(p, V.scale(a, 0.3)), L(`axis ${i + 1}`, `轴 ${i + 1}`), { color: JC[i], small: true });
        if (V.dist(foot, hp) > 0.01) { g.line(foot, hp, JC[i], { w: 2, dash: 0.025, onTop: true }); g.label(V.lerp(foot, hp, 0.5), `$r_\\perp = ${f2(V.dist(foot, hp))}$ m`, { color: JC[i], small: true, dy: 12 }); }
        if (vn > 1e-4) g.arrow(hp, V.add(hp, V.scale(v, K)), P.velocity, { w: 5, onTop: true, label: `$v = ${f2(vn)}$ m/s` });
        ui.status(vn < 0.02 ? L(`joint ${i + 1} barely moves the hand: its axis points (almost) through the hand`, `关节 ${i + 1} 几乎带不动手：它的轴（几乎）穿过手`) : L(`column ${i + 1}: 1 rad/s at joint ${i + 1} moves the hand at ${f2(vn)} m/s`, `第 ${i + 1} 列：关节 ${i + 1} 转 1 rad/s，手以 ${f2(vn)} m/s 运动`), vn < 0.02 ? "warn" : "ok");
      } else if (S.mode === "all") {
        for (let k = 0; k < n; k++) { const v = col(k); if (V.norm(v) > 1e-3) g.arrow(hp, V.add(hp, V.scale(v, K)), JC[k], { w: 3.5, onTop: true, label: `${k + 1}`, labelOpt: { small: true } }); }
        ui.status(L(`${n} columns, one per joint: every hand velocity is a mix $J_v \\dot q$ of these arrows`, `${n} 列，每个关节一列：手的任何速度都是这些箭头的组合 $J_v \\dot q$`), "info");
      } else {
        const Rm = [0, 1, 2].map((r) => [sv[0].u[r], sv[1].u[r], sv[2].u[r]]);
        g.ellipsoid(hp, Rm, sv.map((e) => Math.max(0.003, KE * e.s)), P.velocity, { alpha: 0.28, shadow: false });
        sv.forEach((e, k) => { const d = V.scale(e.u, KE * e.s); if (e.s > 0.01) { g.line(V.sub(hp, d), V.add(hp, d), P.velocity, { w: k === 2 ? 3 : 2, onTop: true }); g.label(V.add(hp, d), `$\\sigma_${k + 1}$`, { color: P.velocity, small: true }); } });
        const smin = sv[2], [dw, dc] = dirWords(smin.u);
        if (smin.s < 0.06) { const d = V.scale(smin.u, 0.18); g.line(V.sub(hp, d), V.add(hp, d), P.force, { w: 2.5, dash: 0.02, onTop: true }); g.label(V.add(hp, d), L("lost direction", "失去的方向"), { color: P.force, small: true, anchor: "right", dy: 14, dx: 0 }); }
        ui.status(smin.s < 0.06 ? L(`near-singular: $\\sigma_{min} = ${fs(smin.s)}$ — the hand can hardly move ${dc > 0.8 ? dw : L("along the red dashed line", "沿红色虚线方向")}`, `接近奇异：$\\sigma_{min} = ${fs(smin.s)}$——手几乎无法${dc > 0.8 ? "沿" + dw : "沿红色虚线方向"}运动`) : L(`well conditioned: the hand can move in every direction ($\\sigma_{min} = ${f2(smin.s)}$)`, `条件良好：手可以向各个方向运动（$\\sigma_{min} = ${f2(smin.s)}$）`), smin.s < 0.06 ? "bad" : "ok");
      }
      const hl = S.mode === "column" ? i : -1, colr = P.velocity;
      const mat = `\\begin{bmatrix}${J.map((r) => r.map((x, k) => (k === hl ? `\\color{${colr}}{${sf2(x)}}` : sf2(x))).join(" & ")).join(" \\\\ ")}\\end{bmatrix}`;
      const A = rb.jointAxisWorld(joints[i]);
      ui.say([
        S.mode === "column"
          ? L(`${jname(i)} at ${f0(rb.q[joints[i]] * DEG)}°: $\\omega = 1$ rad/s about $\\hat a = (${sf2(A.axis[0])}, ${sf2(A.axis[1])}, ${sf2(A.axis[2])})$ → $v = \\hat a \\times r = (${sf2(J[0][i])}, ${sf2(J[1][i])}, ${sf2(J[2][i])})$ m/s, $\\|v\\| = \\|r_\\perp\\| \\cdot 1 = ${f2(V.norm([J[0][i], J[1][i], J[2][i]]))}$ m/s — column ${i + 1} of $J_v$`,
            `${jname(i)} 在 ${f0(rb.q[joints[i]] * DEG)}°：绕 $\\hat a = (${sf2(A.axis[0])}, ${sf2(A.axis[1])}, ${sf2(A.axis[2])})$ 以 $\\omega = 1$ rad/s 转动 → $v = \\hat a \\times r = (${sf2(J[0][i])}, ${sf2(J[1][i])}, ${sf2(J[2][i])})$ m/s，$\\|v\\| = \\|r_\\perp\\| \\cdot 1 = ${f2(V.norm([J[0][i], J[1][i], J[2][i]]))}$ m/s——这就是 $J_v$ 的第 ${i + 1} 列`)
          : S.mode === "all" ? L("$\\dot x = J_v \\dot q = \\sum_i J_{v,i}\\, \\dot q_i$: the hand velocity is a weighted sum of the columns (arrows: 1 m/s drawn as 0.4 m)", "$\\dot x = J_v \\dot q = \\sum_i J_{v,i}\\, \\dot q_i$：手的速度是各列按关节速度加权的和（箭头：1 m/s 画成 0.4 m）")
            : L("ellipsoid: every hand velocity reachable with $\\|\\dot q\\| \\le 1$ rad/s; half-axes = singular values $\\sigma_i$ of $J_v$ (1 m/s drawn as 0.2 m) along the eigenvectors of $J_v J_v^\\top$", "椭球：关节速度 $\\|\\dot q\\| \\le 1$ rad/s 时手能达到的所有速度；半轴 = $J_v$ 的奇异值 $\\sigma_i$（1 m/s 画成 0.2 m），方向是 $J_v J_v^\\top$ 的特征向量"),
        `$J_v = ${mat}$ ${L("(m/s per rad/s)", "（每 rad/s 对应的 m/s）")}`,
        L(`singular values $\\sigma = (${sv.map((e) => fs(e.s)).join(", ")})$ · manipulability $w = \\sqrt{\\det(J_v J_v^\\top)} = \\sigma_1\\sigma_2\\sigma_3 = ${Math.abs(w).toFixed(3)}$`, `奇异值 $\\sigma = (${sv.map((e) => fs(e.s)).join(", ")})$ · 可操作度 $w = \\sqrt{\\det(J_v J_v^\\top)} = \\sigma_1\\sigma_2\\sigma_3 = ${Math.abs(w).toFixed(3)}$`),
      ]);
    } });

    ui.seg([["column", L("one column", "单列")], ["all", L("all columns", "所有列")], ["ellipsoid", L("ellipsoid", "椭球")]], S.mode, (v) => { S.mode = v; legend(); view.redraw(); });
    const jointSeg = h("div", {});
    const drawJointSeg = () => jointSeg.replaceChildren(Viz.util.seg(joints.map((_, k) => [k, `${L("joint", "关节")} ${k + 1}`]), S.j, (k) => { S.j = k; syncSlider(); legend(); view.redraw(); }));
    ui.ctrls.append(jointSeg);
    const sl = ui.slider("", { min: -180, max: 180, step: 1, value: 0 }, (v) => { rb.q[joints[S.j]] = v / DEG; rb.fk(); view.redraw(); });
    const syncSlider = () => { const jt = lim(S.j), inp = sl.querySelector("input"); inp.min = Math.ceil(jt.lo * DEG); inp.max = Math.floor(jt.hi * DEG); sl.set(Math.round(rb.q[joints[S.j]] * DEG)); Viz.util.math(sl.querySelector(".viz-lbl"), L(`angle of joint ${S.j + 1} (°)`, `关节 ${S.j + 1} 的角度 (°)`)); };
    ui.seg([["home", L("relaxed", "放松")], ["bent", L("elbow bent", "屈肘")], ["stretched", L("stretched (singular)", "伸直（奇异）")]], S.pose, (v) => { S.pose = v; setPose(v); syncSlider(); view.redraw(); });
    drawJointSeg(); syncSlider();
    const legend = () => ui.legend(S.mode === "column" ? [[P.velocity, L("hand velocity $v$ = column of $J_v$ (1 m/s drawn as 0.4 m)", "手的速度 $v$ = $J_v$ 的一列（1 m/s 画成 0.4 m）")], [JC[S.j], L("joint axis, turning at 1 rad/s, and its lever arm $r_\\perp$", "关节轴（以 1 rad/s 转动）及其力臂 $r_\\perp$")]]
      : S.mode === "all" ? [[JC[0], L("column $i$ of $J_v$, one colour per joint (1 m/s drawn as 0.4 m)", "$J_v$ 的第 $i$ 列，每个关节一种颜色（1 m/s 画成 0.4 m）")]]
        : [[P.velocity, L("manipulability ellipsoid and its axes $\\sigma_i$", "可操作度椭球及其主轴 $\\sigma_i$")], [P.force, L("lost direction (near-singular)", "失去的方向（接近奇异）")]]);
    legend();
    ui.caption(L(
      "Do: pick a joint, turn it with the slider, then switch to all columns or the ellipsoid and try the stretched pose. Notice: spinning joint $i$ at 1 rad/s moves the hand along $v = \\hat a \\times r$, perpendicular to both the axis and the lever arm, with speed $\\|r_\\perp\\|$ — that arrow is column $i$ of $J_v$ (highlighted in the matrix). Stretched out, every column lies in one plane: the ellipsoid goes flat, $\\sigma_{min} \\to 0$, and no joint speed can move the hand along the lost direction.",
      "操作：选一个关节，用滑块转动它，再切换到“所有列”或“椭球”，试试伸直的姿态。观察：关节 $i$ 以 1 rad/s 转动时，手沿 $v = \\hat a \\times r$ 运动，方向同时垂直于转轴和力臂，速度大小等于 $\\|r_\\perp\\|$——这个箭头就是 $J_v$ 的第 $i$ 列（矩阵里高亮的那一列）。手臂伸直时所有列都落在同一个平面里：椭球被压扁，$\\sigma_{min} \\to 0$，无论关节怎么转，手都无法沿失去的方向运动。"));
    view.redraw();
  });

  // ================================================================== statics
  // Forces at the hand become joint torques, τ = Jᵀ f; gravity adds its own torques.
  // cfg (robot "arm", the default):
  //   robot     "arm" | "humanoid"  which robot (default "arm")
  //   payload   number kg           arm: 0–5 kg hung from the hand (default 3); humanoid: box 0–20 kg held with both hands (default 10)
  //   extend    number 0–1          arm: 0 tucked, 0.5 half, 1 stretched (default 1)
  //   joint     number 1–7          arm: joint whose lever arm is drawn (default 2)
  //   selfWeight bool               arm: include the arm's own weight (default true); off = payload only, τ = Jᵀ f
  //   reach     number m            humanoid: hand target in front of the feet, 0.3–0.65 (default 0.5); the box sits
  //                                  between the actual hands, which reach about 0.61 m at most
  //   crouch    number 0.75–1       humanoid: pelvis height as a fraction of standing (default 1)
  //   support   "both" | "left" | "right"   humanoid: stand on both feet (default) or on one, the other lifted; the joint
  //                                  torques shown are those of the stance leg (and the right arm)
  // With payload 0 the humanoid holds no box (none is drawn).
  // Torque limits of the arm are Franka-like: 87 N·m (joints 1–4), 12 N·m (joints 5–7).
  R3.scene("statics", (ui, cfg) => (cfg.robot === "humanoid" ? staticsHumanoid(ui, cfg) : staticsArm(ui, cfg)));

  function staticsArm(ui, cfg) {
    const P = ui.P, rb = rob.build("arm");
    rb.fk();
    const n = rb.nq, LIM = [87, 87, 87, 87, 12, 12, 12];
    const QT = [0, -0.785, 0, -2.356, 0, 1.571, 0.785], QH = [0, 0.3, 0, -1.8, 0, 2.1, 0.8], QS = [0, 1.2252, 0, -0.4746, 0, 2.957, 0.8];
    const S = { m: clampv(cfg.payload ?? 3, 0, 5), ext: clampv(cfg.extend ?? 1, 0, 1), j: clampv(Math.round(cfg.joint ?? 2), 1, 7) - 1, self: cfg.selfWeight !== false };
    const setExt = () => { const t = S.ext, q = t <= 0.5 ? QT.map((a, k) => a + (QH[k] - a) * (t / 0.5)) : QH.map((a, k) => a + (QS[k] - a) * ((t - 0.5) / 0.5)); rb.q.set(q); rb.fk(); };
    setExt();
    const kF = 0.4 / (5 * G); // metres of arrow per newton (5 kg → 0.4 m)
    const bars = barsBox(ui);
    let capKey = null;
    const view = ui.view({ height: 420, target: [0.4, 0, 0.42], dist: 2.4, yaw: 0.32, pitch: 0.22, draw(g) {
      const tcp = rb.framePose("tcp").p, W = S.m * G, { Jv } = rb.frameJac("tcp");
      // τ = J_vᵀ f with f = (0, 0, m g_0): the force the hand must push up with
      const tPay = Array.from({ length: n }, (_, j) => Jv[2][6 + j] * W);
      const tArm = rb.gravityTorques([]);
      const tau = tPay.map((x, j) => x + (S.self ? tArm[j] : 0));
      g.robot(rb);
      // payload on a short rope
      if (S.m > 0.01) {
        const s = 0.05 + 0.035 * Math.cbrt(S.m), top = V.add(tcp, [0, 0, -0.07]), c = V.add(top, [0, 0, -s / 2]);
        g.line(tcp, top, P.joint, { w: 2 });
        g.box(c, null, [s, s, s], "#c8a27a");
        g.arrow(c, V.add(c, [0, 0, -W * kF]), P.gravity, { w: 5, label: `$m g_0 = ${W < 100 ? f1(W) : f0(W)}$ N` });
      }
      // torque arcs at every joint (a full circle = the limit)
      for (let j = 0; j < n; j++) {
        const A = rb.jointAxisWorld(j), fr = Math.abs(tau[j]) / LIM[j], over = fr > 1;
        if (Math.abs(tau[j]) < 0.05) continue;
        g.turn(A.p, A.axis, j < 4 ? 0.085 : 0.06, tau[j], over ? P.force : P.torque, { w: j === S.j ? 4 : 3, onTop: true, sweep: 0.35 + Math.min(1, fr) * 1.55 * Math.PI, label: Math.abs(tau[j]) >= 1 ? `${f0(Math.abs(tau[j]))} N·m` : null });
      }
      // lever arm of the payload about the selected joint
      const A = rb.jointAxisWorld(S.j), cl = closestLines(A.p, A.axis, tcp, [0, 0, 1]);
      let lever = 0;
      if (cl && Math.hypot(A.axis[0], A.axis[1]) > 0.05 && S.m > 0.01) {
        lever = V.dot(V.sub(tcp, A.p), V.unit(V.cross([0, 0, 1], A.axis))) * 1; // signed, horizontal, ⟂ to the axis
        g.line(V.sub(A.p, V.scale(A.axis, 0.16)), V.add(A.p, V.scale(A.axis, 0.16)), P.ghost, { w: 2, onTop: true });
        g.line(cl[0], cl[1], P.torque, { w: 2.5, dash: 0.025, onTop: true });
        g.line(cl[1], tcp, P.gravity, { w: 1.5, dash: 0.03, alpha: 0.7 });
        g.label(V.lerp(cl[0], cl[1], 0.5), `$r_\\perp = ${f2(Math.abs(lever))}$ m`, { color: P.torque, small: true, dy: 14 });
      }
      const worst = tau.map((t, j) => Math.abs(t) / LIM[j]).reduce((b, x, j, a) => (x > a[b] ? j : b), 0), wf = Math.abs(tau[worst]) / LIM[worst];
      const over = tau.map((t, j) => j).filter((j) => Math.abs(tau[j]) > LIM[j]), ov = (j) => `${j + 1} (${f1(Math.abs(tau[j]))} > ${LIM[j]} N·m)`;
      ui.status(wf > 1 ? (over.length > 1 ? L(`joints ${over.map(ov).join(", ")} are over their limits`, `关节 ${over.map(ov).join("、")} 超出力矩上限`) : L(`joint ${worst + 1} is over its limit: ${f1(Math.abs(tau[worst]))} N·m > ${LIM[worst]} N·m`, `关节 ${worst + 1} 超出力矩上限：${f1(Math.abs(tau[worst]))} N·m > ${LIM[worst]} N·m`)) : L(`all joints within limits — joint ${worst + 1} works hardest, at ${f0(100 * wf)} % of ${LIM[worst]} N·m`, `所有关节都在上限以内——关节 ${worst + 1} 最吃力，用了 ${LIM[worst]} N·m 的 ${f0(100 * wf)} %`), wf > 1 ? "bad" : wf > 0.8 ? "warn" : "ok");
      const j = S.j, axisVert = Math.hypot(A.axis[0], A.axis[1]) <= 0.05;
      ui.say([
        L(`payload $m = ${f1(S.m)}$ kg: the hand pushes up with $f = (0, 0, m g_0)$, $m g_0 = ${f1(W)}$ N, and the joints feel $\\tau = J_v^\\top f$, i.e. $\\tau_i = J_{v,zi}\\, m g_0$`, `负载 $m = ${f1(S.m)}$ kg：手要向上托住 $f = (0, 0, m g_0)$，$m g_0 = ${f1(W)}$ N，关节感受到的力矩是 $\\tau = J_v^\\top f$，即 $\\tau_i = J_{v,zi}\\, m g_0$`),
        S.m <= 0.01 ? L(`joint ${j + 1}: no payload, so no payload torque — only the arm's own weight`, `关节 ${j + 1}：没有负载，也就没有负载力矩——只有手臂自重`) + (S.self ? L(` · own weight of the arm ${sf1(tArm[j])} N·m`, ` · 手臂自重 ${sf1(tArm[j])} N·m`) : "") : axisVert ? L(`joint ${j + 1}: its axis is vertical, so a vertical force has no lever arm about it: $\\tau_${j + 1}^{load} = 0$`, `关节 ${j + 1}：转轴竖直，竖直的力对它没有力臂：$\\tau_${j + 1}^{load} = 0$`)
          : L(`joint ${j + 1}: horizontal lever arm $r_\\perp = ${f2(Math.abs(lever))}$ m, $\\tau_${j + 1}^{load} = J_{v,z${j + 1}}\\, m g_0 = ${sf2(lever)} \\times ${f1(W)} = ${sf1(tPay[j])}$ N·m (the sign is the sense of turning about the axis)`, `关节 ${j + 1}：水平力臂 $r_\\perp = ${f2(Math.abs(lever))}$ m，$\\tau_${j + 1}^{load} = J_{v,z${j + 1}}\\, m g_0 = ${sf2(lever)} \\times ${f1(W)} = ${sf1(tPay[j])}$ N·m（正负号表示绕轴转动的方向）`)
          + (S.self ? L(` · own weight of the arm ${sf1(tArm[j])} N·m · total $\\tau_${j + 1} = ${sf1(tau[j])}$ N·m`, ` · 手臂自重 ${sf1(tArm[j])} N·m · 合计 $\\tau_${j + 1} = ${sf1(tau[j])}$ N·m`) : ""),
        L(`$|\\tau_i| / \\tau_{max}$ — Franka-like limits: ${LIM[0]} N·m for joints 1–4, ${LIM[4]} N·m for joints 5–7`, `$|\\tau_i| / \\tau_{max}$——参照 Franka 的上限：关节 1–4 为 ${LIM[0]} N·m，关节 5–7 为 ${LIM[4]} N·m`),
      ]);
      { const loaded = [], free = []; for (let k = 0; k < n; k++) (Math.abs(Jv[2][6 + k]) > 0.005 ? loaded : free).push(k); const key = loaded.join(); if (capKey !== key) { capKey = key; ui.caption(capFor(loaded, free)); } }
      bars.set(tau.map((t, k) => [`$\\tau_${k + 1}$`, Math.abs(t) / LIM[k], `${sf1(t)} N·m`, Math.abs(t) > LIM[k]]));
    } });
    ui.slider(L("payload $m$ (kg)", "负载 $m$ (kg)"), { min: 0, max: 5, step: 0.1, value: S.m }, (v) => { S.m = v; view.redraw(); });
    const ext = ui.slider(L("arm extension (%)", "手臂伸展 (%)"), { min: 0, max: 100, step: 1, value: Math.round(S.ext * 100) }, (v) => { S.ext = v / 100; setExt(); view.redraw(); });
    ui.seg([[0, L("tucked", "收起")], [0.5, L("half", "半伸")], [1, L("stretched", "伸直")]], S.ext === 0 || S.ext === 0.5 ? S.ext : 1, (v) => { S.ext = v; ext.set(v * 100); setExt(); view.redraw(); });
    ui.seg(Array.from({ length: n }, (_, k) => [k, `${k + 1}`]), S.j, (k) => { S.j = k; view.redraw(); });
    ui.toggle(L("arm's own weight", "手臂自重"), S.self, (on) => { S.self = on; view.redraw(); });
    ui.legend(["torque", "gravity", ["#c8a27a", L("payload", "负载")], [P.force, L("over the limit", "超出上限")]]);
    // the caption names the joints a vertical load turns in the current pose (it changes with the pose)
    const capFor = (loaded, free) => {
      const ls = (a) => a.map((j) => j + 1).join(", ");
      return L(
        `Do: add payload, stretch the arm, pick a joint (1–7) to see its lever arm, and switch the arm's own weight off. Notice: each gold arc is a joint torque (a full circle means the joint is at its limit). A vertical force turns a joint by $m g_0$ times its horizontal lever arm $r_\\perp$, which is zero when the axis is vertical or its line meets the load's line of action — in this pose it loads joints ${ls(loaded)}${free.length ? ` and leaves ${ls(free)} at zero` : ""}. The shoulder (joint 2) suffers most when the arm is stretched. That is $\\tau = J_v^\\top f$ read column by column.`,
        `操作：加负载、把手臂伸直、选一个关节（1–7）看它的力臂，再关掉手臂自重。观察：每条金色弧线是一个关节力矩（画满一圈表示到了上限）。竖直的力让关节受到的力矩是 $m g_0$ 乘以水平力臂 $r_\\perp$；转轴竖直、或者转轴所在直线与负载的作用线相交时，这个力臂为 0——在当前姿态下，它加载的是关节 ${ls(loaded)}${free.length ? `，关节 ${ls(free)} 不受力` : ""}。手臂伸直时肩（关节 2）最吃力。这就是逐列读出来的 $\\tau = J_v^\\top f$。`);
    };
    ui.caption(capFor([1, 3, 5], []));
    view.redraw();
  }

  function staticsHumanoid(ui, cfg) {
    const P = ui.P, rb = rob.build("humanoid");
    rb.fk();
    const feet = ["l_foot", "r_foot"], home = R3.snapshot(rb), footHome = Object.fromEntries(feet.map((f) => [f, rb.framePose(f)]));
    const sup = ["left", "right"].includes(cfg.support) ? cfg.support : "both", sf = sup === "left" ? ["l_foot"] : sup === "right" ? ["r_foot"] : feet, side = sup === "left" ? "l" : "r";
    const poly = rb.supportPolygon(sf), cen = R3.centroid(poly), xToe = Math.max(...poly.map((p) => p[0]));
    const Mr = rb.totalMass, k = R3.forceScale(rb, 0.38);
    const S = { m: clampv(cfg.payload ?? 10, 0, 20), d: clampv(cfg.reach ?? 0.5, 0.3, 0.65), crouch: clampv(cfg.crouch ?? 1, 0.75, 1) };
    const SHOW = [`${side}_ankle_pitch`, `${side}_knee`, `${side}_hip_pitch`, "r_shoulder_pitch", "r_elbow"].map((s) => rb.ji(s));
    const levels = () => {
      const z = home.p[2] * S.crouch, L1 = feet.map((f) => rb.taskPose(f, sf.includes(f) ? footHome[f].p : V.add(footHome[f].p, [0, 0, 0.1]), footHome[f].R)), zb = z + 0.12;
      return [L1, [rb.taskCom(cen), ...R3.baseTasks(rb, z, home.R)], [rb.taskPos("l_hand", [S.d, 0.15, zb], { w: 0.2 }), rb.taskPos("r_hand", [S.d, -0.15, zb], { w: 0.2 })], [rb.taskPosture(home.q, { gain: 0.3 })]];
    };
    const step = (nn) => ikSteps(rb, levels, nn);
    const view = ui.view({ height: 440, target: [0.15, 0, 0.75], dist: 3.3, yaw: 0.3, pitch: 0.2, draw(g) {
      solver.tick();
      const lh = rb.framePose("l_hand").p, rh = rb.framePose("r_hand").p, bc = V.lerp(lh, rh, 0.5), c = rb.com(), W = S.m * G;
      const Mt = Mr + S.m, ct = V.scale(V.add(V.scale(c, Mr), V.scale(bc, S.m)), 1 / Mt);
      const margin = rob.distToPoly([ct[0], ct[1]], poly), ok = margin >= 0;
      const dist = distributeLoad(rb, sf, Mt, ct);
      const contacts = [...dist.forces.map((fc) => ({ link: rb.frames[fc.frame].link, pw: fc.p, f: fc.f })), { frame: "l_hand", f: [0, 0, -W / 2] }, { frame: "r_hand", f: [0, 0, -W / 2] }];
      const tau = rb.gravityTorques(contacts);
      g.robot(rb, ok ? {} : { color: () => "#e9a3a0" });
      R3.drawSupport(g, poly, ok);
      // the toe edge
      const toe = poly.filter((p) => p[0] > xToe - 1e-6);
      if (toe.length >= 2) { g.line([toe[0][0], toe[0][1], 0.003], [toe[1][0], toe[1][1], 0.003], ok && margin > 0.02 ? P.support : P.force, { w: 5, ground: true }); }
      // box (none at 0 kg)
      if (S.m > 0.01) {
        const wy = Math.max(0.12, Math.abs(lh[1] - rh[1]) - 0.07);
        g.box(V.add(bc, [0.02, 0, -0.02]), null, [0.26, wy, 0.22], "#c8a27a");
        g.arrow(V.add(bc, [0.02, 0, -0.13]), V.add(bc, [0.02, 0, -0.13 - W * k]), P.gravity, { w: 5, label: `$m g_0 = ${W < 100 ? f1(W) : f0(W)}$ N` });
      }
      R3.drawCom(g, c, { label: false, weight: Mr * G * k, weightLabel: "" });
      g.label(c, L("robot CoM", "机器人质心"), { color: P.com, anchor: "right", dx: -12 });
      R3.drawForces(g, dist, k, { labels: false });
      const cop = [ct[0], ct[1], 0.006];
      g.disc(cop, [0, 0, 1], 0.026, P.zmp, { ground: true });
      g.label(cop, L("total CoP", "总压力中心"), { color: P.zmp, dy: 16, small: true });
      for (const qi of SHOW) { const A = rb.jointAxisWorld(qi), t = tau[qi]; if (Math.abs(t) < 0.3) continue; g.turn(A.p, A.axis, 0.085, t, P.torque, { w: 3.5, onTop: true, sweep: 0.35 + Math.min(1, Math.abs(t) / 120) * 1.5 * Math.PI, label: `${f0(Math.abs(t))} N·m` }); }
      // the load at which the CoP reaches the toe edge (posture held, CoM of the robot fixed)
      let mStar = Infinity;
      if (bc[0] > xToe + 1e-3) mStar = (Mr * (xToe - c[0])) / (bc[0] - xToe);
      const fz = feet.map((f) => (dist.frames[f] ? dist.frames[f].f[2] : 0));
      if (!ok) ui.status(L(`tips forward: the total CoP would have to lie ${cm(-margin)} cm beyond the toes`, `会向前翻：总压力中心得落在脚尖外 ${cm(-margin)} cm`), "bad");
      else ui.status(L(`${sup === "both" ? "" : sup === "left" ? "on the left foot: " : "on the right foot: "}CoP ${cm(xToe - ct[0])} cm behind the toe edge — tips at ${Number.isFinite(mStar) ? f1(mStar) + " kg" : L("no load", "任何负载都不会")}`, `${sup === "both" ? "" : sup === "left" ? "左脚单脚支撑：" : "右脚单脚支撑："}压力中心离脚尖边缘 ${cm(xToe - ct[0])} cm——${Number.isFinite(mStar) ? "负载到 " + f1(mStar) + " kg 时翻倒" : "任何负载都不会翻倒"}`), xToe - ct[0] < 0.02 ? "warn" : "ok");
      const nm = (qi) => `${jointName(rb, qi)} ${f0(Math.abs(tau[qi]))}`;
      ui.say([
        L(`robot $M = ${f0(Mr)}$ kg + box $m = ${f1(S.m)}$ kg${S.m > 0.01 ? "" : " (no box)"}: the floor carries $(M + m)\\,g_0 = ${f0(Mt * G)}$ N · left foot $f_z = ${f0(fz[0])}$ N, right foot $f_z = ${f0(fz[1])}$ N`, `机器人 $M = ${f0(Mr)}$ kg + 箱子 $m = ${f1(S.m)}$ kg${S.m > 0.01 ? "" : "（没有箱子）"}：地面要承受 $(M + m)\\,g_0 = ${f0(Mt * G)}$ N · 左脚 $f_z = ${f0(fz[0])}$ N，右脚 $f_z = ${f0(fz[1])}$ N`),
        L(`total CoP $x_{cop} = \\frac{M c_x + m\\, x_{box}}{M + m} = \\frac{${f0(Mr)} \\cdot ${sf2(c[0])} + ${f1(S.m)} \\cdot ${sf2(bc[0])}}{${f1(Mt)}} = ${sf2(ct[0])}$ m; toe edge at $x_{toe} = ${f2(xToe)}$ m`, `总压力中心 $x_{cop} = \\frac{M c_x + m\\, x_{box}}{M + m} = \\frac{${f0(Mr)} \\cdot ${sf2(c[0])} + ${f1(S.m)} \\cdot ${sf2(bc[0])}}{${f1(Mt)}} = ${sf2(ct[0])}$ m；脚尖边缘在 $x_{toe} = ${f2(xToe)}$ m`),
        Number.isFinite(mStar) ? L(`limit: $x_{cop} = x_{toe}$ at $m^{*} = M\\,\\frac{x_{toe} - c_x}{x_{box} - x_{toe}} = ${f1(mStar)}$ kg (this posture, robot CoM kept over the feet)`, `极限：$x_{cop} = x_{toe}$ 时 $m^{*} = M\\,\\frac{x_{toe} - c_x}{x_{box} - x_{toe}} = ${f1(mStar)}$ kg（保持这个姿态，机器人自身质心在双脚上方）`) : L("the box is above the feet: any load keeps the CoP inside", "箱子在双脚上方：多重的负载都不会让压力中心出界"),
        L(`joint torques (${sup === "left" ? "left leg, right arm" : "right side"}, N·m): ${SHOW.map(nm).join(" · ")}`, `关节力矩（${sup === "left" ? "左腿、右臂" : "右侧"}，N·m）：${SHOW.map(nm).join(" · ")}`),
      ]);
    } });
    const solver = converger(view, step);
    ui.slider(L("box $m$ (kg)", "箱子 $m$ (kg)"), { min: 0, max: 20, step: 0.5, value: S.m }, (v) => { S.m = v; view.redraw(); });
    ui.slider(L("box distance (m)", "箱子距离 (m)"), { min: 0.3, max: 0.65, step: 0.01, value: S.d }, (v) => { S.d = v; solver.kick(); });
    ui.slider(L("pelvis height (%)", "骨盆高度 (%)"), { min: 75, max: 100, step: 1, value: Math.round(S.crouch * 100) }, (v) => { S.crouch = v / 100; solver.kick(); });
    ui.legend(["torque", "gravity", "force", "zmp", "support", "com"]);
    ui.caption(L(
      "Do: make the box heavier, hold it farther out, and crouch. Notice: the floor forces (red) grow by the box's weight and shift toward the toes — the total centre of pressure moves along the line from the robot's CoM to the box, weighted by mass; when it reaches the toe edge the robot tips forward. Crouching costs knee torque: a bent knee puts it far from the line of the weight, so the same load needs a much larger torque.",
      "操作：加重箱子、把它拿得更远、再蹲下。观察：地面反力（红色）增加了箱子的重量，并且往脚尖方向移——总压力中心沿着机器人质心到箱子的连线按质量加权移动；一旦到达脚尖边缘，机器人就会向前翻倒。下蹲很费膝盖力矩：膝盖弯曲后离重力作用线更远，同样的负载需要大得多的力矩。"));
    solver.settle(1500);
    view.redraw();
  }
})();
