import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ClaveOcupadaError } from "@/lib/db/platform-settings.db";
import { ForestMedicionCargaDB } from "@/lib/db/forest-medicion-carga.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { CtpGuiaDocumentosDB } from "@/lib/db/ctp-guia-documentos.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { nuevaCargaSchema, rangoDeCodigos, type FalloCarga } from "@/lib/forestal/medicion-carga";
import { pasarFotosALaGuia } from "@/lib/forestal/medicion-carga-server";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { ROLES_MEDICION_CARGA, especializacionLoth, ocupado, validacion } from "./_comun";

/**
 * /api/admin/forestal/loth/medicion-carga — cargas medidas en el monte (16-10, F3).
 *
 * GET   → `{ cargas, recientes, planes, siguienteCorrelativo }`: las sin usar
 *       del tenant (la oficina las recoge), las últimas terminadas (el monte ve
 *       qué pasó con lo suyo), los permisos para elegir y el N° que sigue por
 *       permiso. `?solo=cargas` = sólo las dos listas (la oficina, que ya tiene
 *       planes y correlativo del despacho).
 * POST  `{ planId|null, desde, fotosEsperadas, nota?, filas[] }` → 201 `{ carga }`.
 *       Las filas pasan la misma regla que el alta a mano y el volumen lo
 *       calcula el servidor. El permiso tiene que ser de ESTE tenant.
 * PATCH `{ id, accion: "usada", gtfNumber }` (la guía tiene que existir en este
 *       tenant; sus fotos pasan a los papeles de la guía) o
 *       `{ id, accion: "descartar", motivo }`.
 *
 * 409 `ocupado` si otra PC está guardando en el mismo instante (la clave del
 * tenant está tomada más de 3 s): se reintenta, no se pisa.
 */

const idSchema = z.string().trim().min(1).max(64);

const patchSchema = z.discriminatedUnion("accion", [
  z.object({ id: idSchema, accion: z.literal("usada"), gtfNumber: z.string().trim().min(1, "Falta el N° de la guía").max(60) }),
  z.object({ id: idSchema, accion: z.literal("descartar"), motivo: z.string().trim().min(3, "Escribe por qué se descarta").max(200) }),
]);

const MENSAJE_FALLO: Record<FalloCarga, { status: number; message: string }> = {
  no_existe: { status: 404, message: "Esa carga ya no está: la descartaron o venció." },
  cerrada: { status: 409, message: "Esa carga ya se usó en una guía o se descartó." },
  tope_fotos: { status: 409, message: "La carga ya tiene todas sus fotos." },
  otra_guia: { status: 409, message: "Esa carga ya se usó en otra guía." },
};

export const GET = withApiHandler("forestal-loth-medicion-carga-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES_MEDICION_CARGA);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await especializacionLoth(auth.tenantId);
  if (guard) return guard;
  try {
    if (req.nextUrl.searchParams.get("solo") === "cargas") {
      return NextResponse.json(await ForestMedicionCargaDB.lista(auth.tenantId));
    }
    const [lista, planes, siguienteCorrelativo] = await Promise.all([
      ForestMedicionCargaDB.lista(auth.tenantId),
      ForestPlanDB.listPlans(auth.tenantId),
      ForestLothDB.siguientesCorrelativos(auth.tenantId),
    ]);
    return NextResponse.json({
      ...lista,
      planes: planes.map((p) => ({
        id: p.id,
        planType: p.planType,
        planNumber: p.planNumber,
        tituloHabilitante: p.tituloHabilitante,
        titularName: p.titularName,
        isActive: p.isActive,
      })),
      siguienteCorrelativo,
    });
  } catch (err) {
    logger.error("[loth.medicion-carga.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-loth-medicion-carga-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES_MEDICION_CARGA);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await especializacionLoth(auth.tenantId);
  if (guard) return guard;

  const parsed = nuevaCargaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validacion(parsed.error.issues);
  const user = auth.username || "unknown";
  try {
    /* El permiso es de ESTE tenant o no va: un id ajeno se contesta como inexistente. */
    if (parsed.data.planId && !(await ForestPlanDB.getPlan(auth.tenantId, parsed.data.planId))) {
      return NextResponse.json({ error: "plan_no_existe", message: "Ese permiso ya no está: elige otro." }, { status: 404 });
    }
    const r = await ForestMedicionCargaDB.crear(auth.tenantId, parsed.data, user);
    if (!r.ok) {
      if ("fila" in r) return NextResponse.json({ error: "fila_invalida", message: r.mensaje, fila: r.fila }, { status: 422 });
      return NextResponse.json(
        { error: "tope", message: "Hay demasiadas cargas sin usar: usa o descarta las viejas antes de guardar otra." },
        { status: 409 },
      );
    }
    const c = r.carga;
    auditCtp({
      tenantId: auth.tenantId,
      action: "loth_medicion_carga_guardar",
      entity: "ForestMedicionCarga",
      entityId: c.id,
      detail: `Carga medida en el monte: ${c.trozas} trozas (N° ${rangoDeCodigos(c.filas)}), ${c.volumenM3} m³${c.planId ? "" : ", sin permiso"}`,
      user,
    });
    return NextResponse.json({ carga: c }, { status: 201 });
  } catch (err) {
    if (err instanceof ClaveOcupadaError) return ocupado();
    logger.error("[loth.medicion-carga.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PATCH = withApiHandler("forestal-loth-medicion-carga-patch", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES_MEDICION_CARGA);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await especializacionLoth(auth.tenantId);
  if (guard) return guard;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validacion(parsed.error.issues);
  const b = parsed.data;
  const user = auth.username || "unknown";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  try {
    if (b.accion === "usada") {
      /* Marcar usada es parte de registrar la guía, y eso es de admin/dueño
         (el almacenero recibe 403 en el despacho): el almacenero sólo mide y
         descarta. Desde el 16-10 el registro las marca solo (`cargas` del POST
         del despacho); esto queda para arreglar a mano una que quedó suelta. */
      const rol = soloAdminODueno(auth.role, "marcar una carga como usada en una guía");
      if (rol) return rol;
      /* La guía tiene que existir en ESTE tenant: no se marca usada con un N° inventado. */
      const guia = await CtpGuiaDocumentosDB.datosDeGuia(auth.tenantId, b.gtfNumber);
      if (!guia) return NextResponse.json({ error: "guia_no_existe", message: "No hay una guía con ese número." }, { status: 404 });
      const r = await ForestMedicionCargaDB.accion(auth.tenantId, b.id, { accion: "usada", gtfNumber: guia.gtfNumber }, user);
      if (!r.ok) {
        const f = MENSAJE_FALLO[r.motivo];
        return NextResponse.json({ error: r.motivo, message: f.message }, { status: f.status });
      }
      /* Las fotos pasan a los papeles de la guía, también si ya estaba marcada
         con esta guía: `pasarFotosALaGuia` salta las que ya están. Nunca tira. */
      const fotos = await pasarFotosALaGuia(auth.tenantId, r.carga, guia, user, ip);
      if (r.cambio) {
        auditCtp({
          tenantId: auth.tenantId,
          action: "loth_medicion_carga_usar",
          entity: "ForestMedicionCarga",
          entityId: r.carga.id,
          detail: `Carga medida usada en la guía ${guia.gtfNumber}: ${r.carga.trozas} trozas (N° ${rangoDeCodigos(r.carga.filas)})`,
          user,
        });
      }
      return NextResponse.json({ carga: r.carga, fotos });
    }
    const r = await ForestMedicionCargaDB.accion(auth.tenantId, b.id, { accion: "descartar", motivo: b.motivo }, user);
    if (!r.ok) {
      const f = MENSAJE_FALLO[r.motivo];
      return NextResponse.json({ error: r.motivo, message: f.message }, { status: f.status });
    }
    auditCtp({
      tenantId: auth.tenantId,
      action: "loth_medicion_carga_descartar",
      entity: "ForestMedicionCarga",
      entityId: r.carga.id,
      detail: `Carga medida descartada (${r.carga.trozas} trozas, N° ${rangoDeCodigos(r.carga.filas)}): ${b.motivo}`,
      user,
    });
    return NextResponse.json({ carga: r.carga });
  } catch (err) {
    if (err instanceof ClaveOcupadaError) return ocupado();
    logger.error("[loth.medicion-carga.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
