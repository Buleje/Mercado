"use client";

/**
 * useImagenPedido — genera la imagen del pedido ANTES del clic de «Enviar».
 *
 * Por qué: `navigator.share` y `window.open` sólo funcionan dentro del clic
 * (activación transitoria). Dibujar la imagen tarda 100-800 ms (fotos), así que
 * se hace en cuanto los datos están completos y se rehace si cambian (con una
 * pausa corta para no redibujar a cada tecla). El clic usa el `blob` listo:
 *
 *   const { blob } = useImagenPedido(listo ? datos : null);
 *   <button onClick={() => enviarPedidoWhatsapp({ blob, texto, numero })}>
 *
 * `datos = null` (falta el nombre, el celular… o el negocio apagó la imagen) →
 * no dibuja nada y `blob` queda en null (el envío cae a sólo texto).
 */

import { useEffect, useMemo, useState } from "react";
import type { DatosImagenPedido } from "@/lib/tienda-cliente/contrato";
import { logger } from "@/lib/logger";

export interface UsoImagenPedido {
  blob: Blob | null;
  generando: boolean;
  error: string | null;
}

const PAUSA_MS = 350;

/** Llave estable de los datos. No cuentan la fecha (la imagen dice «ahora») ni
 *  la hora de cada lectura del GPS: con el seguimiento en vivo cambia cada pocos
 *  segundos y redibujaría sin que cambie nada visible. */
function llaveDe(datos: DatosImagenPedido | null): string | null {
  if (!datos) return null;
  return JSON.stringify(datos, (k, v: unknown) => (k === "fecha" || k === "leidaEn" ? undefined : v));
}

export function useImagenPedido(datos: DatosImagenPedido | null): UsoImagenPedido {
  const llave = llaveDe(datos);
  // Se congela por llave: un objeto nuevo con lo mismo no redibuja.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const congelados = useMemo(() => datos, [llave]);
  const [estado, setEstado] = useState<UsoImagenPedido>({ blob: null, generando: false, error: null });

  useEffect(() => {
    if (!congelados) {
      setEstado({ blob: null, generando: false, error: null });
      return;
    }
    let vigente = true;
    setEstado((e) => ({ ...e, generando: true, error: null }));
    const reloj = setTimeout(() => {
      import("@/lib/tienda-cliente/imagen-pedido")
        .then(({ dibujarImagenPedido }) => dibujarImagenPedido(congelados))
        .then((blob) => {
          if (vigente) setEstado({ blob, generando: false, error: null });
        })
        .catch((err: unknown) => {
          logger.warn("[tienda-cliente] no se pudo dibujar la imagen del pedido", { error: String(err) });
          if (vigente) setEstado({ blob: null, generando: false, error: "No pudimos armar la imagen; va el texto." });
        });
    }, PAUSA_MS);
    return () => {
      vigente = false;
      clearTimeout(reloj);
    };
  }, [congelados]);

  return estado;
}
