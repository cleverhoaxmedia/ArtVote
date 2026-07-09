// ============================================================
// Fan Art Faves — voting app
// Contests: "still" and "video"
// Slots: first (🤩 3pts) / second (😀 2pts) / third (🙂 1pt)
// ============================================================
const firebaseConfig = window.FANVOTE_FIREBASE_CONFIG;
const EVENT_NAME = window.FANVOTE_EVENT_NAME;
const ADMIN_PASSWORD = window.FANVOTE_ADMIN_PASSWORD || "admin";
const SHEET_CSV_URL = window.FANVOTE_SHEET_CSV_URL || "";

const DEMO_MODE = firebaseConfig.apiKey === "PASTE_YOUR_API_KEY";

const SLOTS = ["first", "second", "third"];
const SLOT_META = {
  first:  { emoji: "🤩", label: "WOW!",  pts: 3 },
  second: { emoji: "😀", label: "Cool!", pts: 2 },
  third:  { emoji: "🙂", label: "Nice!", pts: 1 },
};
const CONTESTS = {
  still: { name: "Still Art Contest", folder: "still" },
  video: { name: "Video Contest",     folder: "video" },
};
const ADMIN_POINTS = { first: 3, second: 2, third: 1 };

// ---------------- Utilities ----------------
// Escape user-supplied text (sheet titles/authors/URLs) before it goes into HTML.
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

// ---------------- State ----------------
let contest = "still";
let entries = [];                 // [{num, imgUrl, videoUrl?, title, author}]
let sheetRowsCache = null;        // parsed Google Sheet rows (fetched once)
let picks   = { first: null, second: null, third: null }; // entry nums
let armed   = null;               // "first" | "second" | "third" | null
let votingOpen = DEMO_MODE
  ? { still: true, video: true }
  : { still: false, video: false };
let db = null;
let adminUnlocked = false;

// ---------------- DOM ----------------
const $ = (id) => document.getElementById(id);
const gallery = $("gallery");
const slotbar = $("slotbar");
const slotEls = Object.fromEntries(
  [...slotbar.querySelectorAll(".slot")].map((el) => [el.dataset.slot, el])
);
const submitBtn = $("submitBtn");
const editPicks = $("editPicks");
const clearPicks = $("clearPicks");
const banner = $("banner");

// ============================================================
// Firebase (skipped entirely in demo mode)
// ============================================================
async function initFirebase() {
  const { initializeApp } = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"
  );
  const fs = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
  );
  const app = initializeApp(firebaseConfig);
  db = { ...fs, ref: fs.doc, inst: fs.getFirestore(app) };
}

async function loadFlags() {
  if (DEMO_MODE) return;
  try {
    const snap = await db.getDoc(db.doc(db.inst, "config", "flags"));
    if (snap.exists()) {
      const d = snap.data();
      votingOpen.still = d.stillOpen === true;
      votingOpen.video = d.videoOpen === true;
    }
  } catch (e) {
    console.error("Could not read voting flags:", e);
  }
}

// Minimal CSV parser: handles quoted fields, embedded commas/newlines, "" escapes.
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Some shared links point at web pages instead of raw image files. Normalize the
// common ones so thumbnails can be used directly in <img src="...">.
function youtubeId(url) {
  return (
    url.match(/[?&]v=([^&#]+)/i)?.[1] ||
    url.match(/youtu\.be\/([^?&#/]+)/i)?.[1] ||
    url.match(/youtube\.com\/shorts\/([^?&#/]+)/i)?.[1] ||
    url.match(/youtube\.com\/embed\/([^?&#/]+)/i)?.[1] ||
    ""
  );
}

function dailymotionId(url) {
  return url.match(/dailymotion\.com\/video\/([^_?&#/]+)/i)?.[1] || "";
}

function vimeoId(url) {
  return url.match(/vimeo\.com\/(?:.*\/)?(\d+)/i)?.[1] || "";
}

function videoThumbnailUrl(url) {
  const yt = youtubeId(url);
  if (yt) return `https://img.youtube.com/vi/${encodeURIComponent(yt)}/hqdefault.jpg`;
  const dm = dailymotionId(url);
  if (dm) return `https://www.dailymotion.com/thumbnail/video/${encodeURIComponent(dm)}`;
  const vi = vimeoId(url);
  if (vi) return `https://vumbnail.com/${encodeURIComponent(vi)}.jpg`;
  return "";
}

function normalizeImageUrl(url) {
  url = String(url || "").trim();
  if (!url) return "";
  const videoThumb = videoThumbnailUrl(url);
  if (videoThumb) return videoThumb;

  const gh = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
  if (gh) return `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}`;

  const driveId =
    url.match(/drive\.google\.com\/file\/d\/([^/]+)/i)?.[1] ||
    url.match(/[?&]id=([^&#]+)/i)?.[1];
  if (driveId) return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(driveId)}`;

  return url;
}

// Fetch the published Google Sheet (once) and turn it into entry rows.
async function fetchSheetRows() {
  if (sheetRowsCache) return sheetRowsCache;
  const res = await fetch(SHEET_CSV_URL);
  if (!res.ok) throw new Error("Sheet fetch failed: " + res.status);
  const rows = parseCSV(await res.text()).filter((r) => r.some((c) => c.trim() !== ""));
  if (!rows.length) return (sheetRowsCache = []);
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => {           // first matching header wins (accepts aliases)
    for (const n of names) { const i = headers.indexOf(n); if (i >= 0) return i; }
    return -1;
  };
  const ci = {
    contest: col("contest"),
    num:     col("num", "no", "number", "#"),
    title:   col("title", "name"),
    author:  col("author", "artist", "by"),
    image:   col("image", "link", "url", "img", "file"),
    watch:   col("watch", "video", "youtube"),
  };
  const cell = (r, i) => (i >= 0 && r[i] != null ? r[i].trim() : "");
  const seq = {};                       // per-contest counter for auto-numbering
  sheetRowsCache = rows.slice(1).map((r) => {
    const contest = cell(r, ci.contest).toLowerCase();
    const rawImage = cell(r, ci.image);
    const rawWatch = cell(r, ci.watch);
    const image = normalizeImageUrl(rawImage || rawWatch);
    let num = parseInt(cell(r, ci.num), 10);
    if (Number.isNaN(num) && image) {   // no "num" column → number by order within each contest
      seq[contest] = (seq[contest] || 0) + 1;
      num = seq[contest];
    }
    return {
      contest, num, image,
      title: cell(r, ci.title),
      author: cell(r, ci.author),
      watch: rawWatch || (videoThumbnailUrl(rawImage) ? rawImage : ""),
    };
  });
  return sheetRowsCache;
}

async function loadEntries(c) {
  if (DEMO_MODE) return demoEntries(c);
  if (!SHEET_CSV_URL || SHEET_CSV_URL.startsWith("PASTE_")) return [];
  const rows = await fetchSheetRows();
  return rows
    .filter((r) => r.contest === c && r.image && !Number.isNaN(r.num))
    .map((r) => ({
      num: r.num, imgUrl: r.image, title: r.title,
      author: r.author, videoUrl: r.watch || null,
    }))
    .sort((a, b) => a.num - b.num);
}

async function submitBallot() {
  if (DEMO_MODE) return;
  await db.addDoc(db.collection(db.inst, "ballots"), {
    contest,
    picks: { ...picks },
    submittedAt: db.serverTimestamp(),
  });
}

async function loadAdminResults() {
  if (DEMO_MODE) {
    return { demo: true, total: 0, counts: { still: 0, video: 0 }, tallies: { still: {}, video: {} } };
  }
  const snap = await db.getDocs(db.collection(db.inst, "ballots"));
  const tallies = { still: {}, video: {} };
  const counts = { still: 0, video: 0 };
  snap.forEach((doc) => {
    const { contest: ballotContest, picks: ballotPicks } = doc.data();
    if (!tallies[ballotContest] || !ballotPicks) return;
    counts[ballotContest]++;
    for (const slot of Object.keys(ADMIN_POINTS)) {
      const num = ballotPicks[slot];
      if (num == null) continue;
      tallies[ballotContest][num] = (tallies[ballotContest][num] || 0) + ADMIN_POINTS[slot];
    }
  });
  return { demo: false, total: snap.size, counts, tallies };
}

// ---------------- Demo data ----------------
const DEMO_TITLES = [
  "Sunset Dragon", "Neon Alley", "Quiet Forest", "Cosmic Cat",
  "Paper Robots", "Tidal Bloom", "Midnight Market", "Golden Hour",
];
const DEMO_AUTHORS = [
  "Alex R.", "Sam K.", "Jordan P.", "Riley M.",
  "Casey T.", "Devon L.", "Morgan W.", "Quinn B.",
];
function demoEntries(c) {
  const hues = [8, 42, 95, 160, 200, 250, 290, 330];
  return hues.map((h, i) => {
    const num = i + 1;
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'>` +
      `<rect width='400' height='400' fill='hsl(${h},70%,82%)'/>` +
      `<circle cx='200' cy='170' r='90' fill='hsl(${h},70%,60%)'/>` +
      `<text x='200' y='330' font-family='sans-serif' font-size='42' font-weight='bold' ` +
      `fill='hsl(${h},50%,30%)' text-anchor='middle'>${c === "video" ? "🎬" : "🖼️"} Entry ${num}</text></svg>`;
    return {
      num,
      imgUrl: "data:image/svg+xml," + encodeURIComponent(svg),
      title: DEMO_TITLES[i],
      author: DEMO_AUTHORS[i],
      videoUrl: c === "video" ? "https://example.com/watch/" + num : null,
    };
  });
}

// ============================================================
// Local vote lock (one vote per device)
// ============================================================
const voteKey = (c) => `fanvote_voted_${c}`;
const hasVoted = (c) => !DEMO_MODE ? !!localStorage.getItem(voteKey(c)) : !!sessionVotes[c];
const sessionVotes = {}; // demo-mode in-memory ballots

function lockVote(c, p) {
  if (DEMO_MODE) { sessionVotes[c] = p; return; }
  localStorage.setItem(voteKey(c), JSON.stringify(p));
}
function savedVote(c) {
  if (DEMO_MODE) return sessionVotes[c] || null;
  try { return JSON.parse(localStorage.getItem(voteKey(c))); } catch { return null; }
}

// ============================================================
// Rendering
// ============================================================
function renderGallery() {
  gallery.classList.remove("admin-view");
  gallery.innerHTML = "";
  if (!entries.length) {
    gallery.innerHTML = `<p class="gallery-note">No entries yet — check back soon! 🎨</p>`;
    return;
  }
  const locked = hasVoted(contest) || !votingOpen[contest];
  for (const e of entries) {
    const card = document.createElement("article");
    card.className = "entry" + (locked ? " locked" : "");
    card.dataset.num = e.num;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Select entry ${e.num}: ${e.title || "Untitled"}`);

    const slotOf = SLOTS.find((s) => picks[s] === e.num);
    if (slotOf) card.classList.add(`picked-${slotOf}`);
    const linkDisabled = e.videoUrl && armed !== null;
    const mediaHtml = e.videoUrl
      ? `<a class="entry-media video-link${linkDisabled ? " link-disabled" : ""}" href="${esc(e.videoUrl)}" target="_blank" rel="noopener" aria-label="Open video for entry ${e.num}" aria-disabled="${linkDisabled ? "true" : "false"}">
          <img src="${esc(e.imgUrl)}" alt="${esc(e.title || "Entry " + e.num)}" loading="lazy" />
        </a>`
      : `<div class="entry-media">
          <img src="${esc(e.imgUrl)}" alt="${esc(e.title || "Entry " + e.num)}" loading="lazy" />
          <button class="expand-btn" type="button" aria-label="Expand entry ${e.num}">⛶</button>
        </div>`;

    card.innerHTML = `
      ${mediaHtml}
      <span class="entry-num">#${e.num}</span>
      ${slotOf ? `<span class="entry-badge">${SLOT_META[slotOf].emoji}</span>` : ""}
      <div class="entry-caption">
        <span class="entry-title">${esc(e.title || "Untitled")}</span>
        ${e.author ? `<span class="entry-author">by ${esc(e.author)}</span>` : ""}
      </div>
      ${e.videoUrl ? `<a class="watch-btn${linkDisabled ? " link-disabled" : ""}" href="${esc(e.videoUrl)}" target="_blank" rel="noopener" aria-disabled="${linkDisabled ? "true" : "false"}">${linkDisabled ? "Tap to pick this video" : "▶️ Click to watch!"}</a>` : ""}
    `;
    card.querySelectorAll(".link-disabled").forEach((link) => {
      link.addEventListener("click", (ev) => {
        ev.preventDefault();
        onEntryTap(e.num);
      });
    });
    card.querySelector(".expand-btn")?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openLightbox(e);
    });
    card.addEventListener("click", (ev) => {
      if (ev.target.closest("a, button")) return; // link/expand, not a vote tap
      onEntryTap(e.num);
    });
    card.addEventListener("keydown", (ev) => {
      if (ev.target.closest("a, button")) return;
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        onEntryTap(e.num);
      }
    });
    gallery.appendChild(card);
  }
}

function renderSlotbar() {
  const allFilled = SLOTS.every((s) => picks[s] !== null);
  const locked = hasVoted(contest) || !votingOpen[contest];
  slotbar.classList.toggle("has-armed", armed !== null);
  slotbar.classList.toggle("complete", allFilled && armed === null);
  editPicks.hidden = !(allFilled && armed === null);
  const anyPick = SLOTS.some((s) => picks[s] !== null);
  clearPicks.hidden = !anyPick || locked;
  submitBtn.disabled = locked;

  for (const s of SLOTS) {
    const el = slotEls[s];
    el.classList.toggle("armed", armed === s);
    el.classList.toggle("filled", picks[s] !== null);
    el.setAttribute("aria-pressed", String(armed === s));
    const pickChip = el.querySelector(".slot-pick");
    pickChip.hidden = picks[s] === null;
    pickChip.textContent = picks[s] !== null ? `#${picks[s]}` : "";
  }
}

function renderChrome() {
  $("eventTitle").textContent = EVENT_NAME + (DEMO_MODE ? " (demo)" : "");
  $("contestLabel").textContent = CONTESTS[contest].name;
  $("statusPill").hidden = votingOpen[contest];
  $("stillStatus").textContent = votingOpen.still ? "Voting open" : "Voting closed";
  $("videoStatus").textContent = votingOpen.video ? "Voting open" : "Voting closed";
  document.querySelectorAll(".drawer-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.contest === contest)
  );

  const voted = savedVote(contest);
  const wrap = $("slotbarWrap");
  if (voted) {
    banner.hidden = false;
    banner.innerHTML =
      `<h2>Thanks for voting! 🎉</h2>` +
      `<p>Your picks for the ${CONTESTS[contest].name}:</p>` +
      `<div class="picks-recap">` +
      SLOTS.map((s) =>
        `<span class="recap-chip ${s}">${SLOT_META[s].emoji} #${voted[s]}</span>`
      ).join("") +
      `</div>`;
    wrap.style.display = "none";
  } else if (!votingOpen[contest]) {
    banner.hidden = false;
    banner.innerHTML =
      `<h2>Voting is closed 🔒</h2>` +
      `<p>The ${CONTESTS[contest].name} isn't accepting votes right now. Winners announced soon!</p>`;
    wrap.style.display = "none";
  } else {
    banner.hidden = true;
    wrap.style.display = "";
  }
}

function renderAll() { renderChrome(); renderGallery(); renderSlotbar(); }

function adminRowsHtml(tally) {
  const medals = ["🥇", "🥈", "🥉"];
  const rows = Object.entries(tally)
    .map(([num, pts]) => ({ num: +num, pts }))
    .sort((a, b) => b.pts - a.pts || a.num - b.num);
  if (!rows.length) return `<p class="admin-note">No ballots yet.</p>`;
  return `
    <table class="admin-table">
      <thead><tr><th></th><th>Entry</th><th>Points</th></tr></thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr class="${i === 0 ? "winner" : ""}">
            <td class="medal">${medals[i] || ""}</td>
            <td>#${r.num}</td>
            <td>${r.pts} pts</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

async function renderAdminView() {
  $("eventTitle").textContent = EVENT_NAME + (DEMO_MODE ? " (demo)" : "");
  $("contestLabel").textContent = "Admin Results";
  $("statusPill").hidden = true;
  document.querySelectorAll(".drawer-item").forEach((b) => b.classList.remove("active"));
  banner.hidden = true;
  $("slotbarWrap").style.display = "none";
  gallery.classList.add("admin-view");
  gallery.innerHTML = `
    <section class="admin-panel">
      <div class="admin-head">
        <div>
          <h2>Contest Results</h2>
          <p id="adminMeta" class="admin-note">Loading ballots...</p>
        </div>
        <button id="adminRefresh" class="admin-refresh">Refresh</button>
      </div>
      <div id="adminOut"></div>
    </section>`;

  const renderResults = async () => {
    const meta = $("adminMeta");
    const out = $("adminOut");
    meta.textContent = "Loading ballots...";
    try {
      const results = await loadAdminResults();
      if (results.demo) {
        meta.textContent = "Demo mode";
        out.innerHTML = `<p class="admin-note">Paste your Firebase config into <b>firebase-config.js</b> and real ballots will show here.</p>`;
        return;
      }
      meta.textContent = `Updated ${new Date().toLocaleTimeString()} · ${results.total} total ballots`;
      out.innerHTML = ["still", "video"].map((c) => `
        <section class="score-card">
          <h3>${CONTESTS[c].name} <span>${results.counts[c]} ballots</span></h3>
          ${adminRowsHtml(results.tallies[c])}
        </section>`).join("");
    } catch (e) {
      console.error(e);
      meta.textContent = "Could not load ballots.";
      out.innerHTML = `<p class="admin-note">Check your Firebase setup and connection, then try refreshing.</p>`;
    }
  };

  $("adminRefresh").addEventListener("click", renderResults);
  await renderResults();
}

// ============================================================
// Interactions
// ============================================================
function onSlotTap(slot) {
  if (hasVoted(contest) || !votingOpen[contest]) return;
  armed = armed === slot ? null : slot; // re-tap = disarm, picks untouched
  renderSlotbar();
}

function onEntryTap(num) {
  if (hasVoted(contest) || !votingOpen[contest]) return;
  if (armed === null) {
    toast("Tap 🤩 😀 or 🙂 below first, then pick your fave!");
    return;
  }
  if (picks[armed] === num) {
    picks[armed] = null;               // tap your current pick again = clear it
  } else {
    for (const s of SLOTS) if (picks[s] === num) picks[s] = null; // moving an entry
    picks[armed] = num;                // bumps any previous occupant
    const next = SLOTS.find((s) => picks[s] === null);
    armed = next || null;              // auto-advance; none left → morph to Submit
  }
  renderGallery();
  renderSlotbar();
}

async function onSubmit() {
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending… ✨";
  try {
    await submitBallot();
    lockVote(contest, { ...picks });
    picks = { first: null, second: null, third: null };
    armed = null;
    renderAll();
    toast("Votes counted — thank you! 🎉");
  } catch (e) {
    console.error(e);
    toast("Hmm, that didn't send. Check your connection and try again!");
    submitBtn.disabled = false;
  } finally {
    submitBtn.textContent = "Cast my votes! 🎉";
  }
}

function onClearAll() {
  picks = { first: null, second: null, third: null };
  armed = null;
  renderGallery();
  renderSlotbar();
  toast("Picks cleared — fresh start! 🧹");
}

function openLightbox(entry) {
  $("lightboxImg").src = entry.imgUrl;
  $("lightboxImg").alt = (entry.title || "Entry " + entry.num) + " (enlarged)";
  $("lightboxCap").textContent =
    `#${entry.num} · ${entry.title || "Untitled"}` +
    (entry.author ? ` — by ${entry.author}` : "");
  $("lightbox").hidden = false;
}
function closeLightbox() { $("lightbox").hidden = true; }

async function switchContest(c) {
  if (c === contest) return closeDrawer();
  contest = c;
  picks = { first: null, second: null, third: null };
  armed = null;
  closeDrawer();
  gallery.innerHTML = `<p class="gallery-note">Loading entries… 🎨</p>`;
  entries = await loadEntries(contest);
  renderAll();
}

// Drawer
function openDrawer()  { $("drawer").hidden = false; $("drawerOverlay").hidden = false; $("menuBtn").setAttribute("aria-expanded", "true"); }
function closeDrawer() { $("drawer").hidden = true;  $("drawerOverlay").hidden = true;  $("menuBtn").setAttribute("aria-expanded", "false"); }
function toggleDrawer() { $("drawer").hidden ? openDrawer() : closeDrawer(); }

async function openAdmin() {
  if (!adminUnlocked) {
    const pass = prompt("Admin password");
    if (pass !== ADMIN_PASSWORD) {
      if (pass !== null) toast("Nope, that's not it.");
      return;
    }
    adminUnlocked = true;
  }
  closeDrawer();
  await renderAdminView();
}

// Toast
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

// ============================================================
// Boot
// ============================================================
async function boot() {
  for (const s of SLOTS) slotEls[s].addEventListener("click", () => onSlotTap(s));
  submitBtn.addEventListener("click", onSubmit);
  editPicks.addEventListener("click", () => { armed = "first"; renderSlotbar(); });
  clearPicks.addEventListener("click", onClearAll);
  $("lightbox").addEventListener("click", closeLightbox);
  $("menuBtn").addEventListener("click", toggleDrawer);
  $("drawerOverlay").addEventListener("click", closeDrawer);
  $("adminBtn").addEventListener("click", openAdmin);
  document.querySelectorAll(".drawer-item").forEach((b) =>
    b.addEventListener("click", () => switchContest(b.dataset.contest))
  );

  gallery.innerHTML = `<p class="gallery-note">Loading entries… 🎨</p>`;
  try {
    if (!DEMO_MODE) await initFirebase();
    await loadFlags();
    entries = await loadEntries(contest);
  } catch (e) {
    console.error(e);
    gallery.innerHTML = `<p class="gallery-note">Couldn't load entries. Check the Google Sheet link and Firebase setup in <code>firebase-config.js</code>.</p>`;
    return;
  }
  renderAll();
}

boot();
