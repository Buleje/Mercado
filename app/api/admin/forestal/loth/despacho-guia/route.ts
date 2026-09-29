import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { ForestGtfDB, GtfDuplicateError } from "@/lib/db/forest-gtf.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";
import { GuiaThAlCtpDB } from "@/lib/db/guia-th-al-ctp.db";
import { GuiaYaEnElCtpError } from "@/lib/db/gtf-numero.db";
import { gtfDatosSchema, leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { correlativoEnSerie, mismoNumeroGtf, saltoDeCorrelativo } from "@/lib/forestal/gtf-talonario";
import { faltantesDespachoLoth, proponerGtfLoth } from "@/lib/forestal/loth-guia-despacho";
import { lothErrorResponse, lothValidationResponse } from "@/lib/forestal/loth-api-errors";
import { motivoSchema } from "@/lib/forestal/motivo";
import type { Contrato } from "@/lib/forestal/contratos";

/**
 * /api/admin/forestal/loth/despacho-guia — despachar trozas CON su guía
 * completa desde la sección Despacho del Libro TH (28-09-2026).
 *
 * GET   — todo lo que la guía ya sabe: carátula, planes (con su permiso),
 *         trozas del Trozado que todavía no salieron, el N° que sigue en el
 *         talonario y el cuerpo de la última guía (para heredar el transporte).
 * POST  — registra la guía y una línea de Despacho por troza, atómico.
 * PATCH — `{ id, action: "anular", reason, conDespachos }`: anula la guía y,
 *         si se pide, sus líneas de despacho (las trozas vuelven a estar libres).
 *
 * Con el Libro CTP del mismo negocio (28-09-2026): el POST deja la guía
 * guardada en el CTP para recibirla si su destinatario es este negocio (RUC =
 * el de la Ficha del CTP) y responde `ctp` con lo que pasó; el PATCH da de
 * baja esa guardada; si su madera ya entró al CTP, responde 409
 * `guia_ya_en_el_ctp` con los ingresos a anular primero. El GET trae
 * `ctpPropio` para que el modal diga ANTES de emitir si la guía va a pasar.
 *
 * Guard: requireAdmin → rate limit GENEROUS 'loth' → spec:forestal:loth-libro.
 */

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El Libro de Títulos Habilitantes no está habilitado para este negocio." },
        { status: 403 },
      );
}

const fecha = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD");

const postSchema = z.object({
  gtfNumber: z.string().trim().min(1, "Falta el N° de la guía").max(60),
  gtfDate: fecha,
  trozas: z.array(z.string().trim().min(1).max(60)).min(1, "Elige al menos una troza").max(150, "Una guía lleva hasta 150 trozas"),
  titularName: z.string().trim().max(200).nullable().optional(),
  gtfDatos: z.unknown(),
  /** El operador confirmó un N° que se adelanta más de 20 al que sigue. */
  confirmarSalto: z.boolean().optional(),
});

const patchSchema = z.object({
  id: z.string().trim().min(1),
  action: z.literal("anular"),
  /* La regla de `motivo.ts`: sin invisibles (U+200B…) y con al menos 3 letras. */
  reason: motivoSchema({ max: 500, mensaje: "El motivo va con al menos 3 letras." }),
  /** Anular también las líneas de despacho de la guía (default: sí). */
  conDespachos: z.boolean().optional(),
});

export const GET = withApiHandler("forestal-loth-despacho-guia-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  try {
    const [caratula, planes, trozas, usadas, ultima, libroCtp] = await Promise.all([
      ForestLothDB.getActiveCaratula(auth.tenantId),
      ForestPlanDB.listPlans(auth.tenantId),
      ForestLothDB.trozasParaGuia(auth.tenantId),
      ForestGtfDB.numerosUsados(auth.tenantId),
      ForestGtfDB.ultimaConDatos(auth.tenantId),
      isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"),
    ]);
    /* La planta propia: si el destinatario lleva este RUC, la guía pasa al
       Libro CTP para recibirla. Sin Libro CTP no se ofrece nada. */
    const ctpPropio = libroCtp ? await GuiaThAlCtpDB.rucPropio(auth.tenantId) : null;

    /* El permiso de cada plan: por el vínculo del plan o, si no lo tiene, por el
       código del título. Sólo de los planes que tienen trozas para despachar. */
    const conTrozas = new Set(trozas.map((t) => t.planId));
    const permisos: Record<string, Contrato | null> = {};
    await Promise.all(
      planes
        .filter((p) => conTrozas.has(p.id))
        .map(async (p) => {
          const c = p.contratoId
            ? await ForestContratoDB.get(auth.tenantId, p.contratoId)
            : p.tituloHabilitante
              ? await ForestContratoDB.porCodigo(auth.tenantId, p.tituloHabilitante)
              : null;
          permisos[p.id] = c;
        }),
    );

    const propuesta = proponerGtfLoth(usadas);
    return NextResponse.json({
      caratula,
      planes: planes.map((p) => ({
        id: p.id,
        planType: p.planType,
        planNumber: p.planNumber,
        tituloHabilitante: p.tituloHabilitante,
        resolucionNumber: p.resolucionNumber,
        titularName: p.titularName,
        arffs: p.arffs,
        region: p.region,
        provincia: p.provincia,
        distrito: p.distrito,
        parcelaCorta: p.parcelaCorta,
        sector: p.sector,
        representanteLegal: p.representanteLegal,
        isActive: p.isActive,
      })),
      permisos,
      trozas,
      talonario: propuesta
        ? { propuesta: propuesta.gtf, ultimo: propuesta.ultimo ? { numero: propuesta.ultimo.numero, fecha: propuesta.ultimo.fecha ?? null } : null }
        : { propuesta: null, ultimo: null },
      ultimaGuia: ultima ? leerGtfDatos(ultima) : null,
      ctpPropio,
    });
  } catch (err) {
    logger.error("[loth-despacho-guia.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-loth-despacho-guia-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return lothValidationResponse(parsed.error);
  const datosParsed = gtfDatosSchema.safeParse(parsed.data.gtfDatos ?? {});
  if (!datosParsed.success) return lothValidationResponse(datosParsed.error);

  const { gtfNumber, gtfDate, trozas } = parsed.data;
  // La fecha de inicio del traslado es la de emisión si no se dijo otra (igual que el CTP).
  const datos = {
    ...datosParsed.data,
    traslado: { ...datosParsed.data.traslado, fechaInicio: datosParsed.data.traslado.fechaInicio || gtfDate },
  };

  /* El despacho y la guía son el mismo acto y la guía no se edita después:
     se exige lo que pide un puesto de control, con la misma regla del CTP. */
  const faltan = faltantesDespachoLoth(datos, { gtfNumber, emision: gtfDate, trozas: trozas.length });
  if (faltan.length > 0) {
    return NextResponse.json(
      { error: "guia_incompleta", message: `Falta completar la guía: ${faltan.map((f) => f.campo).join(", ")}.`, faltan },
      { status: 422 },
    );
  }

  try {
    /* El talonario: el N° no puede repetirse escrito distinto (`019-0000001` ≡
       `19-0000001`) ni adelantarse más de 20 sin confirmar — un tipeo corre el
       talonario para siempre. */
    const usadas = await ForestGtfDB.numerosUsados(auth.tenantId);
    const repetida = usadas.find((u) => mismoNumeroGtf(u.numero, gtfNumber));
    if (repetida) {
      return NextResponse.json(
        { error: "duplicate", message: `Ya hay una guía con el N° ${repetida.numero}${repetida.fuente === "despacho_anulado" ? " (anulada)" : ""}. Un número del talonario se usa una sola vez.` },
        { status: 409 },
      );
    }
    const propuesta = proponerGtfLoth(usadas);
    const enSerie = propuesta ? correlativoEnSerie(gtfNumber, propuesta.serie) : null;
    const salto = propuesta && enSerie ? saltoDeCorrelativo(enSerie.correlativo, propuesta) : null;
    if (salto && !parsed.data.confirmarSalto) {
      return NextResponse.json(
        {
          error: "salto",
          message: `El N° ${gtfNumber} se adelanta ${salto} números al que sigue en el talonario (${propuesta?.gtf}). ¿Es correcto?`,
          propuesta: propuesta?.gtf ?? null,
          salto,
        },
        { status: 409 },
      );
    }

    const r = await ForestLothDB.despacharConGuia(auth.tenantId, {
      gtfNumber,
      gtfDate: new Date(`${gtfDate}T00:00:00.000Z`),
      trozaCodes: trozas,
      gtfDatos: datos,
      titularName: parsed.data.titularName ?? null,
      createdBy: auth.username ?? "unknown",
    });
    /* La guía ya quedó emitida: pasarla al Libro CTP no la frena (no tira) y
       lo que pasó vuelve en `ctp` para decírselo a la persona. */
    const ctp = await GuiaThAlCtpDB.pasarAlCtp(auth.tenantId, r.gtf.id, auth.username ?? "unknown");
    return NextResponse.json({ gtf: r.gtf, lineas: r.lineas.length, volumenM3: r.volumen, ctp }, { status: 201 });
  } catch (err) {
    if (err instanceof GtfDuplicateError) {
      return NextResponse.json({ error: "duplicate", message: err.message }, { status: 409 });
    }
    return lothErrorResponse(err, "loth-despacho-guia.POST", auth.tenantId);
  }
});

export const PATCH = withApiHandler("forestal-loth-despacho-guia-patch", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return lothValidationResponse(parsed.error);

  try {
    const user = auth.username ?? "unknown";
    if (parsed.data.conDespachos === false) {
      const gtf = await ForestGtfDB.annul(auth.tenantId, parsed.data.id, parsed.data.reason, user);
      const ctp = await GuiaThAlCtpDB.alAnular(auth.tenantId, gtf, parsed.data.reason, user);
      return NextResponse.json({ gtf, lineasAnuladas: 0, ctp });
    }
    const r = await ForestLothDB.anularGuiaConDespachos(auth.tenantId, parsed.data.id, parsed.data.reason, user);
    if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const ctp = await GuiaThAlCtpDB.alAnular(auth.tenantId, r.gtf, parsed.data.reason, user);
    return NextResponse.json({ ...r, ctp });
  } catch (err) {
    /* La madera de esta guía ya entró al Libro CTP: anularla acá liberaría
       trozas que allá siguen en el libro. Se dice cuáles ingresos anular. */
    if (err instanceof GuiaYaEnElCtpError) {
      return NextResponse.json(
        { error: "guia_ya_en_el_ctp", message: err.message, libroNros: err.libroNros },
        { status: 409 },
      );
    }
    return lothErrorResponse(err, "loth-despacho-guia.PATCH", auth.tenantId);
  }
});
