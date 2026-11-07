"use client";

/**
 * Un QR como imagen (Modo TV, 2026-10-07): el del televisor (lleva al panel
 * con el código puesto) y los del modal «Ver en otra pantalla».
 *
 * La imagen trae su propio margen claro: un QR oscuro sobre fondo oscuro no lo
 * lee ningún celular, y así sirve igual en el tema claro, en el oscuro y en el TV.
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { logger } from "@/lib/logger";

interface Props {
  texto: string;
  /** Lado en px de la imagen generada (se dibuja con `className`). */
  lado?: number;
  alt: string;
  className?: string;
}

export default function QrImagen({ texto, lado = 240, alt, className }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    if (!texto) return;
    QRCode.toDataURL(texto, { width: lado, margin: 2, errorCorrectionLevel: "M" })
      .then((url) => vigente && setSrc(url))
      .catch((err: unknown) => logger.warn("[qr] no se pudo generar", { error: String(err) }));
    return () => {
      vigente = false;
    };
  }, [texto, lado]);

  if (!src) {
    return <div className={className} role="img" aria-label={`${alt} (generando)`} aria-busy="true" />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- data URL generada en el navegador
  return <img src={src} alt={alt} width={lado} height={lado} className={className} />;
}
