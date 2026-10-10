// ============================================
// HR REPORTS PAGE
// ============================================

function mountPageContent() {
  const template = document.getElementById("page-content-template");
  const slot = document.getElementById("hr-page-content");
  if (template && slot) {
    slot.appendChild(template.content.cloneNode(true));
  }
}

let hrFacultyRoster = [];
let hrReportDataCache = {};
let hrReportRowsCache = [];

// ============================================
// HR REPORT FILTERS
// ============================================

function hrReportHasResults(report) {
  if (!report || !report.per_type) return false;

  return [
    report.per_type.classroomObservation,
    report.per_type.student,
    report.per_type.peerToPeer,
    report.per_type.hrEvaluation,
  ].some(
    (data) =>
      data &&
      typeof data.average_rating === "number"
  );
}

function getFilteredHrReportRows() {
  const searchTerm = (
    document.getElementById("hr-reports-search-input")?.value || ""
  )
    .trim()
    .toLowerCase();

  const statusFilter =
    document.getElementById("hr-reports-status-filter")?.value || "all";

  return hrReportRowsCache.filter(({ faculty, report }) => {
    // Search by faculty name
    if (
      searchTerm &&
      !String(faculty.name || "").toLowerCase().includes(searchTerm)
    ) {
      return false;
    }

    // Filter by evaluation results
    if (statusFilter === "all") return true;

    const hasResults = hrReportHasResults(report);

    return statusFilter === "with-results"
      ? hasResults
      : !hasResults;
  });
}

function attachHrReportsFilterListeners() {
  const searchInput = document.getElementById("hr-reports-search-input");
  const statusFilter = document.getElementById("hr-reports-status-filter");

  searchInput?.addEventListener("input", () => {
    const pager = getHrReportsPager();
    if (pager) pager.reset();

    renderHrReportsPage();
  });

  statusFilter?.addEventListener("change", () => {
    const pager = getHrReportsPager();
    if (pager) pager.reset();

    renderHrReportsPage();
  });
}

var hrReportsPager = null;
function getHrReportsPager() {
  if (!hrReportsPager) {
    if (typeof TablePagination !== "undefined" && TablePagination.create) {
      hrReportsPager = TablePagination.create({ defaultPerPage: 10 });
    } else {
      hrReportsPager = null;
    }
  }
  return hrReportsPager;
}

function renderHrReportsPage() {
  const tableBody = document.getElementById("hr-reports-table-body");
  if (!tableBody) return;

  const pager = getHrReportsPager();
  const filteredRows = getFilteredHrReportRows();
  const pageRows = pager
    ? pager.paginate(filteredRows)
    : filteredRows;

  if (pageRows.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="py-6 text-center text-gray-400">
          No reports found.
        </td>
      </tr>
    `;
  } else {
    tableBody.innerHTML = pageRows
      .map(({ faculty, report }) => {
        const classroomData =
          report?.per_type?.classroomObservation;

        const studentData =
          report?.per_type?.student;

        const peerData =
          report?.per_type?.peerToPeer;

        const hrData =
          report?.per_type?.hrEvaluation;

        const cell = (data) =>
          data && typeof data.average_rating === "number"
            ? `<span class="text-green-600 font-medium">${data.average_rating.toFixed(2)}</span>`
            : `<span class="text-gray-400">—</span>`;

        const sentiment = report?.dominant_sentiment || null;
        const sentimentClass =
          sentiment === "Positive"
            ? "text-green-600"
            : sentiment === "Negative"
              ? "text-red-600"
              : sentiment === "Neutral"
                ? "text-amber-600"
                : "text-gray-400";

        return `
          <tr class="border-b border-gray-200 last:border-0">
            <td class="py-3 pr-4">${faculty.name}</td>
            <td class="py-3 pr-4">${cell(classroomData)}</td>
            <td class="py-3 pr-4">${cell(studentData)}</td>
            <td class="py-3 pr-4">${cell(peerData)}</td>
            <td class="py-3 pr-4">${cell(hrData)}</td>
            <td class="py-3 pr-4">
              <span class="${sentimentClass} font-medium text-sm">${sentiment || "—"}</span>
            </td>
            <td class="py-3">
              <button
                type="button"
                class="view-report-btn text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                data-faculty-id="${faculty.id}"
              >
                View Report
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  document.querySelectorAll(".view-report-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const faculty = hrFacultyRoster.find(
        (f) => String(f.id) === btn.dataset.facultyId
      );

      if (faculty) {
        showReportDetail(faculty);
      }
    });
  });

  if (pager) {
    pager.render(
      "hr-reports-pagination",
      filteredRows.length,
      renderHrReportsPage
    );
  } else {
    const fallbackContainer =
      document.getElementById("hr-reports-pagination");

    if (fallbackContainer) {
      fallbackContainer.innerHTML = "";
    }
  }
}

// ============================================
// LOAD HR REPORT LIST
// ============================================

async function renderReportsTable() {
  const tableBody = document.getElementById("hr-reports-table-body");
  if (!tableBody) return;

  try {
    hrFacultyRoster = await apiGet("/faculty");
  } catch (err) {
    console.error("Failed to load faculty roster:", err);

    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="py-6 text-center text-red-500">
          Failed to load faculty.
        </td>
      </tr>
    `;

    return;
  }

  const reportResults = await Promise.all(
    hrFacultyRoster.map(async (faculty) => {
      try {
        return await apiGet(
          withTerm(`/evaluations/${faculty.id}`)
        );
      } catch (error) {
        console.error(
          `Failed to load report for faculty ${faculty.id}:`,
          error
        );

        return null;
      }
    })
  );

  hrReportRowsCache = hrFacultyRoster.map((faculty, index) => ({
    faculty,
    report: reportResults[index],
  }));

  const pager = getHrReportsPager();
  if (pager) pager.reset();

  renderHrReportsPage();
} 

let currentReportFaculty = null;
let currentReportTab = "combined";

// The student and peer endpoints paginate their comment list (default 10,
// max 50 per page). Reports must show and print EVERY comment, so walk all pages.
const HR_COMMENT_PAGE_SIZE = 50;
const HR_MAX_COMMENT_PAGES = 200;

async function fetchBreakdownWithAllComments(endpoint) {
  const urlFor = (page) => {
    const base = withTerm(endpoint);
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}comment_page=${page}&comment_per_page=${HR_COMMENT_PAGE_SIZE}`;
  };

  // A 404 here means "not completed yet" and is handled by the caller.
  const first = await apiGet(urlFor(1));
  if (!first) return null;

  const all = [...(first.comments || [])];
  const pagination = first.comments_pagination || {};
  const totalPages =
    Number(pagination.total_pages ?? pagination.pages ?? pagination.totalPages) || null;

  let page = 1;
  let lastBatch = first.comments || [];

  while (page < HR_MAX_COMMENT_PAGES) {
    const done = totalPages
      ? page >= totalPages
      : lastBatch.length < HR_COMMENT_PAGE_SIZE;
    if (done) break;

    page += 1;

    let batch = [];
    try {
      const next = await apiGet(urlFor(page));
      batch = (next && next.comments) || [];
    } catch (error) {
      console.warn(`Could not load comment page ${page}:`, error);
      break;
    }

    if (!batch.length) break;

    // Guard: if the server ignored the page number, stop instead of looping.
    if (JSON.stringify(batch[0]) === JSON.stringify(lastBatch[0])) break;

    all.push(...batch);
    lastBatch = batch;
  }

  first.comments = all;
  return first;
}

async function loadFacultyReportData(facultyId) {
  const report = {
    classroom: null,
    student: null,
    peer: null,
    hr: null
  };

  const requests = [
    ["classroom", () => apiGet(withTerm(`/evaluations/${facultyId}/classroom-breakdown`))],
    ["student", () => fetchBreakdownWithAllComments(`/evaluations/${facultyId}/student-breakdown`)],
    ["peer", () => fetchBreakdownWithAllComments(`/evaluations/${facultyId}/peer-breakdown`)],
    ["hr", () => apiGet(withTerm(`/evaluations/${facultyId}/hr-breakdown`))]
  ];

  await Promise.all(
    requests.map(async ([type, load]) => {
      try {
        report[type] = await load();
      } catch (error) {
        // 404 simply means that evaluation type has not been completed.
        report[type] = null;
      }
    })
  );

  hrReportDataCache[facultyId] = report;
  return report;
}

async function showReportDetail(faculty) {
  currentReportFaculty = faculty;
  currentReportTab = "combined";

  document.getElementById("report-faculty-name").textContent = faculty.name;
  document.getElementById("reports-list-view").classList.add("hidden");
  document.getElementById("reports-detail-view").classList.remove("hidden");

  attachReportTabListeners();

  await refreshLiveCriteriaInstruments();
  await loadFacultyReportData(faculty.id);

  renderReportTabContent();
}

function updateReleaseStatusDisplay(faculty) {
  const statusEl = document.getElementById("report-release-status");
  const releasedReports = getReleasedReports();
  const release = releasedReports[faculty.id];

  statusEl.textContent = release ? `Sent: ${release.releasedAt}` : "Not yet sent to faculty";
  statusEl.className = release ? "text-xs text-green-600" : "text-xs text-gray-400";
}

function attachReportTabListeners() {
  const tabButtons = document.querySelectorAll(".report-tab-btn");

  function activateTab(tab) {
    currentReportTab = tab;
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === tab;
      btn.classList.toggle("bg-brand", isActive);
      btn.classList.toggle("text-white", isActive);
      btn.classList.toggle("bg-gray-100", !isActive);
      btn.classList.toggle("text-gray-600", !isActive);
    });
    renderReportTabContent();
  }

  tabButtons.forEach((btn) => {
    // Avoid stacking duplicate listeners on repeated "View Report" clicks
    const clone = btn.cloneNode(true);
    btn.replaceWith(clone);
  });

  document.querySelectorAll(".report-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });

  activateTab("combined");
}

function renderReportTabContent() {
  document.getElementById("report-tab-content").innerHTML =
    buildReportTabHtml(currentReportTab, currentReportFaculty);
}

function attachDetailViewListeners() {
  document.getElementById("back-to-reports-btn").addEventListener("click", () => {
    document.getElementById("reports-detail-view").classList.add("hidden");
    document.getElementById("reports-list-view").classList.remove("hidden");
  });

  document.getElementById("print-report-btn").addEventListener("click", () => {
    window.print();
  });

  document.getElementById("send-report-btn").addEventListener("click", () => {
    showConfirmModal({
      title: "Send Report to Faculty?",
      message: `${currentReportFaculty.name} will be able to view their combined evaluation report in their Faculty portal.`,
      confirmLabel: "Send Report",
      isDestructive: false,
      onConfirm: async () => {
        try {
          await apiPost(`/reports/${currentReportFaculty.id}/release`, {});

          updateReleaseStatusDisplay(currentReportFaculty);

          alert(
            `The evaluation report for ${currentReportFaculty.name} has been released.`
          );

        } catch (error) {
          console.error("Failed to release report:", error);

          alert(
            error.message ||
            "Failed to release the report. Please try again."
          );
        }
      }
    });
  });
}

// ============================================
// PRINT: un-clip the report
// ============================================
// The app shell scrolls internally (fixed height + overflow), which clips
// everything past the first screen when printing. Just while printing, let
// every ancestor of the report grow to its full height.
let printStyleBackup = [];

function releaseReportClippingForPrint() {
  printStyleBackup = [];

  let node = document.getElementById("report-tab-content");

  while (node) {
    printStyleBackup.push({
      node,
      overflow: node.style.overflow,
      overflowX: node.style.overflowX,
      overflowY: node.style.overflowY,
      height: node.style.height,
      maxHeight: node.style.maxHeight
    });

    node.style.setProperty("overflow", "visible", "important");
    node.style.setProperty("height", "auto", "important");
    node.style.setProperty("max-height", "none", "important");

    node = node.parentElement;
  }
}

function restoreReportClippingAfterPrint() {
  printStyleBackup.forEach((saved) => {
    saved.node.style.removeProperty("overflow");
    saved.node.style.removeProperty("height");
    saved.node.style.removeProperty("max-height");

    saved.node.style.overflow = saved.overflow;
    saved.node.style.overflowX = saved.overflowX;
    saved.node.style.overflowY = saved.overflowY;
    saved.node.style.height = saved.height;
    saved.node.style.maxHeight = saved.maxHeight;
  });

  printStyleBackup = [];
}

window.addEventListener("beforeprint", releaseReportClippingForPrint);
window.addEventListener("afterprint", restoreReportClippingAfterPrint);

// --- Deep-link support: if a facultyId is in the URL (e.g. from HR's
// Faculty Management "View Reports" action), open straight to that
// faculty's report instead of showing the list first. ---
function openReportFromQueryParam() {
  const params = new URLSearchParams(window.location.search);
  const facultyId = params.get("facultyId");
  if (!facultyId) return;

  const faculty = hrFacultyRoster.find(
    (f) => String(f.id) === facultyId
  );

  if (!faculty) return;

  showReportDetail(faculty);
}
mountPageContent();
attachDetailViewListeners();

(async () => {
  await loadSystemSettings();
  attachHrReportsFilterListeners();
  await renderReportsTable();
  openReportFromQueryParam();
  initGlobalTermFilter(onHrReportsTermChange);
})();

// Term changes invalidate cached breakdowns; refresh whichever view
// is currently visible so stale-term data never lingers.
async function onHrReportsTermChange() {
  hrReportDataCache = {};

  const detailView = document.getElementById("reports-detail-view");

  if (detailView && !detailView.classList.contains("hidden") && currentReportFaculty) {
    await showReportDetail(currentReportFaculty);
  } else {
    const pager = getHrReportsPager();
    if (pager) pager.reset();
    await renderReportsTable();
  }
}