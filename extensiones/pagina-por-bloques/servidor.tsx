/**
 * Pieza `pagina-por-bloques` — la vista de la portada (enchufe `tienda.portada`,
 * modo `reemplaza`).
 *
 * `cargar()` lee la página PUBLICADA del negocio de la visita (`ctx.tenantId`,
 * que pone el sistema desde el host; las opciones sólo dicen el enlace). Si no
 * hay nada que mostrar, TIRA: el `<Enchufe>` lo toma como «esta pieza no
 * corre» y se ve la portada normal. No devolver `null` a propósito: una vista
 * vacía en lugar del cuerpo dejaría la tienda en blanco.
 *
 * Página despublicada o inexistente = caso ESPERADO (el dueño la sacó), no una
 * falla: esos errores llevan `esperado = true` para que el enchufe vuelva a la
 * portada normal SIN avisar a Sentry. Hoy el aviso sale igual: lo dispara
 * `lib/extensiones/Enchufe.tsx` (el `catch` de `cargar()` llama a
 * `reportarFalloPieza` sin mirar el error) — pendiente de ese lado.
 */
import "server-only";
import RenderBloques from "@/components/cms/RenderBloques";
import { CmsPagesDB, type BloquePublico, type PaginaPublica } from "@/lib/db/cms-pages.db";
import type { PiezaPortada } from "../_contrato";
import type { OpcionesPaginaPorBloques } from "./manifest";

/**
 * «No hay nada que mostrar, y está bien»: la pieza no corre y se ve la portada
 * normal. `esperado` es la marca que el enchufe puede mirar (sin importar nada
 * de la pieza) para no tratarlo como una falla.
 */
export class PaginaSinContenidoError extends Error {
  readonly esperado = true;
}

/** La página no existe, está en borrador o archivada. Se ve la portada normal. */
export class PaginaNoPublicadaError extends PaginaSinContenidoError {
  constructor(paginaSlug: string) {
    super(`La página «${paginaSlug}» no está publicada en este negocio`);
    this.name = "PaginaNoPublicadaError";
  }
}

/** Publicada pero sin un bloque que se pueda mostrar. Se ve la portada normal. */
export class PaginaSinBloquesError extends PaginaSinContenidoError {
  constructor(paginaSlug: string) {
    super(`La página «${paginaSlug}» no tiene bloques visibles para la portada`);
    this.name = "PaginaSinBloquesError";
  }
}

/**
 * Bloques que en la portada no se dibujan (01-10). `products` lee un catálogo
 * de demostración que hoy está VACÍO (`data/products.ts`) y llama a `useCart()`:
 * en `/cms/<enlace>` no muestra nada, y en `/t/<negocio>` —que no monta el
 * carrito— tira y tumbaba la página entera de vuelta a la portada normal. Sin
 * él la portada queda igual a lo que el dueño ve en `/cms/<enlace>`. Sacarlo de
 * acá cuando `ProductsBlock` lea el catálogo del negocio sin depender del carrito.
 */
const FUERA_DE_LA_PORTADA: ReadonlySet<string> = new Set(["products"]);

export function bloquesDeLaPortada(bloques: readonly BloquePublico[]): BloquePublico[] {
  return bloques.filter((b) => b.visible && !FUERA_DE_LA_PORTADA.has(b.type));
}

export const portada: PiezaPortada<OpcionesPaginaPorBloques, PaginaPublica> = {
  modo: "reemplaza",

  async cargar(ctx, opciones) {
    const pagina = await CmsPagesDB.publicadaPorSlug(ctx.tenantId, opciones.paginaSlug);
    if (!pagina) throw new PaginaNoPublicadaError(opciones.paginaSlug);
    const bloques = bloquesDeLaPortada(pagina.blocks);
    if (bloques.length === 0) throw new PaginaSinBloquesError(opciones.paginaSlug);
    return { ...pagina, blocks: bloques };
  },

  Vista({ datos }) {
    // `cargar()` siempre trae la página; sin ella, tirar devuelve la portada normal.
    if (!datos) throw new Error("pagina-por-bloques: la vista llegó sin la página");
    return (
      <div data-pieza="pagina-por-bloques" data-pagina={datos.slug}>
        <RenderBloques bloques={datos.blocks} />
      </div>
    );
  },
};
