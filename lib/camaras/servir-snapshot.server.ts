import "server-only";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { CamarasDB } from "@/lib/db/camaras.db";
import { textoDeFalla } from "@/lib/camaras/camaras";
import { traerSnapshot } from "@/lib/camaras/isapi";

/**
 * La foto de AHORA de una cámara — la parte que no es auth, compartida por
 * `GET /api/admin/camaras/[id]/snapshot` y el espejo del Modo TV (ADR-473).
 * `usuario` es quién queda anotado si cambia el estado de la conexión.
 *
 * Es la forma más barata de «verla en vivo»: una imagen que la pantalla vuelve
 * a pedir cada par de segundos. No hay transcodificación, no hay ffmpeg y no
 * hay nada que se quede corriendo; si el operario cierra la pestaña, dejan de
 * llegar pedidos y se terminó. El video fluido (HLS) es otra ruta y otro costo.
 *
 * ## Lo que se cuida acá
 *
 *  · **El JPEG se sirve tal cual.** Re-codificarlo costaría CPU en cada cuadro
 *    y no agrega nada: no se guarda en ningún lado, va del aparato al ojo. Lo
 *    que sí se controla es el `Content-Type`: se acepta sólo una lista corta,
 *    porque el encabezado lo dice la cámara y no se le cree a un aparato.
 *  · **`no-store`.** Una foto del patio cacheada es un patio que se ve como
 *    estaba hace diez minutos — justo lo contrario de «en vivo».
 *  · **La clave nunca sale.** Se descifra dentro de este handler, se usa y se
 *    va con él. Ni en la respuesta, ni en un log, ni en un mensaje de error.
 *  · **El destino se revalida** en cada pedido (lista de bloqueo + DNS): una
 *    conexión guardada hace un mes puede apuntar hoy a otra cosa.
 */

/** Lo único que puede devolver una cámara. Si dice otra cosa, se sirve como JPEG. */
const TIPOS_DE_IMAGEN = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/** Qué código le corresponde a cada motivo. Config nuestra ≠ cámara muda. */
const ESTADO: Record<string, number> = {
  "no-existe": 404,
  /* 409 = «hay algo que arreglar de este lado»: falta conectar, la dirección
     quedó fuera de lo permitido o la clave guardada ya no se puede leer. */
  "sin-configurar": 409,
  bloqueado: 409,
  credenciales: 409,
};

export async function responderSnapshot(tenantId: string, id: string, usuario: string): Promise<NextResponse> {
  const cred = await CamarasDB.credenciales(tenantId, id);
  if (!cred.ok) {
    return NextResponse.json(
      {
        error: cred.motivo,
        message: cred.detalle,
        /* El consejo cambia con el motivo: a una cámara que no existe no se
           la «vuelve a conectar». */
        comoSeArregla:
          cred.motivo === "sin-configurar"
            ? "Entra a Cámaras, toca «Conectar» y carga la dirección IP, el usuario y la clave del aparato."
            : cred.motivo === "no-existe"
              ? "Vuelve a la lista de cámaras: ésta ya no está."
              : "Vuelve a conectar la cámara con su dirección, usuario y clave.",
      },
      { status: ESTADO[cred.motivo] ?? 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  const foto = await traerSnapshot(cred.credenciales);
  const anotada = cred.camara.conexion?.ultimaFalla ?? null;
  if (!foto.ok) {
    /* Se anota la falla SÓLO cuando cambia de estado: la pantalla pide una
       foto cada dos segundos y escribir en cada intento fallido convertiría
       una cámara apagada en un bucle de escrituras al KV. */
    if (anotada?.motivo !== foto.motivo) {
      await CamarasDB.registrarPrueba(
        tenantId,
        id,
        { ok: false, motivo: foto.motivo, detalle: foto.detalle, en: new Date().toISOString() },
        usuario,
      ).catch((err) =>
        logger.error("[camaras.snapshot] no se pudo anotar la falla", { error: String(err), tenantId }),
      );
    }
    /* El detalle NUNCA lleva la clave: `traerSnapshot` sólo devuelve el
       motivo y el texto del aparato. */
    logger.warn("[camaras.snapshot] la cámara no entregó imagen", {
      tenantId,
      camaraId: id,
      motivo: foto.motivo,
    });
    return NextResponse.json(
      { error: foto.motivo, message: textoDeFalla(foto.motivo, foto.detalle), detalle: foto.detalle },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  /* Volvió a contestar: se limpia la falla vieja para que la lista deje de
     decir «no contesta» sin que nadie tenga que tocar «Probar». */
  if (anotada) {
    await CamarasDB.registrarPrueba(
      tenantId,
      id,
      {
        ok: true,
        en: new Date().toISOString(),
        info: {
          modelo: cred.camara.conexion?.modelo ?? null,
          firmware: cred.camara.conexion?.firmware ?? null,
          serie: cred.camara.conexion?.serie ?? null,
          soportaPtz: cred.camara.conexion?.soportaPtz ?? false,
        },
      },
      usuario,
    ).catch((err) =>
      logger.error("[camaras.snapshot] no se pudo limpiar la falla", { error: String(err), tenantId }),
    );
  }

  const tipo = TIPOS_DE_IMAGEN.has(foto.valor.tipo.toLowerCase()) ? foto.valor.tipo.toLowerCase() : "image/jpeg";
  /* `Buffer.from` copia los bytes, no los vuelve a codificar: lo que llegó de
     la cámara es exactamente lo que se entrega. */
  const bytes = Buffer.from(foto.valor.jpeg);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": tipo === "image/jpg" ? "image/jpeg" : tipo,
      "Content-Length": String(bytes.length),
      /* Sin caché en ningún tramo: esto es «ahora» o no sirve. */
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
