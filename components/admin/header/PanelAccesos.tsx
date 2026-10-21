"use client";

/**
 * El menú del botón «Accesos directos» de la cabecera: TODOS los accesos que el
 * rol ve (abren su módulo en un modal), las opciones de Cámaras cuando Cámaras
 * no está en la barra, «Recientes» (lo último que abriste, desde el 20-10) y
 * «Elegir los de la barra». Salió de `AccesosRapidos.tsx` (20-10) para que los
 * dos queden bajo 300 líneas.
 */

import { Check, Pin } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { Reciente } from "@/lib/admin/recientes-panel";
import type { AccesoId, AccesoRapido } from "./accesos-rapidos";
import { FilasCamarasAccesos, TONO_CONTADOR } from "./AvisosCamarasUI";
import RecientesDelMenu from "./MenuRecientes";
import type { OpcionCamaras } from "./opciones-camaras";
import type { CamarasCabecera } from "./use-camaras-cabecera";

interface Props {
  permitidos: readonly AccesoRapido[];
  anclados: ReadonlySet<AccesoId>;
  eligiendo: boolean;
  onAlternarEligiendo: () => void;
  onAlternarAnclado: (id: AccesoId) => void;
  onAbrir: (a: AccesoRapido) => void;
  cam: CamarasCabecera;
  /** Las opciones de Cámaras van acá sólo si Cámaras no está en la barra (ahí tiene su propio menú). */
  opcionesDeCamaras: boolean;
  onElegirDeCamaras: (o: OpcionCamaras) => void;
  /** `null` = sin sesión (o sin poder guardar): no hay recientes que mostrar. */
  recientes: { lista: readonly Reciente[]; hayGuardados: boolean } | null;
  onVolverA: (href: string) => void;
  onBorrarRecientes: () => void;
}

export default function PanelAccesos({
  permitidos,
  anclados,
  eligiendo,
  onAlternarEligiendo,
  onAlternarAnclado,
  onAbrir,
  cam,
  opcionesDeCamaras,
  onElegirDeCamaras,
  recientes,
  onVolverA,
  onBorrarRecientes,
}: Props) {
  return (
    <div
      role="menu"
      aria-label="Accesos directos"
      className={cn(
        "absolute left-0 top-full z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]",
        "max-sm:left-3 max-sm:right-3 max-sm:w-auto max-sm:max-w-none",
      )}
    >
      <p className="px-2 pb-2 pt-1 text-sm font-bold text-[var(--text-primary)]">
        {eligiendo ? "Elige los de la barra" : "Accesos directos"}
      </p>
      {permitidos.length > 0 && (
        <div className="grid grid-cols-2 gap-1">
          {permitidos.map((a) => {
            const anclado = anclados.has(a.id);
            return (
              <button
                key={a.id}
                type="button"
                role={eligiendo ? "menuitemcheckbox" : "menuitem"}
                aria-checked={eligiendo ? anclado : undefined}
                title={a.hint}
                onClick={() => (eligiendo ? onAlternarAnclado(a.id) : onAbrir(a))}
                className={cn(
                  "relative flex min-h-14 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-[var(--text-primary)] transition-colors",
                  "hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                  eligiendo && anclado && "bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/40",
                )}
              >
                <a.icon className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
                <span className="min-w-0 flex-1 leading-tight">{a.label}</span>
                {a.id === "camaras" && !eligiendo && cam.sinVer > 0 && (
                  <span className={cn("shrink-0 rounded-full px-1.5 text-sm font-bold tabular-nums", TONO_CONTADOR)}>
                    {cam.sinVer > 9 ? "9+" : cam.sinVer}
                    <span className="sr-only"> sin ver</span>
                  </span>
                )}
                {eligiendo ? (
                  <span
                    aria-hidden
                    className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                      anclado ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--rule-strong)]",
                    )}
                  >
                    {anclado && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                ) : (
                  anclado && <Pin className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-label="En la barra" />
                )}
              </button>
            );
          })}
        </div>
      )}
      {opcionesDeCamaras && !eligiendo && <FilasCamarasAccesos cam={cam} alElegir={onElegirDeCamaras} />}
      {recientes && !eligiendo && (
        <RecientesDelMenu
          lista={recientes.lista}
          hayGuardados={recientes.hayGuardados}
          alVolver={onVolverA}
          alBorrar={onBorrarRecientes}
        />
      )}
      {permitidos.length > 0 && (
        <button
          type="button"
          role="menuitem"
          onClick={onAlternarEligiendo}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {eligiendo ? <Check className="h-4 w-4" aria-hidden /> : <Pin className="h-4 w-4" aria-hidden />}
          {eligiendo ? "Listo" : "Elegir los de la barra"}
        </button>
      )}
    </div>
  );
}
