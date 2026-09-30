// ============================================
// HR EVALUATION PAGE
// ============================================

function mountPageContent() {
  const template = document.getElementById("page-content-template");
  const slot = document.getElementById("hr-page-content");

  if (template && slot) {
    slot.appendChild(template.content.cloneNode(true));
  }
}

let hrCriteria = [];
let hrScale = null;
let currentFacultyBeingEvaluated = null;

const hrAnswers = {};

// --- Draft (save progress & continue later; answers plus the
// required written comment are stored) ---
let draftOwner = null;

async function initHrDraftContext() {
  if (!draftOwner) draftOwner = await getDraftOwner();
  return draftOwner;
}

function getHrComment() {
  const textarea = document.getElementById("hr-comments-textarea");
  return textarea ? textarea.value : "";
}

function persistHrDraft() {
  if (!draftOwner || !currentFacultyBeingEvaluated) return;

  saveEvalDraft("hr", currentFacultyBeingEvaluated.id, draftOwner, {
    answers: { ...hrAnswers },
    comment: getHrComment(),
  });
}

var hrFacultyPager = null;
function getHrFacultyPager() {
  if (!hrFacultyPager) {
    if (typeof TablePagination !== "undefined" && TablePagination.create) {
      hrFacultyPager = TablePagination.create({ defaultPerPage: 10 });
    } else {
      hrFacultyPager = null;
    }
  }
  return hrFacultyPager;
}

async function loadHrEvaluationData() {
  const [criteria, scale, faculty] = await Promise.all([
    apiGet("/evaluation-criteria/hrEvaluation"),
    loadEvaluationScale("hrEvaluation"),
    apiGet("/faculty")
  ]);

  hrCriteria = criteria || [];
  hrScale = scale;
  facultyRosterCache = (faculty || []).filter(
    (facultyMember) => facultyMember.status === "Active"
  );
}

async function getHrEvaluationStatus() {
  const dashboard = await apiGet("/evaluations/hr-dashboard");

  return new Map(
    dashboard.evaluations.map((faculty) => [
      String(faculty.id),
      faculty
    ])
  );
}

async function renderHrFacultyTable() {
  const tableBody = document.getElementById("hr-faculty-table-body");
  if (!tableBody) return;

  try {
    const statusMap = await getHrEvaluationStatus();

    const pager = getHrFacultyPager();
    const pageItems = pager ? pager.paginate(facultyRosterCache) : facultyRosterCache;

    if (pageItems.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="3" class="py-6 text-center text-gray-400">
            No faculty found.
          </td>
        </tr>
      `;
    } else {
      tableBody.innerHTML = pageItems.map((faculty) => {
        const status = statusMap.get(String(faculty.id));
        const isEvaluated = Boolean(status?.completed);

        return `
        <tr class="border-b border-gray-200 last:border-0">
          <td class="py-3 pr-4">${faculty.name}</td>

          <td class="py-3 pr-4 ${
            isEvaluated
              ? "text-green-600"
              : "text-brand"
          } font-medium">
            ${isEvaluated ? "Evaluated" : "Not yet evaluated"}
          </td>

          <td class="py-3">
            <button
              type="button"
              class="start-peer-eval-btn btn-primary text-sm px-4 py-1.5"
              data-faculty-id="${faculty.id}"
              ${isEvaluated ? "disabled" : ""}
            >
              ${isEvaluated ? "Completed" : "Evaluate"}
            </button>
          </td>
        </tr>
      `;
      }).join("");
    }

    if (pager) {
      pager.render("hr-faculty-pagination", facultyRosterCache.length, renderHrFacultyTable);
    } else {
      const fallbackContainer = document.getElementById("hr-faculty-pagination");
      if (fallbackContainer) fallbackContainer.innerHTML = "";
    }

    document
      .querySelectorAll(".start-peer-eval-btn:not(:disabled)")
      .forEach((button) => {
        button.addEventListener("click", () => {
          startHrEvaluation(button.dataset.facultyId);
        });
      });

  } catch (error) {
    console.error("Failed to load HR evaluation status:", error);

    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="py-6 text-center text-red-500">
          Unable to load faculty evaluation status.
        </td>
      </tr>
    `;
  }
}

async function startHrEvaluation(facultyId) {
  currentFacultyBeingEvaluated =
    facultyRosterCache.find(
      (faculty) => String(faculty.id) === String(facultyId)
    );

  if (!currentFacultyBeingEvaluated) return;

  Object.keys(hrAnswers).forEach((key) => {
    delete hrAnswers[key];
  });

  // Fresh start: never carry the previous faculty's comment over.
  const freshTextarea = document.getElementById("hr-comments-textarea");
  if (freshTextarea) freshTextarea.value = "";

  await initHrDraftContext();

  if (draftOwner && Array.isArray(hrCriteria) && hrCriteria.length) {
    const draft = loadEvalDraft(
      "hr",
      currentFacultyBeingEvaluated.id,
      draftOwner
    );

    if (draft) {
      const validIds = new Set(
        hrCriteria.flatMap((part) =>
          (part.questions || []).map((q) => q.id)
        )
      );

      Object.assign(hrAnswers, pruneDraftAnswers(draft.answers, validIds));

      const textarea = document.getElementById("hr-comments-textarea");
      if (textarea && !textarea.value && draft.comment) {
        textarea.value = draft.comment;
      }
    }
  }

  document.getElementById("hr-faculty-name").textContent =
    currentFacultyBeingEvaluated.name;

  document
    .getElementById("hr-select-view")
    .classList.add("hidden");

  document
    .getElementById("hr-form-view")
    .classList.remove("hidden");

  renderHrCriteria();
}

function renderHrCriteria() {
  const container =
    document.getElementById("hr-criteria-container");

  if (!container) return;

  container.innerHTML = hrCriteria.map((part) => {
    const questions = [...(part.questions || [])].sort(
      (a, b) => {
        const aOrder = a.display_order ?? 0;
        const bOrder = b.display_order ?? 0;
        return aOrder - bOrder;
      }
    );

    const itemsHtml = questions.map((question, index) => {
      const optionsHtml = hrScale.scaleLabels
        .map((scalePoint) => {
          const value = scalePoint.value;

          const isChecked =
            String(hrAnswers[question.id]) === String(value)
              ? "checked"
              : "";

          return `
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="${question.id}"
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

      const isLast = index === questions.length - 1;

      return `
        <div
          class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 ${
            !isLast ? "border-b border-gray-200" : ""
          }"
        >
          <p class="text-sm text-gray-800 sm:pr-6">
            ${nlToBr(question.text)}
          </p>

          <div class="flex gap-4 flex-shrink-0">
            ${optionsHtml}
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="mb-6">
        <h3 class="font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-2">
          ${nlToBr(part.title)}
        </h3>

        ${itemsHtml}
      </div>
    `;
  }).join("");

  hrCriteria.forEach((part) => {
    (part.questions || []).forEach((question) => {
      document
        .querySelectorAll(`input[name="${question.id}"]`)
        .forEach((radio) => {
          radio.addEventListener("change", (event) => {
            hrAnswers[question.id] = event.target.value;
            persistHrDraft();
          });
        });
    });
  });
}

function handleHrSubmit() {
  const allQuestions = hrCriteria.flatMap(
    (part) => part.questions || []
  );

  const answeredCount = allQuestions.filter(
    (question) =>
      hrAnswers[question.id] !== undefined
  ).length;

  if (answeredCount < allQuestions.length) {
    alert("Please answer all items before submitting.");
    return;
  }

  if (!getHrComment().trim()) {
    alert("Please write a comment before submitting. A comment is required.");

    const textarea = document.getElementById("hr-comments-textarea");
    if (textarea) textarea.focus();

    return;
  }

  showReviewModal({
    title: "Review HR Evaluation",
    subtitle: currentFacultyBeingEvaluated
      ? currentFacultyBeingEvaluated.name
      : "",
    summaryHtml: buildReviewSummaryHtml({
      parts: hrCriteria,
      answers: hrAnswers,
      scaleLabels: hrScale ? hrScale.scaleLabels : [],
      equivalents: hrScale ? hrScale.equivalents : [],
      comment: getHrComment(),
      includeComment: true
    }),
    confirmLabel: "Submit Evaluation",
    onConfirm: finalizeHrEvaluation
  });
}

async function finalizeHrEvaluation() {
  const responses = hrCriteria
    .flatMap((part) => part.questions || [])
    .map((question) => ({
      question_id: question.id,
      rating: Number(hrAnswers[question.id])
    }));

  try {
    await apiPost("/evaluations", {
      evaluation_type: "hrEvaluation",
      faculty_id: currentFacultyBeingEvaluated.id,
      responses,
      comments: getHrComment()
    });

    logActivity(
      `Completed HR evaluation for ${currentFacultyBeingEvaluated.name}`
    );

    document
      .getElementById("hr-form-view")
      .classList.add("hidden");

    document
      .getElementById("hr-select-view")
      .classList.remove("hidden");

    if (currentFacultyBeingEvaluated) {
      clearEvalDraft("hr", currentFacultyBeingEvaluated.id);
    }

    await renderHrFacultyTable();
    await renderHrDraftResumeBanner();

  } catch (error) {
    console.error("Failed to submit HR evaluation:", error);

    alert(
      error?.data?.error ||
      error?.message ||
      "Unable to submit HR evaluation."
    );
  }
}

async function checkUrlForDirectEvaluation() {
  const params = new URLSearchParams(
    window.location.search
  );

  const facultyId = params.get("facultyId");

  if (facultyId) {
    startHrEvaluation(facultyId);
  }
}

document.addEventListener("click", (event) => {
  if (event.target.id === "hr-back-to-select-btn") {
    document
      .getElementById("hr-form-view")
      .classList.add("hidden");

    document
      .getElementById("hr-select-view")
      .classList.remove("hidden");
  }
});

// --- Draft resume banner (save progress & continue later) ---
async function renderHrDraftResumeBanner() {
  const banner = document.getElementById("draft-resume-banner");
  if (!banner) return;

  banner.classList.add("hidden");
  banner.innerHTML = "";

  await initHrDraftContext();
  if (!draftOwner) return;

  let statusMap = new Map();
  try {
    statusMap = await getHrEvaluationStatus();
  } catch (error) {
    console.error("Failed to load HR evaluation status for drafts:", error);
  }

  const entries = listEvalDrafts("hr", draftOwner)
    .map((draft) => {
      const faculty = facultyRosterCache.find(
        (entry) => String(entry.id) === String(draft.subjectId)
      );
      if (!faculty) return null;

      const status = statusMap.get(String(draft.subjectId));
      if (status && status.completed) {
        clearEvalDraft("hr", draft.subjectId);
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
      <p class="text-sm font-semibold text-blue-800 mb-1">Unfinished evaluation${entries.length === 1 ? "" : "s"}</p>
      <p class="text-xs text-blue-800 mb-3">Your progress was auto-saved. Continue where you left off, or discard it.</p>
      <div class="space-y-2">
        ${entries
          .map(
            ({ draft, faculty }) => `
          <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between bg-white border border-blue-200 rounded-lg px-3 py-2">
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
      startHrEvaluation(btn.dataset.facultyId);
    });
  });

  banner.querySelectorAll(".discard-draft-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      clearEvalDraft("hr", btn.dataset.facultyId);
      await renderHrDraftResumeBanner();
    });
  });
}

async function initializeHrEvaluationPage() {
  try {
    await loadHrEvaluationData();
    await renderHrFacultyTable();
    await renderHrDraftResumeBanner();
    await checkUrlForDirectEvaluation();
  } catch (error) {
    console.error(
      "Failed to initialize HR evaluation:",
      error
    );

    const tableBody =
      document.getElementById("hr-faculty-table-body");

    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="3" class="py-6 text-center text-red-500">
            Unable to load HR evaluation data.
          </td>
        </tr>
      `;
    }
  }
}

mountPageContent();

document
  .getElementById("hr-submit-btn")
  .addEventListener("click", handleHrSubmit);

document
  .getElementById("hr-comments-textarea")
  .addEventListener("input", persistHrDraft);

initializeHrEvaluationPage();