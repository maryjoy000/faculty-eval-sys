// ============================================
// SHARED DATA: Admin/HR Activity Log
// ============================================

async function getActivityLog() {
  try {
    return await apiGet("/activity-logs/mine");
  } catch (error) {
    console.error("Failed to load activity log:", error);
    return [];
  }
}

let activityLogCache = [];

var activityLogPager = null;
function getActivityLogPager() {
  if (!activityLogPager) {
    if (typeof TablePagination !== "undefined" && TablePagination.create) {
      activityLogPager = TablePagination.create({ defaultPerPage: 5 });
    } else {
      activityLogPager = null;
    }
  }
  return activityLogPager;
}

function renderActivityLogPage() {
  const container = document.getElementById("recent-activity-log-list");
  if (!container) return;

  const paginationContainer = document.getElementById("recent-activity-log-pagination");
  const pager = getActivityLogPager();

  if (!activityLogCache.length) {
    container.innerHTML =
      `<p class="text-gray-400">No recent administrative activity.</p>`;
    if (paginationContainer) paginationContainer.innerHTML = "";
    return;
  }

  const pageItems = pager ? pager.paginate(activityLogCache) : activityLogCache;

  container.innerHTML = pageItems.map((log) => {
    const date = log.created_at
      ? new Date(log.created_at).toLocaleString()
      : "Unknown date";

    return `
      <div class="py-3 border-b border-gray-100 last:border-b-0">
        <p class="text-sm text-gray-700">${log.description}</p>
        <p class="text-xs text-gray-400 mt-1">${date}</p>
      </div>
    `;
  }).join("");

  if (pager) {
    pager.render("recent-activity-log-pagination", activityLogCache.length, renderActivityLogPage);
  } else if (paginationContainer) {
    paginationContainer.innerHTML = "";
  }
}

async function loadRecentActivityLog() {
  const container = document.getElementById("recent-activity-log-list");
  if (!container) return;

  try {
    const logs = await getActivityLog();

    activityLogCache = Array.isArray(logs) ? logs : [];

    const pager = getActivityLogPager();
    if (pager) pager.reset();

    renderActivityLogPage();
  } catch (error) {
    console.error("Failed to load recent activity:", error);
    container.innerHTML =
      `<p class="text-gray-400">Unable to load activity log.</p>`;
    const paginationContainer = document.getElementById("recent-activity-log-pagination");
    if (paginationContainer) paginationContainer.innerHTML = "";
  }
}

async function logActivity(description) {
  try {
    return await apiPost("/activity-logs", {
      description
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
    return null;
  }
}