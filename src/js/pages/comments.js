// ============================================
// COMMENTS / SUGGESTIONS PAGE (final wizard step)
// ============================================

let ratingParts = [];

// --- Load the same authoritative criteria used by the rating page ---
async function loadStudentCriteria() {
  try {
    ratingParts = await apiGet("/evaluation-criteria/student");

    if (!Array.isArray(ratingParts) || ratingParts.length === 0) {
      throw new Error("No student evaluation criteria found.");
    }

    return ratingParts;

  } catch (error) {
    console.error(
      "Failed to load student evaluation criteria:",
      error
    );

    throw error;
  }
}

// --- Show which faculty is being evaluated ---
function renderEvaluatingFacultyName() {
  const nameEl = document.getElementById("evaluating-faculty-name");
  const stored = sessionStorage.getItem("evaluatingFaculty");
  if (nameEl && stored) {
    const faculty = JSON.parse(stored);
    nameEl.textContent = `${faculty.faculty} (${faculty.subjectNames})`;
  }
}
// --- Placeholder sentiment analysis ---
function analyzeSentimentPlaceholder(commentText) {
  console.log("Sentiment analysis placeholder — comment text that would be sent to backend:");
  console.log(commentText);
  console.log("Real sentiment categorization (Positive/Neutral/Negative) will be returned by the backend model later.");
}

// --- Calculate a rating percentage from the 15 answered questions ---
function calculateRatingPercentage(answers) {
  const values = Object.values(answers).map(Number);
  if (values.length === 0) return 0;

  const average = values.reduce((sum, val) => sum + val, 0) / values.length;
  return (average / 5) * 100;
}

// --- Persist that this faculty/subject has now been evaluated ---
function markFacultyAsEvaluated(facultyCode, resultData) {
  const evaluatedSubjects = JSON.parse(localStorage.getItem("evaluatedSubjects") || "{}");
  evaluatedSubjects[facultyCode] = resultData;
  localStorage.setItem("evaluatedSubjects", JSON.stringify(evaluatedSubjects));
}

// --- Handle "Back" ---
function goBack() {
  window.location.href = "rate-faculty.html";
}

async function handleSubmit() {
  const commentText = document.getElementById("comments-textarea").value.trim();
  const answers = JSON.parse(sessionStorage.getItem("evaluationAnswers") || "{}");
  const faculty = JSON.parse(sessionStorage.getItem("evaluatingFaculty") || "{}");

  try {
    // Convert the stored answers into the format expected by the backend
    const responses = Object.entries(answers).map(([questionId, rating]) => ({
      question_id: questionId,
      rating: Number(rating)
    }));

    const result = await apiPost("/evaluations", {
      evaluation_type: "student",
      faculty_id: faculty.facultyId,
      responses,
      comments: commentText
    });

    console.log("Evaluation successfully submitted to backend:", result);

    const { categoryScores, overallAverage } = calculateCategoryScores(answers);
    const ratingPercentage = (overallAverage / 5) * 100;
    const ratingEquivalent = getScaleEquivalent("student", overallAverage);

    // Keep the frontend record for now
    markFacultyAsEvaluated(faculty.facultyId, {
      status: "evaluated",
      rating: ratingPercentage,
      average: overallAverage,
      equivalent: ratingEquivalent,
      categoryScores,
      comments: commentText,
      submittedAt: new Date().toLocaleString()
    });

    sessionStorage.removeItem("evaluationAnswers");
    sessionStorage.removeItem("draftComment");

    const submitArea = document.getElementById("submit-area");

    submitArea.innerHTML = `
      <span id="submitted-message" class="text-sm font-medium text-green-600">
        Evaluation Submitted!
      </span>
      <button type="button" id="select-faculty-btn" class="btn-primary">
        Select Faculty
      </button>
    `;

    document.getElementById("select-faculty-btn").addEventListener("click", () => {
      window.location.href = "select-faculty.html";
    });

    document.getElementById("comments-textarea").disabled = true;
    document.getElementById("back-btn").disabled = true;

    renderRatingSummary(
      categoryScores,
      overallAverage,
      ratingEquivalent
    );

  } catch (error) {
    console.error("Failed to submit evaluation:", error);

    alert(
      error?.message ||
      "Failed to submit evaluation. Please try again."
    );
  }
}

// --- Render the category breakdown + overall average + rating equivalent ---
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

// --- Calculate per-category (per-part) averages, plus the overall average ---
function calculateCategoryScores(answers) {
  const categoryScores = ratingParts.map((part) => {
    const values = part.questions
      .map((q) => Number(answers[q.id]))
      .filter((v) => !isNaN(v) && v > 0);

    const average = values.length > 0
      ? values.reduce((sum, v) => sum + v, 0) / values.length
      : 0;

    return {
      title: part.title.replace(/\n/g, " — "), // flatten to plain text for display
      average
    };
  });

  const allValues = Object.values(answers).map(Number).filter((v) => !isNaN(v) && v > 0);
  const overallAverage = allValues.length > 0
    ? allValues.reduce((sum, v) => sum + v, 0) / allValues.length
    : 0;

  return { categoryScores, overallAverage };
}

// --- Restore any in-progress comment text ---
function restoreDraftComment() {
  const textarea = document.getElementById("comments-textarea");
  const draft = sessionStorage.getItem("draftComment");
  if (textarea && draft) {
    textarea.value = draft;
  }
}

// --- Show the admin announcement banner, if one is active ---
function renderAnnouncementBanner() {
  const banner = document.getElementById("announcement-banner");
  if (!banner) return;

  const announcement = getAnnouncement();

  if (announcement.isActive && announcement.message) {
    banner.textContent = announcement.message;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

// --- Initialize page ---
async function initializeCommentsPage() {
  try {
    await loadStudentCriteria();

    document.getElementById("academic-year-display").textContent =
      getAcademicYearDisplay();

    document.getElementById("back-btn").addEventListener("click", goBack);

    document.getElementById("submit-btn").addEventListener("click", () => {
      showConfirmModal({
        title: "Submit Evaluation?",
        message:
          "Once submitted, you won't be able to change your ratings or comments for this faculty member.",
        confirmLabel: "Submit Evaluation",
        isDestructive: false,
        onConfirm: handleSubmit
      });
    });

    document
      .getElementById("comments-textarea")
      .addEventListener("input", (e) => {
        sessionStorage.setItem(
          "draftComment",
          e.target.value
        );
      });

    restoreDraftComment();
    renderEvaluatingFacultyName();
    renderAnnouncementBanner();

  } catch (error) {
    console.error(
      "Failed to initialize comments page:",
      error
    );

    alert(
      "Unable to load the evaluation criteria. Please refresh the page and try again."
    );
  }
}

initializeCommentsPage();