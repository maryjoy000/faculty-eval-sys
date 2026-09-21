// ============================================
// REUSABLE COMPONENT: Faculty Header
// ============================================
// Same structure as the student header, adapted for the Faculty portal.
//
// Usage: <div id="app-faculty-header" data-show-logout="true"></div>
async function attachNotificationPanelListeners() {
  const bellBtn = document.getElementById("notification-bell-btn");
  const dropdown = document.getElementById("notification-dropdown");
  const badge = document.getElementById("notification-badge");
  const listContainer = document.getElementById("notification-list");
  const markAllBtn = document.getElementById("mark-all-read-btn");

  if (!bellBtn || !dropdown || !badge || !listContainer || !markAllBtn) {
    return;
  }

  await loadNotifications();

  function formatNotificationTime(dateString) {
    if (!dateString) return "";

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleString();
  }

  function renderNotifications() {
    const notifications = getNotifications();
    const unreadCount = getUnreadNotificationCount();

    badge.textContent = unreadCount;
    badge.classList.toggle("hidden", unreadCount === 0);

    listContainer.innerHTML = notifications.length > 0
      ? notifications.map((n) => `
          <button
            type="button"
            class="notification-item w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 ${!n.is_read ? "bg-blue-50" : ""}"
            data-notification-id="${n.id}"
          >
            <p class="text-sm text-gray-700">${n.message}</p>
            <p class="text-xs text-gray-400 mt-1">
              ${formatNotificationTime(n.created_at)}
            </p>
          </button>
        `).join("")
      : `
          <p class="text-sm text-gray-400 px-4 py-6 text-center">
            No notifications.
          </p>
        `;

    listContainer
      .querySelectorAll(".notification-item")
      .forEach((item) => {
        item.addEventListener("click", async () => {
          try {
            await markNotificationAsRead(
              Number(item.dataset.notificationId)
            );

            renderNotifications();
          } catch (error) {
            console.error(
              "Failed to mark notification as read:",
              error
            );
          }
        });
      });
  }

  bellBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    dropdown.classList.toggle("hidden");
  });

  markAllBtn.addEventListener("click", async () => {
    try {
      await markAllNotificationsAsRead();
      renderNotifications();
    } catch (error) {
      console.error(
        "Failed to mark all notifications as read:",
        error
      );
    }
  });

  document.addEventListener("click", () => {
    dropdown.classList.add("hidden");
  });

  dropdown.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  renderNotifications();
}

function renderFacultyHeader() {
  const placeholder = document.getElementById("app-faculty-header");
  if (!placeholder) return;

  const showLogout = placeholder.dataset.showLogout === "true";

  placeholder.innerHTML = `
    <header class="bg-brand text-white">
      <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">

        <div class="flex items-center gap-3">
          <img src="../../assets/images/school-logo.jpg" alt="School logo" class="w-10 h-10 rounded-full flex-shrink-0 object-cover">
          <div>
            <p class="font-bold leading-tight">Headwaters College - Elizabeth Campus</p>
            <p class="text-sm text-blue-100 leading-tight">Faculty Evaluation System</p>
          </div>
        </div>

        <div class="flex items-center gap-4">
          ${showLogout ? `
            <button id="logout-btn" class="btn-secondary !bg-white !text-brand text-sm px-3 py-1.5">
              Logout
            </button>
          ` : ""}

          <div class="relative">
            <button id="notification-bell-btn" class="relative w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30" aria-label="Notifications">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <span id="notification-badge" class="hidden absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center"></span>
            </button>

            <div id="notification-dropdown" class="hidden absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto text-gray-800">
              <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p class="font-semibold text-gray-800 text-sm">Notifications</p>
                <button id="mark-all-read-btn" class="text-xs text-brand hover:underline">Mark all as read</button>
              </div>
              <div id="notification-list"></div>
            </div>
          </div>

          <span class="text-sm hidden sm:inline">Hello, Faculty!</span>
          <a href="faculty-profile.html" class="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </a>
        </div>

      </div>
    </header>
  `;

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      showConfirmModal({
        title: "Log Out?",
        message: "You'll need to log in again to continue evaluating colleagues.",
        confirmLabel: "Log Out",
        isDestructive: false,
          onConfirm: async () => {
            try {
              await apiPost("/auth/logout");
            } catch (err) {
              console.error("Logout request failed:", err);
            }
            sessionStorage.clear();
            window.location.href = "../../index.html";
          }
        });
    });
  }

  attachNotificationPanelListeners();
}

renderFacultyHeader();