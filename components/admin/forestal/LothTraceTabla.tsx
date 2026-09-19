"use client";

/**
 * LothTraceTabla — la misma información de las tarjetas, en densidad de hoja de
 * fiscalización. El código del árbol abre su ventana de detalle, igual que en
 * las tarjetas (la cadena de custodia se abre desde ahí).
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
import { fmtDias, fmtFecha, fmtPct, tonoDe, type TraceOrden } from "./loth-trace-ui";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/* El padding lo pone `DataTable` (sus variantes descendientes le ganan a una
   clase en la celda): acá sólo tamaño y alineación. */
const CELL = "text-sm";
const NUM = `${CELL} text-right tabular-nums`;

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
  movilizado: "Salió m³",
  etapas: "Etapas",
  ultima: "Última",
  obs: "Observaciones",
} as const;

/** Lo que aclara el encabezado cuando la palabra sola no alcanza. */
const HEAD_TITLE: Partial<Record<keyof typeof HEAD, string>> = {
  precision: "Talado ÷ censo: qué tan cerca estuvo la estimación",
  rend: "Trozado ÷ talado. «—» = todavía sin trozar",
  merma: "Talado − trozado, sólo de los árboles ya trozados",
  movilizado: "Salió del patio: trozas despachadas o al aserrío",
};

export default function LothTraceTabla({
  filas,
  seleccion,
  onSeleccionar,
  onAbrir,
  orden,
  onOrden,
}: {
  filas: TraceFila[];
  seleccion?: Set<string>;
  onSeleccionar?: (tree: string) => void;
  /** Abre la ventana de detalle del árbol. */
  onAbrir?: (tree: string) => void;
  orden: TraceOrden;
  onOrden: (o: TraceOrden) => void;
}) {
  if (filas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--rule-base)] p-10 text-center text-sm text-[var(--text-tertiary)]">
        <TreePine className="mx-auto mb-2 h-6 w-6 opacity-40" />
        Ningún árbol coincide con el filtro.
      </div>
    );
  }

  return (
    <DataTable className="w-full border-collapse" wrapperClassName="rounded-2xl bg-[var(--surface-raised)]">
      <thead>
        <tr>
          {onSeleccionar && (
            <th className="w-10">
              <span className="sr-only">Seleccionar</span>
            </th>
          )}
          {COLUMNAS.map((c) => (
            <th key={c.key} className={c.num ? "text-right" : "text-left"} title={HEAD_TITLE[c.key]}>
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
                  {orden === c.orden && <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />}
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
          <Fila key={f.tree} f={f} seleccionada={seleccion?.has(f.tree)} onSeleccionar={onSeleccionar} onAbrir={onAbrir} />
        ))}
      </tbody>
    </DataTable>
  );
}

function Fila({
  f,
  seleccionada,
  onSeleccionar,
  onAbrir,
}: {
  f: TraceFila;
  seleccionada?: boolean;
  onSeleccionar?: (tree: string) => void;
  onAbrir?: (tree: string) => void;
}) {
  const tono = tonoDe(f.mermaVeredicto);
  const fondo =
    f.nivel === "error" ? "bg-[var(--data-error-500)]/10" : f.nivel === "warn" ? "bg-[var(--data-warning-500)]/10" : "";
  const desvio = f.precisionCensoPct != null ? Math.abs(f.precisionCensoPct - 100) : null;

  return (
    <tr className={`border-t border-[var(--rule-soft)] ${fondo} ${seleccionada ? "outline outline-1 -outline-offset-1 outline-[var(--data-info-500)]" : ""}`}>
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
      <td className={`${CELL} text-[var(--text-secondary)]`}>
        {f.especie ?? "—"}
        {f.cites && <span className="ml-1 text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">CITES</span>}
      </td>
      <td className={NUM}>{f.censoM3 != null ? fmtM3(f.censoM3) : "—"}</td>
      <td className={NUM}>{f.taladoM3 != null ? fmtM3(f.taladoM3) : "—"}</td>
      <td className={`${NUM} font-bold ${desvio != null && desvio > 25 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]"}`}>
        {f.precisionCensoPct != null ? fmtPct(f.precisionCensoPct) : "—"}
      </td>
      <td className={NUM}>{f.trozadoM3 > 0 ? fmtM3(f.trozadoM3) : "—"}</td>
      <td className={`${NUM} font-bold ${tono.texto}`}>{f.rendimientoPct != null ? fmtPct(f.rendimientoPct) : "—"}</td>
      <td className={`${NUM} ${f.mermaVeredicto && f.mermaVeredicto !== "ok" ? `font-bold ${tono.texto}` : "text-[var(--text-secondary)]"}`}>
        {f.mermaM3 != null && f.mermaPct != null ? `${fmtM3(f.mermaM3)} · ${fmtPct(f.mermaPct, 0)}` : "—"}
      </td>
      <td className={NUM}>
        {f.movilizadoM3 > 0 ? fmtM3(f.movilizadoM3) : "—"}
        {f.patioM3 > 0 && (
          <span className="block text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            {fmtM3(f.patioM3)} en patio
          </span>
        )}
      </td>
      <td className={NUM}>{f.op ? `${f.etapas}/6` : "—"}</td>
      <td className={`${NUM} text-[var(--text-secondary)]`}>
        {fmtFecha(f.op?.lastDate)}
        {f.diasParado != null && (
          <span className="block text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            parado {fmtDias(f.diasParado)}
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
