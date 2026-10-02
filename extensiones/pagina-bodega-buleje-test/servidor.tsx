/**
 * «Buleje Beauty» — la página propia de este negocio (enchufe `tienda.pagina`, ADR-458).
 *
 * Un salón de belleza y cosmética capilar: anuncios, portada en carrusel,
 * novedades, promos, favoritos, líneas propias, servicios reservables por
 * WhatsApp y el carrito de la tienda. Qué es cada archivo: LEEME.md.
 *
 * `Pagina` devuelve AL INSTANTE (no espera datos): así el tope de 2 s del
 * enchufe nunca salta por una base lenta. Los datos se leen adentro, en
 * <PaginaSalon>, bajo <Suspense> con un esqueleto de la marca. Si algo de
 * adentro falla al dibujarse, el navegador recarga la página general
 * (`?sinPiezas=1`).
 *
 * `ctx` (el negocio) lo pone el sistema desde la URL; nunca lo elijas acá.
 *
 * ADR-460: la misma pieza viste el resto de la tienda (`marco`) y trae su
 * catálogo (`Catalogo`). Ver LEEME.md.
 */
import "server-only";
import { Suspense } from "react";
import type { PiezaPagina } from "../_contrato";
import { Catalogo } from "./Catalogo";
import type { Opciones } from "./manifest";
import { marco } from "./Marco";
import { EsqueletoSalon, PaginaSalon } from "./PaginaSalon";

export const pagina: PiezaPagina<Opciones> = {
  Pagina({ ctx }) {
    return (
      <Suspense fallback={<EsqueletoSalon />}>
        <PaginaSalon tenantId={ctx.tenantId} slug={ctx.slug} />
      </Suspense>
    );
  },
  // ADR-460 · el resto de la tienda (catálogo, ficha, cuenta, pedidos, legales,
  // checkout) con el mismo encabezado, pie, paleta y bolsa (`Marco.tsx`)…
  marco,
  // …y el catálogo propio, sólo con lo del salón (`Catalogo.tsx`).
  Catalogo,
};
