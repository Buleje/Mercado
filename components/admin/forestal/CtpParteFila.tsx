"use client";

/**
 * CtpParteFila — una parte de la libreta en la lista desplegable de la guía.
 *
 * Muestra el nombre, cómo se la identifica y —lo que no estaba— **qué le falta
 * para poder ir en la guía con ese papel** (`faltantesParaGuia`, el mismo juez
 * que usa la vista del Directorio). Sin eso, que un destinatario no tenga
 * documento se descubría recién al imprimir, con el camión ya cargado.
 */

import { ROL_LABEL, direccionCompleta, faltantesParaGuia, type Parte, type RolParte } from "@/lib/forestal/directorio";

/** Una fila de la libreta, con lo que le falta para poder ir en la guía. */
export default function CtpParteFila({
  parte,
  rol,
  otroPapel,
  onUsar,
}: {
  parte: Parte;
  rol: RolParte;
  /** Está guardada con OTRO papel: elegirla se lo suma. */
  otroPapel?: boolean;
  onUsar: () => void;
}) {
  const faltan = faltantesParaGuia(parte, rol);
  return (
    <button
      type="button"
      onClick={onUsar}
      className="flex w-full items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1.5 min-h-10 text-left transition-colors hover:border-[var(--accent)] hover:bg-primary/5"
    >
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{parte.nombre}</span>
        <span className="block truncate text-xs text-[var(--text-tertiary)]">
          {[
            otroPapel ? parte.roles.map((r) => ROL_LABEL[r]).join(", ") : null,
            parte.docNumero ? `${parte.docTipo} ${parte.docNumero}` : null,
            direccionCompleta(parte) || null,
          ]
            .filter(Boolean)
            .join(" · ") || "Sin documento cargado"}
        </span>
        {/* Lo que le falta para la guía se ve ANTES de elegirlo: si no, se
            descubre recién al imprimir, con el camión cargado. */}
        {faltan.length > 0 && (
          <span className="mt-0.5 block truncate text-xs font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            Para la guía le falta {faltan.join(" y ")}
          </span>
        )}
      </div>
      {parte.usos > 0 && (
        <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--text-tertiary)]">
          {parte.usos}×
        </span>
      )}
    </button>
  );
}
