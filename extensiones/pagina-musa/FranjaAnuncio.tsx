"use client";

/**
 * Franja de anuncios (contrato §e): cacao, 36 px, Poppins 500 de 12 px en
 * hueso, un mensaje a la vez entre dos destellos ✦ oro. Rotan cada 4 s con
 * un fundido vertical (el que sale sube, el que entra viene de abajo) y se
 * detienen con el puntero o el foco encima; el botón de pausa cumple WCAG
 * 2.2.2. Con «reducir movimiento» queda fijo el primero.
 *
 * Todos los mensajes ocupan la MISMA celda de la grilla: la franja mide lo
 * del más largo y no salta al rotar (en el celular el texto baja de línea en
 * vez de cortarse con «…»). Para que en el celular quepa en UNA línea
 * (36 px, como el esqueleto) ahí se van los destellos y el hueco de la
 * izquierda, y el espaciado de letras baja a .04em.
 */
import { useEffect, useState } from "react";
import { Pause, Play } from "@buleje/design-system/icons";
import { Destello } from "./ui";

export function FranjaAnuncio({ mensajes }: { mensajes: string[] }) {
  const [actual, setActual] = useState(0);
  const [pausa, setPausa] = useState(false);
  const [encima, setEncima] = useState(false);

  useEffect(() => {
    if (pausa || encima || mensajes.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActual((i) => (i + 1) % mensajes.length), 4000);
    return () => clearInterval(t);
  }, [pausa, encima, mensajes.length]);

  if (mensajes.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Anuncios de la tienda"
      onPointerEnter={() => setEncima(true)}
      onPointerLeave={() => setEncima(false)}
      onFocus={() => setEncima(true)}
      onBlur={() => setEncima(false)}
      className="bg-[var(--mu-cacao)] text-[var(--mu-sobre-cacao)]"
    >
      <div className="mx-auto flex min-h-9 max-w-[1280px] items-center justify-center gap-3 px-4 sm:px-6 lg:px-8">
        <span className="hidden w-9 shrink-0 sm:block" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
          <Destello className="hidden h-2.5 w-2.5 shrink-0 text-[var(--mu-oro)] sm:block" />
          <p className="grid min-w-0 overflow-hidden text-center text-xs font-medium leading-snug tracking-[0.04em] sm:tracking-[0.12em]">
            {mensajes.map((m, i) => {
              const lugar = i === actual ? "translate-y-0 opacity-100" : i === (actual - 1 + mensajes.length) % mensajes.length ? "-translate-y-full opacity-0" : "translate-y-full opacity-0";
              return (
                <span
                  key={m}
                  aria-hidden={i !== actual}
                  className={`col-start-1 row-start-1 self-center text-balance transition-[transform,opacity] duration-[var(--mu-dur-medio)] ease-[var(--mu-ease)] ${lugar}`}
                >
                  {m}
                </span>
              );
            })}
          </p>
          <Destello className="hidden h-2.5 w-2.5 shrink-0 text-[var(--mu-oro)] sm:block" />
        </div>
        {mensajes.length > 1 ? (
          <button
            type="button"
            onClick={() => setPausa((p) => !p)}
            aria-label={pausa ? "Seguir rotando los anuncios" : "Pausar los anuncios"}
            className="-mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--mu-sobre-cacao-2)] transition-colors hover:bg-[var(--mu-sobre-cacao)]/10 hover:text-[var(--mu-sobre-cacao)] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--mu-oro)]"
          >
            {pausa ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        ) : (
          <span className="w-9 shrink-0" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
