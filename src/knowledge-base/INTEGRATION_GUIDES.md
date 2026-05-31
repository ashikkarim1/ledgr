# Integration Setup Guides

Complete step-by-step guides for connecting QuickBooks, Xero, and Plaid to Ledgr.

---

## QuickBooks Online Integration

### Why Connect QB?
- Real-time transaction sync
- Auto-categorization
- Eliminate manual entry
- Stay synced with your QB records
- Reduce errors

### Before You Start
- QB Online subscription (QBO)
- Admin access to QB
- Your QB username/password
- 5 minutes

### Step-by-Step Setup

**Step 1: Open Ledgr Integration**
1. Go to Settings → Integrations
2. Click "Add Integration" or search "QuickBooks"
3. Click "Connect QuickBooks Online"

**Step 2: Authorize Ledgr**
- You'll be sent to QuickBooks Online login
- Enter your QB email and password
- QB will ask: "Allow Ledgr to access your data?"
- Click "Authorize"
- You'll return to Ledgr

**Step 3: Select Your QB Company**
- If you have multiple companies, choose the correct one
- Can't change it later without disconnecting
- Choose carefully!

**Step 4: Choose What to Sync**
- Ledgr defaults to: Transactions, Customers, Vendors
- You can toggle each category
- Recommend starting with Transactions only

**Step 5: Confirm & Start**
- Review summary
- Click "Confirm Connection"
- Sync starts automatically
- Initial sync takes 5-10 minutes

**You're done!** Transactions will now sync daily.

### What Syncs
- **Transactions**: Sales, expenses, transfers
- **Accounts**: Chart of accounts structure
- **Customers & Vendors**: For lookup/categorization
- **Classes/Departments**: If you use them in QB

### What Doesn't Sync
- QB reports (we generate our own)
- Inventory levels (focus: financials)
- Payroll details (security)

### Troubleshooting QB Connection

**"Authorization failed"**
→ Check your QB password is correct
→ Try resetting QB password first
→ Then reconnect Ledgr

**"I see fewer transactions than expected"**
→ Check date range on Ledgr
→ QB sync only pulls last 3 months initially
→ Manual backfill available in Settings

**"Transactions are double"**
→ You may have manually entered + auto-synced
→ Delete manual entries, keep auto-imported ones
→ See Duplicate Transactions in Troubleshooting

**"Sync keeps failing"**
→ See QB Sync Failed in Troubleshooting guide
→ Likely auth or permission issue

---

## Xero Integration

### Why Connect Xero?
- Multi-currency support (perfect for UAE)
- Real-time reconciliation
- GST/VAT handling
- Project tracking
- Automation workflows

### Before You Start
- Xero subscription (Standard+)
- Admin access to Xero
- Xero username/email
- 5 minutes

### Step-by-Step Setup

**Step 1: Open Xero Integration**
1. Settings → Integrations
2. Click "Add Integration" → "Xero"
3. Click "Connect Xero"

**Step 2: Authorize on Xero**
- Redirected to Xero login
- Log in with your Xero credentials
- Click "Authorize Ledgr"
- Permissions screen will appear
- Review & approve

**Step 3: Select Your Xero Organization**
- Choose which Xero org to connect
- Note: Can only connect ONE org per Ledgr account
- If multiple orgs, contact support for setup

**Step 4: Map Your Accounts (Optional)**
- Xero accounts auto-map to Ledgr
- Review the mapping
- Edit if accounts differ
- Can adjust later in Settings

**Step 5: Test Connection**
- Click "Test Sync"
- Xero will sync 50 test transactions
- Verify they appear in Ledgr
- If successful, you're live!

**You're done!** Sync now happens twice daily.

### Xero-Specific Features

**Multi-Currency**
- Xero handles AED/USD/etc conversions
- Ledgr respects Xero's rates
- Reports show in your base currency

**Project Tracking**
- If you use Xero Projects, they sync
- Track profitability by project
- Filter reports by project

**GST/VAT**
- VAT codes sync from Xero
- Ledgr respects your GST setup
- Reports include tax summaries

### Troubleshooting Xero

**"Connection keeps dropping"**
→ See Xero Connection Keeps Dropping in Troubleshooting
→ Usually just need to reconnect

**"I don't see my projects"**
→ Make sure Xero Projects are enabled
→ Toggle on in Settings → Integration Config

**"Amounts don't match"**
→ Check currency conversion rates
→ Xero may use different rate than your bank
→ Note the difference and investigate

---

## Plaid (Bank Connections)

### Why Use Plaid?
- Direct bank feeds (no manual uploads)
- 13,000+ supported banks worldwide
- Auto-categorization from merchant data
- UAE banks: Emirates NBD, FAB, ADIB, DIB, all supported
- Real-time balances

### Before You Start
- A bank account at a Plaid-supported bank
- Your online banking username/password
- Phone for multi-factor auth (if your bank uses it)
- 5 minutes

### Step-by-Step Setup

**Step 1: Start Bank Connection**
1. Settings → Integrations
2. Click "Add Bank Connection" or search "Plaid"
3. Click "Connect Your Bank"

**Step 2: Search for Your Bank**
- Start typing your bank name: "Emirates..." or "FAB..."
- Common UAE banks appear at top
- Click your exact bank

**Step 3: Log Into Your Bank**
- Ledgr takes you to Plaid's secure portal
- Enter your online banking username/password
- Do NOT enter it into Ledgr directly!
- Plaid encrypts it with bank-level security

**Step 4: Multi-Factor Auth (if needed)**
- Some banks require SMS code or app approval
- Wait for code to arrive
- Enter code when prompted
- Approve on banking app if requested

**Step 5: Select Accounts**
- Choose which accounts to connect
- Can connect checking, savings, credit cards
- Recommend starting with main operating account
- Can add more later

**Step 6: Confirm**
- Review accounts to connect
- Click "Confirm & Sync"
- Plaid will pull last 90 days of transactions
- Takes 2-5 minutes

**You're connected!** Daily syncs begin automatically.

### What Gets Synced
- **Transactions**: All deposits/withdrawals/transfers
- **Merchant Names**: Auto-categorized by Plaid's data
- **Balances**: Updated daily
- **Transaction Dates**: Exactly as bank shows

### Categorization Smart Tips
- First transaction from merchant gets default category
- Edit it once, future ones auto-categorize
- Build your "rules" over time
- Monthly review to catch miscategorizations

### Supported UAE Banks
- Emirates NBD
- First Abu Dhabi Bank (FAB)
- Abu Dhabi Islamic Bank (ADIB)
- Dubai Islamic Bank (DIB)
- Mashreq Bank
- RAKBANK
- Sharjah Cooperative Bank
- And many more via Plaid network

### Troubleshooting Plaid

**"Bank not supported"**
→ Check Plaid's bank list: plaid.com/supported-banks
→ Some smaller banks not on Plaid yet
→ Contact bank about API support
→ Can use manual uploads as workaround

**"Authentication failed"**
→ Check username/password work directly on bank website
→ Try again with correct capitalization
→ Some banks require codes, not just passwords
→ See Plaid Bank Connection Failed in Troubleshooting

**"I don't see all my transactions"**
→ Plaid syncs last 90 days
→ Need older data? Manual backfill available
→ Check transaction filtering (date range, account)

**"Transaction appears twice"**
→ If you also have QB/Xero, might double-sync
→ Check which system it came from
→ Delete the manual entry, keep the auto-imported

---

## Managing Multiple Integrations

### Best Practice: QB + Plaid

**Recommended Setup:**
- QB for accounting structure (chart of accounts)
- Plaid for automated transaction feeds
- Both sync daily without conflict

**Why this combo?**
- QB handles your accounting rules
- Plaid brings in current transactions
- Everything stays in sync
- Minimal double work

**Setup Order:**
1. Connect QB first (establishes chart of accounts)
2. Connect Plaid second (uses QB account structure)
3. Let them sync for 1 week
4. Verify no duplicates, balance matches

### Switching from QB to Xero?

**If you want to leave QB:**
1. Disconnect QB in Settings
2. Export QB data as backup (CSV)
3. Connect Xero with same accounts
4. Xero will pull your chart of accounts
5. Re-import historical data if needed

**Note:** This change affects reporting continuity. Coordinate with your accountant.

### Disabling/Removing Integration

**To temporarily pause:**
1. Settings → Integrations → [Integration Name]
2. Toggle "Pause Sync"
3. No sync happens, but connection stays
4. Re-enable anytime

**To completely remove:**
1. Settings → Integrations → [Integration Name]
2. Click "Disconnect"
3. All linked data stays (not deleted)
4. Sync stops immediately
5. Can reconnect later

---

## Integration Status Monitoring

### Check Sync Health
- Dashboard shows integration status
- Green = Connected & syncing
- Orange = Warning (sync slow)
- Red = Error (needs attention)

### Check Last Sync Time
1. Settings → Integrations
2. Each integration shows "Last Sync: [time]"
3. Should be recent (today/yesterday)
4. If older, click "Sync Now" to force sync

### View Sync Logs
1. Settings → Integrations → [Integration]
2. Click "View Logs"
3. See all sync attempts
4. Errors show what went wrong

---

## Need Help?

**Integration questions?**
- Check the troubleshooting section above
- Reply here with your question
- Our team reviews within 2 hours

**Want to connect a different app?**
- Check our Roadmap: https://ledgr.io/integrations
- Request new integrations
- We're adding Stripe, Shopify, NetSuite soon

---

*Last updated: May 2024*
*Supported Banks: 13,000+ via Plaid*
*Need help? Contact support@ledgr.io or chat with us here*
