"use client";

/**
 * LothTraceDetalleModal — la historia de UN árbol, en su ventana.
 *
 * El detalle se desplegaba dentro de la lista y empujaba a los demás árboles
 * una pantalla más abajo; «Expandir todo» abría los 25 de la página a la vez.
 * Acá se abre uno, se lee, y «Siguiente» pasa al árbol de abajo sin volver a la
 * lista — que es lo que «Expandir todo» servía para hacer. La ventana se mueve
 * y se fija (ADR-420): corrida a un costado, la lista queda a la vista.
 *
 * Los saltos que salen de la ventana (cadena de custodia, guía, mapa) la
 * cierran primero: abrir otro diálogo encima de éste deja uno detrás de otro
 * con los clics apagados (memoria `modales-anidados-z-index-radix`).
 */

import AdminModal from "@/components/admin/shared/AdminModal";
import { ChevronLeft, ChevronRight, Link2, Map as MapIcon, Printer, TreePine } from "@buleje/design-system/icons";
import type { TraceFila } from "@/lib/forestal/loth-trace-tabla";
import { printTrozaPasaporte, type PasaporteCaratula } from "@/lib/forestal/loth-pasaporte-print";
import LothTraceDetalle from "./LothTraceDetalle";
import { CHAIN_META } from "./LothTraceCard";
import { fmtPct, fmtRecorrido, type TraceNav } from "./loth-trace-ui";

const BOTON =
  "inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-40";

export default function LothTraceDetalleModal({
  fila,
  caratula,
  nav,
  onClose,
  posicion,
  total,
  anterior,
  siguiente,
}: {
  fila: TraceFila | null;
  caratula?: PasaporteCaratula | null;
  nav?: TraceNav;
  onClose: () => void;
  /** Lugar del árbol en la lista que se ve (1-based). null = el filtro lo sacó. */
  posicion: number | null;
  total: number;
  anterior?: () => void;
  siguiente?: () => void;
}) {
  const op = fila?.op ?? null;
  const saliendo = <A extends unknown[]>(fn?: (...a: A) => void) =>
    fn
      ? (...a: A) => {
          onClose();
          fn(...a);
        }
      : undefined;
  const navCerrando: TraceNav | undefined = nav && {
    onVerCadena: saliendo(nav.onVerCadena),
    onVerGtf: saliendo(nav.onVerGtf),
    onVerMapa: saliendo(nav.onVerMapa),
  };

  const descripcion = op
    ? [
        CHAIN_META[op.chain].label,
        `${op.stagesReached}/6 etapas`,
        fila?.mermaPct != null ? `merma ${fmtPct(fila.mermaPct)}` : "sin trozar todavía",
        fmtRecorrido(op.diasTalaSalida),
      ].join(" · ")
    : undefined;

  return (
    <AdminModal
      open={!!op}
      onClose={onClose}
      variant="info"
      icon={TreePine}
      title={op ? `Árbol ${op.tree} · ${op.species ?? "sin especie"}` : "Árbol"}
      description={descripcion}
      claveVentana="loth-arbol-detalle"
      footer={
        op && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                printTrozaPasaporte(op, caratula).catch((err) => console.error("[pasaporte] no se pudo abrir", err));
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-semibold text-white hover:opacity-90"
            >
              <Printer className="h-4 w-4" aria-hidden="true" /> Pasaporte
            </button>
            {navCerrando?.onVerCadena && (
              <button type="button" onClick={() => navCerrando.onVerCadena?.(op.tree)} className={BOTON}>
                <Link2 className="h-4 w-4" aria-hidden="true" /> Cadena de custodia
              </button>
            )}
            {op.gps && navCerrando?.onVerMapa && (
              <button type="button" onClick={() => navCerrando.onVerMapa?.(op.tree)} className={BOTON}>
                <MapIcon className="h-4 w-4" aria-hidden="true" /> Ver en el mapa
              </button>
            )}
            <div className="ml-auto flex items-center gap-1.5" role="group" aria-label="Pasar a otro árbol de la lista">
              <button type="button" onClick={anterior} disabled={!anterior} className={BOTON} aria-label="Árbol anterior">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span className="max-sm:sr-only">Anterior</span>
              </button>
              <span className="min-w-[4.5rem] text-center text-sm tabular-nums text-[var(--text-secondary)]" aria-live="polite">
                {posicion != null ? `${posicion} de ${total}` : "fuera del filtro"}
              </span>
              <button type="button" onClick={siguiente} disabled={!siguiente} className={BOTON} aria-label="Árbol siguiente">
                <span className="max-sm:sr-only">Siguiente</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )
      }
    >
      {op && <LothTraceDetalle op={op} nav={navCerrando} />}
    </AdminModal>
  );
}
