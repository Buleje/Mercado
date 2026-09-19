"use client";

/**
 * CtpTrozasTabla — el patio en filas, para el escritorio.
 *
 * Los filtros viven en la cabecera de SU columna (el autofiltro de Excel,
 * Brandon 2026-09-03): se acota mirando la columna que se quiere acotar. Y la
 * cabecera es pegajosa dentro de la caja con scroll —la tabla no estira la
 * página—, así que esos filtros siguen a mano en la pieza 400.
 *
 * El estado y el resto de los filtros son del padre: el panorama de arriba y
 * estas filas tienen que describir el mismo conjunto (ADR-400).
 */

import { DataTable } from "@buleje/design-system";
import type { FotoEspecie } from "@/lib/forestal/especies-fotos";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  diasParada,
  ESTADO_META,
  estadoDeTroza,
  SIN_TITULO,
  type EstadoTroza,
} from "@/lib/forestal/trozas-patio";
import { FiltroColumna, type FacetaOpcion } from "./ctp-filtros-panel";
import { claseDias, n, NUM, tituloDias } from "./ctp-trozas-lista-shared";
import { puntoDeTono } from "./ctp-trozas-ui";
import EspecieFoto from "./EspecieFoto";
import type { UbicacionDeCarga } from "./hooks/use-planta-ubicacion";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

/* `align-top`: Especie, Estado y Guía llevan su autofiltro debajo del título.
   El padding y el tamaño los pone `DataTable` (sus variantes descendientes le
   ganan a la clase del `<th>`), así que acá sólo va lo que el DS no dice. */
const TH = "align-top";

export interface CtpTrozasTablaProps {
  visibles: readonly TrozaPatioAPI[];
  elegidas: ReadonlySet<string>;
  /** Las que se pueden apartar de lo visible: gobiernan la casilla de arriba. */
  apartables: readonly TrozaPatioAPI[];
  todasElegidas: boolean;
  onElegirTodas: () => void;
  onAlternar: (id: string) => void;
  onVerFicha: (id: string) => void;
  hoy: Date;
  canchas: Record<string, UbicacionDeCarga>;
  fotosEspecie: Map<string, FotoEspecie>;
  especie: readonly string[];
  onEspecie: (v: string[]) => void;
  especiesFaceta: FacetaOpcion[];
  estadoFiltro: readonly EstadoTroza[];
  onEstadoFiltro: (v: EstadoTroza[]) => void;
  estadosFaceta: FacetaOpcion[];
  guia: readonly string[];
  onGuia: (v: string[]) => void;
  guiasFaceta: FacetaOpcion[];
  titulo: readonly string[];
  onTitulo: (v: string[]) => void;
  titulosFaceta: FacetaOpcion[];
  /** Alto máximo de la caja con scroll. */
  altoClase: string;
}

export default function CtpTrozasTabla({
  visibles, elegidas, apartables, todasElegidas, onElegirTodas, onAlternar, onVerFicha,
  hoy, canchas, fotosEspecie,
  especie, onEspecie, especiesFaceta, estadoFiltro, onEstadoFiltro, estadosFaceta,
  guia, onGuia, guiasFaceta, titulo, onTitulo, titulosFaceta, altoClase,
}: CtpTrozasTablaProps) {
  return (
    <DataTable
      stickyHeader
      /* Una sola caja para los dos ejes: `DataTable` ya trae la suya, y
         envolverla en otra deja el `<thead>` pegado a la que no scrollea. */
      wrapperClassName={`hidden rounded-none border-0 md:block ${altoClase}`}
      className="w-full text-sm [&_thead_th]:shadow-[inset_0_-1px_0_var(--rule-base)]"
    >
      <thead>
        <tr>
          <th className={`${TH} w-9`}>
            <input
              type="checkbox"
              checked={todasElegidas}
              aria-label="Elegir todas las piezas que se pueden apartar"
              onChange={onElegirTodas}
              disabled={apartables.length === 0}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </th>
          <th className={TH}>Código</th>
          <th className={TH}>
            <span className="block">Especie</span>
            <FiltroColumna label="Especie" value={especie} options={especiesFaceta} onChange={onEspecie} placeholder="Todas" />
          </th>
          <th className={TH}>
            <span className="block">Estado</span>
            {/* El mismo filtro que las pastillas del panorama (`onEstadoFiltro`):
                tocar la pastilla o elegir acá es lo mismo. */}
            <FiltroColumna
              label="Estado"
              value={estadoFiltro}
              options={estadosFaceta}
              etiqueta={(v) => ESTADO_META[v as EstadoTroza]?.label ?? v}
              onChange={(v) => onEstadoFiltro(v as EstadoTroza[])}
              placeholder="Todos"
            />
          </th>
          <th className={`${TH} text-right`} title="Días que lleva parada en el patio">Parada</th>
          <th className={`${TH} text-right`}>D1 · D2 (cm)</th>
          <th className={`${TH} text-right`}>Largo (m)</th>
          <th className={`${TH} text-right`}>Volumen</th>
          {/* Dos filtros en una columna porque son dos preguntas del mismo eje:
              «esta guía» y «este título habilitante». El de título ofrece además
              «Sin título declarado», que es como se encuentran las piezas sin
              origen legal para cerrarlas. */}
          <th className={TH}>
            <span className="block">Guía / origen</span>
            {/* Lado a lado y no apilados: apilados hacían esta columna el doble
                de alta que las demás y descuadraban la cabecera entera. */}
            <div className="flex flex-wrap gap-1">
              <span className="min-w-[8rem] flex-1">
                <FiltroColumna label="Guía" value={guia} options={guiasFaceta} onChange={onGuia} placeholder="Guía" />
              </span>
              <span className="min-w-[8rem] flex-1">
                <FiltroColumna
                  label="Título habilitante"
                  value={titulo}
                  options={titulosFaceta}
                  etiqueta={(v) => (v === SIN_TITULO ? "Sin título" : v)}
                  onChange={onTitulo}
                  placeholder="Título"
                />
              </span>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        {visibles.map((t) => {
          const e = estadoDeTroza(t);
          const m = ESTADO_META[e];
          const d = diasParada(t, hoy);
          const puedeApartarse = e === "libre";
          return (
            <tr
              key={t.id}
              onClick={() => onVerFicha(t.id)}
              tabIndex={0}
              aria-label={`Ver ficha de ${t.codificacion ?? t.codigoPlanta ?? "la pieza"}`}
              onKeyDown={(ev) => {
                if (ev.target !== ev.currentTarget) return;
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  onVerFicha(t.id);
                }
              }}
              className={`cursor-pointer ${elegidas.has(t.id) ? "bg-primary/10 dark:bg-[var(--accent)]/12" : ""}`}
            >
              {/* El clic en la casilla NO abre la ficha: elegir para apartar y
                  mirar la historia son dos gestos distintos. */}
              <td onClick={(ev) => ev.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={elegidas.has(t.id)}
                  disabled={!puedeApartarse}
                  onChange={() => onAlternar(t.id)}
                  aria-label={`Elegir ${t.codificacion ?? t.codigoPlanta ?? "la pieza"}`}
                  title={puedeApartarse ? "Elegir para apartar en un lote" : `${m.label}: no se puede apartar`}
                  className="h-4 w-4 accent-[var(--accent)] disabled:opacity-40"
                />
              </td>
              <td>
                <span className="block font-mono font-bold text-[var(--text-primary)]">{t.codificacion ?? t.codigoPlanta ?? "—"}</span>
                {/* El código de planta sólo cuando DIFIERE del del bosque: en el
                    tenant real son el mismo número, y cada fila pagaba el doble
                    de alto por decirlo dos veces. */}
                {t.codigoPlanta && t.codigoPlanta !== t.codificacion && (
                  <span className="block font-mono text-[length:var(--ts-2xs)] leading-tight text-[var(--text-secondary)]">planta {t.codigoPlanta}</span>
                )}
              </td>
              <td>
                <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <EspecieFoto especie={t.especieComun} indice={fotosEspecie} size={24} />
                  {t.especieComun ?? "—"}
                </span>
              </td>
              <td>
                <span className="flex items-center gap-1.5" title={m.hint}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: puntoDeTono(m.tono) }} aria-hidden="true" />
                  <span className="text-xs font-bold text-[var(--text-secondary)]">{m.label}</span>
                </span>
                {t.loteAserrioCode && <span className="ml-3.5 block font-mono text-[length:var(--ts-2xs)] leading-tight text-[var(--text-secondary)]">{t.loteAserrioCode}</span>}
                {canchas[t.woodEntryId] && (
                  <span
                    className="ml-3.5 block truncate text-[length:var(--ts-2xs)] leading-tight text-[var(--text-secondary)]"
                    title="Dónde está apilada su carga en el mapa de planta"
                  >
                    en {canchas[t.woodEntryId].nombre}
                  </span>
                )}
              </td>
              <td className={NUM}>
                <span className={`inline-block font-bold ${claseDias(d)}`} title={tituloDias(d)}>
                  {d == null ? "—" : `${d} d`}
                </span>
              </td>
              <td className={`${NUM} text-[var(--text-secondary)]`}>{n(t.d1Cm, 0)} · {n(t.d2Cm, 0)}</td>
              <td className={`${NUM} text-[var(--text-secondary)]`}>{n(t.largoM)}</td>
              <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{t.volumenM3 == null ? "—" : `${fmtM3(t.volumenM3)} m³`}</td>
              <td>
                <span className="block font-mono text-xs leading-tight text-[var(--text-secondary)]">{t.gtfNumber ?? "—"}</span>
                <span className="block truncate text-[length:var(--ts-2xs)] leading-tight text-[var(--text-secondary)]">{t.permiso ?? t.proveedor ?? ""}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
