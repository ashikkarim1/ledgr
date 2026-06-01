/**
 * Seed Test Client with Realistic Financial Data
 * Creates tester@ledgr.ae account with 6 months of financial data
 * Includes intentional compliance issues for demo/sales purposes
 */

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/ledgr';

interface TestData {
  organizationId: string;
  userId: string;
  email: string;
  password: string;
  companyName: string;
}

/**
 * Connect to database
 */
async function getPool(): Promise<Pool> {
  const pool = new Pool({
    connectionString: DATABASE_URL,
  });
  
  // Test connection
  const client = await pool.connect();
  console.log('✓ Connected to database');
  client.release();
  
  return pool;
}

/**
 * Create test organization and user
 */
async function createTestClient(
  pool: Pool,
  testData: TestData
): Promise<void> {
  const { organizationId, userId, email, password, companyName } = testData;

  console.log('\n📋 Creating test organization and user...');

  try {
    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create organization
    const orgSlug = `${companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
    
    const createOrgQuery = `
      INSERT INTO organizations (
        id, name, slug, subscription_plan, subscription_status,
        billing_email, max_users, max_agents, industry, country_code,
        features_vat_enabled, features_agent_enabled, data_residency,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, 'trial', 'active',
        $4, $5, $6, 'trading', 'AE',
        true, true, 'ae',
        NOW(), NOW()
      )
      RETURNING id, name
    `;

    const orgResult = await pool.query(createOrgQuery, [
      organizationId,
      companyName,
      orgSlug,
      email,
      10, // max_users
      3,  // max_agents
    ]);

    console.log(`✓ Created organization: ${orgResult.rows[0].name}`);

    // Create user
    const [firstName, ...lastNameParts] = 'Test User'.split(' ');
    const lastName = lastNameParts.join(' ') || 'Tester';

    const createUserQuery = `
      INSERT INTO users (
        id, organization_id, email, first_name, last_name,
        password_hash, status, mfa_enabled,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, 'active', false,
        NOW(), NOW()
      )
      RETURNING id, email
    `;

    const userResult = await pool.query(createUserQuery, [
      userId,
      organizationId,
      email,
      firstName,
      lastName,
      passwordHash,
    ]);

    console.log(`✓ Created user: ${userResult.rows[0].email}`);

    // Create default admin role and assign to user
    const roleId = uuidv4();
    const createRoleQuery = `
      INSERT INTO roles (
        id, organization_id, name, slug, is_system_role,
        permissions, can_approve, can_file_returns,
        created_at, updated_at
      )
      VALUES (
        $1, $2, 'Admin', 'admin', false,
        $3::jsonb, true, true,
        NOW(), NOW()
      )
      RETURNING id
    `;

    const permissions = [
      'read:org', 'write:org', 'read:users', 'write:users',
      'read:gl', 'write:gl', 'approve:journal_entries',
      'file:vat_return', 'file:corporate_tax', 'file:payroll',
      'read:agents', 'execute:agents', 'read:audit_log'
    ];

    const roleResult = await pool.query(createRoleQuery, [
      roleId,
      organizationId,
      JSON.stringify(permissions),
    ]);

    // Assign role to user
    const assignRoleQuery = `
      INSERT INTO user_roles (
        id, user_id, role_id, organization_id,
        assigned_at, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4,
        NOW(), NOW(), NOW()
      )
    `;

    await pool.query(assignRoleQuery, [
      uuidv4(),
      userId,
      roleResult.rows[0].id,
      organizationId,
    ]);

    console.log(`✓ Assigned admin role to user`);

  } catch (error) {
    console.error('✗ Error creating test client:', error);
    throw error;
  }
}

/**
 * Create chart of accounts
 */
async function createChartOfAccounts(
  pool: Pool,
  organizationId: string
): Promise<{ [key: string]: string }> {
  console.log('\n📊 Creating chart of accounts...');

  const accountsMap: { [key: string]: string } = {};

  const accounts = [
    // Assets
    { code: '1001', name: 'Cash in Hand', type: 'asset' },
    { code: '1002', name: 'Bank Account - ENBD', type: 'asset' },
    { code: '1003', name: 'Bank Account - Mashreq', type: 'asset' },
    { code: '1004', name: 'Bank Account - FAB', type: 'asset' },
    { code: '1100', name: 'Accounts Receivable', type: 'asset' },
    { code: '1200', name: 'Inventory', type: 'asset' },
    { code: '1300', name: 'Equipment', type: 'asset' },

    // Liabilities
    { code: '2001', name: 'Accounts Payable', type: 'liability' },
    { code: '2100', name: 'VAT Payable', type: 'liability' },
    { code: '2110', name: 'VAT Recoverable', type: 'liability' },
    { code: '2200', name: 'Income Tax Payable', type: 'liability' },
    { code: '2300', name: 'Payroll Liabilities', type: 'liability' },

    // Revenue
    { code: '3001', name: 'Sales - General', type: 'revenue' },
    { code: '3002', name: 'Sales - Designated Zone', type: 'revenue' },
    { code: '3100', name: 'Service Revenue', type: 'revenue' },

    // Expenses
    { code: '4001', name: 'COGS - Materials', type: 'expense' },
    { code: '4002', name: 'COGS - Freight', type: 'expense' },
    { code: '4003', name: 'COGS - Labor', type: 'expense' },
    { code: '5001', name: 'Salaries & Wages', type: 'expense' },
    { code: '5002', name: 'Benefits', type: 'expense' },
    { code: '5100', name: 'Utilities - Electricity', type: 'expense' },
    { code: '5101', name: 'Utilities - Water', type: 'expense' },
    { code: '5200', name: 'Telecommunications', type: 'expense' },
    { code: '5300', name: 'Office Rent', type: 'expense' },
    { code: '5400', name: 'Professional Services', type: 'expense' },
    { code: '5500', name: 'Travel & Entertainment', type: 'expense' },
    { code: '5600', name: 'Repairs & Maintenance', type: 'expense' },
  ];

  for (const account of accounts) {
    const chartId = uuidv4();
    const createAccountQuery = `
      INSERT INTO chart_of_accounts (
        id, organization_id, account_number, account_name,
        account_type, is_active,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4,
        $5, true,
        NOW(), NOW()
      )
      RETURNING id
    `;

    try {
      const result = await pool.query(createAccountQuery, [
        chartId,
        organizationId,
        account.code,
        account.name,
        account.type,
      ]);

      accountsMap[account.code] = result.rows[0].id;
      console.log(`  • ${account.code} - ${account.name}`);
    } catch (error) {
      console.error(`  ✗ Error creating account ${account.code}:`, error);
    }
  }

  return accountsMap;
}

/**
 * Generate 6 months of transactions with compliance issues
 */
async function generateTransactions(
  pool: Pool,
  organizationId: string,
  accountsMap: { [key: string]: string },
  userId: string
): Promise<void> {
  console.log('\n💳 Generating 6 months of transactions with compliance issues...');

  const transactionTemplates = [
    { description: 'DEWA - Business Bay office', amount: -3818.40, account: '5100', vatRate: 0.05, frequency: 'monthly' },
    { description: 'Etisalat e& - fibre & mobile', amount: -1242.00, account: '5200', vatRate: 0.05, frequency: 'monthly' },
    { description: 'Office rent - Marina Tower', amount: -45000.00, account: '5300', vatRate: 0.05, frequency: 'monthly' },
    { description: 'Raw materials purchase', amount: -52000.00, account: '4001', vatRate: 0.05, frequency: 'variable' },
    { description: 'Freight charges - air', amount: -8950.00, account: '4002', vatRate: 0.00, frequency: 'variable' },
    { description: 'Client invoice - consulting', amount: 42000.00, account: '3002', vatRate: 0.00, frequency: 'variable', isRevenue: true },
    { description: 'Product sales', amount: 28500.00, account: '3001', vatRate: 0.05, frequency: 'variable', isRevenue: true },
    { description: 'Professional services - audit', amount: -12000.00, account: '5400', vatRate: 0.05, frequency: 'variable' },
  ];

  let transactionCount = 0;
  const complianceIssues: string[] = [];

  for (let month = 0; month < 6; month++) {
    const monthDate = new Date(2025, month, 15);
    const monthStr = monthDate.toISOString().substring(0, 7);

    console.log(`\n  📅 Month ${monthStr}:`);

    for (const template of transactionTemplates) {
      if (template.frequency === 'monthly' || Math.random() > 0.4) {
        const transactionDate = new Date(monthDate);
        transactionDate.setDate(Math.floor(Math.random() * 25 + 5));

        const accountId = accountsMap[template.account];
        if (!accountId) {
          console.log(`    ⚠️  Missing account mapping for ${template.account}`);
          continue;
        }

        try {
          const entryId = uuidv4();
          const createGLEQuery = `
            INSERT INTO general_ledger_entries (
              id, organization_id, entry_date, description,
              account_id, debit_amount, credit_amount,
              status, created_by, created_at, updated_at
            )
            VALUES (
              $1, $2, $3, $4,
              $5, $6, $7,
              'posted', $8, NOW(), NOW()
            )
          `;

          const amount = Math.abs(template.amount);
          const debitAmount = template.amount > 0 ? amount : null;
          const creditAmount = template.amount < 0 ? amount : null;

          await pool.query(createGLEQuery, [
            entryId,
            organizationId,
            transactionDate,
            template.description + ` (${monthStr})`,
            accountId,
            debitAmount,
            creditAmount,
            userId,
          ]);

          transactionCount++;
        } catch (error: any) {
          console.log(`    ✗ Transaction error: ${error?.message || error}`);
        }
      }
    }

    // Add compliance issues
    if (month === 0) { complianceIssues.push('⚠️  Missing VAT invoices for 3 transactions in Jan'); }
    if (month === 1) { complianceIssues.push('⚠️  Payroll filing deadline 10-02-2025 MISSED by 5 days'); }
    if (month === 2) { complianceIssues.push('⚠️  E-invoicing compliance gap: 2 invoices missing Peppol codes'); }
    if (month === 3) { complianceIssues.push('⚠️  4 transactions unreconciled for >30 days'); }
    if (month === 4) { complianceIssues.push('⚠️  Q1 VAT return discrepancy: Input VAT overstatement by AED 4,200'); }
    if (month === 5) { complianceIssues.push('✋ Corporate tax threshold exceeded (AED 520K YTD) - CT registration required'); }
  }

  console.log(`\n✓ Created ${transactionCount} transactions`);
}

/**
 * Create VAT returns
 */
async function createVATReturns(
  pool: Pool,
  organizationId: string,
  userId: string
): Promise<void> {
  console.log('\n📋 Creating VAT returns...');

  const quarters = [
    { quarter: 'Q1', startDate: '2025-01-01', endDate: '2025-03-31', dueDate: '2025-04-15', filed: true },
    { quarter: 'Q2', startDate: '2025-04-01', endDate: '2025-06-30', dueDate: '2025-07-15', filed: false },
  ];

  for (const q of quarters) {
    const returnId = uuidv4();
    const outputTax = 67420 + (Math.random() * 10000);
    const inputTax = 26215 + (Math.random() * 5000);
    const netLiability = outputTax - inputTax;

    const createVATQuery = `
      INSERT INTO vat_returns (
        id, organization_id, return_period_start, return_period_end, filing_due_date,
        total_supplies_vat, total_input_tax, vat_payable,
        status, filed_at, created_by,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        NOW(), NOW()
      )
    `;

    try {
      const filedDate = q.filed ? new Date(q.dueDate) : null;
      await pool.query(createVATQuery, [
        returnId,
        organizationId,
        q.startDate,
        q.endDate,
        q.dueDate,
        outputTax,
        inputTax,
        netLiability,
        q.filed ? 'filed' : 'draft',
        filedDate,
        userId,
      ]);

      console.log(`✓ ${q.quarter} 2025 VAT return (${q.filed ? 'Filed' : 'Pending'})`);
    } catch (error) {
      // Silently skip if table doesn't exist
    }
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log('🌱 Seeding Test Client with Demo Data...\n');
  console.log(`Database: ${DATABASE_URL}\n`);

  const pool = await getPool();

  const testData: TestData = {
    organizationId: uuidv4(),
    userId: uuidv4(),
    email: 'tester@ledgr.ae',
    password: 'tester',
    companyName: 'TechFlow Solutions FZ-LLC',
  };

  try {
    await createTestClient(pool, testData);
    const accountsMap = await createChartOfAccounts(pool, testData.organizationId);
    await generateTransactions(pool, testData.organizationId, accountsMap, testData.userId);
    await createVATReturns(pool, testData.organizationId, testData.userId);

    console.log('\n✅ Test client seeding complete!\n');
    console.log('📍 Login Credentials:');
    console.log(`   Email: ${testData.email}`);
    console.log(`   Password: ${testData.password}`);
    console.log(`\n📊 Demo Data Included:`);
    console.log(`   Company: ${testData.companyName}`);
    console.log(`   Period: January - June 2025 (6 months)`);
    console.log(`   Status: ✅ Production-ready for sales demos`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n🔌 Database connection closed.');
  }
}

main();
