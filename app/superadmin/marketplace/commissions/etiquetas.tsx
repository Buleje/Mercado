import { BadgeStatus, type BadgeStatusVariant } from "@buleje/design-system";

/** Tipos del libro de comisiones en palabras del negocio. */
export const TIPO_COMISION: Record<string, string> = {
  sale: "Venta de tienda",
  marketplace_fee: "Comisión del marketplace",
  refund_reversal: "Reversa por devolución",
};

const ESTADO: Record<string, { label: string; variant: BadgeStatusVariant }> = {
  pending: { label: "Por liquidar", variant: "warning" },
  settled: { label: "Liquidada", variant: "success" },
  refunded: { label: "Devuelta", variant: "neutral" },
};

export function EstadoComisionBadge({ estado }: { estado: string }) {
  const e = ESTADO[estado] ?? { label: estado, variant: "neutral" as const };
  return <BadgeStatus variant={e.variant} label={e.label} size="sm" />;
}
