/**
 * Tests unitarios — lib/onboarding/signup-flow.ts
 *
 * Cubre:
 *  - Slug inválido rechaza (SlugTakenError cuando ya existe)
 *  - Slug duplicado rechaza con SlugTakenError
 *  - Happy path crea Tenant + AdminUser (resultado con tenantId, slug, loginUrl)
 *  - Password débil rechaza via SignupSchema (validators)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── server-only guard ─────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}));

// ── Mock: bcryptjs ────────────────────────────────────────────────────────────
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (_pwd: string, _rounds: number) => "hashed-password-xyz"),
  },
}));

// ── Mock: logger ──────────────────────────────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Mock: mailer-onboarding (fire-and-forget — no queremos SMTP en tests) ────
vi.mock("@/lib/mailer-onboarding", () => ({
  sendWelcomeEmail: vi.fn(async () => {}),
}));

// ── Mock: prisma con $transaction ─────────────────────────────────────────────
const {
  mockTenantFindUnique,
  mockTenantCreate,
  mockAdminUserCreate,
  mockSettingsCreate,
  mockWarehouseCreate,
  mockCashRegisterCreate,
  mockProductCreateMany,
  mockTransaction,
} = vi.hoisted(() => ({
  mockTenantFindUnique:     vi.fn(),
  mockTenantCreate:         vi.fn(),
  mockAdminUserCreate:      vi.fn(),
  mockSettingsCreate:       vi.fn(),
  mockWarehouseCreate:      vi.fn(),
  mockCashRegisterCreate:   vi.fn(),
  mockProductCreateMany:    vi.fn(),
  mockTransaction:          vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: mockTenantFindUnique,
      create:     mockTenantCreate,
    },
    adminUser:    { create: mockAdminUserCreate },
    settings:     { create: mockSettingsCreate },
    warehouse:    { create: mockWarehouseCreate },
    cashRegister: { create: mockCashRegisterCreate },
    product:      { createMany: mockProductCreateMany },
    $transaction: mockTransaction,
  },
}));

// ── Importaciones bajo test ───────────────────────────────────────────────────
import { createTenantFromSignup, SlugTakenError } from "@/lib/onboarding/signup-flow";
import { SignupSchema } from "@/lib/onboarding/validators";

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_INPUT = {
  name: "Buleje",
  email: "juan@example.com",
  password: "SecurePass1!",
  slug: "bodega-san-martin",
  ownerName: "Juan Perez",
  phone: "+51999000000",
};

/** Configura el mock de $transaction para ejecutar el callback con un tx simulado */
function setupHappyTransaction(tenantId = "tenant-abc-123") {
  const tenant = {
    id: tenantId,
    slug: VALID_INPUT.slug,
    name: VALID_INPUT.name,
  };
  const adminUser = {
    id: "admin-user-001",
    username: VALID_INPUT.email,
    tenantId,
    role: "admin",
  };

  mockTransaction.mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        tenant:       { create: vi.fn(async () => tenant) },
        adminUser:    { create: vi.fn(async () => adminUser) },
        settings:     { create: vi.fn(async () => ({})) },
        warehouse:    { create: vi.fn(async () => ({ id: "wh-001" })) },
        cashRegister: { create: vi.fn(async () => ({ id: "cr-001" })) },
        product:      { createMany: vi.fn(async () => ({ count: 5 })) },
      };
      return cb(tx);
    },
  );
  return { tenant, adminUser };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SignupSchema (validators)", () => {
  it("rechaza password corta", () => {
    const result = SignupSchema.safeParse({ ...VALID_INPUT, password: "short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs.some((m) => m.includes("10"))).toBe(true);
    }
  });

  it("rechaza password sin mayuscula", () => {
    const result = SignupSchema.safeParse({
      ...VALID_INPUT,
      password: "nouppercasepass1!",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza password sin numero", () => {
    const result = SignupSchema.safeParse({
      ...VALID_INPUT,
      password: "NoNumberPass!",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza password sin caracter especial", () => {
    const result = SignupSchema.safeParse({
      ...VALID_INPUT,
      password: "NoSpecialChar1",
    });
    expect(result.success).toBe(false);
  });

  it("acepta password valida", () => {
    const result = SignupSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
  });

  it("rechaza slug con patron reservado 'admin'", () => {
    const result = SignupSchema.safeParse({ ...VALID_INPUT, slug: "admin" });
    expect(result.success).toBe(false);
  });

  it("rechaza slug con patron reservado 'api'", () => {
    const result = SignupSchema.safeParse({ ...VALID_INPUT, slug: "api" });
    expect(result.success).toBe(false);
  });

  it("rechaza slug con mayusculas", () => {
    const result = SignupSchema.safeParse({ ...VALID_INPUT, slug: "MiTienda" });
    expect(result.success).toBe(false);
  });

  it("rechaza slug menor a 3 chars", () => {
    const result = SignupSchema.safeParse({ ...VALID_INPUT, slug: "ab" });
    expect(result.success).toBe(false);
  });

  it("acepta slug valido", () => {
    const result = SignupSchema.safeParse({
      ...VALID_INPUT,
      slug: "mi-tienda-123",
    });
    expect(result.success).toBe(true);
  });
});

describe("createTenantFromSignup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Por defecto: slug disponible
    mockTenantFindUnique.mockResolvedValue(null);
  });

  it("rechaza cuando el slug ya esta en uso", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "existing-tenant" });

    await expect(createTenantFromSignup(VALID_INPUT)).rejects.toThrow(
      SlugTakenError,
    );
  });

  it("rechaza con mensaje descriptivo cuando slug duplicado", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "existing-tenant" });

    await expect(createTenantFromSignup(VALID_INPUT)).rejects.toThrow(
      /bodega-san-martin/,
    );
  });

  it("happy path: crea tenant y retorna tenantId, slug, loginUrl", async () => {
    setupHappyTransaction("tenant-xyz-999");

    const result = await createTenantFromSignup(VALID_INPUT);

    expect(result.tenantId).toBe("tenant-xyz-999");
    expect(result.slug).toBe(VALID_INPUT.slug);
    expect(result.loginUrl).toContain(VALID_INPUT.slug);
    expect(result.loginUrl).toContain("login");
  });

  it("happy path: loginUrl incluye el slug del tenant", async () => {
    setupHappyTransaction("tenant-login-test");

    const result = await createTenantFromSignup(VALID_INPUT);

    expect(result.loginUrl).toMatch(/bodega-san-martin/);
  });

  it("llama a $transaction exactamente una vez", async () => {
    setupHappyTransaction();

    await createTenantFromSignup(VALID_INPUT);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("verifica slug ANTES de la transaccion (fail-fast)", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "exists" });

    await expect(createTenantFromSignup(VALID_INPUT)).rejects.toThrow(
      SlugTakenError,
    );

    // La transaccion nunca debe haberse llamado
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
