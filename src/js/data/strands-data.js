// ============================================
// SHARED DATA: Strands & Core Subjects (K-12 SHS structure)
// ============================================
// Faculty are NOT owned by a single strand — a faculty member can teach
// strand-specific subjects across multiple strands, plus Core Subjects
// that every strand takes.
//
// Starts empty — populate via System Management once real data exists.
// Once a backend exists, getStrands()/getCoreSubjects() become fetch()
// calls instead of reading localStorage; nothing else changes.

function getStrands() {
  const stored = localStorage.getItem("strands");
  return stored ? JSON.parse(stored) : [];
}

function saveStrands(strands) {
  localStorage.setItem("strands", JSON.stringify(strands));
}

function getCoreSubjects() {
  const stored = localStorage.getItem("coreSubjects");
  return stored ? JSON.parse(stored) : [];
}

function saveCoreSubjects(subjects) {
  localStorage.setItem("coreSubjects", JSON.stringify(subjects));
}

function getAllSubjectNames() {
  const strandSubjects = getStrands().flatMap((s) => s.subjects);
  return [...strandSubjects, ...getCoreSubjects()];
}