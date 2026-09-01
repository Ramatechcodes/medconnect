// Shared "how close is the doctor/nurse now" tracking bar.
// Used by the Patient, Doctor/Nurse/Pharmacist/Lab Tech, and Admin
// dashboards so the same visual language (and math) is consistent
// everywhere. Every function here defensively normalizes its inputs —
// missing/undefined/NaN distances degrade to a "locating…" state instead
// of throwing, since that was the root cause of the "tracking unavailable"
// fallback showing up unexpectedly.

function haversineKmClient(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

// Coerces any input into either a finite number or null — never undefined/NaN.
function cleanDistance(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function trackingBarHTML(elementId, fromLabel, toLabel, distanceKmRaw, initialDistanceKmRaw) {
  const distanceKm = cleanDistance(distanceKmRaw);
  const initialDistanceKm = cleanDistance(initialDistanceKmRaw);
  const pct = trackingPercent(distanceKm, initialDistanceKm);
  const arrived = distanceKm !== null && distanceKm <= 0.1;
  return `
    <div class="tracking-bar" id="${elementId}">
      <div class="tracking-labels"><span>${fromLabel}</span><span>${toLabel}</span></div>
      <div class="tracking-track">
        <div class="tracking-fill" style="width:${pct}%"></div>
        <div class="tracking-icon" style="left:${pct}%">🚑</div>
      </div>
      <div class="tracking-status ${arrived ? 'arrived' : ''}">${trackingStatusText(distanceKm, arrived)}</div>
      <div class="tracking-sub">${distanceKm === null ? 'Waiting for live location…' : `${distanceKm.toFixed(2)} km away · ETA ~${etaMinutes(distanceKm)} min`}</div>
    </div>
  `;
}

function trackingPercent(distanceKm, initialDistanceKm) {
  if (distanceKm === null || !initialDistanceKm || initialDistanceKm <= 0) return 0;
  const pct = (1 - distanceKm / initialDistanceKm) * 100;
  return Math.max(0, Math.min(100, pct));
}

function trackingStatusText(distanceKm, arrived) {
  if (distanceKm === null) return 'Locating…';
  if (arrived) return '📍 Arrived at your location';
  return '🚗 On the way — getting closer';
}

function etaMinutes(distanceKm) {
  // Rough estimate assuming ~25km/h average urban travel speed.
  return Math.max(1, Math.round((distanceKm / 25) * 60));
}

// Updates an already-rendered tracking bar in place.
function updateTrackingBar(elementId, distanceKmRaw, initialDistanceKmRaw) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const distanceKm = cleanDistance(distanceKmRaw);
  const initialDistanceKm = cleanDistance(initialDistanceKmRaw);

  const pct = trackingPercent(distanceKm, initialDistanceKm);
  const arrived = distanceKm !== null && distanceKm <= 0.1;

  el.querySelector('.tracking-fill').style.width = pct + '%';
  el.querySelector('.tracking-icon').style.left = pct + '%';

  const statusEl = el.querySelector('.tracking-status');
  statusEl.textContent = trackingStatusText(distanceKm, arrived);
  statusEl.classList.toggle('arrived', arrived);

  el.querySelector('.tracking-sub').textContent =
    distanceKm === null ? 'Waiting for live location…' : `${distanceKm.toFixed(2)} km away · ETA ~${etaMinutes(distanceKm)} min`;
}
