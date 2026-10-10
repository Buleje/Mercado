/**
 * loth-audit — trazabilidad de QUIÉN hizo QUÉ en el Libro de Operaciones de
 * Títulos Habilitantes (LO-TH, ADR-125 / ADR-305).
 *
 * POR QUÉ EXISTE (gemelo de `ctp-audit.ts`):
 * el LO-TH es el registro que fiscaliza OSINFOR y que cae bajo Ley 29733 — la
 * cadena de custodia del aprovechamiento en el bosque (tala → trozado → salida).
 * Hasta ADR-305 `ForestLothDB` no escribía NI UNA entrada de auditoría: se podía
 * registrar una tala, anular una troza o corregir una carátula sin dejar rastro
 * de quién ni cuándo. A diferencia de casi todo lo demás, esto NO se reconstruye
 * después — el evento que no se registró se perdió.
 *
 * Prefijo `loth_` para aislar el libro del resto del ActivityLog (compartido por
 * todo el ERP) y poder greppear el LO-TH entero — igual criterio que `ctp_`.
 *
 * Fire-and-forget: auditar nunca puede tumbar la operación de negocio, pero el
 * fallo SIEMPRE se loguea — un catch vacío acá dejaría el libro sin trazas y sin
 * que nadie se entere (regla 4 de code-quality).
 */
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

/** Entidades del libro TH. `ForestLothCites` no es modelo Prisma (vive en el KV
 * `PlatformSetting`, key `loth-cites:{tenantId}`), pero se audita porque acredita
 * la legalidad de las especies protegidas ante OSINFOR. */
export type LothAuditEntity =
  | "ForestLothEntry"
  | "ForestLothCaratula"
  | "ForestLothCites"
  | "ForestGtf"
  // KV (como ForestLothCites): el cierre de período del libro.
  | "ForestLothCierre"
  // KV: el polígono del área de aprovechamiento (cumplimiento EUDR).
  | "ForestLothParcela"
  // KV: referencias y accesos del plano (contexto cartográfico).
  | "ForestLothCartografia"
  // KV: parámetros del Plan Operativo (DMC por especie, % de semilleros).
  | "ForestLothPoa";

/**
 * De dónde vino el pedido (IP y navegador), para los eventos que el titular
 * explica ante OSINFOR (`loth_tala_sobre_cupo`, `loth_despacho_sobre_autorizado`).
 * Lo arma la ruta con `getClientIp` y el `user-agent`, nunca el cuerpo.
 */
export interface SesionDeAuditoria {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Acciones auditables del LO-TH. */
export type LothAuditAction =
  // Líneas del libro (las 6 secciones SERFOR)
  | "loth_linea_create"
  | "loth_linea_annul"
  | "loth_linea_delete"
  // Líneas sin plan atadas a un permiso (ADR-459, 02-10-2026)
  | "loth_linea_atar_plan"
  // Tala registrada por encima del cupo de su especie, con su motivo (T9)
  | "loth_tala_sobre_cupo"
  // Tala que pasa lo CENSADO de su especie (sin autorizado en el plan): aviso, sin freno
  | "loth_tala_sobre_censo"
  // Guía VERIFICADA en SERFOR importada aunque su despacho pase lo AUTORIZADO, con motivo (T6, ADR-468)
  | "loth_despacho_sobre_autorizado"
  // Carátula (identidad del título habilitante que encabeza el libro)
  | "loth_caratula_create"
  | "loth_caratula_update"
  | "loth_caratula_delete"
  // Catálogo de permisos CITES del libro (KV)
  | "loth_cites_update"
  // Guía de Transporte Forestal (GTF)
  | "loth_gtf_create"
  | "loth_gtf_annul"
  // Guía ya despachada importada al libro (ADR-461): resumen de lo asentado
  | "loth_gtf_importar"
  // Tala referencial que creció con las trozas de otra guía del mismo árbol (ADR-461)
  | "loth_linea_ampliar_referencial"
  // Se deshizo una guía importada: guía, despachos, trozados y talas que asentó (ADR-461 §12)
  | "loth_gtf_deshacer_importar"
  // Tala referencial que se achicó al deshacer una de las guías que la sostenían (ADR-461 §12)
  | "loth_linea_reducir_referencial"
  // Código único de troza (ADR-477): las trozas de una guía importada pasan a «<código>-<correlativo>» (y su reversión)
  | "loth_codigo_unico_migrado"
  | "loth_codigo_unico_revertido"
  // La guía pasó al Libro CTP del mismo negocio (o se recibió allá)
  | "loth_gtf_al_ctp"
  // Cierre de período del libro (acta inmutable)
  | "loth_periodo_cerrar"
  | "loth_periodo_reabrir"
  // Parcela de aprovechamiento (polígono EUDR, KV)
  | "loth_parcela_update"
  // Referencias + cuadro de acceso del plano (KV)
  | "loth_cartografia_update"
  // Parámetros del POA: DMC por especie y semilleros (KV)
  | "loth_poa_config_update"
  // ¿Asierra dentro del TH o la madera va a una planta? (KV, por carátula)
  | "loth_transformacion_update";

/**
 * Registra un evento del LO-TH. No se await-ea a propósito: la auditoría no debe
 * agregar latencia ni romper el write si el log falla.
 */
export function auditLoth(params: {
  tenantId: string;
  action: LothAuditAction;
  entity: LothAuditEntity;
  entityId: string;
  /** Qué pasó, en español y legible por un humano (o un fiscalizador). */
  detail: string;
  /** Username del admin. Nunca inventes uno: si no se sabe, "unknown". */
  user: string;
}): void {
  void logActivity(
    params.action,
    params.entity,
    params.detail,
    params.entityId,
    params.user || "unknown",
    undefined,
    params.tenantId,
  ).catch((err) =>
    // Si esto falla, el libro pierde trazabilidad: es un error, no un detalle.
    logger.error("[loth-audit] no se pudo registrar el evento", {
      error: String(err),
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      tenantId: params.tenantId,
    }),
  );
}
