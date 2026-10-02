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

export const KICKER = "text-sm font-semibold uppercase tracking-[0.22em] text-[var(--bb-vino)]";

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
  return (
    <div className={`mb-8 flex flex-col gap-4 sm:mb-10 ${centrado ? "items-center text-center" : "sm:flex-row sm:items-end sm:justify-between"}`}>
      <div className={centrado ? "max-w-2xl" : "max-w-3xl"}>
        <p className={KICKER}>{kicker}</p>
        <h2 id={id} className="bb-serif mt-2 text-4xl leading-[1.05] tracking-tight text-[var(--text-primary)] sm:text-5xl">
          {titulo}
        </h2>
        {texto && <p className="mt-3 text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">{texto}</p>}
      </div>
      {verTodo && (
        <a
          href={verTodo.href}
          className="group inline-flex h-11 shrink-0 items-center gap-2 self-start border-b-2 border-[var(--text-primary)] text-base font-semibold text-[var(--text-primary)] sm:self-auto"
        >
          {verTodo.texto ?? "Ver todo"}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

export function Seccion({ id, etiqueta, fondo, children }: { id?: string; etiqueta: string; fondo?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={etiqueta} className={`scroll-mt-24 py-14 sm:py-20 ${fondo ?? ""}`}>
      <div className={ANCHO}>{children}</div>
    </section>
  );
}
