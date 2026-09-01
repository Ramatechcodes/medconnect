const nodemailer = require('nodemailer');

function hasSmtpConfigured() {
  return process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

// Sends a 6-digit verification CODE (not a link) that the user types in
// on the verify page. If no SMTP credentials are configured, the code is
// simply logged to the console so you can test the full flow locally.
async function sendVerificationCode(to, code) {
  if (!hasSmtpConfigured()) {
    console.log('\n====== EMAIL NOT CONFIGURED — showing code instead ======');
    console.log(`To: ${to}`);
    console.log(`Your QuickMed verification code: ${code}`);
    console.log('===========================================================\n');
    return;
  }

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM || 'QuickMed <no-reply@medconnect.local>',
    to,
    subject: 'Your QuickMed verification code',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#2563eb">Welcome to QuickMed 👋</h2>
        <p>Enter this code to verify your email address:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#2563eb;
        margin:24px 0">${code}</p>
        <p style="color:#888;font-size:12px">This code expires in 15 minutes.</p>
      </div>
    `
  });
}

module.exports = { sendVerificationCode };
