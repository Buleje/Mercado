"use client";

/**
 * ResumenTrozas — el patio de trozas (rolliza) leído tal cual se cubicó:
 * piezas · m³ · PT (equivalente) por especie y por tipo, ACTUALIZADO en vivo
 * a medida que se cargan más trozas (lee el mismo localStorage que
 * `CubicadorTrozas`, sin paso intermedio). Lote DISTINTO al de la aserrada
 * (clave `buleje-cubicacion-trozas-{slug}`, el slug al final —
 * [[cubicacion-reparto-rolliza-aserrada]]). No confundir con `ResumenReparto`,
 * que abajo DISTRIBUYE esta misma rolliza sobre lo aserrado: acá sólo se lee
 * lo que hay en el patio.
 *
 * Dos lotes, uno por fórmula (`cubicacion-trozas-formula.ts`): Smalian en m³
 * (con el PT como equivalente) y Oxapampina en PT propio, sin m³. Abre en la
 * fórmula elegida en el cubicador; si los dos tienen trozas, se cambia acá.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { DataTable } from "@buleje/design-system";
import { Download, Layers, RefreshCw } from "@buleje/design-system/icons";
import type { TrozaCubicada } from "@/lib/forestal/cubicacion-trozas";
import {
  agruparTrozasPor, DIMENSIONES_TROZAS, ETIQUETA_DIMENSION_TROZAS, resumenTrozasACsv,
  resumenTrozasPorEspecie, type DimensionTrozas, type GrupoTrozas,
} from "@/lib/forestal/cubicacion-trozas-resumen";
import { fmtM3, fmtPct, fmtPt } from "@/lib/forestal/cubicacion-formato";
import {
  claveFormulaTrozas, claveLoteTrozas, esFormulaTrozas, FORMULAS_TROZAS, UNIDADES_FORMULA, type FormulaTrozas,
} from "@/lib/forestal/cubicacion-trozas-formula";
import { formatNumber } from "@/lib/format";
import { SeccionResumen } from "./resumen-tabla";

function tenantSlug(): string {
  try { return localStorage.getItem("active-tenant-slug") ?? "main"; } catch { return "main"; }
}
const claveTrozas = (f: FormulaTrozas) => claveLoteTrozas(tenantSlug(), f);

function leerTrozas(f: FormulaTrozas): TrozaCubicada[] {
  try {
    const raw = localStorage.getItem(claveTrozas(f));
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as TrozaCubicada[]) : [];
  } catch {
    return [];
  }
}

/** La fórmula elegida en el cubicador, salvo que su lote esté vacío y el otro no. */
function formulaInicial(): FormulaTrozas {
  let f: FormulaTrozas = "smalian";
  try { const v = localStorage.getItem(claveFormulaTrozas(tenantSlug())); if (esFormulaTrozas(v)) f = v; } catch { /* ignore */ }
  const otra: FormulaTrozas = f === "smalian" ? "oxapampina" : "smalian";
  return leerTrozas(f).length === 0 && leerTrozas(otra).length > 0 ? otra : f;
}
/** El PT propio de la Oxapampina va con sus 2 decimales; el equivalente de la Smalian, entero. */
const fmtPtDe = (f: FormulaTrozas) => (f === "oxapampina" ? (v: number) => formatNumber(v, 2) : fmtPt);

const BTN = "inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]";

/** Fila compacta: label · piezas · PT · m³ · barra de participación. */
function FilaGrupo({ g, destacada, formula }: { g: GrupoTrozas; destacada?: boolean; formula: FormulaTrozas }) {
  const ox = formula === "oxapampina";
  return (
    <tr className="border-t border-[var(--rule-soft)] even:bg-[var(--surface-canvas)]/50">
      <td className={`px-3 py-2 border-l-[3px] font-bold text-[var(--text-primary)] ${destacada ? "border-l-[var(--accent)]" : "border-l-transparent"}`}>
        {g.label}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{g.trozas}</td>
      {!ox && <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtM3(g.m3)}</td>}
      <td className={`px-3 py-2 text-right font-mono tabular-nums ${ox ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{fmtPtDe(formula)(g.pt)}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="hidden h-2 min-w-[2.5rem] flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)] sm:block">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, g.pctM3)}%` }} />
          </div>
          <span className="w-11 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{fmtPct(g.pctM3)}%</span>
        </div>
      </td>
    </tr>
  );
}

/** Tabla genérica (grupos + total) — comparte forma con la de especie×tipo y la del agrupado libre. */
function TablaTrozas({ primeraCol, grupos, total, caption, compacta, formula }: {
  formula: FormulaTrozas;
  primeraCol: string;
  grupos: GrupoTrozas[];
  total: { trozas: number; m3: number; pt: number };
  caption: string;
  compacta?: boolean;
}) {
  const ox = formula === "oxapampina";
  const TH = `${compacta ? "px-2" : "px-3"} py-2 text-left align-bottom text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]`;
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
      <DataTable className={`w-full text-sm ${compacta ? "min-w-[380px]" : "min-w-[480px]"}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-[var(--surface-sunken)]">
            <th scope="col" className={TH}>{primeraCol}</th>
            {/* Piezas · m³ · PT, la convención del módulo (2026-09-09). */}
            <th scope="col" className={`${TH} text-right`}>Piezas</th>
            {!ox && <th scope="col" className={`${TH} text-right`}>m³</th>}
            <th scope="col" className={`${TH} text-right`}>PT</th>
            <th scope="col" className={`${TH} w-[24%]`}>Participación</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g, i) => <FilaGrupo key={g.clave} g={g} destacada={i === 0 && grupos.length > 1} formula={formula} />)}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <th scope="row" className="px-3 py-2.5 text-left">Total · {grupos.length} {grupos.length === 1 ? "grupo" : "grupos"}</th>
            <td className="px-3 py-2.5 text-right font-mono tabular-nums">{total.trozas}</td>
            {!ox && <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtM3(total.m3)}</td>}
            <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtPtDe(formula)(total.pt)}</td>
            <td className="px-3 py-2.5 text-[length:var(--ts-2xs)] uppercase tracking-wide">100%</td>
          </tr>
        </tfoot>
      </DataTable>
    </div>
  );
}

export default function ResumenTrozas() {
  const [formula, setFormula] = useState<FormulaTrozas>(() => (typeof window === "undefined" ? "smalian" : formulaInicial()));
  const [lotes, setLotes] = useState<Record<FormulaTrozas, TrozaCubicada[]>>(() =>
    typeof window === "undefined"
      ? { smalian: [], oxapampina: [] }
      : { smalian: leerTrozas("smalian"), oxapampina: leerTrozas("oxapampina") });
  const recargar = useCallback(() => setLotes({ smalian: leerTrozas("smalian"), oxapampina: leerTrozas("oxapampina") }), []);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (FORMULAS_TROZAS.some((f) => e.key === claveTrozas(f))) recargar(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [recargar]);
  /* Si el lote que se miraba quedó vacío (se vació en otra pestaña) y el otro
     tiene trozas, se pasa al otro en vez de desaparecer la sección. */
  useEffect(() => {
    const otra: FormulaTrozas = formula === "smalian" ? "oxapampina" : "smalian";
    if (lotes[formula].length === 0 && lotes[otra].length > 0) setFormula(otra);
  }, [lotes, formula]);
  const rows = lotes[formula];
  const ox = formula === "oxapampina";
  const fmtPtF = fmtPtDe(formula);

  const [dim, setDim] = useState<DimensionTrozas>("especie");
  const resumen = useMemo(() => agruparTrozasPor(rows, dim, formula), [rows, dim, formula]);
  const bloques = useMemo(() => resumenTrozasPorEspecie(rows, formula), [rows, formula]);
  const etiqueta = ETIQUETA_DIMENSION_TROZAS[dim].replace("Por ", "");

  const exportarCSV = () => {
    const url = URL.createObjectURL(new Blob([resumenTrozasACsv(resumen, dim, formula)], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `resumen-trozas-${ox ? "oxapampina-" : ""}${dim}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  /**
   * Sin trozas cubicadas la sección DESAPARECE (Brandon, 2026-09-01: «si no hay
   * datos entonces ese bloque se ocultará hasta que haya datos»). Antes ocupaba
   * media pantalla con un cartel vacío justo encima de la tabla que sí se está
   * mirando —«Distribución de rolliza sobre lo aserrado»—, empujándola fuera
   * de la vista.
   *
   * No se pierde el acceso: `CubicacionResumenes` monta esta sección cada vez
   * que se entra al chip «Rolliza», así que volver del cubicador de trozas la
   * hace releer y reaparecer; y el evento `storage` la trae en vivo si se
   * cubicó en otra pestaña.
   */
  if (rows.length === 0) return null;

  return (
    <SeccionResumen
      icon={Layers}
      titulo={`Cubicación de trozas (patio · ${UNIDADES_FORMULA[formula].nombre})`}
      hint={`${rows.length} ${rows.length === 1 ? "troza" : "trozas"} · ${fmtPtF(resumen.total.pt)} PT${ox ? " Oxapampa" : ` · ${fmtM3(resumen.total.m3)} m³`} en total`}
      ayuda={ox
        ? "La rolliza del lote Oxapampina del «Cubicador de trozas» (Ø en pulgadas, largo en pies): piezas y pie tablar Oxapampa por especie y por tipo, sin m³. Se actualiza sola mientras cargas."
        : "La rolliza que hay en el patio, leída tal cual se cubicó en «Cubicador de trozas»: piezas, PT y m³ por especie y por tipo. Se actualiza sola mientras cargas. Es otro lote que el de la aserrada — acá no se distribuye nada, sólo se lee lo que entró."}
      acciones={
        <>
          {/* Los dos lotes con trozas: se elige cuál leer. Con uno solo, no hay nada que elegir. */}
          {lotes.smalian.length > 0 && lotes.oxapampina.length > 0 && (
            <SegmentedControl
              value={formula}
              onChange={setFormula}
              size="sm"
              label="Qué lote del cubicador de trozas leer"
              className="print:hidden"
              options={FORMULAS_TROZAS.map((f) => ({ value: f, label: UNIDADES_FORMULA[f].etiqueta }))}
            />
          )}
          <button type="button" onClick={recargar} title="Volver a leer el patio del cubicador de trozas" className={`${BTN} print:hidden`}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
          <button type="button" onClick={exportarCSV} className={`${BTN} print:hidden`}>
            <Download className="h-4 w-4" /> CSV
          </button>
        </>
      }
    >
      {/* Especie × tipo: una tarjeta por especie con su desglose de diámetro — la
          pregunta real es "el Cedro, cuánto delgado / cuánto grueso", no un solo total. */}
      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {bloques.map((b) => (
          <div key={b.especie} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-display text-lg text-[var(--text-primary)]">{b.especie}</span>
              <span className="flex flex-wrap items-center gap-1.5 font-mono text-sm tabular-nums">
                <span className="rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[var(--text-secondary)]">{b.total.trozas} pzas</span>
                {ox ? (
                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{fmtPtF(b.total.pt)} PT</span>
                ) : (
                  <>
                    <span className="rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[var(--text-secondary)]">{fmtPt(b.total.pt)} PT</span>
                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{fmtM3(b.total.m3)} m³</span>
                  </>
                )}
              </span>
            </div>
            <TablaTrozas formula={formula} primeraCol="Tipo" grupos={b.tipos} total={b.total} caption={`Tipos de ${b.especie}`} compacta />
          </div>
        ))}
      </div>

      {/* Agrupado libre: la misma madera partida por especie / tipo / largo, un chip a la vez. */}
      <div className="mb-3 flex flex-wrap gap-1.5 print:hidden">
        {DIMENSIONES_TROZAS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDim(d)}
            aria-pressed={dim === d}
            className={`rounded-lg border-2 px-2.5 py-1 text-sm font-bold transition-colors ${dim === d
              ? "border-[var(--accent)] bg-[var(--accent)] text-white"
              : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"}`}
          >
            {ETIQUETA_DIMENSION_TROZAS[d].replace("Por ", "")}
          </button>
        ))}
      </div>
      <TablaTrozas formula={formula} primeraCol={etiqueta} grupos={resumen.grupos} total={resumen.total} caption={`Trozas por ${etiqueta.toLowerCase()}`} />
    </SeccionResumen>
  );
}
