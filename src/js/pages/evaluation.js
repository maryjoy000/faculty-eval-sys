// ============================================
// ADMIN: CLASSROOM OBSERVATION EVALUATION PAGE
// ============================================

function mountPageContent() {
  const template = document.getElementById("page-content-template");
  const slot = document.getElementById("admin-page-content");

  if (template && slot) {
    slot.appendChild(template.content.cloneNode(true));
  }
}

// --- Faculty list to observe ---

// --- Classroom Observation domains (loaded from the backend in initializeEvaluationPage) ---
let observationCriteria = [];

let observationScale = null;

// --- State ---
let currentFacultyBeingObserved = null;
let currentDomainIndex = 0;
const observationAnswers = {};

// --- Draft (save progress & continue later; classroom observations
// have no comment step, so only answers are stored) ---
let draftOwner = null;

async function initObservationDraftContext() {
  if (!draftOwner) draftOwner = await getDraftOwner();
  return draftOwner;
}

function persistObservationDraft() {
  if (!draftOwner || !currentFacultyBeingObserved) return;

  saveEvalDraft("observation", currentFacultyBeingObserved.id, draftOwner, {
    answers: { ...observationAnswers },
    comment: "",
  });
}

var evaluationFacultyPager = null;
function getEvaluationFacultyPager() {
  if (!evaluationFacultyPager) {
    if (typeof TablePagination !== "undefined" && TablePagination.create) {
      evaluationFacultyPager = TablePagination.create({ defaultPerPage: 10 });
    } else {
      evaluationFacultyPager = null;
    }
  }
  return evaluationFacultyPager;
}

// --- Render the faculty selection table ---
async function renderEvaluationFacultyTable() {
  const tableBody = document.getElementById("evaluation-faculty-table-body");
  if (!tableBody) return;

  const roster = await loadFacultyRoster();

  let observations = [];

  try {
    observations = await apiGet(
      "/evaluations/dashboard-classroom-observations",
    );
  } catch (error) {
    console.error("Failed to load classroom observations:", error);
  }

  tableBody.innerHTML = "";
  const pager = getEvaluationFacultyPager();
  const pageRoster = pager ? pager.paginate(roster) : roster;

  if (pageRoster.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="py-6 text-center text-gray-400">
          No faculty found.
        </td>
      </tr>
    `;
  } else {
    tableBody.innerHTML = pageRoster
      .map((faculty) => {
        const observationData = observations.find(
          (item) => String(item.faculty_id) === String(faculty.id),
        );

        const isObserved = !!observationData;

        const actionButtonHtml = isObserved
          ? `<button type="button" class="view-observation-results-btn btn-secondary text-sm px-4 py-1.5" data-faculty-id="${faculty.id}">View Results</button>`
          : `<button type="button" class="start-observation-btn btn-primary text-sm px-4 py-1.5" data-faculty-id="${faculty.id}">Observe</button>`;

        return `
      <tr class="border-b border-gray-200 last:border-0">
        <td class="py-3 pr-4">${faculty.name}</td>
        <td class="py-3 pr-4">${(faculty.subjects || [])
          .map(
            (subject) =>
              subject.name || subject.subject_name || subject.code || "",
          )
          .filter(Boolean)
          .join(", ")}
        <td class="py-3 pr-4 ${isObserved ? "text-green-600" : "text-brand"} font-medium">
          ${isObserved ? "Observed" : "Not yet observed"}
        </td>
        <td class="py-3">${actionButtonHtml}</td>
      </tr>
    `;
      })
      .join("");
  }

  if (pager) {
    pager.render("evaluation-faculty-pagination", roster.length, renderEvaluationFacultyTable);
  } else {
    const fallbackContainer = document.getElementById("evaluation-faculty-pagination");
    if (fallbackContainer) fallbackContainer.innerHTML = "";
  }

  document.querySelectorAll(".start-observation-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      startObservation(btn.dataset.facultyId),
    );
  });

  document.querySelectorAll(".view-observation-results-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const faculty = roster.find(
        (f) => String(f.id) === btn.dataset.facultyId,
      );

      try {
        const observationData = await apiGet(
          `/evaluations/${faculty.id}/classroom-breakdown`,
        );

        showObservationResultsModal(faculty, observationData);
      } catch (error) {
        console.error("Failed to load observation results:", error);
        alert(error.message || "Failed to load observation results.");
      }
    });
  });
}

// --- Draft resume banner (save progress & continue later) ---
async function renderObservationDraftBanner() {
  const banner = document.getElementById("draft-resume-banner");
  if (!banner) return;

  banner.classList.add("hidden");
  banner.innerHTML = "";

  await initObservationDraftContext();
  if (!draftOwner) return;

  let observations = [];
  try {
    observations = await apiGet("/evaluations/dashboard-classroom-observations");
  } catch (error) {
    console.error("Failed to load classroom observations for drafts:", error);
  }

  const roster = getFacultyRoster();

  const entries = listEvalDrafts("observation", draftOwner)
    .map((draft) => {
      const faculty = (roster || []).find(
        (f) => String(f.id) === String(draft.subjectId)
      );
      if (!faculty) return null;

      const observed = (observations || []).some(
        (item) => String(item.faculty_id) === String(draft.subjectId)
      );
      if (observed) {
        clearEvalDraft("observation", draft.subjectId);
        return null;
      }

      return { draft, faculty };
    })
    .filter(Boolean);

  if (!entries.length) return;

  const escapeName = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  banner.innerHTML = `
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <p class="text-sm font-semibold text-blue-800 mb-1">Unfinished observation${entries.length === 1 ? "" : "s"}</p>
      <p class="text-xs text-blue-700 mb-3">Your progress was auto-saved. Continue where you left off, or discard it.</p>
      <div class="space-y-2">
        ${entries
          .map(
            ({ draft, faculty }) => `
          <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between bg-white border border-blue-100 rounded-lg px-3 py-2">
            <span class="text-sm text-gray-700">
              <span class="font-medium">${escapeName(faculty.name)}</span>
              <span class="text-gray-400">· ${draft.answeredCount} answer${draft.answeredCount === 1 ? "" : "s"} saved</span>
            </span>
            <span class="flex gap-2">
              <button type="button" class="resume-draft-btn btn-primary text-sm px-4 py-1.5" data-faculty-id="${faculty.id}">Continue</button>
              <button type="button" class="discard-draft-btn btn-secondary text-sm px-4 py-1.5" data-faculty-id="${faculty.id}">Discard</button>
            </span>
          </div>`
          )
          .join("")}
      </div>
    </div>`;

  banner.classList.remove("hidden");

  banner.querySelectorAll(".resume-draft-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      startObservation(btn.dataset.facultyId);
    });
  });

  banner.querySelectorAll(".discard-draft-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      clearEvalDraft("observation", btn.dataset.facultyId);
      await renderObservationDraftBanner();
    });
  });
}

// --- Start observing a specific faculty member ---
async function startObservation(facultyId) {
  currentFacultyBeingObserved = getFacultyRoster().find(
    (f) => String(f.id) === String(facultyId),
  );
  currentDomainIndex = 0;

  // Clear previous in-progress answers when starting fresh,
  // then restore this faculty's autosaved draft (if any).
  Object.keys(observationAnswers).forEach(
    (key) => delete observationAnswers[key],
  );

  if (currentFacultyBeingObserved) {
    await initObservationDraftContext();

    if (draftOwner && Array.isArray(observationCriteria) && observationCriteria.length) {
      const draft = loadEvalDraft(
        "observation",
        currentFacultyBeingObserved.id,
        draftOwner
      );

      if (draft) {
        const validIds = new Set(
          observationCriteria.flatMap((part) =>
            (part.questions || []).map((q) => q.id)
          )
        );

        Object.assign(
          observationAnswers,
          pruneDraftAnswers(draft.answers, validIds)
        );
      }
    }

    // Jump to the first incomplete domain so resuming continues
    // where the previous session left off.
    for (let i = 0; i < observationCriteria.length; i++) {
      currentDomainIndex = i;
      if (!isObservationDomainComplete(i)) break;
    }
  }

  document.getElementById("evaluation-faculty-name").textContent =
    `${currentFacultyBeingObserved.name} (${currentFacultyBeingObserved.subjects.join(", ")})`;

  document.getElementById("evaluation-select-view").classList.add("hidden");
  document.getElementById("evaluation-form-view").classList.remove("hidden");

  renderDomain(currentDomainIndex);
}

// --- Render one domain's questions ---
function renderDomain(domainIndex) {
  const existingWarning = document.getElementById("observation-incomplete-warning");
  if (existingWarning) {
    existingWarning.remove();
  }

  const container = document.getElementById("evaluation-domains-container");
  const part = observationCriteria[domainIndex];
  const questionsHtml = part.questions
    .map((q, qIndex) => {
      const optionsHtml = observationScale.scaleLabels
        .map((scalePoint) => {
          const value = scalePoint.value;
          const isChecked =
            observationAnswers[q.id] === String(value) ? "checked" : "";
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

      const isLast = qIndex === part.questions.length - 1;

      return `
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 ${!isLast ? "border-b border-gray-200" : ""}">
        <p class="text-sm text-gray-800 sm:pr-6">${nlToBr(q.text)}</p>
        <div class="flex gap-4 shrink-0">${optionsHtml}</div>
      </div>
    `;
    })
    .join("");

  container.innerHTML = `
    <h3 class="font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-2">${nlToBr(part.title)}</h3>
    ${questionsHtml}
  `;

  part.questions.forEach((q) => {
    document.querySelectorAll(`input[name="${q.id}"]`).forEach((radio) => {
      radio.addEventListener("change", (e) => {
        observationAnswers[q.id] = e.target.value;
        persistObservationDraft();
        const warning = document.getElementById("observation-incomplete-warning");
        if (warning) {
          warning.remove();
        }
      });
    });
  });

  document.getElementById("evaluation-domain-back-btn").disabled =
    domainIndex === 0;
}

function isObservationDomainComplete(domainIndex) {
  const part = observationCriteria[domainIndex];
  return part.questions.every(
    (q) => observationAnswers[q.id] !== undefined
  );
}

function showObservationIncompleteWarning() {
  let warning = document.getElementById("observation-incomplete-warning");
  if (!warning) {
    warning = document.createElement("p");
    warning.id = "observation-incomplete-warning";
    warning.className = "text-sm text-red-600 mt-3 text-right";
    warning.textContent = "Please answer all questions in this domain before proceeding.";
    document
      .getElementById("evaluation-domain-next-btn")
      .insertAdjacentElement("beforebegin", warning);
  }
}

// --- Navigation between domains ---
function goToPreviousDomain() {
  if (currentDomainIndex > 0) {
    currentDomainIndex--;
    renderDomain(currentDomainIndex);
  }
}

function goToNextDomain() {
  if (!isObservationDomainComplete(currentDomainIndex)) {
    showObservationIncompleteWarning();
    return;
  }

  if (currentDomainIndex < observationCriteria.length - 1) {
    currentDomainIndex++;
    renderDomain(currentDomainIndex);
  } else {
    // Last domain reached — review every answer before finalizing
    showReviewModal({
      title: "Review Classroom Observation",
      subtitle: currentFacultyBeingObserved
        ? currentFacultyBeingObserved.name
        : "",
      summaryHtml: buildReviewSummaryHtml({
        parts: observationCriteria,
        answers: observationAnswers,
        scaleLabels: observationScale ? observationScale.scaleLabels : [],
        equivalents: observationScale ? observationScale.equivalents : [],
        includeComment: false
      }),
      confirmLabel: "Submit Observation",
      onConfirm: finalizeClassroomObservation,
    });
  }
}

async function finalizeClassroomObservation() {
  const responses = Object.entries(observationAnswers).map(
    ([questionId, value]) => ({
      question_id: questionId,
      rating: Number(value),
    }),
  );

  if (responses.length === 0) {
    alert("Please complete the classroom observation before submitting.");
    return;
  }

  const expectedQuestionCount = observationCriteria.reduce(
    (total, domain) => total + domain.questions.length,
    0,
  );

  if (responses.length !== expectedQuestionCount) {
    alert("Please rate all classroom observation criteria before submitting.");
    return;
  }

  try {
    const result = await apiPost("/evaluations", {
      evaluation_type: "classroomObservation",
      faculty_id: currentFacultyBeingObserved.id,
      responses,
      comments: null,
    });

    console.log(
      `Classroom observation submitted for ${currentFacultyBeingObserved.name}`,
      result,
    );

    document.getElementById("evaluation-form-view").classList.add("hidden");
    document
      .getElementById("evaluation-select-view")
      .classList.remove("hidden");

    Object.keys(observationAnswers).forEach(
      (key) => delete observationAnswers[key],
    );

    if (currentFacultyBeingObserved) {
      clearEvalDraft("observation", currentFacultyBeingObserved.id);
    }

    await renderEvaluationFacultyTable();
    await renderObservationDraftBanner();
  } catch (error) {
    console.error("Failed to submit classroom observation:", error);
    alert(error.message || "Failed to submit classroom observation.");
  }
}

// --- Populate and open the Observation Results modal ---
function showObservationResultsModal(faculty, observationData) {
  const modalBody = document.getElementById("observation-results-modal-body");

  if (!observationData) {
    modalBody.innerHTML = `
      <p class="text-sm text-gray-500">
        No classroom observation results found.
      </p>
    `;

    document
      .getElementById("observation-results-modal")
      .classList.remove("hidden");
    return;
  }

  const domainsHtml = (observationData.domains || [])
    .map(
      (domain) => `
    <div class="flex items-center justify-between py-3 border-b border-gray-100">
      <span class="text-sm text-gray-700">
        Part ${domain.part_number}: ${domain.title}
      </span>

      <span class="font-semibold text-brand">
        ${domain.average !== null ? domain.average.toFixed(2) : "--"}
      </span>
    </div>
  `,
    )
    .join("");

  const overallAverage =
    typeof observationData.overall_average === "number"
      ? observationData.overall_average.toFixed(2)
      : "--";

  const overallPercentage =
    typeof observationData.overall_rating_pct === "number"
      ? `${observationData.overall_rating_pct.toFixed(2)}%`
      : "--";

  modalBody.innerHTML = `
    <h3 class="font-semibold text-gray-800 mb-1">
      ${faculty.name}
    </h3>

    <p class="text-xs text-gray-400 mb-4">
      Classroom Observation Results
    </p>

    <div>
      ${domainsHtml}
    </div>

    <div class="flex items-center justify-between pt-4 mt-3 border-t border-gray-300">
      <span class="font-semibold text-gray-800">
        Overall Result
      </span>

      <span class="font-bold text-brand">
        ${overallAverage} — ${overallPercentage}
      </span>
    </div>
  `;

  document
    .getElementById("observation-results-modal")
    .classList.remove("hidden");
}

function attachObservationResultsModalListeners() {
  const modal = document.getElementById("observation-results-modal");
  const backdrop = document.getElementById(
    "observation-results-modal-backdrop",
  );
  const closeBtn = document.getElementById(
    "close-observation-results-modal-btn",
  );

  function closeModal() {
    modal.classList.add("hidden");
  }

  backdrop.addEventListener("click", closeModal);
  closeBtn.addEventListener("click", closeModal);
}

// --- Initialize ---
async function initializeEvaluationPage() {
  mountPageContent();

  try {
    observationCriteria = await apiGet("/evaluation-criteria/classroomObservation");

    if (!Array.isArray(observationCriteria) || observationCriteria.length === 0) {
      throw new Error("No classroom observation criteria found.");
    }

    observationScale = await loadEvaluationScale("classroomObservation");

    const scaleDescriptionText = document.getElementById(
      "scale-description-text",
    );

    if (scaleDescriptionText) {
      scaleDescriptionText.textContent =
        "Rate the faculty member on the following criteria (" +
        observationScale.scaleLabels
          .map((s) => `${s.value} - ${s.label}`)
          .join(", ") +
        ").";
    }

    await renderEvaluationFacultyTable();
    await renderObservationDraftBanner();
  } catch (error) {
    console.error("Failed to initialize classroom observation:", error);

    alert("Unable to load the classroom observation criteria or rating scale.");
  }

  attachObservationResultsModalListeners();

  document
    .getElementById("evaluation-back-to-select-btn")
    .addEventListener("click", () => {
      document.getElementById("evaluation-form-view").classList.add("hidden");

      document
        .getElementById("evaluation-select-view")
        .classList.remove("hidden");
    });

  document
    .getElementById("evaluation-domain-back-btn")
    .addEventListener("click", goToPreviousDomain);

  document
    .getElementById("evaluation-domain-next-btn")
    .addEventListener("click", goToNextDomain);

  document.getElementById("evaluation-form-view").classList.add("hidden");
}

initializeEvaluationPage();
