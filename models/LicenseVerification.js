const mongoose = require('mongoose');

const licenseVerificationSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  role: { type: String },
  fullName: { type: String },
  codeHash: { type: String, required: true },
  expiresAt: { type: Number, required: true },
  verifiedAt: { type: Date },
  consumed: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('LicenseVerification', licenseVerificationSchema);