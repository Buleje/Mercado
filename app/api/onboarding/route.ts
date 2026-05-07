/**
 * POST /api/onboarding
 *
 * Endpoint público de registro automático de tenants.
 * No requiere auth (es el punto de entrada SaaS), pero tiene:
 *   - Rate limiting distribuido via Upstash (5 registros por IP / 24 h)
 *   - Validación Zod estricta con safeParse
 *   - Toda la lógica de DB delegada a lib/db/tenant-onboarding.db.ts
 *   - Auto-login vía cookie de sesión firmada HMAC
 *   - Stripe Checkout para planes de pago (fire-and-forget si falla)
 *   - logActivity fire-and-forget al finalizar
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createDistributedRateLimiter,
  getClientIp,
} from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { sendWelcomeEmail } from "@/lib/mailer-onboarding";
import { createSessionToken, SESSION } from "@/lib/session";
import {
  getOrCreateStripeCustomer,
  createCheckoutSession,
  STRIPE_PRICE_IDS,
} from "@/lib/stripe";
import type { PlanId } from "@/lib/plans";
import {
  findTenantBySlug,
  createTenant,
  createAdminUser,
  seedTenantDefaults,
} from "@/lib/db/tenant-onboarding.db";

// ─── Rate limit: 5 registros por IP en 24 horas (distribuido via Upstash) ──
const onboardingLimiter = createDistributedRateLimiter({
  key: "onboarding:register",
  maxRequests: 5,
  windowMs: 24 * 60 * 60 * 1000, // 24 horas
});

// ─── Slugs reservados — no disponibles como subdominio de tenant ─────────────
const RESERVED_SLUGS = new Set([
  "main", "admin", "api", "www", "app", "mail", "smtp",
  "ftp", "static", "cdn", "assets", "test", "demo", "dev",
  "staging", "prod", "production", "support", "help", "blog",
  "shop", "store", "tienda", "registro", "login", "superadmin",
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

// ─── Schema de validación ────────────────────────────────────────────────────
const OnboardingSchema = z.object({
  // Tipo de actor en el marketplace
  type: z.enum(["store", "supplier", "delivery"]).default("store"),
  // Datos de la tienda
  storeName: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(80),
  slug: z
    .string()
    .regex(
      SLUG_RE,
      "El subdominio solo acepta letras minúsculas, números y guiones. Ej: bodega-lima",
    ),
  ownerEmail: z.string().email("Correo electrónico inválido"),
  ownerPhone: z.string().max(20).optional(),
  // Plan SaaS
  plan: z.enum(["free", "pro", "business", "enterprise"]).default("free"),
  // Credenciales del administrador
  adminName: z.string().min(2).max(64),
  adminUsername: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_.]+$/i, "Solo letras, números, punto o guión bajo"),
  adminPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  // Opcionales
  referralCode: z.string().min(1).max(30).trim().optional(),
  template: z.enum(["bodega", "minimarket", "farmacia", "restaurante"]).optional(),
});

// ─── Handler principal ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "onboarding"); if (_rl) return _rl;
  const ip = getClientIp(req);
  const requestId = req.headers.get("x-request-id") ?? undefined;

  // 1. Rate limiting distribuido
  const allowed = await onboardingLimiter.check(ip);
  if (!allowed) {
    logger.warn("[onboarding] Rate limit alcanzado", { ip, requestId });
    return NextResponse.json(
      {
        error: "Demasiadas solicitudes",
        message: "Has alcanzado el límite de registros. Intenta nuevamente en 24 horas.",
      },
      {
        status: 429,
        headers: { "Retry-After": "86400" },
      },
    );
  }

  // 2. Parsear body con manejo de JSON inválido
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de solicitud inválido" }, { status: 400 });
  }

  // 3. Validación Zod — safeParse, nunca .parse()
  const parsed = OnboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const {
    type,
    storeName,
    slug,
    ownerEmail,
    ownerPhone,
    plan,
    adminName,
    adminUsername,
    adminPassword,
    referralCode,
    template,
  } = parsed.data;

  // 4. Rechazar slugs reservados
  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.json(
      { error: "El subdominio elegido no está disponible. Prueba con otro nombre." },
      { status: 409 },
    );
  }

  try {
    // 5. Verificar unicidad del slug via DB class (nunca Prisma directo)
    const existingTenant = await findTenantBySlug(slug);
    if (existingTenant) {
      return NextResponse.json(
        { error: "El subdominio ya está en uso. Elige otro." },
        { status: 409 },
      );
    }

    // 6. Trial de 15 días para todos los planes — pasado el periodo, el tenant
    //    pasa a modo read-only (no ventas, oculto de marketplace, sin altas)
    //    hasta que active un plan pagado.
    const trialEndsAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

    // 7. Crear tenant en DB — via DB class, transacción interna
    const tenant = await createTenant({
      slug,
      storeName,
      ownerEmail,
      ownerPhone,
      plan,
      type,
      trialEndsAt,
    });

    // 8. Crear admin user + settings — usa tenantId (CUID), no el slug
    await createAdminUser({
      tenantId: tenant.id,
      adminName,
      adminUsername,
      adminPassword,
      businessName: storeName,
    });

    // 9. Seed por tipo de actor + plantilla (best-effort, no bloquea)
    seedTenantDefaults({
      tenantId: tenant.id,
      template,
      type,
      slug,
      storeName,
      ownerEmail,
      ownerPhone,
      adminName,
    }).catch((err) => logger.warn("[onboarding] welcome side-effect failed", { slug, err: String(err) }));

    // 10. Canjear referido si viene uno (fire-and-forget)
    if (referralCode) {
      redeemReferralSafe(referralCode, slug);
    }

    // 11. Email de bienvenida (fire-and-forget)
    sendWelcomeEmailSafe({
      storeName,
      slug,
      ownerEmail,
      adminName,
      adminUsername,
      plan,
      trialEndsAt,
    });

    // 12. logActivity fire-and-forget
    logActivity(
      "tenant_registrado",
      "sistema",
      `Tenant '${slug}' registrado con plan ${plan} (tipo: ${type})`,
      tenant.id,
      "onboarding",
    ).catch((err) => logger.warn("[onboarding] logActivity failed", { slug, err: String(err) }));

    // 13. Auto-login: generar sesión para no requerir login manual post-registro
    const sessionToken = await createSessionToken(
      "admin",
      adminUsername,
      tenant.slug,
      adminName,
    );

    // 14. Para planes de pago, generar URL de Stripe Checkout (best-effort)
    let checkoutUrl: string | null = null;
    if (plan !== "free") {
      checkoutUrl = await buildStripeCheckoutUrl({
        plan,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        ownerEmail,
        storeName,
      });
    }

    logger.info("[onboarding] Tenant registrado exitosamente", {
      tenantId: tenant.id,
      slug,
      plan,
      type,
      ip,
      requestId,
    });

    // 15. Armar respuesta con cookies de sesión
    const response = NextResponse.json(
      {
        message: "Cuenta creada exitosamente",
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        storeName: tenant.name,
        plan: tenant.plan,
        type: tenant.type,
        trialEndsAt: tenant.trialEndsAt,
        adminUrl: `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/${tenant.slug}/admin`,
        ...(checkoutUrl ? { checkoutUrl } : {}),
      },
      { status: 201 },
    );

    // Cookie de sesión admin (httpOnly, misma que /api/auth/login)
    response.cookies.set(SESSION.COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION.MAX_AGE,
    });

    // Cookie de tenant activo (leída por proxy.ts para resolver el tenant)
    response.cookies.set("active-tenant", tenant.slug, {
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
      httpOnly: false,
    });

    return response;
  } catch (error) {
    logger.error("[onboarding] Error inesperado al registrar tenant", {
      slug,
      ip,
      requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { error: "Error interno al crear la cuenta. Intenta nuevamente." },
      { status: 500 },
    );
  }
}

// ─── Helpers fire-and-forget ─────────────────────────────────────────────────

/** Canjear código de referido entre tiendas — no bloquea el onboarding */
async function redeemReferralSafe(
  referralCode: string,
  newTenantSlug: string,
): Promise<void> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    await fetch(`${baseUrl}/api/referrals/stores/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referralCode, newTenantSlug }),
    });
  } catch {
    /* no bloquear el onboarding si falla el referido */
  }
}

/** Welcome email — no bloquea el onboarding si falla */
async function sendWelcomeEmailSafe(data: {
  storeName: string;
  slug: string;
  ownerEmail: string;
  adminName: string;
  adminUsername: string;
  plan: string;
  trialEndsAt: Date;
}): Promise<void> {
  try {
    await sendWelcomeEmail(data);
  } catch {
    /* no fallar el onboarding por un error de email */
  }
}

/** Intenta crear sesión de Stripe Checkout para planes de pago.
 *  Si falla (Stripe down, creds ausentes), devuelve null y el usuario
 *  puede hacer upgrade desde el panel después.
 */
async function buildStripeCheckoutUrl(opts: {
  plan: string;
  tenantId: string;
  tenantSlug: string;
  ownerEmail: string;
  storeName: string;
}): Promise<string | null> {
  try {
    const priceId = STRIPE_PRICE_IDS[opts.plan as PlanId];
    if (!priceId) return null;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

    const stripeCustomerId = await getOrCreateStripeCustomer({
      stripeCustomerId: null,
      tenantSlug: opts.tenantSlug,
      email: opts.ownerEmail,
      name: opts.storeName,
    });

    return await createCheckoutSession({
      customerId: stripeCustomerId,
      priceId,
      tenantSlug: opts.tenantSlug,
      successUrl: `${baseUrl}/${opts.tenantSlug}/admin?tab=plan&upgraded=1`,
      cancelUrl: `${baseUrl}/${opts.tenantSlug}/admin?tab=plan`,
    });
  } catch {
    // No bloquear el onboarding si Stripe falla — upgrade disponible después
    return null;
  }
}
