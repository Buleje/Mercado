/**
 * Piezas que repiten los bloques de la portada (como `pagina-musa/ui.tsx`):
 * el título de cada bloque (con su acción a la derecha desde 640 px) y el
 * enlace «Ver todo →» con el filete que crece. Sin `"use client"`.
 */
import type { ReactNode } from "react";
import { ArrowRight } from "@buleje/design-system/icons";
import { CUERPO, ENLACE_VER, TITULO_BLOQUE } from "./ui";

export function TituloBloque({ id, titulo, texto, accion }: { id: string; titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-2 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
      <div className="max-w-2xl">
        <h2 id={id} className={TITULO_BLOQUE}>
          {titulo}
        </h2>
        {texto && <p className={`mt-2 ${CUERPO}`}>{texto}</p>}
      </div>
      {accion}
    </div>
  );
}

/** «Ver todo →»: enlace de texto con filete que crece (48 px de alto para el dedo). */
export function EnlaceVer({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={`${ENLACE_VER} self-start sm:self-end`}>
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-[var(--ti-dur-corto)] group-hover:translate-x-1" aria-hidden="true" />
    </a>
  );
}
