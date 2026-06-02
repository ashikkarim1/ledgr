-- ============================================================================
-- ADD DEMO FINANCIAL DATA FOR HILAL TRADING FZ-LLC
-- Populates transactions, journal entries, and compliance data for tester account
-- ============================================================================

-- Get the organization ID for Hilal Trading
DO $$
DECLARE
  org_id UUID;
BEGIN
  SELECT organizations.id INTO org_id 
  FROM organizations 
  WHERE name = 'Hilal Trading FZ-LLC'
  ORDER BY created_at DESC
  LIMIT 1;

  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Organization Hilal Trading FZ-LLC not found';
  END IF;

  -- 1. Insert Chart of Accounts (basic structure)
  INSERT INTO chart_of_accounts (organization_id, code, name, account_type, currency)
  VALUES 
    (org_id, '1000', 'Cash on Hand', 'ASSET', 'AED'),
    (org_id, '1010', 'Bank Account - FAB', 'ASSET', 'AED'),
    (org_id, '1100', 'Accounts Receivable', 'ASSET', 'AED'),
    (org_id, '1200', 'Inventory', 'ASSET', 'AED'),
    (org_id, '2000', 'Accounts Payable', 'LIABILITY', 'AED'),
    (org_id, '2100', 'VAT Payable', 'LIABILITY', 'AED'),
    (org_id, '3000', 'Capital', 'EQUITY', 'AED'),
    (org_id, '4000', 'Sales Revenue', 'INCOME', 'AED'),
    (org_id, '5000', 'Cost of Goods Sold', 'EXPENSE', 'AED'),
    (org_id, '5100', 'Salaries & Wages', 'EXPENSE', 'AED'),
    (org_id, '5200', 'Utilities', 'EXPENSE', 'AED'),
    (org_id, '5300', 'Freight & Transportation', 'EXPENSE', 'AED')
  ON CONFLICT DO NOTHING;

  -- 2. Insert sample journal entries for May 2025
  INSERT INTO journal_entries (
    organization_id, entry_date, description, 
    posted, created_at
  )
  VALUES
    (org_id, '2025-05-01'::DATE, 'Opening balance - Cash deposit', true, NOW()),
    (org_id, '2025-05-05'::DATE, 'Etisalat - Internet & Telecom', true, NOW()),
    (org_id, '2025-05-07'::DATE, 'DEWA - Water & Electricity', true, NOW()),
    (org_id, '2025-05-10'::DATE, 'Consulting revenue - Business advisory', true, NOW()),
    (org_id, '2025-05-15'::DATE, 'Payroll - 18 employees', true, NOW()),
    (org_id, '2025-05-20'::DATE, 'Freight cost - Incoming shipment', true, NOW()),
    (org_id, '2025-05-25'::DATE, 'VAT liability accrual - Q2 2025', true, NOW())
  ON CONFLICT DO NOTHING;

  -- 3. Insert sample general ledger entries  
  INSERT INTO general_ledger_entries (
    organization_id, account_code, debit_amount, credit_amount, 
    entry_date, reference, description, created_at
  )
  VALUES
    (org_id, '1010', 482318, NULL, '2025-05-01'::DATE, 'OPENING', 'Opening balance', NOW()),
    (org_id, '5200', 4200, NULL, '2025-05-05'::DATE, 'ETISALAT', 'Etisalat bill', NOW()),
    (org_id, '1010', NULL, 4200, '2025-05-05'::DATE, 'ETISALAT', 'Etisalat payment', NOW()),
    (org_id, '5200', 3850, NULL, '2025-05-07'::DATE, 'DEWA', 'DEWA bill', NOW()),
    (org_id, '1010', NULL, 3850, '2025-05-07'::DATE, 'DEWA', 'DEWA payment', NOW()),
    (org_id, '1010', 125000, NULL, '2025-05-10'::DATE, 'CONSULTING', 'Consulting revenue received', NOW()),
    (org_id, '4000', NULL, 125000, '2025-05-10'::DATE, 'CONSULTING', 'Consulting revenue', NOW()),
    (org_id, '5100', 284000, NULL, '2025-05-15'::DATE, 'PAYROLL', 'Monthly payroll - 18 employees', NOW()),
    (org_id, '1010', NULL, 284000, '2025-05-15'::DATE, 'PAYROLL', 'Payroll payment', NOW()),
    (org_id, '5300', 48000, NULL, '2025-05-20'::DATE, 'FREIGHT', 'Freight - incoming shipment', NOW()),
    (org_id, '1010', NULL, 48000, '2025-05-20'::DATE, 'FREIGHT', 'Freight payment', NOW()),
    (org_id, '2100', 41205, NULL, '2025-05-25'::DATE, 'VAT-Q2', 'VAT liability Q2 2025', NOW()),
    (org_id, '4000', NULL, 41205, '2025-05-25'::DATE, 'VAT-Q2', 'VAT revenue allocation', NOW())
  ON CONFLICT DO NOTHING;

  -- 4. Insert VAT return data for Q2 2025
  INSERT INTO vat_returns (
    organization_id, quarter, year, 
    filing_status, filed_date, due_date,
    total_output_vat, total_input_vat, net_vat,
    created_at
  )
  VALUES (
    org_id, 2, 2025,
    'filed', '2025-07-10'::DATE, '2025-07-15'::DATE,
    125000, 83795, 41205,
    NOW()
  )
  ON CONFLICT DO NOTHING;

  -- 5. Insert VAT invoice sample data
  INSERT INTO vat_invoices (
    organization_id, invoice_date, invoice_number,
    customer_name, amount, vat_amount, status,
    created_at
  )
  VALUES
    (org_id, '2025-05-10'::DATE, 'HT-2025-001', 'Gulf Trading Co.', 95238, 9524, 'paid', NOW()),
    (org_id, '2025-05-15'::DATE, 'HT-2025-002', 'Emirates Distribution LLC', 85714, 8571, 'pending', NOW()),
    (org_id, '2025-05-20'::DATE, 'HT-2025-003', 'Diamond Logistics FZ', 104648, 10465, 'overdue', NOW())
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Successfully added demo financial data for Hilal Trading FZ-LLC';
END $$;

-- Verify the data
SELECT 
  o.name as organization,
  (SELECT COUNT(*) FROM journal_entries je WHERE je.organization_id = o.id) as journal_entries_count,
  (SELECT COUNT(*) FROM general_ledger_entries gle WHERE gle.organization_id = o.id) as ledger_entries_count,
  (SELECT COUNT(*) FROM vat_invoices vi WHERE vi.organization_id = o.id) as vat_invoices_count
FROM organizations o
WHERE o.name = 'Hilal Trading FZ-LLC'
ORDER BY o.created_at DESC
LIMIT 1;
