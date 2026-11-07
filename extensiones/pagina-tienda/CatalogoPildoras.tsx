"use client";

/**
 * Las píldoras del catálogo (Todo · cada categoría del negocio · Ofertas, con
 * cuántos hay) y la fila «Filtrando por» para quitar filtros de a uno
 * (ADR-511; las de Musa sin sus categorías fijas).
 *
 * Cada píldora es un ENLACE de verdad (`?categoria=pollo-brasa`): sirve sin
 * JavaScript, con clic central o «abrir en otra pestaña». Con un clic normal
 * no recarga: filtra al instante y la URL se actualiza sola (`CatalogoCliente`).
 * En el celular la fila se desliza; desde 640 px baja de línea.
 */
import type { MouseEvent } from "react";
import { X } from "@buleje/design-system/icons";
import type { Filtros } from "./filtros";

export type Cambiar = (cambio: Partial<Filtros>) => void;

const PILDORA =
  "ti-foco inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-[var(--ti-radio-pill)] border px-4 text-base font-semibold transition-[background-color,border-color,color,transform] duration-[var(--ti-dur-corto)] ease-[var(--ti-ease)] active:scale-[.97] sm:px-5";
const ACTIVA = "border-[var(--ti-acento)] bg-[var(--ti-acento)] text-[var(--ti-sobre-acento)]";
const INACTIVA = "border-[var(--ti-linea)] bg-[var(--ti-fondo)] text-[var(--ti-texto)] hover:border-[var(--ti-texto)]";

/** Clic normal → filtra sin recargar; con Ctrl/⌘/Shift o clic central, el navegador hace lo suyo. */
function alClic(hacer: () => void) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    hacer();
  };
}

function Pildora({ activa, href, alElegir, texto, n }: { activa: boolean; href: string; alElegir: () => void; texto: string; n: number }) {
  return (
    <a href={href} onClick={alClic(alElegir)} aria-current={activa || undefined} className={`${PILDORA} ${activa ? ACTIVA : INACTIVA}`}>
      {texto}
      <span
        className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-sm font-semibold tabular-nums ${
          activa ? "bg-[color-mix(in_srgb,var(--ti-sobre-acento)_18%,transparent)]" : "bg-[var(--ti-suave)] text-[var(--ti-texto-2)]"
        }`}
      >
        <span className="sr-only">(</span>
        {n}
        <span className="sr-only"> productos)</span>
      </span>
    </a>
  );
}

export function Pildoras({
  f,
  cambiar,
  categorias,
  nombres,
  cuentas,
  href,
}: {
  f: Filtros;
  cambiar: Cambiar;
  categorias: readonly string[];
  nombres: Readonly<Record<string, string>>;
  cuentas: { porCategoria: Map<string, number>; todos: number; ofertas: number };
  href: (cambio: Partial<Filtros>) => string;
}) {
  const visibles = categorias.filter((c) => (cuentas.porCategoria.get(c) ?? 0) > 0 || f.categoria === c);
  // Con una sola categoría y sin ofertas, las píldoras no ayudan a elegir: no se dibujan.
  if (visibles.length < 2 && cuentas.ofertas === 0 && !f.oferta && !f.categoria) return null;
  return (
    <nav aria-label="Categorías del catálogo" className="min-w-0">
      {/* `relative`: los `.sr-only` de las píldoras (absolutos) se medirían contra la página y no contra la fila (a 400 px la estiraban). */}
      <ul className="ti-sin-barra relative -mx-4 flex gap-2 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:flex-wrap sm:px-0">
        <li className="shrink-0">
          <Pildora activa={f.categoria === null && !f.oferta} href={href({ categoria: null, oferta: false })} alElegir={() => cambiar({ categoria: null, oferta: false })} texto="Todo" n={cuentas.todos} />
        </li>
        {visibles.map((c) => (
          <li key={c} className="shrink-0">
            <Pildora activa={f.categoria === c} href={href({ categoria: c })} alElegir={() => cambiar({ categoria: c })} texto={nombres[c] ?? c} n={cuentas.porCategoria.get(c) ?? 0} />
          </li>
        ))}
        {(cuentas.ofertas > 0 || f.oferta) && (
          <li className="shrink-0">
            <Pildora activa={f.oferta} href={href({ oferta: !f.oferta })} alElegir={() => cambiar({ oferta: !f.oferta })} texto="Ofertas" n={cuentas.ofertas} />
          </li>
        )}
      </ul>
    </nav>
  );
}

const LIMPIO: Partial<Filtros> = { q: "", categoria: null, oferta: false, marca: null, disponibles: false };

/** «Filtrando por: “pizza” ✕ · Marca ✕ · Limpiar todo». Nada puesto (o sólo la categoría, que ya se lee arriba) → no se dibuja. */
export function FiltrosPuestos({ f, cambiar, nombres }: { f: Filtros; cambiar: Cambiar; nombres: Readonly<Record<string, string>> }) {
  const chips: { texto: string; quitar: Partial<Filtros> }[] = [
    ...(f.q ? [{ texto: `“${f.q}”`, quitar: { q: "" } }] : []),
    ...(f.categoria ? [{ texto: nombres[f.categoria] ?? f.categoria, quitar: { categoria: null } }] : []),
    ...(f.oferta ? [{ texto: "Ofertas", quitar: { oferta: false } }] : []),
    ...(f.marca ? [{ texto: f.marca, quitar: { marca: null } }] : []),
    ...(f.disponibles ? [{ texto: "Disponibles", quitar: { disponibles: false } }] : []),
  ];
  if (chips.length === 0 || (chips.length === 1 && f.categoria)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-base text-[var(--ti-texto-2)]">Filtrando por</span>
      {chips.map((c) => (
        <button
          key={c.texto}
          type="button"
          onClick={() => cambiar(c.quitar)}
          aria-label={`Quitar el filtro ${c.texto}`}
          className="ti-foco inline-flex h-12 max-w-full items-center gap-2 rounded-[var(--ti-radio-pill)] bg-[var(--ti-suave)] pl-4 pr-3 text-base font-semibold text-[var(--ti-texto)] transition-colors duration-[var(--ti-dur-corto)] hover:bg-[var(--ti-linea-suave)]"
        >
          <span className="truncate">{c.texto}</span>
          <X className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => cambiar(LIMPIO)}
          className="ti-foco inline-flex h-12 items-center rounded-sm px-2 text-base font-semibold text-[var(--ti-texto)] underline decoration-[var(--ti-linea)] underline-offset-4 hover:decoration-[var(--ti-texto)]"
        >
          Limpiar todo
        </button>
      )}
    </div>
  );
}
