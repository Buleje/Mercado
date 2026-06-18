/**
 * lib/superadmin/automation-cooldown.ts
 *
 * Dedup PURO del cron de automatizaciones. Sin esto, el cron re-avisa a CADA
 * tienda que matchea una regla TODOS los dias (spam): una tienda "dormida"
 * recibiria el mismo mensaje cada 24h hasta reactivarse.
 *
 * El cooldown evita re-notificar al mismo (regla, tenant) dentro de una ventana
 * configurable. El log vive en PlatformSetting["automation-notify-log"].
 */

/** ruleKey -> tenantId -> ISO de ultima notificacion. */
export type NotifyLog = Record<string, Record<string, string>>;

export const DEFAULT_COOLDOWN_DAYS = 7;

/** Dias de cooldown; override via AUTOMATION_COOLDOWN_DAYS, default 7. */
export function getCooldownDays(env: Record<string, string | undefined> = process.env): number {
  const raw = env.AUTOMATION_COOLDOWN_DAYS;
  if (raw == null || raw.trim() === "") return DEFAULT_COOLDOWN_DAYS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_COOLDOWN_DAYS;
}

export interface Partitioned<T> {
  toNotify: T[];
  skipped: T[];
}

/**
 * Separa los matches en los que toca notificar vs los que estan en cooldown
 * (notificados hace menos de `cooldownMs` para esta regla).
 */
export function partitionByCooldown<T extends { id: string }>(
  matches: T[],
  log: NotifyLog,
  ruleKey: string,
  now: number,
  cooldownMs: number,
): Partitioned<T> {
  const ruleLog = log[ruleKey] ?? {};
  const toNotify: T[] = [];
  const skipped: T[] = [];
  for (const m of matches) {
    const last = ruleLog[m.id];
    const inCooldown = last != null && now - new Date(last).getTime() < cooldownMs;
    (inCooldown ? skipped : toNotify).push(m);
  }
  return { toNotify, skipped };
}

/**
 * Marca a los tenants notificados con `now` y poda las entradas que ya salieron
 * del cooldown (no aportan y mantendrian el blob creciendo). Devuelve un log
 * nuevo (no muta el de entrada).
 */
export function recordNotified(
  log: NotifyLog,
  ruleKey: string,
  tenantIds: string[],
  now: number,
  cooldownMs: number,
): NotifyLog {
  const iso = new Date(now).toISOString();
  const ruleLog: Record<string, string> = { ...(log[ruleKey] ?? {}) };
  for (const id of tenantIds) ruleLog[id] = iso;
  for (const [id, ts] of Object.entries(ruleLog)) {
    if (now - new Date(ts).getTime() >= cooldownMs) delete ruleLog[id];
  }
  return { ...log, [ruleKey]: ruleLog };
}
