import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { SupplierSignupDB } from "@/lib/db/supplier-signup.db";
import { logActivity } from "@/lib/activity-logger";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// ─── Validation schema ───────────────────────────────────────────────────────

const SUPPLIER_CATEGORIES = [
  "abarrotes",
  "bebidas",
  "limpieza",
  "higiene",
  "snacks",
  "lacteos",
  "panaderia",
  "otros",
] as const;

const RegisterSchema = z.object({
  ruc: z
    .string()
    .regex(/^\d{11}$/, "RUC debe tener exactamente 11 dígitos"),
  razonSocial: z.string().min(3).max(200),
  category: z.enum(SUPPLIER_CATEGORIES),
  contactName: z.string().min(2).max(100),
  contactPhone: z
    .string()
    .min(9)
    .max(15)
    .transform((v) => v.replace(/\s/g, "")),
  contactEmail: z.string().email(),
});

/**
 * POST /api/supplier/register
 *
 * Public, unauthenticated endpoint. Creates a Supplier record with
 * status="pending_review". Strict rate limit: 3 attempts per IP per hour.
 *
 * Superadmin reviews the queue at /superadmin/marketplace/suppliers and
 * approves or rejects. Approval generates an API key and notifies the
 * supplier via email/WhatsApp.
 */
export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
    // ── Rate limit (strict — 3 attempts/hour/IP) ───────────────────────
    const ip = getClientIp(req);
    const rl = rateLimit(`supplier-register:${ip}`, 3, 60 * 60);
    if (!rl.allowed) {
      const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        {
          error: "Demasiadas solicitudes",
          message:
            "Has alcanzado el límite de intentos. Intenta de nuevo en una hora.",
        },
        {
          status: 429,
          headers: { "Retry-After": retryAfter.toString() },
        },
      );
    }

    // ── Parse & validate body ──────────────────────────────────────────
    const body = await req.json().catch((err) => { logger.error("[supplier/register] parse JSON body failed", { error: String(err) }); return null; });
    if (!body) {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Datos inválidos",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // ── RUC uniqueness check ───────────────────────────────────────────
    const existing = await SupplierSignupDB.findByRuc(data.ruc);
    if (existing) {
      return NextResponse.json(
        {
          error: "RUC ya registrado",
          message:
            "Ya existe una solicitud de registro con este RUC. Si crees que es un error contáctanos.",
        },
        { status: 409 },
      );
    }

    // ── Create supplier in pending_review ──────────────────────────────
    let supplier;
    try {
      supplier = await SupplierSignupDB.register(data);
    } catch (err) {
      if (err instanceof Error && err.message === "RUC_ALREADY_REGISTERED") {
        return NextResponse.json(
          { error: "RUC ya registrado" },
          { status: 409 },
        );
      }
      throw err;
    }

    // ── Fire-and-forget: audit log + admin notification ────────────────
    logActivity(
      "supplier_self_registered",
      "Supplier",
      `Nuevo proveedor: ${data.razonSocial} (RUC ${data.ruc})`,
      supplier.id,
      "system",
      undefined,
      "__platform__",
    ).catch((err) => logger.error("[supplier/register] operation failed", { error: String(err) }));

    const adminPhone = process.env.ADMIN_WHATSAPP_PHONE;
    if (adminPhone) {
      const message =
        `🆕 *Nueva solicitud de proveedor*\n\n` +
        `Razón social: ${data.razonSocial}\n` +
        `RUC: ${data.ruc}\n` +
        `Categoría: ${data.category}\n` +
        `Contacto: ${data.contactName}\n` +
        `Teléfono: ${data.contactPhone}\n` +
        `Email: ${data.contactEmail}\n\n` +
        `Revisa la cola en /superadmin/marketplace/suppliers`;
      sendWhatsAppQueued(adminPhone, message, { tenantId: "__platform__", context: "supplier-register-admin-notify" }).catch(() => {});
    }

    return NextResponse.json(
      {
        ok: true,
        supplierId: supplier.id,
        message:
          "Solicitud recibida. Te contactaremos en 24-48h para coordinar los siguientes pasos.",
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("[supplier-register] failed", {
      error: err instanceof Error ? err.message : String(err),
      traceId,
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
