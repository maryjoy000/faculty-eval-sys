// ============================================
// SHARED DATA: Student Announcement Banner
// ============================================

window.FES_API_BASE = window.FES_API_BASE || (
  (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
    ? "http://127.0.0.1:5000/api"
    : "/api"
);

const DEFAULT_ANNOUNCEMENT = {
  message: "",
  isActive: false
};

let announcementCache = {
  ...DEFAULT_ANNOUNCEMENT
};

async function loadAnnouncement() {
  try {
    const response = await fetch(
      `${window.FES_API_BASE}/system-settings`,
      {
        credentials: "include"
      }
    );

    if (!response.ok) {
      throw new Error("Failed to load announcement");
    }

    const data = await response.json();

    announcementCache = {
      message: data.announcement_message || "",
      isActive: Boolean(data.announcement_active)
    };

    return announcementCache;
  } catch (error) {
    console.error("Failed to load announcement:", error);
    return announcementCache;
  }
}

function getAnnouncement() {
  return announcementCache;
}

async function saveAnnouncement(settings) {
  const response = await fetch(
    `${window.FES_API_BASE}/system-settings`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        announcement_message: settings.message,
        announcement_active: settings.isActive
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to save announcement");
  }

  announcementCache = {
    message: data.announcement_message || "",
    isActive: Boolean(data.announcement_active)
  };

  return announcementCache;
}