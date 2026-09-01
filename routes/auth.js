const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendVerificationCode } = require('../utils/sendEmail');
const { PUBLIC_ROLES, PROVIDER_ROLES } = require('../utils/roles');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

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

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// ---------------- REGISTER ----------------
router.post('/register', async (req, res) => {
  try {
    const {
      role, fullName, email, password, phone, address,
      specialty, licenseNumber, yearsOfExperience, bio
    } = req.body;

    if (!role || !fullName || !email || !password || !phone || !address) {
      return res.status(400).json({ message: 'Please fill in all required fields, including address' });
    }
    // Admin accounts are never created through public registration.
    if (!PUBLIC_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (PROVIDER_ROLES.includes(role) && !licenseNumber) {
      return res.status(400).json({ message: 'License number is required for doctors, nurses, pharmacists, and lab technicians' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const code = generateCode();

    const user = await User.create({
      role,
      fullName,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone,
      address,
      specialty: specialty || '',
      licenseNumber: licenseNumber || '',
      yearsOfExperience: yearsOfExperience || 0,
      bio: bio || '',
      verificationCodeHash: hashCode(code),
      verificationCodeExpires: Date.now() + 15 * 60 * 1000 // 15 minutes
    });

    await sendVerificationCode(user.email, code);

    res.status(201).json({
      message: 'Registration successful. Enter the 6-digit code sent to your email to verify your account.',
      email: user.email
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// ---------------- VERIFY EMAIL WITH CODE ----------------
router.post('/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: 'Email and code are required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'No account found for that email' });
    if (user.isVerified) return res.status(400).json({ message: 'This account is already verified' });

    if (!user.verificationCodeHash || !user.verificationCodeExpires || user.verificationCodeExpires < Date.now()) {
      return res.status(400).json({ message: 'Code expired. Please request a new one.' });
    }
    if (hashCode(code) !== user.verificationCodeHash) {
      return res.status(400).json({ message: 'Incorrect code. Please try again.' });
    }

    user.isVerified = true;
    user.verificationCodeHash = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully! You can now log in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during verification' });
  }
});

// ---------------- RESEND CODE ----------------
router.post('/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'No account found for that email' });
    if (user.isVerified) return res.status(400).json({ message: 'This account is already verified' });

    const code = generateCode();
    user.verificationCodeHash = hashCode(code);
    user.verificationCodeExpires = Date.now() + 15 * 60 * 1000;
    await user.save();

    await sendVerificationCode(user.email, code);
    res.json({ message: 'A new code has been sent to your email.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not resend code' });
  }
});

// ---------------- LOGIN ----------------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    if (user.isBanned) {
      return res.status(403).json({ message: `Your account has been banned.${user.banReason ? ' Reason: ' + user.banReason : ''} Contact support.` });
    }
    if (!user.isVerified) {
      return res.status(403).json({ message: 'Please verify your email before logging in', email: user.email, needsVerification: true });
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

module.exports = router;
