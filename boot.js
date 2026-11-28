// Public build only (tools/build-public.mjs): password gate and decryption.
// Every data file is gzip + AES-256-GCM (12-byte IV prepended). The key is derived from
// the password with PBKDF2-SHA-256 (salt and iterations in data/key.json) and kept on this
// device after the first unlock, so the app opens offline without asking again.
(() => {
  const SCRIPTS = ["viz.js", "viz2.js", "viz3.js", "viz4.js", "viz5.js", "viz6.js", "viz7.js", "viz8.js", "viz9.js", "viz3d.js", "rob3d.js", "viz10.js", "viz11.js", "viz12.js", "viz13.js", "viz14.js", "ink.js", "roadmap.js", "app.js"];
  const STORE = "prep-site-key";
  const zh = !/^en/i.test(navigator.language || "") || (localStorage.getItem("prep-state") || "").includes('"lang":"zh"');
  const T = zh
    ? { title: "AI 面试备考", sub: "私人学习资料，内容已加密。", pw: "密码", go: "解锁", bad: "密码不对。", busy: "正在解密……", net: "第一次打开需要联网。", note: "密码只在本机用来解密，不会发送到任何地方。" }
    : { title: "AI Interview Prep", sub: "Private study notes; the content is encrypted.", pw: "Password", go: "Unlock", bad: "Wrong password.", busy: "Decrypting…", net: "The first launch needs a network connection.", note: "The password is used only on this device to decrypt; it is never sent anywhere." };
  const hex = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
  const b64 = (u8) => btoa(String.fromCharCode(...u8));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  let meta = null;
  let key = null;

  async function getMeta() { return (meta ||= await (await fetch("data/key.json")).json()); }
  async function derive(pw) {
    const m = await getMeta();
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: hex(m.salt), iterations: m.iter }, base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
  }
  async function decrypt(name, k = key) {
    const r = await fetch(`data/${name}.bin`);
    if (!r.ok) throw new Error(`data/${name}.bin: HTTP ${r.status}`);
    const buf = new Uint8Array(await r.arrayBuffer());
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, k, buf.slice(12));
    return new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  }
  const run = (code) => { const s = document.createElement("script"); s.textContent = code; document.head.appendChild(s); s.remove(); };
  const load = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.body.appendChild(s); });

  window.PREP_PUBLIC = true;
  window.PREP_SCRIPT = async (name) => run(await decrypt(name));
  window.PREP_LOCK = () => { try { localStorage.removeItem(STORE); } catch {} location.reload(); };

  async function start(k) {
    const index = await decrypt("index", k); // throws on a wrong key (GCM tag)
    key = k;
    run(index);
    run(await decrypt("library"));
    for (const s of SCRIPTS) await load(s);
    document.getElementById("gate")?.remove();
  }

  function gate(msg) {
    let g = document.getElementById("gate");
    if (!g) {
      g = document.createElement("div");
      g.id = "gate";
      g.innerHTML = `<form><img src="apple-touch-icon.png" alt=""><h1>${T.title}</h1><p>${T.sub}</p>
        <input type="password" autocomplete="current-password" placeholder="${T.pw}" required>
        <button type="submit">${T.go}</button><p class="msg"></p><p class="note">${T.note}</p></form>`;
      document.body.appendChild(g);
      const f = g.querySelector("form");
      f.onsubmit = async (e) => {
        e.preventDefault();
        const pw = f.querySelector("input").value;
        const out = f.querySelector(".msg");
        out.textContent = T.busy;
        try {
          const k = await derive(pw);
          await start(k);
          const m = await getMeta();
          try { localStorage.setItem(STORE, JSON.stringify({ salt: m.salt, k: b64(new Uint8Array(await crypto.subtle.exportKey("raw", k))) })); } catch {}
        } catch (err) {
          out.textContent = err && err.name === "OperationError" ? T.bad : navigator.onLine === false ? T.net : String((err && err.message) || err);
        }
      };
      setTimeout(() => f.querySelector("input").focus(), 50);
    }
    if (msg) g.querySelector(".msg").textContent = msg;
  }

  (async () => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE) || "null"); } catch {}
    if (saved) {
      try {
        const m = await getMeta();
        if (m.salt === saved.salt) {
          await start(await crypto.subtle.importKey("raw", unb64(saved.k), "AES-GCM", true, ["decrypt"]));
          return;
        }
      } catch {}
    }
    gate();
  })();
})();
