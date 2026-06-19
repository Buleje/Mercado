import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * ensureTable — reemplaza el patrón "CREATE TABLE en runtime" (bootstrap) de
 * algunos módulos. En Postgres 15+/Supabase el rol del pooler NO tiene CREATE
 * en el schema `public`, así que correr DDL en runtime tira `42501 permission
 * denied for schema public` y rompe el endpoint con 500.
 *
 * Estrategia:
 *  1. Si la tabla ya existe (gestionada por migración) → no corremos DDL.
 *     `to_regclass` es un SELECT, para el que el rol siempre tiene permiso.
 *  2. Si no existe y SÍ hay permiso → corremos el DDL (envs locales/legacy).
 *  3. Si no existe y NO hay permiso → avisamos y seguimos; la query siguiente
 *     dará un error claro de "relation does not exist" en vez del confuso
 *     "permission denied for schema public".
 *
 * @param table nombre de la tabla (case-sensitive, sin comillas)
 * @param ddl   sentencias DDL idempotentes (CREATE TABLE/INDEX IF NOT EXISTS…)
 * @param label etiqueta para logs (ej. "payment-approval")
 */
export async function ensureTable(table: string, ddl: string, label: string): Promise<void> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ reg: string | null }>>(
      "SELECT to_regclass($1)::text AS reg",
      `"${table}"`,
    );
    if (rows?.[0]?.reg) return; // ya existe → no correr DDL
  } catch {
    // si el chequeo falla por algún motivo, intentamos el DDL igual
  }

  try {
    await prisma.$executeRawUnsafe(ddl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("permission denied") || msg.includes("42501")) {
      logger.warn(`[${label}] DDL de bootstrap omitido (sin permiso de CREATE; tabla gestionada por migración)`);
      return;
    }
    logger.error(`[${label}] bootstrap failed`, { error: msg });
    throw err;
  }
}
