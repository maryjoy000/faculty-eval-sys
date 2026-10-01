// ============================================
// SHARED: Global School-Term Filter (Admin)
// ============================================
// The topbar dropdown (rendered by the admin sidebar shell) lets Admin
// scope Dashboard, Analytics, and Reports to one School Year/Term.
// "All history" (default when no term is open) keeps legacy behavior.
//
// Pages opt in by calling initGlobalTermFilter(reloadFn). Pages without
// the topbar select (HR shell, non-report admin pages) are untouched:
// withTerm() only applies a term once this page has loaded the list.

let termCache = [];
let termsLoadedOnPage = false;

const TERM_STORAGE_KEY = "fes-selected-term";

function escapeTermText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function termDisplayLabel(term) {
  const base = `${term.school_year} ${term.semester}`;
  return term.status === "open" ? base : `${base} (${term.status})`;
}

async function loadSchoolTerms() {
  termCache = await apiGet("/school-terms");
  return termCache;
}

function getOpenTerm() {
  return termCache.find((term) => term.status === "open") || null;
}

// Effective term id, or null for all history. Prefers the on-page
// select (when initialized), else the saved override when still valid,
// else the open term.
function getSelectedTermId() {
  const select = document.getElementById("global-term-filter");

  if (select && termsLoadedOnPage) {
    if (select.value === "all" || !select.value) return null;
    const id = Number(select.value);
    return Number.isNaN(id) ? null : id;
  }

  try {
    const stored = localStorage.getItem(TERM_STORAGE_KEY);

    if (stored === "all") return null;

    if (stored) {
      const id = Number(stored);

      if (!Number.isNaN(id) && termCache.some((term) => term.id === id)) {
        return id;
      }
    }
  } catch (error) {
    // Private mode etc. — fall through to the open term.
  }

  const openTerm = getOpenTerm();
  return openTerm ? openTerm.id : null;
}

// Append ?term_id= to an endpoint path when a term is selected.
// Handles paths that already carry a query string.
function withTerm(path) {
  if (!termsLoadedOnPage) return path;

  const termId = getSelectedTermId();
  if (termId === null) return path;

  const separator = path.indexOf("?") === -1 ? "?" : "&";
  return `${path}${separator}term_id=${termId}`;
}

async function initGlobalTermFilter(onChange) {
  const select = document.getElementById("global-term-filter");
  if (!select) return;

  try {
    await loadSchoolTerms();
  } catch (error) {
    console.error("Failed to load school terms:", error);
    return;
  }

  if (!termCache.length) return;

  select.innerHTML =
    `<option value="all">All history</option>` +
    termCache
      .map(
        (term) =>
          `<option value="${term.id}">${escapeTermText(termDisplayLabel(term))}</option>`
      )
      .join("");

  const selected = getSelectedTermId();
  select.value = selected === null ? "all" : String(selected);

  try {
    localStorage.setItem(
      TERM_STORAGE_KEY,
      selected === null ? "all" : String(selected)
    );
  } catch (error) {
    // Best-effort persistence only.
  }

  termsLoadedOnPage = true;
  select.classList.remove("hidden");

  select.addEventListener("change", () => {
    try {
      localStorage.setItem(TERM_STORAGE_KEY, select.value);
    } catch (error) {
      // Best-effort persistence only.
    }

    if (typeof onChange === "function") onChange();
  });
}
