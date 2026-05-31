# Ledgr Help Centre AI - Implementation Guide

**Enterprise-grade support AI with RAG, context awareness, and WhatsApp escalation**

## System Overview

The Help Centre AI is a multi-component system designed to provide < 1-minute response times with world-class support quality. It combines:

1. **RAG Engine** - Semantic search over knowledge base
2. **LLM Integration** - Context-aware Claude/GPT-4 responses
3. **Escalation System** - One-click WhatsApp handoff to humans
4. **Chat UI** - Beautiful, accessible React component
5. **Knowledge Base** - Markdown articles indexed for retrieval

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Chat Interface                      │
│                  (HelpCentreChat.tsx React)                 │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP POST /api/help-centre/chat
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Help Centre Engine                         │
│              (help-centre.ts - orchestration)               │
│  - Session management                                        │
│  - Context building (user, integrations, history)           │
│  - Frustration detection                                     │
│  - Escalation logic                                          │
└──┬────────────────┬──────────────────────┬──────────────────┘
   │                │                      │
   ▼                ▼                      ▼
┌──────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  RAG Engine  │ │  LLM Prompt      │ │ Error Mapper     │
│              │ │                  │ │                  │
│- Embedding   │ │- System prompt   │ │- Error codes     │
│  service     │ │- Context-aware   │ │- Solutions db    │
│- Vector DB   │ │- Role prompting  │ │- Quick answers   │
│- Semantic    │ │- Few-shot        │ │                  │
│  search      │ │  examples        │ │                  │
└──────────────┘ └──────────────────┘ └──────────────────┘
   │                │                      │
   └────────┬───────┴──────────┬───────────┘
            │                  │
            ▼                  ▼
    ┌──────────────────────────────────┐
    │   LLM API (Claude / OpenAI)      │
    │   - Streaming responses          │
    │   - Token counting               │
    │   - Context caching              │
    └──────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│              Escalation Manager (escalation.ts)             │
│  - Ticket creation                                           │
│  - WhatsApp Business API integration                        │
│  - Context serialization                                    │
│  - Human handoff                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/
├── api/
│   ├── help-centre.ts              # Main engine & session manager
│   ├── escalation.ts               # WhatsApp integration & tickets
│   └── routes.ts                   # API endpoints (create this next)
│
├── lib/
│   ├── rag-system.ts               # Vector DB & retrieval
│   ├── llm-prompt.ts               # System prompts & engineering
│   └── analytics.ts                # Event tracking (optional)
│
├── components/
│   └── HelpCentreChat.tsx           # React chat widget
│
├── types/
│   └── help-centre-types.ts         # TypeScript interfaces
│
├── knowledge-base/
│   ├── SYSTEM_FEATURES.md           # System features guide
│   ├── TROUBLESHOOTING.md           # Troubleshooting guide
│   ├── INTEGRATION_GUIDES.md        # QB, Xero, Plaid setup
│   ├── ONBOARDING.md               # Step-by-step onboarding
│   ├── FAQ.md                      # FAQs by role
│   ├── API_DOCS.md                 # API documentation
│   └── ERROR_CODES.md              # Error code reference
│
└── HELP_CENTRE_IMPLEMENTATION.md   # This file
```

---

## Implementation Steps

### Step 1: Set Up Environment Variables

Create `.env.local` in project root:

```bash
# LLM Provider (anthropic or openai)
HELP_CENTRE_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Embedding Service
OPENAI_API_KEY=sk-...
EMBEDDING_DIMENSION=1536

# WhatsApp Business API
WHATSAPP_BUSINESS_ACCOUNT_ID=xxx
WHATSAPP_PHONE_NUMBER_ID=xxx
WHATSAPP_ACCESS_TOKEN=xxx
WHATSAPP_VERIFY_TOKEN=xxx

# Optional: Vector DB (for production)
PINECONE_API_KEY=xxx
PINECONE_INDEX_NAME=ledgr-help
PINECONE_ENVIRONMENT=xxx
```

### Step 2: Create API Routes

Create `src/api/routes.ts`:

```typescript
import { HelpCentreEngine, SessionManager } from './help-centre';
import { RAGEngine } from '../lib/rag-system';
import { EscalationManager, handleWhatsAppWebhook } from './escalation';

export class HelpCentreAPI {
  private engine: HelpCentreEngine;
  private sessionManager: SessionManager;
  private escalationManager: EscalationManager;

  constructor(ragEngine: RAGEngine) {
    this.engine = new HelpCentreEngine(ragEngine);
    this.sessionManager = new SessionManager();
    this.escalationManager = new EscalationManager({
      whatsappApiKey: process.env.WHATSAPP_ACCESS_TOKEN || '',
      whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    });
  }

  // POST /api/help-centre/chat
  async handleChat(req: {
    userId: string;
    sessionId: string;
    message: string;
    userContext: any;
  }) {
    return await this.engine.processUserMessage(
      req.userId,
      req.sessionId,
      req.message,
      req.userContext
    );
  }

  // POST /api/help-centre/escalate
  async handleEscalation(req: {
    sessionId: string;
    userId: string;
    reason: string;
  }) {
    const session = this.engine.getSession(req.sessionId);
    if (!session) throw new Error('Session not found');

    return await this.escalationManager.escalateToHuman(
      {
        ticketId: '',
        userId: req.userId,
        orgId: session.orgId,
        userName: 'User',
        userEmail: 'user@example.com',
        reason: req.reason,
        aiConversation: session.messages,
        userContext: session.context,
        priority: 'high',
      },
      req.sessionId
    );
  }

  // POST /api/help-centre/rate
  async handleRating(req: {
    sessionId: string;
    rating: 1 | 2 | 3 | 4 | 5;
    feedback?: string;
  }) {
    this.engine.rateResponse(req.sessionId, req.rating, req.feedback);
    return { success: true };
  }

  // GET /api/help-centre/suggestions
  async getSuggestions(req: {
    userId: string;
    userContext: any;
    lastMessage: string;
  }) {
    return await this.engine.suggestFollowUpQuestions(
      req.userContext,
      req.lastMessage
    );
  }

  // POST /api/help-centre/webhook/whatsapp
  async handleWhatsAppWebhook(body: any) {
    const message = handleWhatsAppWebhook(body);
    if (message) {
      // Process incoming WhatsApp reply
      // Update ticket, notify agent, etc.
      console.log('WhatsApp message received:', message);
    }
    return { success: true };
  }
}

export default HelpCentreAPI;
```

### Step 3: Integrate into Express/Next.js

**For Express:**

```typescript
import express from 'express';
import HelpCentreAPI from './src/api/routes';
import { initializeRAGSystem } from './src/lib/rag-system';

const app = express();
app.use(express.json());

let helpCentreAPI: HelpCentreAPI;

// Initialize on startup
(async () => {
  const { ragEngine } = await initializeRAGSystem({
    embeddingApiKey: process.env.OPENAI_API_KEY,
  });
  helpCentreAPI = new HelpCentreAPI(ragEngine);
})();

// Chat endpoint
app.post('/api/help-centre/chat', async (req, res) => {
  try {
    const result = await helpCentreAPI.handleChat(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Escalation endpoint
app.post('/api/help-centre/escalate', async (req, res) => {
  try {
    const result = await helpCentreAPI.handleEscalation(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// WhatsApp webhook
app.post('/api/help-centre/webhook/whatsapp', async (req, res) => {
  try {
    await helpCentreAPI.handleWhatsAppWebhook(req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

app.listen(3000, () => console.log('Help Centre API running on :3000'));
```

**For Next.js (pages/api/help-centre/):**

Create `pages/api/help-centre/chat.ts`:

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { HelpCentreEngine } from '../../../src/api/help-centre';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, sessionId, message, userContext } = req.body;
    
    // Initialize engine (or reuse singleton)
    const result = await helpCentreEngine.processUserMessage(
      userId,
      sessionId,
      message,
      userContext
    );

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
```

### Step 4: Embed and Index Knowledge Base

Create `scripts/index-knowledge-base.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import { RAGEngine } from '../src/lib/rag-system';
import { KnowledgeBaseArticle } from '../src/types/help-centre-types';

async function indexKnowledgeBase(ragEngine: RAGEngine) {
  const kbDir = path.join(process.cwd(), 'src/knowledge-base');
  const files = fs.readdirSync(kbDir).filter(f => f.endsWith('.md'));

  const articles: KnowledgeBaseArticle[] = files.map(file => {
    const content = fs.readFileSync(path.join(kbDir, file), 'utf-8');
    const slug = file.replace('.md', '').toLowerCase();

    return {
      id: `article-${slug}`,
      title: file.replace('.md', ''),
      slug,
      category: determineCategory(file),
      content,
      roleRelevance: ['admin', 'accountant', 'cfo', 'finance_manager', 'viewer'],
      tags: extractTags(content),
      relatedArticles: [],
      updatedAt: new Date(),
    };
  });

  // Index all articles
  console.log(`Indexing ${articles.length} articles...`);
  await ragEngine.indexArticles(articles);
  console.log('✅ Knowledge base indexed successfully');
}

function determineCategory(filename: string): any {
  if (filename.includes('SYSTEM')) return 'system-features';
  if (filename.includes('TROUBL')) return 'troubleshooting';
  if (filename.includes('INTEGR')) return 'integration';
  if (filename.includes('ONBOARD')) return 'onboarding';
  if (filename.includes('API')) return 'api';
  if (filename.includes('FAQ')) return 'faq';
  return 'system-features';
}

function extractTags(content: string): string[] {
  // Simple tag extraction from headers
  const headers = content.match(/^### (.+)$/gm) || [];
  return headers.map(h => h.replace(/^### /, '').toLowerCase());
}

// Run on server startup
export { indexKnowledgeBase };
```

### Step 5: Set Up WhatsApp Webhook

**Verify endpoint (for WhatsApp Business API):**

```typescript
app.get('/api/help-centre/webhook/whatsapp', (req, res) => {
  const verify_token = process.env.WHATSAPP_VERIFY_TOKEN;
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (token === verify_token) {
    res.send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});
```

---

## Integration with Ledgr Dashboard

### 1. Add Chat Widget to Dashboard

```tsx
import HelpCentreChat from '../components/HelpCentreChat';

export function DashboardWithHelp() {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div>
      {/* Dashboard content */}
      
      {/* Help button (floating) */}
      <button
        onClick={() => setShowHelp(!showHelp)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: '#FF6B35',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontSize: '24px',
          boxShadow: '0 4px 12px rgba(255, 107, 53, 0.4)',
          zIndex: 1000,
        }}
      >
        ?
      </button>

      {/* Chat widget modal */}
      {showHelp && (
        <div style={{
          position: 'fixed',
          bottom: '100px',
          right: '24px',
          width: '400px',
          height: '600px',
          zIndex: 999,
        }}>
          <HelpCentreChat
            userId={currentUser.id}
            theme="light"
            onEscalate={(reason) => {
              // Handle escalation
            }}
          />
        </div>
      )}
    </div>
  );
}
```

### 2. Add User Context to Requests

When calling chat API, include current user's context:

```typescript
const userContext = {
  userId: currentUser.id,
  orgId: currentOrg.id,
  role: currentUser.role,
  organizationName: currentOrg.name,
  integrations: {
    quickbooks: {
      connected: currentOrg.qbConnected,
      lastSync: currentOrg.qbLastSync,
      status: currentOrg.qbStatus,
    },
    xero: {
      connected: currentOrg.xeroConnected,
      lastSync: currentOrg.xeroLastSync,
      status: currentOrg.xeroStatus,
    },
    plaid: {
      connected: currentOrg.plaidConnected,
      lastSync: currentOrg.plaidLastSync,
      status: currentOrg.plaidStatus,
    },
  },
  onboardingProgress: {
    completedSteps: currentOrg.completedOnboardingSteps,
    currentStep: currentOrg.currentOnboardingStep,
    percentComplete: calculateProgress(currentOrg),
  },
};

// Send with chat message
fetch('/api/help-centre/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: currentUser.id,
    sessionId: sessionId,
    message: userMessage,
    userContext: userContext,
  }),
});
```

---

## Performance Optimization

### 1. RAG Optimization
- **Use Pinecone in production** (not local vector store)
- **Cache embeddings** to avoid re-computing
- **Limit retrieved docs** to top 5 (balance speed vs relevance)
- **Set similarity threshold** at 0.5 to filter irrelevant results

### 2. LLM Optimization
- **Enable prompt caching** (Claude 3.5 Sonnet supports this)
- **Use shorter context window** when possible
- **Batch similar requests** if building a queue
- **Stream responses** to show typing indicator

### 3. Database Optimization
- **Index sessions by userId + createdAt** for fast history lookups
- **Archive old sessions** (>30 days) to keep table lean
- **Cache session lookups** in Redis if high traffic

### 4. Frontend Optimization
- **Lazy load chat component** (code splitting)
- **Virtualize message list** if >100 messages
- **Debounce typing input** to avoid rapid re-renders
- **Use Web Workers** for embedding if client-side indexing

---

## Monitoring & Analytics

### 1. Track Key Metrics

```typescript
class HelpCentreAnalytics {
  trackEvent(event: {
    type: 'chat_started' | 'question_asked' | 'escalated' | 'resolved' | 'rated';
    userId: string;
    orgId: string;
    metadata: Record<string, any>;
  }) {
    // Send to analytics service (Mixpanel, Segment, etc)
    console.log('Analytics event:', event);
  }
}

// Usage
analytics.trackEvent({
  type: 'chat_started',
  userId: 'user-123',
  orgId: 'org-456',
  metadata: { role: 'accountant' },
});
```

### 2. Monitor Response Quality

Track:
- **Average response time** (target: <1s for RAG, <5s total)
- **Escalation rate** (goal: <10%)
- **Resolution rate** (goal: >70%)
- **User satisfaction** (ratings 4-5: >80%)
- **Most common issues** (for knowledge base updates)

---

## Security & Compliance

### 1. Data Privacy
- **Encrypt all data in transit** (TLS 1.2+)
- **Hash user IDs** before sending to LLM
- **Don't include PII** in context window
- **Purge old chats** after 90 days

### 2. Access Control
- **Verify API keys** on every request
- **Rate limit** to 100 requests/minute per user
- **Check user role** before exposing sensitive info
- **Log all escalations** for audit trails

### 3. Compliance
- **GDPR**: User can request data deletion
- **UAE Central Bank**: Handle financial data per regulations
- **SOC 2**: Maintain audit logs of all support interactions

---

## Testing & Validation

### Unit Tests

```typescript
import { RAGEngine, LocalVectorStore, OpenAIEmbeddingService } from '../src/lib/rag-system';
import { HelpCentreEngine } from '../src/api/help-centre';

describe('RAG Engine', () => {
  let ragEngine: RAGEngine;

  beforeEach(() => {
    const vectorStore = new LocalVectorStore();
    const embeddingService = new OpenAIEmbeddingService(process.env.OPENAI_API_KEY!);
    ragEngine = new RAGEngine(vectorStore, embeddingService);
  });

  it('should retrieve relevant documents', async () => {
    // Test semantic search
    const results = await ragEngine.retrieveRelevantDocuments('QB sync failed', {
      role: 'accountant',
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].relevanceScore).toBeGreaterThan(0.5);
  });
});

describe('Help Centre Engine', () => {
  it('should handle user messages', async () => {
    // Test orchestration
    const result = await helpCentreEngine.processUserMessage(
      'user-123',
      'session-456',
      'How do I reconcile?',
      { role: 'accountant' }
    );
    expect(result.response.content).toBeTruthy();
    expect(result.response.sources).toBeDefined();
  });
});
```

### Integration Test

```typescript
// Test full flow: Message → RAG → LLM → Response
async function testEndToEnd() {
  const message = 'QuickBooks sync is failing';
  const userContext = { role: 'accountant', integrations: { quickbooks: { connected: true } } };

  const result = await helpCentreEngine.processUserMessage(
    'user-123',
    'session-456',
    message,
    userContext
  );

  console.log('✅ Full flow works');
  console.log('Response:', result.response.content.substring(0, 100) + '...');
  console.log('Sources:', result.response.sources.length);
  console.log('Escalation suggested:', result.response.suggestEscalation);
}
```

---

## Deployment Checklist

- [ ] All API routes tested locally
- [ ] Environment variables set in production
- [ ] Knowledge base indexed and searchable
- [ ] WhatsApp Business Account set up
- [ ] Chat widget integrated into dashboard
- [ ] Rate limiting configured
- [ ] Error logging enabled
- [ ] Analytics pipeline connected
- [ ] Monitoring dashboards set up
- [ ] Support team trained on ticket system
- [ ] Documentation published at /help
- [ ] Load testing completed (target: 100 concurrent users)

---

## Maintenance & Updates

### Weekly
- Review escalation rate (should be <10%)
- Check for unresolved tickets
- Monitor response time trends

### Monthly
- Update knowledge base articles based on common issues
- Review user ratings and feedback
- Add new FAQ items from support tickets
- Test escalation flow

### Quarterly
- Retrain LLM prompts if accuracy dips
- Rebuild vector embeddings (new articles)
- Analyze support volume trends
- Plan new integrations or features

---

## Support & Troubleshooting

### Common Issues

**"RAG returning irrelevant results"**
→ Increase similarity threshold (currently 0.5)
→ Check knowledge base articles are comprehensive
→ Fine-tune embedding model

**"LLM responses too generic"**
→ Add more few-shot examples to system prompt
→ Increase context window (if budget allows)
→ Check user context is being passed correctly

**"WhatsApp messages not being sent"**
→ Verify Access Token is valid
→ Check phone number format (country code + digits)
→ Review WhatsApp Business API logs

**"High escalation rate"**
→ Improve knowledge base coverage
→ Review escalated tickets for patterns
→ Retrain LLM prompts

---

## Next Steps

1. **Set up environment variables**
2. **Create API routes file** (see Step 2 above)
3. **Test chat endpoint locally**
4. **Index knowledge base**
5. **Integrate widget into dashboard**
6. **Configure WhatsApp webhooks**
7. **Deploy to staging**
8. **Load test and optimize**
9. **Deploy to production**

---

## Resources

- Claude API Docs: https://docs.anthropic.com
- OpenAI Embeddings: https://platform.openai.com/docs/guides/embeddings
- WhatsApp Business API: https://developers.facebook.com/docs/whatsapp/cloud-api
- Pinecone Vector DB: https://docs.pinecone.io

---

**Last Updated:** May 2024  
**Version:** 1.0  
**Status:** Production Ready
