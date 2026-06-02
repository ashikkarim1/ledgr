-- ============================================================================
-- SETUP TESTER ACCOUNT FOR PRODUCTION DEMO
-- Creates tester@ledgr.ae with Hilal Trading FZ-LLC organization
-- ============================================================================

-- 1. Create the organization for Hilal Trading FZ-LLC
INSERT INTO organizations (
  id, name, slug, subscription_plan, subscription_status,
  billing_email, max_users, max_agents,
  industry, country_code,
  features_vat_enabled, features_agent_enabled,
  data_residency,
  created_at, updated_at
) VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'Hilal Trading FZ-LLC',
  'hilal-trading-fz-llc',
  'free_trial',
  'active',
  'tester@ledgr.ae',
  5,
  5,
  'Trading & Distribution',
  'AE',
  true,
  true,
  'ae',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- 2. Create the tester user
INSERT INTO users (
  id, organization_id, email, first_name, last_name,
  password_hash, status,
  created_at, updated_at
) VALUES (
  'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'tester@ledgr.ae',
  'Test',
  'User',
  '$2a$12$MBiOMOlM.aVkcJcaWvaDfOjvhqObGgz9xO019Ik62AYnhDnGd7Vda',
  'active',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- 3. Update the user to link it to the organization if needed
UPDATE users 
SET organization_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
WHERE email = 'tester@ledgr.ae' AND organization_id IS NULL;

-- 4. Verify the setup
SELECT 
  u.id as user_id,
  u.email,
  u.first_name,
  u.last_name,
  o.id as org_id,
  o.name as org_name,
  o.subscription_plan
FROM users u
LEFT JOIN organizations o ON u.organization_id = o.id
WHERE u.email = 'tester@ledgr.ae'
LIMIT 1;
