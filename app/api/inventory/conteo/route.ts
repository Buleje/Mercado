 
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { InventoryConteoItemsDB } from "@/lib/db/inventory-conteo-items.db";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { getOrSet, invalidate } from "@/lib/cache";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";

// F6: Helpers de lock de conteo activo — TTL 1 hora
export function conteoLockKey(tenantId: string) {
  return `tenant:${tenantId}:conteo-active`;
}
export async function setConteoLock(tenantId: string) {
  // Guardamos flag en cache con TTL 1h (3600s)
  await getOrSet(conteoLockKey(tenantId), 3600, async () => "1");
}
export async function isConteoLocked(tenantId: string): Promise<boolean> {
  // Si la key existe, el callback no se ejecuta — devuelve "1".
  // Si NO existe, ejecuta el callback que devuelve null (no setea nada útil).
  // Para verificar SIN setear, usamos el path: lectura sin escribir.
  const cached = await getOrSet<string | null>(
    conteoLockKey(tenantId),
    1, // 1 sec — minimal write si no existe
    async () => null,
  ).catch((err) => {
    logger.warn("[conteo/lock] cache lookup failed", { err: String(err) });
    return null;
  });
  return cached === "1";
}
export async function clearConteoLock(tenantId: string) {
  invalidate(conteoLockKey(tenantId));
}

const CreateSchema = z.object({
  tipo: z.enum(["completo", "categoria", "ubicacion"]).default("completo"),
  categoria: z.string().optional(),
}).strict();

// POST — Iniciar un nuevo conteo físico
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "inventory-conteo"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
    }

    const { tipo, categoria } = parsed.data;

    const conteo = await InventoryConteoItemsDB.abrir(auth.tenantId, {
      tipo,
      categoria,
      creadoPor: auth.username,
    });
    if (!conteo) {
      return NextResponse.json({ error: "No hay productos activos para contar" }, { status: 400 });
    }

    // F6: Activar lock para bloquear nuevas ventas/pedidos durante el conteo
    await setConteoLock(auth.tenantId);

    return NextResponse.json({
      id: conteo.id,
      tipo: conteo.tipo,
      status: conteo.status,
      totalItems: conteo.totalItems,
      message: `Se generaron ${conteo.totalItems} productos para contar`,
    }, { status: 201 });
  } catch (e) {
    logger.error("[conteo/POST]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al crear conteo" }, { status: 500 });
  }
}

// GET — Listar conteos (filtro opcional por status)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const status = req.nextUrl.searchParams.get("status") ?? undefined;

  try {
    const conteos = await InventoryConteoItemsDB.listar(auth.tenantId, status);

    return NextResponse.json(conteos);
  } catch (e) {
    logger.error("[conteo/GET]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al listar conteos" }, { status: 500 });
  }
}
