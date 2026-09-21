// ============================================
// ANALYTICS AND SENTIMENT PAGE
// ============================================

function mountPageContent() {
  const template = document.getElementById("page-content-template");
  // Works for both shells: admin pages use #admin-page-content, HR pages
  // use #hr-page-content.
  const slot =
    document.getElementById("admin-page-content") ||
    document.getElementById("hr-page-content");

  if (template && slot) {
    slot.appendChild(template.content.cloneNode(true));
  }
}


const sentimentColors = {
  positive: "#16A34A",
  neutral: "#F59E0B",
  negative: "#DC2626"
};


let analyticsData = null;

let studentSentimentChart = null;
let peerSentimentChart = null;
let sentimentSourceChart = null;
let ratingSentimentChart = null;


// ============================================
// LOAD ANALYTICS
// ============================================

async function loadAnalytics() {
  try {
    analyticsData = await apiGet("/analytics/overview");

    renderStudentSentiment();
    renderPeerSentiment();
    renderSentimentBySource();
    renderRatingSentiment();
    renderFeedbackThemes();
    renderTestimonials();
    renderLatestComments();

  } catch (error) {
    console.error(
      "Failed to load analytics:",
      error
    );

    const containers = [
      "student-sentiment-legend",
      "peer-sentiment-legend",
      "feedback-themes-list",
      "key-testimonials-list",
      "latest-comments-list"
    ];

    containers.forEach((id) => {
      const container =
        document.getElementById(id);

      if (container) {
        container.innerHTML = `
          <p class="py-3 text-sm text-gray-400">
            Unable to load analytics data.
          </p>
        `;
      }
    });
  }
}


// ============================================
// SENTIMENT HELPERS
// ============================================

function getSentimentCounts(data) {
  return {
    Positive: Number(data?.counts?.Positive || 0),
    Neutral: Number(data?.counts?.Neutral || 0),
    Negative: Number(data?.counts?.Negative || 0)
  };
}


function renderSentimentLegend(
  legendId,
  sentimentData
) {
  const legend =
    document.getElementById(legendId);

  if (!legend) return;

  const counts =
    getSentimentCounts(sentimentData);

  const total =
    Number(sentimentData?.total_comments || 0);

  const percentage = (count) => {
    if (!total) return "0%";

    return `${((count / total) * 100).toFixed(1)}%`;
  };

  legend.innerHTML = `
    <span class="text-green-700">
      Positive ${counts.Positive}
      (${percentage(counts.Positive)})
    </span>

    <span class="text-gray-500">
      Neutral ${counts.Neutral}
      (${percentage(counts.Neutral)})
    </span>

    <span class="text-red-700">
      Negative ${counts.Negative}
      (${percentage(counts.Negative)})
    </span>
  `;
}


function createSentimentDonut(
  canvasId,
  legendId,
  sentimentData,
  existingChart
) {
  const canvas =
    document.getElementById(canvasId);

  if (!canvas) {
    return existingChart;
  }

  const counts =
    getSentimentCounts(sentimentData);

  if (existingChart) {
    existingChart.destroy();
  }

  const chart = new Chart(canvas, {
    type: "doughnut",

    data: {
      labels: [
        "Positive",
        "Neutral",
        "Negative"
      ],

      datasets: [
        {
          data: [
            counts.Positive,
            counts.Neutral,
            counts.Negative
          ],

          backgroundColor: [
            sentimentColors.positive,
            sentimentColors.neutral,
            sentimentColors.negative
          ],

          borderWidth: 0
        }
      ]
    },

    options: {
      responsive: true,

      maintainAspectRatio: true,

      plugins: {
        legend: {
          display: false
        }
      }
    }
  });

  renderSentimentLegend(
    legendId,
    sentimentData
  );

  return chart;
}


// ============================================
// STUDENT SENTIMENT
// ============================================

function renderStudentSentiment() {
  studentSentimentChart =
    createSentimentDonut(
      "student-sentiment-chart",
      "student-sentiment-legend",
      analyticsData?.student_sentiment,
      studentSentimentChart
    );
}


// ============================================
// PEER SENTIMENT
// ============================================

function renderPeerSentiment() {
  peerSentimentChart =
    createSentimentDonut(
      "peer-sentiment-chart",
      "peer-sentiment-legend",
      analyticsData?.peer_sentiment,
      peerSentimentChart
    );
}


// ============================================
// SENTIMENT BY SOURCE
// ============================================

function renderSentimentBySource() {
  const canvas =
    document.getElementById(
      "sentiment-source-chart"
    );

  if (!canvas || !analyticsData) return;

  if (sentimentSourceChart) {
    sentimentSourceChart.destroy();
  }

  const rows =
    analyticsData.sentiment_by_source || [];

  const sources =
    rows.map((row) => row.source);

  sentimentSourceChart = new Chart(canvas, {
    type: "bar",

    data: {
      labels: sources,

      datasets: [
        {
          label: "Positive",

          data: rows.map(
            (row) => Number(row.Positive || 0)
          ),

          backgroundColor:
            sentimentColors.positive
        },

        {
          label: "Neutral",

          data: rows.map(
            (row) => Number(row.Neutral || 0)
          ),

          backgroundColor:
            sentimentColors.neutral
        },

        {
          label: "Negative",

          data: rows.map(
            (row) => Number(row.Negative || 0)
          ),

          backgroundColor:
            sentimentColors.negative
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      },

      plugins: {
        legend: {
          position: "bottom"
        }
      }
    }
  });
}


// ============================================
// RATING VS SENTIMENT
// ============================================

function renderRatingSentiment() {
  const canvas =
    document.getElementById(
      "rating-sentiment-chart"
    );

  if (!canvas || !analyticsData) return;

  if (ratingSentimentChart) {
    ratingSentimentChart.destroy();
  }

  const rows =
    analyticsData.rating_sentiment || [];

  const labels = [
    "Positive",
    "Neutral",
    "Negative"
  ];

  const studentRows =
    rows.filter(
      (row) => row.source === "Student"
    );

  const peerRows =
    rows.filter(
      (row) => row.source === "Peer"
    );

  const getRating = (
    sourceRows,
    sentiment
  ) => {
    const row =
      sourceRows.find(
        (item) =>
          item.sentiment === sentiment
      );

    return row
      ? Number(row.average_rating || 0)
      : 0;
  };

  ratingSentimentChart = new Chart(canvas, {
    type: "bar",

    data: {
      labels,

      datasets: [
        {
          label: "Student",

          data: labels.map(
            (sentiment) =>
              getRating(
                studentRows,
                sentiment
              )
          ),

          backgroundColor:
            "#2563EB"
        },

        {
          label: "Peer",

          data: labels.map(
            (sentiment) =>
              getRating(
                peerRows,
                sentiment
              )
          ),

          backgroundColor:
            "#7C3AED"
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      scales: {
        y: {
          beginAtZero: true,
          max: 5,

          ticks: {
            stepSize: 1
          }
        }
      },

      plugins: {
        legend: {
          position: "bottom"
        }
      }
    }
  });
}


// ============================================
// FEEDBACK THEMES
// ============================================

function renderFeedbackThemes() {
  const container =
    document.getElementById(
      "feedback-themes-list"
    );

  if (!container) return;

  const themes =
    analyticsData?.common_themes || [];

  if (!themes.length) {
    container.innerHTML = `
      <div class="py-3 text-sm text-gray-400">
        No recurring feedback themes found.
      </div>
    `;

    return;
  }

  container.innerHTML =
    themes.map(
      (item) => `
        <div class="py-3 flex items-center justify-between gap-4">
          <span class="text-sm text-gray-700">
            ${escapeHtml(item.theme)}
          </span>

          <span class="text-sm font-semibold text-gray-800">
            ${Number(item.mentions || 0)}
          </span>
        </div>
      `
    ).join("");
}


// ============================================
// TESTIMONIALS
// ============================================

function renderTestimonials() {
  const container =
    document.getElementById(
      "key-testimonials-list"
    );

  if (!container) return;

  const testimonials =
    analyticsData?.key_testimonials || [];

  if (!testimonials.length) {
    container.innerHTML = `
      <div class="text-sm text-gray-400">
        No testimonials yet.
      </div>
    `;

    return;
  }

  container.innerHTML =
    testimonials.map(
      (item) => `
        <div class="border border-gray-100 rounded-lg p-4">

          <p class="text-sm text-gray-700 leading-relaxed">
            “${escapeHtml(item.text)}”
          </p>

          <div class="flex items-center gap-3 mt-3 text-xs">

            <span class="font-medium text-gray-500">
              ${escapeHtml(item.source || "Unknown")}
            </span>

            <span class="${
              getSentimentTextClass(
                item.sentiment
              )
            } font-medium">
              ${escapeHtml(item.sentiment || "Unknown")}
            </span>

          </div>

        </div>
      `
    ).join("");
}


// ============================================
// LATEST COMMENTS
// ============================================

function renderLatestComments() {
  const container =
    document.getElementById(
      "latest-comments-list"
    );

  if (!container) return;

  const comments =
    analyticsData?.latest_comments || [];

  if (!comments.length) {
    container.innerHTML = `
      <div class="py-3 text-sm text-gray-400">
        No comments yet.
      </div>
    `;

    return;
  }

  container.innerHTML =
    comments.map(
      (item) => `
        <div class="py-4">

          <p class="text-sm text-gray-700 leading-relaxed">
            ${escapeHtml(item.text)}
          </p>

          <div class="flex flex-wrap items-center gap-3 mt-2 text-xs">

            <span class="font-medium text-gray-600">
              Source: ${escapeHtml(item.source || "Unknown")}
            </span>

            <span class="${getSentimentTextClass(item.sentiment)} font-medium">
              Sentiment: ${escapeHtml(item.sentiment || "Unknown")}
            </span>

            ${
              item.submitted_at
                ? `
                  <span class="text-gray-400">
                    ${formatDate(item.submitted_at)}
                  </span>
                `
                : ""
            }

          </div>

        </div>
      `
    ).join("");
}


// ============================================
// HELPERS
// ============================================

function getSentimentTextClass(sentiment) {
  if (sentiment === "Positive") {
    return "text-green-700";
  }

  if (sentiment === "Negative") {
    return "text-red-700";
  }

  return "text-gray-500";
}


function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }
  );
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ============================================
// START
// ============================================

mountPageContent();
loadAnalytics();