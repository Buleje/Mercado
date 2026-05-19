/**
 * lib/auth/password-schema.ts
 *
 * Single source of truth para la policy de contraseñas.
 *
 * Audit project-wide 2026-05-19 (Security P1 #1): los schemas previos
 * permitían `min(6)` sin complejidad. Subimos a `min(8)` con `max(128)`
 * (anti-DoS bcrypt). NIST SP 800-63B Sección 5.1.1.2 recomienda min 8.
 *
 * Para casos donde se acepte una contraseña EXISTENTE (legacy, login),
 * usar `loginPasswordSchema`. Para CREACIÓN o ROTACIÓN, usar
 * `newPasswordSchema` (incluye check de complejidad).
 */

import { z } from "zod";

/**
 * Schema permisivo — para inputs de LOGIN (acepta contraseñas legacy
 * cortas creadas antes del bump). No incluye check de complejidad.
 */
export const loginPasswordSchema = z
  .string()
  .min(1, "Contraseña requerida")
  .max(128, "Contraseña demasiado larga");

/**
 * Schema estricto — para CREACIÓN o ROTACIÓN de contraseñas.
 * Min 8 caracteres + complejidad mínima (letra + número o símbolo).
 *
 * NO romper este check sin coordinarlo con un script de migración
 * que fuerce rotación a los usuarios legacy.
 */
export const newPasswordSchema = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .max(128, "Máximo 128 caracteres")
  .refine(
    (v) => /[A-Za-zÁ-ÿ]/.test(v) && /[\d\W_]/.test(v),
    "Debe incluir al menos una letra y un número o símbolo",
  );

/**
 * Variante opcional — para PATCH endpoints donde el password puede no
 * venir en el body (se usa para otros campos). Mismo policy si viene.
 */
export const newPasswordSchemaOptional = newPasswordSchema.optional();
