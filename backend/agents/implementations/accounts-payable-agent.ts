/**
 * Accounts Payable Agent Implementation
 * Processes supplier invoices, validates vendors, extracts invoice data
 */

import Anthropic from "@anthropic-ai/sdk";

export interface InvoiceData {
  invoice_number: string;
  vendor_name: string;
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
  payment_terms: string;
  status: "pending" | "approved" | "paid" | "disputed";
}

const client = new Anthropic();

export async function processAPDocument(
  documentContent: string,
  documentType: string
): Promise<InvoiceData[]> {
  const prompt = `You are an expert accounts payable specialist. Analyze this document and extract all invoice information.

Document Type: ${documentType}
Document Content:
${documentContent}

Extract and return a JSON array of invoices with the following structure:
{
  "invoices": [
    {
      "invoice_number": "string",
      "vendor_name": "string",
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
      "payment_terms": "string",
      "status": "pending"
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
    console.error("Failed to parse AP response:", error);
    return [];
  }
}

export async function validateAPInvoice(
  invoice: InvoiceData
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (!invoice.invoice_number) errors.push("Missing invoice number");
  if (!invoice.vendor_name) errors.push("Missing vendor name");
  if (!invoice.invoice_date) errors.push("Missing invoice date");
  if (invoice.amount <= 0) errors.push("Invalid amount");
  if (!invoice.currency) errors.push("Missing currency");

  // Check for reasonable values
  if (invoice.tax_amount < 0) errors.push("Tax amount cannot be negative");
  if (invoice.amount < invoice.tax_amount)
    errors.push("Tax amount exceeds total amount");

  return {
    valid: errors.length === 0,
    errors,
  };
}
