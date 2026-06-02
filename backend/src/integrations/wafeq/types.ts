// Wafeq Integration Types
// UAE Accounting Software Data Structures

export interface WafeqOAuth2Config {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  scope: string[];
  token_endpoint: string;
  auth_endpoint: string;
}

export interface WafeqAccessToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  expires_at: Date;
}

export interface WafeqCompanyConnection {
  id: string;
  org_id: string;
  company_id: string;
  company_name: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: Date;
  is_connected: boolean;
  last_sync: Date | null;
  sync_status: 'idle' | 'syncing' | 'error';
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

// Chart of Accounts
export interface WafeqChartOfAccounts {
  account_code: string;
  account_name: string;
  account_type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  account_category: string;
  balance: number;
  currency: string;
  is_active: boolean;
  created_at: Date;
}

// General Ledger Entries
export interface WafeqGLEntry {
  entry_id: string;
  company_id: string;
  entry_date: Date;
  posting_date: Date;
  reference_number: string;
  description: string;
  account_code: string;
  debit_amount: number;
  credit_amount: number;
  currency: string;
  cost_center: string | null;
  project_id: string | null;
  department: string | null;
  created_at: Date;
  updated_at: Date;
}

// Invoices (AR)
export interface WafeqInvoice {
  invoice_id: string;
  invoice_number: string;
  company_id: string;
  customer_id: string;
  customer_name: string;
  customer_vat_number: string | null;
  invoice_date: Date;
  due_date: Date;
  invoice_amount: number;
  vat_amount: number;
  total_amount: number;
  currency: string;
  status: 'Draft' | 'Issued' | 'Paid' | 'Partial' | 'Overdue' | 'Cancelled';
  payment_terms: string | null;
  description: string;
  e_invoice_status: 'Not Submitted' | 'Submitted' | 'Accepted' | 'Rejected';
  line_items: WafeqInvoiceLineItem[];
  created_at: Date;
  updated_at: Date;
}

export interface WafeqInvoiceLineItem {
  line_id: string;
  invoice_id: string;
  item_description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  vat_type: string;
  vat_rate: number;
  vat_amount: number;
  line_total: number;
  account_code: string;
}

// Bills (AP)
export interface WafeqBill {
  bill_id: string;
  bill_number: string;
  company_id: string;
  vendor_id: string;
  vendor_name: string;
  vendor_vat_number: string | null;
  bill_date: Date;
  due_date: Date;
  bill_amount: number;
  vat_amount: number;
  total_amount: number;
  currency: string;
  status: 'Draft' | 'Received' | 'Approved' | 'Paid' | 'Partial' | 'Overdue' | 'Cancelled';
  payment_terms: string | null;
  description: string;
  line_items: WafeqBillLineItem[];
  created_at: Date;
  updated_at: Date;
}

export interface WafeqBillLineItem {
  line_id: string;
  bill_id: string;
  item_description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  vat_type: string;
  vat_rate: number;
  vat_amount: number;
  line_total: number;
  account_code: string;
}

// Bank Transactions
export interface WafeqBankTransaction {
  transaction_id: string;
  company_id: string;
  bank_account_id: string;
  transaction_date: Date;
  reference_number: string;
  description: string;
  transaction_type: 'Debit' | 'Credit';
  amount: number;
  currency: string;
  balance_after: number;
  status: 'Pending' | 'Cleared' | 'Reconciled';
  reconciliation_date: Date | null;
  created_at: Date;
}

// VAT Returns
export interface WafeqVATReturn {
  return_id: string;
  company_id: string;
  period_start: Date;
  period_end: Date;
  filing_deadline: Date;
  status: 'Draft' | 'Filed' | 'Accepted' | 'Rejected' | 'Amended';
  output_tax: number;
  input_tax: number;
  reverse_charge: number;
  designated_zone: number;
  net_liability: number;
  payment_amount: number;
  filing_date: Date | null;
  filing_reference: string | null;
  created_at: Date;
  updated_at: Date;
}

// Sync Events
export interface WafeqSyncEvent {
  sync_id: string;
  org_id: string;
  company_id: string;
  sync_type: 'full' | 'incremental' | 'on_demand';
  data_types: string[]; // 'coa', 'gl', 'invoices', 'bills', 'bank', 'vat'
  records_synced: number;
  records_updated: number;
  records_created: number;
  sync_start: Date;
  sync_end: Date;
  duration_ms: number;
  status: 'success' | 'partial' | 'failed';
  error_message: string | null;
  created_at: Date;
}
