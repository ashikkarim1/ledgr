/**
 * Tax Specialist Agent Implementation
 * Identifies tax obligations, tracks VAT, prepares tax provisions
 */

import Anthropic from "@anthropic-ai/sdk";

export interface TaxItem {
  transaction_id: string;
  transaction_date: string;
  transaction_type: "income" | "expense";
  amount: number;
  tax_category: string;
  tax_rate: number;
  tax_amount: number;
  vat_treatment: "standard" | "zero" | "exempt" | "reverse_charge";
}

export interface TaxAlert {
  alert_type: string;
  severity: "info" | "warning" | "critical";
  description: string;
  required_action: string;
}

const client = new Anthropic();

export async function analyzeTaxPosition(
  transactionContent: string,
  jurisdiction: string = "UAE"
): Promise<{
  tax_items: TaxItem[];
  tax_summary: {
    total_taxable_income: number;
    total_tax_liability: number;
    total_vat_collected: number;
    total_vat_paid: number;
  };
  alerts: TaxAlert[];
}> {
  const prompt = `You are an expert tax specialist analyzing financial transactions for ${jurisdiction} tax compliance.

Transaction Data:
${transactionContent}

Analyze and categorize transactions for tax purposes:
1. Identify taxable vs non-taxable items
2. Classify VAT treatment (standard, zero-rated, exempt, reverse charge)
3. Identify any tax compliance issues or deadlines

Return JSON:
{
  "tax_items": [
    {
      "transaction_id": "string",
      "transaction_date": "YYYY-MM-DD",
      "transaction_type": "income" | "expense",
      "amount": number,
      "tax_category": "string",
      "tax_rate": number,
      "tax_amount": number,
      "vat_treatment": "standard" | "zero" | "exempt" | "reverse_charge"
    }
  ],
  "tax_summary": {
    "total_taxable_income": number,
    "total_tax_liability": number,
    "total_vat_collected": number,
    "total_vat_paid": number
  },
  "alerts": [
    {
      "alert_type": "string",
      "severity": "info" | "warning" | "critical",
      "description": "string",
      "required_action": "string"
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
        tax_items: [],
        tax_summary: {
          total_taxable_income: 0,
          total_tax_liability: 0,
          total_vat_collected: 0,
          total_vat_paid: 0,
        },
        alerts: [],
      };
    }
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Failed to parse tax response:", error);
    return {
      tax_items: [],
      tax_summary: {
        total_taxable_income: 0,
        total_tax_liability: 0,
        total_vat_collected: 0,
        total_vat_paid: 0,
      },
      alerts: [],
    };
  }
}
