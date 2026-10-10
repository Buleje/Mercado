"use client";

/**
 * Los filtros de «Por troza» para el celular (< 640 px).
 *
 * En el celular la tabla se vuelve tarjetas y su cabecera se oculta — con ella
 * los autofiltros de guía, largo y diámetro (revisión 2026-09-27). Acá están los
 * MISMOS controles, fuera de la tabla, detrás de un botón «Filtros»; en pantalla
 * ancha no se dibujan (`sm:hidden`), como el panel de Consumos.
 */

import { useId, useState } from "react";
import { SlidersHorizontal } from "@buleje/design-system/icons";
import {
  FiltroColumnaMulti,
  FiltroColumnaRango,
  type Rango,
} from "@/components/admin/shared/filtros-columna";
import { ETIQUETA_TRAMO_DIAS, TRAMOS_DIAS, type TramoDias } from "@/lib/forestal/patio-resumen";
import {
  ETIQUETA_ESTADO_DISPONIBLE,
  type EstadoDisponible,
} from "@/lib/forestal/trozas-disponibles";
import type { EstadoTrozasDisponibles } from "./hooks/use-trozas-disponibles";

export const aRango = (r?: { min?: number; max?: number }): Rango<number> => ({
  min: r?.min ?? null,
  max: r?.max ?? null,
});
export const deRango = (r: Rango<number>) =>
  r.min == null && r.max == null ? undefined : { min: r.min ?? undefined, max: r.max ?? undefined };

/** Las opciones de días en el patio, sólo los tramos con trozas. */
export const opcionesDeTramos = (tramos: Record<TramoDias, number>) =>
  TRAMOS_DIAS.filter((t) => tramos[t] > 0).map((t) => ({ value: t, count: tramos[t] }));

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block text-sm font-bold text-[var(--text-primary)]">{etiqueta}</span>
      {children}
    </div>
  );
}

export function FiltrosMovilTrozas({ e }: { e: EstadoTrozasDisponibles }) {
  const { filtro, poner, facetas } = e;
  const [abierto, setAbierto] = useState(false);
  const idPanel = useId();
  const puestos =
    [filtro.guia, filtro.permiso, filtro.especie, filtro.estado, filtro.tramos].filter(
      (v) => v.length > 0,
    ).length +
    (filtro.largo ? 1 : 0) +
    (filtro.diametro ? 1 : 0);

  return (
    <div className="space-y-2 sm:hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={idPanel}
        className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors ${
          puestos > 0 || abierto
            ? "border-[var(--accent)]"
            : "border-[var(--rule-base)] hover:border-[var(--accent)]"
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Filtros
        {puestos > 0 && (
          <span className="rounded-full bg-primary/15 px-2 tabular-nums">
            {puestos}
            <span className="sr-only"> {puestos === 1 ? "filtro puesto" : "filtros puestos"}</span>
          </span>
        )}
      </button>
      {abierto && (
        <div
          id={idPanel}
          role="group"
          aria-label="Filtros de las trozas"
          className="grid grid-cols-2 gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3"
        >
          <Campo etiqueta="Guía">
            <FiltroColumnaMulti
              label="Guía"
              value={filtro.guia}
              options={facetas.guias}
              onChange={(v) => poner("guia", v)}
              placeholder="Todas"
            />
          </Campo>
          <Campo etiqueta="Permiso">
            <FiltroColumnaMulti
              label="Permiso"
              value={filtro.permiso}
              options={facetas.permisos}
              onChange={(v) => poner("permiso", v)}
              placeholder="Todos"
            />
          </Campo>
          <Campo etiqueta="Especie">
            <FiltroColumnaMulti
              label="Especie"
              value={filtro.especie}
              options={facetas.especies}
              onChange={(v) => poner("especie", v)}
              placeholder="Todas"
            />
          </Campo>
          <Campo etiqueta="Estado">
            <FiltroColumnaMulti
              label="Estado"
              value={filtro.estado}
              options={facetas.estados}
              etiqueta={(v) => ETIQUETA_ESTADO_DISPONIBLE[v as EstadoDisponible] ?? v}
              onChange={(v) => poner("estado", v as EstadoDisponible[])}
              placeholder="Todos"
            />
          </Campo>
          <Campo etiqueta="Días en el patio">
            <FiltroColumnaMulti
              label="Días en el patio"
              value={filtro.tramos}
              options={opcionesDeTramos(facetas.tramos)}
              etiqueta={(v) => ETIQUETA_TRAMO_DIAS[v as TramoDias] ?? v}
              onChange={(v) => poner("tramos", v as TramoDias[])}
              placeholder="Todos"
            />
          </Campo>
          {facetas.largo.conDato > 0 && (
            <Campo etiqueta="Largo (m)">
              <FiltroColumnaRango
                label="Largo"
                unidad="m"
                valor={aRango(filtro.largo)}
                placeholder="Largo"
                onChange={(r) => poner("largo", deRango(r as Rango<number>))}
              />
            </Campo>
          )}
          {facetas.diametro.conDato > 0 && (
            <Campo etiqueta="Diámetro (cm)">
              <FiltroColumnaRango
                label="Diámetro"
                unidad="cm"
                paso={1}
                valor={aRango(filtro.diametro)}
                placeholder="Ø"
                onChange={(r) => poner("diametro", deRango(r as Rango<number>))}
              />
            </Campo>
          )}
        </div>
      )}
    </div>
  );
}
