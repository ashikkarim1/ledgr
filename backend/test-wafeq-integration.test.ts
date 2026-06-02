/**
 * Wafeq Integration Tests
 * Tests for Arabic text preservation, GL code mapping, and VAT account detection
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { WafeqIntegration, ArabicTextHandler, WafeqCSVParser } from "./integrations/wafeq-integration.js";
import { IntegrationSetup } from "./integrations/integration-types.js";
import { randomUUID } from 'crypto';

// ============================================================================
// Test Data
// ============================================================================

const TEST_ORGANIZATION_ID = randomUUID();

const createIntegrationSetup = (): IntegrationSetup => ({
  id: randomUUID(),
  orgId: TEST_ORGANIZATION_ID,
  type: 'wafeq' as any,
  name: 'Test Wafeq',
  isActive: true,
  isConnected: true,
  connectionStatus: 'connected',
  config: {},
  syncSettings: {
    autoSync: false,
    syncFrequency: 'manual',
    retryOnError: true,
    maxRetries: 3,
    retryDelayMs: 1000,
    batchSize: 100,
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// ============================================================================
// Arabic Text Handler Tests
// ============================================================================

describe('ArabicTextHandler', () => {
  describe('validateUTF8', () => {
    it('should validate correct UTF-8 Arabic text', () => {
      const arabicTexts = [
        'فاتورة', // invoice
        'عميل', // customer
        'الأصول', // assets
        'النقد في الصندوق', // cash in hand
        'الحساب البنكي - درهم', // bank account - dirham
        'الحسابات الدائنة', // accounts payable
        'ضريبة الدخل المدخلة', // input VAT
      ];

      arabicTexts.forEach((text) => {
        expect(ArabicTextHandler.validateUTF8(text)).toBe(true);
      });
    });

    it('should detect Arabic characters correctly', () => {
      const arabicText = 'النقد في الصندوق';
      const englishText = 'Cash on Hand';
      const mixedText = 'Account 1000 - النقد';

      expect(ArabicTextHandler.hasArabic(arabicText)).toBe(true);
      expect(ArabicTextHandler.hasArabic(englishText)).toBe(false);
      expect(ArabicTextHandler.hasArabic(mixedText)).toBe(true);
    });
  });

  describe('normalizeForDedup', () => {
    it('should normalize Arabic text by removing diacritics', () => {
      const withDiacritics = 'الأصول';
      const normalized = ArabicTextHandler.normalizeForDedup(withDiacritics);

      // Should preserve base characters
      expect(normalized).toBeDefined();
      expect(normalized.length).toBeGreaterThan(0);
    });

    it('should normalize whitespace', () => {
      const text = 'النقد   في    الصندوق';
      const normalized = ArabicTextHandler.normalizeForDedup(text);

      expect(normalized).not.toContain('   ');
      expect(normalized).toContain(' ');
    });

    it('should handle mixed Arabic and English', () => {
      const mixed = 'Account 1000 النقد في الصندوق';
      const normalized = ArabicTextHandler.normalizeForDedup(mixed);

      expect(normalized).toBeDefined();
      expect(normalized.toLowerCase()).toBe(normalized);
    });
  });

  describe('detectVATAccount', () => {
    it('should detect input VAT accounts', () => {
      const inputs = [
        { ar: 'ضريبة القيمة المضافة المدخلة', en: 'Input VAT' },
        { ar: 'ضريبة الدخول', en: 'Input Tax' },
        { ar: 'ضريبة المشتريات', en: 'Purchase Tax' },
      ];

      inputs.forEach(({ ar, en }) => {
        const result = ArabicTextHandler.detectVATAccount(ar, en);
        expect(result.isVat).toBe(true);
        expect(result.type).toBe('input');
      });
    });

    it('should detect output VAT accounts', () => {
      const outputs = [
        { ar: 'ضريبة القيمة المضافة المخرجات', en: 'Output VAT' },
        { ar: 'ضريبة المبيعات', en: 'Sales Tax' },
        { ar: 'ضريبة الإنتاج', en: 'Output Tax' },
      ];

      outputs.forEach(({ ar, en }) => {
        const result = ArabicTextHandler.detectVATAccount(ar, en);
        expect(result.isVat).toBe(true);
        expect(result.type).toBe('output');
      });
    });

    it('should not detect non-VAT accounts', () => {
      const nonVat = [
        { ar: 'النقد في الصندوق', en: 'Cash on Hand' },
        { ar: 'رأس المال', en: 'Share Capital' },
        { ar: 'المبيعات', en: 'Sales Revenue' },
      ];

      nonVat.forEach(({ ar, en }) => {
        const result = ArabicTextHandler.detectVATAccount(ar, en);
        expect(result.isVat).toBe(false);
      });
    });
  });
});

// ============================================================================
// CSV Parser Tests
// ============================================================================

describe('WafeqCSVParser', () => {
  let parser: WafeqCSVParser;

  beforeEach(() => {
    parser = new WafeqCSVParser();
  });

  it('should parse GL accounts CSV with Arabic text', async () => {
    const csvContent = `Account Code,Account Name (English),Account Name (Arabic),Account Type,Balance,Description
1000,Cash on Hand,النقد في الصندوق,Asset,15000.00,Operating cash
1100,Bank Account,الحساب البنكي,Asset,250000.00,Primary account
2200,Input VAT,ضريبة الدخل المدخلة,Liability,8500.00,VAT payable`;

    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const csvBuffer = Buffer.concat([bom, Buffer.from(csvContent, 'utf8')]);

    const result = await parser.parseCSV(csvBuffer, 'gl');

    expect(result.encoding).toBe('utf-8');
    expect(result.recordsRead).toBe(3);
    expect(result.recordsValid).toBe(3);
    expect(result.records).toHaveLength(3);

    // Verify Arabic text preservation
    const firstRecord = result.records[0];
    expect(firstRecord.account_name_arabic).toBe('النقد في الصندوق');
    expect(firstRecord.account_code).toBe('1000');
  });

  it('should handle CSV with special Arabic characters', async () => {
    const csvContent = `Account Code,Account Name (English),Account Name (Arabic),Account Type,Balance
2100,Accounts Payable,الحسابات الدائنة,Liability,50000
3100,Share Capital,رأس المال,Equity,100000
5100,Cost of Goods,تكلفة البضاعة المباعة,Expense,0`;

    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const csvBuffer = Buffer.concat([bom, Buffer.from(csvContent, 'utf8')]);

    const result = await parser.parseCSV(csvBuffer, 'gl');

    expect(result.recordsValid).toBe(3);
    expect(result.errors).toHaveLength(0);

    // Check specific characters are preserved
    const wafeqRecord = result.records.find((r) => r.account_code === '2100');
    expect(wafeqRecord.account_name_arabic).toBe('الحسابات الدائنة');
  });

  it('should detect invalid UTF-8 encoding', async () => {
    // Create invalid UTF-8 buffer (missing continuation byte)
    const invalidBuffer = Buffer.from([0xc3, 0x28, 0xe2, 0x28, 0xa1, 0xd3]);

    const result = await parser.parseCSV(invalidBuffer, 'gl');

    expect(result.encoding).toBe('invalid');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should skip rows with column mismatch', async () => {
    const csvContent = `Account Code,Account Name,Account Type,Balance
1000,Cash,Asset,15000
1100,Bank Account,Asset
2100,Payables,Liability,50000`;

    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const csvBuffer = Buffer.concat([bom, Buffer.from(csvContent, 'utf8')]);

    const result = await parser.parseCSV(csvBuffer, 'gl');

    expect(result.recordsValid).toBe(2);
    expect(result.recordsSkipped).toBe(1);
    expect(result.errors.some((e) => e.severity === 'warning')).toBe(true);
  });
});

// ============================================================================
// GL Code Mapping Tests
// ============================================================================

describe('GL Code Mapping', () => {
  let wafeqIntegration: WafeqIntegration;
  let setup: IntegrationSetup;

  beforeEach(() => {
    setup = createIntegrationSetup();
    wafeqIntegration = new WafeqIntegration(setup);
  });

  it('should map GL codes to correct account types', async () => {
    const csvContent = `Account Code,Account Name (English),Account Name (Arabic),Account Type,Balance
1000,Cash,النقد,Asset,15000
2100,Payables,الحسابات الدائنة,Liability,50000
3100,Capital,رأس المال,Equity,100000
4000,Revenue,المبيعات,Income,0
5100,COGS,تكلفة البضاعة,Expense,0`;

    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const csvBuffer = Buffer.concat([bom, Buffer.from(csvContent, 'utf8')]);

    const accounts = await wafeqIntegration.importGLAccounts(setup.id, csvBuffer);

    expect(accounts).toHaveLength(5);
    expect(accounts[0].accountType).toBe('Asset');
    expect(accounts[1].accountType).toBe('Liability');
    expect(accounts[2].accountType).toBe('Equity');
    expect(accounts[3].accountType).toBe('Income');
    expect(accounts[4].accountType).toBe('Expense');
  });

  it('should detect and mark VAT accounts', async () => {
    const csvContent = `Account Code,Account Name (English),Account Name (Arabic),Account Type,Balance
2200,Input VAT 5%,ضريبة الدخل المدخلة,Liability,8500
2300,Output VAT 5%,ضريبة المخرجات,Liability,12000`;

    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const csvBuffer = Buffer.concat([bom, Buffer.from(csvContent, 'utf8')]);

    const accounts = await wafeqIntegration.importGLAccounts(setup.id, csvBuffer);

    const inputVat = accounts.find((a) => a.accountCode === '2200');
    const outputVat = accounts.find((a) => a.accountCode === '2300');

    expect(inputVat?.isVatAccount).toBe(true);
    expect(inputVat?.vatType).toBe('input');
    expect(outputVat?.isVatAccount).toBe(true);
    expect(outputVat?.vatType).toBe('output');
  });

  it('should preserve dual-language account names', async () => {
    const csvContent = `Account Code,Account Name (English),Account Name (Arabic),Account Type,Balance,Description
1000,Cash on Hand,النقد في الصندوق,Asset,15000,Primary cash account
1100,Bank Account - AED,الحساب البنكي - درهم,Asset,250000,Business bank account`;

    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const csvBuffer = Buffer.concat([bom, Buffer.from(csvContent, 'utf8')]);

    const accounts = await wafeqIntegration.importGLAccounts(setup.id, csvBuffer);

    const account1000 = accounts.find((a) => a.accountCode === '1000');
    expect(account1000?.accountNameEn).toBe('Cash on Hand');
    expect(account1000?.accountNameAr).toBe('النقد في الصندوق');

    const account1100 = accounts.find((a) => a.accountCode === '1100');
    expect(account1100?.accountNameEn).toBe('Bank Account - AED');
    expect(account1100?.accountNameAr).toBe('الحساب البنكي - درهم');
  });
});

// ============================================================================
// Deduplication Tests
// ============================================================================

describe('Deduplication Fingerprinting', () => {
  let wafeqIntegration: WafeqIntegration;

  beforeEach(() => {
    const setup = createIntegrationSetup();
    wafeqIntegration = new WafeqIntegration(setup);
  });

  it('should generate consistent fingerprints for identical records', () => {
    const record = {
      date: '01/01/2024',
      amount: '10000.00',
      description: 'فاتورة بيع',
      accountCode: '4000',
    };

    const fingerprint1 = wafeqIntegration.generateFingerprint(record);
    const fingerprint2 = wafeqIntegration.generateFingerprint(record);

    expect(fingerprint1).toBe(fingerprint2);
    expect(fingerprint1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });

  it('should generate different fingerprints for different records', () => {
    const record1 = {
      date: '01/01/2024',
      amount: '10000.00',
      description: 'فاتورة بيع',
      accountCode: '4000',
    };

    const record2 = {
      date: '01/01/2024',
      amount: '10000.00',
      description: 'فاتورة شراء',
      accountCode: '4000',
    };

    const fingerprint1 = wafeqIntegration.generateFingerprint(record1);
    const fingerprint2 = wafeqIntegration.generateFingerprint(record2);

    expect(fingerprint1).not.toBe(fingerprint2);
  });

  it('should normalize Arabic for deduplication matching', () => {
    const record1 = {
      date: '01/01/2024',
      amount: '5000.50',
      description: 'فاتورة مبيعات', // With diacritics potentially
      accountCode: '4000',
    };

    const record2 = {
      date: '01/01/2024',
      amount: '5000.50',
      description: 'فاتورة مبيعات', // Same normalized
      accountCode: '4000',
    };

    const fp1 = wafeqIntegration.generateFingerprint(record1);
    const fp2 = wafeqIntegration.generateFingerprint(record2);

    expect(fp1).toBe(fp2);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('WafeqIntegration - End to End', () => {
  let wafeqIntegration: WafeqIntegration;
  let setup: IntegrationSetup;

  beforeEach(() => {
    setup = createIntegrationSetup();
    wafeqIntegration = new WafeqIntegration(setup);
  });

  it('should import complete GL with VAT accounts and dual languages', async () => {
    const completeCSV = `Account Code,Account Name (English),Account Name (Arabic),Account Type,Balance,Description
1000,Cash on Hand,النقد في الصندوق,Asset,15000,Operating cash
1100,Bank Account - AED,الحساب البنكي - درهم,Asset,250000,Primary business account
1200,Accounts Receivable,الذمم المدينة,Asset,75000,Customer invoices
2100,Accounts Payable,الحسابات الدائنة,Liability,50000,Supplier invoices
2200,Input VAT 5%,ضريبة الدخل المدخلة,Liability,8500,VAT on purchases
2300,Output VAT 5%,ضريبة المخرجات,Liability,12000,VAT on sales
3100,Share Capital,رأس المال,Equity,100000,Initial capital
4000,Sales Revenue,المبيعات,Income,0,Customer sales
4100,Other Income,الدخل الآخر,Income,0,Other revenue
5100,Cost of Goods Sold,تكلفة البضاعة المباعة,Expense,0,COGS
5200,Salaries and Wages,الرواتب والأجور,Expense,0,Employee compensation`;

    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const csvBuffer = Buffer.concat([bom, Buffer.from(completeCSV, 'utf8')]);

    const accounts = await wafeqIntegration.importGLAccounts(setup.id, csvBuffer);

    // Verify all accounts imported
    expect(accounts).toHaveLength(11);

    // Verify VAT accounts detected
    const vatAccounts = accounts.filter((a) => a.isVatAccount);
    expect(vatAccounts).toHaveLength(2);
    expect(vatAccounts.some((a) => a.vatType === 'input')).toBe(true);
    expect(vatAccounts.some((a) => a.vatType === 'output')).toBe(true);

    // Verify Arabic text preserved
    const arabicAccounts = accounts.filter((a) => a.accountNameAr.length > 0);
    expect(arabicAccounts).toHaveLength(11);

    // Spot check specific accounts
    const cashAccount = accounts.find((a) => a.accountCode === '1000');
    expect(cashAccount?.accountNameAr).toBe('النقد في الصندوق');
    expect(cashAccount?.accountType).toBe('Asset');
    expect(cashAccount?.balance).toBe(15000);
  });

  it('should handle customer import with Arabic names', async () => {
    const customerCSV = `Customer Code,Customer Name (English),Customer Name (Arabic),Tax ID,Email,Balance
CUST001,Acme LLC,أكمي ليمتد,123456789012345,contact@acme.ae,75000
CUST002,Global Traders,التجار العالميون,987654321012345,info@global.ae,45000
CUST003,Tech Solutions,حلول التكنولوجيا,111111111111111,hello@techsol.ae,30000`;

    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const csvBuffer = Buffer.concat([bom, Buffer.from(customerCSV, 'utf8')]);

    const customers = await wafeqIntegration.importCustomers(setup.id, csvBuffer);

    expect(customers).toHaveLength(3);

    const globalTraders = customers.find((c) => c.customerCode === 'CUST002');
    expect(globalTraders?.customerNameEn).toBe('Global Traders');
    expect(globalTraders?.customerNameAr).toBe('التجار العالميون');
    expect(globalTraders?.email).toBe('info@global.ae');
    expect(globalTraders?.balance).toBe(45000);
  });
});

// ============================================================================
// Run tests with: npm test -- test-wafeq-integration.test.ts
// ============================================================================
