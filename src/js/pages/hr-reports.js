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

// --- Render the summary table ---
async function renderReportsTable() {
  const tableBody = document.getElementById("hr-reports-table-body");
  if (!tableBody) return;

  try {
    hrFacultyRoster = await apiGet("/faculty");
  } catch (err) {
    console.error("Failed to load faculty roster:", err);
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="py-6 text-center text-red-500">
          Failed to load faculty.
        </td>
      </tr>
    `;
    return;
  }

  const rows = await Promise.all(hrFacultyRoster.map(async (faculty) => {
    const summary = await apiGet(`/evaluations/${faculty.id}`);
    const classroomData = summary.per_type?.classroomObservation
      ? { average: summary.per_type.classroomObservation.average_rating }
      : null;

    const studentData = summary.per_type?.student
      ? { average: summary.per_type.student.average_rating }
      : null;

    const peerData = summary.per_type?.peerToPeer
      ? { average: summary.per_type.peerToPeer.average_rating }
      : null;

    const hrData = summary.per_type?.hrEvaluation
      ? { average: summary.per_type.hrEvaluation.average_rating }
      : null;

    const cell = (data) =>
      data && data.average !== null
        ? `<span class="text-green-600 font-medium">${data.average.toFixed(2)}</span>`
        : `<span class="text-gray-400">—</span>`;

    return `
      <tr class="border-b border-gray-200 last:border-0">
        <td class="py-3 pr-4">${faculty.name}</td>
        <td class="py-3 pr-4">${cell(classroomData)}</td>
        <td class="py-3 pr-4">${cell(studentData)}</td>
        <td class="py-3 pr-4">${cell(peerData)}</td>
        <td class="py-3 pr-4">${cell(hrData)}</td>
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
    }));

  tableBody.innerHTML = rows.join("");

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
}

let currentReportFaculty = null;
let currentReportTab = "combined";

async function loadFacultyReportData(facultyId) {
  const report = {
    classroom: null,
    student: null,
    peer: null,
    hr: null
  };

  const requests = [
    ["classroom", `/evaluations/${facultyId}/classroom-breakdown`],
    ["student", `/evaluations/${facultyId}/student-breakdown`],
    ["peer", `/evaluations/${facultyId}/peer-breakdown`],
    ["hr", `/evaluations/${facultyId}/hr-breakdown`]
  ];

  await Promise.all(
    requests.map(async ([type, url]) => {
      try {
        report[type] = await apiGet(url);
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
  await renderReportsTable();
  openReportFromQueryParam();
})();