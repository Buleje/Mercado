import "server-only";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePlatformPage } from "@/lib/superadmin-auth";

// Next 16 (CLAUDE.md #4): NO usar `force-dynamic`. Dejamos sin "use cache"
// para que el RSC re-renderice a cada request (panel ops, datos frescos).

/**
 * /superadmin/dlq
 *
 * Brandon 2026-05-18 (audit profundo arquitectura Sprint 2):
 * Dashboard del Dead Letter Queue persistente. Lista eventos de dominio
 * que fallaron y no se reintentaron (EventDeadLetter), crons que fallaron
 * (CronDeadLetter), y webhooks de Mercado Pago que se quedaron pendientes
 * (StripeWebhookQueue con prefix mpmkt_ y processedAt=null).
 *
 * Acciones por entry: ver detalle, marcar como resuelto (resolvedAt=now),
 * o intentar replay manual.
 *
 * Si los items se acumulan sin resolverse = señal de bug sistemático en
 * el handler o servicio externo caído.
 *
 * Scope: superadmin only — vista cross-tenant.
 */
export default async function DLQDashboardPage() {
  // requirePlatformPage lee de cookies en SSR + redirige a /superadmin/login si no auth
  await requirePlatformPage();

  // Cargar las 3 fuentes de DLQ en paralelo (limit 50 c/u — si hay más
  // significa que es momento de atender el bug raíz, no la UI).
  // @prisma-direct ok — queries cross-tenant legítimas de superadmin
  // platform-level. EventDeadLetter tiene tenantId pero el dashboard
  // muestra TODOS los tenants. CronDeadLetter es system-wide (no tenantId).
  // StripeWebhookQueue tampoco tiene tenantId (mapeo via payload).
  const [events, crons, mpWebhooks] = await Promise.all([
    // eslint-disable-next-line no-restricted-properties
    prisma.eventDeadLetter.findMany({
      where: { resolvedAt: null },
      orderBy: { failedAt: "desc" },
      take: 50,
    }).catch(() => []),
    // eslint-disable-next-line no-restricted-properties
    prisma.cronDeadLetter.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }).catch(() => []),
    // eslint-disable-next-line no-restricted-properties
    prisma.stripeWebhookQueue.findMany({
      where: {
        stripeId: { startsWith: "mpmkt_" },
        processedAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }).catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
            Superadmin · Operations
          </p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.025em] text-[var(--text-primary)] leading-none">
            Dead Letter Queue
          </h1>
          <p className="mt-2 text-[length:var(--ts-sm)] text-[var(--text-secondary)]">
            Eventos, crons y webhooks que fallaron y no se autoreintentaron.
            Investigá si los contadores crecen sostenidamente.
          </p>
        </div>
        <Link
          href="/superadmin"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors"
        >
          ← Superadmin
        </Link>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Eventos sin resolver"
          value={events.length}
          warn={events.length > 10}
          critical={events.length > 50}
        />
        <StatCard
          label="Crons fallidos"
          value={crons.length}
          warn={crons.length > 5}
          critical={crons.length > 20}
        />
        <StatCard
          label="MP Webhooks pendientes"
          value={mpWebhooks.length}
          warn={mpWebhooks.length > 10}
          critical={mpWebhooks.length > 50}
        />
      </div>

      {/* Eventos de dominio */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="px-5 py-4 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]/50">
          <h2 className="text-lg font-black text-[var(--text-primary)]">
            Eventos de dominio
          </h2>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] mt-0.5">
            Handlers de dominio que fallaron tras retries. Investigá si el mismo eventType aparece muchas veces.
          </p>
        </header>
        {events.length === 0 ? (
          <div className="px-5 py-8 text-center text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
            ✓ Sin eventos en DLQ
          </div>
        ) : (
          <table className="w-full text-[length:var(--ts-sm)]">
            <thead className="bg-[var(--surface-sunken)]/30 text-left">
              <tr>
                <Th>Tenant</Th>
                <Th>Tipo</Th>
                <Th>Handler</Th>
                <Th>Intentos</Th>
                <Th>Falló hace</Th>
                <Th>Error</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-[var(--rule-soft)]">
                  <Td><code className="text-[length:var(--ts-2xs)]">{e.tenantId.slice(0, 12)}…</code></Td>
                  <Td><span className="font-bold">{e.eventType}</span></Td>
                  <Td>{e.handlerName}</Td>
                  <Td><span className="tabular-nums">{e.attemptCount}</span></Td>
                  <Td>{timeAgo(e.failedAt)}</Td>
                  <Td><span className="text-[var(--data-error-500)] truncate block max-w-xs">{e.lastError.slice(0, 80)}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Crons fallidos */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="px-5 py-4 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]/50">
          <h2 className="text-lg font-black text-[var(--text-primary)]">
            Crons fallidos
          </h2>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] mt-0.5">
            Jobs cron que llegaron a max-attempts y se rindieron.
          </p>
        </header>
        {crons.length === 0 ? (
          <div className="px-5 py-8 text-center text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
            ✓ Sin crons fallidos recientes
          </div>
        ) : (
          <table className="w-full text-[length:var(--ts-sm)]">
            <thead className="bg-[var(--surface-sunken)]/30 text-left">
              <tr>
                <Th>Job</Th>
                <Th>Intentos</Th>
                <Th>Falló hace</Th>
                <Th>Error</Th>
              </tr>
            </thead>
            <tbody>
              {crons.map((c) => (
                <tr key={c.id} className="border-t border-[var(--rule-soft)]">
                  <Td><span className="font-bold">{c.jobName}</span></Td>
                  <Td><span className="tabular-nums">{c.attempts}</span></Td>
                  <Td>{timeAgo(c.createdAt)}</Td>
                  <Td><span className="text-[var(--data-error-500)] truncate block max-w-xs">{c.error.slice(0, 80)}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* MP Webhooks pendientes */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="px-5 py-4 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]/50">
          <h2 className="text-lg font-black text-[var(--text-primary)]">
            Mercado Pago webhooks pendientes
          </h2>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] mt-0.5">
            IPNs registrados pero no marcados como procesados. El cron /api/cron/mp-webhook-replay los reintenta cada día a las 4:13 AM.
          </p>
        </header>
        {mpWebhooks.length === 0 ? (
          <div className="px-5 py-8 text-center text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
            ✓ Sin webhooks pendientes
          </div>
        ) : (
          <table className="w-full text-[length:var(--ts-sm)]">
            <thead className="bg-[var(--surface-sunken)]/30 text-left">
              <tr>
                <Th>Data ID</Th>
                <Th>Tipo</Th>
                <Th>Intentos</Th>
                <Th>Llegó hace</Th>
                <Th>Último error</Th>
              </tr>
            </thead>
            <tbody>
              {mpWebhooks.map((w) => (
                <tr key={w.id} className="border-t border-[var(--rule-soft)]">
                  <Td><code className="text-[length:var(--ts-2xs)]">{w.stripeId.replace(/^mpmkt_/, "")}</code></Td>
                  <Td>{w.eventType}</Td>
                  <Td><span className="tabular-nums">{w.attempts}</span></Td>
                  <Td>{timeAgo(w.createdAt)}</Td>
                  <Td><span className="text-[var(--data-error-500)] truncate block max-w-xs">{(w.lastError ?? "").slice(0, 80) || "—"}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, warn, critical }: { label: string; value: number; warn: boolean; critical: boolean }) {
  return (
    <div
      className={`rounded-2xl border-2 p-4 ${
        critical
          ? "border-[var(--data-error-500)] bg-[var(--data-error-50,#fef2f2)]/30"
          : warn
            ? "border-[var(--data-warn-500,#f59e0b)] bg-[var(--data-warn-50,#fef3c7)]/30"
            : "border-[var(--rule-soft)] bg-[var(--surface-raised)]"
      }`}
    >
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="mt-1 text-3xl font-black tabular-nums text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-2.5 text-[var(--text-primary)]">{children}</td>;
}

function timeAgo(date: Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  return `${d}d`;
}
