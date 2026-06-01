/**
 * QuickBooks Database Operations
 * Helper functions for storing and retrieving QB integration data
 */

import { getDbPool } from '../lib/db-helpers';

/**
 * User workspace access verification
 * Returns true if user can access the workspace
 * Checks workspace_members first, falls back to users table
 */
export async function userHasWorkspaceAccess(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  try {
    const pool = getDbPool();
    // First try workspace_members table
    let result = await pool.query(
      `SELECT 1 FROM workspace_members
       WHERE user_id = $1 AND workspace_id = $2 AND status = 'active'
       LIMIT 1`,
      [userId, workspaceId]
    );
    
    if (result.rows.length > 0) {
      return true;
    }
    
    // Fallback to users table (for users created during signup)
    result = await pool.query(
      `SELECT 1 FROM users
       WHERE id = $1 AND organization_id = $2 AND status = 'active'
       LIMIT 1`,
      [userId, workspaceId]
    );
    
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking workspace access:', error);
    return false;
  }
}

/**
 * Get user workspace role
 * Returns role name or null if not found
 * Checks workspace_members first, falls back to users table
 */
export async function getUserWorkspaceRole(
  userId: string,
  workspaceId: string
): Promise<string | null> {
  try {
    const pool = getDbPool();
    // First try workspace_members table
    let result = await pool.query(
      `SELECT role FROM workspace_members
       WHERE user_id = $1 AND workspace_id = $2 AND status = 'active'
       LIMIT 1`,
      [userId, workspaceId]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0]?.role || null;
    }
    
    // Fallback to users table (for users created during signup)
    result = await pool.query(
      `SELECT role FROM users
       WHERE id = $1 AND organization_id = $2 AND status = 'active'
       LIMIT 1`,
      [userId, workspaceId]
    );
    
    return result.rows[0]?.role || null;
  } catch (error) {
    console.error('Error getting user workspace role:', error);
    return null;
  }
}

/**
 * Get workspace QB integration
 * Returns existing QB integration if connected
 */
export async function getWorkspaceIntegration(
  workspaceId: string,
  integrationType: string
): Promise<any | null> {
  try {
    const pool = getDbPool();
    const result = await pool.query(
      `SELECT id, type, status, config, created_at, updated_at
       FROM integrations
       WHERE organization_id = $1 AND type = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [workspaceId, integrationType]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting workspace integration:', error);
    return null;
  }
}

/**
 * Save QB integration config
 * Stores or updates QB integration settings
 */
export async function saveIntegrationConfig(
  workspaceId: string,
  integrationId: string,
  config: any
): Promise<void> {
  try {
    const pool = getDbPool();
    await pool.query(
      `INSERT INTO integrations (organization_id, id, type, status, config, created_at, updated_at)
       VALUES ($1, $2, 'quickbooks', 'connected', $3, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         config = $3,
         status = 'connected',
         updated_at = NOW()`,
      [workspaceId, integrationId, JSON.stringify(config)]
    );
  } catch (error) {
    console.error('Error saving integration config:', error);
    throw new Error('Failed to save integration configuration');
  }
}

/**
 * Delete QB integration config
 */
export async function deleteIntegrationConfig(
  integrationId: string
): Promise<void> {
  try {
    const pool = getDbPool();
    await pool.query(
      `DELETE FROM integrations WHERE id = $1`,
      [integrationId]
    );
  } catch (error) {
    console.error('Error deleting integration config:', error);
    throw new Error('Failed to delete integration configuration');
  }
}

/**
 * Get QB sync job status
 */
export async function getSyncJobStatus(
  jobId: string
): Promise<any | null> {
  try {
    const pool = getDbPool();
    const result = await pool.query(
      `SELECT *
       FROM sync_jobs
       WHERE id = $1
       LIMIT 1`,
      [jobId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting sync job status:', error);
    return null;
  }
}

/**
 * Store QB account with external ID tracking
 */
export async function storeQBAccount(
  workspaceId: string,
  accountData: any
): Promise<string> {
  try {
    const pool = getDbPool();
    const result = await pool.query(
      `INSERT INTO chart_of_accounts 
       (organization_id, account_number, account_name, account_type, 
        qb_account_id, qb_account_type, qb_sync_status, qb_last_synced)
       VALUES ($1, $2, $3, $4, $5, $6, 'synced', NOW())
       ON CONFLICT (organization_id, account_number) DO UPDATE SET
         qb_account_id = $5,
         qb_account_type = $6,
         qb_sync_status = 'synced',
         qb_last_synced = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [
        workspaceId,
        accountData.accountNumber,
        accountData.name,
        accountData.mappedType,
        accountData.id,
        accountData.type
      ]
    );
    return result.rows[0]?.id || 'account-id';
  } catch (error) {
    console.error('Error storing QB account:', error);
    throw error;
  }
}

/**
 * Store QB invoice with external ID tracking
 */
export async function storeQBInvoice(
  workspaceId: string,
  invoiceData: any
): Promise<string> {
  try {
    const pool = getDbPool();
    const result = await pool.query(
      `INSERT INTO vat_invoices
       (organization_id, invoice_number, invoice_date, due_date, 
        customer_id, customer_name, amount, currency_code,
        qb_invoice_id, qb_customer_id, qb_sync_status, qb_last_synced)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'synced', NOW())
       ON CONFLICT (organization_id, invoice_number) DO UPDATE SET
         qb_invoice_id = $9,
         qb_customer_id = $10,
         qb_sync_status = 'synced',
         qb_last_synced = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [
        workspaceId,
        invoiceData.docNumber,
        invoiceData.txnDate,
        invoiceData.dueDate,
        invoiceData.customerId,
        invoiceData.customerName,
        invoiceData.totalAmt,
        invoiceData.currencyRef?.value || 'AED',
        invoiceData.id,
        invoiceData.customerId
      ]
    );
    return result.rows[0]?.id || 'invoice-id';
  } catch (error) {
    console.error('Error storing QB invoice:', error);
    throw error;
  }
}

/**
 * Store QB bill with external ID tracking
 */
export async function storeQBBill(
  workspaceId: string,
  billData: any
): Promise<string> {
  try {
    const pool = getDbPool();
    const result = await pool.query(
      `INSERT INTO bills
       (organization_id, bill_number, bill_date, due_date,
        vendor_id, vendor_name, amount, currency_code,
        qb_bill_id, qb_vendor_id, qb_sync_status, qb_last_synced)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'synced', NOW())
       ON CONFLICT (organization_id, bill_number) DO UPDATE SET
         qb_bill_id = $9,
         qb_vendor_id = $10,
         qb_sync_status = 'synced',
         qb_last_synced = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [
        workspaceId,
        billData.docNumber,
        billData.txnDate,
        billData.dueDate,
        billData.vendorId,
        billData.vendorName,
        billData.totalAmt,
        billData.currencyRef?.value || 'AED',
        billData.id,
        billData.vendorId
      ]
    );
    return result.rows[0]?.id || 'bill-id';
  } catch (error) {
    console.error('Error storing QB bill:', error);
    throw error;
  }
}

/**
 * Store synthesized transaction from QB invoice/bill
 */
export async function storeQBTransaction(
  workspaceId: string,
  transactionData: any
): Promise<string> {
  try {
    const pool = getDbPool();
    const result = await pool.query(
      `INSERT INTO transactions
       (organization_id, external_id, transaction_date, account_id,
        counterparty_name, amount, currency_code, transaction_type,
        qb_source_type, qb_source_id, qb_sync_status, qb_last_synced)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'synced', NOW())
       ON CONFLICT (organization_id, external_id) DO UPDATE SET
         qb_sync_status = 'synced',
         qb_last_synced = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [
        workspaceId,
        transactionData.externalId,
        transactionData.date,
        transactionData.accountId || null,
        transactionData.counterpartyName,
        transactionData.amount,
        transactionData.currency || 'AED',
        transactionData.type,
        transactionData.sourceType,
        transactionData.sourceId,
      ]
    );
    return result.rows[0]?.id || 'txn-id';
  } catch (error) {
    console.error('Error storing QB transaction:', error);
    throw error;
  }
}
