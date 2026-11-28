// Offline cache for the web (home-screen) build, served over HTTPS (Tailscale; see
// README "iPad web version"). tools/build.mjs (and tools/build-public.mjs for the public
// site) fill in VERSION and FILES, a list of [path, contentHash, bytes] entries. The native
// iPad app loads from its bundle and never uses this.
//
// - App shell and data: one cache per build ("prep-shell-<version>"). On update only files
//   whose hash changed are downloaded; unchanged ones are copied from the previous cache.
//   The install is atomic: if any download fails, the old version stays in charge.
// - Pages show what is stored and the download progress in bytes: they ask for "status",
//   and "fill" re-downloads any file of the current version that is missing from the cache.
// - Original PDFs ("pdf/<slug>.pdf"): cached the first time they are opened, or all at
//   once from the Library page, in "prep-pdf", which survives app updates.
const VERSION = "b42c580e5742";
const FILES = [["app.css","f05f07025b1e",49222],["app.js","77adde7adaad",105552],["apple-touch-icon.png","2511447ee6c9",25408],["boot.js","d9bb890940c6",4972],["data/algo.bin","7b0805d970f3",833281],["data/index.bin","bdd8d1d05874",509931],["data/key.json","5767dec2887d",131],["data/library.bin","7cb116048953",30064],["data/linalg.bin","3337c65264a8",1835207],["data/llm-sys.bin","bd297fee2b85",1509014],["data/llm.bin","c79d34793360",1309994],["data/math.bin","3d58fcd5128b",418156],["data/me.bin","fc8c8aa5eee6",2672028],["data/ml.bin","91268e2af0b7",1929547],["data/papers.bin","c37ad7353316",921710],["data/rl.bin","1059efe72220",1573383],["data/robot.bin","44e14ba252ae",1815798],["data/sym.bin","a520e1a85875",3179274],["data/wbc.bin","2ef02b18e954",4941580],["gate.css","316c8b5e306c",1179],["icon.png","cd7cd3aaba54",124593],["index.html","b0f5a407be0b",5163],["ink.css","11569c9a4151",5111],["ink.js","97ad48c8e3fa",33039],["manifest.webmanifest","5d098e5c8af9",362],["roadmap.css","2b0e48be8b04",5660],["roadmap.js","ff72dee2fef0",17028],["rob3d.js","7999cbc0b534",55504],["vendor/fonts/OFL-LICENSE.txt","56a8a07d0b23",4314],["vendor/fonts/source-sans-3-latin-400-italic.woff2","8155c8de0815",15808],["vendor/fonts/source-sans-3-latin-400-normal.woff2","430012e873da",15696],["vendor/fonts/source-sans-3-latin-600-italic.woff2","955e12bf44fd",15736],["vendor/fonts/source-sans-3-latin-600-normal.woff2","ada73f9a5d84",15668],["vendor/fonts/source-sans-3-latin-700-italic.woff2","9db404d7aa7e",15776],["vendor/fonts/source-sans-3-latin-700-normal.woff2","9f9cec816707",15596],["vendor/katex/fonts/KaTeX_AMS-Regular.woff2","34494743736f",28076],["vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2","5bfa49cac46c",6912],["vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2","9f8077e0b38a",6908],["vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2","f98f89272eca",11348],["vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2","a5764c6e2784",11316],["vendor/katex/fonts/KaTeX_Main-Bold.woff2","31050a1b1b12",25324],["vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2","a4a4905b8b12",16780],["vendor/katex/fonts/KaTeX_Main-Italic.woff2","c9b2b5ffd2f2",16988],["vendor/katex/fonts/KaTeX_Main-Regular.woff2","c884086c25ce",26272],["vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2","8fcb9d2de65a",16400],["vendor/katex/fonts/KaTeX_Math-Italic.woff2","db4883d0cff9",16440],["vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2","886e61797a52",12216],["vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2","3d5fa3cb309f",12028],["vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2","e45d5f4f4a7f",10344],["vendor/katex/fonts/KaTeX_Script-Regular.woff2","63b80959f1fc",9644],["vendor/katex/fonts/KaTeX_Size1-Regular.woff2","57fa599974a1",5468],["vendor/katex/fonts/KaTeX_Size2-Regular.woff2","ee18713634a3",5208],["vendor/katex/fonts/KaTeX_Size3-Regular.woff2","19a7caadfb66",3624],["vendor/katex/fonts/KaTeX_Size4-Regular.woff2","9bed17fb92f2",4928],["vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2","7a08883fffc6",13568],["vendor/katex/katex.min.css","02b95b735459",22659],["vendor/katex/katex.min.js","f5a2b1a7d2eb",273081],["viz.js","be6d4caaa2e5",115470],["viz10.js","c0bf11555371",24577],["viz11.js","d5ea3159fe2f",83563],["viz12.js","f3112c9c30ca",59571],["viz13.js","8f26332e17c2",82720],["viz14.js","dd6952b42757",45677],["viz2.js","ba88c5b57610",45883],["viz3.js","ca1218788048",70542],["viz3d.js","c5c826ace7ce",30551],["viz4.js","6efcb94f2238",14666],["viz5.js","2619ece61bd8",63551],["viz6.js","29105a731cc2",76294],["viz7.js","199bb0eb3b43",60353],["viz8.js","3ff355f99282",76786],["viz9.js","c56d193e6988",44207]];
const SHELL = "prep-shell-" + VERSION;
const PDFS = "prep-pdf";
const MANIFEST = "__manifest__.json";
const scope = self.registration.scope;
const abs = (p) => new URL(p, scope).href;
const TOTAL_BYTES = FILES.reduce((s, f) => s + (f[2] || 0), 0);

async function broadcast(msg) {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg);
}

// Progress of one download run (install or fill), posted at most every 200 ms.
function tracker(phase) {
  const st = { prep: "progress", phase, version: VERSION, done: 0, total: FILES.length, bytes: 0, totalBytes: TOTAL_BYTES, file: "" };
  let last = 0;
  return {
    st,
    post(force) {
      const now = Date.now();
      if (!force && now - last < 200) return;
      last = now;
      broadcast({ ...st });
    },
  };
}

// Download one file into the cache, counting bytes as they arrive. The body is teed: one
// branch goes straight into the cache, the other only counts, so nothing is held in memory.
async function download(cache, path, hash, onBytes) {
  // index.html is fetched as the folder URL: file servers redirect /index.html to ./
  const src = path === "index.html" ? scope : abs(path);
  const res = await fetch(`${src}?v=${hash}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  // A rebuilt response: not marked as redirected (a redirected one cannot answer a
  // navigation) and without the transfer headers of the original.
  const headers = { "content-type": res.headers.get("content-type") || "application/octet-stream" };
  if (!res.body) {
    const blob = await res.blob();
    await cache.put(abs(path), new Response(blob, { headers }));
    onBytes(blob.size);
    return;
  }
  const [store, count] = res.body.tee();
  const counting = (async () => {
    const r = count.getReader();
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      onBytes(value.byteLength);
    }
  })();
  await Promise.all([cache.put(abs(path), new Response(store, { headers })), counting]);
}

async function cachedPaths(cache) {
  const have = new Set((await cache.keys()).map((r) => r.url.split("?")[0]));
  return new Set(FILES.map((f) => f[0]).filter((p) => have.has(abs(p))));
}

async function status() {
  const cache = await caches.open(SHELL);
  const have = await cachedPaths(cache);
  let pdfs = 0;
  try { pdfs = (await (await caches.open(PDFS)).keys()).length; } catch {}
  const files = FILES.map(([p, , b]) => [p, b || 0, have.has(p)]);
  return {
    prep: "status", version: VERSION, total: FILES.length, cached: have.size,
    bytes: files.reduce((s, f) => s + (f[2] ? f[1] : 0), 0), totalBytes: TOTAL_BYTES, files, pdfs,
  };
}

// Download every file in `todo` with four parallel workers; reused files count at once.
async function run(phase, todo, reuse) {
  const cache = await caches.open(SHELL);
  const t = tracker(phase);
  t.st.done = FILES.length - todo.length;
  t.st.bytes = FILES.filter((f) => !todo.includes(f)).reduce((s, f) => s + (f[2] || 0), 0);
  t.post(true);
  const queue = todo.slice();
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const [path, hash, size] = f;
      const old = reuse ? await reuse(path, hash) : null;
      if (old === true) {
        t.st.bytes += size || 0; // already in this cache (a resumed install)
      } else if (old) {
        await cache.put(abs(path), old);
        t.st.bytes += size || 0;
      } else {
        t.st.file = path;
        let got = 0;
        await download(cache, path, hash, (n) => { got += n; t.st.bytes += n; t.post(); });
        // The server's byte count can differ from the build's (compression); keep totals exact.
        t.st.bytes += (size || 0) - got;
      }
      t.st.done += 1;
      t.post();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  t.st.file = "";
  t.post(true);
  return cache;
}

self.addEventListener("message", (e) => {
  const m = e.data || {};
  if (m.prep === "status") e.waitUntil(status().then((s) => e.source?.postMessage(s)));
  if (m.prep === "fill") e.waitUntil(fill());
});

let filling = null;
function fill() {
  filling ||= (async () => {
    try {
      const have = await cachedPaths(await caches.open(SHELL));
      const todo = FILES.filter((f) => !have.has(f[0]));
      if (todo.length) await run("fill", todo, null);
      await broadcast({ ...(await status()), checked: true, fetched: todo.length });
    } catch (err) {
      await broadcast({ prep: "error", phase: "fill", message: String(err?.message || err) });
    } finally {
      filling = null;
    }
  })();
  return filling;
}

self.addEventListener("install", (e) => e.waitUntil(install()));
async function install() {
  let oldCache = null;
  let oldMan = {};
  for (const name of await caches.keys()) {
    if (!name.startsWith("prep-shell-") || name === SHELL) continue;
    const c = await caches.open(name);
    const r = await c.match(abs(MANIFEST));
    if (r) { oldCache = c; oldMan = await r.json(); }
  }
  // A cache entry exists only once its download completed, so files already in this
  // version's cache (from an interrupted earlier attempt) are kept: a retry resumes.
  const own = await caches.open(SHELL);
  const reuse = async (path, hash) => {
    if (await own.match(abs(path))) return true;
    return oldCache && oldMan[path] === hash ? (await oldCache.match(abs(path))) || null : null;
  };
  try {
    const cache = await run("install", FILES.slice(), reuse);
    const man = Object.fromEntries(FILES.map(([p, h]) => [p, h]));
    await cache.put(abs(MANIFEST), new Response(JSON.stringify(man), { headers: { "content-type": "application/json" } }));
  } catch (err) {
    await broadcast({ prep: "error", phase: "install", message: String(err?.message || err) });
    throw err;
  }
  await self.skipWaiting();
}

self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("prep-") && k !== SHELL && k !== PDFS) await caches.delete(k);
  await self.clients.claim();
  await broadcast(await status());
})()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(scope)) return;
  const url = new URL(req.url);
  const path = url.href.slice(scope.length).split(/[?#]/)[0];
  if (path.startsWith("pdf/")) { e.respondWith(pdf(url.origin + url.pathname)); return; }
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const key = path === "" ? abs("index.html") : abs(path);
    return (await cache.match(key)) || fetch(req);
  })());
});

async function pdf(key) {
  const c = await caches.open(PDFS);
  const hit = await c.match(key);
  if (hit) return hit;
  const res = await fetch(key);
  if (res.ok) await c.put(key, res.clone());
  return res;
}
