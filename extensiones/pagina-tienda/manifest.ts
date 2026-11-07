/**
 * Plantilla de tienda para TODOS los negocios (ADR-511, nacida de «Musa») — manifiesto.
 *
 * La página pública de `/t/<negocio>` de cualquier negocio sin página propia
 * (salvo los que eligieron «Clásico» en Mi Tienda). No se prende negocio por
 * negocio: la elige el sistema (`lib/extensiones/elegir-pagina.ts`). Lo que
 * cambia por negocio (nombre, logo, colores, letra, bloques, textos) sale de
 * sus ajustes (`datos.ts`), nunca de acá.
 */
import { z } from "zod";
import type { ManifiestoPieza } from "../_contrato";

/** Sin opciones: lo de cada negocio sale de sus ajustes (`datos.ts`). */
export const opciones = z.object({}).strict();

export type Opciones = z.output<typeof opciones>;

export const manifiesto = {
  id: "pagina-tienda",
  nombre: "Tienda — plantilla para todos los negocios",
  descripcion:
    "La tienda pública de cualquier negocio con el formato de Musa: franja de avisos, barra pegajosa con buscador y bolsa, " +
    "héroe con UN botón, círculos de categorías, «Elige por precio», destacados, «Compra tranquila» y envíos, pagos y cambios. " +
    "Nombre, logo (o su inicial), acento, letra y bloques salen de los ajustes del negocio. Viste también el resto de su tienda. " +
    "Si falla, se ve la general.",
  version: "1.0.0",
  enchufes: ["tienda.pagina"],
  opciones,
} as const satisfies ManifiestoPieza<typeof opciones>;
