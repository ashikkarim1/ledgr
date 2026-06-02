import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { company_name, email, password, timestamp } = req.body;

    // Validate required fields
    if (!company_name || !email || !password) {
      return res.status(400).json({ 
        error: 'Missing required fields: company_name, email, password' 
      });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters' 
      });
    }

    // Send admin notification email
    const adminResponse = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: 'ceo@theupcapital.com',
      replyTo: email,
      subject: 'New Ledgr Account Sign-up',
      html: `
        <h2>New Account Sign-up</h2>
        <p><strong>Company Name:</strong> ${company_name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Signed up:</strong> ${timestamp || new Date().toISOString()}</p>
      `
    });

    // Send welcome email to new user
    const userResponse = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: email,
      replyTo: process.env.RESEND_REPLY_TO || 'ceo@theupcapital.com',
      subject: `Welcome to Ledgr, ${company_name}!`,
      html: `
        <h2>Welcome to Ledgr</h2>
        <p>Your account has been created successfully!</p>
        <p>Here's what you get with your Ledgr account:</p>
        <ul>
          <li>✓ 30-day money-back guarantee</li>
          <li>✓ No credit card required to start</li>
          <li>✓ Unlimited transactions in first 30 days</li>
          <li>✓ Free onboarding assistance</li>
        </ul>
        <p>Our onboarding team will reach out within one working day to schedule your setup call.</p>
        <p>Keep an eye on your inbox (including spam folder) for our message.</p>
        <p>Best regards,<br/>The Ledgr Team</p>
      `
    });

    if (adminResponse.error || userResponse.error) {
      return res.status(500).json({ 
        error: 'Failed to send confirmation emails',
        details: adminResponse.error || userResponse.error
      });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Account created. Confirmation email sent.' 
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
