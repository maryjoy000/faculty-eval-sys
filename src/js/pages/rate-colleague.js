// ============================================
// FACULTY: RATE COLLEAGUE PAGE
// ============================================

// --- State ---
let peerRatingParts = [];
let currentPartIndex = 0;
const answers = {};

// P2P uses the 1–4 scale from the actual peer evaluation form.
const peerRatingScale = {
  scaleLabels: [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4" }
  ]
};

// ============================================
// Restore previously entered answers
// ============================================
const storedAnswers = sessionStorage.getItem("peerEvaluationAnswers");

if (storedAnswers) {
  try {
    Object.assign(answers, JSON.parse(storedAnswers));
  } catch (error) {
    console.warn("Invalid stored peer evaluation answers. Clearing them.");
    sessionStorage.removeItem("peerEvaluationAnswers");
  }
}

// ============================================
// Load peer criteria from backend
// ============================================
async function loadPeerCriteria() {
  try {
    peerRatingParts = await apiGet("/evaluation-criteria/peerToPeer");

    if (
      !Array.isArray(peerRatingParts) ||
      peerRatingParts.length === 0
    ) {
      throw new Error("No peer-to-peer evaluation criteria found.");
    }

    // --------------------------------------------
    // Keep ONLY answers belonging to the current
    // backend criteria.
    //
    // This removes stale answers from the old
    // pr1–pr11 structure.
    // --------------------------------------------
    const validQuestionIds = new Set(
      peerRatingParts.flatMap((part) =>
        Array.isArray(part.questions)
          ? part.questions.map((q) => q.id)
          : []
      )
    );

    Object.keys(answers).forEach((questionId) => {
      if (!validQuestionIds.has(questionId)) {
        delete answers[questionId];
      }
    });

    sessionStorage.setItem(
      "peerEvaluationAnswers",
      JSON.stringify(answers)
    );

    // --------------------------------------------
    // Open the first incomplete part.
    // --------------------------------------------
    currentPartIndex = peerRatingParts.findIndex(
      (part) => !isPartCompleteForPart(part)
    );

    if (currentPartIndex === -1) {
      currentPartIndex = 0;
    }

    renderPart(currentPartIndex);
  } catch (error) {
    console.error(
      "Failed to load peer-to-peer criteria:",
      error
    );

    const container = document.getElementById(
      "rating-parts-container"
    );

    if (container) {
      container.innerHTML = `
        <p class="text-sm text-red-600">
          Unable to load the evaluation criteria.
          Please refresh the page and try again.
        </p>
      `;
    }
  }
}

// ============================================
// Check if a specific part is complete
// ============================================
function isPartCompleteForPart(part) {
  if (!part || !Array.isArray(part.questions)) {
    return false;
  }

  return part.questions.every(
    (q) => answers[q.id] !== undefined
  );
}

// ============================================
// Check if current part is complete
// ============================================
function isPartComplete(partIndex) {
  return isPartCompleteForPart(
    peerRatingParts[partIndex]
  );
}

// ============================================
// Render colleague name
// ============================================
function renderEvaluatingColleagueName() {
  const nameEl = document.getElementById(
    "evaluating-colleague-name"
  );

  const stored =
    sessionStorage.getItem("evaluatingColleague");

  if (nameEl && stored) {
    try {
      const colleague = JSON.parse(stored);
      nameEl.textContent = colleague.name || "";
    } catch (error) {
      console.warn(
        "Unable to read evaluating colleague:",
        error
      );
    }
  }
}

// ============================================
// Incomplete warning
// ============================================
function showIncompleteWarning() {
  let warning = document.getElementById(
    "incomplete-warning"
  );

  if (!warning) {
    warning = document.createElement("p");
    warning.id = "incomplete-warning";
    warning.className =
      "text-sm text-red-600 mt-3 text-right";
    warning.textContent =
      "Please answer all questions in this section before proceeding.";

    const nextBtn =
      document.getElementById("next-btn");

    if (nextBtn) {
      nextBtn.insertAdjacentElement(
        "beforebegin",
        warning
      );
    }
  }
}

// ============================================
// Render one part
// ============================================
function renderPart(partIndex) {
  const existingWarning =
    document.getElementById("incomplete-warning");

  if (existingWarning) {
    existingWarning.remove();
  }

  const container =
    document.getElementById(
      "rating-parts-container"
    );

  const part = peerRatingParts[partIndex];

  if (!container || !part) {
    console.error(
      "Peer-to-peer evaluation part not found:",
      partIndex
    );
    return;
  }

  const questionsHtml = (
    part.questions || []
  )
    .map((q, qIndex) => {
      const optionsHtml =
        peerRatingScale.scaleLabels
          .map((scale) => {
            const isChecked =
              String(answers[q.id]) ===
              String(scale.value)
                ? "checked"
                : "";

            return `
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="${q.id}"
                  value="${scale.value}"
                  ${isChecked}
                  class="w-4 h-4 text-brand focus:ring-brand border-gray-300"
                >
                <span class="text-sm text-gray-700">
                  ${scale.value}
                </span>
              </label>
            `;
          })
          .join("");

      const isLast =
        qIndex === part.questions.length - 1;

      return `
        <div
          class="flex flex-col sm:flex-row
                 sm:items-center sm:justify-between
                 gap-3 py-4
                 ${!isLast ? "border-b border-gray-200" : ""}"
        >
          <p class="text-sm text-gray-800 sm:pr-6">
            ${nlToBr(q.text || "")}
          </p>

          <div class="flex gap-4 shrink-0">
            ${optionsHtml}
          </div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = `
    <h3
      class="font-semibold text-gray-800
             border-b border-gray-300
             pb-2 mb-2"
    >
      ${nlToBr(part.title || "")}
    </h3>

    ${questionsHtml}
  `;

  // --------------------------------------------
  // Radio listeners
  // --------------------------------------------
  part.questions.forEach((q) => {
    document
      .querySelectorAll(
        `input[name="${CSS.escape(q.id)}"]`
      )
      .forEach((radio) => {
        radio.addEventListener(
          "change",
          (event) => {
            answers[q.id] =
              event.target.value;

            sessionStorage.setItem(
              "peerEvaluationAnswers",
              JSON.stringify(answers)
            );

            const warning =
              document.getElementById(
                "incomplete-warning"
              );

            if (warning) {
              warning.remove();
            }
          }
        );
      });
  });

  updateNavButtons(partIndex);
}

// ============================================
// Navigation buttons
// ============================================
function updateNavButtons(partIndex) {
  const backBtn =
    document.getElementById("back-btn");

  const nextBtn =
    document.getElementById("next-btn");

  const backToListBtn =
    document.getElementById(
      "back-to-colleague-list-btn"
    );

  const isFirstPart = partIndex === 0;
  const isLastPart =
    partIndex === peerRatingParts.length - 1;

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
    nextBtn.textContent =
      isLastPart ? "Continue" : "Next";
  }
}

// ============================================
// Back
// ============================================
function goBack() {
  if (!peerRatingParts.length) {
    return;
  }

  if (currentPartIndex > 0) {
    currentPartIndex--;
    renderPart(currentPartIndex);
  }
}

// ============================================
// Next
// ============================================
function goNext() {
  if (!isPartComplete(currentPartIndex)) {
    showIncompleteWarning();
    return;
  }

  if (
    currentPartIndex <
    peerRatingParts.length - 1
  ) {
    currentPartIndex++;
    renderPart(currentPartIndex);
    return;
  }

  // --------------------------------------------
  // Final validation:
  // make absolutely sure every current
  // backend question has an answer.
  // --------------------------------------------
  const currentQuestionIds =
    peerRatingParts.flatMap((part) =>
      part.questions.map((q) => q.id)
    );

  const missingQuestionIds =
    currentQuestionIds.filter(
      (questionId) =>
        answers[questionId] === undefined
    );

  if (missingQuestionIds.length > 0) {
    console.error(
      "Missing peer evaluation answers:",
      missingQuestionIds
    );

    alert(
      "Please answer all peer evaluation questions before continuing."
    );

    return;
  }

  // --------------------------------------------
  // Store ONLY current question answers.
  // This prevents stale old question IDs from
  // reaching the backend.
  // --------------------------------------------
  const cleanAnswers = {};

  currentQuestionIds.forEach((questionId) => {
    cleanAnswers[questionId] =
      answers[questionId];
  });

  sessionStorage.setItem(
    "peerEvaluationAnswers",
    JSON.stringify(cleanAnswers)
  );

  window.location.href =
    "peer-comments.html";
}

// ============================================
// Event listeners
// ============================================
document
  .getElementById("back-btn")
  .addEventListener("click", goBack);

document
  .getElementById("next-btn")
  .addEventListener("click", goNext);

document
  .getElementById(
    "back-to-colleague-list-btn"
  )
  .addEventListener("click", () => {
    sessionStorage.removeItem(
      "peerEvaluationAnswers"
    );

    sessionStorage.removeItem(
      "peerDraftComment"
    );

    sessionStorage.removeItem(
      "evaluatingColleague"
    );

    window.location.href =
      "select-colleague.html";
  });

// ============================================
// P2P scale description
// ============================================
const scaleDescriptionEl =
  document.getElementById(
    "scale-description-text"
  );

if (scaleDescriptionEl) {
  scaleDescriptionEl.textContent =
    "Rate the faculty member on the following criteria (1 - 4).";
}

// ============================================
// Academic year (loaded from System Management)
// ============================================
(async () => {
  await loadSystemSettings();
  const el = document.getElementById("academic-year-display");
  if (el) {
    el.textContent = getAcademicYearDisplay();
  }
})();

// ============================================
// Initialize
// ============================================
renderEvaluatingColleagueName();
loadPeerCriteria();