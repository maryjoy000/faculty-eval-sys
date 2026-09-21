// ============================================
// HR DASHBOARD PAGE
// ============================================

function mountPageContent() {
  const template = document.getElementById("page-content-template");
  const slot = document.getElementById("hr-page-content");

  if (template && slot) {
    slot.appendChild(template.content.cloneNode(true));
  }
}

function renderHrStatCards(data) {
  const container = document.getElementById("hr-stat-cards");
  if (!container) return;

  const cards = [
    {
      label: "Total Faculty",
      value: data.total_faculty,
      note: "Active faculty members"
    },
    {
      label: "Completed",
      value: data.completed,
      note: "HR evaluations submitted"
    },
    {
      label: "Pending",
      value: data.pending,
      note: "Awaiting HR evaluation"
    }
  ];

  container.className =
    "grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6";

  container.innerHTML = cards.map((card) => `
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <p class="text-sm text-gray-500 mb-2">${card.label}</p>
      <p class="text-2xl font-bold text-gray-800 mb-1">${card.value}</p>
      <p class="text-xs text-gray-400">${card.note}</p>
    </div>
  `).join("");
}

function renderEvaluationLists(data) {
  const pendingContainer =
    document.getElementById("pending-evaluations-list");

  const completedContainer =
    document.getElementById("completed-evaluations-list");

  if (!pendingContainer || !completedContainer) return;

  const pending = data.evaluations.filter(
    (faculty) => !faculty.completed
  );

  const completed = data.evaluations.filter(
    (faculty) => faculty.completed
  );

  pendingContainer.innerHTML = pending.length
    ? pending.map((faculty) => `
        <div class="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
          <span class="text-gray-700">${faculty.name}</span>

          <a
            href="hr-evaluation.html?facultyId=${faculty.id}"
            class="text-brand font-medium hover:underline"
          >
            Evaluate →
          </a>
        </div>
      `).join("")
    : `
        <p class="text-sm text-gray-400">
          All active faculty have been evaluated.
        </p>
      `;

  completedContainer.innerHTML = completed.length
    ? completed.map((faculty) => `
        <div class="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
          <span class="text-gray-700">${faculty.name}</span>

          <span class="text-green-600 font-medium">
            ${Number(faculty.rating_pct || 0).toFixed(2)}%
          </span>
        </div>
      `).join("")
    : `
        <p class="text-sm text-gray-400">
          No completed evaluations yet.
        </p>
      `;
}

async function loadHrDashboard() {
  try {
    const data = await apiGet("/evaluations/hr-dashboard");

    renderHrStatCards(data);
    renderEvaluationLists(data);
  } catch (error) {
    console.error("Failed to load HR dashboard:", error);

    const cards = document.getElementById("hr-stat-cards");
    const pending = document.getElementById("pending-evaluations-list");
    const completed =
      document.getElementById("completed-evaluations-list");

    if (cards) {
      cards.innerHTML = `
        <p class="text-sm text-red-500">
          Unable to load HR dashboard data.
        </p>
      `;
    }

    if (pending) {
      pending.innerHTML = `
        <p class="text-sm text-red-500">
          Unable to load evaluations.
        </p>
      `;
    }

    if (completed) {
      completed.innerHTML = `
        <p class="text-sm text-red-500">
          Unable to load evaluations.
        </p>
      `;
    }
  }
}

mountPageContent();
loadHrDashboard();