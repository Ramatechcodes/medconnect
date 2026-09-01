const roleOptions = document.querySelectorAll('.role-option');
const providerFields = document.getElementById('providerFields');
let selectedRole = null;

// Pre-select role from ?role= query param (e.g. from landing page)
const params = new URLSearchParams(window.location.search);
const preselect = params.get('role');

function selectRole(role) {
  selectedRole = role;
  roleOptions.forEach(opt => opt.classList.toggle('active', opt.dataset.role === role));
  providerFields.classList.toggle('hidden', role === 'patient');
}

roleOptions.forEach(opt => {
  opt.addEventListener('click', () => selectRole(opt.dataset.role));
});

if (preselect && ['patient', 'doctor', 'nurse', 'pharmacist', 'labtech'].includes(preselect)) {
  selectRole(preselect);
} else {
  selectRole('patient');
}

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    role: selectedRole,
    fullName: document.getElementById('fullName').value.trim(),
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    address: document.getElementById('address').value.trim(),
    password: document.getElementById('password').value,
    specialty: document.getElementById('specialty').value.trim(),
    licenseNumber: document.getElementById('licenseNumber').value.trim(),
    yearsOfExperience: Number(document.getElementById('yearsOfExperience').value) || 0
  };

  if (['doctor', 'nurse', 'pharmacist', 'labtech'].includes(selectedRole) && !payload.licenseNumber) {
    showAlert('alertBox', 'License number is required for doctors and nurses.');
    return;
  }

  try {
    const data = await apiRequest('/auth/register', { method: 'POST', body: payload });
    showAlert('alertBox', data.message, 'success');
    setTimeout(() => {
      window.location.href = `/verify.html?email=${encodeURIComponent(payload.email)}`;
    }, 1200);
  } catch (err) {
    showAlert('alertBox', err.message);
  }
});
