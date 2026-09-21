// ============================================
// Shared session bootstrap — runs once per page load, before any other
// page script that needs to know "who am I". Fetches the real logged-in
// identity from the backend and caches it, so getCurrentRole() can stay
// a plain synchronous function (it's called that way throughout the
// codebase) instead of forcing every caller to become async.
//
// Deliberate trade-off: this uses a SYNCHRONOUS XHR for this one
// bootstrap call. The alternative is rewriting every page's init logic
// to await a promise before running — much larger surgery than this
// pass is doing. It's a local, fast call, so the brief main-thread
// block is negligible in practice, but it's a real trade-off worth
// revisiting later, not an oversight.
// ============================================

let currentSession = null;

function loadCurrentSessionSync() {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", "http://127.0.0.1:5000/api/auth/me", false); // false = synchronous
  xhr.withCredentials = true;
  try {
    xhr.send();
    if (xhr.status === 200) {
      currentSession = JSON.parse(xhr.responseText);
    }
  } catch (e) {
    currentSession = null;
  }
}

loadCurrentSessionSync();

// Not logged in at all (no session, or it expired) -> bounce back to
// login. This is also the FIRST real page-level auth enforcement --
// until now, any HTML file could be opened directly regardless of
// login state.
if (!currentSession) {
  window.location.href = "../../index.html";
}