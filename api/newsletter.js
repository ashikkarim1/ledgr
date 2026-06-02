import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, timestamp } = req.body;

    // Validate required fields
    if (!email) {
      return res.status(400).json({ 
        error: 'Missing required field: email' 
      });
    }

    // Send admin notification email
    const adminResponse = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: 'ceo@theupcapital.com',
      replyTo: email,
      subject: 'New Ledgr Resources Digest Subscriber',
      html: `
        <h2>New Newsletter Subscriber</h2>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subscribed:</strong> ${timestamp || new Date().toISOString()}</p>
      `
    });

    // Send confirmation to subscriber
    const userResponse = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: email,
      replyTo: process.env.RESEND_REPLY_TO || 'ceo@theupcapital.com',
      subject: 'Welcome to the Ledgr Resources Digest',
      html: `
        <h2>Welcome to the Ledgr Resources Digest</h2>
        <p>Hi,</p>
        <p>Thank you for subscribing to our monthly digest of FTA changes.</p>
        <p>You'll receive one email per month (first Tuesday) with:</p>
        <ul>
          <li>New guides and resources</li>
          <li>FTA rule changes</li>
          <li>Compliance deadlines that matter</li>
        </ul>
        <p>We respect your inbox and only send what's essential.</p>
        <p>Best regards,<br/>The Ledgr Team</p>
      `
    });

    if (adminResponse.error || userResponse.error) {
      return res.status(500).json({ 
        error: 'Failed to send confirmation email',
        details: adminResponse.error || userResponse.error
      });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Subscription confirmed. Check your email.' 
    });
  } catch (error) {
    console.error('Newsletter subscription error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
