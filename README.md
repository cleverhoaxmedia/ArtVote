# Fan Art Faves — Convention Voting App

Mobile-first Top-3 voting app for two contests (Still Art & Video).
Points: 🤩 WOW! = 3 · 😀 Cool! = 2 · 🙂 Nice! = 1.

## Files

| File | Purpose |
|---|---|
| `index.html` / `styles.css` / `app.js` | The voting app (results screen is built in — see below) |
| `firebase-config.js` | Your Firebase config + admin password |
| `entries.js` | **The contest entry list** — add each approved entry here |
| `still/` · `video/` | The entry images, hosted right in the repo |

**Architecture:** the frontend *and the images* live on GitHub; Firebase (Firestore)
only stores the ballots and the open/close switches. No Firebase Storage is needed.

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
         allow create: if true;
         allow read: if true;   // needed by the ADMIN results screen; see note below
       }
     }
   }
   ```

4. In Firestore, create the control document:
   - Collection `config` → Document ID `flags` → fields
     `stillOpen` (boolean) and `videoOpen` (boolean).
   - **This is your open/close switch.** Flip these booleans in the console
     (works fine from your phone) to open or close each contest. Voters see
     the change on their next page load.

That's the whole Firebase setup — **no Storage needed** (it now requires a paid
plan, so images live on GitHub instead; see below).

## 2. Adding contest entries

Entries live in `entries.js` and the images sit in the `still/` and `video/`
folders — all in this repo. Adding an entry to `entries.js` *is* the approval
step: art only appears for voting once you list it there.

1. Drop the image into the `still/` or `video/` folder (for video, use the
   **thumbnail** image). JPG, PNG, GIF, WEBP, and SVG all work; square looks best.
2. Add a line to `entries.js`:

   ```js
   window.FANVOTE_ENTRIES = {
     still: [
       { num: 1, img: "still/1.jpg" },
       { num: 2, img: "still/dragon.png" },   // filename is up to you; "num" is the card #
     ],
     video: [
       { num: 1, img: "video/1.jpg", watch: "https://youtube.com/watch?v=..." },
     ],
   };
   ```

   `watch` is optional — any video entry that has one gets a "▶️ Click to watch!"
   button.
3. Commit and push. The new entries appear the next time voters load the page.

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

## Prototype caveats (revisit before the real event)

- **Ballot reads are public** and the ADMIN password is client-side (readable in
  the page source), so a determined snoop who opens the app's code could compute
  results. Fine for a casual prototype; before a high-stakes event, consider
  Firebase Auth + a rule like `allow read: if request.auth != null`.
- localStorage vote-locking is honor-system: clearing browser data allows re-voting.
- Voters must reload the page to see an open/close change.
