"use client";

/**
 * LothMapaChrome — el "mobiliario cartográfico" que va ENCIMA del mapa: leyenda,
 * norte, escala gráfica y lectura de coordenadas del cursor (UTM + geográficas).
 *
 * Es lo que separa un mapa web de un PLANO: quien fiscaliza necesita leer una
 * coordenada, saber a qué escala está mirando y qué significa cada símbolo, sin
 * salir de la pantalla. Presentacional puro (sin Leaflet ni estado propio).
 */

import { Compass } from "@buleje/design-system/icons";
import type { LatLng } from "@/lib/forestal/loth-geo";
import { formatDistance, formatDms, formatMeters, niceBarLength, toUtm } from "@/lib/forestal/loth-utm";

export interface LegendItem {
  label: string;
  color: string;
  shape: "dot" | "tree" | "poly" | "grid";
}

interface Props {
  items: LegendItem[];
  cursor: LatLng | null;
  metersPerPixel: number;
}

/** Escala de pantalla aproximada a 96 dpi (1 px CSS ≈ 0,2646 mm). */
const SCREEN_PX_PER_M = 96 / 0.0254;

function Swatch({ item }: { item: LegendItem }) {
  if (item.shape === "poly") {
    return (
      <span
        className="h-3 w-4 flex-none rounded-sm border-2"
        style={{ borderColor: item.color, background: `${item.color}22` }}
        aria-hidden="true"
      />
    );
  }
  if (item.shape === "tree") {
    return (
      <span
        className="h-0 w-0 flex-none"
        style={{
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderBottom: `9px solid ${item.color}`,
        }}
        aria-hidden="true"
      />
    );
  }
  if (item.shape === "grid") {
    return <span className="h-0 w-4 flex-none border-t-2 border-dashed" style={{ borderColor: item.color }} aria-hidden="true" />;
  }
  return <span className="h-3 w-3 flex-none rounded-full border border-white" style={{ background: item.color }} aria-hidden="true" />;
}

export default function LothMapaChrome({ items, cursor, metersPerPixel }: Props) {
  const barM = niceBarLength(Math.max(10, metersPerPixel * 150));
  const barPx = Math.round(barM / Math.max(metersPerPixel, 0.0001));
  const denom = Math.round(metersPerPixel * SCREEN_PX_PER_M);
  const utm = cursor ? toUtm(cursor[0], cursor[1]) : null;

  return (
    <>
      {/* Lectura de coordenadas del cursor */}
      <div className="pointer-events-none absolute right-3 top-3 z-[500] rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 px-3 py-2 shadow-md backdrop-blur">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          {utm ? `UTM ${utm.zone}${utm.band} · WGS 84` : "UTM · WGS 84"}
        </p>
        {utm && cursor ? (
          <>
            <p className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
              E {formatMeters(utm.easting, 0)} · N {formatMeters(utm.northing, 0)}
            </p>
            <p className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
              {formatDms(cursor[0], "lat")} · {formatDms(cursor[1], "lng")}
            </p>
          </>
        ) : (
          <p className="max-w-[190px] text-xs font-semibold text-[var(--text-tertiary)]">
            Movés el mouse sobre el mapa para leer la coordenada.
          </p>
        )}
      </div>

      {/* Norte + escala gráfica */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 px-3 py-2 shadow-md backdrop-blur">
        <div className="flex flex-col items-center text-[var(--text-primary)]">
          <Compass className="h-6 w-6" />
          <span className="text-[length:var(--ts-2xs)] font-black leading-none">N</span>
        </div>
        <div>
          <div className="flex h-2.5 overflow-hidden rounded-[2px] border border-[var(--text-primary)]" style={{ width: `${barPx}px` }}>
            <i className="flex-1 bg-[var(--text-primary)]" />
            <i className="flex-1" />
            <i className="flex-1 bg-[var(--text-primary)]" />
            <i className="flex-1" />
          </div>
          <p className="mt-0.5 text-xs font-bold tabular-nums text-[var(--text-secondary)]">
            0 — {formatDistance(barM)} <span className="font-semibold text-[var(--text-tertiary)]">· ≈ 1:{denom.toLocaleString("es-PE")}</span>
          </p>
        </div>
      </div>

      {/* Leyenda */}
      {items.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-[500] max-w-[230px] rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 shadow-md backdrop-blur">
          <p className="border-b-2 border-[var(--rule-base)] px-3 py-1.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-widest text-[var(--text-secondary)]">
            Leyenda
          </p>
          <ul className="space-y-1 px-3 py-2">
            {items.map((it) => (
              <li key={`${it.shape}-${it.label}`} className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                <Swatch item={it} />
                <span className="truncate">{it.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
