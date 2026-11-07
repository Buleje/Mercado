/**
 * Pieza `madera-disponible` — manifiesto (ADR-457).
 *
 * Suma a la portada de la tienda un bloque con la madera aserrada que hay HOY
 * en el patio, por especie, en pt → m³ → piezas, con un botón de WhatsApp del
 * negocio. Sale de «Productos disponibles» del Libro CTP (ADR-418), pero sólo
 * lo que se puede ofrecer: lo libre y propio. Nada de costos, proveedores,
 * permisos ni guías en la página pública.
 */
import { z } from "zod";
import type { ManifiestoPieza } from "../_contrato";

export const opcionesMaderaDisponible = z
  .object({
    /** El título del bloque en la portada. */
    titulo: z.string().trim().min(1).max(60).default("Madera disponible hoy"),
    /** Cuántas especies se muestran (las de más volumen); el resto se resume en una línea. */
    maxEspecies: z.number().int().min(1).max(24).default(8),
    /** Mostrar las piezas cuando se conocen (sólo las de paquetes contados). */
    mostrarPiezas: z.boolean().default(true),
  })
  .strict();

export type OpcionesMaderaDisponible = z.output<typeof opcionesMaderaDisponible>;

export const manifiesto = {
  id: "madera-disponible",
  nombre: "Madera disponible en la portada",
  descripcion:
    "Muestra en la portada de la tienda la madera aserrada que hay hoy en el patio, por especie, en pie tablar, " +
    "m³ y piezas, con un botón para pedirla por WhatsApp. Sólo lo libre y propio: lo apartado, lo marcado como " +
    "usado y lo que se asierra por encargo no sale. No muestra costos, proveedores ni permisos.",
  version: "1.0.0",
  enchufes: ["tienda.portada"],
  opciones: opcionesMaderaDisponible,
  rubros: ["madereria"],
  requiere: ["spec:forestal:ctp-libro"],
} as const satisfies ManifiestoPieza<typeof opcionesMaderaDisponible>;
