/**
 * ForestLothGuiaDesatarDB — «Desatar» una guía de su permiso (25-10, revisión
 * del freno de saldo): la vuelta atrás de «Asignar permiso»
 * (`ForestLothGuiaPermisoDB.asignar`). La guía, sus líneas de Despacho
 * (`lineasDeLaGuia`) y los trozados SIN árbol de sus trozas que tienen ESE
 * plan vuelven a sin plan, en UNA transacción.
 *
 * Sin plan, cuentan en el saldo de CADA plan vigente (ADR-459): desatar no
 * cambia el saldo del plan del que sale (ya contaba lo sin plan) y sí el de
 * los demás. Por eso, bajo el mismo orden de locks que el despacho y el atado
 * —filas del libro primero, después las especies de los vigentes que tienen
 * las de la guía (`ORDER BY id`)—, y lo que dice si algún plan queda pasado
 * (`avisos`). No frena: la madera ya salió; frenar escondería el exceso.
 *
 * Una troza que viene de la TALA del plan (Trozado con árbol de ese plan) no
 * se desata a mano: su despacho sigue al plan de su tala (ADR-459) y «Atar
 * líneas sin permiso» lo volvería a atar. En la BAJA del plan sí: dado de
 * baja, el plan ya no está en ningún saldo; atadas a él, sus guías se
 * esfumarían del saldo de todos (`bajaDelPlan`, desde `ForestPlanDB.eliminarPlan`,
 * en la misma transacción que la baja). Sus trozados con árbol se quedan en el
 * plan dado de baja y el volumen cuenta igual: `medidasT6` y el saldo toman el
 * Trozado de la troza despachada sea cual sea su plan (el despacho decide).
 *
 * Mes cerrado: desatar a mano → 422 `PERIODO_CERRADO`; en la baja esa guía se
 * salta y se cuenta en el rastro (el acta no se toca).
 *
 * Sólo admin/dueño (la ruta). tenantId 1er parámetro · auditoría
 * `loth_linea_desatar_plan` · caché invalidada.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { ForestLothDB, LOTH_TX_OPTS, LothInvariantError } from "@/lib/db/forest-loth.db";
import { ForestLothCierreDB } from "@/lib/db/forest-loth-cierre.db";
import { ForestLothGuiaPermisoDB, SELECT_GUIA_PARA_ATAR, type GuiaParaAtar, type LineasAAtar } from "@/lib/db/forest-loth-guia-permiso.db";
import { closedPeriodOf, type LothCierrePeriodo } from "@/lib/forestal/loth-cierre-types";
import { auditLoth } from "@/lib/forestal/loth-audit";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { claveT6, excedeTechoM3, excesoT6 } from "@/lib/forestal/loth-t6";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

type GuiaConPermiso = GuiaParaAtar & { planId: string };

/** Una guía a desatar y lo que se desata con ella (leído fuera de la tx). */
export interface GuiaADesatar {
  gtf: GuiaConPermiso;
  codigos: string[];
  lineas: LineasAAtar;
}

export interface Desatado {
  guias: number;
  despachos: number;
  trozados: number;
  /** «Con esto el plan X queda pasado por N m³ de Y…»: los vigentes que lo sin plan deja sobre su techo. */
  avisos: string[];
}

export interface PermisoDesatado extends Desatado {
  gtfId: string;
  planId: string;
}

type PlanNombrable = { planNumber: string | null; tituloHabilitante: string | null };
/** El nombre del plan como lo dice el 422 de T6 (N°, si no el título). */
const nombreT6 = (p: PlanNombrable) => p.planNumber?.trim() || p.tituloHabilitante?.trim() || "sin N°";
const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });

export class ForestLothGuiaDesatarDB {
  /** Los «no» de desatar: anulada (ya no cuenta en ningún saldo), sin permiso o de producto. */
  static exigirConPermiso(gtf: GuiaParaAtar): GuiaConPermiso {
    const gtfId = gtf.id;
    if (gtf.status === "anulada") {
      throw new LothInvariantError(`La GTF ${gtf.gtfNumber} está anulada: ya no cuenta en ningún saldo, no hay nada que desatar.`, "GUIA_PERMISO_NO_APLICA", { gtfId });
    }
    if (!gtf.planId) {
      throw new LothInvariantError(`La GTF ${gtf.gtfNumber} no tiene permiso: no hay nada que desatar.`, "GUIA_PERMISO_NO_APLICA", { gtfId });
    }
    if (gtf.tipo !== "trozas") {
      throw new LothInvariantError("Sólo se desatan guías de trozas.", "GUIA_PERMISO_NO_APLICA", { gtfId });
    }
    return { ...gtf, planId: gtf.planId };
  }

  /**
   * Lo que se desata (fuera de la tx), espejo de `lineasAAtar`: sus líneas de
   * Despacho y los trozados sin árbol de sus trozas que tienen ESTE plan.
   * `cerrados` = los meses cerrados que toca (vacío = se puede).
   */
  private static async leer(tenantId: string, gtf: GuiaConPermiso, cierres: LothCierrePeriodo[]): Promise<GuiaADesatar & { cerrados: string[] }> {
    const codigos = ForestLothGuiaPermisoDB.codigosDe(gtf);
    const [despachos, trozados] = await Promise.all([
      ForestLothDB.lineasDeLaGuia(tenantId, gtf),
      codigos.length === 0
        ? Promise.resolve([])
        : prisma.forestLothEntry.findMany({
            where: { tenantId, section: "trozado", status: "registrado", deletedAt: null, planId: gtf.planId, treeCode: null, trozaCode: { in: codigos } },
            select: { id: true, entryDate: true },
          }),
    ]);
    const cerrados = [...new Set([...despachos, ...trozados].map((l) => closedPeriodOf(cierres, l.entryDate)?.label).filter((x): x is string => !!x))];
    return { gtf, codigos, lineas: { despachos, trozados }, cerrados };
  }

  /**
   * El desatado DENTRO de una transacción (la de `desatar` o la de la baja del
   * plan): bloquea las filas del libro, relee bajo el lock, bloquea las
   * especies de los vigentes que las tienen y escribe con la condición en el
   * WHERE (`planId` = el plan del que sale: si otra persona ya la desató o la
   * anuló, no se pisa). `modo: "guia"` rechaza las trozas de la tala del plan
   * y una guía que cambió mientras tanto; `"baja"` desata lo que haya.
   */
  static async desatarEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    planId: string,
    guias: readonly GuiaADesatar[],
    modo: "guia" | "baja",
  ): Promise<Desatado> {
    if (guias.length === 0) return { guias: 0, despachos: 0, trozados: 0, avisos: [] };
    const unicos = (xs: readonly string[]) => [...new Set(xs)].sort();
    const despachoIds = unicos(guias.flatMap((g) => g.lineas.despachos.map((d) => d.id)));
    const trozadoIds = unicos(guias.flatMap((g) => g.lineas.trozados.map((t) => t.id)));
    const codigos = unicos(guias.flatMap((g) => g.codigos));
    /* 1. Las filas del libro (como `atarEnTx`): nadie las ata, despacha ni anula entre la lectura y la escritura. */
    await tx.$queryRaw`
      SELECT "id" FROM "ForestLothEntry"
      WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL
        AND ("id" = ANY(${despachoIds}::text[])
          OR ("section" = 'trozado' AND ("trozaCode" = ANY(${codigos}::text[])
            OR "trozaCode" IN (SELECT d."trozaCode" FROM "ForestLothEntry" d WHERE d."tenantId" = ${tenantId} AND d."id" = ANY(${despachoIds}::text[])))))
      ORDER BY "id" FOR UPDATE`;
    /* 2. Releídas bajo el lock: los despachos que siguen en este plan y el Trozado de sus trozas. En serie: la tx es UNA conexión. */
    const despachos = despachoIds.length === 0
      ? []
      : await tx.forestLothEntry.findMany({
          where: { tenantId, id: { in: despachoIds }, section: "despacho_troza", planId, status: "registrado", deletedAt: null },
          select: { id: true, trozaCode: true },
        });
    const despachadas = unicos(despachos.map((d) => d.trozaCode ?? "").filter(Boolean));
    const fuentes = despachadas.length === 0
      ? []
      : await tx.forestLothEntry.findMany({
          where: { tenantId, section: "trozado", status: "registrado", deletedAt: null, trozaCode: { in: despachadas } },
          select: { trozaCode: true, treeCode: true, planId: true, speciesCommon: true, speciesScientific: true },
        });
    if (modo === "guia") {
      const deLaTala = unicos(fuentes.filter((f) => f.treeCode && f.planId === planId).map((f) => f.trozaCode ?? "").filter(Boolean)).sort(natural);
      if (deLaTala.length > 0) {
        const lista = deLaTala.length > 5 ? `${deLaTala.slice(0, 5).join(", ")} y ${deLaTala.length - 5} más` : deLaTala.join(", ");
        throw new LothInvariantError(
          `${deLaTala.length === 1 ? "La troza" : "Las trozas"} ${lista} ${deLaTala.length === 1 ? "viene" : "vienen"} de la tala de este plan: su despacho sigue al plan de su tala y no se desata. Si la tala está mal, corrígela primero.`,
          "GUIA_PERMISO_NO_APLICA",
          { gtfId: guias[0].gtf.id, planId, trozas: deLaTala },
        );
      }
    }
    /* 3. Las especies de los vigentes que las tienen: el despacho sin plan que mida al mismo tiempo ve lo desatado. */
    const conEspecie = fuentes.filter((f) => f.speciesCommon?.trim());
    const vigentes = conEspecie.length === 0
      ? []
      : await tx.forestPlan.findMany({
          where: { tenantId, deletedAt: null, estado: "vigente", id: { not: planId } },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          select: { id: true, planNumber: true, tituloHabilitante: true },
        });
    const medibles: { plan: (typeof vigentes)[number]; delPlan: Awaited<ReturnType<typeof ForestLothDB.especiesT6DelPlan>>; claves: string[] }[] = [];
    for (const plan of vigentes) {
      const delPlan = await ForestLothDB.especiesT6DelPlan(tx, tenantId, plan.id);
      const claves = unicos(conEspecie.map((f) => claveT6(delPlan, f.speciesCommon, f.speciesScientific)).filter((c): c is string => c != null));
      if (claves.length > 0) medibles.push({ plan, delPlan, claves });
    }
    const especieIds = unicos(medibles.flatMap((m) => m.delPlan.filter((f) => m.claves.includes(claveEspecie(f.speciesCommon))).map((f) => f.id)));
    if (especieIds.length > 0) {
      await tx.$queryRaw`
        SELECT "id" FROM "ForestPlanSpecies"
        WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(especieIds)}) AND "deletedAt" IS NULL
        ORDER BY "id" FOR UPDATE`;
    }
    /* 4. La escritura, con la condición en el WHERE. Lo impreso (`gtfDatos`) y el título que cita no cambian. */
    const g = await tx.forestGtf.updateMany({
      where: { tenantId, id: { in: guias.map((x) => x.gtf.id) }, planId, deletedAt: null, status: { not: "anulada" } },
      data: { planId: null },
    });
    if (modo === "guia" && g.count === 0) {
      throw new LothInvariantError(`La GTF ${guias[0].gtf.gtfNumber} cambió mientras tanto (ya no tiene ese permiso o se anuló). Recarga la lista.`, "GUIA_PERMISO_NO_APLICA", { gtfId: guias[0].gtf.id });
    }
    const d = despachos.length === 0
      ? { count: 0 }
      : await tx.forestLothEntry.updateMany({
          where: { tenantId, id: { in: despachos.map((x) => x.id) }, planId, status: "registrado", deletedAt: null },
          data: { planId: null },
        });
    const t = trozadoIds.length === 0
      ? { count: 0 }
      : await tx.forestLothEntry.updateMany({
          where: { tenantId, id: { in: trozadoIds }, planId, treeCode: null, deletedAt: null },
          data: { planId: null },
        });
    /* 5. Lo que queda pasado: medido bajo el lock, con lo desatado ya escrito. */
    const avisos: string[] = [];
    for (const m of medibles) {
      for (const [clave, medida] of await ForestLothDB.medidasT6(tx, tenantId, m.plan.id, m.delPlan, m.claves)) {
        if (medida.autorizado == null || !excedeTechoM3(medida.movilizado, medida.autorizado)) continue;
        const especie = m.delPlan.find((f) => claveEspecie(f.speciesCommon) === clave)?.speciesCommon ?? clave;
        const exceso = excesoT6({ autorizado: medida.autorizado, movilizado: medida.movilizado }, 0);
        avisos.push(`Con esto el plan ${nombreT6(m.plan)} queda pasado por ${fmtM3(exceso)} m³ de ${especie}: lo sin plan cuenta en su saldo hasta que lo ates.`);
      }
    }
    return { guias: g.count, despachos: d.count, trozados: t.count, avisos };
  }

  /** «Desatar» una guía de su permiso. `null` = la guía no existe en este negocio. */
  static async desatar(tenantId: string, gtfId: string, actor: string): Promise<PermisoDesatado | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!actor?.trim()) throw new Error("actor is required");
    const fila = await prisma.forestGtf.findFirst({ where: { tenantId, id: gtfId, deletedAt: null }, select: SELECT_GUIA_PARA_ATAR });
    if (!fila) return null;
    const gtf = ForestLothGuiaDesatarDB.exigirConPermiso(fila);
    const [cierres, plan] = await Promise.all([
      ForestLothCierreDB.list(tenantId),
      prisma.forestPlan.findFirst({ where: { tenantId, id: gtf.planId }, select: { planNumber: true, tituloHabilitante: true } }),
    ]);
    const guia = await ForestLothGuiaDesatarDB.leer(tenantId, gtf, cierres);
    if (guia.cerrados.length > 0) {
      throw new LothInvariantError(
        `Esta guía tiene líneas en un mes cerrado (${guia.cerrados.join(", ")}): el acta no se toca. Reabre el mes si necesitas desatarla.`,
        "PERIODO_CERRADO",
        { periodos: guia.cerrados },
      );
    }
    const r = await prisma.$transaction((tx) => ForestLothGuiaDesatarDB.desatarEnTx(tx, tenantId, gtf.planId, [guia], "guia"), LOTH_TX_OPTS);
    const permiso = plan?.tituloHabilitante?.trim() || plan?.planNumber?.trim() || gtf.planId;
    auditLoth({
      tenantId,
      action: "loth_linea_desatar_plan",
      entity: "ForestGtf",
      entityId: gtf.id,
      detail:
        `Desató la GTF ${gtf.gtfNumber} del permiso ${permiso}: la guía, ${r.despachos} línea(s) de despacho y ${r.trozados} de trozado ` +
        `vuelven a sin plan (cuentan en el saldo de cada plan vigente).${r.avisos.length > 0 ? ` ${r.avisos.join(" ")}` : ""}`,
      user: actor,
    });
    ForestLothGuiaDesatarDB.invalidar(tenantId, gtf.id);
    return { gtfId: gtf.id, planId: gtf.planId, ...r };
  }

  /**
   * La baja del plan (`ForestPlanDB.eliminarPlan`): sus guías de trozas vivas
   * vuelven a sin plan en la MISMA transacción que `darDeBaja`. Las que tocan
   * un mes cerrado se quedan (`enMesCerrado`: el acta no se toca).
   */
  static async bajaDelPlan<T>(
    tenantId: string,
    planId: string,
    darDeBaja: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<{ resultado: T; desatado: Desatado; enMesCerrado: string[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) throw new Error("planId is required");
    const filas = await prisma.forestGtf.findMany({
      where: { tenantId, planId, deletedAt: null, status: { not: "anulada" }, tipo: "trozas" },
      select: SELECT_GUIA_PARA_ATAR,
      orderBy: { id: "asc" },
    });
    const cierres = filas.length > 0 ? await ForestLothCierreDB.list(tenantId) : [];
    const leidas: (GuiaADesatar & { cerrados: string[] })[] = [];
    /* De a 8: cada guía son 2-3 lecturas; todas juntas agotarían el pool. */
    for (let i = 0; i < filas.length; i += 8) {
      leidas.push(...(await Promise.all(filas.slice(i, i + 8).map((f) => ForestLothGuiaDesatarDB.leer(tenantId, { ...f, planId }, cierres)))));
    }
    const guias = leidas.filter((g) => g.cerrados.length === 0);
    const out = await prisma.$transaction(
      async (tx) => {
        const desatado = await ForestLothGuiaDesatarDB.desatarEnTx(tx, tenantId, planId, guias, "baja");
        return { desatado, resultado: await darDeBaja(tx) };
      },
      LOTH_TX_OPTS,
    );
    if (out.desatado.guias > 0) ForestLothGuiaDesatarDB.invalidar(tenantId, planId);
    return { ...out, enMesCerrado: leidas.filter((g) => g.cerrados.length > 0).map((g) => g.gtf.gtfNumber) };
  }

  /** Los prefijos de `ForestLothDB` y `ForestGtfDB`: saldos, secciones y la lista de guías. */
  private static invalidar(tenantId: string, ref: string): void {
    try {
      invalidateByPrefix(`forest-loth:${tenantId}`);
      invalidateByPrefix(`forest-gtf:${tenantId}`);
    } catch (err) {
      logger.error("[forest-loth-guia-desatar] no se pudo invalidar la caché tras desatar", { error: String(err), tenantId, ref });
    }
  }
}
