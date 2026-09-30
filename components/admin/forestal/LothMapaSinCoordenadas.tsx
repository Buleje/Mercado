"use client";

/**
 * LothMapaSinCoordenadas — la franja arriba del mapa del Libro TH que dice
 * cuántos árboles del censo NO salen en él, cuáles son y deja cargarles las
 * coordenadas ahí mismo.
 *
 * Sin esta franja el mapa «perdía» árboles en silencio: el censo de Blas tiene
 * 67 y el mapa dibuja 65. El Libro TH no tiene la campana de avisos del Libro
 * CTP, así que el aviso va donde se nota: encima del mapa, que es donde se
 * echa de menos el árbol.
 *
 * Presentacional: la lista la arma `arbolesSinCoordenadas` y el guardado vive en
 * `LothMapaSinCoordenadasPanel` (quien abre el editor).
 */

import { useState } from "react";
import { AlertTriangle, ChevronDown, MapPin } from "@buleje/design-system/icons";
import { tituloSinCoordenadas, type ArbolSinCoordenadas } from "./loth-mapa-sin-coordenadas";

/** Hasta cuántos se muestran de entrada: más que eso, la lista arranca plegada. */
export const LISTA_ABIERTA_HASTA = 5;

const BTN =
  "inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[var(--brand-ink)] px-3 text-sm font-bold text-white hover:opacity-90 sm:h-9 sm:rounded-lg sm:text-xs";

interface Props {
  arboles: readonly ArbolSinCoordenadas[];
  /** El rol puede corregir el censo (mismo array que el PATCH). */
  puedeEditar: boolean;
  /** Se sabe que el rol NO puede: se dice quién lo hace, sin botón. */
  sinPermiso: boolean;
  onCargar: (id: string) => void;
}

export default function LothMapaSinCoordenadas({ arboles, puedeEditar, sinPermiso, onCargar }: Props) {
  const [plegada, setPlegada] = useState<boolean | null>(null);
  if (arboles.length === 0) return null;
  const cerrada = plegada ?? arboles.length > LISTA_ABIERTA_HASTA;

  return (
    <section
      aria-label="Árboles sin coordenadas"
      data-sin-coordenadas={arboles.length}
      className="rounded-xl border-2 border-[var(--data-warning-500)]/60 bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"
    >
      <button
        type="button"
        onClick={() => setPlegada(!cerrada)}
        aria-expanded={!cerrada}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-bold"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 grow">
          {tituloSinCoordenadas(arboles.length)}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${cerrada ? "" : "rotate-180"}`} aria-hidden="true" />
      </button>

      {!cerrada && (
        <div className="space-y-2 px-4 pb-3">
          {sinPermiso && (
            <p className="text-sm font-medium">
              Cargar las coordenadas lo hace el dueño o el administrador: avísale para que las ponga.
            </p>
          )}
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {arboles.map((a) => (
              <li
                key={a.id}
                data-arbol-sin-coordenadas={a.code}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]"
              >
                <span className="font-mono text-sm font-bold tabular-nums">{a.code}</span>
                <span className="min-w-0 text-sm font-medium">{a.species}</span>
                <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]">
                  {a.estadoLabel}
                </span>
                <span className="min-w-0 basis-full text-xs text-[var(--text-secondary)] sm:basis-auto">{a.detalle}</span>
                {puedeEditar && (
                  <button
                    type="button"
                    onClick={() => onCargar(a.id)}
                    aria-label={`Cargar coordenadas del árbol ${a.code}`}
                    className={`${BTN} max-sm:w-full max-sm:justify-center sm:ml-auto`}
                  >
                    <MapPin className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" /> Cargar coordenadas
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
