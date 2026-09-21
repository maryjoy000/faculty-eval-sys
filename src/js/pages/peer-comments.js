// ============================================
// FACULTY: PEER COMMENTS PAGE (final wizard step)
// ============================================
let peerRatingParts = [];
let peerScale = null;

async function loadPeerCriteria() {
  try {
    peerScale =
      await loadEvaluationScale(
        "peerToPeer"
      );

    peerRatingParts =
      await apiGet(
        "/evaluation-criteria/peerToPeer"
      );

  } catch (error) {
    console.error(
      "Failed to load peer criteria:",
      error
    );

    alert(
      "Unable to load evaluation criteria."
    );
  }
}

function renderEvaluatingColleagueName() {
  const nameEl = document.getElementById("evaluating-colleague-name");
  const stored = sessionStorage.getItem("evaluatingColleague");
  if (nameEl && stored) {
    const colleague = JSON.parse(stored);
    nameEl.textContent = `${colleague.name}`;
  }
}

function restoreDraftComment() {
  const textarea = document.getElementById("comments-textarea");
  const draft = sessionStorage.getItem("peerDraftComment");
  if (textarea && draft) textarea.value = draft;
}

function calculateCategoryScores(answers) {
  const categoryScores = peerRatingParts.map((part) => {
    const values = part.questions.map((q) => Number(answers[q.id])).filter((v) => !isNaN(v) && v > 0);
    const average = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
    return { title: part.title.replace(/\n/g, " — "), average };
  });

  const allValues = Object.values(answers).map(Number).filter((v) => !isNaN(v) && v > 0);
  const overallAverage = allValues.length > 0 ? allValues.reduce((sum, v) => sum + v, 0) / allValues.length : 0;

  return { categoryScores, overallAverage };
}


function goBack() {
  window.location.href = "rate-colleague.html";
}

async function handleSubmit() {
    if (!peerRatingParts.length) {
    await loadPeerCriteria();
  }

  if (!peerRatingParts.length) {
    alert("Evaluation criteria could not be loaded. Please try again.");
    return;
  }
  
  const commentText = document.getElementById("comments-textarea").value.trim();
  const answers = JSON.parse(sessionStorage.getItem("peerEvaluationAnswers") || "{}");
  const colleague = JSON.parse(sessionStorage.getItem("evaluatingColleague") || "{}");

  const { categoryScores, overallAverage } = calculateCategoryScores(answers);
  const maxRating = Math.max(
  ...peerScale.scaleLabels.map(
    (scale) => Number(scale.value)
  )
);

  const ratingPercentage =
    maxRating > 0
      ? (overallAverage / maxRating) * 100
      : 0;

  const matchingBand =
    peerScale.equivalents.find(
      (band) =>
        overallAverage >= Number(band.min) &&
        overallAverage <= Number(band.max)
    );

  const ratingEquivalent =
    matchingBand
      ? matchingBand.label
      : "N/A";

  showConfirmModal({
    title: "Submit Peer Evaluation?",
    message: `Once submitted, you won't be able to change your ratings or comments for ${colleague.name}.`,
    confirmLabel: "Submit Evaluation",
    isDestructive: false,
    onConfirm: async () => {
      try {
        const responses = Object.entries(answers).map(
          ([questionId, rating]) => ({
            question_id: questionId,
            rating: Number(rating)
          })
        );

        const result = await apiPost("/evaluations", {
          evaluation_type: "peerToPeer",
          faculty_id: colleague.id,
          responses,
          comments: commentText
        });

        console.log(
          "Peer evaluation successfully submitted to backend:",
          result
        );

        sessionStorage.removeItem("peerEvaluationAnswers");
        sessionStorage.removeItem("peerDraftComment");

        const submitArea = document.getElementById("submit-area");

        submitArea.innerHTML = `
          <span class="text-sm font-medium text-green-600">
            Evaluation Submitted!
          </span>
          <button
            type="button"
            id="select-colleague-btn"
            class="btn-primary"
          >
            Select Colleague
          </button>
        `;

        document
          .getElementById("select-colleague-btn")
          .addEventListener("click", () => {
            window.location.href = "select-colleague.html";
          });

        document.getElementById("comments-textarea").disabled = true;
        document.getElementById("back-btn").disabled = true;

        renderRatingSummary(
          categoryScores,
          overallAverage,
          ratingEquivalent
        );

      } catch (error) {
        console.error(
          "Failed to submit peer evaluation:",
          error
        );

        alert(
          error?.message ||
          "Failed to submit peer evaluation. Please try again."
        );
      }
    }
  });
}

function renderRatingSummary(categoryScores, overallAverage, ratingEquivalent) {
  const container = document.getElementById("rating-summary-container");
  if (!container) return;

  const rowsHtml = categoryScores.map((cat) => `
    <div class="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
      <span class="text-gray-700">${cat.title}</span>
      <span class="font-medium text-gray-800">${cat.average.toFixed(2)}</span>
    </div>
  `).join("");

  container.innerHTML = `
    <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-6">
      <h3 class="font-semibold text-gray-800 mb-2">Rating Summary</h3>
      ${rowsHtml}
      <div class="flex items-center justify-between pt-3 mt-2 border-t border-gray-300">
        <span class="font-semibold text-gray-800">Overall Average</span>
        <span class="font-bold text-brand">${overallAverage.toFixed(2)} — ${ratingEquivalent}</span>
      </div>
    </div>
  `;
  container.classList.remove("hidden");
}

document.getElementById("back-btn").addEventListener("click", goBack);
document.getElementById("submit-btn").addEventListener("click", handleSubmit);
document.getElementById("comments-textarea").addEventListener("input", (e) => {
  sessionStorage.setItem("peerDraftComment", e.target.value);
});

document.getElementById("academic-year-display").textContent = getAcademicYearDisplay();
renderEvaluatingColleagueName();
restoreDraftComment();
loadPeerCriteria();