// ============================================
// FACULTY: MY EVALUATION PAGE
// ============================================

// ============================================
// EXPORT MY EVALUATION (PDF through the browser's "Save as PDF")
// ============================================
// Builds a print-only copy of the faculty member's CURRENT-TERM results
// (the server only ever returns the open term to faculty), including every
// comment, then opens the print dialog. Everything else on the page is hidden
// while printing.

const EXPORT_COMMENT_PAGE_SIZE = 50;
const EXPORT_MAX_COMMENT_PAGES = 200;

const FX_CELL = "border:1px solid #9CA3AF;padding:2px 6px;font-size:10px;";

function exportEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Plain, escaped text: <br> and line breaks become the given separator.
function exportText(value, separator = " ") {
  return exportEscape(
    String(value ?? "")
      .replace(/<br\s*\/?>/gi, separator)
      .replace(/\s*\n\s*/g, separator)
      .trim()
  );
}

function exportScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(2);
}

function exportIs404(error) {
  return error?.status === 404 || String(error?.message || "").includes("404");
}

async function exportOptional(load) {
  try {
    return await load();
  } catch (error) {
    if (exportIs404(error)) return null;
    throw error;
  }
}

// Student and peer comments are paginated by the server (max 50 per page);
// the export needs all of them, so walk every page.
async function exportFetchWithAllComments(endpoint) {
  const urlFor = (page) =>
    `${endpoint}?comment_page=${page}&comment_per_page=${EXPORT_COMMENT_PAGE_SIZE}`;

  const first = await apiGet(urlFor(1));
  if (!first) return null;

  const all = [...(first.comments || [])];
  const totalPages = Number(first.comments_pagination?.total_pages) || null;

  let page = 1;
  let lastBatch = first.comments || [];

  while (page < EXPORT_MAX_COMMENT_PAGES) {
    const done = totalPages
      ? page >= totalPages
      : lastBatch.length < EXPORT_COMMENT_PAGE_SIZE;
    if (done) break;

    page += 1;

    const next = await apiGet(urlFor(page));
    const batch = (next && next.comments) || [];
    if (!batch.length) break;

    // If the server ignored the page number, stop instead of looping.
    if (JSON.stringify(batch[0]) === JSON.stringify(lastBatch[0])) break;

    all.push(...batch);
    lastBatch = batch;
  }

  first.comments = all;
  return first;
}

async function exportLoadEquivalents(typeCode) {
  try {
    const scale = await apiGet(`/rating-scales/${typeCode}`);
    return scale && Array.isArray(scale.equivalents) ? scale.equivalents : [];
  } catch (error) {
    return [];
  }
}

function exportEquivalent(equivalents, average) {
  if (average === null || average === undefined) return "";
  const value = Number(average);
  const band = (equivalents || []).find(
    (entry) => value >= Number(entry.min) && value <= Number(entry.max)
  );
  return band ? String(band.label) : "";
}

function exportNormalizeComments(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((comment) => {
      const text = typeof comment === "string" ? comment : comment?.text ?? "";
      const label =
        typeof comment === "object" && comment?.sentiment
          ? String(comment.sentiment).toLowerCase()
          : "";

      return {
        text: String(text).trim(),
        sentiment:
          label === "positive" ? "Positive" : label === "negative" ? "Negative" : "Neutral"
      };
    })
    .filter((comment) => comment.text);
}

function exportSentimentCounts(backendSentiment, comments) {
  const fromBackend = backendSentiment && backendSentiment.counts;

  if (fromBackend) {
    const counts = {
      Positive: Number(fromBackend.Positive || 0),
      Neutral: Number(fromBackend.Neutral || 0),
      Negative: Number(fromBackend.Negative || 0)
    };

    // Only trust the backend when it covers every comment we have.
    if (counts.Positive + counts.Neutral + counts.Negative >= comments.length) {
      return counts;
    }
  }

  const counts = { Positive: 0, Neutral: 0, Negative: 0 };
  comments.forEach((comment) => {
    counts[comment.sentiment] += 1;
  });
  return counts;
}

function exportHeading(text) {
  return `<p style="font-size:12px;font-weight:700;color:#1F2937;margin:10px 0 4px;">${exportEscape(text)}</p>`;
}

function exportDomainTable(domains) {
  const rows = (domains || [])
    .map((domain) => {
      const indicators = (domain.indicators || [])
        .map(
          (indicator, index) => `
            <tr>
              <td style="${FX_CELL}text-align:center;width:28px;">${index + 1}</td>
              <td style="${FX_CELL}">${exportText(indicator.text, " ")}</td>
              <td style="${FX_CELL}text-align:center;width:70px;">${exportScore(indicator.average)}</td>
            </tr>`
        )
        .join("");

      return `
        <tr style="background:#374151;color:#fff;break-inside:avoid;">
          <td colspan="2" style="${FX_CELL}font-weight:700;">${exportText(domain.title, " — ")}</td>
          <td style="${FX_CELL}text-align:center;font-weight:700;">${exportScore(domain.average)}</td>
        </tr>${indicators}`;
    })
    .join("");

  return `<table style="width:100%;border-collapse:collapse;margin-bottom:6px;"><tbody>${rows}</tbody></table>`;
}

function exportClassroomTable(domains) {
  const rows = (domains || [])
    .map((domain) => {
      const indicators = (domain.indicators || [])
        .map(
          (indicator, index) => `
            <tr>
              <td style="${FX_CELL}text-align:center;width:28px;">${index + 1}</td>
              <td style="${FX_CELL}">${exportText(indicator.text, " ")}</td>
              <td style="${FX_CELL}text-align:center;width:50px;">${exportEscape(indicator.hcec ?? "—")}</td>
              <td style="${FX_CELL}text-align:center;width:50px;">${exportEscape(indicator.cot ?? "—")}</td>
              <td style="${FX_CELL}text-align:center;width:90px;">${exportEscape(indicator.level ?? "—")}</td>
            </tr>`
        )
        .join("");

      return `
        <tr style="background:#374151;color:#fff;">
          <td colspan="2" style="${FX_CELL}font-weight:700;">${exportText(domain.title, " — ")} (${exportScore(domain.average)})</td>
          <td style="${FX_CELL}text-align:center;font-weight:700;">HCEC</td>
          <td style="${FX_CELL}text-align:center;font-weight:700;">COT</td>
          <td style="${FX_CELL}text-align:center;font-weight:700;">Level</td>
        </tr>${indicators}`;
    })
    .join("");

  return `<table style="width:100%;border-collapse:collapse;margin-bottom:6px;"><tbody>${rows}</tbody></table>`;
}

function exportSentimentSummary(counts, total) {
  const pct = (n) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "—");
  const head = `${FX_CELL}text-align:center;font-weight:700;background:#E5E7EB;`;
  const cell = (color) => `${FX_CELL}text-align:center;color:${color};`;

  return `
    <div style="break-inside:avoid;margin:8px 0;">
      <p style="font-size:10px;font-weight:700;color:#374151;margin:0 0 3px;">
        Overall Comments Sentiment Result (${total} comment${total === 1 ? "" : "s"})
      </p>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th style="${head}">Positive</th><th style="${head}">Neutral</th><th style="${head}">Negative</th>
        </tr></thead>
        <tbody><tr>
          <td style="${cell("#15803D")}">${counts.Positive} (${pct(counts.Positive)})</td>
          <td style="${cell("#4B5563")}">${counts.Neutral} (${pct(counts.Neutral)})</td>
          <td style="${cell("#B91C1C")}">${counts.Negative} (${pct(counts.Negative)})</td>
        </tr></tbody>
      </table>
    </div>`;
}

function exportCommentsList(title, comments) {
  const color = (label) =>
    label === "Positive" ? "#15803D" : label === "Negative" ? "#B91C1C" : "#6B7280";

  const body = comments.length
    ? comments
        .map(
          (comment, index) => `
            <div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px solid #E5E7EB;break-inside:avoid;">
              <p style="font-size:10px;color:#374151;flex:1;margin:0;">${index + 1}. ${exportEscape(comment.text)}</p>
              <span style="font-size:9px;font-weight:700;color:${color(comment.sentiment)};white-space:nowrap;">${comment.sentiment}</span>
            </div>`
        )
        .join("")
    : `<p style="font-size:10px;color:#9CA3AF;font-style:italic;">No comments were submitted.</p>`;

  return `${exportHeading(title)}${body}`;
}

function exportSection({ title, subtitle, body, breakBefore = true }) {
  return `
    <section style="${breakBefore ? "break-before:page;" : ""}">
      <h2 style="font-size:14px;font-weight:700;color:#111827;margin:0 0 2px;">${exportEscape(title)}</h2>
      ${subtitle ? `<p style="font-size:10px;color:#6B7280;margin:0 0 6px;">${exportEscape(subtitle)}</p>` : ""}
      ${body}
    </section>`;
}

function exportNoData(label) {
  return `<p style="font-size:11px;color:#6B7280;font-style:italic;">No ${exportEscape(label)} results are available for this term yet.</p>`;
}

function buildExportHtml({ facultyName, summary, student, peer, hr, classroom, equivalents }) {
  const termLabel = summary?.term?.label || "";
  const perType = summary?.per_type || {};
  const generated = new Date().toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric"
  });

  const overallPct = summary?.weighted_overall_pct;
  const hasOverall = overallPct !== null && overallPct !== undefined;

  const typeRows = [
    ["Classroom Observation", "classroomObservation"],
    ["Student Evaluation", "student"],
    ["Peer-to-Peer Evaluation", "peerToPeer"],
    ["HR Evaluation", "hrEvaluation"]
  ]
    .map(([label, key]) => {
      const data = perType[key] || {};
      const has = (data.count ?? 0) > 0 && data.average_rating !== null && data.average_rating !== undefined;

      return `
        <tr>
          <td style="${FX_CELL}">${label}</td>
          <td style="${FX_CELL}text-align:center;">${data.count ?? 0}</td>
          <td style="${FX_CELL}text-align:center;">${has ? exportScore(data.average_rating) : "—"}</td>
          <td style="${FX_CELL}text-align:center;">${has ? exportEscape(exportEquivalent(equivalents[key], data.average_rating)) : ""}</td>
        </tr>`;
    })
    .join("");

  const head = `${FX_CELL}text-align:center;font-weight:700;background:#E5E7EB;`;

  const summaryHtml = `
    <section>
      <div style="display:flex;align-items:center;justify-content:center;gap:12px;text-align:center;margin-bottom:8px;">
        <img src="../../assets/images/school-logo.jpg" alt="" style="width:48px;height:48px;object-fit:contain;">
        <div>
          <p style="font-size:14px;font-weight:700;color:#1F2937;margin:0;">HEADWATERS COLLEGE – ELIZABETH CAMPUS</p>
          <p style="font-size:12px;font-weight:700;color:#1F2937;margin:0;">TEACHER PERFORMANCE EVALUATION TOOL</p>
          <p style="font-size:9px;font-style:italic;color:#6B7280;margin:0;">Based on the Philippine Professional Standards for Teachers</p>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px;">
        <span><strong>Full Name:</strong> ${exportEscape(facultyName)}</span>
        <span>${termLabel ? `<strong>Term:</strong> ${exportEscape(termLabel)}` : ""}</span>
      </div>

      <h2 style="font-size:14px;font-weight:700;color:#111827;margin:0 0 4px;">Evaluation Summary</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
        <thead><tr>
          <th style="${head}text-align:left;">Evaluation</th>
          <th style="${head}">Submissions</th>
          <th style="${head}">Average (1–5)</th>
          <th style="${head}">Remarks</th>
        </tr></thead>
        <tbody>${typeRows}</tbody>
      </table>
      <p style="font-size:12px;font-weight:700;color:#111827;">
        Overall Rating: ${hasOverall ? `${(Number(overallPct) / 20).toFixed(2)} (${Number(overallPct).toFixed(2)}%)` : "N/A"}
      </p>
      <p style="font-size:9px;color:#6B7280;margin-top:10px;">Generated on ${exportEscape(generated)}. Results are for the current term only and may change until the evaluation period closes.</p>
    </section>`;

  const studentComments = exportNormalizeComments(student?.comments);
  const studentCounts = exportSentimentCounts(student?.sentiment, studentComments);
  const studentHtml = exportSection({
    title: "Student Evaluation",
    subtitle: student ? `Based on ${student.submission_count ?? 0} student submission(s). Average: ${exportScore(student.average_rating)}` : "",
    body: student
      ? exportDomainTable(student.domains) +
        exportSentimentSummary(studentCounts, studentCounts.Positive + studentCounts.Neutral + studentCounts.Negative) +
        exportCommentsList("Student Comments (Anonymous)", studentComments)
      : exportNoData("student evaluation")
  });

  const peerComments = exportNormalizeComments(peer?.comments);
  const peerCounts = exportSentimentCounts(peer?.sentiment, peerComments);
  const peerHtml = exportSection({
    title: "Peer-to-Peer Evaluation",
    subtitle: peer ? `Based on ${peer.submission_count ?? 0} peer submission(s). Average: ${exportScore(peer.average_rating ?? peer.overall_average)}` : "",
    body: peer
      ? exportDomainTable(peer.domains) +
        exportSentimentSummary(peerCounts, peerCounts.Positive + peerCounts.Neutral + peerCounts.Negative) +
        exportCommentsList("Peer Comments", peerComments)
      : exportNoData("peer-to-peer evaluation")
  });

  const classroomHtml = exportSection({
    title: "Classroom Observation",
    subtitle: classroom ? `Overall: ${exportScore(classroom.overall_average)}` : "",
    body: classroom ? exportClassroomTable(classroom.domains) : exportNoData("classroom observation")
  });

  const hrComments = exportNormalizeComments(hr?.comments);
  const hrCounts = exportSentimentCounts(null, hrComments);
  const hrHtml = exportSection({
    title: "HR Evaluation",
    subtitle: hr ? `Based on ${hr.evaluation_count ?? 0} HR evaluation(s)` : "",
    body: hr
      ? exportDomainTable(hr.domains) +
        exportSentimentSummary(hrCounts, hrCounts.Positive + hrCounts.Neutral + hrCounts.Negative) +
        exportCommentsList("HR Comments", hrComments)
      : exportNoData("HR evaluation")
  });

  return summaryHtml + studentHtml + peerHtml + classroomHtml + hrHtml;
}

function ensureExportRoot() {
  if (!document.getElementById("faculty-export-style")) {
    const style = document.createElement("style");
    style.id = "faculty-export-style";
    style.textContent = `
      #faculty-export-root { display: none; }
      @media print {
        @page { margin: 1cm; }
        body > *:not(#faculty-export-root) { display: none !important; }
        #faculty-export-root { display: block !important; font-family: inherit; color: #111827; }
        body { background: #fff !important; }
      }
    `;
    document.head.appendChild(style);
  }

  let root = document.getElementById("faculty-export-root");

  if (!root) {
    root = document.createElement("div");
    root.id = "faculty-export-root";
    document.body.appendChild(root);
  }

  return root;
}

async function exportMyEvaluation(facultyId, facultyName, summary, button) {
  const originalLabel = button ? button.textContent : "";

  if (button) {
    button.disabled = true;
    button.textContent = "Preparing...";
  }

  try {
    const [student, peer, hr, classroom, studentBands, peerBands, classroomBands, hrBands] =
      await Promise.all([
        exportOptional(() => exportFetchWithAllComments(`/evaluations/${facultyId}/student-breakdown`)),
        exportOptional(() => exportFetchWithAllComments(`/evaluations/${facultyId}/peer-breakdown`)),
        exportOptional(() => apiGet(`/evaluations/${facultyId}/hr-breakdown`)),
        exportOptional(() => apiGet(`/evaluations/${facultyId}/classroom-breakdown`)),
        exportLoadEquivalents("student"),
        exportLoadEquivalents("peerToPeer"),
        exportLoadEquivalents("classroomObservation"),
        exportLoadEquivalents("hrEvaluation")
      ]);

    const root = ensureExportRoot();

    root.innerHTML = buildExportHtml({
      facultyName,
      summary,
      student,
      peer,
      hr,
      classroom,
      equivalents: {
        student: studentBands,
        peerToPeer: peerBands,
        classroomObservation: classroomBands,
        hrEvaluation: hrBands
      }
    });

    // Let the logo finish loading so it appears in the PDF.
    await Promise.all(
      [...root.querySelectorAll("img")].map((image) =>
        image.complete
          ? null
          : new Promise((resolve) => {
              image.onload = image.onerror = resolve;
            })
      )
    );

    window.print();
  } catch (error) {
    console.error("Failed to prepare evaluation export:", error);
    alert("Could not prepare your export. Please try again.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
}

async function renderContent() {
  const container = document.getElementById("my-evaluation-content");

  try {
    const currentUser = await apiGet("/auth/me");

    if (!currentUser.linked_faculty_id) {
      container.innerHTML = `
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
          <p class="text-gray-500">
            Your faculty account is not linked to a faculty record yet.
          </p>
        </div>
      `;
      return;
    }

    const facultyId = currentUser.linked_faculty_id;

    try {
      // The server limits faculty to the current open term.
      const evaluationData = await apiGet(`/evaluations/${facultyId}`);

      let classroomData = null;

      try {
        classroomData = await apiGet(
          `/evaluations/${facultyId}/classroom-breakdown`,
        );
      } catch (error) {
        if (error?.status !== 404) {
          throw error;
        }
      }

      container.innerHTML = `
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6">

          <div class="flex flex-wrap items-center justify-between gap-3 mb-1">
            <h2 class="text-xl font-bold text-gray-800">
              ${currentUser.name}
            </h2>

            <button
              type="button"
              id="export-evaluation-btn"
              class="btn-secondary text-sm"
            >
              Export PDF
            </button>
          </div>

          <p class="text-xs text-gray-500 mb-4">
            ${evaluationData.term?.label ? `Results for ${exportEscape(evaluationData.term.label)}. ` : ""}These may change until the evaluation period closes.
          </p>

          <!-- Evaluation Tabs -->
          <div class="flex flex-wrap gap-2 border-b border-gray-200 pb-3 mb-6">
            <button
              type="button"
              class="evaluation-tab btn-primary text-sm"
              data-tab="overall"
            >
              Overall
            </button>

            <button
              type="button"
              class="evaluation-tab btn-secondary text-sm"
              data-tab="student"
            >
              Student Evaluation
            </button>

            <button
              type="button"
              class="evaluation-tab btn-secondary text-sm"
              data-tab="peer"
            >
              Peer-to-Peer
            </button>

            <button
              type="button"
              class="evaluation-tab btn-secondary text-sm"
              data-tab="classroom"
            >
              Classroom Observation
            </button>

            <button
              type="button"
              class="evaluation-tab btn-secondary text-sm"
              data-tab="hr"
            >
              HR Evaluation
            </button>
          </div>

          <!-- Tab Content -->
          <div id="evaluation-tab-content"></div>

        </div>
      `;

      document
        .getElementById("export-evaluation-btn")
        ?.addEventListener("click", (event) => {
          exportMyEvaluation(
            facultyId,
            currentUser.name,
            evaluationData,
            event.currentTarget,
          );
        });

      const tabContent = document.getElementById("evaluation-tab-content");
      const tabButtons = document.querySelectorAll(".evaluation-tab");

      function setActiveTab(tabName) {
        tabButtons.forEach((button) => {
          const isActive = button.dataset.tab === tabName;

          button.classList.toggle("btn-primary", isActive);
          button.classList.toggle("btn-secondary", !isActive);
        });

        if (tabName === "overall") {
          renderOverallTab();
        } else if (tabName === "classroom") {
          renderClassroomTab();
        } else if (tabName === "student") {
          renderStudentTab();
        } else if (tabName === "peer") {
          renderPeerTab();
        } else if (tabName === "hr") {
          renderHrTab();
        }
      }

      function renderOverallTab() {
        tabContent.innerHTML = `
          <div class="space-y-6">

            <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p class="text-sm text-gray-500">
                Overall Evaluation
              </p>

              <p class="text-3xl font-bold text-brand mt-1">
                ${
                  evaluationData.weighted_overall_pct !== null
                    ? `${evaluationData.weighted_overall_pct}%`
                    : "N/A"
                }
              </p>
            </div>

            <div>
              <h3 class="font-semibold text-gray-800 mb-2">
                Evaluation Results
              </h3>

              <div class="border border-gray-200 rounded-lg overflow-hidden">
                ${Object.entries(evaluationData.per_type)
                  .map(
                    ([type, data]) => `
                      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0">

                        <div>
                          <p class="font-medium text-gray-800">
                            ${
                              type === "student"
                                ? "Student Evaluation"
                                : type === "peerToPeer"
                                  ? "Peer-to-Peer Evaluation"
                                  : type === "classroomObservation"
                                    ? "Classroom Observation"
                                    : "HR Evaluation"
                            }
                          </p>

                          <p class="text-xs text-gray-500">
                            ${data.count}
                            evaluation${data.count === 1 ? "" : "s"}
                          </p>
                        </div>

                        <span class="font-semibold text-gray-800">
                          ${
                            data.average_rating_pct !== null
                              ? `${data.average_rating_pct}%`
                              : "N/A"
                          }
                        </span>

                      </div>
                    `,
                  )
                  .join("")}
              </div>
            </div>

          </div>
        `;
      }

      function escapeHtml(value) {
          const div = document.createElement("div");
          div.textContent = value ?? "";
          return div.innerHTML;
      }

      function formatCommentDate(value) {
          if (!value) return "";

          const date = new Date(value);

          if (Number.isNaN(date.getTime())) {
              return value;
          }

          return date.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
          });
      }

      function sentimentBadge(sentiment) {
          if (!sentiment) return "";

          const normalized = String(sentiment).toLowerCase();

          let classes =
              "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium";

          if (normalized === "positive") {
              classes += " bg-green-100 text-green-700";
          } else if (normalized === "negative") {
              classes += " bg-red-100 text-red-700";
          } else {
              classes += " bg-gray-100 text-gray-700";
          }

          return `
              <span class="${classes}">
                  ${escapeHtml(sentiment)}
              </span>
          `;
      }

      function renderCommentsSection({
          title,
          comments,
          pagination,
          emptyMessage = "No comments were submitted.",
      }) {
          const total = pagination?.total ?? 0;
          const page = pagination?.page ?? 1;
          const perPage = pagination?.per_page ?? 10;
          const totalPages = pagination?.total_pages ?? 0;

          if (!total) {
              return `
                  <div class="mt-8 border-t border-gray-200 pt-6">
                      <h3 class="font-semibold text-gray-800 mb-3">
                          ${escapeHtml(title)}
                      </h3>

                      <div class="bg-gray-50 border border-gray-200 rounded-lg p-5 text-center">
                          <p class="text-sm text-gray-500">
                              ${escapeHtml(emptyMessage)}
                          </p>
                      </div>
                  </div>
              `;
          }

          const start = (page - 1) * perPage + 1;
          const end = Math.min(page * perPage, total);

          const commentCards = (comments || [])
              .map((comment) => `
                  <div class="border border-gray-200 rounded-lg p-4 bg-white">
                      <p class="text-sm text-gray-700 whitespace-pre-wrap">
                          ${escapeHtml(comment.text)}
                      </p>

                      <div class="flex flex-wrap items-center gap-2 mt-3">
                          ${sentimentBadge(comment.sentiment)}

                          ${
                              comment.submitted_at
                                  ? `
                                      <span class="text-xs text-gray-400">
                                          ${formatCommentDate(comment.submitted_at)}
                                      </span>
                                  `
                                  : ""
                          }
                      </div>
                  </div>
              `)
              .join("");

          let pageButtons = "";

          if (totalPages > 1) {
              const buttons = [];

              if (page > 1) {
                  buttons.push(`
                      <button
                          type="button"
                          class="comment-page-btn btn-secondary text-xs"
                          data-page="${page - 1}">
                          Previous
                      </button>
                  `);
              }

              const maxVisiblePages = 5;

              let startPage = Math.max(
                  1,
                  page - Math.floor(maxVisiblePages / 2)
              );

              let endPage = Math.min(
                  totalPages,
                  startPage + maxVisiblePages - 1
              );

              if (endPage - startPage + 1 < maxVisiblePages) {
                  startPage = Math.max(
                      1,
                      endPage - maxVisiblePages + 1
                  );
              }

              for (
                  let pageNumber = startPage;
                  pageNumber <= endPage;
                  pageNumber++
              ) {
                  buttons.push(`
                      <button
                          type="button"
                          class="comment-page-btn ${
                              pageNumber === page
                                  ? "btn-primary"
                                  : "btn-secondary"
                          } text-xs min-w-[34px]"
                          data-page="${pageNumber}">
                          ${pageNumber}
                      </button>
                  `);
              }

              if (page < totalPages) {
                  buttons.push(`
                      <button
                          type="button"
                          class="comment-page-btn btn-secondary text-xs"
                          data-page="${page + 1}">
                          Next
                      </button>
                  `);
              }

              pageButtons = `
                  <div class="flex flex-wrap items-center justify-between gap-3 mt-4">
                      <p class="text-xs text-gray-500">
                          Showing ${start}–${end} of ${total} comments
                      </p>

                      <div class="flex flex-wrap gap-1">
                          ${buttons.join("")}
                      </div>
                  </div>
              `;
          } else {
              pageButtons = `
                  <p class="text-xs text-gray-500 mt-4">
                      Showing ${total} comment${total === 1 ? "" : "s"}
                  </p>
              `;
          }

          return `
              <div class="mt-8 border-t border-gray-200 pt-6">

                  <div class="flex items-center justify-between mb-3">
                      <h3 class="font-semibold text-gray-800">
                          ${escapeHtml(title)}
                      </h3>

                      <span class="text-xs text-gray-500">
                          ${total} total
                      </span>
                  </div>

                  <div class="space-y-3">
                      ${commentCards}
                  </div>

                  ${pageButtons}

              </div>
          `;
      }

      async function renderStudentTab(commentPage = 1) {
        tabContent.innerHTML = `
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
            <p class="text-gray-500">Loading student evaluation results...</p>
          </div>
        `;

        try {
          const studentData = await apiGet(
            `/evaluations/${facultyId}/student-breakdown?comment_page=${commentPage}&comment_per_page=10`,
          );

          const evaluationCount = Number(studentData.submission_count ?? 0);

          tabContent.innerHTML = `
            <div>
              <h3 class="font-semibold text-gray-800 mb-2">
                Student Evaluation Breakdown
              </h3>

              <p class="text-sm text-gray-500 mb-4">
                Based on ${evaluationCount} student evaluation${evaluationCount === 1 ? "" : "s"}.
              </p>

              <div class="space-y-3">
                ${(studentData.domains || []).map((domain) => `
                  <div class="border border-gray-200 rounded-lg overflow-hidden">

                    <div class="px-4 py-3 bg-gray-50 flex items-center justify-between">
                      <span class="font-medium text-gray-800">
                        ${domain.part_number}. ${domain.title}
                      </span>

                      <span class="font-semibold text-gray-800">
                        ${
                          domain.average !== null &&
                          domain.average !== undefined
                            ? Number(domain.average).toFixed(2)
                            : "N/A"
                        }
                      </span>
                    </div>

                    <div class="overflow-x-auto">
                      <table class="w-full text-sm">

                        <thead>
                          <tr class="border-t border-gray-200 text-gray-500">
                            <th class="text-left px-4 py-2 font-medium">
                                
                            </th>

                            <th class="text-center px-4 py-2 font-medium">
                              Average
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          ${(domain.indicators || []).map((indicator) => `
                            <tr class="border-t border-gray-100">

                              <td class="px-4 py-2">
                                ${String(indicator.text || "").replace(/<br\s*\/?>/gi, "<br>")}
                              </td>

                              <td class="text-center px-4 py-2 font-semibold">
                                ${
                                  indicator.average !== null &&
                                  indicator.average !== undefined
                                    ? Number(indicator.average).toFixed(2)
                                    : "N/A"
                                }
                              </td>

                            </tr>
                          `).join("")}
                        </tbody>

                      </table>
                    </div>

                  </div>
                `).join("")}
              </div>
              ${renderCommentsSection({
                title: "Student Comments",
                comments: studentData.comments,
                pagination: studentData.comments_pagination,
              })}
            </div>
          `;
          tabContent
            .querySelectorAll(".comment-page-btn")
            .forEach((button) => {
              button.addEventListener("click", () => {
                renderStudentTab(Number(button.dataset.page));
              });
            });
        } catch (error) {
          console.error("Failed to load student evaluation:", error);

          tabContent.innerHTML = `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
              <p class="text-gray-500">
                No student evaluation results are available.
              </p>
            </div>
          `;
        }
      }


      async function renderPeerTab(commentPage = 1) {
        tabContent.innerHTML = `
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
            <p class="text-gray-500">
              Loading peer-to-peer evaluation results...
            </p>
          </div>
        `;

        try {
          const peerData = await apiGet(
            `/evaluations/${facultyId}/peer-breakdown?comment_page=${commentPage}&comment_per_page=10`
          );

          const evaluationCount = Number(peerData.submission_count ?? 0);

          tabContent.innerHTML = `
            <div>

              <h3 class="font-semibold text-gray-800 mb-2">
                Peer-to-Peer Evaluation Breakdown
              </h3>

              <p class="text-sm text-gray-500 mb-4">
                Based on ${evaluationCount} peer evaluation${evaluationCount === 1 ? "" : "s"}.
              </p>

              <div class="space-y-3">

                ${(peerData.domains || []).map((domain) => `
                  <div class="border border-gray-200 rounded-lg overflow-hidden">

                    <div class="px-4 py-3 bg-gray-50 flex items-center justify-between">

                      <span class="font-medium text-gray-800">
                        ${domain.part_number}. ${domain.title}
                      </span>

                      
                      <span class="font-semibold text-gray-800">
                        ${
                          domain.average !== null &&
                          domain.average !== undefined
                            ? Number(domain.average).toFixed(2)
                            : "N/A"
                        }
                      </span>

                    </div>

                    <div class="overflow-x-auto">

                      <table class="w-full text-sm">

                        <thead>
                          <tr class="border-t border-gray-200 text-gray-500">
                            <th class="text-left px-4 py-2 font-medium">
                                
                            </th>

                            <th class="text-right px-4 py-2 font-medium">
                              Average
                            </th>

                          </tr>
                        </thead>

                        <tbody>

                          ${(domain.indicators || []).map((indicator) => `
                            <tr class="border-t border-gray-100">

                              <td class="px-4 py-2">
                                ${String(indicator.text || "")
                                  .replace(/<br\s*\/?>/gi, "<br>")
                                  .split(/\r?\n/)
                                  .filter(line => line.trim())
                                  .map(line => `<div>${line.trim()}</div>`)
                                  .join("")}
                              </td>
                              <td class="text-center px-4 py-2 font-semibold">
                                ${
                                  indicator.average !== null &&
                                  indicator.average !== undefined
                                    ? Number(indicator.average).toFixed(2)
                                    : "N/A"
                                }
                              </td>

                            </tr>
                          `).join("")}

                        </tbody>

                      </table>

                    </div>

                  </div>
                `).join("")}

              </div>
              ${renderCommentsSection({
                  title: "Peer-to-Peer Comments",
                  comments: peerData.comments,
                  pagination: peerData.comments_pagination,
              })}
            </div>
          `;
          tabContent
            .querySelectorAll(".comment-page-btn")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    renderPeerTab(Number(button.dataset.page));
                });
            });
        } catch (error) {
          console.error("Failed to load peer evaluation:", error);

          tabContent.innerHTML = `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
              <p class="text-gray-500">
                No peer-to-peer evaluation results are available.
              </p>
            </div>
          `;
        }
      }

      async function renderHrTab() {
        tabContent.innerHTML = `
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
            <p class="text-gray-500">Loading HR evaluation results...</p>
          </div>
        `;

        try {
          const hrData = await apiGet(
            `/evaluations/${facultyId}/hr-breakdown`
          );

          tabContent.innerHTML = `
            <div>
              <h3 class="font-semibold text-gray-800 mb-2">
                HR Evaluation Breakdown
              </h3>

              <p class="text-sm text-gray-500 mb-4">
                Based on ${hrData.evaluation_count} HR evaluation${hrData.evaluation_count === 1 ? "" : "s"}.
              </p>

              <div class="space-y-3">
                ${hrData.domains.map((domain) => `
                  <div class="border border-gray-200 rounded-lg overflow-hidden">
                    <div class="px-4 py-3 bg-gray-50 flex items-center justify-between">
                      <span class="font-medium text-gray-800">
                        ${domain.part_number}. ${domain.title}
                      </span>

                      <span class="font-semibold text-gray-800">
                        ${domain.average !== null ? domain.average.toFixed(2) : "N/A"}
                      </span>
                    </div>

                    <div class="overflow-x-auto">
                      <table class="w-full text-sm">
                        <thead>
                          <tr class="border-t border-gray-200 text-gray-500">
                            <th class="text-left px-4 py-2 font-medium">  </th>
                            <th class="text-center px-4 py-2 font-medium">Average</th>
                          </tr>
                        </thead>

                        <tbody>
                          ${domain.indicators.map((indicator) => `
                            <tr class="border-t border-gray-100">
                              <td class="px-4 py-2">
                                ${indicator.indicator_number}. ${indicator.text}
                              </td>

                              <td class="text-center px-4 py-2 font-semibold">
                                ${indicator.average.toFixed(2)}
                              </td>
                            </tr>
                          `).join("")}
                        </tbody>
                      </table>
                    </div>
                  </div>
                `).join("")}
              </div>
              <div class="mt-8 border-t border-gray-200 pt-6">

                  <h3 class="font-semibold text-gray-800 mb-3">
                      HR Comment
                  </h3>

                  ${
                      hrData.comments && hrData.comments.length
                          ? hrData.comments.map((comment) => `
                              <div class="border border-gray-200 rounded-lg p-4 bg-white">

                                  <p class="text-sm text-gray-700 whitespace-pre-wrap">
                                      ${escapeHtml(comment.text)}
                                  </p>

                                  <div class="flex flex-wrap items-center gap-2 mt-3">
                                      ${sentimentBadge(comment.sentiment)}

                                      ${
                                          comment.submitted_at
                                              ? `
                                                  <span class="text-xs text-gray-400">
                                                      ${formatCommentDate(comment.submitted_at)}
                                                  </span>
                                              `
                                              : ""
                                      }
                                  </div>

                              </div>
                          `).join("")
                          : `
                              <div class="bg-gray-50 border border-gray-200 rounded-lg p-5 text-center">
                                  <p class="text-sm text-gray-500">
                                      No HR comment is available.
                                  </p>
                              </div>
                          `
                  }

              </div>
            </div>
          `;
        } catch (error) {
          console.error("Failed to load HR evaluation:", error);

          tabContent.innerHTML = `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
              <p class="text-gray-500">
                No HR evaluation results are available.
              </p>
            </div>
          `;
        }
      }
      
      function renderClassroomTab() {
        if (!classroomData) {
          tabContent.innerHTML = `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
              <p class="text-gray-500">
                No classroom observation report is available.
              </p>
            </div>
          `;
          return;
        }

        tabContent.innerHTML = `
          <div>
            <h3 class="font-semibold text-gray-800 mb-2">
              Classroom Observation Breakdown
            </h3>

            <div class="space-y-3">

              ${classroomData.domains
                .map(
                  (domain) => `
                    <div class="border border-gray-200 rounded-lg overflow-hidden">

                      <div class="px-4 py-3 bg-gray-50 flex items-center justify-between">
                        <span class="font-medium text-gray-800">
                          ${domain.part_number}. ${domain.title}
                        </span>

                        <span class="font-semibold text-gray-800">
                          ${
                            domain.average !== null
                              ? domain.average.toFixed(2)
                              : "N/A"
                          }
                        </span>
                      </div>

                      <div class="overflow-x-auto">
                        <table class="w-full text-sm">

                          <thead>
                            <tr class="border-t border-gray-200 text-gray-500">

                              <th class="text-left px-4 py-2 font-medium">
                                Indicator
                              </th>

                              <th class="px-4 py-2 font-medium">
                                HCEC
                              </th>

                              <th class="px-4 py-2 font-medium">
                                COT
                              </th>

                              <th class="px-4 py-2 font-medium">
                                Level
                              </th>

                            </tr>
                          </thead>

                          <tbody>
                            ${domain.indicators
                              .map(
                                (indicator) => `
                                  <tr class="border-t border-gray-100">

                                    <td class="px-4 py-2">
                                      ${indicator.indicator_number}.
                                      ${indicator.text}
                                    </td>

                                    <td class="text-center px-4 py-2">
                                      ${indicator.hcec}
                                    </td>

                                    <td class="text-center px-4 py-2">
                                      ${indicator.cot}
                                    </td>

                                    <td class="text-center px-4 py-2">
                                      ${indicator.level}
                                    </td>

                                  </tr>
                                `,
                              )
                              .join("")}
                          </tbody>

                        </table>
                      </div>

                    </div>
                  `,
                )
                .join("")}

            </div>
          </div>
        `;
      }

      function renderPlaceholderTab(title) {
        tabContent.innerHTML = `
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
            <h3 class="font-semibold text-gray-800 mb-1">
              ${title}
            </h3>

            <p class="text-sm text-gray-500">
              Detailed ${title} results will appear here.
            </p>
          </div>
        `;
      }

      tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setActiveTab(button.dataset.tab);
        });
      });

      // Default tab
      setActiveTab("overall");
    } catch (error) {
      // 404 here means no evaluation term is currently open.
      if (error?.status === 404) {
        container.innerHTML = `
          <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
            <p class="text-gray-500">
              No evaluation term is currently open.
            </p>
            <p class="text-xs text-gray-400 mt-1">
              Your results will appear here once a new term opens.
            </p>
          </div>
        `;

        return;
      }

      throw error;
    }
  } catch (error) {
    console.error("Failed to load my evaluation:", error);

    container.innerHTML = `
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">

        <p class="text-red-500">
          Failed to load your evaluation.
        </p>

      </div>
    `;
  }
}

renderContent();