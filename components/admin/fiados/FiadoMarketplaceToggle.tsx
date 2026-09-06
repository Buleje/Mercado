"use client";

import { useState, useEffect, useCallback } from "react";
import { Wallet, Loader2, Check, Store } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

/**
 * FiadoMarketplaceToggle — switch self-serve del beneficio "Acepta fiado" en el
 * marketplace. Al prenderlo, la card de la tienda en /tiendas muestra el chip
 * "Acepta fiado" y aparece en el filtro homónimo.
 *
 * Fuente de verdad: `Store.benefits.acceptsFiado` vía /api/marketplace/stores/my/fiado.
 * Si el tenant aún no publicó su tienda (`hasStore=false`), el toggle se
 * deshabilita con una nota — no hay dónde mostrar el badge todavía.
 */
export default function FiadoMarketplaceToggle() {
  const [enabled, setEnabled] = useState(false);
  const [hasStore, setHasStore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/marketplace/stores/my/fiado", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        setEnabled(Boolean(data.acceptsFiado));
        setHasStore(data.hasStore !== false);
      })
      .catch((err) =>
        logger.error("[FiadoMarketplaceToggle] load failed", { error: String(err) }),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(async () => {
    if (saving || !hasStore) return;
    const next = !enabled;
    setEnabled(next); // optimista
    setSaving(true);
    try {
      const res = await fetch("/api/marketplace/stores/my/fiado", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        setEnabled(!next); // revertir
        const body = await res.json().catch(() => ({}));
        logger.error("[FiadoMarketplaceToggle] save failed", { status: res.status, body });
      }
    } catch (err) {
      setEnabled(!next);
      logger.error("[FiadoMarketplaceToggle] save error", { error: String(err) });
    } finally {
      setSaving(false);
    }
  }, [enabled, saving, hasStore]);

  if (loading) {
    return (
      <div className="h-[76px] animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10"
        aria-hidden="true"
      >
        <Wallet className="h-5 w-5 text-[var(--accent)]" strokeWidth={2} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          Mostrar “Acepta fiado” en el marketplace
          {enabled && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]">
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
              Activo
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
          {hasStore ? (
            <>
              Tu tienda mostrará una insignia y aparecerá en el filtro{" "}
              <span className="font-semibold">Acepta fiado</span> de{" "}
              <span className="font-semibold">/tiendas</span>. Atrae clientes que
              buscan “compra ahora, paga después”.
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-[var(--text-tertiary)]">
              <Store className="h-3.5 w-3.5" aria-hidden="true" />
              Publica tu tienda en el marketplace para activar esta insignia.
            </span>
          )}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label='Mostrar "Acepta fiado" en el marketplace'
        disabled={saving || !hasStore}
        onClick={toggle}
        className={cnSwitch(enabled, !hasStore)}
      >
        <span
          className={
            "inline-flex h-5 w-5 translate-x-0 items-center justify-center rounded-full bg-white shadow transition-transform " +
            (enabled ? "translate-x-5" : "translate-x-0.5")
          }
        >
          {saving && (
            <Loader2 className="h-3 w-3 animate-spin text-[var(--accent)]" aria-hidden="true" />
          )}
        </span>
      </button>
    </div>
  );
}

/** Track del switch — teal cuando ON, sunken cuando OFF, opaco si deshabilitado. */
function cnSwitch(on: boolean, disabled: boolean): string {
  const base =
    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors";
  const state = on ? "bg-[var(--accent)]" : "bg-[var(--surface-sunken)] border border-[var(--rule-base)]";
  const dim = disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer";
  return `${base} ${state} ${dim}`;
}
