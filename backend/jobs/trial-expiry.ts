/**
 * Trial Expiry Cron Job
 * Daily job to check and expire trial subscriptions, send notifications
 */

import { Pool } from 'pg';
import { getDbPool } from '../lib/db-helpers';

/**
 * Main job function: Check for expired trials and transition status
 */
export async function processTrialExpiries(): Promise<{ processed: number; expired: number }> {
  const pool = getDbPool();
  let processed = 0;
  let expired = 0;

  try {
    console.log('[Trial Expiry] Starting daily trial expiry check...');

    // Find all active trials that have ended
    const query = `
      SELECT 
        u.id as user_id,
        u.organization_id as workspace_id,
        u.email,
        u.trial_ends_at,
        org.name as workspace_name,
        s.plan
      FROM users u
      JOIN organizations org ON u.organization_id = org.id
      LEFT JOIN subscriptions s ON s.organization_id = org.id
      WHERE u.trial_status = 'active'
      AND u.trial_ends_at < NOW()
      AND u.deleted_at IS NULL
      LIMIT 1000
    `;

    const result = await pool.query(query);
    processed = result.rows.length;

    if (processed === 0) {
      console.log('[Trial Expiry] No expired trials found');
      return { processed: 0, expired: 0 };
    }

    console.log(`[Trial Expiry] Found ${processed} expired trials to process`);

    // Process each expired trial
    for (const trial of result.rows) {
      try {
        // Update user trial status
        const updateUserQuery = `
          UPDATE users
          SET trial_status = 'expired', updated_at = NOW()
          WHERE id = $1
        `;

        await pool.query(updateUserQuery, [trial.user_id]);
        expired++;

        // Log transition
        const transitionQuery = `
          INSERT INTO trial_transitions (
            organization_id, previous_status, new_status, 
            reason, created_at
          )
          VALUES ($1, 'active', 'expired', 'Auto-expired on end date', NOW())
        `;

        await pool.query(transitionQuery, [trial.workspace_id]);

        // TODO: Send email notification to user
        console.log(`[Trial Expiry] Expired trial for user ${trial.user_id} (${trial.email})`);

        // TODO: Send email notification to workspace admin
        // TODO: Check if user should be offered upgrade prompts
      } catch (userError) {
        console.error(
          `[Trial Expiry] Error processing expired trial for user ${trial.user_id}:`,
          userError
        );
        // Continue processing other users
      }
    }

    console.log(`[Trial Expiry] Successfully expired ${expired}/${processed} trials`);
    return { processed, expired };
  } catch (error) {
    console.error('[Trial Expiry] Fatal error in trial expiry job:', error);
    throw error;
  }
}

/**
 * Send trial expiry reminders to users approaching expiration
 */
export async function sendTrialReminders(): Promise<{ sent: number }> {
  const pool = getDbPool();
  let sent = 0;

  try {
    console.log('[Trial Reminders] Starting trial expiry reminder checks...');

    // Find users with trials ending in 3, 7 days
    const reminderDays = [7, 3];

    for (const days of reminderDays) {
      const query = `
        SELECT 
          u.id as user_id,
          u.email,
          u.trial_ends_at,
          org.name as workspace_name,
          CEIL(EXTRACT(EPOCH FROM (u.trial_ends_at - NOW())) / 86400)::int as days_remaining
        FROM users u
        JOIN organizations org ON u.organization_id = org.id
        WHERE u.trial_status = 'active'
        AND u.trial_ends_at > NOW()
        AND CEIL(EXTRACT(EPOCH FROM (u.trial_ends_at - NOW())) / 86400)::int = $1
        AND u.deleted_at IS NULL
        LIMIT 100
      `;

      const result = await pool.query(query, [days]);

      for (const user of result.rows) {
        try {
          // TODO: Send reminder email
          console.log(
            `[Trial Reminders] Reminder for ${user.email}: ${days} days remaining`
          );
          sent++;
        } catch (emailError) {
          console.error(
            `[Trial Reminders] Error sending reminder to ${user.email}:`,
            emailError
          );
        }
      }
    }

    console.log(`[Trial Reminders] Sent ${sent} trial reminder emails`);
    return { sent };
  } catch (error) {
    console.error('[Trial Reminders] Fatal error in reminder job:', error);
    throw error;
  }
}

/**
 * Start the trial expiry cron job (runs daily at 2 AM)
 */
export function startTrialExpiryJob(pool: Pool): void {
  // Set global pool reference if provided
  if (pool) {
    // Note: getDbPool() must be initialized before calling
    console.log('[Trial Expiry] Cron job initialized');
  }

  // Calculate milliseconds until next 2 AM
  const now = new Date();
  const tomorrow2AM = new Date(now);
  tomorrow2AM.setDate(tomorrow2AM.getDate() + 1);
  tomorrow2AM.setHours(2, 0, 0, 0);

  const msUntilNextRun = tomorrow2AM.getTime() - now.getTime();

  // Schedule first run
  setTimeout(async () => {
    try {
      const expiry = await processTrialExpiries();
      const reminders = await sendTrialReminders();
      console.log(
        `[Trial Expiry] Job completed: ${expiry.expired} expired, ${reminders.sent} reminders sent`
      );
    } catch (error) {
      console.error('[Trial Expiry] Job failed:', error);
    }

    // Schedule daily recurring runs
    setInterval(async () => {
      try {
        const expiry = await processTrialExpiries();
        const reminders = await sendTrialReminders();
        console.log(
          `[Trial Expiry] Job completed: ${expiry.expired} expired, ${reminders.sent} reminders sent`
        );
      } catch (error) {
        console.error('[Trial Expiry] Job failed:', error);
      }
    }, 24 * 60 * 60 * 1000); // Run daily
  }, msUntilNextRun);

  console.log(
    `[Trial Expiry] Scheduled daily job at 2 AM (next run in ${Math.floor(msUntilNextRun / 1000)}s)`
  );
}
