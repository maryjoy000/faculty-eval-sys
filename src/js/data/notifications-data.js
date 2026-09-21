// ============================================
// SHARED DATA: Notifications
// Backend/API-backed notification system
// ============================================

let notificationsCache = [];


async function loadNotifications() {
  try {
    notificationsCache = await apiGet("/notifications");
    return notificationsCache;
  } catch (error) {
    console.error("Failed to load notifications:", error);
    notificationsCache = [];
    return [];
  }
}


function getNotifications() {
  return notificationsCache;
}


function getUnreadNotificationCount() {
  return notificationsCache.filter(
    (notification) => !notification.is_read
  ).length;
}


async function markNotificationAsRead(notificationId) {
  try {
    const updated = await apiPut(
      `/notifications/${notificationId}/read`,
      {}
    );

    const index = notificationsCache.findIndex(
      (notification) =>
        String(notification.id) === String(notificationId)
    );

    if (index !== -1) {
      notificationsCache[index] = updated;
    }

    return updated;
  } catch (error) {
    console.error("Failed to mark notification as read:", error);
    throw error;
  }
}


async function markAllNotificationsAsRead() {
  try {
    await apiPut("/notifications/read-all", {});

    notificationsCache = notificationsCache.map(
      (notification) => ({
        ...notification,
        is_read: true
      })
    );

    return notificationsCache;
  } catch (error) {
    console.error("Failed to mark all notifications as read:", error);
    throw error;
  }
}