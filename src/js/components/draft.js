// ============================================
// SHARED: Evaluation Drafts (save progress & continue later)
// ============================================
// Frontend-only drafts in localStorage — no backend changes. Progress
// autosaves on every answer/comment change; the user can close the tab
// and resume later from the select list. Drafts are:
// - keyed per evaluation type + evaluatee: fes-draft:v1:<type>:<id>
// - scoped to the logged-in account (role:username), so accounts sharing
//   one browser never see each other's drafts
// - cleared automatically on successful submit (or via Discard)
//
// Types: "student" | "peer" | "observation" | "hr"
// Payload: { v, owner, answers, comment, updatedAt }

var EVAL_DRAFT_PREFIX = "fes-draft:v1:";

function draftKey(type, subjectId) {
  return EVAL_DRAFT_PREFIX + type + ":" + String(subjectId);
}

var _draftOwnerCache = null; // null = not fetched yet, false = fetch failed

// "student:100000000001" / "hr:hr-bob" / ... — null when unavailable,
// in which case callers must skip draft read/write (fail-safe: today).
async function getDraftOwner() {
  if (_draftOwnerCache !== null) {
    return _draftOwnerCache || null;
  }

  try {
    const me = await apiGet("/auth/me");

    _draftOwnerCache =
      me && me.role && me.username ? `${me.role}:${me.username}` : false;
  } catch (error) {
    console.error("Failed to identify draft owner:", error);
    _draftOwnerCache = false;
  }

  return _draftOwnerCache || null;
}

function saveEvalDraft(type, subjectId, owner, data) {
  if (!owner) return;

  try {
    const payload = {
      v: 1,
      owner,
      answers: (data && data.answers) || {},
      comment: (data && data.comment) || "",
      updatedAt: Date.now(),
    };

    localStorage.setItem(draftKey(type, subjectId), JSON.stringify(payload));
    updateDraftIndicator();
  } catch (error) {
    // Storage full / private mode — drafts are best-effort only.
    console.error("Failed to save evaluation draft:", error);
  }
}

function loadEvalDraft(type, subjectId, owner) {
  if (!owner) return null;

  let parsed = null;

  try {
    const raw = localStorage.getItem(draftKey(type, subjectId));
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch (error) {
    clearEvalDraft(type, subjectId);
    return null;
  }

  if (
    !parsed ||
    parsed.v !== 1 ||
    parsed.owner !== owner ||
    typeof parsed.answers !== "object" ||
    parsed.answers === null
  ) {
    return null;
  }

  return {
    answers: parsed.answers,
    comment: typeof parsed.comment === "string" ? parsed.comment : "",
    updatedAt: Number(parsed.updatedAt) || 0,
  };
}

function clearEvalDraft(type, subjectId) {
  try {
    localStorage.removeItem(draftKey(type, subjectId));
  } catch (error) {
    console.error("Failed to clear evaluation draft:", error);
  }
}

// All of this account's drafts for one type, newest first.
function listEvalDrafts(type, owner) {
  const drafts = [];

  if (!owner) return drafts;

  try {
    const prefix = EVAL_DRAFT_PREFIX + type + ":";

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      if (!key || key.indexOf(prefix) !== 0) continue;

      let parsed = null;

      try {
        parsed = JSON.parse(localStorage.getItem(key));
      } catch (error) {
        continue;
      }

      if (!parsed || parsed.v !== 1 || parsed.owner !== owner) continue;

      const answers =
        parsed.answers && typeof parsed.answers === "object" ? parsed.answers : {};

      drafts.push({
        subjectId: key.slice(prefix.length),
        updatedAt: Number(parsed.updatedAt) || 0,
        answeredCount: Object.keys(answers).length,
        hasComment: Boolean(
          typeof parsed.comment === "string" && parsed.comment.trim()
        ),
      });
    }
  } catch (error) {
    console.error("Failed to list evaluation drafts:", error);
    return [];
  }

  drafts.sort((a, b) => b.updatedAt - a.updatedAt);
  return drafts;
}

// Drop answers for questions that no longer exist (criteria edited).
function pruneDraftAnswers(answers, validIds) {
  const valid = validIds instanceof Set ? validIds : new Set(validIds || []);
  const cleaned = {};

  Object.keys(answers || {}).forEach((qid) => {
    if (valid.has(qid)) cleaned[qid] = answers[qid];
  });

  return cleaned;
}

function formatDraftTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch (error) {
    return "";
  }
}

// "Progress auto-saved · 3:45 PM" — no-op when the page has no indicator.
function updateDraftIndicator(timestamp) {
  const el = document.getElementById("draft-saved-indicator");
  if (!el) return;

  const time = formatDraftTime(
    timestamp === undefined ? Date.now() : timestamp
  );

  el.textContent = time ? `Progress auto-saved · ${time}` : "";
}
