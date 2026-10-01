"use client";

/**
 * CtpValorizarFilas — el costo guía por guía, con el S/ por m³ al lado.
 *
 * Vivía adentro de `CtpValorizarIngresos` (Gestión → Rentabilidad). Salió a su
 * propio archivo cuando «Poner precio» de Ingresos necesitó la MISMA tabla en
 * su pestaña «Por fila»: dos copias derivarían en dos formas de guardar el
 * costo. Guarda con el endpoint de siempre (`set_costo`, una guía a la vez).
 *
 * El S/ por m³ no es decoración: es el detector de dedazos. Una troza a
 * S/ 8/m³ o a S/ 8.000/m³ salta a la vista; el total en soles, no.
 */

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatDateShort, formatNumber } from "@/lib/format";

/** Sólo lo que la tabla necesita del ingreso — no el WoodEntry entero. */
export interface IngresoValorizable {
  id: string;
  gtfNumber: string;
  entryDate: string;
  providerName: string;
  speciesCommonName: string;
  volumeM3: number | string;
  costoTotal: number | string | null;
  moneda: string | null;
  status: string;
}

const API = "/api/admin/forestal/wood-entries";
export const numDe = (v: number | string | null | undefined): number | null =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
export const solesDe = (n: number | null, m = "PEN") => (n == null ? "—" : `${m === "PEN" ? "S/" : m} ${formatNumber(n, 2)}`);
export const m3De = (n: number | null) => (n == null ? "—" : `${formatNumber(n, { max: 3 })} m³`);
/** Fecha date-only: UTC o se corre un día en Lima. */
const dia = (iso: string) => formatDateShort(iso, { soloFecha: true });

export default function CtpValorizarFilas({
  filas,
  onGuardado,
}: {
  /** Las guías a mostrar, ya filtradas por quien llama. */
  filas: readonly IngresoValorizable[];
  /** Después de guardar una: quien llama recarga su lista. */
  onGuardado: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendientes = Object.keys(draft).length;

  // Igual que el panel de ventas: un número a medio tipear no debe convertirse
  // en el costo del mes, pero perderlo por cambiar de pestaña tampoco.
  useEffect(() => {
    if (pendientes === 0) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [pendientes]);

  async function saveCosto(id: string) {
    const raw = draft[id];
    if (raw === undefined) return;
    const costoTotal = raw.trim() === "" ? null : Number(raw);
    if (costoTotal != null && (!Number.isFinite(costoTotal) || costoTotal < 0)) {
      setError("Costo inválido: tiene que ser un número mayor o igual a 0.");
      return;
    }
    setSavingId(id);
    setError(null);
    try {
      const r = await fetch(`${API}/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ action: "set_costo", costoTotal }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setDraft((d) => {
        const n = { ...d };
        delete n[id];
        return n;
      });
      await onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId(null);
    }
  }

  async function saveTodo() {
    for (const id of Object.keys(draft)) await saveCosto(id);
  }

  return (
    <div className="space-y-3">
      {pendientes > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-sm font-medium text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span>{pendientes} costo(s) sin guardar. Se pierden si sales de la pestaña.</span>
          <button
            type="button"
            onClick={() => void saveTodo()}
            disabled={savingId !== null}
            className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--data-warning-500)] px-3 text-sm font-semibold text-[var(--data-warning-700)] hover:bg-[var(--data-warning-100)] disabled:opacity-50 dark:text-[var(--data-warning-500)] dark:hover:bg-transparent"
          >
            {savingId ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
            Guardar todo
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>{error}</div>
        </div>
      )}

      <div className="space-y-2">
        {filas.map((e) => {
          const guardado = numDe(e.costoTotal);
          const val = draft[e.id] ?? (guardado != null ? String(guardado) : "");
          const dirty = draft[e.id] !== undefined;
          const vol = numDe(e.volumeM3) ?? 0;
          // Lo que se está tipeando manda sobre lo guardado: el S//m³ tiene
          // que reaccionar mientras se escribe, que es cuando se detecta el dedazo.
          const efectivo = dirty ? (val.trim() === "" ? null : Number(val)) : guardado;
          const porM3 = efectivo != null && Number.isFinite(efectivo) && vol > 0 ? efectivo / vol : null;
          return (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3"
            >
              <div className="min-w-[10rem] flex-1">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {e.speciesCommonName} · {m3De(vol)}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  <span className="font-mono">{e.gtfNumber}</span> · {e.providerName} · {dia(e.entryDate)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-[var(--text-tertiary)]">S/</span>
                <input
                  inputMode="decimal"
                  value={val}
                  onChange={(ev) => setDraft((d) => ({ ...d, [e.id]: ev.target.value }))}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      void saveCosto(e.id);
                    }
                    if (ev.key === "Escape") {
                      /* Dentro de un modal, Escape borra lo tipeado y NO cierra
                         el modal: se perdería el resto del borrador. */
                      if (dirty) ev.stopPropagation();
                      setDraft((d) => {
                        const n = { ...d };
                        delete n[e.id];
                        return n;
                      });
                    }
                  }}
                  aria-label={`Costo total del ingreso ${e.gtfNumber}`}
                  placeholder="costo"
                  className="h-11 w-28 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]"
                />
              </div>
              <div className="min-w-[6rem] text-right">
                <p className="text-xs text-[var(--text-tertiary)]">por m³</p>
                <p className="text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                  {porM3 == null ? "—" : `${solesDe(porM3, e.moneda ?? "PEN")}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void saveCosto(e.id)}
                disabled={savingId === e.id || !dirty}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
              >
                {savingId === e.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}{" "}
                Guardar
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
