import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { applyRateLimit, createRateLimiter } from "@/lib/rate-limit";
import { PantallasTvDB } from "@/lib/db/pantallas-tv.db";
import { consultarParTv, consumirParTv } from "@/lib/camaras/tv-emparejar.server";
import { emitirCookieTv } from "@/lib/camaras/tv-auth.server";
import {
  TV_HEADER_SECRETO,
  codigoTvValido,
  normalizarCodigoTv,
  type TvEstadoRespuesta,
} from "@/lib/camaras/pantallas-tv";

/**
 * GET /api/tv/estado?codigo= + header `x-tv-secreto` — SIN sesión (ADR-473).
 * El TV pregunta cada `TV_SONDEO_MS` si ya lo vincularon. El secreto va en un
 * header y no en la URL: no queda en logs de proxy ni en el historial.
 *
 *  · 200 `{ estado: "esperando" }` — todavía nadie escribió el código.
 *  · 200 `{ estado: "vencido" }` — el código no existe, venció, ya se usó, la
 *    pantalla se borró o el secreto no es el de este código: la MISMA
 *    respuesta para todo, así no se puede saber qué códigos están vivos.
 *  · 200 `{ estado: "vinculada", pantalla: { nombre, expiraEn } }` — con la
 *    pantalla confirmada, borra el par (un solo uso) y deja la cookie `buleje-tv`.
 *  · 400 — faltan o sobran caracteres.
 *
 * Cupo por IP generoso: 30 sondeos por minuto es lo normal de UN televisor.
 */
const sondeos = createRateLimiter({ maxRequests: 120, windowMs: 60_000 });

const pedidoSchema = z.object({
  codigo: z.string().max(20).transform(normalizarCodigoTv).refine(codigoTvValido),
  secreto: z.string().min(20).max(128),
});

const responder = (cuerpo: TvEstadoRespuesta | { error: string }, status = 200) =>
  NextResponse.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

export const GET = withApiHandler("tv-estado", async (req: NextRequest) => {
  const rl = applyRateLimit(req, sondeos);
  if (rl) return rl;
  const q = pedidoSchema.safeParse({
    codigo: new URL(req.url).searchParams.get("codigo") ?? "",
    secreto: req.headers.get(TV_HEADER_SECRETO) ?? "",
  });
  if (!q.success) return responder({ error: "validation_error" }, 400);

  const r = await consultarParTv(q.data.codigo, q.data.secreto);
  if (r.tipo !== "vinculada") return responder({ estado: r.tipo });

  /* Primero se confirma la pantalla; recién después se consume el código. */
  const pantalla = await PantallasTvDB.buscarParaTv(r.tid, r.pid);
  if (!pantalla) {
    /* La revocaron (o venció) entre que el dueño la vinculó y el TV preguntó:
       el código ya no sirve para nada. */
    await consumirParTv(q.data.codigo);
    return responder({ estado: "vencido" });
  }
  /* Sólo el pedido que borró el par recibe la credencial: un segundo sondeo
     simultáneo del mismo TV ve «vinculada» sin cookie (la del primero basta). */
  const consumido = await consumirParTv(q.data.codigo);
  const res = responder({ estado: "vinculada", pantalla: { nombre: pantalla.nombre, expiraEn: pantalla.expiraEn } });
  return consumido ? emitirCookieTv(res, { tid: r.tid, pid: pantalla.id, expiraEn: pantalla.expiraEn }) : res;
});
