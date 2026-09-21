// ============================================
// SHARED DATA: Released Evaluation Reports
// ============================================
// Tracks which faculty members have had their combined report "sent"
// (released) by HR, and when. Once released, the faculty member can
// view their own report in the Faculty portal.

function getReleasedReports() {
  const stored = localStorage.getItem("releasedReports");
  return stored ? JSON.parse(stored) : {};
}

function saveReleasedReports(releasedReports) {
  localStorage.setItem("releasedReports", JSON.stringify(releasedReports));
}

function isReportReleased(facultyId) {
  const releasedReports = getReleasedReports();
  return !!releasedReports[facultyId];
}

function releaseReport(facultyId) {
  const releasedReports = getReleasedReports();
  releasedReports[facultyId] = { releasedAt: new Date().toLocaleString() };
  saveReleasedReports(releasedReports);
}