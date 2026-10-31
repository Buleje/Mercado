import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "@buleje/design-system/icons";
import { getProductCategoryIcon } from "@/components/marketplace/_category-icons";
import { familiaPorId, type FamiliaId } from "@/lib/marketplace/familias-categoria";

/**
 * Celdas del bento «¿Qué se te antoja?» (server-safe). El color sale de
 * `[data-familia]` (app/globals.css): cada celda lee `--tinte-bg/-blob/-ink`
 * y pone su motivo con `.patron-familia`. Sin hex.
 */

export interface TileCategoria {
  id: string;
  label: string;
  familia: FamiliaId;
  /** No entra en el bloque de md (6 cols): `hidden lg:flex`. */
  soloLg: boolean;
}

/** Blob orgánico (no un círculo perfecto): mismo trazo en todas las celdas. */
const BLOB = "rounded-[46%_54%_42%_58%/52%_44%_56%_48%]";

const ENFOQUE =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]";

const ELEVAR =
  "transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-editorial)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] motion-reduce:hover:translate-y-0";

export function CeldaGrande({
  familia,
  titulo,
  bajada,
  href,
  imagen,
}: {
  familia: FamiliaId;
  titulo: string;
  bajada: string;
  href: string;
  imagen: string | null;
}) {
  const Glifo = familiaPorId(familia).icon;
  return (
    <Link
      href={href}
      data-familia={familia}
      className={`group relative isolate flex w-full flex-col overflow-clip rounded-[var(--radius-xl)] bg-[var(--tinte-bg)] p-4 ${ELEVAR} ${ENFOQUE}`}
    >
      <span className="patron-familia rounded-[inherit]" aria-hidden />
      <span className="relative text-xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">
        {titulo}
      </span>
      <span className="relative mt-0.5 line-clamp-1 text-sm text-[var(--text-secondary)]">
        {bajada}
      </span>
      <span
        aria-hidden
        className="relative mt-auto grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-raised)] text-[var(--tinte-ink)] shadow-[var(--shadow-sm)] transition-transform duration-[var(--dur-fast)] group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
      >
        <ArrowRight className="h-5 w-5" strokeWidth={2.25} />
      </span>
      {/* Bodegón: charco de color + un plato claro con la ilustración. Las
          ilustraciones del superadmin son webp SIN alfa (fondo ~blanco): con
          multiply sobre `--plato` el fondo desaparece, y `--plato` queda claro
          también en oscuro (§7 del contrato), así que no se oscurecen. */}
      <span aria-hidden className="absolute -bottom-3 -right-3 h-[172px] w-[172px]">
        <span className={`absolute inset-0 bg-[var(--tinte-blob)] ${BLOB}`} />
        <span className="absolute inset-[14px] grid place-items-center overflow-clip rounded-full bg-[var(--plato)] shadow-[var(--shadow-md)] transition-transform duration-[var(--dur-slow)] ease-[var(--ease-editorial)] group-hover:-rotate-2 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:rotate-0 motion-reduce:group-hover:scale-100">
          {imagen ? (
            <span className="relative h-full w-full">
              <Image
                src={imagen}
                alt=""
                fill
                sizes="144px"
                className="object-contain p-2.5 mix-blend-multiply brightness-[1.05]"
              />
            </span>
          ) : (
            <Glifo className="h-16 w-16 -rotate-6 text-[var(--tinte-ink)]" strokeWidth={1.5} />
          )}
        </span>
      </span>
    </Link>
  );
}

export function CategoriaTile({ tile }: { tile: TileCategoria }) {
  const Glifo = getProductCategoryIcon(tile.id);
  return (
    <Link
      href={`/?cat=${encodeURIComponent(tile.id)}#catalogo`}
      data-familia={tile.familia}
      className={`group relative isolate flex w-full flex-col justify-between gap-1.5 rounded-[var(--radius-lg)] bg-[var(--tinte-bg)] p-2 ${ELEVAR} ${ENFOQUE}`}
    >
      <span className="patron-familia rounded-[inherit]" aria-hidden />
      <span
        aria-hidden
        className={`relative grid h-12 w-12 shrink-0 place-items-center bg-[var(--tinte-blob)] text-[var(--tinte-ink)] transition-transform duration-[var(--dur-base)] group-hover:-rotate-6 motion-reduce:group-hover:rotate-0 ${BLOB}`}
      >
        <Glifo className="h-7 w-7" strokeWidth={1.75} />
      </span>
      <span className="relative line-clamp-2 hyphens-auto text-sm font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)] [overflow-wrap:anywhere]">
        {tile.label}
      </span>
    </Link>
  );
}

/** Última celda del bloque. «+N» cambia con el ancho porque en md entran menos. */
export function CeldaVerTodas({
  restantesMd,
  restantesLg,
}: {
  restantesMd: number;
  restantesLg: number;
}) {
  const nombre = (n: number) => (n === 1 ? "1 categoría" : `${n} categorías`);
  return (
    <Link
      href="/#catalogo"
      className={`group relative flex w-full flex-col justify-between rounded-[var(--radius-lg)] border border-dashed border-[var(--rule-strong)]/30 bg-[var(--surface-sunken)] p-2.5 ${ELEVAR} ${ENFOQUE}`}
    >
      <span
        aria-hidden
        className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-raised)] text-[var(--accent-ink)] transition-transform duration-[var(--dur-fast)] group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
      >
        <ArrowRight className="h-5 w-5" strokeWidth={2.25} />
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-bold text-[var(--text-primary)]">Ver todas</span>
        {restantesLg > 0 && (
          <span className="hidden text-xs font-medium tabular-nums text-[var(--text-secondary)] lg:inline">
            +{nombre(restantesLg)}
          </span>
        )}
        {restantesMd > 0 && (
          <span className="text-xs font-medium tabular-nums text-[var(--text-secondary)] lg:hidden">
            +{nombre(restantesMd)}
          </span>
        )}
      </span>
    </Link>
  );
}
