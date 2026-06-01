/**
 * Seed emails and mock files for test client
 * Adds realistic email correspondence and document uploads to the database
 */

import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Sample email templates
const emailTemplates = [
  {
    from: 'accounts@uaetax.gov.ae',
    to: 'tester@ledgr.ae',
    subject: 'VAT Return Filing Reminder - Q1 2025',
    body: 'Your Q1 2025 VAT return is due by April 15, 2025. Please ensure all supporting documents are ready for filing.',
    type: 'compliance_reminder',
    received_at: new Date('2025-03-28'),
  },
  {
    from: 'supplier@oilco.ae',
    to: 'tester@ledgr.ae',
    subject: 'Invoice #INV-2025-0847 - Raw Materials',
    body: 'Please find attached invoice for raw materials supplied on March 15, 2025. Amount due: AED 52,000. Payment terms: Net 30.',
    type: 'vendor_invoice',
    received_at: new Date('2025-03-18'),
  },
  {
    from: 'billing@dewa.gov.ae',
    to: 'tester@ledgr.ae',
    subject: 'Electricity Bill - March 2025',
    body: 'Your March 2025 electricity bill is now available. Amount due: AED 3,818. Please pay by April 10, 2025.',
    type: 'utility_bill',
    received_at: new Date('2025-03-20'),
  },
  {
    from: 'client@techstartup.ae',
    to: 'tester@ledgr.ae',
    subject: 'Invoice Paid - Consulting Services March 2025',
    body: 'Thank you for the consulting services provided in March. We have processed payment of AED 42,000 to your account ending in 1234.',
    type: 'payment_confirmation',
    received_at: new Date('2025-03-25'),
  },
  {
    from: 'auditor@pwc.ae',
    to: 'tester@ledgr.ae',
    subject: 'Audit Findings - Q1 2025',
    body: 'We have identified several accounting discrepancies in your Q1 records that require attention. Please schedule a meeting to review.',
    type: 'audit_notice',
    received_at: new Date('2025-04-02'),
  },
  {
    from: 'hr@etisalat.ae',
    to: 'tester@ledgr.ae',
    subject: 'Business Telecom Services Invoice',
    body: 'Your monthly business telecom invoice for April 2025: AED 1,242. We appreciate your continued business.',
    type: 'vendor_invoice',
    received_at: new Date('2025-04-03'),
  },
  {
    from: 'landlord@realestate.ae',
    to: 'tester@ledgr.ae',
    subject: 'Office Rent - April 2025',
    body: 'Office rent for April 2025 is due: AED 45,000. Please remit payment by April 5, 2025.',
    type: 'expense',
    received_at: new Date('2025-04-01'),
  },
  {
    from: 'customs@abudhabi.gov.ae',
    to: 'tester@ledgr.ae',
    subject: 'Freight Charges Due - Shipment #SHP-2025-156',
    body: 'Customs clearing charges for shipment SHP-2025-156: AED 8,950. Please settle within 5 business days.',
    type: 'compliance_notice',
    received_at: new Date('2025-04-05'),
  },
];

// Sample mock files
const mockFiles = [
  {
    filename: 'VAT_Return_Q1_2025.pdf',
    file_type: 'application/pdf',
    file_size: 2457600, // 2.4 MB
    upload_date: new Date('2025-03-30'),
    description: 'VAT return filing document for Q1 2025',
  },
  {
    filename: 'Invoice_INV_2025_0847_RawMaterials.pdf',
    file_type: 'application/pdf',
    file_size: 1048576, // 1 MB
    upload_date: new Date('2025-03-18'),
    description: 'Supplier invoice for raw materials',
  },
  {
    filename: 'Dewa_Electricity_Bill_March_2025.pdf',
    file_type: 'application/pdf',
    file_size: 524288, // 512 KB
    upload_date: new Date('2025-03-20'),
    description: 'Monthly electricity utility bill',
  },
  {
    filename: 'Consulting_Services_Agreement_2025.docx',
    file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    file_size: 2097152, // 2 MB
    upload_date: new Date('2025-02-15'),
    description: 'Service agreement with client',
  },
  {
    filename: 'Bank_Statement_Jan_2025.xlsx',
    file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    file_size: 1572864, // 1.5 MB
    upload_date: new Date('2025-02-01'),
    description: 'Monthly bank reconciliation',
  },
  {
    filename: 'Audit_Findings_Q1_2025.pdf',
    file_type: 'application/pdf',
    file_size: 3145728, // 3 MB
    upload_date: new Date('2025-04-02'),
    description: 'External audit findings report',
  },
  {
    filename: 'Employee_Payroll_April_2025.xlsx',
    file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    file_size: 819200, // 800 KB
    upload_date: new Date('2025-04-01'),
    description: 'Monthly payroll records',
  },
  {
    filename: 'Tax_Compliance_Checklist_2025.pdf',
    file_type: 'application/pdf',
    file_size: 1048576, // 1 MB
    upload_date: new Date('2025-01-15'),
    description: 'Annual tax compliance checklist',
  },
];

async function seedEmailsAndFiles(): Promise<void> {
  try {
    // Get the test organization and user IDs from previous seeding
    const orgResult = await pool.query(
      "SELECT id FROM organizations WHERE name = 'TechFlow Solutions FZ-LLC' LIMIT 1"
    );

    if (orgResult.rows.length === 0) {
      throw new Error('Test organization not found. Run seed-test-client.ts first.');
    }

    const organizationId = orgResult.rows[0].id;

    const userResult = await pool.query(
      "SELECT id FROM users WHERE email = 'tester@ledgr.ae' LIMIT 1"
    );

    if (userResult.rows.length === 0) {
      throw new Error('Test user not found. Run seed-test-client.ts first.');
    }

    const userId = userResult.rows[0].id;

    console.log(`\n📧 Seeding emails and files for organization: ${organizationId}`);

    // Check if emails table exists
    const emailsTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'emails'
      )
    `);

    if (!emailsTableCheck.rows[0].exists) {
      // Create emails table if it doesn't exist
      console.log('Creating emails table...');
      await pool.query(`
        CREATE TABLE emails (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          from_address VARCHAR(255) NOT NULL,
          to_address VARCHAR(255) NOT NULL,
          subject TEXT NOT NULL,
          body TEXT NOT NULL,
          email_type VARCHAR(50),
          received_at TIMESTAMP WITH TIME ZONE NOT NULL,
          is_read BOOLEAN DEFAULT FALSE,
          is_archived BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX idx_emails_organization_id ON emails(organization_id);
        CREATE INDEX idx_emails_received_at ON emails(received_at DESC);
      `);
    }

    // Check if mock_files table exists
    const filesTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'mock_files'
      )
    `);

    if (!filesTableCheck.rows[0].exists) {
      // Create mock_files table if it doesn't exist
      console.log('Creating mock_files table...');
      await pool.query(`
        CREATE TABLE mock_files (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          filename VARCHAR(255) NOT NULL,
          file_type VARCHAR(100) NOT NULL,
          file_size BIGINT NOT NULL,
          storage_path VARCHAR(500),
          upload_date TIMESTAMP WITH TIME ZONE NOT NULL,
          uploaded_by UUID REFERENCES users(id),
          description TEXT,
          is_compliance_document BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX idx_mock_files_organization_id ON mock_files(organization_id);
        CREATE INDEX idx_mock_files_upload_date ON mock_files(upload_date DESC);
      `);
    }

    // Insert emails
    console.log('Inserting email records...');
    let emailCount = 0;
    for (const email of emailTemplates) {
      await pool.query(
        `INSERT INTO emails (
          organization_id, from_address, to_address, subject, body, 
          email_type, received_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          organizationId,
          email.from,
          email.to,
          email.subject,
          email.body,
          email.type,
          email.received_at,
        ]
      );
      emailCount++;
    }
    console.log(`✅ Inserted ${emailCount} email records`);

    // Insert mock files
    console.log('Inserting mock file records...');
    let fileCount = 0;
    for (const file of mockFiles) {
      const isCompliance = [
        'VAT_Return',
        'Audit_Findings',
        'Tax_Compliance',
      ].some((keyword) => file.filename.includes(keyword));

      await pool.query(
        `INSERT INTO mock_files (
          organization_id, filename, file_type, file_size, 
          upload_date, uploaded_by, description, is_compliance_document
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          organizationId,
          file.filename,
          file.file_type,
          file.file_size,
          file.upload_date,
          userId,
          file.description,
          isCompliance,
        ]
      );
      fileCount++;
    }
    console.log(`✅ Inserted ${fileCount} mock file records`);

    console.log('\n✅ Email and file seeding complete!');
    console.log('\nTest client summary:');
    console.log(`  Email: tester@ledgr.ae`);
    console.log(`  Password: tester`);
    console.log(`  Organization: TechFlow Solutions FZ-LLC`);
    console.log(`  Emails seeded: ${emailCount}`);
    console.log(`  Files seeded: ${fileCount}`);
    console.log(`  Status: ✅ Production-ready for sales demos\n`);

    await pool.end();
  } catch (error) {
    console.error('❌ Error seeding emails and files:', error);
    process.exit(1);
  }
}

seedEmailsAndFiles();
