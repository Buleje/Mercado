/**
 * El MOTIVO que un acto del libro exige (anular, cerrar, soltar, corregir una
 * llegada…): una sola regla para todos los esquemas del módulo forestal.
 *
 * Por qué hace falta (auditoría de seguridad, 28-09): `z.string().trim().min(3)`
 * deja pasar un motivo hecho de espacios invisibles —U+200B…U+200D, U+2060,
 * U+FEFF—, que `trim()` no quita. El libro quedaba con un «motivo» que nadie
 * puede leer, y es lo primero que un fiscalizador pregunta.
 *
 * La regla: se quitan esos caracteres, se recorta, y se piden al menos TRES
 * LETRAS (cualquier alfabeto). «123» o «...» no dicen por qué.
 *
 * PURO y client-safe: la pantalla y el servidor usan la misma.
 */
import { z } from "zod";

/** Los invisibles que `trim()` no quita: espacio de ancho cero, unión, no-unión, WORD JOINER y BOM. */
const INVISIBLES = /[​-‍⁠﻿]/g;
/** Letras de cualquier alfabeto (ñ, tildes incluidas). */
const LETRA = /\p{L}/gu;

/** Letras mínimas de un motivo. */
export const LETRAS_MIN_MOTIVO = 3;

/** El motivo sin invisibles y recortado: lo que se guarda. */
export function limpiarMotivo(texto: string): string {
  return texto.replace(INVISIBLES, "").trim();
}

/** Cuántas letras tiene (después de limpiarlo). */
export function letrasDelMotivo(texto: string): number {
  return (limpiarMotivo(texto).match(LETRA) ?? []).length;
}

/** ¿Dice algo? Largo mínimo y al menos tres letras, ya sin invisibles. */
export function motivoLegible(texto: string | null | undefined, min = LETRAS_MIN_MOTIVO): boolean {
  const limpio = limpiarMotivo(texto ?? "");
  return limpio.length >= min && letrasDelMotivo(limpio) >= LETRAS_MIN_MOTIVO;
}

/**
 * El esquema de un motivo OBLIGATORIO. Devuelve el texto limpio (sin
 * invisibles, recortado). `mensaje` es la frase del «no»: sale igual si falta
 * largo o faltan letras.
 */
export function motivoSchema({
  min = LETRAS_MIN_MOTIVO,
  max = 500,
  mensaje = `Escribe el motivo (al menos ${LETRAS_MIN_MOTIVO} letras).`,
  mensajeMax,
}: { min?: number; max?: number; mensaje?: string; mensajeMax?: string } = {}) {
  return z
    .string()
    .transform(limpiarMotivo)
    .pipe(
      z
        .string()
        .min(min, mensaje)
        .max(max, mensajeMax ?? `El motivo va en hasta ${max} letras.`)
        .refine((s) => letrasDelMotivo(s) >= LETRAS_MIN_MOTIVO, mensaje),
    );
}

/**
 * Un motivo OPCIONAL (p. ej. el de una llegada vencida, que se exige aparte
 * sólo si se confirma): se limpia igual; vacío tras limpiarlo es «no hay».
 */
export function motivoOpcionalSchema(max = 500) {
  return z
    .string()
    .transform(limpiarMotivo)
    .pipe(z.string().max(max))
    .optional();
}
