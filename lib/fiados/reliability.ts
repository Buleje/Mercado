/**
 * Score de confiabilidad de un cliente fiado (Mejora 11 de FiadosModule).
 *
 * Vive en `lib/` (y no adentro de FiadosModule.tsx, donde nació) para que el
 * port de cobranza (components/admin/fiados/cobranza/CobranzaView.tsx) lo
 * pueda importar sin crear un ciclo: FiadosModule carga CobranzaView con
 * `next/dynamic`, así que CobranzaView no puede importar de vuelta a
 * FiadosModule.
 */

export type FiadoParaScore = {
  status: string;
  fechaVence?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReliabilityScore = {
  score: number; // 1-5
  label: string;
  pagosATiempo: number;
  pagosTotal: number;
  diasPromedioPago: number;
  sufficientHistory: boolean;
};

export function computeReliabilityScore(fiados: readonly FiadoParaScore[]): ReliabilityScore {
  // Solo considerar fiados completados (PAGADO)
  const completados = fiados.filter((f) => f.status === "PAGADO");
  if (completados.length < 3) {
    return { score: 0, label: "Sin historial", pagosATiempo: 0, pagosTotal: 0, diasPromedioPago: 0, sufficientHistory: false };
  }

  let pagosATiempo = 0;
  let totalDiasPago = 0;

  for (const f of completados) {
    const createdAt = new Date(f.createdAt).getTime();
    const updatedAt = new Date(f.updatedAt).getTime(); // pagadoEn ~ updatedAt
    const diasPago = Math.max(0, Math.floor((updatedAt - createdAt) / (1000 * 60 * 60 * 24)));
    totalDiasPago += diasPago;

    if (f.fechaVence) {
      const vence = new Date(f.fechaVence).getTime();
      if (updatedAt <= vence) pagosATiempo++;
    } else {
      // Sin fecha de vencimiento, considerar "a tiempo" si pagó en <30 días
      if (diasPago < 30) pagosATiempo++;
    }
  }

  const pagosTotal = completados.length;
  const pctATiempo = pagosTotal > 0 ? (pagosATiempo / pagosTotal) * 100 : 0;
  const diasPromedioPago = pagosTotal > 0 ? totalDiasPago / pagosTotal : 0;

  let score: number;
  if (pctATiempo > 90 && diasPromedioPago < 7) score = 5;
  else if (pctATiempo > 75 && diasPromedioPago < 15) score = 4;
  else if (pctATiempo > 50 && diasPromedioPago < 30) score = 3;
  else if (pctATiempo > 25) score = 2;
  else score = 1;

  return { score, label: `${score}/5`, pagosATiempo, pagosTotal, diasPromedioPago, sufficientHistory: true };
}

/** 0-100, null si no hay historial suficiente — mismo criterio que `cumplimientoDe` de Adelantos. */
export function porcentajeATiempo(fiados: readonly FiadoParaScore[]): number | null {
  const s = computeReliabilityScore(fiados);
  if (!s.sufficientHistory || s.pagosTotal === 0) return null;
  return Math.round((s.pagosATiempo / s.pagosTotal) * 100);
}
