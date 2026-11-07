import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { ForestDistribucionesDB } from "@/lib/db/forest-distribuciones.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { MAX_TROZAS_POR_BLOQUE } from "@/lib/forestal/cubicacion-reparto";
import { sumarDias } from "@/lib/forestal/consumo-en-jornadas";
import { elegirTrozasParaBloque, type TrozaCandidata } from "@/lib/forestal/trozas-para-bloque";

/**
 * POST /api/admin/forestal/distribuciones/trozas-para-bloque — qué trozas del
 * grupo ampara de verdad un bloque (ADR-519, fase 1). SÓLO LECTURA: no aparta
 * ni consume nada; el bloque guarda lo elegido en `trozasElegidas` con el
 * guardado de siempre (`POST /distribuciones`).
 *
 * La pantalla manda el bloque (sus trozas, lo usado, el % y lo de cada día);
 * el servidor RELEE las trozas (`elegiblesDe`: T1, especie/permiso, otro lote,
 * mes cerrado, T3) y corre la MISMA función pura que la pantalla. Una troza
 * que ya eligió otro bloque guardado sale descartada con su motivo (no se
 * reserva: eso pide schema, ADR-519 «Alternativas»). Los días que el bloque ya
 * escribió en el Libro no se mandan; sus trozas (`corridaIds`) vuelven como
 * `yaEnElLibro`: cuentan como elegidas y no se sueltan.
 *
 * Guard: requireAdmin → CSRF → rate limit (balde propio) → spec:forestal:herramientas.
 */

const fechaDia = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

const piezaSchema = z.object({
  medida: z.string().trim().max(80),
  espesor: z.number().finite().nonnegative().max(10_000),
  ancho: z.number().finite().nonnegative().max(10_000),
  largo: z.number().finite().nonnegative().max(10_000),
  uEspesor: z.string().trim().max(10),
  uAncho: z.string().trim().max(10),
  uLargo: z.string().trim().max(10),
  piezas: z.number().int().nonnegative().max(1_000_000),
});

const bodySchema = z.object({
  bloqueId: z.string().trim().min(1).max(80),
  /** La guardada abierta, si la hay: sus propios bloques no cuentan como «otra distribución». */
  distribucionId: z.string().trim().max(80).nullish(),
  especie: z.string().trim().max(60),
  permiso: z.string().trim().max(120).nullish(),
  trozaIds: z.array(z.string().trim().min(1).max(40)).min(1).max(MAX_TROZAS_POR_BLOQUE),
  usadoM3: z.number().finite().nonnegative().max(999_999),
  aprovechablePct: z.number().finite().nonnegative().max(100),
  porDia: z
    .array(z.object({ dia: z.number().int().positive().max(366), m3: z.number().finite().nonnegative().max(999_999) }))
    .max(366),
  /** Día en que arrancó el bloque (`BloqueRolliza.fecha`): sin él no se mira cierre ni T3. */
  fecha: fechaDia.nullish(),
  loteId: z.string().trim().max(80).nullish(),
  ignorarMedidas: z.boolean().nullish(),
  /** Lo repartido al bloque, con medidas (ADR-505). */
  medidas: z.array(piezaSchema).max(2000).nullish(),
  /** Corridas de los días que el bloque ya escribió en el Libro. */
  corridaIds: z.array(z.string().trim().min(1).max(80)).max(366).nullish(),
});

export const POST = withApiHandler("forestal-trozas-para-bloque", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "distribuciones-trozas");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:herramientas"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "Las Herramientas Forestales no están habilitadas para esta tienda." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  const b = parsed.data;

  try {
    const fechaDe = (dia: number) => (b.fecha ? sumarDias(b.fecha, dia - 1) : null);
    const fechas = b.porDia.map((d) => fechaDe(d.dia)).filter((f): f is string => f != null);
    const [leidas, guardadas] = await Promise.all([
      ForestLoteAserrioDB.elegiblesDe(auth.tenantId, b.trozaIds, {
        loteId: b.loteId,
        especie: b.especie,
        permiso: b.permiso,
        fechas,
      }),
      ForestDistribucionesDB.list(auth.tenantId),
    ]);

    /* Una troza que ya eligió otro bloque guardado (de otra distribución o de
       ésta) no se propone: tomarla haría que dos bloques amparen la misma madera. */
    const pedidas = new Set(b.trozaIds);
    const elegidaPor = new Map<string, string>();
    for (const d of guardadas) {
      for (const otro of d.bloques) {
        if (otro.id === b.bloqueId && (!b.distribucionId || d.id === b.distribucionId)) continue;
        for (const id of otro.trozasElegidas ?? []) {
          if (pedidas.has(id) && !elegidaPor.has(id)) elegidaPor.set(id, `elegida en la distribución «${d.nombre}», bloque ${otro.etiqueta}`);
        }
      }
    }
    /* Las que consumieron los días ya escritos por este bloque: son suyas. */
    const corridas = new Set(b.corridaIds ?? []);
    const yaEnElLibro = leidas.trozas.filter((t) => t.consumidaEnId && corridas.has(t.consumidaEnId)).map((t) => t.id);
    const enLibro = new Set(yaEnElLibro);
    const filas = leidas.trozas.map((t) => ({
      ...t,
      motivo: enLibro.has(t.id) ? null : t.motivo || elegidaPor.get(t.id) || null,
    }));

    const candidatas: TrozaCandidata[] = [
      ...filas.filter((t) => !enLibro.has(t.id)),
      /* Lo que no es del negocio (o ya no existe) se dice, no desaparece. */
      ...leidas.noEncontradas.map((id) => ({ id, volumenM3: 0, motivo: "no está en el patio de este negocio" })),
    ];
    const seleccion = elegirTrozasParaBloque(
      {
        usadoM3: b.usadoM3,
        aprovechablePct: b.aprovechablePct,
        porDia: b.porDia.map((d) => {
          const f = fechaDe(d.dia);
          return { dia: d.dia, m3: d.m3, cerrado: f ? (leidas.cerradoDe[f] ?? null) : null };
        }),
        asignado: b.medidas && b.medidas.length > 0 ? [{ medidas: b.medidas }] : [],
        bloque: { ignorarMedidas: b.ignorarMedidas ?? null },
      },
      candidatas,
    );

    return NextResponse.json({
      seleccion,
      trozas: filas.map((t) => ({
        id: t.id,
        codigo: t.codigo,
        volumenM3: t.volumenM3,
        llegaISO: t.llegaISO,
        porRecepcionar: t.porRecepcionar,
        motivo: t.motivo,
      })),
      noEncontradas: leidas.noEncontradas,
      yaEnElLibro,
    });
  } catch (err) {
    logger.error("[trozas-para-bloque.POST] falló", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
