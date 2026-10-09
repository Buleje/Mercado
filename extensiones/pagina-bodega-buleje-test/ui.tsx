/**
 * Piezas chicas que repiten todas las secciones: el ancho, el título con su
 * kicker y el botón principal. Sin estado: sirven en servidor y en cliente.
 */
import type { ReactNode } from "react";
import { ArrowRight } from "@buleje/design-system/icons";

export const ANCHO = "mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8";

/** Botón principal: tinta sobre papel (se invierte solo en oscuro). */
export const BOTON =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--text-primary)] px-7 text-base font-semibold text-[var(--surface-canvas)] transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

/** Botón secundario: borde de tinta. */
export const BOTON_BORDE =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full border-2 border-[var(--text-primary)] px-7 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--text-primary)] hover:text-[var(--surface-canvas)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export const KICKER = "text-sm font-semibold uppercase tracking-[var(--ls-wider)] text-[var(--bb-vino)]";

/** El kicker con su filete: la marca editorial de cada sección. */
export function Kicker({ children, claro = false, className = "" }: { children: ReactNode; claro?: boolean; className?: string }) {
  return (
    <p className={`flex items-center gap-3 text-sm font-semibold uppercase tracking-[var(--ls-wider)] ${claro ? "text-[var(--bb-oro)]" : "text-[var(--bb-vino)]"} ${className}`}>
      <span aria-hidden="true" className="h-px w-7 shrink-0 bg-current opacity-70" />
      {children}
    </p>
  );
}

/**
 * El título partido en dos: la última palabra va en el vino de la marca
 * (el «acento» editorial). Sin cursiva: Fraunces se carga sólo recta.
 * Sobre la tinta (fondos oscuros) el vino no se lee: pasar `acento` (el oro).
 */
export function ConAcento({ texto, acento = "text-[var(--bb-vino)]" }: { texto: string; acento?: string | undefined }) {
  const limpio = texto.trimEnd();
  const corte = limpio.lastIndexOf(" ");
  if (corte < 0) return <>{limpio}</>;
  return (
    <>
      {limpio.slice(0, corte)} <span className={acento}>{limpio.slice(corte + 1)}</span>
    </>
  );
}

/**
 * Título de sección. En el celular el «Ver todo» sube a la fila del kicker
 * (ahorra una fila por sección); desde 640 px va abajo a la derecha.
 */
export function TituloSeccion({
  id,
  kicker,
  titulo,
  texto,
  verTodo,
  centrado = false,
}: {
  id?: string;
  kicker: string;
  titulo: string;
  texto?: string;
  verTodo?: { href: string; texto?: string };
  centrado?: boolean;
}) {
  const largo = verTodo?.texto ?? "Ver todo";
  const enlace = verTodo && (
    <a
      href={verTodo.href}
      {...(id ? { "aria-describedby": id } : {})}
      className={`group inline-flex h-11 shrink-0 items-center gap-2 border-b-2 border-[var(--text-primary)] text-base font-semibold text-[var(--text-primary)] ${
        centrado ? "mt-1" : "col-start-2 row-start-1 self-center justify-self-end sm:row-start-2 sm:self-end"
      }`}
    >
      <span className="sm:hidden">Ver todo</span>
      <span className="hidden sm:inline">{largo}</span>
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
    </a>
  );
  const h2 = (
    <h2 id={id} className="bb-display text-[2.25rem] leading-[1] text-[var(--text-primary)] sm:text-6xl">
      <ConAcento texto={titulo} />
    </h2>
  );
  if (centrado) {
    return (
      <div className="mb-7 flex flex-col items-center gap-3 text-center sm:mb-12">
        <Kicker>{kicker}</Kicker>
        <div className="max-w-2xl">{h2}</div>
        {texto && <p className="max-w-xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">{texto}</p>}
        {enlace}
      </div>
    );
  }
  return (
    <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 sm:mb-10 sm:gap-y-3">
      <Kicker className="col-start-1 row-start-1">{kicker}</Kicker>
      <div className="col-span-2 row-start-2 max-w-3xl sm:col-span-1">{h2}</div>
      {texto && <p className="col-span-2 row-start-3 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:col-span-1 sm:text-lg">{texto}</p>}
      {enlace}
    </div>
  );
}

export function Seccion({ id, etiqueta, fondo, children }: { id?: string; etiqueta: string; fondo?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={etiqueta} className={`scroll-mt-24 py-9 sm:py-20 ${fondo ?? ""}`}>
      <div className={ANCHO}>{children}</div>
    </section>
  );
}
