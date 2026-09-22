// ============================================
// RATE FACULTY PAGE
// ============================================

// --- State ---
let ratingParts = [];
let currentPartIndex = 0;

// Stores answers using backend question codes:
// { q1: "4", q2: "5", q3: "4", ... }
const answers = {};

// --- Load actual criteria from the backend ---
async function loadStudentCriteria() {
  try {
    ratingParts = await apiGet("/evaluation-criteria/student");

    if (!Array.isArray(ratingParts) || ratingParts.length === 0) {
      throw new Error("No student evaluation criteria found.");
    }

    // Restore previously saved answers
    const storedAnswers = sessionStorage.getItem("evaluationAnswers");

    if (storedAnswers) {
      Object.assign(answers, JSON.parse(storedAnswers));
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
    sessionStorage.setItem(
      "evaluationAnswers",
      JSON.stringify(answers)
    );

    window.location.href = "comments.html";
  }
}

// --- Show incomplete warning ---
function showIncompleteWarning() {
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
      "Please answer all questions in this section before proceeding.";

    document
      .getElementById("next-btn")
      .insertAdjacentElement(
        "beforebegin",
        warning
      );
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