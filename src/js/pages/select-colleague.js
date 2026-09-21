// ============================================
// FACULTY: SELECT COLLEAGUE PAGE
// ============================================

async function getColleagueEvaluationStatus(facultyId) {
  try {
    const summary = await apiGet(`/evaluations/${facultyId}`);

    return {
      status: summary.peer_evaluation_completed
        ? "evaluated"
        : "not-evaluated",
      rating: summary.overall_average || 0,
      average: summary.overall_average || 0
    };
  } catch (error) {
    console.error(
      `Failed to load evaluation status for faculty ${facultyId}:`,
      error
    );

    return {
      status: "not-evaluated",
      rating: 0
    };
  }
}

async function renderColleagueTable() {
  const tableBody = document.getElementById("colleague-table-body");
  if (!tableBody) return;

  try {
    const currentUser = await apiGet("/auth/me");
    const roster = await apiGet("/faculty");
    const peerStatuses = await apiGet("/evaluations/peer-status");

    const currentFacultyId = currentUser.linked_faculty_id;
    console.log("Current user:", currentUser);
    console.log("Current faculty ID:", currentFacultyId);
    const colleagues = roster.filter(
      (faculty) =>
        faculty.status === "Active" &&
        Number(faculty.id) !== Number(currentFacultyId)
    );

    tableBody.innerHTML = colleagues.map((faculty) => {
    const evalData =
      peerStatuses.find(
        (item) => Number(item.faculty_id) === Number(faculty.id)
      ) || {
        status: "not-evaluated",
        rating: 0
      };      
    const isEvaluated = evalData.status === "evaluated";

      const statusLabel = isEvaluated
        ? "Evaluated"
        : "Not yet evaluated";

      const statusClass = isEvaluated
        ? "text-green-600 font-medium"
        : "text-brand font-medium";

      const actionButtonHtml = isEvaluated
        ? `<button data-faculty-id="${faculty.id}" class="view-results-btn btn-secondary text-sm px-4 py-1.5">View Results</button>`
        : `<button data-faculty-id="${faculty.id}" class="evaluate-btn btn-primary text-sm px-4 py-1.5">Evaluate</button>`;

      return `
        <tr class="border-b border-gray-200 last:border-0">
          <td class="py-3 pr-4">${faculty.name}</td>
          <td class="py-3 pr-4 ${statusClass}">${statusLabel}</td>
          <td class="py-3">${actionButtonHtml}</td>
        </tr>
      `;
    }).join("");

    document.querySelectorAll(".evaluate-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const faculty = colleagues.find(
          (f) => String(f.id) === btn.dataset.facultyId
        );

        sessionStorage.removeItem("peerEvaluationAnswers");
        sessionStorage.removeItem("peerDraftComment");
        sessionStorage.setItem(
          "evaluatingColleague",
          JSON.stringify(faculty)
        );

        window.location.href = "rate-colleague.html";
      });
    });

    document.querySelectorAll(".view-results-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const faculty = colleagues.find(
          (f) => String(f.id) === btn.dataset.facultyId
        );

        showResultsModal(faculty);
      });
    });

  } catch (error) {
    console.error("Failed to load colleague list:", error);

    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="py-4 text-center text-red-600">
          Unable to load faculty members.
        </td>
      </tr>
    `;
  }
}


async function showResultsModal(faculty) {
  try {
    const evalData = await apiGet(
      `/evaluations/peer-status/${faculty.id}`
    );

    const modalBody =
      document.getElementById("results-modal-body");

    const categoryRowsHtml =
      (evalData.categoryScores || []).map((cat) => `
        <div class="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
          <span class="text-gray-700">${cat.title}</span>
          <span class="font-medium text-gray-800">
            ${cat.average.toFixed(2)}
          </span>
        </div>
      `).join("");

    const averageDisplay =
      typeof evalData.overall_average === "number"
        ? evalData.overall_average.toFixed(2)
        : "N/A";

    modalBody.innerHTML = `
      <h3 class="font-semibold text-gray-800 mb-1">
        ${faculty.name}
      </h3>

      <p class="text-xs text-gray-400 mb-4">
        Submitted: ${evalData.submitted_at || "--"}
      </p>

      ${categoryRowsHtml}

      <div class="flex items-center justify-between pt-3 mt-2 border-t border-gray-300">
        <span class="font-semibold text-gray-800">
          Overall Average
        </span>
        <span class="font-bold text-brand">
          ${averageDisplay}
        </span>
      </div>

      <div class="mt-4">
        <p class="text-sm font-medium text-gray-700 mb-1">
          Your Comments:
        </p>

        <p class="text-sm text-gray-600 italic">
          ${evalData.comments || "No comments provided."}
        </p>
      </div>
    `;

    document
      .getElementById("results-modal")
      .classList.remove("hidden");

  } catch (error) {
    console.error(
      "Failed to load peer evaluation result:",
      error
    );

    alert(
      error?.message ||
      "Unable to load the peer evaluation results."
    );
  }
}

function attachResultsModalListeners() {
  const modal = document.getElementById("results-modal");
  const backdrop = document.getElementById("results-modal-backdrop");
  const closeBtn = document.getElementById("close-results-modal-btn");

  function closeModal() { modal.classList.add("hidden"); }
  backdrop.addEventListener("click", closeModal);
  closeBtn.addEventListener("click", closeModal);
}

function renderAnnouncementBanner() {
  const banner = document.getElementById("announcement-banner");
  if (!banner) return;
  const announcement = getAnnouncement();
  if (announcement.isActive && announcement.message) {
    banner.textContent = announcement.message;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

document.getElementById("academic-year-display").textContent = getAcademicYearDisplay();
renderAnnouncementBanner();
renderColleagueTable();
attachResultsModalListeners();