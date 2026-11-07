"use client";

/**
 * SoloEstePermisoSwitch — «Solo este permiso», al lado del chip de la banda.
 *
 * El chip decía bajo qué permiso se trabaja, pero ninguna lista se acotaba a
 * él: era un cartel (radar 2026-09-19). Prendido, Ingresos, GTF ingresadas,
 * Producción, Despacho, Productos disponibles, Consumos (el patio) y Saldos
 * (el patio, la capacidad y lo pendiente) piden al servidor sólo lo de ese
 * contrato (`?contratoId=`, ADR-421/431). Apagado, todo queda como antes. Lo
 * que NO se acota en esas pestañas (el cuadro de la Sección 2, la curva, la
 * conciliación) lo dice `CtpAvisoAlcancePermiso`.
 *
 * Sin permiso fijado se muestra deshabilitado y dice por qué: prendido sin
 * permiso no filtraría nada, y un interruptor que no hace nada es el mismo
 * problema que el chip tenía.
 *
 * Vive sólo en el Libro CTP: los otros libros que muestran el chip todavía no
 * leen el parámetro, y ofrecer el interruptor ahí prometería un filtro que no
 * existe.
 */

import { useId } from "react";
import { Filter } from "@buleje/design-system/icons";
import { useContratoActivo } from "@/contexts/contrato-activo-context";

/** Lo que el interruptor acota, dicho una sola vez (tooltip y descripción). */
const ALCANCE =
  "ingresos, producción, despachos, productos disponibles, Consumos (patio) y Saldos (patio, capacidad, pendientes)";

export default function SoloEstePermisoSwitch({
  enGrupo = false,
}: {
  /** Pegado al chip dentro de `BandaPermiso`: sin borde propio, redondea sólo su lado derecho. */
  enGrupo?: boolean;
} = {}) {
  const { activo, soloEste, setSoloEste, listo } = useContratoActivo();
  const idDescripcion = useId();

  if (!listo) return <div className="h-10 w-[9.5rem]" aria-hidden="true" />;

  const sinPermiso = !activo;
  const prendido = soloEste && !sinPermiso;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={prendido}
      disabled={sinPermiso}
      onClick={() => setSoloEste(!soloEste)}
      title={
        sinPermiso
          ? "Elige primero un permiso en el chip de al lado para poder ver solo lo suyo."
          : prendido
            ? `Viendo solo lo de ${activo.codigo}: ${ALCANCE}. Clic para ver todo.`
            : `Clic para ver solo lo de ${activo.codigo} en ${ALCANCE}.`
      }
      aria-describedby={idDescripcion}
      className={`inline-flex shrink-0 items-center gap-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 ${
        enGrupo
          ? /* En grupo el «prendido» es fondo de acento: un borde de 2 px
               adentro del borde del grupo se leía como un segundo control. */
            `h-full rounded-r-[11px] border-l px-2.5 border-[var(--rule-base)] ${
              prendido
                ? "bg-primary/10 text-[var(--text-primary)] dark:bg-primary/20"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
            }`
          : `h-10 rounded-xl px-3 ${
              prendido
                ? "border-2 border-[var(--accent)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
                : "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
            }`
      }`}
    >
      <Filter className="h-4 w-4 shrink-0" aria-hidden="true" />
      {/* El `title` no llega por teclado ni en táctil: la lista va también como descripción. */}
      <span id={idDescripcion} hidden>
        {sinPermiso ? "Elige primero un permiso en el chip de al lado." : `Acota ${ALCANCE}.`}
      </span>
      {/* El rótulo cede cuando la banda aprieta (`/acciones`, libro-chrome):
          queda el embudo + la pista, con el nombre para el lector y el title. */}
      <span className="whitespace-nowrap max-lg:sr-only @max-[42rem]/acciones:sr-only">Solo este permiso</span>
      {/* La pista del switch: el estado se lee sin depender del color solo. */}
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          prendido ? "bg-[var(--accent)]" : "bg-[var(--rule-base)]"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[var(--surface-raised)] shadow-sm transition-transform ${
            prendido ? "translate-x-4" : ""
          }`}
        />
      </span>
    </button>
  );
}
