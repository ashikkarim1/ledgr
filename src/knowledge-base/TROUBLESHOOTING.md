# Troubleshooting Guide

## Common Issues & Solutions

---

## Integration Issues

### QuickBooks Sync Failed

**Error:** "QuickBooks sync failed. Check your connection."

**Solutions:**

1. **Check Your QB Credentials**
   - Log into QuickBooks Online separately (new browser tab)
   - Try signing in with your username/password
   - If you can't log in, reset your password in QB first

2. **Re-authorize Ledgr**
   - Go to Ledgr → Settings → Integrations → QuickBooks
   - Click "Disconnect"
   - Click "Reconnect"
   - Authorize again when prompted
   - Wait 3-5 minutes for sync to resume

3. **Check User Permissions in QB**
   - Your QB user role must be "Full User" or "Admin"
   - Cannot sync as "Limited User" or "Guest"
   - Ask your QB administrator if you're unsure

4. **Check Your QB Company**
   - Confirm you're connecting to the correct company file
   - QB allows multiple company files; make sure you picked the right one

5. **Resolve QB Errors**
   - If QB shows errors, fix them first before retrying sync
   - Common QB errors: duplicate invoice numbers, invalid tax rates

**If still stuck:**
Screenshot the error and reply here. Our specialists can check your QB account securely.

---

### Xero Connection Keeps Dropping

**Error:** "Xero connection lost. Reconnect?"

**Why it happens:**
- Xero authentication token expired (happens every ~30 days)
- You changed Xero password
- Your IP changed significantly

**Fix:**
1. Go to Settings → Integrations → Xero
2. Click "Reconnect"
3. Log into Xero (separate browser)
4. Grant Ledgr access again
5. You're reconnected!

**To prevent future drops:**
- Don't log out of Xero while Ledgr is syncing
- Don't change password while integration is active
- Check we still have permission in Xero Settings → Connected Apps

---

### Plaid Bank Connection Failed

**Error:** "We couldn't connect to your bank. Try again?"

**Bank Not Supported?**
- Plaid supports 13,000+ banks
- Check your bank is listed: https://plaid.com/supported-banks
- If not listed, contact your bank about API support

**Authentication Failed?**
1. Confirm your username/password work on your bank's website
2. Try again with exact capitalization
3. Some banks require special codes (not just password)

**Multi-Factor Auth Issue?**
- Some banks require SMS code during connection
- Keep your phone handy during setup
- Wait for code to arrive before clicking "Next"

**Still Failing?**
- Try disconnecting and reconnecting
- Clear browser cookies and try again
- Use a different browser (Chrome vs Safari)

---

## Data Issues

### Duplicate Transactions

**What it is:**
Same transaction appears twice with same amount/date.

**Why it happens:**
- Manually entered + auto-imported from bank
- Imported the same file twice
- System lag created accidental duplicates

**How to fix:**
1. Identify the duplicates (they usually appear together)
2. Delete the manual entry (keep the auto-imported one)
3. Run reconciliation to ensure balance is correct
4. Check next month's transactions for similar issues

**To prevent:**
- Only enter transactions manually if auto-import failed
- Don't import same bank file twice
- Use "Import from Bank" rather than manual entry when possible

---

### Balance Doesn't Match Bank Statement

**Most Common Reasons:**
1. **Pending Transactions** - Transactions show in Ledgr but not yet in bank
   - Solution: Check transaction date. Bank may post later.

2. **Timing Difference** - You recorded on different date than bank
   - Solution: Adjust date in Ledgr or wait for bank to post.

3. **Unreconciled Transactions** - You haven't marked them as reconciled
   - Solution: Click "Reconcile" button, match all transactions.

4. **Fee You Missed** - Bank charged a fee not in Ledgr
   - Solution: Manually add bank fee transaction.

5. **Unrealized Transfer** - Sent money but bank hasn't processed
   - Solution: Wait 1-2 business days.

**Step-by-Step Balance Check:**
1. Open your bank statement (online or PDF)
2. Note the "Ending Balance" date and amount
3. In Ledgr, go to Accounts → [Your Account]
4. Filter to same date range
5. Sum all transactions
6. Compare to bank statement

**Still doesn't match?**
- Export Ledgr transactions (CSV)
- Compare line-by-line to bank statement
- Look for typos in amounts
- Check account number is correct

---

## Permission Issues

### "You Don't Have Permission to Access This"

**Why:**
Your role (Viewer, Accountant, etc.) doesn't include this feature.

**Solutions:**

**If you SHOULD have access:**
- Ask your Admin to increase your permissions
- They can do it in Settings → Team Members → [Your Name]

**If you SHOULDN'T have access:**
- This is working correctly
- Features locked based on your role:
  - Viewer: Read-only dashboards & reports
  - Accountant: Transaction entry & reconciliation
  - Finance Manager: Workflows & automation
  - CFO: Forecasting & strategic planning
  - Admin: Everything + user/integration management

---

## Performance Issues

### Dashboard Slow to Load

**Temporary Fix:**
- Refresh the page (Cmd+R or Ctrl+R)
- Clear browser cache
- Try a different browser

**Longer-term Solutions:**
1. Narrow your date range
   - Don't load 5 years of data at once
   - Use month/quarter filters

2. Hide unused widgets
   - Go to Dashboard Settings
   - Toggle off widgets you don't need

3. Check your internet
   - Use fast, stable WiFi
   - Not on cellular/weak signal

4. Check browser
   - Close other tabs
   - Quit other apps using internet
   - Restart browser

**Still slow?**
- Check your device storage (might be full)
- Restart your computer
- Contact support with your internet speed test result

---

### Reports Take Forever to Generate

**Why:**
Large date ranges + complex transactions = more processing.

**Quick fixes:**
1. Use a shorter date range (1 month vs 1 year)
2. Filter to specific accounts/categories
3. Exclude archived items

**If timeout error:**
- Check our status page: https://status.ledgr.io
- If everything's green, try again in 5 minutes
- Contact support if error persists

---

## Sync & Automation

### Scheduled Workflows Not Running

**Check these:**
1. Is the workflow **enabled**?
   - Go to Workflows → [Your Workflow]
   - Look for green toggle (enabled)

2. Is the trigger time set correctly?
   - 8am GMT vs 8am local time?
   - Check timezone in Settings

3. Does the action have errors?
   - Click workflow name to see logs
   - Errors show why it failed

4. Has it run recently?
   - Check "Last Run" timestamp
   - Should be today/yesterday if daily

**Fix:**
1. Verify settings in workflow editor
2. Click "Test Run" to trigger manually
3. Check logs to see what happened
4. Enable if toggled off

---

## Account & Access

### Forgot Password

**Reset it yourself:**
1. Click "Forgot Password?" on login screen
2. Enter your email
3. Check inbox for reset link
4. Follow link and set new password
5. Log back in

**Didn't receive email?**
1. Check spam folder
2. Check you entered correct email
3. Try resetting again
4. Contact support if still stuck

---

### Can't Log In

**Try these:**
1. Verify caps lock is OFF
2. Copy/paste password (exact match)
3. Clear browser cookies
4. Try a different browser
5. Try on phone/tablet
6. Restart your internet

**Still stuck?**
- Click "Forgot Password" and reset
- Contact support with your email address

---

## Data Export & Backup

### Export My Data

**How to export:**
1. Go to Settings → Data Management
2. Select data type (Transactions, Reports, etc.)
3. Choose date range
4. Click "Export" → Choose format (CSV, PDF, Excel)
5. Download starts automatically

**Common exports:**
- **P&L Report** → Use for taxes
- **Transaction List** → Use for accounting review
- **Account Register** → Use for reconciliation

---

## Getting Help

If you've tried these solutions and still stuck:

**Quick Help:**
- Reply here with what you've tried
- Our AI will dig deeper

**Talk to Specialist:**
- Click "Talk to Human"
- WhatsApp our team
- Typical response: 2 hours

**Email Support:**
- support@ledgr.io
- Include: error screenshot, what you tried, date/time

---

*Last updated: May 2024*
*See also: System Features Guide, Integration Guides, FAQ*
