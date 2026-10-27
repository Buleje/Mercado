"use client";

/**
 * Los dos cuadros de los apartados del LO-CTP (fuentes y retrozado) con el
 * filtro en el encabezado de cada columna (26-10, como el resto del panel).
 * Los casilleros siguen numerados como en la hoja de SERFOR: filtrar acota las
 * filas, no cambia el N° de registro de cada una.
 */

import { Fragment, type ReactNode } from "react";
import type { FilaRetrozado, FuenteOrigen } from "@/lib/forestal/loctp-apartados";
import { formatDateNumeric } from "@/lib/format";
import { Celda, Cuadro, Entero, SinDatos, Texto, Th } from "./ctp-cuadro-shared";
import {
  BarraFiltrosTabla,
  FiltroEnCabecera,
  useFiltrosTabla,
  type ColumnaFiltro,
  type FiltrosTabla,
} from "./filtros-tabla-forestal";

const fmtFecha = (iso: string | null) => (iso ? formatDateNumeric(`${iso}T00:00:00Z`, { soloFecha: true }) : null);

/** Título del casillero + su embudo, si la columna lo tiene. */
function ThF<T>({ f, id, ancho, children }: { f: FiltrosTabla<T>; id?: string; ancho?: string; children: ReactNode }) {
  /* Con 0-1 filas no hay qué filtrar: el embudo sólo estorba. */
  const hay = f.total > 1;
  return (
    <Th ancho={ancho}>
      {children}
      {id && hay && <FiltroEnCabecera id={id} f={f} compacto />}
    </Th>
  );
}

const COL_FUENTES: readonly ColumnaFiltro<FuenteOrigen>[] = [
  { id: "fuente", label: "Fuente", tipo: "multi", valor: (r) => r.fuente || "—" },
  { id: "titular", label: "Titular", tipo: "texto", valor: (r) => r.titular },
  { id: "titulo", label: "Cód. título", tipo: "texto", valor: (r) => r.codigoTitulo },
  { id: "resolucion", label: "Resolución", tipo: "texto", valor: (r) => r.resolucion },
  { id: "ruc", label: "RUC", tipo: "texto", valor: (r) => r.ruc },
  { id: "procedencia", label: "Procedencia", tipo: "multi", valor: (r) => r.procedencia || "—" },
  { id: "m3", label: "m³", tipo: "rango", numero: (r) => r.volumenM3, unidad: "m³", paso: 0.0001 },
];

export function ApartadoFuentes({ fuentes }: { fuentes: readonly FuenteOrigen[] }) {
  const f = useFiltrosTabla(fuentes, COL_FUENTES);
  return (
    <Cuadro
      titulo="Apartado 1 · Fuente de origen o procedencia de la madera"
      subtitulo="7 casilleros. El N° de esta tabla es el que la Sección 1 declara en su casillero (5): sin este registro, ese número no referencia nada."
      barra={fuentes.length > 1 ? <BarraFiltrosTabla f={f} excel="Apartado 1 fuentes" /> : undefined}
    >
      <thead>
        <tr>
          <Th ancho="w-14">(1) N°</Th>
          <ThF f={f} id="fuente">(2) Fuente</ThF>
          <ThF f={f} id="titular">(3) Titular</ThF>
          <ThF f={f} id="titulo">(4) Cód. título</ThF>
          <ThF f={f} id="resolucion">(5) Resolución</ThF>
          <ThF f={f} id="ruc">(6) RUC</ThF>
          <ThF f={f} id="procedencia">(7) Procedencia</ThF>
          <Th>Guías</Th>
          <ThF f={f} id="m3">m³</ThF>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--rule-base)]">
        {fuentes.length === 0 ? (
          <SinDatos cols={9}>
            Ningún ingreso del período identifica su fuente. Falta el titular, el código del título o la
            resolución — se completan al traer la guía de SERFOR o a mano en el ingreso.
          </SinDatos>
        ) : f.filtradas.length === 0 ? (
          <SinDatos cols={9}>Ninguna fuente coincide con los filtros de columna.</SinDatos>
        ) : (
          f.filtradas.map((r) => (
            <tr key={r.nro}>
              <td className="font-mono font-bold tabular-nums">{r.nro}</td>
              <Texto v={r.fuente} />
              <td className="font-semibold">{r.titular || "—"}</td>
              <Texto v={r.codigoTitulo} className="font-mono" />
              <Texto v={r.resolucion} className="font-mono" />
              <Texto v={r.ruc} className="font-mono" />
              <Texto v={r.procedencia} />
              <Entero v={r.ingresos} />
              <Celda v={r.volumenM3} />
            </tr>
          ))
        )}
      </tbody>
    </Cuadro>
  );
}

const COL_RETROZADO: readonly ColumnaFiltro<FilaRetrozado>[] = [
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (r) => r.fecha?.slice(0, 10) ?? null },
  { id: "origen", label: "Cód. origen/CTP", tipo: "texto", valor: (r) => r.codigoOrigen },
  { id: "retrozado", label: "Cód. retrozado", tipo: "texto", valor: (r) => r.codigoRetrozado },
  { id: "comun", label: "N. común", tipo: "multi", valor: (r) => r.nombreComun || "—" },
  { id: "volIni", label: "Vol. inicial", tipo: "rango", numero: (r) => r.volumenInicial, unidad: "m³", paso: 0.0001 },
  { id: "volFin", label: "Vol. final", tipo: "rango", numero: (r) => r.volumenFinal, unidad: "m³", paso: 0.0001 },
  { id: "descarte", label: "Observaciones", tipo: "multi", valor: (r) => (r.descarte ? "Descarte" : "Aprovechado") },
];

export function ApartadoRetrozado({ retrozos }: { retrozos: readonly FilaRetrozado[] }) {
  const f = useFiltrosTabla(retrozos, COL_RETROZADO);
  return (
    <Cuadro
      titulo="Apartado 2 · Retrozado"
      subtitulo="11 casilleros. El seccionado de trozas dentro de la planta: de qué troza salió cada pedazo, con qué volumen entró y con cuál quedó."
      barra={retrozos.length > 1 ? <BarraFiltrosTabla f={f} excel="Apartado 2 retrozado" /> : undefined}
    >
      <thead>
        <tr>
          <Th ancho="w-14">(1) N°</Th>
          <ThF f={f} id="fecha">(2) Fecha</ThF>
          <ThF f={f} id="origen">(3) Cód. origen/CTP</ThF>
          <ThF f={f} id="volIni">(4) Vol. inicial</ThF>
          <ThF f={f} id="retrozado">(5) Cód. retrozado</ThF>
          <ThF f={f} id="comun">(6) N. común</ThF>
          <Th>(7) N. científico</Th>
          <Th>(8) Ø mayor cm</Th>
          <Th>(9) Ø menor cm</Th>
          <Th>(10) Largo m</Th>
          <ThF f={f} id="volFin">(11) Vol. final</ThF>
          <ThF f={f} id="descarte">Observaciones</ThF>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--rule-base)]">
        {retrozos.length === 0 ? (
          <SinDatos cols={12}>
            Sin retrozado en el período. Se registra desde Trozas, cortando una troza en pedazos.
          </SinDatos>
        ) : f.filtradas.length === 0 ? (
          <SinDatos cols={12}>Ningún pedazo coincide con los filtros de columna.</SinDatos>
        ) : (
          f.filtradas.map((r) => (
            <Fragment key={`${r.nro}-${r.codigoRetrozado}`}>
              <tr>
                <td className="font-mono tabular-nums text-[var(--text-tertiary)]">{r.nro}</td>
                <Texto v={fmtFecha(r.fecha)} className="whitespace-nowrap" />
                <Texto v={r.codigoOrigen} className="font-mono" />
                <Celda v={r.volumenInicial} />
                <td className="font-mono font-bold">{r.codigoRetrozado}</td>
                <Texto v={r.nombreComun} />
                <Texto v={r.nombreCientifico} className="italic" />
                <Entero v={r.diametroMayorCm} />
                <Entero v={r.diametroMenorCm} />
                <Celda v={r.longitudM} />
                <Celda v={r.volumenFinal} />
                <td className="text-[var(--text-secondary)]">
                  {r.descarte && (
                    <span className="mr-1 rounded-md bg-[var(--data-warning-100)] px-1.5 py-0.5 font-bold text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
                      DESCARTE
                    </span>
                  )}
                  {r.observaciones || (r.descarte ? "" : "—")}
                </td>
              </tr>
            </Fragment>
          ))
        )}
      </tbody>
    </Cuadro>
  );
}
