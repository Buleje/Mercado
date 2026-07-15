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

/** Entidades del libro — coinciden con los modelos Prisma para poder cruzarlas. */
export type CtpAuditEntity = "WoodEntry" | "ForestCtpEntry" | "ForestCtpConsumo";

/**
 * Acciones auditables. Prefijo `ctp_` para aislarlas del resto del ActivityLog
 * (que es compartido por todo el ERP) y poder greppear el libro entero.
 */
export type CtpAuditAction =
  // Ingresos de materia prima
  | "ctp_ingreso_create"
  | "ctp_ingreso_validate"
  | "ctp_ingreso_reject"
  | "ctp_ingreso_delete"
  // Líneas de producción / despacho
  | "ctp_linea_create"
  | "ctp_linea_annul"
  | "ctp_linea_delete"
  // Atribución de origen y costeo — lo más sensible del módulo
  | "ctp_consumos_set"
  | "ctp_origenes_set"
  | "ctp_costo_congelar";

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
