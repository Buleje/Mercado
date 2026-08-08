import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestCtpConsumoDB } from "@/lib/db/forest-ctp-consumo.db";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { ctpErrorResponse, ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";

/**
 * /api/admin/forestal/ctp/consumos — atribución de materia prima y costeo de una
 * línea del Libro CTP (ADR-134).
 *
 *   GET  ?ctpEntryId=…            → { consumos, costo }  qué guías alimentaron la
 *                                   corrida y cuánto costó (ponderado)
 *   PUT  { ctpEntryId, consumos } → reemplaza la atribución (valida I1/I2/tenant)
 *   POST { ctpEntryId, action:"congelar" } → cierra el costo del período
 *
 * Guard: spec:forestal:ctp-libro · rate-limit GENEROUS bucket 'ctp' (igual que
 * el resto del módulo). Las invariantes violadas salen 422, no 500.
 */

const putSchema = z.object({
  ctpEntryId: z.string().trim().min(1),
  consumos: z
    .array(
      z.object({
        woodEntryId: z.string().trim().min(1),
        volumeM3: z.coerce.number().positive().max(99999),
      }),
    )
    .max(50),
});

const postSchema = z.object({
  ctpEntryId: z.string().trim().min(1),
  action: z.literal("congelar"),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-ctp-consumos-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const ctpEntryId = new URL(req.url).searchParams.get("ctpEntryId");
  if (!ctpEntryId) return NextResponse.json({ error: "ctpEntryId_required" }, { status: 400 });

  try {
    const [consumos, costo, piezas] = await Promise.all([
      ForestCtpConsumoDB.listByEntry(auth.tenantId, ctpEntryId),
      ForestCtpConsumoDB.costoDeLinea(auth.tenantId, ctpEntryId),
      /* Las PIEZAS, además de los m³ por guía: son las dos caras del mismo
         consumo (ADR-326) y se piden juntas para que la ficha no tenga que
         hacer un segundo viaje ni traerse el patio entero para filtrarlo. */
      WoodEntriesDB.trozasDeCorrida(auth.tenantId, ctpEntryId),
    ]);
    const num = (v: unknown) => (v == null ? null : Number(v));
    return NextResponse.json({
      consumos,
      costo,
      /* Whitelist explícita, con TODO lo que la tabla del LO-CTP dibuja: si acá
         falta una columna, la pantalla la muestra vacía sin ningún error. */
      trozas: piezas.map((t) => ({
        id: t.id,
        woodEntryId: t.woodEntryId,
        codificacion: t.codificacion,
        codigoPlanta: t.codigoPlanta,
        especieComun: t.especieComun,
        especieCientifica: t.especieCientifica,
        d1Cm: num(t.d1Cm),
        d2Cm: num(t.d2Cm),
        largoM: num(t.largoM),
        volumenM3: num(t.volumenM3),
        gtfNumber: t.entry.gtfNumber,
        permiso: t.entry.originCode,
        fechaConsumo: t.fechaConsumo,
      })),
    });
  } catch (err) {
    return ctpErrorResponse(err, "ctp-consumos.GET", auth.tenantId);
  }
});

export const PUT = withApiHandler("forestal-ctp-consumos-put", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return ctpValidationResponse(parsed.error);
  }

  try {
    const consumos = await ForestCtpConsumoDB.setConsumos(
      auth.tenantId,
      parsed.data.ctpEntryId,
      parsed.data.consumos,
      auth.username ?? "unknown",
    );
    const costo = await ForestCtpConsumoDB.costoDeLinea(auth.tenantId, parsed.data.ctpEntryId);
    return NextResponse.json({ consumos, costo });
  } catch (err) {
    return ctpErrorResponse(err, "ctp-consumos.PUT", auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-ctp-consumos-post", async (req: NextRequest) => {
  // Congelar es irreversible (deja la línea inmutable) → sólo admin/owner,
  // no almacenero. Mismo criterio que anular en el endpoint hermano.
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return ctpValidationResponse(parsed.error);
  }

  try {
    const consumos = await ForestCtpConsumoDB.congelarCosto(
      auth.tenantId,
      parsed.data.ctpEntryId,
      auth.username ?? "unknown",
    );
    return NextResponse.json({ consumos, ok: true });
  } catch (err) {
    return ctpErrorResponse(err, "ctp-consumos.POST", auth.tenantId);
  }
});
