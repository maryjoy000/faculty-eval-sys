// ============================================
// SELECT FACULTY PAGE
// ============================================

async function loadFacultyRoster() {
  facultyRosterCache = await apiGet("/evaluations/student/evaluators");
}

function getStudentFacultyList() {
  const roster = facultyRosterCache;

  return roster.map((faculty) => ({
    facultyId: faculty.id,
    faculty: faculty.name,
    sections: faculty.sections || []
  }));
}

// ============================================
// LOAD THIS STUDENT'S OWN EVALUATION
// ============================================

async function getEvaluationStatus(facultyId) {
  try {
    return await apiGet(
      `/evaluations/student/status/${facultyId}`
    );
  } catch (error) {
    console.error(
      `Failed to load evaluation status for faculty ${facultyId}:`,
      error
    );

    return {
      status: "not-evaluated",
      rating: 0
    };
  }
}

// ============================================
// RENDER FACULTY TABLE (paginated: 10 / 25 / 50 per page)
// ============================================

var studentFacultyPager = null;
function getStudentFacultyPager() {
  if (!studentFacultyPager) {
    if (typeof TablePagination !== "undefined" && TablePagination.create) {
      studentFacultyPager = TablePagination.create({ defaultPerPage: 10 });
    } else {
      studentFacultyPager = null;
    }
  }
  return studentFacultyPager;
}

// Cached full lists so page navigation does not refetch statuses.
let studentFacultyListCache = [];
let studentEvalStatusCache = [];
let studentPeriodStatusCache = { isOpen: true };

function renderStudentFacultyPage() {
  const tableBody = document.getElementById("faculty-table-body");
  if (!tableBody) return;

  const pager = getStudentFacultyPager();
  const combined = studentFacultyListCache.map((item, index) => ({
    item,
    evalData: studentEvalStatusCache[index] || { status: "not-evaluated" },
  }));
  const pageRows = pager ? pager.paginate(combined) : combined;
  const periodStatus = studentPeriodStatusCache;

  if (pageRows.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="py-6 text-center text-gray-400">
          No faculty found.
        </td>
      </tr>
    `;
  } else {
    tableBody.innerHTML = pageRows
      .map(({ item, evalData }) => {
        const isEvaluated = evalData.status === "evaluated";

        const statusLabel = isEvaluated ? "Evaluated" : "Not yet evaluated";

        const statusClass = isEvaluated ? "text-green-600 font-medium" : "text-brand font-medium";

        let actionButtonHtml;

        if (isEvaluated) {
          actionButtonHtml = `
          <button
            data-faculty-id="${item.facultyId}"
            class="view-results-btn btn-secondary text-sm px-4 py-1.5"
          >
            View Results
          </button>
        `;
        } else if (!periodStatus.isOpen) {
          actionButtonHtml = `
          <button
            disabled
            class="btn-primary text-sm px-4 py-1.5 opacity-40 cursor-not-allowed"
          >
            Evaluate
          </button>
        `;
        } else {
          actionButtonHtml = `
          <button
            data-faculty-id="${item.facultyId}"
            class="evaluate-btn btn-primary text-sm px-4 py-1.5"
          >
            Evaluate
          </button>
        `;
        }

        return `
        <tr class="border-b border-gray-200 last:border-0">
          <td class="py-3 pr-4">${item.faculty}</td>

          <td class="py-3 pr-4">
            ${item.subjectNames}
          </td>

          <td class="py-3 pr-4 ${statusClass}">
            ${statusLabel}
          </td>

          <td class="py-3">
            ${actionButtonHtml}
          </td>
        </tr>
      `;
      })
      .join("");
  }

  document.querySelectorAll(".evaluate-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const selected = studentFacultyListCache.find(
        (entry) => String(entry.facultyId) === String(btn.dataset.facultyId)
      );
      if (!selected) return;

      sessionStorage.removeItem("evaluationAnswers");
      sessionStorage.removeItem("draftComment");

      sessionStorage.setItem("evaluatingFaculty", JSON.stringify(selected));

      window.location.href = "rate-faculty.html";
    });
  });

  document.querySelectorAll(".view-results-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const selected = studentFacultyListCache.find(
        (entry) => String(entry.facultyId) === String(btn.dataset.facultyId)
      );
      if (!selected) return;

      // Always retrieve the result from the backend
      // for the currently authenticated student.
      const evalData = await getEvaluationStatus(selected.facultyId);

      if (evalData.status !== "evaluated") {
        return;
      }

      showResultsModal(selected, evalData);
    });
  });

  if (pager) {
    pager.render("faculty-table-pagination", combined.length, renderStudentFacultyPage);
  } else {
    const fallbackContainer = document.getElementById("faculty-table-pagination");
    if (fallbackContainer) fallbackContainer.innerHTML = "";
  }
}

async function renderFacultyTable() {
  const tableBody = document.getElementById("faculty-table-body");

  if (!tableBody) return;

  const facultyList = getStudentFacultyList();
  const periodStatus = checkEvaluationPeriodStatus();

  const evaluationStatuses = await Promise.all(
    facultyList.map((item) => getEvaluationStatus(item.facultyId))
  );

  studentFacultyListCache = facultyList;
  studentEvalStatusCache = evaluationStatuses;
  studentPeriodStatusCache = periodStatus;

  const pager = getStudentFacultyPager();
  if (pager) pager.reset();
  renderStudentFacultyPage();
}

// ============================================
// EVALUATION PERIOD BANNER
// ============================================

function renderEvaluationPeriodBanner() {
  const banner = document.getElementById(
    "evaluation-closed-banner"
  );

  if (!banner) return;

  const periodStatus =
    checkEvaluationPeriodStatus();

  if (!periodStatus.isOpen) {
    banner.textContent = periodStatus.reason;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

// ============================================
// RESULTS MODAL
// ============================================

function showResultsModal(facultyItem, evalData) {
  const modalBody =
    document.getElementById("results-modal-body");

  if (!modalBody) return;

  const categoryRowsHtml =
    (evalData.categoryScores || [])
      .map(
        (cat) => `
          <div class="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
            <span class="text-gray-700">
              ${cat.title}
            </span>

            <span class="font-medium text-gray-800">
              ${Number(cat.average).toFixed(2)}
            </span>
          </div>
        `
      )
      .join("");

  modalBody.innerHTML = `
    <h3 class="font-semibold text-gray-800 mb-1">
      ${facultyItem.faculty}
    </h3>

    <p class="text-xs text-gray-400 mb-4">
      Submitted:
      ${
        evalData.submittedAt
          ? new Date(evalData.submittedAt).toLocaleString()
          : "--"
      }
    </p>

    ${categoryRowsHtml}

    <div class="flex items-center justify-between pt-3 mt-2 border-t border-gray-300">
      <span class="font-semibold text-gray-800">
        Overall Average
      </span>

      <span class="font-bold text-brand">
        ${
          Number(
            evalData.average ??
            evalData.rating ??
            0
          ).toFixed(2)
        }
        — ${evalData.equivalent || "--"}
      </span>
    </div>

    <div class="mt-4">
      <p class="text-sm font-medium text-gray-700 mb-1">
        Your Comments:
      </p>

      <p class="text-sm text-gray-600 italic">
        ${evalData.comments || "No comments provided."}
      </p>
    </div>
  `;

  document
    .getElementById("results-modal")
    .classList.remove("hidden");
}

// ============================================
// MODAL LISTENERS
// ============================================

function attachResultsModalListeners() {
  const modal =
    document.getElementById("results-modal");

  const backdrop =
    document.getElementById(
      "results-modal-backdrop"
    );

  const closeBtn =
    document.getElementById(
      "close-results-modal-btn"
    );

  if (!modal || !backdrop || !closeBtn) return;

  function closeModal() {
    modal.classList.add("hidden");
  }

  backdrop.addEventListener(
    "click",
    closeModal
  );

  closeBtn.addEventListener(
    "click",
    closeModal
  );
}

// ============================================
// ANNOUNCEMENT
// ============================================

function renderAnnouncementBanner() {
  const banner =
    document.getElementById(
      "announcement-banner"
    );

  if (!banner) return;

  const announcement =
    getAnnouncement();

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

// ============================================
// STUDENT INFO
// ============================================

async function loadStudentInfo() {
  const profile =
    await apiGet("/profile");

  document.getElementById(
    "student-lrn"
  ).textContent =
    profile.lrn || "--";

  document.getElementById(
    "student-grade"
  ).textContent =
    profile.grade || "--";

  document.getElementById(
    "student-section"
  ).textContent =
    profile.section || "--";
}

// ============================================
// INIT
// ============================================

async function initializeSelectFacultyPage() {

  await loadSystemSettings();
  await loadAnnouncement();

  document.getElementById(
    "academic-year-display"
  ).textContent =
    getAcademicYearDisplay();

  await loadEvaluationPeriod();

  renderEvaluationPeriodBanner();

  renderAnnouncementBanner();

  await loadStudentInfo();

  await loadFacultyRoster();

  await renderFacultyTable();

  await renderDraftResumeBanner();

  attachResultsModalListeners();
}

// ============================================
// DRAFT RESUME BANNER (save progress & continue later)
// ============================================

async function renderDraftResumeBanner() {
  const banner = document.getElementById("draft-resume-banner");
  if (!banner) return;

  banner.classList.add("hidden");
  banner.innerHTML = "";

  // Drafts can't be continued while the period is closed.
  if (!checkEvaluationPeriodStatus().isOpen) return;

  const owner = await getDraftOwner();
  if (!owner) return;

  const entries = listEvalDrafts("student", owner)
    .map((draft) => {
      const index = studentFacultyListCache.findIndex(
        (item) => String(item.facultyId) === String(draft.subjectId)
      );
      if (index === -1) return null;

      const status = (studentEvalStatusCache[index] || {}).status;
      if (status === "evaluated") {
        clearEvalDraft("student", draft.subjectId);
        return null;
      }

      return { draft, item: studentFacultyListCache[index] };
    })
    .filter(Boolean);

  if (!entries.length) return;

  banner.innerHTML = `
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <p class="text-sm font-semibold text-blue-800 mb-1">Unfinished evaluation${entries.length === 1 ? "" : "s"}</p>
      <p class="text-xs text-blue-800 mb-3">Your progress was auto-saved. Continue where you left off, or discard it.</p>
      <div class="space-y-2">
        ${entries
          .map(({ draft, item }) => {
            const safeName = String(item.faculty || "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");

            return `
          <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between bg-white border border-blue-200 rounded-lg px-3 py-2">
            <span class="text-sm text-gray-700">
              <span class="font-medium">${safeName}</span>
              <span class="text-gray-400">· ${draft.answeredCount} answer${draft.answeredCount === 1 ? "" : "s"} saved</span>
            </span>
            <span class="flex gap-2">
              <button type="button" class="resume-draft-btn btn-primary text-sm px-4 py-1.5" data-faculty-id="${item.facultyId}">Continue</button>
              <button type="button" class="discard-draft-btn btn-secondary text-sm px-4 py-1.5" data-faculty-id="${item.facultyId}">Discard</button>
            </span>
          </div>`;
          })
          .join("")}
      </div>
    </div>`;

  banner.classList.remove("hidden");

  banner.querySelectorAll(".resume-draft-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const selected = studentFacultyListCache.find(
        (entry) => String(entry.facultyId) === String(btn.dataset.facultyId)
      );
      if (!selected) return;

      sessionStorage.removeItem("evaluationAnswers");
      sessionStorage.removeItem("draftComment");
      sessionStorage.setItem("evaluatingFaculty", JSON.stringify(selected));

      window.location.href = "rate-faculty.html";
    });
  });

  banner.querySelectorAll(".discard-draft-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      clearEvalDraft("student", btn.dataset.facultyId);
      await renderDraftResumeBanner();
    });
  });
}

initializeSelectFacultyPage();