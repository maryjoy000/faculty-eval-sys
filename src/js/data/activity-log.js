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

async function loadRecentActivityLog() {
  const container = document.getElementById("recent-activity-log-list");
  if (!container) return;

  try {
    const logs = await getActivityLog();

    if (!logs.length) {
      container.innerHTML =
        `<p class="text-gray-400">No recent administrative activity.</p>`;
      return;
    }

    container.innerHTML = logs.map((log) => {
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
  } catch (error) {
    console.error("Failed to load recent activity:", error);
    container.innerHTML =
      `<p class="text-gray-400">Unable to load activity log.</p>`;
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