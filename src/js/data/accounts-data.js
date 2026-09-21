// ============================================
// SHARED DATA: User Accounts
// ============================================

function getRoleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "hr") return "HR";
  if (role === "faculty") return "Faculty";
  return role;
}