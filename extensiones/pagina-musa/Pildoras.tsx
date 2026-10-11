"use client";

/**
 * Las píldoras del catálogo (Todo · cada categoría · Ofertas, con cuántos hay)
 * y la fila de «filtrando por» con los filtros puestos para quitarlos de a uno.
 *
 * Cada píldora es un ENLACE de verdad (`?categoria=…`): sirve sin JavaScript,
 * con clic central o «abrir en otra pestaña». Con un clic normal no recarga:
 * filtra al instante y la URL se actualiza sola (`CatalogoCliente`).
 * En el celular la fila se desliza; desde 640 px baja de línea.
 */
import type { MouseEvent } from "react";
import { X } from "@buleje/design-system/icons";
import type { Filtros } from "./filtros";

export type Cambiar = (cambio: Partial<Filtros>) => void;

/** Píldora de categoría (contrato 10-10): la elegida en cacao (en oscuro, nude); el color cambia en 200 ms. */
const PILDORA =
  "inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-base font-semibold transition-[background-color,border-color,color,transform] duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mu-foco)] sm:px-5";
const ACTIVA = "border-[var(--mu-boton-fondo)] bg-[var(--mu-boton-fondo)] text-[var(--mu-boton-texto)]";
const INACTIVA = "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:-translate-y-0.5 hover:border-[var(--text-primary)]";

/** Clic normal → filtra sin recargar; con Ctrl/⌘/Shift o clic central, el navegador hace lo suyo. */
function alClic(hacer: () => void) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    hacer();
  };
}

function Pildora({ activa, href, alElegir, texto, n, vino = false }: { activa: boolean; href: string; alElegir: () => void; texto: string; n: number; vino?: boolean }) {
  return (
    <a href={href} onClick={alClic(alElegir)} aria-current={activa || undefined} className={`${PILDORA} ${activa ? ACTIVA : `${INACTIVA} ${vino ? "text-[var(--mu-acento-tinta)]" : "text-[var(--text-primary)]"}`}`}>
      {texto}
      <span
        className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-sm font-semibold tabular-nums ${activa ? "bg-[var(--mu-boton-texto)]/15" : "bg-[var(--mu-nude-claro)] text-[var(--text-secondary)]"}`}
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
  cuentas,
  href,
}: {
  f: Filtros;
  cambiar: Cambiar;
  categorias: readonly string[];
  cuentas: { porCategoria: Map<string, number>; todos: number; ofertas: number };
  href: (cambio: Partial<Filtros>) => string;
}) {
  const visibles = categorias.filter((c) => (cuentas.porCategoria.get(c) ?? 0) > 0 || f.categoria === c);
  return (
    <nav aria-label="Categorías del catálogo">
      {/* `relative`: los `.sr-only` de las píldoras (absolutos) se medían contra la página y no contra el carril: a 400 px la estiraban a 658. */}
      <ul className="mu-sin-barra relative -mx-4 flex gap-2 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:flex-wrap sm:px-0">
        <li className="shrink-0">
          <Pildora activa={f.categoria === null} href={href({ categoria: null })} alElegir={() => cambiar({ categoria: null })} texto="Todo" n={cuentas.todos} />
        </li>
        {visibles.map((c) => (
          <li key={c} className="shrink-0">
            <Pildora activa={f.categoria === c} href={href({ categoria: c })} alElegir={() => cambiar({ categoria: c })} texto={c} n={cuentas.porCategoria.get(c) ?? 0} />
          </li>
        ))}
        {(cuentas.ofertas > 0 || f.oferta) && (
          <li className="shrink-0">
            <Pildora activa={f.oferta} href={href({ oferta: !f.oferta })} alElegir={() => cambiar({ oferta: !f.oferta })} texto="Ofertas" n={cuentas.ofertas} vino />
          </li>
        )}
      </ul>
    </nav>
  );
}

/** «Filtrando por: “keratina” ✕ · Buleje Pro ✕ · Limpiar todo». Nada puesto → no se dibuja. */
export function FiltrosPuestos({ f, cambiar }: { f: Filtros; cambiar: Cambiar }) {
  const chips: { texto: string; quitar: Partial<Filtros> }[] = [
    ...(f.q ? [{ texto: `“${f.q}”`, quitar: { q: "" } }] : []),
    ...(f.categoria ? [{ texto: f.categoria, quitar: { categoria: null } }] : []),
    ...(f.oferta ? [{ texto: "Ofertas", quitar: { oferta: false } }] : []),
    ...(f.marca ? [{ texto: f.marca, quitar: { marca: null } }] : []),
    ...(f.disponibles ? [{ texto: "Disponibles", quitar: { disponibles: false } }] : []),
  ];
  // Sólo la categoría ya se lee en el título y en su píldora: la fila aparece cuando hay algo más que quitar.
  if (chips.length === 0 || (chips.length === 1 && f.categoria)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-base text-[var(--text-secondary)]">Filtrando por</span>
      {chips.map((c) => (
        <button
          key={c.texto}
          type="button"
          onClick={() => cambiar(c.quitar)}
          aria-label={`Quitar el filtro ${c.texto}`}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--mu-nude-claro)] pl-4 pr-3 text-base font-semibold text-[var(--text-primary)] transition-colors duration-[var(--mu-dur-corto)] hover:bg-[var(--mu-rosa-claro)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mu-foco)]"
        >
          {c.texto}
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => cambiar({ q: "", categoria: null, oferta: false, marca: null, disponibles: false })}
          className="inline-flex h-12 items-center px-2 text-base font-semibold text-[var(--text-primary)] underline decoration-[var(--mu-rosa)] decoration-2 underline-offset-4 hover:text-[var(--mu-acento-tinta)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mu-foco)]"
        >
          Limpiar todo
        </button>
      )}
    </div>
  );
}
