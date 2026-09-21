// ============================================
// REUSABLE COMPONENT: Admin Sidebar + Top Bar
// ============================================
// Injects the left sidebar nav AND the top bar into any admin page
// with a <div id="app-admin-shell"></div> placeholder.
//
// Usage in HTML:
//   <div id="app-admin-shell" data-active-page="dashboard" data-scope="School FES" data-scope-label="Welcome back, Admin"></div>
//
// data-active-page : "dashboard" | "analytics" | "faculty" | "reports" — highlights that nav item
// data-scope       : text shown under the logo (e.g. "School FES" or department-scoped name)
// data-scope-label : text shown top-right (e.g. "Welcome back, Admin" or "ITDS Department")

function renderAdminShell() {
  const placeholder = document.getElementById("app-admin-shell");
  if (!placeholder) return;

  const activePage = placeholder.dataset.activePage || "dashboard";
  const scopeLabel = placeholder.dataset.scopeLabel || "Welcome back, Admin";

  const navItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      href: "dashboard.html",
      icon: "grid",
    },
    {
      id: "evaluation",
      label: "Evaluation",
      href: "evaluation.html",
      icon: "clipboard",
    },
    {
      id: "analytics",
      label: "Analytics and Sentiment",
      href: "analytics.html",
      icon: "bar-chart",
    },
    {
      id: "faculty",
      label: "Faculty Management",
      href: "faculty-management.html",
      icon: "users",
    },
    { id: "reports", label: "Reports", href: "reports.html", icon: "file" },
    { id: "system", label: "System Management", href: "system-management.html", icon: "settings" },
    { id: "criteria", label: "Evaluation Criteria", href: "evaluation-criteria.html", icon: "edit" },
  ];

  const icons = {
    grid: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
    clipboard: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`,
    "bar-chart": `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>`,
    users: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    file: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    settings: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    edit: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  };

  const navHtml = navItems.map((item) => {
    const isActive = item.id === activePage;
    const activeClasses = isActive ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-100";

    return `
      <a href="${item.href}" class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium ${activeClasses}">
        ${icons[item.icon]}
        <span>${item.label}</span>
      </a>
    `;
  }).join("");

  placeholder.innerHTML = `
    <div class="flex min-h-screen relative">

      <!-- MOBILE OVERLAY: dims the page behind the sidebar when it's open on small screens -->
      <div
        id="sidebar-overlay"
        class="hidden fixed inset-0 bg-black/40 z-30 lg:hidden"
      ></div>

      <!-- SIDEBAR
           Mobile: fixed, off-screen by default (-translate-x-full), slides in when toggled
           Desktop (lg+): static, always visible, part of the normal flex layout
      -->
      <aside
        id="admin-sidebar"
        class="fixed inset-y-0 left-0 z-40 w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col
               transform -translate-x-full transition-transform duration-200
               lg:translate-x-0 lg:fixed"
      >
        <div class="flex items-center gap-3 px-5 py-5 border-b border-gray-200">
          <img src="../../assets/images/school-logo.jpg" alt="School logo" class="w-12 h-12 rounded-full flex-shrink-0 object-cover">
          <span class="font-bold text-gray-800">HC-EC
           <br>Evaluation Portal</span>
        </div>

        <nav class="flex-1 flex flex-col gap-1 p-4">
          ${navHtml}
        </nav>

        <div class="p-4 border-t border-gray-200">
          <button id="admin-logout-btn" class="flex items-center gap-2 text-sm text-brand font-medium hover:underline">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Log Out
          </button>
        </div>
      </aside>

      <!-- MAIN CONTENT WRAPPER -->
      <div class="flex-1 flex flex-col min-w-0 lg:ml-64">

        <!-- TOP BAR -->
        <header class="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-4">
          <button id="admin-sidebar-toggle-btn" class="lg:hidden text-gray-600" aria-label="Toggle menu">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div class="hidden lg:block"></div>

          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-600">${scopeLabel}</span>

            <div class="relative">
              <button id="notification-bell-btn" class="relative w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200" aria-label="Notifications">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <span id="notification-badge" class="hidden absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center"></span>
              </button>

              <div id="notification-dropdown" class="hidden absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <p class="font-semibold text-gray-800 text-sm">Notifications</p>
                  <button id="mark-all-read-btn" class="text-xs text-brand hover:underline">Mark all as read</button>
                </div>
                <div id="notification-list"></div>
              </div>
            </div>

            <a href="profile.html" class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </a>
          </div>
        </header>

        <main id="admin-page-content" class="flex-1 p-6 overflow-y-auto"></main>

      </div>
    </div>
  `;

  document.getElementById("admin-logout-btn").addEventListener("click", () => {
    showConfirmModal({
      title: "Log Out?",
      message: "You'll need to log in again to access the admin portal.",
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
attachNotificationPanelListeners();

  // --- Wire up mobile sidebar toggle ---
  const sidebar = document.getElementById("admin-sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const toggleBtn = document.getElementById("admin-sidebar-toggle-btn");

  function openSidebar() {
    sidebar.classList.remove("-translate-x-full");
    overlay.classList.remove("hidden");
  }

  function closeSidebar() {
    sidebar.classList.add("-translate-x-full");
    overlay.classList.add("hidden");
  }

  toggleBtn.addEventListener("click", openSidebar);
  overlay.addEventListener("click", closeSidebar);
}

function formatNotificationTime(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString();
}

async function attachNotificationPanelListeners() {
  const bellBtn = document.getElementById("notification-bell-btn");
  const dropdown = document.getElementById("notification-dropdown");
  const badge = document.getElementById("notification-badge");
  const listContainer = document.getElementById("notification-list");
  const markAllBtn = document.getElementById("mark-all-read-btn");

  await loadNotifications();

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
            <p class="text-xs text-gray-400 mt-1">${formatNotificationTime(n.created_at)}</p>
          </button>
        `).join("")
      : `<p class="text-sm text-gray-400 px-4 py-6 text-center">No notifications.</p>`;

    listContainer.querySelectorAll(".notification-item").forEach((item) => {
      item.addEventListener("click", async () => {
        try {
          await markNotificationAsRead(
            Number(item.dataset.notificationId)
          );

          renderNotifications();
        } catch (error) {
          console.error("Failed to mark notification as read:", error);
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
      console.error("Failed to mark all notifications as read:", error);
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

renderAdminShell();