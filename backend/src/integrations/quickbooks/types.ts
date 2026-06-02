// QuickBooks Online Integration Types
// Intuit QuickBooks Data Structures

export interface QBOAuth2Config {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  scope: string[];
  realm_id: string; // QuickBooks Company ID
  token_endpoint: string;
  auth_endpoint: string;
}

export interface QBAccessToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  x_refresh_token_expires_in: number;
  expires_at: Date;
}

export interface QBCompanyConnection {
  id: string;
  org_id: string;
  realm_id: string;
  company_name: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: Date;
  refresh_token_expires_at: Date;
  is_connected: boolean;
  last_sync: Date | null;
  sync_status: 'idle' | 'syncing' | 'error';
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

// Chart of Accounts
export interface QBAccount {
  id: string;
  name: string;
  type: string;
  account_number: string | null;
  subaccount_type: string | null;
  description: string | null;
  current_balance: number;
  currency: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Journal Entry
export interface QBJournalEntry {
  id: string;
  realm_id: string;
  doc_number: string;
  txn_date: Date;
  ref_number: string | null;
  line_items: QBJournalLine[];
  total_amount: number;
  currency: string;
  created_at: Date;
  updated_at: Date;
}

export interface QBJournalLine {
  id: string;
  journal_entry_id: string;
  account_id: string;
  account_name: string;
  description: string | null;
  amount: number;
  detail_type: 'JournalEntryLineDetail';
}

// Customer (AR)
export interface QBCustomer {
  id: string;
  realm_id: string;
  name: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  billing_address: QBAddress | null;
  shipping_address: QBAddress | null;
  tax_id: string | null;
  currency: string;
  is_active: boolean;
  balance: number;
  created_at: Date;
  updated_at: Date;
}

export interface QBAddress {
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
}

// Invoice (AR)
export interface QBInvoice {
  id: string;
  realm_id: string;
  doc_number: string;
  customer_id: string;
  customer_name: string;
  customer_tax_id: string | null;
  txn_date: Date;
  due_date: Date;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_due: number;
  balance: number;
  currency: string;
  status: 'Draft' | 'Sent' | 'Open' | 'Overdue' | 'Paid' | 'Voided';
  payment_method: string | null;
  terms_id: string | null;
  memo: string | null;
  line_items: QBInvoiceLine[];
  created_at: Date;
  updated_at: Date;
}

export interface QBInvoiceLine {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  account_id: string;
  tax_code_id: string | null;
}

// Bill (AP)
export interface QBBill {
  id: string;
  realm_id: string;
  doc_number: string;
  vendor_id: string;
  vendor_name: string;
  vendor_tax_id: string | null;
  txn_date: Date;
  due_date: Date;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_due: number;
  balance: number;
  currency: string;
  status: 'Draft' | 'Open' | 'Overdue' | 'Paid' | 'Voided';
  payment_method: string | null;
  terms_id: string | null;
  memo: string | null;
  line_items: QBBillLine[];
  created_at: Date;
  updated_at: Date;
}

export interface QBBillLine {
  id: string;
  bill_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  account_id: string;
  tax_code_id: string | null;
}

// Vendor (AP)
export interface QBVendor {
  id: string;
  realm_id: string;
  name: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  billing_address: QBAddress | null;
  tax_id: string | null;
  currency: string;
  is_active: boolean;
  balance: number;
  created_at: Date;
  updated_at: Date;
}

// Expense (Direct Expenses)
export interface QBExpense {
  id: string;
  realm_id: string;
  txn_date: Date;
  ref_number: string | null;
  pay_method: 'Check' | 'Cash' | 'CreditCard' | 'Transfer' | 'Other';
  total_amount: number;
  currency: string;
  entity_id: string | null;
  entity_type: 'Vendor' | 'Employee' | null;
  account_id: string;
  memo: string | null;
  line_items: QBExpenseLine[];
  created_at: Date;
  updated_at: Date;
}

export interface QBExpenseLine {
  id: string;
  expense_id: string;
  description: string;
  amount: number;
  account_id: string;
  tax_code_id: string | null;
  customer_id: string | null;
}

// Bank Account
export interface QBBankAccount {
  id: string;
  realm_id: string;
  name: string;
  account_number: string;
  account_type: string;
  current_balance: number;
  bank_name: string | null;
  currency: string;
  is_active: boolean;
  created_at: Date;
}

// Bank Transaction
export interface QBBankTransaction {
  id: string;
  realm_id: string;
  bank_account_id: string;
  txn_date: Date;
  ref_number: string | null;
  payee_id: string | null;
  payee_name: string | null;
  amount: number;
  transaction_type: 'Check' | 'Cash' | 'Deposit' | 'Transfer' | 'Credit Card';
  status: 'Authorized' | 'Captured' | 'Settled' | 'Voided';
  line_items: QBBankTxnLine[];
  created_at: Date;
}

export interface QBBankTxnLine {
  id: string;
  transaction_id: string;
  description: string;
  amount: number;
  account_id: string;
  detail_type: string;
}

// Tax Code
export interface QBTaxCode {
  id: string;
  realm_id: string;
  name: string;
  description: string | null;
  tax_rate_id: string | null;
  sales_tax_rate_percent: number;
  purchase_tax_rate_percent: number;
  is_active: boolean;
}

// Sync Event
export interface QBSyncEvent {
  sync_id: string;
  org_id: string;
  realm_id: string;
  sync_type: 'full' | 'incremental' | 'on_demand';
  data_types: string[]; // 'accounts', 'customers', 'vendors', 'invoices', 'bills', 'expenses', 'bank', 'tax'
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
