// Mirrors utils/roles.js on the backend — used to build role dropdowns
// consistently across the patient search, the provider "find cover"
// search, and the admin filters.
const PROVIDER_ROLES = ['doctor', 'nurse', 'pharmacist', 'labtech'];
const ROLE_LABELS = {
  patient: 'Patient',
  doctor: 'Doctor',
  nurse: 'Nurse',
  pharmacist: 'Pharmacist',
  labtech: 'Lab Technician',
  admin: 'Admin'
};

function providerRoleOptionsHTML(selected) {
  return PROVIDER_ROLES.map(r =>
    `<option value="${r}" ${r === selected ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`
  ).join('');
}
