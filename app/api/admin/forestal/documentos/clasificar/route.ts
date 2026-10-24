import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { extractDocText } from "@/lib/documents/extraer-texto";
import { renderizarPaginaPdf } from "@/lib/documents/pdf-a-imagen";
import { transcribirImagen } from "@/lib/documents/transcribir-imagen";
import { clasificarDocumento } from "@/lib/forestal/documento-clasificar";
import { hayProveedorDeVision } from "@/lib/documents/modelo-vision";

/**
 * POST /api/admin/forestal/documentos/clasificar — qué papel es éste (ADR-372).
 *
 * Cierra la clasificación automática de los papeles del despacho: hasta acá el
 * navegador sólo podía leer texto plano, así que un PDF escaneado o una foto se
 * clasificaban por el nombre del archivo y quedaban marcados «revisá».
 *
 * Tres caminos, del más barato al más caro, y se corta en el primero que sirve:
 *   1. **Capa de texto** (PDF nativo, Word, Excel, .txt) — gratis y exacta.
 *   2. **Visión sobre la página 1** del PDF, si la capa vino vacía: eso es un
 *      escaneo.
 *   3. **Visión sobre la imagen**, para fotos del celular.
 *
 * No guarda nada: devuelve la clasificación para que la pantalla la proponga y
 * el operador confirme. El archivo se archiva después, por el camino de siempre.
 */

/** Tope del archivo a clasificar: leer 20 MB para adivinar una etiqueta no. */
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  /* La visión cuesta por llamada: el límite protege la cuota, no la sesión. */
  const rl = applyRateLimit(req, "MODERATE", "forestal-clasificar-doc");
  if (rl) return rl;

  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const ok = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
  if (!ok) return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });

  let archivo: File | null = null;
  try {
    const fd = await req.formData();
    const f = fd.get("file");
    archivo = f instanceof File ? f : null;
  } catch (e) {
    logger.warn("[forestal.clasificar] formData ilegible", { err: String(e) });
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }
  if (!archivo) return NextResponse.json({ error: "file_required" }, { status: 400 });
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el clasificador acepta hasta 20 MB.` },
      { status: 413 },
    );
  }

  const buf = new Uint8Array(await archivo.arrayBuffer());
  const mime = archivo.type || "application/octet-stream";
  let texto = "";
  let fuente: "texto" | "vision-pdf" | "vision-imagen" | "ninguna" = "ninguna";
  /**
   * Por qué no se pudo leer el papel.
   *
   * «No pude» sin motivo manda a adivinar entre tres cosas muy distintas: que no
   * haya modelo de visión configurado, que la página no se haya podido dibujar,
   * o que el modelo haya mirado y no devuelto nada. Las tres se arreglan de
   * manera diferente y sólo una es culpa del papel.
   */
  let porQue: string | null = null;

  try {
    texto = (await extractDocText(buf, mime)).trim();
    if (texto) fuente = "texto";
  } catch (e) {
    /* Un PDF roto no puede tumbar la clasificación: se sigue por visión y, si
       tampoco, por el nombre. */
    logger.warn("[forestal.clasificar] sin capa de texto", { mime, err: String(e) });
  }

  /* Sin capa de texto hay que MIRARLO. Es lo que separa «clasificado por el
     nombre del archivo» de «clasificado por lo que dice el papel». */
  if (!texto) {
    if (!hayProveedorDeVision()) {
      porQue = "No hay modelo de visión configurado (DOC_VISION_BASE_URL): el papel se clasificó por el nombre.";
    } else {
      try {
        if (mime === "application/pdf") {
          let falloRender: string | null = null;
          const png = await renderizarPaginaPdf(buf, 1, (m) => { falloRender = m; });
          if (!png) {
            porQue = `No se pudo dibujar la página 1 del PDF para mirarla${falloRender ? `: ${falloRender}` : ""}.`;
          } else {
            const leido = await transcribirImagen(png, "image/png");
            if (leido) { texto = leido; fuente = "vision-pdf"; }
            else porQue = "Se dibujó la página pero el modelo no devolvió texto (¿tardó de más?).";
          }
        } else if (mime.startsWith("image/")) {
          const leido = await transcribirImagen(Buffer.from(buf), mime);
          if (leido) { texto = leido; fuente = "vision-imagen"; }
          else porQue = "El modelo miró la imagen y no devolvió texto.";
        } else {
          porQue = "Este tipo de archivo no trae texto ni se puede mirar.";
        }
      } catch (e) {
        porQue = "La lectura del papel falló: " + (e instanceof Error ? e.message : String(e));
        logger.warn("[forestal.clasificar] visión no disponible", { mime, err: String(e) });
      }
    }
  }

  const clasificacion = clasificarDocumento(archivo.name, texto);
  return NextResponse.json({
    ...clasificacion,
    fuente,
    /* Cuánto se pudo leer: con 0 el operador sabe que la etiqueta salió del
       nombre y que conviene mirarla. */
    caracteres: texto.length,
    porQue,
  });
}
