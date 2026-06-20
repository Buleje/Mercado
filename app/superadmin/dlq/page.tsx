import "server-only";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Suspense } from "react";
import Link from "next/link";
import { CheckCircle2 } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { getDeadLetterDashboard } from "@/lib/db/dlq.db";
import { DLQExport } from "./DLQExport";
import { DLQEvents } from "./DLQEvents";
import { SUPERADMIN_PAGE, SUPERADMIN_HERO, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";

// Next 16 (CLAUDE.md #4): NO usar `force-dynamic`. Dejamos sin "use cache"
// para que el RSC re-renderice a cada request (panel ops, datos frescos).

/**
 * /superadmin/dlq
 *
 * Dashboard del Dead Letter Queue persistente. Las queries viven en
 * `lib/db/dlq.db.ts` (audit P0 #5 — antes eran prisma directo aquí).
 *
 * Acciones por entry: ver detalle, marcar como resuelto, o reintentar.
 * Si los items se acumulan sin resolverse = señal de bug sistemático en
 * el handler o servicio externo caído.
 *
 * Scope: superadmin only — vista cross-tenant.
 */
export default async function DLQDashboardPage() {
  // requirePlatformPage lee de cookies en SSR + redirige a /superadmin/login si no auth
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      {/* Hero canónico (lib/superadmin-layout) — barra surface-raised + border-b,
          igual que marca/billing/marketplace. Antes dlq tenía un header inline
          plano que rompía la continuidad visual al cambiar de tab. */}
      <header className={SUPERADMIN_HERO}>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
              Superadmin · Operations
            </p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.025em] text-[var(--text-primary)] leading-none inline-flex items-center gap-2 flex-wrap">
              Dead Letter Queue
            
            <InfoTip side="bottom" title="Dead Letter Queue" what="Lista los jobs en segundo plano que fallaron tras varios reintentos (envíos, webhooks, colas)." affects="Solo monitoreo interno. Un job acá significa que algo no se completó y conviene reintentarlo." example="Si falla el email de bienvenida 3 veces, cae acá para reintentarlo o investigar." />
          </h1>
            <p className="mt-2 max-w-2xl text-[length:var(--ts-sm)] text-[var(--text-secondary)]">
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
        </div>
      </header>

      {/* Suspense: el shell + header se pintan al instante; el body (query
          cross-tenant pesada) muestra skeleton mientras carga. */}
      <div className={`${SUPERADMIN_CONTENT} space-y-8`}>
        <Suspense fallback={<DLQSkeleton />}>
          <DLQBody />
        </Suspense>
      </div>
    </div>
  );
}

async function DLQBody() {
  const { events, crons, mpWebhooks } = await getDeadLetterDashboard();

  // Filas aplanadas para el CSV unificado (categoría + campos comunes).
  const csvRows: (string | number)[][] = [
    ...events.map((e) => [
      "Evento",
      e.eventType,
      e.handlerName,
      e.attemptCount,
      new Date(e.failedAt).toISOString(),
      e.lastError,
    ]),
    ...crons.map((c) => [
      "Cron",
      c.jobName,
      "",
      c.attempts,
      new Date(c.createdAt).toISOString(),
      c.error,
    ]),
    ...mpWebhooks.map((w) => [
      "MP Webhook",
      w.stripeId,
      w.eventType,
      w.attempts,
      new Date(w.createdAt).toISOString(),
      w.lastError ?? "",
    ]),
  ];

  return (
    <>
      <div className="flex justify-end">
        <DLQExport
          headers={[
            "Categoría",
            "Identificador",
            "Detalle",
            "Intentos",
            "Fecha",
            "Error",
          ]}
          rows={csvRows}
        />
      </div>

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

      {/* Eventos de dominio — accionable (resolver / reintentar) */}
      <DLQEvents />

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
          <div className="px-5 py-8 flex items-center justify-center gap-2 text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Sin crons fallidos recientes
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
          <div className="px-5 py-8 flex items-center justify-center gap-2 text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Sin webhooks pendientes
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
    </>
  );
}

function DLQSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 h-24"
          />
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] h-48"
        />
      ))}
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
            ? "border-[#0d9488] bg-[#0d9488]/30"
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
