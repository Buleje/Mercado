"use client";

/**
 * extensiones/registro.cliente.ts — el registro ESTÁTICO de piezas del lado
 * del navegador (ADR-457).
 *
 * Cada entrada trae el manifiesto (chico: un Zod) y la parte pesada como carga
 * perezosa: `guia` con `import()` y `pestana.Vista` con `next/dynamic`. Así el
 * bundler ve todo y el navegador sólo baja lo que el negocio tiene prendido.
 *
 * Para sumar una pieza: el import bajo el ancla de su grupo y su entrada bajo
 * el MISMO ancla en el mapa. Nada de ids de negocio acá.
 */
import { piezaCliente, type EntradaCliente } from "./_contrato";

// ── piezas de la tienda (imports) ──
// La portada se dibuja en el servidor: del lado del navegador sólo viaja el manifiesto.
import { manifiesto as maderaDisponible } from "./madera-disponible/manifest";
import { manifiesto as paginaPorBloques } from "./pagina-por-bloques/manifest";

// ── piezas del panel (imports) ──
import dynamic from "next/dynamic";
import { manifiesto as cierreParaContador } from "./cierre-para-contador/manifest";

// ── piezas forestales (imports) ──
import { manifiesto as gtfHojaDeControl } from "./gtf-hoja-de-control/manifest";

// ── páginas propias (imports) ──
// La página se dibuja en el servidor: del lado del navegador sólo viaja el manifiesto (ADR-458).

export const PIEZAS_CLIENTE: Readonly<Record<string, EntradaCliente>> = {
  // ── piezas de la tienda ──
  [paginaPorBloques.id]: piezaCliente(paginaPorBloques),
  [maderaDisponible.id]: piezaCliente(maderaDisponible),

  // ── piezas del panel ──
  [cierreParaContador.id]: piezaCliente(cierreParaContador, {
    pestana: {
      titulo: "Cierre para el contador",
      icono: "FileSpreadsheet",
      Vista: dynamic(() => import("./cierre-para-contador/cliente")),
    },
  }),

  // ── piezas forestales ──
  [gtfHojaDeControl.id]: piezaCliente(gtfHojaDeControl, {
    guia: () => import("./gtf-hoja-de-control/guia").then((m) => m.pieza),
  }),

  // ── páginas propias ──
};
