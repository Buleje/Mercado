import "server-only";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { SettingsDB } from "@/lib/db/settings.db";
import { WhatsAppMessagesDB } from "@/lib/db/whatsapp-messages.db";
import type { StoreHours } from "@/lib/marketplace-store-hours";
import {
  CLAVE_AJUSTE,
  HORAS_ENTRE_AVISOS,
  horarioValido,
  leerAjuste,
  type AjusteFueraDeHorario,
} from "@/lib/whatsapp/fuera-de-horario";

/**
 * Lo que el aviso de «estamos cerrados» lee y escribe.
 *
 * Sin columna nueva: el ajuste va en `Settings.featureFlagsJson` (por clave, con
 * `pisarClavesFlags`: no revive lo que otro cambió en el medio) y el «ya se le
 * avisó» es el propio mensaje en la bandeja (`WhatsAppMessage`), marcado en
 * `waMessageId` con `aviso-cerrado:<tenant>:<teléfono>:<tramo de 12 h>`. Ese
 * campo es único: si dos mensajes del mismo cliente llegan juntos, sólo uno
 * reserva el aviso. El único write extra es el propio mensaje (que la bandeja
 * guardaría igual).
 */

const PREFIJO = "aviso-cerrado:";
const MS_TRAMO = HORAS_ENTRE_AVISOS * 3_600_000;

export const WhatsAppFueraDeHorarioDB = {
  async ajuste(tenantId: string): Promise<AjusteFueraDeHorario> {
    return leerAjuste(await SettingsDB.getFeatureFlags(tenantId));
  },

  async guardar(tenantId: string, ajuste: AjusteFueraDeHorario): Promise<void> {
    await SettingsDB.pisarClavesFlags(tenantId, { [CLAVE_AJUSTE]: ajuste });
  },

  /** El horario de la tienda (Marketplace › Tienda › Horario); `null` si no hay. */
  async horario(tenantId: string): Promise<StoreHours | null> {
    // `hoursJson` vive en la base pero no en el schema de Prisma (ver stores.db.ts).
    const filas = await prisma.$queryRawUnsafe<{ hoursJson: unknown }[]>(
      `SELECT "hoursJson" FROM "Store" WHERE "tenantId" = $1 LIMIT 1`,
      tenantId,
    );
    const crudo = filas[0]?.hoursJson;
    if (typeof crudo === "string") {
      try {
        return horarioValido(JSON.parse(crudo));
      } catch {
        return null;
      }
    }
    return horarioValido(crudo);
  },

  /** Cuándo se le mandó el último aviso a este cliente en las últimas 12 horas. */
  async ultimoAviso(tenantId: string, customerPhone: string, now: Date): Promise<Date | null> {
    const fila = await prisma.whatsAppMessage.findFirst({
      where: {
        tenantId,
        customerPhone,
        direction: "out",
        waMessageId: { startsWith: `${PREFIJO}${tenantId}:` },
        createdAt: { gte: new Date(now.getTime() - MS_TRAMO) },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return fila?.createdAt ?? null;
  },

  /**
   * Deja el aviso en la bandeja ANTES de mandarlo: es la reserva. `null` = otro
   * mensaje del mismo cliente ya lo reservó en este tramo (no se manda dos veces).
   */
  async reservar(
    tenantId: string,
    datos: { phoneNumberId: string; customerPhone: string; customerName?: string; texto: string; now: Date },
  ): Promise<{ id: string } | null> {
    const tramo = Math.floor(datos.now.getTime() / MS_TRAMO);
    const fila = await WhatsAppMessagesDB.append(tenantId, {
      phoneNumberId: datos.phoneNumberId,
      customerPhone: datos.customerPhone,
      customerName: datos.customerName,
      direction: "out",
      sentBy: "ai",
      body: datos.texto,
      waMessageId: `${PREFIJO}${tenantId}:${datos.customerPhone}:${tramo}`,
      status: "sent",
    });
    return fila ? { id: fila.id } : null;
  },

  /** Meta no lo aceptó: la bandeja lo muestra como fallido. */
  async marcarFallido(tenantId: string, id: string): Promise<void> {
    await prisma.whatsAppMessage.updateMany({ where: { id, tenantId }, data: { status: "failed" } });
    invalidateByPrefix(`whatsapp-inbox:${tenantId}`);
  },
};
