"use client";

/**
 * El pie de la bolsa cuando el negocio cobra con el checkout de siempre
 * (`contenido.pedido = "checkout"`, ADR-511): el subtotal (vista previa) y
 * «Finalizar compra». Como en Buleje Beauty:
 *
 * · En el marco (catálogo, ficha…) el layout de la tienda ya trae el checkout:
 *   se cierra la bolsa y se abre (`openCheckout` del mismo carrito).
 * · En la portada no hay layout: `finalizarAqui()` lo baja y lo abre ahí mismo
 *   (`BolsaCheckoutPortada`). Si no hay portada lista, el catálogo con la bolsa
 *   abierta (`?carrito=abrir`), donde el checkout sí está.
 *
 * El envío y el total los pone el checkout (el servidor): acá sólo lo que suman
 * los productos.
 */
import { ArrowRight } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { finalizarAqui } from "./BolsaCheckoutPortada";
import { cerrarBolsa } from "./estado-bolsa";
import { solesPedido } from "./pedido-whatsapp";
import { BOTON } from "./ui";

/** «Finalizar compra»: el checkout en esta página o, si no puede, el catálogo con la bolsa abierta. */
export function useFinalizarCompra(catalogo: string, enPortada: boolean): () => void {
  const { openCheckout } = useCart();
  return () => {
    if (enPortada && !finalizarAqui()) {
      window.location.assign(`${catalogo}?carrito=abrir`);
      return;
    }
    cerrarBolsa();
    if (!enPortada) openCheckout();
  };
}

export function PieCheckout({ subtotal, catalogo, enPortada = false }: { subtotal: number; catalogo: string; enPortada?: boolean }) {
  const finalizar = useFinalizarCompra(catalogo, enPortada);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base font-semibold text-[var(--ti-texto-2)]">Subtotal</span>
        <span className="ti-nombre text-[1.75rem] leading-none tabular-nums text-[var(--ti-texto)]">{solesPedido(subtotal)}</span>
      </div>
      <p className="-mt-1 text-sm text-[var(--ti-texto-3)]">El envío y el total los ves al pagar.</p>
      <button type="button" onClick={finalizar} data-ti-finalizar className={`${BOTON} w-full`}>
        Finalizar compra <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={cerrarBolsa} className="ti-foco h-12 rounded-full text-base font-semibold text-[var(--ti-texto)] underline-offset-4 hover:underline">
        Seguir comprando
      </button>
    </div>
  );
}
