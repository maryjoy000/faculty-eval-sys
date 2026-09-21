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

// --- Two-Factor Authentication ---
async function loadTwoFactorToggle() {
  const profile = await apiGet("/profile");
  const toggle = document.getElementById("two-factor-toggle");
  toggle.checked = profile.two_factor_enabled;
  updateTwoFactorStatusMsg(profile.two_factor_enabled);
}

function updateTwoFactorStatusMsg(isEnabled) {
  const msg = document.getElementById("two-factor-status-msg");
  msg.textContent = isEnabled
    ? "Two-factor authentication is currently ON."
    : "Two-factor authentication is currently OFF.";
}

function attachTwoFactorToggleListener() {
  document.getElementById("two-factor-toggle").addEventListener("change", async (event) => {
    const isEnabled = event.target.checked;
    await apiPut("/profile", { two_factor_enabled: isEnabled });
    updateTwoFactorStatusMsg(isEnabled);
    renderActivityLog();
  });
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
  document.getElementById("logout-other-devices-btn").addEventListener("click", () => {
    console.log("Log out of all other devices — placeholder, no real multi-session backend yet.");

    const msg = document.getElementById("logout-devices-msg");
    msg.classList.remove("hidden");
    setTimeout(() => msg.classList.add("hidden"), 3000);
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
loadTwoFactorToggle();
attachTwoFactorToggleListener();
renderActivityLog();
attachSessionManagementListener();
attachPasswordToggleListeners();
attachBackToSelectFacultyListener();
attachBackToFacultyDashboardListener();