"use client";

/**
 * «Lo que se le pega a cada pieza»: código de troza (sólo «Producir sin
 * lote»), especie, dueño, medidas fijas y observación. Salió de
 * `cubicador-entrada-voz.tsx` (Brandon 24-10, «Cargar compacta»).
 *
 * Compacto: sin marco propio y cada control con su nombre ADENTRO de la caja
 * («ESPECIE Tornillo ⚙»), no en un renglón aparte arriba. A 1280 con las
 * Últimas al lado entran especie y dueño en una fila y fijas + observación en
 * la otra; antes eran cinco renglones con su rótulo cada uno.
 *
 * Especie, dueño y fijas se aplican a lo que SIGUE (igual que la voz
 * «especie tornillo»); lo ya cargado se corrige en la tabla.
 */
import { Kicker } from "@buleje/design-system";
import { Lock, Plus, Settings2, UserCheck, X } from "@buleje/design-system/icons";
import { DIMENSIONES, type MedidasFijas } from "@/lib/forestal/cubicacion";
import { opcionesDeDueno } from "@/lib/forestal/duenos-cubicador";
import type { TrozaParaCodigo } from "@/lib/forestal/codigo-de-troza";
import CampoCodigoDeTroza from "./cubicador-codigo-troza";
import CampoObservacion, { type CampoObservacionProps } from "./cubicador-observacion";

/** La caja de cada control: mismo alto, el nombre adentro a la izquierda. */
const CAJA = "flex h-11 min-w-0 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-2.5 focus-within:border-[var(--accent)] sm:h-10";

export interface LoQueSePegaProps {
  codigoTroza?: {
    valor: string;
    onValor: (v: string) => void;
    onElegir: (troza: TrozaParaCodigo) => void;
    trozas: readonly TrozaParaCodigo[];
    cargando: boolean;
    error: string | null;
  };
  especie: string;
  onEspecieChange: (v: string) => void;
  especies: readonly string[];
  onAbrirEspecies?: () => void;
  dueno: string;
  duenoDelDirectorio: boolean;
  onDuenoChange: (v: string) => void;
  duenosConocidos: string[];
  onAbrirDuenos: () => void;
  fijas: MedidasFijas;
  onAplicarFijas: (next: MedidasFijas) => void;
  observacion: CampoObservacionProps;
}

export default function LoQueSePega({
  codigoTroza, especie, onEspecieChange, especies, onAbrirEspecies,
  dueno, duenoDelDirectorio, onDuenoChange, duenosConocidos, onAbrirDuenos,
  fijas, onAplicarFijas, observacion,
}: LoQueSePegaProps) {
  const hayFijas = DIMENSIONES.some((d) => fijas[d] != null);
  return (
    <section aria-label="Lo que se le pega a cada pieza" className="min-w-0">
      <Kicker as="p" className="mb-1.5 font-bold">Lo que se le pega a cada pieza</Kicker>
      <div className="flex flex-wrap items-end gap-2">
        {/* El código de la troza, ANTES de la especie: elegir una troza del
            patio pone también su especie (Brandon, 2026-09-14). */}
        {codigoTroza && (
          <CampoCodigoDeTroza
            valor={codigoTroza.valor}
            onValor={codigoTroza.onValor}
            onElegir={codigoTroza.onElegir}
            trozas={codigoTroza.trozas}
            cargando={codigoTroza.cargando}
          />
        )}

        <label className={`${CAJA} flex-1 basis-[11rem] pr-1 sm:max-w-[15rem]`}>
          <Kicker aria-hidden className="shrink-0">Especie</Kicker>
          <select
            value={especie}
            onChange={(ev) => onEspecieChange(ev.target.value)}
            aria-label="Especie"
            className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold text-[var(--text-primary)] outline-none"
          >
            <option value="">Sin especie</option>
            {especies.map((s) => <option key={s} value={s}>{s}</option>)}
            {/* La especie que puso una troza del patio y el catálogo no tiene:
                sin esta opción el selector se vería «Sin especie» mientras las
                piezas entran con ella. */}
            {especie && !especies.includes(especie) && <option value={especie}>{especie}</option>}
          </select>
          {/* El catálogo se edita DONDE se usa: mandar a otra pantalla a dar de
              alta una especie en medio de una carga es perderla. */}
          {onAbrirEspecies && (
            <button
              type="button"
              onClick={onAbrirEspecies}
              aria-label="Especies del aserradero: crear, renombrar, quitar"
              title="Especies del aserradero: crear, renombrar, quitar"
              className="grid h-8 w-7 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <Settings2 className="h-4 w-4" aria-hidden />
            </button>
          )}
        </label>

        <label className={`${CAJA} flex-1 basis-[11rem] pr-1 sm:max-w-[17rem]`}>
          <Kicker aria-hidden className="shrink-0">Dueño</Kicker>
          {/* Se ELIGE, no se escribe (Brandon 23-09): escribir acá guardaba cada
              letra como un dueño («w», «l», «lu»). Se crean en el modal del +. */}
          <select
            value={dueno}
            onChange={(ev) => onDuenoChange(ev.target.value)}
            aria-label="Dueño de lo que se va a cubicar"
            className={`h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none ${dueno ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}`}
          >
            <option value="">Sin dueño</option>
            {opcionesDeDueno([dueno ? [dueno] : [], duenosConocidos]).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          {duenoDelDirectorio && (
            <span title="Del Directorio: sus piezas toman su precio pactado" aria-label="Del Directorio" className="shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <UserCheck className="h-4 w-4" aria-hidden />
            </span>
          )}
          {dueno && (
            <button
              type="button"
              onClick={() => onDuenoChange("")}
              aria-label="Quitar el dueño"
              title="Quitar el dueño"
              className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onAbrirDuenos}
            title="Dueños: elegir del Directorio, crear uno nuevo o borrar de la lista"
            aria-label="Abrir Dueños: elegir del Directorio, crear o borrar"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[var(--accent-ink)] transition-colors hover:bg-primary/20 dark:text-[var(--accent)]"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </label>

        {/* Las medidas fijas SÓLO ocupan lugar cuando hay alguna: un rótulo
            «Fijas» vacío enseña a no mirar esa zona. */}
        {hayFijas && (
          <div role="group" aria-label="Medidas fijas" className="flex min-h-10 flex-wrap items-center gap-1.5">
            <Kicker aria-hidden className="shrink-0">Fijas</Kicker>
            {DIMENSIONES.map((d) => {
              const valor = fijas[d];
              const unidad = d === "largo" ? "pies" : "pulg";
              return valor ? (
                <span key={d} className="inline-flex h-9 items-center gap-1 rounded-lg border-2 border-[var(--accent)] bg-primary/10 px-2 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  <Lock className="h-3 w-3" aria-hidden />
                  {d} {valor} {unidad}
                  <button
                    type="button"
                    onClick={() => { const n = { ...fijas }; delete n[d]; onAplicarFijas(n); }}
                    aria-label={`Soltar el ${d} fijo`}
                    title={`Soltar el ${d}`}
                    className="ml-0.5 rounded p-0.5 hover:bg-[var(--surface-raised)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : null;
            })}
          </div>
        )}

        {/* Los chips de dueños recientes salieron (Brandon, 2026-09-23: «quita
            las opciones de nombre de dueño»): repetían el selector. En su
            lugar, la observación. */}
        <CampoObservacion {...observacion} className="min-w-0 flex-1 basis-[12rem]" />
      </div>

      {codigoTroza?.error && (
        <p className="mt-2 text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{codigoTroza.error}</p>
      )}
    </section>
  );
}
