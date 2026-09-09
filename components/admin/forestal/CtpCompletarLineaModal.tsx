"use client";

/**
 * Rellenar los huecos de una corrida (ADR-401 §1.2).
 *
 * No es un editor: es un formulario para lo que el asiento **nunca dijo**. Un
 * campo que ya tiene dato se muestra —porque la pregunta «¿qué dice esta fila?»
 * se contesta acá— pero en gris y sin poder tocarlo. Completar un hueco agrega
 * lo que faltaba; sobrescribir un valor cambia lo que el libro afirmó, y eso
 * tiene otra puerta con otras reglas.
 *
 * Los campos del REGISTRO (especie, especie científica, producto) se bloquean
 * además cuando algo depende de la corrida —un despacho que la cita, un
 * reproceso, un lote—, y **se dice cuál** de esas razones aplica. Un campo gris
 * sin explicación se lee como un error de la pantalla.
 *
 * Cantidad, volumen consumido, unidad y fecha no están: aunque estén vacíos,
 * ponerles un valor mueve saldos e invariantes. Eso es declarar producción, no
 * completar un dato.
 */

import { useState } from "react";
import { AlertTriangle, Check, Loader2, Lock, X } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";

/** Lo que el modal necesita saber de la fila. */
export interface LineaCompletable {
  id: string;
  lineNo: number | null;
  fecha: string;
  observations: string | null;
  presentacion: string | null;
  materiaPrimaRef: string | null;
  speciesCommon: string | null;
  speciesScientific: string | null;
  productType: string | null;
  /** Por qué la corrida está atada, si lo está: se muestra en los bloqueados. */
  atadaPorque?: string | null;
}

type Campo = keyof Pick<
  LineaCompletable,
  "speciesCommon" | "speciesScientific" | "productType" | "presentacion" | "materiaPrimaRef" | "observations"
>;

const CAMPOS: { key: Campo; label: string; registro: boolean; largo?: boolean; ayuda?: string }[] = [
  { key: "speciesCommon", label: "Especie", registro: true },
  { key: "speciesScientific", label: "Especie científica", registro: true },
  { key: "productType", label: "Producto", registro: true },
  { key: "presentacion", label: "Presentación", registro: false, ayuda: "Cómo se encuentra en la pila" },
  { key: "materiaPrimaRef", label: "Referencia de materia prima", registro: false },
  { key: "observations", label: "Observaciones", registro: false, largo: true },
];

const vacio = (v: string | null | undefined) => v == null || v.trim() === "";

export default function CtpCompletarLineaModal({
  linea,
  onCerrar,
  onListo,
}: {
  linea: LineaCompletable;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [valores, setValores] = useState<Partial<Record<Campo, string>>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const huecos = CAMPOS.filter((c) => vacio(linea[c.key]));
  const conDato = CAMPOS.filter((c) => !vacio(linea[c.key]));
  /* Un campo del registro sobre una corrida atada no se puede completar: se
     muestra como hueco bloqueado, con el motivo. */
  const bloqueado = (c: (typeof CAMPOS)[number]) => c.registro && !!linea.atadaPorque;
  const editables = huecos.filter((c) => !bloqueado(c));
  const algoEscrito = Object.values(valores).some((v) => (v ?? "").trim() !== "");

  const guardar = async () => {
    if (!algoEscrito || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ id: linea.id, action: "completar_linea", campos: valores }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
      onListo();
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[9990] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Completar la corrida N° ${linea.lineNo ?? ""}`}
        className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-lg)]"
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <SectionTitle className="text-base font-extrabold text-[var(--text-primary)]">
              Completar la corrida N° {linea.lineNo ?? "—"}
            </SectionTitle>
            <p className="text-sm text-[var(--text-tertiary)]">
              {new Date(linea.fecha).toLocaleDateString("es-PE", { timeZone: "UTC" })} · sólo se rellena lo
              que está en blanco
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {linea.atadaPorque && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-2 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Esta corrida {linea.atadaPorque}, así que especie y producto quedan fijos. Para cambiarlos
              hay que anularla con motivo y registrarla de nuevo.
            </span>
          </p>
        )}

        {huecos.length === 0 ? (
          <p className="mt-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-6 text-center text-sm text-[var(--text-secondary)]">
            Esta corrida no tiene campos en blanco: está completa.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              En blanco ({huecos.length})
            </p>
            {huecos.map((c) => (
              <label key={c.key} className="block">
                <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
                  {c.label}
                  {bloqueado(c) && <Lock className="h-3 w-3 text-[var(--text-tertiary)]" aria-hidden />}
                </span>
                {c.largo ? (
                  <textarea
                    rows={2}
                    value={valores[c.key] ?? ""}
                    disabled={bloqueado(c)}
                    onChange={(e) => setValores((v) => ({ ...v, [c.key]: e.target.value }))}
                    placeholder={bloqueado(c) ? "Bloqueado" : "Vacío"}
                    className="mt-1 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                  />
                ) : (
                  <input
                    type="text"
                    value={valores[c.key] ?? ""}
                    disabled={bloqueado(c)}
                    onChange={(e) => setValores((v) => ({ ...v, [c.key]: e.target.value }))}
                    placeholder={bloqueado(c) ? "Bloqueado" : "Vacío"}
                    className="mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                  />
                )}
                {c.ayuda && !bloqueado(c) && (
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{c.ayuda}</span>
                )}
              </label>
            ))}
          </div>
        )}

        {/* Lo que ya dice el asiento. Se muestra —la pregunta «¿qué dice esta
            fila?» se contesta acá— pero no se toca: cambiar un valor escrito no
            es completar, es corregir, y eso tiene otras reglas. */}
        {conDato.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Ya cargado ({conDato.length}) · no se sobrescribe desde acá
            </p>
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {conDato.map((c) => (
                <div key={c.key} className="min-w-0 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1.5">
                  <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                    {c.label}
                  </dt>
                  <dd className="truncate text-sm font-bold text-[var(--text-secondary)]">{linea[c.key]}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="h-11 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={!algoEscrito || guardando || editables.length === 0}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--accent)] bg-primary/10 px-4 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[var(--accent)]"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar lo completado
          </button>
        </div>
      </div>
    </div>
  );
}
