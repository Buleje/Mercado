import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { SupportTicketsDB } from "@/lib/db/support-tickets.db";
import { DocumentsDB } from "@/lib/db/documents.db";
import { logActivity } from "@/lib/activity-logger";
import { avisarCorreccionGuiaAlSuperadmin } from "@/lib/mailer-superadmin";
import { logger } from "@/lib/logger";
import {
  ENTITY_TYPE_ETIQUETA,
  crearCorreccionSchema,
  listarDelNegocioConGuiasQuerySchema,
  resumenPorGuia,
  type CrearCorreccionRespuesta,
  type ErrorCrearCorreccion,
  type ListarDelNegocioRespuesta,
} from "@/lib/soporte/correccion-guia";
import { resolverCambios } from "@/lib/soporte/correccion-guia-dice";
import { leerGuiaParaCorreccion } from "@/lib/soporte/correccion-guia-guias";

/**
 * /api/admin/solicitudes-correccion — ADR-512: una guía EMITIDA no se edita;
 * el negocio pide la corrección y el superadmin la resuelve (anular + emitir
 * otra). Contrato: `lib/soporte/correccion-guia.ts`.
 *
 *   POST → pedir (`CrearCorreccionBody`). El servidor lee la guía con el
 *          `tenantId` de la sesión y arma cada `dice` desde lo guardado (lo
 *          que mande el navegador en `dice` se ignora). 201 | 400 | 404 | 409.
 *   GET  → mis solicitudes (`?entityType&entityId&estado&limite`) o, para la
 *          lista de guías, `?entityIds=a,b,c` → `porGuia[id]` en UNA llamada.
 *
 * El encargado (manager) entra siempre por diseño de `requireAdmin`.
 */

const ROLES: AdminRole[] = ["admin", "owner", "almacenero"];

function fallo(
  status: number,
  codigo: ErrorCrearCorreccion,
  error: string,
  extra: { solicitudAbiertaId?: string; clave?: string } = {},
): NextResponse<CrearCorreccionRespuesta> {
  return NextResponse.json({ ok: false, error, codigo, ...extra }, { status });
}

export async function POST(req: NextRequest): Promise<Response> {
  const rl = applyRateLimit(req, "MODERATE", "solicitudes-correccion");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  if (!tenantId) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = crearCorreccionSchema.safeParse(raw);
  if (!parsed.success) {
    return fallo(400, "validation_error", parsed.error.issues[0]?.message ?? "Datos inválidos");
  }
  const body = parsed.data;

  try {
    const leida = await leerGuiaParaCorreccion(tenantId, body.entityType, body.entityId);
    if (!leida.ok) {
      if (leida.error === "no_existe") return fallo(404, "no_existe", "Esa guía no está en tu negocio");
      return fallo(
        409,
        "no_emitida",
        leida.estado === "anulada"
          ? "La guía está anulada: ya no se corrige"
          : "La guía todavía no se emitió: corrígela directamente en el libro",
      );
    }

    const resueltos = resolverCambios(leida.guia, body.cambios);
    if (!resueltos.ok) {
      const mensaje =
        resueltos.error === "casillero_desconocido"
          ? `La guía no tiene el casillero «${resueltos.clave}»`
          : `La guía no lista «${resueltos.clave}»: si falta en la guía, explícalo en el motivo`;
      return fallo(400, resueltos.error, mensaje, { clave: resueltos.clave });
    }

    const documentoIds = [...new Set(body.documentoIds ?? [])];
    if (documentoIds.length) {
      const docs = await Promise.all(documentoIds.map((id) => DocumentsDB.getById(tenantId, id, auth.role)));
      if (docs.some((d) => !d)) return fallo(400, "documento_ajeno", "Una de las fotos no está en el Archivo del negocio");
    }

    const r = await SupportTicketsDB.crearCorreccion(tenantId, {
      entityType: body.entityType,
      entityId: body.entityId,
      guiaNumero: leida.guia.numero,
      guiaFecha: leida.guia.fecha,
      cambios: resueltos.cambios,
      motivo: body.motivo,
      createdBy: auth.username,
      documentoIds,
    });
    if (!r.ok) {
      if (r.error === "ya_hay_una_abierta") {
        return fallo(409, "ya_hay_una_abierta", "Esta guía ya tiene una solicitud abierta", {
          solicitudAbiertaId: r.solicitudAbiertaId,
        });
      }
      return fallo(400, "validation_error", "Datos inválidos");
    }
    const s = r.solicitud;

    logActivity(
      "soporte_correccion_pedida",
      "SupportTicket",
      `${auth.username} pidió corregir la guía ${s.guiaNumero} (${s.cambios.length} cambio${s.cambios.length === 1 ? "" : "s"})`,
      s.id,
      auth.username,
      undefined,
      tenantId,
    ).catch((err) => logger.error("[solicitudes-correccion] activity log falló", { error: String(err), tenantId }));

    SupportTicketsDB.tiendaDe(tenantId)
      .then((tienda) =>
        avisarCorreccionGuiaAlSuperadmin({
          tenantName: tienda?.name ?? tenantId,
          guiaNumero: s.guiaNumero,
          dondeEtiqueta: ENTITY_TYPE_ETIQUETA[s.entityType],
          createdBy: s.createdBy,
          motivo: s.motivo,
          cambios: s.cambios,
        }),
      )
      .catch((err) => logger.error("[solicitudes-correccion] correo al superadmin falló", { error: String(err), tenantId }));

    const ok: CrearCorreccionRespuesta = { ok: true, solicitud: s };
    return NextResponse.json(ok, { status: 201 });
  } catch (err) {
    logger.error("[solicitudes-correccion] POST falló", { error: String(err), tenantId });
    return NextResponse.json({ ok: false, error: "No se pudo enviar la solicitud" }, { status: 500 });
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const rl = applyRateLimit(req, "GENEROUS", "solicitudes-correccion-lista");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  if (!tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const q = listarDelNegocioConGuiasQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) {
    return NextResponse.json({ error: q.error.issues[0]?.message ?? "Filtro inválido" }, { status: 400 });
  }
  const { entityIds, ...filtro } = q.data;

  try {
    let solicitudes = entityIds?.length
      ? await SupportTicketsDB.listarDelNegocioPorGuias(tenantId, { entityType: filtro.entityType, entityIds })
      : await SupportTicketsDB.listarDelNegocio(tenantId, filtro);
    if (entityIds?.length && filtro.estado) solicitudes = solicitudes.filter((s) => s.estado === filtro.estado);
    const respuesta: ListarDelNegocioRespuesta = { solicitudes, porGuia: resumenPorGuia(solicitudes) };
    return NextResponse.json(respuesta);
  } catch (err) {
    logger.error("[solicitudes-correccion] GET falló", { error: String(err), tenantId });
    return NextResponse.json({ error: "No se pudieron leer las solicitudes" }, { status: 500 });
  }
}
