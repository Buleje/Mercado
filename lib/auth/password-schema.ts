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
// Blocklist de contraseñas comunes (las más usadas en brechas reales). Se
// compara en minúsculas y sin espacios. Brandon 2026-06-14 (ADR-133).
const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "password", "password1", "contraseña",
  "qwerty", "qwertyuiop", "111111", "000000", "abc123", "iloveyou", "admin123",
  "administrador", "buleje", "buleje123", "bodega", "bodega123", "letmein",
  "welcome", "bienvenido", "1q2w3e4r", "1qaz2wsx", "passw0rd", "p@ssword",
]);

export const newPasswordSchema = z
  .string()
  .min(10, "Mínimo 10 caracteres")
  .max(128, "Máximo 128 caracteres")
  .refine(
    (v) => /[A-Za-zÁ-ÿ]/.test(v) && /[\d\W_]/.test(v),
    "Debe incluir al menos una letra y un número o símbolo",
  )
  .refine(
    (v) => !COMMON_PASSWORDS.has(v.toLowerCase().replace(/\s/g, "")),
    "Esa contraseña es demasiado común — elegí una más segura",
  );

/**
 * Variante opcional — para PATCH endpoints donde el password puede no
 * venir en el body (se usa para otros campos). Mismo policy si viene.
 */
export const newPasswordSchemaOptional = newPasswordSchema.optional();
