"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { Trophy, ChevronRight, RefreshCw } from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import { cn } from "@/lib/utils";

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface LoyaltySummary {
  authorized: boolean;
  points: number;
  soleEquivalent: number;
  loyaltyTier: "bronce" | "plata" | "oro";
  tierLabel: string;
  nextTier: string | null;
  progressPct: number;
  pointsNeeded: number;
  benefits: string[];
  orderTier: {
    level: string;
    label: string;
    discountPct: number;
  } | null;
  orderCount: number;
  historyTotal: number;
  error?: string;
}

/* ── Props ───────────────────────────────────────────────────────────────────── */

export interface MyFidelidadCardProps {
  /** Phone override — si no se provee, usa customer context */
  phone?: string;
  /** Versión compacta para sidebar/aside */
  compact?: boolean;
  className?: string;
}

/* ── Skeleton ────────────────────────────────────────────────────────────────── */

function FidelidadSkeleton({ compact }: { compact: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-[var(--surface-raised)] p-4",
        compact ? "space-y-2" : "space-y-3",
      )}
      aria-busy="true"
      aria-label="Cargando panel de fidelidad"
    >
      {/* Header skeleton */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-[var(--surface-sunken)] animate-pulse" />
          <div className="h-4 w-28 rounded bg-[var(--surface-sunken)] animate-pulse" />
        </div>
        <div className="h-5 w-14 rounded-full bg-[var(--surface-sunken)] animate-pulse" />
      </div>
      {/* Points skeleton */}
      <div className="h-7 w-40 rounded bg-[var(--surface-sunken)] animate-pulse" />
      {/* Bar skeleton */}
      <div className="h-2 w-full rounded-full bg-[var(--surface-sunken)] animate-pulse" />
      {/* Text skeleton */}
      <div className="h-3 w-48 rounded bg-[var(--surface-sunken)] animate-pulse" />
      {/* Buttons skeleton */}
      {!compact && (
        <div className="flex gap-2 pt-1">
          <div className="h-9 flex-1 rounded-xl bg-[var(--surface-sunken)] animate-pulse" />
          <div className="h-9 flex-1 rounded-xl bg-[var(--surface-sunken)] animate-pulse" />
        </div>
      )}
    </div>
  );
}

/* ── Tier badge ─────────────────────────────────────────────────────────────── */

function TierBadge({
  label,
  variant,
}: {
  label: string;
  variant: "loyalty" | "order";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-none",
        variant === "loyalty"
          ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
          : "bg-[var(--color-secondary)]/10 text-[var(--color-secondary)]",
      )}
    >
      {label}
    </span>
  );
}

/* ── Progress bar ────────────────────────────────────────────────────────────── */

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Progreso al siguiente nivel: ${pct}%`}
    >
      <div
        className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────────────── */

export default function MyFidelidadCard({
  phone: phoneProp,
  compact = false,
  className,
}: MyFidelidadCardProps) {
  const { customer } = useCustomer();
  const phone = phoneProp ?? customer?.phone;

  const [data, setData] = useState<LoyaltySummary | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "empty" | "ok">(
    "idle",
  );
  const abortRef = useRef<AbortController | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!phone) return;

    // Cancelar fetch anterior si existe
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus("loading");

    try {
      const res = await fetch(
        `/api/marketplace/loyalty/summary`,
        {
          signal: ctrl.signal,
          headers: { "x-tenant-id": "main" },
          credentials: "include",
        },
      );

      if (ctrl.signal.aborted) return;

      if (res.status === 401) {
        // No session — renderizar null (manejado arriba en el componente)
        setData(null);
        setStatus("idle");
        return;
      }

      if (!res.ok) {
        setStatus("error");
        return;
      }

      const json: LoyaltySummary = await res.json();

      if (!json.authorized) {
        setData(null);
        setStatus("idle");
        return;
      }

      if (json.error) {
        setStatus("error");
        return;
      }

      setData(json);
      setStatus(json.points === 0 && json.historyTotal === 0 ? "empty" : "ok");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setStatus("error");
    }
  }, [phone]);

  // Fetch on mount
  useEffect(() => {
    fetchSummary();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchSummary]);

  // Refresh on tab focus (no polling)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        fetchSummary();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchSummary]);

  // No session o aún inicializando sin phone → no renderizar
  if (!phone || status === "idle") return null;

  // Loading skeleton
  if (status === "loading" && !data) {
    return <FidelidadSkeleton compact={compact} />;
  }

  // Error state
  if (status === "error") {
    return (
      <div
        className={cn(
          "flex items-center justify-between rounded-2xl bg-[var(--surface-raised)] px-4 py-3",
          className,
        )}
        role="alert"
      >
        <p className="text-sm text-[var(--text-secondary)]">
          No pudimos cargar tu panel de fidelidad.
        </p>
        <button
          onClick={fetchSummary}
          className="ml-3 flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] min-h-[44px]"
          aria-label="Reintentar cargar fidelidad"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.25} />
          Reintentar
        </button>
      </div>
    );
  }

  // Empty state — versión mini para el strip compacto (Brandon 2026-06-06)
  if (status === "empty" && compact) {
    return (
      <Link
        href="/marketplace"
        aria-label="Mi Fidelidad — tu primera compra te da 100 puntos de bienvenida"
        className={cn(
          "group flex h-16 items-center gap-2.5 rounded-2xl bg-[var(--surface-raised)] px-3 transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]",
          className,
        )}
      >
        <span
          aria-hidden
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-white"
        >
          <Trophy className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-extrabold text-[var(--text-primary)]">
            Mi Fidelidad
          </span>
          <span className="block truncate text-xs font-medium text-[var(--text-secondary)]">
            Tu 1ª compra te da <strong className="text-[var(--accent)]">100 pts</strong> de regalo
          </span>
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
          strokeWidth={2.75}
          aria-hidden
        />
      </Link>
    );
  }

  // Empty state
  if (status === "empty") {
    return (
      <div
        className={cn(
          "rounded-2xl bg-[var(--surface-raised)] px-4 py-4",
          className,
        )}
        aria-label="Panel de fidelidad — sin puntos aún"
      >
        <div className="flex items-center gap-2 mb-2">
          <Trophy
            className="h-5 w-5 text-[var(--color-primary)]"
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            Mi Fidelidad
          </span>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Aún no tienes puntos. Tu primera compra te da{" "}
          <strong className="text-[var(--text-primary)]">100 de bienvenida</strong>.
        </p>
        <Link
          href="/marketplace"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          aria-label="Ir al catálogo para hacer tu primera compra"
        >
          Ver productos
          <ChevronRight className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  if (!data) return null;

  // ── Compact: mini-card h-16 (Brandon 2026-06-06) — una fila, toda
  // clickeable → panel de fidelidad. Uniforme con Racha y Tienda de la
  // semana en el strip del inicio del marketplace. ─────────────────────────
  if (compact) {
    return (
      <Link
        href="/marketplace/mi-cuenta/fidelidad"
        aria-label={`Mi Fidelidad — ${data.points.toLocaleString("es-PE")} puntos (S/${data.soleEquivalent.toFixed(2)}). Ver panel completo`}
        className={cn(
          "group flex h-16 items-center gap-2.5 rounded-2xl bg-[var(--surface-raised)] px-3 transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]",
          className,
        )}
      >
        <span
          aria-hidden
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-white"
        >
          <Trophy className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>

        <span className="min-w-0 flex-1 leading-tight">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-extrabold text-[var(--text-primary)] tabular-nums">
              {data.points.toLocaleString("es-PE")} pts
            </span>
            <TierBadge label={data.tierLabel} variant="loyalty" />
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <span
                className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
                style={{ width: `${data.progressPct}%` }}
              />
            </span>
            <span className="truncate text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] tabular-nums">
              S/{data.soleEquivalent.toFixed(2)} para canjear
            </span>
          </span>
        </span>

        <ChevronRight
          className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
          strokeWidth={2.75}
          aria-hidden
        />
      </Link>
    );
  }

  // ── Full card ────────────────────────────────────────────────────────────────
  return (
    <article
      className={cn(
        "rounded-2xl bg-[var(--surface-raised)] p-4",
        compact ? "space-y-2.5" : "space-y-3",
        className,
      )}
      aria-label="Mi panel de fidelidad"
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy
            className="h-5 w-5 shrink-0 text-[var(--color-primary)]"
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            Mi Fidelidad
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <TierBadge label={data.tierLabel} variant="loyalty" />
          {data.orderTier && (
            <TierBadge label={data.orderTier.label} variant="order" />
          )}
        </div>
      </div>

      {/* ── Puntos + equivalencia ── */}
      <div>
        <p className="text-2xl font-bold leading-none text-[var(--text-primary)]" aria-label={`${data.points.toLocaleString("es-PE")} puntos acumulados`}>
          {data.points.toLocaleString("es-PE")}{" "}
          <span className="text-base font-semibold text-[var(--color-primary)]">
            puntos
          </span>
        </p>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
          Equivalen a{" "}
          <strong className="text-[var(--text-primary)]">
            S/{data.soleEquivalent.toFixed(2)}
          </strong>{" "}
          disponibles para canjear
        </p>
      </div>

      {/* ── Barra de progreso ── */}
      {!compact && (
        <>
          <ProgressBar pct={data.progressPct} />
          {data.nextTier && data.pointsNeeded > 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              Faltan{" "}
              <strong className="text-[var(--text-primary)]">
                {data.pointsNeeded.toLocaleString("es-PE")} puntos
              </strong>{" "}
              para{" "}
              <span className="font-semibold text-[var(--color-primary)]">
                {data.nextTier}
              </span>
            </p>
          ) : (
            <p className="text-xs font-semibold text-[var(--color-primary)]">
              Nivel maximo alcanzado
            </p>
          )}
        </>
      )}

      {/* ── Beneficios actuales ── */}
      {!compact && data.benefits.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Beneficios actuales
          </p>
          <ul className="space-y-0.5" aria-label="Tus beneficios actuales">
            {data.benefits.map((b) => (
              <li
                key={b}
                className="flex items-start gap-1.5 text-xs text-[var(--text-secondary)]"
              >
                <span
                  className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]"
                  aria-hidden="true"
                />
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Descuento por tier de pedidos */}
      {!compact && data.orderTier && (
        <p className="rounded-xl bg-[var(--color-secondary)]/10 px-3 py-2 text-xs font-semibold text-[var(--color-secondary)]">
          {data.orderTier.discountPct}% de descuento aplicado en tu próximo
          pedido como {data.orderTier.label}
        </p>
      )}

      {/* ── CTAs ── */}
      {!compact && (
        <div className="flex gap-2 pt-0.5">
          <Link
            href="/marketplace/mi-cuenta/fidelidad"
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--rule-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            aria-label="Ver historial completo de puntos"
          >
            Ver historial
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
          </Link>
          <Link
            href="/marketplace/mi-cuenta/canjear"
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover,var(--color-primary))]/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            aria-label="Canjear puntos ahora"
          >
            Canjear ahora
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Compact: solo enlace inline */}
      {compact && (
        <Link
          href="/marketplace/mi-cuenta/fidelidad"
          className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-[var(--rule-base)] px-3 py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          aria-label="Ver mi panel de fidelidad completo"
        >
          Ver panel completo
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}
