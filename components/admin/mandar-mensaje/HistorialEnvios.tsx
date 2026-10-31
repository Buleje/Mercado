"use client";

/**
 * Mandar mensaje › «Lo que ya mandaste»: los envíos automáticos (programados,
 * enviados, borradores) y lo que abriste uno por uno, en la misma tabla de
 * antes (Crecimiento › Campañas), con el «⋯» por fila para cancelar o borrar.
 */
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Megaphone } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { TablaCampanas } from "@/components/admin/crecimiento/campanas/TablaCampanas";
import type { Campanas } from "@/components/admin/crecimiento/campanas/use-campanas";

export function HistorialEnvios({ c }: { c: Pick<Campanas, "campaigns" | "loading" | "error" | "busyId" | "cambiarEstado" | "eliminar" | "recargar"> }) {
  return (
    <section aria-labelledby="mm-historial" className="space-y-2">
      <CardTitle id="mm-historial" className="text-sm font-bold text-[var(--text-primary)]">Lo que ya mandaste</CardTitle>
      <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        {c.loading && c.campaigns.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--text-tertiary)]">Cargando lo que mandaste…</p>
        ) : c.error && c.campaigns.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <AlertTriangle className="h-6 w-6 text-[var(--data-error-500)]" aria-hidden />
            <p className="text-sm text-[var(--data-error-ink)]">No se pudo cargar lo que mandaste.</p>
            <button type="button" onClick={c.recargar} className={button({ variant: "ghost", className: "rounded-xl text-sm" })}>Reintentar</button>
          </div>
        ) : c.campaigns.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <Megaphone className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
            <p className="text-sm text-[var(--text-secondary)]">Aún no has mandado mensajes</p>
          </div>
        ) : (
          <TablaCampanas
            campaigns={c.campaigns}
            busyId={c.busyId}
            onCancelar={(id) => { void c.cambiarEstado(id, "cancelada"); }}
            onEliminar={(id) => { void c.eliminar(id); }}
          />
        )}
      </div>
    </section>
  );
}
