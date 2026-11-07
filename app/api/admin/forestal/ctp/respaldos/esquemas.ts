import { z } from "zod";

/**
 * Esquemas de /api/admin/forestal/ctp/respaldos (ADR-530). Siempre `safeParse`.
 */

/** POST guardar un respaldo a mano. */
export const crearRespaldoSchema = z.object({
  nota: z
    .string()
    .trim()
    .max(200, "La nota del respaldo puede tener hasta 200 letras.")
    /* Sin `.transform` (Zod 4 la vuelve obligatoria): la ruta pasa "" a null. */
    .nullish(),
});

/** POST recuperar: lo marcado (claves de grupo) o todo lo borrado, y la huella que vio el operador. */
export const recuperarRespaldoSchema = z.object({
  seleccion: z.union([
    z.literal("todo_lo_borrado"),
    z
      .array(z.string().trim().min(1).max(120))
      .min(1, "Marca al menos una cosa para recuperar.")
      .max(5_000, "Son demasiadas cosas de una vez: recupera por partes."),
  ]),
  esperado: z.string().regex(/^[0-9a-f]{64}$/, "Vuelve a comparar antes de recuperar."),
});

/** `[id]` de la ruta: un cuid. */
export const idRespaldoSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i, "Respaldo no válido.");
