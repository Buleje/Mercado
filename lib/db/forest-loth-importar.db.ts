/**
 * ForestLothImportarDB — importar al Libro TH guías que YA se despacharon (ADR-461).
 *
 * Una guía = UNA transacción: (el plan nuevo) → talas referenciales → trozados
 * → despacho con su guía. O entra todo o nada: una guía a medias deja trozas
 * trozadas sin salida y un plan sin su madera.
 *
 * Qué decide qué: la revisión es PURA (`revisarGuia` de
 * `lib/forestal/loth-importar-guia`), la misma de la vista previa, pero acá
 * corre con lo leído DENTRO de la transacción, bajo el candado del N° de la
 * guía (y el del título, si se crea el plan). Las invariantes T1–T8 del libro
 * siguen siendo la última palabra: cada línea pasa por `registrarLineaEnTx` /
 * `despacharConGuiaEnTx` de `ForestLothDB`, no por un atajo.
 *
 * tenantId 1er parámetro · auditoría `loth_*` · caché invalidada tras el commit.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { esEsperaDeLockVencida } from "@/lib/errores/codigo-pg";
import { fichaGtfSchema } from "@/lib/forestal/loth-importar-guia-esquemas";
import { ForestLothDB, LothInvariantError, describeEntry } from "@/lib/db/forest-loth.db";
import { ContratoAjenoError, ForestPlanDB } from "@/lib/db/forest-plan.db";
import { ForestLothCierreDB } from "@/lib/db/forest-loth-cierre.db";
import { ESTADOS_SIN_INGRESO, GtfNumeroDB } from "@/lib/db/gtf-numero.db";
import { auditLoth } from "@/lib/forestal/loth-audit";
import { colaDeGtf } from "@/lib/forestal/gtf-talonario";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { repararFichaSerfor } from "@/lib/forestal/serfor-texto-danado";
import { closedPeriodOf } from "@/lib/forestal/loth-cierre-types";
import { esPlanDePlantacion } from "@/lib/forestal/loth-poa";
import { estadoGtf } from "@/lib/forestal/serfor-gtf-campos";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import {
  avisoAplica,
  claveTitulo,
  destinoDe,
  detectarPermiso,
  fechaDelLibro,
  fechaIsoDeSerfor,
  gtfDatosConFicha,
  guiaYaEnElLibro,
  leerReferencial,
  marcaReferencial,
  nombreDelPlan,
  notaPlanImportado,
  observacionGuia,
  observacionTala,
  observacionTrozado,
  revisarGuia,
  talasAEscribir,
  trozasDeLaGuia,
  vistaPreviaDeTanda,
  type ContratoDelLibro,
  type DestinoDeLaGuia,
  type GuiaParaRevisar,
  type LibroDeLaGuia,
  type LineaDelLibro,
  type PlanDelLibro,
} from "@/lib/forestal/loth-importar-guia";
import type {
  GrupoCandidatas,
  GuiaCandidata,
  GuiaVistaPrevia,
  PlanDestino,
  RespuestaCandidatas,
  ResultadoImportarGuia,
} from "@/lib/forestal/loth-importar-guia-tipos";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Tiempo de la transacción de UNA guía. Cada troza son ~20 consultas (trozado
 * + despacho con sus invariantes) y desde la PC cada una tarda ~108 ms por el
 * pooler: 49 trozas (la GTF 019-001-0000013 de Blas) ≈ 100 s. En Vercel, ~2 s.
 */
export const IMPORTAR_TX_OPTS = { timeout: 240_000, maxWait: 15_000 } as const;

/** La guía no se importa por algo que la revisión ve (un aviso que bloquea). → `rechazada`. */
export class ImportacionRechazadaError extends Error {
  constructor(
    message: string,
    readonly codigo: string,
  ) {
    super(message);
    this.name = "ImportacionRechazadaError";
  }
}

/** La guía ya está en el libro: se corta la transacción (y con ella, el plan recién creado). */
class YaEnElLibroError extends Error {
  constructor(readonly gtfNumber: string) {
    super(`Ya está en el libro: GTF ${gtfNumber}.`);
    this.name = "YaEnElLibroError";
  }
}

const txt = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const num = (v: Prisma.Decimal | null | undefined): number | null => (v == null ? null : Number(v));
const dec = (v: number | null | undefined) => (v == null ? null : new Prisma.Decimal(v));
const diaIso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * La ficha que guardó un ingreso, leída con el MISMO esquema (con topes) que
 * la de una foto (`fichaGtfSchema`): un JSON roto o desmedido en la base no
 * tumba la lista con un 500 ni entra sin tope a la revisión. `null` = no se
 * puede leer (se salta y se anota en el log, sin el contenido: trae DNI).
 */
function comoFicha(raw: unknown, ctx: { tenantId: string; woodEntryId: string }): GtfSerfor | null {
  /* Sin lista de trozas no es una ficha de guía (como antes de leerla con el esquema). */
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { trozas?: unknown }).trozas)) return null;
  const r = fichaGtfSchema.safeParse(raw);
  if (!r.success) {
    logger.warn("[forest-loth-importar] ficha guardada ilegible: se salta", {
      tenantId: ctx.tenantId,
      woodEntryId: ctx.woodEntryId,
      campo: r.error.issues[0]?.path.join(".") ?? null,
    });
    return null;
  }
  const f = r.data;
  if (!f.gtfNumber && !f.numeroRegistro) return null;
  return repararFichaSerfor(f);
}

/** Cuánto espera una escritura del importador por un lock ajeno antes de rendirse (LOCAL a la tx). */
const ESPERA_LOCKS_MS = 15_000;

/** Otra importación (o un «Deshacer») del mismo negocio está en curso → 409. */
export class ImportacionEnCursoError extends Error {
  constructor() {
    super("Hay otra importación de guías en curso en este negocio: espera a que termine y vuelve a intentar.");
    this.name = "ImportacionEnCursoError";
  }
}

/**
 * El turno del negocio, DENTRO de la transacción (ADR-461, revisión de
 * seguridad 02-10): una importación de 49 trozas tiene tomada la sección del
 * libro hasta 100 s, y dos a la vez se esperarían una a la otra con la sección
 * entera bloqueada. La primera guía de un pedido lo pide sin esperar
 * (`pg_try_advisory_xact_lock`): si otro lo tiene, 409 sin escribir. Las
 * siguientes del MISMO pedido lo esperan hasta `ESPERA_LOCKS_MS` (se suelta
 * entre guía y guía). `lock_timeout` es LOCAL: nunca de sesión en el pooler
 * (memoria `pooler-set-session-se-pega`).
 */
export async function tomarTurnoDeImportacion(tx: Prisma.TransactionClient, tenantId: string, esperar: boolean): Promise<void> {
  await tx.$queryRaw`SELECT set_config('lock_timeout', ${`${ESPERA_LOCKS_MS}ms`}, true)`;
  const clave = `loth-importar:${tenantId}`;
  if (!esperar) {
    const [fila] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${clave})) AS ok`;
    if (!fila?.ok) throw new ImportacionEnCursoError();
    return;
  }
  try {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clave}))`;
  } catch (err) {
    if (esEsperaDeLockVencida(err)) throw new ImportacionEnCursoError();
    throw err;
  }
}

const LINEA_SELECT = {
  id: true, lineNo: true, section: true, planId: true, treeCode: true, trozaCode: true,
  speciesCommon: true, speciesScientific: true, diamMayorM: true, diamMenorM: true, lengthM: true, volumeM3: true,
  entryDate: true, medicionCruda: true,
} as const;

export class ForestLothImportarDB {
  /** La ficha de SERFOR que guardó un ingreso del Libro CTP de ESTE negocio (o `null`). */
  static async fichaDeIngreso(tenantId: string, woodEntryId: string): Promise<GtfSerfor | null> {
    if (!tenantId) throw new Error("tenantId is required");
    /* Un ingreso anulado o rechazado no es madera recibida: la misma regla de la lista de candidatas. */
    const w = await prisma.woodEntry.findFirst({
      where: { tenantId, id: woodEntryId, deletedAt: null, status: { notIn: [...ESTADOS_SIN_INGRESO] } },
      select: { serforGtf: true },
    });
    return w ? comoFicha(w.serforGtf, { tenantId, woodEntryId }) : null;
  }

  /** Los planes vivos (con sus especies) y los permisos del negocio. */
  static async planesYContratos(tenantId: string, db: Db = prisma): Promise<{ planes: PlanDelLibro[]; contratos: ContratoDelLibro[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    // En serie: dentro de una tx es UNA conexión (memoria `promise-all-dentro-de-tx-interactiva`).
    const planes = await db.forestPlan.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, planType: true, planNumber: true, tituloHabilitante: true, titularName: true, contratoId: true },
      orderBy: { createdAt: "asc" },
    });
    const especies = planes.length
      ? await db.forestPlanSpecies.findMany({
          where: { tenantId, deletedAt: null, planId: { in: planes.map((p) => p.id) } },
          select: { planId: true, speciesCommon: true, speciesScientific: true },
        })
      : [];
    const contratos = await db.forestContrato.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, codigo: true, planId: true },
    });
    return {
      planes: planes.map((p) => ({ ...p, especies: especies.filter((e) => e.planId === p.id) })),
      contratos,
    };
  }

  /**
   * Lo que el libro ya tiene de estas guías: trozados de sus códigos o de sus
   * árboles, talas de sus árboles, salidas de sus trozas, guías con su N° (o
   * que citan su registro) y los meses cerrados. Con `bloquearTalas`, las talas
   * de sus árboles quedan bloqueadas para esta transacción (se pueden ampliar).
   */
  static async libroDe(
    db: Db,
    tenantId: string,
    fichas: readonly GtfSerfor[],
    opts: { bloquearTalas?: boolean } = {},
  ): Promise<LibroDeLaGuia> {
    if (!tenantId) throw new Error("tenantId is required");
    const trozas = fichas.flatMap((g) => trozasDeLaGuia(g));
    const codigos = [...new Set(trozas.map((t) => t.trozaCode))];
    const arboles = [...new Set(trozas.map((t) => t.treeCode).filter((c): c is string => !!c))];
    const vivas = { tenantId, deletedAt: null, status: "registrado" } as const;

    if (opts.bloquearTalas && arboles.length) {
      await db.$queryRaw`
        SELECT "id" FROM "ForestLothEntry"
        WHERE "tenantId" = ${tenantId} AND "section" = 'tala' AND "deletedAt" IS NULL
          AND "treeCode" IN (${Prisma.join(arboles)})
        ORDER BY "id" FOR UPDATE`;
    }
    const lineas = codigos.length || arboles.length
      ? await db.forestLothEntry.findMany({
          where: {
            ...vivas,
            OR: [
              ...(codigos.length ? [{ section: "trozado", trozaCode: { in: codigos } }] : []),
              ...(arboles.length ? [{ section: { in: ["trozado", "tala"] }, treeCode: { in: arboles } }] : []),
            ],
          },
          select: LINEA_SELECT,
        })
      : [];
    const salidas = codigos.length
      ? await db.forestLothEntry.findMany({
          where: { ...vivas, section: { in: ["despacho_troza", "consumo_troza"] }, trozaCode: { in: codigos } },
          select: { trozaCode: true, section: true, lineNo: true, gtfNumber: true },
        })
      : [];
    const colas = [...new Set(fichas.map((g) => colaDeGtf(g.gtfNumber)).filter((c): c is string => !!c))];
    const registros = [...new Set(fichas.map((g) => txt(g.numeroRegistro)).filter(Boolean))];
    const guias = colas.length || registros.length
      ? await db.forestGtf.findMany({
          where: {
            tenantId,
            deletedAt: null,
            OR: [
              ...colas.map((c) => ({ gtfNumber: { endsWith: c } })),
              ...registros.map((r) => ({ observations: { contains: r } })),
            ],
          },
          select: { id: true, gtfNumber: true, status: true, titularName: true, tituloHabilitante: true, planId: true, observations: true },
        })
      : [];
    const cierres = await ForestLothCierreDB.list(tenantId);

    const comoLinea = (l: (typeof lineas)[number]): LineaDelLibro => ({
      id: l.id,
      lineNo: l.lineNo,
      section: l.section === "tala" ? "tala" : "trozado",
      planId: l.planId,
      treeCode: l.treeCode,
      trozaCode: l.trozaCode,
      speciesCommon: l.speciesCommon,
      speciesScientific: l.speciesScientific,
      diamMayorM: num(l.diamMayorM),
      diamMenorM: num(l.diamMenorM),
      lengthM: num(l.lengthM),
      volumeM3: num(l.volumeM3),
      fecha: diaIso(l.entryDate),
      referencial: l.section === "tala" ? leerReferencial(l.medicionCruda) : null,
    });
    return {
      trozados: lineas.filter((l) => l.section === "trozado").map(comoLinea),
      talas: lineas.filter((l) => l.section === "tala").map(comoLinea),
      salidas: salidas
        .filter((s): s is typeof s & { trozaCode: string } => !!s.trozaCode)
        .map((s) => ({
          trozaCode: s.trozaCode,
          section: s.section === "consumo_troza" ? "consumo_troza" : "despacho_troza",
          lineNo: s.lineNo,
          gtfNumber: s.gtfNumber,
        })),
      guias,
      cierres,
    };
  }

  /** T8 de las talas que se armarían, por plan existente (planId → árbol → mensaje). */
  static async bajoDmcDe(tenantId: string, pedidos: readonly { planId: string; treeCodes: readonly string[] }[]) {
    const out = new Map<string, Map<string, string>>();
    const porPlan = new Map<string, Set<string>>();
    for (const p of pedidos) {
      const s = porPlan.get(p.planId) ?? new Set<string>();
      p.treeCodes.forEach((c) => s.add(c));
      porPlan.set(p.planId, s);
    }
    for (const [planId, codigos] of porPlan) {
      const errores = await ForestLothDB.arbolesBajoDmc(tenantId, planId, [...codigos]);
      if (errores.size) out.set(planId, new Map([...errores].map(([k, e]) => [k, e.message])));
    }
    return out;
  }

  /** La vista previa de una tanda: sin escribir nada. */
  static async vistaPrevia(tenantId: string, guias: readonly GuiaParaRevisar[]): Promise<GuiaVistaPrevia[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const fichas = guias.map((g) => g.ficha).filter((f): f is GtfSerfor => !!f);
    const { planes, contratos } = await ForestLothImportarDB.planesYContratos(tenantId);
    const libro = await ForestLothImportarDB.libroDe(prisma, tenantId, fichas);
    /* T8 sólo en planes que existen (uno nuevo no tiene censo). */
    const pedidos = guias.flatMap((x) => {
      if (!x.ficha) return [];
      const { destino } = destinoDe(x.ficha, detectarPermiso(x.ficha, planes, contratos), x.planElegido, planes);
      if (destino.nuevo) return [];
      return [{ planId: destino.planId, treeCodes: trozasDeLaGuia(x.ficha).map((t) => t.treeCode).filter((c): c is string => !!c) }];
    });
    const bajoDmc = await ForestLothImportarDB.bajoDmcDe(tenantId, pedidos);
    return vistaPreviaDeTanda(guias, { planes, contratos, libro, bajoDmc });
  }

  /**
   * Importa UNA guía. Devuelve el resultado (importada / ya estaba / rechazada
   * con su motivo); un error que no es del dato (la base, un bug) se tira.
   */
  static async importarGuia(
    tenantId: string,
    input: {
      ficha: GtfSerfor;
      /** Vino del SNIFFS o de una ficha guardada en el CTP (no de una foto). */
      verificada: boolean;
      planDestino: PlanDestino;
      crearTala: boolean;
      createdBy: string;
      /**
       * `false` (la 1.ª guía de un pedido): si otra importación del negocio está
       * en curso, se rechaza sin esperar. `true`: espera su turno (15 s).
       */
      esperarTurno?: boolean;
    },
  ): Promise<Omit<ResultadoImportarGuia, "clave">> {
    if (!tenantId) throw new Error("tenantId is required");
    const g = input.ficha;
    const numero = txt(g.gtfNumber);
    const registro = txt(g.numeroRegistro);
    const fecha = fechaIsoDeSerfor(g.fechaExpedicion);
    const rechazo = (codigo: string, mensaje: string): Omit<ResultadoImportarGuia, "clave"> => ({
      estado: "rechazada", mensaje, codigo, gtfId: null, gtfNumber: numero || null, planId: null, planCreado: false, lineas: null, volumenM3: null,
    });
    if (!numero) return rechazo("sin_numero", "La guía no trae su N° de GTF: no se puede anotar en el libro.");
    if (!fecha) return rechazo("sin_fecha", `La fecha de expedición «${txt(g.fechaExpedicion) || "—"}» no se entiende.`);
    if (estadoGtf(g).anulada) return rechazo("anulada", "SERFOR declara esta guía ANULADA: no ampara movilización y no se anota.");
    const cierres = await ForestLothCierreDB.list(tenantId);
    const cerrado = closedPeriodOf(cierres, fechaDelLibro(fecha));
    if (cerrado) return rechazo("PERIODO_CERRADO", `El período ${cerrado.label} está cerrado: reábrelo para anotar esta guía.`);

    const caratula = await ForestLothDB.getActiveCaratula(tenantId);
    const caratulaId = caratula?.id ?? null;
    const destinoPedido = input.planDestino;
    /* T8 (DMC) se lee antes, como en `create`: sólo en un plan que existe. */
    const bajoDmc =
      destinoPedido.tipo === "existente"
        ? (await ForestLothImportarDB.bajoDmcDe(tenantId, [
            { planId: destinoPedido.planId, treeCodes: trozasDeLaGuia(g).map((t) => t.treeCode).filter((c): c is string => !!c) },
          ])).get(destinoPedido.planId)
        : undefined;
    const fechaLinea = fechaDelLibro(fecha);

    try {
      const r = await prisma.$transaction(async (tx) => {
        // 0. El turno del negocio (y `lock_timeout` LOCAL): una importación a la vez.
        await tomarTurnoDeImportacion(tx, tenantId, input.esperarTurno === true);
        // 1. Candados: el del título (dos guías del mismo permiso nuevo no crean dos planes) y el del N°.
        if (destinoPedido.tipo === "nuevo") {
          const p = destinoPedido.plan;
          const llave = claveTitulo(g.numeroTitulo) ?? claveTitulo(p.planNumber) ?? claveTitulo(p.tituloHabilitante) ?? txt(p.titularName).toUpperCase();
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${`loth-titulo:${llave}`}))`;
        }
        await GtfNumeroDB.bloquear(tx, tenantId, numero);

        // 2. El plan: el elegido, el que ya creó otra guía con este título, o uno nuevo.
        const { planes } = await ForestLothImportarDB.planesYContratos(tenantId, tx);
        let plan: PlanDelLibro;
        let planCreado: { id: string; planType: string; planNumber: string | null; titularName: string } | null = null;
        if (destinoPedido.tipo === "existente") {
          const p = planes.find((x) => x.id === destinoPedido.planId);
          if (!p) {
            throw new LothInvariantError(
              "Ese plan de manejo no existe en este negocio o está dado de baja: elige otro plan para la guía.",
              "PLAN_NO_EXISTE",
              { planId: destinoPedido.planId },
            );
          }
          plan = p;
        } else {
          const p = destinoPedido.plan;
          const claves = new Set(
            [claveTitulo(g.numeroTitulo), claveTitulo(p.planNumber), claveTitulo(p.tituloHabilitante)].filter((c): c is string => !!c),
          );
          const ya = planes.filter(
            (x) =>
              (claveTitulo(x.planNumber) != null && claves.has(claveTitulo(x.planNumber) as string)) ||
              (claveTitulo(x.tituloHabilitante) != null && claves.has(claveTitulo(x.tituloHabilitante) as string)),
          );
          if (ya.length > 1) {
            throw new ImportacionRechazadaError(
              `Ya hay ${ya.length} permisos con el código ${[...claves][0] ?? ""}: elige a cuál va la guía.`,
              "ambiguo",
            );
          }
          if (ya.length === 1) {
            plan = ya[0];
          } else {
            const creado = await ForestPlanDB.crearPlanEnTx(tx, tenantId, {
              planType: p.planType,
              planNumber: p.planNumber,
              tituloHabilitante: p.tituloHabilitante,
              titularName: p.titularName,
              representanteLegal: p.representanteLegal,
              resolucionNumber: p.resolucionNumber,
              region: p.region,
              provincia: p.provincia,
              distrito: p.distrito,
              arffs: p.arffs,
              contratoId: p.contratoId,
              notes: notaPlanImportado(numero, registro),
              createdBy: input.createdBy,
            });
            planCreado = creado;
            plan = { ...creado, especies: [] };
          }
        }
        const destino: DestinoDeLaGuia = {
          planId: plan.id,
          nuevo: false,
          plantacion: esPlanDePlantacion(plan),
          especies: plan.especies,
          nombre: nombreDelPlan(plan),
        };

        // 3. Lo que el libro tiene, bajo los candados, y la MISMA revisión de la vista previa.
        const libro = await ForestLothImportarDB.libroDe(tx, tenantId, [g], { bloquearTalas: true });
        /* T8: un plan recién creado no tiene censo; uno que ya existía (elegido, o
           el que otra guía creó con este título) se mira contra el suyo. */
        const dmc = planCreado
          ? undefined
          : destinoPedido.tipo === "existente"
            ? bajoDmc
            : (await ForestLothImportarDB.bajoDmcDe(tenantId, [
                { planId: plan.id, treeCodes: trozasDeLaGuia(g).map((t) => t.treeCode).filter((c): c is string => !!c) },
              ])).get(plan.id);
        const rev = revisarGuia(g, destino, libro, { verificada: input.verificada, bajoDmc: dmc });
        if (rev.yaImportada) throw new YaEnElLibroError(rev.yaImportada.gtfNumber);
        const bloquea = rev.avisos.find((a) => a.nivel === "bloquea" && avisoAplica(a, input.crearTala));
        if (bloquea) throw new ImportacionRechazadaError(bloquea.mensaje, bloquea.codigo);

        // 4. Talas referenciales (antes que los trozados: T4 mide contra ellas).
        const correlativos = new Map<string, number>();
        const talasNuevas: Awaited<ReturnType<typeof ForestLothDB.registrarLineaEnTx>>[] = [];
        const talasAmpliadas: { id: string; lineNo: number; treeCode: string; antes: number | null; despues: number | null; trozas: string[] }[] = [];
        for (const t of talasAEscribir(rev.talas, input.crearTala)) {
          if (t.estado === "nueva") {
            talasNuevas.push(
              await ForestLothDB.registrarLineaEnTx(
                tx,
                tenantId,
                {
                  caratulaId,
                  planId: plan.id,
                  section: "tala",
                  treeCode: t.treeCode,
                  speciesCommon: t.speciesCommon,
                  speciesScientific: t.speciesScientific,
                  diamMayorM: t.diamMayorM,
                  diamMenorM: t.diamMenorM,
                  lengthM: t.lengthM,
                  volumeM3: t.volumeM3,
                  medicionCruda: marcaReferencial(t, [numero], [registro]),
                  observations: observacionTala([numero], t.trozas),
                  createdBy: input.createdBy,
                },
                fechaLinea,
                correlativos,
              ),
            );
            continue;
          }
          // ampliar: la tala referencial de otra guía crece con estas trozas.
          const previa = libro.talas.find((x) => x.treeCode === t.treeCode);
          if (!previa) continue;
          const gtfs = [...(previa.referencial?.gtfs ?? []), numero];
          const registros = [...(previa.referencial?.registros ?? []), registro];
          await tx.forestLothEntry.update({
            where: { id: previa.id, tenantId } satisfies Prisma.ForestLothEntryWhereUniqueInput,
            data: {
              diamMayorM: dec(t.diamMayorM),
              diamMenorM: dec(t.diamMenorM),
              lengthM: dec(t.lengthM),
              volumeM3: dec(t.volumeM3),
              medicionCruda: marcaReferencial(t, gtfs, registros) as unknown as Prisma.InputJsonValue,
              observations: observacionTala([...new Set(gtfs)], t.trozas),
            },
          });
          talasAmpliadas.push({ id: previa.id, lineNo: previa.lineNo, treeCode: t.treeCode, antes: previa.volumeM3, despues: t.volumeM3, trozas: t.trozas });
        }

        // 5. Trozados (las que ya estaban en el plan se usan como están).
        const trozados: Awaited<ReturnType<typeof ForestLothDB.registrarLineaEnTx>>[] = [];
        for (const t of rev.trozas.filter((x) => x.estado === "nueva")) {
          trozados.push(
            await ForestLothDB.registrarLineaEnTx(
              tx,
              tenantId,
              {
                caratulaId,
                planId: plan.id,
                section: "trozado",
                treeCode: t.treeCode,
                trozaCode: t.trozaCode,
                speciesCommon: t.speciesCommon,
                speciesScientific: t.speciesScientific,
                diamMayorM: t.diamMayorM,
                diamMenorM: t.diamMenorM,
                lengthM: t.lengthM,
                volumeM3: t.volumeM3,
                observations: observacionTrozado(t, numero, registro),
                createdBy: input.createdBy,
              },
              fechaLinea,
              correlativos,
            ),
          );
        }

        // 6. El despacho con su guía (T1/T2/T6/T7 por troza, la guía con la foto de lo que viajó).
        const despacho = await ForestLothDB.despacharConGuiaEnTx(
          tx,
          tenantId,
          {
            gtfNumber: numero,
            gtfDate: fechaLinea,
            trozaCodes: rev.trozas.map((t) => t.trozaCode),
            gtfDatos: gtfDatosConFicha(g, input.verificada),
            titularName: txt(g.titular) || null,
            observations: observacionGuia(registro, input.verificada),
            createdBy: input.createdBy,
          },
          caratulaId,
          { controlDeRepetidos: "ninguno" },
        );
        return {
          plan,
          planCreado,
          talasNuevas,
          talasAmpliadas,
          trozados,
          reusados: rev.trozas.filter((t) => t.estado === "ya_trozada").length,
          despacho,
        };
      }, IMPORTAR_TX_OPTS);

      ForestLothImportarDB.despuesDeImportar(tenantId, numero, registro, input, r);
      return {
        estado: "importada",
        mensaje:
          `GTF ${numero} anotada en ${nombreDelPlan(r.plan)}${r.planCreado ? " (permiso creado)" : ""}: ` +
          `${r.despacho.lineas.length} troza(s), ${fmtM3(r.despacho.volumen)} m³.`,
        codigo: null,
        gtfId: r.despacho.gtf.id,
        gtfNumber: numero,
        planId: r.plan.id,
        planCreado: r.planCreado != null,
        lineas: {
          talasNuevas: r.talasNuevas.length,
          talasAmpliadas: r.talasAmpliadas.length,
          trozadosNuevos: r.trozados.length,
          trozadosReusados: r.reusados,
          despachos: r.despacho.lineas.length,
        },
        volumenM3: r.despacho.volumen,
      };
    } catch (err) {
      if (err instanceof YaEnElLibroError) {
        return { ...rechazo("ya_estaba", err.message), estado: "ya_estaba" };
      }
      if (err instanceof ImportacionRechazadaError) return rechazo(err.codigo, err.message);
      if (err instanceof LothInvariantError) return rechazo(err.code, err.message);
      if (err instanceof ContratoAjenoError) return rechazo("contrato_ajeno", "El permiso propuesto no es de este negocio: créalo sin atarlo a un permiso.");
      if (err instanceof ImportacionEnCursoError) return rechazo("importacion_en_curso", err.message);
      if (esEsperaDeLockVencida(err)) {
        return rechazo("libro_ocupado", "El Libro TH está ocupado con otra escritura: vuelve a intentar en un momento. No quedó nada a medias.");
      }
      throw err;
    }
  }

  /** Rastro y caché, después del commit de una guía importada. */
  private static despuesDeImportar(
    tenantId: string,
    numero: string,
    registro: string,
    input: { verificada: boolean; createdBy: string },
    r: {
      plan: PlanDelLibro;
      planCreado: { id: string; planType: string; planNumber: string | null; titularName: string } | null;
      talasNuevas: (Parameters<typeof describeEntry>[0] & { id: string })[];
      talasAmpliadas: { id: string; lineNo: number; treeCode: string; antes: number | null; despues: number | null; trozas: string[] }[];
      trozados: (Parameters<typeof describeEntry>[0] & { id: string })[];
      despacho: Parameters<typeof ForestLothDB.auditarDespachoConGuia>[2];
    },
  ): void {
    const user = input.createdBy;
    if (r.planCreado) ForestPlanDB.despuesDelAlta(tenantId, r.planCreado, user);
    for (const l of [...r.talasNuevas, ...r.trozados]) {
      auditLoth({ tenantId, action: "loth_linea_create", entity: "ForestLothEntry", entityId: l.id, detail: describeEntry(l), user });
    }
    for (const a of r.talasAmpliadas) {
      auditLoth({
        tenantId,
        action: "loth_linea_ampliar_referencial",
        entity: "ForestLothEntry",
        entityId: a.id,
        detail: `Amplió la tala referencial #${a.lineNo} del árbol ${a.treeCode} con la GTF ${numero}: ${fmtM3(a.antes ?? 0)} → ${fmtM3(a.despues ?? 0)} m³ (trozas ${a.trozas.join(", ")})`,
        user,
      });
    }
    ForestLothDB.auditarDespachoConGuia(tenantId, numero, r.despacho, user);
    auditLoth({
      tenantId,
      action: "loth_gtf_importar",
      entity: "ForestGtf",
      entityId: r.despacho.gtf.id,
      detail:
        `Importó la GTF ${numero}${registro ? ` (registro SERFOR ${registro})` : ""} ` +
        `${input.verificada ? "desde SERFOR" : "desde una foto o PDF, sin verificar en SERFOR"} a ${nombreDelPlan(r.plan)}` +
        `${r.planCreado ? " (permiso creado)" : ""}: ${r.talasNuevas.length} tala(s) referencial(es)` +
        `${r.talasAmpliadas.length ? `, ${r.talasAmpliadas.length} ampliada(s)` : ""}, ${r.trozados.length} trozado(s), ` +
        `${r.despacho.lineas.length} despacho(s), ${fmtM3(r.despacho.volumen)} m³`,
      user,
    });
    for (const prefijo of [`forest-loth:${tenantId}`, `forest-gtf:${tenantId}`, `forest-plan:${tenantId}`]) {
      try {
        invalidateByPrefix(prefijo);
      } catch (err) {
        logger.error("[forest-loth-importar] no se pudo invalidar la caché", { error: String(err), tenantId, prefijo });
      }
    }
  }

  /**
   * Las guías de SERFOR que ya entraron al Libro CTP del negocio (ingresos
   * vivos con su ficha guardada) y que el Libro TH todavía no tiene, agrupadas
   * por título habilitante. Un ingreso por especie (ADR-312): se agrupan por
   * N° de registro.
   */
  static async candidatas(tenantId: string): Promise<RespuestaCandidatas> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.woodEntry.findMany({
      where: { tenantId, deletedAt: null, status: { notIn: [...ESTADOS_SIN_INGRESO] }, serforGtf: { not: Prisma.DbNull } },
      select: { id: true, gtfNumber: true, serforNumeroRegistro: true, serforGtf: true, libroNro: true },
      orderBy: [{ libroNro: "asc" }, { createdAt: "asc" }],
    });
    const porGuia = new Map<string, { woodEntryId: string; ficha: GtfSerfor }>();
    let ilegibles = 0;
    for (const f of filas) {
      const ficha = comoFicha(f.serforGtf, { tenantId, woodEntryId: f.id });
      if (!ficha) {
        ilegibles += 1;
        continue;
      }
      const llave = txt(f.serforNumeroRegistro) || txt(ficha.numeroRegistro) || `${txt(ficha.gtfNumber) || f.gtfNumber}|${txt(ficha.titular)}`;
      if (!porGuia.has(llave)) porGuia.set(llave, { woodEntryId: f.id, ficha });
    }
    const fichas = [...porGuia.values()].map((x) => x.ficha);
    const { planes, contratos } = await ForestLothImportarDB.planesYContratos(tenantId);
    const libro = await ForestLothImportarDB.libroDe(prisma, tenantId, fichas);

    const grupos = new Map<string, GrupoCandidatas>();
    let yaEnElLibro = 0;
    for (const { woodEntryId, ficha } of porGuia.values()) {
      const permiso = detectarPermiso(ficha, planes, contratos);
      const planId = permiso.estado === "existente" ? permiso.plan.planId : null;
      if (guiaYaEnElLibro(ficha, libro.guias, planId)) {
        yaEnElLibro += 1;
        continue;
      }
      const trozas = trozasDeLaGuia(ficha);
      const est = estadoGtf(ficha);
      const guia: GuiaCandidata = {
        woodEntryId,
        numeroRegistro: txt(ficha.numeroRegistro) || null,
        gtfNumber: txt(ficha.gtfNumber),
        fecha: fechaIsoDeSerfor(ficha.fechaExpedicion),
        titular: txt(ficha.titular) || null,
        especies: [...new Set(trozas.map((t) => t.speciesCommon).filter((s): s is string => !!s))],
        piezas: trozas.length,
        volumenM3: trozas.length ? Math.round(trozas.reduce((a, t) => a + (t.volumeM3 ?? 0), 0) * 10000) / 10000 : null,
        estadoSerfor: txt(ficha.estado) || null,
        anulada: est.anulada,
        sinCodigo: trozas.filter((t) => t.sinCodigo).length,
      };
      const titulo = txt(ficha.numeroTitulo) || "(sin título habilitante)";
      const llave = claveTitulo(ficha.numeroTitulo) ?? `sin:${txt(ficha.titular)}`;
      const grupo = grupos.get(llave) ?? {
        titulo,
        origenRecurso: txt(ficha.origenRecurso) || null,
        titular: txt(ficha.titular) || null,
        permiso,
        guias: [],
        piezas: 0,
        volumenM3: 0,
      };
      grupo.guias.push(guia);
      grupo.piezas += guia.piezas;
      grupo.volumenM3 = Math.round((grupo.volumenM3 + (guia.volumenM3 ?? 0)) * 10000) / 10000;
      grupos.set(llave, grupo);
    }
    const lista = [...grupos.values()];
    for (const gr of lista) gr.guias.sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "") || a.gtfNumber.localeCompare(b.gtfNumber, "es", { numeric: true }));
    lista.sort((a, b) => b.volumenM3 - a.volumenM3);
    return { grupos: lista, total: lista.reduce((a, gr) => a + gr.guias.length, 0), yaEnElLibro, ...(ilegibles ? { ilegibles } : {}) };
  }
}
