import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { limaDateKey } from "@/lib/utils";
import type { GiftCardDetails } from "./GiftCardDetailsModal";
import { STATUS_LABELS } from "./FilaTarjeta";

/* Buscador y estado ya están arriba; en el encabezado: montos y fecha de vencimiento. */
export const COLUMNAS: readonly ColumnaFiltro<GiftCardDetails>[] = [
  { id: "monto", label: "Monto", tipo: "rango", numero: (c) => Number(c.amount), unidad: "S/", paso: 0.01 },
  { id: "saldo", label: "Saldo", tipo: "rango", numero: (c) => Number(c.balance), unidad: "S/", paso: 0.01 },
  { id: "vence", label: "Vence", tipo: "fecha", numero: (c) => limaDateKey(c.expiresAt) || null },
];
export const ORDEN: Record<string, AccesorOrden<GiftCardDetails>> = {
  codigo: { valor: (c) => c.code, texto: true },
  destinatario: { valor: (c) => c.recipientName, texto: true },
  monto: { valor: (c) => Number(c.amount) },
  saldo: { valor: (c) => Number(c.balance) },
  vence: { valor: (c) => c.expiresAt },
  estado: { valor: (c) => STATUS_LABELS[c.status], texto: true },
};
