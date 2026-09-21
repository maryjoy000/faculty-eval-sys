// ============================================
// ADMIN PROFILE PAGE
// ============================================

function mountPageContent() {
  const template = document.getElementById("page-content-template");
  const slot = document.getElementById("admin-page-content") || document.getElementById("hr-page-content");
  if (template && slot) {
    slot.appendChild(template.content.cloneNode(true));
  }
}

// --- Tab switching ---
function attachProfileTabListeners() {
  const tabButtons = document.querySelectorAll(".profile-tab-btn");

  function activateTab(tabName) {
    document.querySelectorAll(".profile-panel").forEach((panel) => panel.classList.add("hidden"));
    document.getElementById(`profile-panel-${tabName}`).classList.remove("hidden");

    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle("bg-brand", isActive);
      btn.classList.toggle("text-white", isActive);
      btn.classList.toggle("text-gray-600", !isActive);
      btn.classList.toggle("hover:bg-gray-100", !isActive);
    });
  }

  tabButtons.forEach((btn) => btn.addEventListener("click", () => activateTab(btn.dataset.tab)));
  activateTab("personal-info");
}

// --- Personal Info ---
async function loadPersonalInfoForm() {
  const profile = await apiGet("/profile");
  document.getElementById("profile-name-input").value = profile.name || "";
  document.getElementById("profile-email-input").value = profile.email || "";
  document.getElementById("profile-phone-input").value = profile.phone || "";
}

// --- Student-only: name is adviser-controlled, 2FA isn't available yet ---
function applyStudentProfileRestrictions() {
  if (getCurrentRole() !== "student") return;

  const nameInput = document.getElementById("profile-name-input");
  if (nameInput) {
    nameInput.readOnly = true;
    nameInput.classList.add("bg-gray-100", "cursor-not-allowed");
    nameInput.title = "Contact your adviser to update your name.";
  }

  const twoFactorTabBtn = document.querySelector('.profile-tab-btn[data-tab="two-factor"]');
  if (twoFactorTabBtn) {
    twoFactorTabBtn.classList.add("hidden");
  }
}

function attachPersonalInfoFormListener() {
  document.getElementById("personal-info-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    await apiPut("/profile", {
      name: document.getElementById("profile-name-input").value.trim(),
      email: document.getElementById("profile-email-input").value.trim(),
      phone: document.getElementById("profile-phone-input").value.trim()
    });

    const msg = document.getElementById("personal-info-saved-msg");
    msg.classList.remove("hidden");
    setTimeout(() => msg.classList.add("hidden"), 3000);

    renderActivityLog();
  });
}

// --- Change Password ---
function attachPasswordFormListener() {
  document.getElementById("password-form").addEventListener("submit", (event) => {
    event.preventDefault();

    const currentPassword = document.getElementById("current-password-input").value;
    const newPassword = document.getElementById("new-password-input").value;
    const confirmPassword = document.getElementById("confirm-password-input").value;
    const errorMsg = document.getElementById("password-error-msg");

    if (newPassword !== confirmPassword) {
      errorMsg.textContent = "New password and confirmation do not match.";
      errorMsg.classList.remove("hidden");
      return;
    }

    errorMsg.classList.add("hidden");

    showConfirmModal({
      title: "Change Password?",
      message: "You'll need to use your new password the next time you log in.",
      confirmLabel: "Change Password",
      isDestructive: false,
      onConfirm: () => finalizePasswordChange(currentPassword, newPassword)
    });
  });
}

async function finalizePasswordChange(currentPassword, newPassword) {
  const errorMsg = document.getElementById("password-error-msg");

  try {
    await apiPut("/profile", { current_password: currentPassword, password: newPassword });
  } catch (err) {
    // Most likely "Current password is incorrect" from the server.
    errorMsg.textContent = err.data && err.data.error
      ? err.data.error
      : "Something went wrong. Please try again.";
    errorMsg.classList.remove("hidden");
    return;
  }

  document.getElementById("password-form").reset();
  const savedMsg = document.getElementById("password-saved-msg");
  savedMsg.classList.remove("hidden");
  setTimeout(() => savedMsg.classList.add("hidden"), 3000);

  renderActivityLog();
}

// --- Two-Factor Authentication (real TOTP flow, staff only) ---
function setTwoFactorStatusMsg(isEnabled) {
  const msg = document.getElementById("two-factor-status-msg");
  if (!msg) return;
  msg.textContent = isEnabled
    ? "Two-factor authentication is currently ON."
    : "Two-factor authentication is currently OFF.";
}

function showTwoFactorSection(sectionId) {
  ["two-factor-start", "two-factor-setup", "two-factor-backup-codes", "two-factor-disable"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", id !== sectionId);
  });
}

async function refreshTwoFactorPanel() {
  const profile = await apiGet("/profile");
  const enabled = Boolean(profile.two_factor_enabled);
  setTwoFactorStatusMsg(enabled);
  showTwoFactorSection(enabled ? "two-factor-disable" : "two-factor-start");
}

async function startTwoFactorSetup() {
  const errorMsg = document.getElementById("two-factor-setup-error");
  errorMsg.classList.add("hidden");

  try {
    const setup = await apiPost("/2fa/setup", {});
    document.getElementById("two-factor-qr").innerHTML = setup.qr_svg;
    document.getElementById("two-factor-manual-key").textContent = setup.manual_key;
    document.getElementById("two-factor-setup-code").value = "";
    showTwoFactorSection("two-factor-setup");
  } catch (err) {
    errorMsg.textContent = err.data && err.data.error
      ? err.data.error
      : "Could not start setup. Please try again.";
    errorMsg.classList.remove("hidden");
    showTwoFactorSection("two-factor-setup");
  }
}

async function confirmTwoFactorSetup() {
  const codeInput = document.getElementById("two-factor-setup-code");
  const errorMsg = document.getElementById("two-factor-setup-error");
  errorMsg.classList.add("hidden");

  try {
    const result = await apiPost("/2fa/verify-setup", { code: codeInput.value.trim() });
    setTwoFactorStatusMsg(true);
    if (result.backup_codes) {
      const list = document.getElementById("two-factor-backup-list");
      list.innerHTML = result.backup_codes.map((code) => `<li>${code}</li>`).join("");
      showTwoFactorSection("two-factor-backup-codes");
    } else {
      showTwoFactorSection("two-factor-disable");
    }
    renderActivityLog();
  } catch (err) {
    errorMsg.textContent = err.data && err.data.error
      ? err.data.error
      : "Something went wrong. Please try again.";
    errorMsg.classList.remove("hidden");
  }
}

async function disableTwoFactor() {
  const passwordInput = document.getElementById("two-factor-disable-password");
  const errorMsg = document.getElementById("two-factor-disable-error");
  errorMsg.classList.add("hidden");

  try {
    await apiPost("/2fa/disable", { password: passwordInput.value });
    passwordInput.value = "";
    setTwoFactorStatusMsg(false);
    showTwoFactorSection("two-factor-start");
    renderActivityLog();
  } catch (err) {
    errorMsg.textContent = err.data && err.data.error
      ? err.data.error
      : "Something went wrong. Please try again.";
    errorMsg.classList.remove("hidden");
  }
}

function initTwoFactorPanel() {
  // Students don't get 2FA (their tab is hidden by applyStudentProfileRestrictions).
  if (getCurrentRole() === "student") return;

  const startBtn = document.getElementById("two-factor-start-btn");
  if (!startBtn) return;

  startBtn.addEventListener("click", startTwoFactorSetup);
  document.getElementById("two-factor-confirm-btn").addEventListener("click", confirmTwoFactorSetup);
  document.getElementById("two-factor-cancel-btn").addEventListener("click", refreshTwoFactorPanel);
  document.getElementById("two-factor-backup-done-btn").addEventListener("click", refreshTwoFactorPanel);
  document.getElementById("two-factor-disable-btn").addEventListener("click", disableTwoFactor);

  const setupCodeInput = document.getElementById("two-factor-setup-code");
  setupCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmTwoFactorSetup();
    }
  });

  refreshTwoFactorPanel();
}

// --- Activity Log ---
async function renderActivityLog() {
  const container = document.getElementById("activity-log-list");
  const log = await getActivityLog();

  container.innerHTML = log.length > 0
    ? log.map((entry) => `
        <div class="flex items-center justify-between py-2.5 text-sm">
          <span class="text-gray-700">${entry.description}</span>
          <span class="text-gray-400 text-xs">${new Date(entry.created_at).toLocaleString()}</span>
        </div>
      `).join("")
    : `<p class="text-sm text-gray-400">No activity recorded yet.</p>`;
}

// --- Session Management ---
function attachSessionManagementListener() {
  const button = document.getElementById("logout-other-devices-btn");
  if (!button) return;

  button.addEventListener("click", async () => {
    const msg = document.getElementById("logout-devices-msg");

    try {
      await apiPost("/auth/logout-all", {});

      if (msg) {
        msg.textContent = "Done — other sessions have been signed out.";
        msg.classList.remove("hidden", "text-red-600");
        setTimeout(() => msg.classList.add("hidden"), 3000);
      }

      renderActivityLog();
    } catch (error) {
      console.error("Failed to sign out other devices:", error);

      if (msg) {
        msg.textContent = "Unable to sign out other devices. Please try again.";
        msg.classList.remove("hidden");
        msg.classList.add("text-red-600");
        setTimeout(() => msg.classList.add("hidden"), 3000);
      }
    }
  });
}

// --- Show/hide toggles for the Change Password fields ---
function attachPasswordToggleListeners() {
  document.querySelectorAll(".password-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetInput = document.getElementById(btn.dataset.target);
      const eyeIcon = btn.querySelector(".icon-eye");
      const eyeOffIcon = btn.querySelector(".icon-eye-off");

      const isHidden = targetInput.type === "password";
      targetInput.type = isHidden ? "text" : "password";

      eyeIcon.classList.toggle("hidden", isHidden);
      eyeOffIcon.classList.toggle("hidden", !isHidden);

      btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
    });
  });
}

// --- Student-only: Back to Select Faculty button ---
function attachBackToSelectFacultyListener() {
  const backBtn = document.getElementById("back-to-select-faculty-btn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "select-faculty.html";
    });
  }
}

function attachBackToFacultyDashboardListener() {
  const backBtn = document.getElementById("back-to-faculty-dashboard-btn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "faculty-dashboard.html";
    });
  }
}

mountPageContent();
attachProfileTabListeners();
loadPersonalInfoForm();
applyStudentProfileRestrictions();
attachPersonalInfoFormListener();
attachPasswordFormListener();
initTwoFactorPanel();
renderActivityLog();
attachSessionManagementListener();
attachPasswordToggleListeners();
attachBackToSelectFacultyListener();
attachBackToFacultyDashboardListener();