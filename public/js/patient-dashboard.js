const user = requireAuth('patient');
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

// ---------------- MAP SETUP ----------------
const map = L.map('map').setView([6.5244, 3.3792], 13); // default: Lagos, adjusts once we get real position
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const meIcon = L.divIcon({ className: '', html: '<div style="background:#2563eb;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #2563eb"></div>' });
const providerIcon = L.divIcon({ className: '', html: '<div style="background:#16a34a;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #16a34a"></div>' });
const movingIcon = L.divIcon({ className: '', html: '<div style="font-size:24px">🚑</div>' });

let myMarker = null;
let myPos = null; // {lat, lng}
let resultMarkers = [];
let routingControl = null;
let liveProviderMarker = null;
let activeTrip = null; // populated once a request is accepted

// ---------------- SOCKET.IO ----------------
const socket = io();
socket.on('connect', () => socket.emit('identify', getToken()));

socket.on('request:accepted', (request) => {
  activeTrip = request;
  showAlert('alertBox', `${request.provider.fullName} accepted your request and is on the way!`, 'success');
  renderTripPanel();
});

socket.on('request:declined', (request) => {
  showAlert('alertBox', `${request.provider.fullName} declined the request. Try another provider.`);
});

socket.on('request:completed', () => {
  activeTrip = null;
  clearRoute();
  document.getElementById('tripPanel').innerHTML = '';
  showAlert('alertBox', 'Visit marked as completed. Thank you!', 'success');
});

// Live location of the provider heading toward the patient
socket.on('provider:location', ({ lat, lng }) => {
  if (!activeTrip) return;
  if (!liveProviderMarker) {
    liveProviderMarker = L.marker([lat, lng], { icon: movingIcon }).addTo(map);
  } else {
    liveProviderMarker.setLatLng([lat, lng]);
  }
  if (routingControl && myPos) {
    routingControl.setWaypoints([L.latLng(lat, lng), L.latLng(myPos.lat, myPos.lng)]);
  }

  // Distance is measured against the fixed request destination (where the
  // patient was when they requested), so the tracking bar's percentage
  // stays consistent with the baseline captured on acceptance. Wrapped so
  // a tracking-bar issue can never break the live map marker above.
  try {
    const [dLng, dLat] = activeTrip.patientLocation.coordinates;
    const distanceKm = haversineKm({ lat, lng }, { lat: dLat, lng: dLng });
    updateTrackingBar('patientTrackingBar', distanceKm, activeTrip.initialDistanceKm);
  } catch (e) {
    console.error('Tracking bar update failed:', e);
  }
});

// ---------------- GEOLOCATION ----------------
// Mobile browsers require a secure context (HTTPS, or localhost) AND
// usually want a user gesture (a tap) before they'll show the permission
// prompt reliably — so we use a button instead of firing on page load.
function geoErrorMessage(err) {
  if (err.code === 1) return 'Location permission denied. Please allow location access for this site in your phone/browser settings, then tap "Enable Location" again.';
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

function watchMyLocation() {
  if (!navigator.geolocation) {
    showAlert('alertBox', 'Geolocation is not supported by this browser.');
    return;
  }
  if (insecureContextWarning()) return;

  document.getElementById('locationPermissionCard')?.remove();

  navigator.geolocation.watchPosition(
    (pos) => {
      myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (!myMarker) {
        myMarker = L.marker([myPos.lat, myPos.lng], { icon: meIcon }).addTo(map).bindPopup('You are here');
        map.setView([myPos.lat, myPos.lng], 14);
      } else {
        myMarker.setLatLng([myPos.lat, myPos.lng]);
      }
      apiRequest('/users/location', { method: 'PUT', body: { lat: myPos.lat, lng: myPos.lng } }).catch(() => {});
    },
    (err) => showAlert('alertBox', geoErrorMessage(err)),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
}

// Show a friendly "enable location" prompt instead of silently requesting
// on load — this also acts as the user-gesture mobile browsers want.
document.getElementById('resultsPanel').insertAdjacentHTML('beforebegin', `
  <div class="location-permission-card" id="locationPermissionCard">
    <div style="font-weight:700">📍 Turn on location</div>
    <p>We need your location to find nearby doctors & nurses and to track your visit.</p>
    <button class="btn btn-primary" id="enableLocationBtn">Enable Location</button>
  </div>
`);
document.getElementById('enableLocationBtn').addEventListener('click', watchMyLocation);
// Still try automatically too, in case permission was already granted before —
// if it was, the browser resolves instantly with no extra prompt.
watchMyLocation();

// ---------------- SEARCH NEARBY PROVIDERS ----------------

document.getElementById('searchBtn').addEventListener('click', async () => {
  if (!myPos) { showAlert('alertBox', 'Tap "Enable Location" first so we know where you are.'); return; }
  const role = document.getElementById('roleSearch').value;

  try {
    const data = await apiRequest(`/users/nearby?role=${role}&lat=${myPos.lat}&lng=${myPos.lng}&maxDistance=15000`);
    renderResults(data.providers);
  } catch (err) {
    showAlert('alertBox', err.message);
  }
});

function renderResults(providers) {
  resultMarkers.forEach(m => map.removeLayer(m));
  resultMarkers = [];

  const panel = document.getElementById('resultsPanel');
  if (!providers.length) {
    panel.innerHTML = `<div class="empty-state">No available providers nearby right now.</div>`;
    return;
  }

  panel.innerHTML = `<h3>Nearby (${providers.length})</h3>`;
  providers.forEach(p => {
    const [lng, lat] = p.location.coordinates;
    const distance = haversineKm(myPos, { lat, lng }).toFixed(1);

    const marker = L.marker([lat, lng], { icon: providerIcon })
      .addTo(map)
      .bindPopup(`${p.fullName} — ${p.specialty || p.role}`);
    resultMarkers.push(marker);

    const div = document.createElement('div');
    div.className = 'provider-card';
    div.innerHTML = `
      <div class="name">${p.fullName} <span class="badge">${p.role}</span></div>
      <div class="meta">${p.specialty || 'General'} · ${p.yearsOfExperience || 0} yrs exp · ${distance} km away</div>
      <button class="btn btn-primary btn-block" data-id="${p._id}">Request Visit</button>
    `;
    div.querySelector('button').addEventListener('click', () => requestProvider(p._id, p.fullName));
    panel.appendChild(div);
  });
}

async function requestProvider(providerId, name) {
  try {
    await apiRequest('/requests', {
      method: 'POST',
      body: { providerId, lat: myPos.lat, lng: myPos.lng, reason: 'General consultation' }
    });
    showAlert('alertBox', `Request sent to ${name}. Waiting for them to accept...`, 'success');
  } catch (err) {
    showAlert('alertBox', err.message);
  }
}

// ---------------- TRIP PANEL (route bar + live tracking bar) ----------------
function renderTripPanel() {
  const p = activeTrip.provider;
  const [pLng, pLat] = p.location.coordinates;
  const [dLng, dLat] = activeTrip.patientLocation.coordinates;

  let initialDistance = activeTrip.initialDistanceKm;
  let trackingHTML = '';
  try {
    if (initialDistance == null) initialDistance = haversineKm({ lat: pLat, lng: pLng }, { lat: dLat, lng: dLng });
    trackingHTML = trackingBarHTML('patientTrackingBar', p.fullName.split(' ')[0], 'You', initialDistance, initialDistance);
  } catch (e) {
    console.error('Tracking bar failed to render (details below still work fine):', e);
    trackingHTML = `<div class="tracking-bar">Live tracking is temporarily unavailable. (${e.message})</div>`;
  }

  const panel = document.getElementById('tripPanel');
  panel.innerHTML = `
    <div class="trip-card">
      <div class="name">${p.fullName} <span class="badge badge-accepted">On the way</span></div>
      <div class="meta">${p.specialty || p.role} · ${p.yearsOfExperience || 0} yrs exp</div>
      <div class="provider-details">
        <div class="line"><b>Phone</b> ${p.phone}</div>
        <div class="line"><b>Email</b> ${p.email}</div>
        <div class="line"><b>Address</b> ${p.address}</div>
        <div class="line"><b>License #</b> ${p.licenseNumber || '—'}</div>
        ${p.bio ? `<div class="line"><b>About</b> ${p.bio}</div>` : ''}
      </div>
      ${trackingHTML}
      <div id="patientHistoryBox"></div>
      <div id="patientChatBox"></div>
      <button class="btn btn-danger btn-block" id="completeTripBtn">Mark visit as completed</button>
    </div>
  `;
  document.getElementById('completeTripBtn').addEventListener('click', async () => {
    await apiRequest(`/requests/${activeTrip._id}/complete`, { method: 'PUT' });
  });
  renderChatBox('patientChatBox', activeTrip._id);
  // Read-only for the patient — only the treating provider can add entries.
  renderPatientHistoryBox('patientHistoryBox', user.id, activeTrip._id, false);

  if (myPos) startRouteTracking();
}

// Routes any incoming chat message to the currently open trip's chat box.
wireChatSocket(socket, () => activeTrip?._id, 'patientChatBox');

function startRouteTracking() {
  clearRoute();
  const providerCoords = activeTrip.provider.location.coordinates; // [lng, lat]
  routingControl = L.Routing.control({
    waypoints: [
      L.latLng(providerCoords[1], providerCoords[0]),
      L.latLng(myPos.lat, myPos.lng)
    ],
    routeWhileDragging: false,
    addWaypoints: false,
    draggableWaypoints: false,
    show: false,
    createMarker: () => null // we manage our own markers
  }).addTo(map);
}

function clearRoute() {
  if (routingControl) { map.removeControl(routingControl); routingControl = null; }
  if (liveProviderMarker) { map.removeLayer(liveProviderMarker); liveProviderMarker = null; }
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
      panel.innerHTML = `<div class="empty-state">No past visits yet.</div>`;
      return;
    }
    panel.innerHTML = requests.map(r => `
      <div class="history-item">
        <div class="hi-top">
          <span>${r.provider ? r.provider.fullName : '(deleted provider)'}</span>
          <span class="badge ${r.status === 'completed' ? 'badge-accepted' : 'badge-pending'}">${r.status}</span>
        </div>
        <div class="hi-meta">${r.provider ? r.provider.specialty || r.provider.role : ''} · ${new Date(r.createdAt).toLocaleDateString()} · ${r.reason || 'General consultation'}</div>
      </div>
    `).join('');
  } catch (err) {
    showAlert('alertBox', err.message);
  }
});
(async function loadActiveTrip() {
  try {
    const { requests } = await apiRequest('/requests/active');
    const accepted = requests.find(r => r.status === 'accepted');
    if (accepted) {
      activeTrip = accepted;
      renderTripPanel();
    }
  } catch (_) {}
})();
