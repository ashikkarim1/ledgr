/**
 * Help Centre API Routes Orchestration
 * 
 * Provides HTTP endpoints for the complete Help Centre system:
 * - Chat message processing with RAG and LLM
 * - Escalation to human support via WhatsApp
 * - Session management and retrieval
 * - Analytics tracking
 * 
 * Integration: Express.js or Next.js API routes
 */

import { Request, Response } from 'express';
import { HelpCentreEngine } from './help-centre';
import { EscalationManager } from './escalation';
import {
  UserContext,
  ChatMessage,
  HelpCentreConfig,
  AnalyticsEvent,
  SupportTicket,
} from '../types/help-centre-types';

/**
 * Routes Orchestrator
 * Handles all Help Centre API endpoints and request routing
 */
export class HelpCentreRoutes {
  private helpCentreEngine: HelpCentreEngine;
  private escalationManager: EscalationManager;
  private analyticsStore: Map<string, AnalyticsEvent[]> = new Map();

  constructor(config: HelpCentreConfig) {
    this.helpCentreEngine = new HelpCentreEngine(config);
    this.escalationManager = new EscalationManager(config);
  }

  /**
   * POST /api/help-centre/chat
   * Process a user message and return AI response
   * 
   * Request body:
   * {
   *   userId: string
   *   sessionId: string
   *   message: string
   *   userContext: UserContext
   * }
   * 
   * Response:
   * {
   *   response: string
   *   sources: Array<{title, url, excerpt}>
   *   shouldEscalate: boolean
   *   escalationReason?: string
   *   sessionId: string
   *   messageId: string
   *   timestamp: ISO8601
   *   responseTime: number (ms)
   * }
   */
  async handleChatMessage(req: Request, res: Response): Promise<void> {
    try {
      const { userId, sessionId, message, userContext } = req.body;

      // Validate required fields
      if (!userId || !message) {
        res.status(400).json({
          error: 'Missing required fields: userId, message',
        });
        return;
      }

      const startTime = Date.now();

      // Process message through Help Centre engine
      const result = await this.helpCentreEngine.processUserMessage(
        userId,
        sessionId || `session_${Date.now()}`,
        message,
        userContext
      );

      const responseTime = Date.now() - startTime;

      // Track analytics
      this.trackAnalyticsEvent({
        type: 'chat_message',
        userId,
        sessionId: result.sessionId,
        timestamp: new Date().toISOString(),
        metadata: {
          messageLength: message.length,
          responseTime,
          hasEscalation: result.shouldEscalate,
          sourcesCount: result.sources?.length || 0,
        },
      });

      // Return response with metadata
      res.status(200).json({
        response: result.response,
        sources: result.sources?.map((doc) => ({
          title: doc.title,
          url: doc.url,
          excerpt: doc.content.substring(0, 200) + '...',
        })),
        shouldEscalate: result.shouldEscalate,
        escalationReason: result.escalationReason,
        sessionId: result.sessionId,
        messageId: result.messageId,
        timestamp: new Date().toISOString(),
        responseTime,
      });
    } catch (error) {
      console.error('Error processing chat message:', error);
      res.status(500).json({
        error: 'Failed to process message',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * POST /api/help-centre/escalate
   * Escalate to human support via WhatsApp
   * 
   * Request body:
   * {
   *   userId: string
   *   sessionId: string
   *   reason: string
   *   userContext: UserContext
   *   chatHistory: ChatMessage[]
   * }
   * 
   * Response:
   * {
   *   ticketId: string
   *   status: 'escalated'
   *   whatsappMessageId: string
   *   estimatedWaitTime: number (minutes)
   *   ticketUrl: string
   * }
   */
  async handleEscalation(req: Request, res: Response): Promise<void> {
    try {
      const { userId, sessionId, reason, userContext, chatHistory } = req.body;

      if (!userId || !sessionId || !userContext?.phone) {
        res.status(400).json({
          error:
            'Missing required fields: userId, sessionId, userContext.phone',
        });
        return;
      }

      // Create escalation context
      const escalationResult = await this.escalationManager.escalateToHuman(
        userId,
        sessionId,
        reason,
        userContext,
        chatHistory
      );

      // Track escalation
      this.trackAnalyticsEvent({
        type: 'escalation',
        userId,
        sessionId,
        timestamp: new Date().toISOString(),
        metadata: {
          reason,
          ticketId: escalationResult.ticketId,
          escalationReason: reason,
        },
      });

      res.status(200).json({
        ticketId: escalationResult.ticketId,
        status: 'escalated',
        whatsappMessageId: escalationResult.whatsappMessageId,
        estimatedWaitTime: 15, // Default estimate
        ticketUrl: `/tickets/${escalationResult.ticketId}`,
      });
    } catch (error) {
      console.error('Error escalating to human:', error);
      res.status(500).json({
        error: 'Failed to escalate',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * GET /api/help-centre/session/:sessionId
   * Retrieve chat session and history
   * 
   * Response:
   * {
   *   sessionId: string
   *   userId: string
   *   messages: ChatMessage[]
   *   createdAt: ISO8601
   *   updatedAt: ISO8601
   *   status: 'active' | 'resolved' | 'escalated'
   * }
   */
  async handleGetSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          error: 'Missing required parameter: sessionId',
        });
        return;
      }

      // Retrieve session from engine
      const session = await this.helpCentreEngine.getSession(sessionId);

      if (!session) {
        res.status(404).json({
          error: 'Session not found',
        });
        return;
      }

      res.status(200).json(session);
    } catch (error) {
      console.error('Error retrieving session:', error);
      res.status(500).json({
        error: 'Failed to retrieve session',
      });
    }
  }

  /**
   * GET /api/help-centre/search?q=<query>
   * Search chat history across all sessions for a user
   * 
   * Query params:
   * - q: search query
   * - userId: (optional) filter by user
   * - limit: (optional) results per page (default: 10)
   * - offset: (optional) pagination offset (default: 0)
   * 
   * Response:
   * {
   *   results: Array<{
   *     sessionId: string
   *     messageId: string
   *     role: 'user' | 'assistant'
   *     content: string
   *     timestamp: ISO8601
   *     highlights: string[] (matching text snippets)
   *   }>
   *   total: number
   *   limit: number
   *   offset: number
   * }
   */
  async handleSearchSessions(req: Request, res: Response): Promise<void> {
    try {
      const { q, userId, limit = 10, offset = 0 } = req.query;

      if (!q) {
        res.status(400).json({
          error: 'Missing required query parameter: q',
        });
        return;
      }

      // Search across sessions
      const results = await this.helpCentreEngine.searchSessions(
        String(q),
        userId ? String(userId) : undefined,
        Number(limit),
        Number(offset)
      );

      res.status(200).json(results);
    } catch (error) {
      console.error('Error searching sessions:', error);
      res.status(500).json({
        error: 'Failed to search sessions',
      });
    }
  }

  /**
   * POST /api/help-centre/rate
   * Rate an AI response (1-5 stars)
   * 
   * Request body:
   * {
   *   sessionId: string
   *   messageId: string
   *   rating: 1 | 2 | 3 | 4 | 5
   *   feedback?: string
   *   userId: string
   * }
   * 
   * Response:
   * {
   *   success: true
   *   ratingId: string
   * }
   */
  async handleRateResponse(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, messageId, rating, feedback, userId } = req.body;

      if (!sessionId || !messageId || !rating || !userId) {
        res.status(400).json({
          error:
            'Missing required fields: sessionId, messageId, rating, userId',
        });
        return;
      }

      if (rating < 1 || rating > 5) {
        res.status(400).json({
          error: 'Rating must be between 1 and 5',
        });
        return;
      }

      // Record rating
      await this.helpCentreEngine.recordRating(
        sessionId,
        messageId,
        rating,
        feedback
      );

      // Track analytics
      this.trackAnalyticsEvent({
        type: 'response_rating',
        userId,
        sessionId,
        timestamp: new Date().toISOString(),
        metadata: {
          rating,
          hasFeedback: !!feedback,
        },
      });

      res.status(200).json({
        success: true,
        ratingId: `rating_${Date.now()}`,
      });
    } catch (error) {
      console.error('Error recording rating:', error);
      res.status(500).json({
        error: 'Failed to record rating',
      });
    }
  }

  /**
   * POST /api/help-centre/webhook/whatsapp
   * Webhook for incoming WhatsApp messages
   * Processes messages from WhatsApp Business API
   * 
   * Request body (from WhatsApp):
   * {
   *   entry: Array<{
   *     changes: Array<{
   *       value: {
   *         messages: Array<{
   *           from: string (phone number)
   *           id: string
   *           timestamp: number
   *           text: {body: string}
   *         }>
   *         contacts: Array<{profile: {name: string}}>
   *       }
   *     }>
   *   }>
   * }
   */
  async handleWhatsAppWebhook(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body;

      // Verify webhook token if configured
      const webhookToken = process.env.WHATSAPP_WEBHOOK_TOKEN;
      if (
        webhookToken &&
        req.query.hub_verify_token !== webhookToken
      ) {
        res.status(403).json({
          error: 'Invalid webhook token',
        });
        return;
      }

      // Handle incoming messages
      if (
        body.entry &&
        body.entry[0]?.changes[0]?.value?.messages
      ) {
        for (const message of body.entry[0].changes[0].value.messages) {
          await this.escalationManager.handleWhatsAppWebhook(message);

          this.trackAnalyticsEvent({
            type: 'whatsapp_message',
            userId: message.from,
            timestamp: new Date(message.timestamp * 1000).toISOString(),
            metadata: {
              messageId: message.id,
              contentLength: message.text?.body?.length || 0,
            },
          });
        }
      }

      // Acknowledge webhook
      res.status(200).json({
        success: true,
      });
    } catch (error) {
      console.error('Error handling WhatsApp webhook:', error);
      res.status(500).json({
        error: 'Failed to process webhook',
      });
    }
  }

  /**
   * GET /api/help-centre/analytics
   * Retrieve analytics data
   * 
   * Query params:
   * - startDate: ISO8601 (default: 30 days ago)
   * - endDate: ISO8601 (default: today)
   * - metric: 'volume' | 'escalation_rate' | 'resolution_time' | 'satisfaction'
   * 
   * Response:
   * {
   *   metric: string
   *   startDate: ISO8601
   *   endDate: ISO8601
   *   data: Array<{
   *     date: ISO8601
   *     value: number
   *     breakdown?: object
   *   }>
   *   summary: {
   *     total: number
   *     average: number
   *     trend: 'up' | 'down' | 'stable'
   *   }
   * }
   */
  async handleAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, metric = 'volume' } = req.query;

      const start = startDate
        ? new Date(String(startDate))
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate
        ? new Date(String(endDate))
        : new Date();

      // Calculate analytics
      const analyticsData = this.calculateAnalytics(
        String(metric),
        start,
        end
      );

      res.status(200).json({
        metric,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        data: analyticsData.data,
        summary: analyticsData.summary,
      });
    } catch (error) {
      console.error('Error retrieving analytics:', error);
      res.status(500).json({
        error: 'Failed to retrieve analytics',
      });
    }
  }

  /**
   * Express/Next.js Integration
   * Register all routes with Express or Next.js app
   */
  registerRoutes(app: any): void {
    // Chat
    app.post('/api/help-centre/chat', this.handleChatMessage.bind(this));

    // Escalation
    app.post(
      '/api/help-centre/escalate',
      this.handleEscalation.bind(this)
    );

    // Sessions
    app.get(
      '/api/help-centre/session/:sessionId',
      this.handleGetSession.bind(this)
    );
    app.get(
      '/api/help-centre/search',
      this.handleSearchSessions.bind(this)
    );

    // Ratings
    app.post(
      '/api/help-centre/rate',
      this.handleRateResponse.bind(this)
    );

    // Webhooks
    app.post(
      '/api/help-centre/webhook/whatsapp',
      this.handleWhatsAppWebhook.bind(this)
    );

    // Analytics
    app.get(
      '/api/help-centre/analytics',
      this.handleAnalytics.bind(this)
    );
  }

  /**
   * Analytics Helpers
   */
  private trackAnalyticsEvent(event: AnalyticsEvent): void {
    const key = event.userId;
    if (!this.analyticsStore.has(key)) {
      this.analyticsStore.set(key, []);
    }
    this.analyticsStore.get(key)!.push(event);
  }

  private calculateAnalytics(
    metric: string,
    startDate: Date,
    endDate: Date
  ): any {
    // Group events by metric type
    const allEvents = Array.from(this.analyticsStore.values()).flat();
    const relevantEvents = allEvents.filter(
      (e) =>
        new Date(e.timestamp) >= startDate &&
        new Date(e.timestamp) <= endDate
    );

    // Calculate based on metric
    let data: any[] = [];
    let summary = { total: 0, average: 0, trend: 'stable' as const };

    if (metric === 'volume') {
      const chatEvents = relevantEvents.filter((e) => e.type === 'chat_message');
      summary.total = chatEvents.length;
      summary.average = Math.round(
        chatEvents.length /
          ((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      );

      // Group by day
      const byDay = new Map<string, number>();
      for (const event of chatEvents) {
        const date = new Date(event.timestamp).toISOString().split('T')[0];
        byDay.set(date, (byDay.get(date) || 0) + 1);
      }

      data = Array.from(byDay.entries()).map(([date, count]) => ({
        date,
        value: count,
      }));
    } else if (metric === 'escalation_rate') {
      const escalations = relevantEvents.filter(
        (e) => e.type === 'escalation'
      );
      const chats = relevantEvents.filter((e) => e.type === 'chat_message');
      summary.total = chats.length ? Math.round(
        (escalations.length / chats.length) * 100
      ) : 0;
    }

    return { data, summary };
  }
}

/**
 * Example: Express.js Server Setup
 * 
 * import express from 'express';
 * import { HelpCentreRoutes } from './api/routes';
 * 
 * const app = express();
 * app.use(express.json());
 * 
 * const routes = new HelpCentreRoutes({
 *   openaiApiKey: process.env.OPENAI_API_KEY!,
 *   claudeApiKey: process.env.CLAUDE_API_KEY!,
 *   whatsappPhoneId: process.env.WHATSAPP_PHONE_ID!,
 *   whatsappApiToken: process.env.WHATSAPP_API_TOKEN!,
 *   vectorStoreType: 'pinecone',
 *   pineconeApiKey: process.env.PINECONE_API_KEY!,
 *   pineconeEnvironment: process.env.PINECONE_ENVIRONMENT!,
 * });
 * 
 * routes.registerRoutes(app);
 * 
 * app.listen(3001, () => {
 *   console.log('Help Centre API running on port 3001');
 * });
 */

/**
 * Example: Next.js API Routes
 * 
 * File: pages/api/help-centre/chat.ts
 * 
 * import { HelpCentreRoutes } from '@/api/routes';
 * 
 * const routes = new HelpCentreRoutes({ ... });
 * 
 * export default async (req: NextApiRequest, res: NextApiResponse) => {
 *   await routes.handleChatMessage(req, res);
 * };
 */
