"use client";

import { useEffect, useState, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { ShieldCheck, Loader2, AlertCircle } from "@buleje/design-system/icons";
import { SUNAT_BLOCKER_LABEL, type SunatModoOficialState } from "@/lib/sunat/modo-oficial.types";

/**
 * SunatOficialToggle — control superadmin del "Modo SUNAT Oficial" por tenant.
 * Lee estado vía GET y enciende/apaga vía PUT (con gate 422 si faltan requisitos).
 * Ver ADR-123.
 */
export function SunatOficialToggle({ slug }: { slug: string }) {
  const [state, setState] = useState<SunatModoOficialState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}/sunat-oficial`, { credentials: "include" });
      const j = await res.json();
      if (res.ok && j.ok) setState(j.state as SunatModoOficialState);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(enabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}/sunat-oficial`, {
        method: "PUT",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ enabled }),
      });
      const j = await res.json();
      if (res.ok && j.ok) {
        setState(j.state as SunatModoOficialState);
      } else if (res.status === 422) {
        setError("No se puede activar: faltan requisitos fiscales.");
        await load();
      } else {
        setError(j.error ?? "No se pudo actualizar.");
      }
    } catch {
      setError("Error de red.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando SUNAT…
      </div>
    );
  }
  if (!state) return null;

  const canActivate = state.bloqueos.length === 0;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-[var(--text-tertiary)] flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" /> Modo SUNAT Oficial
      </h3>
      <div className="rounded-lg bg-[var(--surface-sunken)]/50 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-secondary)]">
              {state.enabled ? "Activado" : "Desactivado"}
              {state.enabled && (
                <span className="ml-2 text-xs font-normal text-[var(--text-tertiary)]">
                  · {state.ambiente === "produccion" ? "Producción" : "Beta"}
                </span>
              )}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              {state.enabled ? "Emite comprobantes electrónicos reales." : "Negocio informal — no emite comprobantes."}
            </p>
          </div>
          <button
            type="button"
            disabled={saving || (!state.enabled && !canActivate)}
            onClick={() => void toggle(!state.enabled)}
            className={
              state.enabled
                ? "shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50 transition-colors"
                : "shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            }
            title={!state.enabled && !canActivate ? "Faltan requisitos fiscales para activar" : undefined}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {state.enabled ? "Desactivar" : "Activar"}
          </button>
        </div>

        {/* Bloqueos (cuando no se puede activar) */}
        {!state.enabled && !canActivate && (
          <ul className="mt-2.5 space-y-1 border-t border-[var(--rule-soft)] pt-2.5">
            {state.bloqueos.map((b) => (
              <li key={b} className="flex items-start gap-1.5 text-xs text-[var(--text-tertiary)]">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--data-warning-600)]" />
                {SUNAT_BLOCKER_LABEL[b]}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mt-2 text-xs font-semibold text-[var(--data-error-500)]">{error}</p>}
      </div>
    </div>
  );
}
