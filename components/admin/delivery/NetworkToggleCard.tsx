"use client";

/**
 * NetworkToggleCard — toggle por tenant para opt-in/out de la red de
 * repartidores Buleje.
 *
 * Si está ACTIVADA: los pedidos del negocio se ofrecen a riders cross-tenant
 * (DeliveryPartner registrados en /delivery-app), y la tienda aparece en su
 * mapa con su logo + frecuencia de pedidos.
 *
 * Si está DESACTIVADA: solo los repartidores propios del tenant atienden los
 * pedidos. La tienda NO aparece en el mapa Buleje ni en hot-zones.
 *
 * Brandon mayo 2026 v7. Endpoint: /api/admin/delivery/network-toggle.
 */

import { useEffect, useState, useCallback } from "react";
import { Truck, Loader2, AlertTriangle, CheckCircle2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { tenantFetch } from "@/lib/tenant-fetch";

export default function NetworkToggleCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tenantFetch("/api/admin/delivery/network-toggle");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { enabled: boolean };
      setEnabled(json.enabled);
    } catch {
      setError("No se pudo cargar la configuración");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSelect = useCallback(
    async (next: boolean) => {
      if (next === enabled || saving) return;
      setSaving(true);
      setError(null);
      try {
        const res = await tenantFetch("/api/admin/delivery/network-toggle", {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ enabled: next }),
        });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { enabled: boolean };
        setEnabled(json.enabled);
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), 2800);
      } catch {
        setError("No se pudo guardar el cambio");
      } finally {
        setSaving(false);
      }
    },
    [enabled, saving],
  );

  return (
    <section
      aria-labelledby="network-toggle-title"
      className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6"
    >
      <header className="flex items-start gap-3 mb-5">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <Truck className="h-6 w-6" strokeWidth={2.25} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2
            id="network-toggle-title"
            className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] leading-tight"
          >
            Red de repartidores Buleje
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">
            Si activás esta opción, los repartidores de Buleje verán tu tienda en su mapa y podrán aceptar tus pedidos. Si la desactivás, solo tus repartidores propios atienden.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] py-6 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Cargando configuración…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <OptionRadio
            label="Activada"
            description="Tu tienda aparece en /delivery-app · pedidos van a la red Buleje apenas se confirman."
            selected={enabled === true}
            disabled={saving}
            tone="accent"
            onClick={() => handleSelect(true)}
          />
          <OptionRadio
            label="Desactivada"
            description="Solo tus repartidores propios verán los pedidos. Tu tienda no aparece en el mapa de Buleje Delivery."
            selected={enabled === false}
            disabled={saving}
            tone="neutral"
            onClick={() => handleSelect(false)}
          />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--brand-danger)]/10 border-2 border-[var(--brand-danger)]/30 px-3 py-2 text-sm font-bold text-[var(--brand-danger)]"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {error}
        </p>
      )}

      {toastVisible && (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--data-success-500)]/10 border-2 border-[var(--data-success-500)]/30 px-3 py-2 text-sm font-bold text-[var(--data-success-500)]"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Cambio guardado
        </p>
      )}
    </section>
  );
}

function OptionRadio({
  label,
  description,
  selected,
  disabled,
  tone,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  tone: "accent" | "neutral";
  onClick: () => void;
}) {
  const borderClass = selected
    ? tone === "accent"
      ? "border-[var(--accent)] bg-primary/10"
      : "border-[var(--text-secondary)] bg-[var(--surface-sunken)]"
    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--text-tertiary)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`text-left rounded-xl border-2 p-4 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${borderClass}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          aria-hidden
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full border-2 ${
            selected
              ? tone === "accent"
                ? "border-[var(--accent)] bg-[var(--accent)]"
                : "border-[var(--text-secondary)] bg-[var(--text-secondary)]"
              : "border-[var(--rule-strong)] bg-transparent"
          }`}
        >
          {selected && <span className="block h-2 w-2 rounded-full bg-white" />}
        </span>
        <span className="text-base font-extrabold text-[var(--text-primary)]">
          {label}
        </span>
      </div>
      <p className="text-sm text-[var(--text-secondary)] leading-snug">
        {description}
      </p>
    </button>
  );
}
