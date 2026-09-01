const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Request = require('../models/Request');

module.exports = function registerSocket(io) {
  io.on('connection', (socket) => {
    let currentUserId = null;

    // Client sends its JWT right after connecting to join a private room
    socket.on('identify', (token) => {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        currentUserId = decoded.id;
        socket.join(`user:${currentUserId}`);
        // Admins also join a shared room so they can watch every live trip
        // update in real time on the admin dashboard.
        if (decoded.role === 'admin') socket.join('admins');
        socket.emit('identified', { userId: currentUserId });
      } catch (err) {
        socket.emit('error', { message: 'Invalid token' });
      }
    });

    // Doctor/Nurse broadcasts a live GPS position while "on the way"
    // Server relays it to any patient who currently has an accepted trip
    // with this provider, and to every connected admin — this is the
    // "Uber-style" moving marker + live tracking bar.
    socket.on('provider:location', async ({ lat, lng }) => {
      if (!currentUserId || lat === undefined || lng === undefined) return;

      try {
        await User.findByIdAndUpdate(currentUserId, {
          location: { type: 'Point', coordinates: [lng, lat] },
          lastLocationUpdate: new Date()
        });

        const activeTrip = await Request.findOne({
          provider: currentUserId,
          status: 'accepted'
        });

        if (activeTrip) {
          io.to(`user:${activeTrip.patient}`).emit('provider:location', {
            requestId: activeTrip._id,
            providerId: currentUserId,
            lat,
            lng
          });
        }

        // Admins see every provider's movement, not just active trips —
        // useful for the live map tab.
        io.to('admins').emit('provider:location', {
          requestId: activeTrip ? activeTrip._id : null,
          providerId: currentUserId,
          lat,
          lng
        });
      } catch (err) {
        console.error('Socket location update failed:', err.message);
      }
    });

    socket.on('disconnect', () => {
      // no-op — user's last known location stays in the DB
    });
  });
};
