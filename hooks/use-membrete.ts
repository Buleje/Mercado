"use client";

import { useEffect, useState } from "react";
import type { Membrete } from "@/lib/admin/membrete";
import { membreteReciente } from "@/lib/admin/membrete-cliente";

/**
 * El nombre, la dirección y el pie del negocio de la sesión, para lo que se le
 * manda o imprime a un cliente o proveedor (ticket, recibo, cotización, orden de
 * compra). `null` mientras llega: el texto sale sin marca, nunca con la de otro.
 */
export function useMembrete(): Membrete | null {
  const [membrete, setMembrete] = useState<Membrete | null>(null);
  useEffect(() => {
    let vivo = true;
    void membreteReciente().then((m) => { if (vivo) setMembrete(m); });
    return () => { vivo = false; };
  }, []);
  return membrete;
}
