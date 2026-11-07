/**
 * ForestLothSaldoPlanDB — «Saldo que no se pasa» (24-10, Brandon: «cada guía y
 * troza atada a su plan; saldo grande por especie: autorizado · usado · queda;
 * una guía que se pasa del saldo se frena»).
 *
 *   · `saldo`   — el saldo de UN plan por especie, con la guía de cada m³
 *                 (`saldoDelPlan`, la cascada única). «Usado» es lo que mide T6
 *                 (`ForestLothDB.medidasT6`): la pantalla y el 422 del despacho
 *                 dicen el mismo número.
 *   · `saldosDeLoSinPlan` — el de cada plan vigente con especies: lo que sale sin
 *                 plan se mide contra TODOS (`enforceT6EnLote`, 25-10).
 *   · `sueltos` — lo que no tiene plan: las guías (con el plan sugerido y el que
 *                 se crearía desde ella) y las trozas. Atar una guía a un plan
 *                 que existe es `ForestLothGuiaPermisoDB.asignar`.
 *   · `crearPlanDesdeLaGuia` — plan + su registro (lo autorizado lo escribe la
 *                 persona) + el atado de la guía, en UNA transacción.
 *
 * tenantId 1er parámetro · sólo lectura salvo `crearPlanDesdeLaGuia` (auditado,
 * caché invalidada por `ForestPlanDB.despuesDelAlta` y `despuesDeAtar`).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { ForestLothDB, LOTH_TX_OPTS, LothInvariantError } from "@/lib/db/forest-loth.db";
import { ForestPlanDB, type EspecieDelAlta } from "@/lib/db/forest-plan.db";
import { ForestLothGuiaPermisoDB, SELECT_GUIA_PARA_ATAR } from "@/lib/db/forest-loth-guia-permiso.db";
import { ForestLothImportarDB } from "@/lib/db/forest-loth-importar.db";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { claveTitulo } from "@/lib/forestal/loth-importar-guia";
import { esPlanDePlantacion } from "@/lib/forestal/loth-poa";
import { saldoDelPlan, type MovimientoDelSaldo } from "@/lib/forestal/loth-saldo-cascada";
import { autorizadoPorEspecie, faltaDelMinimo, minimoDelPlanDesdeLaGuia, notaPlanDesdeLaGuia, planDesdeLaGuia, sugerirPlanDeLaGuia } from "@/lib/forestal/loth-atar-lo-suelto";
import type { AltaDesdeLaGuia, GuiaSuelta, PlanCreadoDesdeLaGuia, SaldoPlanRespuesta, SaldosDeLoSinPlan, SueltosDelLibro } from "@/lib/forestal/loth-saldo-plan-tipos";

const r4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const nombre = (p: { planNumber: string | null; tituloHabilitante: string | null; alias?: string | null; titularName: string }) =>
  p.planNumber?.trim() || p.tituloHabilitante?.trim() || p.alias?.trim() || p.titularName;

/** Hasta cuántas guías sin plan trae la lista (las más nuevas): más es un problema de otro tamaño. */
const MAX_GUIAS_SUELTAS = 60;

/** Las líneas del libro que entran en un saldo (el alcance de T6), sin el plan del filtro. */
const SECCIONES_DEL_SALDO = ["trozado", "despacho_troza", "despacho_producto"];
const SELECT_DEL_SALDO = { section: true, speciesCommon: true, speciesScientific: true, trozaCode: true, volumeM3: true, quantity: true, unit: true, planId: true, gtfNumber: true } as const;

/** Lo que vuelve el `select` del saldo → el movimiento de la cascada (Decimal → number). */
const aMovimientos = (
  lineas: readonly { section: string; speciesCommon: string | null; speciesScientific: string | null; trozaCode: string | null; volumeM3: unknown; quantity: unknown; unit: string | null; planId: string | null; gtfNumber: string | null }[],
): MovimientoDelSaldo[] =>
  lineas.map((l) => ({ ...l, volumeM3: l.volumeM3 != null ? Number(l.volumeM3) : null, quantity: l.quantity != null ? Number(l.quantity) : null }));

/**
 * Las líneas del alcance + el Trozado de OTRO plan de cada troza despachada en
 * ellas que no tenga el suyo: el despacho decide a qué plan cuenta y el volumen
 * sale de su Trozado, sea cual sea su plan (25-10, como `medidasT6`). Pasa al dar
 * de baja un plan con tala: lo despachado vuelve a sin plan y sus trozados con
 * árbol se quedan en el plan dado de baja. `saldoDelPlan` sólo toma de esas
 * filas el volumen y la especie.
 */
const conSusTrozados = async (tenantId: string, lineas: readonly MovimientoDelSaldo[]): Promise<MovimientoDelSaldo[]> => {
  const conTrozado = new Set(lineas.flatMap((l) => (l.section === "trozado" && l.trozaCode ? [l.trozaCode] : [])));
  const faltan = [...new Set(lineas.flatMap((l) => (l.section === "despacho_troza" && l.trozaCode && !conTrozado.has(l.trozaCode) ? [l.trozaCode] : [])))];
  if (faltan.length === 0) return [...lineas];
  const ajenos = await prisma.forestLothEntry.findMany({
    where: { tenantId, deletedAt: null, status: "registrado", section: "trozado", trozaCode: { in: faltan } },
    select: SELECT_DEL_SALDO,
    orderBy: { entryDate: "asc" },
  });
  return [...lineas, ...aMovimientos(ajenos)];
};

/** Las líneas registradas SIN plan: lo que cuenta en el saldo de todos (ADR-459), con sus trozados de otro plan. */
const lineasSinPlan = async (tenantId: string): Promise<MovimientoDelSaldo[]> =>
  conSusTrozados(
    tenantId,
    aMovimientos(
      await prisma.forestLothEntry.findMany({
        where: { tenantId, deletedAt: null, status: "registrado", planId: null, section: { in: SECCIONES_DEL_SALDO } },
        select: SELECT_DEL_SALDO,
        orderBy: { entryDate: "asc" },
      }),
    ),
  );

export class ForestLothSaldoPlanDB {
  /**
   * Lo que sale SIN plan cuenta en el saldo de cada plan vigente (ADR-459) y T6
   * lo mide contra TODOS los que le ponen techo (`enforceT6EnLote`, 25-10): el
   * saldo de cada vigente con especies cargadas (sin especies no es referencia).
   */
  static async saldosDeLoSinPlan(tenantId: string): Promise<SaldosDeLoSinPlan> {
    if (!tenantId) throw new Error("tenantId is required");
    const vigentes = await prisma.forestPlan.findMany({
      where: { tenantId, deletedAt: null, estado: "vigente" },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { id: true },
    });
    const saldos = await Promise.all(vigentes.map((p) => ForestLothSaldoPlanDB.saldo(tenantId, p.id)));
    return { planes: saldos.filter((s): s is SaldoPlanRespuesta => s != null && s.delPlan.length > 0) };
  }

  /** `null` = el plan pedido no existe en este negocio. */
  static async saldo(tenantId: string, planId: string): Promise<SaldoPlanRespuesta | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) throw new Error("planId is required");
    const plan = await prisma.forestPlan.findFirst({
      where: { tenantId, id: planId, deletedAt: null },
      select: { id: true, planType: true, planNumber: true, tituloHabilitante: true, alias: true, titularName: true },
    });
    if (!plan) return null;

    const [especies, lineas] = await Promise.all([
      prisma.forestPlanSpecies.findMany({
        where: { tenantId, planId: plan.id, deletedAt: null },
        select: { id: true, speciesCommon: true, speciesScientific: true, cites: true, volumenAutorizadoM3: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.forestLothEntry.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: "registrado",
          section: { in: SECCIONES_DEL_SALDO },
          OR: [{ planId: plan.id }, { planId: null }],
        },
        select: SELECT_DEL_SALDO,
        orderBy: { entryDate: "asc" },
      }),
    ]);
    const delPlan = especies.map((e) => ({ id: e.id, speciesCommon: e.speciesCommon, speciesScientific: e.speciesScientific }));
    const medidas = await ForestLothDB.medidasT6(prisma, tenantId, plan.id, delPlan, [...new Set(especies.map((e) => claveEspecie(e.speciesCommon)))]);
    const movimientos = await conSusTrozados(tenantId, aMovimientos(lineas));
    const saldo = saldoDelPlan(
      especies.map((e) => ({ speciesCommon: e.speciesCommon, speciesScientific: e.speciesScientific, cites: e.cites, volumenAutorizadoM3: Number(e.volumenAutorizadoM3) })),
      movimientos,
      plan.id,
      medidas,
    );

    /* Cada N° de guía → su guía viva de ESTE plan o sin plan (dos titulares pueden repetir el N°). */
    const numeros = [...new Set(saldo.especies.flatMap((e) => e.guias.map((g) => g.gtfNumber)).filter((n): n is string => !!n))];
    const gtfs = numeros.length === 0
      ? []
      : await prisma.forestGtf.findMany({
          where: { tenantId, deletedAt: null, gtfNumber: { in: numeros }, status: { not: "anulada" }, OR: [{ planId: plan.id }, { planId: null }] },
          select: { id: true, gtfNumber: true, planId: true },
          orderBy: { createdAt: "asc" },
        });
    const gtfDe = (numero: string | null, sinPlan: boolean): string | null =>
      (numero && (gtfs.find((g) => g.gtfNumber === numero && (g.planId == null) === sinPlan) ?? gtfs.find((g) => g.gtfNumber === numero))?.id) || null;

    return {
      plan: { id: plan.id, nombre: nombre(plan), plantacion: esPlanDePlantacion(plan) },
      delPlan: delPlan.map(({ speciesCommon, speciesScientific }) => ({ speciesCommon, speciesScientific })),
      saldo: {
        ...saldo,
        especies: saldo.especies.map((e) => ({ ...e, guias: e.guias.map((g) => ({ ...g, gtfId: gtfDe(g.gtfNumber, g.sinPlan) })) })),
      },
    };
  }

  /**
   * Lo que no tiene plan y cuenta en el saldo de todos: guías (con sugerencia,
   * propuesta y lo que el plan nuevo ya llevaría usado —esta guía + lo sin plan
   * de otras—) y trozas.
   */
  static async sueltos(tenantId: string): Promise<SueltosDelLibro> {
    if (!tenantId) throw new Error("tenantId is required");
    const [guias, planes, trozas, conteo, sinPlan] = await Promise.all([
      prisma.forestGtf.findMany({
        where: { tenantId, deletedAt: null, planId: null, tipo: "trozas", status: { not: "anulada" } },
        select: { ...SELECT_GUIA_PARA_ATAR, gtfDate: true, origen: true, gtfDatos: true, volumenTotalM3: true, piezasTotal: true },
        orderBy: [{ gtfDate: "desc" }, { createdAt: "desc" }],
        take: MAX_GUIAS_SUELTAS,
      }),
      prisma.forestPlan.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, planNumber: true, tituloHabilitante: true, alias: true, titularName: true, estado: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.forestLothEntry.aggregate({
        where: { tenantId, deletedAt: null, status: "registrado", planId: null, section: "trozado" },
        _count: { _all: true },
        _sum: { volumeM3: true },
      }),
      ForestLothDB.conteoAtarSinPlan(tenantId),
      lineasSinPlan(tenantId),
    ]);
    const lista: GuiaSuelta[] = guias.map((g) => {
      const propuesta = planDesdeLaGuia(g);
      const m3 = g.volumenTotalM3 != null ? Number(g.volumenTotalM3) : r4(propuesta.especies.reduce((a, e) => a + e.m3, 0));
      return {
        gtfId: g.id,
        gtfNumber: g.gtfNumber,
        gtfDate: g.gtfDate ? g.gtfDate.toISOString().slice(0, 10) : null,
        piezas: g.piezasTotal ?? propuesta.especies.reduce((a, e) => a + e.trozas, 0),
        m3: r4(m3),
        titulo: propuesta.codigo,
        titular: propuesta.titularName,
        sugerido: sugerirPlanDeLaGuia(g, planes),
        propuesta,
        /* Sólo si se puede crear el plan desde ella (cita su título). */
        minimos: propuesta.codigo ? minimoDelPlanDesdeLaGuia(propuesta.especies, sinPlan, g.gtfNumber) : [],
      };
    });
    return {
      guias: lista,
      trozas: { total: trozas._count._all, m3: r4(Number(trozas._sum.volumeM3 ?? 0)) },
      lineas: conteo,
      planes: planes.map((p) => ({ id: p.id, nombre: nombre(p), titular: p.titularName, estado: p.estado })),
    };
  }

  /**
   * «Crear el plan desde la guía»: el plan con los datos de la guía, su registro
   * con lo autorizado que escribió la persona (de TODAS sus especies o de
   * ninguna: sin volumen el plan no le pone techo y T7 no juzga) y el atado de
   * la guía (`atarEnTx`: cierre, cruces, T7/T6 bajo lock). Si ya hay un plan con
   * ese título —lo creó otra persona o el importador—, 409 `PLAN_YA_EXISTE`: se
   * ata a ése. `null` = la guía no existe en este negocio.
   */
  static async crearPlanDesdeLaGuia(tenantId: string, gtfId: string, alta: AltaDesdeLaGuia, actor: string): Promise<PlanCreadoDesdeLaGuia | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!actor?.trim()) throw new Error("actor is required");
    const gtf = await prisma.forestGtf.findFirst({
      where: { tenantId, id: gtfId, deletedAt: null },
      select: { ...SELECT_GUIA_PARA_ATAR, origen: true, gtfDatos: true },
    });
    if (!gtf) return null;
    ForestLothGuiaPermisoDB.exigirSinPermiso(gtf);
    const propuesta = planDesdeLaGuia(gtf);
    const clave = claveTitulo(propuesta.codigo);
    if (!clave) {
      throw new LothInvariantError(
        `La GTF ${gtf.gtfNumber} no cita su título habilitante: crea el plan en «Planes» y después átale la guía.`,
        "GUIA_SIN_TITULO",
        { gtfId },
      );
    }
    const titularName = alta.titularName.trim();
    if (!titularName) throw new LothInvariantError("Escribe el titular del plan.", "TITULAR_REQUERIDO", { gtfId });

    /* Lo autorizado: de las especies de la guía (por clave), de todas o de ninguna.
       La misma especie dos veces suma (`autorizadoPorEspecie`), no gana la última. */
    const pedidas = autorizadoPorEspecie(alta.especies);
    const ajena = [...pedidas.keys()].find((k) => !propuesta.especies.some((e) => claveEspecie(e.especie) === k));
    if (ajena != null) {
      throw new LothInvariantError(`«${pedidas.get(ajena)?.especie}» no sale en la GTF ${gtf.gtfNumber}.`, "ESPECIE_NO_ESTA_EN_LA_GUIA", { gtfId });
    }
    const faltan = propuesta.especies.filter((e) => !pedidas.has(claveEspecie(e.especie))).map((e) => e.especie);
    if (pedidas.size > 0 && faltan.length > 0) {
      throw new LothInvariantError(
        `Falta lo ${propuesta.plantacion ? "registrado" : "autorizado"} de ${faltan.join(", ")}: escríbelo para todas las especies de la guía, o para ninguna.`,
        "FALTA_VOLUMEN_AUTORIZADO",
        { gtfId, faltan },
      );
    }
    const especies: EspecieDelAlta[] = propuesta.especies
      .filter((e) => pedidas.has(claveEspecie(e.especie)))
      .map((e) => ({
        speciesCommon: e.especie,
        speciesScientific: e.cientifico,
        cites: e.cites,
        volumenAutorizadoM3: r4(pedidas.get(claveEspecie(e.especie))?.volumenAutorizadoM3 ?? 0),
      }));

    /* El plan nuevo nace con esta guía Y lo sin plan de otras guías (ADR-459): si
       lo autorizado no cubre las dos cosas, se dice la suma acá; el 422 de T6
       bajo el candado (`atarEnTx`) sigue siendo quien decide. */
    if (especies.length > 0) {
      const minimos = minimoDelPlanDesdeLaGuia(propuesta.especies, await lineasSinPlan(tenantId), gtf.gtfNumber);
      const valores = propuesta.especies.map((e) => pedidas.get(claveEspecie(e.especie))?.volumenAutorizadoM3 ?? null);
      const corta = faltaDelMinimo(propuesta.especies, valores, minimos, propuesta.plantacion ? "registrado" : "autorizado");
      if (corta) throw new LothInvariantError(corta, "T6_EXCESO_AUTORIZADO", { gtfId, minimos });
    }

    const codigos = ForestLothGuiaPermisoDB.codigosDe(gtf);
    const lineas = await ForestLothGuiaPermisoDB.lineasAAtar(tenantId, gtf, codigos);
    const r = await prisma.$transaction(async (tx) => {
      /* El candado del título, el mismo del importador: dos altas del mismo permiso no crean dos planes. */
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${`loth-titulo:${clave}`}))`;
      const { planes, contratos } = await ForestLothImportarDB.planesYContratos(tenantId, tx);
      const ya = planes.filter((p) => claveTitulo(p.planNumber) === clave || claveTitulo(p.tituloHabilitante) === clave);
      if (ya.length > 0) {
        throw new LothInvariantError(
          `Ya hay un plan con el título ${propuesta.codigo}: ata la guía a ése en vez de crear otro.`,
          "PLAN_YA_EXISTE",
          { gtfId, planId: ya[0].id },
        );
      }
      /* Un permiso del Directorio con ese código y sin plan: el plan nuevo se ata a él (como el importador). */
      const libres = contratos.filter((c) => claveTitulo(c.codigo) === clave && (!c.planId || !planes.some((p) => p.id === c.planId)));
      const plan = await ForestPlanDB.crearPlanEnTx(tx, tenantId, {
        planType: propuesta.planType,
        planNumber: propuesta.planNumber,
        tituloHabilitante: propuesta.tituloHabilitante,
        titularName,
        representanteLegal: propuesta.representanteLegal,
        resolucionNumber: propuesta.resolucionNumber,
        arffs: propuesta.arffs,
        region: propuesta.region,
        provincia: propuesta.provincia,
        distrito: propuesta.distrito,
        propietarioNombre: propuesta.propietarioDoc ? propuesta.titularName : null,
        propietarioDocTipo: propuesta.propietarioDocTipo,
        propietarioDoc: propuesta.propietarioDoc,
        contratoId: libres.length === 1 ? libres[0].id : null,
        notes: notaPlanDesdeLaGuia(gtf.gtfNumber),
        createdBy: actor,
      });
      const species = await ForestPlanDB.crearEspeciesEnTx(tx, tenantId, plan.id, especies);
      const atado = await ForestLothGuiaPermisoDB.atarEnTx(tx, tenantId, gtf, plan, codigos, lineas);
      return { plan, species, atado };
    }, LOTH_TX_OPTS);

    ForestPlanDB.despuesDelAlta(tenantId, r.plan, actor, r.species);
    ForestLothGuiaPermisoDB.despuesDeAtar(tenantId, gtf, r.plan, r.atado, actor, "(plan creado desde la guía)");
    return {
      planId: r.plan.id,
      nombre: nombre(r.plan),
      gtfId: gtf.id,
      especies: r.species.length,
      despachos: r.atado.despachos,
      trozados: r.atado.trozados,
    };
  }
}
