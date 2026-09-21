// ============================================
// FACULTY MANAGEMENT PAGE
// ============================================

function mountPageContent() {
  const template = document.getElementById("page-content-template");
  const slot = document.getElementById("admin-page-content");

  if (template && slot) {
    slot.appendChild(template.content.cloneNode(true));
  }
}

// --- Cache, fetched once at load and refreshed after every mutation ---
let advisoryAssignmentsCache = [];

async function loadFacultyRoster() {
  facultyRosterCache = await apiGet("/faculty");
  advisoryAssignmentsCache = await apiGet("/advisory");
  renderFacultyManagementTable();
}

function getFacultyAdvisories(facultyId) {
  return advisoryAssignmentsCache.filter(
    (assignment) =>
      assignment.faculty_id !== null &&
      String(assignment.faculty_id) === String(facultyId)
  );
}

function getFilteredFaculty() {
  const searchInput = document.getElementById("search-input");
  const statusFilter = document.getElementById("status-filter");

  const searchTerm = (searchInput?.value || "").trim().toLowerCase();
  const selectedStatus = (statusFilter?.value || "active").toLowerCase();

  return facultyRosterCache.filter((faculty) => {
    const facultyName = String(faculty.name || "").toLowerCase();

    const subjects = (faculty.subjects || [])
      .map((subject) => {
        if (typeof subject === "string") {
          return subject;
        }

        return (
          subject.name ||
          subject.subject_name ||
          subject.code ||
          ""
        );
      })
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      facultyName.includes(searchTerm) ||
      subjects.includes(searchTerm);

    const facultyStatus = String(faculty.status || "").toLowerCase();

    const matchesStatus =
      selectedStatus === "all" ||
      (selectedStatus === "active" && facultyStatus === "active") ||
      (selectedStatus === "archived" && facultyStatus === "archived");

    return matchesSearch && matchesStatus;
  });
}

function exportFacultyList() {
  const facultyToExport = getFilteredFaculty();

  if (facultyToExport.length === 0) {
    alert("There are no faculty records to export.");
    return;
  }

  const headers = [
    "Faculty Name",
    "Current Subject",
    "Status"
  ];

  const rows = facultyToExport.map((faculty) => {
    const subjects = (faculty.subjects || [])
      .map((subject) =>
        subject.name ||
        subject.subject_name ||
        subject.code ||
        ""
      )
      .filter(Boolean)
      .join(", ");

    return [
      faculty.name || "",
      subjects,
      faculty.status || ""
    ];
  });

  const csvContent = [
    headers,
    ...rows
  ]
    .map((row) =>
      row
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `faculty-list-${new Date().toISOString().slice(0, 10)}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function renderFacultyManagementTable() {
  const tableBody = document.getElementById("faculty-management-table-body");
  if (!tableBody) return;

  const filteredFaculty = getFilteredFaculty();

  if (filteredFaculty.length === 0) {
    tableBody.innerHTML = `
      <tr><td colspan="6" class="py-6 text-center text-gray-400">No faculty found.</td></tr>
    `;
    return;
  }

  tableBody.innerHTML = filteredFaculty.map((faculty) => {
    const sections = getFacultySections(faculty).map(
      (section) => `${section.grade_level} ${section.name}`
    );
    const advisories = getFacultyAdvisories(faculty.id);
    const isArchived = faculty.status === "Archived";

    return `
      <tr class="border-b border-gray-200 last:border-0 ${isArchived ? "text-gray-400" : ""}">
        <td class="py-3 pr-4">${faculty.name}</td>
        <td class="py-3 pr-4">${faculty.subjects.map((s) => s.name).join(", ")}</td>
        <td class="py-3 pr-4">${sections.length > 0 ? sections.join(", ") : "—"}</td>
        <td class="py-3 pr-4">${advisories.length > 0 ? advisories.map((a) => `${a.grade_level} ${a.section_name}`).join(", ") : "—"}</td>
        <td class="py-3 pr-4 font-medium ${isArchived ? "text-gray-400" : "text-green-600"}">${faculty.status}</td>
        <td class="py-3">
          <button
            type="button"
            class="actions-toggle-btn text-gray-500 hover:text-gray-700 px-2"
            data-faculty-id="${faculty.id}"
          >
            •••
          </button>
        </td>
      </tr>
    `;
  }).join("");

  attachDropdownListeners();
}

function attachDropdownListeners() {
  const dropdown = document.getElementById("shared-actions-dropdown");
  const toggleButtons = document.querySelectorAll(".actions-toggle-btn");

  toggleButtons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();

      const isOpeningSameButton = dropdown.dataset.openFor === btn.dataset.facultyId && !dropdown.classList.contains("hidden");

      if (isOpeningSameButton) {
        dropdown.classList.add("hidden");
        return;
      }

      const buttonRect = btn.getBoundingClientRect();
      dropdown.style.top = `${buttonRect.bottom + 4}px`;
      dropdown.style.left = `${buttonRect.right - 176}px`;

      dropdown.dataset.openFor = btn.dataset.facultyId;

      const faculty = facultyRosterCache.find((f) => String(f.id) === btn.dataset.facultyId);
      const archiveLink = dropdown.querySelector('a[data-action="archive"]');
      if (faculty && archiveLink) {
        archiveLink.textContent = faculty.status === "Archived" ? "Restore" : "Archive";
      }

      dropdown.classList.remove("hidden");
    });
  });

  document.addEventListener("click", () => {
    dropdown.classList.add("hidden");
  });

  window.addEventListener("scroll", () => {
    dropdown.classList.add("hidden");
  }, true);
}

let currentlyEditingFacultyId = null;

function attachDropdownActionListeners() {
  const dropdown = document.getElementById("shared-actions-dropdown");

  dropdown.querySelector('a[data-action="view-report"]').addEventListener("click", (event) => {
    event.preventDefault();
    const facultyId = dropdown.dataset.openFor;
    window.location.href = `reports.html?facultyId=${facultyId}`;
  });

  dropdown.querySelector('a[data-action="edit-details"]').addEventListener("click", (event) => {
    event.preventDefault();
    const facultyId = dropdown.dataset.openFor;
    dropdown.classList.add("hidden");
    openEditDetailsModal(facultyId);
  });

  dropdown.querySelector('a[data-action="archive"]').addEventListener("click", (event) => {
    event.preventDefault();
    const facultyId = dropdown.dataset.openFor;
    const faculty = facultyRosterCache.find((f) => String(f.id) === facultyId);
    if (!faculty) return;

    dropdown.classList.add("hidden");

    const isCurrentlyArchived = faculty.status === "Archived";
    const newStatus = isCurrentlyArchived ? "Active" : "Archived";

    showConfirmModal({
      title: isCurrentlyArchived ? "Restore Faculty?" : "Archive Faculty?",
      message: isCurrentlyArchived
        ? `"${faculty.name}" will be restored to Active status.`
        : `"${faculty.name}" will be moved to Archived status. Their records stay in the system and can be restored later.`,
      confirmLabel: isCurrentlyArchived ? "Restore" : "Archive",
      isDestructive: !isCurrentlyArchived,
      onConfirm: async () => {
        await apiPut(`/faculty/${facultyId}`, { status: newStatus });
        await loadFacultyRoster();
      }
    });
  });
}

// --- Edit Details modal (subjects + sections) ---
function openEditDetailsModal(facultyId) {
  currentlyEditingFacultyId = facultyId;
  const faculty = facultyRosterCache.find((f) => String(f.id) === facultyId);
  if (!faculty) return;

  document.getElementById("edit-details-faculty-name").textContent = faculty.name;
  renderEditSubjectsList(faculty);
  renderEditSectionsList(faculty);
  renderAdvisoryClassSelect(faculty);
  document.getElementById("edit-details-modal").classList.remove("hidden");
}

function renderAdvisoryClassSelect(faculty) {
  const select = document.getElementById("advisory-class-select");
  const list = document.getElementById("advisory-class-list");

  if (!select || !list) return;

  // All advisory classes currently assigned to this faculty
  const currentAdvisories = advisoryAssignmentsCache.filter(
    (assignment) =>
      assignment.faculty_id !== null &&
      String(assignment.faculty_id) === String(faculty.id)
  );

  // Display current advisories
  list.innerHTML = currentAdvisories.length
    ? currentAdvisories
        .map(
          (advisory) => `
            <div class="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
              <span class="text-sm text-gray-700">
                ${advisory.grade_level} ${advisory.section_name}
              </span>

              <button
                type="button"
                class="remove-advisory-class text-xs text-red-500 hover:text-red-700"
                data-advisory-id="${advisory.id}"
              >
                Remove
              </button>
            </div>
          `
        )
        .join("")
    : `
        <div class="text-sm text-gray-400">
          No advisory class assigned.
        </div>
      `;

  // Sections handled by this faculty
  const sections = getFacultySections(faculty).map(
    (section) => `${section.grade_level} ${section.name}`
  );

  // Sections already advised by another faculty
  const assignedToAnotherAdviser = new Set(
    advisoryAssignmentsCache
      .filter(
        (assignment) =>
          assignment.faculty_id !== null &&
          String(assignment.faculty_id) !== String(faculty.id)
      )
      .map(
        (assignment) =>
          `${assignment.grade_level} ${assignment.section_name}`
      )
  );

  // Current advisories of this faculty
  const assignedToThisFaculty = new Set(
    currentAdvisories.map(
      (assignment) =>
        `${assignment.grade_level} ${assignment.section_name}`
    )
  );

  // Only show available sections in the Add dropdown
  select.innerHTML = `
    <option value="">Select advisory class</option>
    ${sections
      .filter(
        (section) =>
          !assignedToAnotherAdviser.has(section) &&
          !assignedToThisFaculty.has(section)
      )
      .map((section) => `
        <option value="${section}">
          ${section}
        </option>
      `)
      .join("")}
  `;

  list.querySelectorAll(".remove-advisory-class").forEach((button) => {
    button.addEventListener("click", async () => {
      const advisoryId = button.dataset.advisoryId;

      if (!advisoryId) return;

      const confirmed = confirm(
        "Remove this faculty member as adviser of this section?"
      );

      if (!confirmed) return;

      try {
        await apiPut(`/advisory/${advisoryId}`, {
          faculty_id: null
        });

        advisoryAssignmentsCache = await apiGet("/advisory");

        renderAdvisoryClassSelect(faculty);
        renderFacultyManagementTable();
      } catch (error) {
        console.error("Failed to remove advisory:", error);
        alert(error.message || "Failed to remove advisory.");
      }
    });
  });
}

async function saveAdvisoryAssignment(faculty) {
  const select = document.getElementById("advisory-class-select");
  if (!select) return;

  const selectedSection = select.value;

  // Nothing selected — do not change existing advisories.
  // We will handle individual removal when we redesign the UI.
  if (!selectedSection) {
    return;
  }

  const parts = selectedSection.split(" ");
  const gradeLevel = parts.shift();
  const sectionName = parts.join(" ");

  // Check whether this exact advisory already belongs to this faculty.
  const existingForThisFaculty = advisoryAssignmentsCache.find(
    (assignment) =>
      assignment.faculty_id !== null &&
      String(assignment.faculty_id) === String(faculty.id) &&
      assignment.grade_level === gradeLevel &&
      assignment.section_name === sectionName
  );

  if (existingForThisFaculty) {
    return;
  }

  // Check whether this section already has an adviser.
  const existingForSection = advisoryAssignmentsCache.find(
    (assignment) =>
      assignment.grade_level === gradeLevel &&
      assignment.section_name === sectionName
  );

  if (existingForSection) {
    if (existingForSection.faculty_id === null) {
      // Reuse the existing unassigned advisory record.
      await apiPut(`/advisory/${existingForSection.id}`, {
        faculty_id: faculty.id
      });
      return;
    }

    throw new Error("This section already has an adviser.");
  }

  // Create a new advisory assignment.
  await apiPost("/advisory", {
    faculty_id: faculty.id,
    grade_level: gradeLevel,
    section_name: sectionName
  });
}

function renderEditSubjectsList(faculty) {
  const container = document.getElementById("edit-subjects-list-container");

  container.innerHTML = faculty.subjects.length > 0
    ? faculty.subjects.map((subject, index) => `
        <div class="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
          <span class="text-sm text-gray-700">${subject.name}</span>
          <button type="button" class="remove-subject-btn text-gray-400 hover:text-red-500" data-subject-index="${index}">✕</button>
        </div>
      `).join("")
    : `<p class="text-sm text-gray-400">No subjects assigned yet.</p>`;

  container.querySelectorAll(".remove-subject-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = facultyRosterCache.find((f) => String(f.id) === currentlyEditingFacultyId);
      const updatedSubjects = target.subjects.filter((_, i) => i !== Number(btn.dataset.subjectIndex));

      const updated = await apiPut(`/faculty/${currentlyEditingFacultyId}`, { subjects: updatedSubjects });
      await loadFacultyRoster();
      renderEditSubjectsList(updated);
    });
  });
}

function renderEditSectionsList(faculty) {
  const container = document.getElementById("section-list");
  const sections = getFacultySections(faculty);

  container.innerHTML = sections.length > 0
    ? sections.map((section, index) => `
        <span class="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm px-3 py-1 rounded-full">
          ${section.grade_level} ${section.name}
          <button type="button" class="remove-section-btn text-gray-400 hover:text-red-500" data-section-index="${index}">✕</button>
        </span>
      `).join("")
    : `<p class="text-sm text-gray-400">No sections assigned yet.</p>`;

  container.querySelectorAll(".remove-section-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = facultyRosterCache.find(
        (f) => String(f.id) === currentlyEditingFacultyId
      );

      const updatedSections = getFacultySections(target).filter(
        (_, i) => i !== Number(btn.dataset.sectionIndex)
      );

      const updated = await apiPut(
        `/faculty/${currentlyEditingFacultyId}`,
        { sections: updatedSections }
      );

      await loadFacultyRoster();
      renderEditSectionsList(updated);
    });
  });
}

function attachAddSubjectListener() {
  document.getElementById("add-subject-btn").addEventListener("click", async () => {
    const input = document.getElementById("new-subject-input");
    const newSubjectName = input.value.trim();
    if (!newSubjectName) return;

    const target = facultyRosterCache.find((f) => String(f.id) === currentlyEditingFacultyId);
    if (!target) return;

    const code = `${newSubjectName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase()}${100 + target.subjects.length}`;
    const updatedSubjects = [...target.subjects, { code, name: newSubjectName }];

    const updated = await apiPut(`/faculty/${currentlyEditingFacultyId}`, { subjects: updatedSubjects });

    input.value = "";
    await loadFacultyRoster();
    renderEditSubjectsList(updated);
  });
}

function attachAddSectionListener() {
  document.getElementById("add-section-btn").addEventListener("click", async () => {
    const gradeLevel = document.getElementById("section-grade-level").value.trim();
    const sectionType = document.getElementById("section-type").value.trim();
    const sectionName = document.getElementById("section-name").value.trim();

    if (!gradeLevel || !sectionType || !sectionName) return;

    const target = facultyRosterCache.find(
      (f) => String(f.id) === currentlyEditingFacultyId
    );
    if (!target) return;

    const newSection = {
      grade_level: gradeLevel,
      name: `${sectionType} ${sectionName}`
    };

    const updatedSections = [
      ...target.sections,
      newSection
    ];

    const updated = await apiPut(
      `/faculty/${currentlyEditingFacultyId}`,
      { sections: updatedSections }
    );

    document.getElementById("section-grade-level").value = "";
    document.getElementById("section-type").value = "";
    document.getElementById("section-name").value = "";

    await loadFacultyRoster();
    renderEditSectionsList(updated);
  });
}

function attachEditDetailsCloseListener() {
  function closeModal() {
    document.getElementById("edit-details-modal").classList.add("hidden");
    document.getElementById("new-subject-input").value = "";
    document.getElementById("section-grade-level").value = "";
    document.getElementById("section-type").value = "";
    document.getElementById("section-name").value = "";
    currentlyEditingFacultyId = null;
  }

  document.getElementById("close-edit-details-btn").addEventListener("click", async () => {
    const faculty = facultyRosterCache.find(
      (f) => String(f.id) === String(currentlyEditingFacultyId)
    );

    if (!faculty) {
      closeModal();
      return;
    }

    await saveAdvisoryAssignment(faculty);

    await loadFacultyRoster();

    closeModal();
  });
  document.getElementById("edit-details-modal-backdrop").addEventListener("click", closeModal);
}

function attachFilterListeners() {
  const searchInput = document.getElementById("search-input");
  const statusFilter = document.getElementById("status-filter");

  if (searchInput) {
    searchInput.addEventListener("input", renderFacultyManagementTable);
  }
  if (statusFilter) {
    statusFilter.addEventListener("change", renderFacultyManagementTable);
  }
}

// --- Add Faculty modal ---
function attachAddFacultyModalListeners() {
  const modal = document.getElementById("add-faculty-modal");
  const backdrop = document.getElementById("modal-backdrop");
  const openBtn = document.getElementById("add-faculty-btn");
  const cancelBtn = document.getElementById("cancel-add-faculty");
  const form = document.getElementById("add-faculty-form");
  const subjectContainer = document.getElementById("subject-inputs-container");
  const addSubjectBtn = document.getElementById("add-subject-field-btn");

  function openModal() {
    modal.classList.remove("hidden");
  }

  function resetSubjectInputs() {
    subjectContainer.innerHTML = `
      <div class="flex gap-2">
        <input
          type="text" class="subject-input flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          placeholder="e.g. Programming"
        >
      </div>
    `;
  }

  function closeModal() {
    modal.classList.add("hidden");
    form.reset();
    resetSubjectInputs();
  }

  addSubjectBtn.addEventListener("click", () => {
    const newRow = document.createElement("div");
    newRow.className = "flex gap-2";
    newRow.innerHTML = `
      <input
        type="text" class="subject-input flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
        placeholder="e.g. Database Systems"
      >
      <button type="button" class="remove-subject-btn text-gray-400 hover:text-red-500 px-2">✕</button>
    `;
    subjectContainer.appendChild(newRow);

    newRow.querySelector(".remove-subject-btn").addEventListener("click", () => {
      newRow.remove();
    });
  });

  openBtn.addEventListener("click", openModal);
  cancelBtn.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const subjectInputs = document.querySelectorAll(".subject-input");
    const subjectNames = Array.from(subjectInputs)
      .map((input) => input.value.trim())
      .filter((value) => value !== "");

    const subjects = subjectNames.map((name, index) => ({
      code: `${name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase()}${100 + index}`,
      name
    }));

    await apiPost("/faculty", {
      first_name: document.getElementById("new-faculty-first-name").value.trim(),
      middle_initial: document.getElementById("new-faculty-mi").value.trim(),
      last_name: document.getElementById("new-faculty-last-name").value.trim(),
      subjects,
      sections: []
    });

    closeModal();
    await loadFacultyRoster();
  });
}

mountPageContent();
loadFacultyRoster();
attachFilterListeners();
attachAddFacultyModalListeners();
attachDropdownActionListeners();
attachAddSubjectListener();
attachAddSectionListener();
attachEditDetailsCloseListener();

const exportBtn = document.getElementById("export-btn");

if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    const facultyToExport = getFilteredFaculty();

    if (facultyToExport.length === 0) {
      alert("There are no faculty records to export.");
      return;
    }

    showConfirmModal({
      title: "Export Faculty List?",
      message: `This will export ${facultyToExport.length} faculty record${facultyToExport.length === 1 ? "" : "s"} currently shown in the list.`,
      confirmLabel: "Export",
      isDestructive: false,
      onConfirm: () => {
        exportFacultyList();
      }
    });
  });
}

document
  .getElementById("add-advisory-class-btn")
  .addEventListener("click", async () => {
    const faculty = facultyRosterCache.find(
      (f) => String(f.id) === String(currentlyEditingFacultyId)
    );

    const select = document.getElementById("advisory-class-select");

    if (!faculty || !select || !select.value) {
      return;
    }

    const selectedSection = select.value;
    const parts = selectedSection.split(" ");

    const gradeLevel = parts.shift();
    const sectionName = parts.join(" ");

    try {
      await apiPost("/advisory", {
        faculty_id: faculty.id,
        grade_level: gradeLevel,
        section_name: sectionName
      });

      // Refresh advisory data
      advisoryAssignmentsCache = await apiGet("/advisory");

      // Refresh the modal UI
      renderAdvisoryClassSelect(faculty);

      // Refresh the faculty table
      renderFacultyManagementTable();
    } catch (error) {
      console.error("Failed to add advisory class:", error);
      alert(error.message || "Failed to add advisory class.");
    }
  });