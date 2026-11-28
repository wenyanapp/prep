"use strict";
// Interactive figures for content `viz` blocks. tools/build.mjs turns each block into
// <div class="viz" data-cfg="{json}">; Viz.mountAll(container) brings them to life.
// Types (see CONTENT_SPEC.md): plot, bars, heatmap, frames, matrix2d, gridworld, gd2d,
// arm2d, filter, diffusion2d, kmeans, timeline. Colours come from CSS variables, so
// light/dark themes just work. Everything is self-contained and offline.
(() => {
  const NS = "http://www.w3.org/2000/svg";
  let uid = 0;

  // ------------------------------------------------------------------ helpers
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null) { if (c.nodeType) e.append(c); else e.append(...mathNodes(String(c))); }
    return e;
  }
  // "$…$" inside any label, title, legend entry or caption is typeset by KaTeX (vendor/katex,
  // same delimiter rule as the build: no space inside the dollars, no digit after the closing one).
  const MACROS = { "\\argmax": "\\operatorname*{arg\\,max}", "\\argmin": "\\operatorname*{arg\\,min}", "\\E": "\\mathbb{E}" };
  function mathNodes(str) {
    if (str.indexOf("$") === -1) return [document.createTextNode(str)];
    const out = [];
    let i = 0, from = 0;
    while (i < str.length) {
      if (str[i] === "\\") { i += 2; continue; }
      if (str[i] === "$" && str[i + 1] && !/\s/.test(str[i + 1])) {
        let j = i + 1;
        while (j < str.length) {
          if (str[j] === "\\") { j += 2; continue; }
          if (str[j] === "$" && !/\s/.test(str[j - 1]) && !/\d/.test(str[j + 1] || "")) break;
          j++;
        }
        if (str[j] === "$") {
          if (i > from) out.push(document.createTextNode(str.slice(from, i)));
          const tex = str.slice(i + 1, j);
          const sp = document.createElement("span");
          sp.className = "viz-math";
          try { sp.innerHTML = window.katex.renderToString(tex, { throwOnError: false, strict: "ignore", output: "html", macros: { ...MACROS } }); } catch { sp.textContent = tex; }
          out.push(sp);
          i = from = j + 1;
          continue;
        }
      }
      i++;
    }
    if (from < str.length) out.push(document.createTextNode(str.slice(from)));
    return out;
  }
  // Replace an element's content with text that may contain "$…$".
  const math = (el, str) => { el.replaceChildren(...mathNodes(String(str ?? ""))); return el; };
  function s(tag, attrs, ...kids) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, v);
    for (const c of kids.flat()) if (c != null) { if (c.nodeType) e.append(c); else if (tag === "text" && String(c).indexOf("$") !== -1) e.append(...svgTextNodes(String(c))); else e.append(document.createTextNode(texPlain(String(c)))); }
    return e;
  }
  // SVG text cannot hold KaTeX: "$…$" there is written with Unicode symbols instead.
  const TEX_SYM = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", varpi: "ϖ", rho: "ρ", varrho: "ϱ", sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω", cdot: "·", times: "×", div: "÷", ast: "∗", le: "≤", leq: "≤", ge: "≥", geq: "≥", ll: "≪", gg: "≫", lesssim: "≲", gtrsim: "≳", ne: "≠", neq: "≠", approx: "≈", equiv: "≡", triangleq: "≜", coloneqq: "≔", pm: "±", mp: "∓", to: "→", rightarrow: "→", leftarrow: "←", leftrightarrow: "↔", Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔", implies: "⇒", iff: "⇔", mapsto: "↦", uparrow: "↑", downarrow: "↓", infty: "∞", partial: "∂", nabla: "∇", in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", cup: "∪", cap: "∩", setminus: "∖", emptyset: "∅", varnothing: "∅", forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨", wedge: "∧", vee: "∨", sum: "∑", prod: "∏", int: "∫", oint: "∮", top: "ᵀ", intercal: "ᵀ", ell: "ℓ", hbar: "ħ", circ: "∘", bullet: "•", otimes: "⊗", oplus: "⊕", odot: "⊙", perp: "⊥", parallel: "∥", angle: "∠", degree: "°", lVert: "‖", rVert: "‖", Vert: "‖", "|": "‖", lvert: "|", rvert: "|", vert: "|", quad: "  ", qquad: "    ", ",": "\u2009", ":": "\u2005", ";": " ", "!": "", " ": " ", dots: "…", ldots: "…", cdots: "⋯", vdots: "⋮", langle: "⟨", rangle: "⟩", propto: "∝", sim: "∼", simeq: "≃", cong: "≅", mid: "|", star: "⋆", dagger: "†", prime: "′", lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉", "%": "%", "#": "#", "&": "&", _: "_", left: "", right: "", big: "", Big: "", bigg: "", Bigg: "", bigl: "", bigr: "", Bigl: "", Bigr: "", displaystyle: "", textstyle: "", limits: "", nolimits: "" };
  const SUPS = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", n: "ⁿ", i: "ⁱ", T: "ᵀ", "ᵀ": "ᵀ", "′": "′", "*": "*", "(": "⁽", ")": "⁾" };
  const SUBS = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ" };
  const ACCENT = { dot: "\u0307", ddot: "\u0308", hat: "\u0302", widehat: "\u0302", tilde: "\u0303", widetilde: "\u0303", bar: "\u0304", overline: "\u0305", vec: "\u20d7" };
  const FUNCS = /^(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|lg|exp|max|min|det|arg|lim|sup|inf|dim|ker|deg|gcd|Pr|tr|diag|rank|sign|sgn)$/;
  // \cmd{…} groups are replaced innermost-first (so nested braces work). Each result keeps a pair
  // of braces so it cannot merge with a preceding command name (\lVert\text{x} → ‖x, not "lVertx").
  function texGroups(t) {
    for (let k = 0; k < 6; k++) {
      const before = t;
      t = t.replace(/\\(?:mathrm|mathbf|boldsymbol|bm|mathit|mathsf|mathtt|mathcal|mathbb|mathfrak|text|textrm|textbf|textit|mbox|operatorname\*?)\s*\{([^{}]*)\}/g, "{$1}");
      t = t.replace(/\\(?:mathbf|boldsymbol|bm|mathrm|mathcal|mathbb|mathit)\s*([A-Za-z])/g, "{$1}");
      t = t.replace(/\\(dot|ddot|hat|widehat|tilde|widetilde|bar|overline|vec)\s*(?:\{([^{}]*)\}|(\\[A-Za-z]+|[A-Za-z0-9]))/g, (_, a, b, c) => {
        const x = texOne(b ?? c, true);
        // one letter: a combining accent, composed where Unicode has the letter (ḋ, ẍ, ä) so fonts place it well
        if ([...x].length === 1 || /^.[\u0300-\u036f]$/u.test(x)) return "{" + (x + ACCENT[a]).normalize("NFC") + "}";
        return "{" + (a === "dot" ? `d(${x})/dt` : a === "ddot" ? `d²(${x})/dt²` : x) + "}";
      });
      t = t.replace(/\\[dt]?frac\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_, a, b) => `{${/[+\-−\s]/.test(a.trim()) ? "(" + a + ")" : a}/${/[+\-−\s·/]/.test(b.trim()) ? "(" + b + ")" : b}}`);
      t = t.replace(/\\[dt]?frac\s*([A-Za-z0-9])\s*([A-Za-z0-9])/g, "{$1/$2}");
      t = t.replace(/\\sqrt\s*(?:\[([^\]]*)\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_, n, a) => `{${n === "3" ? "∛" : n === "4" ? "∜" : (n || "") + "√"}${/^\s*[A-Za-z0-9]\s*$/.test(a) ? a.trim() : "(" + a + ")"}}`);
      if (t === before) break;
    }
    return t;
  }
  function texOne(t, inner = false) {
    t = texGroups(t);
    t = t.replace(/\\([A-Za-z]+|[|,:;! %#&_{}])/g, (m, n, at, all) => (n === "{" ? "\uE004" : n === "}" ? "\uE005" : n in TEX_SYM ? TEX_SYM[n] : FUNCS.test(n) && /[^\s_^]/.test(all[at + m.length] || " ") ? n + "\u2009" : n));
    if (!inner) t = t.replace(/-/g, "−").replace(/'/g, "′");
    const scr = (map, body) => { const cs = [...body]; return cs.length && cs.every((c) => c in map) ? cs.map((c) => map[c]).join("") : null; };
    // sub/superscripts without a Unicode form are marked (\ue000…\ue001 sub, \ue002…\ue003 super) and drawn as shifted <tspan>s
    const grp = (a, b) => (a ?? b).replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
    t = t.replace(/\^\s*(?:\{((?:[^{}]|\{[^{}]*\})*)\}|(.))/gu, (m, a, b) => { const x = grp(a, b); return scr(SUPS, x) ?? "\ue002" + x + "\ue003"; });
    t = t.replace(/_\s*(?:\{((?:[^{}]|\{[^{}]*\})*)\}|(.))/gu, (m, a, b) => { const x = grp(a, b); return scr(SUBS, x) ?? "\ue000" + x + "\ue001"; });
    return t.replace(/[{}]/g, "").replace(/\s+/g, " ").replace(/\uE004/g, "{").replace(/\uE005/g, "}").trim();
  }
  const unmark = (t) => t.replace(/\uE000([^\uE001]*)\uE001/g, (m, x) => "_" + x).replace(/\uE002([^\uE003]*)\uE003/g, (m, x) => "^" + (x.length > 1 ? "(" + x + ")" : x));
  function svgTextNodes(str) {
    const t = texPlain(str, true);
    if (!/[\uE000\uE002]/.test(t)) return [document.createTextNode(t)];
    const out = [];
    let shift = 0;
    for (const part of t.split(/(\uE000[^\uE001]*\uE001|\uE002[^\uE003]*\uE003)/)) {
      if (!part) continue;
      const sub = part[0] === "\uE000", sup = part[0] === "\uE002";
      const ts = document.createElementNS(NS, "tspan");
      // offsets in units of the surrounding font; a 78 % tspan's own em is 0.78 of that
      const want = sub ? 0.28 : sup ? -0.42 : 0, own = sub || sup ? 0.78 : 1;
      ts.setAttribute("dy", ((want - shift) / own).toFixed(2) + "em");
      shift = want;
      if (sub || sup) ts.setAttribute("font-size", "78%");
      ts.textContent = sub || sup ? part.slice(1, -1) : part;
      out.push(ts);
    }
    return out;
  }
  function texPlain(str, keepMarks = false) {
    if (str.indexOf("$") === -1) return str;
    if (!keepMarks) return unmark(texPlain(str, true));
    let out = "", i = 0, from = 0;
    while (i < str.length) {
      if (str[i] === "\\") { i += 2; continue; }
      if (str[i] === "$" && str[i + 1] && !/\s/.test(str[i + 1])) {
        let j = i + 1;
        while (j < str.length) {
          if (str[j] === "\\") { j += 2; continue; }
          if (str[j] === "$" && !/\s/.test(str[j - 1]) && !/\d/.test(str[j + 1] || "")) break;
          j++;
        }
        if (str[j] === "$") { out += str.slice(from, i) + texOne(str.slice(i + 1, j)); i = from = j + 1; continue; }
      }
      i++;
    }
    return out + str.slice(from);
  }
  const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888";
  const pal = () => ["--v1", "--v2", "--v3", "--v4", "--v5", "--v6"].map(cssv);
  function rgb(c) {
    c = c.trim();
    if (c.startsWith("#")) {
      if (c.length === 4) c = "#" + [...c.slice(1)].map((x) => x + x).join("");
      return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    }
    const m = c.match(/\d+(\.\d+)?/g);
    return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
  }
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * t)).join(",")})`; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // Numbers for readouts: plain integers up to a million ("1120", not "1.1e+3"), two significant
  // digits for small values ("0.004"), and "2.5×10⁶" only for really large or tiny ones.
  const SUPD = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const sci = (v, d = 1) => { const [m, e] = v.toExponential(d).split("e"); return `${m}×10${String(+e).replace("-", "⁻").replace(/\d/g, (c) => SUPD[c])}`; };
  const fmt = (v) => {
    if (!isFinite(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return sci(v);
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    if (a >= 0.01 || v === 0) return v.toFixed(2);
    if (a >= 1e-4) return String(+v.toPrecision(2));
    return sci(v);
  };
  // decimals needed to write a step size exactly (0.25 → 2, 5 → 0)
  const stepDecimals = (st) => { for (let d = 0; d <= 6; d++) { const x = Math.abs(st) * 10 ** d; if (Math.abs(x - Math.round(x)) < 1e-6 * Math.max(1, x)) return d; } return 6; };
  const noNegZero = (s) => (/^-0(\.0*)?$/.test(s) ? s.slice(1) : s);
  // Tick labels share the decimals their spacing needs: 0, 2, 4 (not 0.00, 2.00) and 0.5, 1.0, 1.5.
  function tickFmt(ticks) {
    const st = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 0;
    const mx = Math.max(0, ...ticks.map(Math.abs));
    if (mx >= 1e6 || (mx > 0 && mx < 1e-3)) return (v) => (v === 0 ? "0" : sci(v, Math.max(0, Math.min(3, stepDecimals(st / 10 ** Math.floor(Math.log10(Math.abs(v))))))));
    const d = st > 0 ? stepDecimals(st) : 2;
    return (v) => noNegZero(v.toFixed(d)).replace(/^-/, "−");
  }
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const randn = (r) => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };

  const HELPERS = {
    softmax: (a) => { const m = Math.max(...a); const e = a.map((v) => Math.exp(v - m)); const z = e.reduce((x, y) => x + y, 0); return e.map((v) => v / z); },
    normalize: (a) => { const z = a.reduce((x, y) => x + y, 0) || 1; return a.map((v) => v / z); },
    cumsum: (a) => { let c = 0; return a.map((v) => (c += v)); },
    range: (n) => Array.from({ length: n }, (_, i) => i),
    linspace: (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / Math.max(1, n - 1)),
    sortDesc: (a) => [...a].sort((x, y) => y - x),
  };
  const HN = Object.keys(HELPERS), HV = Object.values(HELPERS);
  // `with (Math)` lets content write exp(x) instead of Math.exp(x). The params are re-bound as the
  // arguments of an inner function, so a param called E, PI, max or log is the slider value, not Math's.
  const compile = (expr, args) => {
    const all = [...args, ...HN].join(", ");
    return new Function(...args, ...HN, `const __a = [${all}]; with (Math) { return ((${all}) => (${expr}))(...__a); }`);
  };
  // ------------------------------------------------------------------ text measuring and wrapping
  let mctx = null, mfont = "";
  const plainOf = (str) => texPlain(String(str ?? ""), true).replace(/[\ue000-\ue003]/g, "");
  function textWidth(str, px = 12.5, weight = 600) {
    if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); mfont = getComputedStyle(document.body).fontFamily || "sans-serif"; }
    mctx.font = `${weight} ${px}px ${mfont}`;
    return mctx.measureText(plainOf(str)).width;
  }
  // Words (and single CJK characters) of a label; a "$…$" formula is never split.
  function wordTokens(str) {
    const out = [];
    let cur = "", inM = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === "\\") { cur += c + (str[i + 1] ?? ""); i++; continue; }
      if (c === "$") { inM = !inM; cur += c; continue; }
      if (!inM && /\s/.test(c)) { if (cur) out.push(cur); out.push(" "); cur = ""; continue; }
      if (!inM && /[⺀-鿿가-힯＀-￯]/.test(c)) { if (cur) out.push(cur); out.push(c); cur = ""; continue; }
      cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }
  // Greedy line breaking to maxW (SVG user units at font size px). Returns raw lines (may hold "$…$").
  function wrapText(str, maxW, px = 12.5, weight = 600, maxLines = 3) {
    const lines = [];
    let cur = "";
    for (const t of wordTokens(String(str ?? ""))) {
      const next = cur + t;
      if (cur.trim() && textWidth(next.trim(), px, weight) > maxW) { lines.push(cur.trim()); cur = t === " " ? "" : t; }
      else cur = next;
    }
    if (cur.trim()) lines.push(cur.trim());
    if (lines.length > maxLines) { const keep = lines.slice(0, maxLines); keep[maxLines - 1] += " …"; return keep; }
    return lines.length ? lines : [""];
  }
  // <text> with one <tspan> per line; y is the first baseline, lh the line height in px.
  function svgLines(attrs, lines, lh) {
    const t = s("text", attrs);
    lines.forEach((ln, i) => {
      const ts = s("tspan", { x: attrs.x, y: +attrs.y + i * lh });
      ts.append(...(ln.indexOf("$") !== -1 ? svgTextNodes(ln) : [document.createTextNode(ln)]));
      t.append(ts);
    });
    return t;
  }

  const T = () => (document.documentElement.lang || "").startsWith("zh")
    ? { play: "播放", pause: "暂停", step: "单步", reset: "重置", next: "下一帧", prev: "上一帧", iter: "迭代", sample: "采样", move: "移动", sense: "观测", predict: "预测", update: "更新", resample: "重采样", auto: "自动", newData: "新数据", drag: "点击或拖动设置目标", bubble: "流水线气泡", time: "时间" }
    : { play: "Play", pause: "Pause", step: "Step", reset: "Reset", next: "Next", prev: "Back", iter: "iteration", sample: "Sample", move: "Move", sense: "Sense", predict: "Predict", update: "Update", resample: "Resample", auto: "Auto", newData: "New data", drag: "Tap or drag to set the target", bubble: "pipeline bubble", time: "time" };

  function animator(root, tick) {
    let raf = 0, on = false, last = 0;
    const loop = (t) => {
      if (!on) return;
      if (!root.isConnected) { on = false; return; }
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      if (tick(dt) === false) { on = false; a.onStop?.(); return; }
      raf = requestAnimationFrame(loop);
    };
    const a = {
      start() { if (on) return; on = true; last = 0; raf = requestAnimationFrame(loop); },
      stop() { on = false; cancelAnimationFrame(raf); },
      get on() { return on; },
      onStop: null,
    };
    return a;
  }
  function shell(root, cfg) {
    root.innerHTML = "";
    root.classList.add("viz-on");
    const head = cfg.title ? h("div", { class: "viz-title" }, cfg.title) : null;
    const stage = h("div", { class: "viz-stage" });
    const ctrls = h("div", { class: "viz-ctrls" });
    const foot = h("div", { class: "viz-foot" });
    root.append(...[head, stage, ctrls, foot].filter(Boolean));
    return { stage, ctrls, foot };
  }
  function slider(label, o, onInput, log = false) {
    const toPos = (v) => (log ? Math.log10(v) : v);
    const fromPos = (p) => (log ? 10 ** p : p);
    const min = toPos(o.min), max = toPos(o.max);
    // the value shows the decimals its step can produce (step 1 → "4", step 0.002 → "0.044")
    const d = !log && o.step > 0 ? stepDecimals(o.step) : null;
    // a config may hand over the value as a one-element list or a string
    o = { ...o, value: Array.isArray(o.value) ? +o.value[0] : +o.value };
    const f = (v) => (!isFinite(v) ? "—" : d == null || Math.abs(v) >= 1e6 ? fmt(v) : noNegZero((+v).toFixed(d)));
    const val = h("span", { class: "viz-val" }, f(o.value));
    // reserve the width of the longest value so the text never runs into the next control
    val.style.minWidth = Math.max(...[o.min, o.max, o.value].map((x) => f(x).length)) + (log || d == null ? 1.5 : 0.5) + "ch";
    const inp = h("input", { type: "range", min, max, step: log ? (max - min) / 200 : o.step ?? (o.max - o.min) / 200, value: toPos(o.value) });
    inp.addEventListener("input", () => { const v = fromPos(+inp.value); val.textContent = f(v); onInput(v); });
    // the label span always exists (a scene may fill it later); it takes no room while empty
    const lbl = h("span", { class: "viz-lbl" }, label == null ? "" : label);
    const row = h("label", { class: "viz-slider" }, lbl, h("span", { class: "viz-rng" }, inp, val));
    row.set = (v) => { inp.value = toPos(v); val.textContent = f(v); };
    return row;
  }
  const btn = (label, onClick, cls = "") => h("button", { class: "viz-btn " + cls, type: "button", onclick: onClick }, label);
  function seg(options, value, onPick) {
    const wrap = h("div", { class: "viz-seg" });
    const draw = (v) => { wrap.innerHTML = ""; for (const [k, l] of options) wrap.append(h("button", { type: "button", class: k === v ? "on" : "", onclick: () => { draw(k); onPick(k); } }, l)); };
    draw(value);
    return wrap;
  }
  function playButton(an, onStart) {
    const b = btn("▶ " + T().play, () => {
      if (an.on) { an.stop(); b.textContent = "▶ " + T().play; }
      else { onStart?.(); an.start(); b.textContent = "❚❚ " + T().pause; }
    }, "primary");
    an.onStop = () => (b.textContent = "▶ " + T().play);
    b.reset = () => { an.stop(); b.textContent = "▶ " + T().play; };
    return b;
  }
  // A monospace read-out (<pre class="so3-mat">) next to a picture, called after its text is set.
  // Its flex basis is its longest line, so in a narrow column it moves under the picture instead
  // of being cut off; if even a full row is narrower than that line, the font shrinks (≥ 9 px).
  function fitPre(pre, px = 12.5) {
    const cols = Math.max(1, ...pre.textContent.split("\n").map((l) => [...l].reduce((a, c) => a + (/[⺀-鿿＀-｠]/.test(c) ? 2 : 1), 0)));
    pre.style.flex = `1 1 calc(${cols}ch + 28px)`;
    pre.style.minWidth = "0";
    pre.style.fontSize = px + "px";
    for (let k = 0; k < 3 && pre.clientWidth > 0 && pre.scrollWidth > pre.clientWidth + 1; k++) {
      px = Math.max(9, Math.floor(px * (pre.clientWidth / pre.scrollWidth) * 10) / 10 - 0.1);
      pre.style.fontSize = px + "px";
      if (px <= 9) break;
    }
  }
  function niceTicks(a, b, n = 5) {
    const span = b - a;
    if (!(span > 0)) return [a];
    const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), e = raw / mag;
    const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
    const out = [];
    for (let v = Math.ceil(a / step) * step; v <= b + step * 1e-6; v += step) out.push(+v.toFixed(12));
    return out;
  }
  // o.noX: no x ticks (bars draw their own category labels).
  function axes(svg, W, H, pad, xr, yr, xlabel, ylabel, o = {}) {
    const X = (x) => pad.l + ((x - xr[0]) / (xr[1] - xr[0])) * (W - pad.l - pad.r);
    const Y = (y) => H - pad.b - ((y - yr[0]) / (yr[1] - yr[0])) * (H - pad.t - pad.b);
    const g = s("g", { class: "viz-axes" });
    if (!o.noX) {
      const xt = niceTicks(xr[0], xr[1], 6), fx = tickFmt(xt);
      for (const t of xt) {
        g.append(s("line", { x1: X(t), x2: X(t), y1: pad.t, y2: H - pad.b, class: "grid" }));
        g.append(s("text", { x: X(t), y: H - pad.b + 15, "text-anchor": "middle", class: "tick" }, fx(t)));
      }
    }
    const yt = niceTicks(yr[0], yr[1], 5), fy = tickFmt(yt);
    for (const t of yt) {
      g.append(s("line", { x1: pad.l, x2: W - pad.r, y1: Y(t), y2: Y(t), class: "grid" }));
      g.append(s("text", { x: pad.l - 6, y: Y(t) + 4, "text-anchor": "end", class: "tick" }, fy(t)));
    }
    if (xr[0] < 0 && xr[1] > 0) g.append(s("line", { x1: X(0), x2: X(0), y1: pad.t, y2: H - pad.b, class: "axis0" }));
    if (yr[0] < 0 && yr[1] > 0) g.append(s("line", { x1: pad.l, x2: W - pad.r, y1: Y(0), y2: Y(0), class: "axis0" }));
    g.append(s("rect", { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, class: "frame" }));
    // the x title sits one row below the tick labels, with room under it for subscripts
    if (xlabel) g.append(s("text", { x: (pad.l + W - pad.r) / 2, y: Math.min(H - 4, H - pad.b + 32), "text-anchor": "middle", class: "label" }, xlabel));
    if (ylabel) g.append(s("text", { x: 13, y: (pad.t + H - pad.b) / 2, "text-anchor": "middle", class: "label", transform: `rotate(-90 13 ${(pad.t + H - pad.b) / 2})` }, ylabel));
    svg.append(g);
    return { X, Y };
  }
  // left padding wide enough for the y tick labels (and the rotated y title)
  const yPad = (yr, ylabel, min = 50) => { const yt = niceTicks(yr[0], yr[1], 5), fy = tickFmt(yt); return Math.max(min, Math.ceil(Math.max(...yt.map((t) => textWidth(fy(t), 11.5, 400)))) + (ylabel ? 30 : 12)); };
  // items: [label, colour, style] with style true / "dashed", "dotted", "solid" (default) or "box"
  // (a filled swatch, for bars and blocks); an optional 4th entry is the line width.
  const DASH = { dashed: "7 5", dotted: "1.5 4.5" };
  function legend(items) {
    return h("div", { class: "viz-legend" }, items.map(([label, color, style, width]) => {
      const st = style === true ? "dashed" : style || "solid";
      const sw = s("svg", { class: "viz-sw", viewBox: "0 0 26 12", width: 26, height: 12, "aria-hidden": "true" },
        st === "box" ? s("rect", { x: 3, y: 1.5, width: 20, height: 9, rx: 2, fill: color })
          : s("line", { x1: 2, y1: 6, x2: 24, y2: 6, stroke: color, "stroke-width": Math.min(4, width || 3), "stroke-linecap": "round", "stroke-dasharray": DASH[st] || null }));
      return h("span", {}, sw, h("span", { class: "viz-lg" }, label));
    }));
  }
  const arrowPath = (x1, y1, x2, y2, size = 9) => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const p = (r, d) => `${(x2 - size * Math.cos(a - r)).toFixed(1)},${(y2 - size * Math.sin(a - r)).toFixed(1)}`;
    return `M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}M${p(0.45)}L${x2.toFixed(1)},${y2.toFixed(1)}L${p(-0.45)}`;
  };

  // Sliders for cfg.params (plot, bars, heatmap); a param with "play": true gets a Play button.
  function paramSliders(root, ctrls, P, vals, redraw) {
    for (const k of Object.keys(P)) {
      const o = P[k];
      const row = slider(o.label || k, { ...o, value: vals[k] }, (v) => { vals[k] = v; redraw(); }, o.log);
      ctrls.append(row);
      if (o.play) {
        // Play sweeps the slider there and back. It moves on the slider's own step grid, so a
        // param used as an index ("[a, b, c][g]") only ever takes the values the slider can show,
        // and a slider with few states holds each one long enough to read (about 0.9 s).
        let dir = 1, u = null, last;
        const st = !o.log && +o.step > 0 ? +o.step : 0, n = st ? Math.round((o.max - o.min) / st) : 0;
        const dur = st && n <= 40 ? Math.max(4, 0.9 * (n + 1)) : 4;
        const snap = (v) => (st ? Math.min(o.max, Math.max(o.min, o.min + Math.round((v - o.min) / st) * st)) : v);
        const an = animator(root, (dt) => {
          if (u == null || vals[k] !== last) u = vals[k]; // first frame, or the reader moved the slider
          u += (dir * (o.max - o.min) * dt) / dur;
          if (u > o.max) { u = o.max; dir = -1; }
          if (u < o.min) { u = o.min; dir = 1; }
          const v = snap(u);
          if (v !== vals[k]) { vals[k] = v; row.set(v); redraw(); }
          last = vals[k];
        });
        ctrls.append(playButton(an));
      }
    }
  }
  const curveClass = (c) => "curve" + (c.dashed || c.style === "dashed" ? " dashed" : c.style === "dotted" ? " dotted" : "");
  const curveStyle = (c) => (c.dashed || c.style === "dashed" ? "dashed" : c.style === "dotted" ? "dotted" : "solid");

  // ------------------------------------------------------------------ plot
  function plot(root, cfg) {
    const { stage, ctrls, foot } = shell(root, cfg);
    const W = 640, H = 330, pad = { l: 50, r: 16, t: 14, b: cfg.xlabel ? 44 : 28 };
    const P = cfg.params || {};
    const names = Object.keys(P);
    const vals = Object.fromEntries(names.map((k) => [k, P[k].value ?? P[k].min]));
    const args = () => names.map((k) => vals[k]);
    const num = (f, ...a) => { try { const v = f(...a); return typeof v === "number" ? v : NaN; } catch { return NaN; } };
    // a curve is y(x) ({fn}) or parametric ({param: ["x(t)", "y(t)"], t: [a, b]})
    const fns = cfg.curves.map((c) => (Array.isArray(c.param) ? { px: compile(c.param[0], ["t", ...names]), py: compile(c.param[1], ["t", ...names]) } : { f: compile(c.fn, ["x", ...names]) }));
    // a point is [x, y] or [x, y, "label"]; x and y may be expressions of the params, so it follows the sliders
    const coord = (v) => (typeof v === "string" ? compile(v, names) : () => v);
    const marks = (cfg.points || []).map((p) => ({ x: coord(p[0]), y: coord(p[1]), label: p[2] }));
    const points = () => { const a = args(); return marks.map((p) => [num(p.x, ...a, ...HV), num(p.y, ...a, ...HV), p.label]); };
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "viz-svg" });
    stage.append(svg);
    const cid = "vc" + ++uid;
    let yr = cfg.y ? [...cfg.y] : null;
    const N = 320;
    function sampleFn(f) {
      const a = args(), y = (x) => num(f, x, ...a, ...HV);
      const out = [];
      let px = null, py = NaN;
      for (let i = 0; i <= N; i++) {
        const x = cfg.x[0] + ((cfg.x[1] - cfg.x[0]) * i) / N, v = y(x);
        // where the curve starts or stops being defined (a square root reaching zero), find the end
        // point by bisection, so a circle drawn as two halves closes instead of stopping one sample short
        if (px != null && isFinite(py) !== isFinite(v)) {
          const good = isFinite(py);
          let lo = px, hi = x;
          for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (isFinite(y(m)) === good) lo = m; else hi = m; }
          const xe = good ? lo : hi, ye = y(xe);
          if (isFinite(ye)) out.push([xe, ye]);
        }
        out.push([x, v]);
        px = x; py = v;
      }
      return out;
    }
    function sampleParam(c, fp) {
      const a = args(), [t0, t1] = Array.isArray(c.t) ? c.t : [0, 2 * Math.PI], n = 480, out = [];
      for (let i = 0; i <= n; i++) { const t = t0 + ((t1 - t0) * i) / n; out.push([num(fp.px, t, ...a, ...HV), num(fp.py, t, ...a, ...HV)]); }
      return out;
    }
    const sample = () => fns.map((fp, i) => (fp.f ? sampleFn(fp.f) : sampleParam(cfg.curves[i], fp)));
    function autoY(curves, pts) {
      let lo = Infinity, hi = -Infinity;
      for (const c of curves) for (const [x, y] of c) if (isFinite(y) && x >= cfg.x[0] && x <= cfg.x[1]) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      for (const [, y] of pts) if (isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      if (!isFinite(lo)) { lo = -1; hi = 1; }
      if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
      const p = (hi - lo) * 0.08;
      return [lo - p, hi + p];
    }
    const colors = pal();
    const colorOf = (c, i) => colors[((c.color >= 1 && c.color <= 6 ? c.color - 1 : i) | 0) % 6];
    function draw() {
      const curves = sample(), pts = points();
      if (!cfg.y) { const a = autoY(curves, pts); yr = yr ? [Math.min(yr[0], a[0]), Math.max(yr[1], a[1])] : a; }
      pad.l = yPad(yr, cfg.ylabel);
      svg.innerHTML = "";
      svg.append(s("defs", {}, s("clipPath", { id: cid }, s("rect", { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b }))));
      const { X, Y } = axes(svg, W, H, pad, cfg.x, yr, cfg.xlabel, cfg.ylabel);
      const span = yr[1] - yr[0], xspan = cfg.x[1] - cfg.x[0];
      curves.forEach((pts, i) => {
        const c = cfg.curves[i];
        let d = "", pen = false;
        for (const [x, y] of pts) {
          if (!isFinite(x) || !isFinite(y) || y < yr[0] - span || y > yr[1] + span || x < cfg.x[0] - xspan || x > cfg.x[1] + xspan) { pen = false; continue; }
          d += (pen ? "L" : "M") + X(x).toFixed(1) + "," + Y(y).toFixed(1);
          pen = true;
        }
        svg.append(s("path", { d, class: curveClass(c), stroke: colorOf(c, i), style: c.width > 0 ? `stroke-width:${Math.min(8, c.width)}px` : null, "clip-path": `url(#${cid})` }));
      });
      for (const [x, y, label] of pts) {
        if (!isFinite(x) || !isFinite(y) || x < cfg.x[0] || x > cfg.x[1] || y < yr[0] || y > yr[1]) continue;
        const cx = X(x), cy = Y(y);
        svg.append(s("circle", { cx, cy, r: 4.5, class: "pt" }));
        if (label) {
          const right = cx > W - pad.r - 90, low = cy < pad.t + 18;
          svg.append(s("text", { x: cx + (right ? -8 : 8), y: cy + (low ? 16 : -8), "text-anchor": right ? "end" : "start", class: "label strong pt-label" }, label));
        }
      }
    }
    paramSliders(root, ctrls, P, vals, draw);
    if (cfg.curves.some((c) => c.label)) foot.append(legend(cfg.curves.map((c, i) => (c.label ? [c.label, colorOf(c, i), curveStyle(c), c.width] : null)).filter(Boolean)));
    draw();
  }

  // ------------------------------------------------------------------ bars
  // Value labels: `digits` decimals if given; otherwise integers print as integers ("20", not
  // "20.0") and other values get the decimals their size needs (0.057, 0.50, 12.5, 1120).
  function barFmt(vs, digits) {
    if (digits != null && digits >= 0) return (v) => (isFinite(v) ? noNegZero(v.toFixed(digits)) : "—");
    const fin = vs.filter(isFinite);
    if (fin.every((v) => Math.abs(v - Math.round(v)) < 1e-9)) return (v) => (isFinite(v) ? (Math.abs(v) >= 1e7 ? sci(v) : noNegZero(v.toFixed(0))) : "—");
    // the fewest decimals that write every value exactly (1.0, 3.4), else two significant digits for
    // the smallest value that matters (0.110, 0.057, 0.012), at most 4 decimals
    let d = [1, 2, 3].find((k) => fin.every((v) => Math.abs(v * 10 ** k - Math.round(v * 10 ** k)) < 1e-6));
    if (d == null) {
      const mx = Math.max(1e-12, ...fin.map(Math.abs)), nz = fin.map(Math.abs).filter((v) => v >= mx / 300);
      const need = (v) => (v >= 100 ? 0 : v >= 10 ? 1 : v >= 1 ? 2 : 1 - Math.floor(Math.log10(v)));
      d = clamp(Math.max(need(mx), ...nz.map(need)), 0, 4);
    }
    return (v) => (isFinite(v) ? (Math.abs(v) >= 1e7 ? sci(v) : noNegZero(v.toFixed(d))) : "—");
  }
  function bars(root, cfg) {
    const { stage, ctrls } = shell(root, cfg);
    const P = cfg.params || {};
    const names = Object.keys(P);
    const vals = Object.fromEntries(names.map((k) => [k, P[k].value ?? P[k].min]));
    const fv = typeof cfg.values === "string" ? compile(cfg.values, names) : null;
    const fh = cfg.highlight ? compile(cfg.highlight, names) : null;
    const labels = cfg.labels.map((l) => String(l ?? ""));
    const n = labels.length;
    const W = Math.max(420, Math.min(720, n * 56)), plotH = 196, LPX = 12.5;
    const svg = s("svg", { viewBox: `0 0 ${W} 260`, class: "viz-svg" });
    stage.append(svg);
    // category labels: on one line if they fit under their bar, else wrapped (≤ 3 lines), else slanted
    function labelLayout(bw) {
      const maxW = bw - 6, ws = labels.map((l) => textWidth(l, LPX));
      if (Math.max(0, ...ws) <= maxW) return { mode: "flat", h: 26, lines: labels.map((l) => [l]) };
      const lines = labels.map((l) => wrapText(l, maxW, LPX, 600, 3));
      if (lines.every((ls) => !ls[ls.length - 1].endsWith(" …") && ls.every((x) => textWidth(x, LPX) <= maxW + 1))) return { mode: "wrap", h: 12 + Math.max(...lines.map((x) => x.length)) * 15, lines };
      const rl = labels.map((l) => wrapText(l, 170, LPX, 600, 2));
      const wmax = Math.max(...rl.flat().map((x) => textWidth(x, LPX)));
      const nl = Math.max(...rl.map((x) => x.length));
      return { mode: "rot", h: 16 + wmax * Math.sin(0.61) + nl * 15 * Math.cos(0.61), lines: rl, wmax };
    }
    function draw() {
      const args = names.map((k) => vals[k]);
      const v = (fv ? fv(...args, ...HV) : cfg.values).map(Number);
      const hl = fh ? fh(...args, ...HV) : null;
      const top = Math.max(cfg.ymax || 0, ...v.map((x) => (isFinite(x) ? x : 0)), 1e-9) * 1.12;
      const vmin = Math.min(0, ...v.filter(isFinite));
      const bot = vmin < 0 ? vmin - (top - vmin) * 0.1 : 0; // room under a negative bar for its value
      const pad = { l: yPad([bot, top], cfg.ylabel, 44), r: 10, t: 22, b: 30 };
      let L = labelLayout((W - pad.l - pad.r) / n);
      if (L.mode === "rot") pad.l = Math.max(pad.l, Math.ceil(L.wmax * Math.cos(0.61) - (W - pad.l - pad.r) / n / 2 + 6));
      L = labelLayout((W - pad.l - pad.r) / n);
      pad.b = Math.ceil(L.h);
      const H = pad.t + plotH + pad.b;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.innerHTML = "";
      const { Y } = axes(svg, W, H, pad, [0, n], [bot, top], null, cfg.ylabel, { noX: true });
      const bw = (W - pad.l - pad.r) / n;
      const f = barFmt(v, cfg.digits);
      v.forEach((x, i) => {
        const y0 = Y(Math.max(0, x)), y1 = Y(Math.min(0, x));
        const on = hl ? hl[i] : true;
        const cx = pad.l + (i + 0.5) * bw;
        svg.append(s("rect", { x: pad.l + i * bw + bw * 0.15, y: y0, width: bw * 0.7, height: Math.max(0.5, y1 - y0), rx: 3, class: on ? "bar" : "bar off" }));
        const txt = f(x), tw = textWidth(txt, 11.5, 400);
        svg.append(s("text", { x: cx, y: x < 0 ? y1 + 14 : y0 - 5, "text-anchor": "middle", class: "tick", style: tw > bw - 2 ? `font-size:${Math.max(8, (11.5 * (bw - 2)) / tw).toFixed(1)}px` : null }, txt));
        const ly = H - pad.b + 17;
        if (L.mode === "rot") svg.append(svgLines({ x: cx, y: ly, "text-anchor": "end", class: "label", transform: `rotate(-35 ${cx} ${ly})` }, L.lines[i], 15));
        else svg.append(svgLines({ x: cx, y: ly, "text-anchor": "middle", class: "label" }, L.lines[i], 15));
      });
    }
    paramSliders(root, ctrls, P, vals, draw);
    draw();
  }

  // ------------------------------------------------------------------ heatmap
  function heatmap(root, cfg) {
    const { stage, ctrls } = shell(root, cfg);
    const P = cfg.params || {};
    const names = Object.keys(P);
    const vals = Object.fromEntries(names.map((k) => [k, P[k].value ?? P[k].min]));
    const fd = typeof cfg.data === "string" ? compile(cfg.data, names) : null;
    const box = h("div", { class: "viz-scroll" });
    stage.append(box);
    const LPX = 12.5, LH = 15;
    const rows = (cfg.rows || []).map(String), cols = (cfg.cols || []).map(String);
    // row labels are measured (CJK included) and wrapped onto two lines beyond 200 px
    const rowLines = rows.map((r) => (textWidth(r, LPX) > 200 ? wrapText(r, 200, LPX, 600, 2) : [r]));
    const lw = rows.length ? Math.ceil(Math.max(...rowLines.flat().map((x) => textWidth(x, LPX)))) + 12 : 0;
    const cmax = cols.length ? Math.max(...cols.map((c) => textWidth(c, LPX))) : 0;
    function draw() {
      const d = fd ? fd(...names.map((k) => vals[k]), ...HV) : cfg.data;
      const R = d.length, C = Math.max(...d.map((r) => r.length));
      const cs = clamp(Math.floor((620 - lw) / C), 14, 52);
      // column labels: horizontal when they fit over their column, otherwise at 45° with the
      // header tall enough for the longest one and room on the right for the last one
      const flat = cmax <= cs - 4, D = Math.SQRT1_2;
      const th = !cols.length ? 4 : flat ? 22 : Math.ceil(cmax * D + 16);
      const extraR = cols.length && !flat ? Math.max(0, Math.ceil(cmax * D - cs / 2 + 4)) : 0;
      const W = lw + C * cs + 4 + extraR, H = th + R * cs + 4;
      const flatV = d.flat().filter(isFinite);
      // range: [lo, hi] fixes the colour range, so the same value keeps its colour when a slider changes the data
      const fixed = Array.isArray(cfg.range) && cfg.range.length === 2 && cfg.range.every(Number.isFinite);
      const lo = fixed ? cfg.range[0] : Math.min(...flatV), hi = fixed ? cfg.range[1] : Math.max(...flatV);
      const amax = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
      // scale: "column" gives every column its own colour range (columns with different units)
      const perCol = cfg.scale === "column", colR = [];
      if (perCol) for (let j = 0; j < C; j++) { const cv = d.map((r) => (r || [])[j]).filter(isFinite), cl = cv.length ? Math.min(...cv) : 0, ch = cv.length ? Math.max(...cv) : 0; colR.push([cl, ch, Math.max(Math.abs(cl), Math.abs(ch)) || 1]); }
      const [c1, c4, surf] = [cssv("--v1"), cssv("--v4"), cssv("--viz-cell")];
      const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "viz-svg", style: `max-width:${W * 1.4}px` });
      const showText = cs >= 26 && cfg.digits !== -1;
      const digits = cfg.digits ?? 2;
      for (let i = 0; i < R; i++) for (let j = 0; j < (d[i] || []).length; j++) {
        const v = d[i][j];
        let fill, t;
        if (!isFinite(v)) { fill = cssv("--viz-masked"); t = 0; }
        // diverging: any non-zero value gets at least a clear tint of its sign's colour
        else if (cfg.diverging) { const am = perCol ? colR[j][2] : amax; t = v === 0 ? 0 : 0.2 + 0.8 * (Math.abs(v) / am); fill = mix(surf, v < 0 ? c4 : c1, t); }
        else { const [l0, h0] = perCol ? colR[j] : [lo, hi]; t = h0 > l0 ? (v - l0) / (h0 - l0) : 0.5; fill = mix(surf, c1, t); }
        svg.append(s("rect", { x: lw + j * cs, y: th + i * cs, width: cs - 1.5, height: cs - 1.5, rx: 3, fill }));
        if (showText) {
          const txt = isFinite(v) ? noNegZero(v.toFixed(digits)) : "−∞", tw = textWidth(txt, 11, 400);
          svg.append(s("text", { x: lw + j * cs + cs / 2 - 0.75, y: th + i * cs + cs / 2 + 4, "text-anchor": "middle", class: "cell" + (t > 0.55 ? " inv" : ""), style: tw > cs - 5 ? `font-size:${Math.max(7.5, (11 * (cs - 5)) / tw).toFixed(1)}px` : null }, txt));
        }
      }
      rowLines.forEach((ls, i) => svg.append(svgLines({ x: lw - 6, y: th + i * cs + cs / 2 + 4 - ((ls.length - 1) * LH) / 2, "text-anchor": "end", class: "label" }, ls, LH)));
      cols.forEach((c, j) => {
        const cx = lw + j * cs + cs / 2 - 0.75;
        if (flat) svg.append(s("text", { x: cx, y: th - 7, "text-anchor": "middle", class: "label" }, c));
        else svg.append(s("text", { x: cx, y: th - 6, "text-anchor": "start", class: "label", transform: `rotate(-45 ${cx} ${th - 6})` }, c));
      });
      box.innerHTML = "";
      box.append(svg);
    }
    paramSliders(root, ctrls, P, vals, draw);
    draw();
  }

  // ------------------------------------------------------------------ frames
  function frames(root, cfg) {
    const { stage, ctrls, foot } = shell(root, cfg);
    const fid = ++uid;
    const svg = s("svg", { viewBox: `0 0 ${cfg.w} ${cfg.h}`, class: "viz-svg viz-draw" });
    const defs = s("defs");
    const base = s("g");
    const layer = s("g", { class: "viz-frame" });
    base.innerHTML = cfg.base || "";
    svg.append(defs, base, layer);
    stage.append(svg);
    // Arrowheads take the colour of their line (one marker per colour and width, sized in user
    // units so thick lines do not get huge heads), and "$…$" in <text> gets real sub/superscripts.
    const markers = new Map();
    const arrowFor = (color, sw) => {
      const key = color + "|" + sw;
      if (!markers.has(key)) {
        const id = `va${fid}-${markers.size}`, size = 3 * sw + 6;
        defs.append(s("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: size, markerHeight: size, markerUnits: "userSpaceOnUse", orient: "auto-start-reverse" }, s("path", { d: "M0,0 L10,5 L0,10 z", style: `fill:${color};stroke:none` })));
        markers.set(key, id);
      }
      return markers.get(key);
    };
    function polish(g) {
      for (const el of g.querySelectorAll("[marker-end], [marker-start], [marker-mid]")) {
        const st = getComputedStyle(el);
        const color = st.stroke && st.stroke !== "none" ? st.stroke : cssv("--fg-2");
        const sw = Math.round((parseFloat(st.strokeWidth) || 2) * 2) / 2;
        for (const a of ["marker-end", "marker-start", "marker-mid"]) if ((el.getAttribute(a) || "").includes("#viz-arrow")) el.setAttribute(a, `url(#${arrowFor(color, sw)})`);
      }
      for (const t of g.querySelectorAll("text, tspan")) if (!t.children.length && t.textContent.indexOf("$") !== -1) t.replaceChildren(...svgTextNodes(t.textContent));
    }
    polish(base);
    const cap = h("div", { class: "viz-caption" });
    const dots = h("div", { class: "viz-dots" });
    foot.append(cap);
    let i = 0;
    function show(k, animate = true) {
      i = clamp(k, 0, cfg.frames.length - 1);
      layer.innerHTML = cfg.frames[i].svg;
      polish(layer);
      if (animate) { layer.classList.remove("in"); void layer.getBBox?.(); layer.classList.add("in"); }
      cap.innerHTML = `<b>${i + 1}/${cfg.frames.length}</b> ${cfg.frames[i].caption || ""}`;
      dots.innerHTML = "";
      cfg.frames.forEach((_, j) => dots.append(h("button", { type: "button", class: j === i ? "on" : "", "aria-label": `frame ${j + 1}`, onclick: () => { play.reset(); show(j); } })));
    }
    let acc = 0;
    const an = animator(root, (dt) => {
      acc += dt * 1000;
      if (acc >= (cfg.interval || 1800)) { acc = 0; if (i >= cfg.frames.length - 1) return false; show(i + 1); }
    });
    const play = playButton(an, () => { acc = 0; if (i >= cfg.frames.length - 1) show(0); });
    ctrls.append(btn("‹ " + T().prev, () => { play.reset(); show(i - 1); }), play, btn(T().next + " ›", () => { play.reset(); show(i + 1); }), dots);
    show(0, false);
  }

  // ------------------------------------------------------------------ matrix2d
  function eig2(A) {
    const [[a, b], [c, d]] = A;
    const tr = a + d, det = a * d - b * c, disc = (tr * tr) / 4 - det;
    if (disc < -1e-12) return null;
    const r = Math.sqrt(Math.max(0, disc));
    const vec = (l) => { let v = Math.abs(b) > 1e-9 ? [b, l - a] : Math.abs(c) > 1e-9 ? [l - d, c] : Math.abs(l - a) < 1e-9 ? [1, 0] : [0, 1]; const n = Math.hypot(...v); return [v[0] / n, v[1] / n]; };
    return [[tr / 2 + r, vec(tr / 2 + r)], [tr / 2 - r, vec(tr / 2 - r)]];
  }
  function svd2(A) {
    const [[a, b], [c, d]] = A;
    const p = a * a + c * c, q = a * b + c * d, r = b * b + d * d;
    const phi = 0.5 * Math.atan2(2 * q, p - r);
    const m = (p + r) / 2, dd = Math.sqrt(((p - r) / 2) ** 2 + q * q);
    const s1 = Math.sqrt(Math.max(0, m + dd)), s2 = Math.sqrt(Math.max(0, m - dd));
    const v1 = [Math.cos(phi), Math.sin(phi)], v2 = [-Math.sin(phi), Math.cos(phi)];
    const Av = (v) => [a * v[0] + b * v[1], c * v[0] + d * v[1]];
    let u1 = s1 > 1e-12 ? Av(v1).map((x) => x / s1) : [1, 0];
    let u2 = s2 > 1e-12 ? Av(v2).map((x) => x / s2) : [-u1[1], u1[0]];
    let s2s = s2;
    if (u1[0] * u2[1] - u1[1] * u2[0] < 0) { u2 = u2.map((x) => -x); s2s = -s2; }
    return { phi, psi: Math.atan2(u1[1], u1[0]), s1, s2: s2s, s2abs: s2 };
  }
  const R2 = (t) => [[Math.cos(t), -Math.sin(t)], [Math.sin(t), Math.cos(t)]];
  const mm = (A, B) => [[A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]], [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]]];
  function matrix2d(root, cfg) {
    // round-off (6.1e-17 for a zero) prints as 0
    const fz = (v) => fmt(Math.abs(v) < 1e-9 ? 0 : v);
    const { stage, ctrls, foot } = shell(root, cfg);
    const A = cfg.A.map((r) => [...r]);
    let mode = cfg.mode || "transform";
    // SVD opens on the finished picture (the ellipse A makes of the unit circle, all three steps applied);
    // Play restarts from the circle. Opening at t = 0 showed only a circle, which says nothing.
    let t = mode === "svd" ? 3 : 1;
    const S = 420;
    const svg = s("svg", { viewBox: `0 0 ${S} ${S}`, class: "viz-svg viz-square" });
    stage.append(svg);
    const info = h("div", { class: "viz-caption" });
    foot.append(info);
    const tMax = () => (mode === "svd" ? 3 : 1);
    function current() {
      if (mode !== "svd") {
        // a rotation (or a scaled rotation) turns through its angle on the way, instead of shrinking
        // through the straight-line blend of its entries
        const [[a, b], [c, d]] = A, sc = Math.hypot(a, c);
        if (sc > 1e-9 && Math.abs(a - d) < 1e-6 && Math.abs(b + c) < 1e-6) {
          const ang = Math.atan2(c, a) * t, k = 1 + (sc - 1) * t;
          return [[k * Math.cos(ang), -k * Math.sin(ang)], [k * Math.sin(ang), k * Math.cos(ang)]];
        }
        return [[1 + (A[0][0] - 1) * t, A[0][1] * t], [A[1][0] * t, 1 + (A[1][1] - 1) * t]];
      }
      const { phi, psi, s1, s2 } = svd2(A);
      const st1 = clamp(t, 0, 1), st2 = clamp(t - 1, 0, 1), st3 = clamp(t - 2, 0, 1);
      let M = R2(-phi * st1);
      M = mm([[1 + (s1 - 1) * st2, 0], [0, 1 + (s2 - 1) * st2]], M);
      return mm(R2(psi * st3), M);
    }
    function draw() {
      const M = current();
      const colN = Math.max(Math.hypot(A[0][0], A[1][0]), Math.hypot(A[0][1], A[1][1]), 1);
      const Rw = Math.max(2.5, Math.ceil(colN * 1.35));
      const k = S / (2 * Rw);
      const P = (x, y) => [S / 2 + x * k, S / 2 - y * k];
      const ap = (v) => [M[0][0] * v[0] + M[0][1] * v[1], M[1][0] * v[0] + M[1][1] * v[1]];
      svg.innerHTML = "";
      const g0 = s("g", { class: "grid0" });
      for (let i = -Rw; i <= Rw; i++) {
        g0.append(s("line", { x1: P(i, -Rw)[0], y1: P(i, -Rw)[1], x2: P(i, Rw)[0], y2: P(i, Rw)[1] }));
        g0.append(s("line", { x1: P(-Rw, i)[0], y1: P(-Rw, i)[1], x2: P(Rw, i)[0], y2: P(Rw, i)[1] }));
      }
      svg.append(g0);
      const g = s("g", { class: "gridT" });
      const L = Rw * 2;
      for (let i = -L; i <= L; i++) {
        const a1 = P(...ap([i, -L])), a2 = P(...ap([i, L])), b1 = P(...ap([-L, i])), b2 = P(...ap([L, i]));
        g.append(s("line", { x1: a1[0], y1: a1[1], x2: a2[0], y2: a2[1], class: i === 0 ? "axis" : "" }));
        g.append(s("line", { x1: b1[0], y1: b1[1], x2: b2[0], y2: b2[1], class: i === 0 ? "axis" : "" }));
      }
      svg.append(g);
      const sq = [[0, 0], [1, 0], [1, 1], [0, 1]].map((v) => P(...ap(v)).join(",")).join(" ");
      svg.append(s("polygon", { points: sq, class: "area" }));
      let circ = "";
      for (let i = 0; i <= 120; i++) { const a = (i / 120) * 2 * Math.PI; circ += (i ? "L" : "M") + P(...ap([Math.cos(a), Math.sin(a)])).map((x) => x.toFixed(1)).join(","); }
      svg.append(s("path", { d: circ, class: "circle" }));
      const e1 = P(...ap([1, 0])), e2 = P(...ap([0, 1])), o = P(0, 0);
      svg.append(s("path", { d: arrowPath(o[0], o[1], e1[0], e1[1]), class: "vec v1" }));
      svg.append(s("path", { d: arrowPath(o[0], o[1], e2[0], e2[1]), class: "vec v2" }));
      const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
      // `name`: what the read-out calls the matrix (default "M"); with a name, the in-between
      // matrices of the animation are written name(t), so only the end state carries the name itself
      const nm = typeof cfg.name === "string" && cfg.name.trim() ? cfg.name.trim() : null;
      const atEnd = t >= tMax() - 1e-9;
      let text = `${nm ? (atEnd ? nm : nm.endsWith("$") ? nm.slice(0, -1) + "(t)$" : nm + "(t)") : "M"} = [[${fz(M[0][0])}, ${fz(M[0][1])}], [${fz(M[1][0])}, ${fz(M[1][1])}]] · det = ${fz(det)}`;
      if (mode === "eigen") {
        const E = eig2(A);
        if (E) E.forEach(([lam, v], ei) => {
          const a1 = P(-v[0] * L, -v[1] * L), a2 = P(v[0] * L, v[1] * L);
          svg.append(s("line", { x1: a1[0], y1: a1[1], x2: a2[0], y2: a2[1], class: "eigline" }));
          const w = ap(v), pw = P(...w);
          svg.append(s("path", { d: arrowPath(o[0], o[1], pw[0], pw[1]), class: "vec v3" }));
          // the label sits beyond the arrow tip along the eigen-direction, clear of both arrows
          const L0 = Math.hypot(pw[0] - o[0], pw[1] - o[1]), dir = L0 > 8 ? [(pw[0] - o[0]) / L0, (pw[1] - o[1]) / L0] : [v[0] * (lam < 0 ? -1 : 1), -v[1] * (lam < 0 ? -1 : 1)];
          const lx = pw[0] + dir[0] * 16, ly = pw[1] + dir[1] * 16 + 4;
          svg.append(s("text", { x: clamp(lx, 6, S - 6), y: clamp(ly, 14, S - 6), "text-anchor": dir[0] > 0.35 ? "start" : dir[0] < -0.35 ? "end" : "middle", class: "label strong eig-label" }, `λ${ei ? "₂" : "₁"} = ${fz(lam)}`));
        });
        text += E ? ` · λ₁=${fz(E[0][0])}, λ₂=${fz(E[1][0])}` : " · complex eigenvalues (rotation)";
      }
      if (mode === "svd") {
        const d = svd2(A);
        const stage = t <= 1 ? "Vᵀ: rotate" : t <= 2 ? "Σ: scale axes" : "U: rotate";
        text = `${stage} · σ₁=${fz(d.s1)}, σ₂=${fz(d.s2abs)} · ` + text;
      }
      math(info, text);
    }
    const makeT = () => slider(mode === "svd" ? "Vᵀ → Σ → U" : "t", { min: 0, max: tMax(), value: t, step: 0.01 }, (v) => { t = v; draw(); });
    let tRow = makeT();
    const an = animator(root, (dt) => { t = Math.min(tMax(), t + dt * (mode === "svd" ? 0.9 : 0.45)); tRow.set(t); draw(); if (t >= tMax()) return false; });
    const play = playButton(an, () => { if (t >= tMax()) t = 0; });
    ctrls.append(tRow, play);
    ctrls.append(seg([["transform", "A·x"], ["eigen", "eigen"], ["svd", "SVD"]], mode, (m) => { mode = m; play.reset(); t = m === "svd" ? 3 : 1; const nr = makeT(); tRow.replaceWith(nr); tRow = nr; draw(); }));
    if (cfg.editable !== false) {
      const inputs = h("div", { class: "viz-matrix" });
      [[0, 0], [0, 1], [1, 0], [1, 1]].forEach(([i, j]) => {
        const inp = h("input", { type: "number", step: "0.1", value: A[i][j] });
        inp.addEventListener("input", () => { const v = parseFloat(inp.value); if (isFinite(v)) { A[i][j] = v; draw(); } });
        inputs.append(inp);
      });
      ctrls.append(h("span", { class: "viz-mrow" }, h("span", { class: "viz-lbl" }, "A ="), inputs));
    }
    draw();
  }

  // ------------------------------------------------------------------ gridworld
  function gridworld(root, cfg) {
    const { stage, ctrls, foot } = shell(root, cfg);
    const Rn = cfg.rows, Cn = cfg.cols;
    const walls = new Set((cfg.walls || []).map(([r, c]) => r * Cn + c));
    const term = new Map((cfg.terminals || []).map(([r, c, v]) => [r * Cn + c, v]));
    const gamma = cfg.gamma ?? 0.9, noise = cfg.noise ?? 0.2, stepR = cfg.step_reward ?? 0;
    const algo = cfg.algo || "value-iteration";
    const alpha = cfg.alpha ?? 0.5;
    let eps = cfg.epsilon ?? 0.2;
    const start = cfg.start ? cfg.start[0] * Cn + cfg.start[1] : 0;
    const NSt = Rn * Cn;
    const D = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // N E S W
    const move = (s0, a) => { const r = Math.floor(s0 / Cn), c = s0 % Cn; const nr = r + D[a][0], nc = c + D[a][1]; if (nr < 0 || nr >= Rn || nc < 0 || nc >= Cn || walls.has(nr * Cn + nc)) return s0; return nr * Cn + nc; };
    const outcomes = (s0, a) => (noise > 0 ? [[move(s0, a), 1 - noise], [move(s0, (a + 1) % 4), noise / 2], [move(s0, (a + 3) % 4), noise / 2]] : [[move(s0, a), 1]]);
    const reward = (s1) => stepR + (term.has(s1) ? term.get(s1) : 0);
    const live = [...Array(NSt).keys()].filter((x) => !walls.has(x) && !term.has(x));
    let V, Q, pi, k, delta, phase, agent, episodes, stable, rand;
    function reset() {
      V = new Float64Array(NSt); Q = Array.from({ length: NSt }, () => new Float64Array(4));
      pi = new Int8Array(NSt); k = 0; delta = NaN; phase = "evaluate"; agent = start; episodes = 0; stable = false; rand = rng(cfg.seed || 7);
    }
    const qsa = (s0, a, Vx) => outcomes(s0, a).reduce((acc, [s1, p]) => acc + p * (reward(s1) + (term.has(s1) ? 0 : gamma * Vx[s1])), 0);
    function step() {
      if (algo === "value-iteration") {
        const nv = new Float64Array(NSt); delta = 0;
        for (const x of live) { let best = -Infinity; for (let a = 0; a < 4; a++) best = Math.max(best, qsa(x, a, V)); nv[x] = best; delta = Math.max(delta, Math.abs(best - V[x])); }
        V = nv; k++;
        for (const x of live) { let b = 0, bv = -Infinity; for (let a = 0; a < 4; a++) { const q = qsa(x, a, V); if (q > bv + 1e-12) { bv = q; b = a; } } pi[x] = b; }
        return delta > 1e-4;
      }
      if (algo === "policy-iteration") {
        if (phase === "evaluate") {
          const nv = new Float64Array(NSt); delta = 0;
          for (const x of live) { nv[x] = qsa(x, pi[x], V); delta = Math.max(delta, Math.abs(nv[x] - V[x])); }
          V = nv; k++;
          if (delta < 1e-3) phase = "improve";
          return true;
        }
        stable = true;
        for (const x of live) { let b = pi[x], bv = qsa(x, pi[x], V); for (let a = 0; a < 4; a++) { const q = qsa(x, a, V); if (q > bv + 1e-9) { bv = q; b = a; } } if (b !== pi[x]) stable = false; pi[x] = b; }
        phase = "evaluate"; k++;
        return !stable;
      }
      // sample-based: one transition per step
      const sample = (a) => { const o = outcomes(agent, a); let u = rand(), acc = 0; for (const [s1, p] of o) { acc += p; if (u <= acc) return s1; } return o[o.length - 1][0]; };
      if (algo === "td0") {
        const a = Math.floor(rand() * 4);
        const s1 = sample(a), r = reward(s1);
        const target = r + (term.has(s1) ? 0 : gamma * V[s1]);
        V[agent] += alpha * (target - V[agent]); delta = target - V[agent];
        agent = term.has(s1) ? (episodes++, start) : s1; k++;
        return true;
      }
      // q-learning
      const greedy = (x) => { let b = 0; for (let a = 1; a < 4; a++) if (Q[x][a] > Q[x][b]) b = a; return b; };
      const a = rand() < eps ? Math.floor(rand() * 4) : greedy(agent);
      const s1 = sample(a), r = reward(s1);
      const target = r + (term.has(s1) ? 0 : gamma * Math.max(...Q[s1]));
      delta = target - Q[agent][a];
      Q[agent][a] += alpha * delta;
      V[agent] = Math.max(...Q[agent]); pi[agent] = greedy(agent);
      agent = term.has(s1) ? (episodes++, start) : s1; k++;
      return true;
    }
    const cs = Math.min(72, Math.floor(600 / Cn));
    const svg = s("svg", { viewBox: `0 0 ${Cn * cs} ${Rn * cs}`, class: "viz-svg", style: `max-width:${Cn * cs * 1.3}px` });
    stage.append(svg);
    const info = h("div", { class: "viz-caption" });
    foot.append(info);
    function draw() {
      svg.innerHTML = "";
      const vmax = Math.max(1e-9, ...[...V].map(Math.abs), ...[...term.values()].map(Math.abs));
      const [c1, c4, surf] = [cssv("--v1"), cssv("--v4"), cssv("--viz-cell")];
      for (let x = 0; x < NSt; x++) {
        const r = Math.floor(x / Cn), c = x % Cn, X0 = c * cs, Y0 = r * cs;
        if (walls.has(x)) { svg.append(s("rect", { x: X0, y: Y0, width: cs - 2, height: cs - 2, rx: 4, class: "wall" })); continue; }
        const v = term.has(x) ? term.get(x) : V[x];
        svg.append(s("rect", { x: X0, y: Y0, width: cs - 2, height: cs - 2, rx: 4, fill: mix(surf, v < 0 ? c4 : c1, Math.min(1, Math.abs(v) / vmax) * 0.85), class: term.has(x) ? "term" : "" }));
        svg.append(s("text", { x: X0 + cs / 2 - 1, y: Y0 + (term.has(x) ? cs / 2 + 5 : cs - 9), "text-anchor": "middle", class: "cell" + (Math.abs(v) / vmax > 0.6 ? " inv" : "") }, (term.has(x) ? (v > 0 ? "+" : "") : "") + v.toFixed(2)));
        if (!term.has(x) && algo !== "td0" && (k > 0 || algo === "policy-iteration")) {
          const cx = X0 + cs / 2 - 1, cy = Y0 + cs / 2 - 6, L = cs * 0.22, [dy, dx] = D[pi[x]];
          svg.append(s("path", { d: arrowPath(cx - dx * L, cy - dy * L, cx + dx * L, cy + dy * L, 7), class: "garrow" }));
        }
        if (x === start && algo !== "td0" && algo !== "q-learning") svg.append(s("circle", { cx: X0 + 9, cy: Y0 + 9, r: 4, class: "startdot" }));
      }
      if (algo === "td0" || algo === "q-learning") {
        const r = Math.floor(agent / Cn), c = agent % Cn;
        svg.append(s("circle", { cx: c * cs + cs / 2 - 1, cy: r * cs + cs / 2 - 6, r: cs * 0.16, class: "agent" }));
      }
      const zh = (document.documentElement.lang || "").startsWith("zh");
      const label = { "value-iteration": zh ? "值迭代：每次扫描对所有状态做贝尔曼最优备份" : "Value iteration: each sweep applies the Bellman optimality backup to every state", "policy-iteration": zh ? `策略迭代 · 阶段：${phase === "evaluate" ? "策略评估" : "策略改进"}${stable ? "（策略已稳定）" : ""}` : `Policy iteration · phase: ${phase}${stable ? " (policy stable)" : ""}`, td0: zh ? "TD(0) 评估随机策略：V(s) ← V(s) + α[r + γV(s′) − V(s)]" : "TD(0) evaluating the random policy: V(s) ← V(s) + α[r + γV(s′) − V(s)]", "q-learning": zh ? `Q-learning（ε=${fmt(eps)}）：Q(s,a) ← Q + α[r + γ maxₐ′Q(s′,a′) − Q]` : `Q-learning (ε=${fmt(eps)}): Q(s,a) ← Q + α[r + γ maxₐ′ Q(s′,a′) − Q]` }[algo];
      info.textContent = `${label} · ${T().iter} ${k}${isFinite(delta) ? ` · ${algo.includes("iteration") ? "max|ΔV|" : "TD error"} = ${fmt(delta)}` : ""}${episodes ? ` · episodes ${episodes}` : ""}`;
    }
    let acc = 0;
    const sampled = algo === "td0" || algo === "q-learning";
    let speed = sampled ? 20 : 2;
    const an = animator(root, (dt) => { acc += dt * speed; let more = true; while (acc >= 1) { acc -= 1; more = step(); if (!more) break; } draw(); return more; });
    const play = playButton(an);
    ctrls.append(btn(T().step, () => { play.reset(); step(); draw(); }), play, btn(T().reset, () => { play.reset(); reset(); draw(); }));
    ctrls.append(slider((document.documentElement.lang || "").startsWith("zh") ? (sampled ? "每秒步数" : "每秒扫描次数") : sampled ? "steps/s" : "sweeps/s", { min: sampled ? 1 : 0.5, max: sampled ? 400 : 10, value: speed }, (v) => (speed = v), sampled));
    if (algo === "q-learning") ctrls.append(slider("ε", { min: 0, max: 1, value: eps, step: 0.01 }, (v) => (eps = v)));
    reset();
    // "sweeps": n opens the figure after n steps (sweeps, or sampled transitions for td0 / q-learning)
    for (let i = 0; i < Math.min(5000, cfg.sweeps | 0); i++) if (!step()) break;
    draw();
  }

  // ------------------------------------------------------------------ gd2d
  const GD_FN = {
    quadratic: { dom: [[-2.2, 2.2], [-1.6, 1.6]], start: [-2, 1.2], lr: 0.05 },
    rosenbrock: { dom: [[-2, 2], [-1, 3]], start: [-1.5, 2.5], lr: 0.0015, min: [1, 1] },
    saddle: { dom: [[-2, 2], [-2, 2]], start: [-1.8, 0.02], lr: 0.05 },
    beale: { dom: [[-4.5, 4.5], [-4.5, 4.5]], start: [1, 1.6], lr: 0.001, min: [3, 0.5] },
  };
  function gd2d(root, cfg) {
    const { stage, ctrls, foot } = shell(root, cfg);
    const name = GD_FN[cfg.fn] ? cfg.fn : cfg.fn ? "custom" : "quadratic";
    let cond = cfg.cond ?? 10;
    const th = 0.45;
    const fcustom = name === "custom" ? compile(cfg.fn, ["x", "y"]) : null;
    const f = (x, y) => {
      if (name === "quadratic") { const u = Math.cos(th) * x + Math.sin(th) * y, w = -Math.sin(th) * x + Math.cos(th) * y; return 0.5 * (u * u + cond * w * w); }
      if (name === "rosenbrock") return (1 - x) ** 2 + 100 * (y - x * x) ** 2;
      if (name === "saddle") return x * x - y * y + 0.25 * y ** 4;
      if (name === "beale") return (1.5 - x + x * y) ** 2 + (2.25 - x + x * y * y) ** 2 + (2.625 - x + x * y ** 3) ** 2;
      return fcustom(x, y, ...HV);
    };
    const grad = (x, y) => { const e = 1e-5; return [(f(x + e, y) - f(x - e, y)) / (2 * e), (f(x, y + e) - f(x, y - e)) / (2 * e)]; };
    const hess = (x, y) => { const e = 1e-4; const gx = (a, b) => grad(a, b); const [a1, b1] = gx(x + e, y), [a0, b0] = gx(x - e, y), [c1, d1] = gx(x, y + e), [c0, d0] = gx(x, y - e); return [[(a1 - a0) / (2 * e), (b1 - b0) / (2 * e)], [(c1 - c0) / (2 * e), (d1 - d0) / (2 * e)]]; };
    const spec = GD_FN[name] || { dom: cfg.domain || [[-3, 3], [-3, 3]], start: [-2, 2], lr: 0.05 };
    const dom = cfg.domain || spec.dom;
    let lr = cfg.lr ?? spec.lr, lrA = cfg.lr_adaptive ?? 0.05, beta = cfg.momentum ?? 0.9;
    const start = cfg.start || spec.start;
    const opts = cfg.optimizers || ["gd", "momentum", "adam"];
    const nSteps = cfg.steps || 200;
    const Wc = 600, Hc = Math.round((Wc * (dom[1][1] - dom[1][0])) / (dom[0][1] - dom[0][0]));
    const Hcc = clamp(Hc, 300, 460);
    const canvas = h("canvas", { width: Wc * 2, height: Hcc * 2, class: "viz-canvas" });
    // optional axis titles (`xlabel`, `ylabel`, may hold $…$) beside the canvas; with either one the
    // canvas also prints a few coordinate ticks along its left and bottom edges
    const axesOn = !!(cfg.xlabel || cfg.ylabel);
    if (axesOn) {
      const grid = h("div", { class: "gd-axes" });
      const yl = h("div", { class: "gd-ylab" }, cfg.ylabel ? h("span", {}, cfg.ylabel) : null);
      grid.append(yl, canvas, h("div"), h("div", { class: "gd-xlab" }, cfg.xlabel || ""));
      stage.append(grid);
    } else stage.append(canvas);
    const ctx = canvas.getContext("2d");
    const X = (x) => ((x - dom[0][0]) / (dom[0][1] - dom[0][0])) * Wc * 2;
    const Y = (y) => (1 - (y - dom[1][0]) / (dom[1][1] - dom[1][0])) * Hcc * 2;
    let bg = null;
    function background() {
      const nx = 150, ny = Math.round((150 * Hcc) / Wc);
      const vals = [];
      let lo = Infinity, hi = -Infinity;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = dom[0][0] + ((i + 0.5) / nx) * (dom[0][1] - dom[0][0]), y = dom[1][1] - ((j + 0.5) / ny) * (dom[1][1] - dom[1][0]);
        const v = f(x, y); vals.push(v); if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      }
      const surf = cssv("--viz-cell"), c1 = cssv("--v1");
      const off = document.createElement("canvas"); off.width = Wc * 2; off.height = Hcc * 2;
      const o = off.getContext("2d");
      const cw = (Wc * 2) / nx, ch = (Hcc * 2) / ny;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const v = vals[j * nx + i];
        const z = Math.log1p((v - lo) / ((hi - lo) * 1e-3 + 1e-12)) / Math.log1p(1e3);
        const band = Math.floor(z * 14) / 14;
        o.fillStyle = mix(c1, surf, 0.35 + 0.65 * band);
        o.fillRect(i * cw, j * ch, cw + 1, ch + 1);
      }
      // contour lines (marching squares on the sample grid) at every second colour-band edge, so the
      // level sets read as lines and not only as shading
      const zs = vals.map((v) => (isFinite(v) ? Math.log1p((v - lo) / ((hi - lo) * 1e-3 + 1e-12)) / Math.log1p(1e3) : NaN));
      o.strokeStyle = mix(c1, cssv("--fg"), 0.35); o.globalAlpha = 0.55; o.lineWidth = 2;
      o.beginPath();
      const cx = (i) => (i + 0.5) * cw, cy = (j) => (j + 0.5) * ch;
      for (let k = 1; k < 7; k++) {
        const lev = (2 * k) / 14;
        for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
          const a = zs[j * nx + i], b = zs[j * nx + i + 1], c = zs[(j + 1) * nx + i + 1], d = zs[(j + 1) * nx + i];
          if (![a, b, c, d].every(isFinite)) continue;
          const pts = [];
          const ed = (p, q, x1, y1, x2, y2) => { if ((p < lev) !== (q < lev)) { const f = (lev - p) / (q - p); pts.push([x1 + (x2 - x1) * f, y1 + (y2 - y1) * f]); } };
          ed(a, b, cx(i), cy(j), cx(i + 1), cy(j)); ed(b, c, cx(i + 1), cy(j), cx(i + 1), cy(j + 1));
          ed(c, d, cx(i + 1), cy(j + 1), cx(i), cy(j + 1)); ed(d, a, cx(i), cy(j + 1), cx(i), cy(j));
          for (let q = 0; q + 1 < pts.length; q += 2) { o.moveTo(pts[q][0], pts[q][1]); o.lineTo(pts[q + 1][0], pts[q + 1][1]); }
        }
      }
      o.stroke();
      o.globalAlpha = 1;
      if (axesOn) {
        // coordinate ticks inside the edges
        o.font = `600 38px ${getComputedStyle(document.body).fontFamily || "sans-serif"}`;
        o.fillStyle = cssv("--fg-2"); o.strokeStyle = surf; o.lineWidth = 6; o.lineJoin = "round";
        const xt = niceTicks(dom[0][0], dom[0][1], 5), yt = niceTicks(dom[1][0], dom[1][1], 4), fx = tickFmt(xt), fy = tickFmt(yt);
        o.textAlign = "center"; o.textBaseline = "bottom";
        for (const v of xt) { const px = X(v); if (px < 40 || px > Wc * 2 - 30) continue; o.fillRect(px - 1, Hcc * 2 - 10, 2, 10); o.strokeText(fx(v), px, Hcc * 2 - 12); o.fillText(fx(v), px, Hcc * 2 - 12); }
        o.textAlign = "left"; o.textBaseline = "middle";
        for (const v of yt) { const py = Y(v); if (py < 20 || py > Hcc * 2 - 46) continue; o.fillRect(0, py - 1, 10, 2); o.strokeText(fy(v), 14, py); o.fillText(fy(v), 14, py); }
      }
      bg = off;
    }
    const colors = pal();
    let paths;
    function run() {
      paths = opts.map((name) => {
        let x = start[0], y = start[1], vx = 0, vy = 0, sx = 0, sy = 0, mx = 0, my = 0, t = 0;
        const pts = [[x, y]];
        for (let i = 0; i < nSteps; i++) {
          let [gx, gy] = name === "nesterov" ? grad(x - lr * beta * vx, y - lr * beta * vy) : grad(x, y);
          if (name === "gd") { x -= lr * gx; y -= lr * gy; }
          else if (name === "momentum" || name === "nesterov") { vx = beta * vx + gx; vy = beta * vy + gy; x -= lr * vx; y -= lr * vy; }
          else if (name === "rmsprop") { sx = 0.9 * sx + 0.1 * gx * gx; sy = 0.9 * sy + 0.1 * gy * gy; x -= (lrA * gx) / (Math.sqrt(sx) + 1e-8); y -= (lrA * gy) / (Math.sqrt(sy) + 1e-8); }
          else if (name === "adam") { t++; mx = 0.9 * mx + 0.1 * gx; my = 0.9 * my + 0.1 * gy; sx = 0.999 * sx + 0.001 * gx * gx; sy = 0.999 * sy + 0.001 * gy * gy; const mh = 1 - 0.9 ** t, vh = 1 - 0.999 ** t; x -= (lrA * (mx / mh)) / (Math.sqrt(sx / vh) + 1e-8); y -= (lrA * (my / mh)) / (Math.sqrt(sy / vh) + 1e-8); }
          else if (name === "newton") { const H = hess(x, y); let [[a, b], [c, d]] = H; const lam = Math.max(0, -Math.min(a, d)) + 1e-3; a += lam; d += lam; const det = a * d - b * c || 1e-9; x -= (d * gx - b * gy) / det; y -= (-c * gx + a * gy) / det; }
          if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 1e6 || Math.abs(y) > 1e6) break;
          pts.push([x, y]);
        }
        return pts;
      });
    }
    let shown = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bg, 0, 0);
      const mn = spec.min;
      if (mn) { ctx.fillStyle = cssv("--fg"); ctx.beginPath(); ctx.arc(X(mn[0]), Y(mn[1]), 6, 0, 7); ctx.fill(); }
      paths.forEach((pts, i) => {
        ctx.strokeStyle = colors[(i + 1) % 6]; ctx.lineWidth = 3.5; ctx.lineJoin = "round"; ctx.beginPath();
        const n = Math.min(pts.length, Math.floor(shown) + 1);
        pts.slice(0, n).forEach(([x, y], j) => (j ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        ctx.stroke();
        const [lx, ly] = pts[n - 1];
        ctx.fillStyle = colors[(i + 1) % 6]; ctx.beginPath(); ctx.arc(X(lx), Y(ly), 7, 0, 7); ctx.fill();
      });
      ctx.fillStyle = cssv("--fg"); ctx.beginPath(); ctx.arc(X(start[0]), Y(start[1]), 6, 0, 7); ctx.fill();
      leg.innerHTML = "";
      leg.append(legend(paths.map((pts, i) => { const n = Math.min(pts.length, Math.floor(shown) + 1); const [x, y] = pts[n - 1]; const fv = f(x, y); return [`${opts[i]} · f=${Math.abs(fv) < 1e-12 ? "0" : fmt(fv)}`, colors[(i + 1) % 6]]; })));
    }
    const leg = h("div");
    foot.append(leg);
    const an = animator(root, (dt) => { shown += dt * 60; draw(); return shown < nSteps; });
    const play = playButton(an, () => { if (shown >= nSteps) shown = 0; });
    const rerun = () => { run(); draw(); };
    const zhG = (document.documentElement.lang || "").startsWith("zh");
    ctrls.append(play, btn(T().reset, () => { play.reset(); shown = 0; draw(); }));
    if (opts.some((o) => ["gd", "momentum", "nesterov"].includes(o))) ctrls.append(slider("η", { min: Math.min(1e-4, lr / 10), max: Math.max(1, lr * 10), value: lr }, (v) => { lr = v; rerun(); }, true));
    if (opts.some((o) => ["adam", "rmsprop"].includes(o))) ctrls.append(slider("η (Adam/RMSProp)", { min: 1e-3, max: 1, value: lrA }, (v) => { lrA = v; rerun(); }, true));
    if (opts.some((o) => ["momentum", "nesterov"].includes(o))) ctrls.append(slider(zhG ? "β（动量）" : "β (momentum)", { min: 0, max: 0.99, value: beta, step: 0.01 }, (v) => { beta = v; rerun(); }));
    if (name === "quadratic") ctrls.append(slider(zhG ? "κ（条件数）" : "κ (condition)", { min: 1, max: 100, value: cond }, (v) => { cond = v; background(); rerun(); }, true));
    background(); run(); shown = nSteps; draw();
  }

  // ------------------------------------------------------------------ arm2d
  function arm2d(root, cfg) {
    const { stage, ctrls, foot } = shell(root, cfg);
    const Ls = cfg.links;
    const n = Ls.length;
    const q = (cfg.q || Ls.map((_, i) => (i ? 0.5 : 0.3))).slice();
    let method = cfg.ik || "dls", lam = cfg.damping ?? 0.1;
    const reach = Ls.reduce((a, b) => a + b, 0);
    const S = 440, k = S / (2.3 * reach);
    const P = (x, y) => [S / 2 + x * k, S / 2 - y * k];
    const svg = s("svg", { viewBox: `0 0 ${S} ${S}`, class: "viz-svg viz-square" });
    stage.append(svg);
    const info = h("div", { class: "viz-caption" });
    foot.append(info);
    // mode "fk": joint sliders only (no target, no IK controls); otherwise a tap or drag sets an IK
    // target, and an optional "target": [x, y] starts the figure solving towards it
    const fkOnly = cfg.mode === "fk";
    let target = !fkOnly && Array.isArray(cfg.target) ? cfg.target.slice(0, 2) : null;
    const fk = () => { const pts = [[0, 0]]; let a = 0, x = 0, y = 0; for (let i = 0; i < n; i++) { a += q[i]; x += Ls[i] * Math.cos(a); y += Ls[i] * Math.sin(a); pts.push([x, y]); } return pts; };
    const jac = () => { const J = [new Array(n).fill(0), new Array(n).fill(0)]; const cum = []; let a = 0; for (let i = 0; i < n; i++) { a += q[i]; cum.push(a); } for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { J[0][i] -= Ls[j] * Math.sin(cum[j]); J[1][i] += Ls[j] * Math.cos(cum[j]); } return J; };
    const JJt = (J) => { const M = [[0, 0], [0, 0]]; for (let i = 0; i < n; i++) { M[0][0] += J[0][i] ** 2; M[0][1] += J[0][i] * J[1][i]; M[1][1] += J[1][i] ** 2; } M[1][0] = M[0][1]; return M; };
    function ikStep() {
      const pts = fk(), ee = pts[n];
      const e = [target[0] - ee[0], target[1] - ee[1]];
      const J = jac();
      let dq;
      if (method === "transpose") {
        const JtE = Array.from({ length: n }, (_, i) => J[0][i] * e[0] + J[1][i] * e[1]);
        const JJte = [J[0].reduce((s1, v, i) => s1 + v * JtE[i], 0), J[1].reduce((s1, v, i) => s1 + v * JtE[i], 0)];
        const alpha = (e[0] * JJte[0] + e[1] * JJte[1]) / (JJte[0] ** 2 + JJte[1] ** 2 + 1e-12);
        dq = JtE.map((v) => alpha * v);
      } else {
        const M = JJt(J);
        const l2 = method === "dls" ? lam * lam : 0;
        const a = M[0][0] + l2, b = M[0][1], c = M[1][0], d = M[1][1] + l2;
        const det = a * d - b * c;
        const y = Math.abs(det) < 1e-12 ? [0, 0] : [(d * e[0] - b * e[1]) / det, (-c * e[0] + a * e[1]) / det];
        dq = Array.from({ length: n }, (_, i) => J[0][i] * y[0] + J[1][i] * y[1]);
      }
      const mx = Math.max(...dq.map(Math.abs));
      const scale = mx > 0.3 ? 0.3 / mx : 1;
      for (let i = 0; i < n; i++) q[i] = Math.atan2(Math.sin(q[i] + dq[i] * scale), Math.cos(q[i] + dq[i] * scale));
      return Math.hypot(...e);
    }
    let err = NaN, iters = 0;
    const sliders = [];
    function draw() {
      const pts = fk();
      svg.innerHTML = "";
      svg.append(s("circle", { cx: S / 2, cy: S / 2, r: reach * k, class: "reach" }));
      const J = jac(), M = JJt(J);
      const w = Math.sqrt(Math.max(0, M[0][0] * M[1][1] - M[0][1] * M[1][0]));
      if (cfg.ellipse === true) { // opt-in (CONTENT_SPEC: `ellipse: true`)
        const tr = M[0][0] + M[1][1], dt = Math.sqrt(Math.max(0, ((M[0][0] - M[1][1]) / 2) ** 2 + M[0][1] ** 2));
        const l1 = tr / 2 + dt, l2 = Math.max(0, tr / 2 - dt);
        const ang = 0.5 * Math.atan2(2 * M[0][1], M[0][0] - M[1][1]);
        const [ex, ey] = P(...pts[n]);
        const sc = 0.35 * k;
        svg.append(s("ellipse", { cx: ex, cy: ey, rx: Math.sqrt(l1) * sc, ry: Math.max(0.8, Math.sqrt(l2) * sc), transform: `rotate(${(-ang * 180) / Math.PI} ${ex} ${ey})`, class: "manip" }));
      }
      for (let i = 0; i < n; i++) { const [x1, y1] = P(...pts[i]), [x2, y2] = P(...pts[i + 1]); svg.append(s("line", { x1, y1, x2, y2, class: "link" })); }
      pts.forEach((p, i) => { const [x, y] = P(...p); svg.append(s("circle", { cx: x, cy: y, r: i === n ? 6 : 8, class: i === n ? "ee" : "joint" })); });
      if (target) { const [tx, ty] = P(...target); svg.append(s("path", { d: `M${tx - 9},${ty}L${tx + 9},${ty}M${tx},${ty - 9}L${tx},${ty + 9}`, class: "target" })); }
      const [ex, ey] = pts[n];
      info.textContent = `x = (${fmt(ex)}, ${fmt(ey)}) · w = √det(JJᵀ) = ${fmt(w)}${w < 0.05 ? ((document.documentElement.lang || "").startsWith("zh") ? " ⚠ 接近奇异" : " ⚠ near singular") : ""}${target ? ` · ‖e‖ = ${fmt(err)} · ${iters} it` : fkOnly ? "" : ` · ${T().drag}`}`;
      sliders.forEach((sl, i) => sl.set(q[i]));
    }
    const an = animator(root, () => { for (let i = 0; i < 2; i++) { err = ikStep(); iters++; } draw(); return err > 1e-3 && iters < 400; });
    const toWorld = (ev) => { const r = svg.getBoundingClientRect(); const x = ((ev.clientX - r.left) / r.width) * S, y = ((ev.clientY - r.top) / r.height) * S; return [(x - S / 2) / k, (S / 2 - y) / k]; };
    let dragging = false;
    if (!fkOnly) svg.addEventListener("pointerdown", (ev) => { dragging = true; svg.setPointerCapture(ev.pointerId); target = toWorld(ev); iters = 0; an.start(); ev.preventDefault(); });
    svg.addEventListener("pointermove", (ev) => { if (!dragging) return; target = toWorld(ev); iters = 0; an.start(); });
    svg.addEventListener("pointerup", () => (dragging = false));
    if (!fkOnly) svg.style.touchAction = "none";
    q.forEach((v, i) => { const sl = slider(`q${i + 1}`, { min: -Math.PI, max: Math.PI, value: v, step: 0.01 }, (x) => { q[i] = x; target = null; draw(); }); sliders.push(sl); ctrls.append(sl); });
    if (!fkOnly) {
      // the damping slider is shown only for DLS, the one method that uses it
      const damp = slider("λ (damping)", { min: 0.001, max: 1, value: lam }, (v) => (lam = v), true);
      damp.hidden = method !== "dls";
      ctrls.append(seg([["dls", "DLS"], ["pinv", "J⁺"], ["transpose", "Jᵀ"]], method, (m) => { method = m; damp.hidden = m !== "dls"; }), damp);
    }
    draw();
    if (target) { iters = 0; an.start(); }
  }

  // ------------------------------------------------------------------ filter
  function filter(root, cfg) {
    const kind = cfg.kind || "histogram";
    if (kind === "kalman") return kalman(root, cfg);
    const { stage, ctrls, foot } = shell(root, cfg);
    const N = cfg.cells || 20;
    const doors = new Set(cfg.doors || [2, 5, 12]);
    const mNoise = cfg.motion_noise ?? 0.2, zNoise = cfg.meas_noise ?? 0.2;
    const r = rng(cfg.seed || 3);
    let truth, bel, parts, w, last, phase;
    const nP = cfg.particles || 200;
    function reset() {
      truth = Math.floor(r() * N);
      bel = new Array(N).fill(1 / N);
      parts = Array.from({ length: nP }, () => r() * N);
      w = new Array(nP).fill(1 / nP);
      last = ""; phase = "move";
    }
    const isDoor = (x) => doors.has(((Math.floor(x) % N) + N) % N);
    function moveStep() {
      const u = r();
      truth = (truth + (u < mNoise / 2 ? 0 : u < mNoise ? 2 : 1)) % N;
      if (kind === "histogram") {
        const nb = new Array(N).fill(0);
        for (let i = 0; i < N; i++) { nb[(i + 1) % N] += bel[i] * (1 - mNoise); nb[i] += (bel[i] * mNoise) / 2; nb[(i + 2) % N] += (bel[i] * mNoise) / 2; }
        bel = nb;
        last = (document.documentElement.lang || "").startsWith("zh") ? "预测：belief 与运动模型卷积（变平、熵增加）" : "Predict: convolve the belief with the motion model (it spreads out)";
      } else {
        parts = parts.map((x) => (x + 1 + randn(r) * Math.sqrt(mNoise) + N) % N);
        last = (document.documentElement.lang || "").startsWith("zh") ? "预测：每个粒子按运动模型采样移动" : "Predict: move every particle by sampling the motion model";
      }
    }
    function senseStep() {
      const z = r() < 1 - zNoise ? isDoor(truth) : !isDoor(truth);
      const lik = (x) => (isDoor(x) === z ? 1 - zNoise : zNoise);
      if (kind === "histogram") {
        bel = bel.map((b, i) => b * lik(i));
        const zsum = bel.reduce((a, b) => a + b, 0);
        bel = bel.map((b) => b / zsum);
        last = ((document.documentElement.lang || "").startsWith("zh") ? `更新：观测 z = ${z ? "门" : "墙"}，乘以似然再归一化` : `Update: z = ${z ? "door" : "wall"}; multiply by the likelihood and normalise`);
      } else {
        w = parts.map((x) => lik(x));
        const zsum = w.reduce((a, b) => a + b, 0);
        w = w.map((x) => x / zsum);
        last = ((document.documentElement.lang || "").startsWith("zh") ? `加权：观测 z = ${z ? "门" : "墙"}，权重 ∝ p(z|x)` : `Weight: z = ${z ? "door" : "wall"}; w ∝ p(z | x)`);
      }
    }
    function resample() {
      const out = [];
      const step = 1 / nP;
      let u = r() * step, c = w[0], i = 0;
      for (let m = 0; m < nP; m++) { while (u > c && i < nP - 1) { i++; c += w[i]; } out.push(parts[i]); u += step; }
      parts = out; w = new Array(nP).fill(1 / nP);
      last = (document.documentElement.lang || "").startsWith("zh") ? "重采样（低方差采样）：按权重复制粒子，权重重置为 1/N" : "Resample (low-variance): copy particles in proportion to weight, reset weights to 1/N";
    }
    function auto() {
      if (kind === "histogram") { if (phase === "move") { moveStep(); phase = "sense"; } else { senseStep(); phase = "move"; } }
      else { if (phase === "move") { moveStep(); phase = "sense"; } else if (phase === "sense") { senseStep(); phase = "resample"; } else { resample(); phase = "move"; } }
    }
    const W = 640, H = 230, cw = W / N, base = 190;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "viz-svg" });
    stage.append(svg);
    const info = h("div", { class: "viz-caption" });
    foot.append(info);
    function draw() {
      svg.innerHTML = "";
      for (let i = 0; i < N; i++) svg.append(s("rect", { x: i * cw + 1, y: base, width: cw - 2, height: 16, rx: 2, class: doors.has(i) ? "door" : "wallc" }));
      if (kind === "histogram") {
        const mx = Math.max(...bel, 1e-9);
        bel.forEach((b, i) => svg.append(s("rect", { x: i * cw + 3, y: base - 6 - (b / mx) * 140, width: cw - 6, height: (b / mx) * 140, rx: 2, class: "bar" })));
        svg.append(s("text", { x: 4, y: 16, class: "tick" }, `max bel = ${fmt(mx)}`));
      } else {
        const mx = Math.max(...w);
        const neff = 1 / w.reduce((a, b) => a + b * b, 0);
        parts.forEach((x, i) => svg.append(s("circle", { cx: x * cw, cy: base - 14 - ((i * 37) % 130), r: 1.5 + 4 * (w[i] / mx), class: "particle" })));
        svg.append(s("text", { x: 4, y: 16, class: "tick" }, `N_eff = ${fmt(neff)} / ${nP}`));
      }
      const tx = truth * cw + cw / 2;
      svg.append(s("path", { d: `M${tx},${base - 2}l-7,-12h14z`, class: "robot" }));
      info.textContent = last || ((document.documentElement.lang || "").startsWith("zh") ? "一维走廊定位：▲ 是真实位置，深色格子是门" : "1-D corridor localisation: ▲ is the true position, dark cells are doors");
    }
    let acc = 0;
    const an = animator(root, (dt) => { acc += dt; if (acc > 0.8) { acc = 0; auto(); draw(); } });
    const play = playButton(an);
    ctrls.append(btn(T().move, () => { play.reset(); moveStep(); phase = "sense"; draw(); }), btn(T().sense, () => { play.reset(); senseStep(); phase = kind === "histogram" ? "move" : "resample"; draw(); }));
    if (kind === "particle") ctrls.append(btn(T().resample, () => { play.reset(); resample(); phase = "move"; draw(); }));
    ctrls.append(play, btn(T().reset, () => { play.reset(); reset(); draw(); }));
    reset();
    draw();
  }
  // 1-D Kalman filter, predict/update step by step. Optional fields (old configs keep their look and meaning):
  //   x0, p0   start estimate μ₀ and variance P₀ (default 0 and 4; the true position starts at 2)
  //   steps    open after this many predict + update cycles (default 0)
  //   names    [process, measurement]: labels of the two noises, e.g. ["$\\sigma_w^2$", "$\\sigma_v^2$"] (default Q, R)
  //   ylabel   y-axis title (default "density p(x)")
  //   span     fixed x axis [0, span] with the robot wrapping around; without it the axis follows the curves
  function kalman(root, cfg) {
    const { stage, ctrls, foot } = shell(root, cfg);
    const zh = (document.documentElement.lang || "").startsWith("zh");
    let q = cfg.q ?? 0.5, rr = cfg.r ?? 2;
    const u = cfg.u ?? 1.5;
    const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
    const mu0 = num(cfg.x0, 0), P0 = Math.max(1e-3, num(cfg.p0, 4)), steps = Math.max(0, Math.min(200, Math.round(num(cfg.steps, 0))));
    const names = Array.isArray(cfg.names) && cfg.names.length === 2 ? cfg.names.map(String) : null;
    // the TeX symbol of a noise name given as "$…$" (used in the gain formula)
    const sym = (n, d) => { const m = n && n.match(/^\$([^$]+)\$/); return m ? m[1] : d; };
    const qS = names ? sym(names[0], "Q") : "Q", rS = names ? sym(names[1], "R") : "R";
    let r = rng(cfg.seed || 5);
    let x, mu, P, z, prior, phase, K, k;
    const fixed = typeof cfg.span === "number" && cfg.span > 4, span = fixed ? cfg.span : 30;
    let xr = null; // the auto-fitted x range; it grows at once and shrinks slowly, so the view does not jump
    function reset() { r = rng(cfg.seed || 5); x = 2; mu = mu0; P = P0; z = null; prior = null; phase = "predict"; K = NaN; k = 0; xr = null; }
    function predict() { x += u + randn(r) * Math.sqrt(q); if (fixed && x > span - 2) x -= span - 4; prior = [mu + u, P + q]; if (fixed && prior[0] > span - 2) prior[0] -= span - 4; mu = prior[0]; P = prior[1]; z = null; phase = "update"; k++; }
    function update() { z = x + randn(r) * Math.sqrt(rr); K = P / (P + rr); mu = mu + K * (z - mu); P = (1 - K) * P; phase = "predict"; }
    const W = 640, H = 270, pad = { l: 46, r: 10, t: 10, b: 40 };
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "viz-svg" });
    stage.append(svg);
    const info = h("div", { class: "viz-caption" });
    const colors = pal();
    foot.append(info, legend([[zh ? "先验 / 预测" : "prior / predict", colors[2], true], [zh ? "观测 p(z|x)" : "measurement p(z|x)", colors[1]], [zh ? "后验" : "posterior", colors[0]], [zh ? "真实 x ▲" : "true x ▲", cssv("--fg")]]));
    const gauss = (m, v) => (xx) => Math.exp(-((xx - m) ** 2) / (2 * v)) / Math.sqrt(2 * Math.PI * v);
    function range() {
      if (fixed) return [0, span];
      const pts = [[mu, P], ...(prior ? [prior] : []), ...(z != null ? [[z, rr]] : [])];
      let lo = Math.min(x, ...pts.map(([m, v]) => m - 3.5 * Math.sqrt(v))), hi = Math.max(x, ...pts.map(([m, v]) => m + 3.5 * Math.sqrt(v)));
      if (hi - lo < 10) { const c = (lo + hi) / 2; lo = c - 5; hi = c + 5; }
      const t = [lo - 0.5, hi + 0.5];
      xr = xr ? [Math.min(t[0], xr[0] + 0.5 * (t[0] - xr[0])), Math.max(t[1], xr[1] + 0.5 * (t[1] - xr[1]))] : t;
      return xr;
    }
    function draw() {
      svg.innerHTML = "";
      const curves = [];
      if (prior) curves.push([gauss(prior[0], prior[1]), colors[2], true]);
      if (z != null) curves.push([gauss(z, rr), colors[1], false]);
      curves.push([gauss(mu, P), colors[0], false]);
      const xs = range();
      let ymax = 0;
      for (const [g] of curves) for (let i = 0; i <= 300; i++) ymax = Math.max(ymax, g(xs[0] + (i / 300) * (xs[1] - xs[0])));
      const { X, Y } = axes(svg, W, H, pad, xs, [0, ymax * 1.1], "x", cfg.ylabel || (zh ? "概率密度 p(x)" : "density p(x)"));
      for (const [g, c, dashed] of curves) {
        let d = "";
        for (let i = 0; i <= 300; i++) { const xx = xs[0] + (i / 300) * (xs[1] - xs[0]); d += (i ? "L" : "M") + X(xx).toFixed(1) + "," + Y(g(xx)).toFixed(1); }
        svg.append(s("path", { d, class: "curve" + (dashed ? " dashed" : ""), stroke: c }));
      }
      svg.append(s("path", { d: `M${X(x)},${H - pad.b}l-7,10h14z`, class: "robot" }));
      const next = phase === "update" ? (zh ? "下一步：更新（测量）" : "next: update (measure)") : (zh ? "下一步：预测（移动）" : "next: predict (move)");
      math(info, `${k ? `t = ${k} · ` : ""}$\\mu = ${fmt(mu)}$, $\\sigma^2 = ${fmt(P)}$${isFinite(K) ? ` · $K = P/(P + ${rS}) = ${fmt(K)}$` : ""} · ${next}`);
    }
    let acc = 0;
    const an = animator(root, (dt) => { acc += dt; if (acc > 0.9) { acc = 0; phase === "predict" ? predict() : update(); draw(); } });
    const play = playButton(an);
    const run = () => { for (let i = 0; i < steps; i++) { predict(); update(); } };
    ctrls.append(btn(T().predict, () => { play.reset(); predict(); draw(); }), btn(T().update, () => { play.reset(); update(); draw(); }), play, btn(T().reset, () => { play.reset(); reset(); run(); draw(); }));
    ctrls.append(slider(names ? names[0] : zh ? `${qS}（过程噪声）` : `${qS} (process)`, { min: 0.05, max: 5, value: q }, (v) => (q = v), true), slider(names ? names[1] : zh ? `${rS}（测量噪声）` : `${rS} (measurement)`, { min: 0.05, max: 10, value: rr }, (v) => (rr = v), true));
    reset();
    run();
    draw();
  }

  // ------------------------------------------------------------------ diffusion2d
  function makeData(kind, n, r) {
    const out = [];
    for (let i = 0; i < n; i++) {
      let x, y;
      if (kind === "spiral") { const t = Math.sqrt(r()) * 3 * Math.PI; x = (t * Math.cos(t)) / 5; y = (t * Math.sin(t)) / 5; x += randn(r) * 0.04; y += randn(r) * 0.04; }
      else if (kind === "gmm") { const c = [[-1.4, -1.4], [1.4, 1.4], [-1.4, 1.4], [1.4, -1.4]][i % 4]; x = c[0] + randn(r) * 0.25; y = c[1] + randn(r) * 0.25; }
      else if (kind === "ring") { const t = r() * 2 * Math.PI; x = 1.6 * Math.cos(t) + randn(r) * 0.06; y = 1.6 * Math.sin(t) + randn(r) * 0.06; }
      else { const t = r() * Math.PI; if (i % 2) { x = Math.cos(t) - 0.5; y = Math.sin(t) - 0.25; } else { x = 1 - Math.cos(t) - 0.5; y = 0.25 - Math.sin(t); } x = x * 1.3 + randn(r) * 0.05; y = y * 1.3 + randn(r) * 0.05; }
      out.push([x, y]);
    }
    return out;
  }
  function diffusion2d(root, cfg) {
    const { stage, ctrls, foot } = shell(root, cfg);
    const r = rng(cfg.seed || 11);
    const data = makeData(cfg.data || "two-moons", 300, r);
    let proc = cfg.process || "ddpm";
    let nSteps = cfg.steps || 40;
    const sched = cfg.schedule || "cosine";
    const sd2 = 0.03 ** 2;
    const abar = (t) => (sched === "linear" ? Math.exp(-(0.1 * t + 0.5 * (20 - 0.1) * t * t)) : Math.cos(((t + 0.008) / 1.008) * (Math.PI / 2)) ** 2);
    const noise0 = data.map(() => [randn(r), randn(r)]);
    let tF = 0;
    let samples = null, trails = null, si = 0;
    function denoise(xt, t) {
      // exact posterior mean E[x0 | x_t] for the data treated as a mixture of tiny Gaussians
      let a, sg, c;
      if (proc === "flow") { a = 1 - t; sg = t * t; } else { const ab = abar(t); a = Math.sqrt(ab); sg = 1 - ab; }
      const v = a * a * sd2 + sg;
      c = (a * sd2) / v;
      let mx = -Infinity;
      const lw = data.map(([dx, dy]) => { const e = -(((xt[0] - a * dx) ** 2 + (xt[1] - a * dy) ** 2) / (2 * v)); if (e > mx) mx = e; return e; });
      let z = 0, ox = 0, oy = 0;
      for (let i = 0; i < data.length; i++) { const w = Math.exp(lw[i] - mx); z += w; ox += w * (data[i][0] + c * (xt[0] - a * data[i][0])); oy += w * (data[i][1] + c * (xt[1] - a * data[i][1])); }
      return [ox / z, oy / z];
    }
    function stepAll(k) {
      const t = 1 - k / nSteps, s1 = 1 - (k + 1) / nSteps;
      samples = samples.map((x) => {
        const tt = Math.max(t, 1e-3);
        const x0 = denoise(x, tt);
        if (proc === "flow") { const eps = [(x[0] - (1 - tt) * x0[0]) / tt, (x[1] - (1 - tt) * x0[1]) / tt]; const vx = eps[0] - x0[0], vy = eps[1] - x0[1]; return [x[0] - (tt - s1) * vx, x[1] - (tt - s1) * vy]; }
        const ab = abar(tt), abs = abar(s1);
        if (proc === "ddim") { const eps = [(x[0] - Math.sqrt(ab) * x0[0]) / Math.sqrt(1 - ab), (x[1] - Math.sqrt(ab) * x0[1]) / Math.sqrt(1 - ab)]; return [Math.sqrt(abs) * x0[0] + Math.sqrt(1 - abs) * eps[0], Math.sqrt(abs) * x0[1] + Math.sqrt(1 - abs) * eps[1]]; }
        const al = ab / abs;
        const c0 = (Math.sqrt(abs) * (1 - al)) / (1 - ab), ct = (Math.sqrt(al) * (1 - abs)) / (1 - ab);
        const sig = s1 > 0 ? Math.sqrt(((1 - abs) / (1 - ab)) * (1 - al)) : 0;
        return [c0 * x0[0] + ct * x[0] + sig * randn(r), c0 * x0[1] + ct * x[1] + sig * randn(r)];
      });
      samples.slice(0, 14).forEach((x, i) => trails[i].push(x));
    }
    const S = 420;
    const canvas = h("canvas", { width: S * 2, height: S * 2, class: "viz-canvas viz-square" });
    stage.append(canvas);
    const ctx = canvas.getContext("2d");
    const P = (x, y) => [((x + 3) / 6) * S * 2, ((3 - y) / 6) * S * 2];
    const info = h("div", { class: "viz-caption" });
    // a legend that names what is on the canvas in the current state (noising or sampling)
    const zhL = () => (document.documentElement.lang || "").startsWith("zh");
    const leg = h("div");
    foot.append(leg, info);
    let legKey = "";
    function drawLegend(colors, dataCol) {
      const key = (samples ? "rev" : "fwd") + (zhL() ? "zh" : "en") + proc;
      if (key === legKey) return;
      legKey = key;
      const Z = zhL();
      const items = [[Z ? "数据（干净的 $x_0$）" : "data (clean $x_0$)", dataCol, "box"]];
      if (samples) items.push([Z ? "样本：从噪声出发，逐步去噪" : "samples: start as noise, denoised step by step", colors[0], "box"], [Z ? "14 个样本走过的路径" : "paths of 14 samples", colors[2]]);
      else items.push([proc === "flow" ? (Z ? "$x_t$：数据与噪声按 $t$ 混合（$t = 1$ 全是噪声）" : "$x_t$: data blended with noise by $t$ ($t = 1$: pure noise)") : (Z ? "$x_t$：加噪到时刻 $t$ 的数据（$t = 1$ 全是噪声）" : "$x_t$: the data noised to time $t$ ($t = 1$: pure noise)"), colors[0], "box"]);
      leg.replaceChildren(legend(items));
    }
    function draw() {
      ctx.clearRect(0, 0, S * 2, S * 2);
      const colors = pal();
      drawLegend(colors, mix(cssv("--viz-cell"), cssv("--fg"), 0.3));
      ctx.fillStyle = mix(cssv("--viz-cell"), cssv("--fg"), 0.3);
      for (const [x, y] of data) { const [px, py] = P(x, y); ctx.fillRect(px - 2.5, py - 2.5, 5, 5); }
      if (samples) {
        ctx.strokeStyle = colors[2]; ctx.lineWidth = 2;
        for (const tr of trails) { ctx.beginPath(); tr.forEach(([x, y], j) => { const [px, py] = P(x, y); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); }
        ctx.fillStyle = colors[0];
        for (const [x, y] of samples) { const [px, py] = P(x, y); ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill(); }
        info.textContent = zhL() ? `${proc.toUpperCase()} 反向采样 · 第 ${si}/${nSteps} 步 · t = ${fmt(1 - si / nSteps)}` : `${proc.toUpperCase()} reverse · step ${si}/${nSteps} · t = ${fmt(1 - si / nSteps)}`;
      } else {
        ctx.fillStyle = colors[0];
        for (let i = 0; i < data.length; i++) {
          let x, y;
          if (proc === "flow") { x = (1 - tF) * data[i][0] + tF * noise0[i][0]; y = (1 - tF) * data[i][1] + tF * noise0[i][1]; }
          else { const ab = abar(tF); x = Math.sqrt(ab) * data[i][0] + Math.sqrt(1 - ab) * noise0[i][0]; y = Math.sqrt(ab) * data[i][1] + Math.sqrt(1 - ab) * noise0[i][1]; }
          const [px, py] = P(x, y); ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
        }
        math(info, proc === "flow" ? `forward (interpolation): $x_t = (1-t)\\,x_0 + t\\,\\varepsilon$ · t = ${fmt(tF)}` : `forward: $x_t = \\sqrt{\\bar\\alpha_t}\\,x_0 + \\sqrt{1-\\bar\\alpha_t}\\,\\varepsilon$ · t = ${fmt(tF)}, ᾱ = ${fmt(abar(tF))}`);
      }
    }
    let acc = 0;
    const an = animator(root, (dt) => { acc += dt * Math.max(8, nSteps / 2.5); while (acc >= 1 && si < nSteps) { acc -= 1; stepAll(si); si++; } draw(); return si < nSteps; });
    const play = playButton(an, () => { samples = Array.from({ length: 300 }, () => [randn(r), randn(r)]); trails = samples.slice(0, 14).map((x) => [x]); si = 0; acc = 0; });
    play.textContent = "▶ " + T().sample;
    an.onStop = () => (play.textContent = "▶ " + T().sample);
    const tRow = slider((document.documentElement.lang || "").startsWith("zh") ? "前向加噪 t" : "forward t", { min: 0, max: 1, value: 0, step: 0.01 }, (v) => { play.reset(); play.textContent = "▶ " + T().sample; samples = null; tF = v; draw(); });
    ctrls.append(tRow, play, seg([["ddpm", "DDPM"], ["ddim", "DDIM"], ["flow", "Flow"]], proc, (p) => { proc = p; samples = null; draw(); }), slider((document.documentElement.lang || "").startsWith("zh") ? "步数" : "steps", { min: 5, max: 100, value: nSteps, step: 1 }, (v) => (nSteps = Math.round(v))));
    draw();
  }

  // ------------------------------------------------------------------ kmeans
  function kmeans(root, cfg) {
    const { stage, ctrls, foot } = shell(root, cfg);
    const K = cfg.k || 3, algo = cfg.algo || "kmeans", n = cfg.n || 180;
    let seed = cfg.seed || 2;
    let pts, mu, cov, pi, resp, it, phase, obj;
    function reset() {
      const r = rng(seed);
      const centers = Array.from({ length: K }, () => [r() * 4 - 2, r() * 4 - 2]);
      pts = Array.from({ length: n }, (_, i) => { const c = centers[i % K]; const sx = 0.3 + r() * 0.4, sy = 0.3 + r() * 0.4, rho = r() * 1.2 - 0.6; const a = randn(r), b = randn(r); return [c[0] + sx * a, c[1] + sy * (rho * a + Math.sqrt(1 - rho * rho) * b)]; });
      mu = Array.from({ length: K }, () => [...pts[Math.floor(r() * n)]]);
      cov = Array.from({ length: K }, () => [[0.6, 0], [0, 0.6]]);
      pi = new Array(K).fill(1 / K);
      resp = pts.map(() => new Array(K).fill(1 / K));
      it = 0; phase = "E"; obj = NaN;
    }
    const gpdf = (p, m, C) => { const dx = p[0] - m[0], dy = p[1] - m[1]; const det = C[0][0] * C[1][1] - C[0][1] * C[1][0]; const i00 = C[1][1] / det, i01 = -C[0][1] / det, i11 = C[0][0] / det; return Math.exp(-0.5 * (dx * dx * i00 + 2 * dx * dy * i01 + dy * dy * i11)) / (2 * Math.PI * Math.sqrt(det)); };
    function step() {
      if (phase === "E") {
        if (algo === "kmeans") { resp = pts.map((p) => { let b = 0, bd = Infinity; mu.forEach((m, j) => { const d = (p[0] - m[0]) ** 2 + (p[1] - m[1]) ** 2; if (d < bd) { bd = d; b = j; } }); return mu.map((_, j) => (j === b ? 1 : 0)); }); obj = pts.reduce((a, p, i) => a + mu.reduce((s1, m, j) => s1 + resp[i][j] * ((p[0] - m[0]) ** 2 + (p[1] - m[1]) ** 2), 0), 0); }
        else { obj = 0; resp = pts.map((p) => { const w = mu.map((m, j) => pi[j] * gpdf(p, m, cov[j])); const z = w.reduce((a, b) => a + b, 0) || 1e-300; obj += Math.log(z); return w.map((x) => x / z); }); }
        phase = "M";
      } else {
        for (let j = 0; j < K; j++) {
          const nk = resp.reduce((a, r) => a + r[j], 0) || 1e-9;
          mu[j] = [resp.reduce((a, r, i) => a + r[j] * pts[i][0], 0) / nk, resp.reduce((a, r, i) => a + r[j] * pts[i][1], 0) / nk];
          if (algo === "gmm") {
            let a = 0, b = 0, d = 0;
            resp.forEach((r, i) => { const dx = pts[i][0] - mu[j][0], dy = pts[i][1] - mu[j][1]; a += r[j] * dx * dx; b += r[j] * dx * dy; d += r[j] * dy * dy; });
            cov[j] = [[a / nk + 1e-3, b / nk], [b / nk, d / nk + 1e-3]];
            pi[j] = nk / n;
          }
        }
        phase = "E"; it++;
      }
    }
    const S = 420;
    const svg = s("svg", { viewBox: `0 0 ${S} ${S}`, class: "viz-svg viz-square" });
    stage.append(svg);
    const info = h("div", { class: "viz-caption" });
    foot.append(info);
    const P = (x, y) => [((x + 3.5) / 7) * S, ((3.5 - y) / 7) * S];
    function draw() {
      svg.innerHTML = "";
      const colors = pal();
      pts.forEach((p, i) => {
        const r = resp[i]; let b = 0; r.forEach((v, j) => { if (v > r[b]) b = j; });
        const [x, y] = P(...p);
        svg.append(s("circle", { cx: x, cy: y, r: 4, fill: it || phase === "M" ? colors[b % 6] : cssv("--muted"), "fill-opacity": algo === "gmm" ? 0.35 + 0.65 * r[b] : 0.85 }));
      });
      mu.forEach((m, j) => {
        const [x, y] = P(...m);
        if (algo === "gmm") {
          const C = cov[j], tr = C[0][0] + C[1][1], dt = Math.sqrt(((C[0][0] - C[1][1]) / 2) ** 2 + C[0][1] ** 2);
          const ang = 0.5 * Math.atan2(2 * C[0][1], C[0][0] - C[1][1]);
          const k = S / 7;
          svg.append(s("ellipse", { cx: x, cy: y, rx: 2 * Math.sqrt(tr / 2 + dt) * k, ry: 2 * Math.sqrt(Math.max(1e-6, tr / 2 - dt)) * k, transform: `rotate(${(-ang * 180) / Math.PI} ${x} ${y})`, class: "gell", stroke: colors[j % 6] }));
        }
        svg.append(s("path", { d: `M${x - 9},${y - 9}L${x + 9},${y + 9}M${x - 9},${y + 9}L${x + 9},${y - 9}`, class: "centroid", stroke: colors[j % 6] }));
      });
      const zh = (document.documentElement.lang || "").startsWith("zh");
      const next = phase === "E" ? (algo === "kmeans" ? (zh ? "下一步：分配（每个点归到最近的中心）" : "next: assign each point to the nearest centre") : (zh ? "下一步：E 步（计算责任 γ）" : "next: E-step (responsibilities γ)")) : (algo === "kmeans" ? (zh ? "下一步：更新（中心 = 簇内均值）" : "next: update centres to cluster means") : (zh ? "下一步：M 步（更新 π, μ, Σ）" : "next: M-step (update π, μ, Σ)"));
      info.textContent = `${T().iter} ${it} · ${isFinite(obj) ? (algo === "kmeans" ? `inertia = ${fmt(obj)}` : `log-likelihood = ${fmt(obj)}`) + " · " : ""}${next}`;
    }
    let acc = 0;
    let lastObj = NaN, still = 0;
    const an = animator(root, (dt) => { acc += dt; if (acc > 0.6) { acc = 0; step(); draw(); if (phase === "E") { still = Math.abs(obj - lastObj) < 1e-6 ? still + 1 : 0; lastObj = obj; if (still > 1) return false; } } });
    const play = playButton(an);
    ctrls.append(btn(T().step, () => { play.reset(); step(); draw(); }), play, btn(T().newData, () => { play.reset(); seed++; reset(); draw(); }));
    reset();
    draw();
  }

  // ------------------------------------------------------------------ timeline
  function pipelineItems(preset, S, M) {
    // Exact schedules as fixed per-device operation orders (Megatron-LM conventions):
    //   GPipe: all forwards, then all backwards.
    //   1F1B (PipeDream-flush): S−d−1 warm-up forwards on device d, then alternate F,B, then drain B.
    //   Interleaved (v = 2 model chunks per device): warm-up 2(S−d−1)+(v−1)S chunk forwards; chunks
    //   are processed in groups of S micro-batches (forward: chunk 0 then 1; backward: chunk 1 then 0).
    // Forward of a full stage = 1 time unit, backward = 2; a chunk takes 1/v of that.
    const v = preset === "interleaved" ? 2 : 1;
    const F = 1 / v, B = 2 / v, V = S * v;
    const done = new Map();
    const key = (k, st, m) => `${k}${st}:${m}`;
    const ready = (o) => {
      if (o.k === "F") return o.st === 0 ? 0 : done.get(key("F", o.st - 1, o.m));
      const f = done.get(key("F", o.st, o.m));
      if (o.st === V - 1) return f;
      const b = done.get(key("B", o.st + 1, o.m));
      return f != null && b != null ? Math.max(f, b) : undefined;
    };
    const seqs = [];
    for (let d = 0; d < S; d++) {
      const chunks = Array.from({ length: v }, (_, c) => c * S + d);
      const Fs = [], Bs = [];
      for (let g = 0; g * S < M || (v === 1 && g === 0); g++) {
        const ms = v === 1 ? Array.from({ length: M }, (_, i) => i) : Array.from({ length: Math.min(M, (g + 1) * S) - g * S }, (_, i) => g * S + i);
        for (let c = 0; c < v; c++) for (const m of ms) Fs.push({ k: "F", st: chunks[c], m });
        for (let c = v - 1; c >= 0; c--) for (const m of ms) Bs.push({ k: "B", st: chunks[c], m });
        if (v === 1) break;
      }
      let seq;
      if (preset === "gpipe") seq = [...Fs, ...Bs];
      else {
        const warm = Math.min(Fs.length, v === 1 ? S - d - 1 : 2 * (S - d - 1) + (v - 1) * S);
        seq = Fs.slice(0, warm);
        let fi = warm, bi = 0;
        while (fi < Fs.length) { seq.push(Fs[fi++]); seq.push(Bs[bi++]); }
        while (bi < Bs.length) seq.push(Bs[bi++]);
      }
      seqs.push(seq);
    }
    const ptr = new Array(S).fill(0), free = new Array(S).fill(0), items = [];
    for (let guard = 0; guard < 1e5; guard++) {
      let best = null;
      for (let d = 0; d < S; d++) {
        if (ptr[d] >= seqs[d].length) continue;
        const o = seqs[d][ptr[d]], r = ready(o);
        if (r == null) continue;
        const st = Math.max(free[d], r);
        if (!best || st < best.st - 1e-9) best = { d, o, st };
      }
      if (!best) break;
      const { d, o, st } = best, len = o.k === "F" ? F : B;
      items.push({ lane: d, start: st, len, label: `${o.k}${o.m + 1}${v > 1 ? "·" + Math.floor(o.st / S) : ""}`, kind: o.k === "F" ? "fwd" : "bwd" });
      done.set(key(o.k, o.st, o.m), st + len);
      free[d] = st + len;
      ptr[d]++;
    }
    return items;
  }
  // Legend names of the pipeline presets (the only configs where the kinds have a fixed meaning).
  // idle (a pipeline bubble) is a pale grey, other work a mid grey, so the two never look alike
  const TL_KINDS = [["fwd", "--v1", "forward", "前向"], ["bwd", "--v2", "backward", "反向"], ["comm", "--v3", "comm", "通信"], ["idle", "--border-2", "idle", "空闲"], ["other", "--faint", "other", "其他"]];
  const TL_COLOR = { fwd: "--v1", bwd: "--v2", comm: "--v3", idle: "--border-2", other: "--faint" };
  const fmtN = (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : fmt(v));
  function timeline(root, cfg) {
    const { stage, ctrls, foot } = shell(root, cfg);
    const zh = () => (document.documentElement.lang || "").startsWith("zh");
    let S = cfg.stages || 4, M = cfg.micro || 8;
    let preset = cfg.preset || null;
    const svgBox = h("div", { class: "viz-scroll" });
    stage.append(svgBox);
    const hint = h("div", { class: "viz-hint" });
    const info = h("div", { class: "viz-caption" });
    foot.append(hint, info);
    let items, lanes, t0, tEnd, cursor = Infinity, lastW = 0;
    function build() {
      items = preset ? pipelineItems(preset, S, M) : cfg.items;
      lanes = (cfg.lanes || (preset ? Array.from({ length: S }, (_, i) => `GPU${i}`) : [...new Set(items.map((x) => x.lane))])).map(String);
      t0 = Math.min(0, ...items.map((x) => x.start));
      tEnd = Math.max(...items.map((x) => x.start + x.len));
    }
    const laneOf = (it) => (typeof it.lane === "number" ? it.lane : lanes.indexOf(String(it.lane)));
    function draw() {
      // The drawing is laid out at the real pixel width of the box, so text keeps its size; the time
      // axis fits the width unless the shortest block would get under 3 px, then the box scrolls.
      const avail = Math.max(280, Math.floor(svgBox.clientWidth || stage.clientWidth || 640));
      lastW = avail;
      const LPX = 12.5, maxLane = Math.max(70, avail * 0.36);
      const laneLines = lanes.map((l) => (textWidth(l, LPX) > maxLane ? wrapText(l, maxLane, LPX, 600, 2) : [l]));
      const lw = Math.ceil(Math.max(24, ...laneLines.flat().map((x) => textWidth(x, LPX)))) + 14;
      const rowH = laneLines.some((x) => x.length > 1) ? 40 : 34, right = 14;
      const span = tEnd - t0 || 1;
      const minLen = Math.min(...items.map((it) => it.len).filter((x) => x > 0), span);
      let k = (avail - lw - right) / span;
      const scroll = k * minLen < 3;
      if (scroll) k = 3 / minLen;
      const W = Math.ceil(lw + span * k + right), H = lanes.length * rowH + 24;
      const X = (t) => lw + (t - t0) * k;
      const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "viz-svg viz-tl", style: `width:${W}px;max-width:none` });
      laneLines.forEach((ls, i) => {
        svg.append(svgLines({ x: lw - 8, y: i * rowH + rowH / 2 + 4 - ((ls.length - 1) * 15) / 2, "text-anchor": "end", class: "label" }, ls, 15));
        svg.append(s("rect", { x: lw, y: i * rowH + 3, width: W - lw - right, height: rowH - 6, rx: 4, class: "lane" }));
      });
      // per lane, the start times that follow each block (to know whether a label fits after it)
      const starts = lanes.map(() => []), ends = lanes.map(() => []);
      const taken = lanes.map(() => []); // x-intervals already used by labels written outside their block
      const free = (li, a, b) => taken[li].every(([c, d]) => b <= c || a >= d);
      for (const it of items) { const li = laneOf(it); if (starts[li]) { starts[li].push(it.start); ends[li].push(it.start + it.len); } }
      for (const it of items) {
        if (it.start >= cursor) continue;
        const li = laneOf(it);
        if (li < 0) continue;
        const wv = Math.min(it.len, cursor - it.start), x = X(it.start) + 1, w = Math.max(1, wv * k - 2), y = li * rowH + 5;
        const kind = TL_COLOR[it.kind] ? it.kind : "other";
        const r = s("rect", { x, y, width: w, height: rowH - 10, rx: 3, class: "tl " + kind });
        svg.append(r);
        if (!it.label) continue;
        const label = String(it.label), tw = textWidth(label, 11, 600), cy = li * rowH + rowH / 2 + 4;
        const dark = kind === "fwd" || kind === "bwd" || kind === "comm";
        if (tw <= w - 6) { svg.append(s("text", { x: x + w / 2, y: cy, "text-anchor": "middle", class: "cell tl-in" + (dark ? " inv" : "") }, label)); continue; }
        if (wv < it.len) continue;
        // too long for its block: write it after the block if the lane is free there, else shorten it
        const end = it.start + it.len, nxt = Math.min(tEnd + (W - right - X(tEnd)) / k, ...starts[li].filter((t) => t >= end - 1e-9 && t !== it.start));
        if (tw + 10 <= (nxt - end) * k && free(li, X(end), X(end) + tw + 8)) { taken[li].push([X(end), X(end) + tw + 8]); svg.append(s("text", { x: X(end) + 4, y: cy, "text-anchor": "start", class: "cell tl-out" }, label)); continue; }
        const prv = Math.max(t0, ...ends[li].filter((t) => t <= it.start + 1e-9 && t !== end));
        if (tw + 10 <= (it.start - prv) * k && free(li, x - tw - 8, x)) { taken[li].push([x - tw - 8, x]); svg.append(s("text", { x: x - 4, y: cy, "text-anchor": "end", class: "cell tl-out" }, label)); continue; }
        r.append(s("title", {}, texPlain(label)));
        if (w < 26) continue;
        const plain = texPlain(label);
        let n = plain.length;
        while (n > 1 && textWidth(plain.slice(0, n) + "…", 11, 600) > w - 6) n--;
        svg.append(s("text", { x: x + w / 2, y: cy, "text-anchor": "middle", class: "cell tl-in" + (dark ? " inv" : "") }, plain.slice(0, n).trimEnd() + "…"));
      }
      const tt = niceTicks(t0, tEnd, clamp(Math.floor((span * k) / 80), 3, 12)), ft = tickFmt(tt);
      for (const t of tt) svg.append(s("text", { x: X(t), y: H - 6, "text-anchor": t === tt[0] && X(t) - lw < 12 ? "start" : "middle", class: "tick" }, ft(t)));
      if (isFinite(cursor) && cursor < tEnd) svg.append(s("line", { x1: X(cursor), x2: X(cursor), y1: 0, y2: H - 18, class: "cursor" }));
      svgBox.innerHTML = "";
      svgBox.append(svg);
      hint.textContent = scroll ? (zh() ? "← 左右滑动查看整条时间线 →" : "← scroll sideways to see the whole timeline →") : "";
      hint.hidden = !scroll;
      const busy = items.reduce((a, x) => a + x.len, 0);
      const bubble = 1 - busy / (lanes.length * tEnd);
      const unit = cfg.unit ? String(cfg.unit) : "";
      // "units of 10 ms" when the unit itself starts with a number
      const range = `${fmtN(t0)} – ${fmtN(tEnd)}`;
      const timeTxt = !unit ? `${T().time}: ${range}` : /^[\d.]/.test(unit) ? (zh() ? `时间（单位 ${unit}）：${range}` : `time (units of ${unit}): ${range}`) : `${T().time}: ${range} ${unit}`;
      info.textContent = preset ? `${preset.toUpperCase()} · stages p=${S}, micro-batches m=${M} · makespan ${fmt(tEnd)} · ${T().bubble} ≈ ${(bubble * 100).toFixed(1)}%${preset === "interleaved" ? ` (theory (p−1)/(v·m+p−1) = ${(((S - 1) / (2 * M + S - 1)) * 100).toFixed(1)}%, v=2)` : ` (theory (p−1)/(m+p−1) = ${(((S - 1) / (M + S - 1)) * 100).toFixed(1)}%)`}` : timeTxt;
      drawLegend();
    }
    // Legend: the pipeline presets keep their forward / backward / comm / idle key; other timelines
    // name their colours with "legend": {"fwd": "sensing", …} (only kinds that are used are shown);
    // without it there is no legend — the block labels and lanes say what each bar is.
    const legBox = h("div");
    foot.append(legBox);
    function drawLegend() {
      let entries = [];
      if (preset && !cfg.legend) { const used = new Set(items.map((it) => (TL_COLOR[it.kind] ? it.kind : "other"))); entries = TL_KINDS.filter(([k]) => k !== "other" || used.has(k)).map(([k, c, en, cn]) => [zh() ? cn : en, cssv(c), "box"]); }
      else if (cfg.legend) {
        const used = new Set(items.map((it) => (TL_COLOR[it.kind] ? it.kind : "other")));
        const list = Array.isArray(cfg.legend) ? cfg.legend : Object.entries(cfg.legend);
        entries = list.filter(([k]) => used.has(k)).map(([k, name]) => [name, cssv(TL_COLOR[k] || "--faint"), "box"]);
      }
      legBox.replaceChildren(...(entries.length ? [legend(entries)] : []));
    }
    const an = animator(root, (dt) => { cursor += (dt * (tEnd - t0)) / 5; draw(); if (cursor >= tEnd) { cursor = Infinity; draw(); return false; } });
    const play = playButton(an, () => { cursor = t0; });
    ctrls.append(play);
    if (preset) {
      ctrls.append(seg([["gpipe", "GPipe"], ["1f1b", "1F1B"], ["interleaved", "Interleaved"]], preset, (p) => { preset = p; play.reset(); cursor = Infinity; build(); draw(); }));
      ctrls.append(slider("p (stages)", { min: 2, max: 8, value: S, step: 1 }, (v) => { S = Math.round(v); build(); draw(); }), slider("m (micro-batches)", { min: 1, max: 16, value: M, step: 1 }, (v) => { M = Math.round(v); build(); draw(); }));
    }
    build();
    draw();
    // redraw at the new width when the box is resized (rotation, split view)
    if ("ResizeObserver" in window) new ResizeObserver(() => { if (root.isConnected && Math.abs((svgBox.clientWidth || 0) - lastW) > 4) draw(); }).observe(svgBox);
  }

  // ------------------------------------------------------------------ mount
  const TYPES = { plot, bars, heatmap, frames, matrix2d, gridworld, gd2d, arm2d, filter, diffusion2d, kmeans, timeline };
  function mount(el) {
    if (el.dataset.mounted) return;
    el.dataset.mounted = "1";
    let cfg;
    try { cfg = JSON.parse(el.dataset.cfg); } catch { el.textContent = "⚠ viz"; return; }
    const fn = TYPES[cfg.type];
    if (!fn) { el.textContent = "⚠ unknown viz " + cfg.type; return; }
    try { fn(el, cfg); } catch (e) { el.innerHTML = ""; el.append(h("div", { class: "viz-err" }, `⚠ ${cfg.type}: ${e.message}`)); console.error(e); }
  }
  // Mount lazily: only figures that scroll into view (or are inside opened sections).
  let io = null;
  function mountAll(container) {
    const els = (container || document).querySelectorAll(".viz:not([data-mounted])");
    if (!("IntersectionObserver" in window)) { els.forEach(mount); return; }
    io ||= new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); mount(e.target); } }), { rootMargin: "300px" });
    els.forEach((el) => io.observe(el));
  }
  function remountAll(container) {
    (container || document).querySelectorAll(".viz[data-mounted]").forEach((el) => { delete el.dataset.mounted; mount(el); });
  }
  // viz2.js (and future files) add widget types through register() and reuse the helpers.
  const register = (name, fn) => { TYPES[name] = fn; };
  const util = { h, s, math, mathNodes, texPlain, cssv, pal, rgb, mix, clamp, fmt, rng, randn, compile, HELPERS, HV, T, animator, shell, slider, btn, seg, playButton, fitPre, niceTicks, tickFmt, axes, yPad, legend, arrowPath, textWidth, wrapText, svgLines, svgTextNodes, paramSliders };
  window.Viz = { mount, mountAll, remountAll, register, util };
})();
