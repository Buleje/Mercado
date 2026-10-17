import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { InventoryMovementsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { MENSAJE_MOTIVO, errorDeMotivo, limpiarMotivo, motivoObligatorio, motivoSuficiente } from "@/lib/validations/motivo";

/**
 * b-9 (Brandon 17-10, «Motivo siempre»): ajustar stock a mano exige el porqué
 * (≥3 letras o números) en `notes`, que es donde el kardex lo muestra. Vale
 * para «adjust», «bulk-adjust» (motivo por fila o uno para todo el lote) y los
 * movimientos `ajuste_positivo`/`ajuste_negativo`. Compras, ventas y pérdidas
 * (que ya traen su causa) siguen igual.
 */
const TIPOS_AJUSTE = new Set(["ajuste_positivo", "ajuste_negativo"]);

const AdjustSchema = z.object({
  action: z.literal("adjust"),
  productId: z.number().positive(),
  newStock: z.number().min(0),
  warehouseId: z.string().optional(),
  notes: motivoObligatorio(300),
});

const MovementSchema = z.object({
  productId: z.number().positive(),
  type: z.string().min(1).max(50),
  lossType: z.string().max(50).optional(),
  // `InventoryMovement.quantity` es Int: un 2,5 llegaba a Prisma y volvía como 500 sin explicación.
  quantity: z.number().int("La cantidad tiene que ser un número entero").positive(),
  reference: z.string().max(100).optional(),
  warehouseId: z.string().optional(),
  notes: z.string().max(300).optional(),
}).superRefine((d, ctx) => {
  if (TIPOS_AJUSTE.has(d.type) && !motivoSuficiente(d.notes)) {
    ctx.addIssue({ code: "custom", path: ["notes"], message: MENSAJE_MOTIVO });
  }
});

const BulkAdjustSchema = z.object({
  action: z.literal("bulk-adjust"),
  /** b-9: el motivo de todo el lote (p. ej. «Conteo físico 2026-10-17»); una fila puede traer el suyo. */
  motivo: z.string().max(300).optional(),
  items: z.array(z.object({
    productId: z.number().positive(),
    newStock: z.number().min(0),
    notes: z.string().max(300).optional(),
  })).min(1).max(200),
}).superRefine((d, ctx) => {
  if (motivoSuficiente(d.motivo)) return;
  d.items.forEach((item, i) => {
    if (!motivoSuficiente(item.notes)) ctx.addIssue({ code: "custom", path: ["items", i, "notes"], message: MENSAJE_MOTIVO });
  });
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");

    if (productId) {
      // Round 28 P0 (DB profundo audit): firma cambió a (tenantId, productId)
      // — antes era cross-tenant leak silencioso (producto ID 42 mezclaba
      // movimientos del tenant A con tenant B). auth.tenantId garantiza
      // aislamiento.
      const movements = await InventoryMovementsDB.getByProduct(auth.tenantId, Number(productId));
      return NextResponse.json(movements);
    }

    // Paginado por cursor cuando la pantalla lo pide. Sin `paged` se responde
    // como siempre (un array de los últimos 200): hay otros consumidores.
    if (searchParams.get("paged") === "1") {
      const limitRaw = Number(searchParams.get("limit") ?? 100);
      const page = await InventoryMovementsDB.listWithCursor(auth.tenantId, {
        limit: Number.isFinite(limitRaw) ? limitRaw : 100,
        ...(searchParams.get("cursor") ? { cursor: searchParams.get("cursor")! } : {}),
      });
      return NextResponse.json(page);
    }

    return NextResponse.json(await InventoryMovementsDB.getAll(auth.tenantId));
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "inventory-movements"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();

    if (raw.action === "adjust") {
      const parsed = AdjustSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { error: errorDeMotivo(parsed.error.issues, "notes") ?? "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
          { status: 400 }
        );
      }
      const { productId, newStock, warehouseId, notes } = parsed.data;
      const movement = await InventoryMovementsDB.adjust(productId, newStock, auth.tenantId, warehouseId, notes, auth.username);
      return NextResponse.json(movement, { status: 201 });
    }

    if (raw.action === "bulk-adjust") {
      const parsed = BulkAdjustSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { error: errorDeMotivo(parsed.error.issues, "notes") ?? "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
          { status: 400 }
        );
      }
      const results = await Promise.allSettled(
        parsed.data.items.map((item) => InventoryMovementsDB.adjust(
          item.productId, item.newStock, auth.tenantId, undefined,
          limpiarMotivo(motivoSuficiente(item.notes) ? item.notes ?? "" : parsed.data.motivo ?? ""),
          auth.username,
        ))
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      const succeededIds = parsed.data.items
        .filter((_, i) => results[i].status === "fulfilled")
        .map((item) => item.productId);
      return NextResponse.json({ ok: true, succeeded, failed, succeededIds }, { status: 201 });
    }

    // Default: record a movement
    const parsed = MovementSchema.safeParse(raw);
    if (!parsed.success) {
      // La cantidad entera es la regla que se rompe desde la pantalla: se dice tal cual.
      const entero = parsed.error.issues.find((i) => i.path[0] === "quantity" && "expected" in i && i.expected === "int");
      return NextResponse.json(
        { error: entero?.message ?? errorDeMotivo(parsed.error.issues, "notes") ?? "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }
    const { productId, type, lossType, quantity, reference, warehouseId, notes } = parsed.data;
    const movement = await InventoryMovementsDB.record({
      productId,
      type,
      lossType,
      quantity,
      reference,
      warehouseId,
      notes,
      createdBy: auth.username,
      tenantId: auth.tenantId,
    });
    return NextResponse.json(movement, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
