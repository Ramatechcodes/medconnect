// Single source of truth for roles, used across auth/users/requests routes.
const PROVIDER_ROLES = ['doctor', 'nurse', 'pharmacist', 'labtech'];
const PUBLIC_ROLES = ['patient', ...PROVIDER_ROLES]; // roles the public register form allows
const ALL_ROLES = [...PUBLIC_ROLES, 'admin'];

const ROLE_LABELS = {
  patient: 'Patient',
  doctor: 'Doctor',
  nurse: 'Nurse',
  pharmacist: 'Pharmacist',
  labtech: 'Lab Technician',
  admin: 'Admin'
};

module.exports = { PROVIDER_ROLES, PUBLIC_ROLES, ALL_ROLES, ROLE_LABELS };
