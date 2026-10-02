"use client";

/**
 * Carrusel de portada (los «anuncios» grandes). Todas las diapositivas ocupan
 * la MISMA celda de la grilla: la altura es la de la más alta y no salta al
 * cambiar. Rota cada 7 s; se detiene con el mouse o el foco encima, con el
 * botón de pausa y si la persona pidió menos movimiento. Las ocultas son
 * `inert` (ni el foco ni el lector entran ahí).
 */
import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Pause, Play } from "@buleje/design-system/icons";

export interface DiapositivaVista {
  kicker: string;
  titulo: string;
  texto: string;
  cta: { texto: string; href: string; externo: boolean };
  cta2?: { texto: string; href: string; externo: boolean };
  foto: string;
  alt: string;
  enfoque: string;
  tono: "rubor" | "salvia" | "tinta";
}

const FONDO = { rubor: "bg-[var(--bb-rubor)]", salvia: "bg-[var(--bb-salvia)]", tinta: "bg-[var(--bb-tinta)]" } as const;

function Enlace({ c, clase }: { c: { texto: string; href: string; externo: boolean }; clase: string }) {
  return (
    <a href={c.href} className={clase} {...(c.externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {c.texto}
    </a>
  );
}

export function Portada({ diapositivas }: { diapositivas: DiapositivaVista[] }) {
  const n = diapositivas.length;
  const [actual, setActual] = useState(0);
  const [pausa, setPausa] = useState(false);
  const [encima, setEncima] = useState(false);

  useEffect(() => {
    if (pausa || encima || n < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActual((i) => (i + 1) % n), 7000);
    return () => clearInterval(t);
  }, [pausa, encima, n]);

  if (n === 0) return null;
  const oscura = diapositivas[actual].tono === "tinta";
  const control = `inline-flex h-11 w-11 items-center justify-center rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
    oscura
      ? "border-[var(--bb-sobre-tinta)]/40 text-[var(--bb-sobre-tinta)] hover:bg-[var(--bb-sobre-tinta)]/10 focus-visible:outline-[var(--bb-sobre-tinta)]"
      : "border-[var(--text-primary)]/30 text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 focus-visible:outline-[var(--accent)]"
  }`;

  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Novedades y promociones"
      className="relative"
      onMouseEnter={() => setEncima(true)}
      onMouseLeave={() => setEncima(false)}
      onFocus={() => setEncima(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setEncima(false)}
    >
      <div className="grid">
        {diapositivas.map((d, i) => {
          const visible = i === actual;
          const t = d.tono === "tinta";
          return (
            <div
              key={d.titulo}
              role="group"
              aria-roledescription="diapositiva"
              aria-label={`${i + 1} de ${n}: ${d.titulo}`}
              aria-hidden={!visible}
              inert={!visible}
              className={`col-start-1 row-start-1 grid transition-opacity duration-700 ease-out md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] ${visible ? "z-10 opacity-100" : "z-0 opacity-0"}`}
            >
              <div className="relative aspect-[5/4] sm:aspect-[16/9] md:order-2 md:aspect-auto md:min-h-[32rem] lg:min-h-[34rem]">
                <Image
                  src={d.foto}
                  alt={d.alt}
                  fill
                  priority={i === 0}
                  sizes="(min-width: 768px) 52vw, 100vw"
                  className="object-cover"
                  style={{ objectPosition: d.enfoque }}
                />
              </div>
              <div className={`flex flex-col justify-center px-5 pb-24 pt-8 sm:px-10 md:order-1 md:pb-24 md:pt-12 lg:px-16 lg:py-16 xl:pl-[max(4rem,calc((100vw_-_1280px)/2_+_2rem))] ${FONDO[d.tono]}`}>
                <p className={`text-sm font-semibold uppercase tracking-[0.22em] ${t ? "text-[var(--bb-oro)]" : "text-[var(--bb-vino)]"}`}>{d.kicker}</p>
                <h2 className={`bb-serif mt-3 text-[2.6rem] italic leading-[1.02] tracking-tight sm:text-6xl md:text-5xl lg:text-6xl xl:text-7xl ${t ? "text-[var(--bb-sobre-tinta)]" : "text-[var(--text-primary)]"}`}>
                  {d.titulo}
                </h2>
                <p className={`mt-4 max-w-md text-base leading-relaxed sm:text-lg ${t ? "text-[var(--bb-sobre-tinta-2)]" : "text-[var(--text-secondary)]"}`}>{d.texto}</p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Enlace
                    c={d.cta}
                    clase={`inline-flex h-12 items-center rounded-full px-7 text-base font-semibold transition hover:-translate-y-0.5 hover:shadow-lg ${t ? "bg-[var(--bb-sobre-tinta)] text-[var(--bb-tinta)]" : "bg-[var(--text-primary)] text-[var(--surface-canvas)]"}`}
                  />
                  {d.cta2 && (
                    <Enlace
                      c={d.cta2}
                      clase={`inline-flex h-12 items-center rounded-full border-2 px-6 text-base font-semibold transition ${t ? "border-[var(--bb-sobre-tinta)] text-[var(--bb-sobre-tinta)] hover:bg-[var(--bb-sobre-tinta)] hover:text-[var(--bb-tinta)]" : "border-[var(--text-primary)] text-[var(--text-primary)] hover:bg-[var(--text-primary)] hover:text-[var(--surface-canvas)]"}`}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {n > 1 && (
        <div className="absolute bottom-6 left-5 z-20 flex items-center gap-2 sm:left-10 lg:left-16 xl:left-[max(4rem,calc((100vw_-_1280px)/2_+_2rem))]">
          <button type="button" className={control} aria-label="Anterior" onClick={() => setActual((i) => (i - 1 + n) % n)}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" className={control} aria-label="Siguiente" onClick={() => setActual((i) => (i + 1) % n)}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" className={control} aria-label={pausa ? "Seguir rotando" : "Pausar"} onClick={() => setPausa((p) => !p)}>
            {pausa ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          </button>
          <div className="ml-2 flex items-center">
            {diapositivas.map((d, i) => (
              <button
                key={d.titulo}
                type="button"
                aria-label={`Ir a la diapositiva ${i + 1}`}
                aria-current={i === actual}
                onClick={() => setActual(i)}
                className="group inline-flex h-11 w-8 items-center justify-center"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${i === actual ? "w-6" : "w-1.5"} ${oscura ? "bg-[var(--bb-sobre-tinta)]" : "bg-[var(--text-primary)]"} ${i === actual ? "" : "opacity-40 group-hover:opacity-70"}`}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
