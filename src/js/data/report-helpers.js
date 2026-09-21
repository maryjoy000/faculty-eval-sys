// ============================================
// SHARED: Report Data Helpers
// ============================================
// Used by both Admin Reports and HR Reports — pulls together all 4
// evaluation types for a given faculty member into a consistent shape,
// and builds the print-ready report document (header, tables, legend,
// signature block).

function getClassroomObservationData(facultyId) {
  const backend = hrReportDataCache?.[facultyId]?.classroom;

  if (!backend) return null;

  return {
    average: backend.domains.length > 0
      ? backend.domains
          .filter(d => d.average !== null)
          .reduce((sum, d) => sum + d.average, 0) /
        backend.domains.filter(d => d.average !== null).length
      : 0,

    equivalent: getScaleEquivalent(
      "hrEvaluation",
      backend.domains.length > 0
        ? backend.domains
            .filter(d => d.average !== null)
            .reduce((sum, d) => sum + d.average, 0) /
          backend.domains.filter(d => d.average !== null).length
        : 0
    ),

    domainScores: backend.domains.map(domain => ({
      title: domain.title,
      average: domain.average,
      questionScores: domain.indicators.map(indicator => ({
        text: indicator.text,
        value: indicator.hcec
      }))
    }))
  };
}

function getPeerToPeerData(facultyId) {
  const backend = hrReportDataCache[facultyId]?.peer;

  if (!backend) {
    return null;
  }

  return {
    average:
      typeof backend.average_rating === "number"
        ? backend.average_rating
        : typeof backend.overall_average === "number"
          ? backend.overall_average
          : 0,

    equivalent:
      typeof backend.average_rating === "number"
        ? getScaleEquivalent("peerToPeer", backend.average_rating)
        : typeof backend.overall_average === "number"
          ? getScaleEquivalent("peerToPeer", backend.overall_average)
          : "--",

    categoryScores: (backend.domains || []).map((domain) => ({
      partNumber: domain.part_number,
      title: domain.title,
      average:
        typeof domain.average === "number"
          ? domain.average
          : 0,

      questionScores: (domain.indicators || []).map((indicator) => ({
        text: indicator.text,
        average:
          typeof indicator.average === "number"
            ? indicator.average
            : 0,
        responseCount: indicator.response_count || 0
      }))
    })),

    comments: (backend.comments || [])
      .map((comment) => {
        if (typeof comment === "string") {
          return {
            text: comment,
            sentiment: null
          };
        }

        return {
          text: comment.text || "",
          sentiment: comment.sentiment
            ? comment.sentiment.charAt(0).toUpperCase() +
              comment.sentiment.slice(1).toLowerCase()
            : null
        };
      })
      .filter((comment) => comment.text),

    submissionCount: backend.submission_count || 0
  };
}

function getHrEvaluationData(facultyId) {
  const backend = hrReportDataCache?.[facultyId]?.hr;

  if (!backend) return null;

  const validDomains = (backend.domains || []).filter(
    (domain) => domain.average !== null
  );

  const average =
    validDomains.length > 0
      ? validDomains.reduce((sum, d) => sum + d.average, 0) /
        validDomains.length
      : 0;

  return {
    average,

    equivalent: getScaleEquivalent(
      "hrEvaluation",
      average
    ),

    submittedAt: backend.submitted_at,

    categoryScores: (backend.domains || []).map(domain => ({
      title: domain.title,
      average: domain.average,
      questionScores: domain.indicators.map(indicator => ({
        id: indicator.indicator_number,
        text: indicator.text,
        value: indicator.average
      }))
    })),

    comments: (backend.comments || [])
      .map((comment) => {
        if (typeof comment === "string") {
          return {
            text: comment,
            sentiment: null
          };
        }

        return {
          text: comment.text || "",
          sentiment: comment.sentiment
            ? comment.sentiment.charAt(0).toUpperCase() +
              comment.sentiment.slice(1).toLowerCase()
            : null
        };
      })
      .filter((comment) => comment.text)
  };
}

function getStudentEvaluationData(faculty) {
  const backend = hrReportDataCache?.[faculty.id]?.student;

  if (!backend) return null;

  const validDomains = backend.domains.filter(
    (domain) => domain.average !== null
  );

  if (validDomains.length === 0) return null;

  const overallAverage =
    validDomains.reduce(
      (sum, domain) => sum + domain.average,
      0
    ) / validDomains.length;

  const categoryScores = validDomains.map((domain) => ({
    title: domain.title.replace(/\n/g, " — "),
    average: domain.average,
    questionAverages: domain.indicators.map((indicator) => ({
      id: indicator.indicator_number,
      text: indicator.text,
      average: indicator.average
    }))
  }));

  return {
    average: overallAverage,
    equivalent: getScaleEquivalent(
      "student",
      overallAverage
    ),
    categoryScores,

    comments: (backend.comments || [])
      .map((comment) => {
        if (typeof comment === "string") {
          return {
            text: comment,
            sentiment: null
          };
        }

        return {
          text: comment.text || "",
          sentiment: comment.sentiment
            ? comment.sentiment.charAt(0).toUpperCase() +
              comment.sentiment.slice(1).toLowerCase()
            : null
        };
      })
      .filter((comment) => comment.text),

    sentimentCounts: (backend.comments || []).reduce(
      (counts, comment) => {
        const label =
          typeof comment === "object" && comment.sentiment
            ? comment.sentiment.charAt(0).toUpperCase() +
              comment.sentiment.slice(1).toLowerCase()
            : null;

        if (label === "Positive") {
          counts.Positive += 1;
        } else if (label === "Neutral") {
          counts.Neutral += 1;
        } else if (label === "Negative") {
          counts.Negative += 1;
        }

        return counts;
      },
      {
        Positive: 0,
        Neutral: 0,
        Negative: 0
      }
    ),

    submissionCount: backend.evaluation_count
  };
}

// ============================================
// Classroom Observation: COT / HCEC / Level derivation
// ============================================
// HCEC Equivalent = the score as recorded from Admin's classroom
// observation. COT Rating = HCEC Equivalent + 1, per school policy:
// Level 1 ("Not Evident") is never assigned, so the recorded 1–5 scale
// is shifted up to the physical form's 2–6 COT scale.

const COT_LEVEL_DESCRIPTIONS = [
  { level: 1, name: "Not Evident", text: "The teacher does not demonstrate the indicator." },
  { level: 2, name: "Building", text: "The teacher demonstrates a limited range of separate aspects of the indicator." },
  { level: 3, name: "Organizing", text: "The teacher demonstrates a limited range of loosely-associated pedagogical aspects of the indicator." },
  { level: 4, name: "Developing", text: "The teacher demonstrates a range of associated pedagogical aspects of the indicator that sometimes aligned with the learners' developmental needs." },
  { level: 5, name: "Applying", text: "The teacher demonstrates a range of associated pedagogical aspects of the indicator that are usually aligned with the learners' developmental needs." },
  { level: 6, name: "Consolidating", text: "The teacher uses well-connected pedagogical aspects of the indicator that are consistently aligned with student development and support students to be successful learners." }
];

function getCotLevelLabel(hcecAverage) {
  const cotRating = hcecAverage + 1;
  const rounded = Math.min(6, Math.max(1, Math.round(cotRating)));
  return COT_LEVEL_DESCRIPTIONS.find((l) => l.level === rounded).name;
}

// ============================================
// Level legend (COT 1–6 scale) + note — bottom of Classroom & Combined tabs
// ============================================
function buildLevelLegendHtml() {
  return `
    <table class="hidden print:table w-full border-collapse mb-1 text-[10px] print:text-[10px] leading-tight">
      <tbody>
        <tr>
          <td class="border border-gray-400 bg-gray-100 font-semibold px-3 py-0.5">Level</td>
          ${COT_LEVEL_DESCRIPTIONS.map((l) => `<td class="border border-gray-400 text-center font-semibold px-1 py-0.5">${l.level}</td>`).join("")}
        </tr>
        <tr>
          <td class="border border-gray-400 bg-gray-100 font-semibold px-3 py-0.5">Level Name</td>
          ${COT_LEVEL_DESCRIPTIONS.map((l) => `<td class="border border-gray-400 text-center font-semibold px-1 py-0.5">${l.name}</td>`).join("")}
        </tr>
        <tr>
          <td class="border border-gray-400 bg-gray-100 font-semibold px-3 py-0.5 align-top">Level Descriptions</td>
          ${COT_LEVEL_DESCRIPTIONS.map((l) => `<td class="border border-gray-400 px-1 py-0.5 align-top">${l.text}</td>`).join("")}
        </tr>
      </tbody>
    </table>
    <p class="hidden print:block text-[10px] italic text-gray-500 mb-2">Note: Legends on the LEVELS shall be used for Classroom Observable Strands only.</p>
  `;
}

// ============================================
// Print document header — shared across all tabs
// ============================================
function buildReportDocumentHeaderHtml(faculty, subtitle, showPeriod) {
  const period = showPeriod ? getSystemSettings() : null;

  return `
    <div class="hidden print:block mb-3">
      <div class="flex items-center justify-center gap-3 text-center">
        <img src="../../assets/images/school-logo.jpg" alt="School Logo" class="w-12 h-12 object-contain shrink-0">
        <div>
          <p class="font-bold text-gray-800 text-sm leading-tight">HEADWATERS COLLEGE – ELIZABETH CAMPUS</p>
          <p class="font-bold text-gray-800 text-xs leading-tight">TEACHER PERFORMANCE EVALUATION TOOL</p>
          <p class="text-[9px] italic text-gray-500 leading-tight">Based on the Philippine Professional Standards for Teachers</p>
          ${subtitle ? `<p class="text-[9px] text-gray-500 leading-tight mt-0.5">${subtitle}</p>` : ""}
        </div>
      </div>
      <div class="mt-2 flex items-center justify-between">
        <span>
          <span class="text-xs text-gray-700">Full Name:</span>
          <span class="text-xs font-semibold text-gray-800 border-b border-gray-400 pb-0.5 ml-2">${faculty.name}</span>
        </span>
        ${period ? `
          <span class="text-[10px] text-gray-600">
            <span class="font-medium">Period:</span> SY ${period.academicYear || "____"}, ${period.semester || "____"}
          </span>
        ` : ""}
      </div>
    </div>
  `;
}

// ============================================
// Signature block — Combined report only
// ============================================
function buildSignatureBlockHtml() {
  const hrProfile = JSON.parse(localStorage.getItem("hrProfile") || "null");
  const adminProfile = JSON.parse(localStorage.getItem("adminProfile") || "null");

  const hrName = hrProfile?.name || "____________________";
  const adminName = adminProfile?.name || "____________________";

  return `
    <div class="hidden print:block mt-4">
      <p class="text-[9px] text-gray-700 mb-5">Prepared by:</p>
      <div class="grid grid-cols-2 gap-8">
        <div class="text-center">
          <p class="text-[9px] font-semibold text-gray-800 border-t border-gray-400 pt-1">${hrName}</p>
          <p class="text-[8px] italic text-gray-500">HR Officer</p>
        </div>
        <div class="text-center">
          <p class="text-[9px] font-semibold text-gray-800 border-t border-gray-400 pt-1">${adminName}</p>
          <p class="text-[8px] italic text-gray-500">School Head/Classroom Observer</p>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// Verified block — Student Evaluation report only
// ============================================
function buildVerifiedBlockHtml() {
  const hrProfile = JSON.parse(localStorage.getItem("hrProfile") || "null");
  const adminProfile = JSON.parse(localStorage.getItem("adminProfile") || "null");

  const hrName = hrProfile?.name || "____________________";
  const adminName = adminProfile?.name || "____________________";

  return `
    <div class="hidden print:block mt-6">
      <p class="text-xs text-gray-700 mb-8">Verified:</p>
      <div class="grid grid-cols-2 gap-8">
        <div class="text-center">
          <p class="text-sm font-semibold text-gray-800 border-t border-gray-400 pt-1">${hrName}</p>
          <p class="text-xs italic text-gray-500">HR Officer</p>
        </div>
        <div class="text-center">
          <p class="text-sm font-semibold text-gray-800 border-t border-gray-400 pt-1">${adminName}</p>
          <p class="text-xs italic text-gray-500">Principal</p>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// Student Evaluation report: Category > Question > Average, + sentiment
// + anonymized comments (own page)
// ============================================
function buildStudentRatingScaleLegendHtml() {
  const scale = getScale("student");
  const rows = scale.equivalents.map((band) => `
    <tr>
      <td class="border border-gray-400 py-0.5 px-2 text-xs print:text-[10px] text-gray-700">${band.min.toFixed(2)} – ${band.max.toFixed(2)}</td>
      <td class="border border-gray-400 py-0.5 px-2 text-xs print:text-[10px] text-gray-700">${band.label}</td>
    </tr>
  `).join("");

  return `
    <p class="hidden print:block text-[10px] italic text-gray-500 mb-1">Note: Rating scale based on the PPST standard ratings.</p>
    <table class="hidden print:table border-collapse mb-2 text-xs print:text-[10px]">
      <thead>
        <tr>
          <th colspan="2" class="border border-gray-400 bg-gray-200 py-1 px-2 text-xs print:text-[10px] font-semibold text-gray-700 text-left">Student Evaluation Rating Scale and Equivalent</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function buildStudentCategoryTableHtml(studentData) {
  if (!studentData || !studentData.categoryScores || studentData.categoryScores.length === 0) {
    return buildEmptyState("student evaluation");
  }

  const bodyRows = studentData.categoryScores.map((part) => {
    const remarks = part.average > 0 ? getScaleEquivalent("student", part.average) : "—";
    const rowCount = part.questionAverages.length;

    const partHeaderRow = `
      <tr class="bg-gray-700 text-white">
        <td colspan="2" class="border border-gray-400 py-1 px-1.5 text-xs print:text-[10px] font-semibold">${part.title}</td>
        <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] font-semibold text-center">Average</td>
        <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] font-semibold text-center">Category<br>Average</td>
        <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] font-semibold text-center">Remarks</td>
      </tr>
    `;

    const questionRows = part.questionAverages.map((q, index) => {
      const categoricalCell = index === 0
        ? `<td rowspan="${rowCount}" class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center align-middle font-semibold text-gray-800">${part.average.toFixed(2)}</td>`
        : "";

      const remarksCell = index === 0
        ? `<td rowspan="${rowCount}" class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center align-middle font-semibold text-gray-800">${remarks}</td>`
        : "";

      return `
        <tr>
          <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center text-gray-600 whitespace-nowrap">${index + 1}</td>
          <td class="border border-gray-400 py-1 px-1.5 text-xs print:text-[10px] text-gray-700">${q.text}</td>
          <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center text-gray-600">${q.average !== null ? q.average.toFixed(2) : "—"}</td>
          ${categoricalCell}
          ${remarksCell}
        </tr>
      `;
    }).join("");

    return partHeaderRow + questionRows;
  }).join("");

  const overallRemarks = studentData.average > 0 ? studentData.equivalent : "—";

  const commentsHtml = (studentData.comments || []).length > 0
    ? `
      <div class="mt-3 no-print">
        <div class="font-semibold text-sm text-gray-800 mb-1">
          Comments:
        </div>

        <div class="space-y-1">
          ${studentData.comments.map((comment) => `
            <div class="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-700">
              ${typeof comment === "string" ? comment : comment.text}
            </div>
          `).join("")}
        </div>
      </div>
    `
    : "";
    
  return `
    <table class="w-full border-collapse mb-2 text-left">
      <tbody>
        ${bodyRows}
        <tr>
          <td colspan="3" class="border border-gray-400 bg-gray-100 py-1.5 px-1.5 text-sm print:text-[12px] font-bold text-gray-800 text-center">General Average</td>
          <td class="border border-gray-400 bg-gray-100 py-1.5 px-1.5 text-sm print:text-[12px] font-bold text-brand text-center">${studentData.average.toFixed(2)}</td>
          <td class="border border-gray-400 bg-gray-100 py-1.5 px-1.5 text-sm print:text-[12px] font-bold text-brand text-center">${overallRemarks}</td>
        </tr>
      </tbody>
    </table>
    
    ${commentsHtml}
  `;
}

function buildSentimentSummaryHtml(studentData) {
  const counts = studentData.sentimentCounts;
  const total = counts.Positive + counts.Neutral + counts.Negative;
  const pct = (n) => total > 0 ? `${Math.round((n / total) * 100)}%` : "—";

  return `
    <div class="hidden print:block mb-2">
      <p class="text-xs print:text-[10px] font-semibold text-gray-700 mb-1">Overall Comments Sentiment Result (${total} comment${total === 1 ? "" : "s"})</p>
      <table class="w-full border-collapse text-xs print:text-[10px]">
        <thead>
          <tr class="bg-gray-200">
            <th class="border border-gray-400 py-1 px-2 text-center font-semibold text-gray-700">Positive</th>
            <th class="border border-gray-400 py-1 px-2 text-center font-semibold text-gray-700">Neutral</th>
            <th class="border border-gray-400 py-1 px-2 text-center font-semibold text-gray-700">Negative</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="border border-gray-400 py-1 px-2 text-center text-green-700">${counts.Positive} (${pct(counts.Positive)})</td>
            <td class="border border-gray-400 py-1 px-2 text-center text-gray-600">${counts.Neutral} (${pct(counts.Neutral)})</td>
            <td class="border border-gray-400 py-1 px-2 text-center text-red-700">${counts.Negative} (${pct(counts.Negative)})</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function buildAnonymizedCommentsHtml(studentData) {
  if (!studentData.comments || studentData.comments.length === 0) {
    return `<p class="hidden print:block text-xs print:text-[10px] text-gray-400 italic">No comments were submitted.</p>`;
  }

  const sentimentColor = (label) => label === "Positive" ? "text-green-700" : label === "Negative" ? "text-red-700" : "text-gray-500";

  return `
    <div
      class="hidden print:block"
      style="break-before: page !important; page-break-before: always !important;"
    >
      <p class="text-sm print:text-[12px] font-bold text-gray-800 mb-2">
        Student Comments (Anonymous)
      </p>
      ${studentData.comments.map((c, i) => `
        <div class="flex items-start justify-between gap-3 py-1.5 border-b border-gray-200">
          <p class="text-xs print:text-[10px] text-gray-700 flex-1">${i + 1}. ${typeof c === "string" ? c : c.text}</p>
          ${typeof c === "object" && c.sentiment
            ? `<span class="text-[9px] print:text-[9px] font-semibold ${sentimentColor(c.sentiment)} whitespace-nowrap">${c.sentiment}</span>`
            : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function buildPeerCategoryTableHtml(peerData) {
  if (!peerData || !peerData.categoryScores?.length) {
    return buildEmptyState("peer-to-peer evaluation");
  }

  const comments = Array.isArray(peerData.comments)
    ? peerData.comments
    : [];

  const categoryRows = peerData.categoryScores
    .map((category, categoryIndex) => {
      const questions = category.questionScores || [];

      const questionHtml = questions
        .map(
          (question, questionIndex) => `
            <tr>
              <td class="border border-gray-400 px-3 py-2 align-top text-gray-700">
                ${(question.text || "").replace(/<br\s*\/?>/gi, "<br>")}
              </td>
              <td class="border border-gray-400 px-3 py-2 text-center align-middle">
                ${
                  typeof question.average === "number"
                    ? question.average.toFixed(2)
                    : "--"
                }
              </td>
            </tr>
          `
        )
        .join("");

      return `
        <tr>
          <!-- PERFORMANCE CATEGORY -->
          <td class="border border-gray-400 px-3 py-2 align-top">
            <div class="font-semibold text-gray-800 mb-2">
              ${category.title}
            </div>

            ${questionHtml}
          </td>

          <!-- CATEGORY AVERAGE
               MERGED VERTICALLY FOR THE WHOLE PART -->
          <td class="border border-gray-400 px-3 py-2 text-center align-middle font-semibold text-gray-800">
            ${
              typeof category.average === "number"
                ? category.average.toFixed(2)
                : "--"
            }
          </td>
        </tr>
      `;
    })
    .join("");

  const sentimentColor = (label) =>
  label === "Positive"
    ? "text-green-700"
    : label === "Negative"
      ? "text-red-700"
      : "text-gray-500";

  const commentsHtml = comments.length
    ? comments
        .map(
          (comment, index) => {
            const text =
              typeof comment === "string"
                ? comment
                : comment.text;

            const sentiment =
              typeof comment === "object"
                ? comment.sentiment
                : null;

            return `
              <tr>
                <td class="border border-gray-400 px-3 py-2 align-top text-gray-700">
                  ${index + 1}.
                </td>
                <td class="border border-gray-400 px-3 py-2 text-gray-700">
                  <div>${text}</div>
                  ${
                    sentiment
                      ? `<div class="text-xs font-medium mt-1 ${sentimentColor(sentiment)}">
                          Sentiment: ${sentiment}
                        </div>`
                      : ""
                  }
                </td>
              </tr>
            `;
          }
        )
        .join("")
    : `
        <tr>
          <td
            colspan="2"
            class="border border-gray-400 px-3 py-3 text-gray-400 italic"
          >
            No comments were submitted.
          </td>
        </tr>
      `;

  const totalRating =
    typeof peerData.average === "number"
      ? peerData.average.toFixed(2)
      : "--";

  return `
    <!-- ============================================
         PEER-TO-PEER PERFORMANCE TABLE
         ============================================ -->

    <div class="overflow-x-auto">

      <table class="w-full border-collapse text-sm">

        <!-- HEADER APPEARS ONLY ONCE -->
        <thead>
          <tr class="bg-gray-200">
            <th
              class="border border-gray-400 px-3 py-2 text-left"
            >
              Performance Category
            </th>

            <th
              class="border border-gray-400 px-3 py-2 text-center w-32"
            >
              Rating
            </th>
          </tr>
        </thead>

        <tbody>

          ${peerData.categoryScores
            .map((category) => {
              const questions = category.questionScores || [];

              return `
                <tr>

                  <!-- CATEGORY + INDICATORS -->
                  <td class="border border-gray-400 px-3 py-2 align-top">

                    <div class="font-semibold text-gray-800 mb-2">
                      ${category.title}
                    </div>

                    <div class="space-y-2">
                      ${questions
                        .map(
                          (question, index) => `
                            <div class="text-gray-700">
                              ${String(question.text || "")
                                .replace(/<br\s*\/?>/gi, "\n")
                                .split(/\r?\n/)
                                .filter(line => line.trim())
                                .map(line => `<div>${line.trim()}</div>`)
                                .join("")}
                            </div>
                          `
                        )
                        .join("")}
                    </div>

                  </td>

                  <!-- CATEGORY AVERAGE
                       ONE MERGED CELL FOR THE WHOLE PART -->
                  <td
                    class="border border-gray-400 px-3 py-2 text-center align-middle font-semibold text-gray-800"
                  >
                    ${
                      typeof category.average === "number"
                        ? category.average.toFixed(2)
                        : "--"
                    }
                  </td>

                </tr>
              `;
            })
            .join("")}

          <!-- TOTAL RATING -->
          <tr>
            <td
              class="border border-gray-400 px-3 py-2 text-right font-bold"
            >
              TOTAL RATING
            </td>

            <td
              class="border border-gray-400 px-3 py-2 text-center font-bold"
            >
              ${totalRating}
            </td>
          </tr>

        </tbody>
      </table>
    </div>


    <!-- ============================================
         OVERALL RATING / LEGEND
         ============================================ -->

    <div class="mt-5">

      <div
        class="bg-gray-700 text-white font-semibold px-3 py-2 text-sm"
      >
        III. OVERALL RATING
      </div>

      <div class="grid grid-cols-4 border-l border-t border-gray-400">

        <!-- NEEDS IMPROVEMENT -->
        <div class="border-r border-b border-gray-400 p-3">
          <p class="font-semibold text-sm text-gray-800">
            1.0–1.7 – NEEDS IMPROVEMENT
          </p>

          <p class="mt-2 text-xs italic text-gray-700">
            Employee consistently performs below required
            standards/expectations for the position; training or
            other action is necessary to correct performance.
          </p>
        </div>

        <!-- SATISFACTORY -->
        <div class="border-r border-b border-gray-400 p-3">
          <p class="font-semibold text-sm text-gray-800">
            1.8–2.4 – SATISFACTORY
          </p>

          <p class="mt-2 text-xs italic text-gray-700">
            Employee satisfies minimum essential job requirements;
            may exceed expectations periodically; demonstrates
            likelihood of eventually exceeding expectations.
          </p>
        </div>

        <!-- VERY SATISFACTORY -->
        <div class="border-r border-b border-gray-400 p-3">
          <p class="font-semibold text-sm text-gray-800">
            2.5–3.2 – VERY SATISFACTORY
          </p>

          <p class="mt-2 text-xs italic text-gray-700">
            Employee satisfies all essential job requirements;
            may exceed expectations periodically; demonstrates
            likelihood of eventually exceeding expectations.
          </p>
        </div>

        <!-- EXCELLENT -->
        <div class="border-r border-b border-gray-400 p-3">
          <p class="font-semibold text-sm text-gray-800">
            3.3–4.0 – EXCELLENT
          </p>

          <p class="mt-2 text-xs italic text-gray-700">
            Employee consistently performs at a high level that
            exceeds expectations.
          </p>
        </div>

      </div>
    </div>


    <!-- ============================================
         COMMENTS AND EXAMPLES
         ============================================ -->

    <div class="mt-5">

      <div
        class="border border-gray-400 px-3 py-2 font-medium text-sm text-gray-800"
      >
        Comment on the employee's overall performance.
      </div>

      <table class="w-full border-collapse text-sm">
        <tbody>

          
          ${
            comments.length
              ? comments
                  .map((comment) => {
                    const text =
                      typeof comment === "string"
                        ? comment
                        : comment.text;

                    const sentiment =
                      typeof comment === "object"
                        ? comment.sentiment
                        : null;

                    return `
                      <tr>
                        <td
                          class="border-l border-r border-b border-gray-400 px-3 py-2 text-gray-700"
                        >
                          <div>${text}</div>
                          ${
                            sentiment
                              ? `<div class="text-xs font-medium mt-1 ${sentimentColor(sentiment)}">
                                  Sentiment: ${sentiment}
                                </div>`
                              : ""
                          }
                        </td>
                      </tr>
                    `;
                  })
                  .join("")
              : `
                  <tr>
                    <td
                      class="border-l border-r border-b border-gray-400 px-3 py-2 text-gray-400 italic"
                    >
                      No comments were submitted.
                    </td>
                  </tr>
                `
          }

        </tbody>
      </table>

    </div>


    <!-- ============================================
         ACKNOWLEDGEMENT
         ============================================ -->

    <div class="mt-5">

      <div
        class="bg-gray-700 text-white font-semibold px-3 py-2 text-sm"
      >
        VII. ACKNOWLEDGEMENT
      </div>

      <div class="border-l border-r border-b border-gray-400 px-3 py-3">

        <p class="text-sm text-gray-700">
          I acknowledge that I have had the opportunity to discuss this
          performance evaluation with my manager/supervisor and I have
          received a copy of this evaluation.
        </p>

        <div class="grid grid-cols-2 gap-8 mt-5">

          <div>
            <p class="text-sm text-gray-700">
              Employee Signature:
            </p>
          </div>

          <div>
            <p class="text-sm text-gray-700">
              Date:
            </p>
          </div>

        </div>

        <div class="grid grid-cols-2 gap-8 mt-5">

          <div>
            <p class="text-sm text-gray-700">
              Reviewer Signature:
            </p>
          </div>

          <div>
            <p class="text-sm text-gray-700">
              Date:
            </p>
          </div>

        </div>

      </div>
    </div>
  `;
}

function buildEmptyState(label) {
  return `<p class="text-sm text-gray-400 py-6 text-center">No ${label} data available for this faculty member yet.</p>`;
}

// ============================================
// Classroom Observable Strands table (Domain > Indicator > COT/HCEC/Level)
// ============================================
function buildClassroomDomainTableHtml(classroomData) {
  if (!classroomData || !classroomData.domainScores || classroomData.domainScores.length === 0) {
    return buildEmptyState("classroom observation");
  }

  let indicatorCounter = 0;

  const bodyRows = classroomData.domainScores.map((domain) => {
    const hasIndicators = domain.questionScores && domain.questionScores.length > 0;
    const indicatorList = hasIndicators
      ? domain.questionScores
      : [{ text: domain.title, value: domain.average, isFallback: true }];

    const rowCount = indicatorList.length;

    const domainHeaderRow = `
      <tr>
        <td colspan="2" class="border border-gray-400 bg-gray-100 py-1 px-1.5 text-xs print:text-[10px] font-semibold text-gray-800">
          ${(domain.title || "").replace(/<br\s*\/?>/gi, " — ")}
        </td>
        <td class="border border-gray-400 bg-gray-50"></td>
        <td class="border border-gray-400 bg-gray-50"></td>
        <td class="border border-gray-400 bg-gray-50"></td>
        <td class="border border-gray-400 bg-gray-50"></td>
      </tr>
    `;

    const indicatorRows = indicatorList.map((ind, index) => {
      if (!ind.isFallback) indicatorCounter++;

      const hcec = ind.value !== null && ind.value !== undefined ? ind.value : domain.average;
      const cot = hcec + 1;
      const level = getCotLevelLabel(hcec);
      const decimals = ind.isFallback ? 2 : 0;
      const indicatorLabel = ind.isFallback ? "—" : `Indicator ${indicatorCounter}`;

      const categoricalCell = index === 0
        ? `<td rowspan="${rowCount}" class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center align-middle font-semibold text-gray-800">${domain.average.toFixed(2)}</td>`
        : "";

      return `
        <tr>
          <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center text-gray-600 whitespace-nowrap">${indicatorLabel}</td>
          <td class="border border-gray-400 py-1 px-1.5 text-xs print:text-[10px] text-gray-700">${(ind.text || "").replace(/<br\s*\/?>/gi, " — ")}</td>
          <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center text-gray-600">${cot.toFixed(decimals)}</td>
          <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center text-gray-600">${hcec.toFixed(decimals)}</td>
          ${categoricalCell}
          <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center text-gray-700">${level}</td>
        </tr>
      `;
    }).join("");

    return domainHeaderRow + indicatorRows;
  }).join("");

  return `
    <table class="w-full border-collapse mb-2 text-left">
      <thead>
        <tr>
          <th colspan="2" class="border border-gray-400 bg-gray-200 py-1 px-1.5 text-xs print:text-[10px] font-semibold text-gray-700 text-left">Classroom Observable Strands (70%)</th>
          <th class="border border-gray-400 bg-gray-200 py-1 px-1 text-xs print:text-[10px] font-semibold text-gray-700 text-center">COT<br>Rating</th>
          <th class="border border-gray-400 bg-gray-200 py-1 px-1 text-xs print:text-[10px] font-semibold text-gray-700 text-center">HCEC<br>Equivalent</th>
          <th class="border border-gray-400 bg-gray-200 py-1 px-1 text-xs print:text-[10px] font-semibold text-gray-700 text-center">Categorical<br>Average</th>
          <th class="border border-gray-400 bg-gray-200 py-1 px-1 text-xs print:text-[10px] font-semibold text-gray-700 text-center">Level</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
        <tr>
          <td colspan="4" class="border border-gray-400 bg-gray-100 py-1.5 px-1.5 text-sm print:text-[12px] font-bold text-gray-800 text-center">Classroom Observable Strands Average</td>
          <td colspan="2" class="border border-gray-400 bg-gray-100 py-1.5 px-1.5 text-sm print:text-[12px] font-bold text-brand text-center">${classroomData.average.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

// ============================================
// Non-Classroom Observable Strands (Combined report only)
// Domain 6: Community Linkages (Peer + Student) | Domain 7: Personal Growth (HR)
// "Categorical Average" per domain = raw domain average × that domain's
// share of the non-classroom 30% — matching the reference document's math.
// ============================================
function calculateWeightedPart(parts) {
  const available = parts.filter((p) => p.score !== null);
  if (available.length === 0) return null;
  const totalWeight = available.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight === 0) return null;
  return available.reduce((sum, p) => sum + p.score * p.weight, 0) / totalWeight;
}

function buildNonClassroomSectionHtml(studentData, peerData, hrData) {
  const w = getWeighting();

  const peerAvg = peerData ? peerData.average : null;
  const studentAvg = studentData ? studentData.average : null;
  const domain6Avg = calculateWeightedPart([
    { score: peerAvg, weight: w.peerShareOfDomain6 },
    { score: studentAvg, weight: w.studentShareOfDomain6 }
  ]);
  const domain7Avg = hrData ? hrData.average : null;

  const domain6Contribution = domain6Avg !== null ? domain6Avg * (w.domain6Share / 100) : null;
  const domain7Contribution = domain7Avg !== null ? domain7Avg * (w.domain7Share / 100) : null;

  const nonClassroomAvg = calculateWeightedPart([
    { score: domain6Avg, weight: w.domain6Share },
    { score: domain7Avg, weight: w.domain7Share }
  ]);

  const fmt = (v) => v !== null ? v.toFixed(2) : "—";

  return `
    <table class="w-full border-collapse mb-2 text-left">
      <thead>
        <tr>
          <th colspan="2" rowspan="2" class="border border-gray-400 bg-gray-200 py-1 px-1.5 text-xs print:text-[10px] font-semibold text-gray-700 text-left align-bottom">Non-Classroom Observable Strands (${(100 - w.classroomObservation).toFixed(0)}%)</th>
          <th colspan="2" class="border border-gray-400 bg-gray-200 py-1 px-1 text-xs print:text-[10px] font-semibold text-gray-700 text-center">Pre-Computation</th>
          <th rowspan="2" class="border border-gray-400 bg-gray-200 py-1 px-1 text-xs print:text-[10px] font-semibold text-gray-700 text-center align-bottom">Categorical<br>Average</th>
        </tr>
        <tr>
          <th class="border border-gray-400 bg-gray-200 py-1 px-1 text-xs print:text-[10px] font-semibold text-gray-700 text-center">EVA</th>
          <th class="border border-gray-400 bg-gray-200 py-1 px-1 text-xs print:text-[10px] font-semibold text-gray-700 text-center">%</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td colspan="2" class="border border-gray-400 bg-gray-100 py-1 px-1.5 text-xs print:text-[10px] font-semibold text-gray-800">Domain 6: Community Linkages and Professional Engagement (${w.domain6Share}%)</td>
          <td class="border border-gray-400 bg-gray-50"></td>
          <td class="border border-gray-400 bg-gray-50"></td>
          <td class="border border-gray-400 bg-gray-50"></td>
        </tr>
        <tr>
          <td class="border border-gray-400"></td>
          <td class="border border-gray-400 py-1 px-1.5 text-xs print:text-[10px] text-gray-700">P2P Evaluation</td>
          <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center text-gray-600">${fmt(peerAvg)}</td>
          <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center text-gray-600">${w.peerShareOfDomain6}%</td>
          <td rowspan="2" class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center align-middle font-semibold text-gray-800">${fmt(domain6Contribution)}</td>
        </tr>
        <tr>
          <td class="border border-gray-400"></td>
          <td class="border border-gray-400 py-1 px-1.5 text-xs print:text-[10px] text-gray-700">Student Evaluation</td>
          <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center text-gray-600">${fmt(studentAvg)}</td>
          <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center text-gray-600">${w.studentShareOfDomain6}%</td>
        </tr>
        <tr>
          <td colspan="2" class="border border-gray-400 bg-gray-100 py-1 px-1.5 text-xs print:text-[10px] font-semibold text-gray-800">Domain 7: Personal Growth and Professional Development (${w.domain7Share}%)</td>
          <td class="border border-gray-400 bg-gray-50"></td>
          <td class="border border-gray-400 bg-gray-50"></td>
          <td class="border border-gray-400 bg-gray-50"></td>
        </tr>
        <tr>
          <td class="border border-gray-400"></td>
          <td class="border border-gray-400 py-1 px-1.5 text-xs print:text-[10px] text-gray-700">HR Evaluation</td>
          <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center text-gray-600">${fmt(domain7Avg)}</td>
          <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center text-gray-600">100%</td>
          <td class="border border-gray-400 py-1 px-1 text-xs print:text-[10px] text-center font-semibold text-gray-800">${fmt(domain7Contribution)}</td>
        </tr>
        <tr>
          <td colspan="4" class="border border-gray-400 bg-gray-100 py-1.5 px-1.5 text-sm print:text-[12px] font-bold text-gray-800 text-center">Non-Classroom Observable Strands Average</td>
          <td class="border border-gray-400 bg-gray-100 py-1.5 px-1.5 text-sm print:text-[12px] font-bold text-brand text-center">${fmt(nonClassroomAvg)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function buildCombinedSummaryHtml(faculty) {
  const classroomData = getClassroomObservationData(faculty.id);
  const studentData = getStudentEvaluationData(faculty);
  const peerData = getPeerToPeerData(faculty.id);
  const hrData = getHrEvaluationData(faculty.id);

  const scoresByType = {
    classroomObservation: classroomData ? classroomData.average : null,
    student: studentData ? studentData.average : null,
    peerToPeer: peerData ? peerData.average : null,
    hrEvaluation: hrData ? hrData.average : null
  };

  const combinedAverage = calculateWeightedAverage(scoresByType);
  const overallEquivalent = combinedAverage !== null ? getScaleEquivalent("hrEvaluation", combinedAverage) : null;

  return `
    ${buildReportDocumentHeaderHtml(faculty, "Combined Evaluation Summary")}

    ${buildClassroomDomainTableHtml(classroomData)}
    ${buildNonClassroomSectionHtml(studentData, peerData, hrData)}

    <table class="w-full border-collapse mb-2 text-left">
      <tbody>
        <tr>
          <td class="border border-gray-400 bg-gray-500 py-1.5 px-1.5 text-sm print:text-[13px] font-bold text-white">Overall Average</td>
          <td class="border border-gray-400 bg-gray-500 py-1.5 px-1.5 text-sm print:text-[13px] font-bold text-white text-center">
            ${combinedAverage !== null ? `${combinedAverage.toFixed(2)} — ${overallEquivalent}` : "N/A — no evaluations yet"}
          </td>
        </tr>
      </tbody>
    </table>

    ${buildLevelLegendHtml()}
    ${buildSignatureBlockHtml()}
  `;
}

function buildHrCategoryTableHtml(data) {
  const categoryScores = data.categoryScores || [];

  if (!categoryScores.length) {
    return `
      <p class="text-sm text-gray-400 py-6 text-center">
        No HR evaluation data available.
      </p>
    `;
  }

  return `
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th class="border border-gray-400 px-3 py-2 text-left">
              Questions
            </th>
            <th class="border border-gray-400 px-3 py-2 text-center">
              Rating
            </th>
          </tr>
        </thead>

        <tbody>
          ${categoryScores.map((category) => `
            <tr>
              <td
                class="border border-gray-400 px-3 py-2 font-semibold"
                colspan="2"
              >
                ${category.title || ""}
              </td>
            </tr>

            ${(category.questionScores || []).map((question) => `
              <tr>
                <td class="border border-gray-400 px-3 py-2">
                  ${(question.text || "").replace(/<br\s*\/?>/gi, "<br>")}
                </td>

                <td class="border border-gray-400 px-3 py-2 text-center">
                  ${
                    typeof question.average === "number"
                      ? question.average.toFixed(2)
                      : "--"
                  }
                </td>
              </tr>
            `).join("")}

            <tr>
              <td class="border border-gray-400 px-3 py-2 font-semibold">
                Category Rating
              </td>
              <td class="border border-gray-400 px-3 py-2 text-center font-semibold">
                ${
                  typeof category.average === "number"
                    ? category.average.toFixed(2)
                    : "--"
                }
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildReportTabHtml(tabType, faculty) {
  if (tabType === "combined") return buildCombinedSummaryHtml(faculty);

  if (tabType === "classroom") {
    const data = getClassroomObservationData(faculty.id);
    return `
      ${buildReportDocumentHeaderHtml(faculty, "Classroom Observation Report")}
      ${data ? `<p class="text-xs text-gray-400 mb-2 no-print">Observed: ${data.submittedAt || "--"}</p>` : ""}
      ${buildClassroomDomainTableHtml(data)}
      ${data ? `
        <table class="w-full border-collapse mb-2 text-left">
          <tbody>
            <tr>
              <td class="border border-gray-400 bg-gray-500 py-1.5 px-1.5 text-sm print:text-[13px] font-bold text-white">Overall Average</td>
              <td class="border border-gray-400 bg-gray-500 py-1.5 px-1.5 text-sm print:text-[13px] font-bold text-white text-center">${data.average.toFixed(2)} — ${data.equivalent}</td>
            </tr>
          </tbody>
        </table>
      ` : ""}
      ${buildLevelLegendHtml()}
    `;
  }

  if (tabType === "student") {
    const data = getStudentEvaluationData(faculty);
    if (!data) return `${buildReportDocumentHeaderHtml(faculty, "Teacher's Evaluation", true)}${buildEmptyState("student evaluation")}`;
    return `
      ${buildReportDocumentHeaderHtml(faculty, "Teacher's Evaluation", true)}
      <p class="text-xs text-gray-400 mb-2 no-print">Based on ${data.submissionCount} student submission(s).</p>
      ${buildStudentCategoryTableHtml(data)}
      ${buildStudentRatingScaleLegendHtml()}
      ${buildSentimentSummaryHtml(data)}
      ${buildVerifiedBlockHtml()}
      ${buildAnonymizedCommentsHtml(data)}
    `;
  }

  if (tabType === "peer") {
    const data = getPeerToPeerData(faculty.id);

    if (!data) {
      return buildEmptyState("peer-to-peer evaluation");
    }

    return `
      ${buildReportDocumentHeaderHtml(
        faculty,
        "Peer-to-Peer Evaluation",
        true
      )}

      <p class="text-sm text-gray-500 mb-4">
        Based on ${data.submissionCount} peer submission(s).
      </p>

      ${buildPeerCategoryTableHtml(data)}
    `;
  }

  if (tabType === "hr") {
    const data = getHrEvaluationData(faculty.id);

    if (!data) {
      return buildEmptyState("HR evaluation");
    }

    return `
      ${buildReportDocumentHeaderHtml(
        faculty,
        "HR Evaluation",
        true
      )}

      ${buildHrCategoryTableHtml(data)}

      <div class="flex items-center justify-between pt-3 mt-2 border-t border-gray-300">
        <span class="font-semibold text-gray-800">
          Total Rating
        </span>
        <span class="font-bold text-brand">
          ${data.average.toFixed(2)}
        </span>
      </div>
    `;
  }

  return "";
}