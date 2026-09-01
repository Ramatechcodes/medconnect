const user = requireAuth('admin');
document.getElementById('userChip').innerHTML =
  `${user.fullName} <span class="role-tag">${user.role}</span>`;
document.getElementById('logoutBtn').addEventListener('click', () => { clearSession(); window.location.href = '/login.html'; });

// Distance math lives here too (not just in tracking-bar.js) so this
// dashboard's core features never depend on that file loading correctly —
// only the visual tracking bar itself does, and that's wrapped in a
// try/catch so it can never break anything else on the page.
function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

// ---------------- SOCKET.IO (live trip tracking) ----------------
const socket = io();
socket.on('connect', () => socket.emit('identify', getToken()));

// requestId -> patientLocation coords, used to compute live distance as the
// provider moves, without needing to re-fetch the whole list every time.
let liveTripsById = {};

socket.on('provider:location', ({ requestId, lat, lng }) => {
  if (!requestId || !liveTripsById[requestId]) return;
  try {
    const trip = liveTripsById[requestId];
    const [dLng, dLat] = trip.patientLocation.coordinates;
    const distanceKm = haversineKm({ lat, lng }, { lat: dLat, lng: dLng });
    updateTrackingBar(`liveTrip-${requestId}`, distanceKm, trip.initialDistanceKm);
  } catch (e) {
    console.error('Live trip tracking bar update failed:', e);
  }
});

// ---------------- TABS ----------------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

    if (btn.dataset.tab === 'map' && !mapInitialized) initMap();
    if (btn.dataset.tab === 'live') loadLiveTrips();
    if (btn.dataset.tab === 'records') loadRecords();
  });
});

// ---------------- LIVE TRIPS ----------------
async function loadLiveTrips() {
  try {
    const { requests } = await apiRequest('/admin/requests?status=accepted');
    const panel = document.getElementById('liveTripsPanel');
    liveTripsById = {};

    if (!requests.length) {
      panel.innerHTML = `<div class="empty-state">No active trips right now.</div>`;
      return;
    }

    panel.innerHTML = requests.map(r => {
      liveTripsById[r._id] = r;

      // A referenced user can be missing (deleted, or a data-integrity gap)
      // — never let that crash the whole list.
      if (!r.provider || !r.patient || !r.provider.location || !r.patientLocation) {
        return `
          <div class="trip-card">
            <div class="name">⚠️ Trip data incomplete</div>
            <div class="meta">One of the accounts on this trip (request ${r._id}) is missing or was deleted. Consider marking it completed from the Requests tab.</div>
          </div>
        `;
      }

      const [pLng, pLat] = r.provider.location.coordinates;
      const [dLng, dLat] = r.patientLocation.coordinates;

      let cardTrackingHTML = '';
      try {
        const currentDistance = haversineKm({ lat: pLat, lng: pLng }, { lat: dLat, lng: dLng });
        cardTrackingHTML = trackingBarHTML(`liveTrip-${r._id}`, r.provider.fullName.split(' ')[0], r.patient.fullName.split(' ')[0], currentDistance, r.initialDistanceKm);
      } catch (e) {
        console.error('Tracking bar failed to render (trip details below still work fine):', e);
        cardTrackingHTML = `<div class="tracking-bar">Live tracking is temporarily unavailable. (${e.message})</div>`;
      }

      return `
        <div class="trip-card">
          <div class="name">${r.provider.fullName} <span class="tag tag-role-${r.provider.role}">${r.provider.role}</span> → ${r.patient.fullName} ${r.requestType === 'coverage' ? '<span class="tag tag-restricted">Coverage</span>' : ''}</div>
          <div class="meta">Started ${r.startedAt ? new Date(r.startedAt).toLocaleTimeString() : '—'}</div>
          ${cardTrackingHTML}
        </div>
      `;
    }).join('');
  } catch (err) {
    showAlert('alertBox', err.message);
  }
}
// Keep live trip cards fresh even if a socket update is missed
setInterval(() => {
  if (document.getElementById('tab-live').classList.contains('active')) loadLiveTrips();
}, 15000);

// ---------------- OVERVIEW ----------------
async function loadStats() {
  try {
    const s = await apiRequest('/admin/stats');
    document.getElementById('statGrid').innerHTML = `
      <div class="stat-card"><div class="value">${s.totalPatients}</div><div class="label">Patients</div></div>
      <div class="stat-card"><div class="value">${s.totalDoctors}</div><div class="label">Doctors</div></div>
      <div class="stat-card"><div class="value">${s.totalNurses}</div><div class="label">Nurses</div></div>
      <div class="stat-card"><div class="value">${s.totalPharmacists}</div><div class="label">Pharmacists</div></div>
      <div class="stat-card"><div class="value">${s.totalLabTechs}</div><div class="label">Lab Technicians</div></div>
      <div class="stat-card"><div class="value">${s.pendingRequests}</div><div class="label">Pending Requests</div></div>
      <div class="stat-card"><div class="value">${s.activeRequests}</div><div class="label">Active Trips</div></div>
      <div class="stat-card"><div class="value">${s.coverageRequests}</div><div class="label">Active Cover Requests</div></div>
      <div class="stat-card"><div class="value">${s.bannedUsers}</div><div class="label">Banned Users</div></div>
    `;
  } catch (err) {
    showAlert('alertBox', err.message);
  }
}

// ---------------- USERS ----------------
function statusTags(u) {
  const tags = [];
  tags.push(u.isVerified ? `<span class="tag tag-ok">Verified</span>` : `<span class="tag tag-unverified">Unverified</span>`);
  if (u.isBanned) tags.push(`<span class="tag tag-banned">Banned</span>`);
  if (u.isRestricted) tags.push(`<span class="tag tag-restricted">Restricted</span>`);
  if (!u.isBanned && !u.isRestricted) tags.push(`<span class="tag tag-ok">Active</span>`);
  return tags.join(' ');
}

async function loadUsers() {
  const role = document.getElementById('userRoleFilter').value;
  const search = document.getElementById('userSearch').value.trim();
  const qs = new URLSearchParams();
  if (role) qs.set('role', role);
  if (search) qs.set('search', search);

  try {
    const { users } = await apiRequest(`/admin/users?${qs.toString()}`);
    const tbody = document.getElementById('usersTableBody');
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No users found.</td></tr>`;
      return;
    }
    tbody.innerHTML = users.map(u => `
      <tr>
        <td><b>${u.fullName}</b>${u.role !== 'patient' && u.role !== 'admin' ? `<br><span style="color:#6b7280">${u.specialty || ''}</span>` : ''}</td>
        <td><span class="tag tag-role-${u.role}">${u.role}</span></td>
        <td>${u.email}</td>
        <td>${u.phone}</td>
        <td>${u.address || '—'}</td>
        <td>${u.isVerified ? '✅' : '❌'}</td>
        <td>${statusTags(u)}</td>
        <td class="row-actions">
          ${u.role === 'admin' ? '' : `
            <button class="btn ${u.isBanned ? 'btn-outline' : 'btn-danger'}" data-action="ban" data-id="${u._id}" data-current="${u.isBanned}">
              ${u.isBanned ? 'Unban' : 'Ban'}
            </button>
            <button class="btn ${u.isRestricted ? 'btn-outline' : 'btn-primary'}" data-action="restrict" data-id="${u._id}" data-current="${u.isRestricted}">
              ${u.isRestricted ? 'Unrestrict' : 'Restrict'}
            </button>
            <button class="btn btn-danger" data-action="delete" data-id="${u._id}" data-name="${u.fullName}">Delete</button>
          `}
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleUserAction(btn));
    });
  } catch (err) {
    showAlert('alertBox', err.message);
  }
}

async function handleUserAction(btn) {
  const { action, id, current, name } = btn.dataset;
  try {
    if (action === 'ban') {
      const willBan = current === 'false';
      const reason = willBan ? (prompt('Reason for banning this user (optional):') || '') : '';
      await apiRequest(`/admin/users/${id}/ban`, { method: 'PUT', body: { banned: willBan, reason } });
    } else if (action === 'restrict') {
      const willRestrict = current === 'false';
      const reason = willRestrict ? (prompt('Reason for restricting this user (optional):') || '') : '';
      await apiRequest(`/admin/users/${id}/restrict`, { method: 'PUT', body: { restricted: willRestrict, reason } });
    } else if (action === 'delete') {
      if (!confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
      await apiRequest(`/admin/users/${id}`, { method: 'DELETE' });
    }
    loadUsers();
    loadStats();
  } catch (err) {
    showAlert('alertBox', err.message);
  }
}

document.getElementById('userSearchBtn').addEventListener('click', loadUsers);
document.getElementById('userRoleFilter').addEventListener('change', loadUsers);
document.getElementById('userSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadUsers(); });
document.getElementById('generateLicenseCodeBtn').addEventListener('click', async () => {
  const phone = document.getElementById('licenseCodePhone').value.trim();
  const resultBox = document.getElementById('licenseCodeResult');
  if (!phone) { resultBox.innerHTML = '<span style="color:#dc2626">Enter a phone number first.</span>'; return; }
  try {
    const data = await apiRequest('/admin/license-codes', { method: 'POST', body: { phone } });
    resultBox.innerHTML = `✅ Code: <span style="font-size:22px;letter-spacing:3px">${data.code}</span> (valid ${data.expiresInMinutes} min) — send this to ${phone} via WhatsApp`;
  } catch (err) {
    resultBox.innerHTML = `<span style="color:#dc2626">${err.message}</span>`;
  }
});
// ---------------- REQUESTS / ACTIVITY LOG ----------------
async function loadRequests() {
  const status = document.getElementById('requestStatusFilter').value;
  const qs = status ? `?status=${status}` : '';
  try {
    const { requests } = await apiRequest(`/admin/requests${qs}`);
    const tbody = document.getElementById('requestsTableBody');
    if (!requests.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No requests found.</td></tr>`;
      return;
    }
    tbody.innerHTML = requests.map(r => `
      <tr>
        <td>${r.patient ? r.patient.fullName : '(deleted user)'} ${r.patient ? `<span class="tag tag-role-${r.patient.role}">${r.patient.role}</span>` : ''}</td>
        <td>${r.provider ? `${r.provider.fullName} <span class="tag tag-role-${r.provider.role}">${r.provider.role}</span>` : '(deleted user)'}</td>
        <td>${r.requestType === 'coverage' ? '<span class="tag tag-restricted">🔁 Coverage</span>' : '<span class="tag tag-ok">Care</span>'}</td>
        <td><span class="tag ${r.status === 'accepted' ? 'tag-ok' : r.status === 'pending' ? 'tag-restricted' : r.status === 'declined' || r.status === 'cancelled' ? 'tag-banned' : 'tag-unverified'}">${r.status}</span></td>
        <td>${r.reason || '—'}</td>
        <td>${new Date(r.createdAt).toLocaleString()}</td>
        <td><span class="detail-toggle" data-id="${r._id}">View full details</span></td>
      </tr>
      <tr class="detail-row hidden" id="detail-${r._id}">
        <td colspan="7">
          <b>Requester:</b> ${r.patient ? `${r.patient.fullName} · ${r.patient.email} · ${r.patient.phone} · ${r.patient.address}` : '—'}<br>
          <b>Provider:</b> ${r.provider ? `${r.provider.fullName} · ${r.provider.email} · ${r.provider.phone} · ${r.provider.address} · License #${r.provider.licenseNumber || '—'}` : '—'}<br>
          <b>Started:</b> ${r.startedAt ? new Date(r.startedAt).toLocaleString() : '—'} &nbsp; <b>Completed:</b> ${r.completedAt ? new Date(r.completedAt).toLocaleString() : '—'}
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.detail-toggle').forEach(el => {
      el.addEventListener('click', () => {
        document.getElementById(`detail-${el.dataset.id}`).classList.toggle('hidden');
      });
    });
  } catch (err) {
    showAlert('alertBox', err.message);
  }
}
document.getElementById('requestFilterBtn').addEventListener('click', loadRequests);

// ---------------- MAP ----------------
let mapInitialized = false;
let adminMap = null;

function iconFor(u) {
  let color = '#2563eb'; // patient
  if (u.role === 'doctor') color = '#16a34a';
  if (u.role === 'nurse') color = '#a21caf';
  if (u.role === 'pharmacist') color = '#c2410c';
  if (u.role === 'labtech') color = '#0e7490';
  if (u.isBanned) color = '#dc2626';
  return L.divIcon({ className: '', html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 2px ${color}"></div>` });
}

async function initMap() {
  mapInitialized = true;
  adminMap = L.map('adminMap').setView([6.5244, 3.3792], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(adminMap);

  try {
    const { users } = await apiRequest('/admin/locations');
    const withLocation = users.filter(u => u.location && u.location.coordinates && (u.location.coordinates[0] !== 0 || u.location.coordinates[1] !== 0));

    if (!withLocation.length) {
      showAlert('alertBox', 'No users have shared their location yet.', 'success');
      return;
    }

    const bounds = [];
    withLocation.forEach(u => {
      const [lng, lat] = u.location.coordinates;
      L.marker([lat, lng], { icon: iconFor(u) })
        .addTo(adminMap)
        .bindPopup(`<b>${u.fullName}</b><br>${u.role}${u.isBanned ? ' · BANNED' : ''}${u.isAvailable ? ' · online' : ''}`);
      bounds.push([lat, lng]);
    });
    adminMap.fitBounds(bounds, { padding: [40, 40] });
  } catch (err) {
    showAlert('alertBox', err.message);
  }
}

// ---------------- RECORDS (medical documentation oversight) ----------------
async function loadRecords() {
  const search = document.getElementById('recordsSearch').value.trim().toLowerCase();
  const panel = document.getElementById('adminRecordsPanel');
  try {
    const { records } = await apiRequest('/admin/records');
    const filtered = search
      ? records.filter(r =>
          (r.patient?.fullName || '').toLowerCase().includes(search) ||
          (r.provider?.fullName || '').toLowerCase().includes(search))
      : records;

    if (!filtered.length) {
      panel.innerHTML = `<div class="empty-state">No medical records found.</div>`;
      return;
    }

    panel.innerHTML = filtered.map(r => {
      const rx = (r.prescriptions || []).map(p => `<li>${p}</li>`).join('');
      const labs = (r.labTests || []).map(t => `<li>${t}</li>`).join('');
      return `
        <div class="history-item">
          <div class="hi-top">
            <span>${r.diagnosis || 'General note'}</span>
            <span class="badge">${new Date(r.createdAt).toLocaleString()}</span>
          </div>
          <div class="hi-meta">
            Patient: ${r.patient ? r.patient.fullName : '(deleted)'} ·
            Provider: ${r.provider ? `${r.provider.fullName} (${r.provider.role})` : '(deleted)'}
          </div>
          ${rx ? `<div class="record-section"><b>💊 Prescribed:</b><ul>${rx}</ul></div>` : ''}
          ${labs ? `<div class="record-section"><b>🧪 Lab tests:</b><ul>${labs}</ul></div>` : ''}
          ${r.report ? `<div class="record-section"><b>📝 Report:</b> ${r.report}</div>` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    panel.innerHTML = `<div class="empty-state">Could not load records. (${err.message})</div>`;
  }
}
document.getElementById('recordsSearchBtn').addEventListener('click', loadRecords);
document.getElementById('recordsSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadRecords(); });

// ---------------- INIT ----------------
loadStats();
loadUsers();
loadRequests();
loadLiveTrips();
