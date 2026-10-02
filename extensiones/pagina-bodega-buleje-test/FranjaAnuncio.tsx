"use client";

/**
 * Franja de anuncios de arriba. Desde 1024 px se ven todos juntos; más angosto
 * rotan cada 5 s con un botón de pausa (WCAG 2.2.2) y se quedan quietos
 * si la persona pidió menos movimiento.
 */
import { useEffect, useState } from "react";
import { Pause, Play, Sparkles } from "@buleje/design-system/icons";

export function FranjaAnuncio({ mensajes }: { mensajes: string[] }) {
  const [actual, setActual] = useState(0);
  const [pausa, setPausa] = useState(false);

  useEffect(() => {
    if (pausa || mensajes.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActual((i) => (i + 1) % mensajes.length), 5000);
    return () => clearInterval(t);
  }, [pausa, mensajes.length]);

  if (mensajes.length === 0) return null;

  return (
    <div className="bg-[var(--bb-tinta)] text-[var(--bb-sobre-tinta)]" aria-label="Anuncios de la tienda" role="region">
      <div className="mx-auto flex h-10 max-w-[1280px] items-center justify-center gap-3 px-4 text-sm font-medium tracking-wide sm:px-6 lg:px-8">
        <ul className="hidden items-center gap-6 lg:flex">
          {mensajes.map((m, i) => (
            <li key={m} className="flex items-center gap-6">
              {i > 0 && <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[var(--bb-oro)]" />}
              <span>{m}</span>
            </li>
          ))}
        </ul>
        <p className="flex min-w-0 items-center gap-2 lg:hidden">
          <Sparkles className="h-4 w-4 shrink-0 text-[var(--bb-oro)]" aria-hidden="true" />
          <span className="truncate">{mensajes[actual]}</span>
        </p>
        {mensajes.length > 1 && (
          <button
            type="button"
            onClick={() => setPausa((p) => !p)}
            aria-label={pausa ? "Seguir rotando los anuncios" : "Pausar los anuncios"}
            className="-mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--bb-sobre-tinta)] lg:hidden"
          >
            {pausa ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          </button>
        )}
      </div>
    </div>
  );
}
