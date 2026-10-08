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
import { ForestLothDB, LothInvariantError, LothPermisoError, describeEntry } from "@/lib/db/forest-loth.db";
import { ContratoAjenoError, ForestPlanDB } from "@/lib/db/forest-plan.db";
import { ForestLothCierreDB } from "@/lib/db/forest-loth-cierre.db";
import { ESTADOS_SIN_INGRESO, GtfNumeroDB } from "@/lib/db/gtf-numero.db";
import { auditLoth, type LothAuditAction, type LothAuditEntity, type SesionDeAuditoria } from "@/lib/forestal/loth-audit";
import { colaDeGtf } from "@/lib/forestal/gtf-talonario";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { limpiarMotivo, motivoCupoValido, notaSobreCupo } from "@/lib/forestal/loth-cupo-especie";
import {
  claveT6,
  detalleDespachoSobreAutorizado,
  excesosDelDespacho,
  type DespachoT6DeLaEspecie,
  type EstadoT6DelPlan,
} from "@/lib/forestal/loth-t6";
import { rehacerTanda } from "@/lib/forestal/loth-importar-guia-tanda";
import { repararFichaSerfor } from "@/lib/forestal/serfor-texto-danado";
import { closedPeriodOf } from "@/lib/forestal/loth-cierre-types";
import { esPlanDePlantacion } from "@/lib/forestal/loth-poa";
import { estadoGtf } from "@/lib/forestal/serfor-gtf-campos";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import {
  avisoAplica,
  claveTitulo,
  codigosDeLaGuia,
  codigosParaRevisar,
  destinoDe,
  entraComoNueva,
  detectarPermiso,
  porQueNoAplicaExcepcionT6,
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
  renombresSinConfirmar,
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
  ContextoTanda,
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

/**
 * El evento de una guía VERIFICADA importada sobre lo AUTORIZADO (T6 con
 * motivo, ADR-468), en la tx de la guía: lo que el titular explica ante
 * OSINFOR no puede quedar asentado sin su rastro (como `auditarSobreCupoEnTx`).
 * ActivityLog tiene RLS por `app.tenant_id` (ADR-114): se fija sólo para la tx.
 */
async function auditarDespachoSobreAutorizadoEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  e: { gtfId: string; detail: string; user: string; sesion?: SesionDeAuditoria },
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
  await tx.activityLog.create({
    data: {
      tenantId,
      action: "loth_despacho_sobre_autorizado" satisfies LothAuditAction,
      entity: "ForestGtf" satisfies LothAuditEntity,
      entityId: e.gtfId,
      user: e.user || "unknown",
      ipAddress: e.sesion?.ipAddress ?? null,
      userAgent: e.sesion?.userAgent ?? null,
      detail: e.detail.slice(0, 2000),
    },
  });
}

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
    /* Los de la guía y los únicos que se propondrían (ADR-474): si ya están tomados, no se proponen. */
    const codigos = [...new Set(fichas.flatMap((g) => codigosParaRevisar(g)))];
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

  /**
   * La vista previa de una tanda: sin escribir nada. Devuelve las guías (con
   * T6/T9 de la tanda entera, `rehacerTanda`) y lo leído por plan (`tanda`),
   * para que la pantalla rehaga esas sumas con las guías que deje marcadas.
   *
   * `puedePasarT6` (ADR-468): quien mira es admin o dueño (lo decide la ruta
   * por el JWT). Con él, una guía VERIFICADA que pasa T6 pide motivo en vez de
   * bloquearse; sin él (o sin pasarlo), se bloquea como siempre.
   */
  static async vistaPrevia(
    tenantId: string,
    guias: readonly GuiaParaRevisar[],
    opts: { puedePasarT6?: boolean } = {},
  ): Promise<{ guias: GuiaVistaPrevia[]; tanda: ContextoTanda }> {
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
    /* T9: la MISMA lectura que mide la importación (`entradaCupoDelPlan`),
       sin lock ni escritura, una vez por plan existente. */
    const planIds = [...new Set(pedidos.map((p) => p.planId))];
    const [bajoDmc, entradas, t6] = await Promise.all([
      ForestLothImportarDB.bajoDmcDe(tenantId, pedidos),
      Promise.all(planIds.map((planId) => ForestLothDB.entradaCupoDelPlan(prisma, tenantId, planId))),
      ForestLothImportarDB.t6De(tenantId, guias, planes, contratos, libro),
    ]);
    const tanda: ContextoTanda = {
      cupos: planIds.map((planId, i) => ({ planId, entrada: entradas[i] })),
      t6: [...t6].map(([planId, e]) => ({
        planId,
        delPlan: e.delPlan.map((x) => ({ speciesCommon: x.speciesCommon, speciesScientific: x.speciesScientific ?? null })),
        medidas: [...e.medidas].map(([clave, m]) => ({ clave, autorizado: m.autorizado, movilizado: m.movilizado })),
      })),
      puedePasarT6: opts.puedePasarT6 === true,
    };
    const base = vistaPreviaDeTanda(guias, { planes, contratos, libro, bajoDmc });
    /* Todas marcadas, cada una con su interruptor por defecto: lo que importaría «Importar todas». */
    return { guias: rehacerTanda(base, tanda, (g) => ({ marcada: true, crearTala: g.crearTalaPorDefecto })), tanda };
  }

  /**
   * T6 de los planes existentes a los que van las guías: sus especies y, por
   * cada especie que las guías despacharían (la de la guía o, si la troza ya
   * estaba trozada, la de su línea), la MISMA medida del despacho
   * (`ForestLothDB.medidaT6`), sin lock ni escritura.
   */
  private static async t6De(
    tenantId: string,
    guias: readonly GuiaParaRevisar[],
    planes: PlanDelLibro[],
    contratos: ContratoDelLibro[],
    libro: Awaited<ReturnType<typeof ForestLothImportarDB.libroDe>>,
  ): Promise<Map<string, EstadoT6DelPlan>> {
    const especies = new Map<string, { comun: string | null; cientifico: string | null }[]>();
    for (const x of guias) {
      if (!x.ficha) continue;
      const { destino } = destinoDe(x.ficha, detectarPermiso(x.ficha, planes, contratos), x.planElegido, planes);
      if (destino.nuevo) continue;
      const l = especies.get(destino.planId) ?? [];
      for (const t of trozasDeLaGuia(x.ficha)) {
        l.push({ comun: t.speciesCommon, cientifico: t.speciesScientific });
        const tz = libro.trozados.find((z) => z.trozaCode === t.trozaCode && z.planId === destino.planId);
        if (tz) l.push({ comun: tz.speciesCommon, cientifico: tz.speciesScientific });
      }
      especies.set(destino.planId, l);
    }
    const out = new Map<string, EstadoT6DelPlan>();
    await Promise.all(
      [...especies].map(async ([planId, lista]) => {
        const delPlan = await ForestLothDB.especiesT6DelPlan(prisma, tenantId, planId);
        const claves = [...new Set(lista.map((e) => claveT6(delPlan, e.comun, e.cientifico)).filter((c): c is string => !!c))];
        const medidas = await Promise.all(claves.map((c) => ForestLothDB.medidaT6(prisma, tenantId, planId, delPlan, c)));
        out.set(planId, { delPlan, medidas: new Map(claves.map((c, i) => [c, medidas[i]])) });
      }),
    );
    return out;
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
      /**
       * T9: el motivo y la decisión de rol para pasar lo AUTORIZADO de una
       * especie, como en el alta (`puedeExcederCupo` lo decide la ruta por el
       * JWT, nunca el body). Valen para las talas nuevas y las que se agrandan.
       * El motivo lo escribe la persona en la vista previa (que mide el mismo
       * exceso con `entradaCupoDelPlan`); sin él, sobre lo autorizado → 422.
       */
      motivoSobreCupo?: string | null;
      puedeExcederCupo?: boolean;
      /**
       * T6 (ADR-468): admin o dueño, decidido por la ruta con el JWT. Una guía
       * `verificada` (la resolvió el servidor: SNIFFS o ficha guardada en el
       * CTP) que despacha más de lo AUTORIZADO entra sólo con esto Y un
       * `motivoSobreCupo` válido (el mismo motivo de T9): queda el evento
       * `loth_despacho_sobre_autorizado` en su transacción. Si falta algo,
       * `T6_EXCESO_AUTORIZADO` como siempre.
       */
      puedeExcederDespacho?: boolean;
      /**
       * T6: la persona VIO el despacho sobre lo autorizado en la vista previa
       * (consentimiento, no permiso). Sin esto, el motivo de T9 no lo destraba.
       */
      confirmaDespacho?: boolean;
      /**
       * ADR-474: los códigos únicos que la persona confirmó en la vista previa
       * (trozas `renombrada`). Se vuelve a revisar bajo el candado: la que el
       * servidor renombre y no esté acá rechaza la guía.
       */
      confirmaRenombres?: readonly string[];
      /** IP y navegador del pedido (la ruta): van a los eventos sobre-cupo y sobre-autorizado. */
      sesion?: SesionDeAuditoria;
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
    /* T6: si la guía, verificada y firmada, igual no se exime, el rechazo dice por qué. */
    let t6SinExcepcion: string | null = null;

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
        const { planes, contratos } = await ForestLothImportarDB.planesYContratos(tenantId, tx);
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
        const sinConfirmar = renombresSinConfirmar(rev.trozas, input.confirmaRenombres);
        if (sinConfirmar.length) {
          throw new ImportacionRechazadaError(
            `La guía repite códigos de otra guía de este permiso y no se confirmó que sean OTRAS trozas (${sinConfirmar.slice(0, 6).join(", ")}${sinConfirmar.length > 6 ? "…" : ""}): vuelve a la vista previa y confírmalo.`,
            "renombre_sin_confirmar",
          );
        }

        // 4. Talas referenciales (antes que los trozados: T4 mide contra ellas).
        const correlativos = new Map<string, number>();
        const talasNuevas: Awaited<ReturnType<typeof ForestLothDB.registrarLineaEnTx>>[] = [];
        const talasAmpliadas: { id: string; lineNo: number; treeCode: string; antes: number | null; despues: number | null; trozas: string[] }[] = [];
        /* Las nuevas antes que las ampliadas: así el lock del cupo (T9) que toma
           una ampliación llega con el correlativo de la Tala ya tomado, como en
           `asentarEnTx`. Al revés, la guía tendría el cupo esperando ese
           correlativo y un alta de tala, el correlativo esperando el cupo. */
        const aEscribir = talasAEscribir(rev.talas, input.crearTala);
        for (const t of [...aEscribir.filter((x) => x.estado === "nueva"), ...aEscribir.filter((x) => x.estado !== "nueva")]) {
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
                  motivoSobreCupo: input.motivoSobreCupo,
                  puedeExcederCupo: input.puedeExcederCupo,
                  sesion: input.sesion,
                  createdBy: input.createdBy,
                },
                fechaLinea,
                correlativos,
                `tala nueva de la GTF ${numero}: ${fmtM3(t.volumeM3 ?? 0)} m³`,
              ),
            );
            continue;
          }
          // ampliar: la tala referencial de otra guía crece con estas trozas.
          const previa = libro.talas.find((x) => x.treeCode === t.treeCode);
          if (!previa) continue;
          const gtfs = [...(previa.referencial?.gtfs ?? []), numero];
          const registros = [...(previa.referencial?.registros ?? []), registro];
          /* T9 también al agrandar (revisión de seguridad 04-10): sólo el aumento,
             con el plan y la especie del censo, ANTES del update. Sobre lo
             autorizado sin motivo, el 422 rechaza la guía entera (catch de abajo). */
          const cupo = await ForestLothDB.cupoAlAmpliarTalaEnTx(
            tx,
            tenantId,
            { planId: previa.planId ?? plan.id, treeCode: t.treeCode, speciesScientific: previa.speciesScientific, antesM3: previa.volumeM3, despuesM3: t.volumeM3 },
            { motivoSobreCupo: input.motivoSobreCupo, puedeExcederCupo: input.puedeExcederCupo, createdBy: input.createdBy },
          );
          const obs = observacionTala([...new Set(gtfs)], t.trozas);
          await tx.forestLothEntry.update({
            where: { id: previa.id, tenantId } satisfies Prisma.ForestLothEntryWhereUniqueInput,
            data: {
              diamMayorM: dec(t.diamMayorM),
              diamMenorM: dec(t.diamMenorM),
              lengthM: dec(t.lengthM),
              volumeM3: dec(t.volumeM3),
              medicionCruda: marcaReferencial(t, gtfs, registros) as unknown as Prisma.InputJsonValue,
              observations:
                cupo && motivoCupoValido(input.motivoSobreCupo) ? `${notaSobreCupo(cupo, input.motivoSobreCupo ?? "")} ${obs}`.slice(0, 2000) : obs,
            },
          });
          if (cupo) {
            const aumento = (t.volumeM3 ?? 0) - (previa.volumeM3 ?? 0);
            await ForestLothDB.auditarSobreCupoEnTx(
              tx,
              tenantId,
              cupo,
              { id: previa.id, lineNo: previa.lineNo, treeCode: t.treeCode },
              input.motivoSobreCupo,
              input.createdBy,
              `(agrandada con la GTF ${numero}: ${fmtM3(previa.volumeM3 ?? 0)} → ${fmtM3(t.volumeM3 ?? 0)} m³, +${fmtM3(aumento)}; exceso ${fmtM3(cupo.excesoM3)} m³)`,
              input.sesion,
            );
          }
          talasAmpliadas.push({ id: previa.id, lineNo: previa.lineNo, treeCode: t.treeCode, antes: previa.volumeM3, despues: t.volumeM3, trozas: t.trozas });
        }

        // 5. Trozados (las que ya estaban en el plan se usan como están).
        const trozados: Awaited<ReturnType<typeof ForestLothDB.registrarLineaEnTx>>[] = [];
        for (const t of rev.trozas.filter(entraComoNueva)) {
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
        /* T6 con motivo (ADR-468): sólo la guía que SERFOR ya emitió (lo dice el
           servidor, no el cuerpo), con motivo, rol y la confirmación de la vista,
           si su título es el de ESTE permiso y el libro mide lo que dice la guía
           (`porQueNoAplicaExcepcionT6`, la misma de la vista previa). Si no, el despacho rechaza. */
        const firmada = input.verificada && input.puedeExcederDespacho === true && motivoCupoValido(input.motivoSobreCupo);
        const reparo = firmada
          ? porQueNoAplicaExcepcionT6(g, destino, detectarPermiso(g, planes, contratos), rev.trozas, libro) ??
            (input.confirmaDespacho === true ? null : "no se confirmó en la vista previa el despacho sobre lo autorizado")
          : null;
        t6SinExcepcion = reparo;
        const excepcionT6 = firmada && !reparo ? new Map<string, DespachoT6DeLaEspecie>() : undefined;
        const despacho = await ForestLothDB.despacharConGuiaEnTx(
          tx,
          tenantId,
          {
            gtfNumber: numero,
            gtfDate: fechaLinea,
            trozaCodes: rev.trozas.map((t) => t.trozaCode),
            /* ADR-474: la guía imprime «12A» aunque en el libro sea «12A (0000002)». */
            codigosGuia: codigosDeLaGuia(rev.trozas),
            gtfDatos: gtfDatosConFicha(g, input.verificada),
            titularName: txt(g.titular) || null,
            observations: observacionGuia(registro, input.verificada),
            createdBy: input.createdBy,
          },
          caratulaId,
          { controlDeRepetidos: "ninguno", ...(excepcionT6 ? { excepcionT6 } : {}) },
        );
        /* El rastro para OSINFOR, en la MISMA tx: sin el evento, no entra la guía. */
        const sobreAutorizado = excepcionT6 ? excesosDelDespacho(excepcionT6) : [];
        for (const e of sobreAutorizado) {
          await auditarDespachoSobreAutorizadoEnTx(tx, tenantId, {
            gtfId: despacho.gtf.id,
            detail: detalleDespachoSobreAutorizado(e, { gtfNumber: numero, registro }, limpiarMotivo(input.motivoSobreCupo), destino.plantacion),
            user: input.createdBy,
            sesion: input.sesion,
          });
        }
        return {
          plan,
          planCreado,
          talasNuevas,
          talasAmpliadas,
          trozados,
          reusados: rev.trozas.filter((t) => t.estado === "ya_trozada").length,
          despacho,
          sobreAutorizado,
        };
      }, IMPORTAR_TX_OPTS);

      ForestLothImportarDB.despuesDeImportar(tenantId, numero, registro, input, r);
      return {
        estado: "importada",
        mensaje:
          `GTF ${numero} anotada en ${nombreDelPlan(r.plan)}${r.planCreado ? " (permiso creado)" : ""}: ` +
          `${r.despacho.lineas.length} troza(s), ${fmtM3(r.despacho.volumen)} m³.` +
          (r.sobreAutorizado.length
            ? ` Pasa lo autorizado de ${r.sobreAutorizado.map((e) => `${e.especie} (exceso ${fmtM3(e.excesoM3)} m³)`).join(", ")}: quedó en la auditoría con el motivo.`
            : ""),
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
      if (err instanceof LothInvariantError) {
        const porque = err.code === "T6_EXCESO_AUTORIZADO" && t6SinExcepcion ? ` Aunque está verificada en SERFOR, ${t6SinExcepcion}.` : "";
        return rechazo(err.code, `${err.message}${porque}`);
      }
      /* T9 con motivo pero sin rol decidido: rechazo de la guía, no un 500. */
      if (err instanceof LothPermisoError) return rechazo(err.code, err.message);
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
