/**
 * Help Centre Controller
 * Handles support articles, tickets, and live chat support
 */

import { Request, Response } from "express";
import { ApiErrors, asyncHandler } from "../middleware/error-handler.js";
import {
  ApiResponse,
  HelpArticle,
  SupportTicket,
  ChatMessage,
} from "../response-types.js";

/**
 * GET /v1/help/articles
 * Search help articles (RAG-enabled)
 */
export const searchArticles = asyncHandler(async (req: Request, res: Response) => {
  const { query, category, limit } = req.query;

  const searchLimit = Math.min(parseInt(limit as string) || 10, 50);

  if (!query) {
    throw ApiErrors.invalidRequest("query parameter is required");
  }

  // TODO: Implement semantic search using RAG
  const { articles, totalResults } = await performRagSearch(
    query as string,
    category as string | undefined,
    searchLimit
  );

  const response: ApiResponse<HelpArticle[]> = {
    success: true,
    data: articles,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
      search: {
        query: query as string,
        results: articles.length,
        total: totalResults,
      },
    },
    errors: null,
  };

  res.json(response);
});

/**
 * GET /v1/help/articles/:article_id
 * Get article details
 */
export const getArticle = asyncHandler(async (req: Request, res: Response) => {
  const { article_id } = req.params;

  const article = await fetchArticle(article_id);
  if (!article) {
    throw ApiErrors.notFound("Article not found");
  }

  // Increment view count
  await incrementArticleViews(article_id);

  const response: ApiResponse<HelpArticle> = {
    success: true,
    data: article,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
    },
    errors: null,
  };

  res.json(response);
});

/**
 * POST /v1/help/tickets
 * Create a support ticket
 */
export const createTicket = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { workspace_id, subject, description, priority, category } = req.body;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  // Validation
  if (!subject || !description) {
    throw ApiErrors.invalidRequest("subject and description are required");
  }

  if (subject.length < 5 || subject.length > 200) {
    throw ApiErrors.validation("subject", "Subject must be 5-200 characters");
  }

  if (!["low", "medium", "high", "urgent"].includes(priority || "medium")) {
    throw ApiErrors.validation("priority", "Invalid priority level");
  }

  const ticket_id = generateId("tkt");

  // Create ticket
  await insertTicket({
    ticket_id,
    workspace_id,
    subject,
    description,
    priority: priority || "medium",
    category: category || "general",
    status: "open",
    created_by: user.user_id,
    created_at: new Date(),
  });

  // TODO: Send confirmation email and notify support team

  const response: ApiResponse<SupportTicket> = {
    success: true,
    data: {
      ticket_id,
      subject,
      status: "open",
      priority: priority || "medium",
      created_at: new Date().toISOString(),
    },
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
    },
    errors: null,
  };

  res.status(201).json(response);
});

/**
 * GET /v1/help/tickets
 * List user's support tickets
 */
export const listTickets = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { status, workspace_id } = req.query;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
  const offset = (page - 1) * limit;

  const filters: any = {};
  if (status) filters.status = status;

  const { tickets, total } = await getUserTickets(
    user.user_id,
    workspace_id as string | undefined,
    filters,
    limit,
    offset
  );

  const response: ApiResponse<SupportTicket[]> = {
    success: true,
    data: tickets,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
    errors: null,
  };

  res.json(response);
});

/**
 * GET /v1/help/tickets/:ticket_id
 * Get ticket details
 */
export const getTicket = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { ticket_id } = req.params;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  const ticket = await fetchTicket(ticket_id);
  if (!ticket) {
    throw ApiErrors.notFound("Ticket not found");
  }

  // Verify user has access
  if (ticket.created_by !== user.user_id) {
    throw ApiErrors.forbidden("No access to this ticket");
  }

  // Get messages
  const messages = await getTicketMessages(ticket_id);

  const response: ApiResponse<SupportTicket> = {
    success: true,
    data: {
      ...ticket,
      messages,
    },
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
    },
    errors: null,
  };

  res.json(response);
});

/**
 * POST /v1/help/tickets/:ticket_id/messages
 * Add message to support ticket
 */
export const addTicketMessage = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { ticket_id } = req.params;
  const { message } = req.body;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  if (!message || message.length < 1) {
    throw ApiErrors.invalidRequest("message is required");
  }

  // Verify ticket exists and user has access
  const ticket = await fetchTicket(ticket_id);
  if (!ticket) {
    throw ApiErrors.notFound("Ticket not found");
  }

  if (ticket.created_by !== user.user_id) {
    throw ApiErrors.forbidden("No access to this ticket");
  }

  const message_id = generateId("msg");

  // Add message
  await insertTicketMessage({
    message_id,
    ticket_id,
    user_id: user.user_id,
    message,
    created_at: new Date(),
  });

  // TODO: Notify support team and AI assistant

  const response: ApiResponse<ChatMessage> = {
    success: true,
    data: {
      message_id,
      message,
      created_at: new Date().toISOString(),
    },
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
    },
    errors: null,
  };

  res.status(201).json(response);
});

/**
 * ==========================================
 * HELPER FUNCTIONS
 * ==========================================
 */

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * ==========================================
 * DATABASE FUNCTIONS (STUBS)
 * ==========================================
 */

async function performRagSearch(
  query: string,
  category: string | undefined,
  limit: number
): Promise<{ articles: HelpArticle[]; totalResults: number }> {
  // TODO: Implement RAG semantic search
  return { articles: [], totalResults: 0 };
}

async function fetchArticle(articleId: string): Promise<HelpArticle | null> {
  // TODO: Query database
  return null;
}

async function incrementArticleViews(articleId: string): Promise<void> {
  // TODO: Update article view count
}

async function insertTicket(data: any): Promise<void> {
  // TODO: Insert into support_tickets table
}

async function getUserTickets(
  userId: string,
  workspaceId: string | undefined,
  filters: any,
  limit: number,
  offset: number
): Promise<{ tickets: SupportTicket[]; total: number }> {
  // TODO: Query database
  return { tickets: [], total: 0 };
}

async function fetchTicket(ticketId: string): Promise<SupportTicket | null> {
  // TODO: Query database
  return null;
}

async function getTicketMessages(ticketId: string): Promise<ChatMessage[]> {
  // TODO: Query database
  return [];
}

async function insertTicketMessage(data: any): Promise<void> {
  // TODO: Insert into ticket_messages table
}
