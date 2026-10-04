"use client";

/**
 * LothTracePendientes — «Qué falta hacer»: lo del permiso que pide una acción.
 *
 * Existe porque lo urgente quedaba enterrado: en Blas (30-09) el 114 (Lupuna,
 * 15,6 m³) y el 100 (Mashonaste) estaban talados y sin trozar, y para verlo
 * había que recorrer 67 tarjetas. Acá cada ítem trae su número real y la
 * acción que lo resuelve:
 *
 *   · talados sin trozar       → «Registrar trozado» (abre la sección 2 del
 *                                 libro con ese árbol ya elegido, `nav`)
 *   · talas fuera del censo    → «Agregar al censo» (alta del árbol con código y
 *                                 especie escritos, `nav.onAgregarAlCenso`)
 *   · trozas en patio > 30 días → el detalle del árbol (a dónde fue cada troza)
 *   · mermas graves             → el detalle del árbol
 *
 * Si no hay nada, el bloque no existe (un «0 pendientes» no pide nada).
 */

import { useId, type ReactNode } from "react";
import { BlockTitle, CardTitle } from "@buleje/design-system";
import { ChevronRight, Plus, Scissors, TrendingDown, TreePine, Warehouse } from "@buleje/design-system/icons";
import { DIAS_EN_PATIO_AVISO, type Pendientes } from "@/lib/forestal/loth-trace-grupos";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { fmtDias, fmtFecha, fmtPct } from "./loth-trace-ui";

const ACCION =
  "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 max-sm:w-full";
const PRIMARIA = `${ACCION} bg-[var(--brand-ink)] text-white hover:opacity-90`;
const SECUNDARIA = `${ACCION} border border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]`;

export default function LothTracePendientes({
  p,
  onRegistrarTrozado,
  onAgregarAlCenso,
  onAbrir,
}: {
  p: Pendientes;
  /** Sin él (vista suelta, sin libro) el talado sin trozar ofrece su detalle. */
  onRegistrarTrozado?: (tree: string) => void;
  /** Sin él, la tala fuera del censo ofrece su detalle (no hay dónde dar el alta). */
  onAgregarAlCenso?: (arbol: { treeCode: string; speciesCommon: string }) => void;
  onAbrir: (tree: string) => void;
}) {
  const id = useId();
  if (p.total === 0) return null;
  const m3SinTrozar = p.sinTrozar.reduce((a, x) => a + (x.taladoM3 ?? 0), 0);
  const m3FueraCenso = p.fueraCenso.reduce((a, x) => a + (x.taladoM3 ?? 0), 0);

  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="rounded-2xl border border-[var(--data-warning-500)]/60 bg-[var(--surface-raised)] px-4 py-3"
      data-pendientes
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <CardTitle id={`${id}-titulo`}>Qué falta hacer</CardTitle>
        <span className="text-sm tabular-nums text-[var(--text-tertiary)]">{formatNumber(p.total)}</span>
      </div>

      <div className="mt-2 space-y-3">
        {p.sinTrozar.length > 0 && (
          <Bloque
            icono={<Scissors className="h-4 w-4" aria-hidden="true" />}
            titulo={`Talados sin trozar · ${formatNumber(p.sinTrozar.length)}`}
            extra={m3SinTrozar > 0 ? `${fmtM3(m3SinTrozar)} m³` : null}
            dato="sin-trozar"
          >
            {p.sinTrozar.map((x) => (
              <Item
                key={x.tree}
                tree={x.tree}
                especie={x.especie}
                dato={x.taladoM3 != null ? `${fmtM3(x.taladoM3)} m³` : "sin volumen"}
                detalle={
                  x.fechaTala
                    ? `talado ${fmtFecha(x.fechaTala)}${x.dias != null && x.dias > 0 ? ` · hace ${fmtDias(x.dias)}` : x.dias === 0 ? " · hoy" : ""}`
                    : "sin fecha de tala"
                }
              >
                {onRegistrarTrozado ? (
                  <button
                    type="button"
                    onClick={() => onRegistrarTrozado(x.tree)}
                    aria-label={`Registrar el trozado del árbol ${x.tree}`}
                    className={PRIMARIA}
                  >
                    <Scissors className="h-4 w-4" aria-hidden="true" /> Registrar trozado
                  </button>
                ) : (
                  <VerDetalle tree={x.tree} onAbrir={onAbrir} />
                )}
              </Item>
            ))}
          </Bloque>
        )}

        {p.fueraCenso.length > 0 && (
          <Bloque
            icono={<Plus className="h-4 w-4" aria-hidden="true" />}
            titulo={`${formatNumber(p.fueraCenso.length)} ${p.fueraCenso.length === 1 ? "tala fuera del censo" : "talas fuera del censo"}`}
            extra={m3FueraCenso > 0 ? `${fmtM3(m3FueraCenso)} m³` : null}
            dato="fuera-censo"
          >
            {p.fueraCenso.map((x) => (
              <Item
                key={x.tree}
                tree={x.tree}
                especie={x.especie}
                dato={x.taladoM3 != null ? `${fmtM3(x.taladoM3)} m³` : "sin volumen"}
                detalle={x.fechaTala ? `talado ${fmtFecha(x.fechaTala)} · el censo del plan no lo declara` : "el censo del plan no lo declara"}
              >
                {onAgregarAlCenso ? (
                  <button
                    type="button"
                    onClick={() => onAgregarAlCenso({ treeCode: x.tree, speciesCommon: x.especie ?? "" })}
                    aria-label={`Agregar el árbol ${x.tree} al censo`}
                    className={PRIMARIA}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" /> Agregar al censo
                  </button>
                ) : (
                  <VerDetalle tree={x.tree} onAbrir={onAbrir} />
                )}
              </Item>
            ))}
          </Bloque>
        )}

        {p.patio.length > 0 && (
          <Bloque
            icono={<Warehouse className="h-4 w-4" aria-hidden="true" />}
            titulo={`Trozas en patio hace más de ${DIAS_EN_PATIO_AVISO} días · ${formatNumber(p.patio.reduce((a, x) => a + x.trozas, 0))}`}
            dato="patio"
          >
            {p.patio.map((x) => (
              <Item
                key={x.tree}
                tree={x.tree}
                especie={x.especie}
                dato={`${formatNumber(x.trozas)} ${x.trozas === 1 ? "troza" : "trozas"} · ${fmtM3(x.m3)} m³`}
                detalle={`desde ${fmtFecha(x.desde)} · ${fmtDias(x.dias)}`}
              >
                <VerDetalle tree={x.tree} onAbrir={onAbrir} />
              </Item>
            ))}
          </Bloque>
        )}

        {p.mermaGrave.length > 0 && (
          <Bloque
            icono={<TrendingDown className="h-4 w-4" aria-hidden="true" />}
            titulo={`Mermas graves · ${formatNumber(p.mermaGrave.length)}`}
            dato="merma"
          >
            {p.mermaGrave.map((x) => (
              <Item key={x.tree} tree={x.tree} especie={x.especie} dato={`merma ${fmtPct(x.mermaPct)}`} detalle={`${fmtM3(x.mermaM3)} m³ perdidos`}>
                <VerDetalle tree={x.tree} onAbrir={onAbrir} />
              </Item>
            ))}
          </Bloque>
        )}
      </div>
    </section>
  );
}

function Bloque({ icono, titulo, extra, dato, children }: { icono: ReactNode; titulo: string; extra?: string | null; dato: string; children: ReactNode }) {
  return (
    <div data-pendiente={dato}>
      <div className="flex flex-wrap items-center gap-x-2 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
        {icono}
        <BlockTitle as="h4" className="text-[var(--text-primary)]">
          {titulo}
        </BlockTitle>
        {extra && <span className="text-sm tabular-nums text-[var(--text-secondary)]">{extra}</span>}
      </div>
      <ul className="mt-1.5 divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">{children}</ul>
    </div>
  );
}

function Item({ tree, especie, dato, detalle, children }: { tree: string; especie: string | null; dato: string; detalle: string; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2" data-arbol={tree}>
      <TreePine className="h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[var(--text-primary)]">
          {tree} · {especie ?? "—"} <span className="font-semibold tabular-nums text-[var(--text-secondary)]">· {dato}</span>
        </p>
        <p className="text-sm text-[var(--text-secondary)]">{detalle}</p>
      </div>
      {children}
    </li>
  );
}

function VerDetalle({ tree, onAbrir }: { tree: string; onAbrir: (tree: string) => void }) {
  return (
    <button type="button" onClick={() => onAbrir(tree)} aria-label={`Ver el detalle del árbol ${tree}`} className={SECUNDARIA}>
      Ver detalle <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
