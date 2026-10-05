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
import { FiltroColumnaMulti, type FacetaOpcion } from "@/components/admin/shared/filtros-columna";
import { EnOrden, BotonRestablecerColumnas, useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import { medidasDePieza } from "@/lib/forestal/trozas-patio-medidas";
import { claseDias, n, NUM, tituloDias } from "./ctp-trozas-lista-shared";
import { BotonAnotarMedidas, ValorMedida } from "./ctp-trozas-medidas-ui";
import { puntoDeTono } from "./ctp-trozas-ui";
import EspecieFoto from "./EspecieFoto";
import type { UbicacionDeCarga } from "./hooks/use-planta-ubicacion";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

/* `align-top`: Especie, Estado y Guía llevan su autofiltro debajo del título.
   El padding y el tamaño los pone `DataTable` (sus variantes descendientes le
   ganan a la clase del `<th>`), así que acá sólo va lo que el DS no dice. */
const TH = "align-top";

/** Las columnas que se arrastran (Brandon, 2026-09-26). La casilla de elegir
 *  queda fija: no es un dato de la pieza. */
/* D1 y D2 en columnas propias (Brandon 05-10): «64 · 64» en una sola celda
   no se podía leer de un vistazo ni ordenar en la cabeza. `fusionarOrden`
   descarta la vieja «medidas» de un orden guardado y suma las nuevas. */
const ORDEN_TROZAS_DEFECTO = [
  "codigo", "especie", "estado", "parada", "d1", "d2", "largo", "volumen", "guia",
] as const;

export interface CtpTrozasTablaProps {
  visibles: readonly TrozaPatioAPI[];
  elegidas: ReadonlySet<string>;
  /** Las que se pueden apartar de lo visible: gobiernan la casilla de arriba. */
  apartables: readonly TrozaPatioAPI[];
  todasElegidas: boolean;
  onElegirTodas: () => void;
  onAlternar: (id: string) => void;
  onVerFicha: (id: string) => void;
  /** Abre la planilla «Anotar D1 y D2» con esta pieza primero. */
  onAnotar: (id: string) => void;
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
  visibles, elegidas, apartables, todasElegidas, onElegirTodas, onAlternar, onVerFicha, onAnotar,
  hoy, canchas, fotosEspecie,
  especie, onEspecie, especiesFaceta, estadoFiltro, onEstadoFiltro, estadosFaceta,
  guia, onGuia, guiasFaceta, titulo, onTitulo, titulosFaceta, altoClase,
}: CtpTrozasTablaProps) {
  /* Se arrastran los títulos para cambiarlas de lugar (Brandon, 2026-09-26). */
  const orden = useOrdenColumnas("ctp-trozas-patio", ORDEN_TROZAS_DEFECTO);
  return (
    <>
      <div className="hidden justify-end md:flex">
        <BotonRestablecerColumnas cambiado={orden.cambiado} onRestablecer={orden.restablecer} />
      </div>
      <DataTable
        stickyHeader
        /* Una sola caja para los dos ejes: `DataTable` ya trae la suya, y
           envolverla en otra deja el `<thead>` pegado a la que no scrollea. */
        wrapperClassName={`hidden rounded-none border-0 md:block ${altoClase}`}
        /* `px-2` en vez del `px-3` del DS: con D1 y D2 en columnas propias la
           tabla pasaba la caja por 86 px a 1280 y la guía quedaba cortada. */
        className="w-full text-sm [&_tbody_td]:px-2! [&_thead_th]:px-2! [&_thead_th]:shadow-[inset_0_-1px_0_var(--rule-base)]"
      >
        <thead ref={orden.refCabecera}>
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
            <EnOrden
              orden={orden.orden}
              celdas={{
                codigo: <th data-col="codigo" className={TH}>Código</th>,
                especie: (
                  <th data-col="especie" className={TH}>
                    <span className="block">Especie</span>
                    <FiltroColumnaMulti label="Especie" value={especie} options={especiesFaceta} onChange={onEspecie} placeholder="Todas" />
                  </th>
                ),
                estado: (
                  <th data-col="estado" className={TH}>
                    <span className="block">Estado</span>
                    {/* El mismo filtro que las pastillas del panorama (`onEstadoFiltro`):
                        tocar la pastilla o elegir acá es lo mismo. */}
                    <FiltroColumnaMulti
                      label="Estado"
                      value={estadoFiltro}
                      options={estadosFaceta}
                      etiqueta={(v) => ESTADO_META[v as EstadoTroza]?.label ?? v}
                      onChange={(v) => onEstadoFiltro(v as EstadoTroza[])}
                      placeholder="Todos"
                    />
                  </th>
                ),
                parada: (
                  <th data-col="parada" className={`${TH} text-right`} title="Días que lleva parada en el patio">Parada</th>
                ),
                d1: <th data-col="d1" className={`${TH} text-right`} title="Diámetro 1 en cm. Una marca P/R/Ox dice que no vino de la guía">D1 (cm)</th>,
                d2: <th data-col="d2" className={`${TH} text-right`} title="Diámetro 2 en cm">D2 (cm)</th>,
                largo: <th data-col="largo" className={`${TH} text-right`}>Largo (m)</th>,
                volumen: <th data-col="volumen" className={`${TH} text-right`}>Vol. (m³)</th>,
                /* Dos filtros en una columna porque son dos preguntas del mismo eje:
                   «esta guía» y «este título habilitante». El de título ofrece además
                   «Sin título declarado», que es como se encuentran las piezas sin
                   origen legal para cerrarlas. */
                guia: (
                  <th data-col="guia" className={TH}>
                    <span className="block">Guía / origen</span>
                    {/* Lado a lado y no apilados: apilados hacían esta columna el doble
                        de alta que las demás y descuadraban la cabecera entera. */}
                    <div className="flex flex-wrap gap-1">
                      <span className="min-w-[6.5rem] flex-1">
                        <FiltroColumnaMulti label="Guía" value={guia} options={guiasFaceta} onChange={onGuia} placeholder="Guía" />
                      </span>
                      <span className="min-w-[6.5rem] flex-1">
                        <FiltroColumnaMulti
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
                ),
              }}
            />
          </tr>
        </thead>
        <tbody>
        {visibles.map((t) => {
          const e = estadoDeTroza(t);
          const m = ESTADO_META[e];
          const d = diasParada(t, hoy);
          const puedeApartarse = e === "libre";
          const md = medidasDePieza(t);
          const cancha = canchas[t.woodEntryId]?.nombre;
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
              <EnOrden
                orden={orden.orden}
                celdas={{
                  codigo: (
                    <td className="whitespace-nowrap">
                      <span className="block font-mono font-bold text-[var(--text-primary)]">{t.codificacion ?? t.codigoPlanta ?? "—"}</span>
                      {/* El código de planta sólo cuando DIFIERE del del bosque: en el
                          tenant real son el mismo número, y cada fila pagaba el doble
                          de alto por decirlo dos veces. */}
                      {t.codigoPlanta && t.codigoPlanta !== t.codificacion && (
                        <span className="block font-mono text-[length:var(--ts-2xs)] leading-tight text-[var(--text-secondary)]">planta {t.codigoPlanta}</span>
                      )}
                    </td>
                  ),
                  especie: (
                    <td className="whitespace-nowrap">
                      <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                        <EspecieFoto especie={t.especieComun} indice={fotosEspecie} size={20} />
                        {t.especieComun ?? "—"}
                      </span>
                    </td>
                  ),
                  estado: (
                    /* Dos renglones como máximo: el estado, y debajo su lote y su
                       cancha en UNA línea (antes eran tres renglones y cada fila
                       pagaba 67 px). */
                    <td className="whitespace-nowrap">
                      <span className="flex items-center gap-1.5" title={m.hint}>
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: puntoDeTono(m.tono) }} aria-hidden="true" />
                        <span className="text-xs font-bold text-[var(--text-secondary)]">{m.label}</span>
                      </span>
                      {(t.loteAserrioCode || cancha) && (
                        <span
                          className="ml-3.5 block max-w-[9rem] truncate text-[length:var(--ts-2xs)] leading-tight text-[var(--text-secondary)]"
                          title={cancha ? `Su carga está apilada en ${cancha} (mapa de planta)` : undefined}
                        >
                          {t.loteAserrioCode && <span className="font-mono">{t.loteAserrioCode}</span>}
                          {t.loteAserrioCode && cancha && " · "}
                          {cancha && `en ${cancha}`}
                        </span>
                      )}
                    </td>
                  ),
                  parada: (
                    <td className={NUM}>
                      <span className={`inline-block font-bold ${claseDias(d)}`} title={tituloDias(d)}>
                        {d == null ? "—" : `${d} d`}
                      </span>
                    </td>
                  ),
                  /* Si no hay D1 en NINGUNA fuente, la celda ofrece anotarlo en vez de
                     un «—» mudo: el dato está en papel o en la cinta, no acá. */
                  d1: (
                    <td className={`${NUM} text-[var(--text-secondary)]`} onClick={md.d1 == null ? (ev) => ev.stopPropagation() : undefined}>
                      {md.d1 == null ? <BotonAnotarMedidas onClick={() => onAnotar(t.id)} /> : <ValorMedida v={md.d1} fuente={md.fuente} />}
                    </td>
                  ),
                  d2: (
                    <td className={`${NUM} text-[var(--text-secondary)]`}>
                      <ValorMedida v={md.d2} fuente={md.fuente} />
                    </td>
                  ),
                  largo: <td className={`${NUM} text-[var(--text-secondary)]`}>{n(t.largoM)}</td>,
                  volumen: <td className={`${NUM} whitespace-nowrap font-bold text-[var(--text-primary)]`}>{t.volumenM3 == null ? "—" : fmtM3(t.volumenM3)}</td>,
                  guia: (
                    <td>
                      <span className="block whitespace-nowrap font-mono text-xs leading-tight text-[var(--text-secondary)]">{t.gtfNumber ?? "—"}</span>
                      <span className="block max-w-[13rem] truncate text-[length:var(--ts-2xs)] leading-tight text-[var(--text-secondary)]" title={t.permiso ?? t.proveedor ?? undefined}>{t.permiso ?? t.proveedor ?? ""}</span>
                    </td>
                  ),
                }}
              />
            </tr>
          );
        })}
      </tbody>
      </DataTable>
    </>
  );
}
