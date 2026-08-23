import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import {
  esNumeroRegistroValido,
  normalizarNumeroRegistro,
} from "@/lib/forestal/serfor-gtf";
import { consultarGtfEnSerfor } from "@/lib/forestal/serfor-gtf-fetch";

/**
 * GET /api/admin/forestal/gtf/serfor?numeroRegistro=461363
 *
 * Consulta la guía en la base de SERFOR (consulta pública del SNIFFS, la misma
 * que hay detrás del QR impreso en la GTF) y devuelve sus datos para precargar
 * el ingreso, o para verificar una guía que este libro mismo emitió.
 *
 * Sale a la red desde el SERVIDOR, no desde el navegador: el sitio de SERFOR no
 * manda CORS, así que un fetch del cliente moriría; y de paso el timeout, el
 * rate limit y la caché quedan en un solo lugar.
 *
 * Nunca inventa datos: si SERFOR dice que no encontró la guía, eso viaja tal
 * cual al operador (`estado: "no_encontrada"` + el mensaje de ellos). Registrar
 * madera con datos adivinados es exactamente lo que el libro debe impedir.
 */

const Query = z.object({
  numeroRegistro: z.string().trim().min(1).max(30),
});

export async function GET(req: NextRequest) {
  try {
    // Preset de lectura: consultar una guía es barato y se hace varias veces
    // mientras se carga un camión, pero el servicio es de un tercero.
    const rl = await applyRateLimit(req, "DRIVE_IA", "forestal:gtf-serfor");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    // Ambos libros emiten su propia GTF de salida y la verifican acá — CTP
    // desde su despacho, LO-TH desde el suyo (ForestGtf).
    const [ctpHabilitado, lothHabilitado] = await Promise.all([
      isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"),
      isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"),
    ]);
    if (!ctpHabilitado && !lothHabilitado) {
      return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
    }

    const parsed = Query.safeParse({ numeroRegistro: req.nextUrl.searchParams.get("numeroRegistro") ?? "" });
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues }, { status: 400 });
    }
    const numero = normalizarNumeroRegistro(parsed.data.numeroRegistro);
    if (!esNumeroRegistroValido(numero)) {
      return NextResponse.json(
        {
          error: "numero_invalido",
          message: "El N° de registro va con sus guiones, como lo imprime la guía. Ejemplo: 2-25-0002326.",
        },
        { status: 400 },
      );
    }

    const consulta = await consultarGtfEnSerfor(numero);
    if (!consulta.ok) {
      return NextResponse.json({ estado: "sin_respuesta", mensaje: consulta.mensaje, gtf: null });
    }
    return NextResponse.json({
      ...consulta.resultado,
      numeroConsultado: numero,
      consultadoEn: new Date().toISOString(),
      fuente: "SNIFFS · Consulta pública de GTF",
      cache: consulta.cache,
    });
  } catch (e) {
    logger.error("[gtf.serfor] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
