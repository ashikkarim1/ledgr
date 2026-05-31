/**
 * RAG (Retrieval-Augmented Generation) System
 * Vector DB integration, embedding, and semantic search
 */

import {
  KnowledgeBaseArticle,
  RAGRetrievalResult,
  VectorStore,
  EmbeddingService,
  UserContext,
} from '../types/help-centre-types';

/**
 * In-memory vector store with cosine similarity
 * Production: Replace with Pinecone, Weaviate, or Milvus
 */
export class LocalVectorStore implements VectorStore {
  private documents: Map<string, { embedding: number[]; metadata: Record<string, any> }> =
    new Map();

  async storeDocument(
    id: string,
    embedding: number[],
    metadata: Record<string, any>
  ): Promise<void> {
    this.documents.set(id, { embedding, metadata });
  }

  async searchSimilar(
    embedding: number[],
    topK: number,
    threshold: number = 0.5
  ): Promise<RAGRetrievalResult[]> {
    const results: { id: string; score: number; metadata: Record<string, any> }[] = [];

    for (const [id, data] of this.documents.entries()) {
      const similarity = this.cosineSimilarity(embedding, data.embedding);
      if (similarity >= threshold) {
        results.push({ id, score: similarity, metadata: data.metadata });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK).map((r) => ({
      source: r.metadata.source || 'article',
      id: r.id,
      title: r.metadata.title,
      content: r.metadata.content,
      relevanceScore: r.score,
      link: r.metadata.link || `/help/${r.id}`,
    }));
  }

  async deleteDocument(id: string): Promise<void> {
    this.documents.delete(id);
  }

  async clearStore(): Promise<void> {
    this.documents.clear();
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }
}

/**
 * Mock embedding service
 * Production: Use OpenAI, Anthropic, or open-source embeddings
 */
export class OpenAIEmbeddingService implements EmbeddingService {
  private apiKey: string;
  private model: string;
  private dimension: number;

  constructor(apiKey: string, model: string = 'text-embedding-3-small') {
    this.apiKey = apiKey;
    this.model = model;
    this.dimension = model.includes('large') ? 3072 : 1536;
  }

  async embedText(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: this.model,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    return data.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: this.model,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    return data.data.map((item: any) => item.embedding);
  }
}

/**
 * RAG retrieval engine
 * Combines semantic search with filtering
 */
export class RAGEngine {
  private vectorStore: VectorStore;
  private embeddingService: EmbeddingService;

  constructor(vectorStore: VectorStore, embeddingService: EmbeddingService) {
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
  }

  /**
   * Retrieve relevant documents for a query
   * Considers user role and context
   */
  async retrieveRelevantDocuments(
    query: string,
    userContext: Partial<UserContext>,
    topK: number = 5
  ): Promise<RAGRetrievalResult[]> {
    // Embed the query
    const queryEmbedding = await this.embeddingService.embedText(query);

    // Search vector store
    let results = await this.vectorStore.searchSimilar(queryEmbedding, topK * 2, 0.4);

    // Filter by role relevance
    if (userContext.role) {
      results = results.filter((doc) => {
        const metadata = doc as any;
        return !metadata.roleRelevance || metadata.roleRelevance.includes(userContext.role);
      });
    }

    // Prioritize by integration status
    if (userContext.integrations) {
      results.sort((a, b) => {
        const aScore = this.scoreByIntegration(a, userContext.integrations);
        const bScore = this.scoreByIntegration(b, userContext.integrations);
        return (b.relevanceScore + bScore) - (a.relevanceScore + aScore);
      });
    }

    return results.slice(0, topK);
  }

  /**
   * Embed and index a knowledge base article
   */
  async indexArticle(article: KnowledgeBaseArticle): Promise<void> {
    const embedding = await this.embeddingService.embedText(
      `${article.title}\n${article.content}\n${article.tags.join(' ')}`
    );

    await this.vectorStore.storeDocument(article.id, embedding, {
      source: 'article',
      title: article.title,
      content: article.content.substring(0, 1000), // Truncate for storage
      link: `/help/articles/${article.slug}`,
      category: article.category,
      roleRelevance: article.roleRelevance,
      tags: article.tags,
    });
  }

  /**
   * Batch index multiple articles
   */
  async indexArticles(articles: KnowledgeBaseArticle[]): Promise<void> {
    const texts = articles.map(
      (a) => `${a.title}\n${a.content}\n${a.tags.join(' ')}`
    );
    const embeddings = await this.embeddingService.embedBatch(texts);

    for (let i = 0; i < articles.length; i++) {
      await this.vectorStore.storeDocument(articles[i].id, embeddings[i], {
        source: 'article',
        title: articles[i].title,
        content: articles[i].content.substring(0, 1000),
        link: `/help/articles/${articles[i].slug}`,
        category: articles[i].category,
        roleRelevance: articles[i].roleRelevance,
        tags: articles[i].tags,
      });
    }
  }

  private scoreByIntegration(
    doc: RAGRetrievalResult,
    integrations: UserContext['integrations']
  ): number {
    let score = 0;
    const docTitle = doc.title.toLowerCase();

    if (integrations.quickbooks?.connected && docTitle.includes('quickbooks')) score += 0.2;
    if (integrations.xero?.connected && docTitle.includes('xero')) score += 0.2;
    if (integrations.plaid?.connected && docTitle.includes('plaid')) score += 0.2;

    return score;
  }
}

/**
 * Error message to solution mapper
 * Retrieves solutions for known error codes
 */
export class ErrorMapper {
  private errorSolutions: Map<string, string> = new Map([
    ['ERR_QB_SYNC_FAILED', 'QuickBooks sync failed. Check your connection and authentication.'],
    ['ERR_XERO_AUTH', 'Xero authentication expired. Please reconnect.'],
    ['ERR_PLAID_LINK_TOKEN', 'Plaid connection issue. Try reconnecting your bank account.'],
    ['ERR_DATA_VALIDATION', 'Data validation error. Check your transaction details.'],
    ['ERR_DUPLICATE_TRANSACTION', 'This transaction appears to be a duplicate. Review similar recent transactions.'],
    ['ERR_ROLE_PERMISSION', 'You do not have permission to access this feature.'],
  ]);

  async findSolutionForError(errorCode: string, userContext: Partial<UserContext>): Promise<RAGRetrievalResult | null> {
    const solution = this.errorSolutions.get(errorCode);
    if (!solution) return null;

    return {
      source: 'error-mapping',
      id: `error-${errorCode}`,
      title: `Solution for ${errorCode}`,
      content: solution,
      relevanceScore: 1.0,
      link: '/help/errors',
    };
  }
}

/**
 * Initialize RAG system with configuration
 */
export async function initializeRAGSystem(config: {
  embeddingApiKey?: string;
  vectorStoreProvider?: 'local' | 'pinecone' | 'weaviate';
}): Promise<{ ragEngine: RAGEngine; vectorStore: VectorStore }> {
  const embeddingService = new OpenAIEmbeddingService(config.embeddingApiKey || '');
  const vectorStore = new LocalVectorStore(); // Replace with Pinecone client in production

  const ragEngine = new RAGEngine(vectorStore, embeddingService);

  return { ragEngine, vectorStore };
}
