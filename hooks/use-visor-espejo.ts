"use client";

/**
 * «Ver el espejo de otra PC» (24-10) — pide el último cuadro que mandó otro
 * equipo del MISMO usuario (`GET /api/admin/camaras/espejo/cuadro`) cada
 * 1,5 s mientras llegan, cada 5 s cuando nadie comparte, y nada con la
 * pestaña escondida o mientras este equipo espeja (`activo = false`).
 *
 * La antigüedad se arma con la edad que mide el SERVIDOR + el reloj local
 * desde que llegó: el reloj de una tablet puede estar corrido minutos.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { logger } from "@/lib/logger";
import {
  HEADER_EDAD,
  INTERVALO_VISOR_MS,
  INTERVALO_VISOR_SIN_ESPEJO_MS,
  URL_CUADRO_ESPEJO,
  textoVisor,
  type TonoVisor,
} from "@/lib/camaras/espejo-remoto";

export interface VisorEspejo {
  /** `blob:` del último cuadro (se suelta solo). */
  url: string | null;
  /** La última consulta trajo cuadro. */
  hayCuadro: boolean;
  texto: string;
  tono: TonoVisor;
  error: string | null;
}

const alCambiarVisibilidad = (avisar: () => void) => {
  document.addEventListener("visibilitychange", avisar);
  return () => document.removeEventListener("visibilitychange", avisar);
};
const estaVisible = () => document.visibilityState === "visible";

function soltarUrl(ref: { current: string | null }) {
  if (ref.current) URL.revokeObjectURL(ref.current);
  ref.current = null;
}

export function useVisorEspejo(activo: boolean): VisorEspejo {
  const visible = useSyncExternalStore(alCambiarVisibilidad, estaVisible, () => false);
  const [url, setUrl] = useState<string | null>(null);
  const [tsLocal, setTsLocal] = useState<number | null>(null);
  const [hayCuadro, setHayCuadro] = useState(false);
  const [ahora, setAhora] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activo || !visible) return;
    const corte = new AbortController();
    let espera = 0;
    const pedir = async () => {
      let siguiente = INTERVALO_VISOR_SIN_ESPEJO_MS;
      try {
        const r = await fetch(URL_CUADRO_ESPEJO, { cache: "no-store", signal: corte.signal });
        const llegada = Date.now();
        if (r.status === 200) {
          const blob = await r.blob();
          const nueva = URL.createObjectURL(blob);
          soltarUrl(urlRef);
          urlRef.current = nueva;
          setUrl(nueva);
          setTsLocal(llegada - (Number(r.headers.get(HEADER_EDAD)) || 0));
          setHayCuadro(true);
          setError(null);
          siguiente = INTERVALO_VISOR_MS;
        } else if (r.status === 204) {
          /* Cortado o apagado: el último cuadro no se queda a la vista (puede ser un chat). */
          soltarUrl(urlRef);
          setUrl(null);
          setHayCuadro(false);
          setError(null);
        } else if (r.status === 401 || r.status === 403) {
          setHayCuadro(false);
          setError(
            r.status === 401
              ? "Tu sesión venció: vuelve a entrar."
              : "Tu usuario no puede ver el espejo.",
          );
          return;
        }
        setAhora(llegada);
      } catch (err) {
        if (corte.signal.aborted) return;
        logger.warn("[espejo-remoto] el visor no recibió el cuadro", { error: String(err) });
        setHayCuadro(false);
        setAhora(Date.now());
      }
      if (!corte.signal.aborted) espera = window.setTimeout(() => void pedir(), siguiente);
    };
    void pedir();
    /* «Hace 3 s» avanza aunque no llegue nada nuevo. */
    const reloj = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => {
      corte.abort();
      window.clearTimeout(espera);
      window.clearInterval(reloj);
      /* Pestaña escondida o visor apagado: el último cuadro (puede ser un chat) no
         queda en pantalla para cuando vuelvas (revisión de seguridad 24-10). */
      soltarUrl(urlRef);
      setUrl(null);
      setHayCuadro(false);
    };
  }, [activo, visible]);

  /* Al desmontar, soltar el último cuadro de la memoria. */
  useEffect(() => () => soltarUrl(urlRef), []);

  const { texto, tono } = textoVisor(tsLocal, hayCuadro, ahora || (tsLocal ?? 0));
  return {
    url: activo && hayCuadro ? url : null,
    hayCuadro: activo && hayCuadro,
    texto,
    tono,
    error,
  };
}
