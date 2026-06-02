/**
 * Interest Form Routes
 * Handles interest form submissions from pricing page
 */

import express, { Router, Request, Response } from "express";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface InterestFormData {
  name: string;
  email: string;
  company: string;
  phone: string;
  plan: string;
  timestamp: string;
}

export function createInterestRoutes(): Router {
  const router = express.Router();

  /**
   * POST /api/interest
   * Submit interest form from pricing page
   */
  router.post("/", async (req: Request, res: Response) => {
    try {
      const { name, email, company, phone, plan } = req.body;

      // Validate required fields
      if (!name || !email || !plan) {
        return res.status(400).json({
          error: "Missing required fields: name, email, plan",
        });
      }

      const data: InterestFormData = {
        name,
        email,
        company: company || "Not specified",
        phone: phone || "Not specified",
        plan,
        timestamp: new Date().toISOString(),
      };

      // Send email to admin via Resend
      const adminEmail = process.env.RESEND_REPLY_TO || "ceo@theupcapital.com";
      const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@ledgr.ae";

      const sendAdminEmail = await resend.emails.send({
        from: fromEmail,
        to: adminEmail,
        subject: `New interest from ${data.name} - ${data.plan} plan`,
        html: `
          <h2>New Interest Submission</h2>
          <p><strong>Name:</strong> ${data.name}</p>
          <p><strong>Email:</strong> ${data.email}</p>
          <p><strong>Company:</strong> ${data.company}</p>
          <p><strong>Phone:</strong> ${data.phone}</p>
          <p><strong>Interested Plan:</strong> ${data.plan}</p>
          <p><strong>Submitted:</strong> ${data.timestamp}</p>
        `,
        replyTo: data.email,
      });

      if (sendAdminEmail.error) {
        console.error("Resend error:", sendAdminEmail.error);
        return res.status(500).json({
          error: "Failed to process interest submission",
          details: sendAdminEmail.error,
        });
      }

      // Send confirmation email to user
      await resend.emails.send({
        from: fromEmail,
        to: data.email,
        subject: "We've received your interest - Ledgr",
        html: `
          <h2>Thank you for your interest!</h2>
          <p>Hi ${data.name},</p>
          <p>We've received your interest in the <strong>${data.plan}</strong> plan. Our team will be in touch shortly to help you get started.</p>
          <p>If you have any questions in the meantime, feel free to reach out.</p>
          <p>Best regards,<br/>The Ledgr Team</p>
        `,
      });

      return res.status(200).json({
        success: true,
        message: "Interest submitted successfully",
        data: {
          name: data.name,
          email: data.email,
          plan: data.plan,
        },
      });
    } catch (error) {
      console.error("Interest form error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return router;
}
