"use client";

/**
 * Pantalla completa del croquis. Abrirla empuja una entrada al historial: así
 * el «atrás» del celular la cierra en vez de sacar al usuario de la pantalla.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const MARCA = "croquisPantallaCompleta";

export function useCroquisPantallaCompleta() {
  const [abierta, setAbierta] = useState(false);
  const empujada = useRef(false);

  const abrir = useCallback(() => {
    // Se conserva el state de Next (`__NA`…): sin él su router no reconoce la entrada.
    if (!empujada.current) { window.history.pushState({ ...window.history.state, [MARCA]: 1 }, ""); empujada.current = true; }
    setAbierta(true);
  }, []);

  const cerrar = useCallback(() => {
    setAbierta(false);
    if (!empujada.current) return;
    empujada.current = false;
    if (window.history.state?.[MARCA]) window.history.back();
  }, []);

  const alternar = useCallback(() => { if (abierta) cerrar(); else abrir(); }, [abierta, abrir, cerrar]);

  useEffect(() => {
    if (!abierta) return;
    const alAtras = () => { empujada.current = false; setAbierta(false); };
    window.addEventListener("popstate", alAtras);
    return () => window.removeEventListener("popstate", alAtras);
  }, [abierta]);

  return { abierta, abrir, cerrar, alternar };
}
