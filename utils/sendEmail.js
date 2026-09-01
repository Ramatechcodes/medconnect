// Uses Brevo's transactional email HTTP API (not SMTP) — this avoids the
// ETIMEDOUT errors you were getting, since outbound SMTP ports are often
// blocked on hosts like Render, but HTTPS is not.

function hasBrevoConfigured() {
  return !!process.env.BREVO_API_KEY;
}

// Sends a 6-digit verification CODE (not a link) that the user types in
// on the verify page. If no Brevo API key is configured, the code is
// simply logged to the console so you can test the full flow locally.
async function sendVerificationCode(to, code) {
  if (!hasBrevoConfigured()) {
    console.log('\n====== EMAIL NOT CONFIGURED — showing code instead ======');
    console.log(`To: ${to}`);
    console.log(`Your QuickMed verification code: ${code}`);
    console.log('===========================================================\n');
    return;
  }

  const senderEmail = process.env.EMAIL_FROM || 'no-reply@medconnect.local';
  const senderName = process.env.EMAIL_FROM_NAME || 'QuickMed';

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'api-key': process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject: 'Your QuickMed verification code',
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#2563eb">Welcome to QuickMed 👋</h2>
          <p>Enter this code to verify your email address:</p>
          <p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#2563eb;
          margin:24px 0">${code}</p>
          <p style="color:#888;font-size:12px">This code expires in 15 minutes.</p>
        </div>
      `
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Brevo send failed:', res.status, errText);
    throw new Error('Failed to send verification email');
  }
}

module.exports = { sendVerificationCode };