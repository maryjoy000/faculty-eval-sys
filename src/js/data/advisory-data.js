// ============================================
// SHARED DATA: Advisory Class Masterlists
// ============================================
// Faculty (as advisers) maintain a masterlist of their advisory section's
// students (Name + LRN). This becomes the basis for student login/auth
// and section identification — no separate student account system needed.
//
// Starts empty — populated via the Faculty "My Advisory Class" page.

function getAdvisoryClasses() {
  const stored = localStorage.getItem("advisoryClasses");
  return stored ? JSON.parse(stored) : [];
}

function saveAdvisoryClasses(classes) {
  localStorage.setItem("advisoryClasses", JSON.stringify(classes));
}

// --- Look up a student by LRN across every advisory class ---
// Returns { lrn, name, section } if found, otherwise null.
function findStudentByLrn(lrn) {
  const classes = getAdvisoryClasses();
  for (const advisoryClass of classes) {
    const student = advisoryClass.students.find((s) => s.lrn === lrn);
    if (student) {
      return { lrn: student.lrn, name: student.name, section: advisoryClass.section };
    }
  }
  return null;
}

// --- Derive a simple password check from the student's last name ---
// Assumes "Last, First" or "First Last" format; takes the first
// comma-separated part, or the last space-separated word as a fallback.
function getExpectedPasswordForStudent(fullName) {
  if (fullName.includes(",")) {
    return fullName.split(",")[0].trim().toLowerCase();
  }
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}