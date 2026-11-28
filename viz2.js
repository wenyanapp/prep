"use strict";
// Dedicated teaching widgets (Transformer stack and core ML/robotics concepts).
// Registered into viz.js through Viz.register; see CONTENT_SPEC.md for the fields.
(() => {
  if (!window.Viz) return;
  const { h, s, cssv, pal, mix, clamp, fmt, rng, randn, T, animator, shell, slider, btn, seg, playButton, axes, legend, arrowPath } = Viz.util;
  const zh = () => (document.documentElement.lang || "").startsWith("zh");
  const L = (en, cn) => (zh() ? cn : en);
  const short = (t, n = 6) => (String(t).length > n ? String(t).slice(0, n - 1) + "…" : String(t));
  const matmul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((acc, v, k) => acc + v * B[k][j], 0)));
  const transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]));
  const randMat = (r, n, m, sc = 1) => Array.from({ length: n }, () => Array.from({ length: m }, () => randn(r) * sc));
  const softmaxRow = (row) => { const m = Math.max(...row.filter(isFinite)); const e = row.map((v) => (isFinite(v) ? Math.exp(v - m) : 0)); const z = e.reduce((a, b) => a + b, 0) || 1; return e.map((v) => v / z); };
  const fmtBytes = (b) => (b >= 2 ** 30 ? (b / 2 ** 30).toFixed(2) + " GiB" : b >= 2 ** 20 ? (b / 2 ** 20).toFixed(1) + " MiB" : b >= 1024 ? (b / 1024).toFixed(1) + " KiB" : b.toFixed(0) + " B");
  const fmtNum = (n) => (n >= 1e12 ? (n / 1e12).toFixed(2) + "T" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n)));
  function colorFor(v, amax, seq = false) {
    const surf = cssv("--viz-cell");
    if (!isFinite(v)) return cssv("--viz-masked");
    if (seq) return mix(surf, cssv("--v1"), clamp(v / (amax || 1), 0, 1));
    return mix(surf, v < 0 ? cssv("--v4") : cssv("--v1"), clamp(Math.abs(v) / (amax || 1), 0, 1));
  }
  // Draw a labelled matrix into an SVG group. Returns its bounding box.
  function drawMatrix(svg, x, y, M, o = {}) {
    const cs = o.cs || 18, R = M.length, C = M[0].length;
    const amax = o.amax ?? Math.max(1e-9, ...M.flat().filter(isFinite).map(Math.abs));
    const g = s("g", { opacity: o.dim ? 0.18 : 1 });
    if (o.title) g.append(s("text", { x: x + (C * cs) / 2, y: y - (o.colLabels ? 40 : 7), "text-anchor": "middle", class: "label strong" }, o.title));
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      const v = M[i][j];
      const t = isFinite(v) ? Math.abs(v) / amax : 0;
      g.append(s("rect", { x: x + j * cs, y: y + i * cs, width: cs - 1.5, height: cs - 1.5, rx: 2.5, fill: colorFor(v, amax, o.seq), stroke: o.hiRow === i ? cssv("--v3") : "none", "stroke-width": o.hiRow === i ? 2 : 0 }));
      if (o.values && cs >= 22) g.append(s("text", { x: x + j * cs + cs / 2 - 0.75, y: y + i * cs + cs / 2 + 3.5, "text-anchor": "middle", class: "cell" + (t > 0.6 ? " inv" : ""), style: "font-size:9px" }, isFinite(v) ? v.toFixed(o.digits ?? 1) : "−∞"));
    }
    if (o.rowLabels) o.rowLabels.forEach((l, i) => g.append(s("text", { x: x - 5, y: y + i * cs + cs / 2 + 4, "text-anchor": "end", class: "label" + (o.hiRow === i ? " strong" : ""), style: "font-size:11px;cursor:pointer", "data-row": i }, short(l))));
    if (o.colLabels) o.colLabels.forEach((l, j) => g.append(s("text", { x: x + j * cs + cs / 2, y: y - 4, "text-anchor": "start", class: "label", style: "font-size:10.5px", transform: `rotate(-50 ${x + j * cs + cs / 2} ${y - 4})` }, short(l))));
    if (o.shape) g.append(s("text", { x: x + (C * cs) / 2, y: y + R * cs + 13, "text-anchor": "middle", class: "tick" }, o.shape));
    svg.append(g);
    return { x, y, w: C * cs, h: R * cs, g };
  }
  const arrow = (svg, x1, y1, x2, y2, dim) => svg.append(s("path", { d: arrowPath(x1, y1, x2, y2, 7), class: "garrow", opacity: dim ? 0.15 : 0.8 }));
  function caption(foot) { const c = h("div", { class: "viz-caption" }); foot.append(c); return c; }

  // ================================================================== attention
  Viz.register("attention", (root, cfg) => {
    const { stage: st, ctrls, foot } = shell(root, cfg);
    const toks = cfg.tokens.slice(0, 10);
    const Tn = toks.length;
    const dk = clamp(cfg.d_k || 4, 2, 8);
    const dm = Math.max(4, dk);
    let H = clamp(cfg.heads || 1, 1, 4), head = 0, causal = cfg.causal !== false, scale = true, tau = 1, stg = clamp(cfg.stage ?? 0, 0, 6), sel = Tn - 1;
    let X, W;
    function init() {
      const r = rng(cfg.seed || 7);
      X = randMat(r, Tn, dm, 1);
      W = Array.from({ length: 4 }, () => ({ q: randMat(r, dm, dk, 1.6 / Math.sqrt(dm)), k: randMat(r, dm, dk, 1.6 / Math.sqrt(dm)), v: randMat(r, dm, dk, 1 / Math.sqrt(dm)) }));
    }
    init();
    const Wd = 680, Hd = 520;
    const svg = s("svg", { viewBox: `0 0 ${Wd} ${Hd}`, class: "viz-svg" });
    st.append(svg);
    const cap = caption(foot);
    const STAGES = () => [
      L("① Input $X$: one row per token ($T \\times d_{\\text{model}}$)", "① 输入 $X$：每个 token 一行（$T \\times d_{\\text{model}}$）"),
      L("② Project: $Q = XW_Q$, $K = XW_K$, $V = XW_V$ (each $T \\times d_k$)", "② 线性投影：$Q = XW_Q$，$K = XW_K$，$V = XW_V$（各 $T \\times d_k$）"),
      L("③ Scores $S = QK^\\top$: $S_{ij} = q_i \\cdot k_j$ — how strongly query $i$ matches key $j$", "③ 打分 $S = QK^\\top$：$S_{ij} = q_i \\cdot k_j$，表示 query $i$ 与 key $j$ 的匹配程度"),
      L("④ Divide by $\\sqrt{d_k}$: if $q$, $k$ have unit-variance entries, $q \\cdot k$ has variance $d_k$; scaling restores variance ≈ 1 so softmax does not saturate", "④ 除以 $\\sqrt{d_k}$：若 $q$、$k$ 各分量方差为 1，则 $q \\cdot k$ 方差为 $d_k$；缩放后方差回到约 1，softmax 不会饱和"),
      causal ? L("⑤ Causal mask: $S_{ij} = -\\infty$ for $j > i$, so token $i$ cannot see the future", "⑤ 因果掩码：$j > i$ 时 $S_{ij} = -\\infty$，token $i$ 看不到未来") : L("⑤ No mask: bidirectional (encoder) attention", "⑤ 不加掩码：双向（encoder）注意力"),
      L("⑥ Softmax per row: $A_{ij} = \\exp(S_{ij}) / \\sum_{j'} \\exp(S_{ij'})$; each row sums to 1", "⑥ 按行 softmax：$A_{ij} = \\exp(S_{ij}) / \\sum_{j'} \\exp(S_{ij'})$，每行和为 1"),
      L("⑦ Output $O = AV$: $o_i$ is the $A$-weighted average of the value vectors $v_j$", "⑦ 输出 $O = AV$：$o_i$ 是各 value 向量 $v_j$ 按 $A$ 加权的平均"),
    ];
    function compute() {
      const w = W[head];
      const Q = matmul(X, w.q), K = matmul(X, w.k), V = matmul(X, w.v);
      const raw = matmul(Q, transpose(K));
      const scaled = raw.map((r) => r.map((v) => v / ((scale ? Math.sqrt(dk) : 1) * tau)));
      const masked = scaled.map((r, i) => r.map((v, j) => (causal && j > i ? -Infinity : v)));
      const A = masked.map(softmaxRow);
      const O = matmul(A, V);
      return { Q, K, V, raw, scaled, masked, A, O };
    }
    function draw() {
      const c = compute();
      svg.innerHTML = "";
      const cs = Tn > 7 ? 16 : 19;
      const cw = dk > 6 ? 13 : 16;
      // Row 1: X and Q K V
      const y1 = 34;
      drawMatrix(svg, 52, y1, X, { cs: cw, title: "X", rowLabels: toks, shape: `$T \\times d_{\\text{model}}$ (${Tn}×${dm})`, hiRow: sel, dim: false });
      const qx = 52 + dm * cw + 70;
      [["Q", c.Q], ["K", c.K], ["V", c.V]].forEach(([n, M], i) => {
        const x = qx + i * (dk * cw + 34);
        drawMatrix(svg, x, y1, M, { cs: cw, title: n + (H > 1 ? `ʰ${head + 1}` : ""), shape: `${Tn}×${dk}`, hiRow: n === "Q" ? sel : null, dim: stg < 1 });
      });
      arrow(svg, 52 + dm * cw + 8, y1 + (Tn * cw) / 2, qx - 10, y1 + (Tn * cw) / 2, stg < 1);
      // the three weight matrices stacked above the arrow: one line each fits the 70-px gap between X and Q
      ["$W_Q$", "$W_K$", "$W_V$"].forEach((w, i) => svg.append(s("text", { x: 52 + dm * cw + 35, y: y1 + (Tn * cw) / 2 - 8 - (2 - i) * 15, "text-anchor": "middle", class: "tick", opacity: stg < 1 ? 0.2 : 1 }, (i ? "" : "× ") + w)));
      // Row 2: scores, A, O
      const y2 = y1 + Tn * cw + 98;
      const S = stg <= 2 ? c.raw : stg === 3 ? c.scaled : c.masked;
      const sTitle = stg <= 2 ? "S = QKᵀ" : stg === 3 ? "$S / \\sqrt{d_k}$" : causal ? "$S / \\sqrt{d_k} + M$" : "$S / \\sqrt{d_k}$";
      drawMatrix(svg, 52, y2, S, { cs, title: sTitle, rowLabels: toks, colLabels: toks, hiRow: sel, dim: stg < 2, values: cs >= 22 });
      const ax = 52 + Tn * cs + 60;
      drawMatrix(svg, ax, y2, c.A, { cs, title: "A = softmax(·)", colLabels: toks, hiRow: sel, seq: true, amax: 1, dim: stg < 5 });
      arrow(svg, 52 + Tn * cs + 8, y2 + (Tn * cs) / 2, ax - 8, y2 + (Tn * cs) / 2, stg < 5);
      const ox = ax + Tn * cs + 60;
      drawMatrix(svg, ox, y2, c.O, { cs: cw, title: "O = AV", hiRow: sel, dim: stg < 6, shape: `${Tn}×${dk}` });
      arrow(svg, ax + Tn * cs + 8, y2 + (Tn * cs) / 2, ox - 8, y2 + (Tn * cs) / 2, stg < 6);
      // Row 3: the selected query's attention distribution
      const y3 = y2 + Tn * cs + 40;
      if (stg >= 5) {
        const a = c.A[sel];
        svg.append(s("text", { x: 52, y: y3, class: "label strong" }, L(`Query “${toks[sel]}” attends to:`, `Query “${toks[sel]}” 的注意力分布：`)));
        const bw = Math.min(56, 560 / Tn);
        a.forEach((v, j) => {
          const bh = v * 70;
          svg.append(s("rect", { x: 52 + j * bw, y: y3 + 90 - bh, width: bw - 6, height: Math.max(0.5, bh), rx: 3, class: "bar", opacity: causal && j > sel ? 0.2 : 1 }));
          svg.append(s("text", { x: 52 + j * bw + (bw - 6) / 2, y: y3 + 104, "text-anchor": "middle", class: "label", style: "font-size:10.5px" }, short(toks[j], 7)));
          svg.append(s("text", { x: 52 + j * bw + (bw - 6) / 2, y: y3 + 86 - bh, "text-anchor": "middle", class: "tick" }, v.toFixed(2)));
        });
        if (stg >= 6) svg.append(s("text", { x: 52, y: y3 + 124, class: "tick" }, `$o_{${sel + 1}}$ = ${a.map((v, j) => `${v.toFixed(2)}·$v_{${j + 1}}$`).filter((_, j) => a[j] > 0.005).slice(0, 6).join(" + ")}${a.filter((v) => v > 0.005).length > 6 ? " + …" : ""}`));
      }
      svg.setAttribute("viewBox", `0 0 ${Wd} ${stg >= 5 ? y3 + 132 : y3}`);
      const sd = Math.sqrt(S.flat().filter(isFinite).reduce((a, v) => a + v * v, 0) / S.flat().filter(isFinite).length);
      const peak = c.A.reduce((a, r) => a + Math.max(...r), 0) / Tn;
      // built with h(), so the $…$ in the stage texts is typeset
      cap.replaceChildren(h("b", {}, `${stg + 1}/7`), " ", h("span", {}, STAGES()[stg]), h("br"), h("span", { class: "muted" }, `${L("std of scores", "分数标准差")} = ${sd.toFixed(2)} · ${L("mean max attention weight", "每行最大权重均值")} = ${peak.toFixed(2)}${H > 1 ? ` · ${L("head", "head")} ${head + 1}/${H}: ${L("heads are concatenated, then projected by $W_O$", "各 head 拼接后经 $W_O$ 投影")}` : ""} · ${L("tap a token name to choose the query", "点击 token 名称可切换 query")}`));
      svg.querySelectorAll("[data-row]").forEach((t) => t.addEventListener("click", () => { sel = +t.dataset.row; draw(); }));
    }
    let acc = 0;
    const an = animator(root, (dt) => { acc += dt; if (acc > 1.6) { acc = 0; if (stg >= 6) return false; stg++; draw(); } });
    const play = playButton(an, () => { if (stg >= 6) stg = 0; draw(); });
    ctrls.append(btn("‹", () => { play.reset(); stg = Math.max(0, stg - 1); draw(); }), play, btn("›", () => { play.reset(); stg = Math.min(6, stg + 1); draw(); }));
    ctrls.append(seg([["on", L("causal", "因果掩码")], ["off", L("no mask", "无掩码")]], causal ? "on" : "off", (v) => { causal = v === "on"; draw(); }));
    ctrls.append(seg([["on", "÷$\\sqrt{d_k}$"], ["off", L("no scaling", "不缩放")]], "on", (v) => { scale = v === "on"; draw(); }));
    ctrls.append(slider(L("temperature τ", "温度 τ"), { min: 0.25, max: 4, value: 1, step: 0.05 }, (v) => { tau = v; draw(); }, true));
    const headSeg = h("span");
    const drawHeads = () => { headSeg.innerHTML = ""; headSeg.append(seg([[1, "1 head"], [2, "2"], [4, "4"]], H, (v) => { H = +v; head = 0; drawHeads(); draw(); })); if (H > 1) headSeg.append(seg(Array.from({ length: H }, (_, i) => [i, `h${i + 1}`]), head, (v) => { head = +v; draw(); })); };
    drawHeads();
    ctrls.append(headSeg);
    draw();
  });

  // ================================================================== transformer
  const PRESETS = {
    "gpt2-small": { name: "GPT-2 small", d: 768, L: 12, h: 12, kv: 12, d_ff: 3072, vocab: 50257, norm: "pre", normType: "LayerNorm", attn: "mha", ffn: "gelu", pos: "learned", n_ctx: 1024, tied: true },
    "llama3-8b": { name: "Llama-3-8B", d: 4096, L: 32, h: 32, kv: 8, d_ff: 14336, vocab: 128256, norm: "pre", normType: "RMSNorm", attn: "gqa", ffn: "swiglu", pos: "rope", tied: false },
    "llama3-70b": { name: "Llama-3-70B", d: 8192, L: 80, h: 64, kv: 8, d_ff: 28672, vocab: 128256, norm: "pre", normType: "RMSNorm", attn: "gqa", ffn: "swiglu", pos: "rope", tied: false },
    "qwen3-30b-a3b": { name: "Qwen3-30B-A3B", d: 2048, L: 48, h: 32, kv: 4, head_dim: 128, d_ff: 6144, vocab: 151936, norm: "pre", normType: "RMSNorm", attn: "gqa", ffn: "swiglu", pos: "rope", tied: false, moe: { experts: 128, shared: 0, top_k: 8, d_expert: 768 } },
    "deepseek-v3": { name: "DeepSeek-V3", d: 7168, L: 61, h: 128, kv: 128, head_dim: 128, d_ff: 18432, vocab: 129280, norm: "pre", normType: "RMSNorm", attn: "mla", ffn: "swiglu", pos: "rope", tied: false, mla: { q_lora: 1536, kv_lora: 512, d_rope: 64, d_nope: 128, d_v: 128 }, moe: { experts: 256, shared: 1, top_k: 8, d_expert: 2048, dense_layers: 3 } },
  };
  function tfStats(c) {
    const dh = c.head_dim || c.d / c.h;
    const kv = c.attn === "mha" ? c.h : c.attn === "mqa" ? 1 : c.kv;
    let attn;
    if (c.attn === "mla") {
      const m = c.mla || { q_lora: 1536, kv_lora: 512, d_rope: 64, d_nope: dh, d_v: dh };
      const qdim = c.h * (m.d_nope + m.d_rope);
      attn = (m.q_lora ? c.d * m.q_lora + m.q_lora * qdim : c.d * qdim) + c.d * (m.kv_lora + m.d_rope) + m.kv_lora * c.h * (m.d_nope + m.d_v) + c.h * m.d_v * c.d;
    } else attn = c.d * c.h * dh + 2 * c.d * kv * dh + c.h * dh * c.d;
    const ffnDense = (c.ffn === "swiglu" ? 3 : 2) * c.d * c.d_ff;
    let ffnTotal, ffnActive;
    const moe = c.moeOn ? c.moe || { experts: 8, shared: 0, top_k: 2, d_expert: Math.round(c.d_ff / 2) } : null;
    if (moe) {
      const per = (c.ffn === "swiglu" ? 3 : 2) * c.d * moe.d_expert;
      const nDense = moe.dense_layers || 0, nMoe = c.L - nDense;
      ffnTotal = nDense * ffnDense + nMoe * ((moe.experts + moe.shared) * per + c.d * moe.experts);
      ffnActive = nDense * ffnDense + nMoe * ((moe.top_k + moe.shared) * per + c.d * moe.experts);
    } else { ffnTotal = ffnActive = c.L * ffnDense; }
    const emb = c.vocab * c.d + (c.pos === "learned" ? (c.n_ctx || 2048) * c.d : 0);
    const head = c.tied ? 0 : c.vocab * c.d;
    const total = c.L * attn + ffnTotal + emb + head;
    const active = c.L * attn + ffnActive + emb + head;
    const kvBytes = c.attn === "mla" ? c.L * ((c.mla?.kv_lora || 512) + (c.mla?.d_rope || 64)) * 2 : 2 * c.L * kv * dh * 2;
    return { dh, kv, attn, ffnTotal, ffnActive, emb, head, total, active, kvBytes, moe };
  }
  Viz.register("transformer", (root, cfg) => {
    const { stage: st, ctrls, foot } = shell(root, cfg);
    let c;
    const fromCfg = (p) => {
      const base = JSON.parse(JSON.stringify(PRESETS[p] || PRESETS["llama3-8b"]));
      if (!PRESETS[p]) { // explicit config overrides
        for (const [k, k2] of [["d_model", "d"], ["n_layers", "L"], ["n_heads", "h"], ["n_kv_heads", "kv"], ["head_dim", "head_dim"], ["d_ff", "d_ff"], ["vocab", "vocab"], ["norm", "norm"], ["attn", "attn"], ["ffn", "ffn"], ["moe", "moe"]]) if (cfg[k] != null) base[k2] = cfg[k];
        base.name = L("custom", "自定义");
      }
      base.moeOn = !!base.moe;
      base.encoder = !!cfg.encoder;
      return base;
    };
    c = fromCfg(cfg.preset);
    let ctx = 8192, focus = null, pulse = -1;
    const wrap = h("div", { class: "tf-wrap" });
    const svg = s("svg", { viewBox: "0 0 380 640", class: "viz-svg tf-svg" });
    const panel = h("div", { class: "tf-panel" });
    wrap.append(svg, panel);
    st.append(wrap);
    // Component descriptions (Unicode math, no KaTeX at runtime).
    const INFO = () => ({
      emb: [L("Token embedding", "Token 嵌入"), `h⁰_t = E[x_t]${c.pos === "learned" ? " + P[t]" : ""},  E ∈ ℝ^{V×d} = ${fmtNum(c.vocab)}×${c.d}. ${c.pos === "rope" ? L("No absolute positions: position enters through RoPE inside attention.", "没有绝对位置向量：位置通过注意力里的 RoPE 进入。") : L("Learned absolute position embedding P is added.", "加上可学习的绝对位置嵌入 P。")}`],
      norm1: [c.normType || "RMSNorm", c.normType === "LayerNorm" ? "LN(h) = (h − μ)/√(σ² + ε) ⊙ γ + β" : "RMSNorm(h) = h / √(mean(h²) + ε) ⊙ g  " + L("(no mean subtraction, no bias)", "（不减均值、无偏置）")],
      attn: [L("Self-attention", "自注意力"), c.attn === "mla"
        ? L(`MLA: the cache stores only c_KV = W_DKV·h (${c.mla?.kv_lora || 512}-d) plus a shared RoPE key (${c.mla?.d_rope || 64}-d); K and V are up-projected from c_KV, and at inference W_UK, W_UV are absorbed into W_Q and W_O. ${c.h} query heads.`, `MLA：缓存只存 c_KV = W_DKV·h（${c.mla?.kv_lora || 512} 维）和共享的 RoPE key（${c.mla?.d_rope || 64} 维）；K、V 由 c_KV 上投影得到，推理时 W_UK、W_UV 可吸收进 W_Q、W_O。共 ${c.h} 个 query head。`)
        : `${c.h} ${L("query heads", "个 query head")}, ${tfStats(c).kv} ${L("KV heads", "个 KV head")} (${c.attn.toUpperCase()}${c.attn === "gqa" ? L(`: each KV head shared by ${c.h / tfStats(c).kv} query heads`, `：每个 KV head 被 ${c.h / tfStats(c).kv} 个 query head 共享`) : ""}). a = softmax(q kᵀ/√d_h ${c.encoder ? "" : "+ M_causal"}) v, out = W_O [head₁;…;head_h]. ${c.pos === "rope" ? L("RoPE rotates q and k by position before the dot product.", "点积前用 RoPE 按位置旋转 q、k。") : ""}`],
      add1: [L("Residual add", "残差相加"), c.norm === "pre" ? L("h ← h + Attn(Norm(h)). Pre-LN keeps an identity path from input to output, so gradients reach early layers undamped; it trains stably without long warm-up.", "h ← h + Attn(Norm(h))。Pre-LN 保留从输入到输出的恒等通路，梯度能无衰减地回到底层，训练稳定，不需要很长的 warm-up。") : L("h ← Norm(h + Attn(h)). Post-LN (original Transformer) normalises the stream itself; deep stacks need careful warm-up because gradients near the output are larger.", "h ← Norm(h + Attn(h))。Post-LN（原始 Transformer）对残差流本身做归一化；层数深时靠近输出处梯度更大，需要仔细的 warm-up。")],
      norm2: [c.normType || "RMSNorm", L("Same normalisation, separate parameters, before the feed-forward block.", "同样的归一化，参数独立，放在前馈块之前。")],
      ffn: c.moeOn ? [L("Mixture of experts", "混合专家 (MoE)"), L(`Router g = ${c.attn === "mla" ? "sigmoid" : "softmax"}(W_r h) picks the top-${tfStats(c).moe.top_k} of ${tfStats(c).moe.experts} experts${tfStats(c).moe.shared ? ` (+${tfStats(c).moe.shared} shared)` : ""}; h′ = Σ_{e∈top-k} g_e·FFN_e(h)${tfStats(c).moe.shared ? " + FFN_shared(h)" : ""}. Parameters grow with experts, compute only with k.`, `路由 g = ${c.attn === "mla" ? "sigmoid" : "softmax"}(W_r h) 从 ${tfStats(c).moe.experts} 个专家中选 top-${tfStats(c).moe.top_k}${tfStats(c).moe.shared ? `（另有 ${tfStats(c).moe.shared} 个共享专家）` : ""}；h′ = Σ_{e∈top-k} g_e·FFN_e(h)${tfStats(c).moe.shared ? " + FFN_shared(h)" : ""}。参数量随专家数增长，计算量只随 k 增长。`)]
        : [L("Feed-forward", "前馈网络"), c.ffn === "swiglu" ? `FFN(h) = W₂ (SiLU(W₁h) ⊙ W₃h), d_ff = ${c.d_ff}` : `FFN(h) = W₂ GELU(W₁h), d_ff = ${c.d_ff} (= 4d)`],
      add2: [L("Residual add", "残差相加"), c.norm === "pre" ? "h ← h + FFN(Norm(h))" : "h ← Norm(h + FFN(h))"],
      out: [L("Final norm + LM head", "最终归一化 + LM head"), `logits = W_U·Norm(h^L) ∈ ℝ^{${fmtNum(c.vocab)}}, p(x_{t+1}) = softmax(logits). ${c.tied ? L("W_U is tied to E.", "W_U 与 E 共享权重。") : L("W_U is a separate matrix (untied).", "W_U 是独立矩阵（不共享）。")}`],
    });
    const ORDER = ["emb", "norm1", "attn", "add1", "norm2", "ffn", "add2", "out"];
    function box(id, x, y, w, hh, label, sub, cls) {
      const on = focus === id || ORDER[pulse] === id;
      const g = s("g", { class: "tf-box" + (on ? " on" : ""), "data-id": id, style: "cursor:pointer" });
      g.append(s("rect", { x, y, width: w, height: hh, rx: 7, class: "tf-rect " + (cls || "") }));
      g.append(s("text", { x: x + w / 2, y: y + (sub ? hh / 2 - 2 : hh / 2 + 4.5), "text-anchor": "middle", class: "tf-label" }, label));
      if (sub) g.append(s("text", { x: x + w / 2, y: y + hh / 2 + 12, "text-anchor": "middle", class: "tf-sub" }, sub));
      svg.append(g);
    }
    const plus = (id, x, y) => { const on = focus === id || ORDER[pulse] === id; const g = s("g", { "data-id": id, class: "tf-box" + (on ? " on" : ""), style: "cursor:pointer" }); g.append(s("circle", { cx: x, cy: y, r: 10, class: "tf-add" })); g.append(s("path", { d: `M${x - 5},${y}H${x + 5}M${x},${y - 5}V${y + 5}`, class: "tf-addp" })); svg.append(g); };
    function draw() {
      const S = tfStats(c);
      const RX = 120; // residual stream x
      svg.innerHTML = "";
      const shape = `[T, ${c.d}]`;
      // residual stream
      svg.append(s("path", { d: `M${RX},585 V70`, class: "tf-res" }));
      svg.append(s("text", { x: RX - 8, y: 470, "text-anchor": "end", class: "tf-shape" }, shape));
      svg.append(s("text", { x: RX - 8, y: 482, "text-anchor": "end", class: "tf-shape" }, L("residual stream", "残差流")));
      // layer frame
      svg.append(s("rect", { x: 22, y: 152, width: 338, height: 360, rx: 12, class: "tf-layer" }));
      svg.append(s("text", { x: 350, y: 172, "text-anchor": "end", class: "tf-n" }, `× ${c.L}`));
      box("emb", RX - 70, 588, 140, 34, L("Embedding", "嵌入"), `${fmtNum(c.vocab)} × ${c.d}`, "emb");
      svg.append(s("text", { x: RX, y: 636, "text-anchor": "middle", class: "tf-shape" }, L("tokens x₁…x_T", "tokens x₁…x_T")));
      const pre = c.norm === "pre";
      // attention sub-block (branch to the right)
      const BX = 200;
      if (pre) {
        svg.append(s("path", { d: `M${RX},492 H${BX + 70} V470`, class: "tf-wire" }));
        box("norm1", BX, 440, 140, 30, c.normType === "LayerNorm" ? "LayerNorm" : "RMSNorm", null, "norm");
        svg.append(s("path", { d: `M${BX + 70},440 V418`, class: "tf-wire" }));
      } else svg.append(s("path", { d: `M${RX},492 H${BX + 70} V418`, class: "tf-wire" }));
      const attnSub = c.attn === "mla" ? `MLA · ${c.h} heads · c_KV ${c.mla?.kv_lora || 512}` : `${c.attn.toUpperCase()} · ${c.h}Q / ${S.kv}KV · d_h ${S.dh}`;
      box("attn", BX, 362, 140, 56, c.encoder ? L("Self-attention", "自注意力") : L("Masked self-attn", "因果自注意力"), attnSub, "attn");
      if (c.pos === "rope") svg.append(s("text", { x: BX + 70, y: 357, "text-anchor": "middle", class: "tf-tag" }, "RoPE(q, k)"));
      svg.append(s("path", { d: `M${BX + 70},362 V340 H${RX + 12}`, class: "tf-wire" }));
      plus("add1", RX, 340);
      if (!pre) box("norm1", RX - 60, 300, 120, 26, c.normType === "LayerNorm" ? "LayerNorm" : "RMSNorm", null, "norm");
      // ffn sub-block
      const fy = pre ? 300 : 270;
      if (pre) {
        svg.append(s("path", { d: `M${RX},${fy} H${BX + 70} V${fy - 10}`, class: "tf-wire" }));
        box("norm2", BX, fy - 40, 140, 30, c.normType === "LayerNorm" ? "LayerNorm" : "RMSNorm", null, "norm");
        svg.append(s("path", { d: `M${BX + 70},${fy - 40} V${fy - 62}`, class: "tf-wire" }));
      } else svg.append(s("path", { d: `M${RX},${fy} H${BX + 70} V${fy - 62}`, class: "tf-wire" }));
      const ffSub = c.moeOn ? `${S.moe.experts} ${L("experts", "专家")} · top-${S.moe.top_k}${S.moe.shared ? ` + ${S.moe.shared}` : ""}` : `${c.ffn === "swiglu" ? "SwiGLU" : "GELU MLP"} · d_ff ${c.d_ff}`;
      if (c.moeOn) {
        box("ffn", BX, fy - 128, 140, 66, "MoE FFN", ffSub, "moe");
        for (let i = 0; i < 6; i++) svg.append(s("rect", { x: BX + 10 + i * 21, y: fy - 76, width: 16, height: 9, rx: 2, class: "tf-expert" + (i < 2 ? " on" : "") }));
      } else box("ffn", BX, fy - 118, 140, 56, "FFN", ffSub, "ffn");
      svg.append(s("path", { d: `M${BX + 70},${fy - (c.moeOn ? 128 : 118)} V${fy - 140} H${RX + 12}`, class: "tf-wire" }));
      plus("add2", RX, fy - 140);
      if (!pre) box("norm2", RX - 60, fy - 180, 120, 26, c.normType === "LayerNorm" ? "LayerNorm" : "RMSNorm", null, "norm");
      // top
      box("out", RX - 80, 22, 160, 44, L("Norm → LM head", "Norm → LM head"), c.encoder ? L("task head", "任务头") : "softmax → p(x_{t+1})", "out");
      // pulse dot
      if (pulse >= 0) {
        const P = { emb: [RX, 600], norm1: [BX + 70, 455], attn: [BX + 70, 390], add1: [RX, 340], norm2: [BX + 70, fy - 25], ffn: [BX + 70, fy - 90], add2: [RX, fy - 140], out: [RX, 44] }[ORDER[pulse]];
        if (P) svg.append(s("circle", { cx: P[0], cy: P[1], r: 7, class: "tf-pulse" }));
      }
      svg.querySelectorAll("[data-id]").forEach((g) => g.addEventListener("click", () => { focus = g.dataset.id; pulse = -1; play.reset(); draw(); }));
      // panel
      const info = INFO()[focus || ORDER[Math.max(0, pulse)] || "attn"];
      const kvTotal = S.kvBytes * ctx;
      const flopsTok = 2 * S.active + 4 * c.L * ctx * c.h * S.dh / 2;
      panel.innerHTML = `<div class="tf-info"><b>${info[0]}</b><div>${info[1]}</div></div>
        <table class="tf-stats"><tr><th colspan="2">${c.name}</th></tr>
        <tr><td>${L("parameters", "参数量")}</td><td>${fmtNum(S.total)}</td></tr>
        ${c.moeOn ? `<tr><td>${L("active / token", "每 token 激活")}</td><td>${fmtNum(S.active)}</td></tr>` : ""}
        <tr><td>${L("attention / layer", "注意力 / 层")}</td><td>${fmtNum(S.attn)}</td></tr>
        <tr><td>${L("FFN total", "FFN 合计")}</td><td>${fmtNum(S.ffnTotal)}</td></tr>
        <tr><td>${L("embeddings + head", "嵌入 + 输出头")}</td><td>${fmtNum(S.emb + S.head)}</td></tr>
        <tr><td>${L("KV cache / token (bf16)", "KV cache / token（bf16）")}</td><td>${fmtBytes(S.kvBytes)}</td></tr>
        <tr><td>${L(`KV cache @ ${fmtNum(ctx)} tokens`, `KV cache @ ${fmtNum(ctx)} tokens`)}</td><td>${fmtBytes(kvTotal)}</td></tr>
        <tr><td>${L("≈ FLOPs / token", "≈ FLOPs / token")}</td><td>${fmtNum(flopsTok)}</td></tr></table>
        <div class="muted small">${L("FLOPs ≈ 2·N_active + 2·L·T·h·d_h (average causal context T/2). Biases and norm weights omitted.", "FLOPs ≈ 2·N_active + 2·L·T·h·d_h（因果平均上下文 T/2）。偏置和归一化参数忽略不计。")}</div>`;
    }
    let acc = 0;
    const an = animator(root, (dt) => { acc += dt; if (acc > 0.9) { acc = 0; pulse++; focus = null; if (pulse >= ORDER.length) { pulse = ORDER.length - 1; draw(); return false; } draw(); } });
    const play = playButton(an, () => { pulse = -1; acc = 1; });
    const presetSel = seg(Object.entries(PRESETS).map(([k, v]) => [k, v.name]), PRESETS[cfg.preset] ? cfg.preset : null, (k) => { c = fromCfg(k); rebuildToggles(); draw(); });
    const toggles = h("span", { class: "tf-toggles" });
    function rebuildToggles() {
      toggles.innerHTML = "";
      toggles.append(seg([["pre", "Pre-LN"], ["post", "Post-LN"]], c.norm, (v) => { c.norm = v; draw(); }));
      toggles.append(seg([["mha", "MHA"], ["gqa", "GQA"], ["mqa", "MQA"], ["mla", "MLA"]], c.attn, (v) => { c.attn = v; if (v === "gqa" && (!c.kv || c.kv === c.h)) c.kv = Math.max(1, c.h / 4); if (v === "mla" && !c.mla) c.mla = { q_lora: c.d >= 4096 ? 1536 : 0, kv_lora: 512, d_rope: 64, d_nope: c.head_dim || c.d / c.h, d_v: c.head_dim || c.d / c.h }; draw(); }));
      toggles.append(seg([["gelu", "GELU"], ["swiglu", "SwiGLU"]], c.ffn, (v) => { c.ffn = v; draw(); }));
      toggles.append(seg([["dense", L("dense", "稠密")], ["moe", "MoE"]], c.moeOn ? "moe" : "dense", (v) => { c.moeOn = v === "moe"; if (c.moeOn && !c.moe) c.moe = { experts: 8, shared: 0, top_k: 2, d_expert: Math.round(c.d_ff / 2) }; draw(); }));
    }
    rebuildToggles();
    ctrls.append(play, presetSel, toggles, slider(L("context T", "上下文 T"), { min: 512, max: 131072, value: ctx }, (v) => { ctx = Math.round(v); draw(); }, true));
    draw();
  });

  // ================================================================== rope
  Viz.register("rope", (root, cfg) => {
    const { stage: st, ctrls, foot } = shell(root, cfg);
    const d = clamp(cfg.d || 16, 4, 64) & ~1;
    let base = cfg.base || 10000, m = cfg.m ?? 3, n = cfg.n ?? 7, mode = "none";
    const r = rng(cfg.seed || 4);
    const q = Array.from({ length: d }, () => randn(r)), k = Array.from({ length: d }, () => randn(r));
    const theta = (i) => { let b = base; const sc = 4; if (mode === "ntk") b = base * sc ** (d / (d - 2)); return b ** ((-2 * i) / d); };
    const posScale = () => (mode === "pi" ? 1 / 4 : 1);
    const rot = (v, p) => { const out = v.slice(); for (let i = 0; i < d / 2; i++) { const a = p * posScale() * theta(i); const x = v[2 * i], y = v[2 * i + 1]; out[2 * i] = x * Math.cos(a) - y * Math.sin(a); out[2 * i + 1] = x * Math.sin(a) + y * Math.cos(a); } return out; };
    const dot = (a, b) => a.reduce((acc, v, i) => acc + v * b[i], 0);
    const W = 660, H = 330;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "viz-svg" });
    st.append(svg);
    const cap = caption(foot);
    function draw() {
      svg.innerHTML = "";
      const qm = rot(q, m), kn = rot(k, n);
      const pairs = [0, 1, Math.floor(d / 4), d / 2 - 1];
      pairs.forEach((i, idx) => {
        const cx = 70 + idx * 92, cy = 78, R = 36;
        svg.append(s("circle", { cx, cy, r: R, class: "rope-c" }));
        const nq = Math.hypot(q[2 * i], q[2 * i + 1]) || 1, nk = Math.hypot(k[2 * i], k[2 * i + 1]) || 1;
        const pq = [cx + (qm[2 * i] / nq) * R, cy - (qm[2 * i + 1] / nq) * R], pk = [cx + (kn[2 * i] / nk) * R, cy - (kn[2 * i + 1] / nk) * R];
        svg.append(s("path", { d: arrowPath(cx, cy, pq[0], pq[1], 6), class: "vec v1" }));
        svg.append(s("path", { d: arrowPath(cx, cy, pk[0], pk[1], 6), class: "vec v2" }));
        svg.append(s("text", { x: cx, y: cy + R + 16, "text-anchor": "middle", class: "tick" }, `i=${i}: θ=${theta(i) >= 0.01 ? theta(i).toFixed(3) : theta(i).toExponential(1)}`));
        svg.append(s("text", { x: cx, y: cy + R + 29, "text-anchor": "middle", class: "tick" }, `λ=${(2 * Math.PI / theta(i)).toFixed(theta(i) > 0.1 ? 1 : 0)}`));
      });
      svg.append(s("text", { x: 20, y: 20, class: "label strong" }, L("Each 2-D pair i rotates q by m·θᵢ (blue) and k by n·θᵢ (green)", "每个二维分量对 i：q 旋转 m·θᵢ（蓝），k 旋转 n·θᵢ（绿）")));
      // score vs relative distance
      const px0 = 400, pw = 240, py0 = 40, ph = 230;
      const maxD = 128;
      const ones = Array(d).fill(1);
      const env = [], cur = [];
      for (let D = -maxD; D <= maxD; D += 1) { env.push([D, dot(rot(ones, D), ones) / d]); cur.push([D, dot(rot(q, D), k)]); }
      const lo = Math.min(...cur.map((p) => p[1]), -1), hi = Math.max(...cur.map((p) => p[1]), 1);
      const X = (D) => px0 + ((D + maxD) / (2 * maxD)) * pw, Y = (v) => py0 + ph - ((v - lo) / (hi - lo)) * ph;
      const Ye = (v) => py0 + ph - ((v * hi - lo) / (hi - lo)) * ph;
      svg.append(s("rect", { x: px0, y: py0, width: pw, height: ph, class: "frame", fill: "none", stroke: cssv("--border-2") }));
      svg.append(s("path", { d: cur.map(([D, v], i) => `${i ? "L" : "M"}${X(D).toFixed(1)},${Y(v).toFixed(1)}`).join(""), class: "curve", stroke: cssv("--v1") }));
      svg.append(s("path", { d: env.map(([D, v], i) => `${i ? "L" : "M"}${X(D).toFixed(1)},${Ye(v).toFixed(1)}`).join(""), class: "curve dashed", stroke: cssv("--v3") }));
      svg.append(s("line", { x1: X(m - n), x2: X(m - n), y1: py0, y2: py0 + ph, class: "cursor" }));
      svg.append(s("text", { x: px0 + pw / 2, y: py0 + ph + 18, "text-anchor": "middle", class: "label" }, L("relative distance m − n", "相对距离 m − n")));
      svg.append(s("text", { x: px0, y: py0 - 8, class: "label strong" }, L("q·k after rotation vs m − n", "旋转后 q·k 随 m − n 的变化")));
      svg.append(s("text", { x: 20, y: 180, class: "label" }, `q_mᵀ k_n = ${dot(qm, kn).toFixed(4)}`));
      svg.append(s("text", { x: 20, y: 200, class: "label" }, `m = ${m}, n = ${n}, m − n = ${m - n}`));
      svg.append(s("text", { x: 20, y: 228, class: "tick" }, L("Rᵢ(mθ)ᵀ Rᵢ(nθ) = Rᵢ((n−m)θ): the score depends only on m − n.", "Rᵢ(mθ)ᵀ Rᵢ(nθ) = Rᵢ((n−m)θ)：得分只依赖 m − n。")));
      svg.append(s("text", { x: 20, y: 246, class: "tick" }, L("Press “shift both” — the value does not change.", "点“同时平移”——数值不变。")));
      svg.append(s("text", { x: 20, y: 270, class: "tick" }, L("Dashed: q = k = 1 envelope — long-range decay.", "虚线：q = k = 1 时的包络——远距离衰减。")));
      cap.textContent = `θᵢ = b^(−2i/d), b = ${fmtNum(mode === "ntk" ? base * 4 ** (d / (d - 2)) : base)}, d = ${d}${mode === "pi" ? L(" · Position Interpolation: positions scaled by 1/4", " · 位置插值：位置乘以 1/4") : mode === "ntk" ? L(" · NTK-aware: base enlarged so low frequencies stretch, high frequencies barely change", " · NTK-aware：增大 base，低频被拉长、高频几乎不变") : ""}`;
    }
    const sm = slider("m", { min: 0, max: 64, value: m, step: 1 }, (v) => { m = Math.round(v); draw(); });
    const sn = slider("n", { min: 0, max: 64, value: n, step: 1 }, (v) => { n = Math.round(v); draw(); });
    ctrls.append(sm, sn, btn(L("shift both +5", "同时平移 +5"), () => { m = Math.min(64, m + 5); n = Math.min(64, n + 5); sm.set(m); sn.set(n); draw(); }));
    ctrls.append(slider(L("base b", "base b"), { min: 100, max: 1e6, value: base }, (v) => { base = v; draw(); }, true));
    ctrls.append(seg([["none", L("plain", "原始")], ["pi", "PI ×4"], ["ntk", "NTK ×4"]], mode, (v) => { mode = v; draw(); }));
    draw();
  });

  // ================================================================== kvcache
  Viz.register("kvcache", (root, cfg) => {
    const { stage: st, ctrls, foot } = shell(root, cfg);
    const prompt = cfg.prompt, gen = cfg.gen || ["…"];
    const Lr = cfg.layers || 32, kvh = cfg.kv_heads || 8, dh = cfg.head_dim || 128, by = cfg.bytes || 2, heads = cfg.heads || 32;
    const perTok = 2 * Lr * kvh * dh * by;
    let step = -1, cache = true; // step -1: nothing; 0: prefill done; k>0: k tokens generated
    const W = 660;
    const svg = s("svg", { viewBox: `0 0 ${W} 300`, class: "viz-svg" });
    st.append(svg);
    const cap = caption(foot);
    const table = h("div", { class: "viz-caption" });
    foot.append(table);
    function draw() {
      svg.innerHTML = "";
      const all = [...prompt, ...gen];
      const nCached = step < 0 ? 0 : prompt.length + Math.max(0, step);
      const cur = step <= 0 ? -1 : prompt.length + step - 1; // index of the token being produced/processed
      const tw = Math.min(64, (W - 40) / all.length);
      all.forEach((tk, i) => {
        const shown = i < prompt.length || (step > 0 && i < prompt.length + step);
        const x = 20 + i * tw;
        svg.append(s("rect", { x, y: 20, width: tw - 6, height: 28, rx: 5, class: i < prompt.length ? "kv-tok p" : "kv-tok g", opacity: shown ? 1 : 0.15 }));
        svg.append(s("text", { x: x + (tw - 6) / 2, y: 38, "text-anchor": "middle", class: "label", opacity: shown ? 1 : 0.3, style: "font-size:11px" }, short(tk, 7)));
        // cache rows K and V
        const inCache = i < nCached;
        const recompute = !cache && step > 0 && i <= cur;
        for (const [row, lab] of [[110, "K"], [170, "V"]]) {
          svg.append(s("rect", { x, y: row, width: tw - 6, height: 40, rx: 4, class: "kv-cell " + (lab === "K" ? "k" : "v") + (recompute ? " re" : ""), opacity: inCache ? 1 : 0.1 }));
        }
        if (step > 0 && i === cur) svg.append(s("path", { d: `M${x + (tw - 6) / 2},48 V100`, class: "garrow" }));
      });
      svg.append(s("text", { x: 4, y: 134, class: "label strong" }, "K"));
      svg.append(s("text", { x: 4, y: 194, class: "label strong" }, "V"));
      if (step > 0) {
        const qx = 20 + cur * tw + (tw - 6) / 2;
        for (let j = 0; j <= cur; j++) svg.append(s("line", { x1: qx, y1: 100, x2: 20 + j * tw + (tw - 6) / 2, y2: 110, class: "kv-att" }));
      }
      const T = nCached;
      const phase = step < 0 ? L("Press ▶ or › to start.", "按 ▶ 或 › 开始。") : step === 0 ? L(`Prefill: all ${prompt.length} prompt tokens go through the model in parallel (one large matrix multiply per layer — compute-bound); their K and V are written to the cache.`, `Prefill：${prompt.length} 个 prompt token 并行通过模型（每层一次大矩阵乘——算力受限），K、V 写入缓存。`) : cache ? L(`Decode step ${step}: one new token; its q attends to all ${T} cached keys; only its own K,V are computed and appended (memory-bound: every step reads the whole cache).`, `解码第 ${step} 步：只处理一个新 token；它的 q 与缓存中全部 ${T} 个 key 计算注意力，只需计算并追加它自己的 K、V（访存受限：每步都要读整个缓存）。`) : L(`Without a cache, step ${step} recomputes K,V for all ${T} tokens — O(T) extra work per step, O(T²) over the sequence.`, `没有缓存时，第 ${step} 步要重算全部 ${T} 个 token 的 K、V——每步多 O(T) 的工作，整段序列 O(T²)。`);
      svg.append(s("text", { x: 20, y: 240, class: "label" }, `${L("cached tokens", "缓存 token 数")} T = ${T} · ${L("cache size", "缓存大小")} = T × 2·L·h_kv·d_h·bytes = ${T} × ${fmtBytes(perTok)} = ${fmtBytes(T * perTok)}`));
      svg.append(s("text", { x: 20, y: 262, class: "tick" }, `L = ${Lr}, h_kv = ${kvh}, d_h = ${dh}, ${by} bytes/value`));
      cap.innerHTML = phase;
      const row = (name, b) => `<tr><td>${name}</td><td>${fmtBytes(b)}</td><td>${fmtBytes(b * 32768)}</td></tr>`;
      table.innerHTML = `<table class="tf-stats"><tr><th>${L("attention", "注意力")}</th><th>${L("bytes / token", "每 token 字节")}</th><th>@ 32K tokens</th></tr>${row(`MHA (h_kv = ${heads})`, 2 * Lr * heads * dh * by)}${row(`GQA (h_kv = ${kvh})`, perTok)}${row("MQA (h_kv = 1)", 2 * Lr * dh * by)}${row("MLA (c_KV 512 + RoPE 64)", Lr * 576 * by)}</table>`;
    }
    let acc = 0;
    const an = animator(root, (dt) => { acc += dt; if (acc > 1.1) { acc = 0; if (step >= gen.length) return false; step++; draw(); } });
    const play = playButton(an, () => { if (step >= gen.length) step = -1; });
    ctrls.append(btn("‹", () => { play.reset(); step = Math.max(-1, step - 1); draw(); }), play, btn("›", () => { play.reset(); step = Math.min(gen.length, step + 1); draw(); }));
    ctrls.append(seg([["on", L("with KV cache", "有 KV cache")], ["off", L("no cache", "无缓存")]], "on", (v) => { cache = v === "on"; draw(); }));
    draw();
  });

  // ================================================================== moe
  Viz.register("moe", (root, cfg) => {
    const { stage: st, ctrls, foot } = shell(root, cfg);
    const E = clamp(cfg.experts || 8, 2, 16), N = clamp(cfg.tokens || 16, 4, 32);
    let K = clamp(cfg.top_k || 2, 1, E), cf = cfg.capacity || 1.25, mode = cfg.balance || "bias";
    let logits, bias, it, hist;
    function reset() {
      const r = rng(cfg.seed || 9);
      const pref = Array.from({ length: E }, (_, e) => (e < 2 ? 1.6 : e < 4 ? 0.6 : 0) + randn(r) * 0.2);
      logits = Array.from({ length: N }, () => pref.map((p) => p + randn(r) * 0.9));
      bias = new Array(E).fill(0); it = 0; hist = [];
    }
    reset();
    function route() {
      const probs = logits.map((row) => softmaxRow(row));
      const sel = logits.map((row) => row.map((v, e) => [v + bias[e], e]).sort((a, b) => b[0] - a[0]).slice(0, K).map((x) => x[1]));
      const load = new Array(E).fill(0);
      sel.forEach((ss) => ss.forEach((e) => load[e]++));
      const cap = Math.ceil((cf * N * K) / E);
      const used = new Array(E).fill(0);
      const dropped = sel.map((ss) => ss.map((e) => (++used[e] > cap)));
      const f = load.map((l) => l / (N * K)), P = new Array(E).fill(0);
      probs.forEach((p) => p.forEach((v, e) => (P[e] += v / N)));
      const aux = E * f.reduce((a, v, e) => a + v * P[e], 0);
      return { probs, sel, load, cap, dropped, aux };
    }
    function stepTrain() {
      const r0 = route();
      if (mode === "bias") { const mean = (N * K) / E; for (let e = 0; e < E; e++) bias[e] += 0.15 * Math.sign(mean - r0.load[e]); }
      else if (mode === "aux") {
        // gradient of the auxiliary loss pushes the router logits of over-loaded experts down
        const f = r0.load.map((l) => l / (N * K));
        logits = logits.map((row, t) => { const p = r0.probs[t]; return row.map((v, e) => v - 0.6 * E * (f[e] * p[e] - p[e] * f.reduce((a, fj, j) => a + fj * p[j], 0))); });
      }
      it++;
      hist.push(Math.max(...r0.load) / ((N * K) / E));
    }
    const W = 660;
    const svg = s("svg", { viewBox: `0 0 ${W} 330`, class: "viz-svg" });
    st.append(svg);
    const cap = caption(foot);
    function draw() {
      const R = route();
      svg.innerHTML = "";
      const cs = Math.min(22, 300 / E), ch = Math.min(14, 260 / N);
      svg.append(s("text", { x: 40, y: 18, class: "label strong" }, L("router probabilities (tokens × experts); outlined = selected top-k", "路由概率（token × 专家）；描边 = 被选中的 top-k")));
      for (let t = 0; t < N; t++) for (let e = 0; e < E; e++) {
        const isSel = R.sel[t].includes(e), drop = isSel && R.dropped[t][R.sel[t].indexOf(e)];
        svg.append(s("rect", { x: 40 + e * cs, y: 28 + t * ch, width: cs - 1.5, height: ch - 1.5, rx: 2, fill: colorFor(R.probs[t][e], 1, true), stroke: isSel ? cssv(drop ? "--v4" : "--v3") : "none", "stroke-width": isSel ? 2 : 0 }));
      }
      for (let e = 0; e < E; e++) svg.append(s("text", { x: 40 + e * cs + cs / 2, y: 28 + N * ch + 12, "text-anchor": "middle", class: "tick" }, `e${e + 1}`));
      // load bars
      const bx = 40 + E * cs + 50, bw = Math.min(26, 260 / E), bh = 200;
      const maxL = Math.max(R.cap * 1.5, ...R.load);
      svg.append(s("text", { x: bx, y: 18, class: "label strong" }, L("tokens per expert vs capacity", "每个专家的 token 数 vs 容量")));
      R.load.forEach((l, e) => {
        const hgt = (l / maxL) * bh;
        svg.append(s("rect", { x: bx + e * bw, y: 30 + bh - hgt, width: bw - 4, height: Math.max(0.5, hgt), rx: 2, class: "bar" + (l > R.cap ? " over" : "") }));
        svg.append(s("text", { x: bx + e * bw + (bw - 4) / 2, y: 30 + bh + 13, "text-anchor": "middle", class: "tick" }, `e${e + 1}`));
      });
      const cy = 30 + bh - (R.cap / maxL) * bh;
      svg.append(s("line", { x1: bx - 4, x2: bx + E * bw, y1: cy, y2: cy, class: "cursor" }));
      svg.append(s("text", { x: bx + E * bw + 2, y: cy + 4, class: "tick" }, `C = ⌈${cf}·N·k/E⌉ = ${R.cap}`));
      const dropped = R.dropped.flat().filter(Boolean).length;
      if (hist.length > 1) {
        const hx = bx, hy = 270, hw = E * bw, hh = 46, mx = Math.max(...hist, 2);
        svg.append(s("path", { d: hist.map((v, i) => `${i ? "L" : "M"}${(hx + (i / (hist.length - 1)) * hw).toFixed(1)},${(hy + hh - (v / mx) * hh).toFixed(1)}`).join(""), class: "curve", stroke: cssv("--v2") }));
        svg.append(s("text", { x: hx, y: hy - 4, class: "tick" }, L("max load / mean load over steps", "最大负载 / 平均负载（随步数）")));
      }
      const desc = mode === "none" ? L("No balancing: popular experts overflow their capacity and tokens are dropped (or must be routed elsewhere).", "不做均衡：热门专家超出容量，token 被丢弃（或需改路由）。")
        : mode === "aux" ? L(`Auxiliary loss L_aux = E·Σ_e f_e·P_e = ${R.aux.toFixed(3)} (1 = perfectly balanced); its gradient lowers the router logits of over-loaded experts — at the cost of interfering with the language-modelling gradient.`, `辅助损失 L_aux = E·Σ_e f_e·P_e = ${R.aux.toFixed(3)}（1 表示完全均衡）；其梯度压低过载专家的路由 logit——代价是干扰语言建模的梯度。`)
        : L("Auxiliary-loss-free (DeepSeek-V3): a per-expert bias b_e is added only for top-k selection (gate weights still use the raw scores); after each step b_e += γ·sign(mean load − load_e).", "无辅助损失（DeepSeek-V3）：每个专家的偏置 b_e 只在选 top-k 时加上（门控权重仍用原始分数）；每步后 b_e += γ·sign(平均负载 − load_e)。");
      cap.innerHTML = `${L("step", "步")} ${it} · ${L("dropped token-slots", "被丢弃的 token 槽")} ${dropped}/${N * K} · ${desc}`;
    }
    let acc = 0;
    const an = animator(root, (dt) => { acc += dt; if (acc > 0.35) { acc = 0; stepTrain(); draw(); if (it > 60) return false; } });
    const play = playButton(an);
    ctrls.append(btn(T().step, () => { play.reset(); stepTrain(); draw(); }), play, btn(T().reset, () => { play.reset(); reset(); draw(); }));
    ctrls.append(seg([["none", L("no balancing", "不均衡")], ["aux", L("aux loss", "辅助损失")], ["bias", L("aux-loss-free bias", "无辅助损失偏置")]], mode, (v) => { mode = v; reset(); draw(); }));
    ctrls.append(slider("top-k", { min: 1, max: Math.min(4, E), value: K, step: 1 }, (v) => { K = Math.round(v); draw(); }), slider(L("capacity factor", "容量因子"), { min: 0.5, max: 2.5, value: cf, step: 0.05 }, (v) => { cf = v; draw(); }));
    draw();
  });
})();
