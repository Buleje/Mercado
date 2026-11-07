"use client";

/**
 * Carrusel de portada (los «anuncios» grandes). Todas las diapositivas ocupan
 * la MISMA celda de la grilla: la altura es la de la más alta y no salta al
 * cambiar. Rota cada 7 s; se detiene con el mouse o el foco encima, con el
 * botón de pausa y si la persona pidió menos movimiento. Las ocultas son
 * `inert` (ni el foco ni el lector entran ahí). En el celular se cambia
 * deslizando el dedo.
 *
 * La foto va en un ARCO (el espejo del salón). Sólo baja la foto de la
 * primera diapositiva; la siguiente se pide 3,5 s antes de mostrarse (o al
 * pasar el mouse / tocar un control) y las demás, cuando alguien va a ellas:
 * las tres apiladas con `opacity-0` se descargaban todas al entrar.
 *
 * Desde 1024 px un sello giratorio con el número acompaña al arco.
 *
 * Celular primero: foto baja (14 rem), título en dos líneas, la bajada en
 * dos y el botón principal dentro de la primera pantalla de 400 × 860.
 */
import { useCallback, useRef, useState, useEffect } from "react";
import { fotoResponsiva, precargarFoto, TAMANOS_PORTADA } from "./imagenes";
import { ChevronLeft, ChevronRight, Pause, Play } from "@buleje/design-system/icons";
import { ConAcento, Kicker } from "./ui";

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
/** Lo que pide 3,5 s antes de mostrar la siguiente: a los 7 s ya está. */
const PRECARGA_MS = 3500;
const ROTAR_MS = 7000;

function Enlace({ c, clase }: { c: { texto: string; href: string; externo: boolean }; clase: string }) {
  return (
    <a href={c.href} className={clase} {...(c.externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {c.texto}
    </a>
  );
}

/** Sello giratorio con el número de la diapositiva (decorativo; desde 1024 px). */
function Sello({ numero }: { numero: number }) {
  const arco = `bb-sello-arco-${numero}`;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -left-16 bottom-14 z-20 hidden h-32 w-32 items-center justify-center rounded-full bg-[var(--bb-papel)] text-[var(--bb-vino)] shadow-[var(--shadow-lg)] lg:flex"
    >
      <svg viewBox="0 0 120 120" className="bb-girar absolute inset-0 h-full w-full">
        <defs>
          <path id={arco} d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0" />
        </defs>
        <text fill="currentColor" fontSize="9.5" fontWeight="600">
          {/* textLength: el texto da la vuelta justa (más largo, se montaba sobre su propio inicio). */}
          <textPath href={`#${arco}`} textLength={278} lengthAdjust="spacing">SALÓN PROFESIONAL · COSMÉTICA CAPILAR ·</textPath>
        </text>
      </svg>
      <span className="bb-num text-[2.6rem] leading-none">{String(numero).padStart(2, "0")}</span>
    </span>
  );
}

export function Portada({ diapositivas }: { diapositivas: DiapositivaVista[] }) {
  const n = diapositivas.length;
  const [actual, setActual] = useState(0);
  const [pausa, setPausa] = useState(false);
  const [encima, setEncima] = useState(false);
  const [cargadas, setCargadas] = useState<ReadonlySet<number>>(() => new Set([0]));
  const toque = useRef<{ x: number; y: number } | null>(null);

  const cargar = useCallback((...is: number[]) => setCargadas((s) => (is.every((i) => s.has(i)) ? s : new Set([...s, ...is]))), []);
  const ir = useCallback(
    (i: number) => {
      cargar(i);
      setActual(i);
    },
    [cargar],
  );
  const vecinas = () => n > 1 && cargar((actual + 1) % n, (actual - 1 + n) % n);

  useEffect(() => {
    if (pausa || encima || n < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const siguiente = (actual + 1) % n;
    const pre = setTimeout(() => cargar(siguiente), PRECARGA_MS);
    const t = setTimeout(() => {
      cargar(siguiente);
      setActual(siguiente);
    }, ROTAR_MS);
    return () => {
      clearTimeout(pre);
      clearTimeout(t);
    };
  }, [pausa, encima, n, actual, cargar]);

  if (n === 0) return null;
  // La foto del LCP: el navegador la empieza a bajar desde el <head>, con los mismos `sizes` del <img>.
  precargarFoto(diapositivas[0].foto, TAMANOS_PORTADA);
  const oscura = diapositivas[actual].tono === "tinta";
  const control = `h-11 w-11 items-center justify-center rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
    oscura
      ? "border-[var(--bb-sobre-tinta)]/40 text-[var(--bb-sobre-tinta)] hover:bg-[var(--bb-sobre-tinta)]/10 focus-visible:outline-[var(--bb-sobre-tinta)]"
      : "border-[var(--text-primary)]/30 text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 focus-visible:outline-[var(--accent)]"
  }`;

  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Novedades y promociones"
      className="relative [--alto-foto:14rem] sm:[--alto-foto:22rem]"
      onMouseEnter={() => {
        setEncima(true);
        vecinas();
      }}
      onMouseLeave={() => setEncima(false)}
      onFocus={() => {
        setEncima(true);
        vecinas();
      }}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setEncima(false)}
      onTouchStart={(e) => {
        const t = e.touches[0];
        toque.current = { x: t.clientX, y: t.clientY };
        vecinas();
      }}
      onTouchEnd={(e) => {
        const a = toque.current;
        toque.current = null;
        if (!a || n < 2) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - a.x;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(t.clientY - a.y) * 1.5) ir(dx < 0 ? (actual + 1) % n : (actual - 1 + n) % n);
      }}
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
              className={`col-start-1 row-start-1 grid transition-opacity duration-700 ease-out md:min-h-[42rem] md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] ${FONDO[d.tono]} ${visible ? "z-10 opacity-100" : "z-0 opacity-0"}`}
            >
              <div className="px-4 pt-3 md:order-2 md:flex md:items-end md:justify-center md:px-10 md:pt-14 lg:pr-16 xl:pr-[max(4rem,calc((100vw_-_1280px)/2_+_2rem))]">
                <div className="relative md:w-full md:max-w-[25rem] lg:max-w-[27rem]">
                  {/* El filete del arco, corrido: el marco del espejo. */}
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute -inset-x-3 -top-3 bottom-0 hidden rounded-t-full border md:block ${t ? "border-[var(--bb-oro)]/50" : "border-[var(--bb-rosa)]/70"}`}
                  />
                  <div className="relative h-[var(--alto-foto)] overflow-hidden rounded-b-[1.75rem] rounded-t-[7rem] bg-[var(--bb-rubor-2)] md:aspect-[4/5] md:h-auto md:rounded-b-none md:rounded-t-full">
                    {cargadas.has(i) && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element -- ancho justo desde Unsplash (imagenes.ts); en dev next/image ignora el loader */}
                        <img
                          {...fotoResponsiva(d.foto, TAMANOS_PORTADA, { prioridad: i === 0 })}
                          alt={d.alt}
                          className="absolute inset-0 h-full w-full object-cover"
                          style={{ objectPosition: d.enfoque }}
                        />
                      </>
                    )}
                  </div>
                  {n > 1 && <Sello numero={i + 1} />}
                </div>
              </div>
              <div className="noise-texture-bg flex flex-col justify-center px-5 pb-7 pt-5 sm:px-10 md:order-1 md:pb-28 md:pt-14 lg:pl-16 xl:pl-[max(4rem,calc((100vw_-_1280px)/2_+_2rem))]">
                <Kicker claro={t} className="relative z-[1]">
                  {d.kicker}
                </Kicker>
                {/* Celular: alto reservado para 3 líneas. Mientras Fraunces llega, la serif de respaldo (más
                    ancha) parte el título en una línea más; al llegar, todo lo de abajo subía 40 px (CLS
                    0,085, medido 08-10). Desde 768 px el alto lo fija la diapositiva (`md:min-h-[42rem]`):
                    el texto se re-centra adentro sin mover lo que sigue (antes, CLS 0,10 a 1280). */}
                <h2
                  className={`bb-display relative z-[1] mt-2 flex min-h-[2.85em] flex-col justify-center text-[2.6rem] leading-[0.95] sm:mt-3 sm:text-6xl md:mt-5 md:min-h-0 md:text-6xl lg:text-[4.25rem] xl:text-[4.75rem] ${t ? "text-[var(--bb-sobre-tinta)]" : "text-[var(--text-primary)]"}`}
                >
                  <span>
                    <ConAcento texto={d.titulo} acento={t ? "text-[var(--bb-oro)]" : undefined} />
                  </span>
                </h2>
                <p
                  className={`relative z-[1] mt-3 line-clamp-2 max-w-md text-base leading-relaxed sm:line-clamp-none sm:text-lg md:mt-6 ${t ? "text-[var(--bb-sobre-tinta-2)]" : "text-[var(--text-secondary)]"}`}
                >
                  {d.texto}
                </p>
                <div className="relative z-[1] mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 md:mt-8">
                  <Enlace
                    c={d.cta}
                    clase={`inline-flex h-12 items-center rounded-full px-7 text-base font-semibold transition hover:-translate-y-0.5 hover:shadow-lg ${t ? "bg-[var(--bb-sobre-tinta)] text-[var(--bb-tinta)]" : "bg-[var(--text-primary)] text-[var(--surface-canvas)]"}`}
                  />
                  {d.cta2 && (
                    <Enlace
                      c={d.cta2}
                      clase={`inline-flex h-12 items-center border-b-2 text-base font-semibold transition hover:opacity-80 ${t ? "border-[var(--bb-sobre-tinta)] text-[var(--bb-sobre-tinta)]" : "border-[var(--text-primary)] text-[var(--text-primary)]"}`}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {n > 1 && (
        <div className="absolute right-8 top-[calc(var(--alto-foto)-2.75rem)] z-20 flex items-center gap-1 rounded-full bg-[var(--surface-canvas)]/85 px-1 backdrop-blur md:left-10 md:right-auto md:top-auto md:bottom-8 md:gap-2 md:bg-transparent md:px-0 md:backdrop-blur-none lg:left-16 xl:left-[max(4rem,calc((100vw_-_1280px)/2_+_2rem))]">
          <button type="button" className={`${control} hidden md:inline-flex`} aria-label="Anterior" onClick={() => ir((actual - 1 + n) % n)}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" className={`${control} hidden md:inline-flex`} aria-label="Siguiente" onClick={() => ir((actual + 1) % n)}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${control} inline-flex max-md:border-transparent max-md:text-[var(--text-primary)]`}
            aria-label={pausa ? "Seguir rotando" : "Pausar"}
            onClick={() => setPausa((p) => !p)}
          >
            {pausa ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          </button>
          <div className="flex items-center md:ml-2">
            {diapositivas.map((d, i) => (
              <button
                key={d.titulo}
                type="button"
                aria-label={`Ir a la diapositiva ${i + 1}`}
                aria-current={i === actual}
                onClick={() => ir(i)}
                className="group inline-flex h-11 w-7 items-center justify-center md:w-8"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${i === actual ? "w-6" : "w-1.5"} ${oscura ? "md:bg-[var(--bb-sobre-tinta)]" : ""} bg-[var(--text-primary)] ${i === actual ? "" : "opacity-40 group-hover:opacity-70"}`}
                />
              </button>
            ))}
          </div>
          <p aria-hidden="true" className={`bb-num ml-3 hidden text-xl tabular-nums md:block ${oscura ? "text-[var(--bb-sobre-tinta-2)]" : "text-[var(--text-secondary)]"}`}>
            {String(actual + 1).padStart(2, "0")} <span className="opacity-60">/ {String(n).padStart(2, "0")}</span>
          </p>
        </div>
      )}
    </section>
  );
}
