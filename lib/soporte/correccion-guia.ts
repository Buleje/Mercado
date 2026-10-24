/**
 * Contrato «Pedir corrección» de una guía EMITIDA (ADR-512).
 *
 * Una guía con número no se edita: se anula con motivo y se emite otra. El
 * negocio PIDE la corrección desde el panel; el pedido entra a la bandeja de
 * soporte del superadmin (`SupportTicket` con `kind = "correccion_guia"`).
 *
 * Archivo compartido por cliente y servidor (sin `server-only`): esquemas Zod de
 * las rutas, tipos de entrada/salida, estados con sus etiquetas y transiciones.
 *
 * REGLA: «lo que DICE la guía hoy» (`dice`) lo llena SIEMPRE el servidor
 * leyendo la guía guardada. El navegador sólo manda dónde, qué clave y lo
 * correcto (`CambioPedido`); si manda `dice`, Zod lo descarta.
 */
import { z } from "zod";

// ── Rutas (fase 2 las implementa) ────────────────────────────────────────────

/** POST = pedir · GET = mis solicitudes (filtros `ListarDelNegocioQuery`). */
export const RUTA_SOLICITUDES_PANEL = "/api/admin/solicitudes-correccion";
/** PATCH del superadmin sobre una solicitud (`CambiarEstadoCorreccionBody`). */
export function rutaEstadoCorreccionPlataforma(id: string): string {
  return `/api/superadmin/support/${encodeURIComponent(id)}/correccion`;
}
/**
 * GET del superadmin: UN documento de evidencia de ESA solicitud (sólo los de
 * `detalle.documentoIds`), privado, para abrirlo con un `<a href>` en otra pestaña.
 */
export function rutaEvidenciaPlataforma(id: string, docId: string): string {
  return `/api/superadmin/support/${encodeURIComponent(id)}/evidencia/${encodeURIComponent(docId)}`;
}

/**
 * La clave de un renglón del detalle de una guía de salida del CTP: «Línea #N»,
 * con N = `lineNo` del despacho en el libro (`GuiaEmitida.lineNo`). El servidor
 * también acepta el id del despacho. Las trozas (Libro TH y las que salieron
 * sin aserrar del CTP) se nombran por su código —el impreso o el único del
 * libro— o por el id de la troza.
 */
export function claveLineaCtp(lineNo: number): string {
  return `Línea #${lineNo}`;
}

// ── Clases de ticket y guías que se pueden corregir ──────────────────────────

export const SOPORTE_KINDS = ["general", "correccion_guia"] as const;
export type SoporteKind = (typeof SOPORTE_KINDS)[number];

export const ENTITY_TYPES_CORRECCION = ["loth_gtf", "ctp_despacho"] as const;
export type EntityTypeCorreccion = (typeof ENTITY_TYPES_CORRECCION)[number];

export const ENTITY_TYPE_ETIQUETA: Record<EntityTypeCorreccion, string> = {
  loth_gtf: "Guía del Libro TH",
  ctp_despacho: "Guía de salida del CTP",
};

// ── Estados (TEXTO en la base, nunca enum: ADR-512) ──────────────────────────

/** Todo lo que puede haber en `SupportTicket.status`. */
export const ESTADOS_SOPORTE = ["open", "replied", "in_review", "closed", "rejected"] as const;
export type EstadoSoporte = (typeof ESTADOS_SOPORTE)[number];

/** Ticket general (contacto): el flujo de siempre. */
export const ESTADOS_GENERAL = ["open", "replied", "closed"] as const satisfies readonly EstadoSoporte[];
export type EstadoGeneral = (typeof ESTADOS_GENERAL)[number];

/** Solicitud de corrección de guía. */
export const ESTADOS_CORRECCION = ["open", "in_review", "closed", "rejected"] as const satisfies readonly EstadoSoporte[];
export type EstadoCorreccion = (typeof ESTADOS_CORRECCION)[number];

export const ESTADO_CORRECCION_ETIQUETA: Record<EstadoCorreccion, string> = {
  open: "Pendiente",
  in_review: "En revisión",
  closed: "Resuelta",
  rejected: "Rechazada",
};

export const ESTADO_GENERAL_ETIQUETA: Record<EstadoGeneral, string> = {
  open: "Abierto",
  replied: "Respondido",
  closed: "Cerrado",
};

/**
 * Quién resolvió, tal como lo ve el NEGOCIO (panel, avisos, su registro de
 * actividad). El usuario real del superadmin es su usuario de ENTRADA: sólo va
 * en la bandeja del superadmin y en su registro (revisión de seguridad 23-10).
 */
export { EQUIPO_BULEJE } from "@/lib/superadmin/actor-visible";

/** Abierta = todavía espera que alguien haga algo (cuenta para «ya hay una»). */
export const ESTADOS_CORRECCION_ABIERTOS: readonly EstadoCorreccion[] = ["open", "in_review"];

/**
 * Transiciones válidas de una corrección. Resuelta/Rechazada se pueden reabrir
 * a «En revisión» (error del que la cerró), nunca saltar directo entre ellas.
 */
export const TRANSICIONES_CORRECCION: Record<EstadoCorreccion, readonly EstadoCorreccion[]> = {
  open: ["in_review", "closed", "rejected"],
  in_review: ["open", "closed", "rejected"],
  closed: ["in_review"],
  rejected: ["in_review"],
};

/** Cerrar o rechazar exige decir qué se hizo / por qué (lo lee el negocio). */
export const ESTADOS_QUE_PIDEN_RESOLUCION: readonly EstadoCorreccion[] = ["closed", "rejected"];

export function esEstadoCorreccion(v: string): v is EstadoCorreccion {
  return (ESTADOS_CORRECCION as readonly string[]).includes(v);
}

export function puedePasar(desde: string, hacia: EstadoCorreccion): boolean {
  if (!esEstadoCorreccion(desde)) return false;
  return TRANSICIONES_CORRECCION[desde].includes(hacia);
}

/** Etiqueta en español para cualquier estado guardado (desconocido → tal cual). */
export function etiquetaEstado(kind: string, status: string): string {
  if (kind === "correccion_guia" && esEstadoCorreccion(status)) return ESTADO_CORRECCION_ETIQUETA[status];
  if ((ESTADOS_GENERAL as readonly string[]).includes(status)) {
    return ESTADO_GENERAL_ETIQUETA[status as EstadoGeneral];
  }
  if (esEstadoCorreccion(status)) return ESTADO_CORRECCION_ETIQUETA[status];
  return status;
}

// ── Entrada del navegador ────────────────────────────────────────────────────

/** Un cambio pedido. SIN `dice`: eso lo lee el servidor de la guía. */
export const cambioSchema = z.object({
  /** casillero = celda del formato SERFOR (2)–(38) · item = fila de trozas/productos. */
  donde: z.enum(["casillero", "item"]),
  /** Número de casillero («12») o identificador de la fila (código de troza). */
  clave: z.string().min(1).max(40),
  correcto: z.string().trim().min(1).max(300),
});
export type CambioPedido = z.infer<typeof cambioSchema>;

export const crearCorreccionSchema = z.object({
  entityType: z.enum(ENTITY_TYPES_CORRECCION),
  entityId: z.string().trim().min(1).max(64),
  cambios: z
    .array(cambioSchema)
    .min(1)
    .max(20)
    .superRefine((cambios, ctx) => {
      const vistos = new Set<string>();
      cambios.forEach((c, i) => {
        const k = `${c.donde}:${c.clave}`;
        if (vistos.has(k)) {
          ctx.addIssue({ code: "custom", path: [i, "clave"], message: "Ese casillero o fila ya está en la lista" });
        }
        vistos.add(k);
      });
    }),
  motivo: z.string().trim().min(5).max(1000),
  /**
   * Fotos de evidencia YA subidas al Archivo con la etiqueta de la guía
   * (`tagGtf`, ADR-502): sólo sus ids. El servidor comprueba que sean del
   * negocio y que quien pide las vea; la foto nunca viaja en este body.
   */
  documentoIds: z.array(z.string().trim().min(1).max(64)).max(10).optional(),
});
/** Body del POST `RUTA_SOLICITUDES_PANEL`. */
export type CrearCorreccionBody = z.infer<typeof crearCorreccionSchema>;

/** Query del GET `RUTA_SOLICITUDES_PANEL` (todo opcional). */
export const listarDelNegocioQuerySchema = z.object({
  entityType: z.enum(ENTITY_TYPES_CORRECCION).optional(),
  entityId: z.string().trim().min(1).max(64).optional(),
  estado: z.enum(ESTADOS_CORRECCION).optional(),
  limite: z.coerce.number().int().min(1).max(200).optional(),
});
export type ListarDelNegocioQuery = z.infer<typeof listarDelNegocioQuerySchema>;

/** Tope de guías por pedido de `entityIds` (una página de la lista). */
export const MAX_GUIAS_POR_CONSULTA = 200;

/**
 * Query completa del GET (fase 2): lo de `listarDelNegocioQuerySchema` más
 * `entityIds` = ids de guía separados por coma. Con eso la lista pide en UNA
 * llamada el estado de todas sus filas y lee `porGuia[entityId]`.
 */
export const listarDelNegocioConGuiasQuerySchema = listarDelNegocioQuerySchema.extend({
  entityIds: z
    .string()
    .max(MAX_GUIAS_POR_CONSULTA * 66)
    .optional()
    .transform((v) => (v ? [...new Set(v.split(",").map((x) => x.trim()).filter(Boolean))] : undefined))
    .refine((v) => !v || (v.length <= MAX_GUIAS_POR_CONSULTA && v.every((x) => x.length <= 64)), {
      message: `Hasta ${MAX_GUIAS_POR_CONSULTA} guías por consulta`,
    }),
});
export type ListarDelNegocioConGuiasQuery = z.infer<typeof listarDelNegocioConGuiasQuerySchema>;

// ── Entrada del superadmin ───────────────────────────────────────────────────

/** Filtros de la bandeja del superadmin (query string). */
export const filtroPlataformaSchema = z.object({
  kind: z.enum(SOPORTE_KINDS).optional(),
  estado: z.enum(ESTADOS_SOPORTE).optional(),
  tenantId: z.string().trim().min(1).max(64).optional(),
  entityType: z.enum(ENTITY_TYPES_CORRECCION).optional(),
  limite: z.coerce.number().int().min(1).max(500).optional(),
});
export type FiltroPlataforma = z.infer<typeof filtroPlataformaSchema>;

export const cambiarEstadoCorreccionSchema = z
  .object({
    estado: z.enum(ESTADOS_CORRECCION),
    resolucion: z.string().trim().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (ESTADOS_QUE_PIDEN_RESOLUCION.includes(v.estado) && (v.resolucion ?? "").length < 3) {
      ctx.addIssue({
        code: "custom",
        path: ["resolucion"],
        message: v.estado === "rejected" ? "Di por qué se rechaza" : "Di qué se hizo (p. ej. qué guía se emitió)",
      });
    }
  });
/** Body del PATCH `rutaEstadoCorreccionPlataforma(id)`. */
export type CambiarEstadoCorreccionBody = z.infer<typeof cambiarEstadoCorreccionSchema>;

// ── Lo que guarda y devuelve el servidor ─────────────────────────────────────

/**
 * Un cambio ya resuelto por el SERVIDOR: `dice` es lo que la guía guardada
 * tiene hoy en ese casillero/fila (null = vacío o no existe) y `etiqueta` el
 * nombre legible («(12) Placa del vehículo»). Nunca se arma con datos del body.
 */
export interface CambioResuelto extends CambioPedido {
  etiqueta: string | null;
  dice: string | null;
}

/** Forma de `SupportTicket.detalle` para `kind = "correccion_guia"`. */
export interface DetalleCorreccion {
  v: 1;
  guiaNumero: string;
  /** Fecha de emisión de la guía (YYYY-MM-DD) o null. */
  guiaFecha: string | null;
  cambios: CambioResuelto[];
  /** Fotos de evidencia del Archivo (ids de `Document` del negocio). */
  documentoIds?: string[];
}

const cambioResueltoSchema = cambioSchema.extend({
  etiqueta: z.string().nullable(),
  dice: z.string().nullable(),
});
export const detalleCorreccionSchema = z.object({
  v: z.literal(1),
  guiaNumero: z.string(),
  guiaFecha: z.string().nullable(),
  cambios: z.array(cambioResueltoSchema),
  documentoIds: z.array(z.string()).optional(),
});

/** Lee `detalle` tolerando basura (fila vieja o editada a mano → null). */
export function leerDetalleCorreccion(json: unknown): DetalleCorreccion | null {
  const r = detalleCorreccionSchema.safeParse(json);
  return r.success ? r.data : null;
}

/** Respuesta por fila (panel). Fechas en ISO. */
export interface SolicitudCorreccionDTO {
  id: string;
  entityType: EntityTypeCorreccion;
  entityId: string;
  guiaNumero: string;
  guiaFecha: string | null;
  estado: EstadoCorreccion;
  estadoEtiqueta: string;
  cambios: CambioResuelto[];
  /** Fotos de evidencia del Archivo (fase 2; el servidor siempre lo manda, vacío = sin fotos). */
  documentoIds?: string[];
  motivo: string;
  resolucion: string | null;
  /** Panel: `EQUIPO_BULEJE` si alguien la cerró (nunca el usuario del superadmin); bandeja: el usuario real. */
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Un documento de evidencia, para armar el enlace `rutaEvidenciaPlataforma(id, docId)`. */
export interface EvidenciaCorreccionDTO {
  docId: string;
  nombre: string;
  mime: string;
}

/** Fila de la bandeja del superadmin: la solicitud + de qué tienda viene. */
export interface SolicitudCorreccionPlataformaDTO extends SolicitudCorreccionDTO {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  priority: string;
  /**
   * Los documentos de `documentoIds` que siguen en el Archivo del negocio (los
   * borrados no vuelven). Lo manda `GET /api/superadmin/support`; vacío = sin fotos.
   */
  evidencia?: EvidenciaCorreccionDTO[];
}

/** POST `RUTA_SOLICITUDES_PANEL` → 201 | 409 (ya hay una abierta para esa guía). */
export type CrearCorreccionRespuesta =
  | { ok: true; solicitud: SolicitudCorreccionDTO }
  | {
      ok: false;
      /** Mensaje para mostrar tal cual. */
      error: string;
      /** Para decidir en la pantalla sin leer el texto (fase 2). */
      codigo?: ErrorCrearCorreccion;
      solicitudAbiertaId?: string;
      /** `casillero_desconocido` / `item_desconocido`: la clave que la guía no tiene. */
      clave?: string;
    };

/** Códigos de error del POST (fase 2). */
export type ErrorCrearCorreccion =
  | "validation_error"
  | "no_existe"
  | "no_emitida"
  | "ya_hay_una_abierta"
  | "casillero_desconocido"
  /** Una troza o renglón que la guía no lista (ni por código, ni por id, ni «Línea #N»). */
  | "item_desconocido"
  | "documento_ajeno";

/** GET `RUTA_SOLICITUDES_PANEL`. */
export interface ListarDelNegocioRespuesta {
  solicitudes: SolicitudCorreccionDTO[];
  /**
   * Por id de guía: la solicitud que la fila tiene que mostrar — la abierta si
   * hay una, si no la última. Una guía sin entrada no tiene ninguna.
   */
  porGuia?: Record<string, ResumenCorreccionGuia>;
}

/** Lo que una fila de la lista de guías necesita saber de su solicitud. */
export interface ResumenCorreccionGuia {
  id: string;
  estado: EstadoCorreccion;
  estadoEtiqueta: string;
  /** Pendiente o En revisión: no se puede pedir otra. */
  abierta: boolean;
  createdAt: string;
}

/** `porGuia` a partir de las solicitudes (vienen de la más nueva a la más vieja). */
export function resumenPorGuia(solicitudes: readonly SolicitudCorreccionDTO[]): Record<string, ResumenCorreccionGuia> {
  const out: Record<string, ResumenCorreccionGuia> = {};
  for (const s of solicitudes) {
    if (!s.entityId) continue;
    const abierta = ESTADOS_CORRECCION_ABIERTOS.includes(s.estado);
    const previa = out[s.entityId];
    if (previa && (previa.abierta || !abierta)) continue;
    out[s.entityId] = { id: s.id, estado: s.estado, estadoEtiqueta: s.estadoEtiqueta, abierta, createdAt: s.createdAt };
  }
  return out;
}

/** Dónde está la guía en el panel del negocio (enlace del aviso de la campana). */
export function rutaGuiaEnPanel(entityType: EntityTypeCorreccion): string {
  return entityType === "loth_gtf" ? "/admin?tab=loth-libro-operaciones&vista=gtf" : "/admin?tab=ctp-libro-operaciones";
}

/**
 * PATCH `rutaEstadoCorreccionPlataforma(id)` → 200 | 404 | 409 (transición
 * inválida, cambio concurrente, o reabrir con otra abierta para la misma guía:
 * `ya_hay_una_abierta` + `solicitudAbiertaId`).
 */
export type CambiarEstadoCorreccionRespuesta =
  | { ok: true; solicitud: SolicitudCorreccionDTO }
  | { ok: false; error: string; codigo?: ErrorCambiarEstadoCorreccion; solicitudAbiertaId?: string };

/** Códigos de error del PATCH (fase 2). `cambio_concurrente` = otro la movió recién: recargar. */
export type ErrorCambiarEstadoCorreccion =
  | "validation_error"
  | "no_existe"
  | "estado_invalido"
  | "transicion_invalida"
  | "falta_resolucion"
  | "cambio_concurrente"
  /** Reabrir una resuelta/rechazada cuando la guía ya tiene otra abierta. */
  | "ya_hay_una_abierta";

/** Asunto que ve la bandeja (el mensaje es el motivo). */
export function asuntoCorreccion(entityType: EntityTypeCorreccion, guiaNumero: string): string {
  return `Corrección de guía ${guiaNumero} (${ENTITY_TYPE_ETIQUETA[entityType]})`;
}
