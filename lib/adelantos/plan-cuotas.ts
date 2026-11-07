/**
 * Repartir un adelanto en cuotas pactadas.
 *
 * EL HUECO QUE TAPA. `AdelantoEntregaPactada` existía en la base, en el contrato
 * del endpoint y en el cálculo de cobranza —que mide el atraso contra la entrega
 * incumplida, no contra la edad del adelanto— pero la pantalla de alta nunca
 * mandaba el plan. Elegir «entregas pactadas» creaba un adelanto sin cuotas, así
 * que la cobranza caía siempre al plan B (antigüedad) y esas columnas quedaban
 * muertas.
 *
 * Y se pacta hablando: «me lo devolvés en tres veces». Tipear tres filas
 * idénticas a mano es la vía rápida a que nadie cargue el plan.
 */

/** Cada cuánto caen las cuotas cuando se reparte automáticamente. */
export const RITMOS = [
  { id: "semanal", label: "por semana", dias: 7 },
  { id: "quincenal", label: "cada 15 días", dias: 15 },
  { id: "mensual", label: "por mes", dias: 30 },
] as const;

export type Ritmo = (typeof RITMOS)[number]["id"];

export type CuotaCalculada = {
  descripcion: string;
  /** Con dos decimales, listo para un input de dinero. */
  valor: string;
  /** `YYYY-MM-DD` local, listo para un `<input type="date">`. */
  fecha: string;
};

/** `YYYY-MM-DD` en hora LOCAL: `toISOString()` a secas corre el día en Lima. */
export function diaLocal(d: Date): string {
  const c = new Date(d);
  c.setMinutes(c.getMinutes() - c.getTimezoneOffset());
  return c.toISOString().slice(0, 10);
}

/**
 * Reparte `total` en `n` cuotas iguales, con la ÚLTIMA absorbiendo el resto del
 * redondeo.
 *
 * S/ 100 en 3 da 33.33 + 33.33 + 33.34, no tres de 33.33 que dejan un céntimo
 * sin pactar: el plan tiene que sumar EXACTO lo adelantado, o el aviso de
 * «cuadra» miente y queda un saldo fantasma que nadie reclama.
 */
export function repartirCuotas(total: number, n: number, ritmo: Ritmo = "mensual", desde = new Date()): CuotaCalculada[] {
  if (!(total > 0) || !Number.isFinite(n) || n < 1) return [];
  const cuotas = Math.floor(n);
  const dias = RITMOS.find((r) => r.id === ritmo)?.dias ?? 30;
  const base = Math.floor((total * 100) / cuotas) / 100;
  return Array.from({ length: cuotas }, (_, i) => {
    const valor = i === cuotas - 1 ? Math.round((total - base * (cuotas - 1)) * 100) / 100 : base;
    const f = new Date(desde);
    f.setDate(f.getDate() + dias * (i + 1));
    return { descripcion: `Cuota ${i + 1} de ${cuotas}`, valor: valor.toFixed(2), fecha: diaLocal(f) };
  });
}

/**
 * Lo que falta (positivo) o sobra (negativo) para que el plan cierre.
 *
 * Se compara con tolerancia de medio céntimo: los valores vienen de inputs de
 * texto y `0.1 + 0.2 !== 0.3` haría que un plan exacto se muestre descuadrado.
 */
export function diferenciaDelPlan(montoAdelantado: number, valores: readonly (string | number)[]): number {
  const suma = valores.reduce<number>((s, v) => s + (Number(v) || 0), 0);
  return Math.round((montoAdelantado - suma) * 100) / 100;
}

/** Un plan cuadra cuando la diferencia no llega a un céntimo. */
export function planCuadra(montoAdelantado: number, valores: readonly (string | number)[]): boolean {
  return Math.abs(diferenciaDelPlan(montoAdelantado, valores)) < 0.01;
}
