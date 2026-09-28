"use client";

/**
 * «Paquete por paquete» de Productos disponibles: una fila por paquete (o por
 * corrida sin paquete), con el buscador, los autofiltros en la cabecera, los
 * chips que acotan (ADR-418), columnas que se eligen y se arrastran, el pie con
 * totales y la paginación. Los filtros son los de TODA la página.
 *
 * Lo marcado como usado no se ve salvo que se pida (es justo lo que pide esa
 * marca): el tilde «Ver también lo marcado como usado» lo agrega al filtro de
 * estado, y el vacío dice cuánto hay detrás de la marca.
 */

import { useMemo, useState } from "react";
import { FileSpreadsheet, Search, X } from "@buleje/design-system/icons";
import { BotonRestablecerColumnas, useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { resumenDeEdad } from "@/lib/forestal/edad-del-patio";
import { resumenDeValor } from "@/lib/forestal/valor-del-patio";
import { nombreArchivoDisponibles } from "@/lib/forestal/disponibles-csv";
import { csvDeProductos } from "@/lib/forestal/productos-disponibles-excel";
import { FILAS_POR_PAGINA_DEFAULT, FILAS_POR_PAGINA_MOVIL, esPantallaAngosta } from "@/lib/forestal/tabla-paginacion";
import type { EstadoProducto } from "@/lib/forestal/productos-disponibles-resumen";
import { ColumnasMenu, productLabel, useColumnasVisibles } from "./ctp-shared";
import { CtpPaginacion, FilaVacia, TablaCtp, TbodyCtp, TheadCtp, usePaginacion } from "./ctp-tabla";
import { AvisosDelStock } from "./ctp-disponibles-avisos";
import {
  COLUMNAS_DISPONIBLES_OPCIONALES,
  ORDEN_DISPONIBLES_DEFECTO,
  CabeceraPaquetes,
  PiePaquetes,
} from "./productos-disponibles-columnas";
import { ACCIONES_FIJAS, FilaPaquete } from "./productos-disponibles-fila";
import { FiltrosMovilProductos } from "./productos-disponibles-filtros-movil";
import type { AccionesProductos } from "./productos-disponibles-acciones";
import type { EstadoProductosDisponibles } from "./hooks/use-productos-disponibles";

const nf = (n: number) => formatNumber(n);
const TODOS: EstadoProducto[] = ["libre", "apartado", "usado"];
const BOTON =
  "inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-[var(--accent)]";
const ENLACE = "font-bold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2 dark:text-[var(--accent)]";

export function TablaPaquetesDisponibles({ e, a }: { e: EstadoProductosDisponibles; a: AccionesProductos }) {
  const { filtro, poner } = e;
  const [cols, setCols] = useColumnasVisibles("ctp-disponibles-cols", COLUMNAS_DISPONIBLES_OPCIONALES);
  const ordenCols = useOrdenColumnas("ctp-disponibles", ORDEN_DISPONIBLES_DEFECTO);
  /* El orden (por omisión, lo último aserrado arriba) y el aviso viven en el hook: el Excel los usa. */
  const { orden, onOrdenar, aviso, setAviso, cuentasAvisos: cuentas, paquetesVistos: ordenadas } = e;
  const base = e.aLaVista;
  const [porPaginaInicial] = useState(() => (esPantallaAngosta() ? FILAS_POR_PAGINA_MOVIL : FILAS_POR_PAGINA_DEFAULT));
  const { visibles, rango, porPagina, setPorPagina, ir } = usePaginacion(ordenadas, { porPaginaInicial });

  const pie = useMemo(
    () => ({
      filas: ordenadas.length,
      corridas: new Set(ordenadas.map((f) => f.corrida.id)).size,
      piezas: ordenadas.reduce((s, f) => s + (f.piezas ?? 0), 0),
      m3: Math.round(ordenadas.reduce((s, f) => s + f.volumenM3, 0) * 10_000) / 10_000,
    }),
    [ordenadas],
  );
  const edadPie = useMemo(() => resumenDeEdad(ordenadas.map((f) => ({ dias: f.dias, volumenM3: f.volumenM3 }))), [ordenadas]);
  const valorPie = useMemo(
    () => resumenDeValor(ordenadas.map((f) => ({ valor: f.valorCorrida, volumenM3: f.volumenM3 }))),
    [ordenadas],
  );

  const hayUsados = e.filas.some((f) => f.estado === "usado");
  const verUsados = filtro.estado.includes("usado");
  const setVerUsados = (ver: boolean) => {
    if (ver) poner("estado", filtro.estado.length === 0 ? TODOS : [...filtro.estado, "usado"]);
    else {
      const resto = filtro.estado.filter((x) => x !== "usado");
      poner("estado", resto.length === 2 ? [] : resto);
    }
  };
  const ocultosUsados = e.filtradas.filter((f) => f.estado === "usado");
  const totalCols = 8 + Object.values(cols).filter(Boolean).length;
  const todasEnPagina = visibles.length > 0 && visibles.every((f) => a.seleccion.has(f.clave));

  /** Lo que se está viendo, a un CSV que abre en Excel: ordenado, acotado y con las columnas prendidas. */
  const exportarCsv = () => {
    const csv = csvDeProductos(ordenadas, cols, productLabel);
    const nombre = nombreArchivoDisponibles(e.ahora ?? new Date());
    /* BOM adelante: sin él Excel es-PE lee los acentos como símbolos. */
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = nombre;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    e.setNota(`Exportadas ${ordenadas.length} fila${ordenadas.length === 1 ? "" : "s"} a ${nombre}.`);
  };

  const vacio = e.cargando ? (
    "Leyendo la planta…"
  ) : aviso ? (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
      Ninguna fila de las {nf(base.length)} que ves entra en ese aviso.
      <button type="button" onClick={() => setAviso(null)} className={ENLACE}>Ver todo de nuevo</button>
    </span>
  ) : e.filas.some((f) => f.estado !== "usado") ? (
    "Ningún producto coincide con el filtro."
  ) : ocultosUsados.length > 0 && !verUsados ? (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
      No hay producto disponible. {nf(new Set(ocultosUsados.map((f) => f.corrida.id)).size)} corridas (
      {fmtM3(ocultosUsados.reduce((s, f) => s + f.volumenM3, 0))} m³) están marcadas como usadas.
      <button type="button" onClick={() => setVerUsados(true)} className={ENLACE}>Verlas</button>
    </span>
  ) : (
    "No hay producto disponible: todo lo aserrado ya salió o no se declaró producción."
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-60 sm:max-w-[28rem]">
          <span className="sr-only">Buscar un producto disponible</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            value={filtro.texto}
            onChange={(ev) => {
              poner("texto", ev.target.value);
              ir(0);
            }}
            placeholder="Código, especie, lote o permiso"
            className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-9 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          {filtro.texto && (
            <button
              type="button"
              onClick={() => poner("texto", "")}
              aria-label="Borrar la búsqueda"
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </label>
        {/* El permiso, a la vista mientras su columna esté apagada (con ella prendida va en su cabecera). */}
        {!cols.permiso && (e.facetas.permisos.length > 0 || filtro.permiso.length > 0) && (
          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="text-sm font-bold text-[var(--text-secondary)]">Permiso</span>
            <FiltroColumnaMulti
              label="Permiso"
              value={filtro.permiso}
              options={e.facetas.permisos}
              onChange={(v) => poner("permiso", v)}
              placeholder="Todos"
            />
          </div>
        )}
        {(hayUsados || verUsados) && (
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={verUsados}
              onChange={(ev) => setVerUsados(ev.target.checked)}
              className="h-5 w-5 accent-[var(--accent)]"
            />
            Ver también lo marcado como usado
          </label>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ColumnasMenu columnas={COLUMNAS_DISPONIBLES_OPCIONALES} visibles={cols} onChange={setCols} />
          <BotonRestablecerColumnas cambiado={ordenCols.cambiado} onRestablecer={ordenCols.restablecer} />
          <button
            type="button"
            onClick={exportarCsv}
            disabled={ordenadas.length === 0}
            title="Bajar lo que ves, en este orden y con estas columnas, a un CSV"
            className={BOTON}
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden /> CSV
          </button>
        </div>
      </div>
      <FiltrosMovilProductos e={e} />
      <AvisosDelStock
        cuentas={cuentas}
        activo={aviso}
        onElegir={(k) => {
          setAviso(k);
          ir(0);
        }}
        detalle={`Mostrando ${nf(ordenadas.length)} de ${nf(base.length)} filas · ${fmtM3(pie.m3)} m³`}
      />

      <TablaCtp>
        <caption className="sr-only">Productos disponibles, paquete por paquete</caption>
        <TheadCtp ref={ordenCols.refCabecera}>
          <tr>
            <th aria-label="Elegir" className="w-10 px-2! py-2">
              <input
                type="checkbox"
                aria-label="Elegir todas las filas visibles"
                className="h-5 w-5 accent-[var(--accent)]"
                checked={todasEnPagina}
                onChange={(ev) => a.alternarFilas(visibles.map((f) => f.clave), ev.target.checked)}
              />
            </th>
            <CabeceraPaquetes e={e} orden={orden} onOrdenar={onOrdenar} cols={cols} ordenCols={ordenCols.orden} />
            <th className={`px-2! py-2 text-right font-bold ${ACCIONES_FIJAS} bg-[var(--surface-sunken)]`}>Acciones</th>
          </tr>
        </TheadCtp>
        <TbodyCtp>
          {visibles.length === 0 && <FilaVacia cols={totalCols}>{vacio}</FilaVacia>}
          {visibles.map((f) => (
            <FilaPaquete
              key={f.clave}
              f={f}
              cols={cols}
              ordenCols={ordenCols.orden}
              tildada={a.seleccion.has(f.clave)}
              ahora={e.ahora}
              a={a}
              desmarcando={e.desmarcando}
              onDesmarcar={(x) => void e.desmarcar(x.corrida)}
            />
          ))}
        </TbodyCtp>
        {ordenadas.length > 0 && (
          <PiePaquetes cols={cols} ordenCols={ordenCols.orden} resumen={pie} edad={edadPie} valor={valorPie} />
        )}
      </TablaCtp>
      <CtpPaginacion
        rango={rango}
        porPagina={porPagina}
        onPorPagina={setPorPagina}
        onIr={ir}
        sustantivo="fila"
        extra={
          <span className="font-mono tabular-nums">
            {fmtM3(pie.m3)} m³
            {ocultosUsados.length > 0 && !verUsados ? ` · ${nf(ocultosUsados.length)} usadas sin mostrar` : ""}
          </span>
        }
      />
    </div>
  );
}
