# Help Centre AI System: Complete Deployment Guide

This guide provides step-by-step instructions to deploy the enterprise-grade Help Centre AI system for Ledgr.

## System Overview

The Help Centre consists of:
- **RAG Engine**: Vector-based semantic search over knowledge base
- **LLM Integration**: Claude 3.5 Sonnet or GPT-4 with role-aware prompting
- **Chat UI**: React component with dark mode, mobile optimization
- **Escalation**: WhatsApp Business API integration for human handoff
- **Session Management**: Multi-conversation support with search
- **Analytics**: Event tracking and performance metrics

## Prerequisites

### Required Services
- OpenAI API key (for embeddings: text-embedding-3-small)
- Anthropic Claude API key (for LLM responses)
- Pinecone or Weaviate account (for vector database) OR use local in-memory store
- WhatsApp Business API credentials
- Twilio account (optional, for SMS backup escalation)

### Environment Variables

Create `.env.local`:

```env
# LLM APIs
OPENAI_API_KEY=sk_test_...
CLAUDE_API_KEY=sk-ant-...

# Embeddings
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536

# Vector Database (choose one)
VECTOR_STORE_TYPE=pinecone  # or 'weaviate', 'local'
PINECONE_API_KEY=...
PINECONE_ENVIRONMENT=us-west-2-aws
PINECONE_INDEX_NAME=ledgr-help-centre

# WhatsApp Business API
WHATSAPP_PHONE_ID=...
WHATSAPP_API_TOKEN=...
WHATSAPP_WEBHOOK_TOKEN=your_webhook_token
WHATSAPP_BUSINESS_ACCOUNT_ID=...

# Server Config
PORT=3001
NODE_ENV=development
```

## Installation & Setup

### 1. Install Dependencies

```bash
npm install
npm run build:css
```

### 2. Index Knowledge Base

The knowledge base files are in `src/knowledge-base/`:
- SYSTEM_FEATURES.md - Complete feature documentation
- TROUBLESHOOTING.md - Solutions and error codes
- INTEGRATION_GUIDES.md - Step-by-step integration help

### 3. Set Up API Server

Create `server.ts` in project root:

```typescript
import express from 'express';
import cors from 'cors';
import { HelpCentreRoutes } from './src/api/routes';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cors());

const helpCentreRoutes = new HelpCentreRoutes({
  openaiApiKey: process.env.OPENAI_API_KEY!,
  claudeApiKey: process.env.CLAUDE_API_KEY!,
  whatsappPhoneId: process.env.WHATSAPP_PHONE_ID!,
  whatsappApiToken: process.env.WHATSAPP_API_TOKEN!,
  vectorStoreType: 'local',
});

helpCentreRoutes.registerRoutes(app);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'help-centre' });
});

app.listen(PORT, () => {
  console.log(`Help Centre API running on port ${PORT}`);
});
```

Build and run:
```bash
npm run build
node dist/server.js
```

### 4. Integrate Chat UI into Dashboard

In React component (e.g., Dashboard.tsx):

```typescript
import { HelpCentreChat } from '@/components/HelpCentreChat';
import { useState } from 'react';

export default function Dashboard() {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div>
      {showHelp && (
        <div className="fixed bottom-4 right-4 w-96 h-screen rounded-lg shadow-2xl bg-white">
          <HelpCentreChat
            userId="user-123"
            sessionId="session-123"
            theme="dark"
          />
        </div>
      )}
      <button onClick={() => setShowHelp(!showHelp)}>
        Help
      </button>
    </div>
  );
}
```

## Monitoring & Maintenance

### Key Metrics

**Dashboard**: `/api/help-centre/analytics`

Metrics to track:
1. **Chat Volume**: Messages per day
2. **Escalation Rate**: Escalations / Total chats (target: <15%)
3. **Response Time**: P50 <500ms, P95 <2000ms
4. **Satisfaction**: Average rating (target: 4+/5)
5. **Most Helpful Articles**: Top 10 by clicks

### Weekly Maintenance

```bash
# Check system health
curl http://localhost:3001/health

# View analytics
curl "http://localhost:3001/api/help-centre/analytics?metric=volume"

# Review escalations
curl "http://localhost:3001/api/help-centre/analytics?metric=escalation_rate"
```

### Monthly Tasks

1. **Update Knowledge Base** - Add new articles for common questions
2. **Fine-tune LLM Prompts** - Review low-rated responses
3. **Escalation Analysis** - Identify patterns in support tickets
4. **Performance Review** - Analyze response time trends

## Testing

### Local Testing

```bash
# Test chat endpoint
curl -X POST http://localhost:3001/api/help-centre/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "sessionId": "test-session",
    "message": "How do I sync my QuickBooks?",
    "userContext": {
      "userId": "test-user",
      "role": "accountant",
      "integrations": {},
      "onboardingProgress": {},
      "previousTickets": [],
      "actionHistory": [],
      "currentErrors": []
    }
  }'
```

## Troubleshooting

### High Response Times (>1 second)

**Root causes:**
- OpenAI embedding API slow: Switch to local embeddings
- LLM API latency: Check Claude/OpenAI status
- Vector DB slow: Optimize index, check Pinecone quota

### Escalations Not Sending to WhatsApp

**Debug:**
```bash
# Test message sending
curl -X POST "https://graph.instagram.com/v18.0/your-phone-id/messages" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "971501234567",
    "type": "text",
    "text": {"body": "Test"}
  }'
```

## File Structure

```
src/
├── api/
│   ├── help-centre.ts          # Main engine orchestration
│   ├── escalation.ts           # WhatsApp integration
│   └── routes.ts               # HTTP endpoints
├── lib/
│   ├── rag-system.ts           # Vector search engine
│   └── llm-prompt.ts           # Prompt engineering
├── components/
│   └── HelpCentreChat.tsx       # React UI component
├── types/
│   └── help-centre-types.ts     # TypeScript interfaces
└── knowledge-base/
    ├── SYSTEM_FEATURES.md       # Feature documentation
    ├── TROUBLESHOOTING.md       # Solutions & error codes
    └── INTEGRATION_GUIDES.md    # Integration help
```

## Next Steps

1. Set environment variables in `.env.local`
2. Run `npm run build`
3. Start server: `npm start`
4. Test endpoint: `curl http://localhost:3001/health`
5. Integrate HelpCentreChat component into dashboard
6. Deploy to staging
7. Configure WhatsApp webhook
8. Deploy to production

