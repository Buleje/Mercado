import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { CamarasDB } from "@/lib/db/camaras.db";
import { descifrarSecreto } from "@/lib/cripto-secretos";
import { urlRtsp } from "@/lib/camaras/isapi";
import {
  asegurarStream,
  esperarPrimerSegmento,
  estadoDeStream,
  hayFfmpeg,
  leerArchivoDeStream,
  nombreDeArchivoValido,
} from "@/lib/camaras/hls";

/**
 * Video en vivo de una cámara (ADR-421).
 *
 * Tres pedidos sobre la misma ruta:
 *  · `GET .../vivo`            → dice si esta instalación puede dar video y arranca el stream.
 *  · `GET .../vivo/vivo.m3u8`  → la lista de reproducción.
 *  · `GET .../vivo/s001.ts`    → cada pedazo de video.
 *
 * El reproductor del navegador pide los dos últimos por su cuenta, así que
 * **cada pedido de segmento cuenta como «alguien sigue mirando»**: es lo que
 * mantiene vivo el `ffmpeg`. Cuando el operario cierra la pestaña dejan de
 * llegar pedidos y el stream se apaga solo a los 30 segundos.
 *
 * Por qué no se sirve el RTSP directo al navegador: ningún navegador reproduce
 * RTSP, y la URL lleva la clave de la cámara adentro. Acá la clave nunca sale
 * del servidor.
 */

/** La clave del stream incluye el tenant: dos negocios con la misma cámara no se pisan. */
const claveDeStream = (tenantId: string, camaraId: string) => `${tenantId}:${camaraId}`;

export const GET = withApiHandler(
  "camaras-vivo",
  async (req: NextRequest, ctx: { params: Promise<{ id: string; archivo?: string[] }> }) => {
    const auth = await requireAdmin(req, ["admin", "owner", "almacenero"]);
    if (auth instanceof NextResponse) return auth;
    /* Generoso a propósito: un reproductor pide un segmento cada dos segundos
       y con el tope normal se quedaría sin video a los pocos minutos. */
    const rl = await applyRateLimit(req, "GENEROUS", "camaras-vivo");
    if (rl) return rl;

    const { id, archivo } = await ctx.params;
    const nombre = archivo?.[0];

    const camara = (await CamarasDB.list(auth.tenantId)).find((c) => c.id === id);
    if (!camara) return NextResponse.json({ error: "Esa cámara no existe." }, { status: 404 });

    const conexion = camara.conexion;
    if (!conexion)
      return NextResponse.json(
        {
          error: "Esta cámara todavía no está conectada.",
          comoSeArregla: "Conéctala con su dirección, usuario y clave para poder verla en vivo.",
        },
        { status: 409 },
      );

    const clave = claveDeStream(auth.tenantId, id);

    /* Un pedido de segmento no vuelve a armar la URL RTSP: el stream ya está
       corriendo y sólo hay que leer del disco. Es el 99 % de los pedidos. */
    if (nombre) {
      if (!nombreDeArchivoValido(nombre))
        return NextResponse.json({ error: "Archivo no válido." }, { status: 400 });
      const leido = await leerArchivoDeStream(clave, nombre);
      if (!leido.ok) return NextResponse.json({ error: leido.motivo }, { status: 404 });
      return new NextResponse(new Uint8Array(leido.datos), {
        status: 200,
        headers: {
          "Content-Type": leido.tipo,
          /* Los segmentos cambian todo el tiempo y la lista se reescribe cada
             dos segundos: cachear cualquiera de los dos congela la imagen. */
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Content-Length": String(leido.datos.length),
        },
      });
    }

    // ── Arranque: `GET .../vivo` ──────────────────────────────────────────
    if (!(await hayFfmpeg()))
      return NextResponse.json(
        {
          disponible: false,
          motivo:
            "Esta instalación no tiene ffmpeg, así que no puede dar video fluido. Sigues viendo la cámara con las fotos que se refrescan solas.",
        },
        { status: 200 },
      );

    const secreto = descifrarSecreto(conexion.claveCifrada);
    if (secreto === null)
      return NextResponse.json(
        {
          disponible: false,
          motivo: "No se pudo leer la clave guardada de la cámara. Vuelve a conectarla.",
        },
        { status: 409 },
      );

    const rtsp = urlRtsp(
      {
        host: conexion.host,
        puerto: conexion.puerto,
        usuario: conexion.usuario,
        clave: secreto,
        https: conexion.https,
        canal: conexion.canal,
      },
      /* El flujo secundario: menos resolución, arranca antes y casi siempre es
         H.264 —el principal puede venir en H.265, que el navegador no toca—. */
      "baja",
    );

    const arranque = await asegurarStream(clave, rtsp);
    if (!arranque.ok) return NextResponse.json({ disponible: false, motivo: arranque.motivo }, { status: 200 });

    /* Se espera al primer pedazo antes de contestar: si el reproductor pide la
       lista y todavía no existe, se rinde y muestra un error sobre un video
       que iba a funcionar dos segundos después. */
    const listo = await esperarPrimerSegmento(clave);
    if (!listo) {
      const estado = estadoDeStream(clave);
      return NextResponse.json(
        {
          disponible: false,
          motivo: estado?.error ?? "La cámara no entregó video a tiempo.",
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { disponible: true, lista: `/api/admin/camaras/${id}/vivo/vivo.m3u8` },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  },
);
