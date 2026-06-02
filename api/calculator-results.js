import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, answers, score, timestamp } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, email' 
      });
    }

    // Send admin notification email
    const adminResponse = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: 'ceo@theupcapital.com',
      replyTo: email,
      subject: 'New FTA Readiness Report Request',
      html: `
        <h2>New Readiness Report Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Score:</strong> ${score || 'N/A'}</p>
        <p><strong>Answers:</strong> ${answers ? JSON.stringify(JSON.parse(answers), null, 2) : 'N/A'}</p>
        <p><strong>Submitted:</strong> ${timestamp || new Date().toISOString()}</p>
      `
    });

    // Send confirmation and report to user
    const userResponse = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: email,
      replyTo: process.env.RESEND_REPLY_TO || 'ceo@theupcapital.com',
      subject: 'Your FTA Readiness Report',
      html: `
        <h2>Your FTA Readiness Report</h2>
        <p>Hi ${name},</p>
        <p>Thank you for completing the FTA readiness check!</p>
        <p>Your readiness score: <strong>${score}/100</strong></p>
        <p>We're preparing your personalized PDF report with:</p>
        <ul>
          <li>Step-by-step action plan</li>
          <li>Indicative penalty exposure for each gap</li>
          <li>Introduction to a UAE-licensed chartered accountant</li>
        </ul>
        <p>Your report will be emailed to you shortly.</p>
        <p>Best regards,<br/>The Ledgr Team</p>
      `
    });

    if (adminResponse.error || userResponse.error) {
      return res.status(500).json({ 
        error: 'Failed to send emails',
        details: adminResponse.error || userResponse.error
      });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Report request received. Check your email for your readiness report.' 
    });
  } catch (error) {
    console.error('Calculator results error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
