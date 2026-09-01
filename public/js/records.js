// Medical documentation: diagnosis, prescriptions, lab tests, and provider
// reports for a patient. Used two ways:
//  1. renderPatientHistoryBox() — embedded inside an active trip panel so
//     whichever provider is currently matched with a patient can see their
//     full history and (if they're the provider) add a new entry.
//  2. populateRecordsTab() — powers the standalone "Records" tab so a
//     patient can browse their own history, and a provider can browse
//     everything they've authored, outside of an active visit.
// Entirely additive — nothing here is required by any existing feature.

function recordCardHTML(r) {
  const rxList = (r.prescriptions || []).map(p => `<li>${escapeHtml(p)}</li>`).join('');
  const labList = (r.labTests || []).map(t => `<li>${escapeHtml(t)}</li>`).join('');
  return `
    <div class="history-item">
      <div class="hi-top">
        <span>${r.diagnosis ? escapeHtml(r.diagnosis) : 'General note'}</span>
        <span class="badge">${new Date(r.createdAt).toLocaleDateString()}</span>
      </div>
      <div class="hi-meta">${r.provider ? `${escapeHtml(r.provider.fullName)} · ${r.provider.specialty || r.provider.role}` : 'Unknown provider'}${r.patient ? ` · Patient: ${escapeHtml(r.patient.fullName)}` : ''}</div>
      ${rxList ? `<div class="record-section"><b>💊 Prescribed:</b><ul>${rxList}</ul></div>` : ''}
      ${labList ? `<div class="record-section"><b>🧪 Lab tests:</b><ul>${labList}</ul></div>` : ''}
      ${r.report ? `<div class="record-section"><b>📝 Report:</b> ${escapeHtml(r.report)}</div>` : ''}
    </div>
  `;
}

// ---------------- Embedded box inside an active trip panel ----------------
// canAdd = true when the viewer is the treating provider on this visit.
async function renderPatientHistoryBox(containerId, patientId, requestId, canAdd) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="records-box">
      <div class="chat-header">🩺 Medical History</div>
      <div id="${containerId}-list" class="records-list"><div class="empty-state">Loading…</div></div>
      ${canAdd ? `
        <div class="records-form">
          <div class="field"><label>Diagnosis</label><input type="text" id="${containerId}-diagnosis" placeholder="e.g. Malaria, Hypertension"></div>
          <div class="field"><label>Prescribed drugs (one per line)</label><textarea id="${containerId}-rx" rows="2" placeholder="Amoxicillin 500mg — 3x daily for 7 days"></textarea></div>
          <div class="field"><label>Lab tests (one per line)</label><textarea id="${containerId}-labs" rows="2" placeholder="Full Blood Count&#10;Malaria Parasite Test"></textarea></div>
          <div class="field"><label>Report / notes</label><textarea id="${containerId}-report" rows="2" placeholder="Summary of the visit and next steps"></textarea></div>
          <button class="btn btn-primary btn-block" id="${containerId}-save">Save Record</button>
          <div id="${containerId}-formAlert"></div>
        </div>
      ` : ''}
    </div>
  `;

  async function loadList() {
    const list = document.getElementById(`${containerId}-list`);
    try {
      const { records } = await apiRequest(`/records/patient/${patientId}`);
      list.innerHTML = records.length
        ? records.map(recordCardHTML).join('')
        : '<div class="empty-state">No records yet.</div>';
    } catch (e) {
      list.innerHTML = `<div class="empty-state">Could not load history. (${e.message})</div>`;
    }
  }
  await loadList();

  if (canAdd) {
    document.getElementById(`${containerId}-save`).addEventListener('click', async () => {
      const diagnosis = document.getElementById(`${containerId}-diagnosis`).value.trim();
      const prescriptions = document.getElementById(`${containerId}-rx`).value.split('\n');
      const labTests = document.getElementById(`${containerId}-labs`).value.split('\n');
      const report = document.getElementById(`${containerId}-report`).value.trim();

      if (!diagnosis && !report && !prescriptions.some(s => s.trim()) && !labTests.some(s => s.trim())) {
        showAlert(`${containerId}-formAlert`, 'Add at least a diagnosis, prescription, lab test, or note.');
        return;
      }

      try {
        await apiRequest('/records', {
          method: 'POST',
          body: { patientId, requestId, diagnosis, prescriptions, labTests, report }
        });
        document.getElementById(`${containerId}-diagnosis`).value = '';
        document.getElementById(`${containerId}-rx`).value = '';
        document.getElementById(`${containerId}-labs`).value = '';
        document.getElementById(`${containerId}-report`).value = '';
        document.getElementById(`${containerId}-formAlert`).innerHTML = '';
        await loadList();
      } catch (e) {
        showAlert(`${containerId}-formAlert`, e.message);
      }
    });
  }
}

// ---------------- Standalone "Records" tab ----------------
// Auto-runs if the page has a #recordsTabPanel container — safe no-op
// on pages that don't (nothing else on this page depends on it existing).
async function populateRecordsTab() {
  const panel = document.getElementById('recordsTabPanel');
  if (!panel) return;

  const me = getUser();
  if (!me) return;

  panel.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const endpoint = me.role === 'patient' ? `/records/patient/${me.id}` : '/records/mine';
    const { records } = await apiRequest(endpoint);
    panel.innerHTML = records.length
      ? records.map(recordCardHTML).join('')
      : '<div class="empty-state">No medical records yet.</div>';
  } catch (e) {
    panel.innerHTML = `<div class="empty-state">Could not load records. (${e.message})</div>`;
  }
}

// Wire the Records tab button if present (works alongside the existing
// generic tab-switching in dashboard-tabs.js / admin-dashboard.js — this
// only adds the data-loading step, it doesn't touch tab switching itself).
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn[data-tab="records"]');
  if (btn) populateRecordsTab();
});
