// ============================================
// ENROLLMENT MASTER LIST PAGE (Admin)
// Sections + Students master data with .xlsx import.
// ============================================

function mountPageContent() {
  const template = document.getElementById("page-content-template");
  const slot = document.getElementById("admin-page-content");

  if (template && slot) {
    slot.appendChild(template.content.cloneNode(true));
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showError(error) {
  console.error(error);
  showToast((error && error.message) || "Something went wrong.", "error");
}

function checkXlsx() {
  if (typeof XLSX === "undefined" || !XLSX.utils) {
    showToast("Spreadsheet library failed to load. Please refresh the page and try again.", "error");
    return false;
  }
  return true;
}

// ============================================
// TABS
// ============================================

function attachTabListeners() {
  const sectionsTab = document.getElementById("enrollment-tab-sections");
  const studentsTab = document.getElementById("enrollment-tab-students");
  const sectionsPanel = document.getElementById("enrollment-panel-sections");
  const studentsPanel = document.getElementById("enrollment-panel-students");

  function activate(which) {
    const showSections = which === "sections";

    sectionsPanel.classList.toggle("hidden", !showSections);
    studentsPanel.classList.toggle("hidden", showSections);

    sectionsTab.classList.toggle("btn-primary", showSections);
    sectionsTab.classList.toggle("btn-secondary", !showSections);
    studentsTab.classList.toggle("btn-primary", !showSections);
    studentsTab.classList.toggle("btn-secondary", showSections);
  }

  sectionsTab.addEventListener("click", () => activate("sections"));
  studentsTab.addEventListener("click", () => activate("students"));
}

// ============================================
// SECTIONS
// ============================================

let sectionsCache = [];

var sectionsPager = null;
function getSectionsPager() {
  if (!sectionsPager) {
    if (typeof TablePagination !== "undefined" && TablePagination.create) {
      sectionsPager = TablePagination.create({ defaultPerPage: 10 });
    } else {
      sectionsPager = null;
    }
  }
  return sectionsPager;
}

async function loadSections() {
  try {
    const params = new URLSearchParams({
      status: document.getElementById("section-status-filter").value || "all",
      q: document.getElementById("section-search-input").value.trim(),
    });

    sectionsCache = await apiGet(`/sections?${params.toString()}`);
    renderSectionsTable();
  } catch (error) {
    showError(error);
  }
}

function renderSectionsTable() {
  const tableBody = document.getElementById("sections-table-body");
  if (!tableBody) return;

  const pager = getSectionsPager();
  const pageItems = pager ? pager.paginate(sectionsCache) : sectionsCache;

  if (!pageItems.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="py-6 text-center text-gray-400">
          No sections found.
        </td>
      </tr>
    `;
  } else {
    tableBody.innerHTML = pageItems
      .map(
        (section) => `
      <tr class="border-b border-gray-200 last:border-0">
        <td class="py-3 pr-4">Grade ${escapeHtml(section.grade_level)}</td>
        <td class="py-3 pr-4 font-medium text-gray-800">${escapeHtml(section.section_name)}</td>
        <td class="py-3 pr-4 text-gray-500">${escapeHtml(section.school_year || "—")}</td>
        <td class="py-3 pr-4">${section.student_count ?? "—"}</td>
        <td class="py-3 pr-4 text-gray-500">${escapeHtml(section.adviser_name || "—")}</td>
        <td class="py-3 pr-4">
          <span class="${section.is_active ? "text-green-600" : "text-gray-400"} font-medium">
            ${section.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td class="py-3 flex gap-3 text-sm">
          <button type="button" class="edit-section-btn text-brand hover:underline" data-section-id="${section.id}">
            Edit
          </button>
          <button type="button" class="delete-section-btn text-red-500 hover:underline" data-section-id="${section.id}">
            Delete
          </button>
        </td>
      </tr>
    `
      )
      .join("");
  }

  document.querySelectorAll(".edit-section-btn").forEach((btn) => {
    btn.addEventListener("click", () => openSectionModal(btn.dataset.sectionId));
  });

  document.querySelectorAll(".delete-section-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = sectionsCache.find(
        (s) => String(s.id) === String(btn.dataset.sectionId)
      );
      if (!section) return;

      showConfirmModal({
        title: "Delete Section?",
        message: `"Grade ${section.grade_level} ${section.section_name}" will be permanently deleted. Sections in use cannot be deleted — deactivate them instead.`,
        confirmLabel: "Delete",
        isDestructive: true,
        onConfirm: async () => {
          try {
            await apiDelete(`/sections/${section.id}`);
            const pg = getSectionsPager();
            if (pg) pg.reset();
            await loadSections();
            showToast("Section deleted.", "success");
          } catch (error) {
            showError(error);
          }
        },
      });
    });
  });

  if (pager) {
    pager.render("sections-pagination", sectionsCache.length, renderSectionsTable);
  } else {
    const fallback = document.getElementById("sections-pagination");
    if (fallback) fallback.innerHTML = "";
  }
}

function attachSectionFilterListeners() {
  document.getElementById("section-search-input").addEventListener("input", () => {
    const pager = getSectionsPager();
    if (pager) pager.reset();
    loadSections();
  });

  document.getElementById("section-status-filter").addEventListener("change", () => {
    const pager = getSectionsPager();
    if (pager) pager.reset();
    loadSections();
  });
}

function openSectionModal(sectionId) {
  const modal = document.getElementById("section-modal");
  const form = document.getElementById("section-form");
  form.reset();

  document.getElementById("section-form-id").value = "";
  document.getElementById("section-modal-title").textContent = "Add Section";
  document.getElementById("section-active-input").checked = true;

  if (sectionId) {
    const section = sectionsCache.find((s) => String(s.id) === String(sectionId));
    if (!section) return;

    document.getElementById("section-form-id").value = section.id;
    document.getElementById("section-modal-title").textContent = "Edit Section";
    document.getElementById("section-grade-input").value = section.grade_level;
    document.getElementById("section-name-input").value = section.section_name;
    document.getElementById("section-year-input").value = section.school_year || "";
    document.getElementById("section-active-input").checked = Boolean(section.is_active);
  }

  modal.classList.remove("hidden");
}

function closeSectionModal() {
  document.getElementById("section-modal").classList.add("hidden");
}

function attachSectionModalListeners() {
  document.getElementById("add-section-btn").addEventListener("click", () => openSectionModal());

  document.getElementById("cancel-section-btn").addEventListener("click", closeSectionModal);

  document.getElementById("section-modal-backdrop").addEventListener("click", closeSectionModal);

  document.getElementById("section-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = document.getElementById("section-form-id").value;
    const payload = {
      grade_level: document.getElementById("section-grade-input").value,
      section_name: document.getElementById("section-name-input").value.trim(),
      school_year: document.getElementById("section-year-input").value.trim(),
      is_active: document.getElementById("section-active-input").checked,
    };

    if (!payload.section_name) {
      showToast("Section name is required.", "warning");
      return;
    }

    try {
      if (id) {
        await apiPut(`/sections/${id}`, payload);
      } else {
        await apiPost("/sections", payload);
      }

      closeSectionModal();
      await loadSections();
      showToast(id ? "Section updated." : "Section added.", "success");
    } catch (error) {
      showError(error);
    }
  });
}

// ============================================
// STUDENTS
// ============================================

let studentsCache = [];
let advisoryCache = [];

var studentsPager = null;
function getStudentsPager() {
  if (!studentsPager) {
    if (typeof TablePagination !== "undefined" && TablePagination.create) {
      studentsPager = TablePagination.create({ defaultPerPage: 10 });
    } else {
      studentsPager = null;
    }
  }
  return studentsPager;
}

async function loadAdvisories() {
  try {
    advisoryCache = await apiGet("/advisory");
  } catch (error) {
    advisoryCache = [];
  }
}

async function loadStudents() {
  try {
    const params = new URLSearchParams({
      q: document.getElementById("student-search-input").value.trim(),
      verified: document.getElementById("student-verified-filter").value || "all",
      assigned: document.getElementById("student-assigned-filter").value || "all",
      status: document.getElementById("student-status-filter").value || "all",
    });

    studentsCache = await apiGet(`/students?${params.toString()}`);
    renderStudentsTable();
  } catch (error) {
    showError(error);
  }
}

function advisoryLabel(assignment) {
  return `${assignment.grade_level} ${assignment.section_name}`;
}

function renderStudentsTable() {
  const tableBody = document.getElementById("students-table-body");
  if (!tableBody) return;

  const pager = getStudentsPager();
  const pageItems = pager ? pager.paginate(studentsCache) : studentsCache;

  if (!pageItems.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="py-6 text-center text-gray-400">
          No students found.
        </td>
      </tr>
    `;
  } else {
    tableBody.innerHTML = pageItems
      .map((student) => {
        const placement =
          student.grade_level && student.section_name
            ? `${escapeHtml(student.grade_level)} ${escapeHtml(student.section_name)}`
            : `<span class="text-gray-400">Unplaced</span>`;
        const isActive = (student.status || "active") === "active";

        return `
      <tr class="border-b border-gray-200 last:border-0">
        <td class="py-3 pr-4 text-gray-500">${escapeHtml(student.lrn)}</td>
        <td class="py-3 pr-4 font-medium text-gray-800">${escapeHtml(student.name)}</td>
        <td class="py-3 pr-4">${placement}</td>
        <td class="py-3 pr-4 text-gray-500">${escapeHtml(student.adviser_name || "—")}</td>
        <td class="py-3 pr-4">
          <span class="${
            student.verification_status === "verified" ? "text-green-600" : "text-amber-600"
          } font-medium">
            ${student.verification_status === "verified" ? "Verified" : "Unverified"}
          </span>
        </td>
        <td class="py-3 pr-4">
          <span class="${isActive ? "text-green-600" : "text-gray-400"} font-medium">
            ${isActive ? "Active" : "Inactive"}
          </span>
        </td>
        <td class="py-3 flex gap-3 text-sm">
          <button type="button" class="edit-student-btn text-brand hover:underline" data-student-id="${student.id}">
            Edit
          </button>
          <button type="button" class="toggle-student-status-btn text-amber-600 hover:underline" data-student-id="${student.id}">
            ${isActive ? "Deactivate" : "Activate"}
          </button>
          <button type="button" class="delete-student-btn text-red-500 hover:underline" data-student-id="${student.id}">
            Delete
          </button>
        </td>
      </tr>
    `;
      })
      .join("");
  }

  document.querySelectorAll(".edit-student-btn").forEach((btn) => {
    btn.addEventListener("click", () => openStudentModal(btn.dataset.studentId));
  });

  document.querySelectorAll(".toggle-student-status-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const student = studentsCache.find(
        (s) => String(s.id) === String(btn.dataset.studentId)
      );
      if (!student) return;

      const isActive = (student.status || "active") === "active";

      showConfirmModal({
        title: isActive ? "Deactivate Student?" : "Activate Student?",
        message: isActive
          ? `"${student.name} (${student.lrn})" will be signed out everywhere and won't be able to log in until reactivated.`
          : `"${student.name} (${student.lrn})" will be able to log in again.`,
        confirmLabel: isActive ? "Deactivate" : "Activate",
        isDestructive: isActive,
        onConfirm: async () => {
          try {
            await apiPut(`/students/${student.id}`, {
              status: isActive ? "inactive" : "active",
            });
            await loadStudents();
            showToast(isActive ? "Student deactivated." : "Student activated.", "success");
          } catch (error) {
            showError(error);
          }
        },
      });
    });
  });

  document.querySelectorAll(".delete-student-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const student = studentsCache.find(
        (s) => String(s.id) === String(btn.dataset.studentId)
      );
      if (!student) return;

      showConfirmModal({
        title: "Delete Student?",
        message: `"${student.name} (${student.lrn})" will be permanently removed from the master list. Students with submitted evaluations cannot be deleted.`,
        confirmLabel: "Delete",
        isDestructive: true,
        onConfirm: async () => {
          try {
            await apiDelete(`/students/${student.id}`);
            const pg = getStudentsPager();
            if (pg) pg.reset();
            await loadStudents();
            showToast("Student deleted.", "success");
          } catch (error) {
            showError(error);
          }
        },
      });
    });
  });

  if (pager) {
    pager.render("students-pagination", studentsCache.length, renderStudentsTable);
  } else {
    const fallback = document.getElementById("students-pagination");
    if (fallback) fallback.innerHTML = "";
  }
}

function attachStudentFilterListeners() {
  ["student-search-input", "student-verified-filter", "student-assigned-filter", "student-status-filter"].forEach(
    (id) => {
      const el = document.getElementById(id);
      const eventName = el.tagName === "SELECT" ? "change" : "input";

      el.addEventListener(eventName, () => {
        const pager = getStudentsPager();
        if (pager) pager.reset();
        loadStudents();
      });
    }
  );
}

function openStudentModal(studentId) {
  const student = studentsCache.find((s) => String(s.id) === String(studentId));
  if (!student) return;

  document.getElementById("student-form-id").value = student.id;
  document.getElementById("student-modal-title").textContent = "Edit Student";
  document.getElementById("student-lrn-display").value = student.lrn;
  document.getElementById("student-last-name-input").value = student.last_name || "";
  document.getElementById("student-first-name-input").value = student.first_name || "";
  document.getElementById("student-middle-name-input").value = student.middle_name || "";
  document.getElementById("student-verified-input").value =
    student.verification_status || "unverified";

  const placementSelect = document.getElementById("student-section-input");
  placementSelect.innerHTML =
    `<option value="">Unplaced (master list only)</option>` +
    advisoryCache
      .map(
        (a) =>
          `<option value="${a.id}" ${
            String(student.advisory_assignment_id) === String(a.id) ? "selected" : ""
          }>${escapeHtml(advisoryLabel(a))}</option>`
      )
      .join("");

  document.getElementById("student-modal").classList.remove("hidden");
}

function closeStudentModal() {
  document.getElementById("student-modal").classList.add("hidden");
}

function attachStudentModalListeners() {
  document.getElementById("cancel-student-btn").addEventListener("click", closeStudentModal);

  document.getElementById("student-modal-backdrop").addEventListener("click", closeStudentModal);

  document.getElementById("student-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = document.getElementById("student-form-id").value;
    if (!id) return;

    const placementValue = document.getElementById("student-section-input").value;

    try {
      await apiPut(`/students/${id}`, {
        last_name: document.getElementById("student-last-name-input").value.trim(),
        first_name: document.getElementById("student-first-name-input").value.trim(),
        middle_name: document.getElementById("student-middle-name-input").value.trim(),
        verification_status: document.getElementById("student-verified-input").value,
        advisory_assignment_id: placementValue === "" ? null : Number(placementValue),
      });

      closeStudentModal();
      await loadStudents();
      showToast("Student saved.", "success");
    } catch (error) {
      showError(error);
    }
  });
}

// ============================================
// .XLSX IMPORT (Sections + Students)
// ============================================

const SECTION_COLUMNS = {
  grade_level: ["grade_level", "grade", "gradelevel"],
  section_name: ["section_name", "section", "sectionname", "name"],
  school_year: ["school_year", "schoolyear", "year", "sy"],
  is_active: ["is_active", "isactive", "active", "status"],
};

const STUDENT_COLUMNS = {
  lrn: ["lrn"],
  last_name: ["last_name", "lastname", "last", "surname", "family_name"],
  first_name: ["first_name", "firstname", "first", "given_name", "givenname"],
  middle_name: ["middle_name", "middlename", "middle", "mi"],
  grade_level: ["grade_level", "grade", "gradelevel"],
  section_name: ["section_name", "section", "sectionname"],
};

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "");
}

function mapRow(rawRow, columnMap) {
  const normalized = {};
  Object.keys(rawRow || {}).forEach((key) => {
    normalized[normalizeHeader(key)] = rawRow[key];
  });

  const mapped = {};
  Object.keys(columnMap).forEach((field) => {
    for (const alias of columnMap[field]) {
      if (normalized[alias] !== undefined && normalized[alias] !== null) {
        const value = String(normalized[alias]).trim();
        if (value !== "") mapped[field] = value;
        break;
      }
    }
  });

  return mapped;
}

function parseActiveFlag(value) {
  if (value === undefined) return undefined;
  const text = String(value).trim().toLowerCase();
  if (["yes", "y", "true", "1", "active"].includes(text)) return true;
  if (["no", "n", "false", "0", "inactive"].includes(text)) return false;
  return undefined;
}

let pendingImport = null; // { kind: "sections" | "students", rows: [] }

function validateSectionRow(mapped) {
  if (!mapped.grade_level || !mapped.section_name) {
    return "grade_level and section_name are required";
  }
  return null;
}

function validateStudentRow(mapped) {
  const lrn = mapped.lrn || "";
  if (lrn.length !== 12 || !/^\d+$/.test(lrn)) {
    return "lrn must be exactly 12 digits";
  }
  if (!mapped.last_name || !mapped.first_name) {
    return "last_name and first_name are required";
  }
  if (
    (mapped.grade_level && !mapped.section_name) ||
    (!mapped.grade_level && mapped.section_name)
  ) {
    return "grade_level and section_name are required together for placement";
  }
  return null;
}

function openImportModal(kind, validRows, errorRows) {
  pendingImport = { kind, rows: validRows };

  const isSections = kind === "sections";
  document.getElementById("import-modal-title").textContent = isSections
    ? "Import Sections Preview"
    : "Import Students Preview";
  document.getElementById("import-modal-summary").textContent =
    `${validRows.length} valid row(s)` +
    (errorRows.length ? `, ${errorRows.length} row(s) with errors will be skipped` : "") +
    ".";

  const errorBox = document.getElementById("import-modal-errors");
  if (errorRows.length) {
    errorBox.classList.remove("hidden");
    errorBox.innerHTML = `
      <div class="bg-gray-50 border border-red-500 rounded-lg p-3 text-sm text-red-700 space-y-1 overflow-y-auto" style="max-height:10rem">
        ${errorRows
          .slice(0, 20)
          .map(
            (e) =>
              `<p><span class="font-medium">Row ${e.row}:</span> ${escapeHtml(e.error)}</p>`
          )
          .join("")}
        ${errorRows.length > 20 ? `<p>…and ${errorRows.length - 20} more.</p>` : ""}
      </div>`;
  } else {
    errorBox.classList.add("hidden");
    errorBox.innerHTML = "";
  }

  const columns = isSections
    ? ["grade_level", "section_name", "school_year", "is_active"]
    : ["lrn", "last_name", "first_name", "middle_name", "grade_level", "section_name"];

  document.getElementById("import-preview-head").innerHTML = `
    <tr class="border-b border-gray-300 text-gray-700">
      ${columns.map((c) => `<th class="py-2 pr-4 font-semibold">${c}</th>`).join("")}
    </tr>`;

  document.getElementById("import-preview-body").innerHTML = validRows
    .slice(0, 8)
    .map(
      (row) => `
      <tr class="border-b border-gray-200 last:border-0">
        ${columns.map((c) => `<td class="py-2 pr-4">${escapeHtml(row[c] ?? "")}</td>`).join("")}
      </tr>`
    )
    .join("");

  const confirmBtn = document.getElementById("confirm-import-btn");
  confirmBtn.classList.toggle("hidden", validRows.length === 0);

  const cancelBtn = document.getElementById("cancel-import-btn");
  cancelBtn.textContent = "Cancel";

  document.getElementById("import-modal").classList.remove("hidden");
}

function closeImportModal(resultHtml) {
  if (resultHtml) {
    document.getElementById("import-modal-title").textContent = "Import Result";
    document.getElementById("import-modal-summary").innerHTML = resultHtml;
    document.getElementById("import-modal-errors").classList.add("hidden");
    document.getElementById("import-modal-errors").innerHTML = "";
    document.getElementById("import-preview-head").innerHTML = "";
    document.getElementById("import-preview-body").innerHTML = "";
    document.getElementById("confirm-import-btn").classList.add("hidden");
    document.getElementById("cancel-import-btn").textContent = "Close";
    return;
  }

  pendingImport = null;
  document.getElementById("import-modal").classList.add("hidden");
}

function handleImportFile(file, kind) {
  if (!checkXlsx()) return;
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (event) => {
    try {
      const workbook = XLSX.read(event.target.result, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: "",
      });

      const isSections = kind === "sections";
      const columnMap = isSections ? SECTION_COLUMNS : STUDENT_COLUMNS;
      const validate = isSections ? validateSectionRow : validateStudentRow;

      const validRows = [];
      const errorRows = [];

      rawRows.forEach((rawRow, index) => {
        const mapped = mapRow(rawRow, columnMap);

        if (isSections && mapped.is_active !== undefined) {
          const parsed = parseActiveFlag(mapped.is_active);
          if (parsed !== undefined) mapped.is_active = parsed;
          else delete mapped.is_active;
        }

        // Skip fully empty rows silently.
        if (Object.keys(mapped).length === 0) return;

        const error = validate(mapped);
        if (error) {
          errorRows.push({ row: index + 2, error });
        } else {
          validRows.push(mapped);
        }
      });

      if (!validRows.length && !errorRows.length) {
        showToast("The spreadsheet appears to be empty.", "warning");
        return;
      }

      openImportModal(kind, validRows, errorRows);
    } catch (error) {
      showError(error);
    }
  };

  reader.onerror = () => {
    showToast("Could not read the selected file.", "error");
  };

  reader.readAsArrayBuffer(file);
}

function attachImportListeners() {
  const sectionInput = document.getElementById("section-import-input");
  const studentInput = document.getElementById("student-import-input");

  document.getElementById("section-import-btn").addEventListener("click", () => {
    sectionInput.value = "";
    sectionInput.click();
  });

  document.getElementById("student-import-btn").addEventListener("click", () => {
    studentInput.value = "";
    studentInput.click();
  });

  sectionInput.addEventListener("change", () => {
    handleImportFile(sectionInput.files[0], "sections");
  });

  studentInput.addEventListener("change", () => {
    handleImportFile(studentInput.files[0], "students");
  });

  document.getElementById("cancel-import-btn").addEventListener("click", () => {
    closeImportModal();
  });

  document.getElementById("import-modal-backdrop").addEventListener("click", () => {
    closeImportModal();
  });

  document.getElementById("confirm-import-btn").addEventListener("click", async () => {
    if (!pendingImport || !pendingImport.rows.length) return;

    const isSections = pendingImport.kind === "sections";
    const url = isSections ? "/sections/bulk" : "/students/bulk";
    const key = isSections ? "sections" : "students";

    try {
      const result = await apiPost(url, { [key]: pendingImport.rows });

      const errorList = (result.errors || [])
        .slice(0, 10)
        .map(
          (e) =>
            `<p>Row ${e.index + 2}${e.lrn ? ` (${escapeHtml(e.lrn)})` : ""}: ${escapeHtml(
              e.error
            )}</p>`
        )
        .join("");

      closeImportModal(`
        <span class="font-medium text-gray-800">${result.created || 0} created</span>,
        <span class="font-medium text-gray-800">${result.updated || 0} updated</span>${isSections ? "" : `,
        <span class="font-medium text-gray-800">${result.placed || 0} placed</span>`}
        with ${(result.errors || []).length} error(s).
        ${errorList ? `<div class="mt-2 text-red-600 space-y-1">${errorList}</div>` : ""}
      `);

      pendingImport = null;

      if (isSections) {
        await loadSections();
      } else {
        await loadStudents();
        await loadAdvisories();
      }
    } catch (error) {
      showError(error);
    }
  });
}

// ============================================
// TEMPLATE DOWNLOAD + INIT
// ============================================

function downloadTemplate(kind) {
  if (!checkXlsx()) return;

  const isSections = kind === "sections";
  const headers = isSections
    ? ["grade_level", "section_name", "school_year", "is_active"]
    : ["lrn", "last_name", "first_name", "middle_name", "grade_level", "section_name"];
  const example = isSections
    ? ["11", "HUMSS A", "2026-2027", "yes"]
    : ["100000000001", "Dela Cruz", "Juan", "", "11", "HUMSS A"];

  const worksheet = XLSX.utils.aoa_to_sheet([headers, example]);
  worksheet["!cols"] = headers.map(() => ({ wch: 18 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    isSections ? "Sections" : "Students"
  );
  XLSX.writeFile(
    workbook,
    isSections ? "sections-template.xlsx" : "students-template.xlsx"
  );
}

async function initializeEnrollment() {
  mountPageContent();

  attachTabListeners();
  attachSectionFilterListeners();
  attachSectionModalListeners();
  attachStudentFilterListeners();
  attachStudentModalListeners();
  attachImportListeners();

  document.getElementById("section-template-btn").addEventListener("click", () => {
    downloadTemplate("sections");
  });

  document.getElementById("student-template-btn").addEventListener("click", () => {
    downloadTemplate("students");
  });

  await loadAdvisories();
  await loadSections();
  await loadStudents();
}

initializeEnrollment();
