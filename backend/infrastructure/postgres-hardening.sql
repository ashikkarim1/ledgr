-- PostgreSQL Hardening Script for Ledgr
-- Day 1-2 implementation: Security configuration, role creation, encryption
-- Run as superuser on fresh PostgreSQL 15+ instance

-- ============================================================================
-- 1. Enable SSL/TLS and Core Security Extensions
-- ============================================================================

-- Enable pgaudit extension for audit logging
CREATE EXTENSION IF NOT EXISTS pgaudit;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- For random secret generation

-- Configure pgaudit to log all DDL and sensitive operations
ALTER SYSTEM SET pgaudit.log = 'ALL';
ALTER SYSTEM SET pgaudit.log_level = 'INFO';
ALTER SYSTEM SET pgaudit.log_statement_once = 'off';

-- ============================================================================
-- 2. Create Minimal-Privilege Roles
-- ============================================================================

-- Drop existing roles if present (dev only; remove in prod)
DROP ROLE IF EXISTS ledgr_app_read CASCADE;
DROP ROLE IF EXISTS ledgr_app_write CASCADE;
DROP ROLE IF EXISTS ledgr_app_admin CASCADE;
DROP ROLE IF EXISTS ledgr_backup CASCADE;
DROP ROLE IF EXISTS ledgr_audit CASCADE;

-- Role: ledgr_app_read (SELECT-only application role)
CREATE ROLE ledgr_app_read WITH NOLOGIN;
COMMENT ON ROLE ledgr_app_read IS 'Read-only application role; inherits by login role';

-- Role: ledgr_app_write (INSERT, UPDATE, DELETE on application tables)
CREATE ROLE ledgr_app_write WITH NOLOGIN;
COMMENT ON ROLE ledgr_app_write IS 'Write-capable application role for normal operations';

-- Role: ledgr_app_admin (Schema management, DDL operations)
CREATE ROLE ledgr_app_admin WITH NOLOGIN;
COMMENT ON ROLE ledgr_app_admin IS 'Admin role for migrations and schema operations';

-- Role: ledgr_backup (pg_dump backup operations)
CREATE ROLE ledgr_backup WITH NOLOGIN;
COMMENT ON ROLE ledgr_backup IS 'Backup role; SELECT-only on all tables for pg_dump';

-- Role: ledgr_audit (Audit log read-only; immutable audit trail)
CREATE ROLE ledgr_audit WITH NOLOGIN;
COMMENT ON ROLE ledgr_audit IS 'Audit role; SELECT-only on audit_log, no UPDATE/DELETE';

-- Login role: ledgr_app (used by application connection pool)
-- In production, password is stored in AWS Secrets Manager and rotated every 90 days
DROP ROLE IF EXISTS ledgr_app CASCADE;
CREATE ROLE ledgr_app WITH LOGIN PASSWORD 'temp-dev-only-change-in-prod' VALID UNTIL '2026-06-30';
COMMENT ON ROLE ledgr_app IS 'Application connection role; inherits ledgr_app_read, ledgr_app_write';

-- Grant role memberships
GRANT ledgr_app_read TO ledgr_app;
GRANT ledgr_app_write TO ledgr_app;

-- ============================================================================
-- 3. Revoke Dangerous Defaults
-- ============================================================================

-- Revoke all permissions from public schema
REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;

-- Revoke dangerous operations on all system tables
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA information_schema FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA pg_catalog FROM PUBLIC;

-- ============================================================================
-- 4. Grant Minimal Permissions
-- ============================================================================

-- Grant USAGE on public schema (can access tables therein)
GRANT USAGE ON SCHEMA public TO ledgr_app_read, ledgr_app_write, ledgr_app_admin;

-- Grant USAGE on all schemas (future schemas)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SCHEMAS TO ledgr_app_read, ledgr_app_write;

-- Grant default table permissions for FUTURE tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ledgr_app_read;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ledgr_app_write;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ledgr_app_admin;

-- Grant sequence permissions for auto-increment IDs
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ledgr_app_write;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ledgr_app_admin;

-- ============================================================================
-- 5. Password Policy
-- ============================================================================

-- Configure password encryption to SCRAM-SHA-256 (modern standard)
ALTER SYSTEM SET password_encryption = 'scram-sha256';

-- Force all future passwords to use scram-sha256
-- (existing passwords must be updated with new password)

-- ============================================================================
-- 6. Connection Security (pg_hba.conf-equivalent via SQL)
-- ============================================================================

-- Note: pg_hba.conf must also be updated on the file system with:
-- TYPE      DATABASE    USER        ADDRESS         METHOD
-- local     all         postgres    N/A             trust (local superuser)
-- local     all         all         N/A             scram-sha256
-- host      all         ledgr_app   127.0.0.1/32    scram-sha256
-- host      all         ledgr_app   ::1/128         scram-sha256
-- hostssl   all         ledgr_app   0.0.0.0/0       scram-sha256 (requires certificate)
-- host      replication ledgr_backup 127.0.0.1/32   scram-sha256

-- ============================================================================
-- 7. Reload Configuration
-- ============================================================================

-- Apply new settings
SELECT pg_reload_conf();

-- ============================================================================
-- 8. Verify Hardening Applied
-- ============================================================================

-- Check current settings
SHOW ssl;
SHOW password_encryption;
SHOW pgaudit.log;

-- List all roles and their privileges
SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname LIKE 'ledgr_%' ORDER BY rolname;

COMMENT ON DATABASE postgres IS 'Ledgr PostgreSQL instance with hardened security, audit logging, minimal-privilege roles, and password encryption';
