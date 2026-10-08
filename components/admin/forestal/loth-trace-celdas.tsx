"use client";

/**
 * Las celdas de la tabla «Por árbol» —cabecera y cuerpo— como mapas
 * `id → celda`, para pintarlas con `<EnOrden>` en el orden que eligió el
 * operador (mismo esquema que `loth-seccion-celdas`). La tabla, su caja y su
 * pie viven en `LothTraceTabla`; acá sólo se dibuja cada celda.
 */

import type { ReactNode } from "react";
import { AlertTriangle, ArrowDown } from "@buleje/design-system/icons";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import type { TraceFila } from "@/lib/forestal/loth-trace-tabla";
import { FLAG_LABEL, FLAG_TONE } from "@/lib/forestal/loth-arbol";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { fmtDias, fmtFecha, fmtPct, tonoDe, type TraceOrden } from "./loth-trace-ui";
import { FiltroEnCabecera, type FiltrosTabla } from "./filtros-tabla-forestal";
import { soloEnOrden } from "./loth-seccion-columnas";

/* El padding lo pone `DataTable` (sus variantes descendientes le ganan a una
   clase en la celda): acá sólo tamaño y alineación. */
export const CELL = "text-sm";
export const NUM = `${CELL} text-right tabular-nums`;
export const EN_PATIO = "block text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";

const FLAG_CLASS = {
  error: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)] bg-[var(--data-error-500)]/15",
  warning: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)] bg-[var(--data-warning-500)]/15",
  info: "text-[var(--text-tertiary)] bg-[var(--surface-canvas)]",
} as const;

export const HEAD = {
  tree: "Árbol",
  especie: "Especie",
  censo: "Censo m³",
  talado: "Talado m³",
  precision: "Precisión",
  trozado: "Trozado m³",
  rend: "Rend.",
  merma: "Merma",
  movilizado: "Salió m³",
  etapas: "Etapas",
  ultima: "Última",
  obs: "Observaciones",
} as const;
export type ColArbol = keyof typeof HEAD;

/** Las columnas en su orden de fábrica; las de `orden` se ordenan desde su encabezado. */
export const COLUMNAS: { key: ColArbol; orden?: TraceOrden; num?: boolean }[] = [
  { key: "tree", orden: "codigo" },
  { key: "especie" },
  { key: "censo", num: true },
  { key: "talado", orden: "volumen", num: true },
  { key: "precision", orden: "precision", num: true },
  { key: "trozado", num: true },
  { key: "rend", orden: "rendimiento", num: true },
  { key: "merma", orden: "merma", num: true },
  { key: "movilizado", num: true },
  { key: "etapas", orden: "etapas", num: true },
  { key: "ultima", orden: "fecha", num: true },
  { key: "obs" },
];

/** Lo que aclara el encabezado cuando la palabra sola no alcanza. */
const HEAD_TITLE: Partial<Record<ColArbol, string>> = {
  precision: "Talado ÷ censo: qué tan cerca estuvo la estimación",
  rend: "Trozado ÷ talado. «—» = todavía sin trozar",
  merma: "Talado − trozado, sólo de los árboles ya trozados",
  movilizado: "Salió del patio: trozas despachadas o al aserrío",
};

/** Los `<th>` movibles (con `data-col`: el arrastre los reconoce por ahí). */
export function cabeceras(orden: TraceOrden, onOrden: (o: TraceOrden) => void, filtros?: FiltrosTabla<TraceFila>): Record<string, ReactNode> {
  const out: Record<string, ReactNode> = {};
  for (const c of COLUMNAS) {
    const porEsta = c.orden;
    out[c.key] = (
      <th data-col={c.key} className={c.num ? "text-right" : "text-left"} title={HEAD_TITLE[c.key]}>
        <span className="whitespace-nowrap">
          {porEsta ? (
            <button
              type="button"
              onClick={() => onOrden(porEsta)}
              className={`inline-flex items-center gap-1 rounded uppercase transition-colors hover:text-[var(--text-primary)] ${orden === porEsta ? "text-[var(--text-primary)]" : ""}`}
              title={`Ordenar por ${HEAD[c.key].toLowerCase()} · arrastra el título para moverla`}
            >
              {HEAD[c.key]}
              {orden === porEsta && <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          ) : (
            HEAD[c.key]
          )}
          {filtros && <FiltroEnCabecera id={c.key} f={filtros} compacto />}
        </span>
      </th>
    );
  }
  return out;
}

export function Fila({
  f,
  cols,
  seleccionada,
  onSeleccionar,
  onAbrir,
}: {
  f: TraceFila;
  cols: readonly string[];
  seleccionada: boolean;
  onSeleccionar: (tree: string) => void;
  onAbrir?: (tree: string) => void;
}) {
  const tono = tonoDe(f.mermaVeredicto);
  const fondo = f.nivel === "error" ? "bg-[var(--data-error-500)]/10" : f.nivel === "warn" ? "bg-[var(--data-warning-500)]/10" : "";
  const desvio = f.precisionCensoPct != null ? Math.abs(f.precisionCensoPct - 100) : null;
  const celdas: Record<ColArbol, ReactNode> = {
    tree: (
      <td className={`${CELL} font-bold text-[var(--text-primary)]`}>
        {f.op && onAbrir ? (
          <button
            type="button"
            onClick={() => onAbrir(f.tree)}
            title="Ver el detalle del árbol: alertas, dónde se fue la madera y las seis secciones"
            className="rounded underline decoration-dotted decoration-1 underline-offset-4 transition-colors hover:text-[var(--data-info-700)] dark:hover:text-[var(--data-info-500)]"
          >
            {f.tree}
          </button>
        ) : (
          f.tree
        )}
      </td>
    ),
    especie: (
      <td className={`${CELL} text-[var(--text-secondary)]`}>
        {f.especie ?? "—"}
        {f.cites && <span className="ml-1 text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">CITES</span>}
      </td>
    ),
    censo: <td className={NUM}>{f.censoM3 != null ? fmtM3(f.censoM3) : "—"}</td>,
    talado: <td className={NUM}>{f.taladoM3 != null ? fmtM3(f.taladoM3) : "—"}</td>,
    precision: (
      <td className={`${NUM} font-bold ${desvio != null && desvio > 25 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]"}`}>
        {f.precisionCensoPct != null ? fmtPct(f.precisionCensoPct) : "—"}
      </td>
    ),
    trozado: <td className={NUM}>{f.trozadoM3 > 0 ? fmtM3(f.trozadoM3) : "—"}</td>,
    rend: <td className={`${NUM} font-bold ${tono.texto}`}>{f.rendimientoPct != null ? fmtPct(f.rendimientoPct) : "—"}</td>,
    merma: (
      <td className={`${NUM} ${f.mermaVeredicto && f.mermaVeredicto !== "ok" ? `font-bold ${tono.texto}` : "text-[var(--text-secondary)]"}`}>
        {f.mermaM3 != null && f.mermaPct != null ? `${fmtM3(f.mermaM3)} · ${fmtPct(f.mermaPct, 0)}` : "—"}
      </td>
    ),
    movilizado: (
      <td className={NUM}>
        {f.movilizadoM3 > 0 ? fmtM3(f.movilizadoM3) : "—"}
        {f.patioM3 > 0 && <span className={EN_PATIO}>{fmtM3(f.patioM3)} en patio</span>}
      </td>
    ),
    etapas: <td className={NUM}>{f.op ? `${f.etapas}/6` : "—"}</td>,
    ultima: (
      <td className={`${NUM} text-[var(--text-secondary)]`}>
        {fmtFecha(f.op?.lastDate)}
        {f.diasParado != null && <span className={EN_PATIO}>parado {fmtDias(f.diasParado)}</span>}
      </td>
    ),
    obs: (
      <td className={`${CELL} text-xs`}>
        <Observaciones f={f} />
      </td>
    ),
  };

  return (
    <tr className={`border-t border-[var(--rule-soft)] ${fondo} ${seleccionada ? "outline outline-1 -outline-offset-1 outline-[var(--data-info-500)]" : ""}`}>
      <td className={CELL}>
        <input
          type="checkbox"
          checked={seleccionada}
          onChange={() => onSeleccionar(f.tree)}
          aria-label={`Seleccionar el árbol ${f.tree}`}
          className="h-4 w-4 cursor-pointer accent-[var(--data-info-600)]"
        />
      </td>
      <EnOrden orden={cols} celdas={soloEnOrden(cols, celdas)} />
    </tr>
  );
}

function Observaciones({ f }: { f: TraceFila }) {
  const alertas = f.op?.alerts ?? [];
  if (alertas.length === 0 && f.flags.length === 0) return <span className="text-[var(--text-tertiary)]">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {f.flags.map((x) => (
        <span key={x} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${FLAG_CLASS[FLAG_TONE[x]]}`}>
          {FLAG_TONE[x] !== "info" && <AlertTriangle className="h-3 w-3" />}
          {FLAG_LABEL[x]}
        </span>
      ))}
      {alertas.map((a, i) => (
        <span
          key={`a${i}`}
          title={a.message}
          className={`inline-flex max-w-[22rem] items-center gap-1 truncate rounded-full px-2 py-0.5 font-bold ${a.level === "error" ? FLAG_CLASS.error : FLAG_CLASS.warning}`}
        >
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {a.message}
        </span>
      ))}
    </span>
  );
}
