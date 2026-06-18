"use client";

/**
 * JuntaQR — código QR de la junta para compartir EN PERSONA: el vecino lo
 * muestra en pantalla o lo imprime y lo pega en la puerta del edificio.
 *
 * El QR se genera en el SERVIDOR (`/api/juntas/[code]/qr`, SVG) y acá solo se
 * muestra con `<img>`. Así evitamos el `import("qrcode")` en el cliente, que no
 * resuelve bajo Turbopack. Negro/blanco fijos = requisito de escaneo (excepción
 * aceptada, igual que el verde de WhatsApp).
 */

import { useState } from "react";
import { Printer } from "@buleje/design-system/icons";

interface Props {
  /** Código de la junta — arma el src del QR del servidor. */
  code: string;
  /** Link legible que se muestra bajo el QR en el póster impreso. */
  url: string;
  /** Texto bajo el QR en el póster impreso. */
  posterTitle: string;
  posterSubtitle?: string;
}

export function JuntaQR({ code, url, posterTitle, posterSubtitle }: Props) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const qrSrc = `/api/juntas/${encodeURIComponent(code)}/qr`;

  const handlePrint = () => {
    // El póster vive en una ventana nueva (mismo origen): usa el src absoluto
    // para que el <img> del servidor cargue ahí también.
    const absoluteSrc = `${window.location.origin}${qrSrc}`;
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${posterTitle}</title>` +
        `<style>*{font-family:system-ui,sans-serif}body{margin:0;display:flex;` +
        `align-items:center;justify-content:center;min-height:100vh}` +
        `.p{text-align:center;border:6px solid #00A0A0;padding:48px 40px;max-width:520px}` +
        `.k{color:#00A0A0;font-size:14px;font-weight:800;letter-spacing:.14em;` +
        `text-transform:uppercase;margin:0}h1{font-size:34px;font-weight:900;margin:8px 0 4px}` +
        `p.s{font-size:18px;color:#444;margin:0 0 24px}img{width:280px;height:280px}` +
        `.u{margin-top:20px;font-size:15px;color:#666;word-break:break-all}</style></head><body>` +
        `<div class="p"><p class="k">La Junta del Barrio</p>` +
        `<h1>${posterTitle}</h1>` +
        (posterSubtitle ? `<p class="s">${posterSubtitle}</p>` : "") +
        `<img src="${absoluteSrc}" alt="QR de la junta" onload="window.focus();window.print()"/>` +
        `<p class="u">${url}</p></div></body></html>`,
    );
    win.document.close();
  };

  return (
    <div className="border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        Compártela en persona
      </p>
      <div className="mt-3 flex items-center gap-4">
        <div className="flex h-[100px] w-[100px] shrink-0 items-center justify-center border border-[var(--rule-base)] bg-white p-1.5">
          {/* QR siempre sobre blanco para que escanee bien */}
          {failed ? (
            <span className="px-1 text-center text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)]">
              No se pudo cargar el QR
            </span>
          ) : (
            // SVG diminuto del mismo origen; next/image no optimiza SVG.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrSrc}
              alt="Código QR de la junta"
              width={88}
              height={88}
              className={`h-full w-full object-contain transition-opacity ${
                ready ? "opacity-100" : "opacity-0"
              }`}
              onLoad={() => setReady(true)}
              onError={() => setFailed(true)}
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text-primary)]">
            Pégala en la puerta del edificio
          </p>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Tus vecinos escanean y se suman desde su celular.
          </p>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!ready}
            className="mt-2.5 inline-flex items-center gap-1.5 border-2 border-[var(--rule-base)] px-3 py-1.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] disabled:opacity-50"
          >
            <Printer className="h-4 w-4" strokeWidth={2} aria-hidden />
            Imprimir cartel
          </button>
        </div>
      </div>
    </div>
  );
}
