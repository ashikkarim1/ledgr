/**
 * Ledgr Agent Configuration Management
 * Per-client agent setup, tuning, integration settings
 */

import {
  AgentType,
  AgentConfig,
  ClientAgentConfig,
  ApprovalThresholds,
  IntegrationSettings,
  EscalationSettings,
} from './agent-types';

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  model: 'claude-opus-4-1',
  temperature: 0.2, // Low temperature for financial accuracy
  max_tokens: 4096,
  top_p: 0.9,
  enabled_integrations: [],
  approval_rules: [],
  escalation_settings: {
    enabled: true,
    escalate_on_errors: true,
    escalate_on_conflicts: true,
    escalate_on_anomalies: true,
    email_recipients: [],
    response_time_hours: 24,
  },
  retry_policy: {
    max_retries: 3,
    initial_delay_ms: 1000,
    max_delay_ms: 30000,
    backoff_multiplier: 2,
  },
};

export const DEFAULT_APPROVAL_THRESHOLDS: ApprovalThresholds = {
  accounts_payable: {
    payment_requires_approval: 50000, // AED 50,000
    invoice_dispute_requires_approval: true,
  },
  accounts_receivable: {
    credit_memo_requires_approval: 25000, // AED 25,000
    collection_letter_requires_approval: true,
  },
  payroll: {
    payroll_requires_approval: true,
    tax_adjustment_requires_approval: true,
  },
  general_ledger: {
    journal_entry_requires_approval: 50000, // AED 50,000
    account_creation_requires_approval: true,
  },
};

// ============================================================================
// Configuration Manager
// ============================================================================

export class AgentConfigManager {
  private database: any;
  private configCache: Map<string, ClientAgentConfig> = new Map();

  constructor(database: any) {
    this.database = database;
  }

  /**
   * Get or create configuration for client
   */
  async getClientConfig(orgId: string): Promise<ClientAgentConfig> {
    // Check cache first
    if (this.configCache.has(orgId)) {
      return this.configCache.get(orgId)!;
    }

    // Try to load from database
    let config = await this.database.getClientAgentConfig(orgId);

    // If not found, create default
    if (!config) {
      config = this.createDefaultConfig(orgId);
      await this.database.saveClientAgentConfig(config);
    }

    this.configCache.set(orgId, config);
    return config;
  }

  /**
   * Create default configuration for new client
   */
  private createDefaultConfig(orgId: string): ClientAgentConfig {
    return {
      org_id: orgId,
      enabled_agents: [
        'accounts_payable',
        'accounts_receivable',
        'general_ledger',
        'reconciliation',
      ],
      disabled_agents: ['tax', 'payroll'], // Disabled by default until client is ready
      agent_customizations: {
        accounts_payable: DEFAULT_AGENT_CONFIG,
        accounts_receivable: DEFAULT_AGENT_CONFIG,
        reconciliation: DEFAULT_AGENT_CONFIG,
        tax: DEFAULT_AGENT_CONFIG,
        payroll: DEFAULT_AGENT_CONFIG,
        general_ledger: DEFAULT_AGENT_CONFIG,
      },
      approval_thresholds: DEFAULT_APPROVAL_THRESHOLDS,
      escalation_rules: [
        {
          id: 'default-error-escalation',
          condition: 'error_rate > 0.1',
          action: 'pause_agent',
          contacts: [],
          response_time_sla_hours: 4,
        },
        {
          id: 'default-accuracy-escalation',
          condition: 'accuracy_rate < 0.85',
          action: 'alert_admin',
          contacts: [],
          response_time_sla_hours: 24,
        },
      ],
      integration_settings: {},
      cost_limits: {
        monthly_budget_usd: 5000,
        daily_budget_usd: 250,
      },
    };
  }

  /**
   * Update approval threshold for agent type
   */
  async updateApprovalThreshold(
    orgId: string,
    agentType: AgentType,
    threshold: number
  ): Promise<void> {
    const config = await this.getClientConfig(orgId);

    // Update threshold based on agent type
    switch (agentType) {
      case 'accounts_payable':
        config.approval_thresholds.accounts_payable.payment_requires_approval = threshold;
        break;
      case 'accounts_receivable':
        config.approval_thresholds.accounts_receivable.credit_memo_requires_approval = threshold;
        break;
      case 'general_ledger':
        config.approval_thresholds.general_ledger.journal_entry_requires_approval = threshold;
        break;
    }

    await this.database.updateClientAgentConfig(config);
    this.configCache.delete(orgId); // Clear cache
  }

  /**
   * Enable/disable agent for client
   */
  async setAgentEnabled(orgId: string, agentType: AgentType, enabled: boolean): Promise<void> {
    const config = await this.getClientConfig(orgId);

    if (enabled) {
      config.enabled_agents = config.enabled_agents.filter((a) => a !== agentType);
      config.enabled_agents.push(agentType);

      config.disabled_agents = config.disabled_agents.filter((a) => a !== agentType);
    } else {
      config.disabled_agents = config.disabled_agents.filter((a) => a !== agentType);
      config.disabled_agents.push(agentType);

      config.enabled_agents = config.enabled_agents.filter((a) => a !== agentType);
    }

    await this.database.updateClientAgentConfig(config);
    this.configCache.delete(orgId);
  }

  /**
   * Configure integration (QB, Xero, SAP, etc.)
   */
  async configureIntegration(
    orgId: string,
    integrationType: string,
    settings: any
  ): Promise<void> {
    const config = await this.getClientConfig(orgId);

    switch (integrationType) {
      case 'quickbooks':
        config.integration_settings.quickbooks = settings;
        break;
      case 'xero':
        config.integration_settings.xero = settings;
        break;
      case 'sap':
        config.integration_settings.sap = settings;
        break;
      case 'stripe':
        config.integration_settings.stripe = settings;
        break;
      case 'bank':
        if (!config.integration_settings.banks) {
          config.integration_settings.banks = [];
        }
        config.integration_settings.banks.push(settings);
        break;
    }

    await this.database.updateClientAgentConfig(config);
    this.configCache.delete(orgId);
  }

  /**
   * Add escalation rule
   */
  async addEscalationRule(orgId: string, rule: any): Promise<void> {
    const config = await this.getClientConfig(orgId);
    config.escalation_rules.push(rule);
    await this.database.updateClientAgentConfig(config);
    this.configCache.delete(orgId);
  }

  /**
   * Update agent model/temperature for tuning
   */
  async tuneAgent(
    orgId: string,
    agentType: AgentType,
    tuning: { model?: string; temperature?: number }
  ): Promise<void> {
    const config = await this.getClientConfig(orgId);
    const agentConfig = config.agent_customizations[agentType];

    if (tuning.model) {
      agentConfig.model = tuning.model;
    }
    if (tuning.temperature !== undefined) {
      agentConfig.temperature = tuning.temperature;
    }

    await this.database.updateClientAgentConfig(config);
    this.configCache.delete(orgId);
  }

  /**
   * Set cost limits for organization
   */
  async setCostLimits(
    orgId: string,
    monthlyUsd: number,
    dailyUsd: number
  ): Promise<void> {
    const config = await this.getClientConfig(orgId);
    config.cost_limits = {
      monthly_budget_usd: monthlyUsd,
      daily_budget_usd: dailyUsd,
    };
    await this.database.updateClientAgentConfig(config);
    this.configCache.delete(orgId);
  }

  /**
   * Get agent config for specific agent type
   */
  async getAgentConfig(orgId: string, agentType: AgentType): Promise<AgentConfig> {
    const config = await this.getClientConfig(orgId);
    return config.agent_customizations[agentType];
  }

  /**
   * Validate configuration is complete
   */
  async validateConfig(orgId: string): Promise<{ valid: boolean; errors: string[] }> {
    const config = await this.getClientConfig(orgId);
    const errors: string[] = [];

    // Check at least one agent is enabled
    if (config.enabled_agents.length === 0) {
      errors.push('At least one agent must be enabled');
    }

    // Check escalation contacts are configured
    for (const rule of config.escalation_rules) {
      if (rule.action !== 'pause_agent' && rule.contacts.length === 0) {
        errors.push(`Escalation rule "${rule.id}" has no contacts configured`);
      }
    }

    // Check integrations if needed
    if (config.enabled_agents.includes('accounts_payable') && !config.integration_settings.quickbooks && !config.integration_settings.xero) {
      errors.push('AP agent requires QB or Xero integration');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Export configuration for backup/migration
   */
  async exportConfig(orgId: string): Promise<string> {
    const config = await this.getClientConfig(orgId);
    return JSON.stringify(config, null, 2);
  }

  /**
   * Import configuration from JSON
   */
  async importConfig(orgId: string, configJson: string): Promise<void> {
    const config: ClientAgentConfig = JSON.parse(configJson);
    config.org_id = orgId; // Ensure correct org

    // Validate imported config
    const validation = await this.validateConfig(orgId);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    await this.database.updateClientAgentConfig(config);
    this.configCache.delete(orgId);
  }

  /**
   * Get preset configurations
   */
  static getPresets(): Record<string, ClientAgentConfig> {
    return {
      startup: {
        org_id: 'preset-startup',
        enabled_agents: ['accounts_payable', 'accounts_receivable'],
        disabled_agents: ['tax', 'payroll', 'reconciliation', 'general_ledger'],
        agent_customizations: {
          accounts_payable: DEFAULT_AGENT_CONFIG,
          accounts_receivable: DEFAULT_AGENT_CONFIG,
          reconciliation: DEFAULT_AGENT_CONFIG,
          tax: DEFAULT_AGENT_CONFIG,
          payroll: DEFAULT_AGENT_CONFIG,
          general_ledger: DEFAULT_AGENT_CONFIG,
        },
        approval_thresholds: {
          ...DEFAULT_APPROVAL_THRESHOLDS,
          accounts_payable: {
            payment_requires_approval: 10000, // Lower for startups
            invoice_dispute_requires_approval: true,
          },
        },
        escalation_rules: [],
        integration_settings: {},
        cost_limits: {
          monthly_budget_usd: 500,
          daily_budget_usd: 25,
        },
      },

      enterprise: {
        org_id: 'preset-enterprise',
        enabled_agents: [
          'accounts_payable',
          'accounts_receivable',
          'reconciliation',
          'tax',
          'payroll',
          'general_ledger',
        ],
        disabled_agents: [],
        agent_customizations: {
          accounts_payable: { ...DEFAULT_AGENT_CONFIG, model: 'claude-opus-4-1' },
          accounts_receivable: { ...DEFAULT_AGENT_CONFIG, model: 'claude-opus-4-1' },
          reconciliation: { ...DEFAULT_AGENT_CONFIG, model: 'claude-opus-4-1' },
          tax: { ...DEFAULT_AGENT_CONFIG, model: 'claude-opus-4-1' },
          payroll: { ...DEFAULT_AGENT_CONFIG, model: 'claude-opus-4-1' },
          general_ledger: { ...DEFAULT_AGENT_CONFIG, model: 'claude-opus-4-1' },
        },
        approval_thresholds: {
          ...DEFAULT_APPROVAL_THRESHOLDS,
          accounts_payable: {
            payment_requires_approval: 100000, // Higher for enterprise
            invoice_dispute_requires_approval: true,
          },
        },
        escalation_rules: [],
        integration_settings: {
          quickbooks: { enabled: true, realm_id: '', access_token: '' },
          xero: { enabled: true, tenant_id: '', access_token: '' },
        },
        cost_limits: {
          monthly_budget_usd: 50000,
          daily_budget_usd: 2000,
        },
      },
    };
  }
}
