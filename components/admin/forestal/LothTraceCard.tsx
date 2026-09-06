"use client";

/**
 * LothTraceCard — un árbol, leído de un vistazo.
 *
 * La cabecera contesta tres preguntas distintas en tres zonas, en vez de
 * estirar una barra de progreso a lo ancho de la pantalla:
 *   1. **Recorrido** — en qué etapa está y cuándo pasó cada una.
 *   2. **Rendimiento** — cuánto rindió y qué tan lejos quedó del censo.
 *   3. **Merma y tiempo** — cuánta madera se perdió, si eso supera el umbral de
 *      su especie, y cuánto tardó (o lleva parada).
 *
 * El detalle vive en `LothTraceDetalle`; el color del veredicto, en
 * `loth-trace-ui`, para que la tarjeta y la tabla no se contradigan.
 */

import { useEffect, useState } from "react";
import { TreePine, ChevronDown, MapPin, AlertTriangle, CheckCircle2, Warehouse, Clock } from "@buleje/design-system/icons";
import type { TraceFila } from "@/lib/forestal/loth-trace-tabla";
import type { PasaporteCaratula } from "@/lib/forestal/loth-pasaporte-print";
import LothTraceDetalle from "./LothTraceDetalle";
import { etapasDe, fmtFecha, fmtDias, fmtRecorrido, tonoDe, type TraceNav } from "./loth-trace-ui";

const CHAIN_META: Record<"completa" | "parcial" | "iniciada", { label: string; cls: string }> = {
  completa: { label: "Cadena completa", cls: "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" },
  parcial: { label: "En proceso", cls: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" },
  iniciada: { label: "Solo tala", cls: "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)]" },
};

const PILL = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold";

export default function LothTraceCard({
  fila,
  caratula,
  matchHint,
  nav,
  seleccionada,
  onSeleccionar,
  expandirSignal,
  expandirTodo,
}: {
  fila: TraceFila;
  caratula?: PasaporteCaratula | null;
  matchHint?: string | null;
  nav?: TraceNav;
  seleccionada?: boolean;
  onSeleccionar?: (tree: string) => void;
  /** Cambia cuando la vista pide expandir/colapsar todo. */
  expandirSignal?: number;
  expandirTodo?: boolean;
}) {
  const op = fila.op;
  const [open, setOpen] = useState((op?.alerts.length ?? 0) > 0 || !!matchHint);

  // La búsqueda inversa acierta por troza/GTF DESPUÉS del montaje: el
  // initializer de useState ya no alcanza para abrir la tarjeta.
  useEffect(() => {
    if (matchHint) setOpen(true);
  }, [matchHint]);

  // «Expandir todo» / «Colapsar todo» sin pisar el toggle manual: sólo actúa
  // cuando la señal cambia, no en cada render.
  useEffect(() => {
    if (expandirSignal === undefined) return;
    setOpen(!!expandirTodo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandirSignal]);

  const chain = CHAIN_META[op?.chain ?? "iniciada"];
  const tono = tonoDe(fila.mermaVeredicto);
  const alertas = op?.alerts.length ?? 0;

  return (
    <article
      className={`overflow-hidden rounded-2xl border-2 bg-[var(--surface-raised)] transition-colors ${
        seleccionada ? "border-[var(--data-info-500)]" : "border-[var(--rule-base)]"
      }`}
    >
      <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
        {onSeleccionar && (
          <input
            type="checkbox"
            checked={!!seleccionada}
            onChange={() => onSeleccionar(fila.tree)}
            aria-label={`Seleccionar el árbol ${fila.tree}`}
            className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[var(--data-info-600)]"
          />
        )}
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <TreePine className="h-5 w-5" strokeWidth={1.75} />
        </span>

        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-w-0 flex-1 text-left">
          {/* fila 1 — identidad */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{fila.tree}</span>
            <span className="text-sm font-bold text-[var(--text-primary)]">{fila.especie ?? "—"}</span>
            {op?.scientific && <span className="hidden text-xs italic text-[var(--text-tertiary)] sm:inline">{op.scientific}</span>}
            {fila.cites && (
              <span className={`${PILL} border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]`}>CITES</span>
            )}
            {fila.enPie ? (
              <span className={`${PILL} border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)]`}>Censado, en pie</span>
            ) : (
              <span className={`${PILL} ${chain.cls}`}>
                {op?.chain === "completa" && <CheckCircle2 className="h-3 w-3" />}
                {chain.label}
              </span>
            )}
            {alertas > 0 && (
              <span className={`${PILL} border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]`}>
                <AlertTriangle className="h-3 w-3" /> {alertas}
              </span>
            )}
            {(op?.trozasEnPatio ?? 0) > 0 && (
              <span className={`${PILL} border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}>
                <Warehouse className="h-3 w-3" /> {op!.trozasEnPatio} en patio
              </span>
            )}
            {fila.tardias > 0 && (
              <span className={`${PILL} border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}>
                <Clock className="h-3 w-3" /> {fila.tardias} fuera de plazo
              </span>
            )}
          </div>

          {/* fila 2 — el árbol contra su censo, con el rango de fechas */}
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            {fila.censoM3 != null ? (
              <>
                Censo <b className="font-mono tabular-nums text-[var(--text-secondary)]">{fila.censoM3.toFixed(2)}</b> →{" "}
              </>
            ) : (
              <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">Sin censo · </span>
            )}
            {fila.taladoM3 != null && (
              <>
                Talado <b className="font-mono tabular-nums text-[var(--text-secondary)]">{fila.taladoM3.toFixed(2)}</b> m³
              </>
            )}
            {op?.firstDate && (
              <>
                {" · "}
                {fmtFecha(op.firstDate)}
                {op.lastDate && op.lastDate !== op.firstDate ? ` → ${fmtFecha(op.lastDate)}` : ""}
              </>
            )}
          </p>

          {/* fila 3 — las tres zonas */}
          {op ? (
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Zona titulo="Recorrido">
                <RielEtapas fila={fila} />
              </Zona>

              <Zona titulo="Rendimiento">
                <div className="flex items-baseline gap-2">
                  <span className={`font-mono text-2xl font-black tabular-nums ${tono.texto}`}>
                    {fila.rendimientoPct != null ? `${fila.rendimientoPct.toFixed(1)}%` : "—"}
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)]">trozado / talado</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                  <div className={`h-full rounded-full transition-all ${tono.barra}`} style={{ width: `${Math.min(100, fila.rendimientoPct ?? 0)}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                  {fila.precisionCensoPct != null ? (
                    <>
                      censo{" "}
                      <b className={`font-mono tabular-nums ${Math.abs(fila.precisionCensoPct - 100) > 25 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]"}`}>
                        {fila.precisionCensoPct.toFixed(1)}%
                      </b>{" "}
                      de lo estimado
                    </>
                  ) : (
                    "sin volumen de censo para comparar"
                  )}
                </p>
              </Zona>

              <Zona titulo="Merma y tiempo">
                <div className="flex items-baseline gap-2">
                  <span className={`font-mono text-xl font-black tabular-nums ${tono.texto}`}>{fila.mermaM3.toFixed(2)} m³</span>
                  {fila.mermaPct != null && <span className={`text-sm font-bold ${tono.texto}`}>{fila.mermaPct.toFixed(1)}%</span>}
                </div>
                {fila.mermaVeredicto && fila.mermaVeredicto !== "ok" && (
                  <span className={`${PILL} mt-1 ${tono.chip}`}>
                    <AlertTriangle className="h-3 w-3" />
                    {fila.mermaVeredicto === "grave" ? "merma grave" : "merma sobre el umbral"}
                  </span>
                )}
                <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                  {fila.diasTalaSalida != null
                    ? fmtRecorrido(fila.diasTalaSalida)
                    : fila.diasParado != null
                      ? `parado hace ${fmtDias(fila.diasParado)}`
                      : "todavía sin salida"}
                </p>
              </Zona>
            </div>
          ) : (
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
              Árbol del censo que todavía no se taló. {fila.dapCm != null ? `DAP ${fila.dapCm.toFixed(1)} cm` : ""}
              {fila.dmcCm != null ? ` · DMC ${fila.dmcCm.toFixed(0)} cm` : ""}
            </p>
          )}

          {matchHint && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-[var(--data-info-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
              <MapPin className="h-3 w-3" /> {matchHint}
            </p>
          )}
        </button>

        {op && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? `Colapsar el árbol ${fila.tree}` : `Expandir el árbol ${fila.tree}`}
            className="mt-1 shrink-0 rounded-lg p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-canvas)]"
          >
            <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {open && op && <LothTraceDetalle op={op} caratula={caratula} nav={nav} />}
    </article>
  );
}

function Zona({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)]/40 p-2.5">
      <p className="mb-1.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-widest text-[var(--text-tertiary)]">{titulo}</p>
      {children}
    </div>
  );
}

/**
 * El riel de etapas dice CUÁL falta, no sólo cuántas. Los seis puntitos de
 * antes obligaban a pasar el mouse por encima para enterarse.
 */
function RielEtapas({ fila }: { fila: TraceFila }) {
  const op = fila.op;
  if (!op) return null;
  const etapas = etapasDe(op);
  return (
    <div className="flex flex-wrap gap-1">
      {etapas.map((e) => {
        const done = e.rows.length > 0;
        return (
          <span
            key={e.n}
            title={`${e.label}: ${done ? `${e.rows.length} registro(s)${e.fecha ? ` · ${fmtFecha(e.fecha)}` : ""}` : "sin registros"}`}
            className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold ${
              done
                ? "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                : "border-dashed border-[var(--rule-base)] bg-transparent text-[var(--text-tertiary)]"
            }`}
          >
            {e.label}
            {done && e.fecha && <span className="font-mono tabular-nums opacity-70">{fmtFecha(e.fecha)}</span>}
          </span>
        );
      })}
    </div>
  );
}
