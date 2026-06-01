/**
 * Reconciliation Agent Implementation
 * Matches transactions between bank statements and ledger
 */

import Anthropic from "@anthropic-ai/sdk";

export interface ReconciliationMatch {
  ledger_transaction_id: string;
  bank_transaction_id: string;
  amount: number;
  transaction_date: string;
  matched: boolean;
  variance: number;
}

export interface UnmatchedTransaction {
  transaction_id: string;
  source: "bank" | "ledger";
  amount: number;
  date: string;
  description: string;
}

const client = new Anthropic();

export async function performReconciliation(
  bankStatementContent: string,
  ledgerContent: string
): Promise<{
  matched_count: number;
  unmatched_count: number;
  variance_total: number;
  unmatched_transactions: UnmatchedTransaction[];
}> {
  const prompt = `You are an expert bank reconciliation specialist. Analyze these bank and ledger records and identify matching transactions.

Bank Statement:
${bankStatementContent}

Ledger Entries:
${ledgerContent}

Identify:
1. Which bank transactions match ledger entries
2. Which entries are unmatched
3. Any discrepancies in amounts or dates

Return JSON:
{
  "matched_count": number,
  "unmatched_count": number,
  "variance_total": number,
  "unmatched_transactions": [
    {
      "transaction_id": "string",
      "source": "bank" | "ledger",
      "amount": number,
      "date": "YYYY-MM-DD",
      "description": "string"
    }
  ]
}`;

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
        matched_count: 0,
        unmatched_count: 0,
        variance_total: 0,
        unmatched_transactions: [],
      };
    }
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Failed to parse reconciliation response:", error);
    return {
      matched_count: 0,
      unmatched_count: 0,
      variance_total: 0,
      unmatched_transactions: [],
    };
  }
}
