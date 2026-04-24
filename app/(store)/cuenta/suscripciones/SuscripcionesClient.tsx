"use client";

/**
 * SuscripcionesClient — Dashboard del cliente para "Bodega al Mes".
 *
 * Tabs: Activas / Pausadas / Canceladas
 * Acciones por card: Pausar, Reanudar, Cancelar, Saltar próxima, Cambiar frecuencia.
 *
 * Todo el state corre desde el SubscriptionContext (localStorage + tenantKey).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import { ArrowLeft } from "@buleje/design-system/icons";
import { useSubscriptions, type SubscriptionStatus } from "@/contexts/subscription-context";
import SuscripcionesHero from "@/components/customer/suscripciones/SuscripcionesHero";
import SubscriptionCard from "@/components/customer/suscripciones/SubscriptionCard";
import SubscriptionEmpty from "@/components/customer/suscripciones/SubscriptionEmpty";
import ChangeFrequencyModal from "@/components/customer/suscripciones/ChangeFrequencyModal";
import CancelConfirmModal from "@/components/customer/suscripciones/CancelConfirmModal";
import SavingsStats from "@/components/customer/suscripciones/SavingsStats";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
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

export default function SuscripcionesClient() {
  const {
    subscriptions,
    hydrated,
    pause,
    resume,
    cancel,
    skipNextDelivery,
    changeFrequency,
  } = useSubscriptions();

  const [activeTab, setActiveTab] = useState<FilterTab>("active");
  const [sortMode, setSortMode] = useState<SortMode>("nextDelivery");
  const [freqModalId, setFreqModalId] = useState<string | null>(null);
  const [cancelModalId, setCancelModalId] = useState<string | null>(null);

  const counts = useMemo(() => {
    return {
      active: subscriptions.filter((s) => s.status === "active").length,
      paused: subscriptions.filter((s) => s.status === "paused").length,
      cancelled: subscriptions.filter((s) => s.status === "cancelled").length,
    };
  }, [subscriptions]);

  const filtered = useMemo(() => {
    const byStatus = subscriptions.filter((s) => s.status === activeTab);
    if (sortMode === "nextDelivery") {
      return byStatus.sort(
        (a, b) =>
          new Date(a.nextDelivery).getTime() -
          new Date(b.nextDelivery).getTime(),
      );
    }
    return byStatus.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [subscriptions, activeTab, sortMode]);

  const freqModalSub = freqModalId
    ? subscriptions.find((s) => s.id === freqModalId) ?? null
    : null;
  const cancelModalSub = cancelModalId
    ? subscriptions.find((s) => s.id === cancelModalId) ?? null
    : null;

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi Cuenta", url: "https://www.buleje.pe/cuenta" },
          {
            name: "Bodega al Mes",
            url: "https://www.buleje.pe/cuenta/suscripciones",
          },
        ]}
      />
      <AnnouncementBar />
      <Header />

      <div className="border-b border-[var(--rule-muted)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3">
          <Breadcrumbs
            items={[
              { label: "Mi cuenta", href: "/cuenta" },
              { label: "Bodega al Mes" },
            ]}
          />
        </div>
      </div>

      {/* Hero */}
      <SuscripcionesHero />

      <main
        id="main-content"
        className="mx-auto max-w-5xl px-4 sm:px-6 pt-6 pb-24 space-y-6"
      >
        {/* Back link */}
        <Link
          href="/cuenta"
          className={cn(
            "inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-semibold",
            "text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors",
          )}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Volver a Mi Cuenta
        </Link>

        {/* Savings stats */}
        {hydrated && subscriptions.length > 0 && <SavingsStats />}

        {/* Tabs + sort */}
        {hydrated && subscriptions.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                const count = counts[tab.id];
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    aria-pressed={isActive}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5",
                      "text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)]",
                      "whitespace-nowrap transition-colors",
                      isActive
                        ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border border-[var(--rule-base)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    {tab.label}
                    <span
                      className={cn(
                        "inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[length:var(--ts-2xs)] font-bold tabular-nums",
                        isActive
                          ? "bg-[var(--surface-canvas)]/20 text-[var(--surface-canvas)]"
                          : "bg-[var(--rule-base)] text-[var(--text-tertiary)]",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <label
              htmlFor="sub-sort"
              className="flex items-center gap-2 shrink-0"
            >
              <span className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]">
                Ordenar por
              </span>
              <select
                id="sub-sort"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className={cn(
                  "rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)]",
                  "px-3 py-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-primary)]",
                  "outline-none focus:border-[var(--rule-strong)]",
                )}
              >
                <option value="nextDelivery">Próxima entrega</option>
                <option value="recent">Más recientes</option>
              </select>
            </label>
          </div>
        )}

        {/* Content */}
        {!hydrated ? (
          <div className="py-16 text-center text-[var(--text-tertiary)] text-[length:var(--ts-sm)]">
            Cargando tus suscripciones...
          </div>
        ) : subscriptions.length === 0 ? (
          <SubscriptionEmpty />
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center">
            <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)]">
              No tienes suscripciones{" "}
              {activeTab === "active"
                ? "activas"
                : activeTab === "paused"
                  ? "pausadas"
                  : "canceladas"}
              .
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
