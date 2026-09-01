const mongoose = require('mongoose');

// Chat messages, scoped to one Request (visit or coverage arrangement).
// Only unlocked once that request has been accepted by both sides.
const messageSchema = new mongoose.Schema(
  {
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);
