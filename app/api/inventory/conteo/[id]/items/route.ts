import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { InventoryConteoItemsDB } from "@/lib/db/inventory-conteo-items.db";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// GET — Lista items del conteo con info del producto
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    // Audit project-wide 2026-05-19: migrado a InventoryConteoItemsDB.
    const conteo = await InventoryConteoItemsDB.findConteoInTenant(auth.tenantId, id);
    if (!conteo) {
      return NextResponse.json({ error: "Conteo no encontrado" }, { status: 404 });
    }

    const items = await InventoryConteoItemsDB.listItemsByConteo(id);

    // Fetch product details for each item (tenant-scoped now)
    const productIds = items.map(i => i.productId);
    const products = await InventoryConteoItemsDB.getProductsForItems(auth.tenantId, productIds);
    const productMap = new Map(products.map(p => [p.id, p]));

    const enriched = items.map(item => {
      const prod = productMap.get(item.productId);
      return {
        ...item,
        product: prod ?? null,
      };
    });

    return NextResponse.json({
      conteoId: id,
      status: conteo.status,
      items: enriched,
      total: items.length,
      contados: items.filter(i => i.stockContado !== null).length,
    });
  } catch (e) {
    logger.error("[conteo/items/GET]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al obtener items" }, { status: 500 });
  }
}

const PatchSchema = z.object({
  itemId: z.string().min(1),
  // Se puede mandar sólo el check, sin volver a contar.
  stockContado: z.number().int().min(0).optional(),
  /**
   * Si esta diferencia se aplica al stock al cerrar el conteo.
   *
   * Faltaba: el wizard tiene un check «ajustar» por producto, pero sólo movía
   * estado de React — nunca llegaba acá. El servidor lo forzaba a
   * `diferencia !== 0`, así que destildar un producto no hacía nada y el
   * cierre terminaba ajustando TODAS las diferencias, incluidas las que el
   * encargado había marcado para revisar.
   */
  ajustado: z.boolean().optional(),
}).refine(
  (d) => d.stockContado !== undefined || d.ajustado !== undefined,
  { message: "Mandá stockContado, ajustado, o los dos" },
);

// PATCH — Actualizar stockContado de un item
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "inventory-conteo-X-items"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
    }

    const { itemId, stockContado, ajustado } = parsed.data;

    // Verify ownership
    const conteo = await InventoryConteoItemsDB.findConteoInTenant(auth.tenantId, id);
    if (!conteo) {
      return NextResponse.json({ error: "Conteo no encontrado" }, { status: 404 });
    }
    if (conteo.status === "CERRADO") {
      return NextResponse.json({ error: "El conteo ya está cerrado" }, { status: 400 });
    }

    const item = await InventoryConteoItemsDB.findItemInConteo(itemId, id);
    if (!item) {
      return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
    }

    // Si sólo se está tildando/destildando, la cuenta anterior se conserva.
    const contado = stockContado ?? item.stockContado;
    const diferencia = contado != null ? contado - item.stockSistema : item.diferencia;

    const updated = await InventoryConteoItemsDB.updateItem(itemId, {
      ...(contado != null ? { stockContado: contado } : {}),
      ...(diferencia != null ? { diferencia } : {}),
      // La decisión del usuario manda. Sólo cuando no dice nada se usa el
      // default de siempre: toda diferencia se ajusta salvo aviso.
      ajustado: ajustado ?? (diferencia != null && diferencia !== 0),
    });

    // Update conteo status to EN_PROGRESO if needed
    if (conteo.status === "INICIADO") {
      await InventoryConteoItemsDB.markConteoInProgress(id);
    }

    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[conteo/items/PATCH]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al actualizar item" }, { status: 500 });
  }
}
