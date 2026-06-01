/**
 * Wafeq Integration
 * File-based CSV import for UAE accounting software with Arabic text support
 * Supports GL accounts, customers, and transaction sync with UTF-8 encoding
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import BaseIntegration, { Logger } from './base';
import {
  IntegrationSetup,
  CompanyInfo,
  ChartOfAccount,
  Invoice,
  Bill,
  Transaction,
  BankAccount,
  BankTransaction,
  OAuthToken,
  IntegrationError,
} from './integration-types';

// ============================================================================
// Types
// ============================================================================

export interface WafeqGLAccount {
  accountCode: string;
  accountNameEn: string;
  accountNameAr: string;
  accountType: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  balance: number;
  description?: string;
  isVatAccount?: boolean;
  vatType?: 'input' | 'output'; // VAT 5% indicators
}

export interface WafeqCustomer {
  customerCode: string;
  customerNameEn: string;
  customerNameAr: string;
  taxId?: string;
  email?: string;
  balance: number;
}

export interface WafeqTransaction {
  date: string; // DD/MM/YYYY format
  referenceNumber: string;
  descriptionEn: string;
  descriptionAr: string;
  accountCode: string;
  debitAmount: number;
  creditAmount: number;
}

export interface WafeqCSVParseResult {
  type: 'gl' | 'customers' | 'transactions';
  records: any[];
  recordsRead: number;
  recordsValid: number;
  recordsSkipped: number;
  errors: CSVParseError[];
  encoding: 'utf-8' | 'invalid';
}

export interface CSVParseError {
  lineNumber: number;
  record: any;
  error: string;
  severity: 'warning' | 'error';
}

// ============================================================================
// Arabic Text Utilities
// ============================================================================

export class ArabicTextHandler {
  /**
   * Validate UTF-8 encoding of Arabic text
   */
  static validateUTF8(text: string): boolean {
    try {
      const buffer = Buffer.from(text, 'utf8');
      const decoded = buffer.toString('utf8');
      return decoded === text;
    } catch {
      return false;
    }
  }

  /**
   * Normalize Arabic text for deduplication
   * Removes diacritical marks but preserves base characters
   */
  static normalizeForDedup(text: string): string {
    if (!text) return '';

    // Remove Arabic diacritical marks (fatha, damma, kasra, sukun, etc.)
    const normalized = text
      .replace(/[ً-ْ]/g, '') // Remove diacritics
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim()
      .toLowerCase();

    return normalized;
  }

  /**
   * Detect if text contains Arabic characters
   */
  static hasArabic(text: string): boolean {
    const arabicRegex = /[؀-ۿ]/;
    return arabicRegex.test(text);
  }

  /**
   * Detect VAT-related accounts by Arabic naming patterns
   */
  static detectVATAccount(nameAr: string, nameEn: string): { isVat: boolean; type?: 'input' | 'output' } {
    // More flexible patterns that match various VAT account naming conventions
    const inputVatPatterns = [
      /ضريبة.*(?:مدخل|دخول|مشتري)/i, // Matches variations like ضريبة الدخول, ضريبة المدخلة, ضريبة المشتريات
      /ضريبة.*القيمة.*المضافة.*(?:مدخل|دخول|مشتري)/i, // Full phrase with VAT
      /INPUT.*VAT|VAT.*INPUT/i,
    ];

    const outputVatPatterns = [
      /ضريبة.*(?:مخرج|مبيع|إنتاج)/i, // Matches ضريبة المخرجات, ضريبة المبيعات, ضريبة الإنتاج
      /ضريبة.*القيمة.*المضافة.*(?:مخرج|مبيع|إنتاج)/i, // Full phrase with VAT
      /OUTPUT.*VAT|VAT.*OUTPUT|SALES.*TAX/i,
    ];

    const combinedText = `${nameAr} ${nameEn}`;

    for (const pattern of inputVatPatterns) {
      if (pattern.test(combinedText)) {
        return { isVat: true, type: 'input' };
      }
    }

    for (const pattern of outputVatPatterns) {
      if (pattern.test(combinedText)) {
        return { isVat: true, type: 'output' };
      }
    }

    return { isVat: false };
  }
}

// ============================================================================
// CSV Parser
// ============================================================================

export class WafeqCSVParser {
  protected logger: Logger;

  constructor() {
    this.logger = new Logger('WafeqCSVParser');
  }

  /**
   * Parse CSV file and validate UTF-8 encoding
   */
  async parseCSV(
    fileBuffer: Buffer,
    type: 'gl' | 'customers' | 'transactions'
  ): Promise<WafeqCSVParseResult> {
    const result: WafeqCSVParseResult = {
      type,
      records: [],
      recordsRead: 0,
      recordsValid: 0,
      recordsSkipped: 0,
      errors: [],
      encoding: 'utf-8',
    };

    try {
      // Detect and validate UTF-8 encoding
      let text: string;
      try {
        // Check for invalid UTF-8 sequences
        if (!this.isValidUTF8(fileBuffer)) {
          result.encoding = 'invalid';
          result.errors.push({
            lineNumber: 0,
            record: {},
            error: 'Invalid UTF-8 byte sequences detected',
            severity: 'error',
          });
          return result;
        }

        text = fileBuffer.toString('utf8');
        // Verify UTF-8 validity by re-encoding
        const buffer = Buffer.from(text, 'utf8');
        if (buffer.toString('utf8') !== text) {
          result.encoding = 'invalid';
          throw new Error('Invalid UTF-8 encoding detected');
        }
      } catch (error) {
        result.encoding = 'invalid';
        result.errors.push({
          lineNumber: 0,
          record: {},
          error: `UTF-8 encoding error: ${error instanceof Error ? error.message : 'Unknown'}`,
          severity: 'error',
        });
        return result;
      }

      // Split by newlines and handle different line endings
      const lines = text
        .replace(/\r\n/g, '\n') // Normalize line endings
        .split('\n')
        .filter((line) => line.trim().length > 0);

      if (lines.length < 2) {
        result.errors.push({
          lineNumber: 0,
          record: {},
          error: 'CSV file must contain headers and at least one data row',
          severity: 'error',
        });
        return result;
      }

      // Parse header row
      const headers = this.parseCSVLine(lines[0]);
      if (headers.length === 0) {
        result.errors.push({
          lineNumber: 1,
          record: {},
          error: 'Could not parse CSV header row',
          severity: 'error',
        });
        return result;
      }

      // Validate headers for the import type
      this.validateHeaders(headers, type, result);

      // Parse data rows
      for (let i = 1; i < lines.length; i++) {
        result.recordsRead++;
        try {
          const line = lines[i];
          if (!line.trim()) continue; // Skip empty lines

          const values = this.parseCSVLine(line);
          if (values.length !== headers.length) {
            result.recordsSkipped++;
            result.errors.push({
              lineNumber: i + 1,
              record: line.substring(0, 100),
              error: `Column count mismatch: expected ${headers.length}, got ${values.length}`,
              severity: 'warning',
            });
            continue;
          }

          const record = this.createRecord(headers, values, type);

          // Validate record
          const validation = this.validateRecord(record, type);
          if (!validation.valid) {
            result.recordsSkipped++;
            result.errors.push({
              lineNumber: i + 1,
              record,
              error: validation.error || 'Invalid record',
              severity: 'warning',
            });
            continue;
          }

          result.records.push(record);
          result.recordsValid++;
        } catch (error) {
          result.recordsSkipped++;
          result.errors.push({
            lineNumber: i + 1,
            record: lines[i].substring(0, 100),
            error: `Parse error: ${error instanceof Error ? error.message : 'Unknown'}`,
            severity: 'warning',
          });
        }
      }

      this.logger.info(`CSV parse completed: ${result.recordsValid} valid records from ${result.recordsRead} total`, {
        type,
        recordsValid: result.recordsValid,
        recordsSkipped: result.recordsSkipped,
        errors: result.errors.length,
      });
    } catch (error) {
      result.errors.push({
        lineNumber: 0,
        record: {},
        error: `CSV parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error',
      });
    }

    return result;
  }

  /**
   * Validate if buffer contains valid UTF-8 sequences
   */
  private isValidUTF8(buffer: Buffer): boolean {
    let i = 0;
    while (i < buffer.length) {
      const byte = buffer[i];

      // Single-byte character (0xxxxxxx)
      if ((byte & 0x80) === 0) {
        i++;
      }
      // Two-byte character (110xxxxx)
      else if ((byte & 0xe0) === 0xc0) {
        if (i + 1 >= buffer.length || (buffer[i + 1] & 0xc0) !== 0x80) {
          return false;
        }
        i += 2;
      }
      // Three-byte character (1110xxxx)
      else if ((byte & 0xf0) === 0xe0) {
        if (
          i + 2 >= buffer.length ||
          (buffer[i + 1] & 0xc0) !== 0x80 ||
          (buffer[i + 2] & 0xc0) !== 0x80
        ) {
          return false;
        }
        i += 3;
      }
      // Four-byte character (11110xxx)
      else if ((byte & 0xf8) === 0xf0) {
        if (
          i + 3 >= buffer.length ||
          (buffer[i + 1] & 0xc0) !== 0x80 ||
          (buffer[i + 2] & 0xc0) !== 0x80 ||
          (buffer[i + 3] & 0xc0) !== 0x80
        ) {
          return false;
        }
        i += 4;
      } else {
        // Invalid byte sequence
        return false;
      }
    }
    return true;
  }

  /**
   * Parse a single CSV line handling quoted fields
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  /**
   * Validate CSV headers for the import type
   */
  private validateHeaders(headers: string[], type: 'gl' | 'customers' | 'transactions', result: WafeqCSVParseResult): void {
    const headerMaps = {
      gl: ['account code', 'account name', 'account type', 'balance'],
      customers: ['customer code', 'customer name', 'email', 'balance'],
      transactions: ['date', 'reference', 'description', 'account code', 'debit', 'credit'],
    };

    const requiredHeaders = headerMaps[type];
    const normalizedHeaders = headers.map((h) => h.toLowerCase());

    const hasRequired = requiredHeaders.every((required) =>
      normalizedHeaders.some((h) => h.includes(required.substring(0, 4)))
    );

    if (!hasRequired) {
      result.errors.push({
        lineNumber: 1,
        record: headers,
        error: `Missing required headers for ${type} import. Expected: ${requiredHeaders.join(', ')}`,
        severity: 'error',
      });
    }
  }

  /**
   * Create a typed record from header/value pair
   * Handles both regular headers and parenthesized language variants like "Account Name (English)"
   */
  private createRecord(headers: string[], values: string[], type: string): any {
    const record: any = {};

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      let key = '';
      let languageSuffix = '';

      // Extract language suffix from parentheses if present
      const parentMatch = header.match(/\(([^)]+)\)/);
      if (parentMatch) {
        const lang = parentMatch[1].toLowerCase();
        // Map language names to codes
        if (lang === 'english' || lang === 'en') {
          languageSuffix = '_english';
        } else if (lang === 'arabic' || lang === 'ar') {
          languageSuffix = '_arabic';
        }
      }

      // Create base key by removing parentheses, converting to lowercase, replacing spaces
      key = header
        .replace(/\s*\([^)]*\)\s*/g, '') // Remove parentheses and contents
        .toLowerCase()
        .replace(/\s+/g, '_');

      // Add the language suffix if extracted
      const finalKey = key + languageSuffix;
      record[finalKey] = values[i] || '';

      // Also store without suffix for fallback lookups
      if (languageSuffix) {
        record[key] = values[i] || '';
      }
    }

    return record;
  }

  /**
   * Validate individual record integrity
   */
  private validateRecord(record: any, type: string): { valid: boolean; error?: string } {
    switch (type) {
      case 'gl':
        if (!record.account_code) {
          return { valid: false, error: 'Missing account_code' };
        }
        // Accept either account_name or account_name_english or account_name_arabic
        const hasAccountName = record.account_name || record.account_name_english || record.account_name_arabic;
        if (!hasAccountName) {
          return { valid: false, error: 'Missing account name (English or Arabic)' };
        }
        // Validate UTF-8 for any Arabic text present
        const nameToValidate = record.account_name_arabic || record.account_name || '';
        if (nameToValidate && !ArabicTextHandler.validateUTF8(nameToValidate)) {
          return { valid: false, error: 'Invalid UTF-8 in account name' };
        }
        // account_type is optional - will default in normalizeAccountType if missing
        return { valid: true };

      case 'customers':
        if (!record.customer_code) {
          return { valid: false, error: 'Missing customer_code' };
        }
        // Accept either customer_name or customer_name_english or customer_name_arabic
        const hasCustomerName = record.customer_name || record.customer_name_english || record.customer_name_arabic;
        if (!hasCustomerName) {
          return { valid: false, error: 'Missing customer name (English or Arabic)' };
        }
        // Validate UTF-8 for any Arabic text present
        const customerNameToValidate = record.customer_name_arabic || record.customer_name || '';
        if (customerNameToValidate && !ArabicTextHandler.validateUTF8(customerNameToValidate)) {
          return { valid: false, error: 'Invalid UTF-8 in customer name' };
        }
        return { valid: true };

      case 'transactions':
        if (!record.date || !record.account_code) {
          return { valid: false, error: 'Missing date or account_code' };
        }
        const debit = parseFloat(record.debit || 0);
        const credit = parseFloat(record.credit || 0);
        if (debit === 0 && credit === 0) {
          return { valid: false, error: 'Transaction must have debit or credit amount' };
        }
        return { valid: true };

      default:
        return { valid: false, error: `Unknown record type: ${type}` };
    }
  }
}

// ============================================================================
// Wafeq Integration Class
// ============================================================================

export class WafeqIntegration extends BaseIntegration {
  private csvParser: WafeqCSVParser;
  protected logger: Logger;

  constructor(setup: IntegrationSetup) {
    super(setup);
    this.csvParser = new WafeqCSVParser();
    this.logger = new Logger('WafeqIntegration');
  }

  // ========================================================================
  // OAuth Methods (Not used for file-based integration, but required by interface)
  // ========================================================================

  async getAuthorizationUrl(integrationId: string): Promise<string> {
    throw new Error('Wafeq integration uses file-based import, not OAuth');
  }

  async handleOAuthCallback(integrationId: string, code: string, state: string): Promise<OAuthToken> {
    throw new Error('Wafeq integration uses file-based import, not OAuth');
  }

  async testConnection(integrationId: string): Promise<boolean> {
    this.logger.info('Wafeq file-based integration - connection test passed', { integrationId });
    return true;
  }

  protected async performTokenRefresh(refreshToken: string): Promise<OAuthToken> {
    throw new Error('Wafeq integration does not use token refresh');
  }

  // ========================================================================
  // File Import Methods
  // ========================================================================

  /**
   * Import GL accounts from Wafeq CSV file
   */
  async importGLAccounts(integrationId: string, fileBuffer: Buffer): Promise<WafeqGLAccount[]> {
    this.logger.info('Starting GL accounts import', { integrationId });

    try {
      const parseResult = await this.csvParser.parseCSV(fileBuffer, 'gl');

      if (parseResult.encoding === 'invalid') {
        this.recordError({
          code: 'WAFEQ_INVALID_ENCODING',
          message: 'CSV file must be UTF-8 encoded',
          timestamp: Date.now(),
          severity: 'error',
          context: { integrationId, errors: parseResult.errors },
        });
        throw new Error('Invalid UTF-8 encoding in CSV file');
      }

      if (parseResult.recordsValid === 0) {
        this.recordError({
          code: 'WAFEQ_NO_VALID_RECORDS',
          message: `No valid GL records parsed from CSV (${parseResult.errors.length} errors)`,
          timestamp: Date.now(),
          severity: 'error',
          context: { integrationId, errors: parseResult.errors },
        });
        throw new Error('No valid records found in GL file');
      }

      const accounts: WafeqGLAccount[] = parseResult.records.map((record) => {
        const nameAr = this.extractArabicName(record);
        const nameEn = this.extractEnglishName(record);
        const accountType = this.normalizeAccountType(record.account_type);
        const vatCheck = ArabicTextHandler.detectVATAccount(nameAr, nameEn);

        return {
          accountCode: record.account_code?.toString().trim() || '',
          accountNameEn: nameEn,
          accountNameAr: nameAr,
          accountType: accountType,
          balance: parseFloat(record.balance || 0),
          description: record.description || '',
          isVatAccount: vatCheck.isVat,
          vatType: vatCheck.type,
        };
      });

      this.logAudit('import_gl_accounts', {
        integrationId,
        accountsImported: accounts.length,
        recordsSkipped: parseResult.recordsSkipped,
      });

      return accounts;
    } catch (error) {
      this.recordError({
        code: 'WAFEQ_GL_IMPORT_ERROR',
        message: `GL import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: { integrationId },
      });
      throw error;
    }
  }

  /**
   * Import customers from Wafeq CSV file
   */
  async importCustomers(integrationId: string, fileBuffer: Buffer): Promise<WafeqCustomer[]> {
    this.logger.info('Starting customers import', { integrationId });

    try {
      const parseResult = await this.csvParser.parseCSV(fileBuffer, 'customers');

      if (parseResult.encoding === 'invalid' || parseResult.recordsValid === 0) {
        throw new Error(`Invalid or empty customer file: ${parseResult.errors[0]?.error || 'Unknown error'}`);
      }

      const customers: WafeqCustomer[] = parseResult.records.map((record) => ({
        customerCode: record.customer_code?.toString().trim() || '',
        customerNameEn: this.extractEnglishName(record),
        customerNameAr: this.extractArabicName(record),
        taxId: record.tax_id || record.trn || undefined,
        email: record.email || undefined,
        balance: parseFloat(record.balance || 0),
      }));

      this.logAudit('import_customers', { integrationId, customersImported: customers.length });
      return customers;
    } catch (error) {
      this.recordError({
        code: 'WAFEQ_CUSTOMER_IMPORT_ERROR',
        message: `Customer import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: { integrationId },
      });
      throw error;
    }
  }

  /**
   * Generate deduplication fingerprint for a record
   */
  generateFingerprint(record: any): string {
    const normalized = {
      date: record.date || record.entry_date || '',
      amount: (parseFloat(record.amount || record.debit || record.credit || 0)).toFixed(2),
      description: ArabicTextHandler.normalizeForDedup(record.description || ''),
      accountCode: record.account_code || '',
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
  }

  // ========================================================================
  // Data Sync Methods (Required by interface but not used)
  // ========================================================================

  async syncCompanyInfo(integrationId: string): Promise<CompanyInfo> {
    throw new Error('Wafeq integration does not support company info sync');
  }

  async syncAccounts(integrationId: string): Promise<ChartOfAccount[]> {
    throw new Error('Use importGLAccounts() instead for Wafeq file-based import');
  }

  async syncInvoices(integrationId: string, since?: number): Promise<Invoice[]> {
    throw new Error('Wafeq integration does not support invoice sync');
  }

  async syncBills(integrationId: string, since?: number): Promise<Bill[]> {
    throw new Error('Wafeq integration does not support bill sync');
  }

  async syncTransactions(integrationId: string, since?: number): Promise<Transaction[]> {
    throw new Error('Wafeq integration does not support transaction sync');
  }

  async pushTransaction(integrationId: string, transaction: Transaction): Promise<string> {
    throw new Error('Wafeq integration does not support pushing transactions');
  }

  async syncBankAccounts(integrationId: string): Promise<BankAccount[]> {
    throw new Error('Wafeq integration does not support bank account sync');
  }

  async syncBankTransactions(integrationId: string, since?: number): Promise<BankTransaction[]> {
    throw new Error('Wafeq integration does not support bank transaction sync');
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  /**
   * Extract Arabic name from a record (checks multiple possible column names)
   */
  private extractArabicName(record: any): string {
    const arabicKeys = [
      'account_name_arabic',
      'customer_name_arabic',
      'description_arabic',
      'account_name_ar',
      'customer_name_ar',
      'description_ar',
      'name_ar',
      'arabic_name',
    ];

    for (const key of arabicKeys) {
      if (record[key] && ArabicTextHandler.hasArabic(record[key])) {
        return record[key].trim();
      }
    }

    // If no Arabic found, check main name field for Arabic content
    const mainNameKeys = ['account_name', 'customer_name', 'name', 'description'];
    for (const key of mainNameKeys) {
      if (record[key] && ArabicTextHandler.hasArabic(record[key])) {
        return record[key].trim();
      }
    }

    return '';
  }

  /**
   * Extract English name from a record
   */
  private extractEnglishName(record: any): string {
    const englishKeys = [
      'account_name_english',
      'customer_name_english',
      'description_english',
      'account_name_en',
      'customer_name_en',
      'description_en',
      'name_en',
      'english_name',
    ];

    for (const key of englishKeys) {
      if (record[key] && !ArabicTextHandler.hasArabic(record[key])) {
        return record[key].trim();
      }
    }

    // Fallback to main name field if it doesn't have Arabic
    const mainNameKeys = ['account_name', 'customer_name', 'name', 'description'];
    for (const key of mainNameKeys) {
      if (record[key] && !ArabicTextHandler.hasArabic(record[key])) {
        return record[key].trim();
      }
    }

    return '';
  }

  /**
   * Normalize account type to standard format
   */
  private normalizeAccountType(
    type: string | undefined
  ): 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense' {
    if (!type) return 'Asset'; // Default fallback

    const normalized = type.toLowerCase();

    if (normalized.includes('asset') || normalized.includes('الأصول')) return 'Asset';
    if (normalized.includes('liability') || normalized.includes('التزام')) return 'Liability';
    if (normalized.includes('equity') || normalized.includes('رأس')) return 'Equity';
    if (normalized.includes('income') || normalized.includes('إيرادات')) return 'Income';
    if (normalized.includes('expense') || normalized.includes('مصروف')) return 'Expense';

    return 'Asset'; // Default fallback
  }
}

export default WafeqIntegration;
