// Small shared helper for talking to the backend + guarding pages
//
// NOTE: we use sessionStorage (not localStorage) on purpose. localStorage is
// shared across every tab of the same browser, so logging in as a doctor in
// one tab would silently overwrite a patient session open in another tab.
// sessionStorage is isolated per-tab, so you can safely test a patient and a
// provider side-by-side in two tabs of the same browser.
const API_BASE = '/api';

function getToken() { return sessionStorage.getItem('mc_token'); }
function getUser() {
  const raw = sessionStorage.getItem('mc_user');
  return raw ? JSON.parse(raw) : null;
}
function saveSession(token, user) {
  sessionStorage.setItem('mc_token', token);
  sessionStorage.setItem('mc_user', JSON.stringify(user));
}
function clearSession() {
  sessionStorage.removeItem('mc_token');
  sessionStorage.removeItem('mc_user');
}

async function apiRequest(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Session is no longer valid (expired token, banned mid-session, etc.)
    if (res.status === 401) clearSession();
    throw new Error(data.message || 'Something went wrong');
  }
  return data;
}

// Redirects unauthenticated users away from protected pages.
// expectedRole can be a single role string ('admin') or an array of
// allowed roles (['doctor', 'nurse']).
function requireAuth(expectedRole) {
  const user = getUser();
  if (!getToken() || !user) {
    window.location.href = '/login.html';
    return null;
  }
  const allowed = Array.isArray(expectedRole) ? expectedRole : [expectedRole];
  if (expectedRole && !allowed.includes(user.role)) {
    window.location.href = `/dashboard-${user.role}.html`;
    return null;
  }
  return user;
}

function showAlert(elId, message, type = 'error') {
  const box = document.getElementById(elId);
  if (!box) return;
  box.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
}
