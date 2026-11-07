import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logActivity } from "@/lib/activity-logger";
import { limaDateKey } from "@/lib/utils";
import { sumarDias } from "@/lib/admin/alquileres-calculo";
import { tagEntidad } from "@/lib/documentos/enlaces-entidad";
import { formatoCodigoDocumento } from "@/lib/documentos/codigo-documento";
import { CandadoDocumentosDB } from "@/lib/db/candado-documentos.db";
import type {
  CanalTramite,
  Dia,
  EntidadTramite,
  EstadoRequisito,
  EstadoTramite,
  RequisitoDto,
  RequisitosOps,
  TramiteDto,
} from "@/lib/admin/fichas-tramites-alquileres";

/**
 * TramitesDB — trámites de Administración (ADR-524): banco, SUNAT, SUNARP,
 * municipalidad, notaría, RENIEC. Cualquier negocio (no depende de la spec
 * forestal). Requisitos en su tabla: cada uno puede apuntar a un documento
 * del Drive (`documentId`), y el documento queda atado al trámite por el tag
 * de máquina `tramiteadm:<id>` (`lib/documentos/enlaces-entidad.ts`).
 *
 * `tenantId` SIEMPRE 1.º. Toda lectura/escritura lleva `tenantId` en el WHERE
 * (un id de otro negocio es un «no existe», nunca un `if` después).
 * Caché `tramites:<tenantId>:` (60 s); cada write invalida además las fuentes
 * de la agenda (los vencimientos de trámites salen de ahí).
 */

const TTL = 60;
const TOPE_LISTA = 500;
export const ESTADOS_TRAMITE_ABIERTOS: readonly EstadoTramite[] = ["preparando", "enviado", "observado"];

const prefijo = (tenantId: string) => `tramites:${tenantId}:`;

function exigirTenant(tenantId: string): void {
  if (!tenantId) throw new Error("tenantId is required");
}

type FilaTramite = Prisma.TramiteGetPayload<{ include: { requisitos: true } }>;

export interface FiltroTramites {
  estado?: EstadoTramite;
  entidad?: EntidadTramite;
  parteId?: string;
  alquilerId?: string;
  q?: string;
  /** Abiertos que vencen (o tienen próximo paso) en los próximos N días, vencidos incluidos. */
  vencen?: number;
}

/** Campos editables (null = vacío). */
export interface TramiteCampos {
  entidad: EntidadTramite;
  entidadNombre: string | null;
  asunto: string;
  parteId: string | null;
  personaNombre: string | null;
  alquilerId: string | null;
  estado: EstadoTramite;
  iniciadoEl: Dia | null;
  enviadoEl: Dia | null;
  venceEl: Dia | null;
  proximoPaso: string | null;
  proximoPasoEl: Dia | null;
  canal: CanalTramite | null;
  contacto: string | null;
  notas: string | null;
}

export interface RequisitoNuevo {
  nombre: string;
  estado?: EstadoRequisito;
  documentId?: string | null;
  nota?: string | null;
}

export type TramiteCrear = Partial<TramiteCampos> &
  Pick<TramiteCampos, "entidad" | "asunto"> & { requisitos?: RequisitoNuevo[] };

/** Parcial: ausente = no se toca; `null` = se borra. */
export type TramitePatch = { [K in keyof TramiteCampos]?: TramiteCampos[K] };

export type ResultadoTramite =
  | { ok: true; tramite: TramiteDto }
  | { ok: false; error: "not_found"; message: string };

/** Algo que no es de este negocio (o no existe) dentro de la transacción. */
class NoEncontrado extends Error {
  constructor(public readonly mensaje: string) {
    super("not_found");
  }
}

const CAMPOS_DIA = ["iniciadoEl", "enviadoEl", "venceEl", "proximoPasoEl"] as const;

const aFecha = (d: Dia) => new Date(`${d}T00:00:00Z`);
const deFecha = (d: Date | null): Dia | null => (d ? d.toISOString().slice(0, 10) : null);

/** Lo que vino del patch, listo para Prisma (fechas «AAAA-MM-DD» → Date UTC). */
function datosDe(patch: TramitePatch): Prisma.TramiteUncheckedUpdateInput {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    data[k] = (CAMPOS_DIA as readonly string[]).includes(k) && typeof v === "string" ? aFecha(v) : v;
  }
  return data as Prisma.TramiteUncheckedUpdateInput;
}

function aRequisito(r: FilaTramite["requisitos"][number], nombres: Map<string, string>): RequisitoDto {
  return {
    id: r.id,
    orden: r.orden,
    nombre: r.nombre,
    estado: r.estado as EstadoRequisito,
    documentId: r.documentId,
    documentoNombre: r.documentId ? (nombres.get(r.documentId) ?? null) : null,
    nota: r.nota,
  };
}

/** Las filas → DTO con nombres de ficha y documentos (2 consultas para toda la lista). */
async function aDtos(tenantId: string, filas: FilaTramite[]): Promise<TramiteDto[]> {
  if (filas.length === 0) return [];
  const parteIds = [...new Set(filas.map((f) => f.parteId).filter((x): x is string => !!x))];
  const docIds = [...new Set(filas.flatMap((f) => f.requisitos.map((r) => r.documentId)).filter((x): x is string => !!x))];
  const tags = filas.map((f) => tagEntidad("tramite_adm", f.id));
  const [partes, docs] = await Promise.all([
    parteIds.length
      ? prisma.forestParty.findMany({ where: { tenantId, id: { in: parteIds } }, select: { id: true, nombre: true } })
      : Promise.resolve([]),
    prisma.document.findMany({
      where: { tenantId, deletedAt: null, OR: [{ tags: { hasSome: tags } }, ...(docIds.length ? [{ id: { in: docIds } }] : [])] },
      select: { id: true, name: true, codigo: true, tags: true },
      orderBy: { uploadedAt: "asc" },
      take: 2000,
    }),
  ]);
  const nombreParte = new Map(partes.map((p) => [p.id, p.nombre]));
  const nombreDoc = new Map(docs.map((d) => [d.id, d.name]));
  return filas.map((f) => {
    const tag = tagEntidad("tramite_adm", f.id);
    const requisitos = [...f.requisitos]
      .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id))
      .map((r) => aRequisito(r, nombreDoc));
    return {
      id: f.id,
      entidad: f.entidad as EntidadTramite,
      entidadNombre: f.entidadNombre,
      asunto: f.asunto,
      parteId: f.parteId,
      parteNombre: f.parteId ? (nombreParte.get(f.parteId) ?? null) : null,
      personaNombre: f.personaNombre,
      alquilerId: f.alquilerId,
      estado: f.estado as EstadoTramite,
      iniciadoEl: deFecha(f.iniciadoEl),
      enviadoEl: deFecha(f.enviadoEl),
      venceEl: deFecha(f.venceEl),
      proximoPaso: f.proximoPaso,
      proximoPasoEl: deFecha(f.proximoPasoEl),
      canal: (f.canal as CanalTramite | null) ?? null,
      contacto: f.contacto,
      notas: f.notas,
      requisitos,
      conteo: {
        hay: requisitos.filter((r) => r.estado === "hay").length,
        falta: requisitos.filter((r) => r.estado === "falta").length,
        noAplica: requisitos.filter((r) => r.estado === "no_aplica").length,
      },
      documentos: docs
        .filter((d) => d.tags.includes(tag))
        .map((d) => ({ id: d.id, nombre: d.name, codigo: formatoCodigoDocumento(d.codigo) })),
      creadoPor: f.creadoPor,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    };
  });
}

/** Resumen legible de lo que cambió, para la auditoría («estado: preparando → enviado»). */
function cambios(antes: Record<string, unknown>, patch: TramitePatch): string {
  const partes: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const previo = antes[k] instanceof Date ? deFecha(antes[k] as Date) : antes[k];
    if ((previo ?? null) === (v ?? null)) continue;
    partes.push(`${k}: ${previo ?? "—"} → ${v ?? "—"}`);
  }
  return partes.join("; ");
}

/**
 * Lo que se escribe al cambiar un requisito (R7). Sin `estado` explícito, el
 * documento decide: enlazar uno = «hay»; quitarlo (`documentId: null`) =
 * «falta» (si no, el requisito seguía en «hay» sin papel).
 */
export function datosCambioRequisito(
  c: NonNullable<RequisitosOps["cambiar"]>[number],
): Prisma.TramiteRequisitoUncheckedUpdateManyInput {
  const data: Prisma.TramiteRequisitoUncheckedUpdateManyInput = {};
  if (c.estado !== undefined) data.estado = c.estado;
  if (c.documentId !== undefined) data.documentId = c.documentId;
  if (c.nota !== undefined) data.nota = c.nota;
  if (c.nombre !== undefined) data.nombre = c.nombre;
  if (c.orden !== undefined) data.orden = c.orden;
  if (c.estado === undefined && c.documentId) data.estado = "hay";
  if (c.estado === undefined && c.documentId === null) data.estado = "falta";
  return data;
}

export const TramitesDB = {
  async listar(tenantId: string, filtro: FiltroTramites = {}): Promise<TramiteDto[]> {
    exigirTenant(tenantId);
    const hoy = limaDateKey();
    const clave = `${prefijo(tenantId)}lista:${hoy}:${JSON.stringify(filtro)}`;
    return getOrSet(clave, TTL, async () => {
      const and: Prisma.TramiteWhereInput[] = [];
      const q = filtro.q?.trim();
      if (q) {
        const partes = await prisma.forestParty.findMany({
          where: { tenantId, nombre: { contains: q, mode: "insensitive" } },
          select: { id: true },
          take: 50,
        });
        const like = { contains: q, mode: "insensitive" as const };
        and.push({
          OR: [
            { asunto: like },
            { entidadNombre: like },
            { personaNombre: like },
            { contacto: like },
            { notas: like },
            ...(partes.length ? [{ parteId: { in: partes.map((p) => p.id) } }] : []),
          ],
        });
      }
      if (filtro.vencen !== undefined) {
        const tope = aFecha(sumarDias(hoy, filtro.vencen));
        and.push({ estado: { in: [...ESTADOS_TRAMITE_ABIERTOS] } });
        and.push({ OR: [{ venceEl: { lte: tope } }, { proximoPasoEl: { lte: tope } }] });
      }
      const filas = await prisma.tramite.findMany({
        where: {
          tenantId,
          deletedAt: null,
          ...(filtro.estado ? { estado: filtro.estado } : {}),
          ...(filtro.entidad ? { entidad: filtro.entidad } : {}),
          ...(filtro.parteId ? { parteId: filtro.parteId } : {}),
          ...(filtro.alquilerId ? { alquilerId: filtro.alquilerId } : {}),
          ...(and.length ? { AND: and } : {}),
        },
        include: { requisitos: true },
        orderBy: [{ venceEl: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
        take: TOPE_LISTA,
      });
      return aDtos(tenantId, filas);
    });
  },

  async obtener(tenantId: string, id: string): Promise<TramiteDto | null> {
    exigirTenant(tenantId);
    // getOrSet no guarda null: se envuelve.
    const r = await getOrSet(`${prefijo(tenantId)}uno:${id}`, TTL, async () => {
      const fila = await prisma.tramite.findFirst({ where: { tenantId, id, deletedAt: null }, include: { requisitos: true } });
      return { v: fila ? ((await aDtos(tenantId, [fila]))[0] ?? null) : null };
    });
    return r.v;
  },

  /**
   * La ficha, el alquiler y los documentos que se nombran tienen que ser de
   * ESTE negocio: si no, `not_found` con el motivo (el id ajeno no se escribe).
   */
  async verificarReferencias(
    tenantId: string,
    refs: { parteId?: string | null; alquilerId?: string | null; documentIds?: (string | null | undefined)[] },
  ): Promise<string | null> {
    exigirTenant(tenantId);
    if (refs.parteId) {
      const p = await prisma.forestParty.findFirst({ where: { tenantId, id: refs.parteId }, select: { id: true } });
      if (!p) return `La ficha ${refs.parteId} no está en el directorio de este negocio.`;
    }
    if (refs.alquilerId) {
      const a = await prisma.alquiler.findFirst({ where: { tenantId, id: refs.alquilerId, deletedAt: null }, select: { id: true } });
      if (!a) return `El alquiler ${refs.alquilerId} no existe en este negocio.`;
    }
    const docIds = [...new Set((refs.documentIds ?? []).filter((x): x is string => !!x))];
    if (docIds.length) {
      const docs = await prisma.document.findMany({ where: { tenantId, id: { in: docIds }, deletedAt: null }, select: { id: true } });
      const hay = new Set(docs.map((d) => d.id));
      const falta = docIds.find((d) => !hay.has(d));
      if (falta) return `El documento ${falta} no está en el Drive de este negocio.`;
    }
    return null;
  },

  async crear(tenantId: string, input: TramiteCrear, user: string): Promise<ResultadoTramite> {
    exigirTenant(tenantId);
    const { requisitos = [], ...campos } = input;
    const motivo = await this.verificarReferencias(tenantId, {
      parteId: campos.parteId,
      alquilerId: campos.alquilerId,
      documentIds: requisitos.map((r) => r.documentId),
    });
    if (motivo) return { ok: false, error: "not_found", message: motivo };

    const fila = await prisma.tramite.create({
      data: {
        ...(datosDe(campos) as Prisma.TramiteUncheckedCreateInput),
        entidad: campos.entidad,
        asunto: campos.asunto,
        tenantId,
        creadoPor: user,
        requisitos: {
          create: requisitos.map((r, i) => ({
            tenantId,
            orden: i,
            nombre: r.nombre,
            estado: r.estado ?? (r.documentId ? "hay" : "falta"),
            documentId: r.documentId ?? null,
            nota: r.nota ?? null,
          })),
        },
      },
      select: { id: true },
    });
    await this.atarDocumentos(tenantId, fila.id, requisitos.map((r) => r.documentId));
    await logActivity(
      "tramite_crear",
      "tramite",
      `Abrió el trámite «${campos.asunto}» (${campos.entidad}) con ${requisitos.length} requisito(s)`,
      fila.id,
      user,
      undefined,
      tenantId,
    );
    this.olvidar(tenantId);
    const tramite = await this.obtener(tenantId, fila.id);
    return tramite ? { ok: true, tramite } : { ok: false, error: "not_found", message: "El trámite no se pudo leer." };
  },

  async actualizar(tenantId: string, id: string, patch: TramitePatch, user: string): Promise<ResultadoTramite> {
    exigirTenant(tenantId);
    const antes = await prisma.tramite.findFirst({ where: { tenantId, id, deletedAt: null } });
    if (!antes) return { ok: false, error: "not_found", message: "Ese trámite no existe en este negocio." };
    const motivo = await this.verificarReferencias(tenantId, { parteId: patch.parteId, alquilerId: patch.alquilerId });
    if (motivo) return { ok: false, error: "not_found", message: motivo };

    const detalle = cambios(antes as unknown as Record<string, unknown>, patch);
    if (detalle) {
      const r = await prisma.tramite.updateMany({ where: { tenantId, id, deletedAt: null }, data: datosDe(patch) });
      if (r.count === 0) return { ok: false, error: "not_found", message: "Ese trámite no existe en este negocio." };
      await logActivity("tramite_editar", "tramite", `Editó el trámite «${antes.asunto}»: ${detalle}`, id, user, undefined, tenantId);
      this.olvidar(tenantId);
    }
    const tramite = await this.obtener(tenantId, id);
    return tramite ? { ok: true, tramite } : { ok: false, error: "not_found", message: "Ese trámite no existe en este negocio." };
  },

  /**
   * Agregar / cambiar / quitar requisitos en UNA transacción, con el trámite
   * bloqueado (`FOR UPDATE`): dos pestañas que agregan a la vez no se pisan
   * el orden. Un requisito de otro trámite (u otro negocio) = `not_found` y
   * no se escribe nada.
   */
  async requisitos(tenantId: string, id: string, ops: RequisitosOps, user: string): Promise<ResultadoTramite> {
    exigirTenant(tenantId);
    const docs = [...(ops.agregar ?? []).map((a) => a.documentId), ...(ops.cambiar ?? []).map((c) => c.documentId)];
    const motivo = await this.verificarReferencias(tenantId, { documentIds: docs });
    if (motivo) return { ok: false, error: "not_found", message: motivo };

    let asunto = "";
    try {
      asunto = await prisma.$transaction(async (tx) => {
        const bloqueo = await tx.$queryRaw<{ id: string; asunto: string }[]>`
          SELECT id, asunto FROM "Tramite"
           WHERE id = ${id} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
           FOR UPDATE`;
        const t = bloqueo[0];
        if (!t) throw new NoEncontrado("Ese trámite no existe en este negocio.");

        if (ops.quitar?.length) {
          await tx.tramiteRequisito.deleteMany({ where: { tenantId, tramiteId: id, id: { in: ops.quitar } } });
        }
        for (const c of ops.cambiar ?? []) {
          const data = datosCambioRequisito(c);
          const r = await tx.tramiteRequisito.updateMany({ where: { tenantId, tramiteId: id, id: c.id }, data });
          if (r.count === 0) throw new NoEncontrado(`El requisito ${c.id} no es de este trámite.`);
        }
        if (ops.agregar?.length) {
          const max = await tx.tramiteRequisito.aggregate({ where: { tenantId, tramiteId: id }, _max: { orden: true } });
          const base = (max._max.orden ?? -1) + 1;
          await tx.tramiteRequisito.createMany({
            data: ops.agregar.map((a, i) => ({
              tenantId,
              tramiteId: id,
              orden: base + i,
              nombre: a.nombre,
              estado: a.estado ?? (a.documentId ? "hay" : "falta"),
              documentId: a.documentId ?? null,
              nota: a.nota ?? null,
            })),
          });
        }
        await tx.tramite.updateMany({ where: { tenantId, id }, data: { updatedAt: new Date() } });
        return t.asunto;
      });
    } catch (err) {
      if (err instanceof NoEncontrado) return { ok: false, error: "not_found", message: err.mensaje };
      throw err;
    }

    await this.atarDocumentos(tenantId, id, docs);
    const resumen = [
      ops.agregar?.length ? `agregó ${ops.agregar.length}` : null,
      ops.cambiar?.length ? `cambió ${ops.cambiar.length}` : null,
      ops.quitar?.length ? `quitó ${ops.quitar.length}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    await logActivity("tramite_requisitos", "tramite", `Requisitos de «${asunto}»: ${resumen || "sin cambios"}`, id, user, undefined, tenantId);
    this.olvidar(tenantId);
    const tramite = await this.obtener(tenantId, id);
    return tramite ? { ok: true, tramite } : { ok: false, error: "not_found", message: "Ese trámite no existe en este negocio." };
  },

  /** Borrado suave: el trámite sale de las listas y de la agenda; los requisitos quedan para la auditoría. */
  async borrar(tenantId: string, id: string, user: string): Promise<boolean> {
    exigirTenant(tenantId);
    const antes = await prisma.tramite.findFirst({ where: { tenantId, id, deletedAt: null }, select: { asunto: true } });
    if (!antes) return false;
    const r = await prisma.tramite.updateMany({ where: { tenantId, id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (r.count === 0) return false;
    await logActivity("tramite_borrar", "tramite", `Borró el trámite «${antes.asunto}»`, id, user, undefined, tenantId);
    this.olvidar(tenantId);
    return true;
  },

  /** ¿Qué requisitos usan este documento? (aviso antes de mandarlo a la papelera). */
  async usosDeDocumento(
    tenantId: string,
    documentId: string,
  ): Promise<{ tramiteId: string; asunto: string; requisitoId: string; requisito: string }[]> {
    exigirTenant(tenantId);
    const filas = await prisma.tramiteRequisito.findMany({
      where: { tenantId, documentId, tramite: { tenantId, deletedAt: null } },
      select: { id: true, nombre: true, tramite: { select: { id: true, asunto: true } } },
      take: 50,
    });
    return filas.map((f) => ({ tramiteId: f.tramite.id, asunto: f.tramite.asunto, requisitoId: f.id, requisito: f.nombre }));
  },

  /**
   * El documento enlazado a un requisito también queda atado al trámite (tag
   * de máquina) y, si no tenía roles, con el candado de dueños (S4/R5).
   */
  async atarDocumentos(tenantId: string, tramiteId: string, documentIds: (string | null | undefined)[]): Promise<void> {
    exigirTenant(tenantId);
    await CandadoDocumentosDB.atar(tenantId, documentIds, tagEntidad("tramite_adm", tramiteId));
  },

  /** Trámites + fuentes de la agenda (los vencimientos salen de ahí) + agenda. */
  olvidar(tenantId: string): void {
    exigirTenant(tenantId);
    invalidateByPrefix(prefijo(tenantId));
    invalidateByPrefix(`agenda-fuentes:${tenantId}:`);
    invalidateByPrefix(`agenda:${tenantId}:`);
  },
};
