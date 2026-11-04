"use client";

/**
 * Las 4 casillas de arriba: aserrío, flete, margen y (opcional) precio de venta
 * por pie. Cambian en cada tecla; la cuenta se pide con espera (`usePrecioTroza`).
 * Vacía ≠ 0: el aserrío o el flete vacíos salen avisados como «No pusiste: …».
 */
import { cn } from "@/lib/utils";
import { leerCasilla, type CampoPrecioTroza, type CasillasPrecioTroza } from "./precio-troza-formato";

export const ID_CASILLA_PRECIO = "precio-troza-precio-pt";

const CAMPOS: { campo: CampoPrecioTroza; label: string; unidad: string; placeholder: string; ayuda: string }[] = [
  { campo: "aserrio", label: "Aserrío", unidad: "S/ por m³", placeholder: "0", ayuda: "Lo que te cuesta aserrar 1 m³ de rollo" },
  { campo: "flete", label: "Flete", unidad: "S/ por m³", placeholder: "0", ayuda: "Traer 1 m³ de rollo hasta el aserradero" },
  { campo: "margen", label: "Tu ganancia", unidad: "% de la venta", placeholder: "0", ayuda: "Lo que quieres ganar sobre lo que vendes" },
  { campo: "precio", label: "Precio de venta", unidad: "S/ por pie", placeholder: "El de tus ventas", ayuda: "Vacío = el que sale de tus ventas de cada especie" },
];

export default function PrecioTrozaCasillas({
  casillas,
  onCambiar,
  recalculando,
}: {
  casillas: CasillasPrecioTroza;
  onCambiar: (campo: CampoPrecioTroza, valor: string) => void;
  recalculando: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-busy={recalculando}>
      {CAMPOS.map(({ campo, label, unidad, placeholder, ayuda }) => {
        const { error } = leerCasilla(campo, casillas[campo]);
        const id = campo === "precio" ? ID_CASILLA_PRECIO : `precio-troza-${campo}`;
        return (
          <label key={campo} htmlFor={id} className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              {label} <span className="font-normal text-[var(--text-tertiary)]">({unidad})</span>
            </span>
            <input
              id={id}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={casillas[campo]}
              onChange={(e) => onCambiar(campo, e.target.value)}
              placeholder={placeholder}
              title={ayuda}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : undefined}
              className={cn(
                "h-11 w-full rounded-lg border bg-[var(--surface-canvas)] px-3 font-mono text-sm tabular-nums text-[var(--text-primary)] placeholder:font-sans placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]",
                error ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)]",
              )}
            />
            {error && (
              <span id={`${id}-error`} className="text-xs text-[var(--data-error-ink)]">
                {error}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
