import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditLoth } from "@/lib/forestal/loth-audit";
import { isDateClosed, closedPeriodOf, type LothCierrePeriodo } from "@/lib/forestal/loth-cierre-types";

/**
 * ForestLothCierreDB — cierre de período del Libro de Operaciones TH.
 *
 * POR QUÉ EXISTE:
 * un libro que no se puede CERRAR no es un libro — es una query viva sobre datos
 * mutables, y eso es lo primero que un inspector OSINFOR desconfía. Cerrar un mes
 * lo vuelve un acta inmutable: BLOQUEA toda edición de las líneas fechadas en él.
 *
 * DÓNDE VIVE (sin migración):
 * KV global `PlatformSetting`, key `loth-cierre:{tenantId}` → array de períodos
 * cerrados (mismo patrón que `ForestLothCitesDB`). La INMUTABILIDAD no la da el
 * storage sino el guard `isClosedOn` en `ForestLothDB` (invariante P1).
 *
 * ANTI-CICLO (gemelo de `ForestCtpCierreDB`): esta clase expone solo `isClosedOn`
 * (booleano) + persistencia. NO importa `forest-loth.db` ni la clase de error, así
 * `ForestLothDB` la puede importar sin ciclo y tira su propio `LothInvariantError`.
 */

const KEY_PREFIX = "loth-cierre:";

export const ForestLothCierreDB = {
  /** Los períodos cerrados del tenant, más reciente primero. */
  async list(tenantId: string): Promise<LothCierrePeriodo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<LothCierrePeriodo[]>(`${KEY_PREFIX}${tenantId}`);
    return Array.isArray(raw) ? raw : [];
  },

  /** ¿La fecha cae en un período cerrado y no reabierto? Guard de escritura (P1). */
  async isClosedOn(tenantId: string, date: Date | null | undefined): Promise<boolean> {
    if (!tenantId || !date) return false;
    return isDateClosed(await this.list(tenantId), date);
  },

  /** El cierre activo que contiene la fecha (para el mensaje del error). */
  async closedPeriodOf(tenantId: string, date: Date | null | undefined): Promise<LothCierrePeriodo | null> {
    if (!tenantId || !date) return null;
    return closedPeriodOf(await this.list(tenantId), date);
  },

  async findByKey(tenantId: string, periodKey: string): Promise<LothCierrePeriodo | null> {
    return (await this.list(tenantId)).find((c) => c.periodKey === periodKey) ?? null;
  },

  /** Persiste un cierre (reemplaza el del mismo periodKey si se re-cierra). */
  async save(tenantId: string, cierre: LothCierrePeriodo, user: string): Promise<LothCierrePeriodo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const list = await this.list(tenantId);
    const next = [cierre, ...list.filter((c) => c.periodKey !== cierre.periodKey)].sort((a, b) =>
      b.periodKey.localeCompare(a.periodKey),
    );
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, next, user);
    auditLoth({
      tenantId,
      action: "loth_periodo_cerrar",
      entity: "ForestLothCierre",
      entityId: cierre.periodKey,
      detail: `Cerró el período ${cierre.label}: ${cierre.totales.lineasCount} líneas, ${cierre.totales.taladoM3.toFixed(2)} m³ talados, ${cierre.totales.trozadoM3.toFixed(2)} m³ trozados. El período queda BLOQUEADO.`,
      user,
    });
    return next;
  },

  /**
   * Reabre un período: no borra el cierre (queda en el historial, auditable),
   * solo lo marca `reabierto` para que deje de bloquear.
   */
  async reabrir(tenantId: string, periodKey: string, motivo: string, user: string): Promise<LothCierrePeriodo[]> {
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
    auditLoth({
      tenantId,
      action: "loth_periodo_reabrir",
      entity: "ForestLothCierre",
      entityId: periodKey,
      detail: `Reabrió el período ${target.label} · motivo: ${motivo.trim()}. El período vuelve a admitir ediciones.`,
      user,
    });
    return next;
  },
};
