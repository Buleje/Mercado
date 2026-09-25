"use client";

/**
 * El cuadro oficial «Sección 2 · Consumos», casilleros (1)-(11).
 *
 * Las filas son las de `filasConsumo()` —la hoja «2. Consumos» del Excel—, ya
 * filtradas por la barra. Sin agrupar se pagina; agrupado va el subtotal arriba
 * y el detalle plegado (lo que se busca casi siempre es el total del grupo).
 */

import { Fragment } from "react";
import { AlertTriangle, ChevronRight } from "@buleje/design-system/icons";
import { unidadOficial } from "@/lib/forestal/loctp-campos";
import type { FilaConsumo } from "@/lib/forestal/loctp-consumos";
import { pieTablarAserrableDe } from "@/lib/forestal/cubicacion";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatDate, formatNumber } from "@/lib/format";
import { Celda, Cuadro, SinDatos, Texto, Th } from "./ctp-cuadro-shared";
import { CtpPaginacion } from "./ctp-tabla";
import type { EstadoConsumosSeccion2 } from "./hooks/use-consumos-seccion2";

const COLUMNAS = 11;

const fmtFecha = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : formatDate(d, { soloFecha: true });
};

/** Id estable de la fila de detalle de un grupo, para el `aria-controls`. */
const idDetalle = (clave: string, i: number) => `consumo-grupo-${clave.replace(/[^A-Za-z0-9_-]/g, "_")}-${i}`;

/** Una fila del cuadro. Fuera del render para no re-montarla en cada estado. */
function filaConsumo(f: FilaConsumo, id?: string) {
  return (
    <tr key={`${f.woodEntryId}-${f.corridaId}-${f.nro}`} id={id} className="hover:bg-[var(--surface-sunken)]">
      <td className="px-3 py-2 tabular-nums text-[var(--text-secondary)]">{f.nro}</td>
      <Texto v={fmtFecha(f.fecha)} className="whitespace-nowrap" />
      <Texto v={f.tipoProducto} />
      <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{f.especieComun}</td>
      <Texto v={f.especieCientifica} className="italic" />
      <Texto v={f.codigoOrigen} />
      <Texto v={f.fuenteOrigen} />
      <Texto v={unidadOficial(f.unidad)} />
      <Celda v={f.cantidad} />
      {/* (10) El lote de aserrío que entró a la sierra. Vacío en las corridas
          cargadas a mano: el libro admite huecos, no datos inventados. */}
      <Texto v={f.lote || null} />
      {/* En una sola línea: apretada, la observación partía cada fila en cuatro
          renglones. El cuadro ya scrollea a lo ancho (es el formato oficial). */}
      <td className="whitespace-nowrap px-3 py-2 text-sm text-[var(--text-secondary)]">
        <span className="font-bold text-[var(--text-primary)]">{f.gtf}</span> → {f.observaciones}
      </td>
    </tr>
  );
}

export default function CtpConsumosCuadro({
  s2,
  accion,
  barra,
}: {
  s2: EstadoConsumosSeccion2;
  /** «Opciones» del cuadro, en su encabezado. */
  accion?: React.ReactNode;
  /** Búsqueda y filtros, dentro del marco del cuadro. */
  barra?: React.ReactNode;
}) {
  const { visibles, filas, total, agrupar, grupos, abiertos, alternarGrupo, paginacion } = s2;
  const { visibles: filasEnPagina, rango, porPagina, setPorPagina, ir } = paginacion;

  return (
    <>
    {/* Sólo el cuadro cae si falla el grafo: el patio no depende de él. */}
    {s2.error && (
      <p role="status" className="mb-4 flex items-start gap-2 rounded-2xl border-2 border-[var(--data-error-500)] px-4 py-3 text-sm text-[var(--text-primary)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" aria-hidden />
        No se pudieron cargar los consumos: {s2.error}
      </p>
    )}
    <Cuadro
      titulo="Sección 2 · Consumos"
      subtitulo="Los 11 casilleros del formato oficial: la madera de cada guía que entró a una corrida."
      ocupado={s2.refrescando}
      accion={accion}
      barra={barra}
      pie={
        agrupar === "ninguna" ? (
          <CtpPaginacion
            rango={rango}
            porPagina={porPagina}
            onPorPagina={setPorPagina}
            onIr={ir}
            sustantivo="consumo"
            extra={<span className="tabular-nums">{fmtM3(total)} m³ en el filtro</span>}
          />
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            <span className="tabular-nums">{formatNumber(grupos.length)} grupo(s)</span> ·{" "}
            {formatNumber(visibles.length)} consumos · {fmtM3(total)} m³
          </p>
        )
      }
    >
      <thead className="border-b-2 border-[var(--rule-base)]">
        <tr>
          <Th ancho="w-14">(1) N°</Th>
          <Th>(2) Fecha</Th>
          <Th>(3) Tipo de producto</Th>
          <Th>(4) N. común</Th>
          <Th>(5) N. científico</Th>
          <Th>(6) Cód. origen/CTP</Th>
          <Th>(7) N° fuente</Th>
          <Th>(8) Unidad</Th>
          <Th>(9) Cantidad</Th>
          <Th>(10) Lote consumido</Th>
          <Th>(11) Observaciones</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--rule-base)]">
        {visibles.length === 0 ? (
          <SinDatos cols={COLUMNAS}>
            {s2.cargandoInicial
              ? "Recorriendo la cadena de custodia del período…"
              : filas.length === 0
                ? "Sin consumos atribuidos en el período. Se registran al declarar de qué ingreso salió cada corrida de producción."
                : "Ningún consumo coincide con el filtro."}
          </SinDatos>
        ) : agrupar === "ninguna" ? (
          filasEnPagina.map((f) => filaConsumo(f))
        ) : (
          grupos.map((g) => {
            const abierto = abiertos.has(g.clave);
            const ids = g.filas.map((_, i) => idDetalle(g.clave, i));
            return (
              <Fragment key={g.clave}>
                <tr className="bg-[var(--surface-sunken)]">
                  <td colSpan={8} className="px-3 py-2">
                    {/* `w-full`: toda la celda es el botón, no sólo el texto. El
                        `aria-controls` apunta a las filas que existen: plegado
                        no se dibujan, así que no se nombran. */}
                    <button
                      type="button"
                      onClick={() => alternarGrupo(g.clave)}
                      aria-expanded={abierto}
                      aria-controls={abierto ? ids.join(" ") : undefined}
                      className="flex min-h-6 w-full items-center gap-2 text-left text-sm font-bold text-[var(--text-primary)]"
                    >
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "rotate-90" : ""}`}
                        aria-hidden
                      />
                      {g.clave}
                      <span className="font-normal text-[var(--text-secondary)]">
                        {g.filas.length} consumo(s)
                        {agrupar !== "guia" && g.guias > 1 ? ` · ${g.guias} guías` : ""}
                        {/* Por permiso: la especie no se combina, y el pt es
                            SIEMPRE aproximado (tope 56 %, no la corrida real). */}
                        {agrupar === "permiso" && (
                          <>
                            {" · "}
                            {g.porEspecie.map((e) => `${e.especie} ${fmtM3(e.cantidad)} m³`).join(" · ")}
                            {` · ≈${formatNumber(pieTablarAserrableDe(g.cantidad, RENDIMIENTO_META))} pt aserrables (derivado al 56 %)`}
                          </>
                        )}
                      </span>
                    </button>
                  </td>
                  <Celda v={g.cantidad} />
                  {/* (10) no se totaliza: un grupo puede juntar varios lotes. */}
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-sm text-[var(--text-secondary)]">
                    {total > 0 ? `${Math.round((g.cantidad / total) * 100)} % del filtro` : ""}
                  </td>
                </tr>
                {abierto && g.filas.map((f, i) => filaConsumo(f, ids[i]))}
              </Fragment>
            );
          })
        )}
      </tbody>
    </Cuadro>
    </>
  );
}
