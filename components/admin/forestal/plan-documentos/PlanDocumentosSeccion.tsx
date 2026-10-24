"use client";

/**
 * «Documentos del plan» (ADR-467) — el cuerpo de la sección: «lo que falta»
 * arriba, las carpetas a la izquierda y la carpeta elegida a la derecha. En el
 * celular, todo apilado.
 *
 * No sabe si el plan existe: recibe las carpetas ya armadas y las acciones de
 * quien la monta (`PlanDocumentosAlta` o `PlanDocumentosDelPlan`).
 */

import { useMemo, useState } from "react";
import { Loader2 } from "@buleje/design-system/icons";
import ArbolCarpetas from "./ArbolCarpetas";
import CarpetaPanel, { idCasillero } from "./CarpetaPanel";
import LoQueFalta from "./LoQueFalta";
import { loQueFalta, type CarpetaVista } from "./modelo";
import type { AccionesDocs, DatosDelPlan } from "./acciones";

export default function PlanDocumentosSeccion({
  carpetas,
  acciones,
  delPlan,
  cargando,
  error,
  aviso,
  elegida: elegidaExterna,
  onElegir,
}: {
  carpetas: readonly CarpetaVista[];
  acciones: AccionesDocs;
  delPlan: DatosDelPlan;
  cargando: boolean;
  error: string | null;
  /** Un aviso de la última acción (lo que no se pudo). */
  aviso?: string | null;
  /** Controlada desde afuera cuando quien monta quiere elegir (la carpeta recién creada). */
  elegida?: string | null;
  onElegir?: (clave: string) => void;
}) {
  const [elegidaLocal, setElegidaLocal] = useState<string | null>(null);
  const pedida = elegidaExterna ?? elegidaLocal;
  const actual = carpetas.find((c) => c.clave === pedida) ?? carpetas[0] ?? null;
  const indice = actual ? carpetas.indexOf(actual) : -1;
  const resumen = useMemo(() => loQueFalta(carpetas), [carpetas]);

  const elegir = (clave: string) => {
    setElegidaLocal(clave);
    onElegir?.(clave);
  };

  return (
    <div data-docs-plan className="space-y-3">
      <LoQueFalta
        resumen={resumen}
        onElegir={(chip) => {
          elegir(chip.carpetaClave);
          /* Un cuadro después: la carpeta nueva recién se pinta. */
          requestAnimationFrame(() => {
            const el = document.getElementById(idCasillero(chip.carpetaClave, chip.casilleroClave));
            el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            el?.focus({ preventScroll: true });
          });
        }}
      />

      {error && (
        <p role="alert" className="rounded-xl border border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
          {error}
        </p>
      )}
      {acciones.modo === "plan" && carpetas.some((c) => c.provisional) && (
        <p className="text-xs text-[var(--text-secondary)]">
          Son las carpetas sugeridas: se crean en Documentos cuando subas el primer archivo.
        </p>
      )}
      {aviso && (
        <p role="status" className="rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--text-primary)]">
          {aviso}
        </p>
      )}

      {cargando && carpetas.length === 0 ? (
        <p role="status" className="flex items-center gap-2 py-6 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Buscando las carpetas del plan…
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)]">
          <div className="sm:border-r sm:border-[var(--rule-soft)] sm:pr-3">
            <ArbolCarpetas
              carpetas={carpetas}
              elegida={actual?.clave ?? null}
              onElegir={elegir}
              onCrear={async (nombre, paraTodos) => {
                const error = await acciones.crearCarpeta(nombre, paraTodos);
                return error;
              }}
              puedeCrear
            />
          </div>
          {actual ? (
            <CarpetaPanel key={actual.clave} carpeta={actual} indice={indice} total={carpetas.length} acciones={acciones} delPlan={delPlan} />
          ) : (
            <p className="py-6 text-sm text-[var(--text-tertiary)]">Todavía no hay carpetas. Crea la primera a la izquierda.</p>
          )}
        </div>
      )}
    </div>
  );
}
