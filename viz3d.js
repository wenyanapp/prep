"use strict";
// 3-D renderer for teaching widgets (PLAN R19): shaded solids, soft floor shadows, arrows,
// transparent cones and polygons, labels with maths, an orbit camera and draggable points.
//
// One WebGL context is shared by every figure on a page (iOS allows only a few): a figure
// owns a 2-D canvas, and each frame is rendered in the shared context and copied into it.
//
//   const view = Viz.g3.view(stage, { height: 380, target: [0, 0, 0.8], dist: 4, yaw: 0.7, pitch: 0.3,
//                                     draw(g, dt) { g.capsule(a, b, 0.05, "#888"); … } });
//   view.redraw()            render once (after a slider moved)
//   view.animate(true)       call draw every frame with dt (seconds); animate(false) stops
//   view.handle({ get, set, plane })   a point the reader can drag
//
// World frame: z up, x forward, y left; metres. Vectors are [x, y, z]; rotations 3×3 rows.
(() => {
  if (!window.Viz) return;
  const { h, cssv, clamp, math } = Viz.util;

  // ------------------------------------------------------------------ small maths
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const n = len(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
  const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  // Rotation whose third column (local z) is the direction d.
  function basisZ(d) {
    const z = unit(d);
    const ref = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const x = unit(cross(ref, z));
    const y = cross(z, x);
    return [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
  }
  const m4mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };

  // ------------------------------------------------------------------ colours
  const colorCache = new Map();
  function rgbOf(c) {
    if (Array.isArray(c)) return c;
    let v = colorCache.get(c);
    if (v) return v;
    let s = String(c).trim();
    if (s.startsWith("--")) s = cssv(s);
    if (s.startsWith("var(")) s = cssv(s.slice(4, -1).trim());
    let m;
    if ((m = s.match(/^#([0-9a-f]{3})$/i))) v = [...m[1]].map((x) => parseInt(x + x, 16) / 255);
    else if ((m = s.match(/^#([0-9a-f]{6})/i))) v = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
    else if ((m = s.match(/rgba?\(([^)]+)\)/))) v = m[1].split(/[, /]+/).slice(0, 3).map((x) => +x / 255);
    else v = [0.5, 0.5, 0.5];
    colorCache.set(c, v);
    return v;
  }
  const isDark = () => document.documentElement.dataset.theme === "dark";
  // Fixed meanings across every 3-D figure (the legend of a figure names the ones it uses).
  function palette() {
    const dark = isDark();
    return {
      x: "#d93025", y: "#1f8354", z: "#0056d2", // frame axes: x red, y green, z blue
      body: dark ? "#8f9bb0" : "#c3ccd9", limb: dark ? "#7a8699" : "#aab5c5", joint: dark ? "#3c4554" : "#566173", foot: dark ? "#a7b2c4" : "#8791a3", hand: dark ? "#a7b2c4" : "#8791a3", head: dark ? "#b9c3d3" : "#d9dfe8", wheel: dark ? "#20252e" : "#2f3640", accent: "#0056d2",
      com: "#e8710a", force: "#d93025", gravity: "#7b3ff2", torque: "#b8860b", velocity: "#0a8f8f", target: "#d6336c", support: "#1f8354", zmp: "#d93025", dcm: "#0056d2", cone: "#e8a100", ghost: dark ? "#c8d0dc" : "#6b7688",
      ground: dark ? "#1b212b" : "#f1f4f8", grid: dark ? "#2c3542" : "#dbe1ea", gridMajor: dark ? "#3a4555" : "#c5cedb", text: dark ? "#e6ebf2" : "#1f2733", shadow: dark ? 0.42 : 0.2,
    };
  }

  // ------------------------------------------------------------------ shared GL
  let GL = null; // { gl, canvas, prog, loc, meshes }
  const VS = `
    attribute vec3 aPos; attribute vec3 aNor;
    uniform mat4 uVP; uniform mat3 uRot; uniform vec3 uScale; uniform vec3 uPos;
    varying vec3 vN; varying vec3 vW;
    void main() {
      vec3 w = uRot * (aPos * uScale) + uPos;
      vW = w; vN = uRot * (aNor / uScale);
      gl_Position = uVP * vec4(w, 1.0);
    }`;
  const FS = `
    precision mediump float;
    uniform vec4 uColor; uniform vec3 uEye; uniform vec3 uLight; uniform float uLit;
    varying vec3 vN; varying vec3 vW;
    void main() {
      if (uLit < 0.5) { gl_FragColor = vec4(uColor.rgb * uColor.a, uColor.a); return; }
      vec3 n = normalize(vN); vec3 v = normalize(uEye - vW);
      if (dot(n, v) < 0.0) n = -n;
      float key = max(dot(n, uLight), 0.0);
      float fill = max(dot(n, v), 0.0);
      float hemi = 0.5 + 0.5 * n.z;
      vec3 hv = normalize(uLight + v);
      float spec = pow(max(dot(n, hv), 0.0), 40.0) * 0.22;
      vec3 c = uColor.rgb * (0.30 + 0.16 * hemi + 0.46 * key + 0.16 * fill) + vec3(spec);
      gl_FragColor = vec4(c * uColor.a, uColor.a);
    }`;
  function buildMesh(gl, pos, nor, idx) {
    const data = new Float32Array((pos.length / 3) * 6);
    for (let i = 0; i < pos.length / 3; i++) { data.set(pos.slice(i * 3, i * 3 + 3), i * 6); data.set(nor.slice(i * 3, i * 3 + 3), i * 6 + 3); }
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    return { vb, ib, n: idx.length };
  }
  function meshes(gl) {
    const out = {};
    { // box, side 1, centred
      const pos = [], nor = [], idx = [];
      const faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
      for (const [n, u, v] of faces) {
        const b = pos.length / 3;
        for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(...[0, 1, 2].map((i) => 0.5 * (n[i] + a * u[i] + c * v[i]))); nor.push(...n); }
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      out.box = buildMesh(gl, pos, nor, idx);
    }
    { // sphere, radius 1
      const pos = [], nor = [], idx = [], A = 24, B = 14;
      for (let j = 0; j <= B; j++) for (let i = 0; i <= A; i++) { const th = (j / B) * Math.PI, ph = (i / A) * 2 * Math.PI; const p = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)]; pos.push(...p); nor.push(...p); }
      for (let j = 0; j < B; j++) for (let i = 0; i < A; i++) { const a = j * (A + 1) + i, b = a + A + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      out.sphere = buildMesh(gl, pos, nor, idx);
    }
    const tube = (r1, capped) => { // radius 1 at z = 0, radius r1 at z = 1
      const pos = [], nor = [], idx = [], A = 24;
      const slope = 1 - r1; // normal tilts up for a cone
      for (let i = 0; i <= A; i++) { const ph = (i / A) * 2 * Math.PI, c = Math.cos(ph), s = Math.sin(ph); pos.push(c, s, 0, c * r1, s * r1, 1); const n = unit([c, s, slope]); nor.push(...n, ...n); }
      for (let i = 0; i < A; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      if (capped) for (const [z, rr, nz] of [[0, 1, -1], [1, r1, 1]]) {
        if (rr === 0) continue;
        const c0 = pos.length / 3; pos.push(0, 0, z); nor.push(0, 0, nz);
        for (let i = 0; i <= A; i++) { const ph = (i / A) * 2 * Math.PI; pos.push(Math.cos(ph) * rr, Math.sin(ph) * rr, z); nor.push(0, 0, nz); }
        for (let i = 0; i < A; i++) idx.push(c0, c0 + 1 + i, c0 + 2 + i);
      }
      return buildMesh(gl, pos, nor, idx);
    };
    out.cyl = tube(1, true);
    out.cone = tube(0, true);
    out.coneOpen = tube(0, false);
    { // unit disc in the xy plane
      const pos = [0, 0, 0], nor = [0, 0, 1], idx = [], A = 40;
      for (let i = 0; i <= A; i++) { const ph = (i / A) * 2 * Math.PI; pos.push(Math.cos(ph), Math.sin(ph), 0); nor.push(0, 0, 1); }
      for (let i = 0; i < A; i++) idx.push(0, 1 + i, 2 + i);
      out.disc = buildMesh(gl, pos, nor, idx);
    }
    out.dyn = { vb: gl.createBuffer(), ib: gl.createBuffer(), n: 0 }; // scratch mesh for polygons
    return out;
  }
  function initGL() {
    if (GL !== null) return GL;
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: true, stencil: true, preserveDrawingBuffer: true });
    if (!gl) return (GL = false);
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    try { gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); } catch (e) { console.error(e); return (GL = false); }
    gl.bindAttribLocation(prog, 0, "aPos"); gl.bindAttribLocation(prog, 1, "aNor");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return (GL = false);
    const loc = {};
    for (const u of ["uVP", "uRot", "uScale", "uPos", "uColor", "uEye", "uLight", "uLit"]) loc[u] = gl.getUniformLocation(prog, u);
    GL = { gl, canvas, prog, loc, meshes: meshes(gl) };
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); GL = null; });
    return GL;
  }

  const LIGHT = unit([0.35, -0.3, 1]);
  const FOV = (32 * Math.PI) / 180;

  // ------------------------------------------------------------------ view
  function view(stage, o = {}) {
    const P = palette();
    const wrap = h("div", { class: "g3" });
    const canvas = h("canvas", { class: "g3-canvas" });
    const labels = h("div", { class: "g3-labels" });
    const tools = h("div", { class: "g3-tools" });
    wrap.append(canvas, labels, tools);
    stage.append(wrap);
    const cssH = o.height || 380;
    wrap.style.height = cssH + "px";
    const ctx = canvas.getContext("2d");
    const cam = { target: (o.target || [0, 0, 0.6]).slice(), dist: o.dist || 4, yaw: o.yaw ?? 0.7, pitch: o.pitch ?? 0.3 };
    const home = JSON.parse(JSON.stringify(cam));
    const handles = [];
    let W = 0, Hh = 0, dpr = 1, eye = [0, 0, 0], fwd = [1, 0, 0], right = [0, 1, 0], up = [0, 0, 1], VP = null;
    let items = [], labelPool = [], labelUsed = 0, labelBoxes = [], raf = 0, animating = false, last = 0, visible = true, dirty = true;

    if (!initGL()) { wrap.append(h("div", { class: "g3-msg" }, (document.documentElement.lang || "").startsWith("zh") ? "这台设备无法使用 WebGL，3D 图无法显示。" : "WebGL is not available on this device, so the 3-D figure cannot be shown.")); }

    function camera() {
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      // yaw 0 looks along +y from the −y side; the camera circles the target
      const dir = [Math.sin(cam.yaw) * cp, -Math.cos(cam.yaw) * cp, sp]; // from target to eye
      eye = add(cam.target, mul(dir, cam.dist));
      fwd = mul(dir, -1);
      right = unit(cross(fwd, [0, 0, 1]));
      up = cross(right, fwd);
      const near = Math.max(0.02, cam.dist * 0.02), far = cam.dist * 12 + 20, f = 1 / Math.tan(FOV / 2), asp = W / Hh;
      const proj = new Float32Array([f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
      const vw = new Float32Array([right[0], up[0], -fwd[0], 0, right[1], up[1], -fwd[1], 0, right[2], up[2], -fwd[2], 0, -dot(right, eye), -dot(up, eye), dot(fwd, eye), 1]);
      VP = m4mul(proj, vw);
    }
    // world point → CSS pixel [x, y] and depth along the view direction (m)
    function project(p) {
      const x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12], y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13], w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
      return [(0.5 + (0.5 * x) / w) * (W / dpr), (0.5 - (0.5 * y) / w) * (Hh / dpr), w];
    }
    const pxWorld = (p) => (2 * Math.max(0.05, dot(sub(p, eye), fwd)) * Math.tan(FOV / 2)) / (Hh / dpr); // metres per CSS pixel at p
    function ray(cx, cy) {
      const t = Math.tan(FOV / 2), nx = (2 * cx) / (W / dpr) - 1, ny = 1 - (2 * cy) / (Hh / dpr);
      return { o: eye, d: unit(add(add(fwd, mul(right, nx * t * (W / Hh))), mul(up, ny * t))) };
    }

    // ---------------- drawing list (immediate mode: rebuilt every frame)
    const push = (mesh, R, scale, pos, color, opt = {}) => items.push({ mesh, R, scale, pos, color: rgbOf(color), alpha: opt.alpha ?? 1, lit: !opt.unlit, shadow: opt.shadow ?? (!opt.unlit && (opt.alpha ?? 1) > 0.9 && !opt.onTop && !opt.ground), onTop: !!opt.onTop, ground: !!opt.ground, pts: opt.pts });
    const g = {
      P,
      sphere(p, r, color, opt) { push("sphere", I3, [r, r, r], p, color, opt); },
      box(c, R, size, color, opt) { push("box", R || I3, size, c, color, opt); },
      cyl(a, b, r, color, opt) { const d = sub(b, a), L = len(d); if (L < 1e-9) return; push("cyl", basisZ(d), [r, r, L], a, color, opt); },
      capsule(a, b, r, color, opt) { g.cyl(a, b, r, color, opt); g.sphere(a, r, color, opt); g.sphere(b, r, color, opt); },
      // solid cone: base circle (radius r) at a, apex at b
      cone(a, b, r, color, opt) { const d = sub(b, a), L = len(d); if (L < 1e-9) return; push("cone", basisZ(d), [r, r, L], a, color, opt); },
      // open cone surface with its apex at `apex`, opening along `axis` (friction cone): half-angle atan(mu)
      coneShell(apex, axis, height, radius, color, opt = {}) { const n = unit(axis), top = add(apex, mul(n, height)); push("coneOpen", basisZ(mul(n, -1)), [radius, radius, height], top, color, { alpha: 0.3, shadow: false, ...opt }); if (opt.rim !== false) g.circle(top, n, radius, color, { w: 1.5 }); },
      ellipsoid(c, R, radii, color, opt) { push("sphere", R || I3, radii, c, color, opt); },
      disc(c, n, r, color, opt) { push("disc", basisZ(n), [r, r, 1], c, color, { unlit: true, shadow: false, ...opt }); },
      // straight arrow from a to b; r is the shaft radius in metres (default scales with the view)
      arrow(a, b, color, opt = {}) {
        const d = sub(b, a), L = len(d); if (L < 1e-6) return;
        const r = opt.r ?? Math.max(0.006, (opt.w ?? 4) * 0.5 * pxWorld(a)), hl = Math.min(L * 0.45, r * 6), u = mul(d, 1 / L), mid = add(a, mul(u, L - hl));
        const oo = { shadow: false, ...opt };
        g.cyl(a, mid, r, color, oo); g.cone(mid, b, r * 2.4, color, oo);
        if (opt.label) g.label(add(b, mul(u, 0.03)), opt.label, { color: opt.labelColor || color, ...(opt.labelOpt || {}) });
      },
      // thin line with a width in pixels
      line(a, b, color, opt = {}) {
        const w = opt.w ?? 1.5, oo = { unlit: true, shadow: false, ...opt };
        if (opt.dash) { const d = sub(b, a), L = len(d), n = Math.max(1, Math.round(L / opt.dash)); for (let i = 0; i < n; i += 2) g.line(add(a, mul(d, i / n)), add(a, mul(d, Math.min(1, (i + 1) / n))), color, { ...opt, dash: 0 }); return; }
        g.cyl(a, b, w * 0.5 * pxWorld(mul(add(a, b), 0.5)), color, oo);
      },
      polyline(pts, color, opt = {}) { for (let i = 1; i < pts.length; i++) g.line(pts[i - 1], pts[i], color, opt); if (opt.closed && pts.length > 2) g.line(pts[pts.length - 1], pts[0], color, opt); },
      circle(c, n, r, color, opt = {}) { const R = basisZ(n), pts = []; for (let i = 0; i <= 48; i++) { const a = (i / 48) * 2 * Math.PI; pts.push(add(c, [R[0][0] * Math.cos(a) * r + R[0][1] * Math.sin(a) * r, R[1][0] * Math.cos(a) * r + R[1][1] * Math.sin(a) * r, R[2][0] * Math.cos(a) * r + R[2][1] * Math.sin(a) * r])); } g.polyline(pts, color, opt); },
      // flat convex polygon (support polygon, a face of a friction pyramid); { ground: true } paints it on the floor
      poly(pts, color, opt = {}) { if (pts.length < 3) return; push("dyn", I3, [1, 1, 1], [0, 0, 0], color, { unlit: true, shadow: false, alpha: 0.35, ...opt, pts }); if (opt.outline !== false) g.polyline(opt.ground ? pts.map((p) => [p[0], p[1], 0.002]) : pts, opt.outline || color, { w: opt.w ?? 2, closed: true, ground: opt.ground, onTop: opt.onTop }); },
      // coordinate frame: x red, y green, z blue
      frame(p, R, size = 0.15, opt = {}) {
        const cols = [P.x, P.y, P.z], names = opt.names || (opt.label ? ["x", "y", "z"] : null);
        for (let i = 0; i < 3; i++) { const e = add(p, [R[0][i] * size, R[1][i] * size, R[2][i] * size]); g.arrow(p, e, cols[i], { w: opt.w ?? 3, onTop: opt.onTop, alpha: opt.alpha }); if (names) g.label(e, names[i], { color: cols[i], small: true }); }
        if (opt.name) g.label(p, opt.name, { dy: 14, small: true });
      },
      // curved arrow around an axis (a torque or an angular velocity); signed value turns it the right way
      turn(c, axis, radius, value, color, opt = {}) {
        if (Math.abs(value) < 1e-9) return;
        const R = basisZ(axis), sweep = clamp(Math.abs(opt.sweep ?? 1.5 * Math.PI), 0.3, 1.9 * Math.PI) * Math.sign(value), n = 20, pts = [];
        for (let i = 0; i <= n; i++) { const a = (i / n) * sweep; pts.push(add(c, [0, 1, 2].map((k) => R[k][0] * Math.cos(a) * radius + R[k][1] * Math.sin(a) * radius))); }
        const w = opt.w ?? 3;
        for (let i = 1; i < n; i++) g.line(pts[i - 1], pts[i], color, { w, onTop: opt.onTop });
        const tip = pts[n], dir = unit(sub(pts[n], pts[n - 1])), r = w * 0.5 * pxWorld(tip);
        g.cone(sub(tip, mul(dir, r * 5)), add(tip, mul(dir, r * 2)), r * 2.6, color, { unlit: true, shadow: false, onTop: opt.onTop });
        if (opt.label) g.label(pts[Math.floor(n / 2)], opt.label, { color });
      },
      label(p, text, opt = {}) {
        let el = labelPool[labelUsed];
        if (!el) { el = h("span", { class: "g3-label" }); labels.append(el); labelPool.push(el); }
        labelUsed++;
        if (el._t !== text) { math(el, text); el._t = text; el._w = 0; }
        const s = project(p);
        el.className = "g3-label" + (opt.small ? " small" : "") + (opt.bg ? " bg" : "") + (opt.cls ? " " + opt.cls : "");
        el.style.color = opt.color ? (Array.isArray(opt.color) ? `rgb(${opt.color.map((x) => Math.round(x * 255))})` : opt.color.startsWith("--") ? `var(${opt.color})` : opt.color) : "";
        el.style.display = s[2] > 0 ? "" : "none";
        const ax = opt.anchor === "right" ? "-100%" : opt.anchor === "center" ? "-50%" : "0";
        // keep labels from sitting on top of each other: nudge a new one below/above the ones already placed
        const wEst = (el._w ||= 0) || (el._w = Math.max(18, el.offsetWidth)), hEst = opt.small ? 16 : 19;
        let x = s[0] + (opt.dx ?? 6) - (opt.anchor === "right" ? wEst : opt.anchor === "center" ? wEst / 2 : 0), y = s[1] + (opt.dy ?? -8);
        if (s[2] > 0) {
          for (let tries = 0; tries < 6; tries++) { const hit = labelBoxes.find((b) => x < b[0] + b[2] && x + wEst > b[0] && Math.abs(y - b[1]) < (hEst + b[3]) / 2); if (!hit) break; y = hit[1] + ((tries % 2 ? -1 : 1) * (hEst + hit[3])) / 2 + (tries % 2 ? -1 : 1); }
          labelBoxes.push([x, y, wEst, hEst]);
        }
        el.style.transform = `translate(${(x + (opt.anchor === "right" ? wEst : opt.anchor === "center" ? wEst / 2 : 0)).toFixed(1)}px, ${y.toFixed(1)}px) translate(${ax}, -50%)`;
      },
      // an articulated robot built by Viz.rob (links with world poses Rw, pw and geoms)
      robot(rb, opt = {}) {
        for (let li = 0; li < rb.links.length; li++) {
          const L = rb.links[li], Rw = L.Rw, pw = L.pw;
          if (!Rw) continue;
          const tw = (q) => add(pw, [0, 1, 2].map((k) => Rw[k][0] * q[0] + Rw[k][1] * q[1] + Rw[k][2] * q[2]));
          const override = opt.color ? opt.color(li, L) : null;
          for (const ge of L.geoms || []) {
            const col = override || P[ge.color] || ge.color || P.body, oo = { alpha: opt.alpha, shadow: opt.shadow, onTop: opt.onTop };
            if (ge.kind === "capsule") g.capsule(tw(ge.a), tw(ge.b), ge.r, col, oo);
            else if (ge.kind === "cyl") g.cyl(tw(ge.a), tw(ge.b), ge.r, col, oo);
            else if (ge.kind === "sphere") g.sphere(tw(ge.center || [0, 0, 0]), ge.r, col, oo);
            else if (ge.kind === "box") { const Rb = ge.R ? Rw.map((row) => [0, 1, 2].map((j) => row[0] * ge.R[0][j] + row[1] * ge.R[1][j] + row[2] * ge.R[2][j])) : Rw; g.box(tw(ge.center || [0, 0, 0]), Rb, ge.size, col, oo); }
          }
        }
      },
      project, pxWorld, cam,
    };

    // ---------------- render
    function drawItem(G, it, vp) {
      const { gl, loc, meshes } = G;
      let m = meshes[it.mesh];
      if (it.mesh === "dyn") {
        const pts = it.pts, pos = new Float32Array(pts.length * 6);
        const n = pts.length >= 3 ? unit(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]))) : [0, 0, 1];
        pts.forEach((p, i) => { pos.set(p, i * 6); pos.set(n, i * 6 + 3); });
        const idx = []; for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.DYNAMIC_DRAW);
        m.n = idx.length;
      } else { gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); }
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      const R = it.R;
      gl.uniformMatrix4fv(loc.uVP, false, vp);
      gl.uniformMatrix3fv(loc.uRot, false, [R[0][0], R[1][0], R[2][0], R[0][1], R[1][1], R[2][1], R[0][2], R[1][2], R[2][2]]);
      gl.uniform3fv(loc.uScale, it.scale); gl.uniform3fv(loc.uPos, it.pos);
      gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
    }
    function render() {
      const G = initGL();
      if (!G) return;
      const { gl, loc } = G;
      const r = wrap.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(2, Math.round(r.width * dpr)); Hh = Math.max(2, Math.round(cssH * dpr));
      if (canvas.width !== W || canvas.height !== Hh) { canvas.width = W; canvas.height = Hh; }
      if (G.canvas.width < W || G.canvas.height < Hh) { G.canvas.width = Math.max(G.canvas.width, W); G.canvas.height = Math.max(G.canvas.height, Hh); }
      camera();
      items = []; labelUsed = 0; labelBoxes = [];
      // floor
      if (o.ground !== false) {
        const S = o.groundSize || 3, step = o.grid || 0.5, c = [Math.round(cam.target[0] / step) * step, Math.round(cam.target[1] / step) * step];
        push("box", I3, [2 * S, 2 * S, 0.001], [c[0], c[1], -0.0005], P.ground, { unlit: true, ground: true });
        for (let i = -Math.round(S / step); i <= Math.round(S / step); i++) {
          const major = Math.abs(((c[0] + i * step) / step) % 2) < 1e-6, majorY = Math.abs(((c[1] + i * step) / step) % 2) < 1e-6;
          g.line([c[0] + i * step, c[1] - S, 0], [c[0] + i * step, c[1] + S, 0], major ? P.gridMajor : P.grid, { w: 1, ground: true });
          g.line([c[0] - S, c[1] + i * step, 0], [c[0] + S, c[1] + i * step, 0], majorY ? P.gridMajor : P.grid, { w: 1, ground: true });
        }
      }
      try { o.draw?.(g, render.dt || 0); } catch (e) { console.error(e); }
      for (const hd of handles) { const p = hd.get(); if (!p) continue; g.sphere(p, hd.r, hd.color || P.target, { onTop: true, alpha: 0.95, unlit: false }); g.sphere(p, hd.r * 1.9, hd.color || P.target, { onTop: true, alpha: 0.22, unlit: true }); }
      for (let i = labelUsed; i < labelPool.length; i++) labelPool[i].style.display = "none";

      gl.viewport(0, 0, W, Hh);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, W, Hh);
      gl.clearColor(0, 0, 0, 0); gl.clearStencil(0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.useProgram(G.prog);
      gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1);
      gl.uniform3fv(loc.uEye, eye); gl.uniform3fv(loc.uLight, LIGHT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.CULL_FACE);
      const setCol = (it, a = it.alpha) => { gl.uniform4f(loc.uColor, it.color[0], it.color[1], it.color[2], a); gl.uniform1f(loc.uLit, it.lit ? 1 : 0); };
      // 1. the floor layer: ground, grid, floor decals — no depth
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      for (const it of items) if (it.ground) { setCol(it); drawItem(G, it, VP); }
      // 2. shadows, flattened onto the floor along the light; the stencil keeps overlaps from darkening twice
      if (o.shadows !== false && o.ground !== false) {
        const S4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, -LIGHT[0] / LIGHT[2], -LIGHT[1] / LIGHT[2], 0, 0, 0, 0, 0.001, 1]);
        const SVP = m4mul(VP, S4);
        gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.NOTEQUAL, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        gl.uniform1f(loc.uLit, 0); gl.uniform4f(loc.uColor, 0, 0, 0, P.shadow);
        for (const it of items) if (it.shadow && it.pos[2] > -0.05) drawItem(G, it, SVP);
        gl.disable(gl.STENCIL_TEST);
      }
      // 3. solids
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL);
      for (const it of items) if (!it.ground && !it.onTop && it.alpha >= 0.999) { setCol(it); drawItem(G, it, VP); }
      // 4. see-through things, far to near
      const tr = items.filter((it) => !it.ground && !it.onTop && it.alpha < 0.999);
      const depthOf = (it) => dot(sub(it.pts ? it.pts[0] : it.pos, eye), fwd);
      tr.sort((a, b) => depthOf(b) - depthOf(a));
      gl.depthMask(false);
      for (const it of tr) { setCol(it); drawItem(G, it, VP); }
      // 5. markers that must stay visible through a body
      gl.disable(gl.DEPTH_TEST);
      for (const it of items) if (it.onTop) { setCol(it); drawItem(G, it, VP); }
      gl.depthMask(true); gl.disable(gl.SCISSOR_TEST);
      ctx.clearRect(0, 0, W, Hh);
      ctx.drawImage(G.canvas, 0, G.canvas.height - Hh, W, Hh, 0, 0, W, Hh);
      dirty = false;
    }
    function loop(t) {
      raf = 0;
      if (!wrap.isConnected) { animating = false; return; }
      render.dt = animating && last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      if (visible && (animating || dirty)) render();
      if (animating) raf = requestAnimationFrame(loop);
    }
    const redraw = () => { dirty = true; if (!raf) raf = requestAnimationFrame(loop); };
    const api = {
      g, cam, redraw, project, ray, wrap, tools,
      animate(on) { animating = !!on; last = 0; if (on) redraw(); },
      get animating() { return animating; },
      // a draggable point: get() → world position, set(p) receives the new one; plane: "ground" (keeps z), "xz", "yz" or "camera"
      handle(hd) { handles.push({ r: 0.035, plane: "camera", ...hd }); redraw(); return hd; },
      setView(v, snap) { Object.assign(cam, v); if (v.target) cam.target = v.target.slice(); if (snap) Object.assign(home, JSON.parse(JSON.stringify(cam))); redraw(); },
      resetView() { Object.assign(cam, JSON.parse(JSON.stringify(home))); redraw(); },
    };

    // ---------------- pointer: drag a handle, otherwise orbit; ± buttons zoom
    let drag = null;
    const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const hit = (xy) => { let best = null, bd = 26; for (const hd of handles) { const p = hd.get(); if (!p) continue; const s = project(p), d = Math.hypot(s[0] - xy[0], s[1] - xy[1]); if (d < bd) { bd = d; best = hd; } } return best; };
    canvas.addEventListener("touchstart", (e) => { const t = e.touches[0], r = canvas.getBoundingClientRect(); if (VP && hit([t.clientX - r.left, t.clientY - r.top])) e.preventDefault(); }, { passive: false });
    canvas.addEventListener("pointerdown", (e) => {
      if (!VP) return;
      const xy = local(e), hd = hit(xy);
      drag = hd ? { hd, p0: hd.get().slice() } : { x: e.clientX, y: e.clientY };
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      wrap.classList.add("dragging");
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      if (drag.hd) {
        const { o: ro, d: rd } = ray(...local(e)), p0 = drag.p0, pl = drag.hd.plane;
        const n = pl === "ground" ? [0, 0, 1] : pl === "xz" ? [0, 1, 0] : pl === "yz" ? [1, 0, 0] : mul(fwd, -1);
        const den = dot(rd, n);
        if (Math.abs(den) > 1e-4) { const t = dot(sub(p0, ro), n) / den; if (t > 0) { drag.hd.set(add(ro, mul(rd, t))); redraw(); } }
      } else {
        cam.yaw -= (e.clientX - drag.x) * 0.008; cam.pitch = clamp(cam.pitch + (e.clientY - drag.y) * 0.008, 0.03, 1.5);
        drag.x = e.clientX; drag.y = e.clientY; redraw();
      }
    });
    const end = () => { if (drag?.hd?.end) drag.hd.end(); drag = null; wrap.classList.remove("dragging"); };
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
    const zoom = (k) => { cam.dist = clamp(cam.dist * k, (o.minDist ?? home.dist * 0.35), (o.maxDist ?? home.dist * 3)); redraw(); };
    const tb = (txt, title, fn) => h("button", { type: "button", class: "g3-tb", title, "aria-label": title, onclick: fn }, txt);
    const zhUI = (document.documentElement.lang || "").startsWith("zh");
    tools.append(tb("+", zhUI ? "放大" : "Zoom in", () => zoom(0.8)), tb("−", zhUI ? "缩小" : "Zoom out", () => zoom(1.25)), tb("⟲", zhUI ? "复位视角" : "Reset view", () => api.resetView()));
    if (o.views !== false) for (const [txt, title, v] of [[zhUI ? "前" : "F", zhUI ? "正视图（从前往后看）" : "Front view", { yaw: Math.PI / 2, pitch: 0.06 }], [zhUI ? "侧" : "S", zhUI ? "侧视图" : "Side view", { yaw: 0, pitch: 0.06 }], [zhUI ? "顶" : "T", zhUI ? "俯视图" : "Top view", { yaw: 0, pitch: 1.5 }]]) tools.append(tb(txt, title, () => { Object.assign(cam, v); redraw(); }));

    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) redraw(); }).observe(wrap);
    if ("ResizeObserver" in window) new ResizeObserver(() => redraw()).observe(wrap);
    redraw();
    return api;
  }

  Viz.g3 = { view, palette, rgbOf, basisZ, vec: { add, sub, mul, dot, cross, len, unit }, get ok() { return !!initGL(); } };
})();
