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
    getBreakdown(`/evaluations/${facultyId}/classroom-breakdown`),
    getBreakdown(`/evaluations/${facultyId}/student-breakdown`),
    getBreakdown(`/evaluations/${facultyId}/peer-breakdown`),
    getBreakdown(`/evaluations/${facultyId}/hr-breakdown`)
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
          return await apiGet(`/evaluations/${faculty.id}`);
        } catch (error) {
          console.error(
            `Failed to load report for faculty ${faculty.id}:`,
            error
          );
          return null;
        }
      })
    );

    tableBody.innerHTML = activeFaculty
      .map((faculty, index) => {
        const report = reportResults[index];
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
  } catch (error) {
    console.error("Failed to load Admin Reports:", error);

    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="py-6 text-center text-gray-400">
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

  await renderReportsTable();

  attachDetailViewListeners();

  await openReportFromQueryParam();
}

initAdminReports();