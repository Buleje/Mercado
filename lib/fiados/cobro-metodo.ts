/**
 * Medio con el que el cliente paga su fiado y cómo se anota.
 *
 * `FiadoCuota` no tiene columna de medio: el medio va al inicio de la nota
 * («Yape · pagó su hijo»), que es lo que el historial del fiado ya muestra.
 * El mismo conjunto que `MetodoPago` de la caja (`lib/adelantos/movimiento-caja.ts`)
 * para que el ingreso de la caja lleve el medio correcto: sólo el efectivo
 * cuenta en el esperado del arqueo (`lib/caja/saldo-esperado.ts`).
 */
export const METODOS_COBRO = ["efectivo", "yape", "plin", "tarjeta", "transferencia"] as const;
export type MetodoCobro = (typeof METODOS_COBRO)[number];

export const ETIQUETA_METODO: Record<MetodoCobro, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

const TOPE_NOTA = 500;

/** «Yape · nota» (o sólo «Yape»). Sin medio, la nota tal cual. */
export function notasConMetodo(metodo: MetodoCobro | undefined, notas?: string): string | undefined {
  const limpia = notas?.trim() || "";
  if (!metodo) return limpia || undefined;
  return (limpia ? `${ETIQUETA_METODO[metodo]} · ${limpia}` : ETIQUETA_METODO[metodo]).slice(0, TOPE_NOTA);
}

/**
 * Lo inverso de `notasConMetodo`: «Yape · pagó su hijo» → medio «Yape» y nota
 * «pagó su hijo». Sin medio reconocido, la nota tal cual (cobros viejos).
 */
export function medioYNota(notas?: string | null): { metodo: MetodoCobro | null; medio: string | null; nota: string } {
  const t = notas?.trim() ?? "";
  for (const metodo of METODOS_COBRO) {
    const medio = ETIQUETA_METODO[metodo];
    if (t === medio) return { metodo, medio, nota: "" };
    if (t.startsWith(`${medio} · `)) return { metodo, medio, nota: t.slice(medio.length + 3) };
  }
  return { metodo: null, medio: null, nota: t };
}

/** Descripción del ingreso en la caja: «Cobro de fiado · Rosa Pérez». */
export function etiquetaCobroFiado(persona: string): string {
  return `Cobro de fiado · ${persona}`.replace(/\s+/g, " ").trim().slice(0, 120);
}
