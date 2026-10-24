import { logger } from "@/lib/logger";
import { csrfHeaders } from "@/lib/csrf-client";
import type { LineaQuitada, MotivoQuitado } from "@/lib/pos/quitados";
import type { CartItem } from "@/components/admin/pos/pos-shared";

/**
 * Deja rastro de lo que se quita del ticket antes de cobrar (Turnos › Cajeros
 * lo suma por cajero). Fire-and-forget: el POS no espera ni falla por esto.
 */
export function registrarQuitado(motivo: MotivoQuitado, items: CartItem[]) {
  const lineas: LineaQuitada[] = items
    .filter((i) => i.quantity > 0)
    .map((i) => ({
      productoId: i.product.id,
      nombre: i.product.name,
      cantidad: i.quantity,
      precio: i.product.price,
      ...(i.discount ? { descuentoPct: i.discount } : {}),
    }));
  if (lineas.length === 0) return;
  fetch("/api/pos/quitado", {
    method: "POST",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ motivo, lineas }),
    keepalive: true,
  })
    .then((res) => {
      if (!res.ok) logger.warn("[pos] no se registró lo quitado del ticket", { status: res.status });
    })
    .catch((err) => logger.warn("[pos] no se registró lo quitado del ticket", { error: String(err) }));
}
