"use client";

/**
 * SoloEstePermisoSwitch — «Solo este permiso», al lado del chip de la banda.
 *
 * El chip decía bajo qué permiso se trabaja, pero ninguna lista se acotaba a
 * él: era un cartel (radar 2026-09-19). Prendido, Ingresos, GTF ingresadas,
 * Producción, Despacho y Productos disponibles piden al servidor sólo lo de
 * ese contrato (`?contratoId=`, ADR-421). Apagado, todo queda como antes.
 *
 * Sin permiso fijado se muestra deshabilitado y dice por qué: prendido sin
 * permiso no filtraría nada, y un interruptor que no hace nada es el mismo
 * problema que el chip tenía.
 *
 * Vive sólo en el Libro CTP: los otros libros que muestran el chip todavía no
 * leen el parámetro, y ofrecer el interruptor ahí prometería un filtro que no
 * existe.
 */

import { Filter } from "@buleje/design-system/icons";
import { useContratoActivo } from "@/contexts/contrato-activo-context";

export default function SoloEstePermisoSwitch() {
  const { activo, soloEste, setSoloEste, listo } = useContratoActivo();

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
            ? `Viendo solo lo de ${activo.codigo}: ingresos, producción, despachos y productos disponibles. Clic para ver todo.`
            : `Clic para ver solo lo de ${activo.codigo} en ingresos, producción, despachos y productos disponibles.`
      }
      className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 ${
        prendido
          ? "border-2 border-[var(--accent)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
          : "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
      }`}
    >
      <Filter className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="max-lg:sr-only">Solo este permiso</span>
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
