/**
 * Ledgr Help Centre Engine
 * Enterprise-grade support AI with context awareness
 * < 1 minute response time target
 */

import {
  UserContext,
  ChatMessage,
  ChatSession,
  LLMResponse,
  RAGRetrievalResult,
} from '../types/help-centre-types';
import { RAGEngine, ErrorMapper } from '../lib/rag-system';
import {
  buildSystemPrompt,
  buildContextAwarePrompt,
  detectFrustrationLevel,
  getEmpathyOpening,
} from '../lib/llm-prompt';

/**
 * Main Help Centre Engine
 * Orchestrates RAG, LLM, and context management
 */
export class HelpCentreEngine {
  private ragEngine: RAGEngine;
  private errorMapper: ErrorMapper;
  private sessions: Map<string, ChatSession> = new Map();

  constructor(ragEngine: RAGEngine) {
    this.ragEngine = ragEngine;
    this.errorMapper = new ErrorMapper();
  }

  /**
   * Process user message and generate AI response
   * Main entry point for chat interactions
   */
  async processUserMessage(
    userId: string,
    sessionId: string,
    userMessage: string,
    userContext: Partial<UserContext>
  ): Promise<{
    response: LLMResponse;
    sessionId: string;
    messages: ChatMessage[];
  }> {
    const startTime = Date.now();

    // Get or create session
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.createSession(userId, sessionId, userContext);
    }

    // Add user message to history
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      userId,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };
    session.messages.push(userMsg);

    try {
      // Detect frustration early (for empathy)
      const frustrationLevel = detectFrustrationLevel(userMessage);

      // Check for error codes in message
      const errorCode = this.extractErrorCode(userMessage);
      let retrievedDocuments: RAGRetrievalResult[] = [];

      if (errorCode) {
        // Map error to solution
        const errorSolution = await this.errorMapper.findSolutionForError(
          errorCode,
          userContext
        );
        if (errorSolution) {
          retrievedDocuments.push(errorSolution);
        }
      }

      // RAG: Retrieve relevant documents (with timeout)
      const ragStartTime = Date.now();
      try {
        const additionalDocs = await Promise.race([
          this.ragEngine.retrieveRelevantDocuments(userMessage, userContext, 5),
          new Promise<RAGRetrievalResult[]>((_, reject) =>
            setTimeout(
              () => reject(new Error('RAG timeout')),
              5000
            ) // 5s timeout
          ),
        ]);
        retrievedDocuments = [...retrievedDocuments, ...additionalDocs].slice(0, 5);
      } catch (ragError) {
        console.error('RAG retrieval failed:', ragError);
        // Continue without RAG results
      }
      const ragTime = Date.now() - ragStartTime;

      // Build LLM prompt with context
      const systemPrompt = buildSystemPrompt(userContext.role || 'viewer');
      const contextualPrompt = buildContextAwarePrompt(
        userMessage,
        userContext,
        retrievedDocuments
      );

      // Generate LLM response
      const llmResponse = await this.callLLM(
        systemPrompt,
        contextualPrompt,
        session.messages
      );

      // Add empathy opening if needed
      if (frustrationLevel !== 'low') {
        llmResponse.content = `${getEmpathyOpening(frustrationLevel)}\n\n${llmResponse.content}`;
      }

      // Check if escalation should be suggested
      if (frustrationLevel === 'high' || userMessage.includes('talk to human')) {
        llmResponse.suggestEscalation = true;
        llmResponse.escalationReason = 'User requesting human support';
      }

      // Add assistant message to session
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        userId,
        role: 'assistant',
        content: llmResponse.content,
        timestamp: new Date(),
        sourceDocuments: retrievedDocuments,
        metadata: {
          confidence: llmResponse.confidence,
          escalationSuggested: llmResponse.suggestEscalation,
        },
      };
      session.messages.push(assistantMsg);

      // Update session
      session.updatedAt = new Date();
      this.sessions.set(sessionId, session);

      const totalTime = Date.now() - startTime;
      console.log(`Help centre response: ${totalTime}ms (RAG: ${ragTime}ms)`);

      return {
        response: llmResponse,
        sessionId,
        messages: session.messages,
      };
    } catch (error) {
      console.error('Help centre error:', error);
      throw error;
    }
  }

  /**
   * Get chat session history
   */
  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Rate a response (for feedback loop)
   */
  rateResponse(sessionId: string, rating: 1 | 2 | 3 | 4 | 5, feedback?: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.rating = rating;
      session.feedback = feedback;
      this.sessions.set(sessionId, session);
    }
  }

  /**
   * Mark session as resolved
   */
  markResolved(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isResolved = true;
      this.sessions.set(sessionId, session);
    }
  }

  /**
   * Suggest follow-up questions based on user context
   */
  async suggestFollowUpQuestions(
    userContext: Partial<UserContext>,
    lastMessage: string
  ): Promise<string[]> {
    // Role-specific suggestions
    const suggestions: Record<string, string[]> = {
      admin: [
        'How do I manage team members?',
        'How do I configure integrations?',
        'What are my compliance options?',
      ],
      accountant: [
        'How do I reconcile bank statements?',
        'How do I categorize transactions?',
        'How do I generate expense reports?',
      ],
      cfo: [
        'How do I create forecasts?',
        'How do I analyze cash flow?',
        'How do I generate executive reports?',
      ],
      finance_manager: [
        'How do I automate workflows?',
        'How do I manage team approvals?',
        'How do I track KPIs?',
      ],
      viewer: [
        'How do I view reports?',
        'How do I filter dashboards?',
        'How do I export data?',
      ],
    };

    let roleSuggestions = suggestions[userContext.role || 'viewer'] || suggestions.viewer;

    // Integration-specific suggestions
    if (!userContext.integrations?.quickbooks?.connected) {
      roleSuggestions = [
        'How do I connect QuickBooks?',
        ...roleSuggestions,
      ];
    }

    return roleSuggestions.slice(0, 3);
  }

  /**
   * Extract error codes from messages
   * Supports formats like: ERR_QB_SYNC_FAILED, Error Code: 500
   */
  private extractErrorCode(message: string): string | null {
    const patterns = [
      /ERR_[A-Z_]+/,
      /Error Code[:\s]+([A-Z0-9_]+)/i,
      /\[([A-Z0-9_]+)\]/,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }

    return null;
  }

  /**
   * Call LLM (Claude, GPT-4, etc.)
   * Configurable per environment
   */
  private async callLLM(
    systemPrompt: string,
    userPrompt: string,
    conversationHistory: ChatMessage[]
  ): Promise<LLMResponse> {
    // This integrates with your preferred LLM
    // Currently a placeholder - integrate with Claude API, OpenAI, etc.

    const provider = process.env.HELP_CENTRE_LLM_PROVIDER || 'anthropic';

    if (provider === 'anthropic') {
      return this.callClaudeAPI(systemPrompt, userPrompt);
    } else if (provider === 'openai') {
      return this.callOpenAIAPI(systemPrompt, userPrompt);
    } else {
      throw new Error(`Unknown LLM provider: ${provider}`);
    }
  }

  private async callClaudeAPI(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    const content = data.content[0].text;

    return {
      content,
      sources: [],
      suggestEscalation: false,
      followUpSuggestions: [],
      confidence: 0.9,
    };
  }

  private async callOpenAIAPI(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY || ''}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    const content = data.choices[0].message.content;

    return {
      content,
      sources: [],
      suggestEscalation: false,
      followUpSuggestions: [],
      confidence: 0.9,
    };
  }

  private createSession(
    userId: string,
    sessionId: string,
    userContext: Partial<UserContext>
  ): ChatSession {
    return {
      id: sessionId,
      userId,
      orgId: userContext.orgId || '',
      title: 'Help Centre Chat',
      messages: [],
      context: userContext,
      isResolved: false,
      escalatedToHuman: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

/**
 * Session manager for multi-session support
 */
export class SessionManager {
  private sessions: Map<string, ChatSession> = new Map();
  private userSessions: Map<string, string[]> = new Map(); // userId -> sessionIds

  createSession(userId: string, orgId: string, userContext: Partial<UserContext>): string {
    const sessionId = `session-${userId}-${Date.now()}`;

    const session: ChatSession = {
      id: sessionId,
      userId,
      orgId,
      title: 'Help Centre Chat',
      messages: [],
      context: userContext,
      isResolved: false,
      escalatedToHuman: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    // Track user sessions
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, []);
    }
    this.userSessions.get(userId)!.push(sessionId);

    return sessionId;
  }

  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  getUserSessions(userId: string): ChatSession[] {
    const sessionIds = this.userSessions.get(userId) || [];
    return sessionIds.map((id) => this.sessions.get(id)!).filter(Boolean);
  }

  searchSessions(userId: string, query: string): ChatSession[] {
    const userSessions = this.getUserSessions(userId);
    const queryLower = query.toLowerCase();

    return userSessions.filter(
      (session) =>
        session.title.toLowerCase().includes(queryLower) ||
        session.messages.some((msg) =>
          msg.content.toLowerCase().includes(queryLower)
        )
    );
  }

  updateSession(sessionId: string, updates: Partial<ChatSession>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates, { updatedAt: new Date() });
      this.sessions.set(sessionId, session);
    }
  }
}
