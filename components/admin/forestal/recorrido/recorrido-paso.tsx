"use client";

import { useState, type ReactNode } from "react";
import { button } from "@/components/ui-system/button-variants";
import { Ban, Check, ChevronDown, Circle, XCircle } from "@buleje/design-system/icons";
import { ESTADO_EN_PANTALLA, lineaDelPaso, type PasoEnPantalla, type TonoEstado } from "@/lib/forestal/recorrido-pantalla";

/**
 * Un paso del recorrido: número, título, su estado en palabras (nunca sólo el
 * color) y su línea de detalle. La acción del paso va debajo; arranca abierta
 * en el paso en el que vas y en el que tiene un problema.
 */

const PILL: Record<TonoEstado, string> = {
  exito: "bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]",
  neutro: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  error: "bg-[var(--data-error-500)]/12 text-[var(--data-error-ink)]",
  apagado: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
};

const ICONO: Record<TonoEstado, typeof Check> = { exito: Check, neutro: Circle, error: XCircle, apagado: Ban };

const NUMERO: Record<TonoEstado, string> = {
  exito: "border-[var(--data-success-500)] bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]",
  neutro: "border-[var(--rule-base)] text-[var(--text-secondary)]",
  error: "border-[var(--data-error-500)] bg-[var(--data-error-500)]/12 text-[var(--data-error-ink)]",
  apagado: "border-[var(--rule-base)] text-[var(--text-tertiary)]",
};

export function PillEstado({ tono, children }: { tono: TonoEstado; children: ReactNode }) {
  const Icono = ICONO[tono];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${PILL[tono]}`}>
      <Icono className="h-3.5 w-3.5" aria-hidden />
      {children}
    </span>
  );
}

export default function RecorridoPaso({
  paso,
  actual,
  children,
}: {
  paso: PasoEnPantalla;
  /** Es el `siguiente` del recorrido: lo que toca hacer ahora. */
  actual: boolean;
  /** La acción propia del paso (puede no haber). */
  children?: ReactNode;
}) {
  const { etiqueta, tono } = ESTADO_EN_PANTALLA[paso.estado];
  const linea = lineaDelPaso(paso);
  /* Lo que la persona abrió o cerró manda; si no tocó nada, sigue al paso en el que vas. */
  const [elegido, setElegido] = useState<boolean | null>(null);
  const abierto = elegido ?? (actual || paso.estado === "con_problema");
  const conAccion = children != null && children !== false;
  const idCuerpo = `recorrido-paso-${paso.paso}`;

  return (
    <li
      data-paso={paso.paso}
      data-estado={paso.estado}
      aria-current={actual ? "step" : undefined}
      className={`rounded-xl border px-3 py-3 sm:px-4 ${actual ? "border-[var(--accent)] bg-primary/5" : "border-[var(--rule-base)]"}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold tabular-nums ${NUMERO[tono]}`}
        >
          {paso.numero}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-bold text-[var(--text-primary)]">{paso.titulo}</span>
            <PillEstado tono={tono}>{etiqueta}</PillEstado>
            {actual && <span className="text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">Te toca</span>}
          </div>
          {linea && (
            <p
              className={`mt-1 text-sm ${tono === "error" ? "break-words text-[var(--data-error-ink)]" : "truncate text-[var(--text-secondary)]"}`}
              title={linea}
            >
              {linea}
            </p>
          )}
        </div>
        {conAccion && (
          <button
            type="button"
            onClick={() => setElegido(!abierto)}
            aria-expanded={abierto}
            aria-controls={idCuerpo}
            className={button({ variant: "ghost", size: "sm", className: "shrink-0" })}
          >
            {abierto ? "Ocultar" : "Ver"}
            <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
          </button>
        )}
      </div>
      {conAccion && abierto && (
        <div id={idCuerpo} className="mt-3 sm:pl-10">
          {children}
        </div>
      )}
    </li>
  );
}
