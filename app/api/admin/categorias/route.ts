/**
 * /api/admin/categorias — las categorías del catálogo para el editor
 * (Productos e inventario › Categorías).
 *
 * GET  → la lista guardada (Settings.categoryOrder) unida con las que usan los
 *        productos, con cuántos productos tiene cada una (la cuenta sale de acá,
 *        no del cliente).
 * POST → renombra la categoría de los productos: `{ renombres: [{ valores, nuevo }] }`.
 *        El orden, la visibilidad y el SEO se siguen guardando en /api/settings.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { CategoriasCatalogoDB } from "@/lib/db/categorias-catalogo.db";
import { invalidate } from "@/lib/cache";
import { invalidateAdminCache } from "@/lib/admin-cache";
import { logActivity } from "@/lib/activity-logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const RenombrarSchema = z.object({
  renombres: z
    .array(
      z.object({
        // "" es un valor real (producto sin categoría): se admite.
        valores: z.array(z.string().max(100)).min(1).max(50),
        nuevo: z.string().trim().min(1, "La categoría necesita un nombre").max(100),
      }),
    )
    .min(1)
    .max(100),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const categorias = await CategoriasCatalogoDB.listar(auth.tenantId);
    return NextResponse.json({ categorias });
  } catch (e) {
    logger.error("[admin/categorias] GET", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudieron leer las categorías" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const limitado = applyRateLimit(req, "MODERATE", "admin-categorias-renombrar");
  if (limitado) return limitado;
  // Mismo rol que guardar la lista (/api/settings PUT): renombrar sin poder
  // guardar el orden dejaría las dos mitades desparejas.
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = RenombrarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  try {
    const actualizados = await CategoriasCatalogoDB.renombrar(auth.tenantId, parsed.data.renombres);
    invalidate(`dashboard:${auth.tenantId}`);
    invalidateAdminCache.afterProduct(auth.tenantId);
    const resumen = parsed.data.renombres.map((r) => `${r.valores.join("/")} → ${r.nuevo}`).join("; ");
    logActivity(
      "Editar",
      "categoría",
      `Categorías renombradas (${actualizados} producto(s)): ${resumen}`.slice(0, 500),
      undefined,
      auth.username,
      req.headers.get("x-request-id") ?? undefined,
      auth.tenantId,
    ).catch((err) => logger.error("[admin/categorias] logActivity", { error: String(err) }));
    return NextResponse.json({ ok: true, actualizados });
  } catch (e) {
    logger.error("[admin/categorias] POST", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo renombrar" }, { status: 503 });
  }
}
