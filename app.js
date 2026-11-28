"use strict";
// AI Interview Prep — offline course app. Data: data/index.js (outline of all topics),
// data/<topic>.js (full rendered content, loaded on demand). Progress is stored by the
// native shell (window.webkit.messageHandlers.store) with localStorage as a backup.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const DAY = 864e5;
  const INDEX = window.PREP_INDEX || { built: null, topics: [] };
  const COLORS = { linalg: "#5b4bdb", ml: "#0b7fab", rl: "#1f8354", llm: "#c25e00", "llm-sys": "#c2185b", robot: "#0056d2", papers: "#6b3fa0", algo: "#00796b" };

  // ------------------------------------------------------------------ i18n
  const UI = {
    en: {
      app: "AI Interview Prep", home: "Home", review: "Review", drill: "Flashcards", mock: "Mock interview", coverage: "Coverage", saved: "Saved", library: "Library", libIntro: "The original books and papers this course is built on. Tap one to read it; references inside answers open the exact page.", cited: "cited", pagesN: (n) => `${n} pages`, openInApp: "The original opens in the iPad app.", offlineData: "Offline data", offlineReady: (mb) => `All course content is saved on this device${mb ? ` (${mb} MB)` : ""} and works without a network.`, offlineProgress: (d, n) => `Downloading offline data: ${d} / ${n} files…`, offlineNone: "Not saved on this device yet. Download it once and the app works offline.", offlineNoSW: "Offline saving needs the HTTPS web version opened in Safari.", downloadAll: "Download everything", checkUpdate: "Check for updates", offStored: (b, tb, f, tf) => `Stored on this device: ${b} of ${tb} MB (${f} of ${tf} files).`, offStoredFiles: (f, tf) => `Stored on this device: ${f} of ${tf} files.`, offAll: "Everything is saved — the app works without a network.", offMissing: (n) => `${n} file(s) not saved yet — tap the button to download them.`, offNew: "A new version is downloading.", offDl: (file, pct, b, tb, f, tf) => `Downloading${file ? ` ${file}` : ""} — ${pct}% · ${b} / ${tb} MB · ${f} / ${tf} files`, offChecking: "Checking for updates…", offBusy: "Downloading…", offUpToDate: (n, mb) => `Up to date: all ${n} files are on this device (${mb} MB).`, offRepaired: (n) => `Downloaded ${n} missing file(s).`, offUpdated: "The new version is saved. Tap Reload to use it.", offNoCheck: "Could not reach the server to check for updates; what is saved here is complete.", offFail: "Download stopped: the server could not be reached. What is saved still works; connect (Tailscale on for the private version) and tap again — it resumes where it stopped.", offDetails: (n, m) => `Per course: ${n} of ${m} saved`, offShell: "App, figures and fonts", offIndex: "Course index and library list", offVersion: (v, built) => `Version ${v} · content built ${built}`, offUsage: (mb, q, pers) => `The browser's own estimate for this site: ${mb} MB${q ? ` of ${q} GB allowed` : ""} (it also counts saved PDFs and space from old versions not yet reclaimed). Persistent storage: ${pers}.`, persistOn: "on (the browser will not clear it by itself)", persistOff: "off (add the app to the Home Screen so Safari keeps it)", persistUnknown: "unknown", installHint: "Safari → Share → Add to Home Screen: it then opens like an app and works offline.", lockBtn: "Lock", lockSub: "Forget the password on this device; it is asked again next time.", publicNoPdf: "The public version carries no PDFs; the original source opens online.", noUrl: "No online link for this original.", offlineLib: "Offline originals", offlineLibSub: (n, t, mb) => `${n} of ${t} saved on this device${mb ? ` · ${mb} MB used` : ""}. An original is also saved the first time you open it.`, saveAll: "Save all originals", saving: (i, t) => `Saving ${i} / ${t}…`, saveDone: "All originals are saved for offline reading.", saveFail: (n) => `${n} could not be downloaded — connect (with Tailscale on) and try again.`, stop: "Stop", backup: "Backup", backupSub: "Your ratings, stars, typed notes and handwriting. Export before switching devices or apps; import on the other side.", exportBtn: "Export", importBtn: "Import", copyBtn: "Copy", copied: "Copied to the clipboard.", importQ: (n) => `Replace your progress and notes with this backup (${n} rated items)?`, importBad: "This file is not a backup from this app.", imported: "Backup imported.", updated: "A new version is ready.", reloadBtn: "Reload", libFilter: "Filter by title, author or year…", otherDocs: "Other",
      searchPh: "What do you want to review?", settings: "Settings", welcome: "Welcome back", myCourses: "My courses",
      resume: "Resume", start: "Start", continue: "Continue where you left off", goal: "Daily goal", goalOf: (a, b) => `${a} of ${b} items today`,
      stats: "Your progress", qTotal: "Questions", practised: "Practised", mastered: "Mastered", due: "Due for review", streak: "Days studied",
      courseMaterial: "Course material", notation: "Notation", courseCov: "Coverage & gaps", practiseCourse: "Practise this course",
      chapters: "chapters", items: "items", min: "min", h: "h", reading: "Reading", practice: "Practice", primer: "Chapter primer",
      objectives: "What you'll learn", prereqs: "Prerequisites", chapterN: (n) => `Chapter ${n}`, done: "completed",
      kind: { concept: "Concept", derivation: "Derivation", coding: "Live coding", design: "Design", compare: "Compare", paper: "Paper", behavioral: "Behavioural", exercise: "Exercise" },
      diff: ["", "Fundamental", "Standard", "Advanced"], freq: { high: "Asked often", medium: "Asked sometimes", low: "Rare" },
      mod: { basics: "Foundations from zero", interview: "Interview questions", coding: "Live coding", frontier: "SOTA research · engineering · R&D", deploy: "Real-world deployment" },
      exSec: { question: "Exercise", approach: "Hints (try first; open one at a time)", steps: "Worked solution, step by step", answer: "Final answer & how to check it", pitfalls: "Common mistakes" }, exThink: "Try it on paper first. Stuck? Open the hints, then the worked solution.", exHint: "Show hints",
      sec: { question: "Question", approach: "Thinking it through (思路精讲)", short: "30-second answer", steps: "Step-by-step walkthrough", answer: "Full answer", intuition: "Core intuition", why: "Why it works / why it's asked", pitfalls: "Pitfalls & follow-ups", check: "Self-check", refs: "References", notes: "My notes" },
      think: "Think first, then compare with “Thinking it through”, then open the answer.", timer: "3-min timer", revealShort: "Show short answer", revealAll: "Expand all", collapseAll: "Collapse all",
      stepOf: (i, n) => `Step ${i} of ${n}`, nextStep: "Next step", prevStep: "Back", allSteps: "Show all steps", steps: "steps", vizN: (n) => `${n} interactive figure${n > 1 ? "s" : ""}`,
      rateQ: "How well did you know it?", rateSub: "Your answer schedules the next review.", r: ["Again", "Hard", "Good", "Easy"],
      nextItem: "Go to next item", prevItem: "Previous", markDone: "Mark as completed", completed: "Completed", nextDue: "next review in",
      notesPh: "Your own summary, a mnemonic, what you got wrong…", showAnswer: "Show answer",
      fallbackZh: "The Chinese version of this item isn't written yet — showing English.", fallbackEn: "The English version of this item isn't written yet — showing Chinese.",
      loading: "Loading…", noContent: "No content has been built yet.", none: "Nothing here yet.", menu: "Course menu",
      reviewIntro: "Spaced repetition: rated items come back when due; new items join in study order.", modeDue: "Due + new", modeWeak: "Weak spots", modeRandom: "Random 20",
      topics: "Courses", newPer: "New items per session", sessionDone: "Session complete", sessionStats: (n, a) => `${n} reviewed · ${a} marked Again`,
      drillIntro: "Quick recall cards from every self-check. Tap the card to flip it.", tapFlip: "Tap to show the answer", gotIt: "Got it", missed: "Missed", cards: "cards",
      mockIntro: "Random questions weighted toward frequently asked ones. Answer out loud before time runs out, then compare.", count: "Questions", minutes: "Minutes each", timeUp: "Time's up — compare with the answer.", finish: "Finish",
      bookmarks: "Starred", withNotes: "With notes", myNotes: "My notes", noteText: "Typed", noteInk: "Handwriting", pen: "Pen", eraser: "Eraser", undo: "Undo", clearAll: "Clear", clearQ: "Erase this handwritten page?", inkHint: "Write with Apple Pencil (your palm is ignored); a finger draws only until a Pencil is used.", notesFor: "Notes for", primerNote: "Primer", weak: "Weak spots (Again / Hard)",
      results: "results", lang: "Content language", theme: "Theme", themes: { system: "System", light: "Light", dark: "Dark", sepia: "Sepia" }, textSize: "Text size",
      practiceMode: "Practice mode", practiceSub: "Keep answers folded until you open them", dailyGoal: "Daily goal", reset: "Reset all progress", resetQ: "Erase all ratings, notes and stars? This cannot be undone.", built: "Content built",
      covTitle: "Coverage & gaps", covIntro: "What interviewers asked in the last 12 months (forum reports) and which textbook chapters are covered — gaps first.", intel: "Interview reports", syllabus: "Textbook & course coverage",
      covered: "Covered", partial: "Partial", gap: "Gap", all: "All", liveCoding: "live-coding prompts", reports: "reports", sources: "Sources", coveredBy: "Covered by", noIntel: "No interview reports collected yet for this course.", noSyl: "No textbook map yet for this course.",
      statusOf: { covered: "Covered", partial: "Partial", missing: "Missing" }, searched: "Searched",
    },
    zh: {
      app: "AI 面试备考", home: "首页", review: "复习", drill: "闪卡", mock: "模拟面试", coverage: "覆盖度", saved: "收藏", library: "资料库", libIntro: "本课程依据的原版教材与论文。点击即可阅读；答案里的引用会直接打开对应页。", cited: "已引用", pagesN: (n) => `${n} 页`, openInApp: "原文需要在 iPad app 里打开。", offlineData: "离线数据", offlineReady: (mb) => `全部课程内容已存到本机${mb ? `（${mb} MB）` : ""}，断网也能用。`, offlineProgress: (d, n) => `正在下载离线数据：${d} / ${n} 个文件……`, offlineNone: "还没有存到本机。下载一次，之后断网也能用。", offlineNoSW: "离线保存需要在 Safari 里打开 HTTPS 网页版。", downloadAll: "下载全部离线数据", checkUpdate: "检查更新", offStored: (b, tb, f, tf) => `已存到本机：${b} / ${tb} MB（${f} / ${tf} 个文件）。`, offStoredFiles: (f, tf) => `已存到本机：${f} / ${tf} 个文件。`, offAll: "全部内容已存到本机，断网也能用。", offMissing: (n) => `还有 ${n} 个文件没有存到本机，点按钮下载。`, offNew: "正在下载新版本。", offDl: (file, pct, b, tb, f, tf) => `正在下载${file ? ` ${file}` : ""}——${pct}% · ${b} / ${tb} MB · ${f} / ${tf} 个文件`, offChecking: "正在检查更新……", offBusy: "下载中……", offUpToDate: (n, mb) => `已是最新版本：${n} 个文件全部在本机（${mb} MB）。`, offRepaired: (n) => `已补下载 ${n} 个缺失的文件。`, offUpdated: "新版本已存好，点“刷新”即可使用。", offNoCheck: "连不上服务器，无法检查更新；本机已存的内容是完整的。", offFail: "下载中断：连不上服务器。已存的内容照常可用；联网后（私有版需打开 Tailscale）再点一次，会从断点继续。", offDetails: (n, m) => `各课程明细：已存 ${n} / ${m} 项`, offShell: "应用界面、图表与字体", offIndex: "课程目录与资料库列表", offVersion: (v, built) => `版本 ${v} · 内容构建于 ${built}`, offUsage: (mb, q, pers) => `浏览器估计本站共占用 ${mb} MB${q ? `（上限 ${q} GB）` : ""}，其中也算上了已保存的原文 PDF 和尚未回收的旧版本空间。持久存储：${pers}。`, persistOn: "已开启（浏览器不会自行清除）", persistOff: "未开启（添加到主屏幕后 Safari 才会长期保留）", persistUnknown: "未知", installHint: "Safari → 分享 → 添加到主屏幕：之后像 app 一样打开，断网也能用。", lockBtn: "锁定", lockSub: "在本机清除密码；下次打开需要重新输入。", publicNoPdf: "公开版不附带原文 PDF，会在线打开原始来源。", noUrl: "这份原文没有在线链接。", offlineLib: "离线原文", offlineLibSub: (n, t, mb) => `本机已保存 ${n} / ${t} 份${mb ? ` · 已用 ${mb} MB` : ""}。打开过一次的原文也会自动保存。`, saveAll: "保存全部原文", saving: (i, t) => `正在保存 ${i} / ${t}……`, saveDone: "全部原文已保存，可以离线阅读。", saveFail: (n) => `有 ${n} 份没有下载成功——联网并打开 Tailscale 后再试一次。`, stop: "停止", backup: "备份", backupSub: "你的评分、收藏、文字笔记和手写笔记。换设备或换 app 前先导出，在另一边导入。", exportBtn: "导出", importBtn: "导入", copyBtn: "复制", copied: "已复制到剪贴板。", importQ: (n) => `用这份备份替换当前的进度和笔记（${n} 道已评分）？`, importBad: "这个文件不是本 app 的备份。", imported: "备份已导入。", updated: "新版本已就绪。", reloadBtn: "刷新", libFilter: "按书名、作者或年份筛选……", otherDocs: "其他",
      searchPh: "你想复习什么？", settings: "设置", welcome: "欢迎回来", myCourses: "我的课程",
      resume: "继续", start: "开始", continue: "从上次离开的地方继续", goal: "每日目标", goalOf: (a, b) => `今天已完成 ${a} / ${b} 项`,
      stats: "学习进度", qTotal: "题目", practised: "已练习", mastered: "已掌握", due: "待复习", streak: "学习天数",
      courseMaterial: "课程资料", notation: "符号约定", courseCov: "覆盖度与缺口", practiseCourse: "练习本课程",
      chapters: "章", items: "项", min: "分钟", h: "小时", reading: "阅读", practice: "练习", primer: "本章导读",
      objectives: "学习目标", prereqs: "先修知识", chapterN: (n) => `第 ${n} 章`, done: "已完成",
      kind: { concept: "概念题", derivation: "推导题", coding: "Live Coding", design: "设计题", compare: "对比题", paper: "论文题", behavioral: "行为题", exercise: "习题" },
      diff: ["", "基础", "标准", "进阶"], freq: { high: "高频", medium: "中频", low: "低频" },
      mod: { basics: "零基础入门", interview: "面试问题", coding: "Live Coding", frontier: "SOTA 研究 · 工程方向 · 前沿研发", deploy: "真实系统部署" },
      exSec: { question: "习题", approach: "提示（先自己做，卡住再看）", steps: "分步解答", answer: "最终答案与验算方法", pitfalls: "常见错误" }, exThink: "先在纸上自己做。卡住了先看提示，再看分步解答。", exHint: "看提示",
      sec: { question: "题目", approach: "思路精讲", short: "30 秒回答", steps: "逐步讲解", answer: "完整解答", intuition: "核心直觉", why: "原因与解释", pitfalls: "易错点与追问", check: "自测", refs: "参考文献", notes: "我的笔记" },
      think: "先自己想，再对照「思路精讲」，最后看答案。", timer: "3 分钟计时", revealShort: "显示简答", revealAll: "全部展开", collapseAll: "全部收起",
      stepOf: (i, n) => `第 ${i} / ${n} 步`, nextStep: "下一步", prevStep: "上一步", allSteps: "显示全部步骤", steps: "步", vizN: (n) => `${n} 个交互图`,
      rateQ: "你掌握得怎么样？", rateSub: "你的选择决定下次复习的时间。", r: ["不会", "模糊", "会", "熟练"],
      nextItem: "前往下一项", prevItem: "上一项", markDone: "标记为已完成", completed: "已完成", nextDue: "下次复习",
      notesPh: "写下你自己的总结、记忆点或答错的地方……", showAnswer: "显示答案",
      fallbackZh: "这道题的中文版还没写好，暂时显示英文。", fallbackEn: "这道题的英文版还没写好，暂时显示中文。",
      loading: "加载中……", noContent: "还没有构建任何内容。", none: "这里还没有内容。", menu: "课程目录",
      reviewIntro: "间隔重复：评过分的题到期会回来；新题按学习顺序加入。", modeDue: "到期 + 新题", modeWeak: "薄弱题", modeRandom: "随机 20 题",
      topics: "课程", newPer: "每轮新题数", sessionDone: "本轮完成", sessionStats: (n, a) => `复习 ${n} 题 · ${a} 题标为不会`,
      drillIntro: "来自每道题自测部分的快速回忆卡片。点击卡片翻面。", tapFlip: "点击显示答案", gotIt: "记住了", missed: "没记住", cards: "张",
      mockIntro: "随机抽题（高频题权重更高）。在倒计时结束前出声作答，然后对照答案。", count: "题数", minutes: "每题分钟", timeUp: "时间到——对照答案看看。", finish: "结束",
      bookmarks: "已收藏", withNotes: "有笔记", myNotes: "我的笔记", noteText: "文字", noteInk: "手写", pen: "笔", eraser: "橡皮", undo: "撤销", clearAll: "清空", clearQ: "清空这一页手写笔记？", inkHint: "用 Apple Pencil 书写（会忽略手掌）；用过 Pencil 之后手指不再画线。", notesFor: "笔记：", primerNote: "导读", weak: "薄弱题（不会 / 模糊）",
      results: "条结果", lang: "内容语言", theme: "主题", themes: { system: "跟随系统", light: "浅色", dark: "深色", sepia: "护眼" }, textSize: "字号",
      practiceMode: "练习模式", practiceSub: "答案默认折叠，点开才显示", dailyGoal: "每日目标", reset: "重置所有进度", resetQ: "清除所有评分、笔记和收藏？此操作无法撤销。", built: "内容构建时间",
      covTitle: "覆盖度与缺口", covIntro: "过去 12 个月面试真题（论坛面经）与教材章节的覆盖情况——缺口排在最前。", intel: "面经真题", syllabus: "教材与课程覆盖",
      covered: "已覆盖", partial: "部分覆盖", gap: "缺口", all: "全部", liveCoding: "道 live coding 题", reports: "次报告", sources: "来源", coveredBy: "对应内容", noIntel: "这门课还没有收集面经。", noSyl: "这门课还没有教材对照表。",
      statusOf: { covered: "已覆盖", partial: "部分", missing: "缺失" }, searched: "已检索",
    },
  };
  const SEC_ORDER = ["approach", "short", "steps", "answer", "intuition", "why", "pitfalls", "check", "refs"];
  const MOD_ORDER = ["basics", "interview", "coding", "frontier", "deploy"];
  const modOf = (c) => c.module || "interview";

  // ------------------------------------------------------------------ icons
  const ICON = {
    reading: '<svg viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 015.5 4H11v15H5.5A1.5 1.5 0 014 17.5zM20 5.5A1.5 1.5 0 0018.5 4H13v15h5.5a1.5 1.5 0 001.5-1.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    concept: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0012 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    exercise: '<svg viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3M4 4h7M4 8h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    derivation: '<svg viewBox="0 0 24 24"><path d="M17 5H7l6 7-6 7h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    coding: '<svg viewBox="0 0 24 24"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    design: '<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    compare: '<svg viewBox="0 0 24 24"><path d="M12 3v18M5 7h14M5 7l-3 6h6zM19 7l-3 6h6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    paper: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    short: '<svg viewBox="0 0 24 24"><path d="M13 3L5 14h6l-1 7 8-11h-6z" fill="currentColor"/></svg>',
    steps: '<svg viewBox="0 0 24 24"><path d="M4 18h5v-5h5V8h5V4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    answer: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    approach: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 8.5l-2 5-5 2 2-5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    intuition: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0012 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    why: '<svg viewBox="0 0 24 24"><path d="M9 9a3 3 0 115 2.2c-1 .8-2 1.5-2 2.8M12 18h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    pitfalls: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3zM12 10v4M12 17h.01" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 12l3 3 5-6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    refs: '<svg viewBox="0 0 24 24"><path d="M5 4h4v16H5zM10 4h4v16h-4zM15.5 5l3.5-1 3 15-3.6 1z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    notes: '<svg viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 8v4l3 2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    star: (on) => `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3.5l2.6 5.5 6 .7-4.5 4.1 1.2 5.9L12 16.8l-5.3 2.9 1.2-5.9-4.5-4.1 6-.7z" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
    menu: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };
  const ck = (st) => `<svg class="ck ${st}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" stroke-width="1.6"/><path d="M7.5 12.3l3 3 6-6.3" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // ------------------------------------------------------------------ state
  const DEFAULT = { v: 2, lang: "zh", theme: "system", fs: 17, practice: true, newPer: 10, goal: 10, sel: null, progress: {}, primers: {}, marks: {}, notes: {}, cards: {}, last: null, days: {} };
  function loadState() {
    let raw = null;
    try { raw = window.__PREP_SAVED__ || null; } catch {}
    if (!raw) try { raw = localStorage.getItem("prep-state"); } catch {}
    try { return Object.assign(JSON.parse(JSON.stringify(DEFAULT)), raw ? JSON.parse(raw) : {}); } catch { return JSON.parse(JSON.stringify(DEFAULT)); }
  }
  const S = loadState();
  // Native iPad app (WKWebView with the Swift bridge) vs. the web build in a browser.
  const NATIVE = !!window.webkit?.messageHandlers?.store;
  let saveTimer = null;
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    const s = JSON.stringify(S);
    try { window.webkit?.messageHandlers?.store?.postMessage(s); } catch {}
    try { localStorage.setItem("prep-state", s); } catch {}
  }
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 300); };
  document.addEventListener("visibilitychange", () => { if (document.hidden && saveTimer) flush(); });
  window.addEventListener("pagehide", () => { if (saveTimer) flush(); });
  const t = () => UI[S.lang] || UI.en;
  const pick = (o) => (o ? o[S.lang] ?? o.en ?? o.zh ?? "" : "");

  // ------------------------------------------------------------------ index
  const TOPICS = INDEX.topics || [];
  const TOPIC = {}, ITEM = {}, SEQ = {};
  for (const tp of TOPICS) {
    TOPIC[tp.id] = tp;
    tp.items = [];
    // Study sequence: chapters in module order, primer first, then items.
    const chs = MOD_ORDER.flatMap((m) => tp.chapters.filter((c) => modOf(c) === m));
    tp.ordered = chs;
    SEQ[tp.id] = [];
    chs.forEach((c, ci) => {
      if (c.primer.en || c.primer.zh) SEQ[tp.id].push(`p/${tp.id}/${c.id}`);
      c.items.forEach((it, ii) => { ITEM[it.id] = { topic: tp, chapter: c, item: it, ci, ii }; tp.items.push(it.id); SEQ[tp.id].push(`q/${it.id}`); });
    });
  }
  const ALL = TOPICS.flatMap((tp) => tp.items);
  if (!S.sel) S.sel = TOPICS.map((x) => x.id);

  const FULL = {}, FULL_ITEM = {}, waiting = {};
  window.PREP = {
    add(d) {
      FULL[d.id] = d;
      for (const c of d.chapters) for (const it of c.items) FULL_ITEM[it.id] = it;
      (waiting[d.id] || []).forEach((f) => f(d)); delete waiting[d.id];
    },
  };
  function loadTopic(id) {
    if (FULL[id]) return Promise.resolve(FULL[id]);
    return new Promise((res, rej) => {
      const first = !waiting[id];
      (waiting[id] ||= []).push(res);
      if (!first) return;
      if (window.PREP_SCRIPT) { window.PREP_SCRIPT(id).catch(() => rej(new Error("cannot load " + id))); return; }
      const s = document.createElement("script");
      s.src = `data/${id}.js`;
      s.onerror = () => rej(new Error("cannot load " + id));
      document.head.appendChild(s);
    });
  }
  const fullChapter = (tid, cid) => FULL[tid]?.chapters.find((c) => c.id === cid);

  // ------------------------------------------------------------------ progress
  const STATUS = ["again", "hard", "good", "easy"];
  const status = (id) => { const p = S.progress[id]; return p ? STATUS[p.r] : "new"; };
  function schedule(p, r, now) {
    const q = { n: (p?.n || 0) + 1, ivl: p?.ivl || 0, ease: p?.ease || 2.5, lapses: p?.lapses || 0, r, t: now };
    if (r === 0) { q.ivl = 0; q.ease = Math.max(1.3, q.ease - 0.2); q.lapses++; q.due = now + 10 * 60e3; }
    else if (r === 1) { q.ivl = Math.max(1, q.ivl * 1.2); q.ease = Math.max(1.3, q.ease - 0.15); q.due = now + q.ivl * DAY; }
    else if (r === 2) { q.ivl = q.ivl < 1 ? 1 : q.ivl < 3 ? 3 : q.ivl * q.ease; q.due = now + q.ivl * DAY; }
    else { q.ivl = q.ivl < 1 ? 4 : q.ivl * q.ease * 1.3; q.ease += 0.15; q.due = now + q.ivl * DAY; }
    return q;
  }
  const fmtIvl = (ms) => (ms < DAY ? `${Math.max(1, Math.round(ms / 60e3))} ${t().min}` : `${Math.round((ms / DAY) * 10) / 10} d`);
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const bump = () => { S.days[todayKey()] = (S.days[todayKey()] || 0) + 1; };
  function rate(id, r) { S.progress[id] = schedule(S.progress[id], r, Date.now()); bump(); save(); }
  const isDue = (id) => { const p = S.progress[id]; return p && p.due <= Date.now(); };
  const known = (id) => { const p = S.progress[id]; return !!p && p.r >= 2; };
  const mastered = (id) => { const p = S.progress[id]; return !!p && (p.r === 3 || (p.r === 2 && p.ivl >= 3)); };
  const ckState = (id) => { const p = S.progress[id]; return !p ? "todo" : p.r >= 2 ? "done" : "part"; };
  const primerDone = (tid, cid) => !!S.primers[`${tid}/${cid}`];
  const chapterUnits = (tid, c) => (c.primer.en || c.primer.zh ? 1 : 0) + c.items.length;
  const chapterDone = (tid, c) => (c.primer.en || c.primer.zh ? (primerDone(tid, c.id) ? 1 : 0) : 0) + c.items.filter((x) => known(x.id)).length;
  const topicPct = (tp) => { const u = tp.chapters.reduce((a, c) => a + chapterUnits(tp.id, c), 0); return u ? Math.round((100 * tp.chapters.reduce((a, c) => a + chapterDone(tp.id, c), 0)) / u) : 0; };
  const fmtMin = (m) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10} ${t().h}` : `${m} ${t().min}`);

  // ------------------------------------------------------------------ theme & chrome
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  function applyTheme() {
    document.documentElement.dataset.theme = S.theme === "system" ? (mq.matches ? "dark" : "light") : S.theme;
    document.documentElement.style.setProperty("--fs", S.fs + "px");
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
  }
  mq.addEventListener?.("change", () => { applyTheme(); window.Viz?.remountAll(main); });
  const main = $("#main");
  let timerId = null;
  function chrome(tab) {
    $$("[data-tab]").forEach((a) => { const lbl = t()[a.dataset.tab]; (a.querySelector("span") || a).textContent = lbl; a.classList.toggle("on", a.dataset.tab === tab); });
    $("#btn-lang").textContent = S.lang === "zh" ? "EN" : "中";
    $("#search-input").placeholder = t().searchPh;
    document.title = t().app;
  }
  $("#btn-lang").onclick = () => { S.lang = S.lang === "zh" ? "en" : "zh"; save(); applyTheme(); render(true); };
  $("#btn-settings").onclick = () => (location.hash = "#/settings");
  $("#search-form").onsubmit = (e) => { e.preventDefault(); const q = $("#search-input").value.trim(); location.hash = "#/search/" + encodeURIComponent(q); };

  const scroller = () => $(".ccontent", main) || main;
  const titleOf = (it) => pick(it.title) || it.id;
  const kindIcon = (k) => ICON[k] || ICON.concept;

  // ------------------------------------------------------------------ course layout
  function banner(tid) {
    const c = COLORS[tid] || "#0056d2";
    let seed = [...tid].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
    const r = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    let shapes = "";
    for (let i = 0; i < 7; i++) shapes += `<circle cx="${(r() * 320).toFixed(0)}" cy="${(r() * 120).toFixed(0)}" r="${(18 + r() * 60).toFixed(0)}" fill="#fff" fill-opacity="${(0.06 + r() * 0.1).toFixed(2)}"/>`;
    for (let i = 0; i < 5; i++) shapes += `<path d="M${(r() * 320).toFixed(0)},120 L${(r() * 320).toFixed(0)},0" stroke="#fff" stroke-opacity=".12" stroke-width="${(1 + r() * 3).toFixed(1)}"/>`;
    return `<svg viewBox="0 0 320 120" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g-${tid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".72"/></linearGradient></defs><rect width="320" height="120" fill="url(#g-${tid})"/>${shapes}</svg>`;
  }
  function cnav(tp, cur) {
    const T = t();
    const curCh = cur?.chapter;
    let html = `<div class="ctitle"><a href="#/t/${tp.id}">${esc(pick(tp.title))}</a><div class="pbar"><i style="width:${topicPct(tp)}%"></i></div><div class="muted">${topicPct(tp)}% ${esc(T.done)}</div></div>`;
    let n = 0;
    for (const m of MOD_ORDER) {
      const chs = tp.chapters.filter((c) => modOf(c) === m);
      if (!chs.length) continue;
      html += `<div class="sec-h">${esc(T.mod[m])}</div>`;
      for (const c of chs) {
        n++;
        const all = chapterUnits(tp.id, c), dn = chapterDone(tp.id, c);
        const on = curCh === c.id;
        html += `<a class="nl ${on && cur.kind === "chapter" ? "on" : ""}" href="#/c/${tp.id}/${c.id}"><span class="n">${n}</span><span>${esc(pick(c.title))}</span><span class="ck-wrap">${all && dn === all ? ck("done") : ""}</span></a>`;
        if (on) {
          if (c.primer.en || c.primer.zh) html += `<a class="nl sub ${cur.kind === "primer" ? "on" : ""}" href="#/p/${tp.id}/${c.id}" style="padding-left:52px"><span>${esc(T.primer)}</span><span class="ck">${ck(primerDone(tp.id, c.id) ? "done" : "todo")}</span></a>`;
          for (const it of c.items) html += `<a class="nl sub ${cur.kind === "item" && cur.id === it.id ? "on" : ""}" href="#/q/${it.id}" style="padding-left:52px;font-size:14.5px"><span>${esc(titleOf(it))}</span><span class="ck">${ck(ckState(it.id))}</span></a>`;
        }
      }
    }
    html += `<div class="sec-h">${esc(T.settings === "设置" ? "工具" : "Tools")}</div><div class="tools">`;
    if (tp.notation?.length) html += `<a class="nl ${cur?.kind === "notation" ? "on" : ""}" href="#/n/${tp.id}"><span class="n">∑</span><span>${esc(T.notation)}</span></a>`;
    html += `<a class="nl" href="#/coverage/${tp.id}"><span class="n">▤</span><span>${esc(T.courseCov)}</span></a></div>`;
    return html;
  }
  function course(tp, cur, inner) {
    main.innerHTML = `<div class="course" id="course"><aside class="cnav">${cnav(tp, cur)}</aside><div class="ccontent"><div class="wrap narrow">
      <button class="btn small nav-toggle" id="nav-toggle" style="margin-bottom:12px">${ICON.menu} ${esc(t().menu)}</button>${inner}</div></div></div>`;
    $("#nav-toggle").onclick = () => $("#course").classList.toggle("show-nav");
    const onEl = $(".cnav .nl.on", main);
    if (onEl) onEl.scrollIntoView({ block: "center" });
  }
  const crumbs = (parts) => `<div class="crumbs">${parts.map(([href, label], i) => (i ? '<span class="sep">›</span>' : "") + (href ? `<a href="${href}">${esc(label)}</a>` : `<span>${esc(label)}</span>`)).join("")}</div>`;

  // ------------------------------------------------------------------ home
  function viewHome() {
    const T = t();
    chrome("home");
    if (!TOPICS.length) { main.innerHTML = `<div class="wrap"><div class="empty">${esc(T.noContent)}</div></div>`; return; }
    const today = S.days[todayKey()] || 0;
    const C = 2 * Math.PI * 36, frac = Math.min(1, today / (S.goal || 10));
    let resume = "";
    const last = S.last;
    if (last) {
      const [kind, ...rest] = last.split("/");
      let title = "", sub = "";
      if (kind === "q" && ITEM[rest.join("/")]) { const r = ITEM[rest.join("/")]; title = titleOf(r.item); sub = `${pick(r.topic.title)} · ${pick(r.chapter.title)}`; }
      if (kind === "p" && TOPIC[rest[0]]) { const c = TOPIC[rest[0]].chapters.find((x) => x.id === rest[1]); if (c) { title = `${T.primer}: ${pick(c.title)}`; sub = pick(TOPIC[rest[0]].title); } }
      if (title) resume = `<div class="card resume"><div style="flex:1;min-width:0"><div class="k">${esc(T.continue)}</div><div class="t">${esc(title)}</div><div class="muted">${esc(sub)}</div></div><a class="btn primary" href="#/${last}">${esc(T.resume)}</a></div>`;
    }
    const days = Object.keys(S.days).length;
    main.innerHTML = `<div class="wrap">
      <div class="welcome"><h1>${esc(T.welcome)}</h1><span class="spacer"></span>${window.PrepMap ? `<a class="btn" href="#/map">${S.lang === "zh" ? "总览路线图" : "Roadmap"}</a>` : ""}<a class="btn" href="#/review">${esc(T.review)} · ${ALL.filter(isDue).length}</a></div>
      ${NATIVE ? "" : '<div class="card offdata" id="home-off"></div>'}
      <div class="home-grid"><div>
        ${resume}
        <h2 style="margin-top:0">${esc(T.myCourses)}</h2>
        <div class="courses">${TOPICS.map((tp) => {
          const mins = tp.chapters.reduce((a, c) => a + (c.pmin || 0) + c.items.reduce((b, x) => b + (x.min || 10), 0), 0);
          const pct = topicPct(tp);
          return `<a class="card course-card" href="#/t/${tp.id}"><div class="banner">${banner(tp.id)}<span class="badge">${tp.chapters.length} ${esc(T.chapters)} · ${tp.items.length} ${esc(T.items)}</span></div>
            <div class="cbody"><div class="k">${esc(fmtMin(mins))}</div><h3>${esc(pick(tp.title))}</h3><p>${esc(pick(tp.desc))}</p>
            <div class="foot"><div class="pbar ${pct === 100 ? "green" : ""}"><i style="width:${pct}%"></i></div><span>${pct}% ${esc(T.done)}</span></div></div></a>`;
        }).join("")}</div>
      </div><div>
        <div class="card side-card"><h3>${esc(T.goal)}</h3><div class="goal"><svg class="ring" viewBox="0 0 84 84"><circle class="bg" cx="42" cy="42" r="36"/><circle class="fg" cx="42" cy="42" r="36" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle" font-size="18" font-weight="700" fill="currentColor">${today}</text></svg><div>${esc(T.goalOf(today, S.goal || 10))}</div></div></div>
        <div class="card side-card"><h3>${esc(T.stats)}</h3><ul class="stat-list">
          <li><span>${esc(T.qTotal)}</span><b>${ALL.length}</b></li>
          <li><span>${esc(T.practised)}</span><b>${ALL.filter((id) => S.progress[id]).length}</b></li>
          <li><span>${esc(T.mastered)}</span><b>${ALL.filter(mastered).length}</b></li>
          <li><span>${esc(T.due)}</span><b>${ALL.filter(isDue).length}</b></li>
          <li><span>${esc(T.streak)}</span><b>${days}</b></li></ul></div>
        <p class="muted small">${esc(T.built)}: ${INDEX.built ? new Date(INDEX.built).toLocaleString() : "—"}</p>
      </div></div></div>`;
  }

  // ------------------------------------------------------------------ course home
  function viewCourse(tid) {
    const T = t();
    const tp = TOPIC[tid];
    if (!tp) return viewHome();
    chrome("home");
    const mins = tp.chapters.reduce((a, c) => a + (c.pmin || 0) + c.items.reduce((b, x) => b + (x.min || 10), 0), 0);
    const firstOpen = SEQ[tid].find((k) => (k.startsWith("p/") ? !S.primers[k.slice(2)] : !known(k.slice(2))));
    let n = 0;
    const blocks = MOD_ORDER.map((m) => {
      const chs = tp.chapters.filter((c) => modOf(c) === m);
      if (!chs.length) return "";
      return `<div class="mod-block"><div class="mh"><h2>${esc(T.mod[m])}</h2><span class="muted">${chs.length} ${esc(T.chapters)}</span></div><div class="card">${chs.map((c) => {
        n++;
        const all = chapterUnits(tid, c), dn = chapterDone(tid, c);
        const cm = (c.pmin || 0) + c.items.reduce((b, x) => b + (x.min || 10), 0);
        return `<a class="ch-row" href="#/c/${tid}/${c.id}"><span class="num ${all && dn === all ? "done" : ""}">${all && dn === all ? "✓" : n}</span><span class="info"><b>${esc(pick(c.title))}</b><span class="muted">${c.primer.en || c.primer.zh ? esc(T.reading) + " · " : ""}${c.items.length} ${esc(T.practice)} · ${esc(fmtMin(cm))}</span></span><span class="pbar"><i style="width:${all ? (100 * dn) / all : 0}%"></i></span></a>`;
      }).join("")}</div></div>`;
    }).join("");
    course(tp, { kind: "course" }, `
      ${crumbs([["#/", T.home], [null, pick(tp.title)]])}
      <div class="course-hero"><h1>${esc(pick(tp.title))}</h1><p>${esc(pick(tp.desc))}</p>
        <div class="meta-line"><span>${ICON.clock} ${esc(fmtMin(mins))}</span><span>${tp.chapters.length} ${esc(T.chapters)}</span><span>${tp.items.length} ${esc(T.items)}</span><span>${topicPct(tp)}% ${esc(T.done)}</span></div>
        <div class="row" style="margin-top:18px">${firstOpen ? `<a class="btn primary" href="#/${firstOpen}">${esc(Object.keys(S.progress).some((k) => k.startsWith(tid + "/")) ? T.resume : T.start)}</a>` : ""}<button class="btn" id="practise">${esc(T.practiseCourse)}</button>${tp.notation?.length ? `<a class="btn ghost" href="#/n/${tid}">∑ ${esc(T.notation)}</a>` : ""}<a class="btn ghost" href="#/coverage/${tid}">▤ ${esc(T.courseCov)}</a>${window.PrepInk ? `<a class="btn ghost" href="#/nb/${tid}">✎ ${S.lang === "zh" ? "课程笔记本" : "Course notebook"}</a>` : ""}${window.PrepMap ? `<a class="btn ghost" href="#/map/${tid}">◈ ${S.lang === "zh" ? "路线图" : "Roadmap"}</a>` : ""}</div>
      </div>${blocks}`);
    $("#practise").onclick = () => { S.sel = [tid]; save(); startReview("due"); };
  }

  // ------------------------------------------------------------------ chapter page
  function viewChapter(tid, cid) {
    const T = t();
    const tp = TOPIC[tid];
    const c = tp?.chapters.find((x) => x.id === cid);
    if (!c) return viewCourse(tid);
    chrome("home");
    const idx = tp.ordered.indexOf(c) + 1;
    const cm = (c.pmin || 0) + c.items.reduce((b, x) => b + (x.min || 10), 0);
    const obj = pick(c.objectives) || [];
    const hasPrimer = c.primer.en || c.primer.zh;
    const firstOpen = (hasPrimer && !primerDone(tid, cid) ? `p/${tid}/${cid}` : null) || c.items.map((x) => `q/${x.id}`).find((k) => !known(k.slice(2))) || (hasPrimer ? `p/${tid}/${cid}` : c.items[0] ? `q/${c.items[0].id}` : null);
    const rows = [];
    if (hasPrimer) rows.push(`<a class="item-row" href="#/p/${tid}/${cid}"><span class="ic">${ICON.reading}</span><span class="info"><b>${esc(T.primer)}: ${esc(pick(c.primer))}</b><span class="muted">${esc(T.reading)} · ${esc(fmtMin(c.pmin || 15))}</span></span>${ck(primerDone(tid, cid) ? "done" : "todo")}</a>`);
    for (const it of c.items) rows.push(`<a class="item-row" href="#/q/${it.id}"><span class="ic">${kindIcon(it.meta.type)}</span><span class="info"><b>${esc(titleOf(it))}</b><span class="muted">${esc(T.kind[it.meta.type] || it.meta.type)} · ${esc(T.diff[it.meta.difficulty])} · ${esc(fmtMin(it.min || 10))}${it.steps ? ` · ${it.steps} ${esc(T.steps)}` : ""}${it.viz ? ` · ${esc(T.vizN(it.viz))}` : ""}${it.meta.freq === "high" ? ` · <span style="color:var(--red)">${esc(T.freq.high)}</span>` : ""}</span></span>${ck(ckState(it.id))}</a>`);
    course(tp, { kind: "chapter", chapter: cid }, `
      ${crumbs([["#/", T.home], [`#/t/${tid}`, pick(tp.title)], [null, T.chapterN(idx)]])}
      <div class="muted" style="font-weight:700;font-size:14px">${esc(T.mod[modOf(c)])} · ${esc(T.chapterN(idx))}</div>
      <h1>${esc(pick(c.title))}</h1>
      <div class="meta-line"><span>${ICON.clock} ${esc(fmtMin(cm))}</span>${hasPrimer ? `<span>1 ${esc(T.reading)}</span>` : ""}<span>${c.items.length} ${esc(T.practice)}</span><span>${chapterDone(tid, c)}/${chapterUnits(tid, c)} ${esc(T.done)}</span></div>
      ${firstOpen ? `<div class="row" style="margin:18px 0 4px"><a class="btn primary" href="#/${firstOpen}">${esc(chapterDone(tid, c) ? T.resume : T.start)}</a></div>` : ""}
      ${obj.length ? `<div class="card objectives"><h3>${esc(T.objectives)}</h3><ul>${obj.map((o) => `<li>${o}</li>`).join("")}</ul></div>` : ""}
      <div class="card items">${rows.join("") || `<div class="empty">${esc(T.none)}</div>`}</div>`);
  }

  // ------------------------------------------------------------------ sequence helpers
  function neighbours(tid, key) {
    const seq = SEQ[tid];
    const i = seq.indexOf(key);
    return { prev: i > 0 ? seq[i - 1] : null, next: i >= 0 && i < seq.length - 1 ? seq[i + 1] : null };
  }
  const seqLabel = (key) => {
    if (!key) return "";
    if (key.startsWith("p/")) { const [, tid, cid] = key.split("/"); const c = TOPIC[tid].chapters.find((x) => x.id === cid); return `${t().primer}: ${pick(c.title)}`; }
    return titleOf(ITEM[key.slice(2)].item);
  };

  // ------------------------------------------------------------------ primer
  async function viewPrimer(tid, cid) {
    const T = t();
    const tp = TOPIC[tid];
    const c = tp?.chapters.find((x) => x.id === cid);
    if (!c) return viewCourse(tid);
    chrome("home");
    S.last = `p/${tid}/${cid}`; save();
    course(tp, { kind: "primer", chapter: cid }, `<div class="empty">${esc(T.loading)}</div>`);
    await loadTopic(tid);
    const fc = fullChapter(tid, cid);
    const L = fc.primer[S.lang] ? S.lang : fc.primer.en ? "en" : "zh";
    const p = fc.primer[L];
    const key = `${tid}/${cid}`;
    const { prev, next } = neighbours(tid, `p/${tid}/${cid}`);
    const idx = tp.ordered.indexOf(c) + 1;
    const inner = `
      ${crumbs([["#/", T.home], [`#/t/${tid}`, pick(tp.title)], [`#/c/${tid}/${cid}`, T.chapterN(idx)], [null, T.primer]])}
      <div class="item-head"><div class="kind">${ICON.reading.replace("<svg", '<svg width="18" height="18"')} ${esc(T.reading)} · ${esc(fmtMin(p?.min || c.pmin || 15))}</div><h1><span class="t">${esc(p?.title || pick(c.title))}</span></h1></div>
      ${L !== S.lang ? `<div class="notice">${esc(S.lang === "zh" ? T.fallbackZh : T.fallbackEn)}</div>` : ""}
      ${p?.objectives?.length ? `<div class="card objectives"><h3>${esc(T.objectives)}</h3><ul>${p.objectives.map((o) => `<li>${o}</li>`).join("")}</ul>${p.prereqs?.length ? `<h3 style="margin-top:12px">${esc(T.prereqs)}</h3><ul>${p.prereqs.map((o) => `<li>${o}</li>`).join("")}</ul>` : ""}</div>` : ""}
      <div class="prose" id="primer-body">${p ? p.html : ""}</div>
      ${p?.checks?.length ? `<h2>${esc(T.sec.check)}</h2>${checksHtml(p.checks)}` : ""}
      <div class="card rate-bar"><div class="row"><div style="flex:1"><div class="lbl">${primerDone(tid, cid) ? "✓ " + esc(T.completed) : esc(T.markDone)}</div></div>
        <button class="btn ${primerDone(tid, cid) ? "" : "primary"}" id="mark">${primerDone(tid, cid) ? esc(T.completed) + " ✓" : esc(T.markDone)}</button></div></div>
      <div class="next-bar">${prev ? `<a class="btn" href="#/${prev}">‹ ${esc(T.prevItem)}</a>` : "<span></span>"}${next ? `<a class="btn primary" href="#/${next}" title="${esc(seqLabel(next))}">${esc(T.nextItem)} ›</a>` : ""}</div>`;
    course(tp, { kind: "primer", chapter: cid }, inner);
    noteFab(`p/${tid}/${cid}`, p?.title || pick(c.title));
    $("#mark").onclick = () => { if (!S.primers[key]) bump(); S.primers[key] = !S.primers[key]; save(); viewPrimer(tid, cid); };
    window.Viz?.mountAll(main);
  }

  function checksHtml(checks) {
    return checks.map((c) => `<div class="card" style="padding:14px 18px;margin:0 0 10px"><div class="prose">${c.q}</div><details style="margin-top:4px"><summary class="link-btn" style="list-style:none">${esc(t().showAnswer)} ›</summary><div class="prose">${c.a}</div></details></div>`).join("");
  }

  // ------------------------------------------------------------------ steps player
  function stepsHtml(d) {
    const T = t();
    const n = d.steps.length;
    return `${d.stepsIntro ? `<div class="prose">${d.stepsIntro}</div>` : ""}<div class="steps" data-n="${n}">
      <div class="steps-progress"><i style="width:${100 / n}%"></i></div>
      <div class="steps-list">${d.steps.map((st, i) => `<div class="step" data-i="${i}" ${i ? "hidden" : ""}><div class="sh"><span class="sn">${esc(T.stepOf(i + 1, n))}</span><span>${st.title}</span></div><div class="prose">${st.html}</div></div>`).join("")}</div>
      <div class="steps-nav"><div class="steps-dots">${d.steps.map((_, i) => `<button type="button" data-i="${i}">${i + 1}</button>`).join("")}</div>
        <button class="btn small" data-act="prev">‹ ${esc(T.prevStep)}</button><button class="btn small primary" data-act="next">${esc(T.nextStep)} ›</button><button class="btn small ghost" data-act="all">${esc(T.allSteps)}</button></div></div>`;
  }
  function bindSteps(root) {
    const box = $(".steps", root);
    if (!box) return;
    const n = +box.dataset.n;
    let cur = 0, shown = 0;
    const els = $$(".step", box), dots = $$(".steps-dots button", box);
    function show(k, scroll = true) {
      cur = Math.max(0, Math.min(n - 1, k));
      shown = Math.max(shown, cur);
      els.forEach((el, i) => {
        const vis = i <= shown;
        if (vis && el.hidden) { el.hidden = false; el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); }
        if (!vis) el.hidden = true;
        el.classList.toggle("cur", i === cur);
      });
      dots.forEach((d, i) => { d.classList.toggle("on", i === cur); d.classList.toggle("seen", i <= shown && i !== cur); });
      $(".steps-progress i", box).style.width = `${(100 * (shown + 1)) / n}%`;
      $('[data-act="next"]', box).disabled = cur >= n - 1 && shown >= n - 1;
      window.Viz?.mountAll(els[cur]);
      if (scroll) els[cur].scrollIntoView({ behavior: "smooth", block: "start" });
    }
    dots.forEach((d) => (d.onclick = () => show(+d.dataset.i)));
    $('[data-act="next"]', box).onclick = () => show(cur < shown ? shown + (shown < n - 1 ? 1 : 0) : cur + 1);
    $('[data-act="prev"]', box).onclick = () => show(cur - 1);
    $('[data-act="all"]', box).onclick = () => { shown = n - 1; show(n - 1, false); window.Viz?.mountAll(box); };
    box.showNext = () => { if (shown < n - 1) { show(shown + 1); return true; } return false; };
    show(0, false);
  }

  // ------------------------------------------------------------------ item
  async function viewItem(id, mode = "study", ctx = {}) {
    const T = t();
    const ref = ITEM[id];
    if (!ref) return viewHome();
    const { topic: tp, chapter: c, item: it } = ref;
    const tid = tp.id;
    if (mode === "study") { chrome("home"); S.last = `q/${id}`; save(); }
    if (!FULL_ITEM[id]) {
      if (mode === "study") course(tp, { kind: "item", chapter: c.id, id }, `<div class="empty">${esc(T.loading)}</div>`);
      else main.innerHTML = `<div class="wrap narrow"><div class="empty">${esc(T.loading)}</div></div>`;
      await loadTopic(tid);
    }
    const full = FULL_ITEM[id];
    const L = full[S.lang] ? S.lang : full.en ? "en" : "zh";
    const d = full[L];
    const p = S.progress[id];
    const now = Date.now();
    const locked = mode === "mock" && !ctx.revealed;
    const openAll = mode === "study" && !S.practice;
    const secs = SEC_ORDER.filter((k) => (k === "check" ? d.checks.length : k === "steps" ? d.steps?.length : d.sections[k]));
    const isEx = it.meta.type === "exercise";
    const secName = (k) => (isEx && T.exSec[k]) || T.sec[k];
    const panel = (k, body, meta = "") => `<details class="panel k-${k}" data-k="${k}" ${openAll || (k === "steps" && openAll) ? "open" : ""} ${locked ? "hidden" : ""}><summary><span class="ic">${ICON[k] || ""}</span><span class="name">${esc(secName(k))}</span>${meta ? `<span class="meta">${esc(meta)}</span>` : ""}<span class="chev">›</span></summary><div class="pb">${body}</div></details>`;
    const secHtml = secs.map((k) => k === "check" ? panel(k, checksHtml(d.checks), `${d.checks.length}`) : k === "steps" ? panel(k, stepsHtml(d), `${d.steps.length} ${T.steps}`) : panel(k, `<div class="prose">${d.sections[k]}</div>`)).join("");
    const idx = tp.ordered.indexOf(c) + 1;
    const { prev, next } = neighbours(tid, `q/${id}`);
    const rateBtns = [0, 1, 2, 3].map((r) => { const nx = schedule(p, r, now); return `<button data-r="${r}" class="${p && p.r === r && p.t > now - 5000 ? "sel" : ""}">${esc(T.r[r])}<small>${fmtIvl(nx.due - now)}</small></button>`; }).join("");
    const inner = `
      ${ctx.progress != null ? `<div class="qprog"><i style="width:${ctx.progress}%"></i></div>` : ""}
      ${mode === "study" ? crumbs([["#/", T.home], [`#/t/${tid}`, pick(tp.title)], [`#/c/${tid}/${c.id}`, T.chapterN(idx)], [null, `${ref.ii + 1}/${c.items.length}`]]) : `<div class="crumbs"><span>${esc(pick(tp.title))}</span><span class="sep">›</span><span>${esc(pick(c.title))}</span><span class="sep">›</span><span>${esc(ctx.pos || "")}</span></div>`}
      <div class="item-head"><div class="kind">${kindIcon(it.meta.type).replace("<svg", '<svg width="18" height="18"')} ${esc(T.practice)} · ${esc(T.kind[it.meta.type] || it.meta.type)} · ${esc(fmtMin(it.min || 10))}${d.steps?.length ? ` · ${d.steps.length} ${esc(T.steps)}` : ""}${d.viz ? ` · ${esc(T.vizN(d.viz))}` : ""}</div>
        <h1><span class="t">${esc(d.title)}</span><button class="star ${S.marks[id] ? "on" : ""}" id="star" aria-label="Star">${ICON.star(!!S.marks[id])}</button></h1></div>
      <div class="tags"><span class="tag blue">${"●".repeat(it.meta.difficulty)}${"○".repeat(3 - it.meta.difficulty)} ${esc(T.diff[it.meta.difficulty])}</span><span class="tag ${it.meta.freq === "high" ? "red" : ""}">${esc(T.freq[it.meta.freq] || it.meta.freq)}</span><span class="tag">${esc(T.mod[modOf(c)])}</span>${it.meta.tags.map((x) => `<span class="tag">#${esc(x)}</span>`).join("")}</div>
      ${L !== S.lang ? `<div class="notice">${esc(S.lang === "zh" ? T.fallbackZh : T.fallbackEn)}</div>` : ""}
      <div class="card qcard"><div class="lbl">${esc(secName("question"))}</div><div class="prose">${d.sections.question || ""}</div></div>
      <div class="think">${locked ? `<span class="muted">${esc(T.think)}</span><span class="spacer"></span><span class="timer" id="timer"></span><button class="btn primary" id="reveal-mock">${esc(T.showAnswer)}</button>`
        : `<span class="muted">${esc(isEx ? T.exThink : T.think)}</span><span class="spacer"></span>${mode !== "mock" ? `<span class="timer" id="timer"></span><button class="btn small" id="timer-btn">⏱ ${esc(T.timer)}</button>` : ""}<button class="btn small" id="reveal-short">${esc(isEx ? T.exHint : T.revealShort)}</button><button class="btn small" id="reveal-all">${esc(openAll ? T.collapseAll : T.revealAll)}</button>`}</div>
      ${ctx.timeUp ? `<div class="notice">${esc(T.timeUp)}</div>` : ""}
      ${secHtml}
      ${locked ? "" : `<div class="card rate-bar"><div class="lbl">${esc(T.rateQ)}</div><div class="muted">${esc(T.rateSub)}${p && mode === "study" ? ` · ${esc(T.nextDue)}: ${fmtIvl(Math.max(0, p.due - now))}` : ""}</div><div class="rate-btns">${rateBtns}</div></div>
        ${mode === "study" ? `<div class="next-bar">${prev ? `<a class="btn" href="#/${prev}">‹ ${esc(T.prevItem)}</a>` : "<span></span>"}${next ? `<a class="btn primary" href="#/${next}" title="${esc(seqLabel(next))}">${esc(T.nextItem)} ›</a>` : ""}</div>` : ""}`}`;
    if (mode === "study") course(tp, { kind: "item", chapter: c.id, id }, inner);
    else main.innerHTML = `<div class="wrap narrow">${inner}</div>`;
    if (!ctx.keepScroll) scroller().scrollTop = 0;

    $("#star").onclick = () => { S.marks[id] ? delete S.marks[id] : (S.marks[id] = Date.now()); save(); const b = $("#star"); b.classList.toggle("on", !!S.marks[id]); b.innerHTML = ICON.star(!!S.marks[id]); };
    noteFab(id, d.title);
    const panels = () => $$("details.panel[data-k]:not(.k-notes)", main);
    panels().forEach((x) => x.addEventListener("toggle", () => { if (x.open) window.Viz?.mountAll(x); }));
    bindSteps(main);
    const ra = $("#reveal-all");
    if (ra) ra.onclick = () => { const anyClosed = panels().some((x) => !x.open); panels().forEach((x) => (x.open = anyClosed)); ra.textContent = anyClosed ? T.collapseAll : T.revealAll; if (anyClosed) { const sb = $(".steps [data-act=all]", main); sb?.click(); } };
    const rs = $("#reveal-short");
    if (rs) rs.onclick = () => { const s = $(`details.panel[data-k="${isEx ? "approach" : "short"}"]`, main); if (s) { s.open = true; s.scrollIntoView({ behavior: "smooth", block: "start" }); } };
    const tb = $("#timer-btn");
    if (tb) tb.onclick = () => countdown(Date.now() + 180e3, () => { const s = $(`details.panel[data-k="${isEx ? "approach" : "short"}"]`, main); if (s) s.open = true; });
    const rm = $("#reveal-mock");
    if (rm) rm.onclick = () => ctx.onReveal?.();
    if (locked && ctx.deadline) countdown(ctx.deadline, () => ctx.onTimeUp?.());
    $$(".rate-btns button", main).forEach((b) => (b.onclick = () => {
      const r = +b.dataset.r;
      rate(id, r);
      if (mode === "study") { const y = scroller().scrollTop; viewItem(id, "study", { keepScroll: true }).then(() => { scroller().scrollTop = y; window.PrepInk?.attach("q/" + id, main, APPCTX); }); }
      else ctx.onRate?.(r);
    }));
    if (openAll) window.Viz?.mountAll(main);
  }

  function countdown(deadline, onEnd) {
    clearInterval(timerId);
    const tick = () => {
      const el = $("#timer");
      if (!el) return clearInterval(timerId);
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      if (!left) { clearInterval(timerId); onEnd?.(); }
    };
    tick();
    timerId = setInterval(tick, 500);
  }

  // ------------------------------------------------------------------ notation
  async function viewNotation(tid) {
    const T = t();
    const tp = TOPIC[tid];
    if (!tp) return viewHome();
    chrome("home");
    course(tp, { kind: "notation" }, `<div class="empty">${esc(T.loading)}</div>`);
    await loadTopic(tid);
    const n = FULL[tid].notation || {};
    const d = n[S.lang] || n.en || n.zh;
    course(tp, { kind: "notation" }, `${crumbs([["#/", T.home], [`#/t/${tid}`, pick(tp.title)], [null, T.notation]])}<h1>${esc(d?.title || T.notation)}</h1><div class="prose">${d ? d.html : `<p class="muted">${esc(T.none)}</p>`}</div>`);
  }

  // ------------------------------------------------------------------ coverage
  const covFilter = { tab: "intel", st: "gap", kind: "all" };
  async function viewCoverage(tid) {
    const T = t();
    chrome("coverage");
    if (!tid) {
      const rows = TOPICS.map((tp) => {
        const c = tp.cov || {};
        const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "—");
        return `<tr><td><a href="#/coverage/${tp.id}"><b>${esc(pick(tp.title))}</b></a></td><td>${c.intel || 0}</td><td>${pct((c.intelCovered || 0) + 0.5 * (c.intelPartial || 0), c.intel)}</td><td>${(c.intel || 0) - (c.intelCovered || 0) - (c.intelPartial || 0)}</td><td>${c.coding || 0}</td><td>${c.syllabus || 0}</td><td>${pct((c.sylCovered || 0) + 0.5 * (c.sylPartial || 0), c.syllabus)}</td><td>${tp.items.length}</td></tr>`;
      }).join("");
      main.innerHTML = `<div class="wrap"><h1>${esc(T.covTitle)}</h1><p class="muted">${esc(T.covIntro)}</p>
        <div class="card cov-wrap"><table class="cov-table"><thead><tr><th>${esc(T.topics)}</th><th>${esc(T.intel)}</th><th>${esc(T.covered)}</th><th>${esc(T.gap)}</th><th>Live coding</th><th>${esc(T.syllabus)}</th><th>${esc(T.covered)}</th><th>${esc(T.qTotal)}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
      return;
    }
    const tp = TOPIC[tid];
    if (!tp) return viewCoverage(null);
    main.innerHTML = `<div class="wrap"><div class="empty">${esc(T.loading)}</div></div>`;
    await loadTopic(tid);
    const F = FULL[tid];
    const intel = F.intel?.entries || [];
    const syl = F.syllabus?.entries || [];
    const st = (e) => (!(e.covered_by || []).length ? "gap" : e.partial ? "partial" : "covered");
    const link = (cid) => {
      if (ITEM[cid]) return `<a href="#/q/${cid}">${esc(titleOf(ITEM[cid].item))}</a>`;
      const [a, b] = cid.includes("/") ? cid.split("/") : [tid, cid];
      const ch = TOPIC[a]?.chapters.find((x) => x.id === b);
      return ch ? `<a href="#/c/${a}/${b}">${esc(pick(ch.title))}</a>` : `<span class="muted">${esc(cid)}</span>`;
    };
    const tagFor = (s) => (s === "covered" ? `<span class="tag green">${esc(T.covered)}</span>` : s === "partial" ? `<span class="tag orange">${esc(T.partial)}</span>` : `<span class="tag red">${esc(T.gap)}</span>`);
    const cnt = (s) => intel.filter((e) => st(e) === s).length;
    const kinds = [...new Set(intel.map((e) => e.kind))];
    const chip = (k, v, label) => `<button class="chip ${covFilter[k] === v ? "on" : ""}" data-k="${k}" data-v="${v}">${esc(label)}</button>`;
    let body;
    if (covFilter.tab === "intel") {
      const rows = intel.filter((e) => (covFilter.st === "all" || st(e) === covFilter.st) && (covFilter.kind === "all" || e.kind === covFilter.kind))
        .sort((a, b) => (b.reports || 1) - (a.reports || 1))
        .map((e) => `<tr><td>${tagFor(st(e))}</td><td><b>${esc(pick(e.q))}</b>${e.note ? `<div class="muted">${esc(e.note)}</div>` : ""}</td><td><span class="tag">${esc(e.kind)}</span>${e.round ? `<div class="muted">${esc(e.round)}</div>` : ""}</td><td>${esc((e.companies || []).join(", "))}<div class="muted">${esc((e.roles || []).join(", "))}</div></td><td>${esc(e.when || "")}<div class="muted">${e.reports || 1} ${esc(T.reports)}</div></td><td>${(e.sources || []).map((s) => `<div class="muted">${esc(s.site)}${s.date ? " · " + esc(s.date) : ""}${s.title ? ` — ${esc(s.title)}` : ""}</div>`).join("")}</td><td>${(e.covered_by || []).map(link).join("<br>")}</td></tr>`).join("");
      body = intel.length ? `<div class="cov-stats"><div class="card"><b>${intel.length}</b><span class="muted">${esc(T.intel)}</span></div><div class="card"><b style="color:var(--green)">${cnt("covered")}</b><span class="muted">${esc(T.covered)}</span></div><div class="card"><b style="color:var(--orange)">${cnt("partial")}</b><span class="muted">${esc(T.partial)}</span></div><div class="card"><b style="color:var(--red)">${cnt("gap")}</b><span class="muted">${esc(T.gap)}</span></div><div class="card"><b>${intel.filter((e) => e.kind === "coding").length}</b><span class="muted">${esc(T.liveCoding)}</span></div></div>
        <div class="filters">${chip("st", "gap", T.gap)}${chip("st", "partial", T.partial)}${chip("st", "covered", T.covered)}${chip("st", "all", T.all)}<span style="width:10px"></span>${chip("kind", "all", T.all)}${kinds.map((k) => chip("kind", k, k)).join("")}</div>
        <div class="card cov-wrap"><table class="cov-table"><thead><tr><th></th><th>${esc(T.sec.question)}</th><th>Kind</th><th>Company / role</th><th>When</th><th>${esc(T.sources)}</th><th>${esc(T.coveredBy)}</th></tr></thead><tbody>${rows || `<tr><td colspan="7" class="muted">${esc(T.none)}</td></tr>`}</tbody></table></div>
        ${F.intel?.searched?.length ? `<p class="muted small">${esc(T.searched)}: ${F.intel.searched.map((s) => esc(s.site)).join(" · ")} · ${esc(F.intel.updated || "")}</p>` : ""}` : `<div class="empty">${esc(T.noIntel)}</div>`;
    } else {
      const order = { missing: 0, partial: 1, covered: 2 };
      const rows = syl.slice().sort((a, b) => order[a.status] - order[b.status]).map((e) => `<tr><td>${e.status === "covered" ? tagFor("covered") : e.status === "partial" ? tagFor("partial") : `<span class="tag red">${esc(T.statusOf.missing)}</span>`}</td><td><b>${esc(e.source)}</b><div class="muted">${esc(e.unit || "")}</div></td><td>${esc(e.title || "")}${e.note ? `<div class="muted">${esc(e.note)}</div>` : ""}</td><td>${(e.covered_by || []).map(link).join("<br>")}</td></tr>`).join("");
      body = syl.length ? `<div class="card cov-wrap"><table class="cov-table"><thead><tr><th></th><th>${esc(T.sources)}</th><th></th><th>${esc(T.coveredBy)}</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">${esc(T.noSyl)}</div>`;
    }
    main.innerHTML = `<div class="wrap">${crumbs([["#/coverage", T.covTitle], [null, pick(tp.title)]])}<h1>${esc(pick(tp.title))}</h1><p class="muted">${esc(T.covIntro)}</p>
      <div class="filters">${chip("tab", "intel", T.intel)}${chip("tab", "syllabus", T.syllabus)}</div>${body}</div>`;
    $$(".chip", main).forEach((b) => (b.onclick = () => { covFilter[b.dataset.k] = b.dataset.v; viewCoverage(tid); }));
  }

  // ------------------------------------------------------------------ pickers / review / drill / mock
  const picker = () => `<div class="card checks">${TOPICS.map((tp) => `<label><input type="checkbox" data-tp="${tp.id}" ${S.sel.includes(tp.id) ? "checked" : ""}><span style="flex:1;font-weight:600">${esc(pick(tp.title))}</span><span class="muted">${tp.items.length}</span></label>`).join("")}</div>`;
  const bindPicker = (cb) => $$("input[data-tp]", main).forEach((x) => (x.onchange = () => { S.sel = $$("input[data-tp]", main).filter((y) => y.checked).map((y) => y.dataset.tp); save(); cb?.(); }));
  const selItems = () => ALL.filter((id) => S.sel.includes(ITEM[id].topic.id));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  let REV = null;
  function buildQueue(mode) {
    const ids = selItems();
    if (mode === "weak") return ids.filter((id) => { const p = S.progress[id]; return p && p.r <= 1; }).sort((a, b) => S.progress[a].r - S.progress[b].r || S.progress[a].t - S.progress[b].t);
    if (mode === "random") return shuffle(ids.slice()).slice(0, 20);
    return [...ids.filter(isDue).sort((a, b) => S.progress[a].due - S.progress[b].due), ...ids.filter((id) => !S.progress[id]).slice(0, S.newPer)];
  }
  function startReview(mode) { REV = { queue: buildQueue(mode), i: 0, n: 0, again: 0 }; if (location.hash === "#/review/go") render(); else location.hash = "#/review/go"; }
  function viewReview(go) {
    const T = t();
    chrome("review");
    if (go && REV) {
      if (REV.i >= REV.queue.length) { main.innerHTML = `<div class="wrap narrow"><h1>${esc(T.sessionDone)}</h1><p>${esc(T.sessionStats(REV.n, REV.again))}</p><div class="row"><a class="btn primary" href="#/review">${esc(T.review)}</a><a class="btn" href="#/">${esc(T.home)}</a></div></div>`; REV = null; return; }
      const id = REV.queue[REV.i];
      return viewItem(id, "review", { pos: `${REV.i + 1} / ${REV.queue.length}`, progress: (100 * REV.i) / REV.queue.length, onRate(r) { REV.n++; if (r === 0) { REV.again++; REV.queue.splice(Math.min(REV.queue.length, REV.i + 4), 0, id); } REV.i++; viewReview(true); } });
    }
    const counts = { due: buildQueue("due").length, weak: buildQueue("weak").length, random: Math.min(20, selItems().length) };
    main.innerHTML = `<div class="wrap narrow"><h1>${esc(T.review)}</h1><p class="muted">${esc(T.reviewIntro)}</p>
      <h2>${esc(T.topics)}</h2>${picker()}
      <div class="card" style="margin-top:14px"><div class="setrow"><div class="lbl">${esc(T.newPer)}</div><div class="seg" id="newper">${[5, 10, 20, 40].map((n) => `<button class="${S.newPer === n ? "on" : ""}" data-n="${n}">${n}</button>`).join("")}</div></div></div>
      <div class="row" style="margin-top:20px"><button class="btn primary" data-m="due" ${counts.due ? "" : "disabled"}>${esc(T.modeDue)} (${counts.due})</button><button class="btn" data-m="weak" ${counts.weak ? "" : "disabled"}>${esc(T.modeWeak)} (${counts.weak})</button><button class="btn" data-m="random" ${counts.random ? "" : "disabled"}>${esc(T.modeRandom)}</button></div></div>`;
    bindPicker(() => viewReview(false));
    $$("#newper button", main).forEach((b) => (b.onclick = () => { S.newPer = +b.dataset.n; save(); viewReview(false); }));
    $$("[data-m]", main).forEach((b) => (b.onclick = () => startReview(b.dataset.m)));
  }

  let DR = null;
  async function startDrill() {
    main.innerHTML = `<div class="wrap narrow"><div class="empty">${esc(t().loading)}</div></div>`;
    await Promise.all(S.sel.map(loadTopic));
    const cards = [];
    for (const tid of S.sel) for (const c of FULL[tid].chapters) {
      const p = c.primer[S.lang] || c.primer.en || c.primer.zh;
      if (p) p.checks.forEach((x, k) => cards.push({ key: `${tid}/${c.id}/_primer#${k}`, q: x.q, a: x.a, src: `${pick(TOPIC[tid].title)} · ${t().primer}` }));
      for (const it of c.items) { const d = it[S.lang] || it.en || it.zh; d.checks.forEach((x, k) => cards.push({ key: `${it.id}#${k}`, q: x.q, a: x.a, src: d.title, id: it.id })); }
    }
    const score = (k) => { const c = S.cards[k]; return c ? c.ok - 2 * c.miss : -0.5; };
    shuffle(cards).sort((a, b) => score(a.key) - score(b.key));
    DR = { cards: cards.slice(0, 30), i: 0, ok: 0, flipped: false };
    viewDrill(true);
  }
  function viewDrill(go) {
    const T = t();
    chrome("drill");
    if (go && DR) {
      if (DR.i >= DR.cards.length) { main.innerHTML = `<div class="wrap narrow"><h1>${esc(T.sessionDone)}</h1><p>${DR.ok} / ${DR.cards.length}</p><div class="row"><button class="btn primary" id="again">${esc(T.start)}</button><a class="btn" href="#/">${esc(T.home)}</a></div></div>`; $("#again").onclick = startDrill; DR = null; return; }
      const c = DR.cards[DR.i];
      main.innerHTML = `<div class="wrap narrow"><div class="qprog"><i style="width:${(100 * DR.i) / DR.cards.length}%"></i></div>
        <div class="card flash" id="flash"><div class="k">${DR.i + 1} / ${DR.cards.length}</div><div class="prose">${c.q}</div>${DR.flipped ? `<div class="ans prose">${c.a}</div>` : `<div class="muted" style="margin-top:14px">${esc(T.tapFlip)}</div>`}<div class="src">${c.id ? `<a href="#/q/${c.id}">${esc(c.src)}</a>` : esc(c.src)}</div></div>
        ${DR.flipped ? `<div class="row" style="margin-top:16px"><button class="btn" id="miss" style="flex:1">${esc(T.missed)}</button><button class="btn primary" id="ok" style="flex:1">${esc(T.gotIt)}</button></div>` : ""}</div>`;
      main.scrollTop = 0;
      $("#flash").onclick = (e) => { if (e.target.closest("a")) return; if (!DR.flipped) { DR.flipped = true; viewDrill(true); } };
      const mark = (good) => { const s = (S.cards[c.key] ||= { ok: 0, miss: 0 }); good ? s.ok++ : s.miss++; if (good) DR.ok++; else DR.cards.splice(Math.min(DR.cards.length, DR.i + 5), 0, c); DR.i++; DR.flipped = false; save(); viewDrill(true); };
      if (DR.flipped) { $("#ok").onclick = () => mark(true); $("#miss").onclick = () => mark(false); }
      return;
    }
    const n = selItems().reduce((s, id) => s + (ITEM[id].item.checks || 0), 0);
    main.innerHTML = `<div class="wrap narrow"><h1>${esc(T.drill)}</h1><p class="muted">${esc(T.drillIntro)}</p><h2>${esc(T.topics)}</h2>${picker()}<div class="row" style="margin-top:20px"><button class="btn primary" id="go" ${n ? "" : "disabled"}>${esc(T.start)} (${n}+ ${esc(T.cards)})</button></div></div>`;
    bindPicker(() => viewDrill(false));
    $("#go").onclick = startDrill;
  }

  let MOCK = null;
  const mockCfg = { count: 5, minutes: 4 };
  function startMock() {
    const left = selItems().slice();
    const w = (id) => { const m = ITEM[id].item.meta; return ({ high: 3, medium: 2, low: 1 }[m.freq] || 1) * (m.difficulty >= 2 ? 1.5 : 1); };
    const chosen = [];
    while (chosen.length < mockCfg.count && left.length) { const tot = left.reduce((s, id) => s + w(id), 0); let x = Math.random() * tot; const k = left.findIndex((id) => (x -= w(id)) <= 0); chosen.push(left.splice(k < 0 ? 0 : k, 1)[0]); }
    MOCK = { ids: chosen, i: 0, results: [], revealed: false, deadline: Date.now() + mockCfg.minutes * 60e3, timeUp: false };
    if (location.hash === "#/mock/go") render(); else location.hash = "#/mock/go";
  }
  function viewMock(go) {
    const T = t();
    chrome("mock");
    if (go && MOCK) {
      if (MOCK.i >= MOCK.ids.length) { main.innerHTML = `<div class="wrap narrow"><h1>${esc(T.sessionDone)}</h1><div class="card list">${MOCK.results.map((x) => `<a class="li" href="#/q/${x.id}">${ck(x.r >= 2 ? "done" : "part")}<span class="info"><b>${esc(titleOf(ITEM[x.id].item))}</b><span class="muted">${esc(T.r[x.r])}</span></span></a>`).join("")}</div><div class="row" style="margin-top:16px"><a class="btn primary" href="#/mock">${esc(T.mock)}</a></div></div>`; MOCK = null; return; }
      const id = MOCK.ids[MOCK.i];
      const reveal = (up) => { MOCK.revealed = true; MOCK.timeUp = !!up; viewMock(true).then(() => { const s = $('details.panel[data-k="short"]', main); if (s) s.open = true; }); };
      return viewItem(id, "mock", { pos: `${MOCK.i + 1} / ${MOCK.ids.length}`, progress: (100 * MOCK.i) / MOCK.ids.length, revealed: MOCK.revealed, timeUp: MOCK.timeUp, deadline: MOCK.deadline, keepScroll: MOCK.revealed, onReveal: () => reveal(false), onTimeUp: () => reveal(true), onRate(r) { MOCK.results.push({ id, r }); MOCK.i++; MOCK.revealed = false; MOCK.timeUp = false; MOCK.deadline = Date.now() + mockCfg.minutes * 60e3; viewMock(true); } });
    }
    const seg = (k, vals) => `<div class="seg" data-k="${k}">${vals.map((v) => `<button class="${mockCfg[k] === v ? "on" : ""}" data-v="${v}">${v}</button>`).join("")}</div>`;
    main.innerHTML = `<div class="wrap narrow"><h1>${esc(T.mock)}</h1><p class="muted">${esc(T.mockIntro)}</p><h2>${esc(T.topics)}</h2>${picker()}
      <div class="card" style="margin-top:14px"><div class="setrow"><div class="lbl">${esc(T.count)}</div>${seg("count", [3, 5, 8, 12])}</div><div class="setrow"><div class="lbl">${esc(T.minutes)}</div>${seg("minutes", [2, 4, 6, 10])}</div></div>
      <div class="row" style="margin-top:20px"><button class="btn primary" id="go" ${selItems().length ? "" : "disabled"}>${esc(T.start)}</button></div></div>`;
    bindPicker(() => viewMock(false));
    $$(".seg[data-k] button", main).forEach((b) => (b.onclick = () => { mockCfg[b.parentElement.dataset.k] = +b.dataset.v; viewMock(false); }));
    $("#go").onclick = startMock;
    return Promise.resolve();
  }

  // ------------------------------------------------------------------ saved / search / settings
  const listHtml = (ids) => (!ids.length ? `<div class="empty">${esc(t().none)}</div>` : `<div class="card list">${ids.map((id) => { const r = ITEM[id]; return `<a class="li" href="#/q/${id}">${ck(ckState(id))}<span class="info"><b>${esc(titleOf(r.item))}</b><span class="muted">${esc(pick(r.topic.title))} · ${esc(pick(r.chapter.title))}</span></span></a>`; }).join("")}</div>`);
  function notesList() {
    const keys = [...new Set([...Object.keys(S.notes), ...Object.keys(INK).filter((k) => INK[k].length)])];
    const rows = keys.map((k) => {
      let href, title, sub;
      if (k.startsWith("p/")) { const [, tid, cid] = k.split("/"); const c = TOPIC[tid]?.chapters.find((x) => x.id === cid); if (!c) return ""; href = `#/${k}`; title = `${t().primerNote}: ${pick(c.title)}`; sub = pick(TOPIC[tid].title); }
      else { const r = ITEM[k]; if (!r) return ""; href = `#/q/${k}`; title = titleOf(r.item); sub = `${pick(r.topic.title)} · ${pick(r.chapter.title)}`; }
      const txt = (S.notes[k] || "").trim();
      return `<a class="li note-li" href="${href}"><span class="info"><b>${esc(title)}</b><span class="muted">${esc(sub)}</span>${txt ? `<span class="note-snip">${esc(txt.slice(0, 220))}${txt.length > 220 ? "…" : ""}</span>` : ""}</span>${inkThumb(k)}</a>`;
    }).filter(Boolean);
    return rows.length ? `<div class="card list">${rows.join("")}</div>` : `<div class="empty">${esc(t().none)}</div>`;
  }
  function viewSaved() {
    const T = t();
    chrome("saved");
    main.innerHTML = `<div class="wrap narrow"><h1>${esc(T.saved)}</h1><h2>★ ${esc(T.bookmarks)}</h2>${listHtml(ALL.filter((id) => S.marks[id]))}<h2>✎ ${esc(T.withNotes)}</h2>${notesList()}<h2>${esc(T.weak)}</h2>${listHtml(ALL.filter((id) => { const p = S.progress[id]; return p && p.r <= 1; }))}</div>`;
  }
  function viewSearch(q) {
    const T = t();
    chrome("");
    $("#search-input").value = q;
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = terms.length ? ALL.filter((id) => { const r = ITEM[id]; const hay = [r.item.title.en, r.item.title.zh, r.item.q?.en, r.item.q?.zh, r.item.meta.tags.join(" "), r.chapter.title.en, r.chapter.title.zh, r.topic.title.en, r.topic.title.zh].join(" ").toLowerCase(); return terms.every((x) => hay.includes(x)); }) : [];
    main.innerHTML = `<div class="wrap narrow"><h1>${esc(q || T.searchPh)}</h1><p class="muted">${hits.length} ${esc(T.results)}</p>${listHtml(hits.slice(0, 200))}</div>`;
  }
  function viewSettings() {
    const T = t();
    chrome("");
    const seg = (k, opts) => `<div class="seg" data-k="${k}">${opts.map(([v, l]) => `<button class="${String(S[k]) === String(v) ? "on" : ""}" data-v="${v}">${esc(l)}</button>`).join("")}</div>`;
    main.innerHTML = `<div class="wrap narrow"><h1>${esc(T.settings)}</h1>${NATIVE ? "" : '<div class="card offdata" id="offdata"></div>'}${window.PREP_LOCK ? `<div class="card" style="margin-bottom:16px"><div class="setrow" style="border-top:0"><div class="lbl">${esc(T.lockBtn)}<small>${esc(T.lockSub)}</small></div><button class="btn" id="lock">${esc(T.lockBtn)}</button></div></div>` : ""}<div class="card">
      <div class="setrow"><div class="lbl">${esc(T.lang)}</div>${seg("lang", [["zh", "中文"], ["en", "English"]])}</div>
      <div class="setrow"><div class="lbl">${esc(T.theme)}</div>${seg("theme", Object.entries(T.themes))}</div>
      <div class="setrow"><div class="lbl">${esc(T.textSize)}</div>${seg("fs", [[15, "A−"], [17, "A"], [19, "A+"], [21, "A++"]])}</div>
      <div class="setrow"><div class="lbl">${esc(T.practiceMode)}<small>${esc(T.practiceSub)}</small></div>${seg("practice", [[true, "On"], [false, "Off"]])}</div>
      <div class="setrow"><div class="lbl">${esc(T.dailyGoal)}</div>${seg("goal", [[5, "5"], [10, "10"], [20, "20"], [40, "40"]])}</div></div>
      <div class="card" style="margin-top:16px"><div class="setrow"><div class="lbl">${esc(T.backup)}<small>${esc(T.backupSub)}</small></div><div class="btnrow">${NATIVE ? "" : `<button class="btn" id="bk-exp">${esc(T.exportBtn)}</button>`}<button class="btn" id="bk-copy">${esc(T.copyBtn)}</button><button class="btn" id="bk-imp">${esc(T.importBtn)}</button><input type="file" id="bk-file" accept="application/json,.json,.txt" hidden></div></div></div>
      <div class="card" style="margin-top:16px"><div class="setrow"><div class="lbl">${esc(T.built)}<small>${INDEX.built ? new Date(INDEX.built).toLocaleString() : "—"} · ${ALL.length} ${esc(T.qTotal)}</small></div><button class="btn" id="reset" style="color:var(--red);border-color:var(--red)">${esc(T.reset)}</button></div></div></div>`;
    $$(".seg[data-k] button", main).forEach((b) => (b.onclick = () => { const k = b.parentElement.dataset.k, v = b.dataset.v; S[k] = k === "fs" || k === "goal" ? +v : k === "practice" ? v === "true" : v; save(); applyTheme(); viewSettings(); }));
    $("#reset").onclick = () => { if (confirm(T.resetQ)) { Object.assign(S, { progress: {}, marks: {}, notes: {}, cards: {}, primers: {}, days: {}, last: null }); flush(); viewSettings(); } };
    if ($("#lock")) $("#lock").onclick = () => window.PREP_LOCK();
    drawOfflineData();
    const backup = async () => { await inkReady; return JSON.stringify({ app: "ai-interview-prep", v: 1, at: new Date().toISOString(), state: S, ink: INK }); };
    if ($("#bk-exp")) $("#bk-exp").onclick = async () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([await backup()], { type: "application/json" }));
      a.download = `prep-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    };
    $("#bk-copy").onclick = async () => { try { await navigator.clipboard.writeText(await backup()); alert(T.copied); } catch (e) { alert(String(e)); } };
    $("#bk-imp").onclick = () => $("#bk-file").click();
    $("#bk-file").onchange = async () => {
      const f = $("#bk-file").files[0];
      if (!f) return;
      let b = null;
      try { b = JSON.parse(await f.text()); } catch {}
      if (!b || b.app !== "ai-interview-prep" || !b.state) { alert(T.importBad); return; }
      if (!confirm(T.importQ(Object.keys(b.state.progress || {}).length))) return;
      await inkReady;
      for (const k of Object.keys(S)) delete S[k];
      Object.assign(S, JSON.parse(JSON.stringify(DEFAULT)), b.state);
      for (const k of Object.keys(INK)) delete INK[k];
      Object.assign(INK, b.ink || {});
      flush(); saveInk(); applyTheme();
      alert(T.imported);
      viewSettings();
    };
  }

  // ------------------------------------------------------------------ originals (PDF library)
  const LIB = window.PREP_LIBRARY || [];
  const LIBDOC = Object.fromEntries(LIB.map((d) => [d.slug, d]));
  function openSource(slug, page, title) {
    const d = LIBDOC[slug];
    const name = title || (d ? d.title : slug);
    const hnd = window.webkit?.messageHandlers?.openSource;
    if (hnd) { hnd.postMessage({ slug, page: page || 1, title: name }); return; }
    if (location.protocol === "file:") { alert(`${name} · p. ${page || 1}\n${t().openInApp}`); return; }
    if (window.PREP_PUBLIC) {
      if (d && d.url) window.open(`${d.url}#page=${page || 1}`, "_blank", "noopener");
      else alert(`${name} · p. ${page || 1}\n${t().noUrl}`);
      return;
    }
    $("#pdf-overlay")?.remove();
    const ov = document.createElement("div");
    ov.id = "pdf-overlay";
    ov.innerHTML = `<iframe title="${esc(name)}" src="pdfview.html?slug=${encodeURIComponent(slug)}&page=${page || 1}&lang=${S.lang}&title=${encodeURIComponent(name)}"></iframe>`;
    document.body.append(ov);
    document.body.classList.add("pdf-open");
  }
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || e.data?.prep !== "pdf-close") return;
    $("#pdf-overlay")?.remove();
    document.body.classList.remove("pdf-open");
  });
  document.addEventListener("click", (e) => {
    const a = e.target.closest(".srcref[data-src]");
    if (!a) return;
    e.preventDefault();
    openSource(a.dataset.src, +a.dataset.page || 1, (a.getAttribute("title") || "").split(" · p.")[0]);
  });
  let libQuery = "";
  function viewLibrary() {
    const T = t();
    chrome("library");
    const groups = [...TOPICS.map((tp) => [tp.id, pick(tp.title)]), ["", T.otherDocs]];
    const match = (d) => !libQuery || `${d.title} ${d.authors} ${d.year} ${d.slug}`.toLowerCase().includes(libQuery.toLowerCase());
    const row = (d) => `<a class="li" href="#" data-open="${esc(d.slug)}"><span class="ic lib-ic">${d.kind === "textbook" ? ICON.reading : ICON.paper}</span><span class="info"><b>${esc(d.title)}</b><span class="muted">${esc(d.authors)} · ${d.year} · ${esc(d.kind)}${d.pages ? " · " + esc(T.pagesN(d.pages)) : ""}${d.cited ? ` · <span style="color:var(--green)">${esc(T.cited)}</span>` : ""}</span></span></a>`;
    const seen = new Set();
    const body = groups.map(([id, name]) => {
      const docs = LIB.filter((d) => (id ? (d.topics || []).includes(id) : !(d.topics || []).some((x) => TOPIC[x])) && !seen.has(d.slug) && match(d));
      docs.forEach((d) => seen.add(d.slug));
      docs.sort((a, b) => (a.kind === "textbook" ? 0 : 1) - (b.kind === "textbook" ? 0 : 1) || b.year - a.year);
      return docs.length ? `<h2>${esc(name)} <span class="muted small">${docs.length}</span></h2><div class="card list">${docs.map(row).join("")}</div>` : "";
    }).join("");
    main.innerHTML = `<div class="wrap narrow"><h1>${esc(T.library)}</h1><p class="muted">${esc(T.libIntro)}${window.PREP_PUBLIC ? " " + esc(T.publicNoPdf) : ""}</p>${OFFLINE_OK ? '<div class="card offl" id="offl"></div>' : ""}
      <input class="lib-filter" id="lib-q" type="search" placeholder="${esc(T.libFilter)}" value="${esc(libQuery)}">${body || `<div class="empty">${esc(T.none)}</div>`}</div>`;
    const q = $("#lib-q");
    q.oninput = () => { libQuery = q.value; const pos = q.selectionStart; viewLibrary(); const q2 = $("#lib-q"); q2.focus(); q2.setSelectionRange(pos, pos); };
    $$("[data-open]", main).forEach((a) => (a.onclick = (e) => { e.preventDefault(); openSource(a.dataset.open, 1); }));
    if (OFFLINE_OK) drawOffline();
  }
  // Offline copies of the originals (web build): the service worker keeps every PDF it has
  // served in the "prep-pdf" cache; "Save all" walks the library and fetches what is missing.
  const OFFLINE_OK = !NATIVE && !window.PREP_PUBLIC && location.protocol === "https:" && "caches" in window;
  const OFF = { running: false, stop: false, i: 0, total: 0, fail: 0, saved: null, mb: 0 };
  const pdfUrl = (slug) => new URL(`pdf/${slug}.pdf`, location.href).href;
  async function countOffline() {
    const c = await caches.open("prep-pdf");
    let n = 0;
    for (const d of LIB) if (await c.match(pdfUrl(d.slug))) n++;
    OFF.saved = n;
    try { const e = await navigator.storage.estimate(); OFF.mb = Math.round((e.usage || 0) / 1e6); } catch {}
  }
  async function drawOffline() {
    const box = $("#offl");
    if (!box) return;
    const T = t();
    if (OFF.saved === null && !OFF.running) await countOffline();
    const sub = OFF.running ? T.saving(OFF.i, OFF.total) : OFF.fail ? T.saveFail(OFF.fail) : OFF.saved === LIB.length ? T.saveDone : T.offlineLibSub(OFF.saved, LIB.length, OFF.mb);
    box.innerHTML = `<div class="setrow"><div class="lbl">${esc(T.offlineLib)}<small>${esc(sub)}</small></div>${OFF.running ? `<button class="btn" id="off-stop">${esc(T.stop)}</button>` : OFF.saved === LIB.length ? "" : `<button class="btn primary" id="off-go">${esc(T.saveAll)}</button>`}</div>`;
    if ($("#off-stop")) $("#off-stop").onclick = () => { OFF.stop = true; };
    if ($("#off-go")) $("#off-go").onclick = saveAllOffline;
  }
  async function saveAllOffline() {
    try { await navigator.storage?.persist?.(); } catch {}
    const c = await caches.open("prep-pdf");
    const todo = [];
    for (const d of LIB) if (!(await c.match(pdfUrl(d.slug)))) todo.push(d.slug);
    Object.assign(OFF, { running: true, stop: false, i: 0, total: todo.length, fail: 0 });
    drawOffline();
    const worker = async () => {
      for (let slug = todo.shift(); slug && !OFF.stop; slug = todo.shift()) {
        try {
          const r = await fetch(pdfUrl(slug));
          if (!r.ok) throw new Error(r.status);
          // Through the service worker the file is cached on the way; without one, cache it here.
          if (navigator.serviceWorker?.controller) await r.arrayBuffer(); else await c.put(pdfUrl(slug), r);
        } catch { OFF.fail++; }
        OFF.i++;
        drawOffline();
      }
    };
    await Promise.all([worker(), worker()]);
    OFF.running = false;
    await countOffline();
    drawOffline();
  }

  // ------------------------------------------------------------------ notes (typed + Apple Pencil ink)
  // Typed notes live in S.notes[key]; handwriting lives in INK[key] as vector strokes
  // {c: colour, w: width, pts: [[x, y, pressure], …]} in coordinates normalised to the
  // canvas (x in 0..1, y in units of canvas width), saved through the native "ink"
  // handler (Documents/ink.json) or localStorage in a browser.
  // In a browser (web build) ink goes to IndexedDB, because localStorage holds only ~5 MB
  // on iOS; it is loaded asynchronously and merged in (see inkReady).
  const INK = (() => {
    try { if (window.__PREP_INK__) return typeof window.__PREP_INK__ === "string" ? JSON.parse(window.__PREP_INK__) : window.__PREP_INK__; } catch {}
    try { return JSON.parse(localStorage.getItem("prep-ink") || "{}"); } catch { return {}; }
  })();
  const idb = (mode, fn) => new Promise((res, rej) => {
    const r = indexedDB.open("prep", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onerror = () => rej(r.error);
    r.onsuccess = () => { const tx = r.result.transaction("kv", mode); const q = fn(tx.objectStore("kv")); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); };
  });
  const inkReady = NATIVE || !window.indexedDB ? Promise.resolve() : idb("readonly", (st) => st.get("ink")).then((v) => {
    if (v) { const stored = JSON.parse(v); for (const k of Object.keys(stored)) if (!INK[k]) INK[k] = stored[k]; }
    else if (Object.keys(INK).length) saveInk();
    try { localStorage.removeItem("prep-ink"); } catch {}
  }).catch(() => {});
  let inkTimer = null;
  function saveInk() {
    clearTimeout(inkTimer);
    inkTimer = setTimeout(() => {
      const s2 = JSON.stringify(INK);
      if (NATIVE) { try { window.webkit.messageHandlers.ink.postMessage(s2); } catch {} return; }
      if (window.indexedDB) idb("readwrite", (st) => st.put(s2, "ink")).catch(() => { try { localStorage.setItem("prep-ink", s2); } catch {} });
      else try { localStorage.setItem("prep-ink", s2); } catch {}
    }, 400);
  }
  const hasNote = (key) => !!(S.notes[key] || (INK[key] && INK[key].length));
  function noteFab(key, title) {
    $("#note-fab")?.remove();
    const b = document.createElement("button");
    b.id = "note-fab";
    b.className = "note-fab" + (hasNote(key) ? " has" : "");
    b.innerHTML = `${ICON.notes}<span>${esc(t().myNotes)}</span>`;
    b.onclick = () => openNotes(key, title);
    document.body.append(b);
  }
  function drawStrokes(ctx, strokes, W) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const st of strokes) {
      const pts = st.pts;
      if (!pts.length) continue;
      ctx.strokeStyle = st.c;
      if (pts.length === 1) { ctx.fillStyle = st.c; ctx.beginPath(); ctx.arc(pts[0][0] * W, pts[0][1] * W, (st.w * W * (0.5 + pts[0][2])) / 2, 0, 7); ctx.fill(); continue; }
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0, p0] = pts[i - 1], [x1, y1, p1] = pts[i];
        ctx.lineWidth = st.w * W * (0.45 + 0.9 * ((p0 + p1) / 2));
        ctx.beginPath();
        ctx.moveTo(x0 * W, y0 * W);
        ctx.lineTo(x1 * W, y1 * W);
        ctx.stroke();
      }
    }
  }
  function openNotes(key, title) {
    const T = t();
    $("#note-drawer")?.remove();
    const dr = document.createElement("div");
    dr.id = "note-drawer";
    dr.className = "note-drawer";
    let tab = S.noteTab || "text";
    dr.innerHTML = `<div class="nd-head"><div><div class="nd-k">${esc(T.notesFor)}</div><div class="nd-t">${esc(title)}</div></div><button class="icon-x" id="nd-close" aria-label="close">✕</button></div>
      <div class="nd-tabs"><button data-tab="text">${esc(T.noteText)}</button><button data-tab="ink">${esc(T.noteInk)}</button></div>
      <div class="nd-body" id="nd-body"></div>`;
    document.body.append(dr);
    setTimeout(() => dr.classList.add("open"), 16);
    const close = () => { dr.classList.remove("open"); setTimeout(() => dr.remove(), 250); const f = $("#note-fab"); if (f) f.classList.toggle("has", hasNote(key)); };
    $("#nd-close", dr).onclick = close;
    function show() {
      $$(".nd-tabs button", dr).forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
      const body = $("#nd-body", dr);
      if (tab === "text") {
        body.innerHTML = `<textarea class="nd-text" placeholder="${esc(T.notesPh)}">${esc(S.notes[key] || "")}</textarea>`;
        const ta = $("textarea", body);
        ta.oninput = () => { ta.value.trim() ? (S.notes[key] = ta.value) : delete S.notes[key]; save(); };
        setTimeout(() => ta.focus(), 50);
        return;
      }
      body.innerHTML = `<div class="nd-tools"><span class="nd-colors">${["#1f1f1f", "#0056d2", "#d30001", "#1f8354"].map((c, i) => `<button class="sw${i === 0 ? " on" : ""}" data-c="${c}" style="background:${c}"></button>`).join("")}</span>
        <span class="seg"><button data-w="0.004" class="on">S</button><button data-w="0.008">M</button><button data-w="0.016">L</button></span>
        <button class="btn small" data-act="eraser">${esc(T.eraser)}</button><button class="btn small" data-act="undo">${esc(T.undo)}</button><button class="btn small" data-act="clear">${esc(T.clearAll)}</button></div>
        <div class="nd-canvas-wrap"><canvas class="nd-canvas"></canvas></div><div class="muted small" style="padding:6px 2px">${esc(T.inkHint)}</div>`;
      const wrap = $(".nd-canvas-wrap", body), cv = $("canvas", body), ctx = cv.getContext("2d");
      const strokes = (INK[key] ||= []);
      const history = [];
      let color = "#1f1f1f", width = 0.004, erasing = false, penSeen = false, cur = null;
      function resize() {
        const r = wrap.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
        cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
        cv.style.width = r.width + "px"; cv.style.height = r.height + "px";
        redraw();
      }
      function redraw() {
        const dpr = window.devicePixelRatio || 1, W = cv.width / dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, cv.height / dpr);
        // ruled lines
        ctx.strokeStyle = "rgba(0,86,210,0.10)"; ctx.lineWidth = 1;
        for (let y = 0.06 * W; y < cv.height / dpr; y += 0.06 * W) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        drawStrokes(ctx, strokes, W);
      }
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width, e.pointerType === "pen" ? (e.pressure || 0.5) : 0.5]; };
      function eraseAt(pt) {
        const rad = 0.02;
        const removed = [];
        for (let i = strokes.length - 1; i >= 0; i--) if (strokes[i].pts.some(([x, y]) => Math.hypot(x - pt[0], y - pt[1]) < rad)) removed.push([i, strokes.splice(i, 1)[0]]);
        if (removed.length) { history.push({ erase: removed }); redraw(); }
      }
      cv.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "pen") penSeen = true;
        if (penSeen && e.pointerType === "touch") return; // palm rejection once a Pencil is in use
        e.preventDefault();
        try { cv.setPointerCapture(e.pointerId); } catch {}
        const pt = pos(e);
        if (erasing) { cur = { erase: true }; eraseAt(pt); return; }
        cur = { c: color, w: width, pts: [pt.map((v) => +v.toFixed(4))] };
        strokes.push(cur);
        redraw();
      });
      cv.addEventListener("pointermove", (e) => {
        if (!cur) return;
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        if (cur.erase) { evs.forEach((ev) => eraseAt(pos(ev))); return; }
        evs.forEach((ev) => cur.pts.push(pos(ev).map((v) => +v.toFixed(4))));
        redraw();
      });
      const end = () => { if (!cur) return; if (!cur.erase) history.push({ add: cur }); cur = null; saveInk(); };
      cv.addEventListener("pointerup", end);
      cv.addEventListener("pointercancel", end);
      $$(".sw", body).forEach((b) => (b.onclick = () => { color = b.dataset.c; erasing = false; $$(".sw", body).forEach((x) => x.classList.toggle("on", x === b)); $('[data-act="eraser"]', body).classList.remove("primary"); }));
      $$("[data-w]", body).forEach((b) => (b.onclick = () => { width = +b.dataset.w; $$("[data-w]", body).forEach((x) => x.classList.toggle("on", x === b)); }));
      $('[data-act="eraser"]', body).onclick = (ev) => { erasing = !erasing; ev.currentTarget.classList.toggle("primary", erasing); };
      $('[data-act="undo"]', body).onclick = () => { const h = history.pop(); if (!h) return; if (h.add) { const i = strokes.lastIndexOf(h.add); if (i >= 0) strokes.splice(i, 1); } else h.erase.reverse().forEach(([i, st]) => strokes.splice(i, 0, st)); redraw(); saveInk(); };
      $('[data-act="clear"]', body).onclick = () => { if (!strokes.length || !confirm(T.clearQ)) return; strokes.length = 0; history.length = 0; redraw(); saveInk(); };
      new ResizeObserver(resize).observe(wrap);
      resize();
    }
    $$(".nd-tabs button", dr).forEach((b) => (b.onclick = () => { tab = b.dataset.tab; S.noteTab = tab; save(); show(); }));
    show();
  }
  function inkThumb(key) {
    const st = INK[key];
    if (!st || !st.length) return "";
    const c = document.createElement("canvas"), W = 220;
    c.width = W * 2; c.height = 150 * 2;
    const ctx = c.getContext("2d");
    ctx.scale(2, 2);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, 150);
    drawStrokes(ctx, st, W);
    return `<img class="ink-thumb" src="${c.toDataURL("image/png")}" alt="">`;
  }

  // Shared with ink.js (Pencil annotation, notebooks) and roadmap.js (overview map).
  const APPCTX = { get lang() { return S.lang; }, TOPICS, TOPIC, S, save, t, pick, esc, course, crumbs, topicPct, chapterDone: (tid, c) => chapterDone(tid, c), chapterUnits: (tid, c) => chapterUnits(tid, c), modOf, MOD_ORDER, scroller: () => scroller() };

  // ------------------------------------------------------------------ router
  function render(keepScroll) {
    clearInterval(timerId);
    $("#note-fab")?.remove();
    $("#note-drawer")?.remove();
    const y = scroller().scrollTop;
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    const [a, b, c, d] = parts;
    let p;
    if (a === "t") p = viewCourse(b);
    else if (a === "c") p = viewChapter(b, c);
    else if (a === "p") p = viewPrimer(b, c);
    else if (a === "q") p = viewItem(`${b}/${c}/${d}`, "study");
    else if (a === "n") p = viewNotation(b);
    else if (a === "coverage") p = viewCoverage(b || null);
    else if (a === "review") p = viewReview(b === "go" && !!REV);
    else if (a === "drill") p = viewDrill(false);
    else if (a === "mock") p = viewMock(b === "go" && !!MOCK);
    else if (a === "saved") p = viewSaved();
    else if (a === "library") p = viewLibrary();
    else if (a === "search") p = viewSearch(parts.slice(1).join("/"));
    else if (a === "settings") p = viewSettings();
    else if (a === "map" && window.PrepMap) { chrome("home"); p = window.PrepMap.view(main, APPCTX, b || null); }
    else if (a === "nb" && window.PrepInk && TOPIC[b]) { chrome("home"); p = window.PrepInk.viewNotebook(main, APPCTX, b); }
    else p = viewHome();
    // Pages that can be annotated with the Pencil: lessons, items, notation pages and notebooks.
    const inkKey = ["p", "q", "n", "nb"].includes(a) ? parts.filter(Boolean).join("/") : null;
    Promise.resolve(p).then(() => { if ($("#home-off")) drawOfflineData(); const sc = scroller(); if (keepScroll) sc.scrollTop = y; else if (!["q"].includes(a)) sc.scrollTop = 0; window.Viz?.mountAll(main); window.PrepInk?.attach(inkKey, main, APPCTX); });
  }
  window.addEventListener("hashchange", () => render(false));

  // Keyboard (iPad keyboard): ← → items, 1–4 rate, space = next step / next section.
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("textarea, input")) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const links = $$(".next-bar a.btn", main);
      const l = e.key === "ArrowRight" ? links.find((x) => x.classList.contains("primary")) : links.find((x) => !x.classList.contains("primary"));
      if (l) { e.preventDefault(); location.hash = l.getAttribute("href"); }
    } else if (/^[1-4]$/.test(e.key)) {
      const b = $(`.rate-btns button[data-r="${+e.key - 1}"]`, main);
      if (b) { e.preventDefault(); b.click(); }
    } else if (e.key === " ") {
      const steps = $(".steps", main);
      if (steps && steps.closest("details")?.open && steps.showNext?.()) { e.preventDefault(); return; }
      const nxt = $$("details.panel[data-k]:not([hidden]):not(.k-notes)", main).find((x) => !x.open);
      if (nxt) { e.preventDefault(); nxt.open = true; nxt.scrollIntoView({ behavior: "smooth", block: "start" }); }
    }
  });

  // Offline data (web build): what the service worker has stored, a download button that
  // checks for a new version and re-downloads anything missing, and progress in bytes.
  const SWST = { st: null, prog: null, busy: false, mode: "", note: "", err: "", noCheck: false, usage: null, quota: null, persisted: null };
  const swCapable = () => "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost");
  const fmtMB = (b) => (b / 1e6).toFixed(1);
  function offlineGroups(files) {
    const T = t();
    const g = new Map();
    for (const [path, bytes, ok] of files) {
      const m = path.match(/^data\/([\w-]+)\.(js|bin)$/);
      const key = m && TOPIC[m[1]] ? m[1] : path.startsWith("data/") ? "_index" : "_shell";
      const name = key === "_index" ? T.offIndex : key === "_shell" ? T.offShell : pick(TOPIC[key].title);
      const e = g.get(key) || { name, bytes: 0, have: 0, n: 0 };
      e.bytes += bytes; e.n += 1; if (ok) e.have += 1;
      g.set(key, e);
    }
    return [...TOPICS.map((tp) => tp.id), "_index", "_shell"].filter((k) => g.has(k)).map((k) => g.get(k));
  }
  function drawOfflineData() {
    const box = $("#offdata") || $("#home-off");
    if (!box) return;
    const T = t();
    box.hidden = false;
    const sw = swCapable();
    const { st, prog: p } = SWST;
    const files = st?.files || [];
    const complete = !!st && st.cached >= st.total;
    const standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
    const lines = [];
    let pct = null;
    if (!sw) lines.push(T.offlineNoSW);
    else if (p) {
      pct = p.totalBytes ? Math.min(100, Math.floor((100 * p.bytes) / p.totalBytes)) : Math.floor((100 * p.done) / p.total);
      lines.push((p.phase === "install" && st ? T.offNew + " " : "") + T.offDl((p.file || "").replace(/^data\//, ""), pct, fmtMB(p.bytes), fmtMB(p.totalBytes), p.done, p.total));
    } else if (st) {
      lines.push(st.totalBytes ? T.offStored(fmtMB(st.bytes), fmtMB(st.totalBytes), st.cached, st.total) : T.offStoredFiles(st.cached, st.total));
      lines.push(complete ? T.offAll : T.offMissing(st.total - st.cached));
      if (!complete) pct = st.totalBytes ? Math.floor((100 * st.bytes) / st.totalBytes) : Math.floor((100 * st.cached) / st.total);
    } else lines.push(SWST.busy ? T.offChecking : T.offlineNone);
    if (SWST.note) lines.push(SWST.note);
    if (SWST.err) lines.push(SWST.err);
    const meta = [];
    if (st?.version) meta.push(T.offVersion(st.version.slice(0, 8), INDEX.built ? new Date(INDEX.built).toLocaleString(S.lang === "zh" ? "zh-CN" : "en-GB", { dateStyle: "short", timeStyle: "short" }) : "—"));
    if (SWST.usage != null) meta.push(T.offUsage(fmtMB(SWST.usage), SWST.quota ? (SWST.quota / 1e9).toFixed(1) : "", SWST.persisted == null ? T.persistUnknown : SWST.persisted ? T.persistOn : T.persistOff));
    if (!standalone && sw) meta.push(T.installHint);
    const groups = offlineGroups(files);
    const doneGroups = groups.filter((x) => x.have === x.n).length;
    const rows = groups.map((x) => `<li><span>${esc(x.name)}</span><span class="muted">${fmtMB(x.bytes)} MB</span><b class="${x.have === x.n ? "ok" : "no"}">${x.have === x.n ? "✓" : `${x.have}/${x.n}`}</b></li>`).join("");
    const busy = SWST.busy || !!p;
    box.innerHTML = `<div class="setrow" style="border-top:0"><div class="lbl">${esc(T.offlineData)}<small>${lines.map(esc).join("<br>")}</small>${pct != null ? `<div class="offbar"><i style="width:${pct}%"></i></div>` : ""}</div>${sw ? `<button class="btn primary" id="off-dl"${busy ? " disabled" : ""}>${esc(busy ? T.offBusy : T.downloadAll)}</button>` : ""}</div>${groups.length ? `<details class="offlist"${complete ? "" : " open"}><summary>${esc(T.offDetails(doneGroups, groups.length))}</summary><ul>${rows}</ul></details>` : ""}${meta.length ? `<div class="offmeta muted">${meta.map(esc).join("<br>")}</div>` : ""}`;
    if ($("#off-dl")) $("#off-dl").onclick = downloadOffline;
  }
  async function downloadOffline() {
    const T = t();
    Object.assign(SWST, { busy: true, note: "", err: "", noCheck: false, mode: "" });
    drawOfflineData();
    try { await navigator.storage?.persist?.(); } catch {}
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("sw.js"));
      try { await reg.update(); } catch { SWST.noCheck = true; }
      if (reg.installing || reg.waiting) { SWST.mode = "update"; return; } // a new version downloads; its messages follow
      const act = reg.active || navigator.serviceWorker.controller;
      if (!act) { SWST.mode = "update"; return; } // first install still running
      SWST.mode = "fill";
      act.postMessage({ prep: "fill" });
    } catch {
      Object.assign(SWST, { busy: false, err: T.offFail });
      drawOfflineData();
    }
  }
  async function refreshUsage() {
    try { const e = await navigator.storage.estimate(); SWST.usage = e.usage ?? null; SWST.quota = e.quota ?? null; } catch {}
    try { SWST.persisted = await navigator.storage.persisted(); } catch {}
  }
  async function askStatus() {
    await refreshUsage();
    try { (navigator.serviceWorker.controller || (await navigator.serviceWorker.getRegistration())?.active)?.postMessage({ prep: "status" }); } catch {}
    drawOfflineData();
  }
  if (!NATIVE && "serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", async (e) => {
      const m = e.data || {};
      const T = t();
      if (m.prep === "progress") {
        const running = m.done < m.total;
        SWST.prog = running ? m : null;
        if (running && m.phase === "install") SWST.busy = true;
      }
      if (m.prep === "status") {
        SWST.st = m;
        SWST.prog = null;
        if (m.checked) Object.assign(SWST, { busy: false, note: m.fetched ? T.offRepaired(m.fetched) : SWST.noCheck ? T.offNoCheck : T.offUpToDate(m.total, fmtMB(m.bytes || 0)) });
        else if (SWST.busy && m.cached >= m.total) Object.assign(SWST, { busy: false, note: SWST.mode === "update" ? T.offUpdated : SWST.note });
        else if (m.cached < m.total) SWST.note = ""; // an earlier "up to date" no longer holds
      }
      if (m.prep === "error") Object.assign(SWST, { prog: null, busy: false, err: T.offFail });
      await refreshUsage();
      drawOfflineData();
      if (m.prep === "error") askStatus();
    });
    navigator.serviceWorker.ready.then(() => setTimeout(askStatus, 300)).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => setTimeout(askStatus, 300));
  }

  applyTheme();
  render(false);
  if (!NATIVE) {
    try { navigator.storage?.persist?.(); } catch {}
    inkReady.then(() => { if (Object.keys(INK).length && !$("#note-drawer")) render(true); });
  }
  window.PREP_UPDATED = () => {
    if ($("#update-bar")) return;
    const b = document.createElement("div");
    b.id = "update-bar";
    b.innerHTML = `<span>${esc(t().updated)}</span><button class="btn primary">${esc(t().reloadBtn)}</button>`;
    b.querySelector("button").onclick = () => location.reload();
    document.body.append(b);
  };
  try { window.webkit?.messageHandlers?.log?.postMessage(`ready: ${TOPICS.length} courses, ${ALL.length} items, built ${INDEX.built}, saved state ${window.__PREP_SAVED__ ? "restored" : "empty"}`); } catch {}
})();
