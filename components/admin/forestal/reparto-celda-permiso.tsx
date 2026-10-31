"use client";

/**
 * Casilla «N° de permiso» de la tabla de bloques del cubicador.
 *
 * El código entero (`19-SEC/REG-PLT-2021-017`) no entra en la columna y la
 * casilla cortaba el FINAL —justo la parte que distingue un permiso de otro:
 * tres bloques de Tornillo se leían todos «19-SEC/REG-PL…» (2026-10-19). En
 * reposo se ve la cola «…PLT-2021-017» y el código entero en el `title`; al
 * entrar a la casilla se ve y se edita el texto completo, como siempre.
 */

import { useState } from "react";
import { codigoCortoDePermiso } from "@/lib/forestal/capacidad-por-permiso";

const AYUDA = "Título habilitante de origen — dos permisos de la misma especie nunca se combinan en el desglose de abajo";

export function CeldaPermiso({ valor, onCambiar }: { valor: string; onCambiar: (v: string) => void }) {
  const [editando, setEditando] = useState(false);
  const corto = codigoCortoDePermiso(valor);
  /* Sólo se recorta si hay una cola que reconocer: un código con otra forma se
     deja como está (cortarlo a ciegas confundiría dos permisos). */
  const cola = !editando && corto && corto !== valor.trim() && !corto.endsWith("…") ? corto : null;

  return (
    <span className="relative block">
      <input
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        onFocus={() => setEditando(true)}
        onBlur={() => setEditando(false)}
        placeholder="19-SEC/REG-…"
        aria-label="N° de permiso de origen del bloque"
        title={valor.trim() ? `${valor.trim()} · ${AYUDA}` : AYUDA}
        className={`h-10 w-full min-w-[130px] rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 font-mono text-sm outline-none focus:border-[var(--accent)] ${cola ? "text-transparent" : "text-[var(--text-secondary)]"}`}
      />
      {cola && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center overflow-hidden whitespace-nowrap px-2 font-mono text-sm text-[var(--text-secondary)]"
        >
          …{cola}
        </span>
      )}
    </span>
  );
}
