"use client";

/**
 * El avance del envío, archivo por archivo: qué se está mandando, cuántas
 * filas trae, cuántos van y hace cuánto. Sin esto, cinco requests en fila
 * dejan la pantalla quieta y no hay forma de distinguir «está trabajando» de
 * «se colgó». Sale del modal del import (19-10).
 */

export default function AvanceDelEnvio({
  avance,
  modoEnvio,
  paso,
  pasoFilas,
  segundos,
}: {
  avance: { hechas: number; total: number } | null;
  modoEnvio: "preview" | "commit" | null;
  paso: string | null;
  pasoFilas: number | null;
  segundos: number;
}) {
  if (!avance) return null;
  return (
    <div className="space-y-2 rounded-xl bg-[var(--surface-sunken)] p-4">
      <p className="flex flex-wrap items-baseline justify-between gap-2 text-base font-extrabold text-[var(--text-primary)]">
        <span>
          {modoEnvio === "commit" ? "Importando" : "Revisando"} {paso ?? "…"}
          {/* Un import de UNA sola sección —el caso más común— se
              quedaba en "1 de 1" toda la corrida sin más información:
              la cantidad de filas es lo único que dice cuánto hay
              adentro de ese "1". */}
          {pasoFilas != null && (
            <span className="ml-1 text-sm font-semibold text-[var(--text-tertiary)]">
              · {pasoFilas} {pasoFilas === 1 ? "fila" : "filas"}
            </span>
          )}
        </span>
        <span className="tabular-nums text-[var(--text-tertiary)]">
          {avance.hechas + 1} de {avance.total}
          {/* Recién a los 3s: antes de eso el contador sólo agrega
              ruido a algo que ya se ve andar. */}
          {segundos >= 3 && <span className="ml-1">· {segundos}s</span>}
        </span>
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={avance.total}
        aria-valuenow={avance.hechas}
        aria-label="Avance de la importación"
        className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-[var(--dur-base)]"
          /* Se pinta lo TERMINADO, no lo que está en curso: una barra que
             ya muestra completa la sección que todavía está corriendo
             miente justo cuando el operador la mira para saber si puede
             irse. */
          style={{ width: `${Math.round((avance.hechas / avance.total) * 100)}%` }}
        />
        {/* El segmento de la sección EN CURSO parpadea: sin esto, una
            sección lenta (piezas, atribución de consumos) deja la
            barra clavada en el mismo % durante varios segundos y se
            lee como colgada en vez de trabajando. */}
        <div
          aria-hidden
          className="absolute top-0 h-full animate-pulse rounded-full bg-primary/40 transition-[left,width] duration-[var(--dur-base)]"
          style={{
            left: `${Math.round((avance.hechas / avance.total) * 100)}%`,
            width: `${Math.round((1 / avance.total) * 100)}%`,
          }}
        />
      </div>
      <p className="text-sm text-[var(--text-tertiary)]">
        {/* Las secciones van en orden porque dependen entre sí; decirlo
            acá evita que parezca lentitud gratuita. */}
        Van en orden porque cada una necesita la anterior. No cierres esta ventana.
      </p>
    </div>
  );
}
