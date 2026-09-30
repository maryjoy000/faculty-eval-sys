// ============================================
// DASHBOARD OVERVIEW PAGE
// ============================================

function mountPageContent() {
  const template = document.getElementById("page-content-template");
  const slot = document.getElementById("admin-page-content");

  if (template && slot) {
    slot.appendChild(template.content.cloneNode(true));
  }
}

// --- Stat card data ---
const statCards = [
  {
    label: "Faculty Evaluations Completed",
    value: "0/0",
    note: "Faculty with all required evaluations"
  },
  {
    label: "Faculty Members",
    value: "0",
    note: "Active this semester"
  },
  {
    label: "Avg. Sentiment Score",
    value: "—",
    note: "Based on student feedback"
  },
  {
    label: "Student Evaluation",
    value: "0%",
    note: "Evaluation completion rate"
  },
  {
    label: "Peer-to-Peer Evaluation",
    value: "0%",
    note: "Faculty evaluation completion"
  },
  {
    label: "Classroom Observation",
    value: "0%",
    note: "Faculty observation completion"
  }
];

function renderStatCards() {
  const container = document.getElementById("stat-cards");

  if (!container) return;

  container.innerHTML = statCards.map((card) => `
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <p class="text-sm text-gray-500 mb-2">${card.label}</p>
      <p class="text-2xl font-bold text-gray-800 mb-1">${card.value}</p>
      <p class="text-xs text-gray-400">${card.note}</p>
    </div>
  `).join("");
}

// --- Load Faculty Count ---
async function loadFacultyCount() {
  try {
    const faculty = await apiGet("/faculty");

    const activeFaculty = faculty.filter(
      (member) => member.status === "Active"
    );

    statCards[1].value = String(activeFaculty.length);

    renderStatCards();
  } catch (error) {
    console.error("Failed to load faculty count:", error);
  }
}

async function loadEvaluationCompletion() {
  try {
    const stats = await apiGet(withTerm("/evaluations/dashboard-stats"));

    statCards[0].value =
      `${stats.completed_faculty_evaluations}/${stats.total_active_faculty}`;

    statCards[3].value =
      `${stats.student_evaluation_percentage}%`;

    statCards[4].value =
      `${stats.peer_evaluation_percentage}%`;

    statCards[5].value =
      `${stats.classroom_observation_percentage}%`;

    renderStatCards();
  } catch (error) {
    console.error(
      "Failed to load evaluation completion:",
      error
    );
  }
}
// --- Sentiment donut chart ---
const sentimentData = {
  positive: 0,
  neutral: 0,
  negative: 0
};

let sentimentDonutChart = null;

async function loadSentimentData() {
  try {
    const data = await apiGet(withTerm("/evaluations/dashboard-sentiment"));

    sentimentData.positive = data.positive || 0;
    sentimentData.neutral = data.neutral || 0;
    sentimentData.negative = data.negative || 0;

    statCards[2].value =
      data.average_sentiment_score != null
        ? Number(data.average_sentiment_score).toFixed(3)
        : "—";

    renderStatCards();
    renderSentimentDonut();

  } catch (error) {
    console.error(
      "Failed to load sentiment data:",
      error
    );
  }
}

function renderSentimentDonut() {
  const canvas = document.getElementById("sentiment-donut-chart");
  const legendContainer = document.getElementById("donut-legend");

  if (!canvas) return;

  if (sentimentDonutChart) {
    sentimentDonutChart.destroy();
    sentimentDonutChart = null;
  }

  const labels = ["Positive", "Neutral", "Negative"];

  const values = [
    sentimentData.positive,
    sentimentData.neutral,
    sentimentData.negative
  ];

  const colors = [
    "#16A34A",
    "#F59E0B",
    "#DC2626"
  ];

  sentimentDonutChart = new Chart(canvas, {
    type: "doughnut",

    data: {
      labels,

      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0
      }]
    },

    options: {
      cutout: "70%",

      plugins: {
        legend: {
          display: false
        }
      }
    }
  });

  // Custom legend
  if (legendContainer) {
    legendContainer.innerHTML = labels.map((label, i) => `
      <span class="flex items-center gap-1.5 text-gray-600">
        <span
          class="w-2.5 h-2.5 rounded-full"
          style="background-color: ${colors[i]}"
        ></span>
        ${label}
      </span>
    `).join("");
  }
}

async function loadTopRatedFaculty() {
  const container = document.getElementById("top-rated-faculty-list");
  if (!container) return;

  try {
    const faculty = await apiGet(withTerm("/evaluations/dashboard-top-faculty"));

    if (!faculty.length) {
      container.innerHTML = `
        <p class="text-gray-400">No rated faculty yet.</p>
      `;
      return;
    }

    container.innerHTML = faculty.map((member, index) => `
      <div class="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
        <div class="flex items-center gap-3">
          <span class="w-7 text-center font-semibold text-gray-500">
            ${index + 1}
          </span>
          <span class="font-medium text-gray-800">
            ${member.name}
          </span>
        </div>
        <span class="font-semibold text-gray-800">
          ${member.weighted_overall_pct}%
        </span>
      </div>
    `).join("");
  } catch (error) {
    console.error("Failed to load top rated faculty:", error);
    container.innerHTML = `
      <p class="text-gray-400">Unable to load faculty ratings.</p>
    `;
  }
}

let recentEvaluationsCache = [];

var recentEvaluationsPager = null;
function getRecentEvaluationsPager() {
  if (!recentEvaluationsPager) {
    if (typeof TablePagination !== "undefined" && TablePagination.create) {
      recentEvaluationsPager = TablePagination.create({ defaultPerPage: 5, pageSizeOptions: [5, 10, 25, 50] });
    } else {
      recentEvaluationsPager = null;
    }
  }
  return recentEvaluationsPager;
}

function renderRecentEvaluationsPage() {
  const container = document.getElementById("recent-evaluations-list");
  if (!container) return;

  const paginationContainer = document.getElementById("recent-evaluations-pagination");
  const pager = getRecentEvaluationsPager();

  if (!recentEvaluationsCache.length) {
    container.innerHTML = `<p class="text-gray-400">No evaluations yet.</p>`;
    if (paginationContainer) paginationContainer.innerHTML = "";
    return;
  }

  const pageItems = pager ? pager.paginate(recentEvaluationsCache) : recentEvaluationsCache;

  container.innerHTML = pageItems.map((evaluation) => {
    const date = evaluation.submitted_at
      ? new Date(evaluation.submitted_at).toLocaleString()
      : "Unknown date";

    return `
      <div class="py-3 border-b border-gray-100 last:border-b-0">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-medium text-gray-800">${evaluation.faculty_name}</p>
            <p class="text-xs text-gray-500">
              Submitted by: ${evaluation.student_lrn}
            </p>
          </div>
          <span class="font-semibold text-gray-800">
            ${evaluation.overall_average != null
              ? Number(evaluation.overall_average).toFixed(2)
              : "—"}
          </span>
        </div>
        <p class="text-xs text-gray-400 mt-1">${date}</p>
      </div>
    `;
  }).join("");

  if (pager) {
    pager.render("recent-evaluations-pagination", recentEvaluationsCache.length, renderRecentEvaluationsPage);
  } else if (paginationContainer) {
    paginationContainer.innerHTML = "";
  }
}

async function loadRecentEvaluations() {
  const container = document.getElementById("recent-evaluations-list");
  if (!container) return;

  try {
    const evaluations = await apiGet(withTerm("/evaluations/dashboard-recent"));

    recentEvaluationsCache = Array.isArray(evaluations) ? evaluations : [];

    const pager = getRecentEvaluationsPager();
    if (pager) pager.reset();

    renderRecentEvaluationsPage();
  } catch (error) {
    console.error("Failed to load recent evaluations:", error);
    container.innerHTML =
      `<p class="text-gray-400">Unable to load recent evaluations.</p>`;
    const paginationContainer = document.getElementById("recent-evaluations-pagination");
    if (paginationContainer) paginationContainer.innerHTML = "";
  }
}
// ============================================
// RATING DISTRIBUTION (per evaluation type)
// ============================================

let ratingDistributionChart = null;
let ratingDistributionData = null;

function distributionBandColor(index, total) {
  if (index === 0) return "#16A34A";
  if (index === total - 1 && total > 1) return "#DC2626";
  return "#F59E0B";
}

function escapeDistributionText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function loadRatingDistribution() {
  const canvas = document.getElementById("rating-distribution-chart");
  if (!canvas) return;

  const typeSelect = document.getElementById("rating-distribution-type");
  const evalType = typeSelect ? typeSelect.value : "student";

  try {
    ratingDistributionData = await apiGet(
      withTerm(
        `/analytics/rating-distribution?evaluation_type=${encodeURIComponent(evalType)}`
      )
    );

    renderRatingDistributionChart();
    clearDistributionDrilldown();
  } catch (error) {
    console.error("Failed to load rating distribution:", error);
    ratingDistributionData = null;
    renderRatingDistributionChart();
    clearDistributionDrilldown();
  }
}

function renderRatingDistributionChart() {
  const canvas = document.getElementById("rating-distribution-chart");
  if (!canvas || typeof Chart === "undefined") return;

  if (ratingDistributionChart) {
    ratingDistributionChart.destroy();
    ratingDistributionChart = null;
  }

  const bands =
    ratingDistributionData && Array.isArray(ratingDistributionData.bands)
      ? ratingDistributionData.bands
      : [];

  ratingDistributionChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: bands.map((band) => band.label),
      datasets: [
        {
          data: bands.map((band) => band.count),
          backgroundColor: bands.map((_, index) =>
            distributionBandColor(index, bands.length)
          ),
          borderWidth: 0,
        },
      ],
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { stepSize: 1, precision: 0 },
        },
      },
      onClick: (_event, elements) => {
        if (elements && elements.length) {
          showDistributionDrilldown(elements[0].index);
        }
      },
      onHover: (event, elements) => {
        if (event && event.native && event.native.target) {
          event.native.target.style.cursor =
            elements && elements.length ? "pointer" : "default";
        }
      },
    },
  });
}

function showDistributionDrilldown(bandIndex) {
  const holder = document.getElementById("rating-distribution-drilldown");
  if (!holder) return;

  const bands =
    ratingDistributionData && Array.isArray(ratingDistributionData.bands)
      ? ratingDistributionData.bands
      : [];
  const band = bands[bandIndex];

  if (!band) return;

  const members = Array.isArray(band.faculty) ? band.faculty : [];

  holder.innerHTML = `
    <h3 class="text-sm font-semibold text-gray-800 mb-2">
      ${escapeDistributionText(band.label)} — ${members.length} facult${members.length === 1 ? "y" : "ies"}
    </h3>
    ${
      members.length
        ? members
            .map(
              (member) => `
          <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-sm">
            <span class="text-gray-700">${escapeDistributionText(member.name)}</span>
            <span class="font-semibold text-gray-800">${Number(member.average).toFixed(2)}</span>
          </div>`
            )
            .join("")
        : `<p class="text-sm text-gray-400">No faculty in this band.</p>`
    }`;

  holder.classList.remove("hidden");
}

function clearDistributionDrilldown() {
  const holder = document.getElementById("rating-distribution-drilldown");
  if (!holder) return;

  holder.classList.add("hidden");
  holder.innerHTML = "";
}

function exportRatingDistribution() {
  if (typeof XLSX === "undefined" || !XLSX.utils) {
    alert("Spreadsheet library failed to load. Please refresh the page and try again.");
    return;
  }

  const bands =
    ratingDistributionData && Array.isArray(ratingDistributionData.bands)
      ? ratingDistributionData.bands
      : [];

  if (!bands.length) return;

  const typeSelect = document.getElementById("rating-distribution-type");
  const typeLabel =
    typeSelect && typeSelect.options[typeSelect.selectedIndex]
      ? typeSelect.options[typeSelect.selectedIndex].text
      : "Evaluation";

  const rows = [["Evaluation Type", "Rating", "Faculty", "Average"]];

  bands.forEach((band) => {
    (Array.isArray(band.faculty) ? band.faculty : []).forEach((member) => {
      rows.push([typeLabel, band.label, member.name, member.average]);
    });
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 28 }, { wch: 12 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Rating Distribution");
  XLSX.writeFile(
    workbook,
    `rating-distribution-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

// ============================================
// INITIALIZE DASHBOARD
// ============================================

// Re-runnable term-scoped section (faculty count + activity log stay global).
function reloadDashboardData() {
  loadEvaluationCompletion();
  loadSentimentData();
  loadTopRatedFaculty();
  loadRecentEvaluations();
  loadRatingDistribution();
}

mountPageContent();
renderStatCards();
loadFacultyCount();
loadEvaluationCompletion();
loadSentimentData();
loadTopRatedFaculty();
loadRecentEvaluations();
loadRecentActivityLog();
loadRatingDistribution();

document
  .getElementById("rating-distribution-type")
  ?.addEventListener("change", loadRatingDistribution);

document
  .getElementById("rating-distribution-export-btn")
  ?.addEventListener("click", exportRatingDistribution);

initGlobalTermFilter(reloadDashboardData);

(async () => {
  await loadSystemSettings();
  const el = document.getElementById("academic-year-display");
  if (el) {
    el.textContent = getAcademicYearDisplay();
  }
})();