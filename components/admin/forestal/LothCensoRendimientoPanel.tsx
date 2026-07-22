"use client";

/**
 * LothCensoRendimientoPanel — el cuadro que faltaba: **¿lo que el censo prometió
 * es lo que el monte dio?**
 *
 * La trazabilidad ya seguía cada árbol de la tala al despacho, pero arrancaba en
 * la tala. El eslabón anterior —el volumen ESTIMADO del censo, que es el que
 * sustenta la autorización— no se comparaba con nada. Un censo inflado es una
 * autorización inflada: el desvío entre estimado y real es lo primero que cruza
 * OSINFOR.
 *
 * Cálculo puro en `loth-arbol`; acá van la lectura, el filtro y el CSV.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Download, Search, TreePine } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import {
  construirFichasArbol,
  fichaMatches,
  fichasToCsv,
  resumirArboles,
  FLAG_LABEL,
  FLAG_TONE,
  type ArbolCensoInput,
  type ArbolFicha,
} from "@/lib/forestal/loth-arbol";

const CELL = "px-3 py-2 text-sm";
const NUM = `${CELL} text-right font-mono tabular-nums`;

const TONE_CLASS = {
  error: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  warning: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  info: "text-[var(--text-tertiary)]",
} as const;

type Filtro = "todos" | "banderas" | "talados" | "en_pie";

export default function LothCensoRendimientoPanel({
  censo,
  entries,
  dmcOverrides,
}: {
  censo: ArbolCensoInput[];
  entries: LothEntryDTO[];
  dmcOverrides?: Record<string, number>;
}) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const fichas = useMemo(
    () => construirFichasArbol({ censo, entries, dmcOverrides, hoy: new Date() }),
    [censo, entries, dmcOverrides],
  );
  const resumen = useMemo(() => resumirArboles(fichas), [fichas]);
  const shown = useMemo(
    () =>
      fichas.filter((f) => {
        if (!fichaMatches(f, q)) return false;
        if (filtro === "banderas") return f.flags.some((x) => FLAG_TONE[x] !== "info");
        if (filtro === "talados") return !f.enPie;
        if (filtro === "en_pie") return f.enPie;
        return true;
      }),
    [fichas, q, filtro],
  );

  const descargar = () => {
    const blob = new Blob([`﻿${fichasToCsv(fichas)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rendimiento-por-arbol.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (censo.length === 0 && fichas.length === 0) return null;

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
        <div>
          <CardTitle as="h3" className="text-sm font-black uppercase tracking-widest text-[var(--text-secondary)]">
            Censo vs realidad · rendimiento por árbol
          </CardTitle>
          <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">
            Lo que el censo estimó contra lo que dio la tala, el trozado y lo movilizado
          </p>
        </div>
        <button
          type="button"
          onClick={descargar}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </header>

      <div className="grid gap-2 border-b-2 border-[var(--rule-base)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Precisión del censo"
          valor={resumen.precisionCensoPct != null ? `${resumen.precisionCensoPct.toFixed(1)}%` : "—"}
          sub={
            resumen.precisionCensoPct == null
              ? "hace falta talar árboles censados"
              : resumen.precisionCensoPct < 90
                ? "el censo prometió más de lo que dio"
                : resumen.precisionCensoPct > 110
                  ? "el censo quedó corto"
                  : "estimación confiable"
          }
          tone={
            resumen.precisionCensoPct == null
              ? "info"
              : resumen.precisionCensoPct < 75 || resumen.precisionCensoPct > 125
                ? "warning"
                : "success"
          }
        />
        <Kpi
          label="Rendimiento de trozado"
          valor={resumen.rendimientoTrozadoPct != null ? `${resumen.rendimientoTrozadoPct.toFixed(1)}%` : "—"}
          sub={`${resumen.volumenTrozadoM3.toFixed(3)} m³ de ${resumen.volumenTaladoM3.toFixed(3)} tumbados`}
        />
        <Kpi label="Árboles con bandera" valor={String(resumen.conBandera)} sub={`de ${resumen.arboles} en el cuadro`} tone={resumen.conBandera > 0 ? "warning" : "success"} />
        <Kpi label="Movilizado" valor={`${resumen.volumenMovilizadoM3.toFixed(3)} m³`} sub={`${resumen.talados} talado(s) · ${resumen.enPie} en pie`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-subtle)] p-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por árbol, especie o troza…"
            className="h-10 w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-9 pr-3 text-sm text-[var(--text-primary)]"
          />
        </div>
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as Filtro)}
          className="h-10 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)]"
        >
          <option value="todos">Todos</option>
          <option value="banderas">Solo con bandera</option>
          <option value="talados">Talados</option>
          <option value="en_pie">En pie</option>
        </select>
        <span className="text-xs font-bold tabular-nums text-[var(--text-tertiary)]">
          {shown.length} de {fichas.length}
        </span>
      </div>

      <div className="max-h-[420px] overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-[var(--surface-canvas)]">
            <tr className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">
              <th className={`${CELL} text-left font-bold`}>Árbol</th>
              <th className={`${CELL} text-left font-bold`}>Especie</th>
              <th className={`${CELL} text-right font-bold`}>Censo (m³)</th>
              <th className={`${CELL} text-right font-bold`}>Talado (m³)</th>
              <th className={`${CELL} text-right font-bold`}>Precisión</th>
              <th className={`${CELL} text-right font-bold`}>Trozado (m³)</th>
              <th className={`${CELL} text-right font-bold`}>Rend.</th>
              <th className={`${CELL} text-right font-bold`}>Movilizado (m³)</th>
              <th className={`${CELL} text-left font-bold`}>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 300).map((f) => (
              <Fila key={f.treeCode} f={f} />
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
                  <TreePine className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  Ningún árbol coincide con el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {shown.length > 300 && <p className="px-4 py-2 text-center text-xs text-[var(--text-tertiary)]">Mostrando 300 de {shown.length}.</p>}
    </section>
  );
}

function Fila({ f }: { f: ArbolFicha }) {
  const rojo = f.flags.some((x) => FLAG_TONE[x] === "error");
  const amarillo = !rojo && f.flags.some((x) => FLAG_TONE[x] === "warning");
  const precisionTone =
    f.precisionCensoPct == null ? "info" : f.precisionCensoPct < 75 || f.precisionCensoPct > 125 ? "warning" : "info";

  return (
    <tr className={`border-t border-[var(--rule-subtle)] ${rojo ? "bg-[var(--data-error-500)]/10" : amarillo ? "bg-[var(--data-warning-500)]/10" : ""}`}>
      <td className={`${CELL} font-mono font-bold text-[var(--text-primary)]`}>{f.treeCode}</td>
      <td className={`${CELL} text-[var(--text-secondary)]`}>{f.especie}</td>
      <td className={NUM}>{f.volumenCensoM3?.toFixed(4) ?? "—"}</td>
      <td className={NUM}>{f.volumenTaladoM3?.toFixed(4) ?? "—"}</td>
      <td className={`${NUM} font-bold ${TONE_CLASS[precisionTone]}`}>
        {f.precisionCensoPct != null ? `${f.precisionCensoPct.toFixed(1)}%` : "—"}
      </td>
      <td className={NUM}>{f.volumenTrozadoM3 > 0 ? f.volumenTrozadoM3.toFixed(4) : "—"}</td>
      <td className={NUM}>{f.rendimientoTrozadoPct != null ? `${f.rendimientoTrozadoPct.toFixed(1)}%` : "—"}</td>
      <td className={NUM}>{f.volumenMovilizadoM3 > 0 ? f.volumenMovilizadoM3.toFixed(4) : "—"}</td>
      <td className={`${CELL} text-xs`}>
        {f.flags.length === 0 ? (
          <span className="text-[var(--text-tertiary)]">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {f.flags.map((x) => (
              <span
                key={x}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${TONE_CLASS[FLAG_TONE[x]]} ${
                  FLAG_TONE[x] === "error"
                    ? "bg-[var(--data-error-500)]/15"
                    : FLAG_TONE[x] === "warning"
                      ? "bg-[var(--data-warning-500)]/15"
                      : "bg-[var(--surface-canvas)]"
                }`}
              >
                {FLAG_TONE[x] !== "info" && <AlertTriangle className="h-3 w-3" />}
                {FLAG_LABEL[x]}
              </span>
            ))}
          </span>
        )}
      </td>
    </tr>
  );
}

function Kpi({
  label,
  valor,
  sub,
  tone = "info",
}: {
  label: string;
  valor: string;
  sub: string;
  tone?: "success" | "warning" | "info";
}) {
  const color =
    tone === "success"
      ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
      : tone === "warning"
        ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`font-mono text-2xl font-black tabular-nums ${color}`}>{valor}</p>
      <p className="text-xs font-semibold text-[var(--text-tertiary)]">{sub}</p>
    </div>
  );
}
