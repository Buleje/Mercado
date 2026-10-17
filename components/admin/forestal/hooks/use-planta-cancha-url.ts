"use client";

/**
 * use-planta-cancha-url — «Ver en el croquis» desde la ficha de una troza llega
 * con `&cancha=<zonaId>`. Se lee UNA vez al abrir Planta, se borra de la URL (no
 * queda pegado al navegar) y, cuando las zonas ya cargaron, se resalta y se
 * centra esa cancha. Si la zona no existe (borrada), se ignora sin ruido.
 */

import { useEffect, useState } from "react";
import { PARAM_CANCHA } from "@/lib/forestal/ctp-troza-url";

export function usePlantaCanchaUrl(opts: {
  /** Ya hay croquis dibujado y las zonas del plano cargaron. */
  listo: boolean;
  /** Zonas del plano activo. */
  zonaIds: readonly string[];
  /** El plano activo es el croquis. */
  enCroquis: boolean;
  alCroquis: () => void;
  alEncontrar: (zonaId: string) => void;
}): void {
  const { listo, zonaIds, enCroquis, alCroquis, alEncontrar } = opts;
  const [cancha, setCancha] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(PARAM_CANCHA),
  );

  /* Consumir el parámetro: queda en el estado, no en la URL. Con retraso: el
     router de Next reaplica la URL del `pushState` al asentarse y un
     `replaceState` inmediato se pierde (memoria de `use-vista-modulo`). */
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has(PARAM_CANCHA)) return;
    const t = setTimeout(() => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has(PARAM_CANCHA)) return;
      url.searchParams.delete(PARAM_CANCHA);
      window.history.replaceState(window.history.state, "", url.toString());
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!cancha) return;
    if (!enCroquis) { alCroquis(); return; }
    if (!listo || zonaIds.length === 0) return;
    if (zonaIds.includes(cancha)) alEncontrar(cancha);
    setCancha(null);
  }, [cancha, enCroquis, listo, zonaIds, alCroquis, alEncontrar]);
}
