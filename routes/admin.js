const express = require('express');
const User = require('../models/User');
const Request = require('../models/Request');
const MedicalRecord = require('../models/MedicalRecord');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { ALL_ROLES, PROVIDER_ROLES } = require('../utils/roles');
const crypto = require('crypto');
const LicenseVerification = require('../models/LicenseVerification');

const router = express.Router();

// Every route below requires a logged-in admin
router.use(auth, adminOnly);

const SAFE_FIELDS = '-password -verificationCodeHash -verificationCodeExpires';
const REQUEST_DETAIL_FIELDS =
  'fullName email phone address role specialty licenseNumber yearsOfExperience isBanned isRestricted location';
// ---------------- GENERATE LICENSE VERIFICATION CODE ----------------
// Admin manually verifies the provider's answers over WhatsApp first,
// then generates a code here and sends it back to them via WhatsApp.
router.post('/license-codes', async (req, res) => {
  try {
    const { phone, role, fullName } = req.body;
    if (!phone) return res.status(400).json({ message: 'Phone number is required' });

    const cleanPhone = phone.trim();
    const code = Math.floor(10000000 + Math.random() * 90000000).toString(); // 8 digits
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    await LicenseVerification.findOneAndUpdate(
      { phone: cleanPhone, consumed: false },
      {
        phone: cleanPhone,
        role: role || '',
        fullName: fullName || '',
        codeHash,
        expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
        verifiedAt: null,
        consumed: false
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      message: 'Code generated. Send this to the provider via WhatsApp.',
      code,
      expiresInMinutes: 30
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not generate code' });
  }
});
// ---------------- STATS (for dashboard cards) ----------------
router.get('/stats', async (req, res) => {
  const [
    totalPatients, totalDoctors, totalNurses, totalPharmacists, totalLabTechs,
    pendingRequests, activeRequests, coverageRequests, bannedUsers
  ] = await Promise.all([
    User.countDocuments({ role: 'patient' }),
    User.countDocuments({ role: 'doctor' }),
    User.countDocuments({ role: 'nurse' }),
    User.countDocuments({ role: 'pharmacist' }),
    User.countDocuments({ role: 'labtech' }),
    Request.countDocuments({ status: 'pending' }),
    Request.countDocuments({ status: 'accepted' }),
    Request.countDocuments({ requestType: 'coverage', status: { $in: ['pending', 'accepted'] } }),
    User.countDocuments({ isBanned: true })
  ]);
  res.json({
    totalPatients, totalDoctors, totalNurses, totalPharmacists, totalLabTechs,
    pendingRequests, activeRequests, coverageRequests, bannedUsers
  });
});

// ---------------- LIST ALL USERS (full details) ----------------
// GET /api/admin/users?role=doctor&search=john
router.get('/users', async (req, res) => {
  try {
    const { role, search } = req.query;
    const filter = {};
    if (role && ALL_ROLES.includes(role)) filter.role = role;
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    const users = await User.find(filter).select(SAFE_FIELDS).sort('-createdAt');
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load users' });
  }
});

// ---------------- SINGLE USER (full details) ----------------
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(SAFE_FIELDS);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Could not load user' });
  }
});

// ---------------- BAN / UNBAN ----------------
router.put('/users/:id/ban', async (req, res) => {
  try {
    const { banned, reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: !!banned, banReason: banned ? (reason || '') : '' },
      { new: true }
    ).select(SAFE_FIELDS);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Could not update ban status' });
  }
});

// ---------------- RESTRICT / UNRESTRICT ----------------
router.put('/users/:id/restrict', async (req, res) => {
  try {
    const { restricted, reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isRestricted: !!restricted, restrictReason: restricted ? (reason || '') : '' },
      { new: true }
    ).select(SAFE_FIELDS);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Could not update restriction' });
  }
});

// ---------------- DELETE USER ----------------
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ message: 'Cannot delete an admin account' });

    await User.findByIdAndDelete(req.params.id);
    // Clean up any requests tied to this user so the admin requests view stays consistent
    await Request.deleteMany({ $or: [{ patient: req.params.id }, { provider: req.params.id }] });

    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete user' });
  }
});

// ---------------- ALL REQUESTS / ACTIVITY LOG (full details) ----------------
// GET /api/admin/requests?status=pending
router.get('/requests', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && ['pending', 'accepted', 'declined', 'completed', 'cancelled'].includes(status)) {
      filter.status = status;
    }
    const requests = await Request.find(filter)
      .populate('patient', REQUEST_DETAIL_FIELDS)
      .populate('provider', REQUEST_DETAIL_FIELDS)
      .sort('-createdAt');
    res.json({ requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load requests' });
  }
});

// ---------------- ALL USER LOCATIONS (for the admin map) ----------------
router.get('/locations', async (req, res) => {
  try {
    const users = await User.find({ role: { $in: ['patient', ...PROVIDER_ROLES] } })
      .select('fullName role isBanned isRestricted isAvailable location');
    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: 'Could not load locations' });
  }
});

// ---------------- ALL MEDICAL RECORDS (admin oversight) ----------------
// GET /api/admin/records?patientId=&providerId=
router.get('/records', async (req, res) => {
  try {
    const { patientId, providerId } = req.query;
    const filter = {};
    if (patientId) filter.patient = patientId;
    if (providerId) filter.provider = providerId;

    const records = await MedicalRecord.find(filter)
      .populate('patient', 'fullName email')
      .populate('provider', 'fullName role specialty')
      .sort('-createdAt')
      .limit(300);

    res.json({ records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load records' });
  }
});

module.exports = router;
