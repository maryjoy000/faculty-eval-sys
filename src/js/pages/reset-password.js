// ============================================
// RESET PASSWORD PAGE
// Opens from the emailed link: /src/reset-password.html?token=...
// ============================================

const resetToken =
  new URLSearchParams(window.location.search).get("token") || "";

const resetForm = document.getElementById("reset-password-form");
const resetError = document.getElementById("reset-error");
const resetSuccess = document.getElementById("reset-success-panel");
const resetInvalid = document.getElementById("reset-invalid-panel");

function showResetError(message) {
  if (!resetError) return;
  resetError.textContent = message;
  resetError.classList.remove("hidden");
}

function hideResetForm() {
  if (resetForm) resetForm.classList.add("hidden");
}

function showInvalidLink() {
  const formPanel = document.getElementById("reset-form-panel");
  if (formPanel) formPanel.classList.add("hidden");
  if (resetInvalid) resetInvalid.classList.remove("hidden");
}

// --- Password visibility toggles (eye / eye-off per field) ---
document.querySelectorAll(".password-toggle-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetInput = document.getElementById(btn.dataset.target);
    if (!targetInput) return;

    const isHidden = targetInput.type === "password";
    targetInput.type = isHidden ? "text" : "password";

    const eyeIcon = btn.querySelector(".icon-eye");
    const eyeOffIcon = btn.querySelector(".icon-eye-off");

    if (eyeIcon) eyeIcon.classList.toggle("hidden", isHidden);
    if (eyeOffIcon) eyeOffIcon.classList.toggle("hidden", !isHidden);

    btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
  });
});

if (!resetToken) {
  showInvalidLink();
} else if (resetForm) {
  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (resetError) resetError.classList.add("hidden");

    const passwordInput = document.getElementById("new-password");
    const confirmInput = document.getElementById("confirm-password");
    const submitBtn = document.getElementById("reset-submit");

    const password = passwordInput ? passwordInput.value : "";
    const confirm = confirmInput ? confirmInput.value : "";

    if (password.length < 8) {
      showResetError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      showResetError("Password and confirmation do not match.");
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      await apiPost("/auth/reset-password", {
        token: resetToken,
        password: password,
        confirm_password: confirm,
      });

      hideResetForm();
      if (resetSuccess) resetSuccess.classList.remove("hidden");

      setTimeout(() => {
        window.location.href = "index.html";
      }, 4000);
    } catch (err) {
      showResetError(
        err.data && err.data.error
          ? err.data.error
          : "Something went wrong. Please try again."
      );

      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
