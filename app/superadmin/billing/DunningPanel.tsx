"use client";

import Link from "next/link";
import {
  AlertTriangle, XCircle, Clock, CreditCard,
  TrendingUp, TrendingDown, MessageSquare, ArrowRight,
} from "@buleje/design-system/icons";

// Tipos: single source en lib/billing/dunning (re-exportados para el dashboard).
import type {
  MrrMovement,
  Dunning,
  DunningKey,
} from "@/lib/billing/dunning";
export type { MrrMovement, Dunning } from "@/lib/billing/dunning";

const fmtPEN = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) : "—";

const BUCKET_META: Record<DunningKey, { icon: typeof XCircle; ring: string; accent: string }> = {
  canceling:       { icon: XCircle,       ring: "border-[var(--data-error-500)]/30",   accent: "text-[var(--data-error-600,#dc2626)]" },
  pastDue:         { icon: AlertTriangle, ring: "border-[var(--data-error-500)]/30",   accent: "text-[var(--data-error-600,#dc2626)]" },
  noPaymentMethod: { icon: CreditCard,    ring: "border-[var(--data-warning-500)]/30", accent: "text-[var(--data-warning-600,#d97706)]" },
  trialEndingSoon: { icon: Clock,         ring: "border-[var(--accent)]/30",           accent: "text-[var(--accent)]" },
};

// ─── Tira de movimiento de MRR ───────────────────────────────────────────────────
function MovementStat({ label, value, count, tone, icon: Icon }: {
  label: string; value: string; count: string; tone: "pos" | "neg" | "net"; icon: typeof TrendingUp;
}) {
  const color = tone === "pos"
    ? "text-[var(--data-success-600,#059669)]"
    : tone === "neg"
      ? "text-[var(--data-error-600,#dc2626)]"
      : "text-[var(--text-primary)]";
  return (
    <div className="flex-1 rounded-xl bg-[var(--surface-sunken)]/50 p-3">
      <p className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className={`mt-1 text-xl font-extrabold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-[var(--text-tertiary)]">{count}</p>
    </div>
  );
}

// ─── Panel principal ─────────────────────────────────────────────────────────────
export function DunningPanel({ movement, dunning }: { movement: MrrMovement; dunning: Dunning }) {
  const net = movement.netNewMRRPEN;
  return (
    <section className="space-y-4">
      {/* MRR este mes */}
      <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
            Movimiento de MRR · <span className="capitalize text-[var(--text-secondary)]">{movement.monthLabel}</span>
          </h3>
          <span className="text-xs font-bold text-[var(--text-tertiary)]">altas y fugas (sin cambios de plan)</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <MovementStat label="Nuevo" value={`+${fmtPEN(movement.newMRRPEN)}`} count={`${movement.newCount} altas pagas`} tone="pos" icon={TrendingUp} />
          <MovementStat label="En fuga" value={`−${fmtPEN(movement.churningMRRPEN)}`} count={`${movement.churningCount} cancelando`} tone="neg" icon={TrendingDown} />
          <MovementStat label="Neto" value={`${net >= 0 ? "+" : "−"}${fmtPEN(Math.abs(net))}`} count="nuevo − fuga" tone="net" icon={net >= 0 ? TrendingUp : TrendingDown} />
        </div>
      </div>

      {/* Cobranza y riesgo */}
      <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
            Cobranza y riesgo
          </h3>
          <span className="text-sm font-extrabold tabular-nums text-[var(--data-error-600,#dc2626)]">
            {fmtPEN(dunning.totalAtRiskPEN)} en riesgo
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {dunning.buckets.map((b) => {
            const meta = BUCKET_META[b.key];
            const Icon = meta.icon;
            return (
              <div key={b.key} className={`rounded-xl border ${meta.ring} bg-[var(--surface-sunken)]/30 p-3.5`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`flex items-center gap-1.5 text-sm font-extrabold ${meta.accent}`}>
                      <Icon className="h-4 w-4 shrink-0" /> {b.label}
                      <span className="rounded-full bg-[var(--surface-raised)] px-1.5 text-xs tabular-nums">{b.count}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{b.hint}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-extrabold tabular-nums ${b.kind === "opportunity" ? "text-[var(--accent)]" : meta.accent}`}>
                    {fmtPEN(b.amountPEN)}
                  </span>
                </div>

                {b.rows.length === 0 ? (
                  <p className="mt-2.5 text-xs text-[var(--text-tertiary)]">Ninguno — todo en orden.</p>
                ) : (
                  <ul className="mt-2.5 space-y-1.5">
                    {b.rows.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 rounded-lg bg-[var(--surface-raised)] px-2.5 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{r.name}</span>
                        <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{r.planLabel}</span>
                        <span className="shrink-0 text-xs tabular-nums text-[var(--text-secondary)]">
                          {b.key === "trialEndingSoon" && r.daysLeft != null ? `${r.daysLeft}d` : fmtDate(r.whenAt)}
                        </span>
                        <span className="w-16 shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text-primary)]">{fmtPEN(r.amountPEN)}</span>
                        <Link
                          href={`/superadmin/chat?tenant=${r.id}&name=${encodeURIComponent(r.name)}`}
                          title={`Contactar a ${r.name}`}
                          className="shrink-0 rounded-md p-1 text-[var(--accent)] hover:bg-primary/10"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                {b.count > b.rows.length && (
                  <Link href="/superadmin/tenants" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline">
                    Ver los {b.count} <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
