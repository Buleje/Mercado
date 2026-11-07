import Link from "next/link";
import { CardTitle } from "@buleje/design-system";
import { ArrowRight, Package } from "@buleje/design-system/icons";
import { getProductCategoryIcon } from "@/components/marketplace/_category-icons";
import { familiaDe, familiaPorId } from "@/lib/marketplace/familias-categoria";
import { cn } from "@/lib/utils";

/**
 * EstanteRotulo — el cartel colgado de un pasillo del mercado (home «Dosel»).
 *
 *   · "celda" (md+): primera celda del carril, mismo alto que una tarjeta, con
 *     el tinte y el motivo de su familia, el glifo de 40 px, el nombre y
 *     «Ver los {n}». Lleva dos cordeles arriba: se lee como un letrero colgado.
 *   · "cabecera" (< md): fila de 48 px con tinte encima del carril.
 *
 * Todo el rótulo filtra el catálogo a esa categoría (`?cat=`, lo consume
 * CatalogUrlSync) y baja a #catalogo. Server-safe.
 */

interface Props {
  /** id de la categoría tal como la manda el API («bebidas», «pollo-brasa»). */
  id: string;
  etiqueta: string;
  total: number;
  /** Número de pasillo (1-3). */
  pasillo: number;
  variante: "celda" | "cabecera";
}

function iconoDe(id: string) {
  const porCategoria = getProductCategoryIcon(id);
  return porCategoria !== Package ? porCategoria : familiaPorId(familiaDe(id)).icon;
}

export default function EstanteRotulo({ id, etiqueta, total, pasillo, variante }: Props) {
  const Icon = iconoDe(id);
  const href = `/?cat=${encodeURIComponent(id.toLowerCase())}#catalogo`;
  const verLos = `Ver los ${total}`;

  if (variante === "cabecera") {
    return (
      <Link
        href={href}
        data-familia={familiaDe(id)}
        aria-label={`${etiqueta}: ver los ${total} productos`}
        className="relative mb-2 flex h-12 items-center gap-2.5 overflow-hidden rounded-xl bg-[var(--tinte-bg)] pl-2 pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <span aria-hidden className="patron-familia" />
        <span aria-hidden className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--tinte-blob)] text-[var(--tinte-ink)]">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <CardTitle as="h3" className="relative min-w-0 flex-1 truncate font-bold">
          {etiqueta}
        </CardTitle>
        <span className="relative inline-flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums text-[var(--tinte-ink)]">
          {verLos}
          <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      data-familia={familiaDe(id)}
      data-rotulo
      aria-label={`Pasillo ${pasillo}, ${etiqueta}: ver los ${total} productos`}
      className={cn(
        "group/rotulo relative flex h-full min-h-[14rem] flex-col justify-between overflow-hidden rounded-xl bg-[var(--tinte-bg)] p-4",
        "transition-transform duration-[var(--dur-fast)] hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
      )}
    >
      <span aria-hidden className="patron-familia" />
      {/* Cordeles: el letrero cuelga del techo del pasillo. */}
      <span aria-hidden className="absolute inset-x-0 top-0 flex justify-between px-7">
        <span className="h-3 w-0.5 rounded-b-full bg-[var(--tinte-ink)] opacity-30" />
        <span className="h-3 w-0.5 rounded-b-full bg-[var(--tinte-ink)] opacity-30" />
      </span>
      <div className="relative">
        <p className="text-xs font-semibold tabular-nums text-[var(--tinte-ink)]">Pasillo {pasillo}</p>
        <span aria-hidden className="mt-3 grid h-16 w-16 -rotate-6 place-items-center rounded-2xl bg-[var(--tinte-blob)] text-[var(--tinte-ink)] transition-transform duration-[var(--dur-base)] group-hover/rotulo:rotate-0 motion-reduce:transition-none">
          <Icon className="h-10 w-10" strokeWidth={1.5} />
        </span>
      </div>
      <div className="relative">
        <CardTitle as="h3" className="text-balance text-[length:var(--ts-lg)] font-extrabold leading-tight tracking-[-0.015em]">
          {etiqueta}
        </CardTitle>
        <span className="mt-1.5 inline-flex items-center gap-1 text-sm font-bold tabular-nums text-[var(--tinte-ink)]">
          {verLos}
          <ArrowRight
            className="h-4 w-4 transition-transform duration-[var(--dur-fast)] group-hover/rotulo:translate-x-0.5 motion-reduce:transition-none"
            strokeWidth={2.25}
            aria-hidden
          />
        </span>
      </div>
    </Link>
  );
}
