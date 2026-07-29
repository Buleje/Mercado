/**
 * ctp-audit — trazabilidad de QUIÉN hizo QUÉ en el Libro de Operaciones CTP.
 *
 * POR QUÉ EXISTE:
 * el Libro CTP es un registro que fiscaliza SERFOR y que cae bajo Ley 29733.
 * Hasta 2026-07-15 las 3 DB classes del módulo (`wood-entries`, `forest-ctp`,
 * `forest-ctp-consumo`) no escribían NI UNA entrada de auditoría: se podía
 * validar un ingreso, reatribuir el origen de una corrida o congelar un costo
 * sin dejar rastro de quién ni cuándo. A diferencia de casi todo lo demás, esto
 * NO se puede reconstruir después — el evento que no se registró se perdió.
 *
 * Este módulo centraliza el vocabulario (acciones + entidades) para que las 3
 * clases registren igual y el Security Center pueda filtrar por `entity`.
 *
 * Fire-and-forget: auditar nunca puede tumbar la operación de negocio, pero el
 * fallo SIEMPRE se loguea — un catch vacío acá dejaría el libro sin trazas y sin
 * que nadie se entere (regla 4 de code-quality).
 */
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

/** Entidades del libro — coinciden con los modelos Prisma para poder cruzarlas.
 * `ForestCtpFicha` no es un modelo Prisma: la ficha legal del CTP vive en el KV
 * `PlatformSetting` (key `ctp-ficha:{tenantId}`), pero se audita igual porque es
 * la identidad legal que encabeza cada certificado, GTF y export ante SERFOR. */
export type CtpAuditEntity =
  | "WoodEntry"
  | "ForestCtpEntry"
  | "ForestCtpConsumo"
  | "ForestProdLote"
  | "ForestCtpFicha"
  // No es modelo Prisma (como ForestCtpFicha): un evento de importación LO-CTP es
  // un lote, no una fila. Se audita porque un fiscalizador quiere saber CÓMO
  // entraron los datos al libro (qué archivo, cuántas filas, quién) — ADR-138.
  | "ForestCtpImport"
  // KV (como ForestCtpFicha): el cierre de período fiscal del libro (ADR-139).
  | "ForestCtpCierre"
  // KV: geolocalización de orígenes para el dossier EUDR (ADR-140).
  | "ForestOrigenGeo"
  // KV: zonas físicas del aserradero para el Mapa de Planta (ADR-142).
  | "ForestPlantaZona"
  // KV: cubicaciones guardadas del cubicador — la medición del lote, previa al
  // libro (al libro entra después como producción, con su propio registro).
  | "ForestCubicacion"
  // KV: ANEXO N° 04 emitido (lista de productos transformados de la GTF). No es
  // modelo Prisma: es el PAPEL que se entregó, guardado para poder re-imprimir
  // el mismo documento ante una fiscalización.
  | "ForestAnexo04";

/**
 * Acciones auditables. Prefijo `ctp_` para aislarlas del resto del ActivityLog
 * (que es compartido por todo el ERP) y poder greppear el libro entero.
 */
export type CtpAuditAction =
  // Ingresos de materia prima
  | "ctp_ingreso_create"
  // Corrección de un ingreso pendiente (typo de GTF, volumen mal tipeado): el
  // detalle narra campo por campo qué cambió — un libro fiscalizable tiene que
  // poder responder "¿esto siempre dijo 5.20 m³?".
  | "ctp_ingreso_update"
  | "ctp_ingreso_validate"
  | "ctp_ingreso_reject"
  | "ctp_ingreso_annul"
  | "ctp_ingreso_delete"
  // Líneas de producción / despacho
  | "ctp_linea_create"
  | "ctp_linea_annul"
  | "ctp_linea_delete"
  // Atribución de origen y costeo — lo más sensible del módulo
  | "ctp_consumos_set"
  | "ctp_origenes_set"
  | "ctp_costo_congelar"
  // Lotes de producción / comercialización (ADR-136)
  | "ctp_lote_create"
  | "ctp_lote_miembros_set"
  | "ctp_lote_status"
  | "ctp_lote_delete"
  // Ficha legal del CTP (identidad SERFOR — Código de CTP, registro ARFFS, TH)
  | "ctp_ficha_update"
  // GTF de salida formal (serie autorizada ARFFS + correlativo auto)
  | "ctp_gtf_emitir"
  // Importación del libro desde el Excel LO-CTP (ADR-138) — evento por lote
  | "ctp_import"
  // Cierre de período fiscal del libro (ADR-139) — congela + bloquea el mes
  | "ctp_periodo_cerrar"
  | "ctp_periodo_reabrir"
  // Geolocalización de origen para el dossier EUDR (ADR-140)
  | "ctp_origen_geo_set"
  // Valor de venta del despacho para el P&L (ADR-141)
  | "ctp_venta_set"
  // Zonas físicas del aserradero para el Mapa de Planta (ADR-142)
  | "ctp_planta_zona_set"
  | "ctp_planta_zona_delete"
  // Ubicación de una troza/ingreso en una zona de la planta (ADR-142 follow-up)
  | "ctp_planta_asignar"
  // Cubicaciones guardadas del cubicador (la medición del lote, previa al libro)
  | "ctp_cubicacion_create"
  | "ctp_cubicacion_update"
  | "ctp_cubicacion_delete"
  // ANEXO N° 04 emitido con la GTF (lista de productos transformados)
  | "ctp_anexo04_emit"
  | "ctp_anexo04_update"
  | "ctp_anexo04_delete";

/**
 * Registra un evento del libro. No se await-ea a propósito: la auditoría no
 * debe agregar latencia ni romper el write si el log falla.
 */
export function auditCtp(params: {
  tenantId: string;
  action: CtpAuditAction;
  entity: CtpAuditEntity;
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
    logger.error("[ctp-audit] no se pudo registrar el evento", {
      error: String(err),
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      tenantId: params.tenantId,
    }),
  );
}

/** m³ con la precisión forestal del módulo, para los detalles del log. */
export const m3 = (v: number | string | null | undefined): string =>
  v == null ? "—" : `${Number(v).toFixed(4)} m³`;
