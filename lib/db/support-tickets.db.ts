import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma, SupportTicket } from "@/lib/generated/prisma/client";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { candadoDelNegocio } from "@/lib/db/candado";
import {
  EQUIPO_BULEJE,
  ESTADOS_CORRECCION_ABIERTOS,
  ESTADOS_GENERAL,
  ESTADOS_QUE_PIDEN_RESOLUCION,
  ENTITY_TYPES_CORRECCION,
  asuntoCorreccion,
  crearCorreccionSchema,
  esEstadoCorreccion,
  etiquetaEstado,
  leerDetalleCorreccion,
  puedePasar,
  type CambioResuelto,
  type EntityTypeCorreccion,
  type EstadoCorreccion,
  type EstadoSoporte,
  type EvidenciaCorreccionDTO,
  type FiltroPlataforma,
  type ListarDelNegocioQuery,
  type SolicitudCorreccionDTO,
  type SolicitudCorreccionPlataformaDTO,
} from "@/lib/soporte/correccion-guia";

/**
 * SupportTicketsDB
 *
 * Acceso canonico a `SupportTicket` (formulario de contacto + tickets
 * del admin). Audit project-wide 2026-05-19 — migracion de /api/contact.
 *
 * ADR-512 (23-10): solicitudes de corrección de una guía EMITIDA
 * (`kind = "correccion_guia"`) y la bandeja del superadmin. Los métodos
 * del negocio llevan `tenantId` 1º; los de plataforma (`listarPlataforma`,
 * `obtener`, `cambiarEstado`, `responder`, `cambiarPrioridad`) cruzan tiendas
 * a propósito: sólo los llama una ruta con sesión de superadmin.
 */

interface CreateData {
  tenantId: string;
  subject: string;
  message: string;
  status?: string;
  priority?: string;
  createdBy?: string | null;
}

/** Lo que arma la RUTA del panel: `cambios` ya con lo que DICE la guía (leído por el servidor). */
export interface CrearCorreccionData {
  entityType: EntityTypeCorreccion;
  entityId: string;
  guiaNumero: string;
  guiaFecha: string | null;
  cambios: CambioResuelto[];
  motivo: string;
  /** username de la sesión del panel. */
  createdBy: string;
  /** Fotos del Archivo YA validadas por la ruta (del negocio y visibles para quien pide). */
  documentoIds?: string[];
}

export type CrearCorreccionResultado =
  | { ok: true; solicitud: SolicitudCorreccionDTO }
  | { ok: false; error: "datos_invalidos" }
  | { ok: false; error: "ya_hay_una_abierta"; solicitudAbiertaId: string };

export type CambiarEstadoError =
  | "no_existe"
  | "estado_invalido"
  | "transicion_invalida"
  | "falta_resolucion"
  | "cambio_concurrente";

export type CambiarEstadoResultado =
  | { ok: true; ticket: SupportTicket }
  | { ok: false; error: CambiarEstadoError }
  | { ok: false; error: "ya_hay_una_abierta"; solicitudAbiertaId: string };

export interface TenantResumen {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string | null;
}

export type TicketPlataforma = SupportTicket & { tenant: TenantResumen | null };

const KIND_CORRECCION = "correccion_guia";
const TTL_LISTA_NEGOCIO = 30;
const DICE_MAX = 500;

const prefijoNegocio = (tenantId: string) => `support:${tenantId}:`;

/** «Abierta» al buscar otra para la misma guía («replied» = respondida por la ruta vieja). */
const ESTADOS_QUE_CUENTAN_ABIERTA: readonly string[] = [...ESTADOS_CORRECCION_ABIERTOS, "replied"];

/** Pone la guía en fila: lo toman crear y reabrir, así no quedan dos abiertas. */
const candadoDeLaGuia = (tx: Prisma.TransactionClient, tenantId: string, entityType: string, entityId: string) =>
  candadoDelNegocio(tx, tenantId, `correccion-guia:${entityType}:${entityId}`);

/** Id de otra solicitud abierta para esa guía del negocio (`salvo` = la que se reabre). */
async function otraAbierta(
  tx: Prisma.TransactionClient,
  tenantId: string,
  entityType: string,
  entityId: string,
  salvo?: string,
): Promise<string | null> {
  const abierta = await tx.supportTicket.findFirst({
    where: {
      tenantId,
      kind: KIND_CORRECCION,
      entityType,
      entityId,
      status: { in: [...ESTADOS_QUE_CUENTAN_ABIERTA] },
      ...(salvo ? { id: { not: salvo } } : {}),
    },
    select: { id: true },
  });
  return abierta?.id ?? null;
}

/** Estado guardado → estado de corrección. «replied» lo escribe la ruta vieja de responder (prod). */
function estadoCorreccionDe(status: string): EstadoCorreccion {
  if (esEstadoCorreccion(status)) return status;
  if (status === "replied") return "in_review";
  return "open";
}

function esEntityType(v: string | null): v is EntityTypeCorreccion {
  return v !== null && (ENTITY_TYPES_CORRECCION as readonly string[]).includes(v);
}

/** Fila → DTO del panel (JSON-safe: se puede cachear en Redis). */
export function aSolicitudDTO(t: SupportTicket): SolicitudCorreccionDTO {
  const detalle = leerDetalleCorreccion(t.detalle);
  const estado = estadoCorreccionDe(t.status);
  return {
    id: t.id,
    entityType: esEntityType(t.entityType) ? t.entityType : "loth_gtf",
    entityId: t.entityId ?? "",
    guiaNumero: detalle?.guiaNumero ?? "",
    guiaFecha: detalle?.guiaFecha ?? null,
    estado,
    estadoEtiqueta: etiquetaEstado(KIND_CORRECCION, estado),
    cambios: detalle?.cambios ?? [],
    documentoIds: detalle?.documentoIds ?? [],
    motivo: t.message,
    resolucion: t.resolucion,
    // El negocio no ve el usuario de entrada del superadmin (sólo su bandeja).
    resolvedBy: t.resolvedBy ? EQUIPO_BULEJE : null,
    resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function aSolicitudPlataformaDTO(t: TicketPlataforma): SolicitudCorreccionPlataformaDTO {
  return {
    ...aSolicitudDTO(t),
    resolvedBy: t.resolvedBy,
    tenantId: t.tenantId,
    tenantName: t.tenant?.name ?? t.tenantId,
    tenantSlug: t.tenant?.slug ?? "",
    priority: t.priority,
  };
}

async function tiendas(ids: readonly string[]): Promise<Map<string, TenantResumen>> {
  const unicos = [...new Set(ids)].filter(Boolean);
  if (unicos.length === 0) return new Map();
  const rows = await prisma.tenant.findMany({
    where: { id: { in: unicos } },
    select: { id: true, name: true, slug: true, ownerEmail: true },
  });
  return new Map(rows.map((t) => [t.id, t]));
}

function invalidarNegocio(tenantId: string): void {
  invalidateByPrefix(prefijoNegocio(tenantId));
}

export const SupportTicketsDB = {
  async create(data: CreateData) {
    const ticket = await prisma.supportTicket.create({
      data: {
        tenantId: data.tenantId,
        subject: data.subject,
        message: data.message,
        status: data.status ?? "open",
        priority: data.priority ?? "medium",
        createdBy: data.createdBy ?? undefined,
      },
    });
    invalidarNegocio(data.tenantId);
    return ticket;
  },

  // ── Panel del negocio (tenantId 1º) ────────────────────────────────────────

  /** Una sola solicitud abierta por guía: si ya hay una, devuelve su id. */
  async crearCorreccion(
    tenantId: string,
    data: CrearCorreccionData,
  ): Promise<CrearCorreccionResultado> {
    const check = crearCorreccionSchema.safeParse({
      entityType: data.entityType,
      entityId: data.entityId,
      cambios: data.cambios.map(({ donde, clave, correcto }) => ({ donde, clave, correcto })),
      motivo: data.motivo,
      ...(data.documentoIds?.length ? { documentoIds: data.documentoIds } : {}),
    });
    if (!tenantId || !check.success || !data.guiaNumero.trim())
      return { ok: false, error: "datos_invalidos" };
    const v = check.data;

    /* «Una abierta por guía» sin índice único (la columna es nullable y el
       estado cambia): leer → decidir → escribir con la guía en fila, así dos
       toques seguidos del botón no dejan dos solicitudes abiertas. */
    return prisma.$transaction(async (tx) => {
      await candadoDeLaGuia(tx, tenantId, v.entityType, v.entityId);
      const abierta = await otraAbierta(tx, tenantId, v.entityType, v.entityId);
      if (abierta) return { ok: false, error: "ya_hay_una_abierta", solicitudAbiertaId: abierta };

      // Whitelist explícita: nada del body pasa sin nombre a la base.
      const detalle: Prisma.InputJsonObject = {
        v: 1,
        guiaNumero: data.guiaNumero.trim(),
        guiaFecha: data.guiaFecha,
        cambios: data.cambios.map((c, i) => ({
          donde: v.cambios[i].donde,
          clave: v.cambios[i].clave,
          correcto: v.cambios[i].correcto,
          etiqueta: c.etiqueta,
          dice: c.dice === null ? null : c.dice.slice(0, DICE_MAX),
        })),
        ...(v.documentoIds?.length ? { documentoIds: [...new Set(v.documentoIds)] } : {}),
      };

      const ticket = await tx.supportTicket.create({
        data: {
          tenantId,
          kind: KIND_CORRECCION,
          entityType: v.entityType,
          entityId: v.entityId,
          subject: asuntoCorreccion(v.entityType, data.guiaNumero.trim()),
          message: v.motivo,
          detalle,
          status: "open",
          priority: "medium",
          createdBy: data.createdBy,
        },
      });
      invalidarNegocio(tenantId);
      return { ok: true, solicitud: aSolicitudDTO(ticket) } as const;
    });
  },

  async listarDelNegocio(
    tenantId: string,
    filtro: ListarDelNegocioQuery = {},
  ): Promise<SolicitudCorreccionDTO[]> {
    const key = `${prefijoNegocio(tenantId)}correcciones:${filtro.entityType ?? ""}:${filtro.entityId ?? ""}:${filtro.estado ?? ""}:${filtro.limite ?? 50}`;
    return getOrSet(key, TTL_LISTA_NEGOCIO, async () => {
      const rows = await prisma.supportTicket.findMany({
        where: {
          tenantId,
          kind: KIND_CORRECCION,
          ...(filtro.entityType ? { entityType: filtro.entityType } : {}),
          ...(filtro.entityId ? { entityId: filtro.entityId } : {}),
          ...(filtro.estado
            ? {
                status: {
                  in: filtro.estado === "in_review" ? ["in_review", "replied"] : [filtro.estado],
                },
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: filtro.limite ?? 50,
      });
      return rows.map(aSolicitudDTO);
    });
  },

  /**
   * Las solicitudes de VARIAS guías en una consulta (la lista de guías pide el
   * estado de todas sus filas de una vez). Sin `entityIds`, las últimas del tipo.
   */
  async listarDelNegocioPorGuias(
    tenantId: string,
    filtro: { entityType?: EntityTypeCorreccion; entityIds: readonly string[] },
  ): Promise<SolicitudCorreccionDTO[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = [...new Set(filtro.entityIds)].sort();
    if (ids.length === 0) return [];
    const huella = createHash("sha1").update(ids.join(",")).digest("hex").slice(0, 16);
    const key = `${prefijoNegocio(tenantId)}correcciones-guias:${filtro.entityType ?? ""}:${huella}`;
    return getOrSet(key, TTL_LISTA_NEGOCIO, async () => {
      const rows = await prisma.supportTicket.findMany({
        where: {
          tenantId,
          kind: KIND_CORRECCION,
          entityId: { in: ids },
          ...(filtro.entityType ? { entityType: filtro.entityType } : {}),
        },
        orderBy: { createdAt: "desc" },
        // Varias por guía como mucho (una abierta + las cerradas de antes).
        take: Math.min(1000, ids.length * 5),
      });
      return rows.map(aSolicitudDTO);
    });
  },

  async obtenerDelNegocio(tenantId: string, id: string): Promise<SolicitudCorreccionDTO | null> {
    const t = await prisma.supportTicket.findFirst({
      where: { id, tenantId, kind: KIND_CORRECCION },
    });
    return t ? aSolicitudDTO(t) : null;
  },

  // ── Plataforma (superadmin; cruza tiendas) ─────────────────────────────────

  /** Bandeja: tickets + de qué tienda vienen. Sin caché (el superadmin quiere lo fresco). */
  async listarPlataforma(filtro: FiltroPlataforma = {}): Promise<TicketPlataforma[]> {
    const tickets = await prisma.supportTicket.findMany({
      where: {
        ...(filtro.kind ? { kind: filtro.kind } : {}),
        ...(filtro.estado
          ? {
              status:
                filtro.kind === KIND_CORRECCION && filtro.estado === "in_review"
                  ? { in: ["in_review", "replied"] }
                  : filtro.estado,
            }
          : {}),
        ...(filtro.tenantId ? { tenantId: filtro.tenantId } : {}),
        ...(filtro.entityType ? { entityType: filtro.entityType } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: filtro.limite ?? 200,
    });
    const tenantIds = [...new Set(tickets.map((t) => t.tenantId))];
    const tenants: TenantResumen[] = tenantIds.length
      ? await prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true, slug: true, ownerEmail: true },
        })
      : [];
    const porId = new Map(tenants.map((t) => [t.id, t]));
    return tickets.map((t) => ({ ...t, tenant: porId.get(t.tenantId) ?? null }));
  },

  async listarCorreccionesPlataforma(
    filtro: Omit<FiltroPlataforma, "kind"> = {},
  ): Promise<SolicitudCorreccionPlataformaDTO[]> {
    const rows = await SupportTicketsDB.listarPlataforma({ ...filtro, kind: KIND_CORRECCION });
    return rows.map(aSolicitudPlataformaDTO);
  },

  /**
   * Bandeja de la campana del superadmin: las correcciones que esperan a
   * alguien (Pendiente / En revisión, y el «replied» del Prisma viejo).
   */
  async correccionesAbiertasPlataforma(
    tope = 40,
  ): Promise<{ count: number; filas: SolicitudCorreccionPlataformaDTO[] }> {
    const where = {
      kind: KIND_CORRECCION,
      status: { in: [...ESTADOS_CORRECCION_ABIERTOS, "replied"] },
    };
    const [count, tickets] = await Promise.all([
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.findMany({ where, orderBy: { createdAt: "asc" }, take: tope }),
    ]);
    const tenants = await tiendas(tickets.map((t) => t.tenantId));
    return {
      count,
      filas: tickets.map((t) =>
        aSolicitudPlataformaDTO({ ...t, tenant: tenants.get(t.tenantId) ?? null }),
      ),
    };
  },

  /** Nombre y dueño de una tienda (para el correo al superadmin). */
  async tiendaDe(tenantId: string): Promise<TenantResumen | null> {
    if (!tenantId) return null;
    return (await tiendas([tenantId])).get(tenantId) ?? null;
  },

  async obtener(id: string): Promise<SupportTicket | null> {
    return prisma.supportTicket.findUnique({ where: { id } });
  },

  /**
   * La evidencia de cada solicitud, para la bandeja: los `documentoIds` de su
   * `detalle` que siguen en el Archivo de SU negocio (cada id se busca con el
   * `tenantId` de la solicitud; uno borrado o de otra tienda no vuelve). Una
   * sola consulta para toda la página. Orden = el de `documentoIds`.
   */
  async evidenciaPlataforma(
    tickets: readonly Pick<SupportTicket, "id" | "tenantId" | "detalle">[],
  ): Promise<Map<string, EvidenciaCorreccionDTO[]>> {
    const pedidos = tickets
      .map((t) => ({ t, ids: leerDetalleCorreccion(t.detalle)?.documentoIds ?? [] }))
      .filter((p) => p.ids.length > 0);
    const out = new Map<string, EvidenciaCorreccionDTO[]>();
    if (pedidos.length === 0) return out;
    const porTienda = new Map<string, Set<string>>();
    for (const { t, ids } of pedidos) {
      const set = porTienda.get(t.tenantId) ?? new Set<string>();
      for (const id of ids) set.add(id);
      porTienda.set(t.tenantId, set);
    }
    const docs = await prisma.document.findMany({
      where: { deletedAt: null, OR: [...porTienda].map(([tenantId, ids]) => ({ tenantId, id: { in: [...ids] } })) },
      select: { id: true, tenantId: true, name: true, mimeType: true },
    });
    const porClave = new Map(docs.map((d) => [`${d.tenantId}:${d.id}`, d]));
    for (const { t, ids } of pedidos) {
      out.set(
        t.id,
        ids.flatMap((id) => {
          const d = porClave.get(`${t.tenantId}:${id}`);
          return d ? [{ docId: d.id, nombre: d.name, mime: d.mimeType || "application/octet-stream" }] : [];
        }),
      );
    }
    return out;
  },

  /**
   * Cambia el estado validando por clase de ticket:
   * - general: open | replied | closed (como siempre, sólo escribe `status`).
   * - correccion_guia: `TRANSICIONES_CORRECCION`; cerrar/rechazar exige
   *   `resolucion` y anota quién y cuándo; reabrir limpia la resolución y,
   *   como crear, pone la guía en fila y no deja dos abiertas
   *   (`ya_hay_una_abierta` con el id de la otra).
   * Escribe con `updateMany({ id, status: <el que leyó> })`: si otro lo cambió
   * entre medio, `cambio_concurrente` (nada se pisa).
   */
  async cambiarEstado(
    id: string,
    cambio: { estado: EstadoSoporte; resolucion?: string | null; por?: string | null },
  ): Promise<CambiarEstadoResultado> {
    const t = await prisma.supportTicket.findUnique({ where: { id } });
    if (!t) return { ok: false, error: "no_existe" };

    let data: Prisma.SupportTicketUpdateManyMutationInput;
    let reabre = false;
    if (t.kind === KIND_CORRECCION) {
      if (!esEstadoCorreccion(cambio.estado)) return { ok: false, error: "estado_invalido" };
      const actual = estadoCorreccionDe(t.status);
      if (actual === cambio.estado && t.status === cambio.estado) return { ok: true, ticket: t };
      if (actual !== cambio.estado && !puedePasar(actual, cambio.estado)) {
        return { ok: false, error: "transicion_invalida" };
      }
      const resolucion = (cambio.resolucion ?? "").trim();
      const cierra = ESTADOS_QUE_PIDEN_RESOLUCION.includes(cambio.estado);
      if (cierra && resolucion.length < 3) return { ok: false, error: "falta_resolucion" };
      reabre = !ESTADOS_CORRECCION_ABIERTOS.includes(actual) && ESTADOS_CORRECCION_ABIERTOS.includes(cambio.estado);
      data = cierra
        ? {
            status: cambio.estado,
            resolucion: resolucion.slice(0, 1000),
            resolvedBy: cambio.por ?? null,
            resolvedAt: new Date(),
          }
        : { status: cambio.estado, resolucion: null, resolvedBy: null, resolvedAt: null };
    } else {
      if (!(ESTADOS_GENERAL as readonly string[]).includes(cambio.estado))
        return { ok: false, error: "estado_invalido" };
      data = { status: cambio.estado };
    }

    const escribir = async (db: Prisma.TransactionClient): Promise<CambiarEstadoResultado> => {
      const r = await db.supportTicket.updateMany({ where: { id, status: t.status }, data });
      if (r.count === 0) return { ok: false, error: "cambio_concurrente" };
      const fresco = await db.supportTicket.findUnique({ where: { id } });
      return fresco ? { ok: true, ticket: fresco } : { ok: false, error: "no_existe" };
    };

    const { entityType, entityId } = t;
    const resultado =
      reabre && entityType && entityId
        ? await prisma.$transaction(async (tx): Promise<CambiarEstadoResultado> => {
            await candadoDeLaGuia(tx, t.tenantId, entityType, entityId);
            const otra = await otraAbierta(tx, t.tenantId, entityType, entityId, id);
            if (otra) return { ok: false, error: "ya_hay_una_abierta", solicitudAbiertaId: otra };
            return escribir(tx);
          })
        : await escribir(prisma);
    if (resultado.ok) invalidarNegocio(t.tenantId);
    return resultado;
  },

  /**
   * Respuesta del superadmin. General → `replied` (como siempre). Corrección
   * → una pendiente pasa a «En revisión»; si ya estaba más adelante, no cambia.
   */
  async responder(
    id: string,
    body: string,
  ): Promise<{ id: string; tenantId: string; subject: string } | null> {
    const t = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, tenantId: true, subject: true, kind: true, status: true },
    });
    if (!t) return null;
    const status =
      t.kind === KIND_CORRECCION ? (t.status === "open" ? "in_review" : t.status) : "replied";
    await prisma.supportTicket.update({
      where: { id },
      data: { reply: body, repliedAt: new Date(), status },
    });
    invalidarNegocio(t.tenantId);
    return { id: t.id, tenantId: t.tenantId, subject: t.subject };
  },

  async cambiarPrioridad(
    id: string,
    priority: "low" | "medium" | "high",
  ): Promise<{ id: string; tenantId: string } | null> {
    const t = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });
    if (!t) return null;
    await prisma.supportTicket.update({ where: { id }, data: { priority } });
    invalidarNegocio(t.tenantId);
    return t;
  },
};
