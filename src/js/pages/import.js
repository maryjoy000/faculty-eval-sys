// ============================================
// HISTORICAL IMPORT PAGE (Admin)
// Upload past evaluations (.xlsx/.csv) -> Validate (dry-run) -> Import.
// Same engine as backend/import_historical.py, via /api/imports/*.
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
// STATE
// ============================================

let parsedRows = [];      // array of objects, headers as found in file
let parsedFileName = "";
let lastValidatedKey = ""; // fingerprint of rows+options at last 0-error validate

function readOptions() {
  return {
    create_terms: document.getElementById("opt-create-terms").checked,
    create_missing_faculty: document.getElementById("opt-create-faculty").checked,
    // Checkbox means "compute" -> API flag is the inverse ("no_sentiment").
    no_sentiment: !document.getElementById("opt-sentiment").checked,
    skip_exact_duplicates: document.getElementById("opt-skip-dupes").checked,
  };
}

function fingerprintRows() {
  return JSON.stringify({ rows: parsedRows, options: readOptions(), file: parsedFileName });
}

function refreshButtons() {
  const hasRows = parsedRows.length > 0;
  document.getElementById("hist-validate-btn").disabled = !hasRows;
  // Commit only right after a clean validate of the exact same payload.
  document.getElementById("hist-commit-btn").disabled =
    !(hasRows && lastValidatedKey !== "" && lastValidatedKey === fingerprintRows());
}

function markPayloadDirty() {
  lastValidatedKey = "";
  refreshButtons();
}

// ============================================
// TEMPLATES (built from the LIVE question set)
// ============================================

const TEMPLATE_EXAMPLES = {
  student: { faculty: "Dela Cruz, Juan", comments: "Magaling magturo at laging on time." },
  peerToPeer: { faculty: "Reyes, Maria", comments: "Great collaborator." },
  hrEvaluation: { faculty: "Santos, Jose", comments: "Submitted all requirements on time." },
  classroomObservation: { faculty: "Dela Cruz, Juan", comments: "" },
};

async function downloadTemplate(typeCode) {
  const status = document.getElementById("template-status");
  try {
    status.textContent = `Building ${typeCode} template…`;
    const parts = await apiGet(`/evaluation-criteria/${typeCode}`);
    const codes = [];
    parts.forEach((part) => {
      (part.questions || []).forEach((q) => {
        if (q && q.id) codes.push(q.id);
      });
    });
    if (!codes.length) {
      showToast(`No active questions found for ${typeCode}.`, "warning");
      status.textContent = "";
      return;
    }
    const example = TEMPLATE_EXAMPLES[typeCode] || { faculty: "Apelyido, Pangalan", comments: "" };
    const header = ["faculty_name", "evaluation_type", "school_year", "semester"]
      .concat(codes)
      .concat(["comments", "submitted_at", "overall_average"]);
    const ratings = codes.map(() => 4);
    const rows = [
      header,
      [example.faculty, typeCode, "2025-2026", "1st"].concat(ratings, [example.comments, "2025-10-15", ""]),
      [example.faculty, typeCode, "2025-2026", "2nd"].concat(ratings, [example.comments, "2026-03-10", ""]),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Historical");
    XLSX.writeFile(workbook, `template_${typeCode}_2025-2026.xlsx`);
    status.textContent = `${typeCode}: ${codes.length} question columns. Replace the example rows with real data.`;
  } catch (error) {
    status.textContent = "";
    showError(error);
  }
}

// ============================================
// FILE PARSING (.xlsx / .csv via SheetJS)
// ============================================

function formatCellValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value);
}

function handleImportFile(file) {
  if (!checkXlsx()) return;
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const workbook = XLSX.read(event.target.result, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        showToast("The file has no worksheets.", "warning");
        return;
      }
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: "",
        raw: true,
      });
      // Normalize: trim header keys, stringify cells (dates -> YYYY-MM-DD).
      parsedRows = rawRows
        .map((row) => {
          const clean = {};
          Object.keys(row).forEach((key) => {
            const trimmed = String(key || "").trim();
            if (trimmed) clean[trimmed] = formatCellValue(row[key]).trim();
          });
          return clean;
        })
        .filter((row) => Object.values(row).some((v) => v !== ""));

      parsedFileName = file.name;
      document.getElementById("hist-file-name").textContent =
        `${file.name} — ${parsedRows.length} data row(s)`;
      markPayloadDirty();
      if (!parsedRows.length) {
        showToast("No data rows found in the first worksheet.", "warning");
        return;
      }
      showToast(`Loaded ${parsedRows.length} row(s). Click Validate first.`, "success");
    } catch (error) {
      showError(error);
    }
  };
  reader.onerror = () => showToast("Could not read the file.", "error");
  reader.readAsArrayBuffer(file);
}

// ============================================
// RESULTS RENDERING
// ============================================

function renderSummary(summary, mode) {
  const card = document.getElementById("hist-result-card");
  card.classList.remove("hidden");

  const title = document.getElementById("hist-result-title");
  const summaryEl = document.getElementById("hist-result-summary");
  const warningsEl = document.getElementById("hist-result-warnings");
  const errorsEl = document.getElementById("hist-result-errors");

  const action = mode === "commit" ? "Import" : "Validation (nothing was written)";
  title.textContent = mode === "commit" ? "Import Result" : "Validation Result";
  summaryEl.innerHTML =
    `${escapeHtml(action)} — ` +
    `<strong>${summary.inserted}</strong> valid, ` +
    `<strong>${summary.skipped || 0}</strong> skipped, ` +
    `<strong>${(summary.errors || []).length}</strong> error(s). ` +
    `Terms to create: <strong>${summary.terms_created || 0}</strong>.`;

  const warnings = summary.warnings || [];
  if (warnings.length) {
    warningsEl.classList.remove("hidden");
    warningsEl.innerHTML = "<strong>Notes:</strong><br>" +
      warnings.slice(0, 10).map((w) => `• ${escapeHtml(w)}`).join("<br>") +
      (warnings.length > 10 ? `<br>…and ${warnings.length - 10} more.` : "");
  } else {
    warningsEl.classList.add("hidden");
    warningsEl.innerHTML = "";
  }

  const errors = summary.errors || [];
  if (errors.length) {
    errorsEl.classList.remove("hidden");
    errorsEl.innerHTML = "<strong>Fix these rows, then re-validate:</strong><br>" +
      errors.slice(0, 50).map((e) => `• ${escapeHtml(e)}`).join("<br>") +
      (errors.length > 50 ? `<br>…and ${errors.length - 50} more.` : "");
  } else {
    errorsEl.classList.add("hidden");
    errorsEl.innerHTML = "";
  }

  // Preview: header + first 8 parsed rows (what was sent).
  const head = document.getElementById("hist-preview-head");
  const body = document.getElementById("hist-preview-body");
  if (parsedRows.length) {
    const cols = Object.keys(parsedRows[0]).slice(0, 10);
    head.innerHTML = `<tr class="border-b border-gray-300 text-gray-700">` +
      cols.map((c) => `<th class="py-2 pr-4 font-semibold">${escapeHtml(c)}</th>`).join("") +
      (Object.keys(parsedRows[0]).length > 10 ? `<th class="py-2 pr-4 font-semibold">…</th>` : "") +
      `</tr>`;
    body.innerHTML = parsedRows.slice(0, 8).map((row) =>
      `<tr class="border-b border-gray-200 last:border-0">` +
      cols.map((c) => `<td class="py-2 pr-4 text-gray-600">${escapeHtml(row[c])}</td>`).join("") +
      (Object.keys(row).length > 10 ? `<td class="py-2 pr-4 text-gray-400">…</td>` : "") +
      `</tr>`
    ).join("");
  } else {
    head.innerHTML = "";
    body.innerHTML = "";
  }

  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ============================================
// VALIDATE + COMMIT
// ============================================

async function validateNow() {
  if (!parsedRows.length) return;
  const btn = document.getElementById("hist-validate-btn");
  btn.disabled = true;
  try {
    const summary = await apiPost("/imports/historical/validate", {
      rows: parsedRows,
      options: readOptions(),
      filename: parsedFileName,
    });
    const clean = (summary.errors || []).length === 0;
    if (clean) {
      lastValidatedKey = fingerprintRows();
      showToast(`Validation passed — ${summary.inserted} row(s) ready to import.`, "success");
    } else {
      lastValidatedKey = "";
      showToast("Validation found errors — fix the rows and re-validate.", "warning");
    }
    renderSummary(summary, "validate");
  } catch (error) {
    showError(error);
  } finally {
    refreshButtons();
  }
}

async function commitNow() {
  if (!parsedRows.length) return;
  showConfirmModal({
    title: "Import Historical Data?",
    message: `This will write ${parsedRows.length} row(s) into the database (terms created as draft, no logins touched). Continue?`,
    confirmLabel: "Import",
    isDestructive: false,
    onConfirm: async () => {
      try {
        const summary = await apiPost("/imports/historical/commit", {
          rows: parsedRows,
          options: readOptions(),
          filename: parsedFileName,
        });
        lastValidatedKey = "";
        renderSummary(summary, "commit");
        if ((summary.errors || []).length === 0) {
          showToast(`Imported ${summary.inserted} evaluation(s).`, "success");
        } else {
          showToast("Import finished with errors — valid rows were saved.", "warning");
        }
      } catch (error) {
        showError(error);
      } finally {
        refreshButtons();
      }
    },
  });
}

// ============================================
// FACULTY REFERENCE
// ============================================

async function loadFacultyReference() {
  const container = document.getElementById("hist-faculty-list");
  try {
    const faculty = await apiGet("/faculty");
    if (!Array.isArray(faculty) || !faculty.length) {
      container.innerHTML = `<span class="text-gray-400">No faculty found — add them in Faculty Management first.</span>`;
      return;
    }
    container.innerHTML = faculty.map((f) =>
      `<span class="bg-gray-100 border border-gray-200 rounded-full px-3 py-1">${escapeHtml(f.name)}</span>`
    ).join("");
  } catch (error) {
    container.innerHTML = `<span class="text-gray-400">Could not load faculty list.</span>`;
  }
}

// ============================================
// INITIALIZE
// ============================================

function attachImportListeners() {
  const fileInput = document.getElementById("hist-import-input");

  document.getElementById("hist-choose-btn").addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    handleImportFile(fileInput.files[0]);
    fileInput.value = "";
  });

  document.getElementById("hist-validate-btn").addEventListener("click", validateNow);
  document.getElementById("hist-commit-btn").addEventListener("click", commitNow);

  document.querySelectorAll("[data-template-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!checkXlsx()) return;
      downloadTemplate(btn.dataset.templateType);
    });
  });

  ["opt-create-terms", "opt-create-faculty", "opt-sentiment", "opt-skip-dupes"].forEach((id) => {
    document.getElementById(id).addEventListener("change", markPayloadDirty);
  });
}

async function initializeHistoricalImport() {
  mountPageContent();
  attachImportListeners();
  refreshButtons();
  await loadFacultyReference();
}

initializeHistoricalImport();
