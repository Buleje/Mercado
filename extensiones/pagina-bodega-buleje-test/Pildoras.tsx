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

const PILDORA =
  "inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full border-2 px-5 text-base font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const ACTIVA = "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-canvas)]";
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
    <a href={href} onClick={alClic(alElegir)} aria-current={activa || undefined} className={`${PILDORA} ${activa ? ACTIVA : `${INACTIVA} ${vino ? "text-[var(--bb-vino)]" : "text-[var(--text-primary)]"}`}`}>
      {texto}
      <span
        className={`inline-flex h-7 items-center rounded-full px-2.5 text-sm font-bold tabular-nums ${activa ? "bg-[var(--surface-canvas)]/15" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}
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
      <ul className="bb-sin-barra -mx-4 flex gap-2 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:flex-wrap sm:px-0">
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
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--bb-rubor)] pl-4 pr-3 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bb-rubor-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {c.texto}
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => cambiar({ q: "", categoria: null, oferta: false, marca: null, disponibles: false })}
          className="inline-flex h-11 items-center px-2 text-base font-semibold text-[var(--text-primary)] underline underline-offset-4 hover:text-[var(--bb-vino)]"
        >
          Limpiar todo
        </button>
      )}
    </div>
  );
}
