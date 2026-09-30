// ============================================
// ADMIN REPORTS PAGE
// ============================================

function mountPageContent() {
  const template = document.getElementById("page-content-template");
  const slot = document.getElementById("admin-page-content");

  if (template && slot) {
    slot.appendChild(template.content.cloneNode(true));
  }
}

let facultyRoster = [];
let currentReportFaculty = null;
let currentReportTab = "combined";
let hrReportDataCache = {};
// Cached rows for the paginated list view: [{ faculty, report }]
let adminReportRowsCache = [];

var adminReportsPager = null;
function getAdminReportsPager() {
  if (!adminReportsPager) {
    if (typeof TablePagination !== "undefined" && TablePagination.create) {
      adminReportsPager = TablePagination.create({ defaultPerPage: 10 });
    } else {
      adminReportsPager = null;
    }
  }
  return adminReportsPager;
}

function reportHasResults(report) {
  if (!report || !report.per_type) return false;

  return [
    report.per_type.classroomObservation,
    report.per_type.student,
    report.per_type.peerToPeer,
    report.per_type.hrEvaluation,
  ].some((data) => data && typeof data.average_rating === "number");
}

function getFilteredReportRows() {
  const searchTerm = (
    document.getElementById("reports-search-input")?.value || ""
  )
    .trim()
    .toLowerCase();
  const statusFilter =
    document.getElementById("reports-status-filter")?.value || "all";

  return adminReportRowsCache.filter(({ faculty, report }) => {
    if (
      searchTerm &&
      !String(faculty.name || "").toLowerCase().includes(searchTerm)
    ) {
      return false;
    }

    if (statusFilter === "all") return true;

    const hasResults = reportHasResults(report);

    return statusFilter === "with-results" ? hasResults : !hasResults;
  });
}

function renderAdminReportsPage() {
  const tableBody = document.getElementById("admin-reports-table-body");
  if (!tableBody) return;

  const pager = getAdminReportsPager();
  const filtered = getFilteredReportRows();
  const pageRows = pager ? pager.paginate(filtered) : filtered;

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
        const classroomData = report?.per_type?.classroomObservation;
        const studentData = report?.per_type?.student;
        const peerData = report?.per_type?.peerToPeer;
        const hrData = report?.per_type?.hrEvaluation;

        const cell = (data) => {
          if (
            data &&
            typeof data.average_rating === "number"
          ) {
            return `
              <span class="text-green-600 font-medium">
                ${data.average_rating.toFixed(2)}
              </span>
            `;
          }

          return `<span class="text-gray-400">—</span>`;
        };

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

            <td class="py-3 pr-4">
              ${cell(classroomData)}
            </td>

            <td class="py-3 pr-4">
              ${cell(studentData)}
            </td>

            <td class="py-3 pr-4">
              ${cell(peerData)}
            </td>

            <td class="py-3 pr-4">
              ${cell(hrData)}
            </td>

            <td class="py-3 pr-4">
              <span class="${sentimentClass} font-medium text-sm">
                ${sentiment || "—"}
              </span>
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
      const faculty = facultyRoster.find(
        (f) => String(f.id) === btn.dataset.facultyId
      );

      if (faculty) {
        showReportDetail(faculty);
      }
    });
  });

  if (pager) {
    pager.render("admin-reports-pagination", filtered.length, renderAdminReportsPage);
  } else {
    const fallbackContainer = document.getElementById("admin-reports-pagination");
    if (fallbackContainer) fallbackContainer.innerHTML = "";
  }
}

function attachReportsFilterListeners() {
  document
    .getElementById("reports-search-input")
    ?.addEventListener("input", () => {
      const pager = getAdminReportsPager();
      if (pager) pager.reset();
      renderAdminReportsPage();
    });

  document
    .getElementById("reports-status-filter")
    ?.addEventListener("change", () => {
      const pager = getAdminReportsPager();
      if (pager) pager.reset();
      renderAdminReportsPage();
    });

  document
    .getElementById("reports-export-btn")
    ?.addEventListener("click", exportReportsWorkbook);
}

function exportReportsWorkbook() {
  if (typeof XLSX === "undefined" || !XLSX.utils) {
    alert("Spreadsheet library failed to load. Please refresh the page and try again.");
    return;
  }

  const rows = getFilteredReportRows();

  if (!rows.length) {
    alert("There are no reports to export.");
    return;
  }

  const avgOf = (data) =>
    data && typeof data.average_rating === "number" ? data.average_rating : "";

  const workbook = XLSX.utils.book_new();

  const listSheet = XLSX.utils.aoa_to_sheet([
    ["Faculty Name", "Classroom Obs.", "Student", "Peer-to-Peer", "HR", "Sentiment"],
    ...rows.map(({ faculty, report }) => [
      faculty.name || "",
      avgOf(report?.per_type?.classroomObservation),
      avgOf(report?.per_type?.student),
      avgOf(report?.per_type?.peerToPeer),
      avgOf(report?.per_type?.hrEvaluation),
      (report && report.dominant_sentiment) || "",
    ]),
  ]);
  listSheet["!cols"] = [
    { wch: 28 }, { wch: 15 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(workbook, listSheet, "Reports");

  const typeKeys = [
    "classroomObservation",
    "student",
    "peerToPeer",
    "hrEvaluation",
  ];
  const summaryBody = typeKeys.map((key) => {
    const values = rows
      .map(({ report }) => report?.per_type?.[key])
      .filter((data) => data && typeof data.average_rating === "number")
      .map((data) => data.average_rating);

    return [
      key,
      values.length,
      values.length
        ? Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2))
        : "—",
    ];
  });

  const withAnyResults = rows.filter(({ report }) => reportHasResults(report)).length;

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["Evaluation Type", "Faculty With Results", "Average Rating"],
    ...summaryBody,
    [],
    ["Total faculty listed", rows.length],
    ["Faculty with any results", withAnyResults],
  ]);
  summarySheet["!cols"] = [{ wch: 24 }, { wch: 22 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  XLSX.writeFile(
    workbook,
    `faculty-reports-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
// ============================================
// LOAD REPORT LIST
// ============================================
async function loadReportDetails(facultyId) {
  const getBreakdown = async (endpoint) => {
    try {
      return await apiGet(endpoint);
    } catch (error) {
      // 404 means this evaluation type has no submitted data yet.
      if (error.status === 404 || error.message?.includes("404")) {
        return null;
      }

      throw error;
    }
  };

  const [classroom, student, peer, hr] = await Promise.all([
    getBreakdown(withTerm(`/evaluations/${facultyId}/classroom-breakdown`)),
    getBreakdown(withTerm(`/evaluations/${facultyId}/student-breakdown`)),
    getBreakdown(withTerm(`/evaluations/${facultyId}/peer-breakdown`)),
    getBreakdown(withTerm(`/evaluations/${facultyId}/hr-breakdown`))
  ]);

  hrReportDataCache[facultyId] = {
    classroom,
    student,
    peer,
    hr
  };

  return hrReportDataCache[facultyId];
}

async function renderReportsTable() {
  const tableBody = document.getElementById("admin-reports-table-body");
  if (!tableBody) return;

  try {
    facultyRoster = await loadFacultyRoster();

    const activeFaculty = facultyRoster.filter(
      (faculty) => faculty.status === "Active"
    );

    const reportResults = await Promise.all(
      activeFaculty.map(async (faculty) => {
        try {
          return await apiGet(withTerm(`/evaluations/${faculty.id}`));
        } catch (error) {
          console.error(
            `Failed to load report for faculty ${faculty.id}:`,
            error
          );
          return null;
        }
      })
    );

    adminReportRowsCache = activeFaculty.map((faculty, index) => ({
      faculty,
      report: reportResults[index],
    }));

    const pager = getAdminReportsPager();
    if (pager) pager.reset();
    renderAdminReportsPage();
  } catch (error) {
    console.error("Failed to load Admin Reports:", error);

    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="py-6 text-center text-gray-400">
          Unable to load reports.
        </td>
      </tr>
    `;
  }
}

// ============================================
// DETAIL VIEW
// ============================================

async function showReportDetail(faculty) {
  currentReportFaculty = faculty;
  currentReportTab = "combined";

  document.getElementById("report-faculty-name").textContent =
    faculty.name;

  document.getElementById("reports-list-view").classList.add("hidden");
  document.getElementById("reports-detail-view").classList.remove("hidden");

  document.getElementById("report-tab-content").innerHTML = `
    <p class="text-sm text-gray-400 py-8 text-center">
      Loading report...
    </p>
  `;

  try {
    await loadReportDetails(faculty.id);

    attachReportTabListeners();
    renderReportTabContent();
  } catch (error) {
    console.error("Failed to load report details:", error);

    document.getElementById("report-tab-content").innerHTML = `
      <p class="text-sm text-red-500 py-8 text-center">
        Unable to load this report.
      </p>
    `;
  }
}

function attachReportTabListeners() {
  document.querySelectorAll(".report-tab-btn").forEach((btn) => {
    const clone = btn.cloneNode(true);
    btn.replaceWith(clone);
  });

  document.querySelectorAll(".report-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentReportTab = btn.dataset.tab;

      document.querySelectorAll(".report-tab-btn").forEach((b) => {
        const isActive = b.dataset.tab === currentReportTab;

        b.classList.toggle("bg-brand", isActive);
        b.classList.toggle("text-white", isActive);
        b.classList.toggle("bg-gray-100", !isActive);
        b.classList.toggle("text-gray-600", !isActive);
      });

      renderReportTabContent();
    });
  });

  const combinedTab = document.querySelector(
    '.report-tab-btn[data-tab="combined"]'
  );

  if (combinedTab) {
    combinedTab.classList.add("bg-brand", "text-white");
    combinedTab.classList.remove("bg-gray-100", "text-gray-600");
  }
}

function renderReportTabContent() {
  const content = document.getElementById("report-tab-content");

  if (!content || !currentReportFaculty) return;

  content.innerHTML = buildReportTabHtml(
    currentReportTab,
    currentReportFaculty
  );
}

// ============================================
// DETAIL VIEW CONTROLS
// ============================================

function attachDetailViewListeners() {
  const backButton = document.getElementById("back-to-reports-btn");

  if (backButton) {
    backButton.addEventListener("click", () => {
      document
        .getElementById("reports-detail-view")
        .classList.add("hidden");

      document
        .getElementById("reports-list-view")
        .classList.remove("hidden");
    });
  }

  const printButton = document.getElementById("print-report-btn");

  if (printButton) {
    printButton.addEventListener("click", () => {
      window.print();
    });
  }
}

// ============================================
// OPEN REPORT FROM URL
// ============================================

async function openReportFromQueryParam() {
  const params = new URLSearchParams(window.location.search);
  const facultyId = params.get("facultyId");

  if (!facultyId) return;

  if (!facultyRoster.length) {
    facultyRoster = await loadFacultyRoster();
  }

  const faculty = facultyRoster.find(
    (f) => String(f.id) === String(facultyId)
  );

  if (!faculty) return;

  await showReportDetail(faculty);
}

// ============================================
// INIT
// ============================================

async function initAdminReports() {
  mountPageContent();

  await loadSystemSettings();
  await renderReportsTable();

  attachDetailViewListeners();
  attachReportsFilterListeners();

  await openReportFromQueryParam();

  initGlobalTermFilter(onReportsTermChange);
}

// Term changes invalidate cached breakdowns; refresh whichever view
// is currently visible so stale-term data never lingers.
async function onReportsTermChange() {
  hrReportDataCache = {};

  const detailView = document.getElementById("reports-detail-view");

  if (detailView && !detailView.classList.contains("hidden") && currentReportFaculty) {
    await showReportDetail(currentReportFaculty);
  } else {
    const pager = getAdminReportsPager();
    if (pager) pager.reset();
    await renderReportsTable();
  }
}

initAdminReports();