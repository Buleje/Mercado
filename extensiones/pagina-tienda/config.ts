/**
 * Cómo quiere su tienda cada negocio (ADR-511), guardado en `storeTheme.tiendaPlantilla`
 * de los ajustes. Se lee con `safeParse`: si falla, los valores por defecto (formato
 * nuevo, bloques de fábrica).
 * Por dónde llegan los pedidos NO va acá (20-10): era `pedido` y duplicaba
 * `Settings.mode` (el de la tienda clásica). Única fuente = `Settings.mode`;
 * `datos.ts` lo lee. Un `pedido` viejo guardado lo descarta `.strip()`.
 */
import { z } from "zod";
import { BLOQUES_TIENDA, type BloqueId } from "./contenido";

export const PlantillaSchema = z
  .object({
    /** `clasico` = la página general de antes (para quien usa ventanas emergentes, cuenta regresiva…). */
    formato: z.enum(["tienda", "clasico"]).default("tienda"),
    bloques: z.array(z.enum(BLOQUES_TIENDA)).max(12).optional(),
  })
  .strip();

export type PlantillaTienda = z.infer<typeof PlantillaSchema>;

export const BLOQUES_POR_DEFECTO: BloqueId[] = ["franja", "heroe", "circulos", "destacados", "porPrecio", "confianza", "politicas"];

export function leerPlantilla(storeTheme: unknown): PlantillaTienda {
  const crudo = storeTheme && typeof storeTheme === "object" ? (storeTheme as { tiendaPlantilla?: unknown }).tiendaPlantilla : undefined;
  const r = PlantillaSchema.safeParse(crudo ?? {});
  return r.success ? r.data : { formato: "tienda" };
}
