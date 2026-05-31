/**
 * Escalation System
 * WhatsApp integration, ticket creation, human handoff
 */

import {
  EscalationContext,
  SupportTicket,
  ChatMessage,
  UserContext,
  WhatsAppMessage,
} from '../types/help-centre-types';

/**
 * Escalation Manager
 * Handles escalation from AI to human support via WhatsApp
 */
export class EscalationManager {
  private whatsappApiKey: string;
  private whatsappPhoneNumberId: string;
  private whatsappBusinessAccountId: string;
  private tickets: Map<string, SupportTicket> = new Map();

  constructor(config: {
    whatsappApiKey: string;
    whatsappPhoneNumberId: string;
    whatsappBusinessAccountId: string;
  }) {
    this.whatsappApiKey = config.whatsappApiKey;
    this.whatsappPhoneNumberId = config.whatsappPhoneNumberId;
    this.whatsappBusinessAccountId = config.whatsappBusinessAccountId;
  }

  /**
   * Create escalation ticket and send to WhatsApp
   */
  async escalateToHuman(
    context: EscalationContext,
    sessionId: string
  ): Promise<{
    ticketId: string;
    whatsappMessageId: string;
    message: string;
  }> {
    // Create support ticket
    const ticket = this.createTicket(context, sessionId);
    this.tickets.set(ticket.id, ticket);

    // Generate ticket summary for WhatsApp
    const summary = this.generateTicketSummary(context, ticket);

    // Send to WhatsApp Business API
    const whatsappMessage = await this.sendWhatsAppMessage(
      context.whatsappNumber || context.userPhone || '',
      summary
    );

    // Update ticket with WhatsApp message ID
    ticket.whatsappMessageId = whatsappMessage.messageId;
    this.tickets.set(ticket.id, ticket);

    return {
      ticketId: ticket.id,
      whatsappMessageId: whatsappMessage.messageId,
      message: `Support ticket created: #${ticket.id}. A specialist will reach out via WhatsApp shortly.`,
    };
  }

  /**
   * Send WhatsApp message
   * Integrates with WhatsApp Business API
   */
  private async sendWhatsAppMessage(
    recipientPhone: string,
    message: string
  ): Promise<{ messageId: string }> {
    // Normalize phone number
    const phoneNumber = recipientPhone.replace(/[^\d]/g, '');

    const response = await fetch(
      `https://graph.instagram.com/v18.0/${this.whatsappPhoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.whatsappApiKey}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phoneNumber,
          type: 'text',
          text: {
            body: message,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WhatsApp API error: ${response.statusText} - ${error}`);
    }

    const data = (await response.json()) as any;
    return { messageId: data.messages[0].id };
  }

  /**
   * Send templated WhatsApp message
   * For handoff, confirmations, etc.
   */
  async sendWhatsAppTemplate(
    recipientPhone: string,
    templateName: string,
    templateParams: Record<string, string>
  ): Promise<{ messageId: string }> {
    const phoneNumber = recipientPhone.replace(/[^\d]/g, '');

    const response = await fetch(
      `https://graph.instagram.com/v18.0/${this.whatsappPhoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.whatsappApiKey}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phoneNumber,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: 'en_US',
            },
            parameters: {
              body: {
                parameters: Object.values(templateParams),
              },
            },
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`WhatsApp template API error: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    return { messageId: data.messages[0].id };
  }

  /**
   * Get ticket by ID
   */
  getTicket(ticketId: string): SupportTicket | undefined {
    return this.tickets.get(ticketId);
  }

  /**
   * Update ticket status
   */
  updateTicketStatus(
    ticketId: string,
    status: SupportTicket['status'],
    resolution?: string
  ): void {
    const ticket = this.tickets.get(ticketId);
    if (ticket) {
      ticket.status = status;
      if (resolution) {
        ticket.resolution = resolution;
        ticket.resolvedAt = new Date();
      }
      this.tickets.set(ticketId, ticket);
    }
  }

  /**
   * Assign ticket to agent
   */
  assignTicket(ticketId: string, agentName: string): void {
    const ticket = this.tickets.get(ticketId);
    if (ticket) {
      ticket.assignedAgent = agentName;
      ticket.status = 'in_progress';
      this.tickets.set(ticketId, ticket);
    }
  }

  /**
   * Get all tickets for an organization
   */
  getOrgTickets(orgId: string): SupportTicket[] {
    return Array.from(this.tickets.values()).filter((t) => t.orgId === orgId);
  }

  /**
   * Create support ticket from escalation context
   */
  private createTicket(context: EscalationContext, sessionId: string): SupportTicket {
    // Auto-detect priority from context
    let priority: SupportTicket['priority'] = 'medium';
    if (context.priority === 'critical') priority = 'critical';
    if (context.reason.toLowerCase().includes('urgent')) priority = 'high';

    return {
      id: `TKT-${Date.now()}`,
      chatSessionId: sessionId,
      userId: context.userId,
      orgId: context.orgId,
      subject: this.generateSubject(context),
      category: this.categorizeIssue(context),
      priority,
      status: 'open',
      aiContext: this.serializeAIConversation(context.aiConversation),
      createdAt: new Date(),
    };
  }

  /**
   * Generate ticket summary for WhatsApp
   */
  private generateTicketSummary(context: EscalationContext, ticket: SupportTicket): string {
    const summary = `
Hi ${context.userName}! 👋

Thank you for reaching out to Ledgr Support. I've created a support ticket for you:

*Ticket #${ticket.id}*
Subject: ${ticket.subject}
Priority: ${ticket.priority.toUpperCase()}

*Your Issue:*
${context.reason}

*Your Setup:*
• Role: ${context.userId}
• Organization: ${context.userId}
• Integration Status: ${this.formatIntegrationStatus(context.userContext)}

A specialist from our team will review your ticket and get back to you within 2 hours (during business hours).

In the meantime, you can:
1. Keep this WhatsApp thread open for updates
2. Visit our help centre: https://ledgr.io/help
3. Reply here with any additional details

We're here to help! 💪
    `.trim();

    return summary;
  }

  /**
   * Generate ticket subject from context
   */
  private generateSubject(context: EscalationContext): string {
    return context.reason.split('\n')[0].substring(0, 100);
  }

  /**
   * Auto-categorize issue
   */
  private categorizeIssue(context: EscalationContext): string {
    const reason = context.reason.toLowerCase();

    if (
      reason.includes('quickbooks') ||
      reason.includes('qb') ||
      reason.includes('sync')
    ) {
      return 'integration';
    }
    if (reason.includes('permission') || reason.includes('access')) {
      return 'access-control';
    }
    if (reason.includes('error') || reason.includes('crash') || reason.includes('bug')) {
      return 'technical';
    }
    if (reason.includes('bank') || reason.includes('plaid') || reason.includes('transaction')) {
      return 'data';
    }
    if (reason.includes('setup') || reason.includes('onboard')) {
      return 'onboarding';
    }

    return 'general';
  }

  /**
   * Serialize AI conversation for ticket
   */
  private serializeAIConversation(messages: ChatMessage[]): string {
    return messages
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');
  }

  /**
   * Format integration status for WhatsApp
   */
  private formatIntegrationStatus(userContext: Partial<UserContext>): string {
    if (!userContext.integrations) return 'No integrations';

    const statuses = [];
    if (userContext.integrations.quickbooks?.connected) statuses.push('QB: Connected');
    if (userContext.integrations.xero?.connected) statuses.push('Xero: Connected');
    if (userContext.integrations.plaid?.connected) statuses.push('Plaid: Connected');

    return statuses.length > 0 ? statuses.join(', ') : 'No integrations';
  }
}

/**
 * WhatsApp webhook handler
 * Receives messages from WhatsApp Business API
 */
export function handleWhatsAppWebhook(body: any): WhatsAppMessage | null {
  if (!body.entry || !body.entry[0].changes) {
    return null;
  }

  const change = body.entry[0].changes[0];
  if (change.field !== 'messages') {
    return null;
  }

  const message = change.value.messages?.[0];
  if (!message || message.type !== 'text') {
    return null;
  }

  return {
    from: message.from,
    to: change.value.metadata.phone_number_id,
    body: message.text.body,
    messageId: message.id,
    timestamp: new Date(message.timestamp * 1000),
  };
}

/**
 * Process incoming WhatsApp message for ticket update
 */
export function processWhatsAppReply(
  message: WhatsAppMessage,
  ticketManager: EscalationManager
): SupportTicket | null {
  // Find ticket by WhatsApp phone number
  // In production, query database for ticket linked to this conversation
  // This is a simplified version

  // Update ticket with reply content
  // In production, create a reply record and notify assigned agent

  return null;
}

/**
 * Generate escalation confirmation message
 */
export function getEscalationConfirmation(ticketId: string): string {
  return `
✅ Escalation Confirmed

Your support ticket has been created:
**Ticket ID:** ${ticketId}

A specialist will contact you within 2 hours.

While you wait, you can:
- Check our help centre: https://ledgr.io/help
- Add more details to this ticket on WhatsApp

We appreciate your patience!
  `.trim();
}
