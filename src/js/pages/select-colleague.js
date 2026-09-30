// ============================================
// FACULTY: SELECT COLLEAGUE PAGE
// ============================================

async function getColleagueEvaluationStatus(facultyId) {
  try {
    const summary = await apiGet(`/evaluations/${facultyId}`);

    return {
      status: summary.peer_evaluation_completed
        ? "evaluated"
        : "not-evaluated",
      rating: summary.overall_average || 0,
      average: summary.overall_average || 0
    };
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

var colleagueTablePager = null;
function getColleagueTablePager() {
  if (!colleagueTablePager) {
    if (typeof TablePagination !== "undefined" && TablePagination.create) {
      colleagueTablePager = TablePagination.create({ defaultPerPage: 10 });
    } else {
      colleagueTablePager = null;
    }
  }
  return colleagueTablePager;
}

let colleagueListCache = [];
let colleagueStatusCache = [];

async function renderColleagueTable() {
  const tableBody = document.getElementById("colleague-table-body");
  if (!tableBody) return;

  try {
    const currentUser = await apiGet("/auth/me");
    const roster = await apiGet("/faculty");
    const peerStatuses = await apiGet("/evaluations/peer-status");

    const currentFacultyId = currentUser.linked_faculty_id;
    console.log("Current user:", currentUser);
    console.log("Current faculty ID:", currentFacultyId);
    const colleagues = roster.filter(
      (faculty) =>
        faculty.status === "Active" &&
        Number(faculty.id) !== Number(currentFacultyId)
    );

    colleagueListCache = colleagues;
    colleagueStatusCache = peerStatuses;
    const pager = getColleagueTablePager();
    if (pager) pager.reset();
    renderColleagueTablePage();
  } catch (error) {
    console.error("Failed to load colleague list:", error);

    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="py-4 text-center text-red-600">
          Unable to load faculty members.
        </td>
      </tr>
    `;
    const fallbackContainer = document.getElementById("colleague-table-pagination");
    if (fallbackContainer) fallbackContainer.innerHTML = "";
  }
}

function renderColleagueTablePage() {
  const tableBody = document.getElementById("colleague-table-body");
  if (!tableBody) return;

  const pager = getColleagueTablePager();
  const pageItems = pager ? pager.paginate(colleagueListCache) : colleagueListCache;
  const peerStatuses = colleagueStatusCache;

  if (pageItems.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="py-4 text-center text-gray-400">
          No colleagues found.
        </td>
      </tr>
    `;
  } else {
    tableBody.innerHTML = pageItems.map((faculty) => {
    const evalData =
      peerStatuses.find(
        (item) => Number(item.faculty_id) === Number(faculty.id)
      ) || {
        status: "not-evaluated",
        rating: 0
      };      
    const isEvaluated = evalData.status === "evaluated";

      const statusLabel = isEvaluated
        ? "Evaluated"
        : "Not yet evaluated";

      const statusClass = isEvaluated
        ? "text-green-600 font-medium"
        : "text-brand font-medium";

      const actionButtonHtml = isEvaluated
        ? `<button data-faculty-id="${faculty.id}" class="view-results-btn btn-secondary text-sm px-4 py-1.5">View Results</button>`
        : `<button data-faculty-id="${faculty.id}" class="evaluate-btn btn-primary text-sm px-4 py-1.5">Evaluate</button>`;

      return `
        <tr class="border-b border-gray-200 last:border-0">
          <td class="py-3 pr-4">${faculty.name}</td>
          <td class="py-3 pr-4 ${statusClass}">${statusLabel}</td>
          <td class="py-3">${actionButtonHtml}</td>
        </tr>
      `;
    }).join("");

    document.querySelectorAll(".evaluate-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const faculty = colleagueListCache.find(
          (f) => String(f.id) === btn.dataset.facultyId
        );
        if (!faculty) return;

        sessionStorage.removeItem("peerEvaluationAnswers");
        sessionStorage.removeItem("peerDraftComment");
        sessionStorage.setItem(
          "evaluatingColleague",
          JSON.stringify(faculty)
        );

        window.location.href = "rate-colleague.html";
      });
    });

    document.querySelectorAll(".view-results-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const faculty = colleagueListCache.find(
          (f) => String(f.id) === btn.dataset.facultyId
        );
        if (!faculty) return;

        showResultsModal(faculty);
      });
    });
  }

  if (pager) {
    pager.render("colleague-table-pagination", colleagueListCache.length, renderColleagueTablePage);
  } else {
    const fallbackContainer = document.getElementById("colleague-table-pagination");
    if (fallbackContainer) fallbackContainer.innerHTML = "";
  }
}


async function showResultsModal(faculty) {
  try {
    const evalData = await apiGet(
      `/evaluations/peer-status/${faculty.id}`
    );

    const modalBody =
      document.getElementById("results-modal-body");

    const categoryRowsHtml =
      (evalData.categoryScores || []).map((cat) => `
        <div class="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
          <span class="text-gray-700">${cat.title}</span>
          <span class="font-medium text-gray-800">
            ${cat.average.toFixed(2)}
          </span>
        </div>
      `).join("");

    const averageDisplay =
      typeof evalData.overall_average === "number"
        ? evalData.overall_average.toFixed(2)
        : "N/A";

    modalBody.innerHTML = `
      <h3 class="font-semibold text-gray-800 mb-1">
        ${faculty.name}
      </h3>

      <p class="text-xs text-gray-400 mb-4">
        Submitted: ${evalData.submitted_at || "--"}
      </p>

      ${categoryRowsHtml}

      <div class="flex items-center justify-between pt-3 mt-2 border-t border-gray-300">
        <span class="font-semibold text-gray-800">
          Overall Average
        </span>
        <span class="font-bold text-brand">
          ${averageDisplay}
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

  } catch (error) {
    console.error(
      "Failed to load peer evaluation result:",
      error
    );

    alert(
      error?.message ||
      "Unable to load the peer evaluation results."
    );
  }
}

function attachResultsModalListeners() {
  const modal = document.getElementById("results-modal");
  const backdrop = document.getElementById("results-modal-backdrop");
  const closeBtn = document.getElementById("close-results-modal-btn");

  function closeModal() { modal.classList.add("hidden"); }
  backdrop.addEventListener("click", closeModal);
  closeBtn.addEventListener("click", closeModal);
}

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

(async () => {
  await loadSystemSettings();
  await loadAnnouncement();
  document.getElementById("academic-year-display").textContent = getAcademicYearDisplay();
  renderAnnouncementBanner();
})();
renderColleagueTable().then(() => renderPeerDraftResumeBanner());
attachResultsModalListeners();

async function renderPeerDraftResumeBanner() {
  const banner = document.getElementById("draft-resume-banner");
  if (!banner) return;

  banner.classList.add("hidden");
  banner.innerHTML = "";

  const owner = await getDraftOwner();
  if (!owner) return;

  const statuses = Array.isArray(colleagueStatusCache) ? colleagueStatusCache : [];

  const entries = listEvalDrafts("peer", owner)
    .map((draft) => {
      const colleague = colleagueListCache.find(
        (entry) => String(entry.id) === String(draft.subjectId)
      );
      if (!colleague) return null;

      const status = statuses.find(
        (item) => String(item.faculty_id) === String(draft.subjectId)
      );
      if (status && status.status === "evaluated") {
        clearEvalDraft("peer", draft.subjectId);
        return null;
      }

      return { draft, colleague };
    })
    .filter(Boolean);

  if (!entries.length) return;

  const escapeName = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  banner.innerHTML = `
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <p class="text-sm font-semibold text-blue-800 mb-1">Unfinished evaluation${entries.length === 1 ? "" : "s"}</p>
      <p class="text-xs text-blue-800 mb-3">Your progress was auto-saved. Continue where you left off, or discard it.</p>
      <div class="space-y-2">
        ${entries
          .map(
            ({ draft, colleague }) => `
          <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between bg-white border border-blue-200 rounded-lg px-3 py-2">
            <span class="text-sm text-gray-700">
              <span class="font-medium">${escapeName(colleague.name)}</span>
              <span class="text-gray-400">· ${draft.answeredCount} answer${draft.answeredCount === 1 ? "" : "s"} saved</span>
            </span>
            <span class="flex gap-2">
              <button type="button" class="resume-draft-btn btn-primary text-sm px-4 py-1.5" data-faculty-id="${colleague.id}">Continue</button>
              <button type="button" class="discard-draft-btn btn-secondary text-sm px-4 py-1.5" data-faculty-id="${colleague.id}">Discard</button>
            </span>
          </div>`
          )
          .join("")}
      </div>
    </div>`;

  banner.classList.remove("hidden");

  banner.querySelectorAll(".resume-draft-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const selected = colleagueListCache.find(
        (entry) => String(entry.id) === String(btn.dataset.facultyId)
      );
      if (!selected) return;

      sessionStorage.removeItem("peerEvaluationAnswers");
      sessionStorage.removeItem("peerDraftComment");
      sessionStorage.setItem("evaluatingColleague", JSON.stringify(selected));

      window.location.href = "rate-colleague.html";
    });
  });

  banner.querySelectorAll(".discard-draft-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      clearEvalDraft("peer", btn.dataset.facultyId);
      await renderPeerDraftResumeBanner();
    });
  });
}