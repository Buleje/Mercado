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
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Download, Layers, RefreshCw } from "@buleje/design-system/icons";
import type { TrozaCubicada } from "@/lib/forestal/cubicacion-trozas";
import {
  agruparTrozasPor, DIMENSIONES_TROZAS, ETIQUETA_DIMENSION_TROZAS, resumenTrozasACsv,
  resumenTrozasPorEspecie, type DimensionTrozas, type GrupoTrozas,
} from "@/lib/forestal/cubicacion-trozas-resumen";
import { fmtM3, fmtPct, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { SeccionResumen } from "./resumen-tabla";

function tenantSlug(): string {
  try { return localStorage.getItem("active-tenant-slug") ?? "main"; } catch { return "main"; }
}
const claveTrozas = () => `buleje-cubicacion-trozas-${tenantSlug()}`;

function leerTrozas(): TrozaCubicada[] {
  try {
    const raw = localStorage.getItem(claveTrozas());
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as TrozaCubicada[]) : [];
  } catch {
    return [];
  }
}

const BTN = "inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]";

/** Fila compacta: label · piezas · PT · m³ · barra de participación. */
function FilaGrupo({ g, destacada }: { g: GrupoTrozas; destacada?: boolean }) {
  return (
    <tr className="border-t border-[var(--rule-soft)] even:bg-[var(--surface-canvas)]/50">
      <td className={`px-3 py-2 border-l-[3px] font-bold text-[var(--text-primary)] ${destacada ? "border-l-[var(--accent)]" : "border-l-transparent"}`}>
        {g.label}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{g.trozas}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtPt(g.pt)}</td>
      <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtM3(g.m3)}</td>
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
function TablaTrozas({ primeraCol, grupos, total, caption, compacta }: {
  primeraCol: string;
  grupos: GrupoTrozas[];
  total: { trozas: number; m3: number; pt: number };
  caption: string;
  compacta?: boolean;
}) {
  const TH = `${compacta ? "px-2" : "px-3"} py-2 text-left align-bottom text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]`;
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
      <DataTable className={`w-full text-sm ${compacta ? "min-w-[380px]" : "min-w-[480px]"}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-[var(--surface-sunken)]">
            <th scope="col" className={TH}>{primeraCol}</th>
            <th scope="col" className={`${TH} text-right`}>Piezas</th>
            <th scope="col" className={`${TH} text-right`}>PT</th>
            <th scope="col" className={`${TH} text-right`}>m³</th>
            <th scope="col" className={`${TH} w-[24%]`}>Participación</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g, i) => <FilaGrupo key={g.clave} g={g} destacada={i === 0 && grupos.length > 1} />)}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <th scope="row" className="px-3 py-2.5 text-left">Total · {grupos.length} {grupos.length === 1 ? "grupo" : "grupos"}</th>
            <td className="px-3 py-2.5 text-right font-mono tabular-nums">{total.trozas}</td>
            <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtPt(total.pt)}</td>
            <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtM3(total.m3)}</td>
            <td className="px-3 py-2.5 text-[length:var(--ts-2xs)] uppercase tracking-wide">100%</td>
          </tr>
        </tfoot>
      </DataTable>
    </div>
  );
}

export default function ResumenTrozas() {
  const [rows, setRows] = useState<TrozaCubicada[]>(() => (typeof window === "undefined" ? [] : leerTrozas()));
  const recargar = useCallback(() => setRows(leerTrozas()), []);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === claveTrozas()) recargar(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [recargar]);

  const [dim, setDim] = useState<DimensionTrozas>("especie");
  const resumen = useMemo(() => agruparTrozasPor(rows, dim), [rows, dim]);
  const bloques = useMemo(() => resumenTrozasPorEspecie(rows), [rows]);
  const etiqueta = ETIQUETA_DIMENSION_TROZAS[dim].replace("Por ", "");

  const exportarCSV = () => {
    const url = URL.createObjectURL(new Blob([resumenTrozasACsv(resumen, dim)], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `resumen-trozas-${dim}-${new Date().toISOString().slice(0, 10)}.csv`;
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
      titulo="Cubicación de trozas (patio)"
      hint={`${rows.length} ${rows.length === 1 ? "troza" : "trozas"} · ${fmtPt(resumen.total.pt)} PT · ${fmtM3(resumen.total.m3)} m³ en total`}
      ayuda="La rolliza que hay en el patio, leída tal cual se cubicó en «Cubicador de trozas»: piezas, PT y m³ por especie y por tipo. Se actualiza sola mientras cargás. Es otro lote que el de la aserrada — acá no se distribuye nada, sólo se lee lo que entró."
      acciones={
        <>
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
                <span className="rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[var(--text-secondary)]">{fmtPt(b.total.pt)} PT</span>
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{fmtM3(b.total.m3)} m³</span>
              </span>
            </div>
            <TablaTrozas primeraCol="Tipo" grupos={b.tipos} total={b.total} caption={`Tipos de ${b.especie}`} compacta />
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
      <TablaTrozas primeraCol={etiqueta} grupos={resumen.grupos} total={resumen.total} caption={`Trozas por ${etiqueta.toLowerCase()}`} />
    </SeccionResumen>
  );
}
