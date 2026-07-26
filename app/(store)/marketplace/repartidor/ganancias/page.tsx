"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, AlertTriangle } from "@buleje/design-system/icons";
import Link from "next/link";
import {
  MotoIcon,
  CashIcon,
  PackageIcon,
  TrendIcon,
  CalendarIcon,
  StarBadge,
  PinIcon,
  CheckBadge,
  TimerIcon,
  LiveSignal,
} from "@/components/delivery/icons";

interface Assignment {
  id: string;
  orderId: string;
  status: string;
  fee: number;
  deliveredAt: string | null;
  createdAt: string;
  order?: { customerName: string; total: number };
}

interface DriverStats {
  partner: { id: string; name: string; rating: number; zone: string; vehicleType: string };
  assignments: Assignment[];
  totals: { earned: number; pending: number; deliveries: number; avgFee: number };
}

const PERIODS: { id: "hoy" | "semana" | "mes"; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mes" },
];

export default function GananciasRepartidorPage() {
  const searchParams = useSearchParams();
  const partnerId = searchParams.get("id") ?? "";

  const [data, setData] = useState<DriverStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"hoy" | "semana" | "mes">("semana");

  const fetchData = useCallback(async () => {
    if (!partnerId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/delivery/driver/${partnerId}/earnings?period=${period}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [partnerId, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Empty / error states ──────────────────────────────────
  if (!partnerId) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)] p-6">
        <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 max-w-md w-full text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--brand-secondary)]/10 text-[var(--brand-secondary)]">
            <AlertTriangle className="h-8 w-8" strokeWidth={2.25} />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-[var(--text-primary)]">
            Enlace inválido
          </h1>
          <p className="mt-2 text-base text-[var(--text-secondary)]">
            El link no contiene tu identificador. Volvé al panel del repartidor.
          </p>
          <Link
            href="/delivery-app"
            className="mt-5 inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[var(--accent)] text-base font-extrabold text-white"
          >
            Ir al panel
          </Link>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)] p-6">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-[var(--brand-secondary)]" />
          <p className="mt-3 text-base text-[var(--text-secondary)]">
            No pudimos cargar tus datos. Verificá tu enlace.
          </p>
        </div>
      </main>
    );
  }

  const { partner, assignments, totals } = data;

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[var(--accent)] to-[var(--brand-primary-light)] text-white">
        <div className="absolute -top-32 -right-24 h-80 w-80 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-white/5 blur-3xl pointer-events-none" />

        <div
          className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-10 py-8 lg:py-12"
          style={{ paddingTop: "max(32px, env(safe-area-inset-top))" }}
        >
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 lg:h-16 lg:w-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <MotoIcon className="h-8 w-8 lg:h-9 lg:w-9" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold uppercase tracking-wider text-white/85">
                Resumen de ganancias
              </p>
              <h1 className="text-2xl lg:text-3xl font-extrabold leading-tight truncate">
                {partner.name}
              </h1>
              <p className="text-sm lg:text-base font-semibold text-white/85 flex items-center gap-2 mt-0.5">
                <PinIcon className="h-4 w-4" />
                {partner.zone}
                <span className="text-white/60">·</span>
                {partner.vehicleType}
              </p>
            </div>
            <div className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/15 backdrop-blur text-sm font-extrabold">
              <StarBadge className="h-4 w-4 text-[var(--brand-secondary)]" />
              <span className="tabular-nums">{Number(partner.rating).toFixed(1)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-10 -mt-6 lg:-mt-10 relative z-10">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <Stat
            icon={<CashIcon className="h-6 w-6 text-[var(--accent)]" />}
            label="Ganado"
            value={`S/ ${Number(totals.earned).toFixed(2)}`}
            tone="accent"
          />
          <Stat
            icon={<PackageIcon className="h-6 w-6 text-[var(--brand-info)]" />}
            label="Entregas"
            value={String(totals.deliveries)}
            tone="info"
          />
          <Stat
            icon={<TrendIcon className="h-6 w-6 text-[var(--data-success-500)]" />}
            label="Promedio"
            value={`S/ ${Number(totals.avgFee).toFixed(2)}`}
            tone="success"
          />
          <Stat
            icon={<CalendarIcon className="h-6 w-6 text-[var(--brand-secondary)]" />}
            label="Pendiente"
            value={`S/ ${Number(totals.pending).toFixed(2)}`}
            tone="amber"
          />
        </div>

        {/* Period chips */}
        <div className="mt-8 flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              aria-pressed={period === p.id}
              className={`h-11 px-5 rounded-2xl text-sm font-extrabold transition-colors ${
                period === p.id
                  ? "bg-[var(--accent-600,var(--accent))] text-white shadow-md shadow-[var(--accent)]/20"
                  : "bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Historial */}
        <div className="mt-8 pb-12">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
            Historial de entregas
          </h2>
          {assignments.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-10 text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                <PackageIcon className="h-7 w-7" />
              </div>
              <p className="mt-3 text-base font-semibold text-[var(--text-secondary)]">
                Sin entregas en este periodo.
              </p>
            </div>
          ) : (
            <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] divide-y divide-[var(--rule-base)] overflow-hidden">
              {assignments.map((a) => {
                const delivered = a.status === "delivered";
                return (
                  <div key={a.id} className="flex items-center gap-3 px-4 sm:px-5 py-4">
                    <div
                      className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                        delivered
                          ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
                          : "bg-[var(--brand-secondary)]/10 text-[var(--brand-secondary)]"
                      }`}
                    >
                      {delivered ? <CheckBadge className="h-5 w-5" /> : <TimerIcon className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-extrabold text-[var(--text-primary)] truncate">
                        {a.order?.customerName ?? `Pedido #${a.orderId.slice(-6)}`}
                      </p>
                      <p className="text-sm font-semibold text-[var(--text-tertiary)]">
                        {a.deliveredAt
                          ? new Date(a.deliveredAt).toLocaleString("es-PE", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : a.status === "assigned"
                          ? "Asignado"
                          : "En camino"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-extrabold text-[var(--text-primary)] tabular-nums">
                        S/ {Number(a.fee).toFixed(2)}
                      </p>
                      <p
                        className={`text-xs font-extrabold uppercase tracking-wider mt-0.5 ${
                          delivered ? "text-[var(--data-success-500)]" : "text-[var(--brand-secondary)]"
                        }`}
                      >
                        {delivered ? "Pagado" : "Pendiente"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-center pb-10">
          <Link
            href="/delivery-app"
            className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
          >
            ← Volver al panel del repartidor
          </Link>
        </div>
      </section>
    </main>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "accent" | "info" | "success" | "amber";
}) {
  const ring: Record<typeof tone, string> = {
    accent: "bg-primary/10",
    info: "bg-[var(--brand-info)]/10",
    success: "bg-[var(--data-success-500)]/10",
    amber: "bg-[var(--brand-secondary)]/10",
  } as const;
  return (
    <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 lg:p-5">
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center mb-3 ${ring[tone]}`}>
        {icon}
      </div>
      <p className="text-2xl lg:text-3xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none">
        {value}
      </p>
      <p className="mt-1.5 text-xs lg:text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
        {label}
      </p>
    </div>
  );
}
