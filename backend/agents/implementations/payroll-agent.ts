/**
 * Payroll Agent Implementation
 * Processes payroll records, validates calculations, tracks compliance
 */

import Anthropic from "@anthropic-ai/sdk";

export interface PayrollRecord {
  employee_id: string;
  employee_name: string;
  pay_period: string;
  base_salary: number;
  allowances: number;
  deductions: number;
  gross_pay: number;
  net_pay: number;
  tax_withheld: number;
  social_security: number;
  status: "pending" | "approved" | "paid";
}

export interface PayrollAlert {
  employee_id: string;
  alert_type: string;
  description: string;
  action_required: boolean;
}

const client = new Anthropic();

export async function processPayrollDocument(
  payrollContent: string,
  payPeriod: string
): Promise<{
  records: PayrollRecord[];
  alerts: PayrollAlert[];
  summary: {
    total_employees: number;
    total_gross_pay: number;
    total_net_pay: number;
    total_tax_withheld: number;
  };
}> {
  const prompt = `You are an expert payroll specialist. Analyze this payroll document and extract employee payment information.

Pay Period: ${payPeriod}
Payroll Content:
${payrollContent}

Extract payroll records with the following structure:
{
  "records": [
    {
      "employee_id": "string",
      "employee_name": "string",
      "pay_period": "${payPeriod}",
      "base_salary": number,
      "allowances": number,
      "deductions": number,
      "gross_pay": number,
      "net_pay": number,
      "tax_withheld": number,
      "social_security": number,
      "status": "pending"
    }
  ],
  "alerts": [
    {
      "employee_id": "string",
      "alert_type": "string",
      "description": "string",
      "action_required": boolean
    }
  ],
  "summary": {
    "total_employees": number,
    "total_gross_pay": number,
    "total_net_pay": number,
    "total_tax_withheld": number
  }
}

If no payroll records found, return empty arrays.`;

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
        records: [],
        alerts: [],
        summary: {
          total_employees: 0,
          total_gross_pay: 0,
          total_net_pay: 0,
          total_tax_withheld: 0,
        },
      };
    }
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Failed to parse payroll response:", error);
    return {
      records: [],
      alerts: [],
      summary: {
        total_employees: 0,
        total_gross_pay: 0,
        total_net_pay: 0,
        total_tax_withheld: 0,
      },
    };
  }
}
