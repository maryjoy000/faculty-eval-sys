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
    .map((part) => {
      const questions = Array.isArray(part.questions) ? part.questions : [];
      const partNumber = part.part_number ?? part.partNumber ?? "";

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
            badgeHtml = `<span class="text-xs font-medium text-gray-400">Not answered</span>`;
          } else {
            answeredCount += 1;
            ratingSum += rating;

            const scaleLabel = getReviewScaleLabel(scaleLabels, rating);
            const ratingText = scaleLabel ? `${rating} — ${reviewEscapeHtml(scaleLabel)}` : `${rating}`;

            badgeHtml = `<span class="text-sm font-semibold text-brand whitespace-nowrap">${ratingText}</span>`;
          }

          return `
            <div class="flex items-start justify-between gap-3 py-2 border-b border-gray-100 last:border-0 text-sm">
              <span class="text-gray-700">${question.text || ""}</span>
              ${badgeHtml}
            </div>`;
        })
        .join("");

      return `
        <div class="mb-4">
          <h4 class="text-sm font-semibold text-gray-800 mb-1">
            ${partNumber !== "" ? `Part ${partNumber}: ` : ""}${part.title || ""}
          </h4>
          ${questionsHtml}
        </div>`;
    })
    .join("");

  const overallAverage = answeredCount > 0 ? ratingSum / answeredCount : 0;
  const equivalent = getReviewEquivalent(equivalents, overallAverage);

  let commentHtml = "";
  if (includeComment) {
    const commentText = String(opts.comment || "").trim();

    commentHtml = `
      <div class="mt-4">
        <h4 class="text-sm font-semibold text-gray-800 mb-1">Your Comment</h4>
        ${
          commentText
            ? `<p class="text-sm text-gray-600 italic whitespace-pre-wrap">${reviewEscapeHtml(commentText)}</p>`
            : `<p class="text-sm text-gray-400 italic">No comment provided.</p>`
        }
      </div>`;
  }

  return `
    <p class="text-sm text-gray-500 mb-4">
      ${answeredCount} of ${totalQuestions} questions answered.
      ${equivalent ? `Overall Average: <span class="font-semibold text-gray-800">${overallAverage.toFixed(2)} — ${reviewEscapeHtml(equivalent)}</span>` : `Overall Average: <span class="font-semibold text-gray-800">${overallAverage.toFixed(2)}</span>`}
    </p>
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
      <div class="relative bg-white rounded-xl shadow-lg w-full max-w-2xl mx-4 p-6 max-h-[85vh] overflow-y-auto">
        <h2 id="review-summary-title" class="text-lg font-semibold text-gray-800 mb-1"></h2>
        <p id="review-summary-subtitle" class="text-sm text-gray-500 mb-4"></p>
        <div id="review-summary-body"></div>
        <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
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
