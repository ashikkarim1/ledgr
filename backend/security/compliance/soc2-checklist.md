# SOC 2 Type II Compliance Checklist

**Certification Scope:** Ledgr financial operations platform (GL, VAT, Tax, Payroll)  
**Framework:** AICPA Trust Service Criteria (Security, Availability, Processing Integrity, Confidentiality, Privacy)  
**Audit Frequency:** Annual (Type II requires 6+ months of operational evidence)  
**Effective Date:** 2024-01-01

---

## 1. SECURITY PRINCIPLE (CC - Common Criteria)

### CC1: Organization Obtains or Generates, Uses, and Communicates Relevant, Quality Information

- [ ] **CC1.1** Information System Portfolio
  - [ ] Maintain inventory of all systems, databases, applications
  - [ ] Document system dependencies and data flows
  - [ ] Include cloud services (AWS), third-party integrations
  - [ ] Update quarterly

- [ ] **CC1.2** Information System Monitoring
  - [ ] Enable AWS CloudTrail for all API calls
  - [ ] Enable VPC Flow Logs for network traffic
  - [ ] Enable RDS Enhanced Monitoring
  - [ ] Centralize logs to CloudWatch and ELK stack
  - [ ] Retain logs for 7 years minimum

- [ ] **CC1.3** Information Quality
  - [ ] Document data accuracy requirements per entity
  - [ ] Implement data validation rules in API
  - [ ] Quarterly data quality audits
  - [ ] Reconciliation procedures for GL entries

- [ ] **CC1.4** Information System Capabilities
  - [ ] Document all security features (encryption, 2FA, audit logging)
  - [ ] Security architecture document maintained and current
  - [ ] Threat model updated annually
  - [ ] Penetration test results documented

### CC2: The Entity Obtains or Generates, Uses, and Communicates Relevant, Quality Information Regarding the Objectives, Responsibilities, and Accountabilities

- [ ] **CC2.1** Roles and Responsibilities
  - [ ] Document RACI matrix for security (who Responsible, Accountable, Consulted, Informed)
  - [ ] 8 roles defined: office_manager, finance_controller, vat_specialist, tax_specialist, cfo, audit_manager, payroll_officer, regulatory_officer
  - [ ] RBAC matrix with 100+ permissions documented
  - [ ] Update when organizational structure changes

- [ ] **CC2.2** Competence and Accountability
  - [ ] Annual security training for all staff
  - [ ] Role-specific training (CFO, audit, payroll)
  - [ ] Training records maintained for 3 years
  - [ ] Competency assessment for security roles

- [ ] **CC2.3** Accountability
  - [ ] Security incident response plan (30-min SLA)
  - [ ] Incident severity levels defined
  - [ ] Escalation procedures documented
  - [ ] Post-mortem process documented

### CC3: The Entity Obtains or Generates, Uses, and Communicates Relevant, Quality Information, and Otherwise Internally Communicates Necessary Information

- [ ] **CC3.1** Objectives and Responsibilities
  - [ ] Security policy communicated to all employees
  - [ ] Annual policy acknowledgment signed by all staff
  - [ ] Policy available in employee handbook

- [ ] **CC3.2** Information Processing
  - [ ] Data classification policy (public, internal, confidential, restricted)
  - [ ] Handling requirements documented per classification
  - [ ] Encryption requirements: AES-256-GCM at rest, TLS 1.3+ in transit
  - [ ] Applied to all data sources

- [ ] **CC3.3** Third-Party Communications
  - [ ] Vendor security requirements documented (AWS, Stripe, Twilio)
  - [ ] Vendor audit results reviewed annually
  - [ ] Data processing agreements (DPA) in place
  - [ ] Incident notification requirements defined

### CC4: The Entity Selects, Develops, and Performs Ongoing and Corrective Actions

- [ ] **CC4.1** Objectives and Responsibilities
  - [ ] Risk register maintained with controls per risk
  - [ ] Risk assessment quarterly
  - [ ] Controls mapped to risks

- [ ] **CC4.2** Risk Identification and Analysis
  - [ ] Annual threat modeling exercise
  - [ ] Vulnerability scanning (automated and manual)
  - [ ] Penetration testing (annual, with detailed report)
  - [ ] Risk scoring matrix: likelihood × impact

- [ ] **CC4.3** Control Implementation
  - [ ] Encryption controls: AES-256-GCM, TLS 1.3+, bcrypt ≥12 rounds
  - [ ] Authentication: 2FA mandatory for admins, 30-min session timeout
  - [ ] Authorization: 8-role RBAC, 100+ fine-grained permissions
  - [ ] Audit logging: INSERT-only, SHA-256 hash chain, 7-year retention
  - [ ] Rate limiting: Per-user (100/min, 1000/hr, 10k/day), per-IP (500/min, 5k/hr)
  - [ ] Brute force protection: 5 attempts → 15-min lockout

- [ ] **CC4.4** Monitoring of Controls
  - [ ] Weekly control effectiveness reviews
  - [ ] Monthly exception reports
  - [ ] Quarterly audit of access logs (check for unauthorized access)
  - [ ] Track control deviations and remediation

- [ ] **CC5.1** Logical Access Controls
  - [ ] User authentication via JWT (RS256)
  - [ ] Token revocation via Redis
  - [ ] Session management: max 5 concurrent sessions per user
  - [ ] Inactivity timeout: 30 minutes
  - [ ] IP change detection
  - [ ] Privileged access review quarterly

- [ ] **CC5.2** Prior to Issue
  - [ ] Access requests require manager approval
  - [ ] Approval documented in audit log
  - [ ] User provisioning checklist completed

- [ ] **CC5.3** Access Revocation
  - [ ] Immediate termination on employee exit
  - [ ] Role-based access revocation (disable all roles)
  - [ ] VPN/SSH key revocation
  - [ ] Audit log captures revocation event

- [ ] **CC5.4** Access Rights Segregation
  - [ ] Segregation of duties enforced in code/DB
  - [ ] GL posting requires different user from approval
  - [ ] VAT filing requires regulatory_officer role
  - [ ] Payroll requires approval by separate finance_controller

- [ ] **CC6.1** Logical Security
  - [ ] TLS 1.3 on all traffic (ALB with TLS 1.3 certificate)
  - [ ] VPC isolation: public subnets for ALB, private for ECS/RDS
  - [ ] Security groups restrict inbound/outbound traffic
  - [ ] WAF blocks common attacks (SQLi, XSS, CSRF)

- [ ] **CC6.2** Malware Prevention
  - [ ] Container image scanning (ECR with Trivy)
  - [ ] Dependency vulnerability scanning (npm audit, Snyk)
  - [ ] No unsigned containers in production
  - [ ] Antivirus if applicable to deployment

- [ ] **CC6.3** Network Segmentation
  - [ ] RDS in private subnet (no direct internet access)
  - [ ] ECS Fargate tasks in private subnet
  - [ ] Bastion host for admin access
  - [ ] Database credentials in AWS Secrets Manager (encrypted by KMS)

- [ ] **CC6.4** Encryption Management
  - [ ] Key management plan documented
  - [ ] KMS master key HSM-backed (CloudHSM or AWS managed)
  - [ ] DEK rotation: 90 days for database credentials
  - [ ] JWT key rotation: manual, when compromised
  - [ ] Key access restricted to minimal set of IAM roles

- [ ] **CC6.5** Configuration Management
  - [ ] Infrastructure as Code (Terraform) in version control
  - [ ] Change log: all infrastructure changes tracked
  - [ ] Security group rules reviewed quarterly
  - [ ] Approved change list (CAB) for production changes

- [ ] **CC7.1** Change Management
  - [ ] Code review required (2 approvals) before merge
  - [ ] Automated security scanning on PR (SAST)
  - [ ] Staging environment mirrors production
  - [ ] Deployment procedure documented and tested

- [ ] **CC7.2** Change Monitoring
  - [ ] Git history immutable (protect main branch)
  - [ ] Commit signatures enforced (GPG signing)
  - [ ] Deployment logs in CloudWatch (all changes logged)
  - [ ] Rollback procedure documented

- [ ] **CC7.3** Recovery
  - [ ] Automated backups: daily for RDS (30-day retention)
  - [ ] Backup encryption: KMS-encrypted
  - [ ] Backup testing: monthly restore to test environment
  - [ ] RTO/RPO defined: RTO 4 hours, RPO 1 hour

- [ ] **CC8.1** Incident Response
  - [ ] Incident response plan (30-min SLA for critical)
  - [ ] Severity levels: critical (30 min), high (2 hours), medium (24 hours), low (5 days)
  - [ ] Escalation matrix defined
  - [ ] Incident tracking system (JIRA/ServiceNow)

- [ ] **CC8.2** Incident Investigation
  - [ ] Forensics capability: preserve logs, snapshots
  - [ ] Root cause analysis template
  - [ ] Timeline reconstruction from audit logs
  - [ ] Evidence chain of custody documented

- [ ] **CC8.3** Incident Notification
  - [ ] Internal notification to management (30 min)
  - [ ] Customer notification within 72 hours (if data breach)
  - [ ] Notification template pre-drafted
  - [ ] Legal review process documented

- [ ] **CC9.1** Monitoring and Alerting
  - [ ] CloudWatch dashboards (CPU, memory, error rates)
  - [ ] Alerting: PagerDuty for critical alerts
  - [ ] Alert thresholds defined and tested
  - [ ] On-call rotation documented

- [ ] **CC9.2** Availability Monitoring
  - [ ] Uptime SLA: 99.9% (43 minutes/month downtime)
  - [ ] Health checks: every 30 seconds
  - [ ] Multi-AZ RDS (automatic failover)
  - [ ] Load balancer health checks
  - [ ] Synthetic monitoring from multiple regions

---

## 2. AVAILABILITY PRINCIPLE (A - Availability)

- [ ] **A1.1** System Availability
  - [ ] Design for high availability (multi-AZ, auto-scaling)
  - [ ] RDS Multi-AZ with automatic failover
  - [ ] ECS Fargate with minimum 2 tasks per service
  - [ ] ALB health checks with 30-second interval

- [ ] **A1.2** Capacity Planning
  - [ ] Quarterly capacity review
  - [ ] Load testing before major releases
  - [ ] Auto-scaling policies: scale up at 70% CPU, down at 20%
  - [ ] Projected growth planning (3-year forecast)

- [ ] **A1.3** Disaster Recovery
  - [ ] DR plan tested quarterly
  - [ ] Failover to standby region (RTO 4 hours)
  - [ ] Backup restoration testing monthly
  - [ ] Communication plan during outage

---

## 3. PROCESSING INTEGRITY PRINCIPLE (PI - Processing Integrity)

- [ ] **PI1.1** Data Accuracy
  - [ ] GL entry validation (debit = credit)
  - [ ] VAT return calculation verification
  - [ ] Payroll gross-to-net validation
  - [ ] Data completeness checks

- [ ] **PI1.2** Completeness
  - [ ] All GL entries have audit trail
  - [ ] VAT returns have supporting documentation
  - [ ] Payroll runs have employee verification
  - [ ] API request logging (all requests logged)

- [ ] **PI1.3** Timeliness
  - [ ] Processing deadlines enforced (VAT filing deadlines)
  - [ ] Reminders sent 5 days before deadline
  - [ ] Automatic locks after filing date

---

## 4. CONFIDENTIALITY PRINCIPLE (C - Confidentiality)

- [ ] **C1.1** Confidentiality Policies
  - [ ] Data classification policy (public, internal, confidential, restricted)
  - [ ] Confidential data: SSN, bank account, national ID, passport
  - [ ] Masking rules applied in logs and exports

- [ ] **C1.2** Unauthorized Access Prevention
  - [ ] Encryption at rest: AES-256-GCM
  - [ ] Encryption in transit: TLS 1.3+
  - [ ] Database encryption: KMS-backed RDS
  - [ ] Backup encryption: KMS-backed S3

- [ ] **C1.3** Information Leakage
  - [ ] Remove server headers (Server, X-Powered-By)
  - [ ] CSP headers prevent inline scripts
  - [ ] Error messages don't leak system details
  - [ ] API responses don't include unnecessary metadata

---

## 5. PRIVACY PRINCIPLE (P - Privacy)

- [ ] **P1.1** Privacy Notice
  - [ ] Privacy policy on website
  - [ ] Data use described clearly
  - [ ] Third parties listed (AWS, Stripe, Twilio)
  - [ ] Data retention policy specified

- [ ] **P1.2** Consent
  - [ ] GDPR consent checkbox on signup
  - [ ] CCPA "Do Not Sell My Information" checkbox
  - [ ] Consent recorded in audit log
  - [ ] Withdrawal process documented

- [ ] **P2.1** Right to Access
  - [ ] User data export feature
  - [ ] Includes all personal data in machine-readable format
  - [ ] Delivered within 30 days
  - [ ] Audit logged with export date/time/user

- [ ] **P2.2** Right to Deletion
  - [ ] User deletion via admin dashboard
  - [ ] Cascading deletion of related data
  - [ ] Immutable records (audit logs) retained per policy
  - [ ] Deletion completed within 30 days
  - [ ] Confirmation sent to user

---

## Auditor Checklist

- [ ] Review SECURITY_ARCHITECTURE.md (security design)
- [ ] Review encryption.ts (crypto implementations)
- [ ] Review auth-middleware.ts (authentication/authorization)
- [ ] Review audit-logger.ts (audit trail)
- [ ] Review secrets-manager.ts (key rotation)
- [ ] Review rbac.ts (access control)
- [ ] Review security-headers.ts (HTTP security)
- [ ] Review Terraform infrastructure code
- [ ] Review AWS account security settings
- [ ] Interview key personnel (CTO, security, finance)
- [ ] Test user access controls (attempt unauthorized access)
- [ ] Test incident response (simulated breach)
- [ ] Review 6 months of audit logs (check for anomalies)
- [ ] Review change logs (verify approval trail)
- [ ] Review backup and disaster recovery tests
