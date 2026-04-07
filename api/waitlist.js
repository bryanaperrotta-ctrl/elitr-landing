export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Elitr <hello@elitr.ai>',
        to: email,
        subject: "You're on the list.",
        html: `
          <div style="background:#f7f5f1;padding:48px 24px;font-family:'Georgia',serif;">
            <div style="max-width:480px;margin:0 auto;">
              <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#b89a5a;margin-bottom:24px;">Elitr · Travel Intelligence</p>
              <h1 style="font-size:36px;font-weight:400;color:#0e0f11;line-height:1.1;margin-bottom:20px;">
                You're on the list.
              </h1>
              <p style="font-size:16px;color:#3a3c42;line-height:1.75;font-weight:300;margin-bottom:16px;">
                Sol is almost ready. We'll be in touch when your spot opens — and when we reach out, it'll be worth the wait.
              </p>
              <p style="font-size:16px;color:#3a3c42;line-height:1.75;font-weight:300;margin-bottom:40px;">
                In the meantime, take a look at what we're building at <a href="https://elitr.ai" style="color:#b89a5a;text-decoration:none;">elitr.ai</a>.
              </p>
              <div style="border-top:1px solid rgba(14,15,17,0.1);padding-top:24px;">
                <p style="font-size:13px;color:#6e7180;margin:0;">Bryan Perrotta</p>
                <p style="font-size:13px;color:#6e7180;margin:4px 0 0;">Founder, Elitr · <a href="https://elitr.ai" style="color:#b89a5a;text-decoration:none;">elitr.ai</a></p>
              </div>
            </div>
          </div>
        `
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Resend error:', error);
      return res.status(500).json({ error: 'Failed to send confirmation' });
    }

    // Forward to bryan
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Elitr Waitlist <hello@elitr.ai>',
        to: 'bryan@elitr.ai',
        subject: `New waitlist signup: ${email}`,
        html: `<p style="font-family:sans-serif;font-size:15px;color:#333;">New early access signup:<br/><strong>${email}</strong></p>`
      })
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
