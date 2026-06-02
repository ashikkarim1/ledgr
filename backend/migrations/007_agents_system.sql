-- Agents System Schema for Multi-Agent Management Platform
-- Created for Ledgr Enterprise Accounting Platform Phase 1

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(50) NOT NULL,
  specialization TEXT[] DEFAULT '{}',
  current_status VARCHAR(20) DEFAULT 'online' CHECK (current_status IN ('online', 'offline', 'busy', 'away')),
  availability_note TEXT,
  max_concurrent_tasks INTEGER DEFAULT 5 CHECK (max_concurrent_tasks >= 1 AND max_concurrent_tasks <= 20),
  utilization_percent DECIMAL(5,2) DEFAULT 0,
  performance_score DECIMAL(5,2) DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, email),
  CONSTRAINT valid_email CHECK (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);

-- Agent assignments table
CREATE TABLE IF NOT EXISTS agent_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'escalated', 'failed')),
  priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  description TEXT,
  resolution_time_minutes INTEGER,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Agent performance metrics table
CREATE TABLE IF NOT EXISTS agent_performance_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  accuracy_percent DECIMAL(5,2) DEFAULT 100,
  total_tasks_completed INTEGER DEFAULT 0,
  escalation_count INTEGER DEFAULT 0,
  average_resolution_time DECIMAL(10,2),
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, agent_id, recorded_at)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agents_org_id ON agents(org_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(current_status);
CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role);
CREATE INDEX IF NOT EXISTS idx_assignments_agent_id ON agent_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_assignments_org_id ON agent_assignments(org_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON agent_assignments(status);
CREATE INDEX IF NOT EXISTS idx_assignments_created_at ON agent_assignments(created_at);
CREATE INDEX IF NOT EXISTS idx_performance_agent_id ON agent_performance_metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_performance_recorded_at ON agent_performance_metrics(recorded_at);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_assignments_updated_at ON agent_assignments;
CREATE TRIGGER update_assignments_updated_at
  BEFORE UPDATE ON agent_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert sample agents for demo (organization: 00000000-0000-0000-0000-000000000000)
INSERT INTO agents (org_id, name, email, phone, role, specialization, current_status, max_concurrent_tasks, performance_score)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'Financial Director',
    'director@ledgr.local',
    '+971501234567',
    'supervisor',
    '{"financial_planning", "reporting", "strategy"}',
    'online',
    8,
    99.8
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'Accounting Manager',
    'manager@ledgr.local',
    '+971501234568',
    'reconciliation',
    '{"bank_reconciliation", "journal_entries", "ledger"}',
    'online',
    6,
    99.7
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'Document Processor',
    'processor@ledgr.local',
    '+971501234569',
    'ap',
    '{"invoice_processing", "expense_capture", "document_ocr"}',
    'online',
    10,
    99.9
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'Bank Verifier',
    'verifier@ledgr.local',
    '+971501234570',
    'ar',
    '{"bank_verification", "statement_analysis", "reconciliation"}',
    'online',
    5,
    100.0
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'Tax Specialist',
    'tax@ledgr.local',
    '+971501234571',
    'tax',
    '{"uae_tax", "vat_compliance", "filing"}',
    'online',
    4,
    99.6
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'Regulatory Filer',
    'filer@ledgr.local',
    '+971501234572',
    'reporting',
    '{"regulatory_compliance", "audit_prep", "financial_reporting"}',
    'online',
    3,
    99.5
  )
ON CONFLICT DO NOTHING;
