import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { ForestLothArbolesAManoDB } from "@/lib/db/forest-loth-arboles-a-mano.db";
import { ForestGtfDB, GtfDuplicateError } from "@/lib/db/forest-gtf.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";
import { GuiaThAlCtpDB } from "@/lib/db/guia-th-al-ctp.db";
import { GuiaYaEnElCtpError } from "@/lib/db/gtf-numero.db";
import { GuiasGuardadasDB } from "@/lib/db/guias-guardadas.db";
import { gtfDatosSchema, leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import {
  faltantesDespachoLoth,
  identidadDelTitulo,
  mensajeOtraRegion,
  trasladoParaGuardar,
  titularParaGuardar,
  revisarNumeroLoth,
  talonarioDelPlan,
  type GtfUsadaLoth,
} from "@/lib/forestal/loth-guia-despacho";
import { FILAS_POR_LISTA, hojasDeLista, listasEfectivas } from "@/lib/forestal/loth-lista-numero";
import { lothErrorResponse, lothValidationResponse } from "@/lib/forestal/loth-api-errors";
import { motivoSchema } from "@/lib/forestal/motivo";
import { TROZAS_POR_GUIA_MAX, trozaAManoSchema, trozasDeFilas } from "@/lib/forestal/loth-trozas-a-mano";
import { CORRELATIVO_MAX } from "@/lib/forestal/testas-medicion";
import { ClaveOcupadaError } from "@/lib/db/platform-settings.db";
import { MAX_CARGAS_POR_GUIA } from "@/lib/forestal/medicion-carga";
import { cerrarCargasDeGuia, reservarCargasDeGuia, soltarCargasDeGuia, type ReservaCargas } from "@/lib/forestal/medicion-carga-server";
import type { Contrato } from "@/lib/forestal/contratos";

/**
 * /api/admin/forestal/loth/despacho-guia — despachar trozas CON su guía
 * completa desde la sección Despacho del Libro TH (28-09-2026).
 *
 * GET   — todo lo que la guía ya sabe: carátula, planes (con su permiso),
 *         trozas del Trozado que todavía no salieron, los N° ya usados CON su
 *         titular (el modal calcula el talonario del plan elegido con
 *         `talonarioDelPlan`: la serie sale de la región del plan) y el cuerpo
 *         de la última guía (para heredar el transporte).
 * POST  — registra la guía y una línea de Despacho por troza, atómico. Vuelve
 *         a calcular el talonario del plan de las trozas con la MISMA función
 *         y pregunta (409) si el N° es de otra región (`confirmarSerie`) o se
 *         adelanta más de 20 (`confirmarSalto`). `aMano` (15-10): trozas
 *         anotadas a mano (D1, D2, largo, cantidad) que se asientan en el
 *         Trozado en la misma transacción; su volumen se recalcula acá. Van con
 *         el plan de las trozas del libro o, si no hay, con `planId` (o sin
 *         permiso: se asigna después en la tabla de guías). Cada fila puede
 *         llevar `arbolId` (árbol del censo, del permiso y la especie de la
 *         guía); responde `codigosAMano`, lo que imprime la guía de cada una.
 * GET ?arboles=1 — los árboles del censo para elegir el de una troza a mano
 *         (permisos vivos, sin descartados, con su tala y sus trozas).
 * PATCH — `{ id, action: "anular", reason, conDespachos }`: anula la guía y,
 *         si se pide, sus líneas de despacho (las trozas vuelven a estar libres).
 *
 * `cargas` (16-10, security F3): los ids de las cargas medidas en el monte que
 * van en esta guía. Se marcan `usada` con el N° bajo el candado de su clave
 * ANTES de escribir el libro; si una ya va en otra guía o está descartada,
 * 409 y no se escribe nada. Si el registro falla, vuelven a `medida`. Con la
 * guía registrada, sus fotos pasan a los papeles de la guía (`cargas` en la
 * respuesta dice cuántas).
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
  trozas: z.array(z.string().trim().min(1).max(60)).max(TROZAS_POR_GUIA_MAX, "Una guía lleva hasta 150 trozas").default([]),
  /** Trozas anotadas a mano: medidas y cantidad. El volumen NO viaja: lo calcula el servidor. */
  aMano: z.array(trozaAManoSchema).max(TROZAS_POR_GUIA_MAX).optional(),
  /** El primer N° de las trozas a mano sin árbol (16-10: el correlativo del permiso, «Medir por foto»). Sin él, 1. */
  desde: z.number().int().min(1).max(CORRELATIVO_MAX).optional(),
  /** El plan de la guía cuando sólo lleva trozas a mano (`null` = sin permiso todavía). */
  planId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "El permiso no es válido.").nullable().optional(),
  titularName: z.string().trim().max(200).nullable().optional(),
  gtfDatos: z.unknown(),
  /** El operador confirmó un N° que se adelanta más de 20 al que sigue. */
  confirmarSalto: z.boolean().optional(),
  /** El operador confirmó un N° de OTRA región que la del plan (p. ej. 010 con un plan en Pasco). */
  confirmarSerie: z.boolean().optional(),
  /** Las cargas del monte que van en esta guía (se marcan usadas al registrar). */
  cargas: z.array(z.string().trim().min(1).max(64)).max(MAX_CARGAS_POR_GUIA, `Una guía lleva hasta ${MAX_CARGAS_POR_GUIA} cargas del monte`).optional(),
}).superRefine((b, ctx) => {
  const total = b.trozas.length + trozasDeFilas(b.aMano ?? []);
  if (total === 0) ctx.addIssue({ code: "custom", path: ["trozas"], message: "Elige al menos una troza o anótala a mano" });
  if (total > TROZAS_POR_GUIA_MAX) ctx.addIssue({ code: "custom", path: ["trozas"], message: "Una guía lleva hasta 150 trozas" });
});

/**
 * Los N° que ya gastaron un talonario: las guías de este libro (anuladas
 * incluidas), las de SERFOR guardadas en el Libro CTP y las que ya entraron
 * como ingresos (`WoodEntry`), cada una con su dueño.
 */
async function usadasDelTalonario(tenantId: string): Promise<GtfUsadaLoth[]> {
  const [delLibro, guardadas, ingresos] = await Promise.all([
    ForestGtfDB.usadasConDueno(tenantId),
    GuiasGuardadasDB.numerosParaTalonario(tenantId),
    ForestGtfDB.numerosDeIngresos(tenantId),
  ]);
  return [...delLibro, ...guardadas, ...ingresos];
}

/** El permiso del plan: por su vínculo o, si no lo tiene, por el código del título. */
async function permisoDelPlan(
  tenantId: string,
  p: { contratoId: string | null; tituloHabilitante: string | null },
): Promise<Contrato | null> {
  if (p.contratoId) return ForestContratoDB.get(tenantId, p.contratoId);
  return p.tituloHabilitante ? ForestContratoDB.porCodigo(tenantId, p.tituloHabilitante) : null;
}

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

  /* `?lineasDeGuia=<id>`: cuántas líneas de despacho anula anular ESA guía —
     la misma regla que la anulación (`ForestLothDB.lineasDeLaGuia`), para que
     el modal no cuente las de otro titular con el mismo N° (29-09-2026). */
  const params = new URL(req.url).searchParams;
  /* `?arboles=1`: los árboles del censo para la troza a mano (se pide al abrir
     el selector, no al montar el modal). */
  if (params.get("arboles") === "1") {
    try {
      return NextResponse.json({ arboles: await ForestLothArbolesAManoDB.paraElegir(auth.tenantId) });
    } catch (err) {
      logger.error("[loth-despacho-guia.GET arboles] failed", { error: String(err), tenantId: auth.tenantId });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  }
  const lineasDe = params.get("lineasDeGuia");
  if (lineasDe) {
    try {
      const gtf = await ForestGtfDB.getById(auth.tenantId, lineasDe);
      if (!gtf) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const lineas = await ForestLothDB.lineasDeLaGuia(auth.tenantId, gtf);
      return NextResponse.json({ lineas: lineas.length });
    } catch (err) {
      logger.error("[loth-despacho-guia.GET lineas] failed", { error: String(err), tenantId: auth.tenantId });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  }

  try {
    const [caratula, planes, trozas, usadas, ultima, libroCtp, siguienteCorrelativo] = await Promise.all([
      ForestLothDB.getActiveCaratula(auth.tenantId),
      ForestPlanDB.listPlans(auth.tenantId),
      ForestLothDB.trozasParaGuia(auth.tenantId),
      usadasDelTalonario(auth.tenantId),
      ForestGtfDB.ultimaConDatos(auth.tenantId),
      isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"),
      ForestLothDB.siguientesCorrelativos(auth.tenantId),
    ]);
    /* La planta propia: si el destinatario lleva este RUC, la guía pasa al
       Libro CTP para recibirla. Sin Libro CTP no se ofrece nada. */
    /* Los planes que pueden ir en la guía: los que tienen trozas para despachar
       y, desde el árbol de la troza a mano (15-10), cualquier plan vivo — la
       guía sólo de trozas a mano toma el permiso de su árbol («Usar el
       permiso»). Son pocos por negocio. */
    const paraLaGuia = planes.map((p) => p.id);
    /* La última guía de CADA plan (FOR-2, 09-10): la nueva hereda de la de su
       permiso; la del negocio queda sólo para el plan sin guías. */
    const [ctpPropio, ultimasPorPlan] = await Promise.all([
      libroCtp ? GuiaThAlCtpDB.rucPropio(auth.tenantId) : Promise.resolve(null),
      ForestGtfDB.ultimasConDatosPorPlan(auth.tenantId, paraLaGuia),
    ]);

    /* El permiso de cada plan: por el vínculo del plan o, si no lo tiene, por el
       código del título. */
    const permisos: Record<string, Contrato | null> = {};
    await Promise.all(
      planes.map(async (p) => {
        permisos[p.id] = await permisoDelPlan(auth.tenantId, p);
      }),
    );

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
      talonario: { usadas },
      ultimaGuia: ultima ? leerGtfDatos(ultima.gtfDatos) : null,
      ultimaGuiaNumero: ultima?.gtfNumber ?? null,
      ultimasPorPlan: Object.fromEntries([...ultimasPorPlan].map(([planId, g]) => [planId, { gtfNumber: g.gtfNumber, datos: leerGtfDatos(g.gtfDatos) }])),
      ctpPropio,
      /** El N° que sigue por permiso (`sin_permiso` = sin plan) para las trozas a mano. */
      siguienteCorrelativo,
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
  const aMano = parsed.data.aMano ?? [];
  /* Lo que viaja: las trozas del libro + las anotadas a mano (cada unidad, una troza). */
  const totalTrozas = trozas.length + trozasDeFilas(aMano);
  /* La fecha de inicio del traslado es la de emisión si no se dijo otra (igual
     que el CTP). El (35) se guarda como se imprime: un N° por hoja («9» con
     dos hojas es «9, 10»), para que reimprimir diga lo mismo. */
  const hojas = hojasDeLista(totalTrozas);
  /* La partida y la llegada impresas se rearman acá con `componerPunto` desde
     sus casilleros: el texto que manda el cliente no se cree (29-09-2026). La
     llegada ES el destinatario (formato 2024, 15-10-2026): la que mande el
     navegador tampoco se cree. */
  const traslado = trasladoParaGuardar(datosParsed.data);
  const datos = {
    ...datosParsed.data,
    traslado: { ...traslado, fechaInicio: traslado.fechaInicio || gtfDate },
    /* Y con cuántas filas por hoja se partió: reimprimirla mañana, con otro
       corte vigente, tiene que dar las mismas hojas (`filasPorHojaGuardada`). */
    guia: {
      ...datosParsed.data.guia,
      listaTrozasNro: listasEfectivas(datosParsed.data.guia.listaTrozasNro, hojas).texto,
      filasPorLista: FILAS_POR_LISTA,
    },
  };

  /* El despacho y la guía son el mismo acto y la guía no se edita después:
     se exige lo que pide un puesto de control, con la misma regla del CTP. */
  const faltan = faltantesDespachoLoth(datos, { gtfNumber, emision: gtfDate, trozas: totalTrozas });
  if (faltan.length > 0) {
    return NextResponse.json(
      { error: "guia_incompleta", message: `Falta completar la guía: ${faltan.map((f) => f.campo).join(", ")}.`, faltan },
      { status: 422 },
    );
  }

  let reserva: ReservaCargas | null = null;
  let registrada = false;
  const user = auth.username ?? "unknown";
  try {
    /* El talonario: el N° no puede repetirse en el MISMO talonario escrito
       distinto (`019-0000001` ≡ `19-0000001`) ni adelantarse más de 20 sin
       confirmar — un tipeo corre el talonario para siempre. Los talonarios son
       del titular: el mismo N° de otro titular no frena (se avisa en el modal).
       Una guía de SERFOR guardada o ingresada con ese N° tampoco frena: puede
       ser justo la guía hecha a mano que ahora se asienta acá. La última
       palabra la tiene `despacharConGuia`, bajo el candado del N°. */
    const [usadas, libres, caratula] = await Promise.all([
      usadasDelTalonario(auth.tenantId),
      ForestLothDB.trozasParaGuia(auth.tenantId),
      ForestLothDB.getActiveCaratula(auth.tenantId),
    ]);

    /* El talonario del PLAN de las trozas, con la misma función del modal: la
       región sale del plan (no de lo que diga el cliente). Trozas de dos planes
       las rechaza `despacharConGuia` más abajo. */
    const elegidas = new Set(trozas);
    const delLibro = [...new Set(libres.filter((t) => elegidas.has(t.codigo)).map((t) => t.planId ?? null))];
    /* Sólo trozas a mano: la guía es del plan que dice el modal (o sin permiso).
       El plan tiene que ser de este negocio y estar vivo. */
    const planAMano = trozas.length === 0 && parsed.data.planId ? await ForestPlanDB.getPlan(auth.tenantId, parsed.data.planId) : null;
    if (trozas.length === 0 && parsed.data.planId && !planAMano) {
      return NextResponse.json(
        { error: "PLAN_NO_EXISTE", message: "Ese plan de manejo no existe en este negocio o está dado de baja: elige otro permiso." },
        { status: 422 },
      );
    }
    const planes = trozas.length === 0 ? [planAMano?.id ?? null] : delLibro;
    /* Sin trozas libres, o de dos planes: no hay UN talonario que revisar;
       `despacharConGuia` dice qué pasa con esas trozas. */
    const unPlan = planes.length === 1;
    const planId = unPlan ? planes[0] : null;
    const plan = planId ? (planAMano?.id === planId ? planAMano : await ForestPlanDB.getPlan(auth.tenantId, planId)) : null;
    const permiso = plan ? await permisoDelPlan(auth.tenantId, plan) : null;
    const id = identidadDelTitulo({ caratula, plan, permiso });
    const dueno = { titular: id.titular, permiso: id.tituloHabilitante, planId };
    const talonario = talonarioDelPlan({ ubigeo: id, dueno }, usadas);
    const revision = unPlan ? revisarNumeroLoth(gtfNumber, talonario, dueno) : null;
    if (revision?.repetida) {
      const r = revision.repetida;
      return NextResponse.json(
        { error: "duplicate", message: `Ya hay una guía de este titular con el N° ${r.numero}${r.fuente === "despacho_anulado" ? " (anulada)" : ""}. Un número del talonario se usa una sola vez.` },
        { status: 409 },
      );
    }
    if (revision?.otraRegion && talonario.region && !parsed.data.confirmarSerie) {
      return NextResponse.json(
        {
          error: "serie_de_otra_region",
          message: mensajeOtraRegion(gtfNumber, revision.otraRegion, talonario.region),
          region: revision.otraRegion.codigo,
          regionPlan: talonario.region.codigo,
        },
        { status: 409 },
      );
    }
    if (revision?.salto && !parsed.data.confirmarSalto) {
      return NextResponse.json(
        {
          error: "salto",
          message: `El N° ${gtfNumber} se adelanta ${revision.salto} números al que sigue en el talonario (${talonario.propuesta?.gtf}). ¿Es correcto?`,
          propuesta: talonario.propuesta?.gtf ?? null,
          salto: revision.salto,
        },
        { status: 409 },
      );
    }

    /* El titular que se guarda es el del plan, calculado acá: el del
       navegador no decide de qué talonario es el N°. */
    const titular = titularParaGuardar(id.titular, parsed.data.titularName);
    if (titular.ignorado) {
      logger.warn("[loth-despacho-guia.POST] titular del navegador ignorado", {
        tenantId: auth.tenantId,
        navegador: titular.ignorado,
        servidor: titular.titular,
        gtfNumber,
      });
    }
    /* Las cargas del monte se marcan ANTES de escribir el libro, bajo su
       candado: la misma carga no sale en dos guías (security 16-10). */
    const cargas = [...new Set(parsed.data.cargas ?? [])];
    const reservada = await reservarCargasDeGuia(auth.tenantId, cargas, gtfNumber, user);
    if (!reservada.ok) return NextResponse.json({ error: reservada.error, message: reservada.message }, { status: reservada.status });
    reserva = reservada.reserva;

    const r = await ForestLothDB.despacharConGuia(auth.tenantId, {
      gtfNumber,
      gtfDate: new Date(`${gtfDate}T00:00:00.000Z`),
      trozaCodes: trozas,
      /* Las a mano van con el plan de la guía (el de sus trozas del libro, si las hay). */
      ...(aMano.length ? { aMano: { filas: aMano, planId: unPlan ? planId : null, desde: parsed.data.desde } } : {}),
      gtfDatos: datos,
      titularName: titular.titular,
      createdBy: user,
    });
    registrada = true;
    /* La guía ya quedó emitida: pasarla al Libro CTP no la frena (no tira) y
       lo que pasó vuelve en `ctp` para decírselo a la persona. Igual las
       fotos de las cargas del monte. */
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
    const [ctp, cierre] = await Promise.all([
      GuiaThAlCtpDB.pasarAlCtp(auth.tenantId, r.gtf.id, user),
      cerrarCargasDeGuia(auth.tenantId, reserva, r.gtf.gtfNumber, user, ip),
    ]);
    return NextResponse.json(
      { gtf: r.gtf, lineas: r.lineas.length, volumenM3: r.volumen, codigosAMano: r.codigosAMano, ctp, ...(cierre ? { cargas: cierre } : {}) },
      { status: 201 },
    );
  } catch (err) {
    /* La guía no quedó: las cargas que este registro marcó vuelven a «medida». */
    if (!registrada) await soltarCargasDeGuia(auth.tenantId, reserva, user);
    if (err instanceof ClaveOcupadaError) {
      return NextResponse.json(
        { error: "ocupado", message: "Otra PC está usando las cargas del monte en este momento. Vuelve a registrar en unos segundos." },
        { status: 409 },
      );
    }
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
