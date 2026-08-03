import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import { esNumeroRegistroValido, normalizarNumeroRegistro } from "@/lib/forestal/serfor-gtf";
import { consultarGtfEnSerfor } from "@/lib/forestal/serfor-gtf-fetch";
import { repartirGtfEnIngresos } from "@/lib/forestal/serfor-gtf-a-ingresos";
import { findSpeciesByCommonName } from "@/data/forestry-species";
import { ORIGEN_SERFOR, regionDeSerfor } from "@/lib/forestal/serfor-origen";
import type { WoodOriginType } from "@/lib/generated/prisma/client";

/**
 * POST /api/admin/forestal/wood-entries/desde-serfor
 *
 * Registra una GTF completa en el libro: **un ingreso por especie declarada**,
 * con su lista de trozas, todo en una transacción (ADR-312).
 *
 * El cuerpo trae el **N° de registro**, no la ficha: la ficha la vuelve a pedir
 * este endpoint. Aceptar la que manda el navegador sería aceptar cualquier
 * ficha —un POST a mano metería al libro una guía inexistente con el sello de
 * "verificado en SERFOR" puesto por nosotros—, y la verificación que no hace el
 * servidor no es verificación.
 */

const Body = z.object({
  numeroRegistro: z.string().trim().min(1).max(30),
  /** Lo que la guía NO trae y el CTP sí necesita. */
  entryDate: z.coerce.date().optional(),
  ctpProductCode: z.string().trim().max(60).nullable().optional(),
  humidityPct: z.coerce.number().min(0).max(100).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

/**
 * El documento del titular y su tipo, deducido del número que realmente se
 * guarda. 11 dígitos = RUC, 8 = DNI; cualquier otra cosa se guarda sin tipo
 * antes que con uno inventado.
 */
function docDelTitular(
  ruc: string | null | undefined,
  propietario: string | null | undefined,
): { providerDocument: string | null; providerDocumentType: "RUC" | "DNI" | null } {
  const n = (ruc ?? propietario ?? "").split("/")[0]?.trim().replace(/\D/g, "") ?? "";
  if (!n) return { providerDocument: null, providerDocumentType: null };
  return {
    providerDocument: n,
    providerDocumentType: n.length === 11 ? "RUC" : n.length === 8 ? "DNI" : null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_IA", "forestal:gtf-serfor-alta");
    if (rl) return rl;
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;
    const habilitado = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
    if (!habilitado) return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }
    const numero = normalizarNumeroRegistro(parsed.data.numeroRegistro);
    if (!esNumeroRegistroValido(numero)) {
      return NextResponse.json(
        { error: "numero_invalido", message: "El N° de registro va con sus guiones, como lo imprime la guía. Ejemplo: 2-25-0002326." },
        { status: 400 },
      );
    }

    // 1 · La ficha, pedida por el servidor.
    const consulta = await consultarGtfEnSerfor(numero);
    if (!consulta.ok) {
      return NextResponse.json({ error: "serfor_sin_respuesta", message: consulta.mensaje }, { status: 502 });
    }
    if (consulta.resultado.estado !== "encontrada" || !consulta.resultado.gtf) {
      return NextResponse.json(
        { error: "guia_no_encontrada", message: consulta.resultado.mensaje ?? "SERFOR no encontró esa guía." },
        { status: 404 },
      );
    }
    const gtf = consulta.resultado.gtf;

    // 2 · Repartir en ingresos: uno por especie, con sus trozas.
    const reparto = repartirGtfEnIngresos(gtf);
    if (!reparto.ok) {
      return NextResponse.json({ error: "guia_incompleta", message: reparto.motivo }, { status: 422 });
    }
    if (!gtf.gtfNumber?.trim()) {
      return NextResponse.json(
        { error: "guia_incompleta", message: "La guía no trae su N° de GTF. Cargala a mano." },
        { status: 422 },
      );
    }

    // 3 · Los datos del documento que el libro guarda como cabecera.
    const regionCatalogo = regionDeSerfor(gtf.departamento);
    const originType = (ORIGEN_SERFOR[(gtf.origenRecurso ?? "").toUpperCase()] ?? "otro") as WoodOriginType;
    const aFecha = (f: string | null) => {
      const m = (f ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`) : null;
    };

    const creados = await WoodEntriesDB.createDesdeGtfSerfor(auth.tenantId, {
      entryDate: parsed.data.entryDate ?? new Date(),
      docType: "GTF",
      serforNumeroRegistro: gtf.numeroRegistro || numero,
      serforGtf: gtf as unknown as Record<string, unknown>,
      gtfNumber: gtf.gtfNumber.trim(),
      gtfDate: aFecha(gtf.fechaExpedicion),
      providerName: gtf.titular?.trim() || "Sin titular declarado",
      // El tipo se deduce del documento QUE SE GUARDA, no de uno de los dos
      // candidatos: si la guía no trae `rucInstancia` pero sí el del propietario,
      // el número se guardaba con tipo NULL —incluso siendo un RUC de 11 dígitos.
      ...docDelTitular(gtf.rucInstancia, gtf.propietarioDoc),
      originType,
      originCode: gtf.numeroTitulo ?? null,
      originSourceNumber: gtf.numeroResolucion ?? null,
      // "Otra" no es una región: en la columna del libro se guarda vacío.
      originRegion: regionCatalogo && regionCatalogo !== "Otra" ? regionCatalogo : null,
      originDistrict: gtf.distrito ?? null,
      ctpProductCode: parsed.data.ctpProductCode ?? null,
      humidityPct: parsed.data.humidityPct ?? null,
      notes: parsed.data.notes ?? null,
      lineas: reparto.ingresos.map((l) => {
        // La especie del catálogo aporta el nombre científico y la bandera CITES
        // (que la guía no declara). Si no está en el catálogo, vale lo que dice
        // el documento: no se descarta una especie por no tenerla fichada.
        const cat = findSpeciesByCommonName(l.especieComun);
        return {
          especieComun: l.especieComun,
          especieCientifica: l.especieCientifica ?? cat?.scientificName ?? null,
          cites: cat?.cites ?? false,
          unit: "m3",
          // La presentación viaja por línea: una guía puede amparar trozas de
          // una especie y piezas de otra.
          presentacion: l.presentacion,
          volumenM3: l.volumenM3,
          piezas: l.piezas,
          trozas: l.trozas,
        };
      }),
      createdBy: auth.username ?? "unknown",
    });

    return NextResponse.json({
      ok: true,
      ingresos: creados.map((e) => ({
        id: e.id,
        libroNro: e.libroNro,
        especie: e.speciesCommonName,
        volumeM3: Number(e.volumeM3),
        pieces: e.pieces,
      })),
      gtfNumber: gtf.gtfNumber,
      numeroRegistro: gtf.numeroRegistro || numero,
      trozas: reparto.ingresos.reduce((a, l) => a + l.trozas.length, 0),
      avisos: reparto.avisos,
    }, { status: 201 });
  } catch (e) {
    if (e instanceof CtpInvariantError) {
      return NextResponse.json({ error: e.code, message: e.message, detail: e.detail }, { status: 409 });
    }
    logger.error("[wood-entries.desde-serfor] error", {
      err: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack?.slice(0, 900) : undefined,
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
