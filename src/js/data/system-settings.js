// ============================================
// SHARED DATA: System Settings
// ============================================

const DEFAULT_SYSTEM_SETTINGS = {
  academicYear: "2025-2026",
  semester: "2nd"
};

let systemSettingsCache = {
  ...DEFAULT_SYSTEM_SETTINGS
};

async function loadSystemSettings() {
  try {
    const response = await fetch(
      "http://127.0.0.1:5000/api/system-settings",
      {
        credentials: "include"
      }
    );

    if (!response.ok) {
      throw new Error("Failed to load system settings");
    }

    const data = await response.json();

    systemSettingsCache = {
      academicYear: data.academic_year || DEFAULT_SYSTEM_SETTINGS.academicYear,
      semester: data.semester || DEFAULT_SYSTEM_SETTINGS.semester
    };

    return systemSettingsCache;
  } catch (error) {
    console.error("Failed to load system settings:", error);
    return systemSettingsCache;
  }
}

function getSystemSettings() {
  return systemSettingsCache;
}

async function saveSystemSettings(newSettings) {
  const response = await fetch(
    "http://127.0.0.1:5000/api/system-settings",
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        academic_year: newSettings.academicYear,
        semester: newSettings.semester
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to save system settings");
  }

  systemSettingsCache = {
    academicYear: data.academic_year,
    semester: data.semester
  };

  return systemSettingsCache;
}

function getSemesterLabel(semesterCode) {
  if (semesterCode === "1st") return "1st Semester";
  if (semesterCode === "3rd") return "3rd Semester";
  return "2nd Semester";
}

function getAcademicYearDisplay() {
  const settings = getSystemSettings();

  return `Academic Year ${settings.academicYear} | ${getSemesterLabel(
    settings.semester
  )}`;
}