import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { isSpecializationEnabled } from "@/lib/specializations";
import { CtpGuiaDocumentosDB } from "@/lib/db/ctp-guia-documentos.db";
import { DocumentsDB } from "@/lib/db/documents.db";
import { ROLES_PAPELES_GUIA } from "@/lib/forestal/documentos-guia";
import { esInlineSeguro, getSignedUrl } from "@/lib/documents/storage";
import { cacheStore } from "@/lib/cache";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/forestal/guias/documentos/ver?gtf=<N°>&id=<documento>[&bajar=1]
 *
 * La puerta de un documento de la guía (ADR-438): sesión + Libro CTP + el
 * documento es de ESA guía en ESTE tenant → 302 a una URL firmada de 10 min del
 * bucket privado del Drive. Otro tenant, otra guía o un id inventado → 404 (no
 * se confirma que exista). `<img src>` sigue el redirect solo, así que el modal
 * usa esta ruta directo para las miniaturas.
 *
 * Cada vista queda en la auditoría del Drive (una por persona y documento por
 * hora, para que 12 miniaturas × cada apertura no inunden el registro).
 */

const TTL_SEG = 10 * 60;
const DEDUPE_SEG = 60 * 60;
const query = z.object({
  gtf: z.string().trim().min(1).max(60),
  id: z.string().trim().min(1).max(40),
  bajar: z.enum(["1"]).optional(),
});

export const GET = withApiHandler("forestal-guia-docs-ver", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES_PAPELES_GUIA);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "DRIVE_READ", "forestal-guia-docs-ver");
  if (rl) return rl;
  /* ADR-482: los papeles de la guía se ven también desde el Libro TH. */
  const [ctp, loth] = await Promise.all([
    isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"),
    isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"),
  ]);
  if (!ctp && !loth) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }
  const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const r = await CtpGuiaDocumentosDB.documentoDeGuia(
    auth.tenantId,
    q.data.id,
    q.data.gtf,
    auth.role,
  );
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  /* Inline sólo lo que el navegador muestra sin riesgo (misma regla que el
     `raw` del Drive): un HTML o SVG colado en un casillero se descarga. */
  const inline = !q.data.bajar && esInlineSeguro(r.doc.mimeType, r.doc.name);
  const firmada = await getSignedUrl(
    r.doc.storagePath,
    TTL_SEG,
    inline ? undefined : { download: r.doc.name },
  );
  if (!firmada) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const quien = auth.username || "unknown";
  const clave = `forestal-guia-doc-vista:${auth.tenantId}:${quien}:${r.doc.id}`;
  if (cacheStore.get<true>(clave) == null) {
    cacheStore.set(clave, true, DEDUPE_SEG);
    DocumentsDB.log(auth.tenantId, {
      documentId: r.doc.id,
      actorId: quien,
      action: q.data.bajar ? "download" : "view",
      metadata: { origen: "guia", gtfNumber: r.gtf, casillero: r.casillero },
    }).catch((err) => logger.warn("[docs-guia] segundo plano falló", { error: String(err) }));
  }

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: firmada,
      "Cache-Control": "private, max-age=300",
      "Referrer-Policy": "no-referrer",
    },
  });
});
