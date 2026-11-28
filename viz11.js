"use strict";
// robot3d scenes (PLAN R19), part 2 — see viz10.js for the scaffold (Viz.r3) and the rules.
//   push      balance recovery of a standing humanoid: LIPM, DCM, ankle and stepping strategies
//   walk      footstep plan → ZMP reference → DCM → CoM (humanoid); walk / trot / pace (quadruped)
//   floating  no contact: total momentum stays zero, the CoM cannot be moved, the pelvis turns
// The physics helpers are exposed as Viz.r3.p11 for numerical checks in node.
(() => {
  if (!window.Viz || !Viz.rob || !Viz.r3) return;
  const R3 = Viz.r3, rob = Viz.rob, V = rob.V, M = rob.M, G = rob.G;
  const { L } = R3, { f0, f1, f2, f3 } = R3.fmt;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const num = (v, d, lo, hi) => { const x = Number(v); return clamp(Number.isFinite(x) ? x : d, lo, hi); };
  const mod = (a, n) => ((a % n) + n) % n;
  const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  // signed number without "-0.00"
  const sg = (x, d = 2) => { const s = (Number.isFinite(x) ? x : 0).toFixed(d); return /^-0\.?0*$/.test(s) ? s.slice(1) : s; };
  const v2 = (a, d = 2) => `(${sg(a[0], d)}, ${sg(a[1], d)})`;
  const v3 = (a, d = 2) => `(${sg(a[0], d)}, ${sg(a[1], d)}, ${sg(a[2], d)})`;
  const dark = () => document.documentElement.dataset.theme === "dark";
  // left / right foot colours (only used for footprints, swing arcs and the phase bars)
  const sideCol = (s) => (s === "l" ? (dark() ? "#d39a5e" : "#a0622d") : dark() ? "#8f97ea" : "#4f58b8");
  const I3 = M.I();
  // a polyline of many short pieces drawn dashed (every other pair of pieces)
  const dashed = (g, pts, col, o) => { for (let i = 1; i < pts.length; i++) if ((i - 1) % 4 < 2) g.line(pts[i - 1], pts[i], col, o); };

  // ------------------------------------------------------------------ planar geometry
  function closestOnPoly(pt, poly) {
    let best = null, bd = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], b = poly[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? clamp(((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2, 0, 1) : 0;
      const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(pt[0] - q[0], pt[1] - q[1]);
      if (d < bd) { bd = d; best = q; }
    }
    return best || [pt[0], pt[1]];
  }
  // the point of a convex polygon closest to pt (pt itself when inside)
  const projPoly = (pt, poly) => (poly.length >= 3 && rob.inPoly(pt, poly) ? [pt[0], pt[1]] : closestOnPoly(pt, poly));
  const HL = 0.11, HW = 0.05; // humanoid sole: half length, half width (rob3d.js)
  const footRect = (c, hl = HL, hw = HW) => [[c[0] - hl, c[1] - hw], [c[0] + hl, c[1] - hw], [c[0] + hl, c[1] + hw], [c[0] - hl, c[1] + hw]];
  const rect3 = (c, z = 0, hl = HL) => footRect(c, hl).map((p) => [p[0], p[1], z]);

  // ------------------------------------------------------------------ DCM of a ZMP plan
  // ξ(t) = ω ∫_t^∞ e^{ω(t−s)} p(s) ds — the only bounded solution of ξ̇ = ω(ξ − p). The plan is a sorted
  // list of segments { a, b, pa, pb } on which p moves linearly from pa (at a) to pb (at b); after the
  // last segment p is taken to stay put.
  function dcmOf(segs, t, w) {
    let x = 0, y = 0, last = null, tEnd = t;
    for (const s of segs) {
      if (s.b <= t) continue;
      const a = Math.max(s.a, t), D = s.b - a, span = s.b - s.a, u = span > 1e-12 ? (a - s.a) / span : 0;
      const p0x = s.pa[0] + (s.pb[0] - s.pa[0]) * u, p0y = s.pa[1] + (s.pb[1] - s.pa[1]) * u;
      const E = Math.exp(w * (t - a)), eD = Math.exp(-w * D), I0 = 1 - eD, I1 = span > 1e-12 ? (-D * eD + I0 / w) / span : 0;
      x += E * (p0x * I0 + (s.pb[0] - s.pa[0]) * I1);
      y += E * (p0y * I0 + (s.pb[1] - s.pa[1]) * I1);
      last = s.pb; tEnd = s.b;
      if (E < 1e-12) break;
    }
    if (last) { const E = Math.exp(w * (t - tEnd)); x += E * last[0]; y += E * last[1]; }
    return [x, y];
  }
  const zmpOf = (segs, t) => { for (const s of segs) if (t >= s.a && t < s.b) { const u = s.b > s.a ? (t - s.a) / (s.b - s.a) : 0; return [s.pa[0] + (s.pb[0] - s.pa[0]) * u, s.pa[1] + (s.pb[1] - s.pa[1]) * u]; } return segs.length ? segs[segs.length - 1].pb.slice() : [0, 0]; };

  // A periodic gait: segs(t0, t1) covers [t0, t1]; period P; every period the plan moves by `shift`.
  // The CoM obeys ċ = ω(ξ − c) (stable forwards); its periodic orbit is tabulated over one period.
  function gaitModel(g, w) {
    const H = 14 / w; // ξ needs the plan this far ahead (e^{−14} of the rest)
    const xi = (t) => dcmOf(g.segs(t, t + H), t, w);
    const N = 240, tbl = [];
    {
      const sub = 6, h = g.P / (N * sub), n0 = Math.ceil(10 / w / g.P) * N * sub;
      let t = -n0 * h, c = xi(t);
      for (let i = -n0; i <= N * sub; i++) {
        if (i >= 0 && i % sub === 0) tbl.push(c.slice());
        const xm = xi(t + h / 2), e = Math.exp(-w * h);
        c = [xm[0] + (c[0] - xm[0]) * e, xm[1] + (c[1] - xm[1]) * e];
        t += h;
      }
    }
    const comAt = (t) => {
      const n = Math.floor(t / g.P), tau = t - n * g.P, f = (tau / g.P) * N, i = clamp(Math.floor(f), 0, N - 1), u = f - i;
      return [tbl[i][0] + (tbl[i + 1][0] - tbl[i][0]) * u + n * g.shift[0], tbl[i][1] + (tbl[i + 1][1] - tbl[i][1]) * u + n * g.shift[1]];
    };
    // exact step of ċ = ω(ξ − c) with ξ taken at the middle of the step (second order)
    const comStep = (c, t, h) => { const xm = xi(t + h / 2), e = Math.exp(-w * h); return [xm[0] + (c[0] - xm[0]) * e, xm[1] + (c[1] - xm[1]) * e]; };
    return { ...g, w, xi, comAt, comStep, zmp: (t) => zmpOf(g.segs(t - 1e-9, t + g.P), t), periodErr: Math.hypot(tbl[N][0] - tbl[0][0] - g.shift[0], tbl[N][1] - tbl[0][1] - g.shift[1]) };
  }

  // Humanoid: foot k (k even = left) at (kL, ±W/2). Step k lasts [kT, (k+1)T): first double support
  // (the ZMP slides from foot k−1 to foot k), then single support on foot k while foot k−1 swings to k+1.
  function humanoidGait(o) {
    const D = o.ds * o.T;
    const foot = (k) => [k * o.L, (mod(k, 2) === 0 ? 1 : -1) * o.W / 2];
    const side = (k) => (mod(k, 2) === 0 ? "l" : "r");
    const segs = (t0, t1) => {
      const out = [];
      for (let k = Math.floor(t0 / o.T); k * o.T <= t1; k++) {
        const a = k * o.T;
        if (D > 1e-6) out.push({ a, b: a + D, pa: foot(k - 1), pb: foot(k) });
        out.push({ a: a + D, b: a + o.T, pa: foot(k), pb: foot(k) });
      }
      return out;
    };
    const feet = (t, hgt = 0.08) => {
      const k = Math.floor(t / o.T), tau = t - k * o.T, st = foot(k), pr = foot(k - 1), nx = foot(k + 1);
      const out = [{ side: side(k), k, p: [st[0], st[1], 0], stance: true }];
      if (tau < D) out.push({ side: side(k - 1), k: k - 1, p: [pr[0], pr[1], 0], stance: true });
      else { const u = (tau - D) / Math.max(1e-6, o.T - D), s = smooth(u); out.push({ side: side(k - 1), k: k - 1, p: [pr[0] + (nx[0] - pr[0]) * s, pr[1], hgt * Math.sin(Math.PI * clamp(u, 0, 1))], stance: false, from: pr, to: nx, u }); }
      return out;
    };
    const support = (t) => { const k = Math.floor(t / o.T), ds = t - k * o.T < D; return ds ? rob.hull2d([...footRect(foot(k)), ...footRect(foot(k - 1))]) : footRect(foot(k)); };
    return { P: 2 * o.T, shift: [2 * o.L, 0], segs, feet, support, foot, side, D, o };
  }

  // Quadruped: leg phases (fraction of the cycle at touchdown) and duty factor β (fraction in stance).
  const QGAITS = {
    walk: { beta: 0.75, ph: { lh: 0, lf: 0.25, rh: 0.5, rf: 0.75 }, Tc: 1.2 },
    trot: { beta: 0.5, ph: { lf: 0, rh: 0, rf: 0.5, lh: 0.5 }, Tc: 0.5 },
    pace: { beta: 0.5, ph: { lf: 0, lh: 0, rf: 0.5, rh: 0.5 }, Tc: 0.6 },
  };
  const QLEGS = ["lf", "rf", "lh", "rh"];
  // hip: foot position under the hip relative to the nominal CoM; the body moves at v = stride / Tc
  function quadGait(o, hip) {
    const gt = QGAITS[o.gait], b = gt.beta, Tc = o.Tc, v = o.stride / Tc;
    const td = (leg, n) => [hip[leg][0] + v * (n + gt.ph[leg]) * Tc + (v * b * Tc) / 2, hip[leg][1]];
    const ev = [...new Set(QLEGS.flatMap((l) => [mod(gt.ph[l], 1), mod(gt.ph[l] + b, 1)]).map((x) => +x.toFixed(9)))].sort((a, c) => a - c);
    const stanceAt = (t) => QLEGS.filter((l) => mod(t / Tc - gt.ph[l], 1) < b - 1e-9);
    const posAt = (l, t) => td(l, Math.floor(t / Tc - gt.ph[l] + 1e-9));
    const segs = (t0, t1) => {
      const out = [];
      for (let n = Math.floor(t0 / Tc) - 1; n * Tc <= t1; n++) for (let j = 0; j < ev.length; j++) {
        const a = (n + ev[j]) * Tc, c = (n + (j + 1 < ev.length ? ev[j + 1] : 1 + ev[0])) * Tc;
        if (c < t0) continue;
        const tm = (a + c) / 2, st = stanceAt(tm);
        let p = [0, 0];
        for (const l of st) { const q = posAt(l, tm); p = [p[0] + q[0] / st.length, p[1] + q[1] / st.length]; }
        out.push({ a, b: c, pa: p, pb: p, legs: st });
      }
      return out;
    };
    const feet = (t, hgt = 0.07) => QLEGS.map((l) => {
      const x = t / Tc - gt.ph[l], n = Math.floor(x), s = x - n, p0 = td(l, n);
      if (s < b) return { leg: l, side: l[0], p: [p0[0], p0[1], 0], stance: true };
      const p1 = td(l, n + 1), u = (s - b) / (1 - b), m = smooth(u);
      return { leg: l, side: l[0], p: [p0[0] + (p1[0] - p0[0]) * m, p0[1], hgt * Math.sin(Math.PI * u)], stance: false, from: p0, to: p1, u };
    });
    const support = (t) => rob.hull2d(stanceAt(t).map((l) => posAt(l, t)));
    return { P: Tc, shift: [o.stride, 0], segs, feet, support, stanceAt, td, gt, v, o };
  }

  // ------------------------------------------------------------------ floating base
  // Joint rates q̇ given; the base twist that keeps the centroidal momentum at h = [ℓ; 0]:
  //   A_b v_b = h − A_j q̇      (A = momentumMatrix(), 6 × nv, momentum about the CoM)
  function zeroMomentumTwist(rb, qd, lin = [0, 0, 0]) {
    const A = rb.momentumMatrix(), nq = rb.nq;
    const Ab = A.map((r) => r.slice(0, 6)), rhs = A.map((r, i) => { let s = i < 3 ? lin[i] : 0; for (let j = 0; j < nq; j++) s -= r[6 + j] * qd[j]; return s; });
    const solve = rob.la.luFactor(Ab), vb = solve ? solve(rhs) : [0, 0, 0, 0, 0, 0];
    return { v: [...vb.map((x) => (Number.isFinite(x) ? x : 0)), ...qd], A };
  }
  R3.p11 = { dcmOf, gaitModel, humanoidGait, quadGait, QGAITS, zeroMomentumTwist, projPoly, footRect };

  // a small time-line under the picture: one row per foot, filled where that foot is on the ground
  function phaseBar(ui) {
    const { s, cssv } = Viz.util;
    const svg = s("svg", { class: "r3-phase", style: "display:block;flex:1 1 100%;width:100%;margin:6px 0 0" });
    ui.stage.style.flexWrap = "wrap";
    ui.stage.append(svg);
    return (rows, t0, t1, now, head) => {
      const W = Math.max(280, Math.round(ui.stage.clientWidth || 600)), rh = 13, gap = 5, lw = 46, top = 16, H = top + rows.length * (rh + gap) + 2;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.style.height = H + "px";
      const X = (t) => lw + ((t - t0) / (t1 - t0)) * (W - lw - 6), fg = cssv("--fg-2"), mu = cssv("--muted"), bd = cssv("--border");
      const kids = [s("text", { x: W - 6, y: 11, "font-size": 11.5, fill: mu, "text-anchor": "end" }, head)];
      rows.forEach((r, i) => {
        const y = top + i * (rh + gap);
        kids.push(s("text", { x: lw - 6, y: y + rh - 2, "font-size": 11.5, "font-weight": 650, fill: r.color, "text-anchor": "end" }, r.label));
        kids.push(s("rect", { x: lw, y, width: W - lw - 6, height: rh, rx: 3, fill: "none", stroke: bd }));
        for (const [a, b] of r.spans) { const xa = Math.max(lw, X(a)), xb = Math.min(W - 6, X(b)); if (xb > xa) kids.push(s("rect", { x: xa, y: y + 1, width: xb - xa, height: rh - 2, rx: 2, fill: r.color, "fill-opacity": 0.75 })); }
      });
      const xn = X(now);
      kids.push(s("line", { x1: xn, x2: xn, y1: top - 4, y2: H, stroke: fg, "stroke-width": 2 }));
      kids.push(s("text", { x: xn + 4, y: 11, "font-size": 11.5, "font-weight": 650, fill: fg }, L("now", "此刻")));
      svg.replaceChildren(...kids);
    };
  }

  // ================================================================== push
  // Balance recovery after a push. The robot is a linear inverted pendulum in x and y:
  //   c̈ = ω²(c − p) + F/m,  ω = √(g₀/z₀),  DCM ξ = c + ċ/ω,  ξ̇ = ω(ξ − p) (+ F/(mω) while pushed).
  // With the hip strategy the upper body is a flywheel (inertia J about the waist pitch axis, torque
  // limit τ_max, angle limit θ_max): its torque τ moves the centroidal moment pivot to
  //   CMP = p + (τ/(m g₀), 0)   and   c̈ = ω²(c − CMP)   (Pratt et al. 2006, "flywheel LIPM"),
  // while the ZMP p stays inside the foot. Bang-bang: full torque forward, then full torque back so the
  // trunk stops exactly at θ_max; it is brought back upright slowly once ξ is inside the support.
  // cfg (fields of a ```viz block, all optional):
  //   push      number  0.5     push size: the velocity change Δv of the CoM in m/s (0.1–1.2); the impulse is m·Δv
  //   control   string  "step"  strategy: "none" (the ZMP stays where it is), "ankle" (p = clamp of ξ + k(ξ − ξ_ref)
  //                             to the support polygon, k = 1), "step" (ankle, and a step onto the capture point
  //                             when ξ leaves the support polygon), "hip" (ankle, and the trunk pitches when ξ is
  //                             past the toe or heel: the CMP leaves the foot; fore–aft only, the waist has no roll)
  //   z0        number  0.94    CoM height in m (0.80–0.96): the robot bends its knees to it; ω = √(g₀/z₀)
  //   foot      number  0.22    sole length in m (0.14–0.30), centred 5 cm in front of the ankle
  //   phase     bool    false   show the phase plane (c, ċ) along the push, with the band where ξ is over the sole
  //   autoplay  bool    false   push forward once, a moment after the figure appears
  //   slow      bool    false   start in ¼× slow motion
  R3.scene("push", (ui, cfg) => {
    const footLen = num(cfg.foot ?? 0.22, 0.22, 0.14, 0.3), hl = footLen / 2;
    const P = ui.P, rb = rob.build("humanoid", { sole: [footLen, 2 * HW] }), m = rb.totalMass, W = m * G, k = R3.forceScale(rb);
    const home = R3.snapshot(rb), FR = { l: "l_foot", r: "r_foot" };
    const feet0 = { l: rb.framePose("l_foot").p.slice(0, 2), r: rb.framePose("r_foot").p.slice(0, 2) };
    const CTRL = ["none", "ankle", "step", "hip"];
    const S = { push: num(cfg.push ?? 0.5, 0.5, 0.1, 1.2), control: CTRL.includes(cfg.control) ? cfg.control : "step", slow: !!cfg.slow, dir: [1, 0], z0: cfg.z0 == null ? null : num(cfg.z0, 0.94, 0.8, 0.96), phase: !!cfg.phase };
    const PUSH_T = 0.1, SW_T = 0.25, MAX_STEPS = 4, H = 0.004;
    const CMPC = dark() ? "#e06ad8" : "#b5179e"; // CMP / angular momentum (same colour as k in "floating")
    const JW = rb.ji("waist_pitch"), TH_MAX = 0.6, TAU_MAX = 120, TAU_RET = 20; // trunk limit (rad), hip torque limits (N·m)
    const fRect = (c) => footRect(c, hl);
    const X = {};
    let z0 = 0.94, w = Math.sqrt(G / z0), hb = home.p[2], Jt = 4, phase = null;
    const levels = () => {
      const L1 = [...["l", "r"].map((s) => rb.taskPose(FR[s], footTarget(s), I3)), rb.taskPosture(Object.assign(Float64Array.from(home.q), { [JW]: X.th || 0 }), { joints: [JW] })];
      return [L1, [rb.taskCom(X.c), ...R3.baseTasks(rb, hb, home.R)], [rb.taskPosture(home.q, { gain: 0.3 })]];
    };
    function footTarget(s) {
      const sw = X.swing;
      if (sw && sw.foot === s) { const u = clamp(sw.t / sw.T, 0, 1), e = smooth(u); return [sw.from[0] + (sw.to[0] - sw.from[0]) * e, sw.from[1] + (sw.to[1] - sw.from[1]) * e, 0.07 * Math.sin(Math.PI * u)]; }
      return [X.feet[s][0], X.feet[s][1], 0];
    }
    const mid = () => [(X.feet.l[0] + X.feet.r[0]) / 2, (X.feet.l[1] + X.feet.r[1]) / 2];
    const support = () => (X.swing ? fRect(X.feet[X.swing.foot === "l" ? "r" : "l"]) : rob.hull2d([...fRect(X.feet.l), ...fRect(X.feet.r)]));
    const xiNow = () => [X.c[0] + X.cd[0] / w, X.c[1] + X.cd[1] / w];
    const pushing = () => X.pushT != null && X.t - X.pushT < PUSH_T;
    const cmpNow = () => [X.p[0] + X.tau / W, X.p[1]];
    // inertia of the upper body (everything the waist pitch joint carries) about that joint's axis
    function trunkInertia() {
      const A = rb.jointAxisWorld(JW), root = rb.jointLink[JW];
      let J = 0;
      rb.links.forEach((l, i) => {
        let a = i; while (a >= 0 && a !== root) a = rb.links[a].parent;
        if (a !== root || !l.mass) return;
        const Iw = M.mul(l.Rw, M.mul(l.inertia, M.T(l.Rw))), r = V.sub(l.cw, A.p), rp = V.sub(r, V.scale(A.axis, V.dot(r, A.axis)));
        J += V.dot(A.axis, M.mulv(Iw, A.axis)) + l.mass * V.dot(rp, rp);
      });
      return J;
    }

    // the largest push Δv (along one axis, edge `lim` from the middle) that this robot survives, found by simulating
    // the same model in 1-D: the push lasts PUSH_T, the ZMP follows the ankle law clamped to ±lim, the hip (if on) as above
    const capCache = {};
    function maxPush(lim, hipOn) {
      const key = `${lim.toFixed(4)}|${hipOn}|${w.toFixed(4)}|${Jt.toFixed(3)}`;
      if (capCache[key] != null) return capCache[key];
      const survives = (dv) => {
        let c = 0, cd = 0, th = 0, thd = 0, ph = hipOn ? null : "off";
        const h = 0.001, al = TAU_MAX / Jt;
        for (let t = 0; t < 4; t += h) {
          const xi = c + cd / w, p = clamp(2 * xi, -lim, lim);
          let tau = 0;
          if (ph === null && xi > lim + 0.002) ph = "acc";
          if (ph === "acc") { if (th + (thd * thd) / (2 * al) >= TH_MAX - 1e-4) ph = "dec"; else tau = TAU_MAX; }
          if (ph === "dec") { if (thd > 1e-9) tau = -Math.min(TAU_MAX, (Jt * thd) / h); else { ph = "hold"; thd = 0; } }
          thd += (tau / Jt) * h; th += thd * h;
          const pe = p + tau / W - (t < PUSH_T ? dv / PUSH_T : 0) / (w * w), x0 = c - pe, ch = Math.cosh(w * h), sh = Math.sinh(w * h);
          c = pe + x0 * ch + (cd / w) * sh; cd = x0 * w * sh + cd * ch;
          if (c > lim + 0.004 && c + cd / w > lim && ph !== "acc" && ph !== "dec") return false;
        }
        return true;
      };
      let lo = 0, hi = 1.5;
      for (let i = 0; i < 22; i++) { const md = (lo + hi) / 2; if (survives(md)) lo = md; else hi = md; }
      return (capCache[key] = lo);
    }

    function reset() {
      R3.restore(rb, home);
      Object.assign(X, { feet: { l: feet0.l.slice(), r: feet0.r.slice() }, c: [0, 0], cd: [0, 0], p: [0, 0], pRest: [0, 0], swing: null, pushT: null, pushA: [0, 0], fall: null, steps: 0, t: 0, trail: [], noStep: false, pushes: 0, th: 0, thd: 0, tau: 0, hip: null, hipUsed: false, thPeak: 0, cmpPeak: 0 });
      hb = home.p[2];
      R3.solve(rb, levels, 60);
      if (S.z0 != null) for (let i = 0; i < 3; i++) { hb += S.z0 - rb.com()[2]; R3.solve(rb, levels, 40); }
      z0 = rb.com()[2]; w = Math.sqrt(G / z0); Jt = trunkInertia();
      X.c = [rb.com()[0], rb.com()[1]]; X.p = X.c.slice(); X.pRest = X.c.slice();
    }
    function zmp(xi) {
      if (X.swing) return X.swing.p;
      const poly = support();
      if (S.control === "none") return projPoly(X.pRest, poly);
      const r = mid();
      return projPoly([2 * xi[0] - r[0], 2 * xi[1] - r[1]], poly); // ξ + k(ξ − ξ_ref), k = 1, clamped to the polygon
    }
    // the step that puts the new foot's centre where ξ will be at touchdown: ξ(T) = p + (ξ − p)e^{ωT}
    function planStep(xi) {
      let best = null;
      for (const s of ["l", "r"]) {
        const o = s === "l" ? "r" : "l", fo = X.feet[o], fs = X.feet[s], pH = projPoly(xi, fRect(fo)), E = Math.exp(w * SW_T);
        const xt = [pH[0] + (xi[0] - pH[0]) * E, pH[1] + (xi[1] - pH[1]) * E], sd = s === "l" ? 1 : -1;
        const to = [clamp(xt[0], fo[0] - 0.55, fo[0] + 0.55), sd > 0 ? clamp(xt[1], fo[1] + 0.16, fo[1] + 0.6) : clamp(xt[1], fo[1] - 0.6, fo[1] - 0.16)];
        // choose by how well the new foot covers the capture point; feasible if the new support polygon nearly does
        const missFoot = Math.max(0, -rob.distToPoly(xt, fRect(to))), miss = Math.max(0, -rob.distToPoly(xt, rob.hull2d([...fRect(fo), ...fRect(to)])));
        const cost = 10 * missFoot + Math.hypot(to[0] - fs[0], to[1] - fs[1]);
        const out = sd * (xt[1] - to[1]) - HW; // ξ beyond the new foot's outer edge: the other foot cannot cross over to catch it
        if (!best || cost < best.cost) best = { cost, miss, out, foot: s, from: fs.slice(), to, p: pH, xt, t: 0, T: SW_T };
      }
      if (best.miss < 0.15 && best.out < 0.02) X.swing = best; // otherwise no reachable step comes near the capture point: it falls
      else X.noStep = true;
    }
    function startFall(poly) {
      const q = closestOnPoly(X.c, poly), d = [X.c[0] - q[0], X.c[1] - q[1]], dn = Math.hypot(d[0], d[1]) || 1e-9, n = [d[0] / dn, d[1] / dn];
      X.fall = { pivot: [q[0], q[1], 0], axis: [-n[1], n[0], 0], phi: 0, phi0: Math.atan2(dn, z0), phid: Math.max(0.05, (X.cd[0] * n[0] + X.cd[1] * n[1]) / z0), l: Math.hypot(dn, z0), snap: R3.snapshot(rb), done: false, at: { c: X.c.slice(), cd: X.cd.slice(), xi: xiNow(), p: X.p.slice(), t: X.t } };
    }
    // the trunk (hip strategy): returns the torque τ on the upper body for this step
    function hipTorque(xi) {
      const xs = support().map((q) => q[0]), lo = Math.min(...xs), hi = Math.max(...xs), alpha = TAU_MAX / Jt;
      const h = X.hip;
      if (!h) {
        const out = xi[0] > hi + 0.002 ? 1 : xi[0] < lo - 0.002 ? -1 : 0;
        if (out && Math.abs(X.th) < 1e-3) { X.hip = { sgn: out, ph: "acc" }; X.hipUsed = true; return hipTorque(xi); }
        return 0;
      }
      const s = h.sgn;
      if (h.ph === "acc") { if (s * X.th + (X.thd * X.thd) / (2 * alpha) >= TH_MAX - 1e-4) h.ph = "dec"; else return s * TAU_MAX; }
      if (h.ph === "dec") { if (s * X.thd > 1e-9) return -s * Math.min(TAU_MAX, (Jt * s * X.thd) / H); h.ph = "hold"; X.thd = 0; }
      if (h.ph === "hold") { if (rob.distToPoly(xi, support()) > 0.01 && Math.hypot(...X.cd) < 0.05) h.ph = "ret"; else return 0; }
      // slow return to upright: a gentle PD whose torque stays small, so the CMP moves only a little
      const wn = 3, tq = clamp(-Jt * (wn * wn * X.th + 2 * wn * X.thd), -TAU_RET, TAU_RET);
      if (Math.abs(X.th) < 1e-3 && Math.abs(X.thd) < 1e-3) { X.th = 0; X.thd = 0; X.hip = null; return 0; }
      return tq;
    }
    function physStep(h) {
      const f = X.fall;
      if (f) {
        if (f.done) return;
        f.phid += (G / f.l) * Math.sin(f.phi0 + f.phi) * h;
        f.phi += f.phid * h;
        if (f.phi0 + f.phi > 1.3) { f.phi = 1.3 - f.phi0; f.done = true; }
        const Rf = M.axisAngle(f.axis, f.phi);
        rb.base.R = M.mul(Rf, f.snap.R); rb.base.p = V.add(f.pivot, M.mulv(Rf, V.sub(f.snap.p, f.pivot))); rb.q.set(f.snap.q); rb.fk();
        return;
      }
      const xi = xiNow(), pu = pushing();
      if (S.control === "step" && !X.swing && !pu && !X.noStep && X.steps < MAX_STEPS && rob.distToPoly(xi, support()) < -0.002) planStep(xi);
      { const poly = support(), dc = rob.distToPoly(X.c, poly); if ((!X.swing && !pu && dc < -0.004 && rob.distToPoly(xi, poly) < 0 && !(X.hip && (X.hip.ph === "acc" || X.hip.ph === "dec"))) || dc < -0.3) { startFall(poly); return; } }
      X.p = zmp(xi);
      X.tau = S.control === "hip" ? hipTorque(xi) : 0;
      if (X.tau) { X.thd += (X.tau / Jt) * h; X.th = clamp(X.th + X.thd * h, -TH_MAX, TH_MAX); X.thPeak = Math.max(X.thPeak, Math.abs(X.th)); }
      else if (X.hip && X.hip.ph === "ret") X.th += X.thd * h;
      const cmp = cmpNow();
      if (Math.abs(X.tau) > 1) X.cmpPeak = Math.max(X.cmpPeak, Math.abs(X.tau) / W);
      const a = pu ? X.pushA : [0, 0], ch = Math.cosh(w * h), sh = Math.sinh(w * h);
      for (const i of [0, 1]) { const pe = cmp[i] - a[i] / (w * w), x0 = X.c[i] - pe, v0 = X.cd[i]; X.c[i] = pe + x0 * ch + (v0 / w) * sh; X.cd[i] = x0 * w * sh + v0 * ch; } // exact for constant CMP, F
      X.t += h;
      if (X.swing && (X.swing.t += h) >= X.swing.T) { X.feet[X.swing.foot] = X.swing.to.slice(); X.swing = null; X.steps++; }
    }
    const settled = () => !X.fall && !X.swing && !X.hip && !pushing() && Math.hypot(...X.cd) < 1e-3 && Math.hypot(xiNow()[0] - zmp(xiNow())[0], xiNow()[1] - zmp(xiNow())[1]) < 2e-3;
    function doPush(dir) {
      if (X.fall) return;
      S.dir = dir; X.pushT = X.t; X.pushA = [(dir[0] * S.push) / PUSH_T, (dir[1] * S.push) / PUSH_T]; X.pushes++; X.steps = 0; X.noStep = false; X.shownPush = 0; X.thPeak = 0; X.cmpPeak = 0; X.hipUsed = false;
      view.animate(true);
    }

    const view = ui.view({ height: 460, target: [0.1, 0, 0.72], dist: 3.9, yaw: 0.32, pitch: 0.48, draw(g, dt) {
      const hs = dt * (S.slow ? 0.25 : 1);
      if (hs > 0) {
        const n = Math.ceil(hs / H);
        for (let i = 0; i < n; i++) physStep(hs / n);
        if (!X.fall) R3.solve(rb, levels, 4);
        if (X.pushT != null) X.shownPush += dt;
        if (!X.fall) { X.trail.push([X.c[0], X.c[1], ...xiNow()]); if (X.trail.length > 400) X.trail.shift(); }
        const tg = X.fall ? [rb.com()[0], rb.com()[1]] : mid(), ct = view.cam.target;
        ct[0] += (tg[0] - ct[0]) * Math.min(1, dt * 2); ct[1] += (tg[1] - ct[1]) * Math.min(1, dt * 2);
        if ((X.fall && X.fall.done) || settled()) { if (!X.fall) R3.solve(rb, levels, 12); view.animate(false); }
      }
      const poly = support(), xi = xiNow(), c = rb.com(), inside = rob.distToPoly(xi, poly) >= -1e-4;
      const lost = !!X.fall || (!inside && !X.swing && !(X.hip && (X.hip.ph === "acc" || X.hip.ph === "dec")) && (S.control === "none" || S.control === "ankle" || X.steps >= MAX_STEPS || X.noStep || (S.control === "hip" && X.hipUsed)));
      // floor: support polygon, target footprint of a step, traces of the CoM and the DCM
      R3.drawSupport(g, poly, !lost);
      if (X.swing) g.poly(rect3(X.swing.to, 0.002, hl), P.support, { ground: true, alpha: 0.1, w: 2 });
      const tr = X.trail;
      if (tr.length > 1) { g.polyline(tr.map((r) => [r[0], r[1], 0.003]), P.com, { w: 1.5, ground: true, alpha: 0.8 }); g.polyline(tr.map((r) => [r[2], r[3], 0.003]), P.dcm, { w: 1.5, ground: true, alpha: 0.8 }); }
      g.robot(rb, lost ? { color: () => "#e9a3a0" } : {});
      R3.drawCom(g, c, { label: L("CoM $c$", "质心 $c$") });
      const cmp = cmpNow(), useCmp = S.control === "hip" && Math.abs(X.tau) > 0.5 && !X.fall;
      if (!X.fall) {
        // the floor force of the LIPM: at the ZMP, along (c − CMP, z₀), vertical part = m g₀ — it points at the CoM unless the trunk is being turned
        const fdir = [c[0] - cmp[0], c[1] - cmp[1], z0], F = (W / z0) * Math.hypot(...fdir), tip = V.add([X.p[0], X.p[1], 0], V.scale(V.unit(fdir), F * k));
        g.arrow([X.p[0], X.p[1], 0], tip, P.force, { w: 5 });
        if (useCmp) {
          g.line([cmp[0], cmp[1], 0.004], c, CMPC, { w: 2, dash: 0.03, onTop: true });
          g.disc([cmp[0], cmp[1], 0.007], [0, 0, 1], 0.022, CMPC, { onTop: true });
          g.label([cmp[0], cmp[1], 0], L("CMP", "CMP"), { color: CMPC, dx: 10, dy: -12 });
        } else g.line(tip, c, P.force, { w: 1.5, dash: 0.03, alpha: 0.7 });
        const sp = Math.hypot(...X.cd);
        if (sp > 0.02) g.arrow(c, V.add(c, [X.cd[0] * 0.5, X.cd[1] * 0.5, 0]), P.velocity, { w: 4, label: "$\\dot c$" });
        g.disc([X.p[0], X.p[1], 0.006], [0, 0, 1], 0.024, P.zmp, { onTop: true });
        g.label([X.p[0], X.p[1], 0], L("ZMP $p$", "ZMP $p$"), { color: P.zmp, anchor: "right", dx: -10, dy: 12 });
        g.disc([xi[0], xi[1], 0.006], [0, 0, 1], 0.017, P.dcm, { onTop: true });
        g.circle([xi[0], xi[1], 0.006], [0, 0, 1], 0.036, P.dcm, { w: 3, onTop: true });
        g.label([xi[0], xi[1], 0], L("DCM $\\xi$", "DCM $\\xi$"), { color: P.dcm, dx: 12, dy: 14 });
        // the trunk's turning (angular momentum k = J θ̇ about the waist axis)
        if (S.control === "hip" && Math.abs(X.thd) > 0.05) { const A = rb.jointAxisWorld(JW); g.turn(V.add(A.p, [0, 0, 0.3]), A.axis, 0.12, X.thd, CMPC, { w: 3.5, onTop: true, sweep: 0.4 + Math.min(1, Math.abs(X.thd) / 5) * 1.4 * Math.PI, label: `$k = ${f0(Jt * X.thd)}$` }); }
        // at rest: where a push of this size would throw ξ (one faint ring per push direction)
        if (!view.animating && Math.hypot(...X.cd) < 1e-3) for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = [xi[0] + (d[0] * S.push) / w, xi[1] + (d[1] * S.push) / w, 0.004]; g.circle(q, [0, 0, 1], 0.03, P.dcm, { w: 2.5, onTop: true }); g.line([xi[0] + d[0] * 0.04, xi[1] + d[1] * 0.04, 0.004], [q[0] - d[0] * 0.03, q[1] - d[1] * 0.03, 0.004], P.dcm, { w: 1.5, dash: 0.02, onTop: true }); }
      }
      // the push: a big arrow into the torso while it acts (and a moment after)
      if (X.pushT != null && X.shownPush < (S.slow ? 1.2 : 0.45) && !X.fall) {
        const tp = rb.framePose("torso").p, d = [S.dir[0], S.dir[1], 0], Ln = 0.25 + 0.35 * S.push, end = V.sub(tp, V.scale(d, 0.13));
        g.arrow(V.sub(end, V.scale(d, Ln)), end, P.force, { w: 9, label: L(`push $F = ${f0((m * S.push) / PUSH_T)}$ N`, `推力 $F = ${f0((m * S.push) / PUSH_T)}$ N`), labelOpt: { dy: -16 } });
      }

      // ---- words and numbers
      const fwd = Math.abs(S.dir[0]) > 0, lim = fwd ? hl : (feet0.l[1] - feet0.r[1]) / 2 + HW, dvMax = w * lim; // for the feet side by side, as at the start
      const jump = S.push / w, dvA = maxPush(lim, false), dvH = fwd ? maxPush(hl, true) : dvA;
      let st, kind;
      if (X.fall) { st = X.noStep ? L("fell: the capture point was farther than any step can reach — press reset", "摔倒：捕获点比一步能迈到的还远——点“重置”") : L("fell: ξ could not be captured, the CoM passed the edge and the body tips over it — press reset", "摔倒：ξ 没能被捕获，质心越过了支撑边，身体绕这条边翻倒——点“重置”"); kind = "bad"; }
      else if (pushing()) { st = L(`pushed: ξ jumps by $\\Delta v/\\omega = ${f1(100 * jump)}$ cm at once, the CoM has not moved yet`, `受推：ξ 立刻跳了 $\\Delta v/\\omega = ${f1(100 * jump)}$ cm，质心还没来得及动`); kind = "warn"; }
      else if (S.control === "none" && X.pushes) { st = L("no control: the ZMP stays put, ξ runs away from it — it will fall", "无控制：ZMP 不动，ξ 越跑越远——会摔倒"); kind = "bad"; }
      else if (X.swing) { st = L("ξ left the support polygon: stepping so that the new foot covers the capture point", "ξ 出了支撑多边形：迈步，让新的脚掌盖住捕获点"); kind = "warn"; }
      else if (X.hip && X.hip.ph === "acc") { st = L("hip strategy: the trunk pitches fast — the CMP jumps beyond the foot while the ZMP stays at its edge, and pulls ξ back", "髋策略：躯干快速前倾——CMP 跳到脚外，ZMP 仍在脚的边缘，把 ξ 拉回来"); kind = "warn"; }
      else if (X.hip && X.hip.ph === "dec") { st = L("hip strategy: the trunk must be stopped before its limit — now the CMP is behind the ZMP and pushes ξ out a little again", "髋策略：躯干必须在极限前停住——这时 CMP 跑到 ZMP 后面，又把 ξ 往外推了一点"); kind = "warn"; }
      else if (lost) { st = S.control === "none" ? L("no control: the ZMP stays put, ξ runs away from it — it will fall", "无控制：ZMP 不动，ξ 越跑越远——会摔倒") : S.control === "hip" ? L("ξ is still outside after the trunk has reached its limit — the hip strategy is used up: it will fall", "躯干已到极限，ξ 仍在支撑区外——髋策略已经用尽：会摔倒") : L("ξ is outside the support polygon: the ZMP is at the edge and still cannot stop it — it will fall", "ξ 在支撑多边形外：ZMP 已顶到边缘仍拦不住——会摔倒"); kind = "bad"; }
      else if (!X.pushes) { st = L("standing: $c$, $\\xi$ and $p$ coincide — press a push button", "站立：$c$、$\\xi$、$p$ 重合——按一个推的按钮"); kind = "info"; }
      else if (view.animating && !(Math.hypot(...X.cd) < 0.01 && Math.hypot(xi[0] - mid()[0], xi[1] - mid()[1]) < 0.005)) { st = X.hipUsed ? L("ξ is back inside the support: the ankles take over, the trunk returns upright slowly", "ξ 回到了支撑区内：交给踝关节，躯干慢慢回正") : L("ξ is inside the support polygon: the ZMP goes beyond it and ξ comes back", "ξ 在支撑多边形内：ZMP 跑到它外侧，ξ 被拉回来"); kind = "ok"; }
      else { st = X.steps ? L(`recovered with ${X.steps} step${X.steps > 1 ? "s" : ""}: ξ is over the new support, the CoM at rest`, `迈了 ${X.steps} 步后恢复：ξ 落在新的支撑区内，质心停下`) : X.hipUsed ? L("recovered with the hip: the trunk turned and came back, the feet never moved", "靠髋恢复：躯干转过去又转回来，脚没有动") : L("recovered by the ankles alone: ξ came back, the CoM is at rest", "只靠踝关节就恢复了：ξ 回来了，质心停下"); kind = "ok"; }
      ui.status(st, kind);
      const at = X.fall ? X.fall.at : null, xiS = at ? at.xi : xi;
      const hipGain = (TAU_MAX / W) * (1 - Math.exp(-w * Math.sqrt((TH_MAX * Jt) / TAU_MAX))) ** 2; // bang-bang flywheel (full torque for T₁, then back for T₁, T₁ = √(θ_max J/τ_max)): extra reach of ξ = (τ/(m g₀))(1 − e^{−ωT₁})²
      ui.say([
        L(`$\\omega = \\sqrt{g_0/z_0} = \\sqrt{9.81/${f2(z0)}} = ${f2(w)}\\ \\mathrm{s^{-1}}$, $1/\\omega = ${f2(1 / w)}$ s · push $\\Delta v = ${f2(S.push)}$ m/s, impulse $m\\,\\Delta v = ${f0(m)} \\times ${f2(S.push)} = ${f1(m * S.push)}$ N·s`,
          `$\\omega = \\sqrt{g_0/z_0} = \\sqrt{9.81/${f2(z0)}} = ${f2(w)}\\ \\mathrm{s^{-1}}$，$1/\\omega = ${f2(1 / w)}$ s · 推扰 $\\Delta v = ${f2(S.push)}$ m/s，冲量 $m\\,\\Delta v = ${f0(m)} \\times ${f2(S.push)} = ${f1(m * S.push)}$ N·s`),
        (at ? L(`fallen — the numbers at the moment it tipped (t = ${f2(at.t)} s): `, `已摔倒——下面是开始翻倒那一刻（t = ${f2(at.t)} s）的数值：`) : "") + `$c = ${v2(at ? at.c : X.c)}$ m · $\\dot c = ${v2(at ? at.cd : X.cd)}$ m/s · $\\xi = c + \\dot c/\\omega = ${v2(xiS)}$ m · $p = ${v2(at ? at.p : X.p)}$ m`,
        L(`ankle-only limit ${fwd ? "forward/back" : "sideways"}: $|\\xi - \\text{centre}| \\le ${fwd ? "\\ell/2" : "\\text{half the stance}"} = ${f2(lim)}$ m, so $\\Delta v \\le \\omega \\cdot ${f2(lim)} = ${f2(dvMax)}$ m/s (${f0(m * dvMax)} N·s) for an instant push, ${f2(dvA)} m/s for this ${f1(PUSH_T)} s push (simulated) · this push throws ξ by $${f2(jump)}$ m: ${S.push <= dvA ? (S.control === "none" ? "ankle torque could hold it, but with no control nothing moves the ZMP, so it still falls" : "the ankles can hold it") : S.control === "hip" && fwd ? (S.push <= dvH ? "the ankles alone cannot, the hip can still help" : "too big even for ankle + hip") : "a step is needed"}`,
          `只靠踝关节的极限（${fwd ? "前后" : "左右"}）：$|\\xi - \\text{中心}| \\le ${fwd ? "\\ell/2" : "\\text{半个站宽}"} = ${f2(lim)}$ m，即瞬时推扰 $\\Delta v \\le \\omega \\cdot ${f2(lim)} = ${f2(dvMax)}$ m/s（${f0(m * dvMax)} N·s），对这种持续 ${f1(PUSH_T)} s 的推扰是 ${f2(dvA)} m/s（仿真得到）· 这次推扰把 ξ 推出 $${f2(jump)}$ m：${S.push <= dvA ? (S.control === "none" ? "踝力矩本来撑得住，但无控制时没有东西去移动 ZMP，所以还是会倒" : "踝关节撑得住") : S.control === "hip" && fwd ? (S.push <= dvH ? "光靠踝关节不够，髋还能帮上忙" : "连踝 + 髋也救不回来") : "必须迈步"}`),
        S.control === "hip" ? L(`hip (fore–aft only): upper body $J = ${f2(Jt)}$ kg·m² about the waist, $|\\tau| \\le ${TAU_MAX}$ N·m, trunk $|\\theta| \\le ${f0(TH_MAX * 180 / Math.PI)}°$ · now $\\tau = ${f0(X.tau)}$ N·m, $\\theta = ${f0(X.th * 180 / Math.PI)}°$, $k = J\\dot\\theta = ${f1(Jt * X.thd)}$ kg·m²/s, CMP $= p + \\tau/(m g_0)$ is $${f1(100 * X.tau / W)}$ cm from the ZMP (at most ${f1(100 * TAU_MAX / W)} cm) · full forward then full back torque buys ξ about ${f1(100 * hipGain)} cm, so $\\Delta v \\le \\omega\\,(${f2(hl)} + ${f2(hipGain)}) = ${f2(w * (hl + hipGain))}$ m/s forward for an instant push, ${f2(dvH)} m/s for this push (simulated)`,
          `髋策略（只在前后方向）：上半身绕腰轴 $J = ${f2(Jt)}$ kg·m²，$|\\tau| \\le ${TAU_MAX}$ N·m，躯干 $|\\theta| \\le ${f0(TH_MAX * 180 / Math.PI)}°$ · 此刻 $\\tau = ${f0(X.tau)}$ N·m，$\\theta = ${f0(X.th * 180 / Math.PI)}°$，$k = J\\dot\\theta = ${f1(Jt * X.thd)}$ kg·m²/s，CMP $= p + \\tau/(m g_0)$ 离 ZMP $${f1(100 * X.tau / W)}$ cm（最多 ${f1(100 * TAU_MAX / W)} cm）· 先满力矩前倾、再满力矩刹住，能给 ξ 多争取约 ${f1(100 * hipGain)} cm，即瞬时推扰向前 $\\Delta v \\le \\omega\\,(${f2(hl)} + ${f2(hipGain)}) = ${f2(w * (hl + hipGain))}$ m/s，对这次推扰是 ${f2(dvH)} m/s（仿真得到）`) : null,
      ]);
      if (phase) phase(xi, poly);
    } });
    reset();

    // the phase plane along the push direction: CoM position c (from the start middle) against its speed ċ;
    // the green band is every state whose ξ = c + ċ/ω lies over the support (the ankles can catch it)
    if (S.phase) {
      const { s, cssv } = Viz.util, svg = s("svg", { class: "r3-phase", style: "display:block;flex:0 0 auto;width:300px;max-width:100%;margin:6px 0 0" });
      ui.stage.style.flexWrap = "wrap"; ui.stage.append(svg);
      const Wd = 300, Hd = 194, l0 = 40, r0 = 8, t0 = 25, b0 = 37, o0 = mid();
      phase = (xi, poly) => {
        const d = S.dir, along = (q) => (q[0] - o0[0]) * d[0] + (q[1] - o0[1]) * d[1], tr = X.trail;
        const pr = poly.map(along), lo = Math.min(...pr), hi = Math.max(...pr);
        let cmax = Math.max(0.35, hi + 0.08); for (const r of tr) cmax = Math.max(cmax, along([r[0], r[1]]) + 0.05);
        const cmin = Math.min(-0.15, lo - 0.05), vmax = Math.max(0.6, 1.25 * S.push), vmin = -0.4;
        const Xp = (c) => l0 + ((c - cmin) / (cmax - cmin)) * (Wd - l0 - r0), Yp = (v) => t0 + ((vmax - v) / (vmax - vmin)) * (Hd - t0 - b0);
        const fg = cssv("--fg-2"), mu = cssv("--muted"), bd = cssv("--border");
        // band: ω(lo − c) ≤ ċ ≤ ω(hi − c), clipped to the box (sampled along c)
        const top = [], bot = [];
        for (let i = 0; i <= 40; i++) { const c = cmin + ((cmax - cmin) * i) / 40; top.push([Xp(c), Yp(clamp(w * (hi - c), vmin, vmax))]); bot.push([Xp(c), Yp(clamp(w * (lo - c), vmin, vmax))]); }
        const band = [...top, ...bot.reverse()].map((q) => q.map((x) => x.toFixed(1)).join(",")).join(" ");
        const traj = tr.map((r) => { const c = along([r[0], r[1]]), v = w * (along([r[2], r[3]]) - c); return `${Xp(c).toFixed(1)},${Yp(clamp(v, vmin, vmax)).toFixed(1)}`; }).join(" ");
        const cNow = along(X.c), vNow = w * (along(xi) - cNow);
        const kids = [
          s("rect", { x: l0, y: t0, width: Wd - l0 - r0, height: Hd - t0 - b0, fill: "none", stroke: bd }),
          s("polygon", { points: band, fill: P.support, "fill-opacity": 0.22, stroke: "none" }),
          s("line", { x1: l0, x2: Wd - r0, y1: Yp(0), y2: Yp(0), stroke: bd }),
          s("line", { x1: Xp(0), x2: Xp(0), y1: t0, y2: Hd - b0, stroke: bd }),
          tr.length > 1 ? s("polyline", { points: traj, fill: "none", stroke: P.com, "stroke-width": 2 }) : null,
          s("circle", { cx: Xp(cNow), cy: Yp(clamp(vNow, vmin, vmax)), r: 4.5, fill: P.com }),
          s("text", { x: (l0 + Wd - r0) / 2, y: Hd - 5, "font-size": 11.5, fill: mu, "text-anchor": "middle" }, L("CoM $c$ along the push (m)", "沿推的方向的质心 c (m)").replace(/\$/g, "")),
          s("text", { x: 4, y: 11, "font-size": 11.5, fill: mu }, L("ċ (m/s)", "ċ (m/s)")),
          s("text", { x: Wd - r0 - 4, y: t0 + 14, "font-size": 11, fill: fg, "text-anchor": "end" }, L("green: ξ over the sole", "绿色：ξ 在脚掌上方")),
          ...[cmin, 0, cmax].map((c) => s("text", { x: Xp(c), y: Hd - b0 + 13, "font-size": 10.5, fill: mu, "text-anchor": c === cmin ? "start" : c === cmax ? "end" : "middle" }, f2(c))),
          ...[vmin, 0, vmax].map((v) => s("text", { x: l0 - 4, y: Yp(v) + 4, "font-size": 10.5, fill: mu, "text-anchor": "end" }, f1(v))),
        ].filter(Boolean);
        svg.setAttribute("viewBox", `0 0 ${Wd} ${Hd}`); svg.style.height = Hd + "px";
        svg.replaceChildren(...kids);
      };
    }

    const kick = (d) => () => doPush(d);
    ui.btn(L("push forward ▲", "向前推 ▲"), kick([1, 0]), "primary");
    ui.btn(L("back ▼", "向后 ▼"), kick([-1, 0]));
    ui.btn(L("◀ left", "◀ 向左"), kick([0, 1]));
    ui.btn(L("right ▶", "向右 ▶"), kick([0, -1]));
    ui.slider(L("push $\\Delta v$ (m/s)", "推扰 $\\Delta v$（m/s）"), { min: 0.1, max: 1.2, step: 0.05, value: S.push }, (v) => { S.push = v; caption(); view.redraw(); });
    ui.seg([["none", L("no control", "无控制")], ["ankle", L("ankle", "踝策略")], ["step", L("ankle + step", "踝 + 迈步")], ["hip", L("ankle + hip", "踝 + 髋")]], S.control, (v) => { S.control = v; reset(); caption(); legend(); view.redraw(); });
    ui.btn(Viz.util.T().reset, () => { reset(); view.animate(false); view.redraw(); });
    ui.toggle(L("¼× slow motion", "¼× 慢放"), S.slow, (on) => { S.slow = on; });
    const legend = () => ui.legend(["com", "dcm", "zmp", "force", "support", "velocity", ...(S.control === "hip" ? [[CMPC, L("CMP and the trunk's angular momentum $k$", "CMP 与躯干角动量 $k$")]] : [])]);
    legend();
    // the default caption follows the strategy and the push size actually configured
    function caption() {
      const jump = S.push / w, held = S.push <= maxPush(hl, false), hipOk = S.push <= maxPush(hl, true), J = f1(100 * jump), E = f1(100 * hl);
      const hipGain = (TAU_MAX / W) * (1 - Math.exp(-w * Math.sqrt((TH_MAX * Jt) / TAU_MAX))) ** 2;
      const head = L("Do: press “push forward”, then try the other strategies and push sizes; ¼× slow motion helps. Notice: a push makes the blue DCM jump by Δv/ω at once while the orange CoM has not moved yet (the faint blue rings show where each push would throw it). ", "操作：按“向前推”，再试其他策略和推扰大小；用 ¼× 慢放看得更清楚。观察：一推，蓝色的 DCM 立刻跳出 Δv/ω，而橙色的质心还没动（淡蓝圆圈标出各方向的推扰会把它推到哪里）。");
      const tail = {
        none: L(`With no control the red ZMP stays where it is, so ξ (thrown ${J} cm) runs away from it and the robot falls, whatever the push size.`, `无控制时红色的 ZMP 原地不动，ξ（被推出 ${J} cm）越跑越远，不管推多小，机器人都会摔倒。`),
        ankle: L(`With the ankles the red ZMP can go up to the toe edge, ${E} cm ahead of the middle of the foot; this push throws ξ ${J} cm, so ${held ? "the ankles hold it: the ZMP goes past ξ and ξ comes back" : "the ZMP reaches the edge and still cannot stop ξ: the robot falls — try “ankle + step” or “ankle + hip”"}. The red arrow from the ZMP is the floor force; its line passes through the CoM.`, `靠踝关节，红色的 ZMP 最多能到脚尖边缘，离脚掌中心 ${E} cm；这次推扰把 ξ 推出 ${J} cm，所以${held ? "踝关节撑得住：ZMP 跑到 ξ 外侧，ξ 被拉回来" : "ZMP 顶到边缘也拦不住 ξ：机器人摔倒——试试“踝 + 迈步”或“踝 + 髋”"}。从 ZMP 出发的红箭头是地面反力，它的作用线穿过质心。`),
        step: L(`While ξ is inside the green polygon the ankles hold (the toe edge is ${E} cm ahead); outside, no ZMP can stop it and only a step whose foot covers the capture point saves the robot — this push throws ξ ${J} cm, so ${held ? "the ankles alone hold it; push harder to see a step" : "it steps"}. The red arrow from the ZMP is the floor force; its line passes through the CoM.`, `只要 ξ 还在绿色支撑多边形内，踝关节就撑得住（脚尖边缘在前方 ${E} cm）；一旦出界，任何 ZMP 都拦不住它，只有迈一步、让新脚掌盖住捕获点才能救回来——这次推扰把 ξ 推出 ${J} cm，所以${held ? "只靠踝关节就够了；推得更重才会迈步" : "会迈步"}。从 ZMP 出发的红箭头是地面反力，它的作用线穿过质心。`),
        hip: L(`When ξ is past the toe (${E} cm) the trunk pitches forward hard: the red floor force at the ZMP, still inside the foot, no longer points at the CoM — its parallel through the CoM meets the floor at the pink CMP, beyond the foot, and that pulls ξ back. Then the trunk must be braked before its limit (the CMP jumps behind) and is brought back slowly. This buys about ${f1(100 * hipGain)} cm; this push throws ξ ${J} cm, so ${held ? "the ankles alone hold it — push harder to see the hip" : hipOk ? "the hip saves it" : "even the hip cannot save it — a step would"}.`, `ξ 越过脚尖（${E} cm）时，躯干猛地前倾：红色地面反力仍作用在脚内的 ZMP 上，但不再指向质心——过质心作它的平行线，与地面交于粉色的 CMP，它在脚外，把 ξ 拉回来。随后躯干必须在极限前刹住（CMP 跳到后面），再慢慢回正。这样大约能多争取 ${f1(100 * hipGain)} cm；这次推扰把 ξ 推出 ${J} cm，所以${held ? "光靠踝关节就够了——推得更重才看得到髋" : hipOk ? "髋能救回来" : "连髋也救不回来——得迈步"}。`),
      }[S.control];
      ui.caption(head + tail);
    }
    caption();
    if (cfg.autoplay) setTimeout(() => { if (view.wrap.isConnected) doPush([1, 0]); }, 900);
  });

  // ================================================================== walk
  // Walking from a footstep plan. Humanoid: the ZMP reference is piecewise constant on the feet (linear
  // during double support); the DCM is its only bounded solution ξ(t) = ω∫ e^{ω(t−s)} p(s) ds (the
  // step-to-step recursion of viz5.js in closed form); the CoM follows ċ = ω(ξ − c). Quadruped: the
  // ZMP reference is the centre of the feet on the ground in each phase of the gait.
  // cfg:
  //   robot        string  "humanoid"  "humanoid" | "quadruped"
  //   step_length  number  0.25        humanoid: step length L in m (0–0.4)
  //   step_width   number  0.20        humanoid: lateral distance between the feet in m (0.12–0.32)
  //   step_time    number  0.6         humanoid: time per step T in s (0.4–1.0)
  //   ds           number  0.2         humanoid: double-support fraction of each step (0–0.5)
  //   speed        number  none        humanoid: walking speed v in m/s (0–1); sets L = v·T (T from step_time); if that
  //                                    needs L > 0.4 m, L = 0.4 m and T = 0.4/v (T ≥ 0.4 s). Overrides step_length
  //   trace        bool    false       humanoid: a time plot under the picture of c, ξ and p along x (staircase / saw-tooth)
  //   gait         string  "trot"      quadruped: "walk" | "trot" | "pace"
  //   stride       number  0.25        quadruped: distance the body travels per gait cycle in m (0–0.4)
  //   cycle        number  (per gait)  quadruped: gait cycle time in s (0.3–1.6; walk 1.2, trot 0.5, pace 0.6)
  //   autoplay     bool    false       start walking at once (otherwise paused mid-step, the plan drawn)
  R3.scene("walk", (ui, cfg) => {
    const P = ui.P, quad = cfg.robot === "quadruped", rb = rob.build(quad ? "quadruped" : "humanoid");
    const home = R3.snapshot(rb), c0 = rb.com(), z0 = c0[2], w = Math.sqrt(G / z0);
    const FR = quad ? Object.fromEntries(QLEGS.map((l) => [l, l + "_foot"])) : { l: "l_foot", r: "r_foot" };
    const hip = quad ? Object.fromEntries(QLEGS.map((l) => { const p = rb.framePose(l + "_foot").p; return [l, [p[0] - c0[0], p[1] - c0[1]]]; })) : null;
    const S = quad
      ? { gait: QGAITS[cfg.gait] ? cfg.gait : "trot", stride: num(cfg.stride ?? 0.25, 0.25, 0, 0.4) }
      : { L: num(cfg.step_length ?? 0.25, 0.25, 0, 0.4), W: num(cfg.step_width ?? 0.2, 0.2, 0.12, 0.32), T: num(cfg.step_time ?? 0.6, 0.6, 0.4, 1.0), ds: num(cfg.ds ?? 0.2, 0.2, 0, 0.5), trace: !!cfg.trace };
    if (!quad && cfg.speed != null) { const v = num(cfg.speed, 0.4, 0, 1); S.L = v * S.T; if (S.L > 0.4) { S.L = 0.4; S.T = clamp(0.4 / Math.max(v, 1e-9), 0.4, 1.0); } }
    if (quad) S.Tc = num(cfg.cycle ?? QGAITS[S.gait].Tc, QGAITS[S.gait].Tc, 0.3, 1.6);
    let gm, t = 0, c = [0, 0], stopAt = null;
    const H = 0.004, WRAP = 40; // wrap the plan back every 40 steps / 20 cycles (keeps numbers small)
    function rebuild(keepPhase) {
      const oldP = gm ? gm.P : 1;
      gm = gaitModel(quad ? quadGait({ gait: S.gait, stride: S.stride, Tc: S.Tc }, hip) : humanoidGait({ L: S.L, W: S.W, T: S.T, ds: S.ds }), w);
      t = keepPhase ? (t / oldP) * gm.P : quad ? 0.3 * gm.P : 0.55 * S.T;
      c = gm.comAt(t);
    }
    const unit = () => (quad ? gm.P / (S.gait === "walk" ? 4 : 2) : S.T); // one step (or one phase)
    const footTargets = () => gm.feet(t);
    const levels = () => {
      const fs = footTargets(), L1 = quad ? fs.map((f) => rb.taskPos(FR[f.leg], f.p)) : fs.map((f) => rb.taskPose(FR[f.side], f.p, I3));
      return [L1, [rb.taskCom(c), ...R3.baseTasks(rb, home.p[2], home.R)], [rb.taskPosture(home.q, { gain: 0.3 })]];
    };
    const place = () => { const d = [c[0] - rb.com()[0], c[1] - rb.com()[1]]; rb.base.p = [rb.base.p[0] + d[0], rb.base.p[1] + d[1], rb.base.p[2]]; rb.fk(); };
    rebuild(false);

    const TZ = quad ? 0.15 : 0.66; // camera target height: the humanoid's whole body and three footprints ahead fit
    const view = ui.view({ height: 460, target: [c[0] + (quad ? 0.15 : 0.3), 0, TZ], dist: quad ? 2.3 : 4.6, yaw: 0.3, pitch: quad ? 0.75 : 0.5, groundSize: 4, draw(g, dt) {
      if (dt > 0) {
        const n = Math.ceil(dt / H), h = dt / n;
        for (let i = 0; i < n; i++) { c = gm.comStep(c, t, h); t += h; }
        if (stopAt != null && t >= stopAt) { const d = stopAt - t; c = gm.comStep(c, t, d); t = stopAt; stopAt = null; view.animate(false); syncPlay(); }
        const per = quad ? 20 : WRAP / 2;
        if (t > per * gm.P) { t -= per * gm.P; const dx = per * gm.shift[0]; c[0] -= dx; rb.base.p[0] -= dx; rb.fk(); view.cam.target[0] -= dx; }
        R3.solve(rb, levels, 4);
        const ct = view.cam.target; ct[0] += (c[0] + camOff - ct[0]) * Math.min(1, dt * 3);
      }
      const xi = gm.xi(t), p = gm.zmp(t), poly = gm.support(t), fs = footTargets(), cc = rb.com();
      // floor: footprints / footfalls, the ZMP path, the DCM and CoM curves (dashed ahead), the support
      const seg = quad ? gm.segs(t - 0.6 * gm.P, t + 0.5 * gm.P).filter((s) => s.b > t - 0.6 * gm.P && s.a < t + 0.5 * gm.P) : gm.segs(t - gm.P, t + gm.P);
      if (!quad) {
        const k = Math.floor(t / S.T);
        for (let j = k - 3; j <= k + 4; j++) {
          if (fs.some((f) => f.k === j && f.stance)) continue;
          const f = gm.foot(j), sd = gm.side(j), fut = j > k;
          g.poly(rect3(f, 0.002), sideCol(sd), { ground: true, alpha: fut ? 0.2 : 0.08, w: fut ? 2 : 1 });
          if (fut && j <= k + 3) g.label([f[0] + HL, f[1], 0], String(j - k), { color: sideCol(sd), small: true, dx: 4, dy: 0 });
        }
      } else {
        for (const l of QLEGS) { const n0 = Math.floor(t / gm.P - gm.gt.ph[l]); for (let n = n0 + 1; n <= n0 + 2; n++) { const q = gm.td(l, n); g.circle([q[0], q[1], 0.003], [0, 0, 1], 0.025, sideCol(l[0]), { w: 2.5, ground: true, alpha: n === n0 + 1 ? 0.95 : 0.4 }); } }
      }
      const zp = [], k0 = Math.floor(t / unit());
      for (const s of seg) {
        if (!quad && (s.a < (k0 - 3) * S.T + S.ds * S.T - 1e-9 || s.a > (k0 + 4) * S.T)) continue; zp.push([s.pa[0], s.pa[1], 0.004]); zp.push([s.pb[0], s.pb[1], 0.004]); }
      g.polyline(zp, P.zmp, { w: 2.5, onTop: true, alpha: 0.6 });
      if (quad) for (const s of seg) g.disc([s.pa[0], s.pa[1], 0.004], [0, 0, 1], 0.011, P.zmp, { onTop: true, alpha: 0.7 });
      const curve = (f, a, b) => { const out = []; for (let i = 0; i <= 48; i++) { const q = f(a + ((b - a) * i) / 48); out.push([q[0], q[1], 0.005]); } return out; };
      const back = quad ? 0.6 * gm.P : 3 * S.T, ahead = quad ? 0.5 * gm.P : 3 * S.T;
      g.polyline(curve(gm.xi, t - back, t), P.dcm, { w: 3, onTop: true });
      dashed(g, curve(gm.xi, t, t + ahead), P.dcm, { w: 2.5, onTop: true });
      g.polyline(curve(gm.comAt, t - back, t), P.com, { w: 3, onTop: true });
      dashed(g, curve(gm.comAt, t, t + ahead), P.com, { w: 2.5, onTop: true });
      R3.drawSupport(g, poly, true, { alpha: 0.3 });
      for (const f of fs) if (!f.stance) { const arc = []; for (let i = 0; i <= 24; i++) { const u = i / 24, e = smooth(u); arc.push([f.from[0] + (f.to[0] - f.from[0]) * e, f.from[1], (quad ? 0.07 : 0.08) * Math.sin(Math.PI * u)]); } dashed(g, arc, sideCol(f.side), { w: 2 }); }
      g.robot(rb);
      R3.drawCom(g, cc, { label: L("CoM", "质心"), r: quad ? 0.03 : 0.038 });
      g.disc([p[0], p[1], 0.007], [0, 0, 1], quad ? 0.02 : 0.024, P.zmp, { onTop: true });
      g.label([p[0], p[1], 0], "ZMP $p$", { color: P.zmp, anchor: "right", dx: -10, dy: 12 });
      g.disc([xi[0], xi[1], 0.007], [0, 0, 1], 0.015, P.dcm, { onTop: true });
      g.circle([xi[0], xi[1], 0.007], [0, 0, 1], quad ? 0.028 : 0.034, P.dcm, { w: 3, onTop: true });
      g.label([xi[0], xi[1], 0], "DCM $\\xi$", { color: P.dcm, dx: 12, dy: 14 });

      // phase bar, words and numbers
      if (!quad) {
        const t0 = t - S.T, t1 = t + 3 * S.T, D = S.ds * S.T, spans = { l: [], r: [] };
        for (let j = Math.floor(t0 / S.T) - 2; j * S.T <= t1; j++) spans[gm.side(j)].push([j * S.T, (j + 1) * S.T + D]);
        bar([{ label: L("left", "左脚"), color: sideCol("l"), spans: spans.l }, { label: L("right", "右脚"), color: sideCol("r"), spans: spans.r }], t0, t1, t, L("feet on the ground (overlap = double support)", "着地的脚（重叠处 = 双脚支撑）"));
        if (trace) trace(t);
        const kk = Math.floor(t / S.T), tau = t - kk * S.T, dsNow = tau < D, sd = gm.side(kk);
        const name = (s) => (s === "l" ? L("left", "左") : L("right", "右"));
        ui.status(dsNow ? L("double support: the ZMP slides from the old foot to the new one", "双脚支撑：ZMP 从旧脚滑向新脚") : L(`single support on the ${name(sd)} foot: the ZMP stays on it, the DCM runs ahead toward the next foot`, `${name(sd)}脚单脚支撑：ZMP 停在这只脚上，DCM 向下一步的方向跑在前面`), "info");
        const ks = 2 * Math.floor(t / (2 * S.T)), ts = ks * S.T + D, b = V.sub([...gm.xi(ts), 0], [...gm.foot(ks), 0]), b2 = V.sub([...gm.xi(ts + S.T), 0], [...gm.foot(ks + 1), 0]);
        let sway = 0; for (let i = 0; i < 40; i++) sway = Math.max(sway, Math.abs(gm.comAt((i / 40) * gm.P)[1]));
        ui.say([
          L(`$\\omega = \\sqrt{g_0/z_0} = ${f2(w)}\\ \\mathrm{s^{-1}}$ · step $T = ${f2(S.T)}$ s (double support $${f2(D)}$ s) · $L = ${f2(S.L)}$ m, speed $v = L/T = ${f2(S.L / S.T)}$ m/s`, `$\\omega = \\sqrt{g_0/z_0} = ${f2(w)}\\ \\mathrm{s^{-1}}$ · 每步 $T = ${f2(S.T)}$ s（双脚支撑 $${f2(D)}$ s）· $L = ${f2(S.L)}$ m，速度 $v = L/T = ${f2(S.L / S.T)}$ m/s`),
          `$c = ${v2(c)}$ m · $\\xi = ${v2(xi)}$ m · $p = ${v2(p)}$ m`,
          L(`at the start of each single support $\\xi - p = ${v2(b)}$, then $${v2(b2)}$ m — the same every step (a periodic gait; error ${gm.periodErr.toExponential(0)} m) · the CoM sways $\\pm ${f1(100 * sway)}$ cm while the feet are $\\pm ${f1(50 * S.W)}$ cm: it never gets over a foot`,
            `每次单脚支撑开始时 $\\xi - p = ${v2(b)}$，下一步 $${v2(b2)}$ m——每一步都一样（周期步态；误差 ${gm.periodErr.toExponential(0)} m）· 质心左右摆 $\\pm ${f1(100 * sway)}$ cm，而两脚在 $\\pm ${f1(50 * S.W)}$ cm：质心从来不会走到脚的正上方`),
        ]);
      } else {
        const t0 = t - 0.25 * gm.P, t1 = t + 1.75 * gm.P, rows = [];
        for (const l of ["lh", "lf", "rf", "rh"]) { const sp = []; for (let n = Math.floor(t0 / gm.P) - 2; n * gm.P <= t1; n++) { const a = (n + gm.gt.ph[l]) * gm.P; sp.push([a, a + gm.gt.beta * gm.P]); } rows.push({ label: { lh: L("LH", "左后"), lf: L("LF", "左前"), rf: L("RF", "右前"), rh: L("RH", "右后") }[l], color: sideCol(l[0]), spans: sp }); }
        bar(rows, t0, t1, t, L(`footfall pattern (Hildebrand): stance in colour, duty factor β = ${f2(gm.gt.beta)}`, `落脚时序图（Hildebrand）：着色 = 着地，占空比 β = ${f2(gm.gt.beta)}`));
        const st = gm.stanceAt(t), cxy = [cc[0], cc[1]];
        let marg = 0, txt;
        const why = S.gait === "trot" ? L(" · it does not tip because the body accelerates (ZMP ≠ CoM ground point) and the other pair lands within half a cycle", "· 它不会倒：机身在加速（ZMP 与质心投影不重合），而另一对脚半个周期内就落地") : "";
        if (poly.length >= 3) { marg = rob.distToPoly(cxy, poly); txt = marg >= 0 ? L(`CoM ground point inside the support triangle, ${f1(100 * marg)} cm from its edge`, `质心投影在支撑三角形内，距边 ${f1(100 * marg)} cm`) : L(`CoM ground point ${f1(-100 * marg)} cm outside the support triangle`, `质心投影在支撑三角形外 ${f1(-100 * marg)} cm`); }
        else { marg = -Math.hypot(cxy[0] - closestOnPoly(cxy, poly)[0], cxy[1] - closestOnPoly(cxy, poly)[1]); txt = L(`support = a line between two feet; the CoM ground point is ${f1(-100 * marg)} cm off it, the ZMP is on it`, `支撑区 = 两脚之间的一条线；质心投影离这条线 ${f1(-100 * marg)} cm，而 ZMP 就在线上`) + why; }
        const msg = {
          trot: L("trot: the support is a diagonal line; the ZMP is on it, the CoM is not — dynamically, not statically, stable", "小跑：支撑区是一条对角线；ZMP 在线上，质心不在——动态稳定，而非静态稳定"),
          pace: L("pace: both feet of one side carry the robot, so the ZMP jumps side to side and the CoM rocks left and right", "溜蹄：同侧两脚一起支撑，ZMP 左右跳动，质心随之左右摇摆"),
          walk: marg >= -0.002 ? L("walk: three feet are always down and the CoM is inside their triangle — statically stable", "慢走：始终三脚着地，质心在三角形内——静态稳定") : L("walk: three feet are down but the CoM is just outside their triangle — this instant relies on dynamics", "慢走：三脚着地，但质心刚好在三角形外——这一刻靠的是动态"),
        }[S.gait];
        ui.status(msg, S.gait === "walk" && marg < -0.002 ? "warn" : "info");
        ui.say([
          L(`${S.gait}: duty factor $\\beta = ${f2(gm.gt.beta)}$, cycle $${f2(gm.P)}$ s, stride $${f2(S.stride)}$ m, $v = ${f2(gm.v)}$ m/s · $\\omega = \\sqrt{g_0/z_0} = ${f2(w)}\\ \\mathrm{s^{-1}}$ · feet down: ${st.length}`, `${{ walk: "慢走", trot: "小跑", pace: "溜蹄" }[S.gait]}：占空比 $\\beta = ${f2(gm.gt.beta)}$，周期 $${f2(gm.P)}$ s，步幅 $${f2(S.stride)}$ m，$v = ${f2(gm.v)}$ m/s · $\\omega = \\sqrt{g_0/z_0} = ${f2(w)}\\ \\mathrm{s^{-1}}$ · 着地脚数：${st.length}`),
          `$c = ${v2(c)}$ m · $\\xi = ${v2(xi)}$ m · $p = ${v2(p)}$ m`,
          txt,
        ]);
      }
    } });
    const bar = phaseBar(ui);
    // the camera follows the walk along x only, keeping the offset, height and side of the start view (also a `view` from the config)
    const camT0 = view.cam.target.slice(), camOff = camT0[0] - c[0];
    // time plot of the forward positions: the ZMP p is a staircase, the DCM ξ a saw-tooth that runs ahead of it, the CoM c smooth
    let trace = null;
    if (!quad && S.trace) {
      const { s, cssv } = Viz.util, svg = s("svg", { class: "r3-phase", style: "display:block;flex:1 1 100%;width:100%;margin:6px 0 0" });
      ui.stage.append(svg);
      trace = (tn) => {
        const Wd = Math.max(280, Math.round(ui.stage.clientWidth || 600)), Hd = 150, l0 = 46, r0 = 8, t0 = 16, b0 = 22;
        const ta = tn - 2 * S.T, tb = tn + 2 * S.T, N = 160, rows = [];
        for (let i = 0; i <= N; i++) { const tt = ta + ((tb - ta) * i) / N; rows.push([tt, gm.comAt(tt)[0], gm.xi(tt)[0], gm.zmp(tt)[0]]); }
        let lo = Infinity, hi = -Infinity;
        for (const r of rows) for (let j = 1; j < 4; j++) { lo = Math.min(lo, r[j]); hi = Math.max(hi, r[j]); }
        if (hi - lo < 0.1) { const m0 = (hi + lo) / 2; lo = m0 - 0.05; hi = m0 + 0.05; }
        const pad = 0.06 * (hi - lo); lo -= pad; hi += pad;
        const Xp = (tt) => l0 + ((tt - ta) / (tb - ta)) * (Wd - l0 - r0), Yp = (x) => t0 + ((hi - x) / (hi - lo)) * (Hd - t0 - b0);
        const line = (j, col, past) => s("polyline", { points: rows.filter((r) => (past ? r[0] <= tn + 1e-9 : r[0] >= tn - 1e-9)).map((r) => `${Xp(r[0]).toFixed(1)},${Yp(r[j]).toFixed(1)}`).join(" "), fill: "none", stroke: col, "stroke-width": past ? 2.2 : 1.6, "stroke-dasharray": past ? null : "5 4" });
        const mu = cssv("--muted"), bd = cssv("--border"), fg = cssv("--fg-2");
        const kids = [s("rect", { x: l0, y: t0, width: Wd - l0 - r0, height: Hd - t0 - b0, fill: "none", stroke: bd })];
        for (const [j, col] of [[3, P.zmp], [2, P.dcm], [1, P.com]]) kids.push(line(j, col, true), line(j, col, false));
        kids.push(s("line", { x1: Xp(tn), x2: Xp(tn), y1: t0 - 4, y2: Hd - b0, stroke: fg, "stroke-width": 1.5 }));
        kids.push(s("text", { x: Xp(tn) + 4, y: 11, "font-size": 11.5, fill: fg, "font-weight": 650 }, L("now", "此刻")));
        kids.push(s("text", { x: Wd - r0, y: 11, "font-size": 11.5, fill: mu, "text-anchor": "end" }, L("forward position x (m) against time: p red, ξ blue, c orange; dashed = planned", "前进方向位置 x (m) 随时间：p 红，ξ 蓝，c 橙；虚线 = 计划")));
        kids.push(s("text", { x: l0 - 4, y: Yp(hi - pad) + 4, "font-size": 10.5, fill: mu, "text-anchor": "end" }, f2(hi - pad)), s("text", { x: l0 - 4, y: Yp(lo + pad) + 4, "font-size": 10.5, fill: mu, "text-anchor": "end" }, f2(lo + pad)));
        kids.push(s("text", { x: l0, y: Hd - 6, "font-size": 10.5, fill: mu }, `−${f1(2 * S.T)} s`), s("text", { x: Wd - r0, y: Hd - 6, "font-size": 10.5, fill: mu, "text-anchor": "end" }, `+${f1(2 * S.T)} s`));
        svg.setAttribute("viewBox", `0 0 ${Wd} ${Hd}`); svg.style.height = Hd + "px";
        svg.replaceChildren(...kids);
      };
    }
    place(); R3.solve(rb, levels, 80);

    // controls
    let playB;
    const syncPlay = () => { playB.textContent = view.animating && stopAt == null ? "❚❚ " + Viz.util.T().pause : "▶ " + Viz.util.T().play; };
    playB = ui.btn("▶ " + Viz.util.T().play, () => { stopAt = null; view.animate(!view.animating); syncPlay(); }, "primary");
    ui.btn(L("one step ▸", "走一步 ▸"), () => { const u = unit(); stopAt = (Math.floor(t / u + 1e-6) + 1) * u; view.animate(true); syncPlay(); });
    ui.btn(Viz.util.T().reset, () => { stopAt = null; view.animate(false); R3.restore(rb, home); rebuild(false); place(); R3.solve(rb, levels, 80); view.setView({ target: [c[0] + camOff, camT0[1], camT0[2]] }); syncPlay(); });
    const changed = () => { rebuild(true); place(); R3.solve(rb, levels, 30); view.redraw(); };
    if (!quad) {
      let spS = null;
      const syncSpeed = () => spS && spS.set(Math.round((100 * S.L) / S.T) / 100);
      const lS = ui.slider(L("step length $L$ (m)", "步长 $L$（m）"), { min: 0, max: 0.4, step: 0.01, value: S.L }, (v) => { S.L = v; syncSpeed(); changed(); });
      ui.slider(L("step width (m)", "步宽（m）"), { min: 0.12, max: 0.32, step: 0.01, value: S.W }, (v) => { S.W = v; changed(); });
      ui.slider(L("step time $T$ (s)", "每步时间 $T$（s）"), { min: 0.4, max: 1.0, step: 0.02, value: S.T }, (v) => { S.T = v; syncSpeed(); changed(); });
      spS = ui.slider(L("speed $v = L/T$ (m/s)", "速度 $v = L/T$（m/s）"), { min: 0, max: 1, step: 0.01, value: Math.round((100 * S.L) / S.T) / 100 }, (v) => { S.L = clamp(v * S.T, 0, 0.4); lS.set(S.L); changed(); });
      ui.slider(L("double-support fraction", "双脚支撑比例"), { min: 0, max: 0.5, step: 0.05, value: S.ds }, (v) => { S.ds = v; changed(); });
    } else {
      let cyc;
      ui.seg([["walk", L("walk", "慢走")], ["trot", L("trot", "小跑")], ["pace", L("pace", "溜蹄")]], S.gait, (v) => { S.gait = v; S.Tc = QGAITS[v].Tc; cyc.set(S.Tc); rebuild(false); place(); R3.solve(rb, levels, 40); view.redraw(); });
      ui.slider(L("stride per cycle (m)", "每周期步幅（m）"), { min: 0, max: 0.4, step: 0.01, value: S.stride }, (v) => { S.stride = v; changed(); });
      cyc = ui.slider(L("cycle time (s)", "步态周期（s）"), { min: 0.3, max: 1.6, step: 0.05, value: S.Tc }, (v) => { S.Tc = v; changed(); });
    }
    ui.legend(["com", "dcm", "zmp", "support", [sideCol("l"), L("left feet", "左脚")], [sideCol("r"), L("right feet", "右脚")]]);
    ui.caption(quad
      ? L("Do: switch between walk, trot and pace, press play or step through one phase at a time. Notice: the green support changes with the footfall pattern below — a triangle in the walk, a line in the trot and the pace. The red ZMP is always on it; the orange CoM is not: in the trot it runs along beside the line, in the pace it rocks from side to side. Solid curves are the past, dashed the next cycle.",
        "操作：在慢走、小跑、溜蹄之间切换，按播放，或一次走一个相位。观察：绿色支撑区随下方的落脚时序变化——慢走时是三角形，小跑和溜蹄时是一条线。红色的 ZMP 始终在支撑区上，橙色的质心却不一定：小跑时它贴着支撑线前进，溜蹄时它左右摇摆。实线是已经走过的，虚线是下一个周期。")
      : L("Do: press play (or “one step”), then change step length, width, time and the double-support fraction. Notice: the red ZMP path hops from footprint to footprint (numbers = steps ahead); the blue DCM runs ahead of it toward the next foot, and the orange CoM follows the DCM in a smooth weave between the feet — it never reaches them. The green support polygon switches between one foot and both; the phase bar shows which foot is down. Solid curves are the past three steps, dashed the next three.",
        "操作：按播放（或“走一步”），再改步长、步宽、每步时间和双脚支撑比例。观察：红色 ZMP 路径在脚印之间跳（数字 = 往后第几步）；蓝色 DCM 跑在它前面、奔向下一只脚；橙色质心跟着 DCM 在两脚之间平滑地蛇行，从不走到脚的正上方。绿色支撑多边形在单脚与双脚之间切换，相位条显示哪只脚着地。实线是走过的三步，虚线是接下来三步。"));
    if (cfg.autoplay) { view.animate(true); syncPlay(); }
  });

  // ================================================================== floating
  // No contact (mid-jump, or in orbit): only gravity acts, and it acts at the CoM. So the CoM moves as a
  // point mass (still, or on a parabola) and the angular momentum about it stays zero, whatever the
  // joints do: each step the base twist solves A_b v_b = [mċ; 0] − A_j q̇ (A = centroidal momentum matrix).
  // cfg:
  //   arms     number  90      both arms raised forward, degrees (0–170)
  //   side     number  0       both arms raised sideways, degrees (0–90)
  //   legs     number  60      both legs raised forward at the hips, degrees (0–80)
  //   waist    number  0       waist twist, degrees (−50–50)
  //   play     string  none    start a motion: "arms" (arms circle in cones) | "twist" (the cat twist)
  //   gravity  bool    false   mid-jump instead of in orbit: the CoM follows a parabola; when it is back at take-off
  //                             height the jump starts again from the same take-off (no bounce: in flight only gravity acts)
  //   contact  bool    false   feet on the ground instead (the contrast: now the floor moves the CoM)
  // The default posture (arms 90°, legs 60°) is reached from the straight pose before the figure is shown,
  // so the first picture already shows the pelvis turned and the CoM where it was (the ghost = start).
  R3.scene("floating", (ui, cfg) => {
    const P = ui.P, rb = rob.build("humanoid"), m = rb.totalMass, nq = rb.nq, D2R = Math.PI / 180;
    const stand = R3.snapshot(rb), FLOAT = 0.45, VZ = 3.0, VX = 0.3, TF = (2 * VZ) / G, H = 0.004;
    const AM = dark() ? "#e06ad8" : "#b5179e"; // angular momentum
    const J = (n) => rb.ji(n), TRUNK = new Set(["pelvis", "waist", "torso", "head"]);
    const S = { arms: num(cfg.arms ?? 90, 90, 0, 170), side: num(cfg.side ?? 0, 0, 0, 90), legs: num(cfg.legs ?? 60, 60, 0, 80), waist: num(cfg.waist ?? 0, 0, -50, 50), play: ["arms", "twist"].includes(cfg.play) ? cfg.play : null, gravity: !!cfg.gravity, contact: !!cfg.contact };
    const X = { ph: 0, v: new Array(rb.nv).fill(0), trail: [], tf: 0, lin: [0, 0, 0], lin0: null, F: [0, 0, 0] };
    const ctrlJ = ["l_shoulder_pitch", "r_shoulder_pitch", "l_shoulder_roll", "r_shoulder_roll", "l_hip_pitch", "r_hip_pitch", "waist_yaw"].map(J);
    // joint targets from the sliders or from the motion being played (phase φ in cycles)
    function targets() {
      const q = Float64Array.from(stand.q), set = (n, x) => (q[J(n)] = x);
      let a = -S.arms * D2R, sd = S.side * D2R, lg = S.legs * D2R, wy = S.waist * D2R;
      const f = 2 * Math.PI * X.ph;
      if (S.play === "arms") { a = -1.3 + 0.9 * Math.sin(f); sd = 0.75 + 0.6 * Math.cos(f); }
      if (S.play === "twist") { wy = 0.9 * Math.cos(f); lg = 0.7 + 0.7 * Math.sin(f); }
      set("l_shoulder_pitch", a); set("r_shoulder_pitch", a); set("l_shoulder_roll", 0.12 + sd); set("r_shoulder_roll", -0.12 - sd);
      set("waist_yaw", wy);
      if (!S.contact) { set("l_hip_pitch", -0.4 - lg); set("r_hip_pitch", -0.4 - lg); }
      return q;
    }
    const period = () => (S.play === "arms" ? 1.2 : 2.0);
    // one integration step: joints move toward their targets (rate-limited), the base follows from momentum
    function stepOnce(h) {
      const qt = targets(), qd = new Array(nq).fill(0), mx = S.play ? 7 : 3;
      let moving = false;
      for (const j of ctrlJ) { qd[j] = clamp((qt[j] - rb.q[j]) / h, -mx, mx); if (Math.abs(qt[j] - rb.q[j]) > 1e-7) moving = true; }
      if (S.contact) {
        // feet bolted to the floor and legs still: the pelvis cannot move, the floor supplies whatever force is needed
        const A = rb.momentumMatrix(), v = [0, 0, 0, 0, 0, 0, ...qd], hm = rob.la.matvec(A, v);
        const l = hm.slice(0, 3);
        X.F = X.F.map((x, i) => x + ((l[i] - X.lin[i]) / h - x) * Math.min(1, h / 0.06)); // dℓ/dt, smoothed
        X.lin = l; X.v = v;
        rb.integrate(v, h);
        return moving;
      }
      let lin = [0, 0, 0], cT = X.c0;
      if (S.gravity) {
        X.tf += h;
        if (X.tf >= TF) { X.tf -= TF; X.jumps = (X.jumps || 0) + 1; const back = [-VX * TF, 0, 0]; rb.base.p = V.add(rb.base.p, back); rb.fk(); X.trail = [rb.com()]; } // landed: the same jump again, from the start
        cT = flight(X.tf); lin = [m * VX, 0, m * (VZ - G * X.tf)];
      }
      const { v } = zeroMomentumTwist(rb, qd, lin);
      rb.integrate(v, h);
      // Euler leaves an O(h²) CoM error per step (≈1e-7 m); remove it so the invariant holds exactly
      const e = V.sub(cT, rb.com()); rb.base.p = V.add(rb.base.p, e); rb.fk();
      X.v = v; X.lin = lin; X.qd = qd;
      return moving || S.gravity;
    }
    // the CoM in flight: a parabola from the take-off point (every jump starts there again)
    const flight = (tt) => [X.c0[0] + VX * tt, X.c0[1], X.c0[2] + VZ * tt - 0.5 * G * tt * tt];
    function begin(kind) { // reset the reference (ghost, CoM, trail) to the present pose
      X.ghost = R3.snapshot(rb); X.c0 = rb.com(); X.trail = [X.c0]; X.tf = 0; X.fl = 0; X.F = [0, 0, 0]; X.lin = [0, 0, 0];
      if (kind === "air") X.R0 = rb.base.R.map((r) => r.slice());
    }
    function setup(fromStraight) {
      if (fromStraight) R3.restore(rb, stand);
      if (S.contact) { rb.base.p = stand.p.slice(); rb.base.R = stand.R.map((r) => r.slice()); for (const n of ["l_hip_pitch", "r_hip_pitch", "l_knee", "r_knee", "l_ankle_pitch", "r_ankle_pitch", "l_hip_roll", "r_hip_roll", "l_hip_yaw", "r_hip_yaw", "l_ankle_roll", "r_ankle_roll"]) rb.q[J(n)] = stand.q[J(n)]; rb.fk(); begin("ground"); return; }
      if (fromStraight || !X.air) { const lift = S.gravity ? 0.03 : FLOAT; rb.base.p = [rb.base.p[0], rb.base.p[1], stand.p[2] + lift]; rb.fk(); }
      begin("air");
      if (fromStraight) { // reach the slider posture from the straight one, so the start picture shows the result
        X.ghost = R3.snapshot(rb); X.R0 = rb.base.R.map((r) => r.slice());
        const keep = S.gravity; S.gravity = false;
        for (let i = 0; i < 400 && stepOnce(H); i++);
        S.gravity = keep; X.trail = [rb.com()]; X.tf = 0; X.fl = 0;
      }
      X.air = true;
    }
    // angular momentum about the CoM of the limbs and of the trunk, from velocities relative to the CoM
    // (the common translation adds equal and opposite "orbital" parts that say nothing about the limbs)
    const partK = () => {
      const c = rb.com(), v = X.v, kl = [0, 0, 0], kt = [0, 0, 0], lk = [];
      let cd = [0, 0, 0];
      rb.links.forEach((l, i) => {
        if (!l.mass) return;
        const { Jv, Jw } = rb.pointJacWorld(i, l.cw), dt = (row) => row.reduce((s, x, j) => s + x * v[j], 0);
        const vi = Jv.map(dt);
        lk.push([l, vi, Jw.map(dt)]); cd = V.add(cd, V.scale(vi, l.mass / m));
      });
      for (const [l, vi, wi] of lk) {
        const Iw = M.mul(l.Rw, M.mul(l.inertia, M.T(l.Rw))), k = V.add(M.mulv(Iw, wi), V.scale(V.cross(V.sub(l.cw, c), V.sub(vi, cd)), l.mass)), tgt = TRUNK.has(l.name) ? kt : kl;
        for (let r = 0; r < 3; r++) tgt[r] += k[r];
      }
      return { kl, kt };
    };

    const view = ui.view({ height: 440, target: [0, 0, 1.1], dist: 4.4, yaw: 0.72, pitch: 0.2, draw(g, dt) {
      const hs = dt * (S.slow ? 0.25 : 1);
      if (hs > 0) {
        const n = Math.ceil(hs / H);
        let moving = false;
        for (let i = 0; i < n; i++) { if (S.play) X.ph += hs / n / period(); if (stepOnce(hs / n)) moving = true; }
        const c = rb.com(), lt = X.trail[X.trail.length - 1];
        if (V.dist(c, lt) > 0.004) { X.trail.push(c); if (X.trail.length > 400) X.trail.shift(); }
        if (!moving && !S.play) { X.v = new Array(rb.nv).fill(0); X.F = [0, 0, 0]; view.animate(false); syncBtns(); }
        else if (!S.contact && X.qd) X.v = zeroMomentumTwist(rb, X.qd, X.lin).v; // the twist of the pose now on screen
        const ct = view.cam.target, tz = S.contact ? 0.85 : S.gravity ? X.c0[2] + 0.2 : c[2];
        ct[0] += (c[0] - ct[0]) * Math.min(1, dt * 2); ct[1] += (c[1] - ct[1]) * Math.min(1, dt * 2); ct[2] += (tz - ct[2]) * Math.min(1, dt * 2);
      }
      const c = rb.com();
      // the start pose, carried along with the CoM (so in flight it shows the start orientation)
      if (!S.contact) { const off = V.sub(c, X.ghostCom); g.robot({ links: rb.links.map((l, i) => ({ ...l, Rw: X.ghostLinks[i].Rw, pw: V.add(X.ghostLinks[i].pw, off) })) }, { alpha: 0.2, color: () => P.ghost, shadow: false }); }
      g.robot(rb);
      if (S.contact) R3.drawSupport(g, rb.supportPolygon(["l_foot", "r_foot"]), true);
      // CoM: where it is, where it started, its path (and the parabola in flight)
      R3.drawCom(g, c, { label: false, plumb: !S.gravity });
      g.label(c, L("CoM", "质心"), { color: P.com, anchor: "right", dx: -12, dy: 0 });
      if (X.trail.length > 1) g.polyline(X.trail, P.com, { w: 2.5, onTop: true });
      if (S.gravity && !S.contact) { const pts = []; for (let i = 0; i <= 40; i++) pts.push(flight((TF * i) / 40)); dashed(g, pts, P.com, { w: 2, alpha: 0.8 }); }
      const { kl, kt } = partK(), cap = (k) => { const n = V.norm(k); return n > 1e-9 ? V.scale(k, 0.6 / (n + 0.8)) : [0, 0, 0]; }; // display length 0.6·|k|/(|k| + 0.8) m
      if (V.norm(kl) > 0.03) {
        g.arrow(c, V.add(c, cap(kl)), AM, { w: 5, onTop: true, label: L("$k_\\text{limbs}$", "$k_\\text{四肢}$") });
        if (!S.contact) g.arrow(c, V.add(c, cap(kt)), AM, { w: 5, onTop: true, alpha: 0.6, label: L("$k_\\text{trunk}$", "$k_\\text{躯干}$") });
      }
      if (S.contact && Math.hypot(X.F[0], X.F[1]) > 0.5) { const b = [c[0], c[1], 0.01]; g.arrow(b, V.add(b, [X.F[0] * 0.02, X.F[1] * 0.02, 0]), P.force, { w: 5, label: L("floor force", "地面力") }); }

      // words and numbers
      const A = rb.momentumMatrix(), hm = rob.la.matvec(A, X.v), lin = hm.slice(0, 3), kk = hm.slice(3);
      const rot = M.log(M.mul(rb.base.R, M.T(X.R0 || rb.base.R))), ang = V.norm(rot) / D2R, ax = ang > 0.05 ? V.unit(rot) : [0, 0, 1];
      const ai = [0, 1, 2].reduce((b, i) => (Math.abs(ax[i]) > Math.abs(ax[b]) ? i : b), 0), axName = [L("$x$ (roll)", "$x$（横滚）"), L("$y$ (pitch)", "$y$（俯仰）"), L("$z$ (yaw)", "$z$（偏航）")][ai];
      const drift = S.gravity && !S.contact ? V.dist(c, flight(X.tf)) : V.dist(c, X.c0);
      if (S.contact) {
        ui.status(L(`with contact: the floor pushes, so moving the arms moves the CoM (${f1(100 * drift)} cm so far) and the pelvis stays put`, `有接触：地面会推，所以摆臂会让质心移动（已移动 ${f1(100 * drift)} cm），骨盆不动`), "warn");
        ui.say([
          L(`momentum is not conserved: $\\ell = m\\dot c = ${v3(lin)}$ kg·m/s, $k = ${v3(kk)}$ kg·m²/s`, `动量不守恒：$\\ell = m\\dot c = ${v3(lin)}$ kg·m/s，$k = ${v3(kk)}$ kg·m²/s`),
          L(`horizontal floor force $F = d\\ell/dt = (${f1(X.F[0])}, ${f1(X.F[1])})$ N (on top of $m g_0 = ${f0(m * G)}$ N) · CoM moved $|c - c_0| = ${f3(drift)}$ m`, `地面水平力 $F = d\\ell/dt = (${f1(X.F[0])}, ${f1(X.F[1])})$ N（另加支撑重力 $m g_0 = ${f0(m * G)}$ N）· 质心移动 $|c - c_0| = ${f3(drift)}$ m`),
          L("the legs slider does nothing here: the feet are on the floor", "此时“抬腿”滑块不起作用：双脚踩在地上"),
        ]);
      } else {
        ui.status(S.gravity ? L(`in flight: the CoM follows the parabola whatever the limbs do; the pelvis has turned ${f0(ang)}°`, `腾空：不管四肢怎么动，质心都沿抛物线走；骨盆已转了 ${f0(ang)}°`) : view.animating ? L("total momentum stays zero: the limbs turn one way, the trunk the other; the CoM stays put", "总动量始终为零：四肢往一边转，躯干往另一边转；质心纹丝不动") : L(`no contact: moving only the joints turned the pelvis ${f0(ang)}° — the CoM did not move`, `无接触：只动关节，骨盆就转了 ${f0(ang)}°——质心没有动`), "ok");
        ui.say([
          L(`total momentum: $\\ell = m\\dot c = ${v3(lin)}$ kg·m/s${S.gravity ? " (only gravity changes it in flight: $\\dot\\ell = m g$, $g = (0, 0, -g_0)$; each jump restarts from the same take-off)" : ""}, $k = ${v3(kk, 3)}$ kg·m²/s`, `总动量：$\\ell = m\\dot c = ${v3(lin)}$ kg·m/s${S.gravity ? "（腾空时只有重力改变它：$\\dot\\ell = m g$，$g = (0, 0, -g_0)$；每次落回起跳高度就从同一个起跳点重新跳）" : ""}，$k = ${v3(kk, 3)}$ kg·m²/s`),
          L(`$k_\\text{limbs} = ${v3(kl)}$, $k_\\text{trunk} = ${v3(kt)}$ kg·m²/s — equal and opposite`, `$k_\\text{四肢} = ${v3(kl)}$，$k_\\text{躯干} = ${v3(kt)}$ kg·m²/s——大小相等、方向相反`),
          L(`pelvis rotation produced: ${f1(ang)}° about ${axName} · CoM ${S.gravity ? "off its parabola" : "drift"} $= ${f3(drift)}$ m`, `骨盆转过 ${f1(ang)}°，绕 ${axName} · 质心${S.gravity ? "偏离抛物线" : "漂移"} $= ${f3(drift)}$ m`),
        ]);
      }
    } });
    const snapLinks = () => { X.ghostLinks = rb.links.map((l) => ({ Rw: l.Rw.map((r) => r.slice()), pw: l.pw.slice() })); X.ghostCom = rb.com(); };
    const refreshGhost = () => { const now = R3.snapshot(rb); R3.restore(rb, X.ghost); snapLinks(); R3.restore(rb, now); };
    const go = () => { view.animate(true); syncBtns(); };

    const sl = {};
    sl.arms = ui.slider(L("arms forward (°)", "手臂前举（°）"), { min: 0, max: 170, step: 5, value: S.arms }, (v) => { S.arms = v; S.play = null; go(); });
    sl.side = ui.slider(L("arms sideways (°)", "手臂侧举（°）"), { min: 0, max: 90, step: 5, value: S.side }, (v) => { S.side = v; S.play = null; go(); });
    sl.legs = ui.slider(L("legs forward (°)", "抬腿（°）"), { min: 0, max: 80, step: 5, value: S.legs }, (v) => { S.legs = v; S.play = null; go(); });
    sl.waist = ui.slider(L("waist twist (°)", "扭腰（°）"), { min: -50, max: 50, step: 5, value: S.waist }, (v) => { S.waist = v; S.play = null; go(); });
    const mb = {};
    const playMotion = (k) => () => { S.play = S.play === k ? null : k; X.ph = 0; go(); };
    mb.arms = ui.btn(L("wave arms", "画圈摆臂"), playMotion("arms"), "r3-toggle");
    mb.twist = ui.btn(L("cat twist", "猫式扭转"), playMotion("twist"), "r3-toggle");
    function syncBtns() { for (const k of ["arms", "twist"]) mb[k].classList.toggle("on", S.play === k); sl.legs.querySelector("input").disabled = S.contact; sl.legs.style.opacity = S.contact ? 0.45 : ""; }
    ui.btn(Viz.util.T().reset, () => {
      S.play = null; S.arms = 0; S.side = 0; S.legs = 0; S.waist = 0; for (const k in sl) sl[k].set(0);
      R3.restore(rb, stand); X.air = false; setup(false); refreshGhost(); view.animate(false); syncBtns(); view.redraw();
    });
    ui.toggle(L("gravity (mid-jump)", "重力（腾空中）"), S.gravity, (on) => { S.gravity = on; if (!S.contact) { X.air = false; setup(false); refreshGhost(); } go(); });
    ui.toggle(L("with contact", "脚着地"), S.contact, (on) => { S.contact = on; X.air = false; setup(false); refreshGhost(); syncBtns(); go(); });
    ui.toggle(L("¼× slow motion", "¼× 慢放"), false, (on) => { S.slow = on; });
    ui.legend(["com", [AM, L("angular momentum $k$ (about the CoM)", "角动量 $k$（对质心）")], [P.ghost, L("start pose", "起始姿态")], ...(S.contact ? ["force", "support"] : [])]);
    ui.caption(L(
      "Do: move the sliders, or press “wave arms” (the arms circle in cones) or “cat twist” (twist at the waist with the legs out, untwist with them in); then switch on gravity, and finally “with contact”. Notice: with no contact the orange CoM never moves (or stays on its parabola) — joint torques are internal forces. The pink angular-momentum arrows of the limbs and of the trunk are always equal and opposite, so the trunk turns against the limbs; after each cat-twist cycle the body has the same shape but has turned (the read-out gives the angle and the axis it turned about): rotation with zero angular momentum. With contact the floor pushes and the CoM does move.",
      "操作：拖动滑块，或按“画圈摆臂”（双臂画圆锥）或“猫式扭转”（腿伸出时扭腰，腿收回时回正）；再打开重力，最后打开“脚着地”。观察：没有接触时，橙色质心一动不动（或者老老实实沿抛物线走）——关节力矩是内力。四肢和躯干的粉色角动量箭头始终大小相等、方向相反，所以躯干朝四肢的反方向转；每做完一次猫式扭转，身体形状复原，朝向却变了（转过的角度和转轴见下方读数）：角动量为零也能转身。脚着地后，地面会推，质心就真的动了。"));
    setup(true); refreshGhost(); syncBtns();
    view.setView({ target: S.contact ? [0, 0, 0.85] : rb.com() }, true);
    if (S.play || S.gravity || S.contact) go(); // with contact: the arms rise to the slider posture at once, so the floor force and the CoM shift show
  });
})();
