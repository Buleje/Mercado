import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { AdminImportDataDB } from "@/lib/db/admin-import-data.db";
import { logActivity } from "@/lib/activity-logger";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { z } from "zod/v4";
import { applyRateLimit } from "@/lib/rate-limit";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { assertCsrf } from "@/lib/auth/csrf";

// ── Schemas de validación ─────────────────────────────────────────────────────

const ProductImportSchema = z.object({
  nombre: z.string().min(1).max(200),
  categoria: z.string().min(1).max(100),
  precio: z.number().positive(),
  precioCompra: z.number().positive().optional().nullable(),
  unidad: z.string().max(50).default("unidad"),
  stock: z.number().int().min(0).optional().nullable(),
  stockMin: z.number().int().min(0).optional().nullable(),
  activo: z.boolean().default(true),
  codigo: z.string().max(100).optional().nullable(),
  descripcion: z.string().max(500).optional().nullable(),
});

const CustomerImportSchema = z.object({
  nombre: z.string().min(1).max(200),
  telefono: z.string().min(7).max(20),
  ubicacion: z.string().max(300).optional().nullable(),
});

const BodySchema = z.object({
  products: z.array(ProductImportSchema).max(500).optional(),
  customers: z.array(CustomerImportSchema).max(500).optional(),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-import-data"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  // 1. Auth — solo admin puede importar datos
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const traceId = newTraceId();
  // Round 18 M004: bulk import → Customer.create batched. Audit con admin actor.
  return runWithAuditContext(req, `import:${auth.username}`, () => importHandler(req, auth, traceId));
}

async function importHandler(
  req: NextRequest,
  auth: { tenantId: string; username: string },
  traceId: string,
): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { products = [], customers = [] } = parsed.data;
    const errors: string[] = [];
    const imported = { products: 0, customers: 0 };

    // ── Importar productos en batch ───────────────────────────────────────────
    if (products.length > 0) {
      // Prisma 7: usar tipo explícito en lugar de Parameters<> para evitar drift de tipos
      const validProducts: Array<{
        name: string; category: string; price: number; costPrice: number | null;
        unit: string; stock: number | null; stockMin: number | null; active: boolean;
        barcode: string | null; description: string | null;
      }> = [];

      for (let i = 0; i < products.length; i++) {
        const itemParsed = ProductImportSchema.safeParse(products[i]);
        if (!itemParsed.success) {
          errors.push(`Producto [${i}]: ${itemParsed.error.issues.map((e) => e.message).join(", ")}`);
          continue;
        }
        const p = itemParsed.data;
        validProducts.push({
          name: p.nombre,
          category: p.categoria,
          price: p.precio,
          costPrice: p.precioCompra ?? null,
          unit: p.unidad,
          stock: p.stock ?? null,
          stockMin: p.stockMin ?? null,
          active: p.activo,
          barcode: p.codigo ?? null,
          description: p.descripcion ?? null,
        });
      }

      imported.products = await AdminImportDataDB.importProducts(auth.tenantId, validProducts);
    }

    // ── Importar clientes en batch ────────────────────────────────────────────
    if (customers.length > 0) {
      const validCustomers: Array<{
        phone: string; name: string; location: string;
      }> = [];

      for (let i = 0; i < customers.length; i++) {
        const itemParsed = CustomerImportSchema.safeParse(customers[i]);
        if (!itemParsed.success) {
          errors.push(`Cliente [${i}]: ${itemParsed.error.issues.map((e) => e.message).join(", ")}`);
          continue;
        }
        const c = itemParsed.data;
        validCustomers.push({
          phone: c.telefono,
          name: c.nombre,
          location: c.ubicacion ?? "",
        });
      }

      imported.customers = await AdminImportDataDB.importCustomers(auth.tenantId, validCustomers);
    }

    // 4. Fire-and-forget
    logActivity(
      "import",
      "datos",
      `Importación: ${imported.products} productos, ${imported.customers} clientes`,
      auth.tenantId,
      auth.username,
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json({ imported, errors }, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
