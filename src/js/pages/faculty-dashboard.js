// ============================================
// FACULTY DASHBOARD PAGE
// ============================================

let facultyDashboardData = null;

async function loadFacultyDashboardData() {
  const currentUser = await apiGet("/auth/me");

  try {
    facultyDashboardData = await apiGet(
      `/evaluations/${currentUser.linked_faculty_id}`
    );
  } catch (error) {
    console.warn(
      "Faculty evaluation summary is not available yet.",
      error
    );

    facultyDashboardData = null;
  }

  return facultyDashboardData;
}

// Rating-scale equivalents (Outstanding, Very Satisfactory, ...) are read
// live so dashboard labels always match Reports. Returns "" when the
// scale or a matching band is unavailable.
async function loadEquivalents(typeCode) {
  try {
    const scale = await apiGet(`/rating-scales/${typeCode}`);
    if (scale && Array.isArray(scale.equivalents)) {
      return scale.equivalents;
    }
  } catch (error) {
    console.warn(`Rating scale for ${typeCode} is not available.`, error);
  }
  return [];
}

function equivalentLabel(equivalents, average) {
  if (average === null || average === undefined) return "";
  const value = Number(average);
  const band = (equivalents || []).find(
    (entry) => value >= Number(entry.min) && value <= Number(entry.max)
  );
  return band ? String(band.label) : "";
}

function resultCard(label, average, equivalents, released) {
  const hasScore = released && average !== null && average !== undefined;
  const band = hasScore ? equivalentLabel(equivalents, average) : "";
  return {
    label,
    value: hasScore ? Number(average).toFixed(2) : "—",
    note: hasScore
      ? (band || "Evaluation received")
      : "Available after report release"
  };
}

async function renderFacultyStatCards() {
  const container = document.getElementById("faculty-stat-cards");
  if (!container) return;

  const data = facultyDashboardData;
  const released = data !== null && data !== undefined;

  const [peerBands, classroomBands, hrBands] = await Promise.all([
    loadEquivalents("peerToPeer"),
    loadEquivalents("classroomObservation"),
    loadEquivalents("hrEvaluation"),
  ]);

  const cards = [
    resultCard(
      "Peer Evaluation",
      data?.per_type?.peerToPeer?.average_rating ?? null,
      peerBands,
      released
    ),
    resultCard(
      "Classroom Observation",
      data?.per_type?.classroomObservation?.average_rating ?? null,
      classroomBands,
      released
    ),
    resultCard(
      "HR Evaluation",
      data?.per_type?.hrEvaluation?.average_rating ?? null,
      hrBands,
      released
    ),
  ];

  container.innerHTML = cards
    .map(
      (card) => `
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p class="text-sm text-gray-500 mb-2">
            ${card.label}
          </p>

          <p class="text-2xl font-bold text-gray-800 mb-1">
            ${card.value}
          </p>

          <p class="text-xs text-gray-400">
            ${card.note}
          </p>
        </div>
      `
    )
    .join("");
}

async function renderEvaluationLists() {
  const pendingContainer = document.getElementById(
    "pending-evaluations-list"
  );

  const completedContainer = document.getElementById(
    "completed-evaluations-list"
  );

  if (!pendingContainer || !completedContainer) return;

  try {
    const currentUser = await apiGet("/auth/me");
    const roster = await apiGet("/faculty");
    const peerStatuses = await apiGet("/evaluations/peer-status");

    const currentFacultyId = currentUser.linked_faculty_id;

    const colleagues = roster.filter(
      (faculty) =>
        faculty.status === "Active" &&
        Number(faculty.id) !== Number(currentFacultyId)
    );

    const pending = [];
    const completed = [];

    for (const faculty of colleagues) {
      const evalData = peerStatuses.find(
        (item) =>
          Number(item.faculty_id) === Number(faculty.id)
      );

      if (evalData?.status === "evaluated") {
        completed.push({ faculty });
      } else {
        pending.push(faculty);
      }
    }

    pendingContainer.innerHTML =
      pending.length > 0
        ? pending
            .map(
              (faculty) => `
                <div class="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
                  <span class="text-gray-700">
                    ${faculty.name}
                  </span>

                  <button
                    type="button"
                    data-faculty-id="${faculty.id}"
                    class="dashboard-evaluate-btn text-brand font-medium hover:underline"
                  >
                    Evaluate →
                  </button>
                </div>
              `
            )
            .join("")
        : `
            <p class="text-sm text-gray-400">
              All colleagues have been evaluated.
            </p>
          `;

    completedContainer.innerHTML =
      completed.length > 0
        ? completed
            .map(
              ({ faculty }) => `
                <div class="flex items-center py-2 border-b border-gray-100 text-sm">
                  <span class="text-gray-700">
                    ${faculty.name}
                  </span>
                </div>
              `
            )
            .join("")
        : `
            <p class="text-sm text-gray-400">
              No completed evaluations yet.
            </p>
          `;

    const completedSubtitle = document.getElementById(
      "completed-evaluations-subtitle"
    );
    if (completedSubtitle) {
      completedSubtitle.textContent = `Total responses: ${completed.length}`;
    }

    document
      .querySelectorAll(".dashboard-evaluate-btn")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const faculty = colleagues.find(
            (item) =>
              String(item.id) ===
              button.dataset.facultyId
          );

          if (!faculty) return;

          sessionStorage.removeItem(
            "peerEvaluationAnswers"
          );

          sessionStorage.removeItem(
            "peerDraftComment"
          );

          sessionStorage.setItem(
            "evaluatingColleague",
            JSON.stringify(faculty)
          );

          window.location.href =
            "rate-colleague.html";
        });
      });
  } catch (error) {
    console.error(
      "Failed to load peer evaluation lists:",
      error
    );

    pendingContainer.innerHTML = `
      <p class="text-sm text-red-600">
        Unable to load peer evaluations.
      </p>
    `;

    completedContainer.innerHTML = "";
  }
}

async function initFacultyDashboard() {
  try {
    await loadFacultyDashboardData();
    await renderFacultyStatCards();
    await renderEvaluationLists();
  } catch (error) {
    console.error(
      "Failed to load faculty dashboard:",
      error
    );
  }
}

initFacultyDashboard();