"use client";

/**
 * usePestanaInterna — la pestaña interna (`?sub=`) de una vista de un libro
 * forestal, con los dos caminos por los que se llega a ella (plan «panel
 * unificado», ola 2):
 *
 *   · por URL: `?sub=` manda; si no está, la que pide una URL vieja
 *     (`?vista=reportes` → Tablero › Producción, ver `forzada`); si no, la
 *     memoria del navegador; si no, la primera;
 *   · desde el propio libro: un botón que dice `irA("rentabilidad")` estando
 *     YA en el Tablero no remonta la vista, así que el libro deja un `pedido`
 *     con contador y la pestaña lo aplica (repetir el mismo salto vuelve a
 *     aplicarse).
 */

import { useEffect, useRef } from "react";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";

export function usePestanaInterna<T extends string>({
  moduleId,
  validas,
  porDefecto,
  forzada,
  pedido,
}: {
  moduleId: string;
  validas: readonly T[];
  porDefecto: T;
  forzada?: string;
  pedido?: { sub: string; n: number } | null;
}) {
  const { vista: sub, irA } = useSubvistaModulo<T>(moduleId, validas, porDefecto, forzada);

  const aplicado = useRef(pedido?.n ?? 0);
  useEffect(() => {
    if (!pedido || pedido.n === aplicado.current) return;
    aplicado.current = pedido.n;
    irA(pedido.sub);
  }, [pedido, irA]);

  return { sub, irA };
}
