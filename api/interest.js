import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, company, phone, plan, timestamp } = req.body;

    // Validate required fields
    if (!name || !email || !plan) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, email, plan' 
      });
    }

    // Send admin notification email
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@ledgr.ae',
      to: process.env.RESEND_REPLY_TO || 'ceo@theupcapital.com',
      subject: `New Interest Form Submission from ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>New Interest Form Submission</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Company:</strong> ${company || 'Not provided'}</p>
          <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
          <p><strong>Plan:</strong> ${plan}</p>
          <p><strong>Submitted:</strong> ${new Date(timestamp).toLocaleString()}</p>
          <hr style="margin-top: 30px; border: none; border-top: 1px solid #ddd;">
          <p style="color: #666; font-size: 12px;">This is an automated message from Ledgr interest form.</p>
        </div>
      `
    });

    // Send confirmation email to user
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@ledgr.ae',
      to: email,
      subject: 'We\'ve Received Your Interest - Ledgr',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Thanks for Your Interest!</h2>
          <p>Hi ${name},</p>
          <p>We've received your interest in the <strong>${plan} plan</strong> and will be in touch very soon.</p>
          <p>Our team will review your request and reach out to discuss how Ledgr can help streamline your accounting processes.</p>
          <p style="margin-top: 30px;">Best regards,<br>The Ledgr Team</p>
          <hr style="margin-top: 40px; border: none; border-top: 1px solid #ddd;">
          <p style="color: #666; font-size: 12px;">If you have any questions, feel free to reply to this email.</p>
        </div>
      `
    });

    return res.status(200).json({ 
      success: true, 
      data: { name, email, plan }
    });

  } catch (error) {
    console.error('Interest submission error:', error);
    return res.status(500).json({ 
      error: 'Failed to process interest submission',
      message: error.message 
    });
  }
}
