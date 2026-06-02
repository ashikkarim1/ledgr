import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { full_name, email, password, workspace_name, country, timestamp } = req.body;

    // Validate required fields
    if (!full_name || !email || !password || !workspace_name) {
      return res.status(400).json({ 
        error: 'Missing required fields: full_name, email, password, workspace_name' 
      });
    }

    // Validate password length
    if (password.length < 12) {
      return res.status(400).json({ 
        error: 'Password must be at least 12 characters' 
      });
    }

    // Send admin notification email
    const adminResponse = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: 'ceo@theupcapital.com',
      replyTo: email,
      subject: 'New Ledgr Waitlist Sign-up',
      html: `
        <h2>New Waitlist Sign-up</h2>
        <p><strong>Name:</strong> ${full_name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Workspace:</strong> ${workspace_name}</p>
        <p><strong>Country:</strong> ${country || 'Not specified'}</p>
        <p><strong>Signed up:</strong> ${timestamp || new Date().toISOString()}</p>
      `
    });

    // Send confirmation email to user
    const userResponse = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: email,
      replyTo: process.env.RESEND_REPLY_TO || 'ceo@theupcapital.com',
      subject: 'Your Ledgr Account is Ready',
      html: `
        <h2>Welcome to Ledgr, ${full_name}!</h2>
        <p>Your account for <strong>${workspace_name}</strong> has been created successfully.</p>
        <p>Our team will reach out within one working day to schedule your onboarding call.</p>
        <p>Keep an eye on your inbox (including the spam folder, just in case) for our message.</p>
        <p>In the meantime, you can log in to your account and explore the platform.</p>
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
    console.error('Waitlist signup error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
