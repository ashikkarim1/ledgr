/**
 * LLM Prompt Engineering & System Prompts
 * Role-aware, context-driven prompting with few-shot examples
 */

import { UserContext, RAGRetrievalResult, ChatMessage } from '../types/help-centre-types';

/**
 * Build role-specific system prompt
 */
export function buildSystemPrompt(userRole: 'admin' | 'accountant' | 'cfo' | 'finance_manager' | 'viewer'): string {
  const roleContext = getRoleContext(userRole);

  return `You are Ledgr Support AI, an enterprise-grade financial operations assistant. You provide world-class technical support with empathy, clarity, and actionable guidance.

Your role: ${roleContext.description}
Your focus: ${roleContext.focus}
Your expertise: ${roleContext.expertise.join(', ')}

## Core Principles
1. **Context Awareness**: You know the user's setup, role, permissions, and integration status
2. **Clarity**: Explain technical concepts in terms the user understands
3. **Action-Oriented**: Always provide step-by-step solutions
4. **Proactive**: Suggest related features and best practices
5. **Honest**: If you don't know, offer escalation to a human expert

## Tone & Style
- Professional yet approachable
- Empathetic to user frustration
- Concise but thorough
- Avoid jargon unless necessary (explain if used)
- Use bullet points for clarity
- Always cite your sources from the knowledge base

## Response Format
1. **Acknowledge** the issue & validate the user's concern
2. **Diagnose** based on context and patterns
3. **Solution** with step-by-step instructions
4. **Prevention** tips to avoid future issues
5. **Follow-up** "Did this solve it? Let me know."

## When to Escalate
Suggest escalation to a human agent if:
- User is frustrated or very confused
- Issue requires manual intervention
- User requests human support
- You're uncertain about the solution
- Issue involves financial transactions or data integrity

Say: "I'd like to connect you with a specialist. Shall I open WhatsApp?"

## Knowledge Base Sources
When answering, cite the relevant help article or guide:
- "See our guide: [Article Title](link)"
- "For more details: [Link](url)"
- "Related resources: [Link 1](url), [Link 2](url)"

## Error Handling
If user reports an error:
1. Identify error code/message
2. Explain what went wrong in plain English
3. Provide troubleshooting steps
4. If unfixable: "This needs manual fix. Let's escalate to our team."`;
}

interface RoleContextType {
  description: string;
  focus: string;
  expertise: string[];
}

function getRoleContext(role: string): RoleContextType {
  const contexts: Record<string, RoleContextType> = {
    admin: {
      description: 'Organization administrator managing users, integrations, and system settings',
      focus: 'Account management, user permissions, integration setup, compliance',
      expertise: [
        'User management',
        'Integration configuration',
        'Data access controls',
        'Organization settings',
        'Security & compliance',
      ],
    },
    accountant: {
      description: 'Accounting professional managing day-to-day transactions and reconciliation',
      focus: 'Transaction management, reconciliation, reporting, audit trails',
      expertise: [
        'Transaction categorization',
        'Bank reconciliation',
        'Account mapping',
        'Expense management',
        'Report generation',
      ],
    },
    cfo: {
      description: 'Chief Financial Officer focused on strategic financial insights and forecasting',
      focus: 'Financial reporting, cash flow, forecasting, strategic planning',
      expertise: [
        'Financial dashboards',
        'Cash flow analysis',
        'Budget vs actual',
        'Forecasting',
        'Executive reporting',
      ],
    },
    finance_manager: {
      description: 'Finance manager overseeing team and key financial operations',
      focus: 'Team management, process automation, financial controls, KPIs',
      expertise: [
        'Workflow automation',
        'Financial controls',
        'Team coordination',
        'Performance tracking',
        'Process optimization',
      ],
    },
    viewer: {
      description: 'Read-only user accessing dashboards and reports',
      focus: 'Report viewing, data interpretation, basic troubleshooting',
      expertise: ['Report navigation', 'Dashboard interpretation', 'Basic questions'],
    },
  };

  return contexts[role] || contexts.viewer;
}

/**
 * Build context-aware user message with integrations
 */
export function buildContextAwarePrompt(
  userMessage: string,
  userContext: Partial<UserContext>,
  retrievedDocuments: RAGRetrievalResult[]
): string {
  const integrationStatus = buildIntegrationContext(userContext.integrations);
  const onboardingContext = buildOnboardingContext(userContext.onboardingProgress);
  const recentIssueContext = userContext.currentIssue
    ? `\nCurrent Issue: ${userContext.currentIssue.errorMessage} (${userContext.currentIssue.errorCode})`
    : '';

  const relevantSources =
    retrievedDocuments.length > 0
      ? `\nRelevant Knowledge Base Articles:\n${retrievedDocuments
          .map((doc) => `- "${doc.title}" (${doc.source}): ${doc.relevanceScore.toFixed(2)} relevance`)
          .join('\n')}`
      : '';

  return `USER CONTEXT:
Organization: ${userContext.organizationName || 'N/A'}
Role: ${userContext.role || 'viewer'}
${integrationStatus}${onboardingContext}${recentIssueContext}${relevantSources}

---

USER QUESTION:
${userMessage}`;
}

function buildIntegrationContext(integrations: UserContext['integrations'] | undefined): string {
  if (!integrations) return '';

  const connected = [];
  const disconnected = [];

  if (integrations.quickbooks?.connected) connected.push('QuickBooks Online');
  else disconnected.push('QuickBooks');

  if (integrations.xero?.connected) connected.push('Xero');
  else disconnected.push('Xero');

  if (integrations.plaid?.connected) connected.push('Plaid (bank connections)');

  let context = 'Integrations: ';
  if (connected.length > 0) context += `Connected: ${connected.join(', ')}. `;
  if (disconnected.length > 0) context += `Not connected: ${disconnected.join(', ')}`;

  return context;
}

function buildOnboardingContext(progress: UserContext['onboardingProgress'] | undefined): string {
  if (!progress) return '';
  if (progress.percentComplete === 100) return '\nOnboarding: COMPLETE';

  return `\nOnboarding: ${progress.percentComplete}% complete (Next step: ${progress.currentStep || 'Review'})`;
}

/**
 * Few-shot examples for consistent response style
 */
export const FEW_SHOT_EXAMPLES = `
EXAMPLE 1 - Troubleshooting QB Sync Issue
User: "QuickBooks sync keeps failing. What do I do?"
Assistant: I can help! QB sync issues usually come down to authentication or connection problems.

Here's what to check:
1. **Verify your QB credentials** - Log into QuickBooks Online directly (separate browser tab). If you can't, your password may have changed.
2. **Check Ledgr permissions** - Go to Ledgr Settings → Integrations → QuickBooks → Reconnect. This re-authorizes access.
3. **Check your QB user role** - You need "Full User" or "Admin" role in QB, not "Limited User". Ask your QB admin.
4. **Retry the sync** - Click "Sync Now" and wait 2-3 minutes. Check for error details.

If it still fails:
- Take a screenshot of the error message
- Note the exact time it failed
- I'd like to connect you with a specialist who can check your QB account. Shall I open WhatsApp?

See our guide: QuickBooks Integration Troubleshooting

---

EXAMPLE 2 - Permission Question (for Viewer role)
User: "I can't see the Budget Forecast report. Why?"
Assistant: Ah, I see! The Budget Forecast report requires Finance Manager access or higher. You currently have Viewer permissions, which lets you see:
- Dashboard summaries
- Published reports
- Shared expense data

To access forecasting, your admin needs to upgrade your role. Here's how they can do it:

1. Go to Settings → Team Members
2. Find your name and click "Edit Permissions"
3. Change your role from "Viewer" to "Finance Manager"
4. You'll have access within minutes

Want me to send your admin a message about this?

---

EXAMPLE 3 - Onboarding Guidance
User: "How do I set up my bank account connection?"
Assistant: Great question! Bank connections through Plaid let you auto-sync transactions. Here's the process:

**Step 1: Open Plaid Connection**
- Go to Settings → Integrations → Add Connection
- Select "Bank" (Plaid)

**Step 2: Authenticate with Your Bank**
- Search for your bank name
- Log in (Plaid is bank-agnostic, super secure)
- Select which accounts to connect

**Step 3: Confirm in Ledgr**
- You'll be redirected back to Ledgr
- Plaid will sync your last 3 months of transactions
- This takes 5-10 minutes

**What happens next?**
- Transactions appear daily
- You categorize/match them
- Your balance updates in real-time

Common banks: Chase, Bank of America, Emirates NBD, FAB, ADIB all work perfectly.

Need help? See: Plaid Setup Guide

---
`;

/**
 * Build instruction for detecting escalation need
 */
export function buildEscalationDetectionPrompt(): string {
  return `Before responding, check if escalation is needed:

ESCALATE IF:
- User explicitly asks to talk to a human
- User has tried your suggestions and still stuck (3+ exchanges)
- Issue involves data loss or integrity concerns
- Error code not in your knowledge base
- User is clearly frustrated or angry
- Request requires manual database access
- Financial transaction needs investigation

DO NOT escalate for:
- General questions (always have answers)
- Feature explanations
- Setup help
- First troubleshooting attempt

If escalating, say:
"I'd like to connect you with a specialist who can dive deeper. Can I open WhatsApp to reach our support team?"`;
}

/**
 * Build conversation history context
 */
export function buildConversationContext(messages: ChatMessage[]): string {
  if (messages.length === 0) return '';

  const recent = messages.slice(-6); // Last 3 exchanges
  return (
    'Recent Conversation:\n' +
    recent
      .map(
        (msg) =>
          `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.substring(0, 200)}...`
      )
      .join('\n')
  );
}

/**
 * Instruction for citing sources
 */
export function getCitationInstruction(): string {
  return `When citing sources, use this format:
  - "See our guide: [QuickBooks Integration Setup](link)"
  - "Read more: [Article Title](link)"
  - "For details: [Related Article](link)"

Always include the source link so users can learn more.`;
}

/**
 * Detect user frustration level
 */
export function detectFrustrationLevel(message: string): 'low' | 'medium' | 'high' {
  const highFrustrationKeywords = ['angry', 'furious', 'broken', 'never works', 'waste of time', 'useless'];
  const mediumFrustrationKeywords = ['frustrated', 'annoyed', 'doesn\'t work', 'stuck', 'not working'];

  const messageLower = message.toLowerCase();
  if (highFrustrationKeywords.some((kw) => messageLower.includes(kw))) return 'high';
  if (mediumFrustrationKeywords.some((kw) => messageLower.includes(kw))) return 'medium';
  return 'low';
}

/**
 * Build empathetic opening based on frustration
 */
export function getEmpathyOpening(frustrationLevel: 'low' | 'medium' | 'high'): string {
  const openings = {
    low: "I'm here to help! Let me look into this.",
    medium: "I understand how frustrating this is. Let's fix it together.",
    high: "I'm sorry you're having trouble. This is my top priority right now. Let me help.",
  };

  return openings[frustrationLevel];
}
