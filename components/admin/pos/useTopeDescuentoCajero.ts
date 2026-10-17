"use client";

import { useEffect, useState } from "react";
import { useMiRol } from "@/hooks/use-mi-rol";
import { pedirBilleteras } from "@/components/admin/pos/pago/useBilleteraNegocio";
import {
  rolDescuentaSinTope,
  TOPE_DESCUENTO_CAJERO_PCT,
  topeCajeroPct,
} from "@/lib/pos/descuento-cajero";

export interface TopeDescuentoCajero {
  /** Rol de la sesión (`null` mientras carga). */
  rol: ReturnType<typeof useMiRol>;
  /** % que el servidor le acepta a un cajero (Ajustes; 15 de fábrica y mientras carga). */
  pct: number;
  /** Admin o dueño: descuentan hasta el total. Rol todavía desconocido → `false` (la ruta decide). */
  sinTope: boolean;
}

/**
 * El tope de descuento del cajero tal como lo aplica `POST /api/sales`: el %
 * de Ajustes › Cobros › Caja leído con la MISMA regla (`topeCajeroPct`) y la
 * misma respuesta de GET /api/settings que ya pide el POS. Es vista previa:
 * si cambia entre la carga y el cobro, manda el servidor.
 */
export function useTopeDescuentoCajero(): TopeDescuentoCajero {
  const rol = useMiRol();
  const [pct, setPct] = useState(TOPE_DESCUENTO_CAJERO_PCT);
  useEffect(() => {
    let vivo = true;
    void pedirBilleteras().then((d) => {
      if (vivo) setPct(topeCajeroPct(d?.maxDiscountPercent));
    });
    return () => {
      vivo = false;
    };
  }, []);
  return { rol, pct, sinTope: rolDescuentaSinTope(rol) };
}
