import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { full_name, email, password, workspace_name, country, role, team_size } = req.body;

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

    // Create mock auth response with tokens
    const userId = `user_${Date.now()}`;
    const workspaceId = `ws_${Date.now()}`;
    const accessToken = `token_${Buffer.from(email).toString('base64')}`;
    const refreshToken = `refresh_${Buffer.from(email).toString('base64')}`;

    // Send admin notification email
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: 'ceo@theupcapital.com',
      replyTo: email,
      subject: 'New Ledgr Account Sign-up',
      html: `
        <h2>New Account Sign-up</h2>
        <p><strong>Name:</strong> ${full_name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Workspace:</strong> ${workspace_name}</p>
        <p><strong>Country:</strong> ${country || 'Not specified'}</p>
        <p><strong>Role:</strong> ${role || 'Not specified'}</p>
        <p><strong>Team Size:</strong> ${team_size || 'Not specified'}</p>
        <p><strong>Signed up:</strong> ${new Date().toISOString()}</p>
      `
    }).catch(err => console.error('Admin email failed:', err));

    // Send confirmation email to user
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: email,
      replyTo: process.env.RESEND_REPLY_TO || 'ceo@theupcapital.com',
      subject: `Welcome to Ledgr, ${full_name}!`,
      html: `
        <h2>Welcome to Ledgr!</h2>
        <p>Your account for <strong>${workspace_name}</strong> has been created successfully.</p>
        <p>You can now log in to your account and start exploring the platform.</p>
        <p>Our team will reach out within one working day to schedule your personalized onboarding call.</p>
        <p>In the meantime, here's what you get:</p>
        <ul>
          <li>30-day free trial with full access</li>
          <li>Unlimited transactions during trial</li>
          <li>Free onboarding assistance</li>
          <li>Direct access to the product team</li>
        </ul>
        <p>Questions? Reply to this email or contact us at support@ledgr.ai</p>
        <p>Best regards,<br/>The Ledgr Team</p>
      `
    }).catch(err => console.error('User email failed:', err));

    // Return mock auth response
    res.status(200).json({
      success: true,
      data: {
        user_id: userId,
        workspace_id: workspaceId,
        access_token: accessToken,
        refresh_token: refreshToken,
        email: email,
        workspace_name: workspace_name
      },
      message: 'Account created successfully'
    });
  } catch (error) {
    console.error('Auth signup error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
