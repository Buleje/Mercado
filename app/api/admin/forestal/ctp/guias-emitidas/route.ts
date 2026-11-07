import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";
import { guiasDeDespachos, type FilaDespachoGuia } from "@/lib/forestal/guias-emitidas";
import { guiaCtpParaFormato, lineasDeLasGuias, marcarReemitidas } from "@/lib/forestal/tramites-desde-guias";

/** Las mismas cotas que `?ids=` de las GTF del Libro TH. */
const idsSchema = z
  .array(z.string().min(1).max(60))
  .min(1, "Elige al menos una guía.")
  .max(200, "Hasta 200 guías por trámite.");

/**
 * GET /api/admin/forestal/ctp/guias-emitidas?desde&hasta · ?ids=a,b (para un trámite)
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

  /**
   * `?ultimaCompleta=1` — los datos de la última guía emitida, para que la
   * siguiente no se tipee de nuevo (ADR-371).
   *
   * Va por acá y no en el listado porque la bandeja muestra 35 guías y el JSON
   * completo de cada una son datos de personas que esa pantalla no necesita:
   * se devuelve UNA, la que sirve de molde.
   */
  const soloUltima = req.nextUrl.searchParams.get("ultimaCompleta") === "1";

  /**
   * `?ids=a,b` (08-10): las guías elegidas en esta bandeja, listas para llenar
   * un trámite (`tramites-desde-guias`). Vuelve la GUÍA entera —todas las
   * líneas del mismo N° y estado— aunque el id sea de una sola línea, y cada
   * anulada dice si su N° sigue vigente en otro despacho (se anuló la línea y
   * se volvió a registrar). Sólo se leen los despachos de esos N°.
   */
  const idsParam = req.nextUrl.searchParams.get("ids");
  if (idsParam !== null) {
    const ids = idsSchema.safeParse(idsParam.split(",").map((s) => s.trim()).filter(Boolean));
    if (!ids.success) {
      return NextResponse.json({ error: "validation_error", message: ids.error.issues[0]?.message }, { status: 400 });
    }
    try {
      const elegidas = await ForestCtpDB.despachosConGuiaPorIds(auth.tenantId, ids.data);
      const delMismoNumero = await ForestCtpDB.despachosDeLasGuias(
        auth.tenantId,
        elegidas.map((f) => f.gtfNumber ?? ""),
      );
      const { filas, vigentes, faltan } = lineasDeLasGuias(ids.data, elegidas, delMismoNumero);
      const guias = marcarReemitidas(filas.map(guiaCtpParaFormato), vigentes);
      return NextResponse.json({ guias, faltan });
    } catch (err) {
      logger.error("[guias-emitidas.GET ids] failed", { error: String(err), tenantId: auth.tenantId });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
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
    if (soloUltima) {
      const conDatos = [...despachos]
        .filter((d) => d.status === "registrado" && d.gtfDatos && typeof d.gtfDatos === "object")
        .sort((a, b) => b.entryDate.getTime() - a.entryDate.getTime() || (b.lineNo ?? 0) - (a.lineNo ?? 0))[0];
      /* El último número también viaja: sirve para proponer el correlativo
         siguiente aunque la guía en sí no tenga datos que heredar. */
      const ultimoNumero = [...despachos]
        .filter((d) => (d.gtfNumber ?? "").trim().length > 0)
        .sort((a, b) => b.entryDate.getTime() - a.entryDate.getTime() || (b.lineNo ?? 0) - (a.lineNo ?? 0))[0];
      /* El siguiente del TALONARIO (ADR-446), el mismo que propone «Emitir
         GTF»: el último número por fecha no sirve —en Blas era una prueba
         anulada de otra serie y el 064 vivía sólo en un Anexo 04—. Si falla,
         el modal cae al «último + 1» de siempre. */
      const proxima = await ForestCtpDespachoDB.proximaGtf(auth.tenantId).catch((err) => {
        logger.error("[guias-emitidas] proximaGtf failed", { error: String(err), tenantId: auth.tenantId });
        return null;
      });
      return NextResponse.json({
        ultima: conDatos?.gtfDatos ?? null,
        gtfNumber: ultimoNumero?.gtfNumber ?? null,
        siguienteGtf: proxima?.ok ? proxima.propuesta.gtf : null,
      });
    }

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
