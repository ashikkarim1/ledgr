/**
 * Help Centre AI System Types
 * Enterprise-grade support AI with context awareness and RAG
 */

export interface UserContext {
  userId: string;
  orgId: string;
  role: 'admin' | 'accountant' | 'cfo' | 'finance_manager' | 'viewer';
  permissions: string[];
  
  // Financial summary
  organizationName: string;
  monthlyRevenue?: number;
  totalTransactions?: number;
  
  // Integration status
  integrations: {
    quickbooks?: {
      connected: boolean;
      lastSync?: Date;
      status: 'active' | 'error' | 'disconnected';
    };
    xero?: {
      connected: boolean;
      lastSync?: Date;
      status: 'active' | 'error' | 'disconnected';
    };
    plaid?: {
      connected: boolean;
      lastSync?: Date;
      status: 'active' | 'error' | 'disconnected';
    };
  };
  
  // Onboarding
  onboardingProgress: {
    completedSteps: string[];
    currentStep?: string;
    percentComplete: number;
  };
  
  // Support history
  previousTickets: {
    id: string;
    subject: string;
    category: string;
    resolution: string;
    createdAt: Date;
    resolvedAt?: Date;
  }[];
  
  // Recent activity
  recentActions: {
    action: string;
    timestamp: Date;
    details?: Record<string, any>;
  }[];
  
  // Current issue
  currentIssue?: {
    errorMessage?: string;
    errorCode?: string;
    affectedFeature?: string;
    timestamp: Date;
  };
}

export interface KnowledgeBaseArticle {
  id: string;
  title: string;
  slug: string;
  category: 'system-features' | 'troubleshooting' | 'integration' | 'onboarding' | 'api' | 'faq';
  subcategory?: string;
  content: string;
  roleRelevance: ('admin' | 'accountant' | 'cfo' | 'finance_manager' | 'viewer')[];
  tags: string[];
  relatedArticles: string[];
  embedding?: number[]; // Vector embedding for similarity search
  updatedAt: Date;
  helpfulCount?: number;
  unhelpfulCount?: number;
}

export interface AgentDocumentation {
  id: string;
  agentName: string;
  description: string;
  capabilities: string[];
  limitations: string[];
  integrations: string[];
  setupGuide: string;
  troubleshootingGuide: string;
  embedding?: number[];
  updatedAt: Date;
}

export interface IntegrationGuide {
  id: string;
  integrationName: 'quickbooks' | 'xero' | 'plaid';
  setupSteps: {
    step: number;
    title: string;
    description: string;
    screenshots?: string[];
  }[];
  troubleshootingGuide: string;
  commonIssues: {
    issue: string;
    solution: string;
  }[];
  contactSupport: string;
  embedding?: number[];
  updatedAt: Date;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  roleRelevance: ('admin' | 'accountant' | 'cfo' | 'finance_manager' | 'viewer')[];
  relatedArticles: string[];
  embedding?: number[];
}

export interface RAGRetrievalResult {
  source: 'article' | 'agent-doc' | 'integration-guide' | 'faq' | 'api-doc' | 'error-mapping';
  id: string;
  title: string;
  content: string;
  relevanceScore: number;
  link: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sourceDocuments?: RAGRetrievalResult[];
  metadata?: {
    confidence?: number;
    escalationSuggested?: boolean;
  };
}

export interface ChatSession {
  id: string;
  userId: string;
  orgId: string;
  title: string;
  messages: ChatMessage[];
  context: Partial<UserContext>;
  isResolved: boolean;
  escalatedToHuman: boolean;
  createdAt: Date;
  updatedAt: Date;
  rating?: 1 | 2 | 3 | 4 | 5;
  feedback?: string;
}

export interface SupportTicket {
  id: string;
  chatSessionId: string;
  userId: string;
  orgId: string;
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'pending_customer' | 'resolved' | 'closed';
  aiContext: string; // Full AI conversation context
  assignedAgent?: string;
  resolution?: string;
  createdAt: Date;
  resolvedAt?: Date;
  whatsappMessageId?: string; // Link to WhatsApp message
}

export interface EscalationContext {
  ticketId: string;
  userId: string;
  orgId: string;
  userName: string;
  userEmail: string;
  userPhone?: string;
  whatsappNumber?: string;
  reason: string;
  aiConversation: ChatMessage[];
  userContext: Partial<UserContext>;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface LLMResponse {
  content: string;
  sources: RAGRetrievalResult[];
  suggestEscalation: boolean;
  escalationReason?: string;
  followUpSuggestions: string[];
  confidence: number;
}

export interface VectorStore {
  storeDocument(id: string, embedding: number[], metadata: Record<string, any>): Promise<void>;
  searchSimilar(embedding: number[], topK: number, threshold?: number): Promise<RAGRetrievalResult[]>;
  deleteDocument(id: string): Promise<void>;
  clearStore(): Promise<void>;
}

export interface EmbeddingService {
  embedText(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface LLMClient {
  generateResponse(
    systemPrompt: string,
    userMessage: string,
    context: {
      userContext: Partial<UserContext>;
      retrievedDocuments: RAGRetrievalResult[];
      conversationHistory: ChatMessage[];
    }
  ): Promise<LLMResponse>;
}

export interface WhatsAppMessage {
  from: string;
  to: string;
  body: string;
  messageId: string;
  timestamp: Date;
}

export interface HelpCentreConfig {
  llm: {
    provider: 'openai' | 'anthropic' | 'custom';
    model: string;
    apiKey: string;
    temperature?: number;
    maxTokens?: number;
  };
  vectorDb: {
    provider: 'pinecone' | 'weaviate' | 'milvus' | 'custom';
    apiKey: string;
    indexName: string;
    dimension: number;
  };
  whatsapp: {
    businessAccountId: string;
    phoneNumberId: string;
    accessToken: string;
    verifyToken: string;
  };
  embedding: {
    provider: 'openai' | 'anthropic' | 'custom';
    model: string;
    dimension: number;
  };
}

export interface AnalyticsEvent {
  eventType: 'chat_started' | 'question_asked' | 'article_viewed' | 'escalated' | 'resolved' | 'rated';
  userId: string;
  orgId: string;
  metadata: Record<string, any>;
  timestamp: Date;
}
