"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { leerNumero } from "./inspeccion-datos";

export const CAMPO =
  "h-12 w-full rounded-xl border-2 border-[var(--rule-strong)] bg-[var(--surface-raised)] px-3 text-lg text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-60";

const aTexto = (n: number | null) => (n == null ? "" : String(n));

/**
 * Un número que tipea el inspector con el teclado del celular. Guarda su propio
 * texto (así «12,» no se borra a mitad de escribir) y avisa el número recién
 * cuando se lee bien. Vacío = no contado (`null`), nunca 0.
 */
export function CampoNumero({
  etiqueta,
  valor,
  onValor,
  entero = false,
  disabled = false,
  placeholder,
}: {
  etiqueta: string;
  valor: number | null;
  onValor: (n: number | null) => void;
  entero?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const [texto, setTexto] = useState(aTexto(valor));
  const leido = leerNumero(texto);
  const mal = leido != null && (Number.isNaN(leido) || (entero && !Number.isInteger(leido)));

  /* Si el valor cambia desde afuera (se recargó del servidor), el campo lo muestra. */
  useEffect(() => {
    setTexto((t) => {
      const n = leerNumero(t);
      return n === valor || (n == null && valor == null) ? t : aTexto(valor);
    });
  }, [valor]);

  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-[var(--text-secondary)]">
        {etiqueta}
      </label>
      <input
        id={id}
        type="text"
        inputMode={entero ? "numeric" : "decimal"}
        autoComplete="off"
        value={texto}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={mal || undefined}
        onChange={(e) => {
          const t = e.target.value;
          setTexto(t);
          const n = leerNumero(t);
          if (n == null) onValor(null);
          else if (!Number.isNaN(n) && (!entero || Number.isInteger(n))) onValor(n);
        }}
        className={cn(CAMPO, "tabular-nums", mal && "border-[var(--data-error-500)]")}
      />
      {mal && (
        <p className="text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
          {entero ? "Escribe un número entero, por ejemplo 24." : "Escribe un número, por ejemplo 12,5."}
        </p>
      )}
    </div>
  );
}
