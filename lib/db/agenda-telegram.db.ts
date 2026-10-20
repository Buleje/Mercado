import "server-only";

/**
 * AgendaTelegramDB — la config del resumen de la agenda por Telegram y la marca
 * de «este momento ya salió hoy», como subclaves de `admin_prefs` en
 * `Settings.featureFlagsJson` (sin schema, igual que las demás preferencias del
 * negocio). Lógica pura y nombres de claves: `lib/agenda/resumen-telegram.ts`.
 *
 * El dedupe es UNA sentencia: pisa la fecha sólo si la guardada es otra. Dos
 * disparos del cron a la vez → Postgres bloquea la fila y el segundo vuelve a
 * evaluar el WHERE con la fecha ya puesta: 0 filas, no manda (patrón del kiosko,
 * `rrhh-kiosko.db.ts`).
 */
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { AdminPreferencesDB } from "@/lib/db/admin-preferences.db";
import { SQL_PISAR_SUBCLAVES_FLAGS, SQL_SUBCLAVE_FLAGS } from "@/lib/db/settings.db";
import {
  CLAVE_CONFIG_TELEGRAM,
  MOMENTOS,
  claveEnviado,
  normalizarConfigTelegram,
  type ConfigResumenTelegram,
  type Momento,
} from "@/lib/agenda/resumen-telegram";
import type { FechaKey } from "@/lib/agenda/tipos";

/** La clave de `featureFlagsJson` donde vive `AdminPreferencesDB`. */
const PREFS = "admin_prefs";

/** $1 'admin_prefs' · $2 {marca: fecha} · $3 tenantId · $4 marca · $5 fecha: sólo si la marca guardada NO es esa fecha. */
const SQL_RESERVAR = `${SQL_PISAR_SUBCLAVES_FLAGS} AND COALESCE(${SQL_SUBCLAVE_FLAGS} ->> $4::text, '') <> $5::text`;
/** Igual, al revés: borra la marca sólo si sigue siendo la de esa fecha (no pisa un envío posterior). */
const SQL_SOLTAR = `${SQL_PISAR_SUBCLAVES_FLAGS} AND (${SQL_SUBCLAVE_FLAGS} ->> $4::text) = $5::text`;

function exigirTenant(tenantId: string): void {
  if (!tenantId) throw new Error("tenantId is required");
}

export interface EstadoResumenTelegram {
  config: ConfigResumenTelegram;
  /** Fecha de Lima del último envío de cada momento (`null` = nunca). */
  enviados: Record<Momento, FechaKey | null>;
}

export const AgendaTelegramDB = {
  async leer(tenantId: string): Promise<EstadoResumenTelegram> {
    exigirTenant(tenantId);
    const prefs = await AdminPreferencesDB.read(tenantId);
    const fecha = (m: Momento): FechaKey | null => {
      const v = prefs[claveEnviado(m)];
      return typeof v === "string" ? v : null;
    };
    return {
      config: normalizarConfigTelegram(prefs[CLAVE_CONFIG_TELEGRAM]),
      enviados: Object.fromEntries(MOMENTOS.map((m) => [m, fecha(m)])) as Record<Momento, FechaKey | null>,
    };
  },

  async guardarConfig(tenantId: string, config: ConfigResumenTelegram): Promise<void> {
    exigirTenant(tenantId);
    await AdminPreferencesDB.write(tenantId, { [CLAVE_CONFIG_TELEGRAM]: config });
  },

  /** `true` = este disparo se quedó con el envío de hoy; `false` = ya salió (u otro lo está mandando). */
  async reservarEnvio(tenantId: string, momento: Momento, fecha: FechaKey): Promise<boolean> {
    exigirTenant(tenantId);
    const marca = claveEnviado(momento);
    const n = await prisma.$executeRawUnsafe(SQL_RESERVAR, PREFS, JSON.stringify({ [marca]: fecha }), tenantId, marca, fecha);
    if (n > 0) invalidateByPrefix(`settings:${tenantId}`);
    return n > 0;
  },

  /** No llegó a ningún chat: suelta la marca para que el próximo disparo (dentro de la ventana) reintente. */
  async soltarEnvio(tenantId: string, momento: Momento, fecha: FechaKey): Promise<void> {
    exigirTenant(tenantId);
    const marca = claveEnviado(momento);
    const n = await prisma.$executeRawUnsafe(SQL_SOLTAR, PREFS, JSON.stringify({ [marca]: null }), tenantId, marca, fecha);
    if (n > 0) invalidateByPrefix(`settings:${tenantId}`);
  },
};
