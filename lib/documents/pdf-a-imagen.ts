import "server-only";
import { logger } from "@/lib/logger";
import { asegurarFuentesPdf } from "./miniatura-doc";

/**
 * pdf-a-imagen — convertir una página de PDF en una foto, para poder MIRARLA.
 *
 * Media contabilidad peruana llega así: la factura se escanea y el escáner
 * guarda un PDF que por dentro es una foto. Extraerle texto devuelve nada, y
 * hasta ahora ese documento quedaba invisible para el buscador y para el
 * asistente —el drive contestaba "no pude extraer texto" y ahí moría—.
 *
 * Dibujando la página se la puede pasar por el mismo camino de visión que una
 * foto de celular. Es la misma tubería que la miniatura de la tarjeta, sólo que
 * con más resolución: el modelo tiene que poder LEER, no sólo reconocer.
 */

/** Escala del dibujo: menos, y el modelo confunde los números. */
const ESCALA_LECTURA = 2;

export async function renderizarPaginaPdf(
  datos: Buffer | Uint8Array,
  pagina = 1,
  /**
   * Qué salió mal, para quien pueda hacer algo con eso.
   *
   * El log queda en el servidor y el que sube el papel ve «no se pudo leer» sin
   * saber si el problema es el archivo o la instalación. Quien llama decide si
   * lo muestra.
   */
  onError?: (motivo: string) => void,
): Promise<Buffer | null> {
  try {
    // Sin las fuentes estándar registradas, pdf.js dibuja una página de
    // cuadraditos y el modelo "lee" un documento vacío.
    await asegurarFuentesPdf(datos);
    const { renderPageAsImage } = await import("unpdf");
    const png = (await renderPageAsImage(new Uint8Array(datos), pagina, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: ESCALA_LECTURA,
    })) as ArrayBuffer;
    return png ? Buffer.from(png) : null;
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    logger.warn("documents.pdf_a_imagen.fallo", { pagina, err: motivo });
    onError?.(motivo);
    return null;
  }
}
