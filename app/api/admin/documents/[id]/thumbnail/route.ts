import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";
import { familiaDe } from "@/lib/documents/tipos-archivo";
import {
  dibujarDocumento, dibujarPlanilla, filasDePlanilla, lineasDeDocumento,
} from "@/lib/documents/miniatura-doc";

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
    if (!esPdf && familia !== "planilla" && familia !== "texto") {
      return NextResponse.json({ error: "sin_miniatura" }, { status: 415 });
    }
    // Un archivo enorme no se lee para dibujar un cuadradito de 420 px.
    if (!esPdf && doc.size > MAX_BYTES_LECTURA) {
      return NextResponse.json({ error: "muy_grande" }, { status: 413 });
    }

    const buf = await downloadFromStorage(doc.storagePath);
    if (!buf) return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });

    let png: ArrayBuffer;
    if (esPdf) {
      // ?page=N (1-based) → miniatura de esa página; por defecto la 1ª.
      const pageParam = Number(req.nextUrl.searchParams.get("page") || "1");
      const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
      const { renderPageAsImage } = await import("unpdf");
      png = await renderPageAsImage(new Uint8Array(buf), page, {
        canvasImport: () => import("@napi-rs/canvas"),
        scale: 1.2,
      }) as ArrayBuffer;
    } else if (familia === "planilla") {
      const filas = await filasDePlanilla(buf, doc.name);
      if (!filas || filas.length === 0) return NextResponse.json({ error: "vacio" }, { status: 422 });
      png = toArrayBuffer(await dibujarPlanilla(filas));
    } else {
      const lineas = await lineasDeDocumento(buf, doc.name);
      if (!lineas || lineas.length === 0) return NextResponse.json({ error: "vacio" }, { status: 422 });
      png = toArrayBuffer(await dibujarDocumento(lineas));
    }

    return new NextResponse(png, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        // Los docs restringidos no se cachean (evita fuga por caché tras cambio de sesión).
        "Cache-Control": doc.allowedRoles.length > 0 ? "private, no-store" : "private, max-age=3600",
        "X-Frame-Options": "SAMEORIGIN",
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
