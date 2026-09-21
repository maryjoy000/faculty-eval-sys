// ============================================
// Shared API client — talks to the Flask backend.
// All fetch() calls go through here so credentials and error handling
// stay consistent instead of being repeated on every page.
// ============================================

// Backend base URL, resolved once per page:
// - local development (Live Server on 127.0.0.1/localhost): Flask runs on :5000
// - deployed (any real hostname/IP): same-origin "/api", proxied by nginx
window.FES_API_BASE = window.FES_API_BASE || (
  (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
    ? "http://127.0.0.1:5000/api"
    : "/api"
);

const API_BASE_URL = window.FES_API_BASE;

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include", // sends the session cookie
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // some responses (e.g. 204) may have no body
  }

  if (!response.ok) {
    const error = new Error(
      data && data.error ? data.error : `Request failed (${response.status})`
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function apiGet(path) {
  return apiRequest(path, { method: "GET" });
}

function apiPost(path, body) {
  return apiRequest(path, { method: "POST", body: JSON.stringify(body) });
}

function apiPut(path, body) {
  return apiRequest(path, { method: "PUT", body: JSON.stringify(body) });
}

function apiDelete(path) {
  return apiRequest(path, { method: "DELETE" });
}