// ============================================
// REUSABLE COMPONENT: Evaluation Wizard Stepper
// ============================================
// Usage in HTML:
//   <div id="app-stepper" data-active-step="1"></div>
//   <script src="../../js/components/stepper.js"></script>

function renderStepper() {
  const placeholder = document.getElementById("app-stepper");
  if (!placeholder) return;

  const activeStep = placeholder.dataset.activeStep || "1";

  const steps = [
    { number: 1, label: "Select Faculty" },
    { number: 2, label: "Rate Faculty" },
    { number: 3, label: "Comments/Suggestions" }
  ];

  // Build each step's markup, styling it differently if it's the active one
  const stepsHtml = steps.map((step, index) => {
    const isActive = String(step.number) === String(activeStep);
    const textClass = isActive ? "text-brand font-semibold" : "text-gray-500";
    const isLast = index === steps.length - 1;

    return `
      <span class="${textClass}">${step.number}. ${step.label}</span>
      ${!isLast ? '<span class="text-gray-400">&gt;</span>' : ""}
    `;
  }).join("");

  placeholder.innerHTML = `
    <nav class="flex flex-wrap items-center gap-2 text-sm mt-2">
      ${stepsHtml}
    </nav>
  `;
}

// Run as soon as this script loads
renderStepper();