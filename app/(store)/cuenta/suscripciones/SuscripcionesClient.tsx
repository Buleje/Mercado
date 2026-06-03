"use client";

/**
 * SuscripcionesClient — Dashboard del cliente para "Bodega al Mes".
 *
 * Rediseño 2026-06-02: dashboard tipo app — resumen con el AHORRO como
 * protagonista (card accent) + segmented control de estados + grid de cards.
 * Chrome del layout (store): no renderiza Header/Footer propios. Sin breadcrumb
 * duplicado ni back-link redundante.
 *
 * Todo el state corre desde el SubscriptionContext (localStorage + tenantKey).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wallet, PackageCheck, CalendarClock, Plus } from "@buleje/design-system/icons";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import { useSubscriptions, type SubscriptionStatus } from "@/contexts/subscription-context";
import SubscriptionCard from "@/components/customer/suscripciones/SubscriptionCard";
import SubscriptionEmpty from "@/components/customer/suscripciones/SubscriptionEmpty";
import ChangeFrequencyModal from "@/components/customer/suscripciones/ChangeFrequencyModal";
import CancelConfirmModal from "@/components/customer/suscripciones/CancelConfirmModal";
import RelatedFeatures from "@/components/ui-system/RelatedFeatures";
import { relatedFor } from "@/lib/navigation/feature-registry";
import { cn } from "@/lib/utils";

type FilterTab = SubscriptionStatus;
type SortMode = "nextDelivery" | "recent";

const TABS: { id: FilterTab; label: string }[] = [
  { id: "active", label: "Activas" },
  { id: "paused", label: "Pausadas" },
  { id: "cancelled", label: "Canceladas" },
];

const CARD = "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]";

const fmtMoney = (n: number) => `S/ ${Math.round(n || 0)}`;

function fmtNextDelivery(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
  } catch {
    return "—";
  }
}

export default function SuscripcionesClient() {
  const {
    subscriptions,
    hydrated,
    pause,
    resume,
    cancel,
    skipNextDelivery,
    changeFrequency,
    projectedYearlySavings,
    activeCount,
    upcomingDelivery,
  } = useSubscriptions();

  const [activeTab, setActiveTab] = useState<FilterTab>("active");
  const [sortMode, setSortMode] = useState<SortMode>("nextDelivery");
  const [freqModalId, setFreqModalId] = useState<string | null>(null);
  const [cancelModalId, setCancelModalId] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      active: subscriptions.filter((s) => s.status === "active").length,
      paused: subscriptions.filter((s) => s.status === "paused").length,
      cancelled: subscriptions.filter((s) => s.status === "cancelled").length,
    }),
    [subscriptions],
  );

  const filtered = useMemo(() => {
    const byStatus = subscriptions.filter((s) => s.status === activeTab);
    if (sortMode === "nextDelivery") {
      return [...byStatus].sort(
        (a, b) => new Date(a.nextDelivery).getTime() - new Date(b.nextDelivery).getTime(),
      );
    }
    return [...byStatus].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [subscriptions, activeTab, sortMode]);

  const freqModalSub = freqModalId ? subscriptions.find((s) => s.id === freqModalId) ?? null : null;
  const cancelModalSub = cancelModalId ? subscriptions.find((s) => s.id === cancelModalId) ?? null : null;

  const hasSubs = hydrated && subscriptions.length > 0;

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <BreadcrumbSchema
        visible={false}
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi Cuenta", url: "https://www.buleje.pe/cuenta" },
          { name: "Bodega al Mes", url: "https://www.buleje.pe/cuenta/suscripciones" },
        ]}
      />

      {/* Breadcrumb */}
      <div className="border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-5xl px-4 py-3 sm:px-6">
          <Breadcrumbs items={[{ label: "Mi cuenta", href: "/cuenta" }, { label: "Bodega al Mes" }]} />
        </div>
      </div>

      <main id="main-content" className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
        {/* Encabezado */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[var(--ls-wide)] text-[var(--accent)]">
              Bodega al Mes
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] sm:text-4xl">
              Mis suscripciones
            </h1>
            <p className="mt-2 max-w-xl text-base text-[var(--text-secondary)]">
              Tus productos recurrentes llegan solos. Ahorrás 5% en cada entrega y pausás o
              cancelás cuando quieras.
            </p>
          </div>
          <Link
            href="/tienda"
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-base font-bold text-white shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} /> Nueva suscripción
          </Link>
        </header>

        {/* Resumen — el ahorro es protagonista */}
        {hasSubs && (
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="relative overflow-hidden rounded-2xl bg-[var(--accent)] p-5 text-white shadow-[var(--shadow-md)]">
              <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-white/85">Ahorro anual estimado</p>
                  <p className="mt-1 text-4xl font-extrabold tabular-nums">{fmtMoney(projectedYearlySavings)}</p>
                  <p className="mt-1 text-sm text-white/80">Si mantenés tus activas</p>
                </div>
                <Wallet className="h-6 w-6 text-white/80" strokeWidth={2} />
              </div>
            </div>

            <div className={`${CARD} p-5`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-[var(--text-tertiary)]">Suscripciones activas</p>
                  <p className="mt-1 text-4xl font-extrabold tabular-nums text-[var(--text-primary)]">{activeCount}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {activeCount > 0 ? "Llegan solas, en su frecuencia" : "Sin suscripciones activas"}
                  </p>
                </div>
                <PackageCheck className="h-6 w-6 text-[var(--accent)]" strokeWidth={2} />
              </div>
            </div>

            <div className={`${CARD} p-5`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-[var(--text-tertiary)]">Próxima entrega</p>
                  <p className="mt-1 text-4xl font-extrabold tabular-nums text-[var(--text-primary)]">
                    {fmtNextDelivery(upcomingDelivery?.nextDelivery)}
                  </p>
                  <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">
                    {upcomingDelivery?.productName ?? "Sin entregas próximas"}
                  </p>
                </div>
                <CalendarClock className="h-6 w-6 text-[var(--accent)]" strokeWidth={2} />
              </div>
            </div>
          </section>
        )}

        {/* Segmented control + sort */}
        {hasSubs && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex w-full rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-1 sm:w-auto" role="tablist">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors sm:flex-none",
                      isActive
                        ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    {tab.label}
                    <span
                      className={cn(
                        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-extrabold tabular-nums",
                        isActive ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--rule-soft)] text-[var(--text-tertiary)]",
                      )}
                    >
                      {counts[tab.id]}
                    </span>
                  </button>
                );
              })}
            </div>

            <label htmlFor="sub-sort" className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold text-[var(--text-tertiary)]">Ordenar</span>
              <select
                id="sub-sort"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              >
                <option value="nextDelivery">Próxima entrega</option>
                <option value="recent">Más recientes</option>
              </select>
            </label>
          </div>
        )}

        {/* Contenido */}
        {!hydrated ? (
          <div className={`${CARD} px-6 py-16 text-center`}>
            <p className="text-base text-[var(--text-tertiary)]">Cargando tus suscripciones…</p>
          </div>
        ) : subscriptions.length === 0 ? (
          <SubscriptionEmpty />
        ) : filtered.length === 0 ? (
          <div className={`${CARD} px-6 py-10 text-center`}>
            <p className="text-base font-bold text-[var(--text-primary)]">Nada por aquí</p>
            <p className="mt-1 text-base text-[var(--text-secondary)]">
              No tienes suscripciones{" "}
              {activeTab === "active" ? "activas" : activeTab === "paused" ? "pausadas" : "canceladas"}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filtered.map((sub) => (
              <SubscriptionCard
                key={sub.id}
                subscription={sub}
                onPause={() => pause(sub.id)}
                onResume={() => resume(sub.id)}
                onCancel={() => setCancelModalId(sub.id)}
                onSkipNext={() => skipNextDelivery(sub.id)}
                onChangeFrequency={() => setFreqModalId(sub.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      {freqModalSub && (
        <ChangeFrequencyModal
          subscription={freqModalSub}
          onClose={() => setFreqModalId(null)}
          onConfirm={(freq) => {
            changeFrequency(freqModalSub.id, freq);
            setFreqModalId(null);
          }}
        />
      )}
      {cancelModalSub && (
        <CancelConfirmModal
          subscription={cancelModalSub}
          onClose={() => setCancelModalId(null)}
          onConfirm={() => {
            cancel(cancelModalSub.id);
            setCancelModalId(null);
          }}
        />
      )}

      <RelatedFeatures features={relatedFor("bodega-al-mes")} />
    </div>
  );
}
