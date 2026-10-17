import { useEffect, useState } from "react";
import {
  redondearCentimos,
  type DescuentoAutomaticoVista,
} from "@/lib/pricing/total-pedido";

/**
 * useDescuentoAutomatico — pide al servidor el descuento automático que va a
 * restar `POST /api/orders` (primera compra, volumen, cliente frecuente) para
 * este teléfono y este carrito. Una sola regla: `GET /api/orders/cotizar` usa
 * la misma función que el POST, así la vista previa no inventa ni olvida
 * descuentos y el chequeo de total del servidor no rechaza al cliente.
 *
 * Falla en silencio (sin línea de descuento): si el servidor sí lo aplica,
 * el POST responde 422 con el total real y el checkout lo muestra.
 */
const ESPERA_MS = 300;

export function useDescuentoAutomatico(args: {
  /** Teléfono tal como irá en el pedido (`telefonoDelPedido`), o undefined. */
  telefono: string | undefined;
  subtotal: number;
  unidades: number;
  activo: boolean;
}): { descuento: DescuentoAutomaticoVista | null; cargando: boolean } {
  const subtotal = redondearCentimos(args.subtotal);
  const consultar = args.activo && subtotal > 0 && args.unidades > 0;
  const clave = consultar
    ? `${args.telefono ?? ""}|${subtotal}|${args.unidades}`
    : "";
  const [resuelto, setResuelto] = useState<{
    clave: string;
    descuento: DescuentoAutomaticoVista | null;
  }>({ clave: "", descuento: null });

  useEffect(() => {
    if (!clave) return;
    const ctrl = new AbortController();
    const [telefono, sub, unidades] = clave.split("|");
    const timer = setTimeout(async () => {
      let descuento: DescuentoAutomaticoVista | null = null;
      try {
        const qs = new URLSearchParams({ subtotal: sub, unidades });
        if (telefono) qs.set("telefono", telefono);
        const res = await fetch(`/api/orders/cotizar?${qs.toString()}`, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as {
            descuentoAutomatico?: DescuentoAutomaticoVista | null;
          };
          descuento = data.descuentoAutomatico ?? null;
        }
      } catch {
        if (ctrl.signal.aborted) return;
      }
      if (!ctrl.signal.aborted) setResuelto({ clave, descuento });
    }, ESPERA_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [clave]);

  if (!clave) return { descuento: null, cargando: false };
  // Mientras llega la cotización de la clave nueva se conserva la anterior
  // (evita que la línea parpadee al sumar una unidad).
  return { descuento: resuelto.descuento, cargando: resuelto.clave !== clave };
}
