/**
 * La muestra «popular» del catálogo, pedida UNA vez para toda la home.
 *
 * Los estantes por pasillo (`HomeEstantes`) y la pestaña «Populares» de
 * «Descubre» pedían `sort=popular` con `limit=100` y `limit=24`: dos idas de
 * ~1,2 s al servidor por la misma lista (16-10, carril velocidad). En
 * `popular` el servidor mezcla una ventana fija por tienda y recién después
 * recorta (`app/api/marketplace/catalog/route.ts`, `MIX_WINDOW`), así que los
 * 24 primeros de la muestra son exactamente los que daba `limit=24`.
 */
export const URL_MUESTRA_POPULAR = "/api/marketplace/catalog?sort=popular&limit=100";
export const VIGENCIA_MUESTRA_MS = 120_000;
