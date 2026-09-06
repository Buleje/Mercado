"use client";

/**
 * TramiteArchivadorOffscreen — dibuja UN documento fuera de pantalla para
 * poder fotografiarlo (ADR-364 ronda 2). Mismo patrón que `CtpArchivadorAuto`
 * (`sandbox="allow-same-origin"`, tamaño real en vez de `display:none`, un
 * respiro tras el `onLoad` para que las fuentes asienten) pero de un solo
 * documento a demanda, no de una cola.
 */

import { useImperativeHandle, useRef, useState, type Ref } from "react";

const ANCHO = 854;
const ASENTAR_MS = 320;

export interface TramiteArchivadorHandle {
  /** Dibuja `html` fuera de pantalla y devuelve el `Document` ya asentado. */
  capturar(html: string): Promise<Document>;
}

export default function TramiteArchivadorOffscreen({ handleRef }: { handleRef: Ref<TramiteArchivadorHandle> }) {
  const marco = useRef<HTMLIFrameElement>(null);
  const listo = useRef<(() => void) | null>(null);
  /** El HTML ya dibujado y asentado — si se repite, no hace falta re-navegar. */
  const cargado = useRef<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);

  useImperativeHandle(handleRef, () => ({
    async capturar(nuevoHtml: string) {
      if (cargado.current !== nuevoHtml) {
        await new Promise<void>((resolver) => {
          listo.current = resolver;
          setHtml(nuevoHtml);
        });
      }
      const d = marco.current?.contentDocument;
      if (!d?.body) throw new Error("El documento no llegó a dibujarse.");
      return d;
    },
  }));

  if (!html) return null;

  return (
    <iframe
      ref={marco}
      title="Preparando el PDF del trámite"
      srcDoc={html}
      sandbox="allow-same-origin"
      aria-hidden
      tabIndex={-1}
      style={{ position: "fixed", left: -20000, top: 0, width: ANCHO, height: 1400, border: 0, opacity: 0 }}
      onLoad={() => {
        cargado.current = html;
        const avisar = listo.current;
        listo.current = null;
        if (avisar) setTimeout(avisar, ASENTAR_MS);
      }}
    />
  );
}
