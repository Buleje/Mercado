"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, CheckCircle, AlertCircle, Loader2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import {
  SUNAT_BLOCKER_LABEL,
  type SunatModoOficialState,
  type SunatActivationBlocker,
} from "@/lib/sunat/modo-oficial.types";

/**
 * SunatModoOficialCard — estado read-only del Modo SUNAT Oficial para el admin
 * del negocio. El admin VE si está activo y qué falta, pero el encendido es
 * manual por superadmin (ver ADR-123). Estilo editorial/minimal.
 */
export default function SunatModoOficialCard() {
  const [state, setState] = useState<SunatModoOficialState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/admin/sunat/modo-oficial", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.ok) setState(j.state as SunatModoOficialState); })
      .catch(() => { /* silencioso — la card no aparece */ })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando estado SUNAT…
      </div>
    );
  }
  if (!state) return null;

  const { enabled, ambiente, bloqueos, configReady } = state;

  return (
    <section
      aria-label="Modo SUNAT Oficial"
      className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6"
    >
      <div className="flex items-start gap-4">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
          style={{
            background: enabled ? "var(--data-success-50)" : "var(--surface-sunken)",
            color: enabled ? "var(--data-success-600)" : "var(--text-tertiary)",
          }}
        >
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle as="h3" className="text-base font-extrabold text-[var(--text-primary)]">Modo SUNAT Oficial</CardTitle>
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)]"
              style={
                enabled
                  ? { background: "var(--data-success-50)", color: "var(--data-success-600)" }
                  : { background: "var(--surface-sunken)", color: "var(--text-secondary)" }
              }
            >
              {enabled ? "Activado" : "Desactivado"}
            </span>
            {enabled && (
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] border border-[var(--rule-base)] text-[var(--text-secondary)]"
                title={ambiente === "produccion" ? "Comprobantes válidos ante SUNAT" : "Ambiente de pruebas — los comprobantes NO son válidos ante SUNAT"}
              >
                {ambiente === "produccion" ? "Producción" : "Beta / pruebas"}
              </span>
            )}
          </div>

          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            {enabled
              ? "Tu negocio emite boletas y facturas electrónicas validadas por SUNAT en cada venta."
              : "Tu negocio opera en modo informal — las ventas no generan comprobantes electrónicos."}
          </p>

          {/* Checklist de bloqueos (cuando está desactivado) */}
          {!enabled && (
            <div className="mt-4 space-y-2">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Requisitos para activar
              </p>
              <ul className="space-y-1.5">
                {(["sin_config", "sin_token", "ruc_invalido"] as SunatActivationBlocker[]).map((b) => {
                  const pending = bloqueos.includes(b);
                  return (
                    <li key={b} className="flex items-start gap-2 text-sm">
                      {pending ? (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-600)]" />
                      ) : (
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-600)]" />
                      )}
                      <span className={pending ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)] line-through"}>
                        {SUNAT_BLOCKER_LABEL[b]}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 rounded-xl bg-[var(--surface-sunken)] px-3.5 py-2.5 text-xs text-[var(--text-secondary)]">
                {configReady
                  ? "Todo listo. Contactá a soporte de Buleje para activar la facturación electrónica oficial."
                  : "Completá los requisitos de arriba y luego soporte de Buleje activa el modo oficial."}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
