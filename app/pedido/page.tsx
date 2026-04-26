import { redirect } from "next/navigation";

/**
 * /pedido (segmento padre) — sin UI propia.
 *
 * El segmento dinamico /pedido/[id] requiere un id concreto. Acceso a
 * /pedido sin id no tiene sentido funcional → redirect al historial del
 * cliente. Sin este page.tsx Next devolvia 404 en /pedido (el [id] solo
 * cubre rutas hijas, no el segmento padre).
 */
export default function PedidoIndexPage() {
  redirect("/cuenta/mis-pedidos");
}
