// ============================================================
// Fan Art Faves — voting app
// Contests: "still" and "video"
// Slots: first (🤩 3pts) / second (😀 2pts) / third (🙂 1pt)
// ============================================================
const firebaseConfig = window.FANVOTE_FIREBASE_CONFIG;
const EVENT_NAME = window.FANVOTE_EVENT_NAME;
const ADMIN_PASSWORD = window.FANVOTE_ADMIN_PASSWORD || "admin";

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

// ---------------- State ----------------
let contest = "still";
let entries = [];                 // [{num, imgUrl, videoUrl?}]
let picks   = { first: null, second: null, third: null }; // entry nums
let armed   = null;               // "first" | "second" | "third" | null
let votingOpen = { still: true, video: true };
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
      votingOpen.still = d.stillOpen !== false;
      votingOpen.video = d.videoOpen !== false;
    }
  } catch (e) {
    console.error("Could not read voting flags:", e);
  }
}

async function loadEntries(c) {
  if (DEMO_MODE) return demoEntries(c);
  // Entries are hosted on GitHub, listed in entries.js (window.FANVOTE_ENTRIES).
  // Each entry: { num, img: "still/1.jpg", watch?: "https://..." }
  const manifest = (window.FANVOTE_ENTRIES && window.FANVOTE_ENTRIES[c]) || [];
  return manifest
    .filter((e) => e && e.num != null && e.img)
    .map((e) => ({ num: e.num, imgUrl: e.img, videoUrl: e.watch || null }))
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
    const card = document.createElement("button");
    card.className = "entry" + (locked ? " locked" : "");
    card.dataset.num = e.num;

    const slotOf = SLOTS.find((s) => picks[s] === e.num);
    if (slotOf) card.classList.add(`picked-${slotOf}`);

    card.innerHTML = `
      <img src="${e.imgUrl}" alt="Entry ${e.num}" loading="lazy" />
      <span class="entry-num">#${e.num}</span>
      ${slotOf ? `<span class="entry-badge">${SLOT_META[slotOf].emoji}</span>` : ""}
      ${e.videoUrl ? `<a class="watch-btn" href="${e.videoUrl}" target="_blank" rel="noopener">▶️ Click to watch!</a>` : ""}
    `;
    card.addEventListener("click", (ev) => {
      if (ev.target.closest(".watch-btn")) return; // link, not a vote tap
      if (suppressClick) { suppressClick = false; return; } // long-press just fired
      onEntryTap(e.num);
    });
    attachLongPress(card, e);
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

// ---- Hold-to-expand (long-press an entry to preview it big) ----
let suppressClick = false;
let pressTimer = null;

function attachLongPress(card, entry) {
  let startX = 0, startY = 0;
  const start = (ev) => {
    const p = ev.touches ? ev.touches[0] : ev;
    startX = p.clientX; startY = p.clientY;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      suppressClick = true;
      openLightbox(entry);
    }, 450);
  };
  const move = (ev) => {
    if (!pressTimer) return;
    const p = ev.touches ? ev.touches[0] : ev;
    if (Math.abs(p.clientX - startX) > 10 || Math.abs(p.clientY - startY) > 10) {
      clearTimeout(pressTimer); pressTimer = null; // scrolling, not holding
    }
  };
  const cancel = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };

  card.addEventListener("touchstart", start, { passive: true });
  card.addEventListener("touchmove", move, { passive: true });
  card.addEventListener("touchend", cancel);
  card.addEventListener("touchcancel", cancel);
  card.addEventListener("mousedown", start);
  card.addEventListener("mousemove", move);
  card.addEventListener("mouseup", cancel);
  card.addEventListener("mouseleave", cancel);
  card.addEventListener("contextmenu", (ev) => ev.preventDefault());
}

function openLightbox(entry) {
  $("lightboxImg").src = entry.imgUrl;
  $("lightboxImg").alt = "Entry " + entry.num + " (enlarged)";
  $("lightboxCap").textContent = "Entry #" + entry.num;
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
    gallery.innerHTML = `<p class="gallery-note">Couldn't load entries. Check the Firebase setup in <code>firebase-config.js</code>.</p>`;
    return;
  }
  renderAll();
}

boot();
