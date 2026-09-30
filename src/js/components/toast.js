// ============================================
// REUSABLE COMPONENT: Toast Notifications
// ============================================
// Non-blocking feedback (success / error / warning / info) in the
// system modal language: white rounded-xl card, shadow-lg, colored
// glyph. Stacked bottom-right above all overlays, auto-dismissed.
//
// Usage:
//   showToast("Section saved.", "success");
//   showToast("Something went wrong.", "error");
//   showToast("LRN must be exactly 12 digits.", "warning");
//   showToast("Draft restored.", "info");
//
// Types: "success" | "error" | "warning" | "info" (default "info").
// Safe: the message is set via textContent, never innerHTML.

var TOAST_DURATION = {
  success: 3500,
  info: 3500,
  warning: 4500,
  error: 6000,
};

var TOAST_MAX_VISIBLE = 4;

function ensureToastContainerExists() {
  let container = document.getElementById("toast-container");

  if (container) return container;

  container = document.createElement("div");
  container.id = "toast-container";
  container.className = "fixed flex flex-col gap-2 max-w-sm w-full";
  container.setAttribute("style", "bottom:1.5rem;right:1.5rem;z-index:110;");
  container.setAttribute("aria-live", "polite");

  document.body.appendChild(container);
  return container;
}

function showToast(message, type) {
  const kind =
    type === "success" || type === "error" || type === "warning"
      ? type
      : "info";

  const text = String(message === undefined || message === null ? "" : message).trim();
  if (!text) return;

  const container = ensureToastContainerExists();

  while (container.children.length >= TOAST_MAX_VISIBLE) {
    container.removeChild(container.firstChild);
  }

  const styles = {
    success: { glyph: "✓", color: "text-green-600" },
    error: { glyph: "!", color: "text-red-600" },
    warning: { glyph: "!", color: "text-amber-600" },
    info: { glyph: "i", color: "text-brand" },
  }[kind];

  const toast = document.createElement("div");
  toast.className =
    "bg-white rounded-xl shadow-lg border border-gray-200 p-4 flex items-start gap-3 w-full";

  const icon = document.createElement("span");
  icon.className =
    "w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-sm shrink-0 " +
    styles.color;
  icon.textContent = styles.glyph;

  const body = document.createElement("p");
  body.className = "text-sm text-gray-800 flex-1";
  body.textContent = text;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "text-gray-400 hover:text-gray-700 font-bold px-1";
  closeBtn.setAttribute("aria-label", "Dismiss notification");
  closeBtn.textContent = "✕";

  let dismissed = false;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    if (toast.parentNode === container) container.removeChild(toast);
  }

  closeBtn.addEventListener("click", dismiss);
  setTimeout(dismiss, TOAST_DURATION[kind] || 4000);

  toast.appendChild(icon);
  toast.appendChild(body);
  toast.appendChild(closeBtn);
  container.appendChild(toast);
}
