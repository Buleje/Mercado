"use client";

/**
 * CubicacionResumenes — el lote cubicado leído de todas las formas en que se
 * vende. Lee el mismo lote que el cubicador (localStorage por tenant).
 *
 * ── Organización (2026-08-05) ───────────────────────────────────────────────
 * Antes era UN scroll de nueve secciones: ~5 700 px de alto donde la pregunta
 * que traías —«¿cuánto tengo de 2×8×10?»— quedaba a cuatro pantallas de la
 * respuesta. Ahora la cabecera es fija y el resto se reparte en cuatro vistas
 * que responden una pregunta cada una:
 *
 *   · **Panorama** — qué tengo y qué me dice: lectura del lote + dónde está el volumen.
 *   · **Tablas**   — el detalle: especie × tipo, generales y agrupado libre.
 *   · **Rolliza**  — de qué troza salió cada pieza (respaldo para el Libro).
 *   · **Metas**    — qué buscaba y si mejoré respecto del lote anterior.
 *
 * Al imprimir se renderizan TODAS: el papel no tiene pestañas.
 *
 * Las cifras se escriben desde `cubicacion-formato`: **pie tablar entero** y
 * **m³ con tres decimales**, en todas las vistas.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw, Download, PackageOpen, Printer, Layers, Boxes, Lightbulb, Target,
  ArrowLeftRight, SlidersHorizontal, Share2, Compass, Table,
} from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  agruparPor, resumenPorEspecie, resumenACsv, DIMENSIONES_RESUMEN, ETIQUETA_DIMENSION,
  type DimensionResumen,
} from "@/lib/forestal/cubicacion-resumen";
import { fmtM3, fmtPct, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { analizarLote } from "@/lib/forestal/cubicacion-insights";
import { LecturaDelLote } from "./resumen-vistas";
import { DondeEstaElVolumen, HeroResumen } from "./resumen-hero";
import { SeccionResumen, TablaGrupos } from "./resumen-tabla";
import ResumenComparar from "./ResumenComparar";
import ResumenMeta from "./ResumenMeta";
import ResumenReparto from "./ResumenReparto";
import ResumenTrozas from "./ResumenTrozas";
import { useCubicacionesGuardadas } from "@/hooks/use-cubicaciones-guardadas";

/** Botón de acción de la cabecera: mismo alto y peso que los filtros del admin. */
const BTN = "inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]";

type Vista = "panorama" | "tablas" | "rolliza" | "metas";
const VISTAS: { value: Vista; label: string; icon: typeof Compass }[] = [
  { value: "panorama", label: "Panorama", icon: Compass },
  { value: "tablas", label: "Tablas", icon: Table },
  { value: "rolliza", label: "Rolliza", icon: Share2 },
  { value: "metas", label: "Metas", icon: Target },
];

function slugKey(sufijo = "") {
  let slug = "main";
  try { slug = localStorage.getItem("active-tenant-slug") ?? "main"; } catch { /* ignore */ }
  return `buleje-cubicacion-${slug}${sufijo}`;
}

/** Lee el lote + precios del localStorage y arma el resolver de precio por pieza. */
function leerLote(): { rows: PiezaCubicada[]; precioDe: (r: PiezaCubicada) => number; conValor: boolean } {
  let rows: PiezaCubicada[] = [];
  let precio = 0;
  let preciosEsp: Record<string, string> = {};
  try {
    const raw = localStorage.getItem(slugKey());
    if (raw) rows = JSON.parse(raw) as PiezaCubicada[];
    precio = Number(localStorage.getItem(slugKey("-precio"))) || 0;
    const pe = localStorage.getItem(slugKey("-precios-especie"));
    if (pe) preciosEsp = JSON.parse(pe) as Record<string, string>;
  } catch { /* ignore */ }
  const precioDe = (r: PiezaCubicada) => {
    const esp = r.especie?.trim().toLowerCase();
    const pe = esp ? Number(preciosEsp[esp]) : 0;
    return pe > 0 ? pe : precio;
  };
  const hayEsp = Object.values(preciosEsp).some((v) => Number(v) > 0);
  return { rows, precioDe, conValor: precio > 0 || hayEsp };
}

/** La vista elegida se recuerda: se vuelve a esta pantalla muchas veces al día. */
function vistaGuardada(): Vista {
  if (typeof window === "undefined") return "panorama";
  try {
    const v = localStorage.getItem(slugKey("-vista-resumen"));
    if (VISTAS.some((x) => x.value === v)) return v as Vista;
  } catch { /* ignore */ }
  return "panorama";
}

export default function CubicacionResumenes() {
  const [{ rows, precioDe, conValor }, setLote] = useState(() => (typeof window === "undefined" ? { rows: [], precioDe: () => 0, conValor: false } : leerLote()));
  const recargar = useCallback(() => setLote(leerLote()), []);
  useEffect(() => {
    recargar();
    const onStorage = (e: StorageEvent) => { if (e.key?.startsWith("buleje-cubicacion-")) recargar(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [recargar]);

  /** Se lee en el inicializador, nunca en un efecto: un efecto que guarda corre
   *  antes que uno que carga y pisa lo guardado ([[cubicador-madera]]). */
  const [vista, setVista] = useState<Vista>(vistaGuardada);
  const cambiarVista = useCallback((v: Vista) => {
    setVista(v);
    try { localStorage.setItem(slugKey("-vista-resumen"), v); } catch { /* quota */ }
  }, []);

  /** Historial: lo comparten la meta (tendencia) y el panel de comparación. */
  const { lista: guardadas, cargando: cargandoGuardadas } = useCubicacionesGuardadas();
  /** Dimensión libre: la pregunta al vender casi nunca es "por especie". */
  const [dim, setDim] = useState<DimensionResumen>("medida");
  const porEspecie = useMemo(() => agruparPor(rows, "especie", precioDe), [rows, precioDe]);
  const porTipo = useMemo(() => agruparPor(rows, "tipo", precioDe), [rows, precioDe]);
  const porMedida = useMemo(() => agruparPor(rows, "medida", precioDe), [rows, precioDe]);
  const porDim = useMemo(() => (dim === "medida" ? porMedida : agruparPor(rows, dim, precioDe)), [porMedida, rows, dim, precioDe]);
  const bloques = useMemo(() => resumenPorEspecie(rows, precioDe), [rows, precioDe]);
  const insights = useMemo(() => analizarLote(rows, precioDe), [rows, precioDe]);
  const total = porEspecie.total;

  /**
   * Imprimir/PDF: se pintan TODAS las vistas y recién ahí se abre el diálogo —
   * el papel no tiene pestañas, y sin esto salía sólo la que estaba abierta.
   * Dos `requestAnimationFrame` porque `window.print()` fotografía lo que YA
   * está pintado, no lo que React acaba de agendar.
   */
  const [imprimiendo, setImprimiendo] = useState(false);
  useEffect(() => {
    if (!imprimiendo) return;
    let cancelado = false;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => {
      if (cancelado) return;
      window.print();
      setImprimiendo(false);
    }));
    return () => { cancelado = true; cancelAnimationFrame(id); };
  }, [imprimiendo]);
  const ver = (v: Vista) => imprimiendo || vista === v;

  /** CSV de la vista libre (la de especie×tipo tiene su propio export). */
  const exportarDimCSV = () => {
    const url = URL.createObjectURL(new Blob([resumenACsv(porDim, dim, conValor)], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `resumen-${dim}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  /**
   * El CSV baja con la precisión COMPLETA aunque la pantalla redondee: es el
   * archivo con el que el contador recalcula, y ahí el centésimo de pie sí
   * importa. `Number(...)` porque el lote viene de localStorage — un string
   * colado rompería el `.toFixed` sin avisar.
   */
  const exportarCSV = () => {
    const lineas: string[] = ["Especie,Tipo,Piezas,PieTablar,m3" + (conValor ? ",ValorS/" : "")];
    for (const b of bloques) {
      for (const t of b.tipos) {
        lineas.push([b.especie, t.label, t.cantidad, Number(t.pieTablar).toFixed(2), Number(t.m3).toFixed(4), ...(conValor ? [Number(t.valor).toFixed(2)] : [])].join(","));
      }
    }
    lineas.push(["TOTAL", "", total.cantidad, Number(total.pieTablar).toFixed(2), Number(total.m3).toFixed(4), ...(conValor ? [Number(total.valor).toFixed(2)] : [])].join(","));
    const csv = "﻿" + lineas.join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `resumenes-cubicacion-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-16 text-center">
        <PackageOpen className="h-10 w-10 text-[var(--text-tertiary)]" />
        <p className="text-base font-bold text-[var(--text-primary)]">Todavía no hay lote cubicado</p>
        <p className="max-w-sm text-sm text-[var(--text-tertiary)]">Cubicá madera en la herramienta <b>Cubicador de madera</b> y volvé acá para ver los resúmenes por especie y tipo.</p>
        <button type="button" onClick={recargar} className={`mt-1 ${BTN}`}>
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5" id="resumen-lote">
      {/* Al imprimir queda sólo el resumen: el admin alrededor no aporta al papel. */}
      <style>{`@media print {
        body * { visibility: hidden; }
        #resumen-lote, #resumen-lote * { visibility: visible; }
        #resumen-lote { position: absolute; left: 0; top: 0; width: 100%; }
        #resumen-lote section { break-inside: avoid; }
        @page { size: A4 portrait; margin: 12mm; }
      }`}</style>

      <HeroResumen
        total={total}
        renglones={rows.length}
        porEspecie={porEspecie}
        porTipo={porTipo}
        conValor={conValor}
        fecha={new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}
        acciones={
          <>
            <button type="button" onClick={recargar} title="Volver a leer el lote del cubicador" className={`${BTN} print:hidden`}>
              <RefreshCw className="h-4 w-4" /> Actualizar
            </button>
            <button type="button" onClick={() => setImprimiendo(true)} title="Imprime las cuatro vistas, no sólo la que estás viendo" className={`${BTN} print:hidden`}>
              <Printer className="h-4 w-4" /> Imprimir
            </button>
            <button type="button" onClick={exportarCSV} className={`${BTN} print:hidden`}>
              <Download className="h-4 w-4" /> CSV
            </button>
          </>
        }
      />

      {/* La barra de vistas: cuatro preguntas, una pantalla cada una. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        {/* Dual-render medido: en 390 px los cuatro rótulos con ícono pedían más
            ancho del que hay y «Metas» salía cortado. En mobile va la versión
            chica y sin íconos; de sm para arriba, la completa. */}
        <div className="sm:hidden">
          <SegmentedControl
            value={vista}
            onChange={cambiarVista}
            size="sm"
            label="Vista del resumen"
            options={VISTAS.map((v) => ({ value: v.value, label: v.label }))}
          />
        </div>
        <div className="hidden sm:block">
          <SegmentedControl
            value={vista}
            onChange={cambiarVista}
            label="Vista del resumen"
            options={VISTAS.map((v) => ({
              value: v.value,
              label: v.label,
              icon: <v.icon className="h-4 w-4" aria-hidden />,
            }))}
          />
        </div>
        <span className="text-sm text-[var(--text-tertiary)]">
          {vista === "panorama" && "Qué tengo y qué me dice el lote."}
          {vista === "tablas" && "El detalle, partido como lo pida el cliente."}
          {vista === "rolliza" && "El patio de trozas y de qué troza salió cada pieza."}
          {vista === "metas" && "Qué buscabas y si mejoraste."}
        </span>
      </div>

      {/* ── Panorama ────────────────────────────────────────────────────────── */}
      {ver("panorama") && (
        <>
          {insights.length > 0 && (
            <SeccionResumen icon={Lightbulb} titulo="Lectura del lote" hint="Lo que el número dice y no se ve en la tabla.">
              <LecturaDelLote insights={insights} />
            </SeccionResumen>
          )}
          <SeccionResumen
            icon={Boxes}
            titulo="Dónde está el volumen"
            hint="Las medidas que más pesan: con eso se sale a ofrecer."
          >
            <DondeEstaElVolumen porMedida={porMedida} conValor={conValor} />
          </SeccionResumen>
        </>
      )}

      {/* ── Tablas ──────────────────────────────────────────────────────────── */}
      {ver("tablas") && (
        <>
          <SeccionResumen
            icon={Layers}
            titulo="Por especie y tipo"
            hint="Cuánto comercial, cuánta paquetería y cuánta corta salió de cada madera."
          >
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {bloques.map((b) => (
                <div key={b.especie} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-display text-lg text-[var(--text-primary)]">{b.especie}</span>
                    <span className="flex flex-wrap items-center gap-1.5 font-mono text-sm tabular-nums">
                      <Chip>{b.total.cantidad} pzas</Chip>
                      <Chip>{fmtPt(b.total.pieTablar)} PT</Chip>
                      <Chip>{fmtM3(b.total.m3)} m³</Chip>
                      {total.pieTablar > 0 && <Chip>{fmtPct((b.total.pieTablar / total.pieTablar) * 100)}% del lote</Chip>}
                      {conValor && <Chip acento>S/ {fmtSoles(b.total.valor)}</Chip>}
                    </span>
                  </div>
                  <TablaGrupos grupos={b.tipos} total={b.total} primeraCol="Tipo" conValor={conValor} esTipo compacta caption={`Tipos de ${b.especie}`} />
                </div>
              ))}
            </div>
          </SeccionResumen>

          <div className="grid gap-5 xl:grid-cols-2">
            <SeccionResumen icon={Layers} titulo="General por especie" hint="Una fila por madera, con lo que pesa en el lote.">
              <TablaGrupos grupos={porEspecie.grupos} total={porEspecie.total} primeraCol="Especie" conValor={conValor} compacta caption="Totales por especie" />
            </SeccionResumen>

            <SeccionResumen icon={Boxes} titulo="General por tipo" hint="El mix comercial del lote, todas las especies juntas.">
              <TablaGrupos grupos={porTipo.grupos} total={porTipo.total} primeraCol="Tipo" conValor={conValor} esTipo compacta caption="Totales por tipo comercial" />
            </SeccionResumen>
          </div>

          <SeccionResumen
            icon={SlidersHorizontal}
            titulo="Agrupado libre"
            hint="La misma madera partida como la pida el cliente."
            acciones={
              <button type="button" onClick={exportarDimCSV} title="Bajar esta vista en CSV" className={BTN}>
                <Download className="h-4 w-4" /> CSV
              </button>
            }
          >
            {/* Chips y no un `select`: son siete cortes del mismo lote y se
                comparan cambiando de uno al otro — con el desplegable había que
                abrirlo cada vez para ver qué había. */}
            <div className="mb-3 flex flex-wrap gap-1.5 print:hidden">
              {DIMENSIONES_RESUMEN.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDim(d)}
                  aria-pressed={dim === d}
                  className={`rounded-lg border-2 px-2.5 py-1 text-sm font-bold transition-colors ${dim === d
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"}`}
                >
                  {ETIQUETA_DIMENSION[d].replace("Por ", "")}
                </button>
              ))}
            </div>
            <TablaGrupos
              grupos={porDim.grupos}
              total={porDim.total}
              primeraCol={ETIQUETA_DIMENSION[dim].replace("Por ", "")}
              conValor={conValor}
              esTipo={dim === "tipo"}
              caption={`Totales ${ETIQUETA_DIMENSION[dim].toLowerCase()}`}
            />
          </SeccionResumen>
        </>
      )}

      {/* ── Rolliza ─────────────────────────────────────────────────────────── */}
      {ver("rolliza") && (
        <>
          <ResumenTrozas />
          <ResumenReparto rows={rows} precioDe={precioDe} />
        </>
      )}

      {/* ── Metas ───────────────────────────────────────────────────────────── */}
      {ver("metas") && (
        <>
          <ResumenMeta rows={rows} precioDe={precioDe} guardadas={guardadas} />
          <SeccionResumen
            icon={ArrowLeftRight}
            titulo="¿Mejoró respecto del lote anterior?"
            /* La comparación sigue la dimensión del agrupado libre: si no se dice,
               el usuario no entiende por qué habla de medidas y no de tipos. */
            hint={`Comparado ${ETIQUETA_DIMENSION[dim].toLowerCase()} — cambialo en «Tablas → Agrupado libre».`}
          >
            <ResumenComparar rows={rows} precioDe={precioDe} conValor={conValor} dim={dim} guardadas={guardadas} cargando={cargandoGuardadas} />
          </SeccionResumen>
        </>
      )}
    </div>
  );
}

/** Cifra suelta del encabezado de una especie. */
function Chip({ children, acento }: { children: React.ReactNode; acento?: boolean }) {
  return (
    <span className={`rounded-md px-1.5 py-0.5 ${acento
      ? "bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
      : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
      {children}
    </span>
  );
}
