// ============================================
// SYSTEM MANAGEMENT PAGE
// ============================================

function mountPageContent() {
  const template = document.getElementById("page-content-template");
  const slot = document.getElementById("admin-page-content");

  if (template && slot) {
    slot.appendChild(template.content.cloneNode(true));
  }
}

function showSavedMessage(id) {
  const message = document.getElementById(id);

  if (!message) return;

  message.classList.remove("hidden");

  setTimeout(() => {
    message.classList.add("hidden");
  }, 3000);
}

function showError(error) {
  console.error(error);
  alert(error.message || "Something went wrong.");
}

// ============================================
// TABS
// ============================================

function attachTabListeners() {
  const tabButtons = document.querySelectorAll(".settings-tab-btn");

  function activateTab(tabName) {
    document
      .querySelectorAll(".settings-panel")
      .forEach((panel) => panel.classList.add("hidden"));

    document
      .getElementById(`settings-panel-${tabName}`)
      ?.classList.remove("hidden");

    tabButtons.forEach((btn) => {
      const active = btn.dataset.tab === tabName;

      btn.classList.toggle("bg-brand", active);
      btn.classList.toggle("text-white", active);
      btn.classList.toggle("text-gray-600", !active);
      btn.classList.toggle("hover:bg-gray-100", !active);
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      activateTab(btn.dataset.tab);
    });
  });

  activateTab("academic-year");
}

// ============================================
// ACADEMIC YEAR
// ============================================

async function loadAcademicYearForm() {
  const settings = await loadSystemSettings();

  document.getElementById("academic-year-input").value = settings.academicYear;

  document.getElementById("semester-input").value = settings.semester;
}

function attachAcademicYearFormListener() {
  document
    .getElementById("academic-year-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();

      try {
        const academicYear = document
          .getElementById("academic-year-input")
          .value.trim();

        const semester = document.getElementById("semester-input").value;

        if (!academicYear) {
          alert("Academic Year is required.");
          return;
        }

        await saveSystemSettings({
          academicYear,
          semester,
        });

        showSavedMessage("academic-year-saved-msg");
      } catch (error) {
        showError(error);
      }
    });
}

// ============================================
// EVALUATION PERIOD
// ============================================

async function loadEvaluationPeriodForm() {
  const period = await loadEvaluationPeriod();

  document.getElementById("evaluation-type-input").value =
    period.evaluationType;

  document.getElementById("period-start-date").value =
    period.startDate;

  document.getElementById("period-end-date").value =
    period.endDate;
}

function attachEvaluationPeriodFormListener() {
  document
    .getElementById("evaluation-period-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();

      const evaluationType =
        document.getElementById("evaluation-type-input").value;

      const startDate =
        document.getElementById("period-start-date").value;

      const endDate =
        document.getElementById("period-end-date").value;

      if (!evaluationType) {
        alert("Please select an evaluation type.");
        return;
      }

      if (!startDate || !endDate) {
        alert("Both the opening and closing dates are required.");
        return;
      }

      if (startDate > endDate) {
        alert(
          "The 'Opens On' date must be before the 'Closes On' date."
        );
        return;
      }

      try {
        await saveEvaluationPeriod({
          evaluationType,
          startDate,
          endDate
        });

        showSavedMessage("evaluation-period-saved-msg");

      } catch (error) {
        showError(error);
      }
    });
}

// ============================================
// ANNOUNCEMENT
// ============================================

async function loadAnnouncementForm() {
  const announcement = await loadAnnouncement();

  document.getElementById("announcement-message-input").value =
    announcement.message;

  document.getElementById("announcement-active-checkbox").checked =
    announcement.isActive;
}

function attachAnnouncementFormListener() {
  document
    .getElementById("announcement-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();

      try {
        await saveAnnouncement({
          message: document
            .getElementById("announcement-message-input")
            .value.trim(),

          isActive: document.getElementById("announcement-active-checkbox")
            .checked,
        });

        showSavedMessage("announcement-saved-msg");
      } catch (error) {
        showError(error);
      }
    });
}

// ============================================
// ACCOUNTS
// ============================================

let accountsCache = [];

async function loadAccounts() {
  try {
    accountsCache = await apiGet("/accounts");
    renderAccountsTable();
  } catch (error) {
    showError(error);
  }
}

function getFilteredAccounts() {
  const searchInput = document.getElementById("account-search-input");

  const roleFilter = document.getElementById("account-role-filter");

  const searchTerm = (searchInput?.value || "").trim().toLowerCase();

  const selectedRole = roleFilter?.value || "all";

  return accountsCache.filter((account) => {
    const name = (account.name || "").toLowerCase();

    const username = (account.username || "").toLowerCase();

    return (
      (name.includes(searchTerm) || username.includes(searchTerm)) &&
      (selectedRole === "all" || account.role === selectedRole)
    );
  });
}

function renderAccountsTable() {
  const tableBody = document.getElementById("accounts-table-body");

  if (!tableBody) return;

  const accounts = getFilteredAccounts();

  if (accounts.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5"
            class="py-6 text-center text-gray-400">
          No accounts found.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = accounts
    .map(
      (account) => `
      <tr class="border-b border-gray-200 last:border-0">
        <td class="py-3 pr-4">
          ${account.name}
        </td>

        <td class="py-3 pr-4 text-gray-500">
          ${account.username}
        </td>

        <td class="py-3 pr-4">
          ${getRoleLabel(account.role)}
        </td>

        <td class="py-3 pr-4">
          <span class="${
            account.status === "active" ? "text-green-600" : "text-gray-400"
          } font-medium">
            ${account.status === "active" ? "Active" : "Inactive"}
          </span>
        </td>

        <td class="py-3 flex gap-3 text-sm">
          <button
            type="button"
            class="edit-account-btn text-brand hover:underline"
            data-account-id="${account.id}">
            Edit
          </button>

          <button
            type="button"
            class="toggle-account-status-btn text-amber-600 hover:underline"
            data-account-id="${account.id}">
            ${account.status === "active" ? "Deactivate" : "Activate"}
          </button>
        </td>
      </tr>
    `,
    )
    .join("");

  attachAccountRowListeners();
}

function attachAccountRowListeners() {
  document.querySelectorAll(".edit-account-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openAccountModal(btn.dataset.accountId);
    });
  });

  document.querySelectorAll(".toggle-account-status-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const account = accountsCache.find(
        (a) => String(a.id) === btn.dataset.accountId,
      );

      if (!account) return;

      try {
        const updated = await apiPut(`/accounts/${account.id}`, {
          status: account.status === "active" ? "inactive" : "active",
        });

        accountsCache = accountsCache.map((a) =>
          a.id === updated.id ? updated : a,
        );

        renderAccountsTable();
      } catch (error) {
        showError(error);
      }
    });
  });
}

function attachAccountFilterListeners() {
  document
    .getElementById("account-search-input")
    .addEventListener("input", renderAccountsTable);

  document
    .getElementById("account-role-filter")
    .addEventListener("change", renderAccountsTable);
}

function openAccountModal(accountId) {
  const modal = document.getElementById("account-modal");

  const title = document.getElementById("account-modal-title");

  const form = document.getElementById("account-form");

  form.reset();

  document.getElementById("account-form-id").value = "";

  document.getElementById("account-password-input").required = !accountId;

  if (accountId) {
    const account = accountsCache.find(
      (a) => String(a.id) === String(accountId),
    );

    if (account) {
      title.textContent = "Edit Account";

      document.getElementById("account-form-id").value = account.id;

      document.getElementById("account-name-input").value = account.name;

      document.getElementById("account-username-input").value =
        account.username;

      document.getElementById("account-role-input").value = account.role;
    }
  } else {
    title.textContent = "Add Account";
  }

  modal.classList.remove("hidden");
}

function closeAccountModal() {
  document.getElementById("account-modal").classList.add("hidden");
}

function attachAccountModalListeners() {
  document
    .getElementById("add-account-btn")
    .addEventListener("click", () => openAccountModal(null));

  document
    .getElementById("cancel-account-btn")
    .addEventListener("click", closeAccountModal);

  document
    .getElementById("account-modal-backdrop")
    .addEventListener("click", closeAccountModal);

  document
    .getElementById("account-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();

      const editingId = document.getElementById("account-form-id").value;

      const formData = {
        name: document.getElementById("account-name-input").value.trim(),

        username: document
          .getElementById("account-username-input")
          .value.trim(),

        role: document.getElementById("account-role-input").value,

        password: document.getElementById("account-password-input").value,
      };

      if (!formData.name || !formData.username) {
        alert("Name and username are required.");
        return;
      }

      if (!editingId && !formData.password) {
        alert("Password is required for a new account.");
        return;
      }

      try {
        let saved;

        if (editingId) {
          const body = {
            name: formData.name,
            username: formData.username,
            role: formData.role,
          };

          if (formData.password) {
            body.password = formData.password;
          }

          saved = await apiPut(`/accounts/${editingId}`, body);

        } else {
          saved = await apiPost("/accounts", {
            name: formData.name,
            username: formData.username,
            role: formData.role,
            password: formData.password,
          });

        }

        accountsCache = editingId
          ? accountsCache.map((account) =>
              account.id === saved.id ? saved : account,
            )
          : [...accountsCache, saved];

        closeAccountModal();
        renderAccountsTable();
      } catch (error) {
        showError(error);
      }
    });
}

// ============================================
// SCORE WEIGHTING
// ============================================

async function loadWeightingForm() {
  const w = await loadWeighting();

  document.getElementById("weight-classroom-input").value =
    w.classroomObservation;

  document.getElementById("weight-domain6-input").value = w.domain6Share;

  document.getElementById("weight-domain7-input").value = w.domain7Share;

  document.getElementById("weight-peer-input").value = w.peerShareOfDomain6;

  document.getElementById("weight-student-input").value =
    w.studentShareOfDomain6;

  updateWeightingLiveDisplay();
}

function updateWeightingLiveDisplay() {
  const classroomVal =
    Number(document.getElementById("weight-classroom-input").value) || 0;

  const domain6Val =
    Number(document.getElementById("weight-domain6-input").value) || 0;

  const domain7Val =
    Number(document.getElementById("weight-domain7-input").value) || 0;

  const peerVal =
    Number(document.getElementById("weight-peer-input").value) || 0;

  const studentVal =
    Number(document.getElementById("weight-student-input").value) || 0;

  const nonClassroom = 100 - classroomVal;

  document.getElementById("non-classroom-display").textContent = nonClassroom
    .toFixed(2)
    .replace(/\.00$/, "");

  const domainTotal = domain6Val + domain7Val;

  const domainMsg = document.getElementById("domain-total-msg");

  domainMsg.textContent = `Total: ${domainTotal}% ${
    domainTotal === 100 ? "" : "(must equal 100%)"
  }`;

  domainMsg.className = `text-xs mt-2 ${
    domainTotal === 100 ? "text-green-600" : "text-red-600"
  }`;

  const splitTotal = peerVal + studentVal;

  const splitMsg = document.getElementById("domain6-split-total-msg");

  splitMsg.textContent = `Total: ${splitTotal}% ${
    splitTotal === 100 ? "" : "(must equal 100%)"
  }`;

  splitMsg.className = `text-xs mt-2 ${
    splitTotal === 100 ? "text-green-600" : "text-red-600"
  }`;

  const domain6 = nonClassroom * (domain6Val / 100);

  const domain7 = nonClassroom * (domain7Val / 100);

  const effective = {
    "Classroom Observation": classroomVal,

    "Student Evaluation": domain6 * (studentVal / 100),

    "Peer-to-Peer Evaluation": domain6 * (peerVal / 100),

    "HR Evaluation": domain7,
  };

  document.getElementById("effective-weights-display").innerHTML =
    Object.entries(effective)
      .map(
        ([label, value]) => `
          <div class="flex items-center justify-between">
            <span>${label}</span>
            <span class="font-medium text-gray-800">
              ${value.toFixed(2)}%
            </span>
          </div>
        `,
      )
      .join("");
}

function attachWeightingFormListener() {
  [
    "weight-classroom-input",
    "weight-domain6-input",
    "weight-domain7-input",
    "weight-peer-input",
    "weight-student-input",
  ].forEach((id) => {
    document
      .getElementById(id)
      .addEventListener("input", updateWeightingLiveDisplay);
  });

  document
    .getElementById("weighting-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();

      const classroomObservation =
        Number(document.getElementById("weight-classroom-input").value) || 0;

      const domain6Share =
        Number(document.getElementById("weight-domain6-input").value) || 0;

      const domain7Share =
        Number(document.getElementById("weight-domain7-input").value) || 0;

      const peerShareOfDomain6 =
        Number(document.getElementById("weight-peer-input").value) || 0;

      const studentShareOfDomain6 =
        Number(document.getElementById("weight-student-input").value) || 0;

      if (domain6Share + domain7Share !== 100) {
        alert("Domain 6 and Domain 7 shares must total exactly 100%.");
        return;
      }

      if (peerShareOfDomain6 + studentShareOfDomain6 !== 100) {
        alert(
          "Peer-to-Peer and Student shares within Domain 6 must total exactly 100%.",
        );
        return;
      }

      if (classroomObservation < 0 || classroomObservation > 100) {
        alert("Classroom Observation must be between 0% and 100%.");
        return;
      }

      try {
        await saveWeighting({
          classroomObservation,
          domain6Share,
          domain7Share,
          peerShareOfDomain6,
          studentShareOfDomain6,
        });

        showSavedMessage("weighting-saved-msg");
      } catch (error) {
        showError(error);
      }
    });
}

// ============================================
// INITIALIZE
// ============================================

async function initializeSystemManagement() {
  mountPageContent();

  attachTabListeners();

  attachAcademicYearFormListener();
  attachEvaluationPeriodFormListener();
  attachAnnouncementFormListener();

  attachAccountFilterListeners();
  attachAccountModalListeners();

  attachWeightingFormListener();

  await Promise.all([
    loadAcademicYearForm(),
    loadEvaluationPeriodForm(),
    loadAnnouncementForm(),
    loadAccounts(),
    loadWeightingForm(),
  ]);
}

initializeSystemManagement();
