import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole, SessionPayload } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestGtfMatricialDB } from "@/lib/db/forest-gtf-matricial.db";
import { ForestGtfColaMonteDB } from "@/lib/db/forest-gtf-cola-monte.db";
import {
  MENSAJE_ERROR_PERFIL,
  listaPerfiles,
  perfilAltaSchema,
  perfilBajaSchema,
  perfilCambioSchema,
  type ErrorPerfil,
  type ResultadoPerfil,
} from "@/lib/forestal/gtf-matricial-perfiles";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/gtf-matricial/perfiles — las impresoras calibradas
 * del talonario (16-10): «Oficina» (la de siempre; su corrimiento es el X/Y de
 * cada hoja) y las demás («Monte – Epson LX-350»…), cada una con SU
 * corrimiento y escala. Son del tenant, no del titular: la impresora es la
 * misma para todas las guías.
 *
 * GET → `{ perfiles }` (Oficina primero) · POST alta `{ nombre, corrimientoXmm?, … }`
 * PATCH cambio `{ id, nombre?, corrimientoXmm?, … }` · DELETE `?id=` (Oficina no;
 * 409 `en_uso` si una guía por imprimir en el monte va con esa impresora).
 */

const ROLES: readonly AdminRole[] = ["admin", "almacenero", "owner"];

const ESTADO: Record<ErrorPerfil, number> = { "no-existe": 404, repetido: 409, tope: 409, oficina: 422 };

async function ensureSpec(tenantId: string) {
  const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return enabled ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

/** Sesión + límite + especialización: lo mismo para los cuatro verbos. */
async function entrada(req: NextRequest): Promise<Response | SessionPayload> {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof Response) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  return (await ensureSpec(auth.tenantId)) ?? auth;
}

/** Lo que quedó guardado, sin volver a leer: `r.perfiles` es lo que se escribió bajo el bloqueo. */
function responder(r: ResultadoPerfil) {
  if (!r.ok) return NextResponse.json({ error: r.error, message: MENSAJE_ERROR_PERFIL[r.error] }, { status: ESTADO[r.error] });
  return NextResponse.json({ perfil: r.perfil, perfiles: listaPerfiles(r.perfiles) });
}

const invalido = (issues: unknown[]) =>
  NextResponse.json({ error: "validation_error", message: "Algún dato de la impresora está fuera de rango.", issues: issues.slice(0, 5) }, { status: 400 });

export const GET = withApiHandler("forestal-loth-gtf-matricial-perfiles-get", async (req: NextRequest) => {
  const auth = await entrada(req);
  if (auth instanceof Response) return auth;
  try {
    return NextResponse.json({ perfiles: await ForestGtfMatricialDB.perfiles(auth.tenantId) });
  } catch (err) {
    logger.error("[loth.gtf-matricial.perfiles.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-loth-gtf-matricial-perfiles-post", async (req: NextRequest) => {
  const auth = await entrada(req);
  if (auth instanceof Response) return auth;
  const parsed = perfilAltaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues);
  try {
    const r = await ForestGtfMatricialDB.cambiarPerfiles(auth.tenantId, { tipo: "alta", datos: parsed.data }, auth.username ?? "unknown");
    return responder(r);
  } catch (err) {
    logger.error("[loth.gtf-matricial.perfiles.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PATCH = withApiHandler("forestal-loth-gtf-matricial-perfiles-patch", async (req: NextRequest) => {
  const auth = await entrada(req);
  if (auth instanceof Response) return auth;
  const parsed = perfilCambioSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues);
  try {
    const r = await ForestGtfMatricialDB.cambiarPerfiles(auth.tenantId, { tipo: "cambio", datos: parsed.data }, auth.username ?? "unknown");
    return responder(r);
  } catch (err) {
    logger.error("[loth.gtf-matricial.perfiles.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-loth-gtf-matricial-perfiles-delete", async (req: NextRequest) => {
  const auth = await entrada(req);
  if (auth instanceof Response) return auth;
  const parsed = perfilBajaSchema.safeParse({ id: req.nextUrl.searchParams.get("id") ?? undefined });
  if (!parsed.success) return invalido(parsed.error.issues);
  try {
    /* Sin su calibración, el monte no podría sacar esa guía: primero se imprime o se cambia el envío. */
    const cola = await ForestGtfColaMonteDB.leerAlDia(auth.tenantId);
    const usa = cola.trabajos.find((t) => t.estado === "pendiente" && t.perfilId === parsed.data.id);
    if (usa) {
      return NextResponse.json(
        { error: "en_uso", message: `No se puede borrar: lo usa la guía ${usa.numeroGuia}, que está por imprimir en el monte.` },
        { status: 409 },
      );
    }
    const r = await ForestGtfMatricialDB.cambiarPerfiles(auth.tenantId, { tipo: "baja", id: parsed.data.id }, auth.username ?? "unknown");
    return responder(r);
  } catch (err) {
    logger.error("[loth.gtf-matricial.perfiles.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
