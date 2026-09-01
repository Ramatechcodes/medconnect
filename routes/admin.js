const express = require('express');
const User = require('../models/User');
const Request = require('../models/Request');
const MedicalRecord = require('../models/MedicalRecord');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { ALL_ROLES, PROVIDER_ROLES } = require('../utils/roles');

const router = express.Router();

// Every route below requires a logged-in admin
router.use(auth, adminOnly);

const SAFE_FIELDS = '-password -verificationCodeHash -verificationCodeExpires';
const REQUEST_DETAIL_FIELDS =
  'fullName email phone address role specialty licenseNumber yearsOfExperience isBanned isRestricted location';

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
