"use strict";
// rob3d.js — articulated-robot kinematics and statics for the robot3d widget (PLAN R19).
// No rendering here: models (links, joints, masses, shapes), forward kinematics, Jacobians,
// centre of mass, centroidal momentum, mass matrix, gravity/contact torques, strict-priority
// inverse kinematics, and a small dense QP for contact-force distribution.
//
// Conventions: metres, kilograms, radians, newtons. World frame: z up, x forward, y left.
// 3-vectors are plain arrays [x, y, z]; rotation matrices are 3×3 arrays of rows and map
// link-frame vectors to world-frame vectors. Generalised velocity (nv = 6 + nq):
//     v = [ base linear velocity (world, of the base-link origin),
//           base angular velocity (world),
//           joint rates q̇ ]
// A link frame sits at the joint that connects the link to its parent:
//     R_link = R_parent · R0 · Rot(axis, q)     p_link = p_parent + R_parent · origin (+ axis·q, prismatic)
// so `axis` is expressed in the parent frame after the fixed rotation R0 (R0 = I for most joints).
// Call fk() after changing q or base by hand; setPose(), integrate() and ik() call it themselves.
// Loads in a browser (after viz.js, which creates window.Viz) and in node (tools/test-rob3d.mjs).
(() => {
  const G0 = 9.81;

  // ------------------------------------------------------------------ 3-vectors
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const n = norm(a); return n > 1e-12 ? scale(a, 1 / n) : [0, 0, 0]; };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const dist = (a, b) => norm(sub(a, b));
  const V = { add, sub, scale, dot, cross, norm, unit, lerp, dist };

  // ------------------------------------------------------------------ 3×3 rotations
  const I3 = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const mul = (A, B) => {
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    return C;
  };
  const mulv = (A, v) => [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]];
  const tr = (A) => [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]];
  const Rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
  const Ry = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
  const Rz = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
  const skew = (v) => [[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]];
  // Rodrigues: rotation by `angle` about the unit vector `axis`.
  function axisAngle(axis, angle) {
    const [x, y, z] = axis, c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    return [
      [c + x * x * t, x * y * t - z * s, x * z * t + y * s],
      [y * x * t + z * s, c + y * y * t, y * z * t - x * s],
      [z * x * t - y * s, z * y * t + x * s, c + z * z * t],
    ];
  }
  // Roll about x, then pitch about y, then yaw about z (fixed axes): R = Rz(y) Ry(p) Rx(r).
  const rpy = (r, p, y) => mul(Rz(y), mul(Ry(p), Rx(r)));
  // Exponential map: rotation vector φ (axis × angle) → R.
  function exp(phi) {
    const th = norm(phi);
    if (th < 1e-12) { const K = skew(phi); return [[1, K[0][1], K[0][2]], [K[1][0], 1, K[1][2]], [K[2][0], K[2][1], 1]]; }
    return axisAngle(scale(phi, 1 / th), th);
  }
  // Logarithm: R → rotation vector with angle in [0, π].
  function log(R) {
    const w = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]];
    const c = Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2));
    const s = norm(w) / 2;
    const th = Math.atan2(s, c);
    if (th < 1e-9) return scale(w, 0.5);
    if (Math.PI - th < 1e-5) {
      // near π the antisymmetric part vanishes: take the axis from the symmetric part
      const d = [R[0][0], R[1][1], R[2][2]];
      const i = d[0] >= d[1] && d[0] >= d[2] ? 0 : d[1] >= d[2] ? 1 : 2;
      const a = [0, 0, 0];
      a[i] = Math.sqrt(Math.max(0, (d[i] + 1) / 2));
      for (let j = 0; j < 3; j++) if (j !== i) a[j] = (R[i][j] + R[j][i]) / (4 * a[i]);
      if (dot(a, w) < 0) for (let j = 0; j < 3; j++) a[j] = -a[j];
      return scale(unit(a), th);
    }
    return scale(w, th / (2 * s));
  }
  const M = { I: I3, mul, mulv, T: tr, Rx, Ry, Rz, axisAngle, rpy, log, exp, skew };

  // ------------------------------------------------------------------ dense linear algebra
  const zeros = (m, n) => Array.from({ length: m }, () => new Array(n).fill(0));
  const eye = (n) => { const A = zeros(n, n); for (let i = 0; i < n; i++) A[i][i] = 1; return A; };
  function matmul(A, B) {
    const m = A.length, n = B[0].length, k = B.length, C = zeros(m, n);
    for (let i = 0; i < m; i++) { const Ai = A[i], Ci = C[i]; for (let l = 0; l < k; l++) { const a = Ai[l]; if (a === 0) continue; const Bl = B[l]; for (let j = 0; j < n; j++) Ci[j] += a * Bl[j]; } }
    return C;
  }
  const matT = (A) => { const m = A.length, n = m ? A[0].length : 0, B = zeros(n, m); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) B[j][i] = A[i][j]; return B; };
  const matvec = (A, x) => A.map((r) => { let s = 0; for (let j = 0; j < r.length; j++) s += r[j] * x[j]; return s; });
  // A Aᵀ (m×m) for an m×n matrix.
  function gram(A) {
    const m = A.length, S = zeros(m, m);
    for (let i = 0; i < m; i++) for (let j = i; j < m; j++) { let s = 0; const a = A[i], b = A[j]; for (let k = 0; k < a.length; k++) s += a[k] * b[k]; S[i][j] = S[j][i] = s; }
    return S;
  }
  // Cholesky factor (lower) of a symmetric positive definite matrix, or null.
  function chol(S) {
    const n = S.length, L = zeros(n, n);
    for (let j = 0; j < n; j++) {
      let d = S[j][j];
      for (let k = 0; k < j; k++) d -= L[j][k] * L[j][k];
      if (!(d > 0)) return null;
      const ljj = (L[j][j] = Math.sqrt(d));
      for (let i = j + 1; i < n; i++) { let s = S[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = s / ljj; }
    }
    return L;
  }
  function cholFactor(S) {
    let L = chol(S);
    if (L) return L;
    // not numerically positive definite: add a growing multiple of the identity
    const n = S.length;
    let t = 0;
    for (let i = 0; i < n; i++) t += Math.abs(S[i][i]);
    let eps = 1e-13 * (t / Math.max(1, n) + 1e-30);
    for (let it = 0; it < 12 && !L; it++, eps *= 100) { const S2 = S.map((r, i) => { const c = r.slice(); c[i] += eps; return c; }); L = chol(S2); }
    return L;
  }
  function cholSolveVec(L, b) {
    const n = L.length, y = new Array(n);
    for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
    for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * y[k]; y[i] = s / L[i][i]; }
    return y;
  }
  // Solve S X = B for a matrix B (given as rows): returns X as rows.
  function cholSolveMat(L, B) {
    const n = L.length, k = B[0].length, X = zeros(n, k), col = new Array(n);
    for (let j = 0; j < k; j++) { for (let i = 0; i < n; i++) col[i] = B[i][j]; const x = cholSolveVec(L, col); for (let i = 0; i < n; i++) X[i][j] = x[i]; }
    return X;
  }
  // LU with partial pivoting; returns a solver x = solve(b), or null when singular.
  function luFactor(A) {
    const n = A.length, a = A.map((r) => r.slice()), piv = Array.from({ length: n }, (_, i) => i);
    for (let k = 0; k < n; k++) {
      let p = k, mx = Math.abs(a[k][k]);
      for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > mx) { mx = Math.abs(a[i][k]); p = i; }
      if (!(mx > 1e-300)) return null;
      if (p !== k) { [a[p], a[k]] = [a[k], a[p]]; [piv[p], piv[k]] = [piv[k], piv[p]]; }
      for (let i = k + 1; i < n; i++) { const f = (a[i][k] /= a[k][k]); if (f !== 0) for (let j = k + 1; j < n; j++) a[i][j] -= f * a[k][j]; }
    }
    return (b) => {
      const x = piv.map((i) => b[i]);
      for (let i = 0; i < n; i++) for (let k = 0; k < i; k++) x[i] -= a[i][k] * x[k];
      for (let i = n - 1; i >= 0; i--) { for (let k = i + 1; k < n; k++) x[i] -= a[i][k] * x[k]; x[i] /= a[i][i]; }
      return x;
    };
  }
  // Damped least squares: x = Aᵀ (A Aᵀ + λ² I)⁻¹ b  (the minimum-norm solution when λ = 0).
  function solveLS(A, b, damping = 0) {
    const m = A.length;
    if (!m) return [];
    const S = gram(A);
    for (let i = 0; i < m; i++) S[i][i] += damping * damping;
    const y = cholSolveVec(cholFactor(S), b);
    return matvec(matT(A), y);
  }
  // Null-space projector N = I − Jᵀ (J Jᵀ + λ² I)⁻¹ J  (J N ≈ 0, N N = N).
  function nullProj(J, damping = 1e-6) {
    const m = J.length, n = m ? J[0].length : 0;
    if (!m) return eye(n);
    const S = gram(J);
    for (let i = 0; i < m; i++) S[i][i] += damping * damping;
    const X = cholSolveMat(cholFactor(S), J); // m×n
    const N = eye(n), Jt = matT(J);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < m; k++) s += Jt[i][k] * X[k][j]; N[i][j] -= s; }
    return N;
  }

  // ------------------------------------------------------------------ small dense QP
  // min ½ xᵀH x + gᵀx   s.t.  Aeq x = beq,  Ain x ≤ bin      (H symmetric positive semidefinite)
  // ADMM (the OSQP iteration) finds the solution and its active set; an active-set step then
  // solves the KKT system of that set exactly, so the returned x is exact when status is "optimal".
  // Returns { x, y (multipliers: equalities first, then inequalities ≥ 0), active (indices into
  // Ain), status: "optimal" | "approx" | "infeasible", iters, primalRes, dualRes }.
  function qp(H, g, Aeq, beq, Ain, bin, opts = {}) {
    const n = g.length;
    Aeq = Aeq || []; beq = beq || []; Ain = Ain || []; bin = bin || [];
    const me = Aeq.length, mi = Ain.length, m = me + mi;
    let trH = 0;
    for (let i = 0; i < n; i++) trH += H[i][i];
    const hs = Math.max(trH / Math.max(1, n), 1e-9);
    const C = [...Aeq, ...Ain];
    const inf = (v) => v.reduce((a, x) => Math.max(a, Math.abs(x)), 0);

    // exact solve on a working set W of inequality rows; returns { x, lam } or null
    const kkt = (W) => {
      const rows = [...Aeq, ...W.map((i) => Ain[i])], rhs = [...beq, ...W.map((i) => bin[i])], k = rows.length, N = n + k;
      const build = (delta) => {
        const K = zeros(N, N);
        for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) K[i][j] = H[i][j]; K[i][i] += delta; }
        for (let r = 0; r < k; r++) { for (let j = 0; j < n; j++) K[n + r][j] = K[j][n + r] = rows[r][j]; K[n + r][n + r] = -delta; }
        return K;
      };
      const K0 = build(0), solve = luFactor(build(1e-9 * hs));
      if (!solve) return null;
      const b = [...g.map((x) => -x), ...rhs];
      let s = solve(b);
      for (let it = 0; it < 3; it++) { const r = matvec(K0, s).map((x, i) => b[i] - x); const d = solve(r); s = s.map((x, i) => x + d[i]); }
      if (s.some((x) => !Number.isFinite(x))) return null;
      return { x: s.slice(0, n), lam: s.slice(n) };
    };
    if (m === 0) { const r = kkt([]); return { x: r ? r.x : new Array(n).fill(0), y: [], active: [], status: r ? "optimal" : "infeasible", iters: 0, primalRes: 0, dualRes: 0 }; }

    // ---- ADMM
    const maxIter = opts.maxIter ?? 4000, eps = opts.eps ?? 1e-7, alpha = 1.6, sigma = 1e-6 * hs;
    let rho = opts.rho ?? hs;
    const Ct = matT(C);
    let rhoV, L;
    const factor = () => {
      rhoV = C.map((_, i) => (i < me ? 1e3 * rho : rho));
      const K = zeros(n, n);
      for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) K[i][j] = H[i][j]; K[i][i] += sigma; }
      for (let r = 0; r < m; r++) { const c = C[r], w = rhoV[r]; for (let i = 0; i < n; i++) { const ci = c[i] * w; if (ci !== 0) for (let j = 0; j < n; j++) K[i][j] += ci * c[j]; } }
      L = cholFactor(K);
    };
    factor();
    let x = new Array(n).fill(0), z = new Array(m).fill(0), y = new Array(m).fill(0);
    let rp = Infinity, rd = Infinity, iters = 0, sp = 1, sd = 1;
    for (iters = 1; iters <= maxIter && L; iters++) {
      const t = z.map((zi, i) => rhoV[i] * zi - y[i]);
      const rhs = matvec(Ct, t).map((v, i) => v + sigma * x[i] - g[i]);
      const xt = cholSolveVec(L, rhs), zt = matvec(C, xt);
      x = x.map((xi, i) => alpha * xt[i] + (1 - alpha) * xi);
      const zr = z.map((zi, i) => alpha * zt[i] + (1 - alpha) * zi);
      const zn = zr.map((v, i) => { const w = v + y[i] / rhoV[i]; return i < me ? beq[i] : Math.min(w, bin[i - me]); });
      y = y.map((yi, i) => yi + rhoV[i] * (zr[i] - zn[i]));
      z = zn;
      if (iters % 10 === 0) {
        const Cx = matvec(C, x), Hx = matvec(H, x), Cty = matvec(Ct, y);
        rp = inf(Cx.map((v, i) => v - z[i]));
        rd = inf(Hx.map((v, i) => v + g[i] + Cty[i]));
        sp = 1 + Math.max(inf(Cx), inf(z));
        sd = 1 + Math.max(inf(Hx), inf(Cty), inf(g));
        if (rp <= eps * sp && rd <= eps * sd) break;
        if (iters % 100 === 0) {
          const ratio = Math.sqrt((rp / sp + 1e-300) / (rd / sd + 1e-300));
          if (ratio > 5 || ratio < 0.2) { rho = Math.min(1e8 * hs, Math.max(1e-8 * hs, rho * Math.min(10, Math.max(0.1, ratio)))); factor(); }
        }
      }
    }
    const feasible = rp <= 1e-4 * sp;

    // ---- polish: exact KKT solve on the active set, adjusted until primal and dual feasible
    const ymax = 1 + inf(y);
    let W = [];
    for (let i = 0; i < mi; i++) if (y[me + i] > 1e-6 * ymax) W.push(i);
    if (feasible) {
      for (let it = 0; it < 40; it++) {
        const r = kkt(W);
        if (!r) break;
        let worst = -1, viol = 0;
        for (let i = 0; i < mi; i++) { if (W.includes(i)) continue; let s = -bin[i]; const a = Ain[i]; for (let j = 0; j < n; j++) s += a[j] * r.x[j]; const tol = 1e-8 * (1 + Math.abs(bin[i])); if (s > tol && s > viol) { viol = s; worst = i; } }
        let neg = -1, lmin = -1e-8 * ymax;
        for (let k = 0; k < W.length; k++) if (r.lam[me + k] < lmin) { lmin = r.lam[me + k]; neg = k; }
        if (worst < 0 && neg < 0) {
          const yy = new Array(m).fill(0);
          for (let i = 0; i < me; i++) yy[i] = r.lam[i];
          W.forEach((i, k) => (yy[me + i] = r.lam[me + k]));
          return { x: r.x, y: yy, active: W.slice().sort((a, b) => a - b), status: "optimal", iters, primalRes: 0, dualRes: 0 };
        }
        if (worst >= 0) W.push(worst); else W.splice(neg, 1);
      }
    }
    const act = [];
    for (let i = 0; i < mi; i++) if (y[me + i] > 1e-6 * ymax) act.push(i);
    return { x, y, active: act, status: feasible ? "approx" : "infeasible", iters, primalRes: rp, dualRes: rd };
  }

  // ------------------------------------------------------------------ planar geometry
  // Convex hull (Andrew's monotone chain), counter-clockwise, no repeated last point.
  function hull2d(points) {
    const P = points.map((p) => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-12);
    if (P.length < 3) return P;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-14) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 1e-14) up.pop(); up.push(p); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }
  const segDist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  // Point in polygon (ray casting; any simple polygon). A point or a segment has no inside.
  function inPoly(pt, poly) {
    if (poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  // Signed margin: + distance to the nearest edge when inside, − distance to the polygon when outside.
  function distToPoly(pt, poly) {
    if (!poly.length) return -Infinity;
    if (poly.length === 1) return -Math.hypot(pt[0] - poly[0][0], pt[1] - poly[0][1]);
    let d = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist(pt, poly[j], poly[i]));
    return inPoly(pt, poly) ? d : -d;
  }

  // ------------------------------------------------------------------ shapes → mass properties
  // Volume, centroid and inertia per unit mass (about the centroid, link frame) of one shape.
  function geomProps(g) {
    if (g.kind === "sphere") { const r2 = g.r * g.r; return { vol: (4 / 3) * Math.PI * r2 * g.r, c: g.center || [0, 0, 0], I: [[0.4 * r2, 0, 0], [0, 0.4 * r2, 0], [0, 0, 0.4 * r2]] }; }
    if (g.kind === "box") {
      const [sx, sy, sz] = g.size;
      let I = [[(sy * sy + sz * sz) / 12, 0, 0], [0, (sx * sx + sz * sz) / 12, 0], [0, 0, (sx * sx + sy * sy) / 12]];
      if (g.R) I = mul(g.R, mul(I, tr(g.R)));
      return { vol: sx * sy * sz, c: g.center || [0, 0, 0], I };
    }
    // capsule (cylinder + two half spheres) or plain cylinder between a and b
    const d = sub(g.b, g.a), Lc = norm(d), u = Lc > 1e-12 ? scale(d, 1 / Lc) : [0, 0, 1], r = g.r, r2 = r * r;
    const Vc = Math.PI * r2 * Lc, Vs = g.kind === "capsule" ? (4 / 3) * Math.PI * r2 * r : 0, Vt = Vc + Vs;
    const mc = Vc / Vt, ms = Vs / Vt;
    const Ia = mc * r2 / 2 + ms * 0.4 * r2;
    const It = mc * (Lc * Lc / 12 + r2 / 4) + ms * (0.4 * r2 + Lc * Lc / 4 + (3 / 8) * r * Lc);
    const I = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) I[i][j] = (i === j ? It : 0) + (Ia - It) * u[i] * u[j];
    return { vol: Vt, c: lerp(g.a, g.b, 0.5), I };
  }
  // A link's mass is spread over its shapes in proportion to their volume (uniform density).
  function massProps(mass, geoms) {
    const ps = geoms.filter((g) => !g.massless).map(geomProps);
    const vol = ps.reduce((s, p) => s + p.vol, 0);
    if (!ps.length || !(vol > 0)) return { com: [0, 0, 0], inertia: [[1e-6, 0, 0], [0, 1e-6, 0], [0, 0, 1e-6]] };
    let com = [0, 0, 0];
    for (const p of ps) com = add(com, scale(p.c, p.vol / vol));
    const I = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of ps) {
      const mg = (mass * p.vol) / vol, d = sub(p.c, com), d2 = dot(d, d);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) I[i][j] += mg * (p.I[i][j] + (i === j ? d2 : 0) - d[i] * d[j]); // parallel-axis theorem
    }
    return { com, inertia: I };
  }

  // ------------------------------------------------------------------ robot
  class Robot {
    constructor(spec, opts) {
      this.name = spec.name;
      this.opts = opts || {};
      this.fixedBase = !!spec.fixedBase;
      // which of the six base velocity components ik() may use: [vx, vy, vz, wx, wy, wz]
      this.baseMask = spec.baseMask || (this.fixedBase ? [0, 0, 0, 0, 0, 0] : [1, 1, 1, 1, 1, 1]);
      const index = {};
      this.links = [];
      this.jointNames = [];
      this.jointLink = []; // q index → link index
      for (const d of spec.links) {
        const parent = d.parent == null ? -1 : index[d.parent];
        if (parent === undefined) throw new Error(`rob3d: unknown parent "${d.parent}" of link "${d.name}"`);
        const j = { type: d.joint.type, name: d.joint.name || null, axis: d.joint.axis || null, origin: d.joint.origin || [0, 0, 0], R0: d.joint.R0 || null, lo: d.joint.lo ?? 0, hi: d.joint.hi ?? 0, qi: -1, label: d.joint.label || { en: d.name, zh: d.name } };
        if (j.type === "R" || j.type === "P") { j.qi = this.jointNames.length; this.jointNames.push(j.name); this.jointLink.push(this.links.length); }
        const mp = massProps(d.mass, d.geoms || []);
        index[d.name] = this.links.length;
        this.links.push({ name: d.name, parent, joint: j, mass: d.mass, com: mp.com, inertia: mp.inertia, geoms: d.geoms || [], Rw: I3(), pw: [0, 0, 0], cw: [0, 0, 0], aw: null, chain: null });
      }
      // chain[i] = links from link i up to the base whose joint moves (used by every Jacobian)
      for (let i = 0; i < this.links.length; i++) { const c = []; for (let k = i; k > 0; k = this.links[k].parent) if (this.links[k].joint.qi >= 0) c.push(k); this.links[i].chain = c; }
      this.linkIndex = index;
      this.totalMass = this.links.reduce((s, l) => s + l.mass, 0);
      this.nq = this.jointNames.length;
      this.nv = 6 + this.nq;
      this.q = new Float64Array(this.nq);
      this.qHome = new Float64Array(this.nq);
      for (const [k, v] of Object.entries(spec.home || {})) this.qHome[this.ji(k)] = v;
      this.q.set(this.qHome);
      this.base = { p: [0, 0, 0], R: I3() };
      this.frames = {};
      for (const [k, f] of Object.entries(spec.frames || {})) this.frames[k] = { link: index[f.link], p: f.p || [0, 0, 0], R: f.R || null, corners: f.corners || [f.p || [0, 0, 0]] };
      this.fk();
      if (spec.place) spec.place(this);
      this.baseHome = { p: this.base.p.slice(), R: this.base.R.map((r) => r.slice()) };
      this.fk();
    }
    ji(name) { const i = this.jointNames.indexOf(name); if (i < 0) throw new Error(`rob3d: no joint "${name}" in ${this.name}`); return i; }
    li(link) { if (typeof link === "number") return link; const i = this.linkIndex[link]; if (i === undefined) throw new Error(`rob3d: no link "${link}" in ${this.name}`); return i; }
    // Forward kinematics: world pose of every link frame (Rw, pw), joint axis (aw) and link CoM (cw).
    fk() {
      const L = this.links, q = this.q, b = L[0];
      b.Rw = this.base.R; b.pw = this.base.p.slice(); b.cw = add(b.pw, mulv(b.Rw, b.com));
      for (let i = 1; i < L.length; i++) {
        const l = L[i], par = L[l.parent], j = l.joint;
        const Rj = j.R0 ? mul(par.Rw, j.R0) : par.Rw;
        let p = add(par.pw, mulv(par.Rw, j.origin));
        if (j.type === "R") { l.aw = mulv(Rj, j.axis); l.Rw = mul(Rj, axisAngle(j.axis, q[j.qi])); }
        else if (j.type === "P") { l.aw = mulv(Rj, j.axis); p = add(p, scale(l.aw, q[j.qi])); l.Rw = Rj; }
        else l.Rw = Rj;
        l.pw = p; l.cw = add(p, mulv(l.Rw, l.com));
      }
      this._com = null;
      return this;
    }
    framePose(name) { const f = this.frames[name], l = this.links[f.link]; return { p: add(l.pw, mulv(l.Rw, f.p)), R: f.R ? mul(l.Rw, f.R) : l.Rw.map((r) => r.slice()) }; }
    frameCorners(name) { const f = this.frames[name], l = this.links[f.link]; return f.corners.map((c) => add(l.pw, mulv(l.Rw, c))); }
    com() {
      if (!this._com) { let c = [0, 0, 0]; for (const l of this.links) c = add(c, scale(l.cw, l.mass)); this._com = scale(c, 1 / this.totalMass); }
      return this._com.slice();
    }
    // Jacobian of a world point fixed to link i: ṗ = Jv v, ω = Jw v.
    _jac(i, pw) {
      const nv = this.nv, Jv = zeros(3, nv), Jw = zeros(3, nv), L = this.links;
      if (!this.fixedBase) {
        const r = sub(pw, this.base.p);
        Jv[0][0] = Jv[1][1] = Jv[2][2] = 1;
        // column k of the angular block is e_k × r
        Jv[1][3] = -r[2]; Jv[2][3] = r[1]; Jv[0][4] = r[2]; Jv[2][4] = -r[0]; Jv[0][5] = -r[1]; Jv[1][5] = r[0];
        Jw[0][3] = Jw[1][4] = Jw[2][5] = 1;
      }
      for (const k of L[i].chain) {
        const l = L[k], c = 6 + l.joint.qi, a = l.aw;
        if (l.joint.type === "R") {
          const cr = cross(a, sub(pw, l.pw)); // a revolute joint moves the point by axis × lever arm
          Jv[0][c] = cr[0]; Jv[1][c] = cr[1]; Jv[2][c] = cr[2];
          Jw[0][c] = a[0]; Jw[1][c] = a[1]; Jw[2][c] = a[2];
        } else { Jv[0][c] = a[0]; Jv[1][c] = a[1]; Jv[2][c] = a[2]; } // prismatic: pure translation
      }
      return { Jv, Jw };
    }
    pointJac(link, pLocal) { const i = this.li(link), l = this.links[i]; return this._jac(i, add(l.pw, mulv(l.Rw, pLocal || [0, 0, 0]))); }
    pointJacWorld(link, pWorld) { return this._jac(this.li(link), pWorld); }
    frameJac(name) { const f = this.frames[name]; return this.pointJac(f.link, f.p); }
    comJac() {
      const J = zeros(3, this.nv), Mt = this.totalMass;
      this.links.forEach((l, i) => { if (!l.mass) return; const { Jv } = this._jac(i, l.cw), w = l.mass / Mt; for (let r = 0; r < 3; r++) for (let c = 0; c < this.nv; c++) J[r][c] += w * Jv[r][c]; });
      return J;
    }
    // World position and direction of joint qi's axis (revolute: the rotation axis through p; prismatic: the sliding direction).
    jointAxisWorld(qi) { const l = this.links[this.jointLink[qi]]; return { p: l.pw.slice(), axis: l.aw.slice(), type: l.joint.type, link: this.jointLink[qi] }; }
    _contact(c) {
      if (c.frame) { const f = this.frames[c.frame], l = this.links[f.link]; return { i: f.link, pw: c.pw || add(l.pw, mulv(l.Rw, c.p || f.p)) }; }
      const i = this.li(c.link), l = this.links[i];
      return { i, pw: c.pw || add(l.pw, mulv(l.Rw, c.p || [0, 0, 0])) };
    }
    // Joint torques the motors must supply to hold the pose against gravity and the given contact forces:
    //   τ = −Σ_links J_com,iᵀ (m_i g) − Σ_contacts J_cᵀ f_c      (joint rows; g = [0, 0, −9.81])
    // A contact is { frame } or { link, p (link frame) } or { link | frame, pw (world point) }, with
    // f = force ON the robot (world) and optionally m = moment on the robot (world).
    // With no contacts this is +∂U/∂q, U = Σ m_i g z_i.
    gravityTorques(contacts) {
      const tau = new Float64Array(this.nq), L = this.links;
      const push = (i, pw, f, mom) => {
        for (const k of L[i].chain) {
          const l = L[k];
          if (l.joint.type === "R") tau[l.joint.qi] -= dot(l.aw, cross(sub(pw, l.pw), f)) + (mom ? dot(l.aw, mom) : 0);
          else tau[l.joint.qi] -= dot(l.aw, f);
        }
      };
      L.forEach((l, i) => { if (l.mass) push(i, l.cw, [0, 0, -l.mass * G0], null); });
      for (const c of contacts || []) { const { i, pw } = this._contact(c); push(i, pw, c.f, c.m); }
      return tau;
    }
    // Net force and net moment (about the base-link origin) of gravity plus the contact forces: the six
    // floating-base rows of Σ Jᵀf. Zero ⇔ the contact forces can hold the robot still.
    baseWrenchResidual(contacts) {
      let F = [0, 0, -this.totalMass * G0], N = cross(sub(this.com(), this.base.p), F);
      for (const c of contacts || []) { const { pw } = this._contact(c); F = add(F, c.f); N = add(N, cross(sub(pw, this.base.p), c.f)); if (c.m) N = add(N, c.m); }
      return [...F, ...N];
    }
    // Centroidal momentum matrix A(q), 6×nv: [linear momentum; angular momentum about the CoM] = A v.
    momentumMatrix() {
      const nv = this.nv, A = zeros(6, nv), c = this.com();
      this.links.forEach((l, i) => {
        if (!l.mass) return;
        const { Jv, Jw } = this._jac(i, l.cw), Iw = mul(l.Rw, mul(l.inertia, tr(l.Rw))), d = sub(l.cw, c), m = l.mass;
        for (let k = 0; k < nv; k++) {
          const v = [Jv[0][k], Jv[1][k], Jv[2][k]];
          if (v[0] === 0 && v[1] === 0 && v[2] === 0 && Jw[0][k] === 0 && Jw[1][k] === 0 && Jw[2][k] === 0) continue;
          const w = mulv(Iw, [Jw[0][k], Jw[1][k], Jw[2][k]]), o = cross(d, v);
          A[0][k] += m * v[0]; A[1][k] += m * v[1]; A[2][k] += m * v[2];
          A[3][k] += w[0] + m * o[0]; A[4][k] += w[1] + m * o[1]; A[5][k] += w[2] + m * o[2];
        }
      });
      return A;
    }
    centroidalMomentum(v) { const h = matvec(this.momentumMatrix(), v); return { l: h.slice(0, 3), k: h.slice(3) }; }
    // Joint-space mass matrix M(q) = Σ m JvᵀJv + Jwᵀ I Jw, nv×nv (kinetic energy = ½ vᵀ M v).
    // For a fixed base the six base rows and columns are zero.
    massMatrix() {
      const nv = this.nv, Mm = zeros(nv, nv);
      this.links.forEach((l, i) => {
        if (!l.mass) return;
        const { Jv, Jw } = this._jac(i, l.cw), Iw = mul(l.Rw, mul(l.inertia, tr(l.Rw)));
        const IJ = matmul(Iw, Jw);
        for (let a = 0; a < nv; a++) for (let b = a; b < nv; b++) {
          const s = l.mass * (Jv[0][a] * Jv[0][b] + Jv[1][a] * Jv[1][b] + Jv[2][a] * Jv[2][b]) + Jw[0][a] * IJ[0][b] + Jw[1][a] * IJ[1][b] + Jw[2][a] * IJ[2][b];
          Mm[a][b] += s;
          if (a !== b) Mm[b][a] += s;
        }
      });
      return Mm;
    }
    // Advance the pose by v·dt (base rotation through the exponential map). Does not clamp joints.
    integrate(v, dt = 1) {
      if (!this.fixedBase) {
        this.base.p = [this.base.p[0] + v[0] * dt, this.base.p[1] + v[1] * dt, this.base.p[2] + v[2] * dt];
        this.base.R = mul(exp([v[3] * dt, v[4] * dt, v[5] * dt]), this.base.R);
      }
      for (let j = 0; j < this.nq; j++) this.q[j] += v[6 + j] * dt;
      return this.fk();
    }
    clampJoints() { for (let j = 0; j < this.nq; j++) { const jt = this.links[this.jointLink[j]].joint; this.q[j] = Math.min(jt.hi, Math.max(jt.lo, this.q[j])); } return this; }
    getPose() { return { base: { p: this.base.p.slice(), R: this.base.R.map((r) => r.slice()) }, q: Float64Array.from(this.q) }; }
    setPose(pose) {
      if (pose.base) { if (pose.base.p) this.base.p = pose.base.p.slice(); if (pose.base.R) this.base.R = pose.base.R.map((r) => r.slice()); }
      if (pose.q) this.q.set(pose.q);
      return this.fk();
    }
    home() { return this.setPose({ base: this.baseHome, q: this.qHome }); }
    clone() { return build(this.name, this.opts).setPose(this.getPose()); }

    // ---- inverse kinematics: one step of strict-priority damped least squares on v
    // levels = [[task, …], …]; a task is { J (m×nv), e (m), w (optional weight: number or one per row) }
    // and asks for J v = e. Level k is solved in the null space of all levels above it, so a lower
    // level can never disturb a higher one (to first order).
    // opts: damping 0.05, step 1, lockBase false, maxDq 0.2 (largest joint/base change per call, rad
    // or m; higher levels drift by O(maxDq²) within a call and are pulled back on the next one, so use
    // ≈ 0.05 when every intermediate pose is shown, e.g. while dragging), lockJoints
    // [q indices], clamp true (joint limits), apply true (move the robot).
    // Joint limits: a joint whose step would cross its limit is moved exactly onto the limit, locked,
    // and the whole stack is solved again with the remaining joints (so clamping never silently breaks
    // a higher-priority task while other joints can still do it).
    // Returns { v (the step actually applied), residuals[level][task] = ‖e‖ before the step }.
    ik(levels, opts = {}) {
      const nv = this.nv, lam = opts.damping ?? 0.05, eps = opts.nullDamping ?? 1e-4, clamp = opts.clamp !== false;
      const free = new Array(nv).fill(1);
      for (let k = 0; k < 6; k++) if (this.fixedBase || opts.lockBase || !this.baseMask[k]) free[k] = 0;
      for (const j of opts.lockJoints || []) free[6 + j] = 0;
      const v0 = new Array(nv).fill(0); // prescribed motion of joints locked at a limit
      // stack the tasks of every level once: rows A, targets b
      const stacks = levels.map((tasks) => {
        const A = [], b = [], res = [];
        for (const t of tasks) {
          res.push(Math.hypot(...t.e));
          t.J.forEach((row, r) => { const w = Array.isArray(t.w) ? t.w[r] : t.w ?? 1; A.push(w === 1 ? row : row.map((x) => x * w)); b.push(w * t.e[r]); });
        }
        return { A, b, res };
      });
      const residuals = stacks.map((st) => st.res);
      const solve = () => {
        let N = zeros(nv, nv);
        for (let k = 0; k < nv; k++) N[k][k] = free[k];
        const v = v0.slice();
        for (const { A, b } of stacks) {
          if (!A.length) continue;
          const AN = matmul(A, N), S = gram(AN), m = A.length;
          const r = b.map((bi, i) => { let s = bi; const a = A[i]; for (let k = 0; k < nv; k++) s -= a[k] * v[k]; return s; });
          const Sd = S.map((row, i) => { const c = row.slice(); c[i] += lam * lam; return c; });
          const y = cholSolveVec(cholFactor(Sd), r);
          for (let k = 0; k < nv; k++) { let s = 0; for (let i = 0; i < m; i++) s += AN[i][k] * y[i]; v[k] += s; }
          const Se = S.map((row, i) => { const c = row.slice(); c[i] += eps * eps; return c; });
          const X = cholSolveMat(cholFactor(Se), AN); // (AN ANᵀ)⁻¹ AN
          for (let a = 0; a < nv; a++) for (let i = 0; i < m; i++) { const f = AN[i][a]; if (f !== 0) { const Xi = X[i], Na = N[a]; for (let c = 0; c < nv; c++) Na[c] -= f * Xi[c]; } }
        }
        let mx = 0;
        for (let k = 0; k < nv; k++) mx = Math.max(mx, Math.abs(v[k]));
        const s = (opts.step ?? 1) * Math.min(1, (opts.maxDq ?? 0.2) / (mx || 1));
        for (let k = 0; k < nv; k++) v[k] *= s;
        return v;
      };
      let v = solve();
      for (let pass = 0; clamp && pass < 6; pass++) {
        let hit = false;
        for (let j = 0; j < this.nq; j++) {
          if (!free[6 + j]) continue;
          const jt = this.links[this.jointLink[j]].joint, qn = this.q[j] + v[6 + j];
          if (qn > jt.hi || qn < jt.lo) { free[6 + j] = 0; v0[6 + j] = Math.min(jt.hi, Math.max(jt.lo, qn)) - this.q[j]; hit = true; }
        }
        if (!hit) break;
        v = solve();
      }
      if (opts.apply !== false) { this.integrate(v, 1); if (clamp) { this.clampJoints(); this.fk(); } }
      return { v, residuals };
    }
    // ---- ready-made tasks for ik()
    // position of a frame → target (world); axes picks rows, e.g. [0, 1] for xy only
    taskPos(frame, target, o = {}) { const { Jv } = this.frameJac(frame), p = this.framePose(frame).p, g = o.gain ?? 1, ax = o.axes || [0, 1, 2]; return { J: ax.map((a) => Jv[a]), e: ax.map((a) => g * (target[a] - p[a])), w: o.w }; }
    // orientation of a frame → Rtarget (world); the error is the rotation vector of Rtarget Rᵀ
    taskOri(frame, Rtarget, o = {}) { const { Jw } = this.frameJac(frame), R = this.framePose(frame).R, g = o.gain ?? 1, e = log(mul(Rtarget, tr(R))), ax = o.axes || [0, 1, 2]; return { J: ax.map((a) => Jw[a]), e: ax.map((a) => g * e[a]), w: o.w }; }
    // full pose (6 rows): keeps a foot planted when target = its current pose
    taskPose(frame, pTarget, Rtarget, o = {}) { const a = this.taskPos(frame, pTarget, o), b = this.taskOri(frame, Rtarget, o); return { J: [...a.J, ...b.J], e: [...a.e, ...b.e], w: o.w }; }
    // centre of mass → target; axes default to the horizontal plane
    taskCom(target, o = {}) { const J = this.comJac(), c = this.com(), g = o.gain ?? 1, ax = o.axes || [0, 1]; return { J: ax.map((a) => J[a]), e: ax.map((a) => g * (target[a] - c[a])), w: o.w }; }
    // joints → qRef (all joints, or o.joints = [q indices])
    taskPosture(qRef, o = {}) {
      const js = o.joints || Array.from({ length: this.nq }, (_, j) => j), g = o.gain ?? 1;
      return { J: js.map((j) => { const r = new Array(this.nv).fill(0); r[6 + j] = 1; return r; }), e: js.map((j) => g * (qRef[j] - this.q[j])), w: o.w };
    }
    // ---- contacts
    // Convex hull (xy, counter-clockwise) of the contact corners of the given frames.
    supportPolygon(frameNames) { const pts = []; for (const f of frameNames) for (const c of this.frameCorners(f)) pts.push([c[0], c[1]]); return hull2d(pts); }
    // Contact forces at the corners of the given frames (flat ground, normal = world z) that realise
    //   Σ f = M (a_com − g)   and   Σ (p − c) × f = k̇     (a_com = o.comAcc, k̇ = o.kdot, both default 0)
    // with f_z ≥ 0 and the friction pyramid |f_x|, |f_y| ≤ μ f_z, smallest Σ‖f‖². When no such forces
    // exist (CoM outside the support, too much acceleration) the inequalities are kept and the wrench
    // is matched as closely as possible: ok = false and `residual` is the missing [force; moment].
    // o.split = "lever" (two rectangular contacts, e.g. two feet, no CoM acceleration): the vertical load
    // is shared by the lever rule along the line between the two contact middles, and both CoPs carry the
    // CoM ground point's offset from that line (the split that needs the least ankle torque); corner forces
    // are the bilinear weights of each CoP. Falls back to the default when a CoP would leave its sole.
    leverSplit(frameNames, c) {
      if (frameNames.length !== 2) return null;
      const W = this.totalMass * G0, rects = frameNames.map((f) => {
        const k = this.frameCorners(f);
        if (k.length !== 4) return null;
        const o = scale(add(add(k[0], k[1]), add(k[2], k[3])), 0.25), ex = scale(sub(k[0], k[3]), 0.5), ey = scale(sub(k[0], k[1]), 0.5);
        return { f, k, o, ex, ey };
      });
      if (rects.some((r) => !r)) return null;
      const [A0, B0] = rects, d = [B0.o[0] - A0.o[0], B0.o[1] - A0.o[1]], L2 = d[0] * d[0] + d[1] * d[1];
      if (L2 < 1e-9) return null;
      const t = Math.max(0, Math.min(1, ((c[0] - A0.o[0]) * d[0] + (c[1] - A0.o[1]) * d[1]) / L2)); // 0: all on A, 1: all on B
      const off = [c[0] - (A0.o[0] + t * d[0]), c[1] - (A0.o[1] + t * d[1])];
      const share = [1 - t, t], forces = [], frames = {};
      for (let i = 0; i < 2; i++) {
        const r = rects[i], fz = W * share[i], cop = [r.o[0] + off[0], r.o[1] + off[1]];
        if (t === 0 || t === 1) { cop[0] = c[0]; cop[1] = c[1]; }
        const q = [cop[0] - r.o[0], cop[1] - r.o[1]], u = (q[0] * r.ex[0] + q[1] * r.ex[1]) / (r.ex[0] ** 2 + r.ex[1] ** 2), v = (q[0] * r.ey[0] + q[1] * r.ey[1]) / (r.ey[0] ** 2 + r.ey[1] ** 2);
        if (fz > 1e-9 && (Math.abs(u) > 1 + 1e-9 || Math.abs(v) > 1 + 1e-9)) return null;
        const w = [(1 + u) * (1 + v), (1 + u) * (1 - v), (1 - u) * (1 - v), (1 - u) * (1 + v)].map((x) => (fz * x) / 4);
        r.k.forEach((p, j) => forces.push({ frame: r.f, pw: p, p, f: [0, 0, w[j]] }));
        frames[r.f] = { f: [0, 0, fz], cop: fz > 1e-9 ? [cop[0], cop[1], r.o[2]] : null };
      }
      return { ok: true, status: "lever", forces, frames, residual: [0, 0, 0, 0, 0, 0], lever: { t, off } };
    }
    distributeForces(frameNames, o = {}) {
      const mu = o.mu ?? 0.6, c = this.com(), Mt = this.totalMass, a = o.comAcc || [0, 0, 0], kd = o.kdot || [0, 0, 0];
      if (o.split === "lever" && !o.comAcc && !o.kdot) { const r = this.leverSplit(frameNames, c); if (r) return r; }
      const pts = [];
      for (const f of frameNames) this.frameCorners(f).forEach((p) => pts.push({ frame: f, p }));
      const n = 3 * pts.length;
      const b = [Mt * a[0], Mt * a[1], Mt * (a[2] + G0), kd[0], kd[1], kd[2]];
      const A = zeros(6, n), Ain = [], bin = [];
      pts.forEach((pt, k) => {
        const r = sub(pt.p, c), i = 3 * k;
        A[0][i] = A[1][i + 1] = A[2][i + 2] = 1;
        A[3][i + 1] = -r[2]; A[3][i + 2] = r[1]; A[4][i] = r[2]; A[4][i + 2] = -r[0]; A[5][i] = -r[1]; A[5][i + 1] = r[0];
        const row = (x, y, z) => { const q = new Array(n).fill(0); q[i] = x; q[i + 1] = y; q[i + 2] = z; Ain.push(q); bin.push(0); };
        row(0, 0, -1); row(1, 0, -mu); row(-1, 0, -mu); row(0, 1, -mu); row(0, -1, -mu);
      });
      let sol = n ? qp(eye(n).map((r) => r.map((x) => 2 * x)), new Array(n).fill(0), A, b, Ain, bin) : { x: [], status: "infeasible" };
      let ok = sol.status === "optimal" || sol.status === "approx";
      if (!ok && n) {
        // soft version: min ‖W(A f − b)‖² + ε‖f‖²  subject to the inequalities (always feasible)
        const w = [1, 1, 1, 4, 4, 4], H = zeros(n, n), g = new Array(n).fill(0);
        for (let r = 0; r < 6; r++) for (let i = 0; i < n; i++) { if (A[r][i] === 0) continue; g[i] -= 2 * w[r] * A[r][i] * b[r]; for (let j = 0; j < n; j++) H[i][j] += 2 * w[r] * A[r][i] * A[r][j]; }
        for (let i = 0; i < n; i++) H[i][i] += 2e-4;
        sol = qp(H, g, [], [], Ain, bin);
      }
      const forces = pts.map((pt, k) => ({ frame: pt.frame, pw: pt.p, p: pt.p, f: [sol.x[3 * k] || 0, sol.x[3 * k + 1] || 0, sol.x[3 * k + 2] || 0] }));
      const frames = {};
      for (const fn of frameNames) {
        let F = [0, 0, 0], cx = 0, cy = 0, cz = 0;
        for (const fc of forces) if (fc.frame === fn) { F = add(F, fc.f); cx += fc.p[0] * fc.f[2]; cy += fc.p[1] * fc.f[2]; cz += fc.p[2] * fc.f[2]; }
        frames[fn] = { f: F, cop: F[2] > 1e-9 ? [cx / F[2], cy / F[2], cz / F[2]] : null }; // centre of pressure of this contact patch
      }
      const got = n ? matvec(A, sol.x) : [0, 0, 0, 0, 0, 0];
      return { ok, status: sol.status, forces, frames, residual: b.map((x, i) => x - got[i]) };
    }
  }

  // ------------------------------------------------------------------ models
  const cap = (a, b, r, color = "limb") => ({ kind: "capsule", a, b, r, color });
  const cyl = (a, b, r, color = "limb") => ({ kind: "cyl", a, b, r, color });
  const box = (center, size, color = "body", R) => ({ kind: "box", center, size, R: R || null, color });
  const sph = (center, r, color = "joint") => ({ kind: "sphere", center, r, color });
  const jt = (name, type, axis, origin, lo, hi, en, zh, R0) => ({ name, type, axis, origin, lo, hi, R0, label: { en, zh } });
  const SIDES = [["l", 1, "left", "左"], ["r", -1, "right", "右"]];

  // A 4-DoF arm (shoulder pitch, roll, yaw; elbow) hanging from `parent` at `shoulder`; 4.7 kg.
  function addArm(links, s, sy, EN, ZH, parent, shoulder) {
    links.push({ name: `${s}_shoulder_pitch_link`, parent, mass: 0.5, geoms: [sph([0, 0, 0], 0.055)], joint: jt(`${s}_shoulder_pitch`, "R", [0, 1, 0], shoulder, -3.0, 1.5, `${EN} shoulder pitch`, `${ZH}肩俯仰`) });
    links.push({ name: `${s}_shoulder_roll_link`, parent: `${s}_shoulder_pitch_link`, mass: 0.5, geoms: [sph([0, 0, 0], 0.05)], joint: jt(`${s}_shoulder_roll`, "R", [1, 0, 0], [0, 0, 0], sy > 0 ? -0.3 : -2.8, sy > 0 ? 2.8 : 0.3, `${EN} shoulder roll`, `${ZH}肩侧摆`) });
    links.push({ name: `${s}_upper_arm`, parent: `${s}_shoulder_roll_link`, mass: 2.0, geoms: [cap([0, 0, -0.03], [0, 0, -0.25], 0.045)], joint: jt(`${s}_shoulder_yaw`, "R", [0, 0, 1], [0, 0, 0], -1.6, 1.6, `${EN} shoulder yaw`, `${ZH}肩旋转`) });
    links.push({ name: `${s}_forearm`, parent: `${s}_upper_arm`, mass: 1.7, geoms: [sph([0, 0, 0], 0.045), cap([0, 0, -0.03], [0, 0, -0.22], 0.04), sph([0, 0, -0.28], 0.05, "hand")], joint: jt(`${s}_elbow`, "R", [0, 1, 0], [0, 0, -0.28], -2.4, 0, `${EN} elbow`, `${ZH}肘`) });
  }
  const ARM_HOME = { l_shoulder_roll: 0.12, r_shoulder_roll: -0.12, l_elbow: -0.4, r_elbow: -0.4 };
  const HAND = [0, 0, -0.28];

  // Put the robot on the ground: the listed frames' mean height becomes z = 0 and their mean xy the origin.
  const place = (names) => (rob) => {
    let c = [0, 0, 0];
    for (const n of names) c = add(c, rob.framePose(n).p);
    c = scale(c, 1 / names.length);
    rob.base.p = sub(rob.base.p, c);
  };

  // Humanoid: 1.75 m, 70 kg, floating pelvis, 22 joints (6 per leg, waist yaw + pitch, 4 per arm).
  // Leg lengths: thigh 0.42 m, shank 0.41 m, ankle 0.08 m above the sole; hip joints 0.08 m below the
  // pelvis origin and 0.20 m apart; shoulders 0.46 m above the pelvis, 0.43 m apart; upper arm 0.28 m,
  // forearm + hand 0.28 m; feet 0.22 × 0.10 m (ankle 0.06 m from the heel). qHome is the Unitree-H1
  // crouch (hip −0.4, knee 0.8, ankle −0.4): soles flat on z = 0, CoM ≈ 0.94 m, head top ≈ 1.68 m
  // (≈ 1.73 m standing straight).
  // Positive pitch joints rotate about +y (left): hip_pitch < 0 swings the thigh forward, knee > 0
  // bends it, ankle_pitch < 0 lifts the toes, waist_pitch > 0 leans the trunk forward, elbow < 0 bends it.
  // opts.sole = [length, width] of each sole in m (default [0.22, 0.10]); the sole stays centred 5 cm in front of the ankle
  function humanoidSpec(opts = {}) {
    const SL = Array.isArray(opts.sole) && Number.isFinite(opts.sole[0]) ? Math.max(0.1, Math.min(0.4, opts.sole[0])) : 0.22, SW = Array.isArray(opts.sole) && Number.isFinite(opts.sole[1]) ? Math.max(0.06, Math.min(0.2, opts.sole[1])) : 0.1;
    const links = [{ name: "pelvis", parent: null, mass: 9.0, geoms: [cap([0, -0.07, 0], [0, 0.07, 0], 0.095, "body")], joint: { type: "free", label: { en: "floating base (pelvis)", zh: "浮动基座（骨盆）" } } }];
    for (const [s, sy, EN, ZH] of SIDES) {
      links.push({ name: `${s}_hip_yaw_link`, parent: "pelvis", mass: 0.7, geoms: [sph([0, 0, 0], 0.05)], joint: jt(`${s}_hip_yaw`, "R", [0, 0, 1], [0, sy * 0.10, -0.04], -0.6, 0.6, `${EN} hip yaw`, `${ZH}髋旋转`) });
      links.push({ name: `${s}_hip_roll_link`, parent: `${s}_hip_yaw_link`, mass: 0.7, geoms: [sph([0, 0, 0], 0.055)], joint: jt(`${s}_hip_roll`, "R", [1, 0, 0], [0, 0, -0.04], -0.5, 0.5, `${EN} hip roll`, `${ZH}髋侧摆`) });
      links.push({ name: `${s}_thigh`, parent: `${s}_hip_roll_link`, mass: 6.8, geoms: [cap([0, 0, -0.04], [0, 0, -0.38], 0.065)], joint: jt(`${s}_hip_pitch`, "R", [0, 1, 0], [0, 0, 0], -1.8, 0.7, `${EN} hip pitch`, `${ZH}髋俯仰`) });
      links.push({ name: `${s}_shank`, parent: `${s}_thigh`, mass: 3.6, geoms: [sph([0, 0, 0], 0.06), cap([0, 0, -0.05], [0, 0, -0.37], 0.05)], joint: jt(`${s}_knee`, "R", [0, 1, 0], [0, 0, -0.42], 0, 2.4, `${EN} knee`, `${ZH}膝`) });
      links.push({ name: `${s}_ankle_link`, parent: `${s}_shank`, mass: 0.3, geoms: [sph([0, 0, 0], 0.045)], joint: jt(`${s}_ankle_pitch`, "R", [0, 1, 0], [0, 0, -0.41], -1.0, 0.8, `${EN} ankle pitch`, `${ZH}踝俯仰`) });
      links.push({ name: `${s}_foot`, parent: `${s}_ankle_link`, mass: 1.2, geoms: [box([0.05, 0, -0.06], [SL, SW, 0.04], "foot")], joint: jt(`${s}_ankle_roll`, "R", [1, 0, 0], [0, 0, 0], -0.5, 0.5, `${EN} ankle roll`, `${ZH}踝侧摆`) });
    }
    links.push({ name: "waist", parent: "pelvis", mass: 1.0, geoms: [sph([0, 0, 0], 0.07)], joint: jt("waist_yaw", "R", [0, 0, 1], [0, 0, 0.10], -1.0, 1.0, "waist yaw", "腰旋转") });
    links.push({ name: "torso", parent: "waist", mass: 19.0, geoms: [cap([0, 0, 0.04], [0, 0, 0.20], 0.10, "body"), cap([0, -0.09, 0.30], [0, 0.09, 0.30], 0.105, "body"), cap([0, 0, 0.38], [0, 0, 0.42], 0.045, "joint")], joint: jt("waist_pitch", "R", [0, 1, 0], [0, 0, 0.02], -0.4, 1.0, "waist pitch", "腰俯仰") });
    links.push({ name: "head", parent: "torso", mass: 5.0, geoms: [sph([0, 0, 0], 0.11, "head")], joint: { type: "fixed", origin: [0, 0, 0.51], label: { en: "neck (fixed)", zh: "颈（固定）" } } });
    for (const [s, sy, EN, ZH] of SIDES) addArm(links, s, sy, EN, ZH, "torso", [0, sy * 0.215, 0.34]);
    const sole = (link) => ({ link, p: [0.05, 0, -0.08], corners: [[0.05 + SL / 2, SW / 2, -0.08], [0.05 + SL / 2, -SW / 2, -0.08], [0.05 - SL / 2, -SW / 2, -0.08], [0.05 - SL / 2, SW / 2, -0.08]] });
    return {
      name: "humanoid", links,
      frames: { l_foot: sole("l_foot"), r_foot: sole("r_foot"), l_hand: { link: "l_forearm", p: HAND }, r_hand: { link: "r_forearm", p: HAND }, head: { link: "head", p: [0, 0, 0] }, pelvis: { link: "pelvis", p: [0, 0, 0] }, torso: { link: "torso", p: [0, 0, 0.25] } },
      home: { l_hip_pitch: -0.4, l_knee: 0.8, l_ankle_pitch: -0.4, r_hip_pitch: -0.4, r_knee: 0.8, r_ankle_pitch: -0.4, ...ARM_HOME },
      place: place(["l_foot", "r_foot"]),
    };
  }

  // Quadruped: 30 kg, body 0.55 × 0.25 × 0.15 m, 12 joints (hip abduction, hip pitch, knee per leg),
  // thigh 0.26 m, shank 0.275 m to the foot tip. Point feet: the frame is the tip of the shank.
  function quadrupedSpec() {
    const links = [{ name: "body", parent: null, mass: 18.0, geoms: [box([0, 0, 0], [0.55, 0.25, 0.15], "body"), { ...box([0.30, 0, 0.02], [0.06, 0.14, 0.08], "accent"), massless: true }], joint: { type: "free", label: { en: "floating base (body)", zh: "浮动基座（机身）" } } }];
    const frames = { body: { link: "body", p: [0, 0, 0] } }, home = {};
    for (const [leg, sx, sy, EN, ZH] of [["lf", 1, 1, "left front", "左前"], ["rf", 1, -1, "right front", "右前"], ["lh", -1, 1, "left hind", "左后"], ["rh", -1, -1, "right hind", "右后"]]) {
      links.push({ name: `${leg}_hip`, parent: "body", mass: 1.0, geoms: [sph([0, 0, 0], 0.05)], joint: jt(`${leg}_haa`, "R", [1, 0, 0], [sx * 0.28, sy * 0.10, 0], -0.6, 0.6, `${EN} hip abduction`, `${ZH}髋外展`) });
      links.push({ name: `${leg}_thigh`, parent: `${leg}_hip`, mass: 1.4, geoms: [cap([0, 0, 0], [0, 0, -0.26], 0.03)], joint: jt(`${leg}_hfe`, "R", [0, 1, 0], [0, sy * 0.07, 0], -1.6, 1.6, `${EN} hip pitch`, `${ZH}髋俯仰`) });
      links.push({ name: `${leg}_shank`, parent: `${leg}_thigh`, mass: 0.6, geoms: [sph([0, 0, 0], 0.035), cap([0, 0, 0], [0, 0, -0.24], 0.022), sph([0, 0, -0.25], 0.025, "foot")], joint: jt(`${leg}_kfe`, "R", [0, 1, 0], [0, 0, -0.26], -2.6, 2.6, `${EN} knee`, `${ZH}膝`) });
      frames[`${leg}_foot`] = { link: `${leg}_shank`, p: [0, 0, -0.275], corners: [[0, 0, -0.275]] };
      home[`${leg}_hfe`] = 0.7; home[`${leg}_kfe`] = -1.4; // every knee behind its hip and foot (Unitree-style); foot under the hip
    }
    return { name: "quadruped", links, frames, home, place: place(["lf_foot", "rf_foot", "lh_foot", "rh_foot"]) };
  }

  // Wheeled humanoid (mobile manipulator): 120 kg, base 0.6 × 0.5 × 0.25 m on four wheels (radius 0.10 m,
  // wheelbase 0.40 m, track 0.57 m), a lift (0–0.4 m), waist pitch and two 4-DoF arms; 10 joints.
  // The base link is "free" in the mathematics, but ik() only uses x, y and yaw (baseMask): height,
  // roll and pitch are held by the scene (the wheels stay on the floor).
  function wheeledSpec() {
    const wheel = (x, y) => cyl([x, y - 0.03, -0.11], [x, y + 0.03, -0.11], 0.10, "wheel");
    const links = [{ name: "base", parent: null, mass: 60.0, geoms: [box([0, 0, 0], [0.6, 0.5, 0.25], "body"), box([-0.14, 0, 0.4075], [0.08, 0.16, 0.565], "body"), wheel(0.20, 0.285), wheel(0.20, -0.285), wheel(-0.20, 0.285), wheel(-0.20, -0.285)], joint: { type: "free", label: { en: "mobile base (x, y, yaw)", zh: "移动底盘（x、y、偏航）" } } }];
    links.push({ name: "lift", parent: "base", mass: 18.0, geoms: [box([-0.03, 0, 0], [0.18, 0.22, 0.14], "limb")], joint: jt("lift", "P", [0, 0, 1], [0, 0, 0.20], 0, 0.4, "lift", "升降柱") });
    links.push({ name: "torso", parent: "lift", mass: 27.6, geoms: [cap([0, 0, 0.04], [0, 0, 0.20], 0.10, "body"), cap([0, -0.09, 0.30], [0, 0.09, 0.30], 0.105, "body"), cap([0, 0, 0.38], [0, 0, 0.42], 0.045, "joint")], joint: jt("waist_pitch", "R", [0, 1, 0], [0.02, 0, 0.09], -0.3, 1.2, "waist pitch", "腰俯仰") });
    links.push({ name: "head", parent: "torso", mass: 5.0, geoms: [sph([0, 0, 0], 0.11, "head")], joint: { type: "fixed", origin: [0, 0, 0.51], label: { en: "neck (fixed)", zh: "颈（固定）" } } });
    for (const [s, sy, EN, ZH] of SIDES) addArm(links, s, sy, EN, ZH, "torso", [0, sy * 0.215, 0.34]);
    const w = (x, y) => ({ link: "base", p: [x, y, -0.21], corners: [[x, y, -0.21]] });
    return {
      name: "wheeled", links, baseMask: [1, 1, 0, 0, 0, 1],
      frames: { wheel_fl: w(0.20, 0.285), wheel_fr: w(0.20, -0.285), wheel_rl: w(-0.20, 0.285), wheel_rr: w(-0.20, -0.285), l_hand: { link: "l_forearm", p: HAND }, r_hand: { link: "r_forearm", p: HAND }, head: { link: "head", p: [0, 0, 0] }, torso: { link: "torso", p: [0, 0, 0.25] }, base: { link: "base", p: [0, 0, 0] } },
      home: { lift: 0.2, ...ARM_HOME },
      place: place(["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"]),
    };
  }

  // Fixed-base 7-DoF arm with the kinematics of a Franka Panda (joint origins as in its URDF), 18 kg,
  // reach ≈ 0.855 m. Every joint turns about its own z axis; R0 tilts that axis.
  function armSpec() {
    const H = Math.PI / 2, z = [0, 0, 1];
    const links = [
      { name: "link0", parent: null, mass: 2.4, geoms: [cyl([0, 0, 0], [0, 0, 0.14], 0.075, "body")], joint: { type: "fixed", label: { en: "fixed base", zh: "固定基座" } } },
      { name: "link1", parent: "link0", mass: 3.0, geoms: [cap([0, 0, -0.17], [0, 0, -0.02], 0.06)], joint: jt("joint1", "R", z, [0, 0, 0.333], -2.8973, 2.8973, "joint 1 (shoulder pan)", "关节 1（肩水平转）") },
      { name: "link2", parent: "link1", mass: 3.0, geoms: [cap([0, 0, -0.05], [0, 0, 0.05], 0.06, "joint"), cap([0, -0.03, 0], [0, -0.17, 0], 0.055)], joint: jt("joint2", "R", z, [0, 0, 0], -1.7628, 1.7628, "joint 2 (shoulder lift)", "关节 2（肩抬升）", Rx(-H)) },
      { name: "link3", parent: "link2", mass: 2.5, geoms: [cap([0, 0, -0.12], [0, 0, -0.02], 0.055), cap([0, 0, 0], [0.0825, 0, 0], 0.05)], joint: jt("joint3", "R", z, [0, -0.316, 0], -2.8973, 2.8973, "joint 3 (upper-arm roll)", "关节 3（上臂旋转）", Rx(H)) },
      { name: "link4", parent: "link3", mass: 2.5, geoms: [cap([0, 0, -0.05], [0, 0, 0.05], 0.055, "joint"), cap([0, 0, 0], [-0.0825, 0.10, 0], 0.05)], joint: jt("joint4", "R", z, [0.0825, 0, 0], -3.0718, -0.0698, "joint 4 (elbow)", "关节 4（肘）", Rx(H)) },
      { name: "link5", parent: "link4", mass: 2.0, geoms: [cap([0, 0, -0.26], [0, 0, -0.03], 0.048)], joint: jt("joint5", "R", z, [-0.0825, 0.384, 0], -2.8973, 2.8973, "joint 5 (forearm roll)", "关节 5（前臂旋转）", Rx(-H)) },
      { name: "link6", parent: "link5", mass: 1.5, geoms: [cap([0, 0, -0.04], [0, 0, 0.04], 0.048, "joint"), cap([0, 0, 0], [0.088, 0, 0], 0.04)], joint: jt("joint6", "R", z, [0, 0, 0], -0.0175, 3.7525, "joint 6 (wrist pitch)", "关节 6（腕俯仰）", Rx(H)) },
      { name: "link7", parent: "link6", mass: 0.5, geoms: [cap([0, 0, 0.01], [0, 0, 0.09], 0.04)], joint: jt("joint7", "R", z, [0.088, 0, 0], -2.8973, 2.8973, "joint 7 (wrist roll)", "关节 7（腕旋转）", Rx(H)) },
      { name: "hand", parent: "link7", mass: 0.6, geoms: [box([0, 0, 0.03], [0.06, 0.18, 0.06], "hand"), box([0, 0.04, 0.085], [0.02, 0.02, 0.05], "hand"), box([0, -0.04, 0.085], [0.02, 0.02, 0.05], "hand")], joint: { type: "fixed", origin: [0, 0, 0.107], R0: Rz(-Math.PI / 4), label: { en: "gripper (fixed)", zh: "夹爪（固定）" } } },
    ];
    return {
      name: "arm", links, fixedBase: true,
      frames: { ee: { link: "link7", p: [0, 0, 0.107] }, tcp: { link: "hand", p: [0, 0, 0.11] }, base: { link: "link0", p: [0, 0, 0] } },
      home: { joint1: 0, joint2: -0.4, joint3: 0, joint4: -2.0, joint5: 0, joint6: 1.6, joint7: 0.8 },
    };
  }

  const SPECS = { humanoid: humanoidSpec, quadruped: quadrupedSpec, wheeled: wheeledSpec, arm: armSpec };
  function build(name, opts) {
    const spec = SPECS[name];
    if (!spec) throw new Error(`rob3d: unknown robot "${name}" (known: ${Object.keys(SPECS).join(", ")})`);
    return new Robot(spec(opts || {}), opts);
  }

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  root.Viz = root.Viz || {};
  root.Viz.rob = { G: G0, V, M, build, hull2d, inPoly, distToPoly, solveLS, nullProj, qp, la: { zeros, eye, matmul, matT, matvec, gram, luFactor, cholFactor, cholSolveVec }, massProps, Robot };
})();
