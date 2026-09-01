const express = require('express');
const MedicalRecord = require('../models/MedicalRecord');
const Request = require('../models/Request');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { PROVIDER_ROLES } = require('../utils/roles');

const router = express.Router();

const RECORD_POPULATE = [
  { path: 'patient', select: 'fullName email' },
  { path: 'provider', select: 'fullName role specialty' }
];

// A provider may only read/write a patient's records if they have (or have
// had) a genuine care match with that patient — an accepted or completed
// Request between them. This is what "any provider selected" means in
// practice: being matched is what unlocks seeing the chart.
async function hasCareRelationship(providerId, patientId) {
  const match = await Request.findOne({
    provider: providerId,
    patient: patientId,
    requestType: 'care',
    status: { $in: ['accepted', 'completed'] }
  });
  return !!match;
}

// ---------------- CREATE a record (providers only) ----------------
router.post('/', auth, async (req, res) => {
  try {
    if (!PROVIDER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: 'Only providers can add medical records' });
    }
    if (req.user.isBanned || req.user.isRestricted) {
      return res.status(403).json({ message: 'Your account cannot add records right now' });
    }

    const { patientId, requestId, diagnosis, prescriptions, labTests, report } = req.body;
    if (!patientId) return res.status(400).json({ message: 'patientId is required' });

    const patient = await User.findById(patientId);
    if (!patient || patient.role !== 'patient') {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const authorized = await hasCareRelationship(req.user._id, patientId);
    if (!authorized) {
      return res.status(403).json({ message: "You can only add records for patients you've been matched with" });
    }

    const clean = (arr) => Array.isArray(arr) ? arr.map(s => String(s).trim()).filter(Boolean) : [];

    const record = await MedicalRecord.create({
      patient: patientId,
      provider: req.user._id,
      request: requestId || undefined,
      diagnosis: (diagnosis || '').trim(),
      prescriptions: clean(prescriptions),
      labTests: clean(labTests),
      report: (report || '').trim()
    });

    const populated = await record.populate(RECORD_POPULATE);
    res.status(201).json({ record: populated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not save record' });
  }
});

// ---------------- GET a patient's full record history ----------------
// Readable by: the patient themself, any provider with a care match to
// them (past or present), or an admin.
router.get('/patient/:patientId', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const isSelf = String(req.user._id) === String(patientId);
    const isAdmin = req.user.role === 'admin';
    const isMatchedProvider =
      PROVIDER_ROLES.includes(req.user.role) && (await hasCareRelationship(req.user._id, patientId));

    if (!isSelf && !isAdmin && !isMatchedProvider) {
      return res.status(403).json({ message: "You don't have access to this patient's records" });
    }

    const records = await MedicalRecord.find({ patient: patientId })
      .populate(RECORD_POPULATE)
      .sort('-createdAt')
      .limit(200);

    res.json({ records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load records' });
  }
});

// ---------------- GET records I (a provider) have authored ----------------
router.get('/mine', auth, async (req, res) => {
  try {
    if (!PROVIDER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: 'Only providers have authored records' });
    }
    const records = await MedicalRecord.find({ provider: req.user._id })
      .populate(RECORD_POPULATE)
      .sort('-createdAt')
      .limit(200);

    res.json({ records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load records' });
  }
});

module.exports = router;
