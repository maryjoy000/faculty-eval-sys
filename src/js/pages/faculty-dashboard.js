// ============================================
// FACULTY DASHBOARD PAGE
// ============================================

let facultyDashboardData = null;
let loggedInFacultyId = null;

async function loadFacultyDashboardData() {
  const currentUser = await apiGet("/auth/me");

  loggedInFacultyId = currentUser.linked_faculty_id;

  try {
    facultyDashboardData = await apiGet(
      `/evaluations/${loggedInFacultyId}`
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

async function renderFacultyStatCards() {
  const container = document.getElementById("faculty-stat-cards");
  if (!container) return;

  const data = facultyDashboardData;

  const overallRating =
    data?.weighted_overall_rating ?? null;

  const overallPct =
    data?.weighted_overall_pct ?? null;

  const studentRating =
    data?.per_type?.student?.average_rating ?? null;

  const peerRating =
    data?.per_type?.peerToPeer?.average_rating ?? null;

  const peerCount =
    data?.per_type?.peerToPeer?.count ?? 0;

  const cards = [
    {
      label: "Overall Rating",
      value:
        overallRating !== null
          ? Number(overallRating).toFixed(2)
          : "—",
      note:
        overallPct !== null
          ? `${Number(overallPct).toFixed(2)}% weighted score`
          : "Available after report release"
    },
    {
      label: "Peer Evaluation",
      value:
        peerRating !== null
          ? Number(peerRating).toFixed(2)
          : peerCount > 0
            ? "Submitted"
            : "—",
      note:
        peerCount > 0
          ? "Peer evaluation received"
          : "No peer evaluation yet"
    },
    {
      label: "Student Evaluation",
      value:
        studentRating !== null
          ? Number(studentRating).toFixed(2)
          : "—",
      note:
        studentRating !== null
          ? "Student evaluation received"
          : "Available after report release"
    }
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

async function renderFacultyStatCards() {
  const container = document.getElementById("faculty-stat-cards");
  if (!container) return;

  const data = facultyDashboardData;

  let submittedPeerEvaluations = 0;
  let totalPeerEvaluations = 0;

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

    totalPeerEvaluations = colleagues.length;

    submittedPeerEvaluations = colleagues.filter((faculty) => {
      const status = peerStatuses.find(
        (item) =>
          Number(item.faculty_id) === Number(faculty.id)
      );

      return status?.status === "evaluated";
    }).length;
  } catch (error) {
    console.error(
      "Failed to load peer evaluation progress:",
      error
    );
  }
  const overallPct =
    data?.weighted_overall_pct ?? null;

  const overallRating =
    overallPct !== null
      ? Number(overallPct) / 20
      : null;

  const studentRating =
    data?.per_type?.student?.average_rating ?? null;

  const cards = [
    {
      label: "Overall Rating",
      value:
        overallRating !== null
          ? `${Number(overallRating).toFixed(2)}`
          : "—",
      note:
        overallPct !== null
          ? `${Number(overallPct).toFixed(2)}% weighted score`
          : "Available after report release"
    },
    {
      label: "Peer Evaluations",
      value: `${submittedPeerEvaluations} / ${totalPeerEvaluations}`,
      note:
        totalPeerEvaluations > 0
          ? `${submittedPeerEvaluations} submitted`
          : "No colleagues available"
    },
    {
      label: "Student Evaluation",
      value:
        studentRating !== null
          ? Number(studentRating).toFixed(2)
          : "—",
      note:
        studentRating !== null
          ? "Student evaluation received"
          : "Available after report release"
    }
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
        try {
          const result = await apiGet(
            `/evaluations/peer-status/${faculty.id}`
          );

          completed.push({
            faculty,
            score: result.overall_average
          });
        } catch (error) {
          console.error(
            `Failed to load peer result for faculty ${faculty.id}:`,
            error
          );

          completed.push({
            faculty,
            score: null
          });
        }
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
              ({ faculty, score }) => `
                <div class="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
                  <span class="text-gray-700">
                    ${faculty.name}
                  </span>

                  <span class="text-green-600 font-medium">
                    ${
                      score !== null
                        ? Number(score).toFixed(2)
                        : "—"
                    }
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