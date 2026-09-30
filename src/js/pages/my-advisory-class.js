// ============================================
// FACULTY: MY ADVISORY CLASS PAGE
// ============================================

// --- Cache, fetched once at load and refreshed after every mutation ---
let advisoryAssignmentsCache = [];

// Per-section pagination state: { [assignmentId]: { page, perPage } }
// Survives re-renders so paging one section does not reset the others.
var advisoryPaginationStates = {};

function getAdvisoryPageState(assignmentId) {
  const key = String(assignmentId);
  if (!advisoryPaginationStates[key]) {
    advisoryPaginationStates[key] = { page: 1, perPage: 10 };
  }
  return advisoryPaginationStates[key];
}

function sortAdvisoryStudents(students) {
  return [...(students || [])].sort((a, b) => {
    const lastNameCompare = (a.last_name || "").localeCompare(b.last_name || "", undefined, {
      sensitivity: "base",
    });
    if (lastNameCompare !== 0) return lastNameCompare;

    const firstNameCompare = (a.first_name || "").localeCompare(b.first_name || "", undefined, {
      sensitivity: "base",
    });
    if (firstNameCompare !== 0) return firstNameCompare;

    return (a.middle_name || "").localeCompare(b.middle_name || "", undefined, {
      sensitivity: "base",
    });
  });
}

async function loadAdvisoryAssignments() {
  advisoryAssignmentsCache = await apiGet("/advisory");
  renderAdvisoryClasses();
}

function sectionLabel(assignment) {
  return `${assignment.grade_level} ${assignment.section_name}`;
}

function renderAdvisoryClasses() {
  const container = document.getElementById("advisory-classes-container");

  if (advisoryAssignmentsCache.length === 0) {
    container.innerHTML = `<p class="text-sm text-gray-400 text-center py-6">No advisory sections added yet.</p>`;
    return;
  }

  container.innerHTML = advisoryAssignmentsCache.map((assignment) => {
    const sortedStudents = sortAdvisoryStudents(assignment.students);
    const pageState = getAdvisoryPageState(assignment.id);
    const usePagination =
      typeof TablePagination !== "undefined" && TablePagination.paginateArray;

    let pageStudents = sortedStudents;
    if (usePagination && sortedStudents.length > 0) {
      const totalPages = TablePagination.getTotalPages(sortedStudents.length, pageState.perPage);
      pageState.page = TablePagination.clampPage(pageState.page, totalPages);
      pageStudents = TablePagination.paginateArray(sortedStudents, pageState.page, pageState.perPage);
    }

    const rowsHtml = pageStudents
      .map(
        (student) => `
                <tr class="border-b border-gray-100 last:border-0">
                  <td class="py-1.5 pr-4">${student.lrn}</td>
                  <td class="py-1.5 pr-4">
                    ${student.last_name}, ${student.first_name}${student.middle_name ? ` ${student.middle_name}` : ""}
                  </td>
                  <td class="py-1.5">
                    <button
                      type="button"
                      class="remove-student-btn text-gray-400 hover:text-red-500"
                      data-assignment-id="${assignment.id}"
                      data-student-id="${student.id}"
                    >✕</button>
                  </td>
                </tr>
              `
      )
      .join("");

    return `
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5" data-assignment-id="${assignment.id}">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-gray-800">${sectionLabel(assignment)}</h3>
      </div>

      <div class="overflow-x-auto mb-3">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-gray-200 text-gray-600">
              <th class="py-1.5 pr-4 font-medium">LRN</th>
              <th class="py-1.5 pr-4 font-medium">Student Name</th>
              <th class="py-1.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        ${assignment.students.length === 0 ? `<p class="text-sm text-gray-400 py-2">No students added yet.</p>` : ""}
        <div id="advisory-pagination-${assignment.id}"></div>
      </div>

      <div class="flex flex-col sm:flex-row gap-2">
        <input type="text" inputmode="numeric" maxlength="12" placeholder="LRN (12 digits)" class="new-student-lrn-input w-full sm:w-40 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent" data-assignment-id="${assignment.id}">
        <button type="button" class="add-student-btn btn-secondary text-sm px-4 disabled:opacity-40 disabled:cursor-not-allowed" data-assignment-id="${assignment.id}" disabled>Add Student</button>
      </div>
      <p class="lookup-result text-sm mt-2" data-assignment-id="${assignment.id}"><span class="text-gray-400">Type the 12-digit LRN from the enrollment master list — no need to type the name.</span></p>
    </div>
  `;
  }).join("");

  // Render one pagination control per section (client-side, 10 / 25 / 50).
  if (typeof TablePagination !== "undefined" && TablePagination.renderPagination) {
    advisoryAssignmentsCache.forEach((assignment) => {
      const holder = document.getElementById(`advisory-pagination-${assignment.id}`);
      if (!holder) return;
      const total = (assignment.students || []).length;
      if (total === 0) {
        holder.innerHTML = "";
        return;
      }
      const pageState = getAdvisoryPageState(assignment.id);
      TablePagination.renderPagination(holder, {
        page: pageState.page,
        totalItems: total,
        perPage: pageState.perPage,
        onPageChange: (newPage) => {
          pageState.page = newPage;
          renderAdvisoryClasses();
        },
        onPerPageChange: (newSize) => {
          pageState.perPage = newSize;
          pageState.page = 1;
          renderAdvisoryClasses();
        },
      });
    });
  }

  attachAdvisoryClassListeners();
}

function attachAdvisoryClassListeners() {
  document.querySelectorAll(".remove-student-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const assignmentId = btn.dataset.assignmentId;
      const studentId = btn.dataset.studentId;
      const assignment = advisoryAssignmentsCache.find((a) => String(a.id) === assignmentId);
      const student = assignment.students.find((s) => String(s.id) === studentId);

      showConfirmModal({
        title: "Remove Student?",
        message: `Remove "${student.name}" (${student.lrn}) from ${sectionLabel(assignment)}? They will stay in the enrollment master list.`,
        confirmLabel: "Remove",
        isDestructive: true,
        onConfirm: async () => {
          await apiDelete(`/advisory/${assignmentId}/students/${studentId}`);
          await loadAdvisoryAssignments();
        }
      });
    });
  });

  // Placement lookup state per section: only an LRN that resolves to an
  // enrolled, unplaced student enables its Add button.
  const placeableLrn = {};

  function setLookupMessage(assignmentId, html) {
    const holder = document.querySelector(
      `.lookup-result[data-assignment-id="${assignmentId}"]`
    );
    if (holder) holder.innerHTML = html;
  }

  function setAddEnabled(assignmentId, enabled) {
    const btn = document.querySelector(
      `.add-student-btn[data-assignment-id="${assignmentId}"]`
    );
    if (btn) btn.disabled = !enabled;
  }

  function escapeLookupText(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  document.querySelectorAll(".new-student-lrn-input").forEach((lrnInput) => {
    lrnInput.addEventListener("input", async () => {
      const assignmentId = lrnInput.dataset.assignmentId;
      const lrn = lrnInput.value.replace(/\D/g, "").slice(0, 12);

      if (lrnInput.value !== lrn) lrnInput.value = lrn;

      delete placeableLrn[assignmentId];
      setAddEnabled(assignmentId, false);

      if (lrn.length === 0) {
        setLookupMessage(
          assignmentId,
          `<span class="text-gray-400">Type the 12-digit LRN from the enrollment master list — no need to type the name.</span>`
        );
        return;
      }

      if (lrn.length !== 12) return;

      setLookupMessage(
        assignmentId,
        `<span class="text-gray-400">Looking up LRN ${escapeLookupText(lrn)}…</span>`
      );

      let found = null;

      try {
        found = await apiGet(
          `/advisory/lookup-student?lrn=${encodeURIComponent(lrn)}`
        );
      } catch (error) {
        // A newer keystroke already fired another lookup — ignore this one.
        if (lrnInput.value !== lrn) return;

        setLookupMessage(
          assignmentId,
          `<span class="text-red-500">${escapeLookupText(
            (error.data && error.data.error) ||
              "No enrolled student with this LRN."
          )}</span>`
        );
        return;
      }

      if (!found) return;

      // A newer keystroke already fired another lookup — ignore this one.
      if (lrnInput.value !== lrn) return;

      if (
        found.advisory_assignment_id !== null &&
        found.advisory_assignment_id !== undefined &&
        String(found.advisory_assignment_id) === String(assignmentId)
      ) {
        setLookupMessage(
          assignmentId,
          `<span class="text-gray-500">${escapeLookupText(found.name)} is already in this section.</span>`
        );
        return;
      }

      if (found.assigned_section) {
        setLookupMessage(
          assignmentId,
          `<span class="text-amber-600">${escapeLookupText(found.name)} is already assigned to ${escapeLookupText(
            found.assigned_section
          )}.</span>`
        );
        return;
      }

      placeableLrn[assignmentId] = lrn;
      setAddEnabled(assignmentId, true);
      setLookupMessage(
        assignmentId,
        `<span class="text-green-600 font-medium">${escapeLookupText(found.name)} (${escapeLookupText(found.lrn)})</span>
         <span class="text-gray-500"> — ready to place in this section.</span>`
      );
    });
  });

  document.querySelectorAll(".add-student-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const assignmentId = btn.dataset.assignmentId;
      const lrnInput = document.querySelector(`.new-student-lrn-input[data-assignment-id="${assignmentId}"]`);
      const lrn = (lrnInput ? lrnInput.value : "").trim();

      if (!lrn || placeableLrn[assignmentId] !== lrn) {
        alert("Look up a valid unplaced LRN from the enrollment master list first.");
        return;
      }

      try {
        await apiPost(`/advisory/${assignmentId}/students`, { lrn });
      } catch (err) {
        alert(err.data && err.data.error ? err.data.error : "Something went wrong. Please try again.");
        return;
      }

      delete placeableLrn[assignmentId];
      await loadAdvisoryAssignments();
    });
  });
}


loadAdvisoryAssignments();
