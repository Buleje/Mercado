import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { CamarasDB } from "@/lib/db/camaras.db";
import { CamarasHikConnectDB } from "@/lib/db/camaras-hik-connect.db";
import { FECHA_HIK, conCodigo } from "@/lib/camaras/hik-connect-api";
import { registrarMirada } from "@/lib/camaras/registro-miradas";
import { direccionDeVideo } from "@/lib/camaras/hik-connect-api.server";

/**
 * Lo que EZUIKit necesita para mostrar el video de una cámara enlazada con
 * Hik-Connect for Teams (ADR-471) — la parte que no es auth, compartida por
 * `POST /api/admin/camaras/[id]/en-vivo-nube` y el espejo del Modo TV
 * (ADR-473). Quien llama pone la guardia, el CSRF y el cupo, y dice QUIÉN mira
 * (una persona del panel o «Pantalla <nombre>») para el registro de miradas.
 *
 * Cuerpo: `{ tipo: "vivo" | "grabacion", calidad: "hd" | "sd", desde?, hasta? }`
 * (`desde`/`hasta` «YYYY-MM-DD HH:MM:SS», hora de la cámara, mismo día).
 * Respuesta: `{ url, accessToken, dominio, tipo, calidad, desde?, hasta?, conCodigo }`.
 */

const cuerpoSchema = z
  .object({
    tipo: z.enum(["vivo", "grabacion"]).default("vivo"),
    calidad: z.enum(["hd", "sd"]).default("sd"),
    desde: z.string().regex(FECHA_HIK).optional(),
    hasta: z.string().regex(FECHA_HIK).optional(),
  })
  .refine((b) => b.tipo === "vivo" || (b.desde && b.hasta), {
    message: "Falta el rango de la grabación.",
  });

export async function responderVideoNube(
  tenantId: string,
  id: string,
  raw: unknown,
  quien: { usuario: string; rol: string },
): Promise<NextResponse> {
  const parsed = cuerpoSchema.safeParse(raw);
  if (!parsed.success)
    return NextResponse.json(
      { error: "validation_error", message: "Elige fecha y hora de la grabación." },
      { status: 400 },
    );

  const camara = (await CamarasDB.list(tenantId)).find((c) => c.id === id);
  if (!camara)
    return NextResponse.json(
      { error: "not_found", message: "Esa cámara no existe." },
      { status: 404 },
    );
  const enlace = await CamarasHikConnectDB.enlaceParaVideo(tenantId, id);
  if (!enlace)
    return NextResponse.json(
      {
        error: "sin_enlace",
        message: "Esta cámara no está enlazada con Hik-Connect. Enlázala en la vista Cámaras.",
      },
      { status: 409 },
    );
  const cred = await CamarasHikConnectDB.credenciales(tenantId);
  if (!cred.ok)
    return NextResponse.json({ error: "sin_cuenta", message: cred.motivo }, { status: 409 });

  const p = parsed.data;
  const r = await direccionDeVideo(tenantId, cred.valor, {
    resourceId: enlace.resourceId,
    deviceSerial: enlace.deviceSerial,
    tipo: p.tipo,
    calidad: p.calidad,
    desde: p.desde,
    hasta: p.hasta,
    codigo: enlace.codigo,
  });
  if (!r.ok) {
    logger.info("[hik-connect] video rechazado", {
      tenantId,
      camaraId: id,
      codigo: r.error.codigo,
    });
    const status = r.error.tipo === "red" ? 502 : r.error.tipo === "limite" ? 429 : 422;
    return NextResponse.json(
      { error: "hikvision", codigo: r.error.codigo, message: r.error.mensaje },
      { status },
    );
  }
  /* Ley 29733: quién miró (sin permiso ni código). Si falla, el video igual sale. */
  void registrarMirada(
    tenantId,
    quien,
    { id, nombre: camara.nombre },
    { tipo: p.tipo, calidad: p.calidad, desde: p.desde, hasta: p.hasta },
  ).catch((err) => logger.warn("[camaras] mirada sin anotar", { error: String(err) }));
  return NextResponse.json(
    {
      url: conCodigo(r.valor.url, enlace.codigo),
      accessToken: r.valor.appToken,
      dominio: r.valor.dominioVideo,
      tipo: p.tipo,
      calidad: p.calidad,
      ...(p.tipo === "grabacion" && { desde: p.desde, hasta: p.hasta }),
      conCodigo: !!enlace.codigo,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
