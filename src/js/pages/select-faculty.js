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
    subjectNames: faculty.subjects.map((s) => s.name).join(", "),
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
// RENDER FACULTY TABLE
// ============================================

async function renderFacultyTable() {
  const tableBody =
    document.getElementById("faculty-table-body");

  if (!tableBody) return;

  const facultyList = getStudentFacultyList();
  const periodStatus = checkEvaluationPeriodStatus();

  const evaluationStatuses = await Promise.all(
    facultyList.map((item) =>
      getEvaluationStatus(item.facultyId)
    )
  );

  tableBody.innerHTML = facultyList
    .map((item, index) => {
      const evalData = evaluationStatuses[index];

      const isEvaluated =
        evalData.status === "evaluated";

      const statusLabel = isEvaluated
        ? "Evaluated"
        : "Not yet evaluated";

      const statusClass = isEvaluated
        ? "text-green-600 font-medium"
        : "text-brand font-medium";

      let actionButtonHtml;

      if (isEvaluated) {
        actionButtonHtml = `
          <button
            data-index="${index}"
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
            data-index="${index}"
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

  document.querySelectorAll(".evaluate-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = btn.dataset.index;
      const selected = facultyList[index];

      sessionStorage.removeItem("evaluationAnswers");
      sessionStorage.removeItem("draftComment");

      sessionStorage.setItem(
        "evaluatingFaculty",
        JSON.stringify(selected)
      );

      window.location.href = "rate-faculty.html";
    });
  });

  document
    .querySelectorAll(".view-results-btn")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        const index = btn.dataset.index;
        const selected = facultyList[index];

        // Always retrieve the result from the backend
        // for the currently authenticated student.
        const evalData = await getEvaluationStatus(
          selected.facultyId
        );

        if (evalData.status !== "evaluated") {
          return;
        }

        showResultsModal(selected, evalData);
      });
    });
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

  attachResultsModalListeners();
}

initializeSelectFacultyPage();

initializeSelectFacultyPage();