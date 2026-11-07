"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ANCHO_PX } from "@/lib/recibo/recibo-html";
import { FORMATOS_RECIBO, type FormatoRecibo } from "@/lib/recibo/modelo-recibo";

/**
 * La hoja del recibo tal como sale impresa, dentro de un iframe con su ancho
 * real (80 mm, 58 mm o A4) y achicada para que entre en el bloque. Es la
 * misma cadena HTML que se imprime: lo que se ve es lo que sale.
 */
export default function ReciboPapel({ html, formato, titulo }: { html: string; formato: FormatoRecibo; titulo: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const marco = useRef<HTMLIFrameElement>(null);
  const [ancho, setAncho] = useState(0);
  const [alto, setAlto] = useState(0);
  const natural = ANCHO_PX[formato];

  // El alto de la hoja (no el del marco): `documentElement` mide al menos el alto del iframe.
  const medirAlto = useCallback(() => {
    const hoja = marco.current?.contentDocument?.body?.firstElementChild as HTMLElement | null | undefined;
    if (hoja?.scrollHeight) setAlto(hoja.scrollHeight);
  }, []);

  // También al aparecer: plegado en el celular carga oculto y la hoja mide 0 (quedaba en 480 fijo).
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => { setAncho(el.clientWidth); medirAlto(); };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [medirAlto]);
  const alCargar = useCallback(() => {
    medirAlto();
    marco.current?.contentDocument?.fonts?.ready.then(medirAlto).catch((err: unknown) => console.warn("[recibo] fuentes", err));
  }, [medirAlto]);

  const escala = ancho > 0 ? Math.min(1, ancho / natural) : 1;
  const altoMarco = alto || 480;
  return (
    <div ref={caja} className="w-full">
      <div
        className="mx-auto overflow-hidden rounded-md shadow-[var(--shadow-md)] ring-1 ring-[var(--rule-base)]"
        style={{ width: Math.round(natural * escala), height: Math.round(altoMarco * escala) }}
      >
        <iframe
          ref={marco}
          title={titulo}
          srcDoc={html}
          sandbox="allow-same-origin"
          tabIndex={-1}
          onLoad={alCargar}
          className="block border-0"
          style={{ width: natural, height: altoMarco, transform: `scale(${escala})`, transformOrigin: "top left" }}
        />
      </div>
    </div>
  );
}

const SEGMENTO =
  "flex h-10 min-w-0 items-center justify-center rounded-lg px-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
const ELEGIDO = "bg-[var(--surface-raised)] text-[var(--accent-ink)] shadow-sm ring-1 ring-primary/40";
const LIBRE = "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]";

/** Ticket 80 mm · Ticket 58 mm · A4 en una fila segmentada (como el comprobante del cobro). */
export function SelectorFormatoRecibo({ valor, onChange }: { valor: FormatoRecibo; onChange: (f: FormatoRecibo) => void }) {
  return (
    <div role="group" aria-label="Formato del recibo" className="@container grid grid-cols-3 gap-1 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-1">
      {FORMATOS_RECIBO.map((f) => (
        <button
          key={f.id}
          type="button"
          aria-pressed={valor === f.id}
          aria-label={f.etiqueta}
          title={f.etiqueta}
          onClick={() => onChange(f.id)}
          className={cn(SEGMENTO, valor === f.id ? ELEGIDO : LIBRE)}
        >
          {/* Angosto (celular, la barra de reimprimir): «80 mm»; con espacio, «Ticket 80 mm». */}
          <span className="truncate @sm:hidden">{f.corto}</span>
          <span className="hidden truncate @sm:inline">{f.etiqueta}</span>
        </button>
      ))}
    </div>
  );
}
