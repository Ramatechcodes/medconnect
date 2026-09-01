const express = require('express');
const Request = require('../models/Request');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { haversineKm } = require('../utils/geo');
const { PROVIDER_ROLES } = require('../utils/roles');

const router = express.Router();

// Fields shown to the OTHER party once a request exists — this is the
// "full details" both the patient and the provider get to see about
// each other for a specific visit.
const FULL_DETAIL_FIELDS =
  'fullName email phone address role specialty licenseNumber yearsOfExperience bio location';

function withIO(req) {
  const io = req.app.get('io');
  return {
    emitToUser: (userId, event, payload) => io.to(`user:${userId}`).emit(event, payload)
  };
}

// ---------------- Create a request to a provider ----------------
// Two flows share this endpoint:
//  - A patient requesting care from a doctor/nurse/pharmacist/lab tech.
//  - A provider requesting coverage from another nearby provider.
router.post('/', auth, async (req, res) => {
  try {
    const isPatient = req.user.role === 'patient';
    const isProvider = PROVIDER_ROLES.includes(req.user.role);
    if (!isPatient && !isProvider) {
      return res.status(403).json({ message: 'Only patients and providers can create requests' });
    }
    if (req.user.isBanned) return res.status(403).json({ message: 'Your account has been banned' });
    if (req.user.isRestricted) {
      return res.status(403).json({ message: 'Your account is restricted from making new requests. Contact support.' });
    }

    const { providerId, reason, lat, lng } = req.body;
    if (!providerId || lat === undefined || lng === undefined) {
      return res.status(400).json({ message: 'providerId, lat and lng are required' });
    }
    if (String(providerId) === String(req.user._id)) {
      return res.status(400).json({ message: "You can't send a request to yourself" });
    }

    const provider = await User.findById(providerId);
    if (!provider || !PROVIDER_ROLES.includes(provider.role)) {
      return res.status(404).json({ message: 'Provider not found' });
    }
    if (provider.isBanned) return res.status(400).json({ message: 'This provider is unavailable' });

    const request = await Request.create({
      patient: req.user._id,
      provider: providerId,
      reason: reason || '',
      requestType: isProvider ? 'coverage' : 'care',
      patientLocation: { type: 'Point', coordinates: [lng, lat] }
    });

    const populated = await request.populate([
      { path: 'patient', select: FULL_DETAIL_FIELDS },
      { path: 'provider', select: FULL_DETAIL_FIELDS }
    ]);

    withIO(req).emitToUser(providerId, 'request:new', populated);

    res.status(201).json({ request: populated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not create request' });
  }
});

// ---------------- PROVIDER: accept / decline a request ----------------
router.put('/:id/respond', auth, async (req, res) => {
  try {
    if (!PROVIDER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: 'Only providers can respond to requests' });
    }
    if (req.user.isBanned) return res.status(403).json({ message: 'Your account has been banned' });
    if (req.user.isRestricted) {
      return res.status(403).json({ message: 'Your account is restricted from accepting requests. Contact support.' });
    }

    const { status } = req.body; // 'accepted' | 'declined'
    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ message: 'status must be accepted or declined' });
    }

    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (String(request.provider) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not your request' });
    }

    request.status = status;
    if (status === 'accepted') {
      request.startedAt = new Date();
      // Baseline distance for the live "how close are they now" tracking bar.
      const [pLng, pLat] = req.user.location.coordinates;
      const [dLng, dLat] = request.patientLocation.coordinates;
      request.initialDistanceKm = haversineKm(pLat, pLng, dLat, dLng);
    }
    await request.save();

    const populated = await request.populate([
      { path: 'patient', select: FULL_DETAIL_FIELDS },
      { path: 'provider', select: FULL_DETAIL_FIELDS }
    ]);

    withIO(req).emitToUser(populated.patient._id, `request:${status}`, populated);

    res.json({ request: populated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not update request' });
  }
});

// ---------------- Mark a trip completed ----------------
router.put('/:id/complete', auth, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    const isParticipant =
      String(request.patient) === String(req.user._id) ||
      String(request.provider) === String(req.user._id);
    if (!isParticipant) return res.status(403).json({ message: 'Not your request' });

    request.status = 'completed';
    request.completedAt = new Date();
    await request.save();

    withIO(req).emitToUser(request.patient, 'request:completed', request);
    withIO(req).emitToUser(request.provider, 'request:completed', request);

    res.json({ request });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not complete request' });
  }
});

// ---------------- Get my active requests ----------------
// Returns every request where I'm involved on either side. For a patient
// that's only ever "I'm the requester". For a provider it can be both:
// requests patients/other providers sent TO them, AND coverage requests
// THEY sent to another provider — the frontend tells the two apart by
// comparing each request's provider/patient id against its own user id.
router.get('/active', auth, async (req, res) => {
  try {
    const requests = await Request.find({
      $or: [{ patient: req.user._id }, { provider: req.user._id }],
      status: { $in: ['pending', 'accepted'] }
    })
      .populate('patient', FULL_DETAIL_FIELDS)
      .populate('provider', FULL_DETAIL_FIELDS)
      .sort('-createdAt');

    res.json({ requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load requests' });
  }
});

// ---------------- Get my history (past requests) ----------------
router.get('/history', auth, async (req, res) => {
  try {
    const requests = await Request.find({
      $or: [{ patient: req.user._id }, { provider: req.user._id }],
      status: { $in: ['completed', 'declined', 'cancelled'] }
    })
      .populate('patient', FULL_DETAIL_FIELDS)
      .populate('provider', FULL_DETAIL_FIELDS)
      .sort('-createdAt')
      .limit(100);

    res.json({ requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load history' });
  }
});

module.exports = router;
