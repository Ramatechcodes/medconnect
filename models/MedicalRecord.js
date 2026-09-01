const mongoose = require('mongoose');

// A single documentation entry created by a provider for a patient —
// diagnosis, prescribed drugs, lab tests ordered/results, and a general
// report. Multiple entries accumulate over time into that patient's
// history, visible to any provider currently matched with them so they
// know what's already been done and what to do next.
const medicalRecordSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' }, // the visit this was written during
    diagnosis: { type: String, default: '', trim: true },
    // Free-text lines, e.g. "Amoxicillin 500mg — 3x daily for 7 days"
    prescriptions: [{ type: String, trim: true }],
    // Free-text lines, e.g. "Full Blood Count", "Malaria Parasite Test — positive"
    labTests: [{ type: String, trim: true }],
    report: { type: String, default: '', trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('MedicalRecord', medicalRecordSchema);
