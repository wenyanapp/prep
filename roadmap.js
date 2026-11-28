"use strict";
// Roadmap: one page that shows how all courses and chapters connect.
// Level 1: courses in four layers, arrows = cross-links between their chapters.
// Level 2: one course, chapter by chapter, with "builds on" / "leads to" chips and an arc diagram.
// Level 3: the reading list of prerequisites for one chapter.
// Data: PREP_INDEX chapters carry `links` (other chapters they link to), written by tools/build.mjs.
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const LAYERS = [
    { en: "Foundations", zh: "基础", ids: ["math", "linalg"] },
    { en: "Core", zh: "核心", ids: ["robot", "ml", "rl", "algo"] },
    { en: "Specialised", zh: "专项", ids: ["wbc", "sym", "llm", "llm-sys"] },
    { en: "Frontier & you", zh: "前沿与你", ids: ["papers", "me"] },
  ];
  const COLORS = ["--v1", "--v2", "--v3", "--v4", "--v5", "--v6"];
  const svgEl = (tag, attrs = {}, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };

  function model(ctx) {
    const topics = ctx.TOPICS, layerOf = {}, order = [];
    LAYERS.forEach((l, li) => l.ids.forEach((id) => { if (ctx.TOPIC[id]) { layerOf[id] = li; order.push(id); } }));
    // Courses the layer table does not know go to the last layer.
    topics.forEach((tp) => { if (!(tp.id in layerOf)) { layerOf[tp.id] = LAYERS.length - 1; order.push(tp.id); } });
    const CH = {}, rank = {}, incoming = {};
    order.forEach((tid, ti) => {
      const tp = ctx.TOPIC[tid];
      const chs = ctx.MOD_ORDER.flatMap((m) => tp.chapters.filter((c) => ctx.modOf(c) === m));
      chs.forEach((c, ci) => { const k = `${tid}/${c.id}`; CH[k] = { k, tid, c, n: ci + 1 }; rank[k] = layerOf[tid] * 1e6 + ti * 1e3 + ci; });
    });
    const pair = {}; // "a>b" -> number of chapter-to-chapter links from course a to course b
    for (const k in CH) for (const to of CH[k].c.links || []) {
      if (!CH[to]) continue;
      (incoming[to] ||= []).push(k);
      if (CH[to].tid !== CH[k].tid) pair[`${CH[k].tid}>${CH[to].tid}`] = (pair[`${CH[k].tid}>${CH[to].tid}`] || 0) + 1;
    }
    const edges = [];
    for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
      const a = order[i], b = order[j], ab = pair[`${a}>${b}`] || 0, ba = pair[`${b}>${a}`] || 0;
      if (ab || ba) edges.push(ab >= ba ? { from: a, to: b, n: ab, back: ba } : { from: b, to: a, n: ba, back: ab });
    }
    const color = {};
    order.forEach((id, i) => (color[id] = `var(${COLORS[i % COLORS.length]})`));
    return { order, layerOf, CH, rank, incoming, edges, color };
  }

  function view(main, ctx, tid) {
    const zh = ctx.lang === "zh", L = (en, cn) => (zh ? cn : en), esc = ctx.esc, pick = ctx.pick;
    const M = model(ctx);
    let sel = tid && ctx.TOPIC[tid] ? tid : null, pathOf = null, hot = null;
    const mins = (c) => (c.pmin || 0) + c.items.reduce((a, x) => a + (x.min || 10), 0);
    const done = (k) => { const { tid, c } = M.CH[k]; const u = ctx.chapterUnits(tid, c); return u > 0 && ctx.chapterDone(tid, c) === u; };
    const tname = (id) => pick(ctx.TOPIC[id].title);
    const short = (id) => ({ me: L("Me", "我"), wbc: "WBC", math: L("Math", "数学"), sym: L("Sym", "对称"), linalg: L("LinAlg", "线代"), ml: "ML", rl: "RL", llm: "LLM", "llm-sys": L("LLM-Sys", "LLM 系统"), robot: L("Robot", "机器人"), papers: L("Papers", "论文"), algo: L("Algo", "算法") }[id] || id);

    main.innerHTML = `<div class="wrap rmap">
      ${ctx.crumbs([["#/", ctx.t().home], [null, L("Roadmap", "总览路线图")]])}
      <h1>${L("Roadmap: how everything connects", "总览路线图：所有内容如何关联")}</h1>
      <p class="muted">${L("Courses are arranged in four layers, read left to right (top to bottom on a phone). An arrow from A to B means lessons in A send you to B. Tap a course to see its chapters and what each one builds on.", "课程分成四层，从左往右读（手机上从上往下）。从 A 指向 B 的箭头表示 A 里的课会把你引到 B。点一门课，可以看它的每一章，以及每章建立在哪些内容之上。")}</p>
      <div class="rm-strip">${LAYERS.map((l, i) => `<span><b>${i + 1}</b>${esc(L(l.en, l.zh))}</span>`).join('<i>→</i>')}${M.CH["me/plan-48h"] ? `<a class="btn small" href="#/p/me/plan-48h">${L("2-day interview plan", "两天面试计划")}</a>` : ""}</div>
      <div class="rm-search"><input type="search" id="rm-q" placeholder="${L("Find a chapter in any course…", "在所有课程里找一章……")}" autocomplete="off"><div class="rm-results" id="rm-res"></div></div>
      <div class="card rm-mapcard"><div id="rm-map"></div>
        <div class="rm-legend"><span><i class="lg-arrow thin"></i>${L("few links", "链接少")}</span><span><i class="lg-arrow thick"></i>${L("many links", "链接多")}</span><span>${L("A → B: lessons in A link to B", "A → B：A 里的课链接到 B")}</span><span id="rm-edgeinfo" class="rm-edgeinfo"></span></div></div>
      <div id="rm-course"></div></div>`;
    const $ = (s, r = main) => r.querySelector(s);

    // ------------------------------------------------------------ level 1
    function drawMap() {
      const box = $("#rm-map"), wide = box.clientWidth >= 640;
      const pos = {};
      let W, H;
      const nw = wide ? 190 : 262, nh = 62;
      if (wide) {
        W = 1000; const rows = Math.max(...LAYERS.map((l) => l.ids.filter((i) => ctx.TOPIC[i]).length)); H = 44 + rows * 86;
        LAYERS.forEach((l, li) => { const ids = M.order.filter((i) => M.layerOf[i] === li); const y0 = 44 + ((rows - ids.length) * 86) / 2; ids.forEach((id, k) => (pos[id] = { x: 22 + li * 256, y: y0 + k * 86 })); });
      } else {
        W = 400; let y = 0;
        LAYERS.forEach((l, li) => { y += 30; const ids = M.order.filter((i) => M.layerOf[i] === li); ids.forEach((id, k) => (pos[id] = { x: 10, y: y + k * 72 })); y += ids.length * 72 + 8; });
        H = y;
      }
      const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "rm-svg" });
      svg.appendChild(svgEl("defs")).innerHTML = '<marker id="rm-ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M0,0.8 L9,5 L0,9.2 z" class="rm-ahp"/></marker>';
      LAYERS.forEach((l, li) => {
        const ids = M.order.filter((i) => M.layerOf[i] === li); if (!ids.length) return;
        const p = pos[ids[0]];
        svg.append(svgEl("text", { x: wide ? p.x + nw / 2 : 14, y: wide ? 22 : p.y - 10, class: "rm-layer", "text-anchor": wide ? "middle" : "start" }, `${li + 1} · ${L(l.en, l.zh)}`));
      });
      const gE = svg.appendChild(svgEl("g")), gN = svg.appendChild(svgEl("g"));
      const maxN = Math.max(1, ...M.edges.map((e) => e.n));
      for (const e of M.edges) {
        const a = pos[e.from], b = pos[e.to]; if (!a || !b) continue;
        let x1, y1, x2, y2, d;
        const ca = { x: a.x + nw / 2, y: a.y + nh / 2 }, cb = { x: b.x + nw / 2, y: b.y + nh / 2 };
        if (Math.abs(ca.x - cb.x) > 20) { // different columns: leave from the facing sides
          const right = cb.x > ca.x; x1 = right ? a.x + nw : a.x; x2 = right ? b.x - 3 : b.x + nw + 3; y1 = ca.y; y2 = cb.y;
          const mx = (x1 + x2) / 2; d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
        } else { // same column: bow out to the right
          const down = cb.y > ca.y; x1 = a.x + nw; x2 = b.x + nw + 3; y1 = ca.y + (down ? 12 : -12); y2 = cb.y + (down ? -12 : 12);
          const bow = wide ? 26 + Math.abs(y2 - y1) * 0.18 : Math.min(118, 22 + Math.abs(y2 - y1) * 0.16); d = `M${x1},${y1} C${x1 + bow},${y1} ${x2 + bow},${y2} ${x2},${y2}`;
        }
        const s = Math.log2(1 + e.n) / Math.log2(1 + maxN);
        const on = !sel || e.from === sel || e.to === sel;
        const path = svgEl("path", { d, class: "rm-edge" + (on ? "" : " dim") + (sel && on ? " hot" : ""), "stroke-width": (1 + 5.5 * s).toFixed(1), "stroke-opacity": (on ? 0.28 + 0.55 * s : 0.06).toFixed(2), stroke: M.color[e.from], "marker-end": "url(#rm-ah)" });
        const info = () => { $("#rm-edgeinfo").textContent = `${tname(e.from)} → ${tname(e.to)}: ${e.n}${e.back ? L(` links (and ${e.back} back)`, ` 处链接（反向 ${e.back} 处）`) : L(" links", " 处链接")}`; };
        path.addEventListener("pointerenter", info); path.addEventListener("click", info);
        const hit = svgEl("path", { d, class: "rm-hit" }); hit.addEventListener("pointerenter", info); hit.addEventListener("click", info);
        gE.append(path, hit);
      }
      const near = new Set(sel ? [sel, ...M.edges.filter((e) => e.from === sel || e.to === sel).flatMap((e) => [e.from, e.to])] : []);
      for (const id of M.order) {
        const p = pos[id], tp = ctx.TOPIC[id], pct = ctx.topicPct(tp);
        const g = svgEl("g", { class: "rm-node" + (id === sel ? " sel" : "") + (sel && !near.has(id) ? " dim" : ""), transform: `translate(${p.x},${p.y})`, tabindex: 0, role: "button" });
        g.append(svgEl("rect", { width: nw, height: nh, rx: 10, class: "bg" }), svgEl("rect", { width: 6, height: nh, rx: 3, fill: M.color[id] }));
        let title = tname(id); const maxc = wide ? (zh ? 12 : 23) : (zh ? 16 : 30); if (title.length > maxc) title = title.slice(0, maxc - 1) + "…";
        g.append(svgEl("text", { x: 16, y: 24, class: "t" }, title));
        g.append(svgEl("text", { x: 16, y: 44, class: "s" }, `${tp.chapters.length} ${L("chapters", "章")} · ${pct}%`));
        g.append(svgEl("rect", { x: 16, y: 51, width: nw - 32, height: 4, rx: 2, class: "pb" }), svgEl("rect", { x: 16, y: 51, width: ((nw - 32) * pct) / 100, height: 4, rx: 2, fill: M.color[id] }));
        const go = () => select(id === sel ? null : id);
        g.addEventListener("click", go); g.addEventListener("keydown", (ev) => { if (ev.key === "Enter") go(); });
        gN.append(g);
      }
      box.innerHTML = ""; box.append(svg);
    }

    // ------------------------------------------------------------ level 2 and 3
    const chip = (k) => { const x = M.CH[k]; return `<a class="rm-chip" href="#/c/${x.tid}/${x.c.id}" style="--cc:${M.color[x.tid]}" title="${esc(tname(x.tid))}"><b>${esc(short(x.tid))}</b>${esc(pick(x.c.title))}${done(k) ? " ✓" : ""}</a>`; };
    const chips = (label, keys) => {
      if (!keys.length) return "";
      const sorted = [...keys].sort((a, b) => M.rank[a] - M.rank[b]);
      return `<div class="rm-chips"><span class="rm-lbl">${label}</span>${sorted.slice(0, 6).map(chip).join("")}${sorted.length > 6 ? `<button class="rm-more" type="button">+${sorted.length - 6}</button><span class="rm-rest" hidden>${sorted.slice(6).map(chip).join("")}</span>` : ""}</div>`;
    };
    const buildsOn = (k) => (M.CH[k].c.links || []).filter((to) => M.CH[to] && (M.CH[to].tid !== M.CH[k].tid || M.rank[to] < M.rank[k]));
    const leadsTo = (k) => [...new Set(M.incoming[k] || [])];
    function prereqPath(k) { // transitive prerequisites along strictly earlier chapters: acyclic by construction
      const seen = new Map();
      const walk = (x, depth) => { if (depth >= 3) return; for (const to of M.CH[x].c.links || []) { if (!M.CH[to] || M.rank[to] >= M.rank[x] || to === k) continue; if (!seen.has(to) || seen.get(to) > depth) { seen.set(to, depth); walk(to, depth + 1); } } };
      walk(k, 0);
      return [...seen.keys()].sort((a, b) => M.rank[a] - M.rank[b]).slice(-25);
    }
    function drawCourse() {
      const box = $("#rm-course");
      if (!sel) { box.innerHTML = `<p class="muted rm-hint">${L("Tap a course above to open it.", "点上面的一门课来展开。")}</p>`; return; }
      const tp = ctx.TOPIC[sel]; let html = `<div class="rm-chead"><h2><span class="dot" style="background:${M.color[sel]}"></span>${esc(tname(sel))}</h2><a class="btn small" href="#/t/${sel}">${L("Open course", "打开课程")}</a></div><div class="rm-list" id="rm-list"><svg class="rm-arcs" id="rm-arcs"></svg>`;
      for (const m of ctx.MOD_ORDER) {
        const chs = tp.chapters.filter((c) => ctx.modOf(c) === m); if (!chs.length) continue;
        html += `<div class="rm-mod">${esc(ctx.t().mod[m] || m)}</div>`;
        for (const c of chs) {
          const k = `${sel}/${c.id}`, x = M.CH[k];
          html += `<div class="rm-row${k === hot ? " hot" : ""}" data-k="${k}"><span class="rm-num${done(k) ? " done" : ""}">${done(k) ? "✓" : x.n}</span><div class="rm-body"><div class="rm-top"><a class="rm-ttl" href="#/c/${sel}/${c.id}">${esc(pick(c.title))}</a><span class="muted small">${mins(c)} ${L("min", "分钟")}</span><button class="rm-pathbtn" type="button" data-k="${k}">${k === pathOf ? L("hide path", "收起路径") : L("show path", "看学习路径")}</button></div>${chips(L("builds on", "先修"), buildsOn(k))}${chips(L("leads to", "通向"), leadsTo(k))}`;
          if (k === pathOf) {
            const list = prereqPath(k);
            html += `<div class="rm-path"><div class="rm-lbl">${L("To understand this chapter, read these first (in order):", "要读懂这一章，先按顺序读这些：")}</div>${list.length ? `<ol>${list.map((p) => { const y = M.CH[p]; return `<li><a href="#/c/${y.tid}/${y.c.id}"><b style="color:${M.color[y.tid]}">${esc(short(y.tid))}</b> ${esc(pick(y.c.title))}</a> <span class="muted small">${done(p) ? "✓ · " : ""}${mins(y.c)} ${L("min", "分钟")}</span></li>`; }).join("")}</ol><div class="muted small">${L(`${list.length} chapters, about ${Math.round(list.reduce((a, p) => a + mins(M.CH[p].c), 0) / 60)} h in total; links are followed three levels deep.`, `共 ${list.length} 章，合计约 ${Math.round(list.reduce((a, p) => a + mins(M.CH[p].c), 0) / 60)} 小时；沿链接往前追三层。`)}</div>` : `<div class="muted small">${L("No earlier chapter is linked from here: you can start with it.", "这一章没有链接到更靠前的内容，可以直接从它开始。")}</div>`}</div>`;
          }
          html += "</div></div>";
        }
      }
      box.innerHTML = html + "</div>";
      box.querySelectorAll(".rm-more").forEach((b) => (b.onclick = () => { b.nextElementSibling.hidden = false; b.remove(); drawArcs(); }));
      box.querySelectorAll(".rm-pathbtn").forEach((b) => (b.onclick = () => { pathOf = pathOf === b.dataset.k ? null : b.dataset.k; drawCourse(); }));
      drawArcs();
    }
    function drawArcs() { // arcs between chapters of the same course that link to each other
      const list = $("#rm-list"), svg = $("#rm-arcs"); if (!list || !svg) return;
      const y = {}; list.querySelectorAll(".rm-row").forEach((r) => (y[r.dataset.k] = r.offsetTop + 18));
      const H = list.scrollHeight, W = svg.clientWidth || 40;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.style.height = H + "px"; svg.innerHTML = "";
      const seen = new Set();
      for (const k in y) for (const to of M.CH[k].c.links || []) {
        if (!(to in y) || seen.has(to + "|" + k)) continue; seen.add(k + "|" + to);
        const a = y[k], b = y[to], r = (6 + (W - 10) * Math.sqrt(Math.abs(a - b) / H)) / 1.4; // longer links bow further out
        const cx = Math.max(3, W - r * 1.4);
        svg.append(svgEl("path", { d: `M${W},${a} C${cx},${a} ${cx},${b} ${W},${b}`, class: "rm-arc", stroke: M.color[sel] }));
      }
    }
    function select(id, row) {
      sel = id; pathOf = null; hot = row || null;
      try { history.replaceState(null, "", id ? `#/map/${id}` : "#/map"); } catch {}
      drawMap(); drawCourse();
      const target = row ? main.querySelector(`.rm-row[data-k="${row}"]`) : id ? $("#rm-course") : null;
      if (target) target.scrollIntoView({ behavior: "smooth", block: row ? "center" : "start" });
    }

    // ------------------------------------------------------------ search
    const q = $("#rm-q"), res = $("#rm-res");
    q.addEventListener("input", () => {
      const s = q.value.trim().toLowerCase();
      if (s.length < 2) { res.innerHTML = ""; return; }
      const hits = Object.values(M.CH).filter((x) => `${x.c.title.en || ""} ${x.c.title.zh || ""}`.toLowerCase().includes(s)).sort((a, b) => M.rank[a.k] - M.rank[b.k]).slice(0, 12);
      res.innerHTML = hits.length ? hits.map((x) => `<button type="button" data-k="${x.k}"><b style="color:${M.color[x.tid]}">${esc(short(x.tid))}</b> ${esc(pick(x.c.title))}</button>`).join("") : `<span class="muted small">${L("No chapter matches.", "没有匹配的章节。")}</span>`;
      res.querySelectorAll("button").forEach((b) => (b.onclick = () => { res.innerHTML = ""; q.value = ""; select(M.CH[b.dataset.k].tid, b.dataset.k); }));
    });

    drawMap(); drawCourse();
    let lastWide = $("#rm-map").clientWidth >= 640;
    const ro = new ResizeObserver(() => { if (!main.contains($("#rm-map"))) { ro.disconnect(); return; } const w = $("#rm-map").clientWidth >= 640; if (w !== lastWide) { lastWide = w; drawMap(); } drawArcs(); });
    ro.observe($("#rm-map"));
    main.__rmapTest = { M, prereqPath, buildsOn, leadsTo };
  }

  window.PrepMap = { view, model };
})();
