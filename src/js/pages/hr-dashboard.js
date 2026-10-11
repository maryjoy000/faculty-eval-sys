// ============================================
// HR DASHBOARD PAGE
// ============================================

function mountPageContent() {
  const template = document.getElementById("page-content-template");
  const slot = document.getElementById("hr-page-content");

  if (template && slot) {
    slot.appendChild(template.content.cloneNode(true));
  }
}

function renderHrStatCards(data) {
  const container = document.getElementById("hr-stat-cards");
  if (!container) return;

  const cards = [
    {
      label: "Total Faculty",
      value: data.total_faculty,
      note: "Active faculty members"
    },
    {
      label: "Completed",
      value: data.completed,
      note: "HR evaluations submitted"
    }
  ];

  container.className =
    "grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6";

  container.innerHTML = cards.map((card) => `
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <p class="text-sm text-gray-500 mb-2">${card.label}</p>
      <p class="text-2xl font-bold text-gray-800 mb-1">${card.value}</p>
      <p class="text-xs text-gray-400">${card.note}</p>
    </div>
  `).join("");
}

let hrPendingCache = [];
let hrCompletedCache = [];

var hrPendingPager = null;
var hrCompletedPager = null;

function getHrPendingPager() {
  if (!hrPendingPager) {
    if (typeof TablePagination !== "undefined" && TablePagination.create) {
      hrPendingPager = TablePagination.create({ defaultPerPage: 5, pageSizeOptions: [5, 10, 25, 50] });
    } else {
      hrPendingPager = null;
    }
  }
  return hrPendingPager;
}

function getHrCompletedPager() {
  if (!hrCompletedPager) {
    if (typeof TablePagination !== "undefined" && TablePagination.create) {
      hrCompletedPager = TablePagination.create({ defaultPerPage: 5, pageSizeOptions: [5, 10, 25, 50] });
    } else {
      hrCompletedPager = null;
    }
  }
  return hrCompletedPager;
}

function renderEvaluationLists(data) {
  const pendingContainer =
    document.getElementById("pending-evaluations-list");

  const completedContainer =
    document.getElementById("completed-evaluations-list");

  if (!pendingContainer || !completedContainer) return;

  hrPendingCache = data.evaluations.filter(
    (faculty) => !faculty.completed
  );

  hrCompletedCache = data.evaluations.filter(
    (faculty) => faculty.completed
  );

  const pendingPager = getHrPendingPager();
  if (pendingPager) pendingPager.reset();

  const completedPager = getHrCompletedPager();
  if (completedPager) completedPager.reset();

  renderHrPendingPage();
  renderHrCompletedPage();
}

function renderHrPendingPage() {
  const pendingContainer =
    document.getElementById("pending-evaluations-list");
  if (!pendingContainer) return;

  const paginationContainer = document.getElementById("pending-evaluations-pagination");
  const pager = getHrPendingPager();

  if (!hrPendingCache.length) {
    pendingContainer.innerHTML = `
        <p class="text-sm text-gray-400">
          All active faculty have been evaluated.
        </p>
      `;
    if (paginationContainer) paginationContainer.innerHTML = "";
    return;
  }

  const pageItems = pager ? pager.paginate(hrPendingCache) : hrPendingCache;

  pendingContainer.innerHTML = pageItems.map((faculty) => `
        <div class="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
          <span class="text-gray-700">${faculty.name}</span>

          <a
            href="hr-evaluation.html?facultyId=${faculty.id}"
            class="text-brand font-medium hover:underline"
          >
            Evaluate →
          </a>
        </div>
      `).join("");

  if (pager) {
    pager.render("pending-evaluations-pagination", hrPendingCache.length, renderHrPendingPage);
  } else if (paginationContainer) {
    paginationContainer.innerHTML = "";
  }
}

function renderHrCompletedPage() {
  const completedContainer =
    document.getElementById("completed-evaluations-list");
  if (!completedContainer) return;

  const paginationContainer = document.getElementById("completed-evaluations-pagination");
  const pager = getHrCompletedPager();

  if (!hrCompletedCache.length) {
    completedContainer.innerHTML = `
        <p class="text-sm text-gray-400">
          No completed evaluations yet.
        </p>
      `;
    if (paginationContainer) paginationContainer.innerHTML = "";
    return;
  }

  const pageItems = pager ? pager.paginate(hrCompletedCache) : hrCompletedCache;

  completedContainer.innerHTML = pageItems.map((faculty) => `
        <div class="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
          <span class="text-gray-700">${faculty.name}</span>

          <span class="text-green-600 font-medium">
            ${Number(faculty.rating_pct || 0).toFixed(2)}%
          </span>
        </div>
      `).join("");

  if (pager) {
    pager.render("completed-evaluations-pagination", hrCompletedCache.length, renderHrCompletedPage);
  } else if (paginationContainer) {
    paginationContainer.innerHTML = "";
  }
}

async function loadHrDashboard() {
  try {
    const data = await apiGet(withTerm("/evaluations/hr-dashboard"));

    renderHrStatCards(data);
    renderEvaluationLists(data);
  } catch (error) {
    console.error("Failed to load HR dashboard:", error);

    const cards = document.getElementById("hr-stat-cards");
    const pending = document.getElementById("pending-evaluations-list");
    const completed =
      document.getElementById("completed-evaluations-list");

    if (cards) {
      cards.innerHTML = `
        <p class="text-sm text-red-500">
          Unable to load HR dashboard data.
        </p>
      `;
    }

    if (pending) {
      pending.innerHTML = `
        <p class="text-sm text-red-500">
          Unable to load evaluations.
        </p>
      `;
    }

    if (completed) {
      completed.innerHTML = `
        <p class="text-sm text-red-500">
          Unable to load evaluations.
        </p>
      `;
    }
  }
}

async function loadHrSentiment() {
  try {
    const data = await apiGet(withTerm("/evaluations/dashboard-sentiment"));

    const averageEl = document.getElementById("hr-sentiment-average");

    if (averageEl) {
      averageEl.textContent =
        data.average_sentiment_score != null
          ? Number(data.average_sentiment_score).toFixed(3)
          : "—";
    }

    renderHrSentimentDonut(
      data.positive || 0,
      data.neutral || 0,
      data.negative || 0
    );
  } catch (error) {
    console.error("Failed to load HR sentiment data:", error);
  }
}

let hrSentimentDonutChart = null;

function renderHrSentimentDonut(positive, neutral, negative) {
  const canvas = document.getElementById("hr-sentiment-donut-chart");
  const legendContainer = document.getElementById("hr-donut-legend");

  if (!canvas || typeof Chart === "undefined") return;

  const labels = ["Positive", "Neutral", "Negative"];
  const values = [positive, neutral, negative];
  const colors = ["#16A34A", "#F59E0B", "#DC2626"];

  if (hrSentimentDonutChart) hrSentimentDonutChart.destroy();

  hrSentimentDonutChart = new Chart(canvas, {
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

  if (legendContainer) {
    legendContainer.innerHTML = labels
      .map(
        (label, index) => `
          <span class="flex items-center gap-2 text-gray-600">
            <span
              class="inline-block w-3 h-3 rounded-full"
              style="background-color: ${colors[index]}"
            ></span>
            ${label}: ${values[index]}
          </span>
        `
      )
      .join("");
  }
}

// ============================================
// RATING DISTRIBUTION (per evaluation type)
// Mirrors the admin dashboard section. HR has no term filter, so this
// loads unscoped data (all history).
// ============================================

let hrRatingDistributionChart = null;
let hrRatingDistributionData = null;

function hrDistributionBandColor(index, total) {
  if (index === 0) return "#16A34A";
  if (index === total - 1 && total > 1) return "#DC2626";
  return "#F59E0B";
}

function hrEscapeDistributionText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function loadHrRatingDistribution() {
  const canvas = document.getElementById("hr-rating-distribution-chart");
  if (!canvas) return;

  const typeSelect = document.getElementById("hr-rating-distribution-type");
  const evalType = typeSelect ? typeSelect.value : "student";

  try {
    hrRatingDistributionData = await apiGet(
      withTerm(`/analytics/rating-distribution?evaluation_type=${encodeURIComponent(evalType)}`)
    );

    renderHrRatingDistributionChart();
    clearHrDistributionDrilldown();
  } catch (error) {
    console.error("Failed to load rating distribution:", error);
    hrRatingDistributionData = null;
    renderHrRatingDistributionChart();
    clearHrDistributionDrilldown();
  }
}

function renderHrRatingDistributionChart() {
  const canvas = document.getElementById("hr-rating-distribution-chart");
  if (!canvas || typeof Chart === "undefined") return;

  if (hrRatingDistributionChart) {
    hrRatingDistributionChart.destroy();
    hrRatingDistributionChart = null;
  }

  const bands =
    hrRatingDistributionData && Array.isArray(hrRatingDistributionData.bands)
      ? hrRatingDistributionData.bands
      : [];

  hrRatingDistributionChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: bands.map((band) => band.label),
      datasets: [
        {
          data: bands.map((band) => band.count),
          backgroundColor: bands.map((_, index) =>
            hrDistributionBandColor(index, bands.length)
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
          showHrDistributionDrilldown(elements[0].index);
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

function showHrDistributionDrilldown(bandIndex) {
  const holder = document.getElementById("hr-rating-distribution-drilldown");
  if (!holder) return;

  const bands =
    hrRatingDistributionData && Array.isArray(hrRatingDistributionData.bands)
      ? hrRatingDistributionData.bands
      : [];
  const band = bands[bandIndex];

  if (!band) return;

  const members = Array.isArray(band.faculty) ? band.faculty : [];

  holder.innerHTML = `
    <h3 class="text-sm font-semibold text-gray-800 mb-2">
      ${hrEscapeDistributionText(band.label)} — ${members.length} facult${members.length === 1 ? "y" : "ies"}
    </h3>
    ${
      members.length
        ? members
            .map(
              (member) => `
          <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-sm">
            <span class="text-gray-700">${hrEscapeDistributionText(member.name)}</span>
            <span class="font-semibold text-gray-800">${Number(member.average).toFixed(2)}</span>
          </div>`
            )
            .join("")
        : `<p class="text-sm text-gray-400">No faculty in this band.</p>`
    }`;

  holder.classList.remove("hidden");
}

function clearHrDistributionDrilldown() {
  const holder = document.getElementById("hr-rating-distribution-drilldown");
  if (!holder) return;

  holder.classList.add("hidden");
  holder.innerHTML = "";
}

function exportHrRatingDistribution() {
  if (typeof XLSX === "undefined" || !XLSX.utils) {
    alert("Spreadsheet library failed to load. Please refresh the page and try again.");
    return;
  }

  const bands =
    hrRatingDistributionData && Array.isArray(hrRatingDistributionData.bands)
      ? hrRatingDistributionData.bands
      : [];

  if (!bands.length) return;

  const typeSelect = document.getElementById("hr-rating-distribution-type");
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
    `hr-rating-distribution-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

// ============================================
// PERIOD STATUS, COMPLETION, NEEDS ATTENTION, NEGATIVE COMMENTS
// ============================================

function hrEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function hrFormatDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function hrPlural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

async function loadHrPeriodStatus() {
  const list = document.getElementById("hr-period-status-list");
  const badge = document.getElementById("hr-term-badge");
  if (!list) return;

  try {
    // Period status is "right now", so it is deliberately not term-scoped.
    const data = await apiGet("/evaluations/hr-dashboard/period-status");

    if (badge) {
      if (data.term) {
        badge.textContent = data.term.label || `${data.term.school_year} · ${data.term.semester}`;
        badge.className = "text-xs font-medium px-2 py-1 rounded-full bg-green-50 text-green-700";
      } else {
        badge.textContent = "No open term";
        badge.className = "text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-500";
      }
    }

    const styles = {
      open: ["Open", "bg-green-50 text-green-700"],
      upcoming: ["Upcoming", "bg-blue-50 text-blue-700"],
      closed: ["Closed", "bg-gray-100 text-gray-500"],
      not_scheduled: ["Not scheduled", "bg-gray-100 text-gray-400"]
    };

    list.innerHTML = data.periods.map((p) => {
      const [text, cls] = styles[p.status] || styles.not_scheduled;
      let note = "";

      if (p.status === "open") {
        note = p.days_remaining === 0
          ? "Closes today"
          : `Closes ${hrFormatDate(p.end_date)} · ${hrPlural(p.days_remaining, "day")} left`;
      } else if (p.status === "upcoming") {
        note = `Opens ${hrFormatDate(p.start_date)} · in ${hrPlural(p.days_remaining, "day")}`;
      } else if (p.status === "closed") {
        note = `Ended ${hrFormatDate(p.end_date)}`;
      }

      return `
        <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-sm gap-3">
          <div>
            <p class="text-gray-700">${hrEscape(p.label)}</p>
            ${note ? `<p class="text-xs text-gray-400">${hrEscape(note)}</p>` : ""}
          </div>
          <span class="text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${cls}">${text}</span>
        </div>`;
    }).join("");
  } catch (error) {
    console.error("Failed to load period status:", error);
    list.innerHTML = `<p class="text-sm text-red-500">Unable to load period status.</p>`;
  }
}

function hrProgressBarHtml(label, pct, note) {
  const value = Math.max(0, Math.min(100, Number(pct) || 0));
  const color = value >= 75 ? "#16A34A" : value >= 40 ? "#F59E0B" : "#DC2626";

  return `
    <div class="mb-4 last:mb-0">
      <div class="flex items-baseline justify-between text-sm mb-1">
        <span class="text-gray-700">${hrEscape(label)}</span>
        <span class="font-semibold text-gray-800">${value.toFixed(1)}%</span>
      </div>
      <div class="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div class="h-2 rounded-full" style="width:${value}%;background-color:${color}"></div>
      </div>
      ${note ? `<p class="text-xs text-gray-400 mt-1">${hrEscape(note)}</p>` : ""}
    </div>`;
}

async function loadHrCompletion() {
  const list = document.getElementById("hr-completion-list");
  if (!list) return;

  try {
    const data = await apiGet(withTerm("/evaluations/dashboard-stats"));

    const total = data.total_active_faculty || 0;
    const done = data.completed_faculty_evaluations || 0;
    const fullPct = total ? (done / total) * 100 : 0;

    list.innerHTML =
      hrProgressBarHtml("Student Evaluations", data.student_evaluation_percentage) +
      hrProgressBarHtml("Peer-to-Peer Evaluations", data.peer_evaluation_percentage) +
      hrProgressBarHtml("Classroom Observations", data.classroom_observation_percentage, "Faculty with at least one observation") +
      hrProgressBarHtml(
        "Fully Evaluated Faculty",
        fullPct,
        `${done} of ${total} faculty have all four evaluation types`
      );
  } catch (error) {
    console.error("Failed to load completion stats:", error);
    list.innerHTML = `<p class="text-sm text-red-500">Unable to load completion data.</p>`;
  }
}

async function loadHrNeedsAttention() {
  const list = document.getElementById("hr-needs-attention-list");
  if (!list) return;

  try {
    const data = await apiGet(withTerm("/evaluations/hr-dashboard/needs-attention?limit=5"));

    if (!data.faculty.length) {
      list.innerHTML = `<p class="text-sm text-gray-400">No rated faculty yet for this term.</p>`;
      return;
    }

    list.innerHTML = data.faculty.map((f, i) => `
      <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-sm gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-xs text-gray-400 w-4">${i + 1}</span>
          <div class="min-w-0">
            <p class="text-gray-700 truncate">${hrEscape(f.name)}</p>
            <p class="text-xs text-gray-400">Based on ${hrPlural(f.types_rated, "evaluation type")}</p>
          </div>
        </div>
        <span class="font-semibold ${f.average < 3 ? "text-red-600" : "text-amber-600"}">${Number(f.average).toFixed(2)} / 5</span>
      </div>`).join("");
  } catch (error) {
    console.error("Failed to load needs-attention list:", error);
    list.innerHTML = `<p class="text-sm text-red-500">Unable to load this list.</p>`;
  }
}

async function loadHrNegativeComments() {
  const list = document.getElementById("hr-negative-comments-list");
  if (!list) return;

  try {
    const data = await apiGet(withTerm("/evaluations/hr-dashboard/negative-comments?limit=5"));

    if (!data.faculty.length) {
      list.innerHTML = `<p class="text-sm text-gray-400">No faculty have enough negative comments to list.</p>`;
      return;
    }

    list.innerHTML = data.faculty.map((f, i) => `
      <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-sm gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-xs text-gray-400 w-4">${i + 1}</span>
          <div class="min-w-0">
            <p class="text-gray-700 truncate">${hrEscape(f.name)}</p>
            <p class="text-xs text-gray-400">${f.negative_comments} of ${hrPlural(f.labeled_comments, "comment")}</p>
          </div>
        </div>
        <span class="font-semibold text-red-600">${Number(f.negative_pct).toFixed(1)}%</span>
      </div>`).join("");
  } catch (error) {
    console.error("Failed to load negative comment share:", error);
    list.innerHTML = `<p class="text-sm text-red-500">Unable to load this list.</p>`;
  }
}

// Re-runnable term-scoped section. (Period status is "right now", so it only loads once.)
function reloadHrDashboardData() {
  loadHrDashboard();
  loadHrSentiment();
  loadHrRatingDistribution();
  loadHrCompletion();
  loadHrNeedsAttention();
  loadHrNegativeComments();
}

mountPageContent();
loadHrDashboard();
loadHrSentiment();
loadHrRatingDistribution();
loadHrPeriodStatus();
loadHrCompletion();
loadHrNeedsAttention();
loadHrNegativeComments();

initGlobalTermFilter(reloadHrDashboardData);

document
  .getElementById("hr-rating-distribution-type")
  ?.addEventListener("change", loadHrRatingDistribution);

document
  .getElementById("hr-rating-distribution-export-btn")
  ?.addEventListener("click", exportHrRatingDistribution);