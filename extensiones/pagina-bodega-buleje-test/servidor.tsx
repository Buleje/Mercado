/**
 * Página propia "Página propia de Bodega Buleje Test" — la página entera (enchufe `tienda.pagina`, ADR-458).
 *
 * Arranca IDÉNTICA a la general: dibuja `<PaginaGeneral>`. Lo que el negocio
 * pida se cambia acá (ver LEEME.md).
 *
 * Qué pasa si falla: si `Pagina` tira o tarda más de 2 s en DEVOLVER, el
 * negocio ve la página general (y avisa a Sentry). Lo que se dibuja adentro no
 * tiene tope: si un componente hijo falla, el navegador recarga la general
 * (`?sinPiezas=1`); si tarda, tarda la página.
 *
 * `ctx` (el negocio) lo pone el sistema desde la URL; nunca lo elijas acá.
 */
import "server-only";
import { PaginaGeneral } from "@/components/store/pagina-publica/PaginaGeneral";
import type { PiezaPagina } from "../_contrato";
import type { Opciones } from "./manifest";

export const pagina: PiezaPagina<Opciones> = {
  Pagina({ ctx, searchParams }) {
    return (
      <>
        {/* Lo propio de este negocio: una franja que ningún otro tiene. */}
        <div className="bg-[var(--accent)] px-4 py-3 text-center text-sm font-bold text-white">
          Página propia de Bodega Buleje Test · hecha a medida, sólo para esta tienda
        </div>
        <PaginaGeneral slug={ctx.slug} searchParams={searchParams} />
      </>
    );
  },
};
