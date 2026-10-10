"use client";

/**
 * useTrasladoGuiaCtp — los dos puntos del traslado de la guía de SALIDA de la
 * planta (Libro CTP), desarmados en dirección + departamento + provincia +
 * distrito, como ya están en la guía del bosque (`use-traslado-guia-loth`).
 *
 *   · la partida se siembra de la Ficha del CTP (`ubicacionDePlanta`) y no se
 *     inventa: lo que la Ficha no trae queda vacío;
 *   · la llegada sigue al destinatario mientras esté vacía o diga lo que se
 *     sembró; escrita a mano, se respeta.
 *
 * `puntoPartida`/`puntoLlegada` (el texto que imprime la guía) se rearman con
 * `conPunto` en cada cambio: los dos dicen siempre lo mismo.
 */

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  componerPunto,
  conPunto,
  llegadaDelDestinatario,
  mismaUbicacion,
  puntoConAlgo,
  ubicacionDelPunto,
  type GtfDatos,
  type UbicacionTraslado,
} from "@/lib/forestal/ctp-gtf-datos";
import { ubicacionDePlanta, type FichaParaGuia } from "@/lib/forestal/gtf-autocompletar";

export function useTrasladoGuiaCtp(x: {
  datos: GtfDatos;
  setDatos: Dispatch<SetStateAction<GtfDatos>>;
  ficha: FichaParaGuia | null;
}) {
  const { datos, setDatos, ficha } = x;
  /** La llegada que salió del destinatario: mientras siga igual, sigue al destinatario. */
  const sembrada = useRef<UbicacionTraslado | null>(null);

  /* El estado más reciente, para decidir DENTRO del efecto y no dentro del
     updater: el updater corre dos veces en desarrollo (StrictMode) y una
     escritura a `sembrada` ahí adentro hacía fallar la segunda pasada. */
  const ultimo = useRef(datos);
  ultimo.current = datos;

  const claveDestino = JSON.stringify(llegadaDelDestinatario(datos));
  useEffect(() => {
    const dest = JSON.parse(claveDestino) as UbicacionTraslado;
    const tr = ultimo.current.traslado;
    const actual = ubicacionDelPunto(tr, "llegada");
    const hay = puntoConAlgo(tr, "llegada");
    /* Ya dice lo que el destinatario (o se montó con eso): desde ahora lo sigue. */
    if (hay && mismaUbicacion(actual, dest)) {
      sembrada.current = dest;
      return;
    }
    const siguiendo = !hay || (sembrada.current != null && mismaUbicacion(actual, sembrada.current));
    if (!siguiendo || !componerPunto(dest)) return;
    sembrada.current = dest;
    setDatos((p) => ({ ...p, traslado: conPunto(p.traslado, "llegada", dest) }));
  }, [claveDestino, setDatos]);

  const setPunto = useCallback(
    (cual: "partida" | "llegada", cambio: Partial<UbicacionTraslado>) => {
      /* Una guía anterior trae el punto sólo en texto: se parte de lo que se ve. */
      setDatos((p) => ({ ...p, traslado: conPunto(p.traslado, cual, { ...ubicacionDelPunto(p.traslado, cual), ...cambio }) }));
    },
    [setDatos],
  );
  const usarLlegadaDelDestinatario = useCallback(() => {
    const dest = llegadaDelDestinatario(ultimo.current);
    sembrada.current = dest;
    setDatos((p) => ({ ...p, traslado: conPunto(p.traslado, "llegada", dest) }));
  }, [setDatos]);
  const usarPartidaDeLaFicha = useCallback(() => {
    setDatos((p) => ({ ...p, traslado: conPunto(p.traslado, "partida", ubicacionDePlanta(ficha)) }));
  }, [setDatos, ficha]);

  const planta = ubicacionDePlanta(ficha);
  return { setPunto, usarLlegadaDelDestinatario, usarPartidaDeLaFicha, planta };
}
