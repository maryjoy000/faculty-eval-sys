// ============================================
// LOGIN PAGE
// ============================================

// ---------- Element References ----------
const passwordInput = document.getElementById("password");
const toggleButton = document.getElementById("toggle-password");
const iconEye = document.getElementById("icon-eye");
const iconEyeOff = document.getElementById("icon-eye-off");

const loginForm = document.getElementById("login-form");
const usernameInput = document.getElementById("username");
const usernameError = document.getElementById("username-error");
const passwordErrorMsg = document.getElementById("password-error");

// ============================================
// Password Visibility Toggle
// ============================================
if (passwordInput && toggleButton && iconEye && iconEyeOff) {

  toggleButton.addEventListener("click", () => {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";

    iconEye.classList.toggle("hidden", isHidden);
    iconEyeOff.classList.toggle("hidden", !isHidden);

    toggleButton.setAttribute(
      "aria-label",
      isHidden ? "Hide password" : "Show password"
    );
  });

}

// ============================================
// Authentication + role-based routing — now calling the real backend.
// Role comes from the server's response, not a username prefix, and
// password checking happens server-side against the real password hash
// (or, for students, the derived-password check) — never trust the
// frontend's own guess at who's logging in.
// ============================================
async function authenticateAndRedirect(username, password) {
  const errorMsg = document.getElementById("login-error-msg");
  if (errorMsg) errorMsg.classList.add("hidden");

  let result;
  try {
    result = await apiPost("/auth/login", { username, password });
  } catch (err) {
    // The backend deliberately returns one generic message for both a
    // wrong username and a wrong password (avoids confirming which
    // accounts exist) — so we no longer distinguish "Incorrect Username"
    // from "Incorrect password" here either.
    if (errorMsg) {
      errorMsg.textContent = err.data && err.data.error
        ? err.data.error
        : "Something went wrong. Please try again.";
      errorMsg.classList.remove("hidden");
    }
    return;
  }

  if (result.two_factor_required) {
    showTwoFactorCodeForm();
    return;
  }

  if (result.two_factor_setup_required) {
    await runLoginSetupFlow();
    return;
  }

  redirectByRole(result.role);
}

function redirectByRole(role) {
  if (role === "admin") {
    window.location.href = "pages/admin/dashboard.html";
  } else if (role === "hr") {
    window.location.href = "pages/hr/hr-dashboard.html";
  } else if (role === "faculty") {
    window.location.href = "pages/faculty/faculty-dashboard.html";
  } else if (role === "student") {
    window.location.href = "pages/student/select-faculty.html";
  }
}

// ============================================
// Two-factor second step (code entry)
// ============================================
function showTwoFactorCodeForm() {
  document.getElementById("login-form").classList.add("hidden");
  document.getElementById("two-factor-panel").classList.remove("hidden");
}

function hideTwoFactorForms() {
  document.getElementById("two-factor-panel").classList.add("hidden");
  document.getElementById("two-factor-setup-panel").classList.add("hidden");
  document.getElementById("login-form").classList.remove("hidden");
}

async function submitTwoFactorCode() {
  const codeInput = document.getElementById("two-factor-code");
  const errorMsg = document.getElementById("two-factor-error");
  errorMsg.classList.add("hidden");

  try {
    const result = await apiPost("/2fa/verify-login", { code: codeInput.value.trim() });
    redirectByRole(result.role);
  } catch (err) {
    errorMsg.textContent = err.data && err.data.error
      ? err.data.error
      : "Something went wrong. Please try again.";
    errorMsg.classList.remove("hidden");
  }
}

// ============================================
// First-login 2FA setup (admins without 2FA)
// ============================================
let pendingSetupRole = null;

async function runLoginSetupFlow() {
  document.getElementById("login-form").classList.add("hidden");
  document.getElementById("two-factor-setup-panel").classList.remove("hidden");

  try {
    const setup = await apiPost("/2fa/setup", {});
    document.getElementById("two-factor-qr").innerHTML = setup.qr_svg;
    document.getElementById("two-factor-manual-key").textContent = setup.manual_key;
  } catch (err) {
    const errorMsg = document.getElementById("two-factor-setup-error");
    errorMsg.textContent = "Could not start setup. Please try logging in again.";
    errorMsg.classList.remove("hidden");
  }
}

async function submitLoginSetupCode() {
  const codeInput = document.getElementById("two-factor-setup-code");
  const errorMsg = document.getElementById("two-factor-setup-error");
  errorMsg.classList.add("hidden");

  try {
    const result = await apiPost("/2fa/verify-setup", { code: codeInput.value.trim() });
    pendingSetupRole = result.role;
    if (result.backup_codes) {
      const list = document.getElementById("two-factor-backup-list");
      list.innerHTML = result.backup_codes.map((code) => `<li>${code}</li>`).join("");
      document.getElementById("two-factor-backup-codes").classList.remove("hidden");
    } else {
      redirectByRole(result.role);
    }
  } catch (err) {
    errorMsg.textContent = err.data && err.data.error
      ? err.data.error
      : "Something went wrong. Please try again.";
    errorMsg.classList.remove("hidden");
  }
}

const twoFactorSubmitBtn = document.getElementById("two-factor-submit");
if (twoFactorSubmitBtn) {
  twoFactorSubmitBtn.addEventListener("click", submitTwoFactorCode);
}

const twoFactorBackBtn = document.getElementById("two-factor-back");
if (twoFactorBackBtn) {
  twoFactorBackBtn.addEventListener("click", hideTwoFactorForms);
}

const twoFactorSetupSubmitBtn = document.getElementById("two-factor-setup-submit");
if (twoFactorSetupSubmitBtn) {
  twoFactorSetupSubmitBtn.addEventListener("click", submitLoginSetupCode);
}

const twoFactorSetupDoneBtn = document.getElementById("two-factor-setup-done");
if (twoFactorSetupDoneBtn) {
  twoFactorSetupDoneBtn.addEventListener("click", () => {
    if (pendingSetupRole) redirectByRole(pendingSetupRole);
  });
}

// Enter inside a code box verifies instead of re-submitting the login form.
[["two-factor-code", "two-factor-submit"], ["two-factor-setup-code", "two-factor-setup-submit"]].forEach(([inputId, buttonId]) => {
  const input = document.getElementById(inputId);
  if (input) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        document.getElementById(buttonId).click();
      }
    });
  }
});

// ============================================
// Login Form
// ============================================
if (loginForm) {

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    let isValid = true;

    // Username Validation
    if (usernameInput.value.trim() === "") {
      usernameError.classList.remove("hidden");
      usernameInput.classList.add("border-red-500");
      isValid = false;
    } else {
      usernameError.classList.add("hidden");
      usernameInput.classList.remove("border-red-500");
    }

    // Password Validation
    if (passwordInput.value.trim() === "") {
      passwordErrorMsg.classList.remove("hidden");
      passwordInput.classList.add("border-red-500");
      isValid = false;
    } else {
      passwordErrorMsg.classList.add("hidden");
      passwordInput.classList.remove("border-red-500");
    }

    if (!isValid) return;

    authenticateAndRedirect(usernameInput.value.trim(), passwordInput.value);
  });

}

// ============================================
// Forgot Password Modal
// ============================================

const forgotPasswordLink = document.getElementById("forgot-password-link");
const forgotPasswordModal = document.getElementById("forgot-password-modal");
const forgotPasswordBackdrop = document.getElementById("forgot-password-backdrop");
const forgotPasswordForm = document.getElementById("forgot-password-form");
const cancelForgotPassword = document.getElementById("cancel-forgot-password");
const resetConfirmation = document.getElementById("reset-confirmation");
const closeConfirmationBtn = document.getElementById("close-confirmation-btn");

if (
  forgotPasswordLink &&
  forgotPasswordModal &&
  forgotPasswordBackdrop &&
  forgotPasswordForm &&
  cancelForgotPassword &&
  resetConfirmation &&
  closeConfirmationBtn
) {

  function openForgotPasswordModal(event) {
    event.preventDefault();
    forgotPasswordModal.classList.remove("hidden");
  }

  function closeForgotPasswordModal() {
    forgotPasswordModal.classList.add("hidden");
    forgotPasswordForm.classList.remove("hidden");
    resetConfirmation.classList.add("hidden");
    forgotPasswordForm.reset();
  }

  forgotPasswordLink.addEventListener("click", openForgotPasswordModal);
  cancelForgotPassword.addEventListener("click", closeForgotPasswordModal);
  forgotPasswordBackdrop.addEventListener("click", closeForgotPasswordModal);
  closeConfirmationBtn.addEventListener("click", closeForgotPasswordModal);

  forgotPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const resetEmail = document.getElementById("reset-email");

    if (!resetEmail) return;

    const email = resetEmail.value.trim();
    const submitBtn = forgotPasswordForm.querySelector("button[type=submit]");

    if (submitBtn) submitBtn.disabled = true;

    try {
      await apiPost("/auth/forgot-password", { email });
    } catch (err) {
      // The API deliberately answers the same for every address; a failure
      // here is a network/server problem. Still show the generic
      // confirmation so account existence is never revealed.
      console.error("Password reset request failed:", err);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }

    forgotPasswordForm.classList.add("hidden");
    resetConfirmation.classList.remove("hidden");
  });

}