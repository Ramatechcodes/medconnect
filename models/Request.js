const mongoose = require('mongoose');

// A "trip" — a patient requesting a nearby doctor/nurse, Uber-style
const requestSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'completed', 'cancelled'],
      default: 'pending'
    },
    // 'care' = a patient requesting a doctor/nurse/pharmacist/lab tech.
    // 'coverage' = one provider asking another nearby provider to cover
    // for them (e.g. a doctor requesting another doctor while off duty).
    // The `patient` field doubles as "the requester" in both cases.
    requestType: { type: String, enum: ['care', 'coverage'], default: 'care' },
    reason: { type: String, default: '' },
    patientLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }
    },
    // Distance between provider and patient at the moment the request was
    // accepted — used as the 100%-away baseline for the live tracking bar.
    initialDistanceKm: { type: Number, default: null },
    startedAt: { type: Date },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Request', requestSchema);
