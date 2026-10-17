import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";
import { familiaDe } from "@/lib/documents/tipos-archivo";
import {
  asegurarFuentesPdf, dibujarDocumento, dibujarPlanilla, filasDePlanilla, lineasDeDocumento,
} from "@/lib/documents/miniatura-doc";
import { miniaturaConCache, ANCHO_MINIATURA } from "@/lib/documents/cache-miniatura";

/** Tope para leer un archivo sólo para dibujar su miniatura. */
const MAX_BYTES_LECTURA = 8 * 1024 * 1024;

/** Buffer de Node → ArrayBuffer, que es lo que acepta el cuerpo de la Response. */
function toArrayBuffer(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/**
 * GET /api/admin/documents/[id]/thumbnail — la carita del archivo, en PNG.
 *
 *  - PDF → su primera página (unpdf + @napi-rs/canvas).
 *  - Planilla (.xlsx/.csv) → una tablita con las primeras filas.
 *  - Documento (.docx/.odt/.txt/.md) → una hoja con sus primeras líneas.
 *
 * Antes sólo el PDF tenía miniatura: en una carpeta con veinte Excel, todas
 * las tarjetas eran el mismo ícono verde y había que abrirlas de a una para
 * saber cuál era. Se cachea en el navegador (max-age) igual que la del PDF; si
 * algo falla, la tarjeta cae al ícono como siempre.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    // GENEROUS y no MODERATE: la grilla pide UNA miniatura por documento, sin
    // que el usuario haga nada. Con 20 cada 5 min, una carpeta con 30 boletas
    // mostraba la mitad de las tarjetas rotas (ADR-306).
    const rl = await applyRateLimit(req, "DRIVE_READ", "documents:thumbnail");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const familia = familiaDe(doc.name, doc.mimeType);
    const esPdf = doc.mimeType === "application/pdf";
    // Las fotos también pasan por acá: la tarjeta pedía el archivo ORIGINAL por
    // `/raw` para dibujar un cuadradito de 200 px — un logo de 657 KB bajaba
    // entero para eso. Acá se achican una vez y se guardan.
    const esImagen = doc.mimeType.startsWith("image/") && !doc.mimeType.includes("svg");
    if (!esPdf && !esImagen && familia !== "planilla" && familia !== "texto") {
      return NextResponse.json({ error: "sin_miniatura" }, { status: 415 });
    }
    // Un archivo enorme no se lee para dibujar un cuadradito de 420 px.
    if (!esPdf && !esImagen && doc.size > MAX_BYTES_LECTURA) {
      return NextResponse.json({ error: "muy_grande" }, { status: 413 });
    }

    // ?page=N (1-based) → miniatura de esa página; por defecto la 1ª.
    const pageParam = Number(req.nextUrl.searchParams.get("page") || "1");
    const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
    // `s` = escala del dibujo. La miniatura de la tarjeta se conforma con
    // 1.2 (~700 px de ancho); el visor pide 2 para que al ampliar el texto
    // siga siendo nítido y no un borrón.
    const sParam = Number(req.nextUrl.searchParams.get("s") || "1.2");
    const escala = Number.isFinite(sParam) ? Math.min(3, Math.max(0.5, sParam)) : 1.2;
    // A más escala, más ancho se guarda: el visor necesita el detalle, la
    // tarjeta no.
    const ancho = Math.round(ANCHO_MINIATURA * (escala / 1.2));

    // El dibujo se guarda una vez y se reusa. La clave lleva el `storagePath`,
    // que cambia con cada versión: subir una versión nueva invalida sola la
    // miniatura vieja.
    const variante = esPdf ? `pdf-p${page}-s${escala}` : esImagen ? "imagen" : familia;

    const miniatura = await miniaturaConCache(
      doc.storagePath,
      variante,
      async () => {
        const buf = await downloadFromStorage(doc.storagePath);
        if (!buf) throw new Error("storage_unavailable");

        if (esPdf) {
          // Sin esto, un PDF que use las fuentes estándar (Helvetica y compañía)
          // se dibuja como una página de cuadraditos: pdf.js se las pide al
          // sistema y el servidor no las tiene.
          await asegurarFuentesPdf(buf);
          const { renderPageAsImage } = await import("unpdf");
          return (await renderPageAsImage(new Uint8Array(buf), page, {
            canvasImport: () => import("@napi-rs/canvas"),
            scale: escala,
          })) as ArrayBuffer;
        }
        // Una foto ya es una imagen: no hay que dibujar nada, sólo achicarla
        // (de eso se encarga `miniaturaConCache` al convertirla a WebP).
        if (esImagen) return buf;
        if (familia === "planilla") {
          const filas = await filasDePlanilla(buf, doc.name);
          if (!filas || filas.length === 0) throw new Error("vacio");
          const dibujo = await dibujarPlanilla(filas);
          // Sin fuente en el sistema el canvas dibuja cuadraditos: es preferible
          // que la tarjeta muestre su ícono a que muestre una miniatura ilegible.
          if (!dibujo) throw new Error("sin_fuente");
          return toArrayBuffer(dibujo);
        }
        const lineas = await lineasDeDocumento(buf, doc.name);
        if (!lineas || lineas.length === 0) throw new Error("vacio");
        const dibujo = await dibujarDocumento(lineas);
        if (!dibujo) throw new Error("sin_fuente");
        return toArrayBuffer(dibujo);
      },
      ancho,
    );

    return new NextResponse(toArrayBuffer(miniatura.bytes), {
      status: 200,
      headers: {
        "Content-Type": miniatura.contentType,
        // Los docs restringidos no se cachean EN EL NAVEGADOR (evita fuga por
        // caché tras cambio de sesión). El guardado del servidor sí aplica: esa
        // copia sólo se sirve pasando por este endpoint, que valida el rol.
        "Cache-Control": doc.allowedRoles.length > 0 ? "private, no-store" : "private, max-age=86400",
        "X-Frame-Options": "SAMEORIGIN",
        "X-Miniatura": miniatura.origen,
      },
    });
  } catch (e) {
    // Un PDF corrupto o de un formato que unpdf no sabe abrir no es una falla
    // del servidor: la tarjeta cae al ícono y listo. Se loguea como warning
    // para no ensuciar Sentry con documentos rotos que subió alguien.
    logger.warn("[documents.thumbnail] no se pudo renderizar", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "thumbnail_failed" }, { status: 422 });
  }
}
