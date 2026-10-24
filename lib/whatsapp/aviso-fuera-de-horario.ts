import "server-only";
import { logger } from "@/lib/logger";
import { redactPhone } from "@/lib/logger-pii";
import { WhatsAppFueraDeHorarioDB } from "@/lib/db/whatsapp-fuera-de-horario.db";
import { avisoQueToca } from "@/lib/whatsapp/fuera-de-horario";

/**
 * El webhook de WhatsApp lo llama con cada mensaje de un cliente: si el aviso
 * está prendido, la tienda está cerrada (hora de Lima) y a ese cliente no se le
 * avisó en las últimas 12 horas, le manda el texto del ajuste.
 *
 * Con el aviso apagado cuesta una lectura (los flags del negocio). El envío lo
 * pone el webhook (`enviar`) con el número y el token del negocio. Devuelve
 * qué pasó (`null` = no tocaba) para el log y los tests.
 */
export async function avisarSiEstaCerrado(args: {
  tenantId: string;
  phoneNumberId: string;
  customerPhone: string;
  customerName?: string;
  enviar: (texto: string) => Promise<boolean>;
  now?: Date;
}): Promise<"enviado" | "fallido" | null> {
  const { tenantId, customerPhone } = args;
  const now = args.now ?? new Date();
  const ajuste = await WhatsAppFueraDeHorarioDB.ajuste(tenantId);
  if (!ajuste.activo) return null;

  const [horario, ultimoAviso] = await Promise.all([
    WhatsAppFueraDeHorarioDB.horario(tenantId),
    WhatsAppFueraDeHorarioDB.ultimoAviso(tenantId, customerPhone, now),
  ]);
  const texto = avisoQueToca({ ajuste, horario, now, ultimoAviso });
  if (!texto) return null;

  const reserva = await WhatsAppFueraDeHorarioDB.reservar(tenantId, {
    phoneNumberId: args.phoneNumberId,
    customerPhone,
    customerName: args.customerName,
    texto,
    now,
  });
  if (!reserva) return null;

  const ok = await args.enviar(texto).catch((err) => {
    logger.warn("[whatsapp/fuera-de-horario] envío falló", { tenantId, to: redactPhone(customerPhone), error: String(err) });
    return false;
  });
  if (!ok) await WhatsAppFueraDeHorarioDB.marcarFallido(tenantId, reserva.id);
  logger.info("[whatsapp/fuera-de-horario] aviso de cerrado", { tenantId, to: redactPhone(customerPhone), ok });
  return ok ? "enviado" : "fallido";
}
