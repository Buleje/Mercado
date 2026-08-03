import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { guiasDeDespachos, type FilaDespachoGuia } from "@/lib/forestal/guias-emitidas";

/**
 * GET /api/admin/forestal/ctp/guias-emitidas?desde&hasta
 *
 * Las GTF de salida que emitió el CTP (ADR-321). Se derivan de los despachos con
 * número de guía: no hay tabla propia, porque una guía emitida ES un despacho y
 * dos copias del mismo documento serían dos verdades.
 *
 * Incluye las anuladas a propósito: un documento anulado también se explica ante
 * una fiscalización.
 */
export const GET = withApiHandler("forestal-guias-emitidas", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const ok = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
  if (!ok) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
      { status: 403 },
    );
  }

  const fecha = (v: string | null): Date | undefined => {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  try {
    const { entries: despachos } = await ForestCtpDB.list(auth.tenantId, {
      section: "despacho",
      includeAnnulled: true,
      fromDate: fecha(req.nextUrl.searchParams.get("desde")),
      toDate: fecha(req.nextUrl.searchParams.get("hasta")),
    });
    const filas: FilaDespachoGuia[] = despachos.map((d) => ({
      id: d.id,
      lineNo: d.lineNo,
      entryDate: d.entryDate.toISOString(),
      gtfNumber: d.gtfNumber,
      docType: d.docType,
      destino: d.destino,
      productType: d.productType,
      speciesCommon: d.speciesCommon,
      quantity: d.quantity == null ? null : Number(d.quantity),
      unit: d.unit,
      status: d.status,
      gtfDatos: d.gtfDatos,
      serforNumeroRegistro: d.serforNumeroRegistro,
      serforVerificadoEn: d.serforVerificadoEn ? d.serforVerificadoEn.toISOString() : null,
      // Este re-mapeo es una WHITELIST: un campo que existe en la fila pero no
      // se copia acá desaparece sin error. Sin esta línea la bandeja no podría
      // decir que una guía ampara madera sin origen declarado.
      atribuidoQty: (d as { atribuidoQty?: number }).atribuidoQty,
    }));
    return NextResponse.json({ guias: guiasDeDespachos(filas) });
  } catch (err) {
    logger.error("[guias-emitidas.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
