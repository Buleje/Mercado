import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "VIEW" | "LOGIN" | "FAILED_LOGIN" | "EXPORT" | "SYSTEM";

interface AuditConfig {
  req: NextRequest;
  action: AuditAction;
  entity: "Order" | "Sale" | "Customer" | "Product" | "Inventory" | "CashRegister" | "Settings" | "Auth" | "Supplier" | "Purchase" | "Agent";
  entityId?: string;
  detail: string;
  user?: string; // If known, otherwise fallbacks to "system" or extracted from session
  tenantId?: string;
}

/**
 * Universal Audit Logger for Enterprise Tracking.
 * Captures IP Address, User Agent, and action details asynchronously to avoid blocking the main thread.
 */
export function logAudit({
  req, action, entity, entityId, detail, user = "admin", tenantId = "main",
}: AuditConfig) {
  // Extract network identifiers for security audit
  const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "0.0.0.0";
  const userAgent = req.headers.get("user-agent")?.substring(0, 255) || "UnknownAgent";

  // Fire-and-forget logging to not impact TTFB (Time To First Byte)
  prisma.activityLog.create({
    data: {
      action,
      entity,
      entityId,
      detail,
      user,
      ipAddress,
      userAgent,
      tenantId,
    }
  }).catch((err) => {
    logger.error("[AuditLogger] Failed to write audit log", { error: String(err) });
  });
}
