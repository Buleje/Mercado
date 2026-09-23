"use client";

/**
 * LothTraceCard — un árbol, leído de un vistazo.
 *
 * La tarjeta contesta tres preguntas en tres zonas, en vez de estirar una barra
 * de progreso a lo ancho de la pantalla:
 *   1. **Recorrido** — en qué etapa está y cuándo pasó cada una.
 *   2. **Rendimiento** — cuánto rindió y qué tan lejos quedó del censo.
 *   3. **Merma y tiempo** — cuánta madera se perdió, si eso supera el umbral de
 *      su especie, y cuánto tardó (o lleva parada).
 *
 * El detalle (alertas, embudo del árbol, las seis secciones con sus líneas y
 * las acciones) ya no se despliega DENTRO de la lista —empujaba al resto de los
 * árboles una pantalla más abajo—: se abre en su ventana
 * (`LothTraceDetalleModal`), que además pasa al árbol siguiente sin cerrarse.
 *
 * Antes del trozado no hay rendimiento ni merma: la tarjeta dice «sin trozar
 * todavía» en vez de «0,0 %» y «100 %» pintados de verde.
 */

import { AlertTriangle, CheckCircle2, ChevronRight, Clock, MapPin, TreePine, Warehouse } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import type { TraceFila } from "@/lib/forestal/loth-trace-tabla";
import { etapasDe, fmtDias, fmtFecha, fmtPct, fmtRecorrido, tonoDe } from "./loth-trace-ui";
import { formatNumber } from "@/lib/format";

export const CHAIN_META: Record<"completa" | "parcial" | "iniciada", { label: string; cls: string }> = {
  completa: { label: "Cadena completa", cls: "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" },
  parcial: { label: "En proceso", cls: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" },
  iniciada: { label: "Solo tala", cls: "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]" },
};

export const PILL = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold";
const ERROR_PILL = `${PILL} border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]`;
const AVISO_PILL = `${PILL} border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`;
const m2 = (v: number) => formatNumber(v, 2);
const fmtM = (v: number, dp: number) => v.toLocaleString("es-PE", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export default function LothTraceCard({
  fila,
  matchHint,
  seleccionada,
  onSeleccionar,
  onAbrir,
}: {
  fila: TraceFila;
  matchHint?: string | null;
  seleccionada?: boolean;
  onSeleccionar?: (tree: string) => void;
  /** Abre el detalle del árbol. Sin operación (en pie) no hay detalle que abrir. */
  onAbrir?: (tree: string) => void;
}) {
  const op = fila.op;
  const tono = tonoDe(fila.mermaVeredicto);
  const alertas = op?.alerts.length ?? 0;
  const chain = CHAIN_META[op?.chain ?? "iniciada"];
  const abrir = op && onAbrir ? () => onAbrir(fila.tree) : undefined;

  return (
    <article
      className={`rounded-2xl border bg-[var(--surface-raised)] transition-colors ${
        seleccionada ? "border-[var(--data-info-500)] shadow-[0_0_0_1px_var(--data-info-500)]" : "border-[var(--rule-base)]"
      }`}
      data-arbol={fila.tree}
    >
      <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
        {onSeleccionar && (
          <input
            type="checkbox"
            checked={!!seleccionada}
            onChange={() => onSeleccionar(fila.tree)}
            aria-label={`Seleccionar el árbol ${fila.tree}`}
            className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[var(--data-info-600)]"
          />
        )}
        <span className="mt-0.5 hidden h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] sm:grid dark:text-[var(--data-success-500)]">
          <TreePine className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          {/* fila 1 — identidad y estado */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {abrir ? (
              <button
                type="button"
                onClick={abrir}
                className="rounded text-left text-sm font-bold text-[var(--text-primary)] underline decoration-dotted decoration-1 underline-offset-4 hover:text-[var(--data-info-700)] hover:decoration-solid dark:hover:text-[var(--data-info-500)]"
              >
                {fila.tree} · {fila.especie ?? "—"}
              </button>
            ) : (
              <span className="text-sm font-bold text-[var(--text-primary)]">
                {fila.tree} · {fila.especie ?? "—"}
              </span>
            )}
            {op?.scientific && <span className="hidden text-xs italic text-[var(--text-tertiary)] sm:inline">{op.scientific}</span>}
            {fila.cites && <span className={ERROR_PILL}>CITES</span>}
            {fila.enPie ? (
              <span className={`${PILL} border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]`}>Censado, en pie</span>
            ) : (
              <span className={`${PILL} ${chain.cls}`}>
                {op?.chain === "completa" && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                {chain.label}
              </span>
            )}
            {alertas > 0 && (
              <span className={ERROR_PILL} title={op?.alerts.map((a) => a.message).join("\n")}>
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {alertas} {alertas === 1 ? "alerta" : "alertas"}
              </span>
            )}
            {(op?.trozasEnPatio ?? 0) > 0 && (
              <span className={AVISO_PILL}>
                <Warehouse className="h-3.5 w-3.5" aria-hidden="true" /> {op?.trozasEnPatio} en patio
              </span>
            )}
            {fila.tardias > 0 && (
              <span className={AVISO_PILL}>
                <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {fila.tardias} fuera de plazo
              </span>
            )}
          </div>

          {/* fila 2 — el árbol contra su censo, con el rango de fechas */}
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {fila.censoM3 != null ? (
              <>
                Censo <b className="tabular-nums">{m2(fila.censoM3)}</b> m³ →{" "}
              </>
            ) : (
              op && <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">Sin censo · </span>
            )}
            {op && (
              <>
                Talado <b className="tabular-nums">{fila.taladoM3 != null ? `${m2(fila.taladoM3)} m³` : "— (sin volumen)"}</b>
              </>
            )}
            {op?.firstDate && (
              <>
                {" · "}
                {fmtFecha(op.firstDate)}
                {op.lastDate && op.lastDate.slice(0, 10) !== op.firstDate.slice(0, 10) ? ` → ${fmtFecha(op.lastDate)}` : ""}
              </>
            )}
            {!op && (
              <>
                {" "}Árbol del censo que todavía no se taló.
                {fila.dapCm != null ? ` DAP ${fmtM(fila.dapCm, 1)} cm` : ""}
                {fila.dmcCm != null ? ` · DMC ${fmtM(fila.dmcCm, 0)} cm` : ""}
              </>
            )}
          </p>

          {/* fila 3 — las tres zonas */}
          {op && (
            <div className="mt-2.5 grid gap-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Zona titulo="Recorrido">
                <RielEtapas fila={fila} />
              </Zona>

              <Zona titulo="Rendimiento">
                {fila.rendimientoPct != null ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-xl font-black tabular-nums ${tono.texto}`}>{fmtPct(fila.rendimientoPct)}</span>
                      <span className="text-xs text-[var(--text-secondary)]">trozado / talado</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden="true">
                      <div className={`h-full rounded-full ${tono.barra}`} style={{ width: `${Math.min(100, fila.rendimientoPct)}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-[var(--text-secondary)]">— sin trozar todavía</p>
                )}
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {fila.precisionCensoPct != null ? (
                    <>
                      censo{" "}
                      <b className={`tabular-nums ${Math.abs(fila.precisionCensoPct - 100) > 25 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : ""}`}>
                        {fmtPct(fila.precisionCensoPct)}
                      </b>{" "}
                      de lo estimado
                    </>
                  ) : (
                    "sin volumen de censo para comparar"
                  )}
                </p>
              </Zona>

              <Zona titulo="Merma y tiempo">
                {fila.mermaM3 != null ? (
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className={`text-lg font-black tabular-nums ${tono.texto}`}>{m2(fila.mermaM3)} m³</span>
                    {fila.mermaPct != null && <span className={`text-sm font-bold ${tono.texto}`}>{fmtPct(fila.mermaPct)}</span>}
                    {fila.mermaVeredicto && fila.mermaVeredicto !== "ok" && (
                      <span className={`${PILL} ${tono.chip}`}>{fila.mermaVeredicto === "grave" ? "grave" : "sobre el umbral"}</span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-[var(--text-secondary)]">— sin trozar todavía</p>
                )}
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {fila.diasTalaSalida != null
                    ? fmtRecorrido(fila.diasTalaSalida)
                    : fila.diasParado != null
                      ? `parado hace ${fmtDias(fila.diasParado)}`
                      : "todavía sin salida"}
                </p>
              </Zona>
            </div>
          )}

          {matchHint && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-[var(--data-info-500)]/15 px-2 py-0.5 text-xs font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {matchHint}
            </p>
          )}
        </div>

        {abrir && (
          <button
            type="button"
            onClick={abrir}
            aria-label={`Ver el detalle del árbol ${fila.tree}`}
            title="Ver el detalle: alertas, dónde se fue la madera y las seis secciones"
            className="mt-0.5 inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-[var(--rule-base)] px-2.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]"
          >
            <span className="max-sm:sr-only">Detalle</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}

function Zona({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-[var(--surface-sunken)] px-2.5 py-2">
      <Kicker as="p" className="mb-1 text-[var(--text-secondary)]">
        {titulo}
      </Kicker>
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
  return (
    <div className="flex flex-wrap gap-1">
      {etapasDe(op).map((e) => {
        const done = e.rows.length > 0;
        return (
          <span
            key={e.n}
            title={`${e.label}: ${done ? `${e.rows.length} registro(s)${e.fecha ? ` · ${fmtFecha(e.fecha)}` : ""}` : "sin registros"}`}
            className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-xs font-bold ${
              done
                ? "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                : "border-dashed border-[var(--rule-base)] bg-transparent text-[var(--text-tertiary)]"
            }`}
          >
            {e.label}
            {done && e.fecha && <span className="tabular-nums font-semibold opacity-80">{fmtFecha(e.fecha).split(" ")[1]}</span>}
          </span>
        );
      })}
    </div>
  );
}
