import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { assertCsrf } from "@/lib/auth/csrf";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { limaDateKey } from "@/lib/utils";
import { ForestRecepcionDB, MAX_GUIAS_CONTEXTO } from "@/lib/db/forest-recepcion.db";

/**
 * /api/admin/forestal/wood-entries/recepcion — la fecha real de llegada (ADR-434).
 *
 * GET   `?gtf=A&gtf=B` → `{ hoy, guias: ContextoDeLlegada[] }`: lo que la pantalla
 *       necesita para proponer, avisar y frenar ANTES de guardar (corridas del
 *       permiso, trozas ya aserradas, meses cerrados, costo congelado).
 * PATCH `{ action: "corregir_recepcion", gtfNumber, fecha, motivo, aceptaVencida?, motivoVencida? }`:
 *       corrige la recepción de una guía ya recibida. Los guards viven en
 *       `ForestRecepcionDB.corregir`, dentro de la transacción; una fecha
 *       posterior al vencimiento de la guía pide `aceptaVencida` + motivo (422).
 *
 * Recibir una guía nueva sigue siendo `PATCH /wood-entries` con
 * `recepcionar_guia` (ADR-351): el bloque ahora manda la fecha de CADA guía.
 */

/** Leer el contexto: quien recibe también lo necesita para ver los avisos. */
const ROLES_LEER = ["admin", "almacenero", "owner"] as const;
/**
 * Corregir una fecha declarada de una guía YA validada: sólo admin y dueño.
 * Misma separación de funciones que validar/anular en `wood-entries/[id]`: el
 * almacenero recibe, pero no reescribe lo que otro ya dio por bueno.
 */
const ROLES_CORREGIR = ["admin", "owner"] as const;

async function sinModulo(tenantId: string): Promise<NextResponse | null> {
  if (await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro")) return null;
  return NextResponse.json(
    {
      error: "specialization_disabled",
      message:
        "El módulo Libro de Operaciones CTP no está habilitado para este tenant. Solicita al superadmin habilitarlo.",
    },
    { status: 403 },
  );
}

const gtfSchema = z.string().trim().min(1).max(60);

export const GET = withApiHandler("forestal-recepcion-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES_LEER);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await sinModulo(auth.tenantId);
  if (guard) return guard;

  const gtfs = z
    .array(gtfSchema)
    .min(1)
    .max(MAX_GUIAS_CONTEXTO)
    .safeParse(new URL(req.url).searchParams.getAll("gtf"));
  if (!gtfs.success) {
    return NextResponse.json({ error: "invalid_query", issues: gtfs.error.issues }, { status: 400 });
  }
  try {
    const guias = await ForestRecepcionDB.contexto(auth.tenantId, gtfs.data);
    return NextResponse.json({ hoy: limaDateKey(), guias });
  } catch (err) {
    return ctpErrorResponse(err, "wood-entries/recepcion.GET", auth.tenantId);
  }
});

const corregirSchema = z.object({
  action: z.literal("corregir_recepcion"),
  gtfNumber: gtfSchema,
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD"),
  /** Por qué cambia una fecha del libro: va al rastro de cada asiento. */
  motivo: z.string().trim().min(3, "Escribe el motivo (mínimo 3 letras).").max(300),
  /**
   * La nueva llegada cae después del vencimiento de la guía y quien corrige
   * confirma que fue así, con su propio motivo (ADR-434 §Vencimiento). Sin
   * esto, esa fecha se rechaza con 422 `GUIA_VENCIDA`.
   */
  aceptaVencida: z.boolean().optional(),
  motivoVencida: z.string().trim().max(300).optional(),
});

export const PATCH = withApiHandler("forestal-recepcion-patch", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES_CORREGIR);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const guard = await sinModulo(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = corregirSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: parsed.error.issues[0]?.message, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const r = await ForestRecepcionDB.corregir(
      auth.tenantId,
      {
        gtfNumber: parsed.data.gtfNumber,
        fecha: parsed.data.fecha,
        motivo: parsed.data.motivo,
        ...(parsed.data.aceptaVencida
          ? { aceptaVencida: true, motivoVencida: parsed.data.motivoVencida ?? "" }
          : {}),
      },
      auth.username ?? "unknown",
    );
    /* La guía se busca con el tenant en el WHERE: la de otro tenant no existe acá. */
    if (!r) {
      return NextResponse.json(
        { error: "not_found", message: `La guía ${parsed.data.gtfNumber} no está en este libro.` },
        { status: 404 },
      );
    }
    return NextResponse.json(r);
  } catch (err) {
    return ctpErrorResponse(err, "wood-entries/recepcion.PATCH", auth.tenantId);
  }
});
