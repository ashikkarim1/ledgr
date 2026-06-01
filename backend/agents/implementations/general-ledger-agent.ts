/**
 * General Ledger Agent Implementation
 * Processes general ledger entries, classifies transactions, validates accuracy
 */

import Anthropic from "@anthropic-ai/sdk";

export interface LedgerEntry {
  entry_id: string;
  posting_date: string;
  account_code: string;
  account_name: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  reference: string;
  status: "draft" | "posted" | "reversed";
}

export interface AccountBalance {
  account_code: string;
  account_name: string;
  account_type: string;
  debit_balance: number;
  credit_balance: number;
  net_balance: number;
}

const client = new Anthropic();

export async function processGLDocument(
  glContent: string
): Promise<{
  entries: LedgerEntry[];
  account_balances: AccountBalance[];
  trial_balance: {
    total_debits: number;
    total_credits: number;
    balanced: boolean;
  };
}> {
  const prompt = `You are an expert general ledger accountant. Analyze this general ledger data and extract all entries.

General Ledger Content:
${glContent}

Extract and structure the ledger entries:
{
  "entries": [
    {
      "entry_id": "string",
      "posting_date": "YYYY-MM-DD",
      "account_code": "string",
      "account_name": "string",
      "description": "string",
      "debit_amount": number,
      "credit_amount": number,
      "reference": "string",
      "status": "posted"
    }
  ],
  "account_balances": [
    {
      "account_code": "string",
      "account_name": "string",
      "account_type": "asset|liability|equity|revenue|expense",
      "debit_balance": number,
      "credit_balance": number,
      "net_balance": number
    }
  ],
  "trial_balance": {
    "total_debits": number,
    "total_credits": number,
    "balanced": boolean
  }
}

If no entries found, return empty arrays.`;

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
      return {
        entries: [],
        account_balances: [],
        trial_balance: {
          total_debits: 0,
          total_credits: 0,
          balanced: true,
        },
      };
    }
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Failed to parse GL response:", error);
    return {
      entries: [],
      account_balances: [],
      trial_balance: {
        total_debits: 0,
        total_credits: 0,
        balanced: true,
      },
    };
  }
}
