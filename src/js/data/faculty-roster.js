// ============================================
// SHARED DATA: Faculty Roster
// ============================================
//
// Single source of truth for faculty members.
// Faculty data now comes from the backend API
// instead of localStorage/mock data.
//
// Backend endpoint:
// GET /api/faculty
//
// The object shape remains compatible with the
// existing frontend:
// {
//   id,
//   name,
//   status,
//   subjects: [{ code, name }],
//   sections: [...]
// }
// ============================================

let facultyRosterCache = [];

// --------------------------------------------
// Load faculty roster from backend
// --------------------------------------------
async function loadFacultyRoster() {
  facultyRosterCache = await apiGet("/faculty");
  return facultyRosterCache;
}

// --------------------------------------------
// Get currently loaded faculty roster
// --------------------------------------------
// IMPORTANT:
// This remains synchronous so existing pages that
// call getFacultyRoster() do not receive a Promise.
//
// Pages should call:
// await loadFacultyRoster();
// before rendering faculty-dependent content.
// --------------------------------------------
function getFacultyRoster() {
  return facultyRosterCache;
}

// --------------------------------------------
// Legacy save function
// --------------------------------------------
// Faculty changes should now be made through the
// backend Faculty API, not localStorage.
//
// Kept temporarily so older pages do not crash if
// they still reference saveFacultyRoster().
// --------------------------------------------
function saveFacultyRoster(roster) {
  facultyRosterCache = Array.isArray(roster) ? roster : [];
}

// --------------------------------------------
// Convenience: find which faculty teaches a
// given subject code
// --------------------------------------------
function getFacultyBySubjectCode(subjectCode) {
  return facultyRosterCache.find(
    (faculty) =>
      faculty.subjects?.some((s) => s.code === subjectCode)
  ) || null;
}

// --------------------------------------------
// Find faculty by database ID
// --------------------------------------------
function getFacultyById(facultyId) {
  return facultyRosterCache.find(
    (faculty) => String(faculty.id) === String(facultyId)
  ) || null;
}

// --------------------------------------------
// Get faculty sections
// --------------------------------------------
function getFacultySections(faculty) {
  return faculty?.sections || [];
}