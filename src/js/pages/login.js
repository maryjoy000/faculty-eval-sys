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

  if (result.role === "admin") {
    window.location.href = "pages/admin/dashboard.html";
  } else if (result.role === "hr") {
    window.location.href = "pages/hr/hr-dashboard.html";
  } else if (result.role === "faculty") {
    window.location.href = "pages/faculty/faculty-dashboard.html";
  } else if (result.role === "student") {
    window.location.href = "pages/student/select-faculty.html";
  }
}

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

  forgotPasswordForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const resetEmail = document.getElementById("reset-email");

    if (!resetEmail) return;

    const email = resetEmail.value.trim();

    console.log(`Password reset requested for: ${email}`);

    forgotPasswordForm.classList.add("hidden");
    resetConfirmation.classList.remove("hidden");
  });

}