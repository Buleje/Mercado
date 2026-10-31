/**
 * Los campos nuevos de la persona de Adelantos (ADR-525, Brandon 30-10): qué es
 * para el negocio, Yape/Plin, un contacto de referencia y la fecha de
 * nacimiento. La foto del DNI va por su propia ruta (`…/foto-documento`).
 *
 * Una sola fuente para el POST y el PATCH de `/api/adelantos/beneficiarios`, y
 * para la pantalla que quiera la lista o las etiquetas. Sin dependencias de
 * servidor: se puede importar desde el cliente.
 *
 * `""` (o sólo espacios) se guarda como `null`: un casillero que se vació es
 * «no se sabe», no un texto vacío.
 */
import { z } from "zod";
import { limaDateKey } from "@/lib/utils";

/** Lista cerrada en TS: un enum de Postgres con un valor nuevo rompería al Prisma viejo de producción. */
export const TIPOS_RELACION = ["trabajador", "proveedor", "chofer", "cliente", "familia", "otro"] as const;
export type TipoRelacion = (typeof TIPOS_RELACION)[number];

export const ETIQUETA_RELACION: Record<TipoRelacion, string> = {
  trabajador: "Trabajador",
  proveedor: "Proveedor",
  chofer: "Chofer",
  cliente: "Cliente",
  familia: "Familia",
  otro: "Otro",
};

/** Celular peruano (Yape/Plin también): 9 dígitos que empiezan con 9. */
export const CELULAR_PE = /^9\d{8}$/;
/** La fecha más vieja que se acepta como nacimiento. */
export const NACIMIENTO_DESDE = "1900-01-01";

const vacioANull = (v: unknown): unknown => (typeof v === "string" && v.trim() === "" ? null : v);
/** «987 654 321» y «987-654-321» son el mismo número: se guardan sin separadores. */
const celularLimpio = (v: unknown): unknown => (typeof v === "string" ? (v.trim() === "" ? null : v.replace(/[\s-]/g, "")) : v);

/** `true` si `s` es «AAAA-MM-DD», existe en el calendario y cae entre 1900 y hoy (día de Lima). */
export function esFechaNacimientoValida(s: string, hoy: string = limaDateKey()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== s) return false; // 2026-02-30 no existe
  return s >= NACIMIENTO_DESDE && s <= hoy;
}

const celular = (que: string) =>
  z.preprocess(celularLimpio, z.string().regex(CELULAR_PE, `${que}: 9 dígitos que empiezan con 9.`).nullable()).optional();

/** Se esparce dentro del `z.object` del POST y del PATCH. `fotoDocumentoKey` NO va: no la manda el cliente. */
export const CAMPOS_PERSONA = {
  tipoRelacion: z
    .preprocess(vacioANull, z.enum(TIPOS_RELACION, { error: "Qué es para el negocio: elige una opción de la lista." }).nullable())
    .optional(),
  yape: celular("El Yape o Plin"),
  referenciaNombre: z
    .preprocess(vacioANull, z.string().trim().max(120, "El nombre de la referencia: máximo 120 letras.").nullable())
    .optional(),
  referenciaTelefono: celular("El celular de la referencia"),
  fechaNacimiento: z
    .preprocess(
      vacioANull,
      z
        .string()
        .refine((s) => esFechaNacimientoValida(s), "La fecha de nacimiento va como AAAA-MM-DD, entre 1900 y hoy.")
        .nullable(),
    )
    .optional(),
};
