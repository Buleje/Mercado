import "server-only";
import { ActivityLogDB } from "@/lib/db/activity-log.db";
import {
  bumpThreatCounter, blockIp, listBlockedIps, AUTO_BLOCK_THRESHOLD, isBlocklistEnabled, hasTrustedIps,
  type BlockedIp,
} from "@/lib/security/ip-blocklist";
import type { ThreatType, ThreatSeverity } from "@/lib/security/threat-signatures";
import { reportSecurityIncident } from "@/lib/sentry-alerts";
import { logger } from "@/lib/logger";

/**
 * lib/security/security-events.ts (Node)
 *
 * Sink + agregación de eventos de seguridad del WAF. Persiste en ActivityLog
 * (entity="security", action="attack_detected") — zero migración — y decide el
 * auto-bloqueo de IPs reincidentes vía la blocklist de Redis.
 *
 * El overview alimenta el tab "Amenazas" del Security Center de superadmin.
 */

const ACTION = "attack_detected";

export interface IncomingSecurityEvent {
  ip: string;
  path: string;
  method: string;
  userAgent: string;
  threats: Array<{ type: ThreatType; severity: ThreatSeverity; evidence: string }>;
  maxSeverity: ThreatSeverity;
  blockedInline: boolean; // true si el middleware ya devolvió 403 por firma crítica
  requestId?: string;
  tenantId?: string;
}

/**
 * Registra un evento de ataque + escala a auto-bloqueo si la IP reincide.
 * Devuelve si la IP quedó auto-bloqueada en esta llamada.
 */
export async function recordSecurityEvent(evt: IncomingSecurityEvent): Promise<{ autoBlocked: boolean; threatCount: number }> {
  const detail = JSON.stringify({
    ip: evt.ip.slice(0, 45),
    path: evt.path.slice(0, 200),
    method: evt.method,
    userAgent: evt.userAgent.slice(0, 200),
    threats: evt.threats.map((t) => ({ type: t.type, severity: t.severity, evidence: t.evidence.slice(0, 120) })),
    maxSeverity: evt.maxSeverity,
    blockedInline: evt.blockedInline,
  });

  await ActivityLogDB.create(evt.tenantId ?? "system", {
    action: ACTION,
    entity: "security",
    entityId: evt.requestId ?? null,
    detail,
    user: "waf",
  }).catch((err) => logger.error("[security-events] persist failed", { error: String(err) }));

  // Escalada: contá amenazas por IP en la ventana; al umbral, auto-ban.
  const threatCount = await bumpThreatCounter(evt.ip);
  let autoBlocked = false;
  if (threatCount >= AUTO_BLOCK_THRESHOLD) {
    await blockIp(evt.ip, `auto: ${threatCount} amenazas (${evt.maxSeverity})`);
    autoBlocked = true;
    // Alerta en tiempo real — el dueño se entera sin abrir el dashboard.
    // Fire-and-forget: si Sentry no está configurado, es no-op.
    try {
      reportSecurityIncident(`IP auto-bloqueada tras ${threatCount} amenazas`, {
        ip: evt.ip,
        path: evt.path,
        threatTypes: evt.threats.map((t) => t.type),
        severity: evt.maxSeverity,
        threatCount,
      });
    } catch (err) {
      logger.error("[security-events] sentry alert failed", { error: String(err) });
    }
  }
  return { autoBlocked, threatCount };
}

// ── Overview para el dashboard ────────────────────────────────────────────────

export interface SecurityEventRow {
  id: string;
  at: string;
  ip: string;
  path: string;
  method: string;
  userAgent: string;
  types: ThreatType[];
  maxSeverity: ThreatSeverity;
  blockedInline: boolean;
}

export interface ThreatOverview {
  windowDays: number;
  total: number;
  blockedInline: number;
  bySeverity: Record<ThreatSeverity, number>;
  byType: Array<{ type: ThreatType; count: number }>;
  topIps: Array<{ ip: string; count: number; lastAt: string; types: ThreatType[] }>;
  timeline: Array<{ day: string; count: number }>;
  recent: SecurityEventRow[];
  blockedIps: BlockedIp[];
  blocklistEnabled: boolean;
  trustedIpsConfigured: boolean;
}

interface ParsedDetail {
  ip?: string;
  path?: string;
  method?: string;
  userAgent?: string;
  threats?: Array<{ type: ThreatType; severity: ThreatSeverity }>;
  maxSeverity?: ThreatSeverity;
  blockedInline?: boolean;
}

const EMPTY_SEVERITY: Record<ThreatSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };

export async function getThreatOverview(windowDays = 7): Promise<ThreatOverview> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const [events, blockedIps] = await Promise.all([
    ActivityLogDB.listPlatformSecurityEvents({ since, actions: [ACTION], limit: 2000 }),
    listBlockedIps(),
  ]);

  const bySeverity = { ...EMPTY_SEVERITY };
  const byTypeMap = new Map<ThreatType, number>();
  const ipMap = new Map<string, { count: number; lastAt: string; types: Set<ThreatType> }>();
  const dayMap = new Map<string, number>();
  const recent: SecurityEventRow[] = [];
  let blockedInline = 0;

  for (const e of events) {
    let d: ParsedDetail = {};
    try { d = JSON.parse(e.detail) as ParsedDetail; } catch { continue; }
    const at = e.createdAt.toISOString();
    const sev = d.maxSeverity ?? "low";
    const types = (d.threats ?? []).map((t) => t.type);
    bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
    for (const t of types) byTypeMap.set(t, (byTypeMap.get(t) ?? 0) + 1);
    if (d.blockedInline) blockedInline += 1;

    const ip = d.ip ?? "unknown";
    const cur = ipMap.get(ip) ?? { count: 0, lastAt: at, types: new Set<ThreatType>() };
    cur.count += 1;
    if (at > cur.lastAt) cur.lastAt = at;
    types.forEach((t) => cur.types.add(t));
    ipMap.set(ip, cur);

    const day = at.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);

    if (recent.length < 100) {
      recent.push({
        id: e.id, at, ip, path: d.path ?? "", method: d.method ?? "", userAgent: d.userAgent ?? "",
        types, maxSeverity: sev, blockedInline: !!d.blockedInline,
      });
    }
  }

  // Serie diaria completa (rellena días sin eventos con 0).
  const timeline: Array<{ day: string; count: number }> = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    timeline.push({ day, count: dayMap.get(day) ?? 0 });
  }

  return {
    windowDays,
    total: events.length,
    blockedInline,
    bySeverity,
    byType: [...byTypeMap.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    topIps: [...ipMap.entries()]
      .map(([ip, v]) => ({ ip, count: v.count, lastAt: v.lastAt, types: [...v.types] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    timeline,
    recent,
    blockedIps,
    blocklistEnabled: isBlocklistEnabled(),
    trustedIpsConfigured: hasTrustedIps(),
  };
}
