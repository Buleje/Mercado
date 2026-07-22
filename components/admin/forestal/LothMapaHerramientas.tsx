"use client";

/**
 * LothMapaHerramientas — la caja de herramientas del mapa: lo que un GIS trae de
 * fábrica y acá faltaba.
 *
 *   · **Cinta métrica** — medir una distancia o un área SIN tocar el polígono
 *     declarado (antes, la única forma de medir algo era redibujar la parcela,
 *     que es un dato legal).
 *   · **Comparador EUDR** — la misma parcela en la imagen satelital de antes del
 *     31-dic-2020 y hoy, con una cortina para pasar de una a otra. Convierte la
 *     casilla "declaro deforestación cero" en evidencia que se mira.
 *   · **Ir a coordenada** — teclear un UTM de la libreta y volar ahí.
 *   · **Pantalla completa** para trabajar el plano en grande.
 */

import { useState } from "react";
import { Check, History, Loader2, Locate, Maximize2, Minimize2, Search, Table, X } from "@buleje/design-system/icons";
import type { LatLng } from "@/lib/forestal/loth-geo";
import { formatDistance, fromUtm, parseUtmZone } from "@/lib/forestal/loth-utm";
import { formatArea, medir, type ModoMedicion } from "@/lib/forestal/loth-medicion";
import { esAnteriorAlCorte, EUDR_CUTOFF, type WaybackRelease } from "@/lib/forestal/loth-wayback";

const CHIP =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border-2 px-3 text-xs font-bold transition disabled:opacity-40";
const OFF = "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]";
const INPUT =
  "h-10 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 font-mono text-sm text-[var(--text-primary)]";

interface Props {
  medicion: LatLng[] | null;
  medicionModo: ModoMedicion;
  onMedicion: (v: LatLng[] | null) => void;
  onMedicionModo: (m: ModoMedicion) => void;

  releases: WaybackRelease[];
  cargandoReleases: boolean;
  wayback: WaybackRelease | null;
  onWayback: (r: WaybackRelease | null) => void;
  waybackSplit: number;
  onWaybackSplit: (n: number) => void;
  /** Salta a la versión previa al corte EUDR. */
  onWaybackCorteEudr: () => void;

  onIrA: (p: LatLng) => void;
  fullscreen: boolean;
  onFullscreen: () => void;
  zonaDefault: string;
}

export default function LothMapaHerramientas({
  medicion,
  medicionModo,
  onMedicion,
  onMedicionModo,
  releases,
  cargandoReleases,
  wayback,
  onWayback,
  waybackSplit,
  onWaybackSplit,
  onWaybackCorteEudr,
  onIrA,
  fullscreen,
  onFullscreen,
  zonaDefault,
}: Props) {
  const [irOpen, setIrOpen] = useState(false);
  const [este, setEste] = useState("");
  const [norte, setNorte] = useState("");
  const [zona, setZona] = useState(zonaDefault);
  const [irError, setIrError] = useState<string | null>(null);

  const midiendo = medicion !== null;
  const res = midiendo ? medir(medicion, medicionModo) : null;

  const irACoordenada = () => {
    const x = Number(este.replace(/[  ,]/g, ""));
    const y = Number(norte.replace(/[  ,]/g, ""));
    if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) {
      setIrError("Escribí el Este y el Norte en metros.");
      return;
    }
    const { zone, south } = parseUtmZone(zona);
    const [lat, lng] = fromUtm(x, y, zone, south);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      setIrError("Esa coordenada cae fuera del planeta: revisá la zona.");
      return;
    }
    setIrError(null);
    onIrA([lat, lng]);
    setIrOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Cinta métrica */}
        <button
          type="button"
          onClick={() => onMedicion(midiendo ? null : [])}
          aria-pressed={midiendo}
          className={`${CHIP} ${midiendo ? "border-transparent bg-[#f59e0b] text-white" : OFF}`}
        >
          <Table className="h-3.5 w-3.5" /> {midiendo ? "Midiendo…" : "Medir"}
        </button>
        {midiendo && (
          <div className="inline-flex overflow-hidden rounded-lg border-2 border-[var(--rule-base)]">
            {(["distancia", "area"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onMedicionModo(m)}
                className={`h-9 px-3 text-xs font-bold transition ${
                  medicionModo === m ? "bg-[#f59e0b] text-white" : "bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                }`}
              >
                {m === "distancia" ? "Distancia" : "Área"}
              </button>
            ))}
          </div>
        )}

        {/* Comparador histórico */}
        <button
          type="button"
          onClick={() => (wayback ? onWayback(null) : onWaybackCorteEudr())}
          disabled={cargandoReleases || releases.length === 0}
          aria-pressed={!!wayback}
          title="Comparar la imagen satelital de antes del corte EUDR con la actual"
          className={`${CHIP} ${wayback ? "border-transparent bg-[#7c3aed] text-white" : OFF}`}
        >
          {cargandoReleases ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
          Comparar EUDR
        </button>

        {/* Ir a coordenada */}
        <button type="button" onClick={() => setIrOpen((v) => !v)} aria-pressed={irOpen} className={`${CHIP} ${irOpen ? "border-transparent bg-[var(--brand-ink)] text-white" : OFF}`}>
          <Search className="h-3.5 w-3.5" /> Ir a coordenada
        </button>

        <button type="button" onClick={onFullscreen} className={`${CHIP} ${OFF}`}>
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {fullscreen ? "Salir" : "Pantalla completa"}
        </button>
      </div>

      {/* Panel: ir a coordenada */}
      {irOpen && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
          <label className="text-xs font-bold text-[var(--text-secondary)]">
            Este (m)
            <input value={este} onChange={(e) => setEste(e.target.value)} inputMode="decimal" placeholder="545060" className={`mt-1 block w-32 ${INPUT}`} />
          </label>
          <label className="text-xs font-bold text-[var(--text-secondary)]">
            Norte (m)
            <input value={norte} onChange={(e) => setNorte(e.target.value)} inputMode="decimal" placeholder="9012340" className={`mt-1 block w-36 ${INPUT}`} />
          </label>
          <label className="text-xs font-bold text-[var(--text-secondary)]">
            Zona
            <input value={zona} onChange={(e) => setZona(e.target.value)} placeholder="18L" className={`mt-1 block w-20 ${INPUT}`} />
          </label>
          <button
            type="button"
            onClick={irACoordenada}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90"
          >
            <Locate className="h-3.5 w-3.5" /> Ir
          </button>
          {irError && <span className="text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{irError}</span>}
        </div>
      )}

      {/* Panel: cinta métrica */}
      {midiendo && res && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[#f59e0b]/60 bg-[#f59e0b]/10 p-3">
          <Table className="h-4 w-4 text-[#f59e0b]" />
          <span className="text-sm font-bold text-[var(--text-primary)]">
            {res.areaHa != null ? formatArea(res.areaHa) : formatDistance(res.totalM)}
            <span className="ml-2 font-semibold text-[var(--text-tertiary)]">{res.resumen}</span>
          </span>
          {res.tramos.length > 0 && (
            <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
              último tramo {formatDistance(res.tramos[res.tramos.length - 1].largoM)} · azimut{" "}
              {res.tramos[res.tramos.length - 1].azimut.toFixed(1)}°
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onMedicion(medicion.slice(0, -1))}
              disabled={medicion.length === 0}
              className="inline-flex h-8 items-center rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] disabled:opacity-40"
            >
              Deshacer
            </button>
            <button
              type="button"
              onClick={() => onMedicion([])}
              className="inline-flex h-8 items-center rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)]"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => onMedicion(null)}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#f59e0b] px-3 text-xs font-bold text-white"
            >
              <X className="h-3.5 w-3.5" /> Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Panel: comparador temporal */}
      {wayback && (
        <div className="space-y-2 rounded-xl border-2 border-[#7c3aed]/60 bg-[#7c3aed]/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <History className="h-4 w-4 text-[#7c3aed]" />
            <span className="text-sm font-bold text-[var(--text-primary)]">
              Izquierda: <b>{wayback.label}</b> · derecha: imagen actual
            </span>
            {esAnteriorAlCorte(wayback) ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-500)]/15 px-2 py-0.5 text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                <Check className="h-3 w-3" /> anterior al corte EUDR ({EUDR_CUTOFF})
              </span>
            ) : (
              <span className="rounded-full bg-[var(--data-warning-500)]/15 px-2 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                posterior al corte: no sirve como “antes”
              </span>
            )}
            <select
              value={wayback.releaseNum}
              onChange={(e) => onWayback(releases.find((r) => r.releaseNum === e.target.value) ?? null)}
              aria-label="Versión de la imagen histórica"
              className="ml-auto h-9 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-xs font-bold text-[var(--text-primary)]"
            >
              {releases.map((r) => (
                <option key={r.releaseNum} value={r.releaseNum}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-3 text-xs font-bold text-[var(--text-secondary)]">
            Cortina
            <input
              type="range"
              min={0}
              max={100}
              value={waybackSplit}
              onChange={(e) => onWaybackSplit(Number(e.target.value))}
              className="h-2 flex-1 cursor-ew-resize accent-[#7c3aed]"
              aria-label="Posición de la cortina entre la imagen histórica y la actual"
            />
            <span className="w-10 text-right font-mono tabular-nums">{waybackSplit}%</span>
          </label>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            Imágenes © Esri World Imagery Wayback. La comparación visual es un indicio, no un análisis de cobertura: para la DDS
            vale junto con la declaración del titular.
          </p>
        </div>
      )}
    </div>
  );
}
