import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { isDateClosed, closedPeriodOf, type CacaoCierrePeriodo } from "@/lib/cacao/cacao-cierre-types";

/**
 * CacaoCierreDB — cierre de período del acopio de cacao (ADR-303). Espeja el
 * cierre forestal (ADR-139): KV `cacao-cierre:{tenantId}` con los meses cerrados;
 * la INMUTABILIDAD la dan los guards `closedPeriodOf` en las DB de escritura del
 * cacao (createLote/createVenta/…), no el storage.
 *
 * ANTI-CICLO: expone solo lecturas + persistencia; NO importa cacao.db ni una
 * clase de error → cacao.db la importa sin ciclo y tira su propio error.
 */

const KEY_PREFIX = "cacao-cierre:";

function auditCacao(tenantId: string, action: string, entityId: string, detail: string, user: string): void {
  void logActivity(action, "CacaoCierre", detail, entityId, user, undefined, tenantId).catch((err) =>
    logger.error("[cacao-cierre] audit failed", { error: String(err), action, tenantId }),
  );
}

export const CacaoCierreDB = {
  async list(tenantId: string): Promise<CacaoCierrePeriodo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<CacaoCierrePeriodo[]>(`${KEY_PREFIX}${tenantId}`);
    return Array.isArray(raw) ? raw : [];
  },

  async isClosedOn(tenantId: string, date: Date | null | undefined): Promise<boolean> {
    if (!tenantId || !date) return false;
    return isDateClosed(await this.list(tenantId), date);
  },

  async closedPeriodOf(tenantId: string, date: Date | null | undefined): Promise<CacaoCierrePeriodo | null> {
    if (!tenantId || !date) return null;
    return closedPeriodOf(await this.list(tenantId), date);
  },

  async findByKey(tenantId: string, periodKey: string): Promise<CacaoCierrePeriodo | null> {
    return (await this.list(tenantId)).find((c) => c.periodKey === periodKey) ?? null;
  },

  async save(tenantId: string, cierre: CacaoCierrePeriodo, user: string): Promise<CacaoCierrePeriodo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const list = await this.list(tenantId);
    const next = [cierre, ...list.filter((c) => c.periodKey !== cierre.periodKey)].sort((a, b) => b.periodKey.localeCompare(a.periodKey));
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, next, user);
    auditCacao(tenantId, "cacao_periodo_cerrar", cierre.periodKey, `Cerró la campaña de ${cierre.label}: ${cierre.totales.lotes} lotes (${cierre.totales.acopioKg} kg), ${cierre.totales.ventas} ventas (${cierre.totales.ventasKg} kg). Stock de cierre ${cierre.snapshot.stockKg} kg. El período queda BLOQUEADO.`, user);
    return next;
  },

  async reabrir(tenantId: string, periodKey: string, motivo: string, user: string): Promise<CacaoCierrePeriodo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!motivo?.trim()) throw new Error("motivo is required");
    const list = await this.list(tenantId);
    const target = list.find((c) => c.periodKey === periodKey);
    if (!target) throw new Error("Período no encontrado");
    if (target.reabierto) throw new Error("El período ya está reabierto");
    const next = list.map((c) => (c.periodKey === periodKey ? { ...c, reabierto: { at: new Date().toISOString(), by: user, motivo: motivo.trim() } } : c));
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, next, user);
    auditCacao(tenantId, "cacao_periodo_reabrir", periodKey, `Reabrió la campaña de ${target.label} · motivo: ${motivo.trim()}. El período vuelve a admitir ediciones.`, user);
    return next;
  },
};
