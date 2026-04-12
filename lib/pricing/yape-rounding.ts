import "server-only";

/**
 * ROADMAP ITEM #74 — Pricing en soles con redondeo Yape-friendly
 *
 * En Perú la mayoría paga con Yape en montos redondos. Mostrar S/12.47
 * cuando el cliente va a transferir S/12.50 genera fricción cognitiva.
 * Este helper redondea precios a incrementos "Yape-friendly" (0.50 o 1.00)
 * y expone el descuento implícito si se aplica.
 */

export type RoundingMode = "up" | "down" | "nearest";
export type RoundingStep = 0.1 | 0.5 | 1.0;

export function roundYape(
  price: number,
  step: RoundingStep = 0.5,
  mode: RoundingMode = "nearest",
): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  const factor = 1 / step;
  let rounded: number;
  if (mode === "up") rounded = Math.ceil(price * factor) / factor;
  else if (mode === "down") rounded = Math.floor(price * factor) / factor;
  else rounded = Math.round(price * factor) / factor;
  return Math.round(rounded * 100) / 100;
}

export function formatSoles(value: number): string {
  return `S/${value.toFixed(2)}`;
}

export function yapeFriendlyTotal(items: { price: number; quantity: number }[]): {
  raw: number;
  rounded: number;
  delta: number;
} {
  const raw = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const rounded = roundYape(raw, 0.5, "nearest");
  return { raw, rounded, delta: rounded - raw };
}
