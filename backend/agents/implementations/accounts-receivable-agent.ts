/**
 * Accounts Receivable Agent Implementation
 * Processes customer invoices, tracks payments, manages aging
 */

import Anthropic from "@anthropic-ai/sdk";

export interface SalesInvoiceData {
  invoice_number: string;
  customer_name: string;
  invoice_date: string;
  due_date: string;
  amount: number;
  currency: string;
  tax_amount: number;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  payment_status: "unpaid" | "partial" | "paid";
  days_overdue: number;
}

const client = new Anthropic();

export async function processARDocument(
  documentContent: string,
  documentType: string
): Promise<SalesInvoiceData[]> {
  const prompt = `You are an expert accounts receivable specialist. Analyze this document and extract all customer invoice information.

Document Type: ${documentType}
Document Content:
${documentContent}

Extract and return a JSON array of customer invoices with the following structure:
{
  "invoices": [
    {
      "invoice_number": "string",
      "customer_name": "string",
      "invoice_date": "YYYY-MM-DD",
      "due_date": "YYYY-MM-DD",
      "amount": number,
      "currency": "AED" | "USD" | "EUR",
      "tax_amount": number,
      "line_items": [
        {
          "description": "string",
          "quantity": number,
          "unit_price": number,
          "total": number
        }
      ],
      "payment_status": "unpaid",
      "days_overdue": 0
    }
  ]
}

Only return valid JSON. If no invoices are found, return { "invoices": [] }.`;

  const message = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  try {
    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return [];
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.invoices || [];
  } catch (error) {
    console.error("Failed to parse AR response:", error);
    return [];
  }
}

export async function assessARRisk(
  invoice: SalesInvoiceData
): Promise<{ risk_level: "low" | "medium" | "high"; reason: string }> {
  if (invoice.days_overdue > 90) {
    return { risk_level: "high", reason: "Invoice overdue more than 90 days" };
  }
  if (invoice.days_overdue > 30) {
    return { risk_level: "medium", reason: "Invoice overdue more than 30 days" };
  }
  return { risk_level: "low", reason: "Invoice within normal terms" };
}
