"use client";

/**
 * Modo «Uno por uno» de la cubicación comercial (ADR-483 D11): no hay un
 * segundo cubicador. Se elige una cubicación GUARDADA del Cubicador de madera
 * (las ligadas a este despacho primero) y el servidor copia sus piezas; o se
 * abre el Cubicador en otra pestaña, se guarda allá y se vuelve a elegir acá.
 */
import { ExternalLink, Loader2, RefreshCw } from "@buleje/design-system/icons";
import { fmtVolumen } from "@/lib/forestal/cubicacion-cuenta";
import type { PrefillOrigenDespacho } from "@/lib/forestal/cubicacion-comercial-tipos";
import { fechaConDia } from "@/lib/forestal/loth-tablero-reporte";
import { BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";

export default function ElegirGuardada({
  guardadas, refId, onRefId, despachoId, recargando, onRecargar,
}: {
  guardadas: PrefillOrigenDespacho["guardadas"];
  refId: string;
  onRefId: (id: string) => void;
  despachoId: string;
  recargando: boolean;
  onRecargar: () => void;
}) {
  const url = `/admin?tab=forestal-herramientas&despacho=${encodeURIComponent(despachoId)}`;
  return (
    <div className="space-y-2" data-vista="cubicacion-uno-por-uno">
      {guardadas.length === 0 ? (
        <p className="rounded-2xl bg-[var(--surface-sunken)] px-3 py-3 text-sm text-[var(--text-secondary)]">
          No tienes cubicaciones guardadas en el Cubicador de madera. Ábrelo, mide pieza por pieza, guárdala y vuelve a elegirla acá.
        </p>
      ) : (
        <ul role="radiogroup" aria-label="Cubicación guardada del Cubicador de madera" className="max-h-64 space-y-1.5 overflow-auto">
          {guardadas.map((g) => {
            const activa = g.id === refId;
            return (
              <li key={g.id}>
                <button type="button" role="radio" aria-checked={activa} onClick={() => onRefId(g.id)}
                  className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                    activa
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]"
                      : "border-[var(--rule-soft)] hover:border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]"
                  }`}>
                  <span className="min-w-0 flex-1 font-semibold text-[var(--text-primary)]">{g.nombre || "Sin nombre"}</span>
                  {g.ligada && (
                    <span className="rounded-full bg-[var(--accent-muted)] px-2 py-0.5 text-xs font-bold text-[var(--accent-dark)] dark:text-[var(--accent)]">de este despacho</span>
                  )}
                  <span className="text-[var(--text-tertiary)]">{fechaConDia(g.fecha.slice(0, 10))} · {g.piezas} {g.piezas === 1 ? "pieza" : "piezas"}</span>
                  <span className="w-28 text-right font-bold tabular-nums text-[var(--text-primary)]">{fmtVolumen(g.pt, "tablar")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <a href={url} target="_blank" rel="noopener" className={BOTON_SECUNDARIO} data-accion="abrir-cubicador-madera">
          <ExternalLink className="h-4 w-4" /> Abrir el Cubicador de madera
        </a>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onRecargar} disabled={recargando}>
          {recargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Ya la guardé: actualizar
        </button>
      </div>
    </div>
  );
}
