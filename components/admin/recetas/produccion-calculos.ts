import type { LoteProducido } from "./tipos";

/** «2026-10» del mes de `ahora` (hora local, como lo leía la pantalla). */
export const claveDeMes = (ahora: Date) => `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;

/** Lo producido en el mes de `ahora`: lotes, unidades y costo promedio por lote. */
export function resumenDelMes(lotes: readonly LoteProducido[], ahora = new Date()) {
  const mes = claveDeMes(ahora);
  const delMes = lotes.filter((l) => String(l.producidoEn ?? "").startsWith(mes));
  return {
    lotes: delMes.length,
    unidades: delMes.reduce((s, l) => s + l.cantidad, 0),
    costoPromedio: delMes.length > 0 ? delMes.reduce((s, l) => s + l.costoReal, 0) / delMes.length : 0,
  };
}

/** Lotes de las últimas 4 semanas (semana que empieza en domingo), de la más vieja a la actual. */
export function lotesPorSemana(lotes: readonly LoteProducido[], ahora = new Date()) {
  const filas: { semana: string; lotes: number; costo: number }[] = [];
  for (let w = 3; w >= 0; w--) {
    const inicio = new Date(ahora);
    inicio.setDate(inicio.getDate() - (w * 7 + inicio.getDay()));
    inicio.setHours(0, 0, 0, 0);
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 7);
    const delaSemana = lotes.filter((l) => {
      const d = new Date(l.producidoEn);
      return d >= inicio && d < fin;
    });
    filas.push({ semana: `Sem ${4 - w}`, lotes: delaSemana.length, costo: delaSemana.reduce((s, l) => s + l.costoReal, 0) });
  }
  return filas;
}

/** Las recetas más producidas (por unidades), con su nombre real. */
export function masProducidas(lotes: readonly LoteProducido[], tope = 5) {
  const porReceta = new Map<string, { nombre: string; unidades: number }>();
  for (const l of lotes) {
    const prev = porReceta.get(l.recetaId) ?? { nombre: l.recetaNombre ?? l.recetaId, unidades: 0 };
    prev.unidades += Number(l.cantidad) || 0;
    porReceta.set(l.recetaId, prev);
  }
  return [...porReceta.values()].sort((a, b) => b.unidades - a.unidades).slice(0, tope);
}
