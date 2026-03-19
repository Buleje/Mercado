import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { sendWelcomeEmail } from "@/lib/mailer-onboarding";

// ─── Validation ──────────────────────────────────────────
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const RESERVED_SLUGS = new Set([
  "main", "admin", "api", "www", "app", "mail", "smtp",
  "ftp", "static", "cdn", "assets", "test", "demo", "dev",
  "staging", "prod", "production", "support", "help", "blog",
  "shop", "store", "tienda", "registro", "login",
]);

const OnboardingSchema = z.object({
  // Store
  storeName:     z.string().min(2).max(80),
  slug:          z.string().regex(SLUG_RE, "El subdominio solo acepta letras minúsculas, números y guiones (ej: bodega-lima)"),
  ownerEmail:    z.string().email(),
  ownerPhone:    z.string().max(20).optional(),
  // Plan
  plan:          z.enum(["free", "pro", "business"]).default("free"),
  // Admin account
  adminName:     z.string().min(2).max(64),
  adminUsername: z.string().min(3).max(32).regex(/^[a-z0-9_.]+$/i, "Solo letras, números, punto o guión bajo"),
  adminPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
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

  const { storeName, slug, ownerEmail, ownerPhone, plan, adminName, adminUsername, adminPassword } = parsed.data;

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

  // Create tenant + admin user + default settings atomically
  const [tenant] = await prisma.$transaction([
    prisma.tenant.create({
      data: { slug, name: storeName, plan, active: true, ownerEmail, ownerPhone, trialEndsAt },
    }),
  ]);

  // Seed AdminUser + Settings for the new tenant in one batch
  const passwordHash = await hash(adminPassword, 12);
  await prisma.$transaction([
    prisma.adminUser.create({
      data: {
        tenantId: slug,
        username: adminUsername,
        passwordHash,
        role: "admin",
        name: adminName,
        active: true,
      },
    }),
    prisma.settings.create({
      data: {
        tenantId: slug,
        businessName: storeName,
        mode: "checkout",
        cashEnabled: true,
        yapeEnabled: false,
      },
    }),
  ]);

  // Send welcome email (fire-and-forget, doesn't block response)
  sendWelcomeEmailSafe({
    storeName, slug, ownerEmail, adminName, adminUsername, plan, trialEndsAt,
  });

  return NextResponse.json(
    {
      message: "Tienda creada exitosamente",
      tenantSlug: tenant.slug,
      storeName: tenant.name,
      plan: tenant.plan,
      trialEndsAt: tenant.trialEndsAt,
    },
    { status: 201 }
  );
}

// Fire-and-forget welcome email (after response)
async function sendWelcomeEmailSafe(data: {
  storeName: string; slug: string; ownerEmail: string;
  adminName: string; adminUsername: string; plan: string; trialEndsAt: Date;
}) {
  try { await sendWelcomeEmail(data); } catch { /* don't fail onboarding for email */ }
}
