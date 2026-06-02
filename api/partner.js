import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, company, phone, number_of_accountants, location, role, team_size, jurisdiction, timestamp } = req.body;

    // Validate required fields
    if (!name || !email || !company || !phone) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, email, company, phone' 
      });
    }

    // Send admin notification email
    const adminResponse = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: 'ceo@theupcapital.com',
      replyTo: email,
      subject: 'New Ledgr Partner Application',
      html: `
        <h2>New Partner Application</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Company:</strong> ${company}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Number of Accountants:</strong> ${number_of_accountants || 'N/A'}</p>
        <p><strong>Office Location:</strong> ${location || 'N/A'}</p>
        <p><strong>FTA Agent Number:</strong> ${role || 'N/A'}</p>
        <p><strong>Active Client Books:</strong> ${team_size || 'N/A'}</p>
        <p><strong>Interested In:</strong> ${jurisdiction || 'N/A'}</p>
        <p><strong>Submitted:</strong> ${timestamp || new Date().toISOString()}</p>
      `
    });

    // Send confirmation email to applicant
    const userResponse = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: email,
      replyTo: process.env.RESEND_REPLY_TO || 'ceo@theupcapital.com',
      subject: 'Your Ledgr Partner Application Received',
      html: `
        <h2>Thank you for applying to be a Ledgr Partner</h2>
        <p>Hi ${name},</p>
        <p>We received your partner application for <strong>${company}</strong>.</p>
        <p>Our team will review your application and reach out within one working day with next steps.</p>
        <p>Keep an eye on your inbox (including spam folder) for our response.</p>
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
      message: 'Application received. Check your email for confirmation.' 
    });
  } catch (error) {
    console.error('Partner form error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
