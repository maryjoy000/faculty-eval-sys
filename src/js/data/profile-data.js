// ============================================
// SHARED DATA: User Profile (role-scoped)
// ============================================

const DEFAULT_PROFILE = {
  name: "User",
  email: "",
  phone: "",
  twoFactorEnabled: false
};

// --- Now backed by the real session (see session.js), not DOM detection ---
function getCurrentRole() {
  return currentSession ? currentSession.role : "admin";
}

function getAdminProfile() {
  const role = getCurrentRole();
  const stored = localStorage.getItem(`${role}Profile`);
  return stored ? JSON.parse(stored) : { ...DEFAULT_PROFILE, name: `${role.charAt(0).toUpperCase() + role.slice(1)} User` };
}

function saveAdminProfile(profile) {
  const role = getCurrentRole();
  const current = getAdminProfile();
  const updated = { ...current, ...profile };
  localStorage.setItem(`${role}Profile`, JSON.stringify(updated));
  return updated;
}