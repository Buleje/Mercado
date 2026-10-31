/**
 * «Musa» — la página propia de este negocio (enchufe `tienda.pagina`, ADR-458).
 *
 * Belleza profesional en Ciudad Constitución: héroe con la vitrina de envases,
 * círculos de categoría, rutina coreana, kits con su ahorro real, atajos por
 * precio, «¿Qué quieres mejorar?», la bolsa con contador y el pedido por WhatsApp.
 * Colores, letras y tiempos: `tema.ts`. Qué es cada archivo: LEEME.md.
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
import { metadatosPagina } from "./compartir";
import { Ficha, metadatosFicha } from "./Ficha";
import { leerLetras } from "./letras";
import type { Opciones } from "./manifest";
import { marco } from "./Marco";
import { EsqueletoSalon, PaginaSalon } from "./PaginaSalon";

export const pagina: PiezaPagina<Opciones> = {
  Pagina({ ctx, searchParams }) {
    return (
      <Suspense fallback={<EsqueletoSalon />}>
        {/* `?letras=b|c`: comparar los pares de letras en el navegador (letras.ts). */}
        <PaginaSalon tenantId={ctx.tenantId} slug={ctx.slug} letras={leerLetras(searchParams.letras)} />
      </Suspense>
    );
  },
  // ADR-460 · el resto de la tienda (catálogo, ficha, cuenta, pedidos, legales,
  // checkout) con el mismo encabezado, pie, paleta y bolsa (`Marco.tsx`)…
  marco,
  // …el catálogo propio, sólo con lo del salón (`Catalogo.tsx`)…
  Catalogo,
  // …y la ficha de cada producto o servicio, con su título para la pestaña (`Ficha.tsx`).
  Ficha,
  metadatosFicha,
  // …y lo que se ve al compartir la portada y el catálogo (`compartir.ts`).
  metadatosPagina,
};
