import Link from "next/link";
import type { ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { ArrowRight } from "@buleje/design-system/icons";

/**
 * Cabecera única de las secciones de la home «Dosel»: un H2 (sin kicker),
 * una bajada opcional de 1 línea y, a la derecha, una acción y/o un slot
 * (pestañas, countdown). Server-safe.
 */
interface Props {
  /** id del h2 para `aria-labelledby` de la sección. */
  id?: string;
  titulo: ReactNode;
  /** Solo si suma un dato; nunca repite el título. */
  bajada?: ReactNode;
  accion?: { label: string; href: string };
  extra?: ReactNode;
}

export default function HomeSeccionTitulo({ id, titulo, bajada, accion, extra }: Props) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 sm:mb-5">
      <div className="min-w-0">
        <SectionTitle
          as="h2"
          id={id}
          className="text-balance text-[length:var(--ts-2xl)] font-extrabold tracking-[-0.025em] lg:text-[length:var(--ts-3xl)]"
        >
          {titulo}
        </SectionTitle>
        {bajada && (
          <p className="mt-1 line-clamp-1 text-sm text-[var(--text-secondary)]">{bajada}</p>
        )}
      </div>
      {(extra || accion) && (
        <div className="flex shrink-0 items-center gap-2">
          {extra}
          {accion && (
            <Link
              href={accion.href}
              className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--accent-soft)]"
            >
              {accion.label}
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
