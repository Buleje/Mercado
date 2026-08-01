import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { assertCsrf } from "@/lib/auth/csrf";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";

/**
 * GET /api/admin/forestal/trozas?codificacion=106/C
 * GET /api/admin/forestal/trozas?woodEntryId=<id>
 *
 * La consulta que hace un fiscalizador de OSINFOR al revés: dado el código de
 * una troza, de qué GTF entró y a qué ingreso del libro pertenece (ADR-312).
 *
 * PATCH /api/admin/forestal/trozas — cierra la RECEPCIÓN física (ADR-325).
 *
 * Lo que dice el documento no se edita a mano: una lista de trozas retocable
 * dejaría de ser prueba de nada. Lo que sí se registra es lo que hizo el CENTRO
 * al recibir —código de planta, parcela de corta y si llegó o no—, que son datos
 * propios y no del documento.
 */

const Query = z.object({
  codificacion: z.string().trim().max(120).optional(),
  woodEntryId: z.string().trim().max(60).optional(),
  limite: z.coerce.number().int().min(1).max(200).optional(),
  /** `?retrozos=1` → el Apartado 2 del período (ADR-313). */
  retrozos: z.string().trim().max(4).optional(),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
});

/** Fecha de query param: inválida → sin límite, no un 400 (no romper el libro). */
function fecha(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const parsed = z.coerce.date().safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

const patchSchema = z.object({
  woodEntryId: z.string().trim().min(1).max(60),
  cambios: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60),
        codigoPlanta: z.string().trim().max(80).nullish(),
        parcela: z.string().trim().max(80).nullish(),
        noRecepcionada: z.boolean().optional(),
        recepcionObs: z.string().trim().max(300).nullish(),
      }),
    )
    .min(1)
    .max(500),
});

export async function PATCH(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "GENEROUS", "ctp:trozas");
    if (rl) return rl;
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
    const habilitado = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
    if (!habilitado) return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 400 },
      );
    }

    const r = await WoodEntriesDB.actualizarRecepcion(
      auth.tenantId,
      parsed.data.woodEntryId,
      parsed.data.cambios,
      auth.username ?? "unknown",
    );
    return NextResponse.json(r);
  } catch (e) {
    return ctpErrorResponse(e, "forestal.trozas.PATCH", "");
  }
}

export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "GENEROUS", "ctp:trozas");
    if (rl) return rl;
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;
    const habilitado = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
    if (!habilitado) return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });

    const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues }, { status: 400 });
    }

    // Apartado 2 del formato: los pedazos cortados en planta durante el período,
    // con su madre. Lo consumen el export oficial y la pantalla de Cuadros SERFOR.
    if (parsed.data.retrozos === "1") {
      const filas = await WoodEntriesDB.retrozosDelPeriodo(auth.tenantId, {
        fromDate: fecha(parsed.data.from),
        toDate: fecha(parsed.data.to),
      });
      const num = (v: unknown) => (v == null ? null : Number(v));
      return NextResponse.json({
        retrozos: filas.map((r) => ({
          id: r.id,
          codificacion: r.codificacion,
          especieComun: r.especieComun,
          especieCientifica: r.especieCientifica,
          d1Cm: num(r.d1Cm),
          d2Cm: num(r.d2Cm),
          largoM: num(r.largoM),
          volumenM3: num(r.volumenM3),
          fechaRetrozo: r.fechaRetrozo,
          descarte: r.descarte,
          observaciones: r.observaciones,
          madre: r.trozaOrigen
            ? {
                id: r.trozaOrigen.id,
                codificacion: r.trozaOrigen.codificacion,
                volumenM3: num(r.trozaOrigen.volumenM3),
                especieComun: r.trozaOrigen.especieComun,
                especieCientifica: r.trozaOrigen.especieCientifica,
                originCode: r.entry.originCode,
                ctpProductCode: r.entry.ctpProductCode,
                gtfNumber: r.entry.gtfNumber,
              }
            : null,
        })),
        total: filas.length,
      });
    }

    if (parsed.data.woodEntryId) {
      const trozas = await WoodEntriesDB.trozasDe(auth.tenantId, parsed.data.woodEntryId);
      return NextResponse.json({
        trozas: trozas.map((t) => ({
          ...serializar(t),
          retrozos: (t.retrozos ?? []).map((r) => ({
            ...serializar(r),
            descarte: r.descarte,
            observaciones: r.observaciones,
            fechaRetrozo: r.fechaRetrozo,
          })),
        })),
      });
    }

    const q = parsed.data.codificacion ?? "";
    if (!q.trim()) return NextResponse.json({ trozas: [], total: 0 });

    const encontradas = await WoodEntriesDB.buscarTrozas(auth.tenantId, q, parsed.data.limite ?? 50);
    return NextResponse.json({
      trozas: encontradas.map((t) => ({
        ...serializar(t),
        ingreso: {
          id: t.entry.id,
          libroNro: t.entry.libroNro,
          gtfNumber: t.entry.gtfNumber,
          serforNumeroRegistro: t.entry.serforNumeroRegistro,
          entryDate: t.entry.entryDate,
          providerName: t.entry.providerName,
          especie: t.entry.speciesCommonName,
          status: t.entry.status,
          originCode: t.entry.originCode,
          origen: [t.entry.originRegion, t.entry.originDistrict].filter(Boolean).join(" · ") || null,
        },
      })),
      total: encontradas.length,
    });
  } catch (e) {
    logger.error("[forestal.trozas] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Los Decimal de Prisma viajan como número: el cliente no hace aritmética con ellos. */
function serializar(t: {
  id: string; orden: number; codificacion: string | null;
  especieComun: string | null; especieCientifica: string | null;
  dimensiones: string | null; largoM: unknown; diametroCm: unknown;
  d1Cm?: unknown; d2Cm?: unknown;
  cantidad: number | null; volumenM3: unknown;
  parcela?: string | null; codigoPlanta?: string | null;
  noRecepcionada?: boolean; recepcionObs?: string | null;
  trozaOrigenId?: string | null;
}) {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: t.id,
    orden: t.orden,
    codificacion: t.codificacion,
    especieComun: t.especieComun,
    especieCientifica: t.especieCientifica,
    dimensiones: t.dimensiones,
    largoM: num(t.largoM),
    diametroCm: num(t.diametroCm),
    d1Cm: num(t.d1Cm),
    d2Cm: num(t.d2Cm),
    cantidad: t.cantidad,
    volumenM3: num(t.volumenM3),
    // Recepción física (ADR-325): son datos del CENTRO, no del documento.
    parcela: t.parcela ?? null,
    codigoPlanta: t.codigoPlanta ?? null,
    noRecepcionada: Boolean(t.noRecepcionada),
    recepcionObs: t.recepcionObs ?? null,
    trozaOrigenId: t.trozaOrigenId ?? null,
  };
}
