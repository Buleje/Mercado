/**
 * Piezas chicas que repiten todas las secciones: el ancho, los botones, el
 * kicker, el título (versalitas + cursiva + línea script, como el catálogo)
 * y el destello ✦. Sin estado: sirven en servidor y en cliente.
 * Colores, letras y tiempos: los tokens de `tema.ts` (contrato §d).
 */
import type { ReactNode } from "react";
import { ArrowRight } from "@buleje/design-system/icons";

export const ANCHO = "mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8";

const MOVER =
  "transition-[transform,background-color,color,border-color] duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] active:scale-[.97] active:duration-[var(--mu-dur-micro)] mu-foco";

/** Botón principal: cacao con letra hueso; en oscuro, nude con letra negra (9,39:1). */
export const BOTON = `inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--mu-boton-fondo)] px-7 text-[length:var(--mu-t-boton)] font-semibold text-[var(--mu-boton-texto)] hover:-translate-y-0.5 hover:bg-[var(--mu-boton-fondo-hover)] ${MOVER}`;

/** Botón secundario: borde de tinta que se rellena al pasar. */
export const BOTON_BORDE = `inline-flex h-12 items-center justify-center gap-2 rounded-full border-[1.5px] border-[var(--text-primary)] px-7 text-[length:var(--mu-t-boton)] font-semibold text-[var(--text-primary)] hover:bg-[var(--text-primary)] hover:text-[var(--surface-canvas)] ${MOVER}`;

/** WhatsApp (pedir, asesoría): selva-tinta con letra blanca, 7,43:1 en los dos temas. */
export const BOTON_WHATSAPP = `inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--mu-whatsapp-fondo)] px-7 text-[length:var(--mu-t-boton)] font-semibold text-[var(--mu-whatsapp-texto)] hover:-translate-y-0.5 ${MOVER}`;

export const KICKER = "mu-kicker text-[var(--mu-acento-tinta)]";

/** Antetítulo: Poppins 600 de 12 px, mayúsculas espaciadas. `claro` = sobre cacao (en oro, 6,47:1). */
export function Kicker({ children, claro = false, className = "" }: { children: ReactNode; claro?: boolean; className?: string }) {
  return <p className={`mu-kicker ${claro ? "text-[var(--mu-oro)]" : "text-[var(--mu-acento-tinta)]"} ${className}`}>{children}</p>;
}

/**
 * El título partido en dos: la última palabra en la cursiva de Cormorant
 * (tal como está escrita, en el acento de la marca), como «para *ti*» del catálogo.
 * Sobre cacao el acento no se lee: pasar `acento` (p. ej. el oro).
 */
export function ConAcento({ texto, acento = "text-[var(--mu-acento-tinta)]" }: { texto: string; acento?: string | undefined }) {
  const limpio = texto.trimEnd();
  const corte = limpio.lastIndexOf(" ");
  if (corte < 0) return <>{limpio}</>;
  return (
    <>
      {limpio.slice(0, corte)} <span className={`mu-cursiva ${acento}`}>{limpio.slice(corte + 1)}</span>
    </>
  );
}

/**
 * La línea script (Great Vibes) que acompaña a un título: «y te llegue todo
 * junto», «para ti». ≥28 px, máximo 3 palabras y una por vista; nunca precio,
 * dato ni botón. `claro` = sobre cacao (oro); si no, rosa-tinta (6,05:1).
 */
export function Script({ children, claro = false, grande = false, className = "" }: { children: ReactNode; claro?: boolean; grande?: boolean; className?: string }) {
  return (
    <span
      className={`mu-script block ${grande ? "text-[length:var(--mu-t-script-xl)]" : "text-[length:var(--mu-t-script)]"} ${claro ? "text-[var(--mu-oro)]" : "text-[var(--mu-rosa-tinta)]"} ${className}`}
    >
      {children}
    </span>
  );
}

/** El destello ✦ del catálogo (decorativo). Color: el del texto (`currentColor`). */
export function Destello({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <path d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0Z" fill="currentColor" />
    </svg>
  );
}

/**
 * Título de sección: kicker, versalitas con la última palabra en cursiva y,
 * si viene, la línea script encimada (sube un poco sobre el título, como
 * «esta Navidad» en la tapa del catálogo). En el celular el «Ver todo» sube a
 * la fila del kicker (ahorra una fila por sección); desde 640 px va abajo a la derecha.
 */
export function TituloSeccion({
  id,
  kicker,
  titulo,
  texto,
  script,
  verTodo,
  centrado = false,
}: {
  id?: string;
  kicker: string;
  titulo: string;
  texto?: string;
  /** La línea script (≤3 palabras). */
  script?: string;
  verTodo?: { href: string; texto?: string };
  centrado?: boolean;
}) {
  const largo = verTodo?.texto ?? "Ver todo";
  const enlace = verTodo && (
    <a
      href={verTodo.href}
      {...(id ? { "aria-describedby": id } : {})}
      className={`mu-subrayado mu-foco group inline-flex h-11 shrink-0 items-center gap-2 text-[length:var(--mu-t-boton)] font-semibold text-[var(--text-primary)] [--mu-subrayado-abajo:.45rem] ${
        centrado ? "mt-1" : "col-start-2 row-start-1 self-center justify-self-end sm:row-start-2 sm:self-end"
      }`}
    >
      <span className="sm:hidden">Ver todo</span>
      <span className="hidden sm:inline">{largo}</span>
      <ArrowRight className="h-4 w-4 transition-transform duration-[var(--mu-dur-corto)] group-hover:translate-x-1" aria-hidden="true" />
    </a>
  );
  const h2 = (
    <h2 id={id} className="mu-display text-[length:var(--mu-t-seccion)] leading-[1] text-[var(--text-primary)]">
      <ConAcento texto={titulo} />
      {script && (
        <>
          {/* El espacio separa las palabras para el lector de pantalla. */}{" "}
          <Script className={`relative mt-[-0.12em] ${centrado ? "" : "pl-[0.6em] sm:pl-[1.4em]"}`}>{script}</Script>
        </>
      )}
    </h2>
  );
  if (centrado) {
    return (
      <div className="mb-7 flex flex-col items-center gap-3 text-center sm:mb-12">
        <Kicker>{kicker}</Kicker>
        <div className="max-w-3xl">{h2}</div>
        {texto && <p className="max-w-xl text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--text-secondary)]">{texto}</p>}
        {enlace}
      </div>
    );
  }
  return (
    <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 sm:mb-10 sm:gap-y-3">
      <Kicker className="col-start-1 row-start-1">{kicker}</Kicker>
      <div className="col-span-2 row-start-2 max-w-3xl sm:col-span-1">{h2}</div>
      {texto && (
        <p className="col-span-2 row-start-3 max-w-2xl text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--text-secondary)] sm:col-span-1">{texto}</p>
      )}
      {enlace}
    </div>
  );
}

export function Seccion({ id, etiqueta, fondo, children }: { id?: string; etiqueta: string; fondo?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={etiqueta} className={`scroll-mt-28 py-10 sm:py-20 ${fondo ?? ""}`}>
      <div className={ANCHO}>{children}</div>
    </section>
  );
}
