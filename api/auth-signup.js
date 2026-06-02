import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { full_name, email, workspace_name, country, role, team_size } = req.body;

    // Validate required fields
    if (!full_name || !email || !workspace_name) {
      return res.status(400).json({ 
        error: 'Missing required fields: full_name, email, workspace_name' 
      });
    }

    // Send admin notification email
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: 'ceo@theupcapital.com',
      replyTo: email,
      subject: 'New Ledgr Interest Sign-up',
      html: `
        <h2>New Interest Sign-up</h2>
        <p><strong>Name:</strong> ${full_name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Workspace:</strong> ${workspace_name}</p>
        <p><strong>Country:</strong> ${country || 'Not specified'}</p>
        <p><strong>Role:</strong> ${role || 'Not specified'}</p>
        <p><strong>Team Size:</strong> ${team_size || 'Not specified'}</p>
        <p><strong>Signed up:</strong> ${new Date().toISOString()}</p>
      `
    }).catch(err => console.error('Admin email failed:', err));

    // Send welcome email to user (early community interest signup)
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: email,
      replyTo: process.env.RESEND_REPLY_TO || 'ceo@theupcapital.com',
      subject: 'Welcome to Ledgr Accounting Technologies',
      html: `
        <h2>Welcome to Ledgr Accounting Technologies 🚀</h2>
        <p>Thank you for signing up and joining the future of intelligent accounting and finance.</p>
        <p>We're excited to officially welcome you to <strong>Ledgr Accounting Technologies</strong> — a next-generation platform designed to transform how businesses manage accounting, finance operations, reporting, and growth.</p>
        <p>You are now part of an exclusive early community of forward-thinking companies preparing to experience a smarter, faster, and more powerful way to run finance.</p>
        <h3>What happens next?</h3>
        <p>Our platform is currently in final preparation, and we're working hard behind the scenes to deliver an exceptional experience.</p>
        <p>As soon as Ledgr is ready, you will receive a personal invitation with priority access to activate your account and begin benefiting from everything the platform has to offer.</p>
        <h3>You'll be among the first to experience:</h3>
        <ul>
          <li>✓ Intelligent accounting automation</li>
          <li>✓ Real-time financial visibility and reporting</li>
          <li>✓ Streamlined workflows designed for growing businesses</li>
          <li>✓ A modern finance experience built for ambitious companies</li>
        </ul>
        <p>We're building something special — and we're excited to have you with us from the beginning.</p>
        <p><strong>Stay tuned. Your personal invitation is coming soon.</strong></p>
        <p>Welcome to the future of finance.</p>
        <p>Warm regards,<br/>The Ledgr Team<br/><strong>Ledgr Accounting Technologies</strong></p>
      `
    }).catch(err => console.error('User email failed:', err));

    // Return confirmation
    res.status(200).json({
      success: true,
      message: 'Interest signup received successfully'
    });
  } catch (error) {
    console.error('Auth signup error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
