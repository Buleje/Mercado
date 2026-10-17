"use client";

/**
 * Las líneas de aviso de Tablero y Lista (17-10):
 *  - quien no puede mover pedidos (almacenero) lo lee una vez, con el porqué
 *    en la ⓘ, en vez de toparse con un «No tienes permiso» por botón;
 *  - «Con notas» lee el historial (B7): si falla, se ven todos y se avisa;
 *    si hay más de 200 en marcha, sólo revisa los más recientes.
 */
import { AlertTriangle, Eye } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { Pedidos } from "./hooks/usePedidos";

export function AvisosPedidos({ p }: { p: Pedidos }) {
  return (
    <>
      {p.permisos.explicacion && (
        <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Eye className="h-4 w-4 shrink-0" aria-hidden />
          Ves los pedidos; moverlos lo hace caja o el encargado.
          <InfoTip
            title="Por qué no ves los botones"
            what={p.permisos.explicacion}
            affects="Confirmar, preparar, mandar, entregar, cancelar, cobrar, anotar y cambiar varios a la vez."
            example="El almacenero ve qué hay que preparar e imprime la hoja; el cajero lo pasa a «Preparando»."
          />
        </p>
      )}

      {(p.notas.error || p.notas.recortado) && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-1 text-sm text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/10"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">
            {p.notas.error
              ? "No se pudo saber qué pedidos tienen notas: se ven todos."
              : "«Con notas» revisa los 200 pedidos más recientes; acota con otro filtro para ver el resto."}
          </span>
          {p.notas.error && (
            <button
              type="button"
              onClick={p.notas.recargar}
              className="h-12 px-2 text-sm font-bold underline"
            >
              Reintentar
            </button>
          )}
        </div>
      )}
    </>
  );
}
