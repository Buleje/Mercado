/**
 * Cuánto de una venta entra a la caja, y por qué medio.
 *
 * El POS deja cobrar con varias formas de pago a la vez (S/60 en efectivo y
 * S/40 por Yape). Cuando eso pasa manda `payment: "MIXTO"` y el desglose real
 * en `paymentDetails`. La venta registraba UN movimiento de caja con el método
 * «MIXTO» y el total completo… y el arqueo suma sólo los movimientos con
 * `method === "efectivo"`.
 *
 * Resultado medido: esa venta aportaba S/0 al esperado. Al cerrar el día, los
 * S/60 que sí estaban en el cajón aparecían como sobrante, todos los días y en
 * cada venta mixta. Acá el pago se desarma en una línea por medio, que es como
 * la caja lo vive.
 */

export type LineaDePago = { method: string; amount: number };

/** Redondeo a céntimos: es plata, no un float suelto. */
function centavos(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * El efectivo es el único medio del que sale vuelto, así que cualquier exceso
 * sobre el total de la venta se descuenta de ahí: a la caja entra el neto.
 */
function normalizarExcedente(lineas: LineaDePago[], total: number): LineaDePago[] {
  const suma = centavos(lineas.reduce((s, l) => s + l.amount, 0));
  const exceso = centavos(suma - total);
  if (exceso <= 0) return lineas;
  return lineas.map((l) =>
    l.method === "efectivo" ? { ...l, amount: centavos(Math.max(0, l.amount - exceso)) } : l,
  );
}

/**
 * Las líneas de caja de una venta.
 *
 * @param payment  Lo que declaró el POS: un medio concreto o `"MIXTO"`.
 * @param detalles `paymentDetails` crudo (JSON de `[{method, amount}]`) o null.
 * @param total    Total final de la venta, ya con descuentos.
 */
export function desglosarPago(
  payment: string | undefined,
  detalles: string | null | undefined,
  total: number,
): LineaDePago[] {
  const metodo = payment || "efectivo";
  const totalOk = centavos(total);

  if (metodo.toUpperCase() !== "MIXTO") {
    return [{ method: metodo, amount: totalOk }];
  }

  // Sin desglose no se puede repartir: se registra como estaba antes, con el
  // método agregado, en vez de inventar cuánto fue en efectivo.
  if (!detalles) return [{ method: metodo, amount: totalOk }];

  let parsed: unknown;
  try {
    parsed = JSON.parse(detalles);
  } catch {
    return [{ method: metodo, amount: totalOk }];
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [{ method: metodo, amount: totalOk }];
  }

  const lineas: LineaDePago[] = [];
  for (const p of parsed) {
    if (!p || typeof p !== "object") continue;
    const { method, amount } = p as { method?: unknown; amount?: unknown };
    const monto = centavos(Number(amount));
    if (typeof method !== "string" || !method || monto <= 0) continue;
    lineas.push({ method, amount: monto });
  }
  if (lineas.length === 0) return [{ method: metodo, amount: totalOk }];

  return normalizarExcedente(lineas, totalOk);
}

/** Lo que de verdad entra al cajón: sólo el efectivo. */
export function efectivoDe(lineas: readonly LineaDePago[]): number {
  return centavos(lineas.filter((l) => l.method === "efectivo").reduce((s, l) => s + l.amount, 0));
}
