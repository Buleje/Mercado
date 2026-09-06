"use client";

/**
 * LothTraceTabla — la misma información de las tarjetas, en densidad de hoja de
 * fiscalización.
 *
 * Reemplaza al cuadro «Censo vs realidad» que vivía debajo de la lista: era la
 * misma pregunta contestada por segunda vez, con otros decimales y sin las
 * columnas de tiempo. Acá hay una fila por árbol —incluidos los censados que
 * siguen en pie— y cada número sale de la MISMA fila fusionada que alimenta la
 * tarjeta, así que no pueden discrepar.
 */

import { DataTable } from "@buleje/design-system";
import { AlertTriangle, ArrowDown, TreePine } from "@buleje/design-system/icons";
import type { TraceFila } from "@/lib/forestal/loth-trace-tabla";
import { FLAG_LABEL, FLAG_TONE } from "@/lib/forestal/loth-arbol";
import { fmtFecha, tonoDe, type TraceNav, type TraceOrden } from "./loth-trace-ui";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

const CELL = "px-3 py-2 text-sm";
const NUM = `${CELL} text-right font-mono tabular-nums`;

const FLAG_CLASS = {
  error: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)] bg-[var(--data-error-500)]/15",
  warning: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)] bg-[var(--data-warning-500)]/15",
  info: "text-[var(--text-tertiary)] bg-[var(--surface-canvas)]",
} as const;

/** Columnas que se pueden ordenar desde su encabezado. */
const COLUMNAS: { key: keyof typeof HEAD; orden?: TraceOrden; num?: boolean }[] = [
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

const HEAD = {
  tree: "Árbol",
  especie: "Especie",
  censo: "Censo m³",
  talado: "Talado m³",
  precision: "Precisión",
  trozado: "Trozado m³",
  rend: "Rend.",
  merma: "Merma",
  movilizado: "Movilizado m³",
  etapas: "Etapas",
  ultima: "Última",
  obs: "Observaciones",
} as const;

export default function LothTraceTabla({
  filas,
  nav,
  seleccion,
  onSeleccionar,
  orden,
  onOrden,
}: {
  filas: TraceFila[];
  nav?: TraceNav;
  seleccion?: Set<string>;
  onSeleccionar?: (tree: string) => void;
  orden: TraceOrden;
  onOrden: (o: TraceOrden) => void;
}) {
  if (filas.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-10 text-center text-sm text-[var(--text-tertiary)]">
        <TreePine className="mx-auto mb-2 h-6 w-6 opacity-40" />
        Ningún árbol coincide con el filtro.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <DataTable className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-[var(--surface-canvas)]">
          <tr className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">
            {onSeleccionar && <th className={`${CELL} w-10`}><span className="sr-only">Seleccionar</span></th>}
            {COLUMNAS.map((c) => (
              <th key={c.key} className={`${CELL} font-bold ${c.num ? "text-right" : "text-left"}`}>
                {c.orden ? (
                  <button
                    type="button"
                    onClick={() => onOrden(c.orden!)}
                    className={`inline-flex items-center gap-1 rounded transition-colors hover:text-[var(--text-primary)] ${
                      orden === c.orden ? "text-[var(--text-primary)]" : ""
                    }`}
                    title={`Ordenar por ${HEAD[c.key].toLowerCase()}`}
                  >
                    {HEAD[c.key]}
                    {orden === c.orden && <ArrowDown className="h-3 w-3" />}
                  </button>
                ) : (
                  HEAD[c.key]
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <Fila key={f.tree} f={f} nav={nav} seleccionada={seleccion?.has(f.tree)} onSeleccionar={onSeleccionar} />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

function Fila({
  f,
  nav,
  seleccionada,
  onSeleccionar,
}: {
  f: TraceFila;
  nav?: TraceNav;
  seleccionada?: boolean;
  onSeleccionar?: (tree: string) => void;
}) {
  const tono = tonoDe(f.mermaVeredicto);
  const fondo =
    f.nivel === "error" ? "bg-[var(--data-error-500)]/10" : f.nivel === "warn" ? "bg-[var(--data-warning-500)]/10" : "";
  const desvio = f.precisionCensoPct != null ? Math.abs(f.precisionCensoPct - 100) : null;

  return (
    <tr className={`border-t border-[var(--rule-soft)] ${fondo} ${seleccionada ? "outline outline-2 -outline-offset-2 outline-[var(--data-info-500)]" : ""}`}>
      {onSeleccionar && (
        <td className={CELL}>
          <input
            type="checkbox"
            checked={!!seleccionada}
            onChange={() => onSeleccionar(f.tree)}
            aria-label={`Seleccionar el árbol ${f.tree}`}
            className="h-4 w-4 cursor-pointer accent-[var(--data-info-600)]"
          />
        </td>
      )}
      <td className={`${CELL} font-mono font-bold text-[var(--text-primary)]`}>
        {nav?.onVerCadena ? (
          <button
            type="button"
            onClick={() => nav.onVerCadena?.(f.tree)}
            title="Ver la cadena de custodia de este árbol"
            className="rounded underline decoration-dotted decoration-1 underline-offset-4 transition-colors hover:text-[var(--data-info-700)] dark:hover:text-[var(--data-info-500)]"
          >
            {f.tree}
          </button>
        ) : (
          f.tree
        )}
      </td>
      <td className={`${CELL} text-[var(--text-secondary)]`}>
        {f.especie ?? "—"}
        {f.cites && <span className="ml-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">CITES</span>}
      </td>
      <td className={NUM}>{f.censoM3 != null ? fmtM3(f.censoM3) : "—"}</td>
      <td className={NUM}>{f.taladoM3 != null ? fmtM3(f.taladoM3) : "—"}</td>
      <td className={`${NUM} font-bold ${desvio != null && desvio > 25 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]"}`}>
        {f.precisionCensoPct != null ? `${f.precisionCensoPct.toFixed(1)}%` : "—"}
      </td>
      <td className={NUM}>{f.trozadoM3 > 0 ? fmtM3(f.trozadoM3) : "—"}</td>
      <td className={`${NUM} font-bold ${tono.texto}`}>{f.rendimientoPct != null ? `${f.rendimientoPct.toFixed(1)}%` : "—"}</td>
      <td className={`${NUM} ${f.mermaVeredicto && f.mermaVeredicto !== "ok" ? `font-bold ${tono.texto}` : "text-[var(--text-secondary)]"}`}>
        {f.mermaPct != null ? `${f.mermaM3.toFixed(3)} · ${f.mermaPct.toFixed(0)}%` : "—"}
      </td>
      <td className={NUM}>
        {f.movilizadoM3 > 0 ? fmtM3(f.movilizadoM3) : "—"}
        {f.patioM3 > 0 && (
          <span className="block text-[length:var(--ts-2xs)] font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            {f.patioM3.toFixed(2)} en patio
          </span>
        )}
      </td>
      <td className={NUM}>{f.op ? `${f.etapas}/6` : "—"}</td>
      <td className={`${NUM} text-[var(--text-secondary)]`}>
        {fmtFecha(f.op?.lastDate)}
        {f.diasParado != null && (
          <span className="block text-[length:var(--ts-2xs)] font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            parado {f.diasParado} d
          </span>
        )}
      </td>
      <td className={`${CELL} text-xs`}>
        <Observaciones f={f} />
      </td>
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
          className={`inline-flex max-w-[22rem] items-center gap-1 truncate rounded-full px-2 py-0.5 font-bold ${
            a.level === "error" ? FLAG_CLASS.error : FLAG_CLASS.warning
          }`}
        >
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {a.message}
        </span>
      ))}
    </span>
  );
}
