// Creates (or resets) the first Admin account, using values from your .env file.
// Run with: npm run seed:admin
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

async function run() {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_NAME || 'System Admin';

  if (!email || !password) {
    console.error('❌ Please set ADMIN_EMAIL and ADMIN_PASSWORD in your .env file first.');
    process.exit(1);
  }

  await connectDB();

  let admin = await User.findOne({ email });
  const hashedPassword = await bcrypt.hash(password, 10);

  if (admin) {
    admin.password = hashedPassword;
    admin.role = 'admin';
    admin.isVerified = true;
    admin.isBanned = false;
    await admin.save();
    console.log(`✅ Existing admin updated: ${email}`);
  } else {
    admin = await User.create({
      role: 'admin',
      fullName,
      email,
      password: hashedPassword,
      phone: process.env.ADMIN_PHONE || 'N/A',
      address: process.env.ADMIN_ADDRESS || 'N/A',
      isVerified: true
    });
    console.log(`✅ Admin account created: ${email}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Failed to create admin:', err.message);
  process.exit(1);
});
