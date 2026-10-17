"use client";

/**
 * Modo «Rápida» de la cubicación comercial (ADR-483 §8-A): una línea por
 * especie —o una sola «General»— con el pie tablar que se COBRA. El m³ y las
 * piezas son informativos (lo que dice el libro); el servidor nunca convierte
 * m³ a PT para pagar. «≈ desde el libro» pone el PT del libro o, si no lo
 * tiene, m³ × 424 rotulado «sugerido, revísalo».
 */
import { Plus, Sparkles, X as XIcon } from "@buleje/design-system/icons";
import type { PrefillOrigenDespacho } from "@/lib/forestal/cubicacion-comercial-tipos";
import { BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";
import { lineaVacia, sugerirPt, type LineaRapida } from "./hooks/use-cubicacion-comercial-despacho";

const CAMPO =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const NUM = `${CAMPO} text-right tabular-nums`;
const TH = "text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const FILA = "grid grid-cols-2 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_6rem_2.75rem]";

export default function RapidaPorTotales({
  lineas, onLineas, libro,
}: {
  lineas: LineaRapida[];
  onLineas: (l: LineaRapida[]) => void;
  /** Las líneas del despacho en el libro: para «≈ desde el libro». */
  libro: PrefillOrigenDespacho["lineas"];
}) {
  const cambiar = (key: string, campo: "especie" | "pt" | "m3" | "piezas", v: string) =>
    onLineas(lineas.map((l) => (l.key === key ? { ...l, [campo]: v, ...(campo === "pt" ? { de: null } : {}) } : l)));
  const quitar = (key: string) => onLineas(lineas.filter((l) => l.key !== key));
  const hayGeneral = lineas.some((l) => l.especie.trim().toLowerCase() === "general");
  const sinPt = lineas.filter((l) => !l.pt.trim()).length;

  return (
    <div className="space-y-2" data-vista="cubicacion-rapida">
      <div className={`${FILA} hidden px-1 sm:grid`} aria-hidden>
        <span className={TH}>Especie</span>
        <span className={`${TH} text-right`}>PT que se cobra</span>
        <span className={`${TH} text-right`}>m³ (libro)</span>
        <span className={`${TH} text-right`}>Piezas</span>
        <span />
      </div>
      {lineas.map((l, i) => (
        <div key={l.key} className={`${FILA} rounded-xl border border-[var(--rule-soft)] p-2 sm:border-0 sm:p-0`}>
          <input className={`${CAMPO} col-span-2 sm:col-span-1`} aria-label={`Especie de la línea ${i + 1}`} value={l.especie} maxLength={80}
            list="cub-comercial-especies" placeholder="Ej.: Tornillo o General" onChange={(e) => cambiar(l.key, "especie", e.target.value)} />
          <div>
            <input className={NUM} inputMode="decimal" aria-label={`Pie tablar de ${l.especie || `la línea ${i + 1}`}`} value={l.pt} placeholder="PT"
              onChange={(e) => cambiar(l.key, "pt", e.target.value)} data-campo="pt" />
            {l.de && (
              <span className={`mt-0.5 block text-right text-xs font-semibold ${l.de === "sugerido" ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]"}`}>
                {l.de === "sugerido" ? "≈ sugerido, revísalo" : "del libro"}
              </span>
            )}
          </div>
          <input className={NUM} inputMode="decimal" aria-label={`m³ de ${l.especie || `la línea ${i + 1}`} (informativo)`} value={l.m3} placeholder="—"
            onChange={(e) => cambiar(l.key, "m3", e.target.value)} />
          <input className={NUM} inputMode="numeric" aria-label={`Piezas de ${l.especie || `la línea ${i + 1}`} (informativo)`} value={l.piezas} placeholder="—"
            onChange={(e) => cambiar(l.key, "piezas", e.target.value.replace(/\D/g, ""))} />
          <button type="button" onClick={() => quitar(l.key)} disabled={lineas.length === 1} aria-label={`Quitar la línea ${i + 1}`}
            className="grid h-11 w-11 place-items-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-700)] disabled:opacity-40 dark:hover:text-[var(--data-error-500)]">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
      <datalist id="cub-comercial-especies">
        {[...new Set(libro.map((x) => x.especie))].map((e) => <option key={e} value={e} />)}
      </datalist>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => onLineas([...lineas, lineaVacia()])}>
          <Plus className="h-4 w-4" /> Especie
        </button>
        {!hayGeneral && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => onLineas([...lineas, lineaVacia("General")])}>
            <Plus className="h-4 w-4" /> General
          </button>
        )}
        {sinPt > 0 && libro.length > 0 && (
          <button type="button" className={BOTON_SECUNDARIO} data-accion="pt-desde-libro"
            onClick={() => onLineas(lineas.map((l) => (l.pt.trim() ? l : sugerirPt(l, libro))))}>
            <Sparkles className="h-4 w-4" /> ≈ desde el libro
          </button>
        )}
      </div>
    </div>
  );
}
