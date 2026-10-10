"use client";

/**
 * LothTraceView — la vista «Por árbol»: la historia de cada árbol del censo
 * hasta su despacho.
 *
 * Ordenada como las demás vistas del libro (ley de Brandon, 2026-09-19) y,
 * desde el 30-09, por ETAPA: en Blas 61 de 67 tarjetas decían «Censado, en
 * pie» y los dos talados sin trozar quedaban enterrados entre ellas.
 *
 *   h2  Por árbol ─────────────────────────── qué contesta la pantalla
 *   h3  Avance del permiso  [Cuentas]         Censo → Talados → Trozados → Salieron;
 *                                             cada paso filtra la lista
 *   h3  Qué falta hacer                       sólo si hay algo; «Registrar trozado»
 *   h3  Árboles · orden · modo · Opciones     la lista, con sus filtros PEGADOS:
 *       el autofiltro en la cabecera de cada columna (tabla) o en «Filtros por
 *       columna» (tarjetas y celular) + las pastillas de lo pendiente
 *       h4 En movimiento  (talados con algo pendiente)  tarjetas
 *       h4 Terminados     (todas sus trozas salieron)   tarjetas
 *       — o en tabla: UNA tabla con los dos tramos como filas de grupo, su
 *         caja con cabecera y total fijos, y columnas que se ocultan, se
 *         arrastran y se recuerdan (08-10, al nivel de las Secciones)
 *       h4 En pie  (plegado)                  tabla chica por especie, no 61 tarjetas
 *   ventana  el detalle de un árbol
 *
 * Los filtros de columna recortan todos los grupos; un grupo vacío no se dibuja.
 *
 * El resumen de arriba, la lista y el CSV salen de la MISMA fila fusionada
 * (`loth-trace-tabla`), que junta la trazabilidad del libro con el censo del
 * plan de manejo; el estado y las cuentas viven en `useLothTraceVista`.
 */

import { useId } from "react";
import { SectionTitle } from "@buleje/design-system";
import type { ReactNode } from "react";
import { CheckSquare, TreePine } from "@buleje/design-system/icons";
import type { CupoEspecie } from "@/lib/forestal/loth-cupo-especie";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import type { ArbolCensoInput } from "@/lib/forestal/loth-arbol";
import { grupoDe, type EnPieEspecie } from "@/lib/forestal/loth-trace-grupos";
import { printTrozaPasaportes, type PasaporteCaratula } from "@/lib/forestal/loth-pasaporte-print";
import LothTraceFiltros, { LothTraceListaCabecera, opcionesDeLaLista } from "./LothTraceFiltros";
import LothTraceAvance from "./LothTraceAvance";
import LothTracePendientes from "./LothTracePendientes";
import LothTraceGrupo from "./LothTraceGrupo";
import LothTraceTabla, { LothTraceColumnas } from "./LothTraceTabla";
import LothTraceSeleccion from "./LothTraceSeleccion";
import LothTraceEnPie from "./LothTraceEnPie";
import LothTraceDetalleModal from "./LothTraceDetalleModal";
import LothTraceUmbralesModal from "./LothTraceUmbralesModal";
import { BarraFiltrosTabla } from "./filtros-tabla-forestal";
import { useLothTraceVista } from "./hooks/use-loth-trace-vista";
import { fmtFecha, type TraceNav } from "./loth-trace-ui";
import { TOPE_PIEZAS_ASERRADERO } from "@/lib/forestal/loth-trace-aserradero";
import { formatNumber } from "@/lib/format";

const GRUPOS = ["movimiento", "terminado"] as const;
const BOTON =
  "inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-40";

export default function LothTraceView({
  entries,
  caratula,
  censo = [],
  gtfEmitidas,
  nav,
  cupoEnPie,
  cupoEspecies,
}: {
  entries: LothEntryDTO[];
  caratula?: PasaporteCaratula | null;
  /** Censo del plan activo — lo que se autorizó, contra lo que dio el monte. */
  censo?: ArbolCensoInput[];
  /** N° de las guías realmente emitidas. `null` = no se pudieron leer (no se acusa). */
  gtfEmitidas?: Set<string> | null;
  nav?: TraceNav;
  /** Punto de extensión: el cupo de cada especie en la tabla «En pie». */
  cupoEnPie?: (grupo: EnPieEspecie) => ReactNode;
  /** Cupo por especie: alimenta la línea y el plegable del «Avance del permiso». */
  cupoEspecies?: readonly CupoEspecie[];
}) {
  const v = useLothTraceVista({ entries, censo, gtfEmitidas });
  const id = useId();

  const cabecera = (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
      <SectionTitle id={`${id}-vista`}>Por árbol</SectionTitle>
      <span className="text-sm text-[var(--text-tertiary)]">La historia de cada árbol, del censo al aserradero</span>
    </div>
  );

  if (v.filas.length === 0) {
    return (
      <section aria-labelledby={`${id}-vista`} className="space-y-4">
        {cabecera}
        <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-secondary)]">
          <TreePine className="mx-auto mb-3 h-10 w-10 opacity-40" aria-hidden="true" />
          <p className="text-base font-medium">No hay árboles para trazar todavía.</p>
          <p className="mt-1 text-sm">Registra una tala en la sección 1, o carga el censo en el Plan de manejo.</p>
        </div>
      </section>
    );
  }

  const alcance =
    [v.especieLabel, v.desde && `desde ${fmtFecha(v.desde)}`, v.hasta && `hasta ${fmtFecha(v.hasta)}`].filter(Boolean).join(" · ") || null;
  const descargar = (nombre: string, csv: string) => {
    const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" }); // BOM → Excel lee UTF-8
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  };
  const opciones = [
    ...opcionesDeLaLista({
      onUmbrales: () => v.setModalUmbrales(true),
      onExportar: () => descargar("trazabilidad-libro-th.csv", v.csvVisibles()),
      visibles: v.visibles.length,
    }),
    {
      id: "seleccionar-pagina",
      label: "Seleccionar esta página",
      hint: "Marca los árboles talados que se ven, para sacar sus pasaportes juntos",
      icon: CheckSquare,
      onSelect: () => v.setSeleccion((s) => new Set([...s, ...v.enPagina.filter(({ f }) => f.op).map(({ f }) => f.tree)])),
      disabled: v.enPagina.every(({ f }) => !f.op),
    },
  ];

  return (
    <section aria-labelledby={`${id}-vista`} className="space-y-4">
      {cabecera}

      <LothTraceAvance
        r={v.resumen}
        salieron={v.salieron}
        paso={v.paso}
        onPaso={v.elegirPaso}
        cuentasAbiertas={v.resumenAbierto}
        onCuentas={v.setResumenAbierto}
        alcance={alcance}
        cupoFilas={cupoEspecies}
      />

      <LothTracePendientes p={v.pendientes} onRegistrarTrozado={nav?.onRegistrarTrozado} onAgregarAlCenso={nav?.onAgregarAlCenso} onAbrir={v.abrirDetalle} />

      <LothTraceColumnas>
      <section aria-labelledby={`${id}-lista`} className="space-y-3">
        <LothTraceListaCabecera
          tituloId={`${id}-lista`}
          visibles={v.visibles.length}
          total={v.filas.length}
          pagina={v.pagActual}
          totalPaginas={v.totalPaginas}
          orden={v.orden}
          onOrden={v.setOrden}
          modo={v.modo}
          onModo={v.setModo}
          opciones={opciones}
        />
        {/* En tabla, cada filtro va en su cabecera; en tarjetas no hay cabecera:
            los mismos controles, en «Filtros por columna». El contador ya está
            en la cabecera de la lista. */}
        <BarraFiltrosTabla f={v.filtros} plegableSiempre={v.modo === "tarjetas"} sinConteo />
        <LothTraceFiltros
          activos={v.estadosActivos}
          onAlternar={v.alternarEstado}
          conteos={v.conteos}
          hayFiltros={v.hayFiltros}
          onLimpiar={v.limpiarFiltros}
        />

        {v.seleccion.size > 0 && (
          <LothTraceSeleccion
            seleccionadas={v.seleccionadas}
            onPasaportes={() => {
              printTrozaPasaportes(
                v.seleccionadas.map((f) => f.op).filter((o) => o != null),
                caratula,
              ).catch((err) => console.error("[legajo] no se pudo abrir", err));
            }}
            onCsv={() => descargar("trazabilidad-seleccion.csv", v.csvSeleccion())}
            onLimpiar={() => v.setSeleccion(new Set())}
          />
        )}

        {v.visibles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--rule-base)] p-10 text-center text-sm text-[var(--text-secondary)]">
            Ningún árbol coincide con el filtro.{" "}
            <button type="button" onClick={v.limpiarFiltros} className="font-semibold text-[var(--text-primary)] underline underline-offset-4">
              Quitar filtros
            </button>
          </div>
        ) : v.modo === "tabla" ? (
          <LothTraceTabla
            grupos={GRUPOS.map((g) => ({ grupo: g, total: v.grupos[g].length, filas: v.enPagina.filter(({ f }) => grupoDe(f) === g).map(({ f }) => f) }))}
            filasTotal={[...v.grupos.movimiento, ...v.grupos.terminado]}
            seleccion={v.seleccion}
            onSeleccionar={v.toggleSeleccion}
            onAbrir={v.abrirDetalle}
            orden={v.orden}
            onOrden={v.setOrden}
            filtros={v.filtros}
            estadoCtp={v.estadoAserradero}
          />
        ) : (
          GRUPOS.map((g) => (
            <LothTraceGrupo
              key={g}
              grupo={g}
              total={v.grupos[g].length}
              items={v.enPagina.filter(({ f }) => grupoDe(f) === g)}
              seleccion={v.seleccion}
              onSeleccionar={v.toggleSeleccion}
              onAbrir={v.abrirDetalle}
            />
          ))
        )}

        {v.aserraderoTruncado && (
          <p role="status" className="text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            El Libro CTP devolvió sólo las primeras {formatNumber(TOPE_PIEZAS_ASERRADERO, 0)} piezas de una tanda: en «En el aserradero»
            a algún árbol le pueden faltar trozas.
          </p>
        )}

        {v.totalPaginas > 1 && (
          <nav aria-label="Páginas de la lista" className="flex items-center justify-center gap-2">
            <button type="button" onClick={() => v.setPagina((p) => Math.max(0, p - 1))} disabled={v.pagActual === 0} className={BOTON}>
              Anterior
            </button>
            <span className="text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
              {v.pagActual + 1} / {v.totalPaginas}
            </span>
            <button
              type="button"
              onClick={() => v.setPagina((p) => Math.min(v.totalPaginas - 1, p + 1))}
              disabled={v.pagActual >= v.totalPaginas - 1}
              className={BOTON}
            >
              Siguiente
            </button>
          </nav>
        )}

        <LothTraceEnPie
          enPie={v.enPie}
          abierto={v.enPieAbierto}
          onAbierto={v.setEnPieAbierto}
          forzado={v.enPieForzado}
          cupo={cupoEnPie}
        />
      </section>
      </LothTraceColumnas>

      <LothTraceUmbralesModal
        open={v.modalUmbrales}
        umbrales={v.umbrales}
        especies={v.especies.map((e) => e.label)}
        onClose={() => v.setModalUmbrales(false)}
        onGuardar={v.guardarUmbrales}
      />
      <LothTraceDetalleModal
        fila={v.detalle}
        estadoCtp={v.estadoAserradero}
        caratula={caratula}
        nav={nav}
        onClose={v.cerrarDetalle}
        posicion={v.detalleNav.posicion}
        total={v.detalleNav.total}
        anterior={v.detalleNav.anterior}
        siguiente={v.detalleNav.siguiente}
      />
    </section>
  );
}
