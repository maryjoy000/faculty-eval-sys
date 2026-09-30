// ============================================
// RATE FACULTY PAGE
// ============================================

// --- State ---
let ratingParts = [];
let currentPartIndex = 0;

// Stores answers using backend question codes:
// { q1: "4", q2: "5", q3: "4", ... }
const answers = {};

// Parts the user chose to skip for now (indexes). Skipped parts stay
// unanswered and must still be completed before continuing to comments.
const skippedParts = new Set();

// --- Draft (save progress & continue later) ---
let draftOwner = null;
let draftFacultyId = null;

function getEvaluatingFacultyId() {
  try {
    const stored = JSON.parse(
      sessionStorage.getItem("evaluatingFaculty") || "null"
    );
    return stored && stored.facultyId !== undefined
      ? String(stored.facultyId)
      : null;
  } catch (error) {
    return null;
  }
}

async function initStudentDraftContext() {
  draftFacultyId = getEvaluatingFacultyId();
  draftOwner = await getDraftOwner();
}

function persistStudentDraft() {
  if (!draftFacultyId || !draftOwner) return;

  let comment = "";

  try {
    const sessionComment = sessionStorage.getItem("draftComment");

    if (sessionComment !== null) {
      comment = sessionComment;
    } else {
      const existing = loadEvalDraft("student", draftFacultyId, draftOwner);
      if (existing) comment = existing.comment;
    }
  } catch (error) {
    comment = "";
  }

  saveEvalDraft("student", draftFacultyId, draftOwner, { answers, comment });
}

// --- Load actual criteria from the backend ---
async function loadStudentCriteria() {
  try {
    ratingParts = await apiGet("/evaluation-criteria/student");

    if (!Array.isArray(ratingParts) || ratingParts.length === 0) {
      throw new Error("No student evaluation criteria found.");
    }

    skippedParts.clear();

    // Restore previously saved answers: in-tab session answers win,
    // otherwise continue the autosaved draft (e.g. tab was closed).
    await initStudentDraftContext();
    const storedAnswers = sessionStorage.getItem("evaluationAnswers");

    if (draftFacultyId && draftOwner) {
      const draft = loadEvalDraft("student", draftFacultyId, draftOwner);

      if (draft) {
        const validIds = new Set(
          ratingParts.flatMap((part) =>
            (part.questions || []).map((q) => q.id)
          )
        );

        Object.assign(answers, pruneDraftAnswers(draft.answers, validIds));
      }
    }

    if (storedAnswers) {
      try {
        Object.assign(answers, JSON.parse(storedAnswers));
      } catch (error) {
        console.error("Invalid stored evaluation answers. Ignoring them.");
      }
    }

    // Start at the first unanswered part.
    currentPartIndex = 0;

    for (let i = 0; i < ratingParts.length; i++) {
      const complete = ratingParts[i].questions.every(
        (q) => answers[q.id] !== undefined
      );

      if (!complete) {
        currentPartIndex = i;
        break;
      }

      // If everything is complete, stay on the last part.
      if (i === ratingParts.length - 1) {
        currentPartIndex = i;
      }
    }

    renderPart(currentPartIndex);
  } catch (error) {
    console.error(
      "Failed to load student evaluation criteria:",
      error
    );

    const container = document.getElementById(
      "rating-parts-container"
    );

    if (container) {
      container.innerHTML = `
        <p class="text-sm text-red-600">
          Unable to load the evaluation criteria. Please refresh the page
          and try again.
        </p>
      `;
    }
  }
}

// --- Render the evaluating faculty's name ---
function renderEvaluatingFacultyName() {
  const nameEl = document.getElementById("evaluating-faculty-name");
  const stored = sessionStorage.getItem("evaluatingFaculty");

  if (nameEl && stored) {
    const faculty = JSON.parse(stored);

    nameEl.textContent =
      `${faculty.faculty} (${faculty.subjectNames})`;
  }
}

// --- Render ONE part's questions ---
function renderPart(partIndex) {
  const existingWarning =
    document.getElementById("incomplete-warning");

  if (existingWarning) {
    existingWarning.remove();
  }

  const container = document.getElementById(
    "rating-parts-container"
  );

  const part = ratingParts[partIndex];

  if (!part) {
    console.error("Invalid evaluation part:", partIndex);
    return;
  }

  const scale = getScale("student");

  const questionsHtml = part.questions
    .map((q, qIndex) => {
      const optionsHtml = scale.scaleLabels
        .map((scalePoint) => {
          const value = scalePoint.value;

          const isChecked =
            answers[q.id] === String(value)
              ? "checked"
              : "";

          return `
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="${q.id}"
                value="${value}"
                ${isChecked}
                class="w-4 h-4 text-brand focus:ring-brand border-gray-300"
              >

              <span class="text-sm text-gray-700">
                ${value}
              </span>
            </label>
          `;
        })
        .join("");

      const isLast =
        qIndex === part.questions.length - 1;

      return `
        <div
          class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 ${
            !isLast
              ? "border-b border-gray-200"
              : ""
          }"
        >

          <p class="text-sm text-gray-800 sm:pr-6">
            ${nlToBr(q.text)}
          </p>

          <div class="flex gap-4 shrink-0">
            ${optionsHtml}
          </div>

        </div>
      `;
    })
    .join("");

  container.innerHTML = `
    <h3 class="font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-2">
      ${nlToBr(part.title)}
    </h3>

    ${questionsHtml}
  `;

  // --- Radio button events ---
  part.questions.forEach((q) => {
    document
      .querySelectorAll(`input[name="${q.id}"]`)
      .forEach((radio) => {
        radio.addEventListener("change", (e) => {
          answers[q.id] = e.target.value;

          sessionStorage.setItem(
            "evaluationAnswers",
            JSON.stringify(answers)
          );

          persistStudentDraft();
          updateSkipHint();

          const warning =
            document.getElementById(
              "incomplete-warning"
            );

          if (warning) {
            warning.remove();
          }
        });
      });
  });

  updateNavButtons(partIndex);
  updateSkipHint();
}

// --- Skip progress hint ("Part 2 of 5 · 1 skipped") ---
function updateSkipHint() {
  const hint = document.getElementById("skip-progress-hint");
  if (!hint || !ratingParts.length) {
    if (hint) hint.textContent = "";
    return;
  }

  [...skippedParts].forEach((index) => {
    if (isPartComplete(index)) skippedParts.delete(index);
  });

  const skippedCount = skippedParts.size;

  hint.textContent =
    `Part ${currentPartIndex + 1} of ${ratingParts.length}` +
    (skippedCount > 0 ? ` · ${skippedCount} skipped` : "");
}

// --- Update navigation buttons ---
function updateNavButtons(partIndex) {
  const backBtn =
    document.getElementById("back-btn");

  const nextBtn =
    document.getElementById("next-btn");

  const backToListBtn =
    document.getElementById(
      "back-to-faculty-list-btn"
    );

  const isFirstPart = partIndex === 0;

  if (backBtn) {
    backBtn.classList.toggle(
      "hidden",
      isFirstPart
    );
  }

  if (backToListBtn) {
    backToListBtn.classList.toggle(
      "hidden",
      !isFirstPart
    );
  }

  if (nextBtn) {
    nextBtn.textContent = "Next";
  }
}

// --- Back ---
function goBack() {
  if (currentPartIndex > 0) {
    currentPartIndex--;
    renderPart(currentPartIndex);
  }
}

// --- Next ---
function goNext() {
  if (!isPartComplete(currentPartIndex)) {
    showIncompleteWarning();
    return;
  }

  if (
    currentPartIndex <
    ratingParts.length - 1
  ) {
    currentPartIndex++;
    renderPart(currentPartIndex);
  } else {
    // Last part reached with Next (so it is complete). Other parts may
    // still be skipped — send the user back to finish those first.
    const firstIncomplete = ratingParts.findIndex(
      (_, index) => !isPartComplete(index)
    );

    if (firstIncomplete !== -1) {
      currentPartIndex = firstIncomplete;
      renderPart(currentPartIndex);
      showIncompleteWarning(
        "Some parts were skipped — please complete them before continuing."
      );
      return;
    }

    sessionStorage.setItem(
      "evaluationAnswers",
      JSON.stringify(answers)
    );

    persistStudentDraft();

    window.location.href = "comments.html";
  }
}

// --- Skip the current part and return to it later ---
function goSkip() {
  if (!ratingParts.length) return;

  skippedParts.add(currentPartIndex);

  let target = -1;

  for (let i = 0; i < ratingParts.length; i++) {
    if (i !== currentPartIndex && !isPartComplete(i)) {
      target = i;
      break;
    }
  }

  if (target === -1) {
    skippedParts.delete(currentPartIndex);

    if (isPartComplete(currentPartIndex)) {
      // Everything is answered — proceed like Next.
      sessionStorage.setItem(
        "evaluationAnswers",
        JSON.stringify(answers)
      );

      persistStudentDraft();

      window.location.href = "comments.html";
    } else {
      showIncompleteWarning();
    }

    updateSkipHint();
    return;
  }

  currentPartIndex = target;
  renderPart(currentPartIndex);
  updateSkipHint();
}

// --- Show incomplete warning ---
function showIncompleteWarning(customMessage) {
  let warning =
    document.getElementById(
      "incomplete-warning"
    );

  if (!warning) {
    warning = document.createElement("p");

    warning.id = "incomplete-warning";

    warning.className =
      "text-sm text-red-600 mt-3 text-right";

    warning.textContent =
      customMessage ||
      "Please answer all questions in this section before proceeding.";

    document
      .getElementById("next-btn")
      .insertAdjacentElement(
        "beforebegin",
        warning
      );
  } else if (customMessage) {
    warning.textContent = customMessage;
  }
}

// --- Check whether current part is complete ---
function isPartComplete(partIndex) {
  const part = ratingParts[partIndex];

  if (!part) {
    return false;
  }

  return part.questions.every(
    (q) => answers[q.id] !== undefined
  );
}

// --- Announcement banner ---
function renderAnnouncementBanner() {
  const banner =
    document.getElementById(
      "announcement-banner"
    );

  if (!banner) {
    return;
  }

  const announcement = getAnnouncement();

  if (
    announcement.isActive &&
    announcement.message
  ) {
    banner.textContent =
      announcement.message;

    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

// --- Academic year (loaded from System Management; refresh after fetch) ---
async function refreshAcademicYearDisplay() {
  await loadSystemSettings();
  const el = document.getElementById("academic-year-display");
  if (el) {
    el.textContent = getAcademicYearDisplay();
  }
}
refreshAcademicYearDisplay();

// --- Initialize page ---
const backBtn =
  document.getElementById("back-btn");

if (backBtn) {
  backBtn.addEventListener(
    "click",
    goBack
  );
}

const nextBtn =
  document.getElementById("next-btn");

if (nextBtn) {
  nextBtn.addEventListener(
    "click",
    goNext
  );
}

const skipBtn =
  document.getElementById("skip-btn");

if (skipBtn) {
  skipBtn.addEventListener(
    "click",
    goSkip
  );
}

const backToListBtn =
  document.getElementById(
    "back-to-faculty-list-btn"
  );

if (backToListBtn) {
  backToListBtn.addEventListener(
    "click",
    () => {
      // Leaving without finishing:
      // discard the current evaluation.
      sessionStorage.removeItem(
        "evaluationAnswers"
      );

      sessionStorage.removeItem(
        "draftComment"
      );

      sessionStorage.removeItem(
        "evaluatingFaculty"
      );

      window.location.href =
        "select-faculty.html";
    }
  );
}

// --- Scale description ---
const scaleDescriptionText =
  document.getElementById(
    "scale-description-text"
  );

if (scaleDescriptionText) {
  scaleDescriptionText.textContent =
    "Rate the faculty member on the following criteria (" +
    getScaleDescriptionText("student") +
    ").";
}

// --- Initial page setup ---
renderEvaluatingFacultyName();
(async () => {
  await loadAnnouncement();
  renderAnnouncementBanner();
})();
loadStudentCriteria();