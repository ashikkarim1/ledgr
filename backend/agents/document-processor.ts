/**
 * Document Processor - Orchestrates Multi-Agent Processing
 * Routes documents to appropriate agents based on type
 * Manages processing pipeline and result aggregation
 */

import { v4 as uuidv4 } from "uuid";
import * as APAgent from "./implementations/accounts-payable-agent.js";
import * as ARAgent from "./implementations/accounts-receivable-agent.js";
import * as ReconciliationAgent from "./implementations/reconciliation-agent.js";
import * as TaxAgent from "./implementations/tax-agent.js";
import * as PayrollAgent from "./implementations/payroll-agent.js";
import * as GLAgent from "./implementations/general-ledger-agent.js";

export interface ProcessingJob {
  job_id: string;
  user_id: string;
  workspace_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_at: Date;
  processing_status: "pending" | "processing" | "completed" | "failed";
  processing_results: ProcessingResults;
  created_at: Date;
  completed_at?: Date;
  error?: string;
}

export interface ProcessingResults {
  ap_data?: APAgent.InvoiceData[];
  ar_data?: ARAgent.SalesInvoiceData[];
  reconciliation_data?: Awaited<
    ReturnType<typeof ReconciliationAgent.performReconciliation>
  >;
  tax_data?: Awaited<ReturnType<typeof TaxAgent.analyzeTaxPosition>>;
  payroll_data?: Awaited<ReturnType<typeof PayrollAgent.processPayrollDocument>>;
  gl_data?: Awaited<ReturnType<typeof GLAgent.processGLDocument>>;
  processing_metadata: {
    agents_executed: string[];
    total_duration_ms: number;
    started_at: Date;
    completed_at: Date;
    approval_status: "pending_review" | "approved" | "rejected";
  };
}

// In-memory storage for processing results (will be replaced with database)
const processingResults = new Map<string, ProcessingJob>();

export async function processDocument(
  fileContent: string,
  fileName: string,
  fileType: string,
  userId: string,
  workspaceId: string
): Promise<ProcessingJob> {
  const jobId = uuidv4();
  const job: ProcessingJob = {
    job_id: jobId,
    user_id: userId,
    workspace_id: workspaceId,
    file_name: fileName,
    file_type: fileType,
    file_size: fileContent.length,
    uploaded_at: new Date(),
    processing_status: "processing",
    processing_results: {
      processing_metadata: {
        agents_executed: [],
        total_duration_ms: 0,
        started_at: new Date(),
        completed_at: new Date(),
        approval_status: "pending_review",
      },
    },
    created_at: new Date(),
  };

  // Store job immediately
  processingResults.set(jobId, job);

  // Start async processing
  (async () => {
    try {
      const startTime = Date.now();
      const results: ProcessingResults = {
        processing_metadata: {
          agents_executed: [],
          total_duration_ms: 0,
          started_at: new Date(),
          completed_at: new Date(),
          approval_status: "pending_review",
        },
      };

      // Detect document type and route to appropriate agents
      const documentType = detectDocumentType(fileName, fileContent);

      // Process with appropriate agents based on document type
      if (
        documentType === "invoice" ||
        documentType === "supplier_invoice" ||
        documentType === "mixed"
      ) {
        try {
          results.ap_data = await APAgent.processAPDocument(
            fileContent,
            "supplier_invoice"
          );
          results.processing_metadata.agents_executed.push("Accounts Payable");
        } catch (error) {
          console.error("AP Agent error:", error);
        }
      }

      if (
        documentType === "sales_invoice" ||
        documentType === "customer_invoice" ||
        documentType === "mixed"
      ) {
        try {
          results.ar_data = await ARAgent.processARDocument(
            fileContent,
            "customer_invoice"
          );
          results.processing_metadata.agents_executed.push("Accounts Receivable");
        } catch (error) {
          console.error("AR Agent error:", error);
        }
      }

      if (documentType === "bank_statement" || documentType === "mixed") {
        try {
          results.reconciliation_data =
            await ReconciliationAgent.performReconciliation(fileContent, "");
          results.processing_metadata.agents_executed.push("Reconciliation");
        } catch (error) {
          console.error("Reconciliation Agent error:", error);
        }
      }

      // Tax analysis always runs
      try {
        results.tax_data = await TaxAgent.analyzeTaxPosition(
          fileContent,
          "UAE"
        );
        results.processing_metadata.agents_executed.push("Tax Specialist");
      } catch (error) {
        console.error("Tax Agent error:", error);
      }

      if (documentType === "payroll" || documentType === "mixed") {
        try {
          const payPeriod = extractPayrollPeriod(fileName);
          results.payroll_data = await PayrollAgent.processPayrollDocument(
            fileContent,
            payPeriod
          );
          results.processing_metadata.agents_executed.push("Payroll");
        } catch (error) {
          console.error("Payroll Agent error:", error);
        }
      }

      if (documentType === "general_ledger" || documentType === "mixed") {
        try {
          results.gl_data = await GLAgent.processGLDocument(fileContent);
          results.processing_metadata.agents_executed.push("General Ledger");
        } catch (error) {
          console.error("GL Agent error:", error);
        }
      }

      // Update results
      results.processing_metadata.total_duration_ms = Date.now() - startTime;
      results.processing_metadata.completed_at = new Date();
      results.processing_metadata.approval_status = "pending_review";

      job.processing_results = results;
      job.processing_status = "completed";
      job.completed_at = new Date();

      processingResults.set(jobId, job);
    } catch (error) {
      job.processing_status = "failed";
      job.error = error instanceof Error ? error.message : "Unknown error";
      job.completed_at = new Date();
      processingResults.set(jobId, job);
    }
  })();

  return job;
}

export function getProcessingJob(jobId: string): ProcessingJob | undefined {
  return processingResults.get(jobId);
}

export function getWorkspaceJobs(
  workspaceId: string,
  limit: number = 20
): ProcessingJob[] {
  return Array.from(processingResults.values())
    .filter((job) => job.workspace_id === workspaceId)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(0, limit);
}

export function approveProcessingResults(
  jobId: string,
  approvedBy: string
): ProcessingJob | undefined {
  const job = processingResults.get(jobId);
  if (job) {
    job.processing_results.processing_metadata.approval_status = "approved";
  }
  return job;
}

export function rejectProcessingResults(
  jobId: string,
  rejectionReason: string
): ProcessingJob | undefined {
  const job = processingResults.get(jobId);
  if (job) {
    job.processing_results.processing_metadata.approval_status = "rejected";
    job.error = rejectionReason;
  }
  return job;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectDocumentType(
  fileName: string,
  content: string
): string {
  const lowerFileName = fileName.toLowerCase();

  // Heuristic detection based on file name and content
  if (
    lowerFileName.includes("invoice") ||
    lowerFileName.includes("vendor") ||
    content.toLowerCase().includes("vendor") ||
    content.toLowerCase().includes("supplier")
  ) {
    return "supplier_invoice";
  }

  if (
    lowerFileName.includes("sale") ||
    lowerFileName.includes("customer") ||
    content.toLowerCase().includes("customer invoice") ||
    content.toLowerCase().includes("sales invoice")
  ) {
    return "sales_invoice";
  }

  if (
    lowerFileName.includes("bank") ||
    lowerFileName.includes("statement") ||
    content.toLowerCase().includes("bank account") ||
    content.toLowerCase().includes("balance")
  ) {
    return "bank_statement";
  }

  if (
    lowerFileName.includes("payroll") ||
    lowerFileName.includes("salary") ||
    content.toLowerCase().includes("employee") ||
    content.toLowerCase().includes("salary")
  ) {
    return "payroll";
  }

  if (
    lowerFileName.includes("ledger") ||
    lowerFileName.includes("trial balance") ||
    content.toLowerCase().includes("general ledger") ||
    content.toLowerCase().includes("debit") ||
    content.toLowerCase().includes("credit")
  ) {
    return "general_ledger";
  }

  // Default to mixed processing
  return "mixed";
}

function extractPayrollPeriod(fileName: string): string {
  // Try to extract period from filename (e.g., "Payroll_Jan_2024.pdf" -> "January 2024")
  const monthMatch = fileName.match(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i);
  const yearMatch = fileName.match(/20\d{2}/);

  if (monthMatch && yearMatch) {
    return `${monthMatch[0]} ${yearMatch[0]}`;
  }

  return new Date().toISOString().split("T")[0]; // Current date
}
