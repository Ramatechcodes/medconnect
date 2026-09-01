const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['patient', 'doctor', 'nurse', 'pharmacist', 'labtech', 'admin'],
      required: true
    },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true, trim: true },

    // Doctor / Nurse only
    specialty: { type: String, default: '' },
    licenseNumber: { type: String, default: '' },
    yearsOfExperience: { type: Number, default: 0 },
    bio: { type: String, default: '' },
    isAvailable: { type: Boolean, default: false },

    // Email verification (6-digit code)
    isVerified: { type: Boolean, default: false },
    verificationCodeHash: { type: String },
    verificationCodeExpires: { type: Date },
isLicenseVerified: { type: Boolean, default: false },
licenseVerifiedAt: { type: Date },
    // Admin moderation
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: '' },
    isRestricted: { type: Boolean, default: false },
    restrictReason: { type: String, default: '' },

    // Live location — GeoJSON Point [lng, lat]
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }
    },
    lastLocationUpdate: { type: Date }
  },
  { timestamps: true }
);

userSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('User', userSchema);
