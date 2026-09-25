"use client";

/**
 * LothVerticesPanel — el CUADRO DE COORDENADAS del área de aprovechamiento: el
 * mismo que va impreso en cualquier plano forestal (VÉRTICE · ESTE · NORTE), más
 * el lado y el azimut de cada tramo.
 *
 * Es la traducción del polígono dibujado al lenguaje del expediente: la ARFFS no
 * lee un GeoJSON, lee C.001 = E 488 706,57 / N 8 883 766,34.
 *
 * Es el cuerpo del bloque plegable «Cuadro de coordenadas UTM». Pegar y copiar
 * van en la cabecera del bloque; CSV, KML y el plano oficial, en el menú
 * «Exportar» de la barra del mapa. El cuadro lo arma `loth-mapa-coordenadas`,
 * el mismo que usa la exportación: la tabla y el archivo no pueden diferir.
 */

import { useMemo } from "react";
import { DataTable } from "@buleje/design-system";
import type { LatLng } from "@/lib/forestal/loth-geo";
import { formatMeters } from "@/lib/forestal/loth-utm";
import { cuadroDeCoordenadas } from "./loth-mapa-coordenadas";

/** Vértices, área, perímetro y zona en una línea, para la cabecera plegada. */
export function resumenVertices(vertices: LatLng[]): string {
  if (vertices.length === 0) return "Todavía no hay polígono: dibújalo o pega el cuadro del plan";
  const c = cuadroDeCoordenadas(vertices);
  return `${c.rows.length} vértices · ${Number(c.areaHa).toFixed(2)} ha · perímetro ${Number(c.perimKm).toFixed(2)} km · Zona ${c.zona} · WGS 84`;
}

const TH = "border-b border-[var(--rule-base)] px-3 py-2 font-bold";

export default function LothVerticesPanel({ vertices, censoCount }: { vertices: LatLng[]; censoCount: number }) {
  const { zona, rows, areaHa, perimKm } = useMemo(() => cuadroDeCoordenadas(vertices), [vertices]);

  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
        Dibuja el polígono o <b>pega</b> el cuadro de coordenadas del plan para generar la tabla.
        {censoCount > 0 && <> Puedes partir del censo: <b>{censoCount}</b> árbol(es) georreferenciado(s) en el mapa.</>}
      </p>
    );
  }

  return (
    <>
      <p className="px-4 pt-3 text-xs font-semibold text-[var(--text-tertiary)]">
        Datum WGS 84 · Zona {zona} · Proyección UTM · el plano usa la base que estés viendo en el mapa
      </p>
      <div className="max-h-[280px] overflow-auto">
        <DataTable className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-[var(--surface-canvas)]">
            <tr className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
              <th className={`${TH} text-left`}>Vértice</th>
              <th className={`${TH} text-right`}>Este (m)</th>
              <th className={`${TH} text-right`}>Norte (m)</th>
              <th className={`${TH} text-right`}>Lado (m)</th>
              <th className={`${TH} text-right`}>Azimut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-b border-[var(--rule-subtle)] last:border-0">
                <td className="px-3 py-1.5 font-mono text-sm font-bold text-[var(--text-primary)]">{r.code}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{formatMeters(r.este)}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{formatMeters(r.norte)}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{r.lado.toFixed(1)}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{r.azimut.toFixed(1)}°</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
      <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-[var(--rule-base)] px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">
        <span>
          Vértices: <b className="font-mono tabular-nums">{rows.length}</b>
        </span>
        <span>
          Área: <b className="font-mono tabular-nums">{areaHa.toFixed(2)} ha</b>
        </span>
        <span>
          Perímetro: <b className="font-mono tabular-nums">{perimKm.toFixed(2)} km</b>
        </span>
        {censoCount > 0 && (
          <span className="text-[var(--text-tertiary)]">
            Censo: <b className="font-mono tabular-nums">{censoCount}</b> árbol(es)
          </span>
        )}
      </footer>
    </>
  );
}
