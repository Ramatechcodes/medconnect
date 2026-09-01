const user = requireAuth(window.EXPECTED_ROLE);
document.getElementById('userChip').innerHTML =
  `${user.fullName} <span class="role-tag">${user.role}</span>`;
document.getElementById('logoutBtn').addEventListener('click', () => { clearSession(); window.location.href = '/login.html'; });

// Distance math lives here too (not just in tracking-bar.js) so this
// dashboard's core features never depend on that file loading correctly —
// only the visual tracking bar itself does, and that's wrapped in a
// try/catch further down so it can never break the rest of the page.
function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

// ---------------- MAP ----------------
const map = L.map('map').setView([6.5244, 3.3792], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const meIcon = L.divIcon({ className: '', html: '<div style="font-size:24px">🚑</div>' });
const patientIcon = L.divIcon({ className: '', html: '<div style="background:#2563eb;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #2563eb"></div>' });
const coverIcon = L.divIcon({ className: '', html: '<div style="font-size:22px">🔁</div>' });

let myMarker = null;
let myPos = null;
let patientMarker = null;
let coverProviderMarker = null;
let activeTrip = null; // an incoming request where I'M the provider (patient care OR someone covering-me... no: I'm the one being asked to help)
let coverTrip = null;  // an outgoing coverage request I sent that got accepted — someone else is covering me
let watchId = null;
let broadcastTimer = null;

// ---------------- SOCKET.IO ----------------
const socket = io();
socket.on('connect', () => socket.emit('identify', getToken()));

socket.on('request:new', (request) => {
  renderRequests([request], true);
  const label = request.requestType === 'coverage' ? 'cover request' : 'request';
  showAlert('alertBox', `New ${label} from ${request.patient.fullName}!`, 'success');
});

// Fires only for requests I SENT (i.e. I'm the requester) — which, for a
// provider, means a coverage request I sent to another provider just got
// accepted. Incoming requests (I'm the target) are handled via respond().
socket.on('request:accepted', (request) => {
  if (request.requestType !== 'coverage') return; // safety net, shouldn't happen for providers otherwise
  coverTrip = request;
  showAlert('alertBox', `${request.provider.fullName} accepted your cover request!`, 'success');
  renderCoverPanel();
});

socket.on('request:declined', (request) => {
  showAlert('alertBox', `${request.provider.fullName} declined your cover request.`);
});

socket.on('request:completed', (request) => {
  if (activeTrip && String(request._id) === String(activeTrip._id)) {
    activeTrip = null;
    document.getElementById('tripPanel').innerHTML = '';
  }
  if (coverTrip && String(request._id) === String(coverTrip._id)) {
    coverTrip = null;
    document.getElementById('coverStatusPanel').innerHTML = '';
  }
  showAlert('alertBox', 'Visit marked as completed.', 'success');
});

// Live position of whoever is covering me, heading my way.
socket.on('provider:location', ({ requestId, lat, lng }) => {
  if (!coverTrip || String(requestId) !== String(coverTrip._id)) return;
  if (!coverProviderMarker) {
    coverProviderMarker = L.marker([lat, lng], { icon: coverIcon }).addTo(map);
  } else {
    coverProviderMarker.setLatLng([lat, lng]);
  }
  try {
    const distanceKm = myPos ? haversineKm({ lat, lng }, myPos) : null;
    updateTrackingBar('coverTrackingBar', distanceKm, coverTrip.initialDistanceKm);
  } catch (e) {
    console.error('Cover tracking bar update failed:', e);
  }
});

wireChatSocket(socket, () => activeTrip?._id, 'providerChatBox');
wireChatSocket(socket, () => coverTrip?._id, 'coverChatBox');

// ---------------- GEOLOCATION HELPERS ----------------
function geoErrorMessage(err) {
  if (err.code === 1) return 'Location permission denied. Please allow location access for this site in your phone/browser settings, then toggle "Go Online" again.';
  if (err.code === 2) return 'Your location is unavailable right now. Make sure GPS/Location Services are turned on.';
  if (err.code === 3) return 'Getting your location timed out. Please try again — GPS can take a few seconds outdoors or near a window.';
  return 'Could not get your location: ' + err.message;
}

function insecureContextWarning() {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (!window.isSecureContext && !isLocal) {
    showAlert('alertBox',
      'Location access needs HTTPS. If you\'re opening this on your phone via your computer\'s local IP (like http://192.168.x.x:3000), browsers block location on that. Use a tool like ngrok, or deploy with HTTPS, to test on mobile.');
    return true;
  }
  return false;
}

// ---------------- AVAILABILITY TOGGLE ----------------
const toggle = document.getElementById('availabilityToggle');
toggle.checked = user.isAvailable;
if (toggle.checked) startSharingLocation();

toggle.addEventListener('change', async () => {
  const isAvailable = toggle.checked;
  try {
    await apiRequest('/users/location', { method: 'PUT', body: { isAvailable, ...(myPos || {}) } });
    if (isAvailable) startSharingLocation(); else stopSharingLocation();
  } catch (err) {
    showAlert('alertBox', err.message);
    toggle.checked = !isAvailable;
  }
});

function startSharingLocation() {
  if (!navigator.geolocation) { showAlert('alertBox', 'Geolocation not supported.'); return; }
  if (insecureContextWarning()) { toggle.checked = false; return; }

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (!myMarker) {
        myMarker = L.marker([myPos.lat, myPos.lng], { icon: meIcon }).addTo(map).bindPopup('You');
        map.setView([myPos.lat, myPos.lng], 14);
      } else {
        myMarker.setLatLng([myPos.lat, myPos.lng]);
      }

      // If we're currently on an accepted trip, update our own tracking bar
      // to reflect how much closer we've gotten to the patient. Wrapped so
      // a tracking-bar issue can never break the map or location updates.
      if (activeTrip && activeTrip.patientLocation) {
        try {
          const [dLng, dLat] = activeTrip.patientLocation.coordinates;
          const distanceKm = haversineKm(myPos, { lat: dLat, lng: dLng });
          updateTrackingBar('providerTrackingBar', distanceKm, activeTrip.initialDistanceKm);
        } catch (e) {
          console.error('Tracking bar update failed:', e);
        }
      }
    },
    (err) => showAlert('alertBox', geoErrorMessage(err)),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );

  // Broadcast location to the server every 4s (server relays it to any
  // patient/provider — and every admin — on an active trip with this provider).
  broadcastTimer = setInterval(() => {
    if (myPos) socket.emit('provider:location', myPos);
  }, 4000);
}

function stopSharingLocation() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (broadcastTimer) clearInterval(broadcastTimer);
  watchId = null;
  broadcastTimer = null;
}

// ---------------- INCOMING REQUESTS (I'm the target) ----------------
function renderRequests(requests, prepend = false) {
  const panel = document.getElementById('requestsPanel');
  if (!requests.length && !prepend) {
    panel.innerHTML = `<div class="empty-state">No requests yet. Go online to start receiving them.</div>`;
    return;
  }
  if (!prepend) panel.innerHTML = '';

  requests.forEach(r => {
    if (r.status !== 'pending') return;
    const isCoverage = r.requestType === 'coverage';
    const div = document.createElement('div');
    div.className = 'request-card';
    div.dataset.requestId = r._id;
    div.innerHTML = `
      <div class="name">${r.patient.fullName} ${isCoverage ? `<span class="tag tag-role-${r.patient.role}">${r.patient.role}</span> <span class="badge badge-pending">🔁 Cover request</span>` : '<span class="badge badge-pending">Pending</span>'}</div>
      <div class="meta">${r.reason || (isCoverage ? 'Needs coverage' : 'General consultation')}</div>
      <div class="patient-details">
        <div class="line"><b>Phone</b> ${r.patient.phone}</div>
        <div class="line"><b>Address</b> ${r.patient.address}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-success" data-action="accepted">Accept</button>
        <button class="btn btn-danger" data-action="declined">Decline</button>
      </div>
    `;
    div.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => respond(r._id, btn.dataset.action));
    });
    panel.prepend(div);
  });
}

async function respond(requestId, status) {
  try {
    const { request: updated } = await apiRequest(`/requests/${requestId}/respond`, {
      method: 'PUT', body: { status }
    });
    if (status === 'accepted') {
      activeTrip = updated;
      renderTripPanel();
    }
    const card = document.querySelector(`.request-card[data-request-id="${requestId}"]`);
    if (card) card.remove();
  } catch (err) {
    showAlert('alertBox', err.message);
  }
}

function renderTripPanel() {
  const p = activeTrip.patient;
  if (!p || !p.location) {
    document.getElementById('tripPanel').innerHTML =
      `<div class="trip-card"><div class="name">⚠️ This visit's requester data is missing.</div><div class="meta">Their account may have been removed. Mark the visit completed from here to clear it.</div>
      <button class="btn btn-danger btn-block" id="completeTripBtn">Mark visit as completed</button></div>`;
    document.getElementById('completeTripBtn').addEventListener('click', async () => {
      await apiRequest(`/requests/${activeTrip._id}/complete`, { method: 'PUT' });
      activeTrip = null;
      document.getElementById('tripPanel').innerHTML = '';
    });
    return;
  }
  const isCoverage = activeTrip.requestType === 'coverage';
  const [lng, lat] = p.location.coordinates;
  if (!patientMarker) {
    patientMarker = L.marker([lat, lng], { icon: patientIcon }).addTo(map).bindPopup(isCoverage ? 'Requester location' : 'Patient location');
  } else {
    patientMarker.setLatLng([lat, lng]);
  }

  const initialDistance = activeTrip.initialDistanceKm ?? 0;
  const startingDistance = myPos
    ? haversineKm(myPos, { lat, lng })
    : initialDistance;

  let trackingHTML = '';
  try {
    trackingHTML = trackingBarHTML('providerTrackingBar', 'You', p.fullName.split(' ')[0], startingDistance, initialDistance);
  } catch (e) {
    console.error('Tracking bar failed to render (details below still work fine):', e);
    trackingHTML = `<div class="tracking-bar">Live tracking is temporarily unavailable. (${e.message})</div>`;
  }

  const panel = document.getElementById('tripPanel');
  panel.innerHTML = `
    <div class="trip-card">
      <div class="name">${isCoverage ? `Covering for ${p.fullName}` : `Visiting ${p.fullName}`} <span class="badge badge-accepted">Active</span></div>
      <div class="meta">${activeTrip.reason || (isCoverage ? 'Coverage arrangement' : 'General consultation')}</div>
      <div class="patient-details">
        <div class="line"><b>Phone</b> ${p.phone}</div>
        <div class="line"><b>Email</b> ${p.email}</div>
        <div class="line"><b>Address</b> ${p.address}</div>
      </div>
      ${trackingHTML}
      ${isCoverage ? '' : '<div id="providerHistoryBox"></div>'}
      <div id="providerChatBox"></div>
      <button class="btn btn-danger btn-block" id="completeTripBtn">Mark ${isCoverage ? 'arrangement' : 'visit'} as completed</button>
    </div>
  `;
  document.getElementById('completeTripBtn').addEventListener('click', async () => {
    await apiRequest(`/requests/${activeTrip._id}/complete`, { method: 'PUT' });
    activeTrip = null;
    panel.innerHTML = '';
  });
  renderChatBox('providerChatBox', activeTrip._id);
  // Medical records only make sense for actual patient care, not coverage
  // arrangements between providers — the treating provider can add entries.
  if (!isCoverage) renderPatientHistoryBox('providerHistoryBox', p._id, activeTrip._id, true);
}

// ---------------- OUTGOING COVER REQUEST (I'm the requester) ----------------
function renderCoverPanel() {
  const cp = coverTrip.provider; // the provider covering me
  const panel = document.getElementById('coverStatusPanel');
  if (!cp) { panel.innerHTML = ''; return; }

  let trackingHTML = '';
  try {
    trackingHTML = trackingBarHTML('coverTrackingBar', cp.fullName.split(' ')[0], 'You', coverTrip.initialDistanceKm, coverTrip.initialDistanceKm);
  } catch (e) {
    trackingHTML = `<div class="tracking-bar">Live tracking is temporarily unavailable. (${e.message})</div>`;
  }

  panel.innerHTML = `
    <div class="trip-card">
      <div class="name">${cp.fullName} is covering for you <span class="badge badge-accepted">On the way</span></div>
      <div class="meta">${cp.specialty || cp.role} · ${cp.yearsOfExperience || 0} yrs exp</div>
      <div class="provider-details">
        <div class="line"><b>Phone</b> ${cp.phone}</div>
        <div class="line"><b>Email</b> ${cp.email}</div>
        <div class="line"><b>Address</b> ${cp.address}</div>
      </div>
      ${trackingHTML}
      <div id="coverChatBox"></div>
      <button class="btn btn-danger btn-block" id="completeCoverBtn">Mark arrangement as completed</button>
    </div>
  `;
  document.getElementById('completeCoverBtn').addEventListener('click', async () => {
    await apiRequest(`/requests/${coverTrip._id}/complete`, { method: 'PUT' });
    coverTrip = null;
    panel.innerHTML = '';
  });
  renderChatBox('coverChatBox', coverTrip._id);
}

// ---------------- FIND COVER (search other providers) ----------------
const coverRoleSelect = document.getElementById('coverRoleSearch');
coverRoleSelect.innerHTML = providerRoleOptionsHTML(user.role);

document.getElementById('coverSearchBtn').addEventListener('click', async () => {
  if (!myPos) {
    showAlert('alertBox', 'Toggle "Go Online" first so we know your location, then search for cover.');
    return;
  }
  const role = coverRoleSelect.value;
  try {
    const { providers } = await apiRequest(`/users/nearby?role=${role}&lat=${myPos.lat}&lng=${myPos.lng}&maxDistance=15000`);
    renderCoverResults(providers);
  } catch (err) {
    showAlert('alertBox', err.message);
  }
});

function renderCoverResults(providers) {
  const panel = document.getElementById('coverResultsPanel');
  if (!providers.length) {
    panel.innerHTML = `<div class="empty-state">No available providers nearby right now.</div>`;
    return;
  }
  panel.innerHTML = '';
  providers.forEach(p => {
    const [lng, lat] = p.location.coordinates;
    const distance = haversineKm(myPos, { lat, lng }).toFixed(1);
    const div = document.createElement('div');
    div.className = 'provider-card';
    div.innerHTML = `
      <div class="name">${p.fullName} <span class="badge">${p.role}</span></div>
      <div class="meta">${p.specialty || 'General'} · ${distance} km away</div>
      <button class="btn btn-primary btn-block" data-id="${p._id}">Request Cover</button>
    `;
    div.querySelector('button').addEventListener('click', async () => {
      try {
        await apiRequest('/requests', {
          method: 'POST',
          body: { providerId: p._id, lat: myPos.lat, lng: myPos.lng, reason: 'Requesting cover' }
        });
        showAlert('alertBox', `Cover request sent to ${p.fullName}. Waiting for them to accept...`, 'success');
      } catch (err) {
        showAlert('alertBox', err.message);
      }
    });
    panel.appendChild(div);
  });
}

// ---------------- HISTORY ----------------
let historyLoaded = false;
document.getElementById('historyToggle').addEventListener('click', async () => {
  const panel = document.getElementById('historyPanel');
  panel.classList.toggle('hidden');
  if (panel.classList.contains('hidden') || historyLoaded) return;

  try {
    const { requests } = await apiRequest('/requests/history');
    historyLoaded = true;
    if (!requests.length) {
      panel.innerHTML = `<div class="empty-state">No past activity yet.</div>`;
      return;
    }
    panel.innerHTML = requests.map(r => {
      const iAmProvider = r.provider && String(r.provider._id) === String(user.id);
      const other = iAmProvider ? r.patient : r.provider;
      const label = r.requestType === 'coverage'
        ? (iAmProvider ? `You covered for ${other ? other.fullName : '(deleted user)'}` : `${other ? other.fullName : '(deleted user)'} covered for you`)
        : (iAmProvider ? `You treated ${other ? other.fullName : '(deleted user)'}` : `${other ? other.fullName : '(deleted user)'} treated you`);
      return `
        <div class="history-item">
          <div class="hi-top">
            <span>${label}</span>
            <span class="badge ${r.status === 'completed' ? 'badge-accepted' : 'badge-pending'}">${r.status}</span>
          </div>
          <div class="hi-meta">${new Date(r.createdAt).toLocaleDateString()} · ${r.reason || '—'}</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    showAlert('alertBox', err.message);
  }
});

// ---------------- Load any already-active work on refresh ----------------
(async function loadActive() {
  try {
    const { requests } = await apiRequest('/requests/active');

    const incomingPending = requests.filter(r => r.status === 'pending' && r.provider && String(r.provider._id) === String(user.id));
    const incomingAccepted = requests.find(r => r.status === 'accepted' && r.provider && String(r.provider._id) === String(user.id));
    const outgoingAccepted = requests.find(r => r.status === 'accepted' && r.patient && String(r.patient._id) === String(user.id));
    const outgoingPendingCount = requests.filter(r => r.status === 'pending' && r.patient && String(r.patient._id) === String(user.id)).length;

    if (incomingPending.length) {
      document.getElementById('requestsPanel').innerHTML = '';
      renderRequests(incomingPending, true);
    }
    if (incomingAccepted) { activeTrip = incomingAccepted; renderTripPanel(); }
    if (outgoingAccepted) { coverTrip = outgoingAccepted; renderCoverPanel(); }
    if (outgoingPendingCount > 0) {
      document.getElementById('coverResultsPanel').innerHTML =
        `<div class="empty-state">${outgoingPendingCount} cover request(s) sent, waiting for a response...</div>`;
    }
  } catch (_) {}
})();
