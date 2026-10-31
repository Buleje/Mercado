import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { assertCsrf } from "@/lib/auth/csrf";
import { ForestLoteImportarDB, MAX_FILAS_LOTE_EXCEL } from "@/lib/db/forest-lote-importar.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { esDiaValido } from "@/lib/forestal/lote-desde-excel-cruce";

/**
 * Lote de aserrío pegado desde el Excel del SNIFFS, ya consumido (27-10).
 *
 * POST {modo: "previsualizar", code, filas} → qué troza del libro es cada fila
 *      y si entra (no escribe nada).
 * POST {modo: "importar", code, fecha, filas} → abre el lote (o completa el
 *      programado con ese N°) y lo consume en `fecha`, todo o nada. El
 *      servidor vuelve a cruzar: la vista previa de la pantalla no decide.
 *
 * Mismo guard que `/lotes-aserrio`: armar y consumir un lote es trabajo de
 * patio (admin, almacenero y dueño) y la misma especialización del libro.
 */

const texto = (max: number) => z.string().trim().max(max).nullable();
const medida = z.number().finite().nonnegative().max(999999).nullable();

const filaSchema = z.object({
  fila: z.number().int().min(1).max(100000),
  /* Llegaron el 28-10: un cliente que no los manda (un script) sigue valiendo. */
  contrato: texto(120).optional().transform((v) => v ?? null),
  resolucion: texto(120).optional().transform((v) => v ?? null),
  tipoDocumento: texto(40).optional().transform((v) => v ?? null),
  gtf: texto(40),
  codigoPlanta: texto(60),
  codigoTroza: texto(60),
  trozaPadre: texto(60),
  especie: texto(160),
  lote: texto(60),
  d1Cm: medida,
  d2Cm: medida,
  largoM: medida,
  volumenM3: medida,
  tipoProducto: texto(80),
  estado: texto(60),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

const base = {
  code: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((v) => v || null),
  filas: z
    .array(filaSchema)
    .min(1, "No hay trozas en lo que pegaste")
    .max(MAX_FILAS_LOTE_EXCEL, `Son más de ${MAX_FILAS_LOTE_EXCEL} trozas: pega un lote a la vez`),
};

const postSchema = z.discriminatedUnion("modo", [
  z.object({ modo: z.literal("previsualizar"), ...base }),
  z.object({
    modo: z.literal("importar"),
    ...base,
    fecha: z
      .string()
      .trim()
      .refine(esDiaValido, "Pon una fecha del consumo que exista (AAAA-MM-DD)"),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "GENEROUS", "ctp:lotes-aserrio-importar");
    if (rl) return rl;
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;
    if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
      return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
    }
    const csrf = assertCsrf(req);
    if (csrf) return csrf;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: parsed.error.issues[0]?.message ?? "Datos inválidos.",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400 },
      );
    }
    const d = parsed.data;
    if (d.modo === "previsualizar") {
      const cruce = await ForestLoteImportarDB.cruzar(auth.tenantId, d.filas, d.code);
      return NextResponse.json({ cruce });
    }
    const r = await ForestLoteImportarDB.importar(auth.tenantId, {
      code: d.code,
      fecha: d.fecha,
      filas: d.filas,
      user: auth.username ?? "unknown",
    });
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.lotes-aserrio.importar.POST", "");
  }
}
