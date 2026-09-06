"use client";

/**
 * LothTraceView — la operación completa de cada árbol, del tocón al despacho.
 *
 * La pantalla contesta cuatro preguntas y ya no las contesta dos veces: el
 * resumen de arriba, las tarjetas (o la tabla) y el CSV salen todos de la MISMA
 * fila fusionada (`loth-trace-tabla`), que junta la trazabilidad del libro con
 * el censo del plan de manejo.
 *
 * Reemplaza al par «lista de tarjetas + cuadro Censo vs realidad»: eran la
 * misma pregunta con distintos decimales.
 */

import { useEffect, useMemo, useState } from "react";
import { TreePine, TrendingUp, AlertTriangle, CheckCircle2, Clock, Printer, X, ChevronsUpDown } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { buildTraceOperations, buildTraceSummary } from "@/lib/forestal/loth-trace";
import { construirFichasArbol, type ArbolCensoInput } from "@/lib/forestal/loth-arbol";
import { construirFilasTrace, filasToCsv } from "@/lib/forestal/loth-trace-tabla";
import { leerUmbrales, guardarUmbrales, UMBRALES_DEFAULT, type UmbralesMerma } from "@/lib/forestal/loth-trace-umbrales";
import { printTrozaPasaportes, type PasaporteCaratula } from "@/lib/forestal/loth-pasaporte-print";
import LothTraceCard from "./LothTraceCard";
import LothTraceTabla from "./LothTraceTabla";
import LothTraceFiltros, { type ChipDef } from "./LothTraceFiltros";
import LothTraceUmbralesModal from "./LothTraceUmbralesModal";
import { enRango, filaMatches, fmtDias, ORDENADORES, pasaFiltro, type TraceFiltro, type TraceModo, type TraceNav, type TraceOrden } from "./loth-trace-ui";

const POR_PAGINA = 25;

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
  // Una sola fecha de referencia por montaje: si cada render creara la suya, el
  // «hace N días» cambiaría de valor entre renders.
  const [hoy] = useState(() => new Date());
  const [umbrales, setUmbrales] = useState<UmbralesMerma>(UMBRALES_DEFAULT);
  // localStorage no existe en el servidor: leerlo en un efecto evita que el
  // primer render del cliente discrepe del HTML que llegó.
  useEffect(() => setUmbrales(leerUmbrales()), []);

  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<TraceFiltro>("todas");
  const [orden, setOrden] = useState<TraceOrden>("volumen");
  const [modo, setModo] = useState<TraceModo>("tarjetas");
  const [especie, setEspecie] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [expandir, setExpandir] = useState<{ signal: number; todo: boolean }>({ signal: 0, todo: false });
  const [modalUmbrales, setModalUmbrales] = useState(false);

  const ops = useMemo(
    () => buildTraceOperations(entries, { hoy, umbrales, gtfEmitidas: gtfEmitidas ?? undefined }),
    [entries, hoy, umbrales, gtfEmitidas],
  );
  const summary = useMemo(() => buildTraceSummary(ops), [ops]);
  const filas = useMemo(() => {
    const fichas = construirFichasArbol({ censo, entries, hoy });
    return construirFilasTrace(ops, fichas);
  }, [ops, censo, entries, hoy]);

  const especies = useMemo(
    () => Array.from(new Set(filas.map((f) => f.especie).filter((e): e is string => !!e))).sort((a, b) => a.localeCompare(b, "es")),
    [filas],
  );

  const chips: ChipDef[] = useMemo(
    () => [
      { key: "todas", label: "Todas", count: filas.length },
      { key: "alertas", label: "Con alertas", count: filas.filter((f) => f.nivel != null).length, tono: "error" },
      { key: "merma", label: "Merma alta", count: filas.filter((f) => f.mermaVeredicto && f.mermaVeredicto !== "ok").length, tono: "warning" },
      { key: "plazo", label: "Fuera de plazo", count: filas.filter((f) => f.tardias > 0).length, tono: "warning" },
      { key: "gtf_fantasma", label: "GTF sin emitir", count: filas.filter((f) => (f.op?.gtfsFantasma.length ?? 0) > 0).length, tono: "error" },
      { key: "sin_troza", label: "Producto sin troza", count: filas.filter((f) => (f.op?.productoSinTroza ?? 0) > 0).length, tono: "warning" },
      { key: "patio", label: "En patio", count: filas.filter((f) => (f.op?.trozasEnPatio ?? 0) > 0).length },
      { key: "completa", label: "Cadena completa", count: filas.filter((f) => f.op?.chain === "completa").length },
      { key: "cites", label: "CITES", count: filas.filter((f) => f.cites).length },
      { key: "en_pie", label: "En pie", count: filas.filter((f) => f.enPie).length },
    ],
    [filas],
  );

  const visibles = useMemo(() => {
    const out = filas
      .map((f) => ({ f, m: filaMatches(f, search) }))
      .filter(({ f, m }) => m.matched && pasaFiltro(f, filtro) && (!especie || f.especie === especie) && enRango(f, desde, hasta))
      .sort((a, b) => ORDENADORES[orden](a.f, b.f));
    return out;
  }, [filas, search, filtro, especie, desde, hasta, orden]);

  // Cualquier cambio de filtro deja la paginación en la primera página: quedarse
  // en la página 4 de una lista que ahora tiene 3 elementos muestra el vacío.
  useEffect(() => setPagina(0), [search, filtro, especie, desde, hasta, orden, modo]);

  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const pagActual = Math.min(pagina, totalPaginas - 1);
  const enPagina = visibles.slice(pagActual * POR_PAGINA, (pagActual + 1) * POR_PAGINA);

  const toggleSeleccion = (tree: string) =>
    setSeleccion((s) => {
      const next = new Set(s);
      if (next.has(tree)) next.delete(tree);
      else next.add(tree);
      return next;
    });

  const seleccionadas = visibles.filter(({ f }) => seleccion.has(f.tree));

  function descargar(nombre: string, csv: string) {
    const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" }); // BOM → Excel lee UTF-8
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (filas.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
        <TreePine className="mx-auto mb-3 h-10 w-10 opacity-30" />
        <p className="text-base font-medium">No hay operaciones para trazar todavía.</p>
        <p className="mt-1 text-sm">Registrá una tala en la sección 1 para iniciar la trazabilidad de un árbol.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Resumen del aprovechamiento */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          density="compact"
          label="Árboles trazados"
          value={summary.totalTrees.toString()}
          subValue={summary.conGps > 0 ? `${summary.conGps} con GPS` : "ninguno con GPS cargado"}
          icon={TreePine}
          emphasis={summary.conGps === 0 ? "warning" : "neutral"}
        />
        <StatCard
          density="compact"
          label="Volumen talado"
          value={`${summary.talaVolM3.toFixed(2)} m³`}
          subValue={`trozado ${summary.trozadoVolM3.toFixed(2)} m³`}
          icon={TreePine}
          emphasis="success"
        />
        {/* Un decimal, calculado de los m³ y no del entero del resumen: la tabla
            de abajo dice 97.7% y este KPI decía 98%. Es el MISMO hecho con dos
            cifras, que es justo lo que hace desconfiar de un tablero. */}
        <StatCard
          density="compact"
          label="Merma total"
          value={`${summary.mermaVolM3.toFixed(2)} m³`}
          subValue={
            summary.talaVolM3 > 0
              ? `${((summary.mermaVolM3 / summary.talaVolM3) * 100).toFixed(1)}% de lo talado${summary.mermaGrave > 0 ? ` · ${summary.mermaGrave} grave(s)` : ""}`
              : "sin volumen talado"
          }
          icon={TrendingUp}
          emphasis={summary.mermaGrave > 0 ? "error" : summary.talaVolM3 > 0 && summary.mermaVolM3 / summary.talaVolM3 > 0.4 ? "warning" : "success"}
        />
        <StatCard
          density="compact"
          label="Cadenas completas"
          value={`${summary.completas}/${summary.totalTrees}`}
          subValue={
            summary.conTardias > 0
              ? `${summary.conTardias} con registro fuera de plazo`
              : summary.diasTalaSalidaMediana != null
                ? summary.diasTalaSalidaMediana === 0
                  ? "salen el mismo día de la tala"
                  : `mediana ${fmtDias(summary.diasTalaSalidaMediana)} tala → salida`
                : "sin salidas todavía"
          }
          icon={summary.conTardias > 0 ? Clock : summary.conAlertas > 0 ? AlertTriangle : CheckCircle2}
          emphasis={summary.conTardias > 0 || summary.conAlertas > 0 ? "warning" : "success"}
        />
      </div>

      <LothTraceFiltros
        search={search}
        onSearch={setSearch}
        especie={especie}
        onEspecie={setEspecie}
        especies={especies}
        desde={desde}
        hasta={hasta}
        onDesde={setDesde}
        onHasta={setHasta}
        orden={orden}
        onOrden={setOrden}
        modo={modo}
        onModo={setModo}
        chips={chips}
        filtro={filtro}
        onFiltro={setFiltro}
        onExportar={() => descargar("trazabilidad-libro-th.csv", filasToCsv(visibles.map(({ f }) => f)))}
        onUmbrales={() => setModalUmbrales(true)}
      />

      {/* Barra de selección — aparece sólo cuando hay algo elegido */}
      {seleccion.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border-2 border-[var(--data-info-500)] bg-[var(--surface-raised)] px-4 py-2 shadow-[var(--shadow-lg)]">
          <span className="text-sm font-bold text-[var(--text-primary)]">
            {seleccion.size} árbol{seleccion.size === 1 ? "" : "es"} seleccionado{seleccion.size === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => {
              printTrozaPasaportes(
                seleccionadas.map(({ f }) => f.op).filter((o) => o != null),
                caratula,
              ).catch((err) => console.error("[legajo] no se pudo abrir", err));
            }}
            disabled={seleccionadas.every(({ f }) => f.op == null)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
          >
            <Printer className="h-4 w-4" /> Pasaporte de los {seleccionadas.filter(({ f }) => f.op != null).length}
          </button>
          <button
            type="button"
            onClick={() => descargar("trazabilidad-seleccion.csv", filasToCsv(seleccionadas.map(({ f }) => f)))}
            className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            CSV de la selección
          </button>
          <button
            type="button"
            onClick={() => setSeleccion(new Set())}
            className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
          >
            <X className="h-4 w-4" /> Limpiar
          </button>
        </div>
      )}

      {/* Contador + expandir todo */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--text-tertiary)]">
          {visibles.length === filas.length
            ? `${filas.length} árbol${filas.length === 1 ? "" : "es"}`
            : `${visibles.length} de ${filas.length} árboles`}
          {totalPaginas > 1 && ` · página ${pagActual + 1} de ${totalPaginas}`}
        </p>
        {modo === "tarjetas" && (
          <button
            type="button"
            onClick={() => setExpandir((e) => ({ signal: e.signal + 1, todo: !e.todo }))}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
          >
            <ChevronsUpDown className="h-4 w-4" /> {expandir.todo ? "Colapsar todo" : "Expandir todo"}
          </button>
        )}
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-10 text-center text-sm text-[var(--text-tertiary)]">
          Ningún árbol coincide con el filtro. Probá con otro término o quitá los filtros.
        </div>
      ) : modo === "tabla" ? (
        <LothTraceTabla
          filas={enPagina.map(({ f }) => f)}
          nav={nav}
          seleccion={seleccion}
          onSeleccionar={toggleSeleccion}
          orden={orden}
          onOrden={setOrden}
        />
      ) : (
        <div className="space-y-3">
          {enPagina.map(({ f, m }) => (
            <LothTraceCard
              key={f.tree}
              fila={f}
              caratula={caratula}
              matchHint={m.hint}
              nav={nav}
              seleccionada={seleccion.has(f.tree)}
              onSeleccionar={toggleSeleccion}
              expandirSignal={expandir.signal}
              expandirTodo={expandir.todo}
            />
          ))}
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            disabled={pagActual === 0}
            className="h-10 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm font-semibold tabular-nums text-[var(--text-tertiary)]">
            {pagActual + 1} / {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
            disabled={pagActual >= totalPaginas - 1}
            className="h-10 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}

      <LothTraceUmbralesModal
        open={modalUmbrales}
        umbrales={umbrales}
        especies={especies}
        onClose={() => setModalUmbrales(false)}
        onGuardar={(u) => {
          setUmbrales(u);
          guardarUmbrales(u);
        }}
      />
    </div>
  );
}
