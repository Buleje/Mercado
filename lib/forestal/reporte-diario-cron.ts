import "server-only";
import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { ForestReporteDiarioDB } from "@/lib/db/forest-reporte-diario.db";
import { logger } from "@/lib/logger";
import { despacharReportesDiarios } from "./reporte-diario-envio";
import { esDisparoHoraExacta, relojLima } from "./reporte-diario";

/**
 * El handler del cron de reportes diarios (ADR-439), compartido por sus dos rutas.
 *
 * Si la llamada es la del disparador de la hora exacta (`/hora-exacta`), deja
 * su latido ANTES de despachar: el editor promete la hora exacta sólo mientras
 * ese latido esté fresco. Se espera (en Vercel lo no esperado puede morir con
 * la función) pero un fallo del latido no frena el despacho.
 */
export const cronReportesDiarios = withCronAuth("reportes-diarios", async (req) => {
  const ahora = new Date();
  const disparo = req.nextUrl.pathname.split("/").pop();
  if (esDisparoHoraExacta(req.nextUrl.pathname)) {
    await ForestReporteDiarioDB.marcarLatidoHoraExacta(ahora).catch((err) =>
      logger.warn("[reporte-diario] no se pudo guardar el latido de la hora exacta", { err: String(err).slice(0, 200) }),
    );
  }
  const resumen = await despacharReportesDiarios(ahora);
  return NextResponse.json({ ok: true, disparo, lima: relojLima(ahora), ...resumen });
});
