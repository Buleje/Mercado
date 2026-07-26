"use client";

/**
 * CubicacionResumenes — reportes del lote cubicado, cruzando especie y tipo.
 * Lee el mismo lote que el cubicador (localStorage por tenant) y arma:
 *   1. Por especie y tipo — una tabla por especie con su desglose por tipo.
 *   2. General por especie — una fila por especie, solo totales.
 *   3. General por tipo    — una fila por tipo, todas las especies juntas.
 * Todo se deriva de las libs puras agruparPor / resumenPorEspecie.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, RefreshCw, Download, PackageOpen, Printer } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  agruparPor, resumenPorEspecie, resumenACsv, DIMENSIONES_RESUMEN, ETIQUETA_DIMENSION,
  type DimensionResumen, type GrupoResumen, type ResumenLote,
} from "@/lib/forestal/cubicacion-resumen";
import { analizarLote } from "@/lib/forestal/cubicacion-insights";
import { BarraComposicion, LecturaDelLote } from "./resumen-vistas";
import ResumenComparar from "./ResumenComparar";
import ResumenMeta from "./ResumenMeta";
import { useCubicacionesGuardadas } from "@/hooks/use-cubicaciones-guardadas";
import type { TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import { TipoBadge } from "./tipo-badge";

const fmtPt = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtM3 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const soles = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

/** Tabla genérica de grupos (piezas · PT · m³ · % · valor) con fila total. */
function TablaGrupos({ grupos, total, primeraCol, conValor, esTipo }: {
  grupos: GrupoResumen[];
  total: ResumenLote["total"];
  primeraCol: string;
  conValor: boolean;
  esTipo?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
      <table className="w-full min-w-[440px] text-sm">
        <thead>
          <tr className="bg-[var(--surface-sunken)] text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            <th className="px-3 py-2">{primeraCol}</th>
            <th className="px-3 py-2 text-right">Piezas</th>
            <th className="px-3 py-2 text-right">Pie tablar</th>
            <th className="px-3 py-2 text-right">m³</th>
            <th className="px-3 py-2 text-right">%</th>
            {conValor && <th className="px-3 py-2 text-right">Valor</th>}
            {conValor && <th className="px-3 py-2 text-right" title="Lo que rinde cada pie tablar de ese grupo">S/ / PT</th>}
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <tr key={g.clave} className="border-t border-[var(--rule-soft)]">
              <td className="px-3 py-2 font-bold text-[var(--text-primary)]">
                {esTipo ? <TipoBadge tipo={g.label as TipoComercial} /> : g.label}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{g.cantidad}</td>
              <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtPt(g.pieTablar)}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{fmtM3(g.m3)}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{g.pctPt}%</td>
              {conValor && <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--accent)]">S/ {soles(g.valor)}</td>}
              {conValor && (
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {g.pieTablar > 0 ? soles(g.valor / g.pieTablar) : "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10/40 font-bold text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])]">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right font-mono tabular-nums">{total.cantidad}</td>
            <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--accent)]">{fmtPt(total.pieTablar)}</td>
            <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{fmtM3(total.m3)}</td>
            <td className="px-3 py-2 text-right text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">100%</td>
            {conValor && <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--accent)]">S/ {soles(total.valor)}</td>}
            {conValor && (
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                {total.pieTablar > 0 ? soles(total.valor / total.pieTablar) : "—"}
              </td>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
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

  /** Historial: lo comparten la meta (tendencia) y el panel de comparación. */
  const { lista: guardadas, cargando: cargandoGuardadas } = useCubicacionesGuardadas();
  /** Dimensión libre: la pregunta al vender casi nunca es "por especie". */
  const [dim, setDim] = useState<DimensionResumen>("medida");
  const porEspecie = useMemo(() => agruparPor(rows, "especie", precioDe), [rows, precioDe]);
  const porTipo = useMemo(() => agruparPor(rows, "tipo", precioDe), [rows, precioDe]);
  const porDim = useMemo(() => agruparPor(rows, dim, precioDe), [rows, dim, precioDe]);
  const bloques = useMemo(() => resumenPorEspecie(rows, precioDe), [rows, precioDe]);
  const insights = useMemo(() => analizarLote(rows, precioDe), [rows, precioDe]);
  const total = porEspecie.total;

  /**
   * Imprimir/PDF: se marca el contenedor y una regla @media print esconde el
   * resto del admin. Sale por el diálogo del navegador — el mismo que ya genera
   * los PDF de liquidación — sin sumar otra librería.
   */
  const imprimir = () => window.print();

  /** CSV de la vista libre (la de especie×tipo tiene su propio export). */
  const exportarDimCSV = () => {
    const url = URL.createObjectURL(new Blob([resumenACsv(porDim, dim, conValor)], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `resumen-${dim}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const exportarCSV = () => {
    const lineas: string[] = ["Especie,Tipo,Piezas,PieTablar,m3" + (conValor ? ",ValorS/" : "")];
    for (const b of bloques) {
      for (const t of b.tipos) {
        lineas.push([b.especie, t.label, t.cantidad, t.pieTablar.toFixed(2), t.m3.toFixed(4), ...(conValor ? [t.valor.toFixed(2)] : [])].join(","));
      }
    }
    lineas.push(["TOTAL", "", total.cantidad, total.pieTablar.toFixed(2), total.m3.toFixed(4), ...(conValor ? [total.valor.toFixed(2)] : [])].join(","));
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
        <p className="text-sm font-bold text-[var(--text-primary)]">Todavía no hay lote cubicado</p>
        <p className="max-w-sm text-xs text-[var(--text-tertiary)]">Cubicá madera en la herramienta <b>Cubicador de madera</b> y volvé acá para ver los resúmenes por especie y tipo.</p>
        <button type="button" onClick={recargar} className="mt-1 inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="resumen-lote">
      {/* Al imprimir queda sólo el resumen: el admin alrededor no aporta al papel. */}
      <style>{`@media print {
        body * { visibility: hidden; }
        #resumen-lote, #resumen-lote * { visibility: visible; }
        #resumen-lote { position: absolute; left: 0; top: 0; width: 100%; }
        @page { size: A4 portrait; margin: 12mm; }
      }`}</style>
      {/* Encabezado + KPIs + acciones */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <BarChart3 className="h-4 w-4 text-[var(--accent)]" /> Resúmenes del lote
          </CardTitle>
          <div className="flex gap-2">
            <button type="button" onClick={recargar} title="Volver a leer el lote del cubicador" className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </button>
            <button type="button" onClick={imprimir} title="Imprimir o guardar como PDF para mandarle al comprador" className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] print:hidden">
              <Printer className="h-3.5 w-3.5" /> Imprimir
            </button>
            <button type="button" onClick={exportarCSV} className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] print:hidden">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="Piezas" value={String(total.cantidad)} />
          <Kpi label="Pie tablar" value={`${fmtPt(total.pieTablar)} PT`} />
          <Kpi label="Metros cúbicos" value={`${fmtM3(total.m3)} m³`} />
          <Kpi label="Valor del lote" value={conValor ? `S/ ${soles(total.valor)}` : "—"} />
        </div>

        {/* En qué se fue el volumen: dos barras que se leen de un vistazo */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <BarraComposicion grupos={porTipo.grupos} titulo="Composición por tipo (del pie tablar)" />
          <BarraComposicion grupos={porEspecie.grupos} titulo="Composición por especie (del pie tablar)" />
        </div>
      </div>

      {/* 1. Por especie y tipo */}
      <section>
        <h4 className="mb-2 text-sm font-bold text-[var(--text-primary)]">Por especie y tipo</h4>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {bloques.map((b) => (
            <div key={b.especie} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-[var(--text-primary)]">{b.especie}</span>
                <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{b.total.cantidad} pzas · {fmtPt(b.total.pieTablar)} PT{conValor ? ` · S/ ${soles(b.total.valor)}` : ""}</span>
              </div>
              <TablaGrupos grupos={b.tipos} total={b.total} primeraCol="Tipo" conValor={conValor} esTipo />
            </div>
          ))}
        </div>
      </section>

      {/* 2. General por especie */}
      <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <h4 className="mb-2 text-sm font-bold text-[var(--text-primary)]">General por especie</h4>
        <TablaGrupos grupos={porEspecie.grupos} total={porEspecie.total} primeraCol="Especie" conValor={conValor} />
      </section>

      {/* 3. General por tipo */}
      <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <h4 className="mb-2 text-sm font-bold text-[var(--text-primary)]">General por tipo</h4>
        <TablaGrupos grupos={porTipo.grupos} total={porTipo.total} primeraCol="Tipo" conValor={conValor} esTipo />
      </section>
      {/* Meta de mix: qué se buscaba, contra lo que salió */}
      <ResumenMeta rows={rows} precioDe={precioDe} guardadas={guardadas} />

      {/* Lectura del lote: lo accionable primero */}
      {insights.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-bold text-[var(--text-primary)]">Lectura del lote</h4>
          <LecturaDelLote insights={insights} />
        </section>
      )}

      {/* Vista libre: la pregunta del comprador suele ser por medida o largo */}
      <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-[var(--text-primary)]">Agrupado libre</h4>
          <div className="flex items-center gap-2">
            <select
              value={dim}
              onChange={(e) => setDim(e.target.value as DimensionResumen)}
              aria-label="Dimensión del agrupado"
              className="h-9 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              {DIMENSIONES_RESUMEN.map((d) => <option key={d} value={d}>{ETIQUETA_DIMENSION[d]}</option>)}
            </select>
            <button type="button" onClick={exportarDimCSV} title="Bajar esta vista en CSV" className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
        </div>
        <TablaGrupos grupos={porDim.grupos} total={porDim.total} primeraCol={ETIQUETA_DIMENSION[dim].replace("Por ", "")} conValor={conValor} esTipo={dim === "tipo"} />
      </section>

      {/* 4. Comparar contra una cubicación guardada */}
      <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 print:hidden">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-bold text-[var(--text-primary)]">¿Mejoró respecto del lote anterior?</h4>
          {/* La comparación sigue la dimensión del agrupado libre: si no se dice,
              el usuario no entiende por qué habla de medidas y no de tipos. */}
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            comparado <b className="text-[var(--text-secondary)]">{ETIQUETA_DIMENSION[dim].toLowerCase()}</b> — cambialo arriba
          </span>
        </div>
        <ResumenComparar rows={rows} precioDe={precioDe} conValor={conValor} dim={dim} guardadas={guardadas} cargando={cargandoGuardadas} />
      </section>

    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2">
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{value}</div>
    </div>
  );
}
