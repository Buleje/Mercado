import "server-only";
import { NextResponse } from "next/server";
import { CamarasDB } from "@/lib/db/camaras.db";
import { descifrarSecreto } from "@/lib/cripto-secretos";
import { urlRtsp } from "@/lib/camaras/isapi";
import type { ConexionCamara } from "@/lib/camaras/camaras";
import { abrirVivo, hayFfmpeg, leerOReabrir, nombreDeArchivoValido } from "@/lib/camaras/hls";

/**
 * Video en vivo de una cámara (ADR-470) — la parte que no es auth, compartida
 * por `/api/admin/camaras/[id]/vivo` y su espejo del Modo TV
 * `/api/tv/camaras/[id]/vivo` (ADR-473). Cada ruta pone su guardia y su cupo
 * y después llama a `responderVivo` con el negocio que sacó de SU credencial.
 *
 * Tres pedidos sobre la misma ruta:
 *  · `GET .../vivo`            → dice si esta instalación puede dar video y arranca el stream.
 *  · `GET .../vivo/vivo.m3u8`  → la lista de reproducción.
 *  · `GET .../vivo/s001.ts`    → cada pedazo de video.
 *
 * El reproductor del navegador pide los dos últimos por su cuenta, así que
 * **cada pedido de segmento cuenta como «alguien sigue mirando»**: es lo que
 * mantiene vivo el `ffmpeg`. Cuando el operario cierra la pestaña dejan de
 * llegar pedidos y el stream se apaga solo a los 30-40 segundos; si vuelve
 * después, el pedido de la lista lo levanta de nuevo (ADR-470).
 *
 * Por qué no se sirve el RTSP directo al navegador: ningún navegador reproduce
 * RTSP, y la URL lleva la clave de la cámara adentro. Acá la clave nunca sale
 * del servidor.
 */

/**
 * La clave del stream incluye el tenant: dos negocios con la misma cámara no
 * se pisan. Panel y TV del MISMO negocio comparten el stream (un solo ffmpeg).
 */
const claveDeStream = (tenantId: string, camaraId: string) => `${tenantId}:${camaraId}`;
/** La URL RTSP con la clave adentro, o `null` si la clave guardada no se descifra. */
function rtspDe(conexion: ConexionCamara): string | null {
  const secreto = descifrarSecreto(conexion.claveCifrada);
  if (secreto === null) return null;
  return urlRtsp(
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
}

/**
 * Responde `GET <baseApi>/<id>/vivo[/<archivo>]`. `baseApi` es la base de la
 * ruta que llamó (`/api/admin/camaras` o `/api/tv/camaras`): la lista que se
 * devuelve apunta a la MISMA puerta por la que entró el pedido.
 */
export async function responderVivo(
  tenantId: string,
  id: string,
  nombre: string | undefined,
  baseApi: string,
): Promise<NextResponse> {
  const camara = (await CamarasDB.list(tenantId)).find((c) => c.id === id);
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

  const clave = claveDeStream(tenantId, id);

  /* Un pedido de segmento no vuelve a armar la URL RTSP: el stream ya está
     corriendo y sólo hay que leer del disco. Es el 99 % de los pedidos. La
     lista sí puede revivir el stream si el barrido lo apagó (ver `leerOReabrir`). */
  if (nombre) {
    if (!nombreDeArchivoValido(nombre))
      return NextResponse.json({ error: "Archivo no válido." }, { status: 400 });
    const leido = await leerOReabrir(clave, nombre, () => rtspDe(conexion));
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

  const rtsp = rtspDe(conexion);
  if (rtsp === null)
    return NextResponse.json(
      {
        disponible: false,
        motivo: "No se pudo leer la clave guardada de la cámara. Vuelve a conectarla.",
      },
      { status: 409 },
    );

  const abierto = await abrirVivo(clave, rtsp);
  if (!abierto.ok) return NextResponse.json({ disponible: false, motivo: abierto.motivo }, { status: 200 });

  return NextResponse.json(
    { disponible: true, lista: `${baseApi}/${id}/vivo/vivo.m3u8` },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
