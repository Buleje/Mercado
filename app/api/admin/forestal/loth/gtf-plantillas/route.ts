import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestGtfPlantillasDB } from "@/lib/db/forest-gtf-plantillas.db";
import { accionPlantillaSchema, type ErrorAlmacen } from "@/lib/forestal/gtf-plantillas-almacen";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/gtf-plantillas — las plantillas de «Datos de la
 * guía» del despacho con guía (16-10-2026): bloques guardados con nombre
 * (permiso, propietario, partida, destino, transporte) para rellenar otra
 * guía de una vez. Nunca el N°, las fechas ni las trozas (`gtf-plantillas.ts`).
 *
 * GET    — `{ plantillas }`, las usadas hace menos primero.
 * PUT    — UNA acción: `{ accion: "crear", nombre, contenido }`,
 *          `{ accion: "actualizar" | "renombrar" | "duplicar" | "usar", id, … }`.
 *          Devuelve `{ plantilla, plantillas }`.
 * DELETE — `?id=` borra una.
 *
 * Los mismos roles que despachan con guía.
 */

const ROLES: readonly AdminRole[] = ["admin", "almacenero", "owner"];

const MENSAJE: Record<ErrorAlmacen, { status: number; message: string }> = {
  no_existe: { status: 404, message: "Esa plantilla ya no está: alguien la borró. Vuelve a abrir la lista." },
  nombre_repetido: { status: 409, message: "Ya tienes una plantilla con ese nombre: ponle otro o usa «Actualizar con lo de ahora»." },
  tope: { status: 409, message: "Llegaste a las 40 plantillas: borra alguna que ya no uses." },
  muy_grande: { status: 413, message: "Las plantillas ya pesan demasiado: borra alguna que ya no uses." },
};

async function ensureSpec(tenantId: string) {
  const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return enabled ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

async function guardia(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return { ok: false, res: auth } as const;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return { ok: false, res: rl } as const;
  const spec = await ensureSpec(auth.tenantId);
  if (spec) return { ok: false, res: spec } as const;
  return { ok: true, auth } as const;
}

export const GET = withApiHandler("forestal-loth-gtf-plantillas-get", async (req: NextRequest) => {
  const g = await guardia(req);
  if (!g.ok) return g.res;
  try {
    return NextResponse.json({ plantillas: await ForestGtfPlantillasDB.listar(g.auth.tenantId) });
  } catch (err) {
    logger.error("[loth.gtf-plantillas.GET] failed", { error: String(err), tenantId: g.auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PUT = withApiHandler("forestal-loth-gtf-plantillas-put", async (req: NextRequest) => {
  const g = await guardia(req);
  if (!g.ok) return g.res;
  const body = await req.json().catch(() => null);
  const parsed = accionPlantillaSchema.safeParse(body);
  if (!parsed.success || parsed.data.accion === "borrar") {
    return NextResponse.json(
      {
        error: "validation_error",
        message: parsed.success ? "Para borrar usa DELETE." : (parsed.error.issues[0]?.message ?? "Revisa la plantilla."),
        issues: parsed.success ? [] : parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }
  return responder(g.auth.tenantId, parsed.data, g.auth.username ?? "unknown");
});

export const DELETE = withApiHandler("forestal-loth-gtf-plantillas-delete", async (req: NextRequest) => {
  const g = await guardia(req);
  if (!g.ok) return g.res;
  const id = z.string().trim().min(1).max(64).safeParse(req.nextUrl.searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "validation_error", message: "Falta qué plantilla borrar." }, { status: 400 });
  return responder(g.auth.tenantId, { accion: "borrar", id: id.data }, g.auth.username ?? "unknown");
});

async function responder(tenantId: string, accion: Parameters<typeof ForestGtfPlantillasDB.cambiar>[1], user: string) {
  try {
    const r = await ForestGtfPlantillasDB.cambiar(tenantId, accion, user);
    if (!r.ok) {
      const m = MENSAJE[r.error];
      return NextResponse.json({ error: r.error, message: m.message }, { status: m.status });
    }
    return NextResponse.json({ plantilla: r.plantilla, plantillas: r.lista });
  } catch (err) {
    logger.error("[loth.gtf-plantillas] failed", { error: String(err), tenantId, accion: accion.accion });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
