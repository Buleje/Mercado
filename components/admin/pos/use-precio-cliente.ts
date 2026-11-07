import { useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { PrecioDeCliente } from "@/lib/pos/precio-revendedora";

interface ItemDelCarrito {
  productId: number;
  quantity: number;
}

/** Si la vista previa no responde en este tiempo, el cobro sigue con el precio normal. */
const ESPERA_MAXIMA_MS = 6000;

/**
 * Vista previa del precio de la clienta elegida en el cobro (ADR-507 en la
 * caja): si es revendedora, su nivel y su total. Sólo MUESTRA: lo cobrado lo
 * vuelve a calcular `POST /api/sales`. Sin clienta o sin carrito no pregunta.
 */
export function usePrecioCliente(customerPhone: string, items: ItemDelCarrito[]) {
  const validos = items.filter((i) => Number.isInteger(i.productId) && i.productId > 0 && i.quantity > 0);
  // El cuerpo mismo es la firma: cambia de clienta o de carrito → otra consulta.
  const cuerpo =
    customerPhone.trim() && validos.length > 0
      ? JSON.stringify({ customerPhone: customerPhone.trim(), items: validos.map((i) => ({ productId: i.productId, quantity: i.quantity })) })
      : "";
  const [respuesta, setRespuesta] = useState<{ cuerpo: string; precio: PrecioDeCliente | null }>({ cuerpo: "", precio: null });

  useEffect(() => {
    if (!cuerpo) return;
    const ctrl = new AbortController();
    let vencida = false;
    const corte = setTimeout(() => {
      vencida = true;
      ctrl.abort();
    }, ESPERA_MAXIMA_MS);
    const espera = setTimeout(() => {
      fetch("/api/sales/precio-cliente", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: cuerpo,
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? (r.json() as Promise<PrecioDeCliente>) : null))
        // Sin respuesta (offline, 403, 503) = precio normal; el servidor decide igual al cobrar.
        .catch(() => (vencida || !ctrl.signal.aborted ? null : undefined))
        .then((precio) => {
          if (precio !== undefined) setRespuesta({ cuerpo, precio });
        })
        .finally(() => clearTimeout(corte));
    }, 250);
    return () => {
      clearTimeout(espera);
      clearTimeout(corte);
      ctrl.abort();
    };
  }, [cuerpo]);

  const lista = !cuerpo || respuesta.cuerpo === cuerpo;
  return {
    precioCliente: cuerpo && lista ? respuesta.precio : null,
    cargandoPrecio: !lista,
  };
}
