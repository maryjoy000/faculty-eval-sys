// ============================================
// REUSABLE COMPONENT: Toast Notifications
// ============================================
// Non-blocking feedback (success / error / warning / info) in the
// system modal language: white rounded-xl card, shadow-lg, colored
// left rail + glyph, title, and a timer line showing the remaining
// auto-dismiss time. Timer pauses while hovered. Stacked
// bottom-right above all overlays, auto-dismissed.
//
// Usage:
//   showToast("Section saved.", "success");
//   showToast("Something went wrong.", "error");
//   showToast("LRN must be exactly 12 digits.", "warning");
//   showToast("Draft restored.", "info");
//
// Types: "success" | "error" | "warning" | "info" (default "info").
// Safe: all text is set via textContent, never innerHTML.

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

  // Palette mirrors the site: brand blue + chart greens/ambers/reds.
  // Colors use inline styles so no CSS rebuild is ever required.
  const styles = {
    success: { title: "Success", glyph: "✓", glyphClass: "text-green-600", tint: "#DCFCE7", accent: "#16A34A" },
    error: { title: "Error", glyph: "!", glyphClass: "text-red-600", tint: "#FEE2E2", accent: "#DC2626" },
    warning: { title: "Warning", glyph: "!", glyphClass: "text-amber-600", tint: "#FEF3C7", accent: "#F59E0B" },
    info: { title: "Notice", glyph: "i", glyphClass: "text-brand", tint: "#DBEAFE", accent: "#023375" },
  }[kind];

  const duration = TOAST_DURATION[kind] || 4000;

  const toast = document.createElement("div");
  toast.className =
    "relative bg-white rounded-xl shadow-lg border border-gray-200 p-4 flex items-start gap-3 w-full overflow-hidden";
  toast.setAttribute("style", "opacity:0;transform:translateX(12px);transition:opacity 0.25s ease,transform 0.25s ease;");

  const rail = document.createElement("span");
  rail.setAttribute(
    "style",
    "position:absolute;top:0;bottom:0;left:0;width:4px;background:" + styles.accent + ";"
  );

  const icon = document.createElement("span");
  icon.className =
    "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 " +
    styles.glyphClass;
  icon.setAttribute("style", "background:" + styles.tint + ";");
  icon.textContent = styles.glyph;

  const body = document.createElement("div");
  body.className = "flex-1";

  const title = document.createElement("p");
  title.className = "text-sm font-semibold text-gray-800";
  title.textContent = styles.title;

  const messageEl = document.createElement("p");
  messageEl.className = "text-sm text-gray-600";
  messageEl.textContent = text;

  body.appendChild(title);
  body.appendChild(messageEl);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "text-gray-400 hover:text-gray-700 font-bold px-1";
  closeBtn.setAttribute("aria-label", "Dismiss notification");
  closeBtn.textContent = "✕";

  const track = document.createElement("div");
  track.setAttribute(
    "style",
    "position:absolute;left:0;right:0;bottom:0;height:4px;background:#F3F4F6;"
  );

  const bar = document.createElement("div");
  bar.setAttribute(
    "style",
    "height:100%;width:100%;background:" + styles.accent + ";"
  );
  track.appendChild(bar);

  let dismissed = false;
  let timerId = null;
  let remaining = duration;
  let startedAt = 0;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    // Quick fade before removal.
    toast.setAttribute(
      "style",
      "opacity:0;transform:translateX(12px);transition:opacity 0.15s ease,transform 0.15s ease;"
    );
    setTimeout(() => {
      if (toast.parentNode === container) container.removeChild(toast);
    }, 160);
  }

  function startTimer(ms) {
    startedAt = performance.now();
    timerId = setTimeout(dismiss, ms);
    // (Re)start the timer-line animation from its current width.
    bar.style.transition = "none";
    requestAnimationFrame(() => {
      if (dismissed) return;
      bar.style.transition = "width " + ms + "ms linear";
      bar.style.width = "0%";
    });
  }

  // Hovering pauses both the dismiss timer and the timer line.
  toast.addEventListener("mouseenter", () => {
    if (dismissed || timerId === null) return;
    clearTimeout(timerId);
    timerId = null;
    remaining -= performance.now() - startedAt;

    const trackWidth = track.getBoundingClientRect().width;
    const barWidth = bar.getBoundingClientRect().width;
    const pct = trackWidth > 0 ? (barWidth / trackWidth) * 100 : 0;

    bar.style.transition = "none";
    bar.style.width = pct + "%";
  });

  toast.addEventListener("mouseleave", () => {
    if (dismissed || timerId !== null) return;
    if (remaining <= 0) {
      dismiss();
      return;
    }
    startTimer(remaining);
  });

  closeBtn.addEventListener("click", dismiss);

  toast.appendChild(rail);
  toast.appendChild(icon);
  toast.appendChild(body);
  toast.appendChild(closeBtn);
  toast.appendChild(track);
  container.appendChild(toast);

  // Slide/fade in, then start the timer line.
  requestAnimationFrame(() => {
    if (dismissed) return;
    toast.style.opacity = "1";
    toast.style.transform = "translateX(0)";
    startTimer(duration);
  });
}
