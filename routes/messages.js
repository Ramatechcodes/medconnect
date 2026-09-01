const express = require('express');
const Message = require('../models/Message');
const Request = require('../models/Request');
const auth = require('../middleware/auth');

const router = express.Router();

function withIO(req) {
  const io = req.app.get('io');
  return {
    emitToUser: (userId, event, payload) => io.to(`user:${userId}`).emit(event, payload)
  };
}

// Confirms the logged-in user is one of the two people on this request,
// and that the request has been accepted — chat only unlocks once both
// sides have matched (patient/provider accepted, or provider/provider
// coverage accepted).
async function loadAuthorizedRequest(req, res) {
  const request = await Request.findById(req.params.requestId);
  if (!request) {
    res.status(404).json({ message: 'Request not found' });
    return null;
  }
  const isParticipant =
    String(request.patient) === String(req.user._id) ||
    String(request.provider) === String(req.user._id);
  if (!isParticipant) {
    res.status(403).json({ message: 'Not your conversation' });
    return null;
  }
  if (request.status !== 'accepted' && request.status !== 'completed') {
    res.status(403).json({ message: 'Chat unlocks once the request has been accepted' });
    return null;
  }
  return request;
}

// ---------------- GET message history for a request ----------------
router.get('/:requestId', auth, async (req, res) => {
  try {
    const request = await loadAuthorizedRequest(req, res);
    if (!request) return;

    const messages = await Message.find({ request: request._id })
      .sort('createdAt')
      .limit(500);

    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load messages' });
  }
});

// ---------------- SEND a message ----------------
router.post('/:requestId', auth, async (req, res) => {
  try {
    if (req.user.isBanned) return res.status(403).json({ message: 'Your account has been banned' });

    const request = await loadAuthorizedRequest(req, res);
    if (!request) return;

    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Message text is required' });

    const message = await Message.create({
      request: request._id,
      sender: req.user._id,
      text
    });

    // Notify the other participant in real time.
    const otherUserId =
      String(request.patient) === String(req.user._id) ? request.provider : request.patient;
    withIO(req).emitToUser(otherUserId, 'chat:message', message);

    res.status(201).json({ message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not send message' });
  }
});

module.exports = router;
