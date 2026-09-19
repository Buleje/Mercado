"use client";

/**
 * LothTraceView — la vista «Por árbol»: la historia de cada árbol del censo
 * hasta su despacho.
 *
 * Ordenada como las demás vistas del libro (ley de Brandon, 2026-09-19):
 *
 *   h2  Por árbol ─────────────────────────── qué contesta la pantalla
 *   h3  Del censo al despacho  [Indicadores]  el embudo, plegable y recordado
 *   h3  Árboles · orden · modo · Opciones     la lista, con sus filtros PEGADOS
 *       buscar · estado · especie · fechas
 *       pastillas de lo pendiente (sólo > 0)
 *       tarjetas o tabla
 *   ventana  el detalle de un árbol (antes: un bloque más en la lista)
 *
 * El resumen de arriba, la lista y el CSV salen de la MISMA fila fusionada
 * (`loth-trace-tabla`), que junta la trazabilidad del libro con el censo del
 * plan de manejo; el estado y las cuentas viven en `useLothTraceVista`.
 */

import { useId } from "react";
import { SectionTitle } from "@buleje/design-system";
import { CheckSquare, Printer, TreePine, X } from "@buleje/design-system/icons";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import type { ArbolCensoInput } from "@/lib/forestal/loth-arbol";
import type { TraceFila } from "@/lib/forestal/loth-trace-tabla";
import { printTrozaPasaportes, type PasaporteCaratula } from "@/lib/forestal/loth-pasaporte-print";
import LothTraceCard from "./LothTraceCard";
import LothTraceTabla from "./LothTraceTabla";
import LothTraceFiltros, { LothTraceListaCabecera, opcionesDeLaLista } from "./LothTraceFiltros";
import LothTraceResumen from "./LothTraceResumen";
import LothTraceDetalleModal from "./LothTraceDetalleModal";
import LothTraceUmbralesModal from "./LothTraceUmbralesModal";
import { useLothTraceVista } from "./hooks/use-loth-trace-vista";
import { fmtFecha, type TraceNav } from "./loth-trace-ui";

const BOTON =
  "inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-40";

export default function LothTraceView({
  entries,
  caratula,
  censo = [],
  gtfEmitidas,
  nav,
}: {
  entries: LothEntryDTO[];
  caratula?: PasaporteCaratula | null;
  /** Censo del plan activo — lo que se autorizó, contra lo que dio el monte. */
  censo?: ArbolCensoInput[];
  /** N° de las guías realmente emitidas. `null` = no se pudieron leer (no se acusa). */
  gtfEmitidas?: Set<string> | null;
  nav?: TraceNav;
}) {
  const v = useLothTraceVista({ entries, censo, gtfEmitidas });
  const id = useId();

  const cabecera = (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
      <SectionTitle id={`${id}-vista`}>Por árbol</SectionTitle>
      <span className="text-sm text-[var(--text-tertiary)]">La historia de cada árbol, del censo hasta su despacho</span>
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

      <LothTraceResumen r={v.resumen} abierto={v.resumenAbierto} onAbierto={v.setResumenAbierto} alcance={alcance} />

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
        <LothTraceFiltros
          search={v.search}
          onSearch={v.setSearch}
          filtro={v.filtro}
          onFiltro={v.setFiltro}
          conteos={v.conteos}
          especie={v.especie}
          onEspecie={v.setEspecie}
          especies={v.especies}
          desde={v.desde}
          hasta={v.hasta}
          onDesde={v.setDesde}
          onHasta={v.setHasta}
          hayFiltros={v.hayFiltros}
          onLimpiar={v.limpiarFiltros}
        />

        {v.seleccion.size > 0 && (
          <BarraSeleccion
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
            filas={v.enPagina.map(({ f }) => f)}
            seleccion={v.seleccion}
            onSeleccionar={v.toggleSeleccion}
            onAbrir={v.abrirDetalle}
            orden={v.orden}
            onOrden={v.setOrden}
          />
        ) : (
          <div className="space-y-2.5">
            {v.enPagina.map(({ f, m }) => (
              <LothTraceCard
                key={f.tree}
                fila={f}
                matchHint={m.hint}
                seleccionada={v.seleccion.has(f.tree)}
                onSeleccionar={v.toggleSeleccion}
                onAbrir={v.abrirDetalle}
              />
            ))}
          </div>
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
      </section>

      <LothTraceUmbralesModal
        open={v.modalUmbrales}
        umbrales={v.umbrales}
        especies={v.especies.map((e) => e.label)}
        onClose={() => v.setModalUmbrales(false)}
        onGuardar={v.guardarUmbrales}
      />
      <LothTraceDetalleModal
        fila={v.detalle}
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

/** Aparece sólo con algo elegido; queda pegada arriba mientras se recorre la lista. */
function BarraSeleccion({
  seleccionadas,
  onPasaportes,
  onCsv,
  onLimpiar,
}: {
  seleccionadas: TraceFila[];
  onPasaportes: () => void;
  onCsv: () => void;
  onLimpiar: () => void;
}) {
  const conOperacion = seleccionadas.filter((f) => f.op != null).length;
  const n = seleccionadas.length;
  return (
    <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--data-info-500)] bg-[var(--surface-raised)] px-4 py-2 shadow-[var(--shadow-lg)]">
      <span className="text-sm font-bold text-[var(--text-primary)]">
        {n} árbol{n === 1 ? "" : "es"} seleccionado{n === 1 ? "" : "s"}
      </span>
      <button
        type="button"
        onClick={onPasaportes}
        disabled={conOperacion === 0}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
      >
        <Printer className="h-4 w-4" aria-hidden="true" /> Pasaporte de {conOperacion === 1 ? "1 árbol" : `los ${conOperacion}`}
      </button>
      <button type="button" onClick={onCsv} className={BOTON}>
        CSV de la selección
      </button>
      <button
        type="button"
        onClick={onLimpiar}
        className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
      >
        <X className="h-4 w-4" aria-hidden="true" /> Limpiar
      </button>
    </div>
  );
}
