import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { SignupInput } from "./validators";

const BCRYPT_ROUNDS = 12;

export interface SignupResult {
  tenantId: string;
  slug: string;
  loginUrl: string;
}

/**
 * Orquestador principal del self-service onboarding.
 *
 * Flujo:
 *  1. Verifica que el slug no esté tomado
 *  2. Hashea la contraseña (bcrypt 12 rounds)
 *  3. Transacción atómica: Tenant + AdminUser + Settings + Warehouse + CashRegister
 *  4. Seed de 5 productos demo
 *  5. Envío de email de bienvenida (fire-and-forget)
 *
 * Nunca usa Prisma directo para las queries de verificación del slug —
 * la transacción interna sí usa prisma.$transaction porque no hay
 * DB class que envuelva la creación de Tenant todavía.
 */
export async function createTenantFromSignup(
  input: SignupInput,
): Promise<SignupResult> {
  const { name, email, password, slug, ownerName, phone } = input;

  // 1. Verificar slug único
  const existing = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing) {
    throw new SlugTakenError(`El slug "${slug}" ya está en uso`);
  }

  // 2. Hash de contraseña
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // 3. Transacción atómica
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 días

  const { tenant, adminUser } = await prisma.$transaction(async (tx) => {
    // Crear Tenant
    const tenant = await tx.tenant.create({
      data: {
        slug,
        name,
        plan: "free",
        ownerEmail: email,
        ownerPhone: phone || null,
        emailVerified: false,
        trialEndsAt,
        active: true,
      },
    });

    // Crear AdminUser (rol "admin")
    const adminUser = await tx.adminUser.create({
      data: {
        tenantId: tenant.id,
        username: email,
        passwordHash,
        role: "admin",
        name: ownerName,
        active: true,
      },
    });

    // Crear Settings por defecto
    await tx.settings.create({
      data: {
        tenantId: tenant.id,
        mode: "checkout",
        businessName: name,
        businessEmail: email,
        businessPhone: phone || null,
        yapeEnabled: true,
        cashEnabled: true,
        currency: "PEN",
        timezone: "America/Lima",
        taxRate: 18,
        dateFormat: "DD/MM/YYYY",
        timeFormat: "24h",
        decimals: 2,
      },
    });

    // Crear Warehouse principal
    const warehouse = await tx.warehouse.create({
      data: {
        tenantId: tenant.id,
        name: "Almacén Principal",
        code: "ALM-001",
        type: "principal",
        location: name,
        manager: ownerName,
        capacity: 10000,
        active: true,
      },
    });

    // Crear CashRegister por defecto (abierta)
    await tx.cashRegister.create({
      data: {
        tenantId: tenant.id,
        openingAmount: 0,
        status: "abierta",
        notes: "Caja inicial creada por onboarding automático",
      },
    });

    // Seed de 5 productos demo
    const demoProducts = buildDemoProducts(tenant.id);
    await tx.product.createMany({ data: demoProducts });

    return { tenant, adminUser, warehouse };
  });

  logger.info("[onboarding] Tenant creado", {
    tenantId: tenant.id,
    slug: tenant.slug,
    adminUsername: adminUser.username,
  });

  // 4. Email de bienvenida fire-and-forget
  sendWelcomeEmailAsync({
    storeName: name,
    slug,
    ownerEmail: email,
    adminName: ownerName,
    adminUsername: email,
    plan: "free",
    trialEndsAt,
  }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://buleje.pe";
  const loginUrl = `${baseUrl}/${slug}/admin/login`;

  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    loginUrl,
  };
}

// ── Productos demo ────────────────────────────────────────────────────────────

function buildDemoProducts(tenantId: string) {
  return [
    {
      tenantId,
      name: "Arroz Extra 1kg",
      category: "Abarrotes",
      price: 3.5,
      costPrice: 2.8,
      unit: "bolsa",
      stock: 50,
      stockMin: 10,
      active: true,
    },
    {
      tenantId,
      name: "Aceite Vegetal 1L",
      category: "Abarrotes",
      price: 7.9,
      costPrice: 6.5,
      unit: "botella",
      stock: 30,
      stockMin: 5,
      active: true,
    },
    {
      tenantId,
      name: "Azúcar Rubia 1kg",
      category: "Abarrotes",
      price: 3.2,
      costPrice: 2.5,
      unit: "bolsa",
      stock: 40,
      stockMin: 10,
      active: true,
    },
    {
      tenantId,
      name: "Gaseosa 1.5L",
      category: "Bebidas",
      price: 5.5,
      costPrice: 4.0,
      unit: "botella",
      stock: 24,
      stockMin: 6,
      active: true,
    },
    {
      tenantId,
      name: "Fideos Tallarin 500g",
      category: "Abarrotes",
      price: 2.8,
      costPrice: 2.1,
      unit: "paquete",
      stock: 60,
      stockMin: 12,
      active: true,
    },
  ];
}

// ── Email helper async ────────────────────────────────────────────────────────

async function sendWelcomeEmailAsync(data: {
  storeName: string;
  slug: string;
  ownerEmail: string;
  adminName: string;
  adminUsername: string;
  plan: string;
  trialEndsAt: Date;
}): Promise<void> {
  try {
    const { sendWelcomeEmail } = await import("@/lib/mailer-onboarding");
    await sendWelcomeEmail(data);
  } catch (err) {
    logger.warn("[onboarding] Email de bienvenida falló (no crítico)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Errores tipados ───────────────────────────────────────────────────────────

export class SlugTakenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlugTakenError";
  }
}
