/**
 * lib/tax/obligaciones-peru.ts — obligaciones tributarias mensuales (Perú).
 *
 * Lógica PURA y testeable para estimar lo que una empresa debe declarar/pagar
 * cada mes: IGV y pago a cuenta del Impuesto a la Renta, según su régimen.
 *
 * IMPORTANTE: son ESTIMACIONES con fórmulas transparentes (la UI muestra cada
 * cálculo). No reemplazan a un contador: el coeficiente de Renta del Régimen
 * General depende del ejercicio anterior, y hay obligaciones (ESSALUD, ONP/AFP,
 * detracciones, ITAN, Renta anual) que requieren datos de planilla/compras
 * específicos. Esos se marcan aparte, nunca se inventan montos.
 */

export const IGV_RATE = 0.18;

/**
 * UIT 2026 en soles. La UIT 2025 fue S/ 5,350. Si SUNAT publica otro valor para
 * 2026, ajustar acá (única fuente). Solo afecta el umbral de 300 UIT del RMT.
 */
export const UIT = 5350;

export type RegimenTributario = "nrus" | "rer" | "rmt" | "general";

export const REGIMEN_LABELS: Record<RegimenTributario, string> = {
  nrus: "Nuevo RUS",
  rer: "Régimen Especial (RER)",
  rmt: "Régimen MYPE Tributario (RMT)",
  general: "Régimen General",
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Tasa del pago a cuenta mensual del Impuesto a la Renta por régimen.
 *  - RER: 1.5% de los ingresos netos.
 *  - RMT: 1% hasta 300 UIT de ingresos netos anuales acumulados; luego el
 *         coeficiente (aprox. 1.5% como referencia hasta calcularlo real).
 *  - General: 1.5% o coeficiente (el mayor); usamos 1.5% como piso referencial.
 *  - NRUS: no aplica porcentaje (cuota fija por categoría).
 */
export function rentaPagoACuentaRate(
  regimen: RegimenTributario,
  ingresosNetosAnualAcum: number,
): number {
  switch (regimen) {
    case "rer": return 0.015;
    case "rmt": return ingresosNetosAnualAcum <= 300 * UIT ? 0.01 : 0.015;
    case "general": return 0.015;
    case "nrus": return 0;
  }
}

export interface ObligacionInput {
  regimen: RegimenTributario;
  /** Base imponible de ventas del período (sin IGV). */
  ventasBase: number;
  /** Base imponible de compras del período (sin IGV) → crédito fiscal. */
  comprasBase: number;
  /** Ingresos netos anuales acumulados (para el umbral RMT). Default: ventasBase. */
  ingresosNetosAnualAcum?: number;
}

export interface Obligacion {
  key: "igv" | "renta" | "nrus";
  label: string;
  /** Fórmula legible que sustenta el monto (transparencia anti-"número mágico"). */
  formula: string;
  monto: number;
  /** true si el monto es una estimación (no exacto) — la UI lo señala. */
  estimado: boolean;
}

/**
 * Calcula las obligaciones mensuales declarables (IGV + Renta) a partir de la
 * actividad real del período. Devuelve cada obligación con su fórmula y el total.
 */
export function computeObligacionesMensuales(input: ObligacionInput): {
  obligaciones: Obligacion[];
  igvVentas: number;
  igvCompras: number;
  total: number;
} {
  const igvVentas = round2(input.ventasBase * IGV_RATE);
  const igvCompras = round2(input.comprasBase * IGV_RATE);
  // IGV a pagar = débito (ventas) − crédito (compras). Si es negativo, hay
  // crédito fiscal a favor que arrastra al mes siguiente → a pagar 0.
  const igv = Math.max(0, round2(igvVentas - igvCompras));

  const obligaciones: Obligacion[] = [
    {
      key: "igv",
      label: "IGV",
      formula: `IGV ventas (${igvVentas.toFixed(2)}) − IGV compras (${igvCompras.toFixed(2)})`,
      monto: igv,
      estimado: false,
    },
  ];

  if (input.regimen === "nrus") {
    obligaciones.push({
      key: "nrus",
      label: "Cuota NRUS",
      formula: "Cuota fija mensual según categoría (S/20 ó S/50)",
      monto: 0,
      estimado: true,
    });
  } else {
    const rate = rentaPagoACuentaRate(input.regimen, input.ingresosNetosAnualAcum ?? input.ventasBase);
    const renta = round2(input.ventasBase * rate);
    obligaciones.push({
      key: "renta",
      label: "Renta (pago a cuenta)",
      formula: `${(rate * 100).toFixed(1)}% × ingresos netos (${input.ventasBase.toFixed(2)})`,
      monto: renta,
      estimado: input.regimen === "general", // el coeficiente real exige ejercicio anterior
    });
  }

  const total = round2(obligaciones.reduce((s, o) => s + o.monto, 0));
  return { obligaciones, igvVentas, igvCompras, total };
}

/**
 * Ventana referencial de vencimiento del cronograma SUNAT por último dígito del
 * RUC. SUNAT publica las fechas exactas cada año; acá damos una referencia
 * (los dígitos vencen escalonados ~2da-3ra semana del mes siguiente) SIN
 * inventar la fecha exacta — la UI indica "confirmá con el cronograma oficial".
 *
 * @returns null si el RUC no tiene un último dígito válido.
 */
export function ventanaVencimientoReferencial(ruc: string): { ultimoDigito: number; rango: string } | null {
  const digits = (ruc || "").replace(/\D/g, "");
  if (digits.length === 0) return null;
  const ultimoDigito = Number(digits[digits.length - 1]);
  // Orden referencial: los dígitos menores vencen primero (escalonado SUNAT).
  const rango = ultimoDigito <= 4 ? "2da semana del mes siguiente" : "3ra semana del mes siguiente";
  return { ultimoDigito, rango };
}
