/**
 * ForestLothGuiaPermisoDB — asignarle el permiso a UNA guía que salió sin él
 * (15-10, Brandon: «las trozas a mano no se vinculan todavía a un permiso; ya
 * cuando se guarda, en la tabla podré designar el permiso»).
 *
 * Una guía sin `planId` (y sus líneas) cuenta en el saldo de TODOS los permisos
 * (ADR-459). Asignarle uno ata, en UNA transacción: la guía, sus líneas de
 * Despacho (`lineasDeLaGuia`, la misma regla que anular) y los trozados sin
 * plan NI árbol de sus trozas. La tala no se toca: las trozas con árbol y sin
 * plan (y su tala) las ata «Atar líneas sin permiso», que sigue a la fuente.
 *
 * Sin cruces (15-10, revisión): si una troza de la guía ya es de OTRO permiso
 * (su Trozado o su línea de despacho), no se asigna — 422 `TROZA_DE_OTRO_PERMISO`,
 * por troza. Así el permiso sólo llega a despachos cuyo Trozado no tiene
 * permiso o ya tiene ÉSTE. Las filas del libro se bloquean ANTES de medir.
 *
 * Revisa lo autorizado (15-10, Brandon: «Revisar lo autorizado al asignar»):
 * T7 y T6 del despacho, con su misma severidad (bloquean) y su mismo mensaje
 * (`compararGuiaConPermiso`). La ventana lo muestra antes (`saldo`); la
 * transacción lo vuelve a medir bajo el lock de las especies, como `enforceT6`.
 *
 * Lo impreso (`gtfDatos`) no se reescribe: la guía emitida dice lo que dijo.
 * Sí se guarda el título del plan en `tituloHabilitante` (columna «Permiso»,
 * Documentos del permiso). Mes cerrado → no se toca nada y se dice cuál.
 *
 * tenantId 1er parámetro · auditoría `loth_linea_atar_plan` · caché invalidada.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { ForestLothDB, LOTH_TX_OPTS, LothInvariantError } from "@/lib/db/forest-loth.db";
import { ForestLothCierreDB } from "@/lib/db/forest-loth-cierre.db";
import { closedPeriodOf } from "@/lib/forestal/loth-cierre-types";
import { piezasDeItems } from "@/lib/forestal/loth-guia-despacho";
import { auditLoth } from "@/lib/forestal/loth-audit";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { esPlanDePlantacion, type PlanParaPoa } from "@/lib/forestal/loth-poa";
import { claveT6, type MedidaT6 } from "@/lib/forestal/loth-t6";
import { trozadoIdsDeItems, trozadosNacidosDeLaGuia } from "@/lib/forestal/loth-trozas-a-mano";
import {
  compararGuiaConPermiso,
  type SaldoDeLaGuiaEnElPermiso,
  type SaldoDelPermisoParaLaGuia,
  type TrozaParaElPermiso,
  type TrozasAManoDeLaGuia,
} from "@/lib/forestal/loth-guia-permiso-saldo";

type Db = Prisma.TransactionClient | typeof prisma;
type PlanDelPermiso = { id: string } & PlanParaPoa;

const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });

export interface PermisoAsignado {
  gtfId: string;
  planId: string;
  despachos: number;
  trozados: number;
}

export class ForestLothGuiaPermisoDB {
  /** La guía y el permiso, con los mismos «no» que `asignar` (la vista previa dice lo mismo que el botón). */
  private static async cargar(tenantId: string, gtfId: string, planId: string) {
    const [gtf, plan] = await Promise.all([
      prisma.forestGtf.findFirst({
        where: { tenantId, id: gtfId, deletedAt: null },
        select: { id: true, gtfNumber: true, items: true, planId: true, titularName: true, status: true, tipo: true, tituloHabilitante: true, parcelaCorta: true },
      }),
      prisma.forestPlan.findFirst({
        where: { tenantId, id: planId, deletedAt: null },
        select: { id: true, planNumber: true, planType: true, tituloHabilitante: true, parcelaCorta: true },
      }),
    ]);
    if (!gtf) return null;
    if (!plan) {
      throw new LothInvariantError("Ese plan de manejo no existe en este negocio o está dado de baja: elige otro permiso.", "PLAN_NO_EXISTE", { planId });
    }
    if (gtf.status === "anulada") {
      throw new LothInvariantError(`La GTF ${gtf.gtfNumber} está anulada: ya no se le asigna permiso.`, "GUIA_PERMISO_NO_APLICA", { gtfId });
    }
    if (gtf.planId) {
      throw new LothInvariantError(`La GTF ${gtf.gtfNumber} ya tiene permiso. Sólo se asigna a las guías que salieron sin él.`, "GUIA_PERMISO_NO_APLICA", { gtfId, planId: gtf.planId });
    }
    if (gtf.tipo !== "trozas") {
      throw new LothInvariantError("Sólo se asigna permiso a guías de trozas.", "GUIA_PERMISO_NO_APLICA", { gtfId });
    }
    const codigos = [...new Set(piezasDeItems(gtf.items).map((p) => p.codigo).filter(Boolean))].sort();
    return { gtf, plan, codigos };
  }

  /**
   * Las trozas que SALEN con la guía (sus líneas de despacho vivas,
   * `lineasDeLaGuia`) con su Trozado. Las de este permiso o sin permiso son lo
   * que la guía ya aporta a `ForestLothDB.medidaT6` (despacho de este plan o
   * sin plan): eso se descuenta de la medida de hoy. Si el Trozado o la línea
   * es de OTRO permiso, la troza es `deOtroPermiso` (con cuál): no cuenta en
   * éste y bloquea asignar.
   */
  private static async trozasDeLaGuia(db: Db, tenantId: string, despachoIds: readonly string[], planId: string): Promise<TrozaParaElPermiso[]> {
    if (despachoIds.length === 0) return [];
    const vivas = { tenantId, status: "registrado" as const, deletedAt: null };
    const ajeno = (p: string | null | undefined): p is string => p != null && p !== planId;
    /* En serie: en la tx es UNA conexión. */
    const lineas = await db.forestLothEntry.findMany({
      where: { ...vivas, section: "despacho_troza", id: { in: [...despachoIds] } },
      select: { trozaCode: true, planId: true },
    });
    const despachoDe = new Map<string, string | null>();
    for (const l of lineas) {
      if (l.trozaCode && (!despachoDe.has(l.trozaCode) || ajeno(l.planId))) despachoDe.set(l.trozaCode, l.planId);
    }
    if (despachoDe.size === 0) return [];
    const trozados = await db.forestLothEntry.findMany({
      where: { ...vivas, section: "trozado", trozaCode: { in: [...despachoDe.keys()] } },
      select: { trozaCode: true, planId: true, speciesCommon: true, speciesScientific: true, volumeM3: true },
    });
    const conTrozado = new Set(trozados.map((t) => t.trozaCode));
    const filas = [
      ...trozados.map((t) => ({ ...t, codigo: t.trozaCode ?? "" })),
      /* Una línea de otro permiso sin Trozado vivo también cruza. */
      ...[...despachoDe]
        .filter(([c, p]) => !conTrozado.has(c) && ajeno(p))
        .map(([c]) => ({ codigo: c, planId: null, speciesCommon: null, speciesScientific: null, volumeM3: null })),
    ];
    const otroDe = (codigo: string, trozadoPlan: string | null): string | null => {
      const despacho = despachoDe.get(codigo);
      return ajeno(trozadoPlan) ? trozadoPlan : ajeno(despacho) ? despacho : null;
    };
    const otros = [...new Set(filas.map((f) => otroDe(f.codigo, f.planId)).filter((p): p is string => p != null))];
    const planes = otros.length === 0
      ? []
      : await db.forestPlan.findMany({ where: { tenantId, id: { in: otros } }, select: { id: true, planNumber: true, tituloHabilitante: true } });
    const nombre = new Map(planes.map((p) => [p.id, p.tituloHabilitante?.trim() || p.planNumber?.trim() || "otro permiso"]));
    return filas
      .map((f) => {
        const otro = otroDe(f.codigo, f.planId);
        return {
          codigo: f.codigo,
          speciesCommon: f.speciesCommon,
          speciesScientific: f.speciesScientific,
          volumeM3: f.volumeM3 != null ? Number(f.volumeM3) : null,
          deOtroPermiso: otro != null,
          otroPermiso: otro ? (nombre.get(otro) ?? "otro permiso") : null,
        };
      })
      .sort((a, b) => natural(a.codigo, b.codigo));
  }

  /**
   * T7 + T6 de la guía contra el permiso. `lock` (sólo en la tx): las filas de
   * las especies tocadas, `FOR UPDATE ORDER BY id`, y la medida releída después
   * — lo que vale es lo autorizado DESPUÉS de esperar (como `enforceT6`).
   */
  private static async medir(db: Db, tenantId: string, despachoIds: readonly string[], plan: PlanDelPermiso, lock: boolean): Promise<SaldoDeLaGuiaEnElPermiso> {
    const delPlan = await ForestLothDB.especiesT6DelPlan(db, tenantId, plan.id);
    const trozas = await ForestLothGuiaPermisoDB.trozasDeLaGuia(db, tenantId, despachoIds, plan.id);
    const claves = [
      ...new Set(
        trozas
          .filter((t) => !t.deOtroPermiso && t.speciesCommon?.trim())
          .map((t) => claveT6(delPlan, t.speciesCommon, t.speciesScientific))
          .filter((c): c is string => c != null),
      ),
    ].sort();
    if (lock && claves.length > 0) {
      const ids = delPlan.filter((f) => claves.includes(claveEspecie(f.speciesCommon))).map((f) => f.id).sort();
      await db.$queryRaw`
        SELECT "id" FROM "ForestPlanSpecies"
        WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(ids)}) AND "deletedAt" IS NULL
        ORDER BY "id" FOR UPDATE`;
    }
    const medidas = new Map<string, MedidaT6>();
    for (const clave of claves) medidas.set(clave, await ForestLothDB.medidaT6(db, tenantId, plan.id, delPlan, clave));
    return compararGuiaConPermiso(trozas, delPlan, medidas, esPlanDePlantacion(plan));
  }

  /** La vista previa de «Asignar permiso»: por especie, la guía contra lo autorizado. Sin lock ni escritura. */
  static async saldo(tenantId: string, gtfId: string, planId: string): Promise<SaldoDelPermisoParaLaGuia | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const c = await ForestLothGuiaPermisoDB.cargar(tenantId, gtfId, planId);
    if (!c) return null;
    const despachos = await ForestLothDB.lineasDeLaGuia(tenantId, c.gtf);
    const saldo = await ForestLothGuiaPermisoDB.medir(prisma, tenantId, despachos.map((d) => d.id), c.plan, false);
    return { ...saldo, gtfNumber: c.gtf.gtfNumber, planId: c.plan.id };
  }

  /**
   * Las trozas anotadas a mano que anular la guía anula con ella: la MISMA
   * regla que `ForestLothDB.anularGuiaConDespachos` (el `trozadoId` de los
   * items + sin árbol + la cita exacta de la GTF, `trozadosNacidosDeLaGuia`).
   * `null` = la guía no existe en este negocio.
   */
  static async trozasAManoQueAnula(tenantId: string, gtfId: string): Promise<TrozasAManoDeLaGuia | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = await prisma.forestGtf.findFirst({ where: { tenantId, id: gtfId, deletedAt: null }, select: { gtfNumber: true, items: true } });
    if (!gtf) return null;
    const ids = trozadoIdsDeItems(gtf.items);
    if (ids.length === 0) return { trozas: 0, codigos: [] };
    const lineas = await prisma.forestLothEntry.findMany({
      where: { tenantId, id: { in: ids }, section: "trozado", status: "registrado", deletedAt: null, treeCode: null },
      select: { id: true, treeCode: true, observations: true, trozaCode: true },
    });
    const nacidos = new Set(trozadosNacidosDeLaGuia(gtf, lineas));
    const codigos = lineas
      .filter((l) => nacidos.has(l.id))
      .map((l) => l.trozaCode ?? "")
      .filter(Boolean)
      .sort(natural);
    return { trozas: nacidos.size, codigos };
  }

  static async asignar(tenantId: string, gtfId: string, planId: string, actor: string): Promise<PermisoAsignado | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!actor?.trim()) throw new Error("actor is required");
    const c = await ForestLothGuiaPermisoDB.cargar(tenantId, gtfId, planId);
    if (!c) return null;
    const { gtf, plan, codigos } = c;
    const [despachos, trozados, cierres] = await Promise.all([
      ForestLothDB.lineasDeLaGuia(tenantId, gtf),
      codigos.length === 0
        ? Promise.resolve([])
        : prisma.forestLothEntry.findMany({
            /* Sólo las SIN árbol: una del libro con árbol se ata con su tala
               («Atar líneas sin permiso»); atarla acá la dejaría con plan y a
               su tala sin él (revisión 15-10). */
            where: { tenantId, section: "trozado", status: "registrado", deletedAt: null, planId: null, treeCode: null, trozaCode: { in: codigos } },
            select: { id: true, entryDate: true },
          }),
      ForestLothCierreDB.list(tenantId),
    ]);
    const cerrados = [...new Set([...despachos, ...trozados].map((l) => closedPeriodOf(cierres, l.entryDate)?.label).filter((x): x is string => !!x))];
    if (cerrados.length > 0) {
      throw new LothInvariantError(
        `Esta guía tiene líneas en un mes cerrado (${cerrados.join(", ")}): el acta no se toca. Reabre el mes si necesitas asignarle el permiso.`,
        "PERIODO_CERRADO",
        { periodos: cerrados },
      );
    }

    const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);
    const r = await prisma.$transaction(async (tx) => {
      /* Primero las filas del libro (las líneas de la guía y el Trozado de sus
         trozas), después las especies (en `medir`): el orden del despacho y de
         «Atar líneas sin permiso» (sin abrazo mortal), y nadie ata esas trozas a
         otro permiso entre la medida y la escritura. */
      const despachoIds = ids(despachos);
      await tx.$queryRaw`
        SELECT "id" FROM "ForestLothEntry"
        WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL
          AND ("id" = ANY(${despachoIds}::text[])
            OR ("section" = 'trozado' AND ("trozaCode" = ANY(${[...codigos]}::text[])
              OR "trozaCode" IN (SELECT d."trozaCode" FROM "ForestLothEntry" d WHERE d."tenantId" = ${tenantId} AND d."id" = ANY(${despachoIds}::text[])))))
        ORDER BY "id" FOR UPDATE`;
      /* El cruce de permisos, T7 y T6 contra ESTE permiso, releídos bajo los locks:
         la ventana sólo lo mostró; si en el medio cambió algo, decide esto. */
      const saldo = await ForestLothGuiaPermisoDB.medir(tx, tenantId, despachoIds, plan, true);
      if (saldo.bloqueo) {
        throw new LothInvariantError(saldo.bloqueo.mensaje, saldo.bloqueo.codigo, { gtfId, planId: plan.id, species: saldo.bloqueo.especie });
      }
      /* La condición va en el WHERE: si otra persona la ató o la anuló entre la lectura y acá, no se pisa. */
      const g = await tx.forestGtf.updateMany({
        where: { tenantId, id: gtf.id, planId: null, deletedAt: null, status: { not: "anulada" } },
        data: {
          planId: plan.id,
          tituloHabilitante: plan.tituloHabilitante?.trim() || gtf.tituloHabilitante,
          parcelaCorta: gtf.parcelaCorta ?? plan.parcelaCorta,
        },
      });
      if (g.count === 0) {
        throw new LothInvariantError(`La GTF ${gtf.gtfNumber} cambió mientras tanto (ya tiene permiso o se anuló). Recarga la lista.`, "GUIA_PERMISO_NO_APLICA", { gtfId });
      }
      /* Sin cruce (lo midió `medir` bajo el lock): cada una de estas líneas tiene
         su Trozado sin permiso o con ÉSTE. */
      const d = await tx.forestLothEntry.updateMany({
        where: { tenantId, id: { in: despachoIds }, planId: null, status: "registrado", deletedAt: null },
        data: { planId: plan.id },
      });
      const t = await tx.forestLothEntry.updateMany({
        where: { tenantId, id: { in: ids(trozados) }, planId: null, deletedAt: null },
        data: { planId: plan.id },
      });
      return { despachos: d.count, trozados: t.count };
    }, LOTH_TX_OPTS);

    auditLoth({
      tenantId,
      action: "loth_linea_atar_plan",
      entity: "ForestGtf",
      entityId: gtf.id,
      detail: `Asignó el permiso ${plan.tituloHabilitante ?? plan.planNumber ?? plan.id} a la GTF ${gtf.gtfNumber} (antes: sin permiso): la guía, ${r.despachos} línea(s) de despacho y ${r.trozados} de trozado.`,
      user: actor,
    });
    try {
      /* Los prefijos de `ForestLothDB` y `ForestGtfDB`: saldos, secciones y la lista de guías. */
      invalidateByPrefix(`forest-loth:${tenantId}`);
      invalidateByPrefix(`forest-gtf:${tenantId}`);
    } catch { /* cache best-effort */ }
    return { gtfId: gtf.id, planId: plan.id, ...r };
  }
}
