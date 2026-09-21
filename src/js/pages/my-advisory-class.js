// ============================================
// FACULTY: MY ADVISORY CLASS PAGE
// ============================================

// --- Cache, fetched once at load and refreshed after every mutation ---
let advisoryAssignmentsCache = [];

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

  container.innerHTML = advisoryAssignmentsCache.map((assignment) => `
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
            ${[...assignment.students]
              .sort((a, b) => {
                const lastNameCompare = (a.last_name || "").localeCompare(
                  b.last_name || "",
                  undefined,
                  { sensitivity: "base" }
                );

                if (lastNameCompare !== 0) return lastNameCompare;

                const firstNameCompare = (a.first_name || "").localeCompare(
                  b.first_name || "",
                  undefined,
                  { sensitivity: "base" }
                );

                if (firstNameCompare !== 0) return firstNameCompare;

                return (a.middle_name || "").localeCompare(
                  b.middle_name || "",
                  undefined,
                  { sensitivity: "base" }
                );
              })
              .map((student) => `
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
              `).join("")}
          </tbody>
        </table>
        ${assignment.students.length === 0 ? `<p class="text-sm text-gray-400 py-2">No students added yet.</p>` : ""}
      </div>

      <div class="flex flex-col sm:flex-row gap-2">
        <input type="text" placeholder="LRN (12 digits)" class="new-student-lrn-input w-full sm:w-40 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent" data-assignment-id="${assignment.id}">
        <input
          type="text"
          placeholder="Last Name"
          class="new-student-last-name-input flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          data-assignment-id="${assignment.id}"
        >

        <input
          type="text"
          placeholder="First Name"
          class="new-student-first-name-input flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          data-assignment-id="${assignment.id}"
        >

        <input
          type="text"
          placeholder="Middle Name"
          class="new-student-middle-name-input flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          data-assignment-id="${assignment.id}"
        >
        <button type="button" class="add-student-btn btn-secondary text-sm px-4" data-assignment-id="${assignment.id}">Add Student</button>
      </div>
    </div>
  `).join("");

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
        message: `Remove "${student.name}" (${student.lrn}) from ${sectionLabel(assignment)}?`,
        confirmLabel: "Remove",
        isDestructive: true,
        onConfirm: async () => {
          await apiDelete(`/advisory/${assignmentId}/students/${studentId}`);
          await loadAdvisoryAssignments();
        }
      });
    });
  });

  document.querySelectorAll(".add-student-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const assignmentId = btn.dataset.assignmentId;
      const lrnInput = document.querySelector(`.new-student-lrn-input[data-assignment-id="${assignmentId}"]`);
      const lastNameInput = document.querySelector(
        `.new-student-last-name-input[data-assignment-id="${assignmentId}"]`
      );
      const firstNameInput = document.querySelector(
        `.new-student-first-name-input[data-assignment-id="${assignmentId}"]`
      );
      const middleNameInput = document.querySelector(
        `.new-student-middle-name-input[data-assignment-id="${assignmentId}"]`
      );

      const lrn = lrnInput.value.trim();
      const lastName = lastNameInput.value.trim();
      const firstName = firstNameInput.value.trim();
      const middleName = middleNameInput.value.trim();

      if (!lrn || !lastName || !firstName) {
        alert("Please enter the LRN, last name, and first name.");
        return;
      }

      try {
        await apiPost(`/advisory/${assignmentId}/students`, {
          lrn,
          last_name: lastName,
          first_name: firstName,
          middle_name: middleName
        });
      } catch (err) {
        // Server validates LRN format and system-wide duplicate LRNs --
        // e.g. "lrn must be exactly 12 digits" or "A student with this
        // LRN already exists".
        alert(err.data && err.data.error ? err.data.error : "Something went wrong. Please try again.");
        return;
      }

      lrnInput.value = "";
      lastNameInput.value = "";
      firstNameInput.value = "";
      middleNameInput.value = "";
      await loadAdvisoryAssignments();
    });
  });
}


loadAdvisoryAssignments();
