// ============================================
// HR FACULTY MANAGEMENT
// ============================================

function mountPageContent() {
  const template = document.getElementById("page-content-template");
  const slot = document.getElementById("hr-page-content");

  if (template && slot) {
    slot.appendChild(template.content.cloneNode(true));
  }
}

let advisoryAssignmentsCache = [];
let currentlyEditingFacultyId = null;
let currentActionFacultyId = null;

var hrFacultyTablePager = null;
function getHrFacultyTablePager() {
  if (!hrFacultyTablePager) {
    if (typeof TablePagination !== "undefined" && TablePagination.create) {
      hrFacultyTablePager = TablePagination.create({ defaultPerPage: 10 });
    } else {
      hrFacultyTablePager = null;
    }
  }
  return hrFacultyTablePager;
}

// ============================================
// HELPERS
// ============================================

function facultyById(id) {
  return facultyRosterCache.find(
    (faculty) => Number(faculty.id) === Number(id),
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getFacultySections(faculty) {
  return Array.isArray(faculty?.sections) ? faculty.sections : [];
}

function getFacultyAdvisories(facultyId) {
  return advisoryAssignmentsCache.filter(
    (assignment) => Number(assignment.faculty_id) === Number(facultyId),
  );
}

function sectionDisplay(section) {
  if (!section) return "";

  if (typeof section === "string") {
    return section;
  }

  if (section.grade_level && section.name) {
    return `${section.grade_level} ${section.name}`;
  }

  if (section.grade_level && section.section_name) {
    return `${section.grade_level} ${section.section_name}`;
  }

  return section.section_name || section.name || "";
}

function advisoryDisplay(advisory) {
  if (!advisory) return "";

  if (typeof advisory === "string") {
    return advisory;
  }

  if (advisory.grade_level && advisory.section_name) {
    return `${advisory.grade_level} ${advisory.section_name}`;
  }

  return advisory.section_name || advisory.name || "";
}

// ============================================
// LOAD DATA
// ============================================

async function loadFacultyRoster() {
  facultyRosterCache = await apiGet("/faculty");
  advisoryAssignmentsCache = await apiGet("/advisory");

  renderHrFacultyTable();
}

// ============================================
// TABLE
// ============================================

function renderHrFacultyTable() {
  const tbody = document.getElementById("faculty-management-table-body");

  if (!tbody) return;

  const searchTerm = (document.getElementById("search-input")?.value || "")
    .trim()
    .toLowerCase();

  const statusFilter =
    document.getElementById("status-filter")?.value || "active";

  const filtered = facultyRosterCache.filter((faculty) => {
    const name = String(faculty.name || "").toLowerCase();

    const sections = getFacultySections(faculty)
      .map(sectionDisplay)
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !searchTerm ||
      name.includes(searchTerm) ||
      sections.includes(searchTerm);

    const status = faculty.status || "Active";

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && status === "Active") ||
      (statusFilter === "archived" && status === "Archived");

    return matchesSearch && matchesStatus;
  });

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-6 py-8 text-center text-gray-500">
          No faculty records found.
        </td>
      </tr>
    `;
    const emptyPager = getHrFacultyTablePager();
    if (emptyPager) {
      emptyPager.render("faculty-management-pagination", 0, renderHrFacultyTable);
    } else {
      const fallbackContainer = document.getElementById("faculty-management-pagination");
      if (fallbackContainer) fallbackContainer.innerHTML = "";
    }
    return;
  }

  const pager = getHrFacultyTablePager();
  const pageItems = pager ? pager.paginate(filtered) : filtered;

  tbody.innerHTML = pageItems
    .map((faculty) => {
      const sections = getFacultySections(faculty)
        .map(sectionDisplay)
        .filter(Boolean);

      const advisories = getFacultyAdvisories(faculty.id)
        .map(advisoryDisplay)
        .filter(Boolean);

      const status = faculty.status || "Active";

      return `
      <tr class="border-t border-gray-100 hover:bg-gray-50">

        <td class="px-6 py-4">
          <div class="font-medium text-gray-800">
            ${escapeHtml(faculty.name || "")}
          </div>
        </td>

        <td class="px-6 py-4 text-sm text-gray-600">
          ${sections.length ? sections.map(escapeHtml).join("<br>") : "—"}
        </td>

        <td class="px-6 py-4 text-sm text-gray-600">
          ${advisories.length ? advisories.map(escapeHtml).join("<br>") : "—"}
        </td>

        <td class="px-6 py-4">
          <span class="
            inline-flex items-center
            px-2.5 py-1 rounded-full
            text-xs font-medium
            ${
              status === "Active"
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-600"
            }
          ">
            ${escapeHtml(status)}
          </span>
        </td>

        <td class="px-6 py-4 text-right">
          <button
            type="button"
            class="faculty-action-btn text-gray-500 hover:text-gray-800 px-2 py-1"
            data-faculty-id="${faculty.id}"
            aria-label="Faculty actions">
            ⋮
          </button>
        </td>

      </tr>
    `;
    })
    .join("");

  bindFacultyActionButtons();

  if (pager) {
    pager.render("faculty-management-pagination", filtered.length, renderHrFacultyTable);
  }
}

// ============================================
// ACTION DROPDOWN
// ============================================

function bindFacultyActionButtons() {
  document.querySelectorAll(".faculty-action-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();

      currentActionFacultyId = Number(button.dataset.facultyId);

      const dropdown = document.getElementById("shared-actions-dropdown");

      if (!dropdown) return;

      const rect = button.getBoundingClientRect();

      dropdown.style.position = "fixed";
      dropdown.style.top = `${rect.bottom + 4}px`;

      dropdown.style.left = `${Math.max(
        10,
        rect.right - dropdown.offsetWidth,
      )}px`;

      dropdown.classList.remove("hidden");
      dropdown.style.zIndex = "9999";
    });
  });
}

function closeActionDropdown() {
  const dropdown = document.getElementById("shared-actions-dropdown");

  if (dropdown) {
    dropdown.classList.add("hidden");
  }
}

// ============================================
// EDIT DETAILS
// ============================================

function openEditDetails(facultyId) {
  const faculty = facultyById(facultyId);

  if (!faculty) return;

  currentlyEditingFacultyId = Number(facultyId);

  const name = document.getElementById("edit-details-faculty-name");

  if (name) {
    name.textContent = faculty.name || "";
  }

  renderSectionsEditor(faculty);
  renderAdvisoryEditor(faculty);
  loadMasterSectionOptions();

  document.getElementById("edit-details-modal")?.classList.remove("hidden");
}

function closeEditDetails() {
  currentlyEditingFacultyId = null;

  document.getElementById("edit-details-modal")?.classList.add("hidden");
}

// ============================================
// MASTER SECTIONS DROPDOWN (Enrollment master list)
// ============================================

let masterSectionsCache = [];

async function loadMasterSectionOptions() {
  const select = document.getElementById("section-master-select");
  if (!select) return;

  try {
    masterSectionsCache = await apiGet("/sections?status=active");
  } catch (error) {
    console.error("Failed to load master sections:", error);
    masterSectionsCache = [];
  }

  const faculty = facultyById(currentlyEditingFacultyId);
  const current = new Set(
    getFacultySections(faculty || {})
      .map((s) => `${s.grade_level} ${s.section_name || s.name}`)
  );

  select.innerHTML =
    `<option value="">Select section from master list</option>` +
    masterSectionsCache
      .filter(
        (s) => !current.has(`${s.grade_level} ${s.section_name}`)
      )
      .map(
        (s) =>
          `<option value="${s.id}">${escapeHtml(s.grade_level)} ${escapeHtml(s.section_name)}</option>`
      )
      .join("");
}

// ============================================
// SECTIONS
// ============================================

function renderSectionsEditor(faculty) {
  const container = document.getElementById("section-list");

  if (!container) return;

  const sections = getFacultySections(faculty);

  container.innerHTML = sections.length
    ? sections
        .map(
          (section, index) => `
        <div class="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2">

          <span class="text-sm text-gray-700">
            ${escapeHtml(sectionDisplay(section))}
          </span>

          <button
            type="button"
            class="remove-section-btn text-xs text-red-500 hover:text-red-700"
            data-index="${index}">
            Remove
          </button>

        </div>
      `,
        )
        .join("")
    : `
      <p class="text-sm text-gray-500">
        No sections assigned.
      </p>
    `;

  container.querySelectorAll(".remove-section-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const faculty = facultyById(currentlyEditingFacultyId);

      if (!faculty) return;

      const sections = [...getFacultySections(faculty)].map((section) => ({
        grade_level: section.grade_level,
        section_name: section.name || section.section_name,
      }));

      sections.splice(Number(button.dataset.index), 1);

      await saveFacultyDetails({
        sections,
      });
    });
  });
}

async function addSection() {
  const select = document.getElementById("section-master-select");

  if (!select || !select.value) {
    return;
  }

  const section = masterSectionsCache.find(
    (item) => String(item.id) === String(select.value)
  );

  if (!section) return;

  const faculty = facultyById(currentlyEditingFacultyId);

  if (!faculty) return;

  const sections = [...getFacultySections(faculty)].map((item) => ({
    grade_level: item.grade_level,
    section_name: item.name || item.section_name,
  }));

  const exists = sections.some(
    (item) =>
      `${item.grade_level} ${item.section_name}`.toLowerCase() ===
      `${section.grade_level} ${section.section_name}`.toLowerCase(),
  );

  if (exists) {
    alert("That section is already assigned.");
    return;
  }

  sections.push({
    grade_level: section.grade_level,
    section_name: section.section_name,
  });

  await saveFacultyDetails({
    sections,
  });

  select.value = "";
}

// ============================================
// ADVISORY
// ============================================

function renderAdvisoryEditor(faculty) {
  const container = document.getElementById("advisory-class-list");

  if (!container) return;

  const advisories = getFacultyAdvisories(faculty.id);

  container.innerHTML = advisories.length
    ? advisories
        .map(
          (assignment) => `
        <div class="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2">

          <span class="text-sm text-gray-700">
            ${escapeHtml(advisoryDisplay(assignment))}
          </span>

          <button
            type="button"
            class="remove-advisory-btn text-xs text-red-500 hover:text-red-700"
            data-id="${assignment.id}">
            Remove
          </button>

        </div>
      `,
        )
        .join("")
    : `
      <p class="text-sm text-gray-500">
        No advisory classes assigned.
      </p>
    `;

  container.querySelectorAll(".remove-advisory-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await apiPut(`/advisory/${button.dataset.id}`, { faculty_id: null });

        advisoryAssignmentsCache = await apiGet("/advisory");

        const faculty = facultyById(currentlyEditingFacultyId);

        if (faculty) {
          renderAdvisoryEditor(faculty);
        }

        renderHrFacultyTable();
      } catch (error) {
        console.error("Failed to remove advisory:", error);

        alert(error?.message || "Failed to remove advisory class.");
      }
    });
  });

  loadAdvisoryOptions(faculty);
}

async function loadAdvisoryOptions(faculty) {
  const select = document.getElementById("advisory-class-select");

  if (!select) return;

  try {
    const assignments = await apiGet("/advisory");

    select.innerHTML = `
      <option value="">
        Select advisory class
      </option>
    `;

    const assignedByOtherFaculty = assignments.filter(
      (assignment) =>
        assignment.faculty_id &&
        Number(assignment.faculty_id) !== Number(faculty.id),
    );

    const alreadyAssigned = getFacultyAdvisories(faculty.id).map((assignment) =>
      `${assignment.grade_level} ${assignment.section_name}`.toLowerCase(),
    );

    assignments
      .filter((assignment) => {
        const label =
          `${assignment.grade_level} ${assignment.section_name}`.toLowerCase();

        const ownedByOther = assignedByOtherFaculty.some(
          (item) =>
            `${item.grade_level} ${item.section_name}`.toLowerCase() === label,
        );

        return !ownedByOther && !alreadyAssigned.includes(label);
      })
      .forEach((assignment) => {
        const option = document.createElement("option");

        option.value = assignment.id;

        option.textContent = `${assignment.grade_level} ${assignment.section_name}`;

        select.appendChild(option);
      });
  } catch (error) {
    console.error("Failed to load advisory classes:", error);
  }
}

async function addAdvisoryClass() {
  const select = document.getElementById("advisory-class-select");

  if (!select?.value) return;

  const faculty = facultyById(currentlyEditingFacultyId);

  if (!faculty) return;

  try {
    const assignment = await apiGet("/advisory");

    const selected = assignment.find(
      (item) => Number(item.id) === Number(select.value),
    );

    if (!selected) return;

    if (
      selected.faculty_id &&
      Number(selected.faculty_id) !== Number(faculty.id)
    ) {
      alert("This section already has another adviser.");
      return;
    }

    await apiPut(`/advisory/${selected.id}`, {
      faculty_id: faculty.id,
    });

    advisoryAssignmentsCache = await apiGet("/advisory");

    renderAdvisoryEditor(faculty);
    renderHrFacultyTable();

    select.value = "";
  } catch (error) {
    console.error("Failed to add advisory:", error);

    alert(error?.message || "Failed to add advisory class.");
  }
}

// ============================================
// SAVE FACULTY DETAILS
// ============================================

async function saveFacultyDetails(changes) {
  if (!currentlyEditingFacultyId) return;

  try {
    const updated = await apiPut(
      `/faculty/${currentlyEditingFacultyId}`,
      changes,
    );

    const index = facultyRosterCache.findIndex(
      (faculty) => Number(faculty.id) === Number(currentlyEditingFacultyId),
    );

    if (index !== -1) {
      facultyRosterCache[index] = updated;
    }

    renderHrFacultyTable();

    const faculty = facultyById(currentlyEditingFacultyId);

    if (faculty) {
      renderSectionsEditor(faculty);
      renderAdvisoryEditor(faculty);
      loadMasterSectionOptions();
    }
  } catch (error) {
    console.error("Failed to save faculty details:", error);

    alert(error?.message || "Failed to save faculty details.");
  }
}

// ============================================
// EVENTS
// ============================================

function bindPageEvents() {
  document
    .getElementById("add-section-btn")
    ?.addEventListener("click", addSection);

  document
    .getElementById("add-advisory-class-btn")
    ?.addEventListener("click", addAdvisoryClass);

  document
    .getElementById("close-edit-details-btn")
    ?.addEventListener("click", closeEditDetails);

  document
    .getElementById("edit-details-modal-backdrop")
    ?.addEventListener("click", closeEditDetails);

  document
    .getElementById("export-btn")
    ?.addEventListener("click", exportFaculty);

  document
    .getElementById("shared-actions-dropdown")
    ?.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-action]");

      if (!actionButton) return;

      event.preventDefault();

      const action = actionButton.dataset.action;

      const faculty = facultyById(currentActionFacultyId);

      closeActionDropdown();

      if (!faculty) return;

      if (action === "edit-details") {
        openEditDetails(faculty.id);
        return;
      }

      if (action === "view-report") {
        window.location.href = `hr-reports.html?facultyId=${faculty.id}`;
      }
    });

  document.addEventListener("click", (event) => {
    if (
      !event.target.closest(".faculty-action-btn") &&
      !event.target.closest("#shared-actions-dropdown")
    ) {
      closeActionDropdown();
    }
  });
}

// ============================================
// FILTERS
// ============================================

function attachFilterListeners() {
  document
    .getElementById("search-input")
    ?.addEventListener("input", () => {
      const pager = getHrFacultyTablePager();
      if (pager) pager.reset();
      renderHrFacultyTable();
    });

  document
    .getElementById("status-filter")
    ?.addEventListener("change", () => {
      const pager = getHrFacultyTablePager();
      if (pager) pager.reset();
      renderHrFacultyTable();
    });
}

// ============================================
// EXPORT
// ============================================

function exportFaculty() {
  const rows = facultyRosterCache.map((faculty) => ({
    "Faculty Name": faculty.name || "",

    Section: getFacultySections(faculty).map(sectionDisplay).join(", "),

    Advisory: getFacultyAdvisories(faculty.id).map(advisoryDisplay).join(", "),

    Status: faculty.status || "",
  }));

  if (!rows.length) {
    alert("There are no faculty records to export.");
    return;
  }

  if (typeof XLSX !== "undefined" && XLSX.utils) {
    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet["!cols"] = [
      { wch: 28 },
      { wch: 20 },
      { wch: 20 },
      { wch: 12 }
    ];

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Faculty");

    XLSX.writeFile(workbook, "faculty-management.xlsx");
    return;
  }

  const headers = Object.keys(rows[0]);

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => `"${String(row[header] || "").replace(/"/g, '""')}"`)
        .join(","),
    ),
  ].join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = "faculty-management.csv";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

// ============================================
// START
// ============================================

mountPageContent();

async function initializeHrFacultyManagement() {
  bindPageEvents();
  attachFilterListeners();

  try {
    await loadFacultyRoster();
  } catch (error) {
    console.error("Failed to load HR faculty management:", error);

    const tbody = document.getElementById("faculty-management-table-body");

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td
            colspan="5"
            class="px-6 py-8 text-center text-red-500">
            Failed to load faculty records.
          </td>
        </tr>
      `;
    }
  }
}

initializeHrFacultyManagement();
