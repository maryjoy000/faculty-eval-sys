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
    const stats = await apiGet("/evaluations/dashboard-stats");

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

async function loadSentimentData() {
  try {
    const data = await apiGet("/evaluations/dashboard-sentiment");

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

  new Chart(canvas, {
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
    const faculty = await apiGet("/evaluations/dashboard-top-faculty");

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

async function loadRecentEvaluations() {
  const container = document.getElementById("recent-evaluations-list");
  if (!container) return;

  try {
    const evaluations = await apiGet("/evaluations/dashboard-recent");

    if (!evaluations.length) {
      container.innerHTML = `<p class="text-gray-400">No evaluations yet.</p>`;
      return;
    }

    container.innerHTML = evaluations.map((evaluation) => {
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
  } catch (error) {
    console.error("Failed to load recent evaluations:", error);
    container.innerHTML =
      `<p class="text-gray-400">Unable to load recent evaluations.</p>`;
  }
}
// ============================================
// INITIALIZE DASHBOARD
// ============================================

mountPageContent();
renderStatCards();
loadFacultyCount();
loadEvaluationCompletion();
loadSentimentData();
loadTopRatedFaculty();
loadRecentEvaluations();
loadRecentActivityLog();

const academicYearDisplay = document.getElementById("academic-year-display");
if (academicYearDisplay) {
  academicYearDisplay.textContent = getAcademicYearDisplay();
}