"use strict";
// Pencil annotation on lesson / item / notation pages, plus notebook pages (PrepInk).
//
// - One viewport-sized fixed canvas pair over the scroll container (finished strokes + the live
//   stroke); never a page-tall canvas. Redrawn on scroll, resize, panel toggles and layout changes.
// - Every stroke is anchored to the block element under its first point (paragraph, list item,
//   heading, figure, card, notebook page …) and stored relative to that element's box, in units
//   of its width, so ink follows its text when panels open, the font size changes or the iPad turns.
// - A Pencil always writes (when annotation is on); fingers scroll and tap. "Finger / mouse
//   drawing" makes touch and mouse write too.
// - Stored locally in IndexedDB "prep-ink" (store "pages", one record per page key), with a
//   localStorage fallback. Nothing leaves the device; export / import is a JSON file.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) if (k != null) e.append(k);
    return e;
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r4 = (v) => Math.round(v * 1e4) / 1e4;

  // ------------------------------------------------------------------ storage
  const DB = "prep-ink", STORE = "pages", LSP = "prep-ink:";
  let dbp = null;
  function db() {
    dbp ||= new Promise((res) => {
      try {
        const rq = indexedDB.open(DB, 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => res(null);
        rq.onblocked = () => res(null);
      } catch { res(null); }
    });
    return dbp;
  }
  const idb = async (mode, fn) => {
    const d = await db();
    if (!d) return undefined;
    return new Promise((res) => {
      try {
        const tx = d.transaction(STORE, mode);
        const rq = fn(tx.objectStore(STORE));
        tx.oncomplete = () => res(rq?.result);
        tx.onerror = tx.onabort = () => res(undefined);
      } catch { res(undefined); }
    });
  };
  async function loadRec(key) {
    let rec = await idb("readonly", (s) => s.get(key));
    if (!rec) try { rec = JSON.parse(localStorage.getItem(LSP + key) || "null"); } catch {}
    return rec && Array.isArray(rec.strokes) ? rec : { v: 1, strokes: [], nb: [], updated: 0 };
  }
  async function saveRec(key, rec) {
    rec.updated = Date.now();
    const empty = !rec.strokes.length && !(rec.nb || []).length;
    const d = await db();
    if (d) { await idb("readwrite", (s) => (empty ? s.delete(key) : s.put(rec, key))); return; }
    try { empty ? localStorage.removeItem(LSP + key) : localStorage.setItem(LSP + key, JSON.stringify(rec)); } catch {}
  }
  async function exportAll() {
    const pages = {};
    const d = await db();
    if (d) {
      const keys = (await idb("readonly", (s) => s.getAllKeys())) || [];
      const vals = (await idb("readonly", (s) => s.getAll())) || [];
      keys.forEach((k, i) => (pages[k] = vals[i]));
    }
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(LSP)) pages[k.slice(LSP.length)] ??= JSON.parse(localStorage.getItem(k)); } } catch {}
    return new Blob([JSON.stringify({ app: "prep-ink", v: 1, exported: new Date().toISOString(), pages })], { type: "application/json" });
  }
  async function importAll(json) {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    if (!data || data.app !== "prep-ink" || typeof data.pages !== "object") throw new Error("not a prep-ink file");
    let n = 0;
    for (const [k, rec] of Object.entries(data.pages)) if (rec && Array.isArray(rec.strokes)) { await saveRec(k, rec); n++; }
    if (P.key) { const k = P.key; P.rec = await loadRec(k); if (P.key === k) { buildNotebook(); resolveCache.clear(); redraw(); updateCount(); } }
    return n;
  }

  // ------------------------------------------------------------------ settings
  const COLORS = [["ink", null], ["blue", "#0a63e0"], ["red", "#d93025"], ["green", "#1f8354"], ["orange", "#e8710a"], ["purple", "#7c4dff"], ["yellow", "#f5c400"], ["grey", "#8c94a6"]];
  const SIZES = { pen: [1.4, 2.4, 4, 6.5], hl: [10, 16, 24, 34], eraser: [8, 14, 22, 32] };
  const UI = Object.assign({ on: true, open: window.innerWidth >= 700, tool: "pen", finger: false, pressure: true, hidden: false, color: { pen: "ink", hl: "yellow" }, size: { pen: 1, hl: 1, eraser: 1 } }, (() => { try { return JSON.parse(localStorage.getItem("prep-ink-ui") || "{}"); } catch { return {}; } })());
  const saveUI = () => { try { localStorage.setItem("prep-ink-ui", JSON.stringify(UI)); } catch {} };
  const colorOf = (c) => (c === "ink" ? getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#1f1f1f" : (COLORS.find((x) => x[0] === c) || [0, c])[1]);

  // ------------------------------------------------------------------ page state
  const P = { key: null, root: null, sc: null, ctx: null, rec: null, undo: [], redo: [], token: 0 };
  const L = (en, zh) => (P.ctx?.lang === "zh" ? zh : en);
  let base = null, live = null, bar = null, pop = null;
  let saveTimer = 0;
  const dirty = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400); };
  function flush() { clearTimeout(saveTimer); saveTimer = 0; if (P.key && P.rec) saveRec(P.key, P.rec); }
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  window.addEventListener("pagehide", flush);

  // ------------------------------------------------------------------ anchors
  const ANCHOR = "p, li, h1, h2, h3, h4, pre, table, blockquote, .viz, .katex-display, summary, .card, .nb-page";
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
  const textKey = (e) => hash((e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40));
  const kids = (e) => [...e.children].filter((c) => !c.classList.contains("nb-section"));
  function anchorOf(target) {
    const root = P.root;
    let e = target && target.nodeType === 1 ? target.closest(ANCHOR) : null;
    if (!e || !root.contains(e) || e === root) return { a: { r: 1 }, node: root };
    if (e.classList.contains("nb-page")) return { a: { nb: e.dataset.nb }, node: e };
    const path = [];
    for (let n = e; n !== root; n = n.parentElement) path.unshift(kids(n.parentElement).indexOf(n));
    return { a: { p: path, h: textKey(e), t: e.tagName }, node: e };
  }
  const resolveCache = new Map();
  function resolve(a) {
    const root = P.root;
    if (!root) return null;
    if (a.r) return root;
    const ck = a.nb ? "nb:" + a.nb : a.p.join(".") + "|" + a.h;
    const hit = resolveCache.get(ck);
    if (hit && hit.isConnected) return hit;
    let e = null;
    if (a.nb) e = root.querySelector(`.nb-page[data-nb="${a.nb}"]`);
    else {
      e = root;
      for (const i of a.p) { e = e && kids(e)[i]; if (!e) break; }
      if (!e || textKey(e) !== a.h) {
        // The structure shifted (content update): look for the same text among elements of that kind.
        const same = $$(a.t ? a.t.toLowerCase() : ANCHOR, root).find((x) => !x.closest(".nb-section") && textKey(x) === a.h);
        e = same || e;
      }
    }
    if (e) resolveCache.set(ck, e);
    return e || null;
  }

  // ------------------------------------------------------------------ canvases and drawing
  function ensureCanvases() {
    if (base?.isConnected) return;
    base = el("canvas", { class: "ink-canvas" });
    live = el("canvas", { class: "ink-canvas ink-live" });
    document.body.append(base, live);
  }
  let box = { l: 0, t: 0, w: 0, h: 0 };
  function fit() {
    const r = P.sc.getBoundingClientRect();
    const w = Math.max(1, P.sc.clientWidth), h = Math.max(1, P.sc.clientHeight), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    box = { l: r.left, t: r.top, w, h, dpr };
    for (const c of [base, live]) {
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      c.style.left = r.left + "px"; c.style.top = r.top + "px"; c.style.width = w + "px"; c.style.height = h + "px";
    }
  }
  const widthAt = (s, p, rootW) => s.w * rootW * (s.np ? 1 : 0.35 + 1.3 * Math.pow(clamp(p, 0, 1), 0.7));
  // Draw one stroke; rect is its anchor's client rect.
  function drawStroke(g, s, rect, rootW) {
    const k = rect.width, ox = rect.left - box.l, oy = rect.top - box.t, pts = s.pts, n = pts.length / 3;
    if (!n) return;
    const X = (i) => ox + pts[3 * i] * k, Y = (i) => oy + pts[3 * i + 1] * k;
    const col = colorOf(s.c);
    g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = col; g.fillStyle = col;
    if (s.t === "h") {
      g.globalAlpha = 0.35; g.lineWidth = s.w * rootW;
      g.beginPath(); g.moveTo(X(0), Y(0));
      if (n === 1) g.lineTo(X(0) + 0.01, Y(0));
      for (let i = 1; i < n - 1; i++) g.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
      if (n > 1) g.lineTo(X(n - 1), Y(n - 1));
      g.stroke(); g.globalAlpha = 1;
      return;
    }
    if (n === 1) { g.beginPath(); g.arc(X(0), Y(0), widthAt(s, pts[2], rootW) / 2, 0, 7); g.fill(); return; }
    // Quadratic midpoint smoothing, one short segment per point, width from the local pressure.
    let px = X(0), py = Y(0);
    for (let i = 1; i < n; i++) {
      const last = i === n - 1;
      const mx = last ? X(i) : (X(i) + X(i + 1)) / 2, my = last ? Y(i) : (Y(i) + Y(i + 1)) / 2;
      g.lineWidth = widthAt(s, (pts[3 * i - 1] + pts[3 * i + 2]) / 2, rootW);
      g.beginPath(); g.moveTo(px, py);
      if (last) g.lineTo(mx, my); else g.quadraticCurveTo(X(i), Y(i), mx, my);
      g.stroke();
      px = mx; py = my;
    }
  }
  const bounds = (s) => {
    if (s._b) return s._b;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < s.pts.length; i += 3) { x0 = Math.min(x0, s.pts[i]); x1 = Math.max(x1, s.pts[i]); y0 = Math.min(y0, s.pts[i + 1]); y1 = Math.max(y1, s.pts[i + 1]); }
    Object.defineProperty(s, "_b", { value: [x0, y0, x1, y1], enumerable: false, configurable: true });
    return s._b;
  };
  // Inside a closed <details> (except its own summary) nothing is rendered; browsers disagree on the rect.
  function shown(e) {
    for (let d = e.closest("details:not([open])"); d; d = d.parentElement && d.parentElement.closest("details:not([open])")) {
      const sm = e.closest("summary");
      if (!(sm && sm.parentElement === d)) return false;
    }
    return true;
  }
  // One getBoundingClientRect per anchor that has strokes, per frame.
  function rects() {
    const map = new Map();
    return (a) => {
      const e = resolve(a);
      if (!e) return null;
      let r = map.get(e);
      if (r === undefined) { const b = shown(e) ? e.getBoundingClientRect() : null; r = b && b.width > 0 && b.height > 0 ? b : null; map.set(e, r); }
      return r;
    };
  }
  let raf = 0;
  const redraw = () => { if (!raf) raf = requestAnimationFrame(paint); };
  function paint() {
    raf = 0;
    if (!P.key || !P.root?.isConnected || !base) return;
    fit();
    const g = base.getContext("2d");
    g.setTransform(box.dpr, 0, 0, box.dpr, 0, 0);
    g.clearRect(0, 0, box.w, box.h);
    paintLive();
    if (UI.hidden || !P.rec) return;
    const rootW = P.root.getBoundingClientRect().width, rectOf = rects();
    for (const pass of ["h", "p"]) for (const s of P.rec.strokes) {
      if ((s.t === "h") !== (pass === "h")) continue;
      const r = rectOf(s.a);
      if (!r) continue;
      const b = bounds(s), pad = s.w * rootW * 2 + 4;
      if (r.top + b[3] * r.width + pad < box.t || r.top + b[1] * r.width - pad > box.t + box.h) continue;
      drawStroke(g, s, r, rootW);
    }
  }
  function paintLive() {
    if (!live) return;
    const g = live.getContext("2d");
    g.setTransform(box.dpr, 0, 0, box.dpr, 0, 0);
    g.clearRect(0, 0, box.w, box.h);
    if (cur?.stroke && cur.node.isConnected) { const r = cur.node.getBoundingClientRect(); if (r.width) drawStroke(g, cur.stroke, r, P.root.getBoundingClientRect().width); }
    if (cur?.erase && cur.at) { g.strokeStyle = colorOf("grey"); g.lineWidth = 1.5; g.beginPath(); g.arc(cur.at[0] - box.l, cur.at[1] - box.t, SIZES.eraser[UI.size.eraser], 0, 7); g.stroke(); }
  }

  // ------------------------------------------------------------------ input
  const INTERACTIVE = "a, button, input, select, textarea, label, summary, [role=button], [contenteditable], .viz-stage, .viz-ctrls, .ink-bar, .ink-pop, .nb-tools, .nb-head, .nb-foot, .note-drawer, .note-fab, .steps-ctl";
  let cur = null, penAt = 0;
  const canDraw = () => P.key && P.root?.isConnected && UI.on && !UI.hidden;
  function wants(e) {
    if (!canDraw()) return false;
    const pen = e.pointerType === "pen" || e.touchType === "stylus";
    if (!pen && !UI.finger) return false;
    if (e.pointerType === "mouse" && e.button !== 0) return false;
    const t = e.target;
    if (!t || t.nodeType !== 1 || !P.root.contains(t) || t.closest(INTERACTIVE)) return false;
    return true;
  }
  function eraseAt(x, y) {
    const rad = SIZES.eraser[UI.size.eraser], rectOf = rects(), rootW = P.root.getBoundingClientRect().width, gone = [];
    const S = P.rec.strokes;
    for (let i = S.length - 1; i >= 0; i--) {
      const s = S[i], r = rectOf(s.a);
      if (!r) continue;
      const reach = rad + (s.w * rootW) / 2;
      for (let j = 0; j < s.pts.length; j += 3) if (Math.hypot(r.left + s.pts[j] * r.width - x, r.top + s.pts[j + 1] * r.width - y) < reach) { gone.push([i, s]); S.splice(i, 1); break; }
    }
    if (gone.length) { cur.gone.push(...gone); redraw(); }
  }
  function down(e) {
    if (cur || !wants(e)) return;
    if (e.pointerType === "touch" && Date.now() - penAt < 1200) return; // palm while writing with the Pencil
    e.preventDefault(); e.stopPropagation();
    if (e.pointerType === "pen") penAt = Date.now();
    closePop();
    document.body.classList.add("ink-drawing");
    if (UI.tool === "eraser") { cur = { id: e.pointerId, erase: true, gone: [], at: [e.clientX, e.clientY] }; eraseAt(e.clientX, e.clientY); paintLive(); return; }
    const { a, node } = anchorOf(e.target);
    const rootW = P.root.getBoundingClientRect().width, tool = UI.tool === "hl" ? "hl" : "pen";
    const stroke = { t: tool === "hl" ? "h" : "p", c: UI.color[tool], w: r4(SIZES[tool][UI.size[tool]] / rootW), a, pts: [] };
    if (tool === "pen" && !UI.pressure) stroke.np = 1;
    cur = { id: e.pointerId, stroke, node, pen: e.pointerType === "pen" };
    addPoint(e);
    paintLive();
  }
  function addPoint(e) {
    const r = cur.node.getBoundingClientRect();
    if (!r.width) return;
    const p = cur.pen ? (e.pressure > 0 ? e.pressure : 0.5) : 0.5, pts = cur.stroke.pts, n = pts.length;
    const x = r4((e.clientX - r.left) / r.width), y = r4((e.clientY - r.top) / r.width);
    if (n && Math.hypot((x - pts[n - 3]) * r.width, (y - pts[n - 2]) * r.width) < 0.6) { pts[n - 1] = Math.max(pts[n - 1], r4(p)); return; }
    pts.push(x, y, r4(p));
  }
  let liveRaf = 0;
  function move(e) {
    if (!cur || e.pointerId !== cur.id) return;
    e.preventDefault(); e.stopPropagation();
    if (cur.pen) penAt = Date.now();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of evs.length ? evs : [e]) { if (cur.erase) { cur.at = [ev.clientX, ev.clientY]; eraseAt(ev.clientX, ev.clientY); } else addPoint(ev); }
    if (!liveRaf) liveRaf = requestAnimationFrame(() => { liveRaf = 0; paintLive(); });
  }
  function up(e) {
    if (!cur || e.pointerId !== cur.id) return;
    e.preventDefault(); e.stopPropagation();
    const c = cur;
    cur = null;
    document.body.classList.remove("ink-drawing");
    if (c.erase) { if (c.gone.length) { P.undo.push({ del: c.gone.slice().reverse() }); P.redo.length = 0; dirty(); } }
    else if (c.stroke.pts.length) { P.rec.strokes.push(c.stroke); P.undo.push({ add: c.stroke }); P.redo.length = 0; dirty(); }
    updateCount();
    redraw();
  }
  const cap = { capture: true, passive: false };
  document.addEventListener("pointerdown", down, cap);
  document.addEventListener("pointermove", move, cap);
  document.addEventListener("pointerup", up, cap);
  document.addEventListener("pointercancel", up, cap);
  // Safari scrolls with the Pencil unless the touch events are cancelled.
  const noScroll = (e) => {
    if (!canDraw()) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (cur || (t && t.touchType === "stylus" && wants({ touchType: "stylus", target: e.target }))) { if (e.cancelable) e.preventDefault(); }
  };
  document.addEventListener("touchstart", noScroll, cap);
  document.addEventListener("touchmove", noScroll, cap);
  // Keep the picture in step with the page.
  document.addEventListener("scroll", () => { if (P.key) redraw(); }, { capture: true, passive: true });
  document.addEventListener("toggle", () => { if (P.key) redraw(); }, true);
  window.addEventListener("resize", () => { if (P.key) redraw(); });
  const ro = "ResizeObserver" in window ? new ResizeObserver(() => { if (P.key) redraw(); }) : null;
  const mo = new MutationObserver((ms) => { if (P.key && ms.some((m) => !(m.target.closest && m.target.closest(".ink-bar, .ink-pop")))) redraw(); });

  function undo() {
    const op = P.undo.pop();
    if (!op) return;
    const S = P.rec.strokes;
    if (op.add) { const i = S.lastIndexOf(op.add); if (i >= 0) S.splice(i, 1); }
    else if (op.del) for (const [i, s] of op.del) S.splice(Math.min(i, S.length), 0, s);
    else if (op.clear) S.push(...op.clear);
    P.redo.push(op); dirty(); updateCount(); redraw();
  }
  function redo() {
    const op = P.redo.pop();
    if (!op) return;
    const S = P.rec.strokes;
    if (op.add) S.push(op.add);
    else if (op.del) for (const [, s] of op.del) { const i = S.indexOf(s); if (i >= 0) S.splice(i, 1); }
    else if (op.clear) S.length = 0;
    P.undo.push(op); dirty(); updateCount(); redraw();
  }
  function clearPage() {
    if (!P.rec.strokes.length || !confirm(L("Erase all ink on this page (notebook pages included)?", "清除本页的全部笔迹（包括笔记本页）？"))) return;
    P.undo.push({ clear: P.rec.strokes.splice(0) }); P.redo.length = 0; dirty(); updateCount(); redraw();
  }

  // ------------------------------------------------------------------ toolbar
  const IC = {
    pen: '<svg viewBox="0 0 24 24"><path d="M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    hl: '<svg viewBox="0 0 24 24"><path d="M9 14l-3 3v3h3l3-3M9 14l8-9 4 4-9 8zM3 21h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    eraser: '<svg viewBox="0 0 24 24"><path d="M8 19l-4-4L14 5l6 6-8 8zM9 10l6 6M8 19h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5M4 12h10a5 5 0 010 10h-2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -3)"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="M15 7l5 5-5 5M20 12H10a5 5 0 000 10h2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -3)"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM4 4l16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const tb = (name, icon, title, onClick) => { const b = el("button", { type: "button", class: "ink-b", "data-k": name, title, "aria-label": title, onclick: onClick }); b.innerHTML = icon; return b; };
  function closePop() { pop?.remove(); pop = null; }
  function buildBar() {
    bar?.remove(); closePop();
    if (!P.key) { bar = null; return; }
    bar = el("div", { class: "ink-bar" + (UI.open ? "" : " shut") });
    if (!UI.open) {
      bar.append(tb("open", IC.pen, L("Pencil tools", "手写工具"), () => { UI.open = true; saveUI(); buildBar(); }));
      document.body.append(bar);
      updateCount();
      return;
    }
    const pick = (tool) => () => { if (UI.tool === tool && tool !== "eraser") return openPop("style"); UI.tool = tool; saveUI(); sync(); if (pop) openPop(pop.dataset.kind); };
    const sw = el("button", { type: "button", class: "ink-b ink-sw", "data-k": "style", title: L("Colour and width", "颜色与粗细"), onclick: () => (pop?.dataset.kind === "style" ? closePop() : openPop("style")) }, el("i"));
    bar.append(
      tb("shut", IC.close, L("Fold the toolbar", "收起工具栏"), () => { UI.open = false; saveUI(); buildBar(); }),
      tb("pen", IC.pen, L("Pen", "钢笔"), pick("pen")), tb("hl", IC.hl, L("Highlighter", "荧光笔"), pick("hl")), tb("eraser", IC.eraser, L("Eraser (whole strokes)", "橡皮（整笔擦除）"), pick("eraser")),
      sw,
      tb("undo", IC.undo, L("Undo", "撤销"), undo), tb("redo", IC.redo, L("Redo", "重做"), redo),
      tb("eye", IC.eye, L("Hide / show ink", "隐藏 / 显示笔迹"), () => { UI.hidden = !UI.hidden; saveUI(); sync(); redraw(); }),
      tb("more", IC.more, L("More", "更多"), () => (pop?.dataset.kind === "more" ? closePop() : openPop("more"))),
      el("span", { class: "ink-count", title: L("strokes on this page", "本页笔画数") }),
    );
    document.body.append(bar);
    sync();
  }
  function sync() {
    if (!bar) return;
    $$(".ink-b", bar).forEach((b) => b.classList.toggle("on", b.dataset.k === UI.tool));
    const tool = UI.tool === "hl" ? "hl" : "pen", i = $(".ink-sw i", bar);
    if (i) { i.style.background = colorOf(UI.color[tool]); const px = SIZES[UI.tool][UI.size[UI.tool]]; i.style.width = i.style.height = clamp(px * (UI.tool === "pen" ? 3 : 0.8), 8, 26) + "px"; i.style.opacity = UI.tool === "hl" ? 0.55 : 1; }
    const eye = $('[data-k="eye"]', bar);
    if (eye) { eye.innerHTML = UI.hidden ? IC.eyeOff : IC.eye; eye.classList.toggle("warn", UI.hidden); }
    bar.classList.toggle("off", !UI.on || UI.hidden);
    P.sc?.classList.toggle("ink-finger", !!(UI.finger && canDraw()));
    updateCount();
  }
  function updateCount() {
    const c = bar && $(".ink-count", bar);
    if (c) c.textContent = P.rec ? String(P.rec.strokes.length) : "";
    if (bar) { const u = $('[data-k="undo"]', bar), r = $('[data-k="redo"]', bar); if (u) u.disabled = !P.undo.length; if (r) r.disabled = !P.redo.length; }
  }
  function openPop(kind) {
    closePop();
    if (!bar) return;
    pop = el("div", { class: "ink-pop", "data-kind": kind });
    if (kind === "style") {
      const tool = UI.tool, ctool = tool === "hl" ? "hl" : "pen";
      if (tool !== "eraser") {
        const row = el("div", { class: "ink-colors" });
        for (const [k] of COLORS) row.append(el("button", { type: "button", class: "ink-c" + (UI.color[ctool] === k ? " on" : ""), style: `--c:${colorOf(k)}`, title: k, onclick: () => { UI.color[ctool] = k; saveUI(); sync(); openPop("style"); } }));
        pop.append(el("div", { class: "ink-lbl" }, tool === "hl" ? L("Highlighter colour", "荧光笔颜色") : L("Pen colour", "钢笔颜色")), row);
      }
      const sizes = el("div", { class: "ink-sizes" });
      SIZES[tool].forEach((px, i) => sizes.append(el("button", { type: "button", class: "ink-s" + (UI.size[tool] === i ? " on" : ""), onclick: () => { UI.size[tool] = i; saveUI(); sync(); openPop("style"); } }, el("i", { style: `width:${clamp(px * (tool === "pen" ? 3 : 0.8), 5, 28)}px;height:${clamp(px * (tool === "pen" ? 3 : 0.8), 5, 28)}px` }))));
      pop.append(el("div", { class: "ink-lbl" }, tool === "eraser" ? L("Eraser size", "橡皮大小") : L("Width", "粗细")), sizes);
      if (tool === "pen") pop.append(toggle(L("Pressure changes the width", "笔画粗细随压力变化"), UI.pressure, (v) => { UI.pressure = v; saveUI(); }));
    } else {
      pop.append(
        toggle(L("Pencil writes on the page", "用 Pencil 在页面上书写"), UI.on, (v) => { UI.on = v; saveUI(); sync(); }),
        toggle(L("Draw with finger / mouse too (scrolling pauses)", "手指 / 鼠标也能写（此时不能滚动）"), UI.finger, (v) => { UI.finger = v; saveUI(); sync(); }),
        el("button", { type: "button", class: "ink-wide", onclick: () => { closePop(); addNbPage(); } }, L("＋ Add a notebook page", "＋ 添加一页笔记本")),
        el("button", { type: "button", class: "ink-wide danger", onclick: () => { closePop(); clearPage(); } }, L("Clear all ink on this page", "清除本页全部笔迹")),
        el("div", { class: "ink-note" }, L("Ink is stored on this device only.", "笔迹只保存在本机。")),
      );
    }
    document.body.append(pop);
    const r = bar.getBoundingClientRect();
    pop.style.top = clamp(r.top, 8, Math.max(8, window.innerHeight - pop.offsetHeight - 8)) + "px";
    pop.style.right = window.innerWidth - r.left + 8 + "px";
  }
  function toggle(label, value, onChange) {
    const inp = el("input", { type: "checkbox" });
    inp.checked = !!value;
    inp.addEventListener("change", () => onChange(inp.checked));
    return el("label", { class: "ink-tg" }, inp, el("span", {}, label));
  }
  document.addEventListener("pointerdown", (e) => { if (pop && !e.target.closest(".ink-pop, .ink-bar")) closePop(); });

  // ------------------------------------------------------------------ notebook pages
  const PAPERS = [["ruled", "Ruled", "横线"], ["grid", "Grid", "方格"], ["dotted", "Dotted", "点阵"], ["blank", "Blank", "空白"]];
  function buildNotebook() {
    const root = P.root;
    if (!root || !P.rec) return;
    $$(".nb-section", root).forEach((x) => x.remove());
    const isNb = P.key.startsWith("nb/");
    if (isNb && !P.rec.nb.length) P.rec.nb.push({ id: "n" + Date.now().toString(36), paper: "ruled" });
    const sec = el("section", { class: "nb-section" });
    sec.append(el("div", { class: "nb-head" },
      el("h3", {}, isNb ? L("Pages", "页面") : L("Notebook", "笔记本")),
      el("span", { class: "muted" }, P.rec.nb.length ? L(`${P.rec.nb.length} page(s)`, `共 ${P.rec.nb.length} 页`) : L("Extra pages to write on when the margins are not enough.", "页边写不下时，在这里加页继续写。")),
      el("button", { type: "button", class: "btn small", onclick: () => addNbPage() }, L("＋ Add page", "＋ 加一页"))));
    P.rec.nb.forEach((pg, i) => {
      const sel = el("select", { class: "nb-paper", "aria-label": L("Paper", "纸张"), onchange: () => { pg.paper = sel.value; dirty(); page.className = "nb-page paper-" + pg.paper; } }, PAPERS.map(([k, en, zh]) => { const o = el("option", { value: k }, L(en, zh)); if (k === pg.paper) o.selected = true; return o; }));
      const page = el("div", { class: "nb-page paper-" + pg.paper, "data-nb": pg.id });
      sec.append(el("div", { class: "nb-wrap" },
        el("div", { class: "nb-tools" }, el("b", {}, L(`Page ${i + 1}`, `第 ${i + 1} 页`)), sel,
          el("button", { type: "button", class: "btn small ghost", onclick: () => delNbPage(pg.id) }, L("Delete page", "删除此页"))),
        page));
    });
    if (isNb) sec.append(el("div", { class: "nb-foot" },
      el("span", { class: "muted" }, L("All ink (every page of every course) as one file:", "把全部笔迹（所有课程、所有页面）导出为一个文件：")),
      el("button", { type: "button", class: "btn small", onclick: doExport }, L("Export ink", "导出笔迹")),
      el("button", { type: "button", class: "btn small", onclick: doImport }, L("Import ink", "导入笔迹"))));
    const before = [...root.querySelectorAll(".rate-bar, .next-bar")].find((x) => !x.closest(".nb-section"));
    if (before) before.parentNode.insertBefore(sec, before); else root.append(sec);
  }
  function addNbPage() {
    if (!P.rec) return;
    const id = "n" + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
    P.rec.nb.push({ id, paper: P.rec.nb.length ? P.rec.nb[P.rec.nb.length - 1].paper : "ruled" });
    dirty(); buildNotebook(); redraw();
    const pg = $(`.nb-page[data-nb="${id}"]`, P.root);
    pg?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function delNbPage(id) {
    const has = P.rec.strokes.some((s) => s.a.nb === id);
    if (has && !confirm(L("Delete this notebook page and the ink on it?", "删除这一页笔记本和上面的笔迹？"))) return;
    P.rec.strokes = P.rec.strokes.filter((s) => s.a.nb !== id);
    P.rec.nb = P.rec.nb.filter((p) => p.id !== id);
    P.undo.length = P.redo.length = 0;
    dirty(); buildNotebook(); updateCount(); redraw();
  }
  async function doExport() {
    flush();
    const url = URL.createObjectURL(await exportAll());
    const a = el("a", { href: url, download: `prep-ink-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function doImport() {
    const inp = el("input", { type: "file", accept: "application/json,.json" });
    inp.addEventListener("change", async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try { const n = await importAll(await f.text()); alert(L(`Imported ink for ${n} page(s).`, `已导入 ${n} 个页面的笔迹。`)); }
      catch (err) { alert(L("This file is not an ink export.", "这个文件不是笔迹导出文件。")); }
    });
    inp.click();
  }

  // ------------------------------------------------------------------ app hooks
  function detach() {
    flush();
    if (cur) { cur = null; document.body.classList.remove("ink-drawing"); }
    P.sc?.classList.remove("ink-finger");
    ro?.disconnect(); mo.disconnect();
    P.key = null; P.rec = null; P.root = null; P.sc = null;
    bar?.remove(); bar = null; closePop();
    for (const c of [base, live]) if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height);
    if (base) base.style.display = live.style.display = "none";
  }
  async function attach(key, main, ctx) {
    const token = ++P.token;
    if (!key) return detach();
    const sc = ctx.scroller(), root = $(".wrap", sc) || sc.firstElementChild || sc;
    const same = P.key === key;
    if (!same) { detach(); P.token = token; P.undo = []; P.redo = []; }
    else { ro?.disconnect(); mo.disconnect(); }
    P.key = key; P.ctx = ctx; P.sc = sc; P.root = root;
    resolveCache.clear();
    ensureCanvases();
    base.style.display = live.style.display = "";
    if (!same || !P.rec) {
      const rec = await loadRec(key);
      if (P.token !== token) return;
      rec.nb ||= [];
      P.rec = rec;
    }
    buildNotebook();
    buildBar();
    ro?.observe(root); ro?.observe(sc);
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "class", "hidden"] });
    redraw();
  }
  function viewNotebook(main, ctx, tid) {
    const tp = ctx.TOPIC[tid], zh = ctx.lang === "zh", esc = ctx.esc;
    ctx.course(tp, { kind: "notebook" }, `
      ${ctx.crumbs([["#/", ctx.t().home], [`#/t/${tid}`, ctx.pick(tp.title)], [null, zh ? "课程笔记本" : "Course notebook"]])}
      <div class="item-head"><h1><span class="t">${esc(zh ? "课程笔记本" : "Course notebook")} · ${esc(ctx.pick(tp.title))}</span></h1></div>
      <p class="muted nb-intro">${esc(zh ? "这门课的空白笔记本：用 Pencil 直接写，页数不限，纸张可选横线、方格、点阵或空白。每节课和每道题的页面底部也各有自己的笔记本页。笔迹只保存在本机。" : "A blank notebook for this course: write with the Pencil, add as many pages as you like, choose ruled, grid, dotted or blank paper. Every lesson and every item also has its own notebook pages at the bottom of its page. Ink is stored on this device only.")}</p>`);
  }
  window.PrepInk = { attach, detach, viewNotebook, exportAll, importAll, _state: P, _ui: UI, _flush: flush };
})();
