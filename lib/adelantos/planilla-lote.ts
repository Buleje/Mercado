/**
 * Los descuentos de planilla del período, todos de una.
 *
 * POR QUÉ. La modalidad «descuento por planilla» (ADR-329) es el adelanto de
 * sueldo: se descuenta del pago del mes. Con cinco empleados eso son cinco
 * liquidaciones a mano, el mismo día, con el mismo concepto — y la que se
 * olvida no se descuenta nunca.
 *
 * QUÉ NO HACE. No decide cuánto se le descuenta a cada uno: eso es una política
 * del negocio, no una cuenta. Propone el saldo completo y quien revisa ajusta
 * línea por línea antes de aplicar. Una pantalla que descuenta sola el sueldo de
 * alguien es exactamente lo que nadie quiere firmar.
 */

export interface AdelantoDePlanilla {
  id: string;
  codigoOperacion?: string | null;
  modalidad: string;
  status: string;
  saldoPendiente: number;
  moneda?: string | null;
  beneficiario?: { nombre?: string | null } | null;
}

export interface LineaDescuento {
  adelantoId: string;
  codigo: string | null;
  persona: string;
  saldo: number;
  moneda: string;
  /** Cuánto se propone descontar este período. Editable antes de aplicar. */
  descuento: number;
  /** `true` si con este descuento el adelanto queda liquidado. */
  liquida: boolean;
}

/**
 * Arma la propuesta del período.
 *
 * @param tope opcional: máximo a descontar por persona (ej. media quincena).
 *   Sin tope se propone el saldo completo.
 */
export function proponerDescuentos(
  adelantos: readonly AdelantoDePlanilla[],
  tope?: number | null,
): LineaDescuento[] {
  return adelantos
    .filter((a) => a.modalidad === "DESCUENTO_PLANILLA" && a.status === "ABIERTO" && a.saldoPendiente > 0)
    .map((a) => {
      // Nunca más que lo que debe: descontar de más convertiría el adelanto en
      // un saldo a favor de la persona, que es otro problema.
      const propuesto = tope != null && tope > 0 ? Math.min(tope, a.saldoPendiente) : a.saldoPendiente;
      const descuento = Math.round(propuesto * 100) / 100;
      return {
        adelantoId: a.id,
        codigo: a.codigoOperacion ?? null,
        persona: a.beneficiario?.nombre ?? "—",
        saldo: a.saldoPendiente,
        moneda: a.moneda ?? "PEN",
        descuento,
        liquida: descuento >= a.saldoPendiente,
      };
    })
    .sort((x, y) => x.persona.localeCompare(y.persona, "es"));
}

/** Cuánto se va a descontar en total, por moneda — no se suman soles con dólares. */
export function totalPorMoneda(lineas: readonly LineaDescuento[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const l of lineas) {
    if (!(l.descuento > 0)) continue;
    t[l.moneda] = Math.round(((t[l.moneda] ?? 0) + l.descuento) * 100) / 100;
  }
  return t;
}

/** Ajusta una línea sin dejar que se pase del saldo ni se vaya a negativo. */
export function ajustarLinea(linea: LineaDescuento, nuevo: number): LineaDescuento {
  const descuento = Math.max(0, Math.min(Math.round(nuevo * 100) / 100, linea.saldo));
  return { ...linea, descuento, liquida: descuento >= linea.saldo };
}

/** El concepto que queda escrito en cada entrega. */
export function conceptoDelPeriodo(periodo: string): string {
  return `Descuento por planilla · ${periodo}`;
}
