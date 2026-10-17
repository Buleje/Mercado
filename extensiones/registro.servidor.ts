/**
 * extensiones/registro.servidor.ts — el registro ESTÁTICO de piezas del lado
 * del servidor (ADR-457).
 *
 * Estático a propósito: el bundler ve todas las piezas (tipos, tests, árbol de
 * dependencias) y sólo corre lo que un negocio tiene prendido en `TenantPieza`.
 * Acá va el manifiesto de TODA pieza (lo usa el catálogo del superadmin y la
 * validación de opciones) y, si llena `tienda.portada`, su vista de servidor.
 *
 * Para sumar una pieza: el import bajo el ancla de su grupo y su línea bajo el
 * MISMO ancla en la lista. Las anclas separan a los equipos para que dos
 * agentes no se pisen la misma línea. Nada de ids de negocio acá: quién tiene
 * qué pieza vive en la tabla, nunca en el código.
 */
import "server-only";
import { piezaServidor, type EntradaServidor } from "./_contrato";

// ── piezas de la tienda (imports) ──
import { manifiesto as maderaDisponible } from "./madera-disponible/manifest";
import { portada as maderaDisponiblePortada } from "./madera-disponible/servidor";
import { manifiesto as paginaPorBloques } from "./pagina-por-bloques/manifest";
import { portada as paginaPorBloquesPortada } from "./pagina-por-bloques/servidor";

// ── piezas del panel (imports) ──
import { manifiesto as cierreParaContador } from "./cierre-para-contador/manifest";

// ── piezas forestales (imports) ──
import { manifiesto as gtfHojaDeControl } from "./gtf-hoja-de-control/manifest";

// ── páginas propias (imports) ──
// Una por negocio (ADR-458). Las escribe `npm run pagina-propia -- crear <id> "<nombre>"`.
// Acá sólo el manifiesto: la página se carga con `import()` en la lista (ver `EntradaServidor.pagina`).
import { manifiesto as paginaBodegaBulejeTest } from "./pagina-bodega-buleje-test/manifest";
import { manifiesto as paginaMusa } from "./pagina-musa/manifest";

export const PIEZAS_SERVIDOR: readonly EntradaServidor[] = [
  // ── piezas de la tienda ──
  piezaServidor(paginaPorBloques, { portada: paginaPorBloquesPortada }),
  piezaServidor(maderaDisponible, { portada: maderaDisponiblePortada }),

  // ── piezas del panel ──
  piezaServidor(cierreParaContador),

  // ── piezas forestales ──
  // La hoja se arma en el navegador (la guía se imprime allá): acá sólo el manifiesto.
  piezaServidor(gtfHojaDeControl),

  // ── páginas propias ──
  piezaServidor(paginaBodegaBulejeTest, { pagina: () => import("./pagina-bodega-buleje-test/servidor").then((m) => m.pagina) }),
  piezaServidor(paginaMusa, { pagina: () => import("./pagina-musa/servidor").then((m) => m.pagina) }),
];
