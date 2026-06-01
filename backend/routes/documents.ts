/**
 * Documents Routes
 * Handles all document processing endpoints
 */

import express, { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middleware/auth-middleware";
import * as documentsController from "../controllers/documents.controller";

export function createDocumentsRoutes(): Router {
  const router = express.Router();

  // Configure multer for file uploads
  const storage = multer.memoryStorage();
  const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
      const allowedMimes = [
        "application/pdf",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/csv",
        "text/plain",
        "image/jpeg",
        "image/png",
      ];

      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Invalid file type"));
      }
    },
  });

  // Protected routes - all require authentication
  router.use(authMiddleware);

  /**
   * POST /v1/documents/upload
   * Upload and process a document
   */
  router.post(
    "/upload",
    upload.single("file"),
    documentsController.uploadDocument
  );

  /**
   * GET /v1/documents
   * List processing jobs in workspace
   */
  router.get("/", documentsController.listDocuments);

  /**
   * GET /v1/documents/:job_id
   * Get processing job status and results
   */
  router.get("/:job_id", documentsController.getDocument);

  /**
   * GET /v1/documents/:job_id/summary
   * Get processing results summary for dashboard
   */
  router.get("/:job_id/summary", documentsController.getDocumentSummary);

  /**
   * POST /v1/documents/:job_id/approve
   * Approve processing results (requires accountant role)
   */
  router.post("/:job_id/approve", documentsController.approveDocument);

  /**
   * POST /v1/documents/:job_id/reject
   * Reject processing results (requires accountant role)
   */
  router.post("/:job_id/reject", documentsController.rejectDocument);

  return router;
}
