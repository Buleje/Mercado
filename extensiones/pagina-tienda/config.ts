/**
 * Cómo quiere su tienda cada negocio (ADR-511), guardado en `storeTheme.tiendaPlantilla`
 * de los ajustes. Se lee con `safeParse`: si falla, los valores por defecto (formato
 * nuevo, pedido por checkout, bloques de fábrica).
 */
import { z } from "zod";
import { BLOQUES_TIENDA, type BloqueId } from "./contenido";

export const PlantillaSchema = z
  .object({
    /** `clasico` = la página general de antes (para quien usa ventanas emergentes, cuenta regresiva…). */
    formato: z.enum(["tienda", "clasico"]).default("tienda"),
    pedido: z.enum(["checkout", "whatsapp"]).default("checkout"),
    bloques: z.array(z.enum(BLOQUES_TIENDA)).max(12).optional(),
  })
  .strip();

export type PlantillaTienda = z.infer<typeof PlantillaSchema>;

export const BLOQUES_POR_DEFECTO: BloqueId[] = ["franja", "heroe", "circulos", "destacados", "porPrecio", "confianza", "politicas"];

export function leerPlantilla(storeTheme: unknown): PlantillaTienda {
  const crudo = storeTheme && typeof storeTheme === "object" ? (storeTheme as { tiendaPlantilla?: unknown }).tiendaPlantilla : undefined;
  const r = PlantillaSchema.safeParse(crudo ?? {});
  return r.success ? r.data : { formato: "tienda", pedido: "checkout" };
}
