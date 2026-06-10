import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ProductsDB } from "@/lib/db/products.db";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * POST /api/admin/forestal/ctp/to-product
 * Crea un Producto vendible (borrador, inactive) a partir de una línea CTP.
 * El producto queda en estado active=false para que el dueño lo revise antes
 * de publicarlo — no contamina el catálogo en vivo.
 */

const bodySchema = z.object({
  entryId: z.string().trim().min(1, "entryId requerido"),
});

export const POST = withApiHandler("forestal-ctp-to-product", async (req: NextRequest) => {
  // 1. Auth
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const { tenantId, username } = auth;

  // 2. Rate limit
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  // 3. Especialización guard
  const specOk = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  if (!specOk) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
      { status: 403 },
    );
  }

  // 4. Parse body
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "bad_request", message: "JSON inválido." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 422 },
    );
  }
  const { entryId } = parsed.data;

  // 5. Leer la línea CTP (con scope de tenantId)
  let entry: Awaited<ReturnType<typeof ForestCtpDB.getById>>;
  try {
    entry = await ForestCtpDB.getById(tenantId, entryId);
  } catch (err) {
    logger.error("[ctp/to-product] getById failed", { entryId, tenantId, error: String(err) });
    return NextResponse.json({ error: "server_error", message: "Error al leer la línea CTP." }, { status: 500 });
  }

  if (!entry) {
    return NextResponse.json(
      { error: "not_found", message: "Línea CTP no encontrada para este tenant." },
      { status: 404 },
    );
  }
  if (entry.status === "anulado") {
    return NextResponse.json(
      { error: "entry_annulled", message: "No se puede enviar a inventario una línea anulada." },
      { status: 409 },
    );
  }

  // 6. Construir el nombre del producto
  const speciesPart = entry.speciesCommon?.trim() || "especie desconocida";
  const typePart = entry.productType?.trim() || "Madera aserrada";
  const productName = `${typePart} — ${speciesPart}`;

  // 7. Stock: quantity del CTP (puede ser null → 0)
  const stock = entry.quantity != null ? Math.round(Number(entry.quantity)) : 0;

  // 8. Crear Producto borrador via ProductsDB.upsert (id=0 → INSERT nuevo)
  //    active=false: no aparece en catálogo hasta que el dueño lo active.
  const productPayload = {
    name: productName,
    category: "Madera",            // categoría segura que siempre existe
    price: 0,                      // precio 0 si no hay; dueño lo ajusta
    image: "",
    unit: entry.unit ?? "m3",
    description: [
      entry.speciesScientific ? `Especie científica: ${entry.speciesScientific}` : null,
      entry.cites ? "ESPECIE CITES" : null,
      entry.gtfNumber ? `GTF salida: ${entry.gtfNumber}` : null,
      entry.destino ? `Destino original: ${entry.destino}` : null,
      `Generado desde CTP línea #${entry.lineNo} (${entry.section}) por ${username}`,
    ].filter(Boolean).join(" · ") || undefined,
    stock,
    active: false,                 // BORRADOR — no contamina catálogo en vivo
    tenantId,
  };

  try {
    const product = await ProductsDB.create(productPayload);
    return NextResponse.json({
      ok: true,
      message: `Producto "${productName}" creado como borrador en inventario. Activalo desde el catálogo para publicarlo.`,
      productId: product.id,
      productName: product.name,
    });
  } catch (err) {
    logger.error("[ctp/to-product] ProductsDB.upsert failed", { tenantId, entryId, error: String(err) });
    return NextResponse.json(
      { error: "server_error", message: "No se pudo crear el producto. Intentá de nuevo." },
      { status: 500 },
    );
  }
});
