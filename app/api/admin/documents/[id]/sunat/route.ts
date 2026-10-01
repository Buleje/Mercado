import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";
import {
  esArchivoSunat, leerCdr, leerComprobante, revisarComprobante,
} from "@/lib/documents/sunat-comprobante";

type Ctx = { params: Promise<{ id: string }> };

/** Un CDR llega como ZIP con el XML adentro; el XML suelto se lee directo. */
async function xmlDelArchivo(buf: Buffer, nombre: string): Promise<string | null> {
  if (nombre.toLowerCase().endsWith(".zip")) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buf);
    const entrada = Object.keys(zip.files).find((f) => f.toLowerCase().endsWith(".xml"));
    return entrada ? await zip.files[entrada].async("string") : null;
  }
  return buf.toString("utf8");
}

/**
 * POST /api/admin/documents/[id]/sunat — lee y revisa un comprobante o un CDR.
 *
 * Deja el resultado en `ocrMetadata.sunat` para que la ficha del documento lo
 * muestre sin volver a abrir el archivo, y para poder buscar después "las
 * facturas que SUNAT rechazó".
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:sunat");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!esArchivoSunat(doc.name, doc.mimeType)) {
      return NextResponse.json({ error: "no_es_comprobante" }, { status: 415 });
    }

    const buf = await downloadFromStorage(doc.storagePath);
    if (!buf) return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });

    const xml = await xmlDelArchivo(buf, doc.name);
    if (!xml) return NextResponse.json({ error: "sin_xml" }, { status: 422 });

    const cdr = leerCdr(xml);
    const comprobante = cdr ? null : leerComprobante(xml);
    if (!cdr && !comprobante) {
      return NextResponse.json({ error: "xml_no_reconocido" }, { status: 422 });
    }

    const hallazgos = comprobante ? revisarComprobante(comprobante) : [];
    const resultado = {
      tipoArchivo: cdr ? ("cdr" as const) : ("comprobante" as const),
      cdr,
      comprobante,
      hallazgos,
      revisadoEn: new Date().toISOString(),
    };

    // Se guarda junto al resto del análisis, sin pisar lo que ya haya.
    await DocumentsDB.update(auth.tenantId, id, {
      ocrMetadata: { ...doc.ocrMetadata, sunat: resultado },
    });

    DocumentsDB.log(auth.tenantId, {
      documentId: id,
      actorId: auth.username,
      action: "ai_categorize",
      metadata: { sunat: true, tipo: resultado.tipoArchivo, codigo: cdr?.codigo ?? null },
    }).catch((err) => logger.warn("documents.audit.fail", { err: String(err) }));

    return NextResponse.json(resultado);
  } catch (e) {
    logger.warn("[documents.sunat] no se pudo leer", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "read_failed" }, { status: 422 });
  }
}
