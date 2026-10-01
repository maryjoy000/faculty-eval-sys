// ============================================
// HISTORICAL IMPORT PAGE (Admin)
// Guided flow: Download -> Fill -> Upload and Check -> Import.
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
// STATE + STEP PILLS
// ============================================

let parsedRows = [];      // array of objects, headers as found in file
let parsedFileName = "";
let lastValidatedKey = ""; // fingerprint of rows+options at last 0-error validate
let templateDownloaded = false;
let importFinished = false;

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

function setStepPill(id, state) {
  const el = document.getElementById(id);
  if (!el) return;
  const base = "px-3 py-1.5 rounded-full font-medium ";
  if (state === "done") {
    el.className = base + "bg-green-100 text-green-700";
  } else if (state === "active") {
    el.className = base + "bg-brand text-white";
  } else {
    el.className = base + "bg-gray-100 text-gray-400";
  }
}

function refreshSteps() {
  const hasFile = parsedRows.length > 0;
  const validated = hasFile && lastValidatedKey !== "" && lastValidatedKey === fingerprintRows();

  setStepPill("hist-step-1", templateDownloaded ? "done" : "active");
  setStepPill("hist-step-2", !templateDownloaded ? "todo" : hasFile ? "done" : "active");
  setStepPill("hist-step-3", !hasFile ? "todo" : validated ? "done" : "active");
  setStepPill("hist-step-4", importFinished ? "done" : validated ? "active" : "todo");

  document.getElementById("hist-import-btn").disabled = false;

  const hint = document.getElementById("hist-action-hint");
  if (!hasFile) {
    hint.textContent = "Click Import and choose your file.";
  } else if (validated) {
    hint.textContent = "Check passed - review the result below, then confirm.";
  } else {
    hint.textContent = "File loaded - checking it now (safe, nothing is saved yet).";
  }
}

function markPayloadDirty() {
  lastValidatedKey = "";
  document.getElementById("hist-result-card").classList.add("hidden");
  document.getElementById("hist-commit-wrap").classList.add("hidden");
  refreshSteps();
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
    status.textContent = `Building ${typeCode} template...`;
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
    templateDownloaded = true;
    status.textContent = `${typeCode}: downloaded (${codes.length} rating columns). Now fill it in Excel.`;
    refreshSteps();
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
      markPayloadDirty();
      if (!parsedRows.length) {
        showToast("No data rows found in the first worksheet.", "warning");
        return;
      }
      // Check immediately - checking never saves anything.
      checkNow();
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

function parseRowError(text) {
  const match = /^row (\d+):\s*([\s\S]*)$/.exec(String(text || ""));
  if (match) return { row: match[1], issue: match[2] };
  return { row: "-", issue: String(text || "") };
}

function renderSummary(summary, mode) {
  const card = document.getElementById("hist-result-card");
  card.classList.remove("hidden");

  const title = document.getElementById("hist-result-title");
  const summaryEl = document.getElementById("hist-result-summary");
  const warningsEl = document.getElementById("hist-result-warnings");
  const errorsBox = document.getElementById("hist-result-errors-box");
  const errorsBody = document.getElementById("hist-result-errors");
  const commitWrap = document.getElementById("hist-commit-wrap");

  const errors = summary.errors || [];
  const warnings = summary.warnings || [];

  if (mode === "commit") {
    title.textContent = errors.length ? "Import finished with errors" : "Import complete";
    summaryEl.innerHTML =
      `Saved <strong>${summary.inserted}</strong> evaluation(s)` +
      (summary.skipped ? `, skipped <strong>${summary.skipped}</strong>` : "") +
      (errors.length ? `, <strong>${errors.length}</strong> row(s) failed` : "") +
      `. Terms created: <strong>${summary.terms_created || 0}</strong>.`;
    commitWrap.classList.add("hidden");
    if (!errors.length && summary.inserted > 0) {
      importFinished = true;
      showToast(`Imported ${summary.inserted} evaluation(s).`, "success");
    } else if (errors.length) {
      showToast("Import finished with errors - valid rows were saved.", "warning");
    }
  } else {
    title.textContent = "Check Result (nothing saved yet)";
    summaryEl.innerHTML =
      `<strong>${summary.inserted}</strong> row(s) ready` +
      (summary.skipped ? `, <strong>${summary.skipped}</strong> would be skipped` : "") +
      (errors.length ? `, <strong>${errors.length}</strong> need fixing` : "") +
      `. Terms to create: <strong>${summary.terms_created || 0}</strong>.`;
    if (!errors.length) {
      lastValidatedKey = fingerprintRows();
      document.getElementById("hist-commit-count").textContent = `${summary.inserted}`;
      commitWrap.classList.remove("hidden");
      showToast(`All good - ${summary.inserted} row(s) ready. Click Import.`, "success");
    } else {
      commitWrap.classList.add("hidden");
      showToast("Fix the rows below, then Import again.", "warning");
    }
  }

  if (warnings.length) {
    warningsEl.classList.remove("hidden");
    warningsEl.innerHTML = "<strong>Notes:</strong><br>" +
      warnings.slice(0, 10).map((w) => `- ${escapeHtml(w)}`).join("<br>") +
      (warnings.length > 10 ? `<br>...and ${warnings.length - 10} more.` : "");
  } else {
    warningsEl.classList.add("hidden");
    warningsEl.innerHTML = "";
  }

  if (errors.length) {
    errorsBox.classList.remove("hidden");
    errorsBody.innerHTML = errors.slice(0, 50).map((e) => {
      const parsed = parseRowError(e);
      return `<tr class="border-b border-red-100 last:border-0">` +
        `<td class="py-1 pr-4 font-semibold whitespace-nowrap align-top">${escapeHtml(parsed.row)}</td>` +
        `<td class="py-1 align-top">${escapeHtml(parsed.issue)}</td></tr>`;
    }).join("") + (errors.length > 50
      ? `<tr><td colspan="2" class="py-1 text-red-500">...and ${errors.length - 50} more.</td></tr>`
      : "");
  } else {
    errorsBox.classList.add("hidden");
    errorsBody.innerHTML = "";
  }

  // Preview: first 8 parsed rows (what was sent).
  const head = document.getElementById("hist-preview-head");
  const body = document.getElementById("hist-preview-body");
  if (parsedRows.length) {
    const cols = Object.keys(parsedRows[0]).slice(0, 10);
    const extra = Object.keys(parsedRows[0]).length > 10;
    head.innerHTML = `<tr class="border-b border-gray-300 text-gray-700">` +
      cols.map((c) => `<th class="py-2 pr-4 font-semibold align-top">${escapeHtml(c)}</th>`).join("") +
      (extra ? `<th class="py-2 pr-4 font-semibold align-top">...</th>` : "") +
      `</tr>`;
    body.innerHTML = parsedRows.slice(0, 8).map((row) =>
      `<tr class="border-b border-gray-200 last:border-0">` +
      cols.map((c) => `<td class="py-2 pr-4 text-gray-600 align-top">${escapeHtml(row[c])}</td>`).join("") +
      (Object.keys(row).length > 10 ? `<td class="py-2 pr-4 text-gray-400 align-top">...</td>` : "") +
      `</tr>`
    ).join("");
  } else {
    head.innerHTML = "";
    body.innerHTML = "";
  }

  refreshSteps();
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ============================================
// CHECK + SAVE
// ============================================

async function checkNow() {
  if (!parsedRows.length) return;
  const hint = document.getElementById("hist-action-hint");
  hint.textContent = `Checking ${parsedFileName} (${parsedRows.length} rows) - nothing is saved yet.`;
  try {
    const summary = await apiPost("/imports/historical/validate", {
      rows: parsedRows,
      options: readOptions(),
      filename: parsedFileName,
    });
    renderSummary(summary, "validate");
  } catch (error) {
    showError(error);
  } finally {
    refreshSteps();
  }
}

async function commitNow() {
  if (!parsedRows.length) return;
  showConfirmModal({
    title: "Import Historical Data?",
    message: `This will save ${parsedRows.length} row(s). Terms are created as draft; no logins are touched. Continue?`,
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
      } catch (error) {
        showError(error);
      } finally {
        refreshSteps();
      }
    },
  });
}

// ============================================
// FACULTY REFERENCE (click to copy)
// ============================================

async function loadFacultyReference() {
  const container = document.getElementById("hist-faculty-list");
  try {
    const faculty = await apiGet("/faculty");
    if (!Array.isArray(faculty) || !faculty.length) {
      container.innerHTML = `<span class="text-gray-400">No faculty found - add them in Faculty Management first.</span>`;
      return;
    }
    container.innerHTML = faculty.map((f) =>
      `<button type="button" data-faculty-name="${escapeHtml(f.name)}" title="Click to copy"` +
      ` class="bg-gray-100 border border-gray-200 rounded-full px-3 py-1 hover:bg-brand-light hover:border-brand">` +
      `${escapeHtml(f.name)}</button>`
    ).join("");
    container.querySelectorAll("[data-faculty-name]").forEach((chip) => {
      chip.addEventListener("click", async () => {
        const name = chip.dataset.facultyName;
        try {
          await navigator.clipboard.writeText(name);
          showToast(`Copied: ${name}`, "success");
        } catch (error) {
          showToast(name, "success");
        }
      });
    });
  } catch (error) {
    container.innerHTML = `<span class="text-gray-400">Could not load faculty list.</span>`;
  }
}

// ============================================
// INITIALIZE
// ============================================

function attachImportListeners() {
  const fileInput = document.getElementById("hist-import-input");

  document.getElementById("hist-import-btn").addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    handleImportFile(fileInput.files[0]);
    fileInput.value = "";
  });

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
  refreshSteps();
  await loadFacultyReference();
}

initializeHistoricalImport();
