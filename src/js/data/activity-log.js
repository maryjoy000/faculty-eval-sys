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