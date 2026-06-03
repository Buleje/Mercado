import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { PaymentProofsDB } from "@/lib/db/payment-proofs.db";
import {
  findTenantBySlug,
  createTenant,
  createAdminUser,
  adminUserExists,
} from "@/lib/db/tenant-onboarding.db";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { assertCsrf } from "@/lib/auth/csrf";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";

/**
 * POST /api/superadmin/payment-proofs/[id]/approve
 *
 * Auth: middleware ya validó la cookie buleje-platform-sess.
 * Inyecta `x-platform-user` con el username del superadmin.
 *
 * Flujo:
 *   1. Crea el Tenant si el slug no existe.
 *   2. Marca el PaymentProof como approved.
 *   3. Envía WhatsApp de bienvenida al ownerPhone.
 */
const BodySchema = z.object({
  whatsappMessage: z.string().min(10).max(800).optional(),
});

/** Contraseña temporal legible (10 chars, sin 0/O/1/l/I ambiguos). */
function genTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  let p = "";
  for (let i = 0; i < 10; i++) p += alphabet[bytes[i] % alphabet.length];
  return p;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "STRICT", "superadmin-payment-proofs-X-approve"); if (_rl) return _rl;
  // P1-4: CSRF double-submit defense-in-depth (financial endpoint).
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  // Defense-in-depth: validar sesion superadmin independiente del middleware
  const _auth = await requirePlatformAPI(req);
  if (_auth instanceof NextResponse) return _auth;
  const platformUser = _auth.username;
  const { id } = await params;

  const proof = await PaymentProofsDB.getById(id);
  if (!proof) {
    return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
  }
  if (proof.status !== "pending") {
    return NextResponse.json({ error: `Pago ya está ${proof.status}` }, { status: 409 });
  }

  let body: unknown = {};
  try { body = await req.json(); } catch { body = {}; }
  const parsed = BodySchema.safeParse(body);
  const customMsg = parsed.success ? parsed.data.whatsappMessage : undefined;

  // 1) Crear tenant si no existe
  let tenantId: string;
  try {
    const existing = await findTenantBySlug(proof.tenantSlug);
    if (existing) {
      tenantId = existing.id;
    } else {
      // Mapeo: el id interno "basico" en plan-tiers.ts corresponde al
      // string "free" del campo Tenant.plan (legacy). Pro/business/enterprise
      // mapea 1-1; max → enterprise (el campo tenant.plan no soporta "max").
      const tenantPlan: "free" | "pro" | "business" | "enterprise" =
        proof.planTier === "basico" ? "free"
        : proof.planTier === "pro" ? "pro"
        : proof.planTier === "max" ? "enterprise"
        : "enterprise";
      const trialEnds = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30d default
      const created = await createTenant({
        slug: proof.tenantSlug,
        storeName: proof.storeName,
        ownerEmail: proof.ownerEmail ?? "",
        ownerPhone: proof.ownerPhone,
        plan: tenantPlan,
        type: "store",
        trialEndsAt: trialEnds,
      });
      tenantId = created.id;
    }
  } catch (err) {
    logger.error("[payment-proof/approve] tenant creation failed", { error: String(err), proofId: id });
    return NextResponse.json({ error: "No pudimos crear la tienda" }, { status: 500 });
  }

  // 1b) Crear el AdminUser + Settings si el tenant aún no tiene cuenta.
  // El form de registro NO pide contraseña → la generamos acá y la entregamos
  // por WhatsApp (+ se la devolvemos al superadmin como respaldo). Username = el
  // teléfono del dueño (lo conoce de memoria).
  let credentials: { username: string; password: string; loginUrl: string } | null = null;
  try {
    if (!(await adminUserExists(tenantId))) {
      const username = proof.ownerPhone.replace(/\D/g, "") || `tienda-${proof.tenantSlug}`;
      const password = genTempPassword();
      await createAdminUser({
        tenantId,
        adminName: proof.ownerName,
        adminUsername: username,
        adminPassword: password,
        businessName: proof.storeName,
      });
      // URL del panel en el subdominio del tenant (el Host decide el tenant).
      const u = new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe");
      const apex = u.host.replace(/^www\./, "");
      credentials = {
        username,
        password,
        loginUrl: `${u.protocol}//${proof.tenantSlug}.${apex}/admin/login`,
      };
    }
  } catch (err) {
    // No bloqueamos la aprobación: el tenant ya existe. El superadmin puede
    // crear la cuenta a mano si esto falla (raro: colisión de username).
    logger.error("[payment-proof/approve] admin user creation failed", {
      error: String(err),
      tenantId,
      proofId: id,
    });
  }

  // 2) Marcar como aprobado
  try {
    await PaymentProofsDB.approve(id, platformUser, tenantId);
  } catch (err) {
    logger.error("[payment-proof/approve] mark-approved failed", { error: String(err), proofId: id });
    return NextResponse.json({ error: "Error al aprobar" }, { status: 500 });
  }

  // Audit log financial action — quién, qué tenant, qué plan, qué monto.
  logSuperadminAction(
    "approve_payment_proof",
    `Aprobó pago de ${proof.ownerName} (${proof.tenantSlug}) — S/${proof.amountPEN} ${proof.planTier}`,
    {
      proofId: id,
      tenantId,
      tenantSlug: proof.tenantSlug,
      planTier: proof.planTier,
      amountPEN: proof.amountPEN,
      method: proof.method,
    },
    platformUser,
  ).catch((err) =>
    logger.error("[payment-proof/approve] audit log failed", { err: String(err) }),
  );

  // 3) WhatsApp de bienvenida — fire-and-forget
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";
  // Labels alineados con lib/billing/plan-tiers.ts (mayo 2026 v2)
  const PLAN_LABELS: Record<string, string> = {
    basico: "Free",
    pro: "Starter",
    enterprise: "Pro",
    max: "Business",
  };
  const planLabel = PLAN_LABELS[proof.planTier] ?? proof.planTier;
  const defaultMsg = credentials
    ? [
        `🎉 ¡Bienvenido a Buleje, ${proof.ownerName}!`,
        "",
        `Tu tienda *${proof.storeName}* ya está activa con el plan *${planLabel}*.`,
        "",
        `📲 Entrá a tu panel y configurá todo:`,
        credentials.loginUrl,
        `👤 Usuario: ${credentials.username}`,
        `🔑 Contraseña: ${credentials.password}`,
        "",
        `🔒 Por seguridad, cambiá la contraseña apenas entres (en Configuración).`,
        `Cualquier duda, respondé este WhatsApp y te ayudamos.`,
      ].join("\n")
    : [
        `🎉 ¡Bienvenido a Buleje, ${proof.ownerName}!`,
        "",
        `Aprobamos tu pago y tu tienda *${proof.storeName}* ya está activa con el plan *${planLabel}*.`,
        "",
        `📲 Ingresá acá para configurar todo:`,
        `${baseUrl}/admin/login`,
        "",
        `Cualquier duda, respondé este WhatsApp y te ayudamos.`,
      ].join("\n");

  sendWhatsAppQueued(proof.ownerPhone, customMsg ?? defaultMsg, {
    tenantId,
    context: `payment-approval-${id}`,
  })
    .then(() => PaymentProofsDB.markWhatsappSent(id))
    .catch((err) => logger.warn("[payment-proof/approve] whatsapp failed", { error: String(err), proofId: id }));

  return NextResponse.json({ ok: true, tenantId, credentials });
}
