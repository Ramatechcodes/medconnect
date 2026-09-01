// Adds Home / History / Settings tabs to the sidebar on the Patient and
// Provider (doctor/nurse/pharmacist/lab tech) dashboards. This file is
// entirely additive — it only toggles which existing panel is visible and
// wires the new Settings tab. It never touches patient-dashboard.js or
// provider-dashboard.js, so none of their existing logic is modified.

document.querySelectorAll('.sidebar .tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sidebar .tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.sidebar .tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

    // The History tab reuses the existing #historyToggle click handler
    // (defined in patient-dashboard.js / provider-dashboard.js) so the
    // fetch/render logic there is never duplicated or touched — we just
    // trigger it the first time this tab is opened.
    if (btn.dataset.tab === 'history') {
      const historyPanel = document.getElementById('historyPanel');
      const historyToggle = document.getElementById('historyToggle');
      if (historyPanel && historyToggle && historyPanel.classList.contains('hidden')) {
        historyToggle.click();
      }
    }
  });
});

// ---------------- SETTINGS: dark mode ----------------
const darkModeToggle = document.getElementById('darkModeToggle');
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (darkModeToggle) darkModeToggle.checked = theme === 'dark';
}
applyTheme(localStorage.getItem('mc_theme') || 'light');

if (darkModeToggle) {
  darkModeToggle.addEventListener('change', () => {
    const theme = darkModeToggle.checked ? 'dark' : 'light';
    localStorage.setItem('mc_theme', theme);
    applyTheme(theme);
  });
}

// ---------------- SETTINGS: profile form ----------------
const profileForm = document.getElementById('profileForm');
if (profileForm) {
  const me = getUser();
  document.getElementById('settingsName').value = me?.fullName || '';
  document.getElementById('settingsEmail').value = me?.email || '';
  document.getElementById('settingsPhone').value = me?.phone || '';
  document.getElementById('settingsAddress').value = me?.address || '';

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { user: updated } = await apiRequest('/users/me', {
        method: 'PUT',
        body: {
          fullName: document.getElementById('settingsName').value.trim(),
          email: document.getElementById('settingsEmail').value.trim(),
          phone: document.getElementById('settingsPhone').value.trim(),
          address: document.getElementById('settingsAddress').value.trim()
        }
      });
      saveSession(getToken(), updated);
      document.getElementById('userChip').innerHTML = `${updated.fullName} <span class="role-tag">${updated.role}</span>`;
      showAlert('settingsAlert', 'Profile updated successfully.', 'success');
    } catch (err) {
      showAlert('settingsAlert', err.message);
    }
  });
}

// ---------------- SETTINGS: change password ----------------
const passwordForm = document.getElementById('passwordForm');
if (passwordForm) {
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await apiRequest('/users/change-password', {
        method: 'PUT',
        body: {
          currentPassword: document.getElementById('currentPassword').value,
          newPassword: document.getElementById('newPassword').value
        }
      });
      showAlert('settingsAlert', data.message, 'success');
      passwordForm.reset();
    } catch (err) {
      showAlert('settingsAlert', err.message);
    }
  });
}
