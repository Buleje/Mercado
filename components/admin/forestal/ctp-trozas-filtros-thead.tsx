"use client";

/**
 * La cabecera de la tabla del patio: cada columna con su título que ordena y
 * su autofiltro debajo (Excel). Devuelve las celdas por id para que
 * `EnOrden` las ponga en el orden que el usuario arrastró.
 *
 * Estado, Especie, Guía y Título son del PADRE (ADR-400: el panorama de arriba
 * y las filas cuentan el mismo conjunto); el resto vive en `extra`.
 */

import type { ReactNode } from "react";
import { FiltroColumnaMulti, FiltroColumnaTexto, type FacetaOpcion } from "@/components/admin/shared/filtros-columna";
import { ESTADO_META, SIN_TITULO, type EstadoTroza } from "@/lib/forestal/trozas-patio";
import type { CampoOrdenTroza, OrdenColumnaTroza } from "./ctp-trozas-filtros-columnas";
import type { FiltrosTrozas } from "./ctp-trozas-filtros-hook";
import { FiltroMultiTroza, FiltroRangoTroza, ThTroza } from "./ctp-trozas-filtros-th";

export interface FiltrosCabeceraProps {
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
  /** Código, Proveedor y los rangos (Parada, D1, D2, Largo, Volumen). */
  extra: FiltrosTrozas;
  orden: OrdenColumnaTroza;
  onOrdenar: (c: CampoOrdenTroza) => void;
}

export function celdasCabeceraTrozas(p: FiltrosCabeceraProps): Record<string, ReactNode> {
  const { extra, orden, onOrdenar } = p;
  const th = { orden, onOrdenar };
  return {
    codigo: (
      <ThTroza {...th} campo="codigo" col="codigo" filtro={<FiltroColumnaTexto label="Código" value={extra.codigo} onChange={extra.setCodigo} placeholder="Contiene…" />}>
        Código
      </ThTroza>
    ),
    especie: (
      <ThTroza {...th} campo="especie" col="especie" filtro={<FiltroColumnaMulti label="Especie" value={p.especie} options={p.especiesFaceta} onChange={p.onEspecie} placeholder="Todas" />}>
        Especie
      </ThTroza>
    ),
    estado: (
      <ThTroza
        {...th} campo="estado" col="estado"
        /* El mismo filtro que las pastillas del panorama (`onEstadoFiltro`):
           tocar la pastilla o elegir acá es lo mismo. */
        filtro={
          <FiltroColumnaMulti
            label="Estado" value={p.estadoFiltro} options={p.estadosFaceta}
            etiqueta={(v) => ESTADO_META[v as EstadoTroza]?.label ?? v}
            onChange={(v) => p.onEstadoFiltro(v as EstadoTroza[])} placeholder="Todos"
          />
        }
      >
        Estado
      </ThTroza>
    ),
    parada: (
      <ThTroza {...th} campo="parada" col="parada" align="right" title="Días que lleva parada en el patio" filtro={<FiltroRangoTroza id="parada" label="Parada" unidad="d" paso={1} f={extra} />}>
        Parada
      </ThTroza>
    ),
    d1: (
      <ThTroza {...th} campo="d1" col="d1" align="right" title="Diámetro 1 en cm. Una marca P/R/Ox dice que no vino de la guía" filtro={<FiltroRangoTroza id="d1" label="D1" unidad="cm" paso={1} f={extra} />}>
        D1 (cm)
      </ThTroza>
    ),
    d2: (
      <ThTroza {...th} campo="d2" col="d2" align="right" title="Diámetro 2 en cm" filtro={<FiltroRangoTroza id="d2" label="D2" unidad="cm" paso={1} f={extra} />}>
        D2 (cm)
      </ThTroza>
    ),
    largo: (
      <ThTroza {...th} campo="largo" col="largo" align="right" filtro={<FiltroRangoTroza id="largo" label="Largo" unidad="m" paso={0.1} f={extra} />}>
        Largo (m)
      </ThTroza>
    ),
    volumen: (
      <ThTroza {...th} campo="volumen" col="volumen" align="right" filtro={<FiltroRangoTroza id="volumen" label="Volumen" unidad="m³" paso={0.01} f={extra} />}>
        Vol. (m³)
      </ThTroza>
    ),
    /* Tres preguntas del mismo eje: «esta guía», «este título habilitante» y
       «este proveedor». El de título ofrece además «Sin título declarado», que
       es como se encuentran las piezas sin origen legal. Lado a lado y no
       apilados: apilados hacían esta columna el doble de alta que las demás. */
    guia: (
      <ThTroza
        {...th} campo="guia" col="guia"
        filtro={
          <div className="flex flex-wrap gap-1">
            <span className="min-w-[6.5rem] flex-1">
              <FiltroColumnaMulti label="Guía" value={p.guia} options={p.guiasFaceta} onChange={p.onGuia} placeholder="Guía" />
            </span>
            <span className="min-w-[6.5rem] flex-1">
              <FiltroColumnaMulti
                label="Título habilitante" value={p.titulo} options={p.titulosFaceta}
                etiqueta={(v) => (v === SIN_TITULO ? "Sin título" : v)} onChange={p.onTitulo} placeholder="Título"
              />
            </span>
            <span className="min-w-[6.5rem] flex-1">
              <FiltroMultiTroza id="proveedor" label="Proveedor" f={extra} placeholder="Proveedor" />
            </span>
          </div>
        }
      >
        Guía / origen
      </ThTroza>
    ),
  };
}
