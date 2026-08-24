"use client";

/**
 * LothVerticesPanel — el CUADRO DE COORDENADAS del área de aprovechamiento: el
 * mismo que va impreso en cualquier plano forestal (VÉRTICE · ESTE · NORTE), más
 * el lado y el azimut de cada tramo.
 *
 * Es la traducción del polígono dibujado al lenguaje del expediente: la ARFFS no
 * lee un GeoJSON, lee C.001 = E 488 706,57 / N 8 883 766,34. Se puede copiar al
 * portapapeles o bajar como CSV para pegarlo en el informe del regente.
 */

import { useMemo, useState } from "react";
import { ClipboardCopy, Check, Clipboard, FileSpreadsheet, Globe, Printer } from "@buleje/design-system/icons";
import { CardTitle, DataTable } from "@buleje/design-system";
import type { LatLng } from "@/lib/forestal/loth-geo";
import { polygonAreaHa } from "@/lib/forestal/loth-geo";
import {
  bearingDeg,
  distanceM,
  dominantZone,
  formatMeters,
  perimeterM,
  toUtm,
  vertexCode,
  zoneLabel,
} from "@/lib/forestal/loth-utm";

interface Props {
  vertices: LatLng[];
  censoCount: number;
  onPrintPlano: () => void;
  onExportKml: () => void;
  onImportCoords: () => void;
}

export default function LothVerticesPanel({ vertices, censoCount, onPrintPlano, onExportKml, onImportCoords }: Props) {
  const [copied, setCopied] = useState(false);

  const { zone, south, rows, areaHa, perimKm } = useMemo(() => {
    const z = dominantZone(vertices);
    const isSouth = vertices.length > 0 ? vertices[0][0] < 0 : true;
    const data = vertices.map((v, i) => {
      const u = toUtm(v[0], v[1], z);
      const next = vertices[(i + 1) % vertices.length];
      return {
        code: vertexCode(i),
        este: u.easting,
        norte: u.northing,
        lado: vertices.length > 1 ? distanceM(v, next) : 0,
        azimut: vertices.length > 1 ? bearingDeg(v, next) : 0,
      };
    });
    return {
      zone: z,
      south: isSouth,
      rows: data,
      areaHa: vertices.length >= 3 ? polygonAreaHa(vertices) : 0,
      perimKm: vertices.length >= 3 ? perimeterM(vertices) / 1000 : 0,
    };
  }, [vertices]);

  const csv = useMemo(
    () =>
      [
        "vertice,este_m,norte_m,zona,datum,lado_m,azimut_grados",
        ...rows.map(
          (r) =>
            `${r.code},${r.este.toFixed(2)},${r.norte.toFixed(2)},${zoneLabel(zone, south)},WGS84,${r.lado.toFixed(2)},${r.azimut.toFixed(2)}`,
        ),
      ].join("\n"),
    [rows, zone, south],
  );

  const copy = () => {
    navigator.clipboard
      .writeText(csv)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => setCopied(false));
  };

  const downloadCsv = () => {
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "coordenadas-utm-umf.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
        <div>
          <CardTitle as="h3" className="text-sm font-black uppercase tracking-widest text-[var(--text-secondary)]">
            Coordenadas UTM del área de aprovechamiento
          </CardTitle>
          <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">
            Datum WGS 84 · Zona {zoneLabel(zone, south)} · Proyección UTM · el plano usa la base que estés viendo en el mapa
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onImportCoords}
            title="Pegar el cuadro de coordenadas del plan o subir KML/GeoJSON"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            <Clipboard className="h-3.5 w-3.5" /> Importar
          </button>
          <button
            type="button"
            onClick={copy}
            disabled={rows.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={rows.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
          </button>
          <button
            type="button"
            onClick={onExportKml}
            disabled={rows.length === 0}
            title="Descargar KML para Google Earth (área + censo + operaciones)"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
          >
            <Globe className="h-3.5 w-3.5" /> KML
          </button>
          <button
            type="button"
            onClick={onPrintPlano}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand-ink)] px-3 text-xs font-bold text-white hover:opacity-90"
          >
            <Printer className="h-3.5 w-3.5" /> Plano oficial
          </button>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
          Dibujá el polígono o <b>importá</b> el cuadro de coordenadas del plan para generar la tabla.
          {censoCount > 0 && <> Podés partir del censo: <b>{censoCount}</b> árbol(es) georreferenciado(s) en el mapa.</>}
        </p>
      ) : (
        <>
          <div className="max-h-[280px] overflow-auto">
            <DataTable className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-[var(--surface-canvas)]">
                <tr className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">
                  <th className="border-b-2 border-[var(--rule-base)] px-3 py-2 text-left font-bold">Vértice</th>
                  <th className="border-b-2 border-[var(--rule-base)] px-3 py-2 text-right font-bold">Este (m)</th>
                  <th className="border-b-2 border-[var(--rule-base)] px-3 py-2 text-right font-bold">Norte (m)</th>
                  <th className="border-b-2 border-[var(--rule-base)] px-3 py-2 text-right font-bold">Lado (m)</th>
                  <th className="border-b-2 border-[var(--rule-base)] px-3 py-2 text-right font-bold">Azimut</th>
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
          <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t-2 border-[var(--rule-base)] px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">
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
      )}
    </section>
  );
}
