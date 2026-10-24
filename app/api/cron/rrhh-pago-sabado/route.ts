import { NextResponse } from "next/server";
import { withCronHealth } from "@/lib/cron/with-cron-health";
import { PagosSemanaDB } from "@/lib/db/rrhh-pagos.db";
import type { ResultadoSincronizar } from "@/lib/db/notification-center.db";
import { dateDeFechaKey } from "@/lib/rrhh/fechas";
import { limaDateKey } from "@/lib/utils";
import { logger } from "@/lib/logger";

/**
 * El aviso del sábado de RRHH (Brandon 24-10: «Avisos de Pago al personal
 * todos los sábados»). Sábado 08:00 de Lima: por negocio con personal, la
 * campana de la gestión recibe «Hoy se paga: N trabajadores · S/ X neto · S/ Y
 * en adelantos a descontar», con el enlace a Asistencia. Domingo: ese aviso se
 * resuelve (ya no es «hoy»). Sólo AVISA: sin WhatsApp a los trabajadores.
 * Llamado otro día de la semana, no hace nada.
 */
export const GET = withCronHealth("rrhh-pago-sabado", async () => {
  const hoy = limaDateKey();
  const dia = dateDeFechaKey(hoy).getUTCDay();
  if (dia !== 6 && dia !== 0) return NextResponse.json({ ok: true, omitido: "no es sábado ni domingo", hoy });

  const tenants = await PagosSemanaDB.tenantsConPersonal();
  const total: ResultadoSincronizar & { negocios: number; fallidos: number; dia: "sabado" | "domingo" } = {
    dia: dia === 6 ? "sabado" : "domingo",
    negocios: tenants.length,
    fallidos: 0,
    creados: 0,
    actualizados: 0,
    sinCambios: 0,
    yaLeidos: 0,
    resueltos: 0,
  };

  for (const tenantId of tenants) {
    try {
      const r = dia === 6 ? await PagosSemanaDB.sincronizarAvisoDelSabado(tenantId, hoy) : await PagosSemanaDB.cerrarAvisoDelSabado(tenantId);
      total.creados += r.creados;
      total.actualizados += r.actualizados;
      total.sinCambios += r.sinCambios;
      total.yaLeidos += r.yaLeidos;
      total.resueltos += r.resueltos;
    } catch (err) {
      total.fallidos += 1;
      logger.error("[cron/rrhh-pago-sabado] negocio falló", { tenantId, err: String(err).slice(0, 300) });
    }
  }

  return NextResponse.json({ ok: true, ...total });
});
