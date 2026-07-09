// ============================================================
// PASTE YOUR FIREBASE CONFIG HERE
// Firebase Console → Project settings → Your apps → SDK setup
// While these placeholders are untouched, the app runs in
// DEMO MODE with sample entries and in-memory voting.
// ============================================================
window.FANVOTE_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBIr_A3lPQ4IhirjM1iTzwKzPmt1oVealU",
  authDomain: "artvote-bbe75.firebaseapp.com",
  projectId: "artvote-bbe75",
  storageBucket: "artvote-bbe75.firebasestorage.app",
  messagingSenderId: "498287678371",
  appId: "1:498287678371:web:26d18a97811c7a438c4016",
  measurementId: "G-LTH67K55HQ",
};

// Shown in the header
window.FANVOTE_EVENT_NAME = "Fan Art Faves";

// Change this before sharing the app URL.
window.FANVOTE_ADMIN_PASSWORD = "admin";

// The contest entries come from a Google Sheet published as CSV.
// In the Sheet: File → Share → Publish to web → (whole sheet or the entries
// tab) → CSV → Publish, then paste the link it gives you here.
// Columns the app reads (header row required, order/extra columns don't matter):
//   contest | num | title | author | image | watch
//   • contest: "still" or "video"      • image: repo path (still/1.jpg) or full URL
//   • num: the # shown on the card     • watch: video link (video rows only)
window.FANVOTE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSgtKVn68M01puVg-XTHoNGU24LaTliBYDvi30TzrOgqyvEYg_iLSA684Bp74c-rk0QHg5CK5IBQiXw/pub?gid=0&single=true&output=csv";
