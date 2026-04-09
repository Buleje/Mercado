import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { sendWelcomeEmail } from "@/lib/mailer-onboarding";
import { getTemplateCategories } from "@/lib/store-templates";
import { createSessionToken, SESSION } from "@/lib/session";
import {
  getOrCreateStripeCustomer,
  createCheckoutSession,
  STRIPE_PRICE_IDS,
} from "@/lib/stripe";
import type { PlanId } from "@/lib/plans";

// ─── Validation ──────────────────────────────────────────
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const RESERVED_SLUGS = new Set([
  "main", "admin", "api", "www", "app", "mail", "smtp",
  "ftp", "static", "cdn", "assets", "test", "demo", "dev",
  "staging", "prod", "production", "support", "help", "blog",
  "shop", "store", "tienda", "registro", "login",
]);

const OnboardingSchema = z.object({
  // Account type
  type:          z.enum(["store", "supplier", "delivery"]).default("store"),
  // Store
  storeName:     z.string().min(2).max(80),
  slug:          z.string().regex(SLUG_RE, "El subdominio solo acepta letras minúsculas, números y guiones (ej: bodega-lima)"),
  ownerEmail:    z.string().email(),
  ownerPhone:    z.string().max(20).optional(),
  // Plan
  plan:          z.enum(["free", "pro", "business", "enterprise"]).default("free"),
  // Admin account
  adminName:     z.string().min(2).max(64),
  adminUsername: z.string().min(3).max(32).regex(/^[a-z0-9_.]+$/i, "Solo letras, números, punto o guión bajo"),
  adminPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  // Referido (opcional) — código de otra tienda que invitó a este registro
  referralCode:  z.string().min(1).max(30).trim().optional(),
  // Plantilla de negocio (opcional) — pre-configura categorías
  template:      z.enum(["bodega", "minimarket", "farmacia", "restaurante"]).optional(),
});

export async function POST(req: NextRequest) {
  // Rate limit: max 5 signups per IP per day
  const rateLimited = applyRateLimit(req, "AUTH", "onboarding");
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de solicitud inválido" }, { status: 400 });
  }

  const parsed = OnboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { type, storeName, slug, ownerEmail, ownerPhone, plan, adminName, adminUsername, adminPassword, referralCode, template } = parsed.data;

  // Reject reserved slugs
  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.json(
      { error: "El subdominio elegido no está disponible. Prueba con otro nombre." },
      { status: 409 }
    );
  }

  // Check slug uniqueness
  const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
  if (existingTenant) {
    return NextResponse.json(
      { error: "El subdominio ya está en uso. Elige otro." },
      { status: 409 }
    );
  }

  // 14-day trial for all plans
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  // Create tenant atomically (con type según el actor)
  const [tenant] = await prisma.$transaction([
    prisma.tenant.create({
      data: { slug, name: storeName, plan, type, active: true, ownerEmail, ownerPhone, trialEndsAt },
    }),
  ]);

  // Seed AdminUser + Settings for the new tenant in one batch
  // IMPORTANT: Use tenant.id (canonical CUID), NOT tenant.slug
  const passwordHash = await hash(adminPassword, 12);
  await prisma.$transaction([
    prisma.adminUser.create({
      data: {
        tenantId: tenant.id,
        username: adminUsername,
        passwordHash,
        role: "admin",
        name: adminName,
        active: true,
      },
    }),
    prisma.settings.create({
      data: {
        tenantId: tenant.id,
        businessName: storeName,
        mode: "checkout",
        cashEnabled: true,
        yapeEnabled: false,
      },
    }),
  ]);

  // ── Seed por tipo de actor ──────────────────────────────
  if (type === "supplier") {
    // Crear Supplier + SupplierPortal + Store (draft)
    const supplier = await prisma.supplier.create({
      data: {
        id: slug,
        name: storeName,
        email: ownerEmail,
        phone: ownerPhone ?? null,
        tenantId: tenant.id,
      },
    });
    await prisma.$transaction([
      prisma.supplierPortal.create({
        data: {
          supplierId: supplier.id,
          isActive: true,
          autoPublish: true,
        },
      }),
      prisma.store.create({
        data: {
          tenantId: tenant.id,
          slug,
          name: storeName,
          isPublished: false,
        },
      }),
    ]);
  } else if (type === "delivery") {
    // Crear DeliveryPartner con datos básicos del owner
    await prisma.deliveryPartner.create({
      data: {
        name: adminName,
        phone: ownerPhone ?? "",
        email: ownerEmail,
        zone: "",
        tenantId: tenant.id,
      },
    });
  } else {
    // type === "store" (default) — Crear Store (draft)
    await prisma.store.create({
      data: {
        tenantId: tenant.id,
        slug,
        name: storeName,
        isPublished: false,
      },
    });
  }

  // ── Seed categorías desde plantilla (fire-and-forget) ───
  if (template) {
    const categories = getTemplateCategories(template);
    if (categories.length > 0) {
      prisma.settings.update({
        where: { tenantId: tenant.id },
        data: { productCategoriesJson: JSON.stringify(categories) },
      }).catch(() => { /* no bloquear si la migración aún no se corrió */ });
    }
  }

  // Fire-and-forget: canjear código de referido si viene uno
  if (referralCode) {
    redeemReferralSafe(referralCode, slug);
  }

  // Send welcome email (fire-and-forget, doesn't block response)
  sendWelcomeEmailSafe({
    storeName, slug, ownerEmail, adminName, adminUsername, plan, trialEndsAt,
  });

  // ── Auto-login: generar sesión para que el usuario no tenga que hacer login manual ──
  const sessionToken = await createSessionToken("admin", adminUsername, tenant.slug, adminName);

  // ── Si plan pago, generar URL de Stripe Checkout para redirigir después del registro ──
  let checkoutUrl: string | null = null;
  if (plan !== "free") {
    const priceId = STRIPE_PRICE_IDS[plan as PlanId];
    if (priceId) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
        const stripeCustomerId = await getOrCreateStripeCustomer({
          stripeCustomerId: null,
          tenantSlug: tenant.slug,
          email: ownerEmail,
          name: storeName,
        });

        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { stripeCustomerId },
        });

        checkoutUrl = await createCheckoutSession({
          customerId: stripeCustomerId,
          priceId,
          tenantSlug: tenant.slug,
          successUrl: `${baseUrl}/${tenant.slug}/admin?tab=plan&upgraded=1`,
          cancelUrl: `${baseUrl}/${tenant.slug}/admin?tab=plan`,
        });
      } catch {
        // No bloquear el onboarding si Stripe falla — el usuario puede hacer upgrade después
      }
    }
  }

  const response = NextResponse.json(
    {
      message: "Cuenta creada exitosamente",
      tenantSlug: tenant.slug,
      storeName: tenant.name,
      plan: tenant.plan,
      type: tenant.type,
      trialEndsAt: tenant.trialEndsAt,
      ...(checkoutUrl ? { checkoutUrl } : {}),
    },
    { status: 201 }
  );

  // Setear cookie de sesión admin (misma que /api/auth/login)
  response.cookies.set(SESSION.COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION.MAX_AGE,
  });

  // Setear cookie de tenant activo (para que proxy.ts resuelva el tenant)
  response.cookies.set("active-tenant", tenant.slug, {
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    sameSite: "lax",
    httpOnly: false,
  });

  return response;
}

// Fire-and-forget: canjear código de referido entre tiendas
async function redeemReferralSafe(referralCode: string, newTenantSlug: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    await fetch(`${baseUrl}/api/referrals/stores/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referralCode, newTenantSlug }),
    });
  } catch { /* no bloquear el onboarding si falla el referido */ }
}

// Fire-and-forget welcome email (after response)
async function sendWelcomeEmailSafe(data: {
  storeName: string; slug: string; ownerEmail: string;
  adminName: string; adminUsername: string; plan: string; trialEndsAt: Date;
}) {
  try { await sendWelcomeEmail(data); } catch { /* don't fail onboarding for email */ }
}
