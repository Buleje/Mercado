import "server-only";
import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { despacharReportesDiarios } from "./reporte-diario-envio";
import { relojLima } from "./reporte-diario";

/** El handler del cron de reportes diarios (ADR-439), compartido por sus dos rutas. */
export const cronReportesDiarios = withCronAuth("reportes-diarios", async (req) => {
  const ahora = new Date();
  const resumen = await despacharReportesDiarios(ahora);
  return NextResponse.json({ ok: true, disparo: req.nextUrl.pathname.split("/").pop(), lima: relojLima(ahora), ...resumen });
});
