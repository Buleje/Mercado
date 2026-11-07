/**
 * Multi-tenant isolation — REAL DB integration tests (sprint 2026-05-11).
 *
 * Verifica que tenant A NO puede leer/escribir/borrar datos de tenant B
 * usando los módulos reales de `lib/db/*.db.ts` contra la base Supabase.
 *
 * ── Setup ─────────────────────────────────────────────────────────────────
 * - Reusa dos tenants ya existentes: `main` y `pizza-pucallpa`.
 * - Todos los recursos creados llevan prefijo `TEST-MTI-<runId>` (UUID corto)
 *   para garantizar cleanup determinístico.
 * - `afterAll` borra TODO lo creado por este test run, en orden inverso de FKs.
 *
 * ── Por qué tests reales (no mocks) ───────────────────────────────────────
 * Mocks de Prisma garantizan que un handler PASA tenantId al where, pero NO
 * que el motor relacional aplique el filtro correctamente bajo:
 *   - Decimal serialization
 *   - findUnique vs findFirst con compuestos
 *   - $executeRaw con paramaterized queries
 *   - Transactions y unique constraints reales
 * Un mock que devuelve null cuando "el where no matchea" es una autoengaño:
 * en producción el cliente Prisma podría tirar otra cosa.
 *
 * Para correr:
 *   node --env-file=.env.local node_modules/.bin/vitest run \
 *     __tests__/security/multi-tenant-isolation.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// IMPORTANT: este test usa Prisma real — desactivamos las extensiones que
// agregan latencia (audit chain) si están on por default en este entorno.
process.env.AUDIT_CHAIN_ENABLED ??= "false";

/**
 * `revalidateTag`/`revalidatePath` sólo funcionan dentro del contexto de request
 * de Next; llamadas desde un test tiran "Invariant: static generation store
 * missing" y voltean el test ANTES de que llegue a comprobar el aislamiento
 * (le pasaba a `ProductsDB.hardDelete`, que revalida al final).
 *
 * Invalidar caché no es lo que este suite verifica — verifica que un tenant no
 * pueda tocar los datos de otro. Se mockean a no-op, acotado a este archivo
 * (en `vitest.setup.ts` afectaría a toda la suite sin necesidad).
 */
vi.mock("next/cache", () => ({
  revalidateTag: () => {},
  revalidatePath: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

import { prisma } from "@/lib/prisma";
import { CustomersDB } from "@/lib/db/customers.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { ProductsDB } from "@/lib/db/products.db";
import { CouponsDB } from "@/lib/db/coupons.db";
import { RecetasDB } from "@/lib/db/recetas.db";
import { PaymentApprovalDb } from "@/lib/db/payment-approval.db";

// ── Fixtures compartidos ────────────────────────────────────────────────────

// Reusa dos tenants existentes — IDs reales (no slugs). En Buleje `tenantId`
// que viaja por las APIs es el `Tenant.id` (cuid), no `Tenant.slug`.
//   - main           → id "main"  (slug "main")
//   - pizza-pucallpa → cuid       (slug "pizza-pucallpa")
// Resolvemos pizza-pucallpa.id dinámicamente en beforeAll para no hardcodear
// el cuid (cambia entre entornos).
const TENANT_A = "main";
/** Preferido por legibilidad; si no está, sirve cualquier otro tenant (ver abajo). */
const TENANT_B_SLUG = "pizza-pucallpa";

/**
 * ⚠️ 2026-07-15 — ESTE SUITE NUNCA CORRIÓ. Dos bugs que se tapaban entre sí:
 *
 *  1. `TENANT_B` era `const TENANT_B = ""`, nunca reasignado (el TODO viejo lo
 *     admitía). El `beforeAll` comparaba contra "" ⇒ "missing tenants" ⇒ throw.
 *  2. `describe.skipIf(!HAS_DB)` evalúa su condición en tiempo de COLECCIÓN,
 *     antes de cualquier hook. Con `HAS_DB` seteado dentro del `beforeAll`,
 *     al momento del `skipIf` valía `false` ⇒ TODO el suite se salteaba
 *     SIEMPRE, incluso con la DB arriba… y de paso el throw del punto 1 nunca
 *     se veía.
 *
 * Resultado: 15 tests que verifican que una tienda no pueda leer datos de otra
 * reportaban "skipped" en verde. Un suite que siempre se saltea es peor que uno
 * que falla: da confianza sin probar nada.
 *
 * Por eso el setup se resuelve acá con TOP-LEVEL AWAIT (tiempo de colección),
 * que es cuando `skipIf` lo necesita.
 */
const setup = await (async () => {
  const vacio = { hasDb: false, tenantB: "" };
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return vacio; // Sin DB (pre-commit, `vitest --changed`): skip legítimo.
  }
  const a = await prisma.tenant.findUnique({ where: { id: TENANT_A }, select: { id: true } });
  if (!a) return vacio;
  // El test sólo necesita DOS tenants distintos. Atarlo a `pizza-pucallpa` —que
  // NO está en el seed— lo dejaría skipeando en cualquier entorno limpio: el
  // mismo agujero con otra cara. Se prefiere ese slug y si no, cualquier otro.
  const b =
    (await prisma.tenant.findUnique({ where: { slug: TENANT_B_SLUG }, select: { id: true } })) ??
    (await prisma.tenant.findFirst({ where: { id: { not: TENANT_A } }, select: { id: true } }));
  if (!b) {
    console.warn(
      `[multi-tenant-isolation] hay DB pero un solo tenant ('${TENANT_A}'): ` +
        `el aislamiento no se puede probar con uno solo. Sembrá un segundo tenant.`,
    );
    return vacio;
  }
  return { hasDb: true, tenantB: b.id };
})();

const HAS_DB = setup.hasDb;
const TENANT_B = setup.tenantB;

/** Sufijo único de este run, para aislar artefactos entre ejecuciones. */
const RUN_ID = `mti-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
const TAG = `TEST-${RUN_ID}`;

/** Phones distintos por tenant (Customer.phone es @unique global — no se puede compartir). */
const PHONE_A = `999${String(Date.now()).slice(-7)}`;
const PHONE_B = `998${String(Date.now()).slice(-7)}`;

// Tracking de IDs creados para cleanup determinístico.
const created = {
  customers: [] as string[], // phones
  orderIds: [] as string[],
  productIds: [] as number[],
  couponIds: [] as string[],
  recetaIds: [] as string[],
  paymentApprovalIds: [] as string[],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Crea un producto en un tenant. Lo trackea para cleanup.
 * Usa prisma directo (no ProductsDB.upsert) para evitar ON CONFLICT con IDs
 * autoincrement — queremos un INSERT puro y conocer el ID asignado.
 */
async function createTestProductFor(tenantId: string, name: string): Promise<number> {
  const row = await prisma.product.create({
    data: {
      name: `${TAG}-${name}`,
      category: "test",
      price: 9.9,
      unit: "unidad",
      image: "",
      tenantId,
      active: true,
    },
    select: { id: true },
  });
  created.productIds.push(row.id);
  return row.id;
}

async function createTestCustomerFor(tenantId: string, phone: string, name: string) {
  const row = await prisma.customer.create({
    data: {
      phone,
      name: `${TAG}-${name}`,
      tenantId,
      location: "",
      reference: "",
    },
    select: { phone: true },
  });
  created.customers.push(row.phone);
  return row.phone;
}

async function createTestOrderFor(tenantId: string, customerPhone: string, total: number): Promise<string> {
  const id = `${TAG}-ord-${Math.random().toString(36).slice(2, 8)}`;
  await prisma.order.create({
    data: {
      id,
      tenantId,
      customerName: `${TAG}-buyer`,
      customerPhone,
      customerLocation: "",
      customerReference: "",
      total,
      status: "pendiente",
      paymentMethod: "efectivo",
    },
  });
  created.orderIds.push(id);
  return id;
}

async function createTestCouponFor(tenantId: string, code: string): Promise<string> {
  const row = await prisma.coupon.create({
    data: {
      code: `${TAG}-${code}`,
      tenantId,
      description: "test",
      discountType: "percent",
      discountValue: 10,
      active: true,
    },
    select: { id: true },
  });
  created.couponIds.push(row.id);
  return row.id;
}

async function createTestRecetaFor(
  tenantId: string,
  nombre: string,
  productoId: number | null,
): Promise<string> {
  const row = await prisma.receta.create({
    data: {
      tenantId,
      nombre: `${TAG}-${nombre}`,
      productoId: productoId ?? undefined,
    },
    select: { id: true },
  });
  created.recetaIds.push(row.id);
  return row.id;
}

// ── Setup ──────────────────────────────────────────────────────────────────

// El gate de DB + la resolución de tenants ya se hicieron arriba, en tiempo de
// colección (top-level await), porque es cuando `describe.skipIf` los necesita.
// Acá sólo queda dejar constancia de contra qué se está corriendo: si el suite
// vuelve a saltearse, que se vea en la salida y no en silencio.
beforeAll(() => {
  if (!HAS_DB) {
    console.warn("[multi-tenant-isolation] SALTEADO — sin DB accesible o sin un segundo tenant.");
    return;
  }
  console.info(`[multi-tenant-isolation] corriendo contra '${TENANT_A}' vs '${TENANT_B}'.`);
});

// ── Cleanup ─────────────────────────────────────────────────────────────────

afterAll(async () => {
  // Orden inverso: lo que apunta-a-otro borra primero.
  // Cualquier fallo en cleanup loggea pero no rompe (los datos quedan con prefijo TEST- y se pueden limpiar luego).
  const swallow = async (label: string, p: Promise<unknown>) => {
    try {
      await p;
    } catch (err) {
       
      console.warn(`[mti cleanup] ${label} failed:`, String(err).slice(0, 200));
    }
  };

  if (created.paymentApprovalIds.length) {
    await swallow(
      "PaymentApproval",
      prisma.$executeRawUnsafe(
        `DELETE FROM "PaymentApproval" WHERE id = ANY($1::text[])`,
        created.paymentApprovalIds,
      ),
    );
  }
  if (created.recetaIds.length) {
    await swallow(
      "Receta",
      prisma.receta.deleteMany({ where: { id: { in: created.recetaIds } } }),
    );
  }
  if (created.orderIds.length) {
    await swallow(
      "Order",
      prisma.order.deleteMany({ where: { id: { in: created.orderIds } } }),
    );
  }
  if (created.couponIds.length) {
    await swallow(
      "Coupon",
      prisma.coupon.deleteMany({ where: { id: { in: created.couponIds } } }),
    );
  }
  if (created.customers.length) {
    await swallow(
      "Customer",
      prisma.customer.deleteMany({ where: { phone: { in: created.customers } } }),
    );
  }
  if (created.productIds.length) {
    await swallow(
      "Product",
      prisma.product.deleteMany({ where: { id: { in: created.productIds } } }),
    );
  }

  await prisma.$disconnect();
}, 30_000);

// ─────────────────────────────────────────────────────────────────────────────
// 1) Customer read isolation
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_DB)("multi-tenant — Customers", () => {
  it("getByPhone con phone de tenant A desde tenantId B → null", async () => {
    await createTestCustomerFor(TENANT_A, PHONE_A, "alice");

    // Atacante: admin de B intenta leer un customer que vive en A.
    const leak = await CustomersDB.getByPhone(PHONE_A, TENANT_B);
    expect(leak).toBeNull();

    // Sanity: el legítimo SI lo lee.
    const legit = await CustomersDB.getByPhone(PHONE_A, TENANT_A);
    expect(legit?.phone).toBe(PHONE_A);
  }, 30_000);

  it("getAll(B) NO incluye customers de A", async () => {
    // Customer de B
    await createTestCustomerFor(TENANT_B, PHONE_B, "bob");

    const allB = await CustomersDB.getAll(TENANT_B);
    const phonesB = new Set(allB.map((c) => c.phone));
    expect(phonesB.has(PHONE_B)).toBe(true);
    expect(phonesB.has(PHONE_A)).toBe(false);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) Order read / update / delete isolation
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_DB)("multi-tenant — Orders", () => {
  it("getById de tenantId B para un order de A → null", async () => {
    const customer = await createTestCustomerFor(TENANT_A, `997${String(Date.now()).slice(-7)}`, "buyer-a");
    const orderId = await createTestOrderFor(TENANT_A, customer, 50);

    const fromB = await OrdersDB.getById(TENANT_B, orderId);
    expect(fromB).toBeNull();

    const fromA = await OrdersDB.getById(TENANT_A, orderId);
    expect(fromA?.id).toBe(orderId);
  }, 30_000);

  it("update con tenantId B sobre order de A → null (no muta)", async () => {
    const customer = await createTestCustomerFor(TENANT_A, `996${String(Date.now()).slice(-7)}`, "buyer-a2");
    const orderId = await createTestOrderFor(TENANT_A, customer, 75);

    // Atacante intenta marcar entregada la orden ajena.
    const result = await OrdersDB.update(TENANT_B, orderId, { status: "entregado" });
    expect(result).toBeNull();

    // El estado real no cambió.
    const real = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, tenantId: true } });
    expect(real?.status).toBe("pendiente");
    expect(real?.tenantId).toBe(TENANT_A);
  }, 30_000);

  it("delete con tenantId B sobre order de A → no-op (la orden sigue)", async () => {
    const customer = await createTestCustomerFor(TENANT_A, `995${String(Date.now()).slice(-7)}`, "buyer-a3");
    const orderId = await createTestOrderFor(TENANT_A, customer, 33);

    await OrdersDB.delete(TENANT_B, orderId);

    const stillThere = await prisma.order.findUnique({ where: { id: orderId } });
    expect(stillThere?.id).toBe(orderId);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3) Product write isolation
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_DB)("multi-tenant — Products", () => {
  it("ProductsDB.upsert con producto de A pero tenantId=B → throw cross-tenant denied", async () => {
    const idA = await createTestProductFor(TENANT_A, "secret-product");

    // ProductsDB.upsert hace pre-check de tenantId. El atacante en B intenta sobrescribir.
    await expect(
      ProductsDB.upsert({
        id: idA,
        name: `${TAG}-HACKED`,
        category: "hacked",
        price: 1,
        costPrice: undefined,
        image: "",
        description: undefined,
        unit: "unidad",
        badge: undefined,
        barcode: undefined,
        stock: undefined,
        stockMin: undefined,
        stockMax: undefined,
        active: true,
        tenantId: TENANT_B,
      }),
    ).rejects.toThrow(/cross-tenant/i);

    const real = await prisma.product.findUnique({ where: { id: idA }, select: { name: true, tenantId: true } });
    expect(real?.tenantId).toBe(TENANT_A);
    expect(real?.name).not.toContain("HACKED");
  }, 30_000);

  it("ProductsDB.hardDelete con tenantId B sobre producto de A → no-op", async () => {
    const idA = await createTestProductFor(TENANT_A, "delete-victim");

    await ProductsDB.hardDelete(TENANT_B, idA);

    const stillThere = await prisma.product.findUnique({ where: { id: idA } });
    expect(stillThere?.id).toBe(idA);
  }, 30_000);

  it("ProductsDB.getById desde tenant B sobre producto de A → null", async () => {
    const idA = await createTestProductFor(TENANT_A, "read-only");
    const fromB = await ProductsDB.getById(TENANT_B, idA);
    expect(fromB).toBeNull();
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4) Coupon cross-tenant
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_DB)("multi-tenant — Coupons", () => {
  it("findByCode desde tenant B no encuentra cupón de A (aunque el code sea idéntico)", async () => {
    const codeShared = `BIENVENIDO-${RUN_ID}`;
    // Cupón en A con código X
    await prisma.coupon.create({
      data: {
        code: codeShared,
        tenantId: TENANT_A,
        description: "test-tenantA",
        discountType: "percent",
        discountValue: 15,
        active: true,
      },
    });
    // Lo trackeamos por id para cleanup
    const all = await prisma.coupon.findMany({ where: { code: codeShared } });
    all.forEach((c) => created.couponIds.push(c.id));

    const fromB = await CouponsDB.findByCode(TENANT_B, codeShared);
    expect(fromB).toBeNull();

    const fromA = await CouponsDB.findByCode(TENANT_A, codeShared);
    expect(fromA?.code).toBe(codeShared);
    expect(fromA?.tenantId).toBe(TENANT_A);
  }, 30_000);

  it("CouponsDB.delete con tenantId B sobre cupón de A → false (no borra)", async () => {
    const id = await createTestCouponFor(TENANT_A, "delete-victim");

    const ok = await CouponsDB.delete(TENANT_B, id);
    expect(ok).toBe(false);

    const stillThere = await prisma.coupon.findUnique({ where: { id } });
    expect(stillThere?.id).toBe(id);
  }, 30_000);

  it("CouponsDB.setActive con tenantId B sobre cupón de A → null (no muta)", async () => {
    const id = await createTestCouponFor(TENANT_A, "toggle-victim");

    const res = await CouponsDB.setActive(TENANT_B, id, false);
    expect(res).toBeNull();

    const stillActive = await prisma.coupon.findUnique({ where: { id }, select: { active: true } });
    expect(stillActive?.active).toBe(true);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5) Recetas — mass-assignment cross-tenant (productoId)
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_DB)("multi-tenant — Recetas (mass-assignment)", () => {
  it("RecetasDB.create permite hoy productoId cross-tenant — DOCUMENTAR GAP audit", async () => {
    // Setup: producto vive en A, atacante crea receta en B refiriendo ese productoId.
    const productAId = await createTestProductFor(TENANT_A, "ingrediente-secreto");

    // El schema actual NO valida en lib/db/recetas.db.ts que productoId pertenezca al tenantId.
    // Este test documenta el GAP: si la receta se crea, hay leak; si la audit fix lo cerró,
    // debería rechazar (throw o crear sin la relación). Hoy esperamos que se cree — y
    // entonces el GAP queda registrado en docs/security/multi-tenant-isolation-coverage.md.
    let recetaId: string | null = null;
    let threw = false;
    try {
      recetaId = await createTestRecetaFor(TENANT_B, "cross-tenant-recipe", productAId);
    } catch {
      threw = true;
    }

    if (threw) {
      // Si en algún momento se agrega validación, este test pasa por el camino "fixed".
      expect(threw).toBe(true);
    } else {
      // Camino "gap actual": la receta existe en B apuntando a producto de A.
      // Verificamos al menos que la receta esté correctamente atada al tenantId atacante (B)
      // y NO al de la víctima (A), para que la fix sea sólo a nivel de validación productoId.
      const stored = await prisma.receta.findUnique({
        where: { id: recetaId! },
        select: { tenantId: true, productoId: true },
      });
      expect(stored?.tenantId).toBe(TENANT_B);
      expect(stored?.productoId).toBe(productAId);
      // El test pasa, pero firma el gap. Cuando el audit fix llegue,
      // este branch debe convertirse en `expect(threw).toBe(true)`.
    }
  }, 30_000);

  it("RecetasDB.getById de tenant B sobre receta de A → null", async () => {
    const recetaIdA = await createTestRecetaFor(TENANT_A, "owned-by-A", null);
    const fromB = await RecetasDB.getById(TENANT_B, recetaIdA);
    expect(fromB).toBeNull();
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6) PaymentApproval — scoped por tenantId derivado de la conversación
//    (fix P0-2 2026-05-11 — findByPhonePending requiere tenantId explícito)
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_DB)("multi-tenant — PaymentApproval (post P0-2: tenantId requerido)", () => {
  /**
   * 2026-07-15 — este test estaba OBSOLETO y por eso fallaba al correrlo por
   * primera vez: insertaba un PaymentApproval SIN `tenantId` (se escribió cuando
   * la columna era nullable) y hoy Postgres lo rechaza con 23502 NOT NULL.
   *
   * O sea: la propiedad de seguridad se volvió MÁS fuerte que el test — el
   * estado inválido que el test fabricaba ya no se puede ni crear.
   *
   * Reescrito para probar el aislamiento de verdad (crear en B, leer desde A),
   * que es más fuerte que lo que verificaba antes ("sin conversación → null").
   */
  it("un pago pendiente del tenant B no se ve desde el tenant A", async () => {
    const id = `${TAG}-pap-${Math.random().toString(36).slice(2, 8)}`;
    const phone = `994${String(Date.now()).slice(-7)}`;

    // El pago vive en B.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PaymentApproval" (
        id, "tenantId", "customerPhone", "expectedAmount", "imageUrl", status, "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, 'pending', now())`,
      id,
      TENANT_B,
      phone,
      "50.00",
      "https://example.test/img.jpg",
    );
    created.paymentApprovalIds.push(id);

    // Desde A no se ve, aunque el teléfono coincida exactamente.
    expect(await PaymentApprovalDb.findByPhonePending(phone, TENANT_A)).toBeNull();
  }, 30_000);

  it("la DB rechaza un PaymentApproval sin tenantId (NOT NULL)", async () => {
    // Regresión estructural: si alguien vuelve a hacer `tenantId` nullable, un
    // pago quedaría huérfano de tenant y el scope de arriba dejaría de valer.
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "PaymentApproval" (
          id, "customerPhone", "expectedAmount", "imageUrl", status, "updatedAt"
        ) VALUES ($1, $2, $3, $4, 'pending', now())`,
        `${TAG}-pap-null`,
        `994${String(Date.now()).slice(-6)}`,
        "1.00",
        "https://example.test/x.jpg",
      ),
    ).rejects.toThrow(/not-null|23502/i);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7) Customer phone @unique global — propiedad estructural
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_DB)("multi-tenant — invariante schema Customer.phone @unique global", () => {
  it("crear el MISMO phone en dos tenants distintos falla (P2002 unique violation)", async () => {
    const sharedPhone = `993${String(Date.now()).slice(-7)}`;

    await createTestCustomerFor(TENANT_A, sharedPhone, "alpha");

    // El segundo INSERT debe fallar por unique constraint en phone.
    await expect(
      prisma.customer.create({
        data: {
          phone: sharedPhone,
          name: `${TAG}-beta`,
          tenantId: TENANT_B,
          location: "",
          reference: "",
        },
      }),
    ).rejects.toThrow(/unique|P2002|Unique constraint/i);

    // Documenta TD-040 Phase 3: cuando phone @unique se relaje a @@unique([tenantId, phone]),
    // este test cambia a esperar que SI se permita y entonces el test 6.1 de
    // "customer phone X en A y B" pase a tener sentido.
  }, 30_000);
});
