// ============================================
// REUSABLE COMPONENT: Confirmation Modal
// ============================================
// A single shared modal for any "are you sure?" action across the app —
// evaluation submissions, logout, and destructive deletes. Injects itself
// into the page once, and is triggered programmatically via showConfirmModal().
//
// Usage:
//   showConfirmModal({
//     title: "Submit Evaluation?",
//     message: "You won't be able to make changes after submitting.",
//     confirmLabel: "Submit",
//     isDestructive: false, // true = red confirm button (for deletes)
//     onConfirm: () => { /* the actual action to run if confirmed */ }
//   });

function ensureConfirmModalExists() {
  if (document.getElementById("confirm-modal")) return; // already injected

  const modalHtml = `
    <div id="confirm-modal" class="hidden fixed inset-0 z-[100] flex items-center justify-center">
      <div id="confirm-modal-backdrop" class="absolute inset-0 bg-black/40"></div>
      <div class="relative bg-white rounded-xl shadow-lg w-full max-w-sm mx-4 p-6">
        <h2 id="confirm-modal-title" class="text-lg font-semibold text-gray-800 mb-2"></h2>
        <p id="confirm-modal-message" class="text-sm text-gray-500 mb-6"></p>
        <div class="flex justify-end gap-3">
          <button type="button" id="confirm-modal-cancel-btn" class="btn-secondary">Cancel</button>
          <button type="button" id="confirm-modal-confirm-btn" class="btn-primary"></button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

function showConfirmModal({ title, message, confirmLabel = "Confirm", isDestructive = false, onConfirm }) {
  ensureConfirmModalExists();

  const modal = document.getElementById("confirm-modal");
  const backdrop = document.getElementById("confirm-modal-backdrop");
  const cancelBtn = document.getElementById("confirm-modal-cancel-btn");
  const confirmBtn = document.getElementById("confirm-modal-confirm-btn");

  document.getElementById("confirm-modal-title").textContent = title;
  document.getElementById("confirm-modal-message").textContent = message;
  confirmBtn.textContent = confirmLabel;

  // Red button for destructive actions (deletes), brand blue otherwise
  confirmBtn.className = isDestructive
    ? "bg-red-600 text-white font-medium px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
    : "btn-primary";

  function closeModal() {
    modal.classList.add("hidden");
    // Clean up listeners so repeated calls don't stack duplicate handlers
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    cancelBtn.removeEventListener("click", closeModal);
    backdrop.removeEventListener("click", closeModal);
  }

  cancelBtn.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);

  // Re-select confirmBtn in case it was cloned by a previous call, then attach this call's action
  document.getElementById("confirm-modal-confirm-btn").addEventListener("click", () => {
    closeModal();
    onConfirm();
  });

  modal.classList.remove("hidden");
}