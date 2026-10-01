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

function showError(error) {
  console.error(error);
  showToast(error.message || "Something went wrong.", "error");
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
        showToast("Please select an evaluation type.", "warning");
        return;
      }

      if (!startDate || !endDate) {
        showToast("Both the opening and closing dates are required.", "warning");
        return;
      }

      if (startDate > endDate) {
        showToast(
          "The 'Opens On' date must be before the 'Closes On' date.",
          "warning"
        );
        return;
      }

      try {
        await saveEvaluationPeriod({
          evaluationType,
          startDate,
          endDate
        });

        showToast("Evaluation period saved.", "success");

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

        showToast("Announcement saved.", "success");
      } catch (error) {
        showError(error);
      }
    });
}

// ============================================
// ACCOUNTS
// ============================================

let accountsCache = [];

var accountsTablePager = null;
function getAccountsTablePager() {
  if (!accountsTablePager) {
    if (typeof TablePagination !== "undefined" && TablePagination.create) {
      accountsTablePager = TablePagination.create({ defaultPerPage: 10 });
    } else {
      accountsTablePager = null;
    }
  }
  return accountsTablePager;
}

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
    const emptyPager = getAccountsTablePager();
    if (emptyPager) {
      emptyPager.render("accounts-pagination", 0, renderAccountsTable);
    } else {
      const fallbackContainer = document.getElementById("accounts-pagination");
      if (fallbackContainer) fallbackContainer.innerHTML = "";
    }
    return;
  }

  const pager = getAccountsTablePager();
  const pageItems = pager ? pager.paginate(accounts) : accounts;

  tableBody.innerHTML = pageItems
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

  if (pager) {
    pager.render("accounts-pagination", accounts.length, renderAccountsTable);
  }
}

function attachAccountRowListeners() {
  document.querySelectorAll(".edit-account-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openAccountModal(btn.dataset.accountId);
    });
  });

  document.querySelectorAll(".toggle-account-status-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const account = accountsCache.find(
        (a) => String(a.id) === btn.dataset.accountId,
      );

      if (!account) return;

      const deactivating = account.status === "active";

      showConfirmModal({
        title: deactivating ? "Deactivate Account?" : "Activate Account?",
        message: deactivating
          ? `"${account.name} (${account.username})" won't be able to log in until reactivated.`
          : `"${account.name} (${account.username})" will be able to log in again.`,
        confirmLabel: deactivating ? "Deactivate" : "Activate",
        isDestructive: deactivating,
        onConfirm: async () => {
          try {
            const updated = await apiPut(`/accounts/${account.id}`, {
              status: deactivating ? "inactive" : "active",
            });

            accountsCache = accountsCache.map((a) =>
              a.id === updated.id ? updated : a,
            );

            renderAccountsTable();
            showToast(
              deactivating ? "Account deactivated." : "Account activated.",
              "success"
            );
          } catch (error) {
            showError(error);
          }
        },
      });
    });
  });
}

function attachAccountFilterListeners() {
  document
    .getElementById("account-search-input")
    .addEventListener("input", () => {
      const pager = getAccountsTablePager();
      if (pager) pager.reset();
      renderAccountsTable();
    });

  document
    .getElementById("account-role-filter")
    .addEventListener("change", () => {
      const pager = getAccountsTablePager();
      if (pager) pager.reset();
      renderAccountsTable();
    });
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
        showToast("Name and username are required.", "warning");
        return;
      }

      if (!editingId && !formData.password) {
        showToast("Password is required for a new account.", "warning");
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
        showToast(editingId ? "Account updated." : "Account created.", "success");
      } catch (error) {
        showError(error);
      }
    });
}

// ============================================
// SCORE WEIGHTING
// ============================================

async function loadWeightingForm(termId) {
  const w = await loadWeighting(termId);

  document.getElementById("weight-classroom-input").value =
    w.classroomObservation;

  document.getElementById("weight-domain6-input").value = w.domain6Share;

  document.getElementById("weight-domain7-input").value = w.domain7Share;

  document.getElementById("weight-peer-input").value = w.peerShareOfDomain6;

  document.getElementById("weight-student-input").value =
    w.studentShareOfDomain6;

  updateWeightingLiveDisplay();
  updateWeightingScopeMsg();
}

function getSelectedWeightingTermId() {
  const select = document.getElementById("weighting-term-select");
  if (!select || !select.value) return null;
  return select.value;
}

function populateWeightingTermSelect() {
  const select = document.getElementById("weighting-term-select");
  if (!select) return;

  const previous = select.value;

  select.innerHTML =
    `<option value="">Default weighting</option>` +
    termsCache
      .map(
        (term) =>
          `<option value="${term.id}">${term.school_year} ${term.semester} Term (${term.status})</option>`
      )
      .join("");

  const stillExists =
    previous &&
    termsCache.some((term) => String(term.id) === String(previous));

  select.value = stillExists ? previous : "";
  updateWeightingScopeMsg();
}

function updateWeightingScopeMsg() {
  const msg = document.getElementById("weighting-scope-msg");
  if (!msg) return;

  const termId = getSelectedWeightingTermId();

  if (!termId) {
    msg.textContent =
      "Editing the default weighting — applies to all terms without their own weighting.";
    return;
  }

  const term = termsCache.find((t) => String(t.id) === String(termId));

  msg.textContent = term
    ? `Editing weighting for ${term.school_year} ${term.semester} Term.`
    : "Editing weighting for the selected term.";
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
    .getElementById("weighting-term-select")
    .addEventListener("change", async () => {
      try {
        await loadWeightingForm(getSelectedWeightingTermId());
      } catch (error) {
        showError(error);
      }
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
        showToast("Domain 6 and Domain 7 shares must total exactly 100%.", "warning");
        return;
      }

      if (peerShareOfDomain6 + studentShareOfDomain6 !== 100) {
        showToast(
          "Peer-to-Peer and Student shares within Domain 6 must total exactly 100%.",
          "warning"
        );
        return;
      }

      if (classroomObservation < 0 || classroomObservation > 100) {
        showToast("Classroom Observation must be between 0% and 100%.", "warning");
        return;
      }

      try {
        const termId = getSelectedWeightingTermId();

        await saveWeighting({
          classroomObservation,
          domain6Share,
          domain7Share,
          peerShareOfDomain6,
          studentShareOfDomain6,
        }, termId);

        if (termId) {
          const term = termsCache.find(
            (t) => String(t.id) === String(termId)
          );

          showToast(
            term
              ? `Weighting saved for ${term.school_year} ${term.semester} Term.`
              : "Weighting saved.",
            "success"
          );
        } else {
          showToast("Weighting saved.", "success");
        }
      } catch (error) {
        showError(error);
      }
    });
}

// ============================================
// SCHOOL TERMS
// ============================================

let termsCache = [];

// Keeps the Academic Year display label (shown on evaluation forms and
// printed reports) in sync with the open term, so there is a single
// source of truth. A sync failure never blocks the term itself.
async function syncAcademicYearLabel(term) {
  try {
    if (!term || !term.school_year) return;

    const semester = String(term.semester || "")
      .replace(/\s*Semester\s*$/i, "")
      .trim();

    await saveSystemSettings({
      academicYear: String(term.school_year).trim(),
      semester: semester || "1st",
    });
  } catch (error) {
    console.error("Failed to sync academic year label:", error);
  }
}

async function loadTerms() {
  try {
    termsCache = await apiGet("/school-terms");
    renderTermsTable();
    populateWeightingTermSelect();
  } catch (error) {
    showError(error);
  }
}

function termStatusBadge(status) {
  if (status === "open") {
    return `<span class="text-green-600 font-medium">Open</span>`;
  }
  if (status === "closed") {
    return `<span class="text-gray-400 font-medium">Closed</span>`;
  }
  if (status === "archived") {
    return `<span class="text-gray-600 font-medium">Archived</span>`;
  }
  return `<span class="text-amber-600 font-medium">Draft</span>`;
}

function renderTermsTable() {
  const tableBody = document.getElementById("terms-table-body");
  if (!tableBody) return;

  if (!termsCache.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="py-6 text-center text-gray-400">
          No school terms yet. Create the first one above.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = termsCache
    .map((term) => {
      let actionHtml = "";
      const archiveBtn = `<button type="button" class="archive-term-btn text-amber-600 hover:underline" data-term-id="${term.id}">Archive</button>`;

      if (term.status === "draft") {
        actionHtml = `<button type="button" class="open-term-btn text-brand hover:underline" data-term-id="${term.id}">Open</button> ${archiveBtn}`;
      } else if (term.status === "open") {
        actionHtml = `<button type="button" class="close-term-btn text-red-500 hover:underline" data-term-id="${term.id}">End Term</button>`;
      } else if (term.status === "archived") {
        actionHtml = `<button type="button" class="reopen-term-btn text-brand hover:underline" data-term-id="${term.id}">Reopen</button> <button type="button" class="delete-term-btn text-red-500 hover:underline" data-term-id="${term.id}">Delete</button>`;
      } else {
        actionHtml = `<button type="button" class="reopen-term-btn text-brand hover:underline" data-term-id="${term.id}">Reopen</button> ${archiveBtn}`;
      }

      return `
      <tr class="border-b border-gray-200 last:border-0">
        <td class="py-3 pr-4 font-medium text-gray-800">${term.school_year}</td>
        <td class="py-3 pr-4 text-gray-500">${term.semester} Term</td>
        <td class="py-3 pr-4">${termStatusBadge(term.status)}</td>
        <td class="py-3 text-sm">${actionHtml}</td>
      </tr>
    `;
    })
    .join("");

  document.querySelectorAll(".open-term-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const updated = await apiPut(`/school-terms/${btn.dataset.termId}/open`, {});
        await syncAcademicYearLabel(updated);
        await loadTerms();
        showToast("Term opened.", "success");
      } catch (error) {
        showError(error);
      }
    });
  });

  document.querySelectorAll(".reopen-term-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const updated = await apiPut(`/school-terms/${btn.dataset.termId}/reopen`, {});
        await syncAcademicYearLabel(updated);
        await loadTerms();
        showToast("Term reopened.", "success");
      } catch (error) {
        showError(error);
      }
    });
  });

  document.querySelectorAll(".close-term-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const term = termsCache.find(
        (t) => String(t.id) === String(btn.dataset.termId)
      );
      if (!term) return;

      showConfirmModal({
        title: "End This Term?",
        message: `"${term.school_year} ${term.semester}" will become historical: new submissions stop, but reports stay readable. You can reopen it later if needed.`,
        confirmLabel: "End Term",
        isDestructive: true,
        onConfirm: async () => {
          try {
            await apiPut(`/school-terms/${term.id}/close`, {});
            await loadTerms();
            showToast("Term ended.", "success");
          } catch (error) {
            showError(error);
          }
        },
      });
    });
  });

  document.querySelectorAll(".archive-term-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const term = termsCache.find(
        (t) => String(t.id) === String(btn.dataset.termId)
      );
      if (!term) return;

      showConfirmModal({
        title: "Archive This Term?",
        message: `"${term.school_year} ${term.semester}" will be marked as archived. Submissions stay stopped and reports stay readable. You can still reopen it later, or delete it once it holds no evaluations.`,
        confirmLabel: "Archive",
        isDestructive: false,
        onConfirm: async () => {
          try {
            await apiPut(`/school-terms/${term.id}/archive`, {});
            await loadTerms();
            showToast("Term archived.", "success");
          } catch (error) {
            showError(error);
          }
        },
      });
    });
  });

  document.querySelectorAll(".delete-term-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const term = termsCache.find(
        (t) => String(t.id) === String(btn.dataset.termId)
      );
      if (!term) return;

      showConfirmModal({
        title: "Delete This Term?",
        message: `"${term.school_year} ${term.semester}" will be permanently deleted. This only works while the term holds no evaluations.`,
        confirmLabel: "Delete",
        isDestructive: true,
        onConfirm: async () => {
          try {
            await apiDelete(`/school-terms/${term.id}`);
            await loadTerms();
            showToast("Term deleted.", "success");
          } catch (error) {
            showError(error);
          }
        },
      });
    });
  });
}

function attachTermFormListener() {
  document
    .getElementById("term-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();

      const schoolYear = document
        .getElementById("term-year-input")
        .value.trim();
      const semester = document.getElementById("term-semester-input").value;

      if (!schoolYear) {
        showToast("School year is required (e.g. 2026-2027).", "warning");
        return;
      }

      try {
        await apiPost("/school-terms", {
          school_year: schoolYear,
          semester,
        });

        document.getElementById("term-form").reset();
        await loadTerms();
        showToast("Term created as draft. Open it when ready.", "success");
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

  attachEvaluationPeriodFormListener();
  attachAnnouncementFormListener();

  attachAccountFilterListeners();
  attachAccountModalListeners();

  attachWeightingFormListener();
  attachTermFormListener();

  await Promise.all([
    loadEvaluationPeriodForm(),
    loadAnnouncementForm(),
    loadAccounts(),
    loadWeightingForm(),
    loadTerms(),
  ]);
}

initializeSystemManagement();
