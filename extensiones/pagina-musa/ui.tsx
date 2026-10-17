/**
 * Piezas chicas que repiten todas las secciones: el ancho, los botones, el
 * kicker y los títulos (pautas en el LEEME: un estilo de botón, títulos por
 * tamaño y peso, sin cursivas ni color). Sin estado: sirven en servidor y en cliente.
 * Colores, letras y tiempos: los tokens de `tema.ts` (contrato §d).
 */
import type { ReactNode } from "react";
import { ArrowRight } from "@buleje/design-system/icons";

export const ANCHO = "mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8";

const MOVER =
  "transition-[transform,background-color,color,border-color] duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] active:scale-[.97] active:duration-[var(--mu-dur-micro)] mu-foco";

/** Botón principal: casi negro con letra blanca (17,4:1); en oscuro, al revés. Sin saltos al pasar: sólo cambia el tono. */
export const BOTON = `inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--mu-boton-fondo)] px-7 text-[length:var(--mu-t-boton)] font-semibold text-[var(--mu-boton-texto)] hover:bg-[var(--mu-boton-fondo-hover)] ${MOVER}`;

/** Botón secundario: filete fino de tinta que se rellena al pasar. */
export const BOTON_BORDE = `inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--rule-strong)] px-7 text-[length:var(--mu-t-boton)] font-semibold text-[var(--text-primary)] hover:bg-[var(--text-primary)] hover:text-[var(--surface-canvas)] ${MOVER}`;

/** WhatsApp (pedir, asesoría): el mismo botón principal (un solo estilo de botón en toda la tienda). */
export const BOTON_WHATSAPP = `inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--mu-whatsapp-fondo)] px-7 text-[length:var(--mu-t-boton)] font-semibold text-[var(--mu-whatsapp-texto)] hover:bg-[var(--mu-boton-fondo-hover)] ${MOVER}`;

export const KICKER = "mu-kicker text-[var(--text-tertiary)]";

/** Antetítulo: 14 px peso 500 en tipo oración, gris. `claro` = sobre la superficie de contraste. */
export function Kicker({ children, claro = false, className = "" }: { children: ReactNode; claro?: boolean; className?: string }) {
  return <p className={`mu-kicker ${claro ? "text-[var(--mu-sobre-cacao-2)]" : "text-[var(--text-tertiary)]"} ${className}`}>{children}</p>;
}

/**
 * Antes: la última palabra del título en cursiva y en el color de la marca.
 * Desde el rediseño minimalista (16-10) el título va entero, en la misma letra:
 * la jerarquía la dan el tamaño y el peso. `acento` se acepta y se ignora.
 */
export function ConAcento({ texto }: { texto: string; acento?: string | undefined }) {
  return <>{texto.trimEnd()}</>;
}

/**
 * La línea corta que acompaña a un título («¿dudas?», «sin complicarte»): antes
 * en script (Great Vibes); ahora la sans en 600, sin cursiva, del color del texto.
 */
export function Script({ children, claro = false, grande = false, className = "" }: { children: ReactNode; claro?: boolean; grande?: boolean; className?: string }) {
  return (
    <span
      className={`mu-script block ${grande ? "text-[length:var(--mu-t-script-xl)]" : "text-[length:var(--mu-t-script)]"} ${claro ? "text-[var(--mu-sobre-cacao)]" : "text-[var(--text-primary)]"} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Título de sección: kicker gris chico, el título en la sans 600 y, si viene, la
 * línea corta (`script`) seguida en gris. En el celular el «Ver todo» sube a la
 * fila del kicker (ahorra una fila por sección); desde 640 px va abajo a la derecha.
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
      className={`mu-subrayado mu-foco group inline-flex h-12 shrink-0 items-center gap-2 text-[length:var(--mu-t-boton)] font-semibold text-[var(--text-primary)] [--mu-subrayado-abajo:.45rem] ${
        centrado ? "mt-1" : "col-start-2 row-start-1 self-center justify-self-end sm:row-start-2 sm:self-end"
      }`}
    >
      <span className="sm:hidden">Ver todo</span>
      <span className="hidden sm:inline">{largo}</span>
      <ArrowRight className="h-4 w-4 transition-transform duration-[var(--mu-dur-corto)] group-hover:translate-x-1" aria-hidden="true" />
    </a>
  );
  const h2 = (
    <h2 id={id} className="mu-titulo text-[length:var(--mu-t-seccion)] text-[var(--text-primary)]">
      {titulo}
      {script && (
        <>
          {/* El espacio separa las palabras para el lector de pantalla. */}{" "}
          <span className="text-[var(--text-tertiary)]">{script}</span>
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

/**
 * Título de un bloque de la portada: la sans 600 en tipo oración. `acento` (las
 * últimas palabras, «Kits que ahorran») va seguido, en la misma letra y color:
 * nada de cursiva ni de color de marca. Sin kicker: una idea por bloque.
 * `accion` (un «Ver todo») va a la derecha desde 640 px y abajo en el celular.
 */
export function TituloBloque({ id, titulo, acento, texto, accion }: { id: string; titulo: string; acento?: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-2 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
      <div className="max-w-2xl">
        <h2 id={id} className="mu-titulo text-[length:var(--mu-t-bloque)] text-[var(--text-primary)]">
          {acento ? `${titulo} ${acento}` : titulo}
        </h2>
        {texto && <p className="mt-2 text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--text-secondary)]">{texto}</p>}
      </div>
      {accion}
    </div>
  );
}

/** «Ver todo →»: enlace de texto con filete que crece (48 px de alto para el dedo). */
export function EnlaceVer({ href, children, describe }: { href: string; children: ReactNode; describe?: string }) {
  return (
    <a
      href={href}
      {...(describe ? { "aria-describedby": describe } : {})}
      className="mu-subrayado mu-foco group inline-flex h-12 shrink-0 items-center gap-2 self-start text-[length:var(--mu-t-boton)] font-semibold text-[var(--text-primary)] [--mu-subrayado-abajo:.45rem] sm:self-end"
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-[var(--mu-dur-corto)] group-hover:translate-x-1" aria-hidden="true" />
    </a>
  );
}
