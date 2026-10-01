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

function resultCard(label, average, equivalents, hasData) {
  const hasScore = hasData && average !== null && average !== undefined;
  const band = hasScore ? equivalentLabel(equivalents, average) : "";
  return {
    label,
    value: hasScore ? Number(average).toFixed(2) : "—",
    note: hasScore
      ? (band || "Evaluation received")
      : "No evaluations yet"
  };
}

async function renderFacultyStatCards() {
  const container = document.getElementById("faculty-stat-cards");
  if (!container) return;

  const data = facultyDashboardData;

  const [studentBands, peerBands, classroomBands, hrBands] = await Promise.all([
    loadEquivalents("student"),
    loadEquivalents("peerToPeer"),
    loadEquivalents("classroomObservation"),
    loadEquivalents("hrEvaluation"),
  ]);

  const overallPct = data?.weighted_overall_pct ?? null;
  const overallAverage = overallPct !== null ? Number(overallPct) / 20 : null;
  const hasOverall = overallAverage !== null;

  const cards = [
    {
      label: "Overall Rating",
      value: hasOverall ? overallAverage.toFixed(2) : "—",
      note: hasOverall
        ? `${Number(overallPct).toFixed(2)}% weighted score`
        : "No evaluations yet"
    },
    resultCard(
      "Student Evaluation",
      data?.per_type?.student?.average_rating ?? null,
      studentBands,
      (data?.per_type?.student?.count ?? 0) > 0
    ),
    resultCard(
      "Peer Evaluation",
      data?.per_type?.peerToPeer?.average_rating ?? null,
      peerBands,
      (data?.per_type?.peerToPeer?.count ?? 0) > 0
    ),
    resultCard(
      "Classroom Observation",
      data?.per_type?.classroomObservation?.average_rating ?? null,
      classroomBands,
      (data?.per_type?.classroomObservation?.count ?? 0) > 0
    ),
    resultCard(
      "HR Evaluation",
      data?.per_type?.hrEvaluation?.average_rating ?? null,
      hrBands,
      (data?.per_type?.hrEvaluation?.count ?? 0) > 0
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

async function initFacultyDashboard() {
  try {
    await loadFacultyDashboardData();
    await renderFacultyStatCards();
  } catch (error) {
    console.error(
      "Failed to load faculty dashboard:",
      error
    );
  }
}

initFacultyDashboard();