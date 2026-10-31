/**
 * Plantilla de tienda (ADR-511): la página entera de `/t/<negocio>` y el marco
 * del resto de su tienda, para todos los negocios sin página propia.
 *
 * `Pagina` devuelve AL INSTANTE (no espera datos): así el tope de 2 s del
 * enchufe nunca salta por una base lenta. Los datos se leen adentro
 * (`PaginaTienda`), bajo `<Suspense>` con un esqueleto de las mismas alturas.
 * Si algo de adentro falla al dibujarse, el navegador recarga la página
 * general (`?sinPiezas=1`).
 *
 * `ctx` (el negocio) lo pone el sistema desde la URL; nunca lo elijas acá.
 */
import "server-only";
import { Suspense } from "react";
import type { PiezaPagina } from "../_contrato";
import { BolsaDeLaTienda } from "./BolsaServidor";
import { Catalogo } from "./Catalogo";
import { CSS_NEUTRO, EsqueletoEncabezado, EsqueletoHeroe } from "./EncabezadoEsqueleto";
import { Ficha, metadatosFicha } from "./Ficha";
import type { Opciones } from "./manifest";
import { crearMarco } from "./Marco";
import { Lienzo, PaginaTienda } from "./PaginaTienda";

function EsqueletoTienda() {
  return (
    <Lienzo css={CSS_NEUTRO}>
      <EsqueletoEncabezado />
      <EsqueletoHeroe />
    </Lienzo>
  );
}

export const pagina: PiezaPagina<Opciones> = {
  Pagina({ ctx }) {
    return (
      <Suspense fallback={<EsqueletoTienda />}>
        <PaginaTienda tenantId={ctx.tenantId} slug={ctx.slug} bolsa={<BolsaDeLaTienda ctx={ctx} enPortada />} />
      </Suspense>
    );
  },
  // El resto de la tienda (catálogo, ficha, cuenta, pedidos, legales, checkout)
  // con el mismo encabezado, pie, paleta y bolsa (`Marco.tsx`)…
  marco: crearMarco((c) => <BolsaDeLaTienda ctx={c} />),
  // …el catálogo con lo del negocio (`Catalogo.tsx`)…
  Catalogo,
  // …y la ficha de cada producto, con su título para la pestaña (`Ficha.tsx`).
  Ficha,
  metadatosFicha,
};
