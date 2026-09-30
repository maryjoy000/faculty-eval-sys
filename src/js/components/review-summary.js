// ============================================
// REUSABLE COMPONENT: Pre-Submit Review Summary
// ============================================
// Shows the user every answer they gave (per part/question, with the
// chosen rating + scale label, plus their comment) inside a modal with
// "Back to Edit" and "Confirm Submit" actions — so mistakes can be
// caught before the evaluation is permanently submitted.
//
// Usage (any of the 4 evaluation flows):
//   showReviewModal({
//     title: "Review Your Evaluation",
//     subtitle: facultyName,               // plain text, optional
//     summaryHtml: buildReviewSummaryHtml({
//       parts,          // criteria parts (API shape)
//       answers,        // { questionId: rating }
//       scaleLabels,    // [{ value, label }], optional
//       equivalents,    // [{ min, max, label }], optional
//       comment,        // raw comment text, optional
//       includeComment: true
//     }),
//     confirmLabel: "Submit Evaluation",
//     onConfirm: () => { /* the existing POST logic */ }
//   });
//
// Safety: criteria titles/questions are admin-authored and already
// rendered via innerHTML on the evaluation forms, so they render here
// the same way. The comment is USER input and is always escaped.

function reviewEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getReviewScaleLabel(scaleLabels, rating) {
  const found = (Array.isArray(scaleLabels) ? scaleLabels : []).find(
    (s) => Number(s.value) === Number(rating)
  );
  return found && found.label ? String(found.label) : null;
}

function getReviewEquivalent(equivalents, average) {
  const band = (Array.isArray(equivalents) ? equivalents : []).find(
    (b) => average >= Number(b.min) && average <= Number(b.max)
  );
  return band && band.label ? String(band.label) : null;
}

function buildReviewSummaryHtml(options) {
  const opts = options || {};
  const parts = Array.isArray(opts.parts) ? opts.parts : [];
  const answers = opts.answers && typeof opts.answers === "object" ? opts.answers : {};
  const scaleLabels = Array.isArray(opts.scaleLabels) ? opts.scaleLabels : [];
  const equivalents = Array.isArray(opts.equivalents) ? opts.equivalents : [];
  const includeComment = opts.includeComment !== false;

  let totalQuestions = 0;
  let answeredCount = 0;
  let ratingSum = 0;

  const partsHtml = parts
    .map((part, partIndex) => {
      const questions = Array.isArray(part.questions) ? part.questions : [];
      const partNumber = part.part_number ?? part.partNumber ?? partIndex + 1;

      let partSum = 0;
      let partAnswered = 0;

      const questionsHtml = questions
        .map((question) => {
          totalQuestions += 1;

          const qid = question.id ?? question.question_code ?? "";
          const raw = answers[qid];
          const rating = raw === undefined || raw === null || raw === ""
            ? null
            : Number(raw);

          let badgeHtml;
          if (rating === null || isNaN(rating)) {
            badgeHtml = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Not answered</span>`;
          } else {
            answeredCount += 1;
            ratingSum += rating;
            partSum += rating;
            partAnswered += 1;

            const scaleLabel = getReviewScaleLabel(scaleLabels, rating);
            const ratingText = scaleLabel ? `${rating} — ${reviewEscapeHtml(scaleLabel)}` : `${rating}`;

            badgeHtml = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand text-white whitespace-nowrap">${ratingText}</span>`;
          }

          return `
            <div class="flex items-start justify-between gap-3 py-2 border-b border-gray-100 last:border-0 text-sm">
              <span class="text-gray-700">${question.text || ""}</span>
              ${badgeHtml}
            </div>`;
        })
        .join("");

      // Titles already carry their own numbering ("Part 1: ...", "Domain 1: ..."),
      // so render them as-is instead of prepending another "Part N:".
      const partTitle = String(part.title || "").trim() || `Part ${partNumber}`;
      const partAverage = partAnswered > 0 ? (partSum / partAnswered).toFixed(2) : "—";

      return `
        <div class="mb-4">
          <div class="flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-1">
            <h4 class="text-sm font-semibold text-gray-800">${partTitle}</h4>
            <span class="text-xs font-bold text-brand whitespace-nowrap">${partAverage}</span>
          </div>
          ${questionsHtml}
        </div>`;
    })
    .join("");

  const overallAverage = answeredCount > 0 ? ratingSum / answeredCount : 0;
  const equivalent = getReviewEquivalent(equivalents, overallAverage);
  const overallDisplay = overallAverage.toFixed(2) + (equivalent ? ` — ${equivalent}` : "");

  let commentHtml = "";
  if (includeComment) {
    const commentText = String(opts.comment || "").trim();

    commentHtml = `
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
        <h4 class="font-semibold text-gray-800 mb-1 text-sm">Your Comment</h4>
        ${
          commentText
            ? `<p class="text-sm text-gray-600 italic" style="white-space:pre-wrap">${reviewEscapeHtml(commentText)}</p>`
            : `<p class="text-sm text-gray-400 italic">No comment provided.</p>`
        }
      </div>`;
  }

  return `
    <div class="bg-brand text-white rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
      <div>
        <p class="text-xs">Questions answered</p>
        <p class="font-bold">${answeredCount} of ${totalQuestions}</p>
      </div>
      <div class="text-right">
        <p class="text-xs">Overall Average</p>
        <p class="font-bold">${reviewEscapeHtml(overallDisplay)}</p>
      </div>
    </div>
    ${partsHtml}
    ${commentHtml}
    <p class="text-xs text-gray-400 mt-4">
      Once submitted, you won't be able to change your answers.
    </p>`;
}

function ensureReviewModalExists() {
  if (document.getElementById("review-summary-modal")) return;

  document.body.insertAdjacentHTML(
    "beforeend",
    `
    <div id="review-summary-modal" class="hidden fixed inset-0 z-[100] flex items-center justify-center">
      <div id="review-summary-backdrop" class="absolute inset-0 bg-black/40"></div>
      <div class="relative bg-white rounded-xl shadow-lg w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div class="px-6 pt-6">
          <h2 id="review-summary-title" class="text-lg font-semibold text-gray-800 mb-1"></h2>
          <p id="review-summary-subtitle" class="text-sm text-gray-500 mb-4"></p>
        </div>
        <div id="review-summary-body" class="px-6 overflow-y-auto"></div>
        <div class="flex justify-end gap-3 px-6 py-4 mt-4 border-t border-gray-200 bg-white">
          <button type="button" id="review-summary-back-btn" class="btn-secondary">Back to Edit</button>
          <button type="button" id="review-summary-confirm-btn" class="btn-primary"></button>
        </div>
      </div>
    </div>`
  );
}

function showReviewModal({ title, subtitle, summaryHtml, confirmLabel = "Confirm Submit", onConfirm }) {
  ensureReviewModalExists();

  const modal = document.getElementById("review-summary-modal");
  const backdrop = document.getElementById("review-summary-backdrop");
  const backBtn = document.getElementById("review-summary-back-btn");
  const confirmBtn = document.getElementById("review-summary-confirm-btn");

  document.getElementById("review-summary-title").textContent = title || "Review Your Answers";
  document.getElementById("review-summary-subtitle").textContent = subtitle || "";
  document.getElementById("review-summary-body").innerHTML = summaryHtml || "";
  confirmBtn.textContent = confirmLabel;

  function closeModal() {
    modal.classList.add("hidden");
    // Drop this call's confirm handler so repeated reviews don't stack.
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    backBtn.removeEventListener("click", closeModal);
    backdrop.removeEventListener("click", closeModal);
  }

  backBtn.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);

  document.getElementById("review-summary-confirm-btn").addEventListener("click", () => {
    closeModal();
    if (typeof onConfirm === "function") onConfirm();
  });

  modal.classList.remove("hidden");

  document.getElementById("review-summary-body").scrollTop = 0;
}
