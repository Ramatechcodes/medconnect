const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { PROVIDER_ROLES } = require('../utils/roles');

const router = express.Router();

function publicUser(user) {
  return {
    id: user._id,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    address: user.address,
    specialty: user.specialty,
    licenseNumber: user.licenseNumber,
    yearsOfExperience: user.yearsOfExperience,
    bio: user.bio,
    isAvailable: user.isAvailable,
    isVerified: user.isVerified,
    isBanned: user.isBanned,
    isRestricted: user.isRestricted,
    location: user.location
  };
}

// ---------------- GET MY PROFILE ----------------
router.get('/me', auth, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ---------------- UPDATE MY LOCATION / AVAILABILITY ----------------
router.put('/location', auth, async (req, res) => {
  try {
    if (req.user.isBanned) return res.status(403).json({ message: 'Your account has been banned' });

    const { lat, lng, isAvailable } = req.body;
    const update = { lastLocationUpdate: new Date() };

    if (lat !== undefined && lng !== undefined) {
      update.location = { type: 'Point', coordinates: [lng, lat] };
    }
    if (typeof isAvailable === 'boolean' && req.user.role !== 'patient') {
      update.isAvailable = isAvailable;
    }

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not update location' });
  }
});

// ---------------- FIND NEARBY PROVIDERS ----------------
// Used two ways:
//  - Patients searching for a doctor/nurse/pharmacist/lab tech (care).
//  - Providers searching for another nearby provider to cover for them
//    while they're off (coverage) — excludes their own account.
router.get('/nearby', auth, async (req, res) => {
  try {
    const isPatient = req.user.role === 'patient';
    const isProvider = PROVIDER_ROLES.includes(req.user.role);
    if (!isPatient && !isProvider) {
      return res.status(403).json({ message: 'Only patients and providers can search nearby' });
    }

    const { role, lat, lng, maxDistance } = req.query;
    if (!lat || !lng) return res.status(400).json({ message: 'lat and lng are required' });
    if (!PROVIDER_ROLES.includes(role)) {
      return res.status(400).json({ message: 'role must be one of: ' + PROVIDER_ROLES.join(', ') });
    }

    const filter = {
      role,
      isVerified: true,
      isAvailable: true,
      isBanned: false,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseInt(maxDistance, 10) || 10000
        }
      }
    };
    // A provider searching for cover shouldn't see themselves in the results.
    if (isProvider) filter._id = { $ne: req.user._id };

    const providers = await User.find(filter).select('-password -verificationCodeHash');

    res.json({ providers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Search failed' });
  }
});

// ---------------- UPDATE MY PROFILE (Settings tab) ----------------
// Only touches name/email/phone/address — nothing else — so it can't
// interfere with location, availability, verification, or role logic.
router.put('/me', auth, async (req, res) => {
  try {
    const { fullName, email, phone, address } = req.body;
    if (!fullName || !email || !phone || !address) {
      return res.status(400).json({ message: 'Name, email, phone, and address are all required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail !== req.user.email) {
      const existing = await User.findOne({ email: normalizedEmail });
      if (existing) return res.status(409).json({ message: 'That email is already in use' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { fullName: fullName.trim(), email: normalizedEmail, phone: phone.trim(), address: address.trim() },
      { new: true }
    );
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not update profile' });
  }
});

// ---------------- CHANGE MY PASSWORD (Settings tab) ----------------
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const match = await bcrypt.compare(currentPassword, req.user.password);
    if (!match) return res.status(401).json({ message: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(req.user._id, { password: hashed });

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not update password' });
  }
});

module.exports = router;
