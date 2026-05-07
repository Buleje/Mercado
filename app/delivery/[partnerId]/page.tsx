"use client";

import { useEffect, useState, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { useParams } from "next/navigation";
import { Loader2, AlertTriangle, ArrowRight } from "@buleje/design-system/icons";
import {
  MotoIcon,
  PinIcon,
  PackageIcon,
  CheckBadge,
  CashIcon,
  PhoneRing,
  RouteIcon,
  TimerIcon,
  LiveSignal,
  EmptyRoadIllustration,
} from "@/components/delivery/icons";

interface Assignment {
  id: string;
  orderId: string;
  status: string;
  fee: number;
  createdAt: string;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  customerName: string;
  customerPhone: string | null;
  customerLocation: string | null;
  orderTotal: number;
  orderStatus: string;
  items: { name: string; quantity: number }[];
}

interface DriverData {
  partner: { id: string; name: string };
  stats: { todayDelivered: number; pending: number; todayEarnings: number };
  assignments: Assignment[];
}

const STATUS_CFG: Record<string, { label: string; tone: "amber" | "blue" | "accent" | "success" | "muted"; icon: React.ComponentType<{ className?: string }>; next?: string; nextLabel?: string }> = {
  assigned:   { label: "Asignado",  tone: "amber",   icon: TimerIcon,   next: "picked_up",  nextLabel: "Recogí el pedido" },
  picked_up:  { label: "Recogido",  tone: "blue",    icon: PackageIcon, next: "in_transit", nextLabel: "Estoy en camino" },
  in_transit: { label: "En camino", tone: "accent",  icon: MotoIcon,    next: "delivered",  nextLabel: "Entregué el pedido" },
  delivered:  { label: "Entregado", tone: "success", icon: CheckBadge },
};

const TONE_BG: Record<NonNullable<typeof STATUS_CFG[string]["tone"]>, string> = {
  amber: "bg-[var(--brand-secondary)]/10 text-[var(--brand-secondary)]",
  blue: "bg-[var(--brand-info)]/10 text-[var(--brand-info)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  success: "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]",
  muted: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
};

function getStatus(s: string) {
  return STATUS_CFG[s] ?? STATUS_CFG["assigned"];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `hace ${hrs}h ${mins % 60}m`;
}

export default function DriverDashboardPage() {
  const params = useParams<{ partnerId: string }>();
  const partnerId = params.partnerId;

  const [data, setData] = useState<DriverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/delivery/driver/${partnerId}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Error al cargar datos");
        return;
      }
      const json = (await res.json()) as DriverData;
      setData(json);
      setError(null);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    void fetchData();
    const timer = setInterval(fetchData, 30_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const updateStatus = async (assignmentId: string, newStatus: string) => {
    setUpdatingId(assignmentId);
    try {
      const res = await fetch(`/api/delivery/driver/${partnerId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ assignmentId, status: newStatus }),
      });
      if (res.ok) await fetchData();
    } catch { /* silent */ }
    setUpdatingId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 text-[var(--accent)] animate-spin" />
          <p className="text-base font-bold text-[var(--text-secondary)]">Cargando entregas…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)] p-6">
        <div className="max-w-md w-full bg-[var(--surface-raised)] rounded-3xl border-2 border-[var(--rule-base)] p-8 text-center">
          <AlertTriangle className="h-14 w-14 text-[var(--brand-secondary)] mx-auto mb-3" />
          <h2 className="text-xl font-extrabold text-[var(--text-primary)]">¡Ups!</h2>
          <p className="text-base text-[var(--text-secondary)] mt-1">
            {error ?? "No se encontró el repartidor"}
          </p>
          <button
            type="button"
            onClick={() => { setLoading(true); setError(null); fetchData(); }}
            className="mt-5 inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[var(--accent)] text-base font-extrabold text-white"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const active = data.assignments.filter((a) => a.status !== "delivered");
  const completed = data.assignments.filter((a) => a.status === "delivered");

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ── Hero header ─────────────────────────────────── */}
      <div className="bg-gradient-to-br from-[var(--accent)] to-[var(--brand-primary-light)] text-white relative overflow-hidden">
        <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-white/5 blur-3xl pointer-events-none" />

        <div
          className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10 relative"
          style={{ paddingTop: "max(24px, env(safe-area-inset-top))" }}
        >
          <div className="flex items-center gap-3 lg:gap-4 mb-5">
            <div className="h-14 w-14 lg:h-16 lg:w-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <MotoIcon className="h-8 w-8 lg:h-9 lg:w-9" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold uppercase tracking-wider text-white/80">
                Panel de entregas
              </p>
              <h1 className="text-2xl lg:text-3xl font-extrabold leading-tight truncate">
                Hola, {data.partner.name}
              </h1>
            </div>
            <span className="hidden sm:inline-flex items-center gap-2 h-9 px-3 rounded-full bg-white/15 backdrop-blur text-sm font-extrabold">
              <LiveSignal className="h-2.5 w-2.5" active />
              En vivo
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 lg:gap-4">
            <HeroStat
              icon={<TimerIcon className="h-5 w-5" />}
              value={String(data.stats.pending)}
              label="Pendientes"
            />
            <HeroStat
              icon={<CheckBadge className="h-5 w-5" />}
              value={String(data.stats.todayDelivered)}
              label="Entregados hoy"
            />
            <HeroStat
              icon={<CashIcon className="h-5 w-5" />}
              value={`S/ ${Number(data.stats.todayEarnings).toFixed(0)}`}
              label="Ganado hoy"
            />
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10 space-y-8">
        {active.length > 0 ? (
          <section>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
              Entregas activas ({active.length})
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {active.map((a) => (
                <ActiveCard
                  key={a.id}
                  a={a}
                  updating={updatingId === a.id}
                  onAdvance={(next) => updateStatus(a.id, next)}
                />
              ))}
            </div>
          </section>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-10 text-center">
            <div className="text-[var(--accent)]">
              <EmptyRoadIllustration className="h-32 w-32 mx-auto" />
            </div>
            <h3 className="mt-4 text-xl font-extrabold text-[var(--text-primary)]">¡Todo al día!</h3>
            <p className="mt-1 text-base text-[var(--text-secondary)]">
              No tienes entregas pendientes en este momento.
            </p>
          </div>
        )}

        {completed.length > 0 && (
          <section>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
              Completadas ({completed.length})
            </h2>
            <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] divide-y divide-[var(--rule-base)] overflow-hidden">
              {completed.map((a) => (
                <div key={a.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="h-10 w-10 rounded-xl bg-[var(--data-success-500)]/10 text-[var(--data-success-500)] flex items-center justify-center shrink-0">
                    <CheckBadge className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-[var(--text-primary)] truncate">
                      {a.customerName}
                    </p>
                    <p className="text-sm font-semibold text-[var(--text-tertiary)]">
                      {a.deliveredAt
                        ? new Date(a.deliveredAt).toLocaleTimeString("es-PE", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </p>
                  </div>
                  <span className="text-base font-extrabold text-[var(--data-success-500)] tabular-nums shrink-0">
                    +S/ {Number(a.fee).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="text-center text-sm font-semibold text-[var(--text-tertiary)] pb-4">
          Se actualiza cada 30 segundos
        </p>
      </div>
    </div>
  );
}

function HeroStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl bg-white/15 backdrop-blur p-3 lg:p-4">
      <div className="flex items-center gap-2 mb-1 text-white/85">
        {icon}
        <span className="text-xs font-extrabold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl lg:text-3xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function ActiveCard({
  a,
  updating,
  onAdvance,
}: {
  a: Assignment;
  updating: boolean;
  onAdvance: (next: string) => void;
}) {
  const cfg = getStatus(a.status);
  const Icon = cfg.icon;
  return (
    <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-extrabold uppercase tracking-wider ${TONE_BG[cfg.tone]}`}>
            <Icon className="h-4 w-4" />
            {cfg.label}
          </span>
          <span className="text-xs font-bold text-[var(--text-tertiary)]">
            {timeAgo(a.createdAt)}
          </span>
        </div>

        <div className="space-y-2">
          <p className="text-lg font-extrabold text-[var(--text-primary)]">
            {a.customerName}
          </p>
          {a.customerLocation && (
            <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <PinIcon className="h-4 w-4 text-[var(--brand-danger)] shrink-0 mt-0.5" />
              <span className="font-semibold">{a.customerLocation}</span>
            </div>
          )}
          {a.items.length > 0 && (
            <p className="text-sm font-semibold text-[var(--text-tertiary)] line-clamp-2">
              {a.items.map((i) => `${i.quantity}x ${i.name}`).join(" · ")}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between text-base">
          <span className="font-bold text-[var(--text-secondary)]">
            Total: S/ {Number(a.orderTotal).toFixed(2)}
          </span>
          <span className="font-extrabold text-[var(--accent)]">
            Comisión: S/ {Number(a.fee).toFixed(2)}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {a.customerPhone && (
            <a
              href={`tel:${a.customerPhone}`}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-[var(--surface-sunken)] text-sm font-extrabold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] border-2 border-[var(--rule-base)]"
            >
              <PhoneRing className="h-4 w-4" />
              Llamar
            </a>
          )}
          {a.customerLocation && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.customerLocation)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-[var(--accent-soft)] text-sm font-extrabold text-[var(--accent)]"
            >
              <RouteIcon className="h-4 w-4" />
              Mapa
            </a>
          )}
          {cfg.next && (
            <button
              type="button"
              onClick={() => onAdvance(cfg.next!)}
              disabled={updating}
              className="ml-auto inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--brand-primary-light)] disabled:opacity-50 text-white text-sm font-extrabold transition-colors"
            >
              {updating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {cfg.nextLabel}
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
