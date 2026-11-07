import { NextResponse } from "next/server";
import { z } from "zod";
import { withCronAuth } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { AsistenciaDB } from "@/lib/db/rrhh-asistencia.db";
import { aColaboradorMinDTO } from "@/lib/rrhh/dto";
import { fechaKeyDeDate, sumarDias } from "@/lib/rrhh/fechas";
import { VENTANA_ULTIMO_MARCADO_DIAS, decidirAvisoLista, esperadosEseDia, minutosDeLima, textoAvisoLista, ultimoDiaMarcado } from "@/lib/rrhh/aviso-pasar-lista";

const consultaSchema = z.object({
  tenantId: z.string().trim().min(1).max(60),
  nombre: z.string().trim().min(1).max(60).default("el negocio"),
  enlace: z.string().trim().max(300).default(""),
  /** `1` = no esperar a las 9:00 (pruebas en seco). */
  sinHora: z.enum(["0", "1"]).default("0"),
});

/**
 * GET /api/cron/rrhh-aviso-lista?tenantId=&nombre=&enlace= — «¿toca avisar que nadie marcó hoy?».
 * Sólo decide y arma el texto: el que manda el Telegram es el timer local
 * (`scripts/aviso-asistencia-lista.sh`). Auth: Bearer CRON_SECRET, como los demás crons.
 */
export const GET = withCronAuth("rrhh-aviso-lista", async (req) => {
  const q = consultaSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return NextResponse.json({ error: "validation_error" }, { status: 422 });
  const { tenantId, nombre, enlace, sinHora } = q.data;

  const ahora = new Date();
  const fecha = limaDateKey(ahora);
  try {
    // Ventana larga: de paso se ve cuál fue el último día con marcas («último día marcado: 27-10»).
    const { colaboradores, marcas } = await AsistenciaDB.hoja(tenantId, sumarDias(fecha, -VENTANA_ULTIMO_MARCADO_DIAS), fecha);
    const esperados = esperadosEseDia(colaboradores.map(aColaboradorMinDTO), fecha);
    const fechasConMarca = marcas.map((m) => fechaKeyDeDate(m.fecha));
    const marcasHoy = fechasConMarca.filter((f) => f === fecha).length;
    const ultimo = ultimoDiaMarcado(fechasConMarca, fecha);
    const { avisar, motivo } = decidirAvisoLista({
      fecha,
      minutosLima: sinHora === "1" ? 24 * 60 : minutosDeLima(ahora),
      esperados: esperados.length,
      marcasHoy,
    });
    return NextResponse.json({
      avisar,
      motivo,
      fecha,
      esperados: esperados.length,
      marcasHoy,
      ultimoMarcado: ultimo,
      texto: avisar ? textoAvisoLista(nombre, esperados.length, enlace, ultimo ? { fecha: ultimo, hoy: fecha } : null) : null,
    });
  } catch (e) {
    logger.error("[cron/rrhh-aviso-lista] falló", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
});
