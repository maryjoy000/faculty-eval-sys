// ============================================
// AUDIT LOG PAGE (Admin)
// ============================================
// System-wide record of user actions across all roles.
// What an audit log is for: who did what, and when.

function mountPageContent() {
  const template = document.getElementById("page-content-template");
  const slot = document.getElementById("admin-page-content");

  if (template && slot) {
    slot.appendChild(template.content.cloneNode(true));
  }
}

let auditLogCache = [];

var auditLogPager = null;
function getAuditLogPager() {
  if (!auditLogPager) {
    if (typeof TablePagination !== "undefined" && TablePagination.create) {
      auditLogPager = TablePagination.create({ defaultPerPage: 10 });
    } else {
      auditLogPager = null;
    }
  }
  return auditLogPager;
}

function escapeAuditText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function auditRoleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "hr") return "HR";
  if (role === "faculty") return "Faculty";
  if (role === "student") return "Student";
  return "—";
}

function getFilteredAuditLogs() {
  const searchInput = document.getElementById("audit-search-input");
  const roleFilter = document.getElementById("audit-role-filter");

  const searchTerm = (searchInput?.value || "").trim().toLowerCase();
  const selectedRole = roleFilter?.value || "all";

  return auditLogCache.filter((log) => {
    const actor = (log.actor_name || "").toLowerCase();
    const action = (log.description || "").toLowerCase();

    const matchesSearch =
      !searchTerm || actor.includes(searchTerm) || action.includes(searchTerm);

    const matchesRole =
      selectedRole === "all" || (log.actor_role || "") === selectedRole;

    return matchesSearch && matchesRole;
  });
}

function renderAuditLogTable() {
  const tableBody = document.getElementById("audit-log-table-body");
  if (!tableBody) return;

  const logs = getFilteredAuditLogs();

  if (!logs.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="py-6 text-center text-gray-400">
          No audit records found.
        </td>
      </tr>
    `;
    const emptyPager = getAuditLogPager();
    if (emptyPager) {
      emptyPager.render("audit-log-pagination", 0, renderAuditLogTable);
    } else {
      const fallbackContainer = document.getElementById("audit-log-pagination");
      if (fallbackContainer) fallbackContainer.innerHTML = "";
    }
    return;
  }

  const pager = getAuditLogPager();
  const pageItems = pager ? pager.paginate(logs) : logs;

  tableBody.innerHTML = pageItems
    .map((log) => {
      const date = log.created_at
        ? new Date(log.created_at).toLocaleString()
        : "Unknown date";

      return `
        <tr class="border-b border-gray-200 last:border-0">
          <td class="py-3 pr-4 text-gray-500 whitespace-nowrap">${escapeAuditText(date)}</td>
          <td class="py-3 pr-4 font-medium text-gray-800">${escapeAuditText(log.actor_name || "—")}</td>
          <td class="py-3 pr-4 text-gray-500">${escapeAuditText(auditRoleLabel(log.actor_role))}</td>
          <td class="py-3 text-gray-700">${escapeAuditText(log.description)}</td>
        </tr>
      `;
    })
    .join("");

  if (pager) {
    pager.render("audit-log-pagination", logs.length, renderAuditLogTable);
  } else {
    const fallbackContainer = document.getElementById("audit-log-pagination");
    if (fallbackContainer) fallbackContainer.innerHTML = "";
  }
}

async function loadAuditLogs() {
  const tableBody = document.getElementById("audit-log-table-body");
  if (!tableBody) return;

  try {
    const logs = await apiGet("/activity-logs?limit=200");
    auditLogCache = Array.isArray(logs) ? logs : [];

    const pager = getAuditLogPager();
    if (pager) pager.reset();

    renderAuditLogTable();
  } catch (error) {
    console.error("Failed to load audit log:", error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="py-6 text-center text-red-500">
          Unable to load audit log.
        </td>
      </tr>
    `;
    const fallbackContainer = document.getElementById("audit-log-pagination");
    if (fallbackContainer) fallbackContainer.innerHTML = "";
  }
}

function attachAuditLogFilterListeners() {
  document
    .getElementById("audit-search-input")
    ?.addEventListener("input", () => {
      const pager = getAuditLogPager();
      if (pager) pager.reset();
      renderAuditLogTable();
    });

  document
    .getElementById("audit-role-filter")
    ?.addEventListener("change", () => {
      const pager = getAuditLogPager();
      if (pager) pager.reset();
      renderAuditLogTable();
    });
}

mountPageContent();
attachAuditLogFilterListeners();
loadAuditLogs();
