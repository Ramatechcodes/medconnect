const roleOptions = document.querySelectorAll('.role-option');
const providerFields = document.getElementById('providerFields');
let selectedRole = null;
let licenseVerified = false;
let verifiedPhone = '';

const LICENSE_QUESTIONS = {
  doctor: 'What is your MDCN license number, and which hospital or clinic are you currently practicing at?',
  nurse: 'What is your NMCN license number, and where do you currently work?',
  pharmacist: 'What is your PCN license number, and the name of your pharmacy?',
  labtech: 'What is your MLSCN license number, and the name of your laboratory?'
};

// Pre-select role from ?role= query param (e.g. from landing page)
const params = new URLSearchParams(window.location.search);
const preselect = params.get('role');

function buildWhatsappMessage() {
  const fullName = document.getElementById('fullName').value.trim() || '(your name)';
  const phone = document.getElementById('phone').value.trim() || '(your phone number)';
  const question = LICENSE_QUESTIONS[selectedRole] || 'What is your professional license number and place of work?';
  return `Hello QuickMed Admin, I'm registering as a ${selectedRole} on QuickMed.\nName: ${fullName}\nPhone: ${phone}\n\n${question}`;
}

function updateWhatsappLink() {
  const link = document.getElementById('whatsappVerifyLink');
  if (!link) return;
  const msg = encodeURIComponent(buildWhatsappMessage());
  link.href = `https://wa.me/2347067770651?text=${msg}`;
}

function resetLicenseVerification() {
  licenseVerified = false;
  verifiedPhone = '';
  const codeInput = document.getElementById('licenseVerifyCode');
  const btn = document.getElementById('verifyLicenseBtn');
  const status = document.getElementById('licenseVerifyStatus');
  if (codeInput) { codeInput.disabled = false; codeInput.value = ''; }
  if (btn) btn.disabled = false;
  if (status) status.innerHTML = '';
}

function selectRole(role) {
  selectedRole = role;
  roleOptions.forEach(opt => opt.classList.toggle('active', opt.dataset.role === role));
  providerFields.classList.toggle('hidden', role === 'patient');
  resetLicenseVerification();
  updateWhatsappLink();
}

roleOptions.forEach(opt => {
  opt.addEventListener('click', () => selectRole(opt.dataset.role));
});

document.getElementById('fullName').addEventListener('input', updateWhatsappLink);
document.getElementById('phone').addEventListener('input', () => {
  updateWhatsappLink();
  resetLicenseVerification(); // phone changed — old verification no longer applies
});

document.getElementById('verifyLicenseBtn').addEventListener('click', async () => {
  const phone = document.getElementById('phone').value.trim();
  const code = document.getElementById('licenseVerifyCode').value.trim();
  const status = document.getElementById('licenseVerifyStatus');

  if (!phone) { status.innerHTML = '<span style="color:#dc2626">Enter your phone number first.</span>'; return; }
  if (!code) { status.innerHTML = '<span style="color:#dc2626">Enter the code sent to you on WhatsApp.</span>'; return; }

  try {
    const data = await apiRequest('/auth/verify-license', { method: 'POST', body: { phone, code } });
    licenseVerified = true;
    verifiedPhone = phone;
    status.innerHTML = '<span style="color:#16a34a">✅ License verified</span>';
    document.getElementById('licenseVerifyCode').disabled = true;
    document.getElementById('verifyLicenseBtn').disabled = true;
  } catch (err) {
    licenseVerified = false;
    status.innerHTML = `<span style="color:#dc2626">${err.message}</span>`;
  }
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

  if (['doctor', 'nurse', 'pharmacist', 'labtech'].includes(selectedRole)) {
    if (!payload.licenseNumber) {
      showAlert('alertBox', 'License number is required for doctors, nurses, pharmacists, and lab technicians.');
      return;
    }
    if (!licenseVerified || verifiedPhone !== payload.phone) {
      showAlert('alertBox', 'Please verify your license via WhatsApp before submitting.');
      return;
    }
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