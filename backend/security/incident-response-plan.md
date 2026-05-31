# Incident Response Plan

**Scope:** Ledgr financial operations platform (GL, VAT, Tax, Payroll)  
**Objective:** Detect, respond to, and recover from security incidents with minimal business impact  
**SLA:** Critical (30 min), High (2 hours), Medium (24 hours), Low (5 days)  
**Owner:** Chief Security Officer / Security Team Lead

---

## 1. INCIDENT SEVERITY CLASSIFICATION

### Critical (Response SLA: 30 minutes)
**Impact:** Data breach, service unavailable, unauthorized access to customer data

**Examples:**
- RDS database encryption key compromised
- Data exfiltration (GL entries, employee payroll data)
- Admin account hijacked
- API down (multiple customers cannot access platform)
- Ransomware infection

**Escalation:** Immediate notification to CEO, CFO, Legal, Security Lead

### High (Response SLA: 2 hours)
**Impact:** Partial service degradation, unauthorized access contained, potential data exposure

**Examples:**
- Single GL entry modified without audit trail
- Failed login attacks (brute force detected)
- Certificate expiration < 7 days
- Vulnerability in production code (unpatched)
- Suspicious activity from admin IP address

**Escalation:** Notification to CTO, Security Lead, affected team

### Medium (Response SLA: 24 hours)
**Impact:** Security control degradation, vulnerability discovered, suspicious activity

**Examples:**
- Development environment breach (staging data)
- Outdated dependencies in non-critical service
- Missing security headers on some endpoints
- Weak password policy not enforced
- Unauthorized SSH key generated

**Escalation:** Notification to Security Lead, relevant team lead

### Low (Response SLA: 5 days)
**Impact:** Best practice violation, informational

**Examples:**
- Typo in security documentation
- Missing encryption on internal-only API
- Unused VPC security group rule
- Log retention policy not fully implemented
- User data export feature missing

**Escalation:** Ticket created, scheduled in next sprint

---

## 2. INCIDENT RESPONSE TIMELINE

### Phase 1: Detection (0 min)
**Goal:** Identify that an incident has occurred

**Automated Detection:**
- [ ] Intrusion detection system (AWS GuardDuty) alerts
- [ ] Failed login attempts > 5 in 15 minutes
- [ ] Unusual data access (1000+ GL entries queried in 1 min)
- [ ] API error rate > 5%
- [ ] RDS CPU > 90% sustained
- [ ] Unauthorized user creation attempt
- [ ] Audit log modification attempt

**Manual Detection:**
- [ ] Customer reports data discrepancy
- [ ] Employee reports suspicious email
- [ ] Security researcher reports vulnerability
- [ ] Monitoring dashboard alert
- [ ] User forgot password, account compromised

**Initial Assessment:**
- [ ] Confirm incident occurred (not false positive)
- [ ] Gather initial context (affected system, users, timeframe)
- [ ] Assign incident number (INC-YYYYMMDD-001)
- [ ] Trigger incident response process
- [ ] Notify on-call security team (via PagerDuty)

**Documentation:**
- [ ] Log initial report in JIRA ticket
- [ ] Record detection time, source, initial severity guess
- [ ] Include relevant logs/screenshots

```typescript
// Automated alert example
async function monitorSecurityEvents() {
  const failedLogins = await db.query(
    `SELECT COUNT(*) as count FROM login_attempts 
     WHERE status = 'failure' 
     AND timestamp > NOW() - INTERVAL 15 MINUTES
     GROUP BY email, ip_address
     HAVING COUNT(*) > 5`
  );

  if (failedLogins.rows.length > 0) {
    // Critical incident - brute force attempt
    await escalateIncident({
      severity: 'high',
      type: 'brute_force',
      details: failedLogins.rows,
      timestamp: new Date(),
    });

    // Trigger automated response: lock account
    for (const row of failedLogins.rows) {
      await lockAccountTemporarily(row.email);
    }
  }
}
```

### Phase 2: Containment (0-30 min for critical)
**Goal:** Stop the attack and prevent further damage

**Immediate Actions (First 5 Minutes):**
- [ ] Isolate affected system (if safe to do so)
  - [ ] Example: Stop API server if code injection detected
  - [ ] Example: Revoke compromised AWS IAM credentials
  - [ ] Example: Disable compromised user account
- [ ] Preserve evidence
  - [ ] Take EBS snapshot (for forensics)
  - [ ] Export CloudTrail logs (CloudWatch Logs)
  - [ ] Screenshot error pages/logs
  - [ ] Enable VPC Flow Logs if not already enabled
- [ ] Notify stakeholders
  - [ ] Incident commander (assign if multiple responders)
  - [ ] Team leads for affected systems
  - [ ] Legal (for potential breach notification)
- [ ] Create war room (Slack channel: #incident-INC-001)

**Short-Term Containment (5-30 Minutes):**
- [ ] **If data breach:**
  - [ ] Determine scope: What data? How many users?
  - [ ] Check encryption status: Was data encrypted?
  - [ ] Determine exfiltration: Was data copied or viewed?
  - [ ] Query audit logs: Access timestamps, user IDs
  
- [ ] **If service outage:**
  - [ ] Failover to standby (RDS Multi-AZ automatic failover)
  - [ ] Restart services (ECS auto-recovery)
  - [ ] Scale up compute if needed
  - [ ] Route traffic away from affected region
  
- [ ] **If unauthorized access:**
  - [ ] Force password reset for compromised account
  - [ ] Revoke all active sessions (clear JWT tokens from Redis)
  - [ ] Review account activity in audit logs
  - [ ] Check what the attacker accessed
  - [ ] Disable 2FA recovery codes if compromised
  
- [ ] **If malware/ransomware:**
  - [ ] Isolate infected instance (terminate, don't reboot)
  - [ ] Take snapshot for forensics
  - [ ] Scan all other instances (antivirus/EDR)
  - [ ] Check S3 for suspicious files
  - [ ] Review CloudTrail for lateral movement

**Example: Compromised Credentials Containment**
```typescript
async function containBreachedCredentials(breachType: 'admin' | 'service' | 'api') {
  // Immediate actions (< 1 min)
  if (breachType === 'admin') {
    // Revoke all admin sessions
    await redis.del('active_sessions:admin:*');

    // Force password reset
    await db.query(
      `UPDATE users SET force_password_reset = true 
       WHERE role_id = 'admin'`
    );

    // Disable API keys
    await disableAllAPIKeys('admin');

    // Revoke 2FA recovery codes
    await db.query(
      `DELETE FROM mfa_recovery_codes WHERE user_role = 'admin'`
    );
  }

  // Log containment action
  await auditLogger.logEvent({
    event_type: 'security:incident_contained',
    entity_type: 'incident',
    entity_id: `breach_${breachType}_${Date.now()}`,
    status: 'success',
    after_state: {
      breach_type: breachType,
      contained_at: new Date().toISOString(),
      actions_taken: [
        'sessions_revoked',
        'password_reset_enforced',
        'api_keys_disabled',
        'recovery_codes_deleted'
      ],
    },
  });
}
```

### Phase 3: Investigation & Forensics (30 min - 24 hours)
**Goal:** Determine root cause and full scope of incident

**Investigation Steps:**
1. **Timeline Reconstruction**
   - [ ] Query audit_log for relevant entries
   - [ ] Use hash chain to verify log integrity
   - [ ] Identify first abnormal event
   - [ ] Map attacker actions chronologically

2. **Scope Assessment**
   - [ ] How many users affected? (query audit_log)
   - [ ] What data accessed? (after_state field)
   - [ ] When did it start? (timestamp)
   - [ ] When was it contained? (detection time)
   - [ ] Calculate potential exposure:
     ```typescript
     const scope = {
       startTime: '2025-01-15 14:22:00',
       endTime: '2025-01-15 14:45:00',
       durationMinutes: 23,
       affectedUsers: 5,
       dataTypes: ['gl_entry', 'employee_ssn'],
       accessType: 'read_only', // or 'read_write'
     };
     ```

3. **Root Cause Analysis**
   - [ ] How did attacker gain access?
     - [ ] Phishing email? (check email gateway logs)
     - [ ] Credential brute force? (check CloudTrail login failures)
     - [ ] Exploited vulnerability? (check application logs)
     - [ ] Supply chain compromise? (check dependencies)
   - [ ] Why wasn't it detected sooner?
   - [ ] What controls failed?

4. **Forensic Evidence Collection**
   - [ ] Export CloudTrail logs for 24-hour period before/after
   - [ ] Export VPC Flow Logs (network analysis)
   - [ ] Download application logs from CloudWatch
   - [ ] Query database for suspicious modifications
   - [ ] Screenshot error pages, configurations
   - [ ] Store evidence in secure S3 bucket (encrypted, versioned)

**Investigation Tools:**
- [ ] **Audit Log Analysis:**
  ```bash
  # Query audit_log for specific user's actions
  SELECT * FROM audit_log 
  WHERE user_id = 'suspicious_user' 
  AND timestamp > NOW() - INTERVAL 24 HOURS
  ORDER BY timestamp;
  ```

- [ ] **Network Analysis:**
  ```bash
  # Query VPC Flow Logs for connections to RDS
  aws logs filter-log-events \
    --log-group-name /aws/vpc/flowlogs \
    --filter-pattern "[account_id, interface_id, srcaddr, dstaddr=\"10.0.1.100\", ...]"
  ```

- [ ] **Access Pattern Analysis:**
  ```typescript
  // Detect unusual access patterns
  async function detectAnomalousAccess(userId: string) {
    const recentActivity = await db.query(
      `SELECT event_type, COUNT(*) as count 
       FROM audit_log 
       WHERE user_id = $1 AND timestamp > NOW() - INTERVAL 1 HOUR
       GROUP BY event_type`,
      [userId]
    );

    const baselineActivity = await db.query(
      `SELECT event_type, AVG(daily_count) as avg
       FROM (
         SELECT event_type, DATE(timestamp), COUNT(*) as daily_count
         FROM audit_log
         WHERE user_id = $1 AND timestamp > NOW() - INTERVAL 30 DAYS
         GROUP BY event_type, DATE(timestamp)
       ) daily
       GROUP BY event_type`
    );

    // Compare and flag anomalies
    for (const recent of recentActivity.rows) {
      const baseline = baselineActivity.rows.find(b => b.event_type === recent.event_type);
      if (recent.count > (baseline?.avg || 1) * 10) {
        console.warn(`Anomaly: ${recent.event_type} count ${recent.count} vs baseline ${baseline?.avg}`);
      }
    }
  }
  ```

### Phase 4: Eradication (1-24 hours)
**Goal:** Remove the attacker and patch the vulnerability

**Actions:**
- [ ] **If compromised credentials:**
  - [ ] Rotate leaked credentials
  - [ ] Generate new API keys
  - [ ] Reset passwords
  - [ ] Update SSH public keys

- [ ] **If vulnerability:**
  - [ ] Deploy code patch
  - [ ] Rollback to previous safe version (if patch takes time)
  - [ ] Verify patch effectiveness (re-test vulnerability)
  - [ ] Deploy to all environments (dev, staging, prod)

- [ ] **If malware:**
  - [ ] Remove malware files
  - [ ] Terminate infected instances
  - [ ] Rebuild from clean image
  - [ ] Verify no persistence mechanisms

- [ ] **If data breach:**
  - [ ] Reset access logs / rotate credentials
  - [ ] Check for attacker backdoors
  - [ ] Patch exploited vulnerability
  - [ ] Review and strengthen access controls

**Example: Patch Deployment**
```typescript
async function deploySecurityPatch(version: string) {
  try {
    // 1. Deploy to staging
    await deployToEnvironment('staging', version);
    console.log('Patch deployed to staging');

    // 2. Run security tests
    const testResults = await runSecurityTests('staging', version);
    if (!testResults.passed) {
      throw new Error('Security tests failed: ' + testResults.errors.join(', '));
    }

    // 3. Deploy to production
    await deployToEnvironment('production', version);
    console.log('Patch deployed to production');

    // 4. Verify in production
    await verifyDeployment('production');

    // 5. Log eradication
    await auditLogger.logEvent({
      event_type: 'security:vulnerability_patched',
      entity_type: 'vulnerability',
      entity_id: `patch_${version}`,
      status: 'success',
      after_state: {
        version,
        deployed_at: new Date().toISOString(),
        affected_systems: ['api-server', 'auth-service'],
      },
    });
  } catch (error) {
    console.error('Patch deployment failed:', error);
    // Rollback
    await rollbackDeployment();
  }
}
```

### Phase 5: Recovery (24-72 hours)
**Goal:** Restore systems to normal operation

**Actions:**
- [ ] Monitor system stability
- [ ] Verify all services operational
- [ ] Validate data integrity (checksums, reconciliation)
- [ ] Restore from backup if data corrupted
- [ ] Notify customers that issue resolved
- [ ] Close containment measures
  - [ ] Re-enable optional services
  - [ ] Restore normal traffic routing
  - [ ] Release reserved capacity

### Phase 6: Post-Incident Review (3-7 days)
**Goal:** Learn from incident and prevent recurrence

**Post-Mortem Meeting:**
- [ ] Participants: Incident commander, affected teams, security lead, CTO
- [ ] Duration: 1-2 hours
- [ ] Timeline: Within 48 hours of incident resolution

**Post-Mortem Template:**
```markdown
## Incident Post-Mortem: INC-20250115-001

**Summary:** Unauthorized access to payroll GL entries via brute force attack on finance_controller account.

**Impact:** 
- Duration: 23 minutes (14:22 - 14:45)
- Users affected: 1 (finance_controller John Smith)
- Data: 127 GL entries queried (read-only, not modified)
- Severity: High

**Timeline:**
- 14:22 - First failed login attempt detected
- 14:25 - Account locked after 5 failures
- 14:26 - Account unlocked due to admin reset request
- 14:27 - Attack resumed, 127 GL entries accessed
- 14:45 - Unusual activity detected, account disabled
- 14:52 - Root cause identified (account locked too briefly)

**Root Cause:** 
Account lockout timeout was 15 minutes, but admin manually unlocked account after 3 minutes, allowing attacker to continue. Attacker likely obtained password from phishing email (similar attack on other orgs observed).

**What Went Well:**
- Audit log captured all access with timestamps
- Automated alerts detected brute force attempt
- System locked account automatically

**What Could Improve:**
- Admin should not manually unlock account during ongoing attack
- Brute force response (automatic unlock) too permissive
- No email alert to user about failed login attempts
- No SMS 2FA requirement for initial login (added later)

**Action Items:**
1. Enforce minimum 1-hour lockout period (non-overridable)
2. Send email alert on 3+ failed login attempts
3. Require 2FA re-verification after password reset
4. Review admin unlock procedures in runbook
5. Implement phishing detection for employee emails

**Owner:** Security Lead | Due: 2025-01-22
```

**Action Items Tracking:**
- [ ] Create tickets for all follow-ups
- [ ] Assign owner and deadline
- [ ] Track completion in JIRA
- [ ] Verify fix effectiveness

---

## 3. COMMUNICATION PLAN

### Internal Notification

**Immediate (< 5 min):**
- [ ] PagerDuty alert to on-call security engineer
- [ ] Slack message to #security-oncall channel
- [ ] Email to security@ledgr.com

**30 Minutes:**
- [ ] Slack update to #incident-INC-001 with status
- [ ] Escalation email to CTO, CFO if critical
- [ ] Incident response meeting scheduled (video call link in Slack)

**Hourly Updates:**
- [ ] Slack updates every 30 minutes
- [ ] Status report (detection time, scope, actions taken, ETA)
- [ ] Example: "Detected unauthorized API access at 14:22. Affecting 1 customer (Org-123). Account locked. Investigation ongoing. ETA 30 min for root cause."

### External Notification (Data Breach)

**If breach confirmed (within 24-48 hours):**
- [ ] Determine scope (data type, # of users)
- [ ] Consult legal (is notification required?)
- [ ] Draft notification email (see template below)
- [ ] Send to affected customers/employees
- [ ] Notify regulators (if required by law)

**Notification Timing:**
- [ ] 72 hours for GDPR (if high-risk)
- [ ] 30 days for CCPA
- [ ] 30 days for UAE Data Protection Law
- [ ] Immediately for material breach (> 10% of data exposed)

**Breach Notification Template:**

```
Subject: Security Incident Notification - Action Recommended

Dear [Customer Name],

We are writing to inform you of a security incident affecting your account.

INCIDENT SUMMARY:
On [DATE], we discovered unauthorized access to your payroll records. We have contained the issue and are investigating the root cause.

WHAT HAPPENED:
[Specific, factual description]
- Attacker accessed [specific data types]
- Duration: [X minutes]
- Access was read-only (data not modified)
- No financial transactions were affected

DATA AFFECTED:
- Employee names: [count]
- Employee SSNs: [count]
- Salary information: [count]
- GL entries: [count]

WHAT WE'RE DOING:
- Contained the unauthorized access
- Disabled the compromised account
- Reviewed all account activity for 30 days prior
- Strengthened authentication controls
- Notified law enforcement

WHAT YOU SHOULD DO:
- Monitor payroll for discrepancies
- Review account activity on your portal
- Change your password (instructions: [link])
- Enable 2FA if not already active (instructions: [link])
- Watch for suspicious financial activity (emails from banks, loan applications, etc.)

QUESTIONS:
Contact our security team: security@ledgr.com
Call our support line: +971-4-XXX-XXXX (available 24/7)

We sincerely apologize for this incident and take data security very seriously.

Best regards,
[CEO Name]
Chief Executive Officer
Ledgr
```

---

## 4. INCIDENT RESPONSE TEAM

### Roles & Responsibilities

**Incident Commander** (assigns during incident)
- [ ] Leads response effort
- [ ] Coordinates between teams
- [ ] Makes containment/remediation decisions
- [ ] Communicates status to executives
- [ ] Prepares post-mortem

**Security Lead** (on-call rotation)
- [ ] Detects and initial assessment
- [ ] Triggers incident response
- [ ] Leads forensic investigation
- [ ] Manages evidence preservation
- [ ] Authorizes eradication steps

**CTO / Technical Lead**
- [ ] Provides technical expertise
- [ ] Authorizes code patches
- [ ] Oversees system recovery
- [ ] Validates fix effectiveness

**Operations Lead**
- [ ] Manages infrastructure (failovers, scaling)
- [ ] Coordinates with AWS (support cases)
- [ ] Restores backups if needed
- [ ] Monitors system stability

**Legal**
- [ ] Advises on breach notification requirements
- [ ] Reviews external communications
- [ ] Coordinates with regulators
- [ ] Documents incident for legal hold

**Communications Lead**
- [ ] Drafts customer notifications
- [ ] Manages PR response
- [ ] Updates status page
- [ ] Coordinates media response

### Escalation Matrix

```
Severity     Response SLA    Escalation Path
──────────   ─────────────   ───────────────
Critical     30 min         PagerDuty → Security Lead → CTO → CEO
High         2 hours        PagerDuty → Security Lead → CTO
Medium       24 hours       Email → Security Lead
Low          5 days         JIRA ticket
```

---

## 5. TOOLS & RESOURCES

### Investigation Tools
- [ ] **CloudTrail Explorer:** cloudtrail.aws.amazon.com
- [ ] **CloudWatch Logs Insights:** Query syntax for searching logs
- [ ] **VPC Flow Logs:** Filter and analyze network traffic
- [ ] **AWS GuardDuty:** Automated threat detection
- [ ] **Audit Log Database:** Query with SQL
- [ ] **Git History:** git log --all --oneline --graph

### Communication Tools
- [ ] **Slack:** #incident-INC-XXX channel
- [ ] **Video Call:** Zoom / Google Meet
- [ ] **Email:** security@ledgr.com
- [ ] **PagerDuty:** On-call alerting
- [ ] **JIRA:** Incident tracking

### Recovery Tools
- [ ] **AWS Backup:** RDS point-in-time restore
- [ ] **Git:** Rollback code to previous version
- [ ] **Terraform:** Recreate infrastructure from code
- [ ] **Docker:** Container image rollback

---

## 6. TESTING & DRILLS

### Quarterly Incident Response Drills
- [ ] **Scope:** Tabletop exercise simulating breach
- [ ] **Duration:** 1-2 hours
- [ ] **Participants:** Security, IT, Legal, Communications
- [ ] **Scenario:** [Example: "Attacker accessed 500 GL entries for 2 hours"]
- [ ] **Goals:**
  - [ ] Test communication plan
  - [ ] Verify tool access
  - [ ] Practice decision-making
  - [ ] Identify gaps

### Annual Disaster Recovery Test
- [ ] **Scope:** Full system failover and recovery
- [ ] **Duration:** 4-8 hours
- [ ] **Steps:**
  - [ ] Failover to standby region
  - [ ] Verify all services operational
  - [ ] Restore from backup
  - [ ] Validate data integrity
  - [ ] Failback to primary region

---

## 7. DOCUMENTATION & COMPLIANCE

### Incident Record (Required for SOC 2 / GDPR / CCPA)
- [ ] Incident number (INC-YYYYMMDD-001)
- [ ] Detection date/time
- [ ] Detection method
- [ ] Severity level
- [ ] Scope (affected users, data)
- [ ] Root cause
- [ ] Remediation actions
- [ ] Resolution date/time
- [ ] Post-mortem findings
- [ ] Follow-up items & status

### Retention
- [ ] Keep incident records for minimum 3 years
- [ ] Store in encrypted database or secure S3 bucket
- [ ] Immutable audit log (never delete)
- [ ] Accessible to auditors upon request

**Regulatory Requirements:**
- [ ] **SOC 2:** Annual audit of incident response process
- [ ] **GDPR:** Document breach response (if personal data breach)
- [ ] **CCPA:** Document breach (if California resident data)
- [ ] **UAE Data Protection:** Document breach notification sent

---

## 8. ESCALATION CONTACTS

```
Role                    Name        Email               Phone
────────────────────    ─────────   ───────────────────────  ──────────
Chief Security Officer  [Name]      [email@ledgr.com]   [+971-XXX-XXXX]
Chief Technology Officer [Name]     [email@ledgr.com]   [+971-XXX-XXXX]
Chief Financial Officer [Name]      [email@ledgr.com]   [+971-XXX-XXXX]
Chief Executive Officer [Name]      [email@ledgr.com]   [+971-XXX-XXXX]
Legal Counsel          [Name]      [email@ledgr.com]   [+971-XXX-XXXX]
Operations Lead        [Name]      [email@ledgr.com]   [+971-XXX-XXXX]
```

---

## 9. KEY METRICS

**Track for each incident:**
- [ ] Time to detect (TTD)
- [ ] Time to contain (TTC)
- [ ] Time to resolve (TTR)
- [ ] Scope (# users, data records affected)
- [ ] Root cause category (phishing, vulnerability, misconfiguration, insider, etc.)
- [ ] Impact (data exfiltration, service downtime, financial)

**Target SLAs:**
- [ ] Critical: TTD < 5 min, TTC < 30 min
- [ ] High: TTD < 15 min, TTC < 2 hours
- [ ] Medium: TTD < 1 hour, TTC < 24 hours

**Reporting:**
- [ ] Monthly incident report to executive team
- [ ] Quarterly trend analysis (incident types, root causes)
- [ ] Annual metrics for board review
