import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { isDateClosed, closedPeriodOf, type CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";

/**
 * ForestCtpCierreDB — cierre de período fiscal del Libro de Operaciones CTP (ADR-139).
 *
 * POR QUÉ EXISTE:
 * un libro de operaciones que no se puede CERRAR no es un libro — es una query
 * viva sobre datos mutables, y eso es lo primero que un inspector OSINFOR
 * desconfía. Cerrar un mes lo vuelve un acta inmutable: congela costos, guarda la
 * existencia de cierre (que hereda el mes siguiente como apertura) y BLOQUEA toda
 * edición de las líneas fechadas en ese mes.
 *
 * DÓNDE VIVE (sin migración):
 * KV global `PlatformSetting`, key `ctp-cierre:{tenantId}` → array de períodos
 * cerrados (mismo patrón que `ForestCtpFichaDB`). La INMUTABILIDAD no la da el
 * storage sino los guards `isClosedOn` en las DB classes de escritura.
 *
 * ANTI-CICLO: esta clase expone solo `isClosedOn` (booleano) + persistencia. NO
 * importa `forest-ctp.db` ni la clase de error — así las DB classes de escritura
 * pueden importarla sin ciclo, y cada una tira su propio CtpInvariantError.
 * La ORQUESTACIÓN del cierre (calcular saldos + congelar corridas) vive en el
 * endpoint, que compone ForestCtpDB.saldos + ForestCtpConsumoDB.congelarCosto +
 * este `save`.
 */

const KEY_PREFIX = "ctp-cierre:";

export const ForestCtpCierreDB = {
  /** Los períodos cerrados del tenant, más reciente primero. */
  async list(tenantId: string): Promise<CtpCierrePeriodo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<CtpCierrePeriodo[]>(`${KEY_PREFIX}${tenantId}`);
    return Array.isArray(raw) ? raw : [];
  },

  /** ¿La fecha cae en un período cerrado y no reabierto? Guard de escritura. */
  async isClosedOn(tenantId: string, date: Date | null | undefined): Promise<boolean> {
    if (!tenantId || !date) return false;
    return isDateClosed(await this.list(tenantId), date);
  },

  /** El cierre activo que contiene la fecha (para el mensaje del error). */
  async closedPeriodOf(tenantId: string, date: Date | null | undefined): Promise<CtpCierrePeriodo | null> {
    if (!tenantId || !date) return null;
    return closedPeriodOf(await this.list(tenantId), date);
  },

  async findByKey(tenantId: string, periodKey: string): Promise<CtpCierrePeriodo | null> {
    return (await this.list(tenantId)).find((c) => c.periodKey === periodKey) ?? null;
  },

  /** Persiste un cierre (reemplaza el del mismo periodKey si se re-cierra). */
  async save(tenantId: string, cierre: CtpCierrePeriodo, user: string): Promise<CtpCierrePeriodo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const list = await this.list(tenantId);
    const next = [cierre, ...list.filter((c) => c.periodKey !== cierre.periodKey)].sort((a, b) =>
      b.periodKey.localeCompare(a.periodKey),
    );
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, next, user);
    auditCtp({
      tenantId,
      action: "ctp_periodo_cerrar",
      entity: "ForestCtpCierre",
      entityId: cierre.periodKey,
      detail: `Cerró el período ${cierre.label}: ${cierre.totales.corridasCongeladas} corridas con costo congelado${cierre.totales.corridasSinCostear ? `, ${cierre.totales.corridasSinCostear} sin costear` : ""}, existencia de cierre snapshoteada. El período queda BLOQUEADO.`,
      user,
    });
    return next;
  },

  /**
   * Reabre un período: no borra el cierre (queda en el historial, auditable),
   * solo lo marca `reabierto` para que deje de bloquear. Los costos ya
   * congelados SIGUEN congelados (congelar es irreversible) — reabrir habilita
   * ediciones, no descongela.
   */
  async reabrir(tenantId: string, periodKey: string, motivo: string, user: string): Promise<CtpCierrePeriodo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!motivo?.trim()) throw new Error("motivo is required");
    const list = await this.list(tenantId);
    const target = list.find((c) => c.periodKey === periodKey);
    if (!target) throw new Error("Período no encontrado");
    if (target.reabierto) throw new Error("El período ya está reabierto");
    const next = list.map((c) =>
      c.periodKey === periodKey ? { ...c, reabierto: { at: new Date().toISOString(), by: user, motivo: motivo.trim() } } : c,
    );
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, next, user);
    auditCtp({
      tenantId,
      action: "ctp_periodo_reabrir",
      entity: "ForestCtpCierre",
      entityId: periodKey,
      detail: `Reabrió el período ${target.label} · motivo: ${motivo.trim()}. Los costos ya congelados quedan congelados; el período vuelve a admitir ediciones.`,
      user,
    });
    return next;
  },
};
