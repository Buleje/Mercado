"use client";

/**
 * SystemHealthMetrics — métricas REALES del sistema (Brandon 2026-06-19). Todo
 * medido en vivo desde /api/superadmin/health/metrics: base de datos (latencia,
 * conexiones, tamaño, cache hit, commits/rollbacks, tablas más grandes),
 * servicios configurados + ping de Redis, e info de la app. NADA de adorno.
 */

import { useCallback, useEffect, useState } from "react";
import { Database, Server, Cpu, RefreshCw, CheckCircle2, MinusCircle } from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";

type Metrics = {
  db: {
    latencyMs: number | null;
    connections: { total: number; active: number; idle: number } | null;
    sizeBytes: number | null;
    cacheHitRatio: number | null;
    commits?: number;
    rollbacks?: number;
    topTables: { name: string; bytes: number }[] | null;
  };
  redis: { configured: boolean; ok: boolean; latencyMs: number | null };
  services: { key: string; label: string; configured: boolean; critical: boolean }[];
  app: { env: string; node: string; uptimeSec: number; version: string | null };
  generatedAt: string;
};

const fmtBytes = (b: number | null | undefined): string => {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};
const fmtUptime = (s: number): string => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

function Section({ icon: Icon, title, sub, children }: { icon: typeof Database; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
      <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]"><Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden /></span>
        <div>
          <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">{title}</h3>
          {sub && <p className="text-xs text-[var(--text-tertiary)]">{sub}</p>}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function SystemHealthMetrics() {
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/health/metrics", { credentials: "include", cache: "no-store" });
      if (res.ok) setM((await res.json()) as Metrics);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useVisiblePolling(() => void load(), 20_000);

  if (loading && !m) return <div className="h-64 animate-pulse rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />;
  if (!m) return null;

  const lat = m.db.latencyMs;
  const latTone = lat == null ? "bad" : lat < 200 ? "good" : lat < 800 ? "warn" : "bad";
  const cache = m.db.cacheHitRatio;
  const txTotal = (m.db.commits ?? 0) + (m.db.rollbacks ?? 0);
  const rollbackPct = txTotal > 0 ? Math.round(((m.db.rollbacks ?? 0) / txTotal) * 1000) / 10 : 0;
  const maxTable = Math.max(1, ...(m.db.topTables ?? []).map((t) => t.bytes));

  return (
    <div className="space-y-4">
      {/* Base de datos */}
      <Section icon={Database} title="Base de datos" sub="PostgreSQL · medido en vivo">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          <SAKpiCard label="Latencia" value={lat == null ? "—" : `${lat} ms`} sub="SELECT 1" tone={latTone} />
          <SAKpiCard label="Conexiones" value={m.db.connections ? `${m.db.connections.active}/${m.db.connections.total}` : "—"} sub={m.db.connections ? `${m.db.connections.idle} idle` : ""} />
          <SAKpiCard label="Tamaño" value={fmtBytes(m.db.sizeBytes)} sub="base de datos" />
          <SAKpiCard label="Cache hit" value={cache == null ? "—" : `${cache}%`} sub="buffers" tone={cache == null ? "default" : cache >= 99 ? "good" : cache >= 90 ? "warn" : "bad"} />
          <SAKpiCard label="Rollbacks" value={`${rollbackPct}%`} sub={`${(m.db.rollbacks ?? 0).toLocaleString("es-PE")} de ${txTotal.toLocaleString("es-PE")}`} tone={rollbackPct > 5 ? "warn" : "default"} />
        </div>
        {m.db.topTables && m.db.topTables.length > 0 && (
          <div>
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Tablas más grandes</p>
            <div className="space-y-1.5">
              {m.db.topTables.map((t) => (
                <div key={t.name} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate font-mono text-xs text-[var(--text-secondary)]">{t.name}</span>
                  <div className="flex-1 h-2.5 rounded bg-[var(--surface-sunken)] overflow-hidden"><div className="h-full bg-[var(--accent)]" style={{ width: `${Math.round((t.bytes / maxTable) * 100)}%` }} /></div>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-[var(--text-tertiary)]">{fmtBytes(t.bytes)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Servicios */}
      <Section icon={Server} title="Servicios e integraciones" sub="configurado = el secreto está en el entorno (no implica operativo); Redis se pinea de verdad">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {m.services.map((s) => {
            const isRedis = s.key === "redis";
            const ok = s.configured;
            return (
              <div key={s.key} className="flex items-center gap-2.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2.5">
                {ok ? <CheckCircle2 className="h-4 w-4 text-[var(--data-success-600,#059669)] shrink-0" /> : <MinusCircle className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />}
                <span className="flex-1 text-sm font-bold text-[var(--text-primary)] truncate">{s.label}</span>
                {isRedis && m.redis.configured ? (
                  <span className={`text-xs font-bold tabular-nums shrink-0 ${m.redis.ok ? "text-[var(--data-success-600,#059669)]" : "text-[var(--data-error-600,#dc2626)]"}`}>{m.redis.ok ? `${m.redis.latencyMs} ms` : "sin respuesta"}</span>
                ) : (
                  <span className={`text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shrink-0 ${ok ? "text-[var(--data-success-600,#059669)]" : s.critical ? "text-[var(--data-error-600,#dc2626)]" : "text-[var(--text-tertiary)]"}`}>{ok ? "configurado" : s.critical ? "FALTA" : "no config"}</span>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* App / runtime */}
      <Section icon={Cpu} title="Runtime de la app">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SAKpiCard label="Entorno" value={m.app.env} />
          <SAKpiCard label="Node" value={m.app.node} />
          <SAKpiCard label="Uptime" value={fmtUptime(m.app.uptimeSec)} sub="del proceso" />
          <SAKpiCard label="Versión" value={m.app.version ?? "—"} />
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <span className="text-xs text-[var(--text-tertiary)] tabular-nums">Medido {new Date(m.generatedAt).toLocaleTimeString("es-PE")} · auto 20s</span>
          <button type="button" onClick={() => void load()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)]/40"><RefreshCw className="h-3.5 w-3.5" /> Actualizar</button>
        </div>
      </Section>
    </div>
  );
}
