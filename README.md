# Fan Art Faves — Convention Voting App

Mobile-first Top-3 voting app for two contests (Still Art & Video).
Points: 🤩 WOW! = 3 · 😀 Cool! = 2 · 🙂 Nice! = 1.

## Files

| File | Purpose |
|---|---|
| `index.html` / `styles.css` / `app.js` | The voting app (results screen is built in — see below) |
| `firebase-config.js` | Your Firebase config, admin password, and Google Sheet link |
| `still/` · `video/` | The entry images, hosted right in the repo |
| *(a Google Sheet)* | **The contest entry list** — title, author, image link per entry |

**Architecture:** the frontend and images live on GitHub; a **Google Sheet** holds
the entry list (title/author/image per row); Firebase (Firestore) stores the
ballots and the open/close switches. No Firebase Storage is needed.

**Seeing results:** there's no separate admin page. Open the app, tap the ☰ menu,
tap **ADMIN** at the bottom, and enter the admin password (set in
`firebase-config.js`). You'll get live per-contest point totals with 🥇🥈🥉.

**Demo mode:** until you paste real Firebase values, the app runs with 8 sample
entries per contest and in-memory voting, so you can preview the whole flow
immediately — even by just opening `index.html` locally.

## 1. Firebase setup (~10 minutes)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** (Analytics optional, off is fine).
2. **Add a Web app** (the `</>` icon on the project overview). Copy the `firebaseConfig` object it shows into `firebase-config.js`.
3. **Firestore Database** → Create database → Start in *production mode* → then open the **Rules** tab and paste:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /config/{doc} { allow read: if true; }
       match /ballots/{doc} {
         allow create: if
           (request.resource.data.contest == "still" &&
            get(/databases/$(database)/documents/config/flags).data.stillOpen == true) ||
           (request.resource.data.contest == "video" &&
            get(/databases/$(database)/documents/config/flags).data.videoOpen == true);
         allow read: if true;   // needed by the ADMIN results screen; see note below
       }
     }
   }
   ```

4. In Firestore, create the control document:
   - Collection `config` → Document ID `flags` → fields
     `stillOpen` (boolean) and `videoOpen` (boolean).
   - Set both fields to `false` while you are setting up. **This is your manual
     open/close switch.** Flip either boolean to `true` in the console (works
     fine from your phone) to open voting for that contest. Guests can still
     browse entries while voting is closed. Voters see the change on their next
     page load.

That's the whole Firebase setup — **no Storage needed** (it now requires a paid
plan, so images live on GitHub instead; see below).

## 2. Adding contest entries (Google Sheet)

The entry list lives in a **Google Sheet** so you can add art + attribution
without touching code. Adding a row *is* the approval step — art only appears for
voting once it's a row in the sheet.

**One-time setup:**

1. Make a Google Sheet with a header row and these columns (order and extra
   columns don't matter; headers are matched by name):

   | contest | title | author | image | num | watch |
   |---|---|---|---|---|---|
   | still | Sunset Dragon | Alex R. | still/1.jpg | | |
   | video | My Animation | Jamie L. | video/1.jpg | | https://youtube.com/... |

   - **contest** — `still` or `video`.
   - **title / author** — shown on each card.
   - **image** — where the picture is (see below). The column may also be named
     `link`, `url`, or `img`.
   - **num** *(optional)* — the number shown on the card. Leave it out and entries
     are auto-numbered by row order within each contest.
   - **watch** *(video only, optional)* — link for the "▶️ Click to watch!" button.
2. **File → Share → Publish to web → (the entries tab) → CSV → Publish.** Copy the
   link it gives you into `FANVOTE_SHEET_CSV_URL` in `firebase-config.js`.

**Adding an entry:** upload the image to the `still/` or `video/` folder in this
repo, then add a row to the sheet. New entries appear within a few minutes (Google
caches the published CSV briefly).

**What to put in the `image` column** — easiest is a **repo path** like
`still/1.jpg` (works because the images ship with the app). Full URLs work too, but:
- A GitHub **`.../blob/...`** page URL is auto-corrected to the raw image for you.
- A **Google Drive** share link will *not* work (it serves a page, not the file).
- iPhone **HEIC** photos won't display in browsers — convert to JPG/PNG first.

> **Before you open voting, finalize the list.** Since entries can be auto-numbered
> by row order, reordering or deleting rows *after* votes are cast would shift the
> numbers and scramble the tally. Add a `num` column if you want numbers locked.

### Video entries — getting a thumbnail

A video row needs a **thumbnail** in the `image` column and the video link in the
`watch` column. Thumbnails are done by hand; the quickest source per platform:

| Platform | Thumbnail URL to paste in `image` |
|---|---|
| **YouTube** | `https://img.youtube.com/vi/VIDEO_ID/hqdefault.jpg` |
| **Dailymotion** | `https://www.dailymotion.com/thumbnail/video/VIDEO_ID` |
| **Vimeo** | No official static URL — use `https://vumbnail.com/VIDEO_ID.jpg` (free third-party) or the screenshot method below |
| **Facebook** | No auto option — use the screenshot method below |

- **VIDEO_ID** is the code in the video's URL: YouTube `watch?v=**abc123**` (or
  `youtu.be/**abc123**`), Dailymotion `/video/**x9abc**`, Vimeo `vimeo.com/**123456789**`.
- **Screenshot method (works for anything):** grab a frame of the video, save it
  into the `video/` folder in the repo, and put that path (e.g. `video/entry3.jpg`)
  in the `image` column. Bulletproof and platform-agnostic.

Thumbnails are shown as squares (center-cropped), so a roughly centered frame reads
best.

## 3. Deploy on GitHub Pages

1. Create a repo and push these files to the root.
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / root.
3. Your app lives at `https://<user>.github.io/<repo>/` — make a QR code of that
   URL for the con floor.
4. Results: open the app → ☰ menu → **ADMIN** → enter the password. The button is
   deliberately unlabeled/low-key so voters ignore it; keep the password private.

## How voting works

- Tap a slot tab (it stretches), then tap an entry. The app auto-advances to the
  next empty slot; re-tap a tab to disarm it and just browse (picks are kept).
- With all three slots filled, the bar morphs into **Cast my votes!**
  ("✏️ Change picks" reopens the tabs).
- One vote per contest per device (browser localStorage).

## Clearing votes

Ballots are cleared from the **Firebase console** (there's no delete button in the
app, on purpose — that would require making ballots publicly deletable):

1. Firestore → **Data** → click the **`ballots`** collection.
2. Open the **⋮** menu next to the collection name → **Delete collection** →
   confirm. This removes every ballot.

Do this to wipe **test votes before the event**. Note: each device also remembers
it already voted (browser localStorage), so to re-vote for testing on the same
phone, clear that site's browsing data too.

## Prototype caveats (revisit before the real event)

- **Ballot reads are public** and the ADMIN password is client-side (readable in
  the page source), so a determined snoop who opens the app's code could compute
  results. Fine for a casual prototype; before a high-stakes event, consider
  Firebase Auth + a rule like `allow read: if request.auth != null`.
- localStorage vote-locking is honor-system: clearing browser data allows re-voting.
- Voters must reload the page to see an open/close change.
