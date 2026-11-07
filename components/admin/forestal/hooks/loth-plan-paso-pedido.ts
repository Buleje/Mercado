/**
 * El paso en que se abre el formulario del plan cuando lo abre un aviso
 * («Completar la ficha» → el paso del primer dato que falta).
 *
 * El formulario lo abre la vista con un booleano (`setEditandoPlan(true)`) y
 * no recibe props de quien lo pidió; en vez de pasar el paso por tres capas,
 * el aviso lo deja acá y el formulario lo lee UNA vez al montarse
 * (`pasoPedidoAlAbrir`) y lo suelta (`soltarPasoPedido`). Sin pedido, abre
 * en el primer paso como siempre.
 */
import type { PasoPlan } from "@/lib/forestal/loth-plan-pasos";

let pedido: PasoPlan | null = null;

export function pedirPasoAlAbrir(paso: PasoPlan | null): void {
  pedido = paso;
}

/** Lo lee el `useState` inicial del formulario: sin efectos, se puede llamar dos veces (StrictMode). */
export function pasoPedidoAlAbrir(): PasoPlan | null {
  return pedido;
}

/** Tras montarse el formulario: el próximo que se abra empieza de nuevo por el primero. */
export function soltarPasoPedido(): void {
  pedido = null;
}
