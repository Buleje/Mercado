"use client";

/**
 * EspecieFijable — el desplegable de especie del catálogo del aserradero con
 * un botón «Fijar» (Brandon 15-10: «poner una especie y fijarla y al poner los
 * demás campos se pondrán en esa especie»).
 *
 * Fijada, cada fila nueva sale con esa especie y el foco salta a la primera
 * medida; cambiar el desplegable cambia la fijada. Tocar «Fijar» de nuevo la
 * suelta y la especie se vuelve a pedir. El estado (y dónde se recuerda) es de
 * `useEspecieFijada`: este componente lo dibuja y lo revisa contra el catálogo.
 *
 * Una fijada que el catálogo ya no tiene (la quitaron después de fijarla) se
 * suelta sola apenas el catálogo termina de leerse, con un aviso: si no, salía
 * como una opción más y el servidor la rechazaba recién al registrar.
 */

import { useEffect, useState, type KeyboardEvent, type Ref } from "react";
import { AlertTriangle, Pin } from "@buleje/design-system/icons";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { especieDelCatalogo } from "@/lib/forestal/loth-trozas-a-mano";
import { CtpEspecieSelect, type CatalogoUI, type OpcionEspecie } from "./ctp-especie-campo";
import type { EspecieFijada } from "./hooks/use-especie-fijada";

export function EspecieFijable({
  value,
  onChange,
  catalogo,
  fijacion,
  selectRef,
  onKeyDown,
  invalido = false,
  ariaLabel = "Especie",
  opciones,
  etiquetaOpciones,
  etiquetaCatalogo,
}: {
  value: string;
  onChange: (especie: string) => void;
  catalogo: CatalogoUI;
  fijacion: EspecieFijada;
  selectRef?: Ref<HTMLSelectElement>;
  onKeyDown?: (e: KeyboardEvent<HTMLSelectElement>) => void;
  invalido?: boolean;
  ariaLabel?: string;
  /** Las que la pantalla separa arriba (p. ej. «Del permiso»); el resto del catálogo va abajo. */
  opciones?: readonly OpcionEspecie[];
  etiquetaOpciones?: string;
  etiquetaCatalogo?: string;
}) {
  const fija = fijacion.fijada != null;
  /** La fijada que se soltó por no estar ya en el catálogo: el aviso dura hasta elegir otra. */
  const [soltada, setSoltada] = useState<string | null>(null);
  const { fijada, soltar } = fijacion;
  useEffect(() => {
    if (!catalogo.listo || !fijada || especieDelCatalogo(fijada, catalogo.catalogo).ok) return;
    soltar();
    setSoltada(fijada);
    if (claveEspecie(value) === claveEspecie(fijada)) onChange("");
  }, [catalogo.listo, catalogo.catalogo, fijada, soltar, value, onChange]);

  const cambiar = (especie: string) => {
    if (especie.trim()) setSoltada(null);
    onChange(especie);
    /* Fijada, elegir otra cambia la fijada; vaciarla la suelta. */
    if (fija) {
      if (especie.trim()) fijacion.fijar(especie);
      else fijacion.soltar();
    }
  };
  const alternar = () => {
    if (fija) {
      fijacion.soltar();
      onChange("");
    } else if (value.trim()) fijacion.fijar(value);
  };

  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <CtpEspecieSelect
            value={value}
            onChange={cambiar}
            catalogo={catalogo}
            vacio="Elige la especie…"
            ariaLabel={ariaLabel}
            selectRef={selectRef}
            onKeyDown={onKeyDown}
            invalido={invalido || soltada != null}
            opciones={opciones}
            etiquetaOpciones={etiquetaOpciones}
            etiquetaCatalogo={etiquetaCatalogo}
          />
        </div>
        <button
          type="button"
          onClick={alternar}
          aria-pressed={fija}
          disabled={!fija && !value.trim()}
          title={
            fija
              ? `Fijada: cada troza nueva sale como ${fijacion.fijada}. Toca para soltarla.`
              : "Fija la especie: cada troza nueva la toma sola"
          }
          className={`inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border-[1.5px] px-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-50 ${
            fija
              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Pin className={`h-4 w-4 ${fija ? "fill-current" : ""}`} aria-hidden="true" />
          Fijar
        </button>
      </div>
      {soltada && (
        <p
          role="status"
          className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {soltada} ya no está en el catálogo: elige otra especie.
        </p>
      )}
    </div>
  );
}
