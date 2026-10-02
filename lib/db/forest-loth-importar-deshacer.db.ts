/**
 * ForestLothDeshacerImportacionDB — «Deshacer la importación» de una guía del
 * Libro TH (ADR-461 §12, 02-10-2026).
 *
 * La regla vive en `lib/forestal/loth-importar-guia-deshacer.ts` (pura); acá se
 * lee bajo los candados y se escribe en UNA transacción:
 *
 *   turno del negocio (el mismo del importador) → candado del N° de la guía →
 *   ¿el CTP depende de esta guía? → talas del árbol FOR UPDATE → mes cerrado →
 *   anular guía, despachos, trozados y talas propias · reducir las compartidas
 *   · baja del plan si lo creó una importación y queda vacío.
 *
 * ¿Cuándo el CTP depende? (lo que el 409 de `anularGuiaConDespachos` protege)
 *   1. Un ingreso vivo de la MISMA guía (N° tramo a tramo + permiso/titular,
 *      la vara de `exigirSinIngresosEnElCtp`) que entró DESPUÉS de la
 *      importación y SIN ficha de SERFOR: vino del Libro TH («Recibir»).
 *   2. Una troza del CTP atada a un trozado de esta guía (`lothTrozadoId`,
 *      ADR-450): la troza perdería su árbol o quedaría «sin despachar» en el TH.
 * Un ingreso que ya existía (o que trae su propia ficha de SERFOR) no depende:
 * la importación lo COPIÓ. Por eso este camino no afloja el 409 de una guía
 * emitida por el TH: ésa no tiene la marca de importada, y si alguien la
 * escribiera a mano, el ingreso que salió de ella sigue frenándola (regla 1).
 *
 * tenantId 1er parámetro · auditoría `loth_*` · caché invalidada tras el commit.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { LothInvariantError } from "@/lib/db/forest-loth.db";
import { ForestLothCierreDB } from "@/lib/db/forest-loth-cierre.db";
import { GtfNumeroDB, GuiaYaEnElCtpError } from "@/lib/db/gtf-numero.db";
import { tomarTurnoDeImportacion } from "@/lib/db/forest-loth-importar.db";
import { auditLoth } from "@/lib/forestal/loth-audit";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { closedPeriodOf, type LothCierrePeriodo } from "@/lib/forestal/loth-cierre-types";
import { colaDeGtf, mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";
import { lineasDeLaGuia, piezasDeItems } from "@/lib/forestal/loth-guia-despacho";
import { foliosEnTexto, identidadDeGuiaTh, mismaGuiaTh } from "@/lib/forestal/guia-th-al-ctp";
import { mismoDuenoDeGuia } from "@/lib/forestal/loth-talonario";
import { leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { leerReferencial, nombreDelPlan, type PiezaDeTala } from "@/lib/forestal/loth-importar-guia";
import {
  accionSobreTala,
  bajaDelPlan,
  esTrozadoDeLaImportacion,
  importacionDeLaGuia,
  type AccionSobreTala,
} from "@/lib/forestal/loth-importar-guia-deshacer";
import type { DeshacerImportacion, TalaDeshecha } from "@/lib/forestal/loth-importar-guia-tipos";

/** Unas decenas de consultas: holgado aun desde la PC por el pooler (~108 ms cada una). */
const DESHACER_TX_OPTS = { timeout: 60_000, maxWait: 15_000 } as const;

/** No hay importación que deshacer en esa guía (no la asentó el importador, o ya está anulada) → 409. */
export class DeshacerRechazadoError extends Error {
  constructor(
    message: string,
    readonly codigo: string,
    readonly libroNros?: (number | null)[],
  ) {
    super(message);
    this.name = "DeshacerRechazadoError";
  }
}

const num = (v: Prisma.Decimal | null | undefined): number | null => (v == null ? null : Number(v));
const dec = (v: number | null | undefined) => (v == null ? null : new Prisma.Decimal(v));
const lista = (xs: readonly (string | number)[], max = 12) =>
  xs.length <= max ? xs.join(", ") : `${xs.slice(0, max).join(", ")} y ${xs.length - max} más`;

/** Lo que se escribiría (ids), además del resumen para la pantalla. */
interface Escritura {
  gtfId: string;
  gtfNumber: string;
  despachos: { id: string; lineNo: number }[];
  trozados: { id: string; lineNo: number }[];
  talas: { id: string; lineNo: number; treeCode: string; antes: number | null; accion: Exclude<AccionSobreTala, { accion: "dejar" }> }[];
  planBaja: { id: string; planType: string; planNumber: string | null; titularName: string } | null;
}

export class ForestLothDeshacerImportacionDB {
  /**
   * Revisa (`accion` = null) o deshace (`accion` = { motivo, user }) la
   * importación de la guía `gtfId`. `null` = la guía no existe en ESTE negocio
   * (→ 404). Al revisar, lo que impide deshacer viaja en `bloqueo`; al
   * deshacer, se tira (`DeshacerRechazadoError` 409 · `GuiaYaEnElCtpError` 409
   * · `LothInvariantError` 422 · `ImportacionEnCursoError` 409).
   */
  static async deshacer(
    tenantId: string,
    gtfId: string,
    accion: { motivo: string; user: string } | null,
  ): Promise<DeshacerImportacion | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const guia = await prisma.forestGtf.findFirst({
      where: { tenantId, id: gtfId, deletedAt: null },
      select: { id: true, gtfNumber: true },
    });
    if (!guia) return null;
    // Los cierres: KV con el cliente global, antes de abrir la transacción (como el importador).
    const cierres = await ForestLothCierreDB.list(tenantId);

    const hecho = await prisma.$transaction(async (tx) => {
      // El turno del negocio: no se deshace mientras se importa (ni dos a la vez).
      if (accion) await tomarTurnoDeImportacion(tx, tenantId, false);
      else await tx.$queryRaw`SELECT set_config('lock_timeout', ${"15000ms"}, true)`;
      await GtfNumeroDB.bloquear(tx, tenantId, guia.gtfNumber);
      const r = await ForestLothDeshacerImportacionDB.revisarEnTx(tx, tenantId, gtfId, cierres, accion != null);
      if (!r || !accion) return r;
      const b = r.resumen.bloqueo;
      if (b) {
        if (b.codigo === "PERIODO_CERRADO") throw new LothInvariantError(b.mensaje, "PERIODO_CERRADO");
        if (b.codigo === "guia_ya_en_el_ctp" || b.codigo === "troza_ya_en_el_ctp") {
          throw new GuiaYaEnElCtpError(b.mensaje, b.libroNros ?? [], b.codigo === "troza_ya_en_el_ctp" ? "troza_ya_en_el_ctp" : "guia_ya_en_el_ctp");
        }
        throw new DeshacerRechazadoError(b.mensaje, b.codigo, b.libroNros);
      }
      await ForestLothDeshacerImportacionDB.escribirEnTx(tx, tenantId, r.escritura, accion.motivo);
      return r;
    }, DESHACER_TX_OPTS);

    if (!hecho) return null;
    if (!accion) return hecho.resumen;
    ForestLothDeshacerImportacionDB.despuesDeDeshacer(tenantId, hecho.resumen, hecho.escritura, accion);
    return { ...hecho.resumen, hecho: true };
  }

  /** La MISMA revisión para la vista previa y para deshacer (dentro de la tx, bajo el candado del N°). */
  private static async revisarEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    gtfId: string,
    cierres: LothCierrePeriodo[],
    bloquear: boolean,
  ): Promise<{ resumen: DeshacerImportacion; escritura: Escritura } | null> {
    const gtf = await tx.forestGtf.findFirst({
      where: { tenantId, id: gtfId, deletedAt: null },
      select: {
        id: true, gtfNumber: true, status: true, observations: true, items: true, planId: true,
        titularName: true, tituloHabilitante: true, gtfDatos: true, createdAt: true, volumenTotalM3: true,
      },
    });
    if (!gtf) return null;
    const imp = importacionDeLaGuia(gtf.observations);
    const escritura: Escritura = { gtfId: gtf.id, gtfNumber: gtf.gtfNumber, despachos: [], trozados: [], talas: [], planBaja: null };
    const resumen: DeshacerImportacion = {
      gtfId: gtf.id,
      gtfNumber: gtf.gtfNumber,
      registro: imp?.registro ?? null,
      volumenM3: num(gtf.volumenTotalM3),
      despachos: 0,
      trozados: 0,
      trozadosQueQuedan: 0,
      talas: [],
      plan: null,
      bloqueo: null,
      hecho: false,
    };
    if (!imp) {
      resumen.bloqueo = {
        codigo: "no_es_importada",
        mensaje: `La GTF ${gtf.gtfNumber} no la asentó una importación: anúlala con «Anular» (si su madera ya entró al Libro CTP, primero se anula allá).`,
      };
      return { resumen, escritura };
    }
    if (gtf.status === "anulada") {
      resumen.bloqueo = { codigo: "ya_anulada", mensaje: `La GTF ${gtf.gtfNumber} ya está anulada: no queda nada que deshacer.` };
      return { resumen, escritura };
    }

    // 1. Los despachos de ESTA guía (la regla de `anularGuiaConDespachos`: dos titulares pueden tener el N°).
    const candidatas = await tx.forestLothEntry.findMany({
      where: { tenantId, section: "despacho_troza", gtfNumber: gtf.gtfNumber, status: "registrado", deletedAt: null },
      select: { id: true, lineNo: true, entryDate: true, trozaCode: true, planId: true },
    });
    const cola = colaDeGtf(gtf.gtfNumber);
    const conLaCola = cola
      ? await tx.forestGtf.findMany({
          where: { tenantId, deletedAt: null, id: { not: gtf.id }, gtfNumber: { endsWith: cola } },
          select: { gtfNumber: true },
        })
      : [];
    const despachos = lineasDeLaGuia(gtf, candidatas, {
      otrasConElNumero: conLaCola.filter((g) => mismoNumeroGtf(g.gtfNumber, gtf.gtfNumber)).length,
    });

    // 2. Los trozados de sus trozas: los que creó ESTA importación se anulan; los de antes, quedan.
    const piezas = piezasDeItems(gtf.items);
    const codigos = [...new Set(piezas.map((p) => p.codigo).filter(Boolean))];
    const trozados = codigos.length
      ? await tx.forestLothEntry.findMany({
          where: { tenantId, section: "trozado", status: "registrado", deletedAt: null, trozaCode: { in: codigos } },
          select: { id: true, lineNo: true, entryDate: true, planId: true, treeCode: true, observations: true },
        })
      : [];
    const propios = trozados.filter(
      (t) => esTrozadoDeLaImportacion(t.observations, gtf.gtfNumber, imp.registro) && (!gtf.planId || t.planId === gtf.planId),
    );
    const idsPropios = new Set(propios.map((t) => t.id));

    // 3. ¿El Libro CTP depende de esta guía? (ver el encabezado)
    resumen.bloqueo = await ForestLothDeshacerImportacionDB.dependenciaDelCtp(tx, tenantId, gtf, trozados.map((t) => t.id));

    // 4. Las talas de sus árboles: anular las que armó sólo esta guía, reducir las compartidas.
    const arboles = [
      ...new Set([...trozados.map((t) => t.treeCode), ...piezas.map((p) => p.arbol)].map((a) => a?.trim()).filter((a): a is string => !!a)),
    ];
    if (bloquear && arboles.length) {
      await tx.$queryRaw`
        SELECT "id" FROM "ForestLothEntry"
        WHERE "tenantId" = ${tenantId} AND "section" = 'tala' AND "deletedAt" IS NULL
          AND "treeCode" IN (${Prisma.join(arboles)})
        ORDER BY "id" FOR UPDATE`;
    }
    const talas = arboles.length
      ? await tx.forestLothEntry.findMany({
          where: { tenantId, section: "tala", status: "registrado", deletedAt: null, treeCode: { in: arboles } },
          select: { id: true, lineNo: true, entryDate: true, planId: true, treeCode: true, volumeM3: true, medicionCruda: true },
          orderBy: { lineNo: "asc" },
        })
      : [];
    const delArbol = talas.length
      ? await tx.forestLothEntry.findMany({
          where: { tenantId, section: "trozado", status: "registrado", deletedAt: null, treeCode: { in: arboles } },
          select: { id: true, planId: true, treeCode: true, trozaCode: true, diamMayorM: true, diamMenorM: true, lengthM: true, volumeM3: true },
          orderBy: { lineNo: "asc" },
        })
      : [];
    const talasTocadas: { id: string; lineNo: number; entryDate: Date }[] = [];
    for (const tala of talas) {
      const restantes: PiezaDeTala[] = delArbol
        .filter((x) => x.treeCode === tala.treeCode && x.planId === tala.planId && !idsPropios.has(x.id))
        .map((x) => ({ code: x.trozaCode ?? "", d1: num(x.diamMayorM), d2: num(x.diamMenorM), l: num(x.lengthM), v: num(x.volumeM3) }));
      const acc = accionSobreTala(leerReferencial(tala.medicionCruda), gtf.gtfNumber, imp.registro, restantes);
      if (acc.accion === "dejar") continue;
      const antes = num(tala.volumeM3);
      escritura.talas.push({ id: tala.id, lineNo: tala.lineNo, treeCode: tala.treeCode ?? "", antes, accion: acc });
      talasTocadas.push(tala);
      const t: TalaDeshecha = {
        id: tala.id,
        lineNo: tala.lineNo,
        treeCode: tala.treeCode ?? "",
        accion: acc.accion,
        antesM3: antes,
        despuesM3: acc.accion === "reducir" ? acc.medidas.volumeM3 : null,
        otrasGuias: acc.accion === "reducir" ? acc.otrasGuias : [],
      };
      resumen.talas.push(t);
    }

    // 5. Mes cerrado: ninguna de las líneas que se tocan puede caer en uno.
    if (!resumen.bloqueo) {
      const tocadas = [...despachos, ...propios, ...talasTocadas];
      const cerrado = tocadas.map((l) => closedPeriodOf(cierres, l.entryDate)).find((c) => c != null);
      if (cerrado) {
        resumen.bloqueo = {
          codigo: "PERIODO_CERRADO",
          mensaje: `El período ${cerrado.label} está cerrado: reábrelo para deshacer esta importación.`,
        };
      }
    }

    escritura.despachos = despachos.map((d) => ({ id: d.id, lineNo: d.lineNo }));
    escritura.trozados = propios.map((t) => ({ id: t.id, lineNo: t.lineNo }));
    resumen.despachos = despachos.length;
    resumen.trozados = propios.length;
    resumen.trozadosQueQuedan = trozados.length - propios.length;

    // 6. El permiso: ¿lo creó una importación y queda vacío?
    const planId = gtf.planId ?? despachos.find((d) => d.planId)?.planId ?? null;
    if (planId) {
      const plan = await tx.forestPlan.findFirst({
        where: { tenantId, id: planId },
        select: { id: true, planType: true, planNumber: true, tituloHabilitante: true, titularName: true, notes: true, deletedAt: true },
      });
      if (plan) {
        const seAnulan = [
          ...escritura.despachos.map((d) => d.id),
          ...escritura.trozados.map((t) => t.id),
          ...escritura.talas.filter((t) => t.accion.accion === "anular").map((t) => t.id),
        ];
        // En serie: dentro de una tx es UNA conexión (memoria `promise-all-dentro-de-tx-interactiva`).
        const lineasVivas = await tx.forestLothEntry.count({
          where: { tenantId, planId, status: "registrado", deletedAt: null, id: { notIn: seAnulan } },
        });
        const guiasVigentes = await tx.forestGtf.count({
          where: { tenantId, planId, deletedAt: null, status: { not: "anulada" }, id: { not: gtf.id } },
        });
        const especies = await tx.forestPlanSpecies.count({ where: { tenantId, planId, deletedAt: null } });
        const censo = await tx.forestCensusTree.count({ where: { tenantId, planId, deletedAt: null } });
        const permisos = await tx.forestContrato.count({ where: { tenantId, planId, deletedAt: null } });
        const b = bajaDelPlan(plan, { lineasVivas, guiasVigentes, especies, censo, permisos });
        resumen.plan = { id: plan.id, nombre: nombreDelPlan(plan), baja: b.baja, motivo: b.motivo };
        if (b.baja) escritura.planBaja = plan;
      }
    }
    return { resumen, escritura };
  }

  /**
   * ¿Algo del Libro CTP cuelga de esta guía del TH? `null` = nada (se puede
   * deshacer). Ver el encabezado: un ingreso que entró desde el TH, o una troza
   * atada a uno de sus trozados.
   */
  private static async dependenciaDelCtp(
    tx: Prisma.TransactionClient,
    tenantId: string,
    gtf: { gtfNumber: string; tituloHabilitante: string | null; titularName: string | null; gtfDatos: unknown; createdAt: Date },
    trozadoIds: readonly string[],
  ): Promise<DeshacerImportacion["bloqueo"]> {
    const identidad = { gtfNumber: gtf.gtfNumber, ...identidadDeGuiaTh(gtf, leerGtfDatos(gtf.gtfDatos)) };
    /* La MISMA vara que `GtfNumeroDB.exigirSinIngresosEnElCtp` para «es esta guía». */
    const deEstaGuia = (await GtfNumeroDB.ingresosVivos(tx, tenantId, gtf.gtfNumber)).filter(
      (e) =>
        mismaGuiaTh({ permisoCodigo: e.originCode, titularNombre: e.providerName }, identidad).ok ||
        mismoDuenoDeGuia({ titular: e.providerName, permiso: e.originCode }, identidad) === true,
    );
    const desdeElTh = deEstaGuia.length
      ? await tx.woodEntry.findMany({
          where: {
            tenantId,
            id: { in: deEstaGuia.map((e) => e.id) },
            createdAt: { gte: gtf.createdAt },
            serforGtf: { equals: Prisma.DbNull },
          },
          select: { libroNro: true },
          orderBy: { libroNro: "asc" },
        })
      : [];
    if (desdeElTh.length) {
      const nros = desdeElTh.map((e) => e.libroNro);
      return {
        codigo: "guia_ya_en_el_ctp",
        mensaje:
          `Esta guía entró a tu Libro CTP desde el Libro TH después de importarla (${foliosEnTexto(nros)}): ` +
          `ese ingreso depende de ella. Anúlalo allá primero y después deshaz la importación.`,
        libroNros: nros,
      };
    }
    try {
      await GtfNumeroDB.exigirTrozadosFueraDelCtp(tx, tenantId, trozadoIds, [gtf.gtfNumber], {
        de: "de esta guía",
        la: "la importación",
      });
    } catch (err) {
      if (err instanceof GuiaYaEnElCtpError) return { codigo: err.codigo, mensaje: err.message, libroNros: err.libroNros };
      throw err;
    }
    return null;
  }

  /** Las escrituras, en la tx de la revisión (ya bajo los candados). */
  private static async escribirEnTx(tx: Prisma.TransactionClient, tenantId: string, e: Escritura, motivo: string): Promise<void> {
    const razon = `Se deshizo la importación de la GTF ${e.gtfNumber}: ${motivo}`.slice(0, 500);
    await tx.forestGtf.update({
      where: { id: e.gtfId, tenantId } satisfies Prisma.ForestGtfWhereUniqueInput,
      data: { status: "anulada", annulledReason: `Importación deshecha: ${motivo}`.slice(0, 500) },
    });
    const anular = [
      ...e.despachos.map((d) => d.id),
      ...e.trozados.map((t) => t.id),
      ...e.talas.filter((t) => t.accion.accion === "anular").map((t) => t.id),
    ];
    if (anular.length) {
      await tx.forestLothEntry.updateMany({
        where: { tenantId, id: { in: anular }, status: "registrado" },
        data: { status: "anulado", annulledReason: razon },
      });
    }
    for (const t of e.talas) {
      if (t.accion.accion !== "reducir") continue;
      const m = t.accion.medidas;
      await tx.forestLothEntry.update({
        where: { id: t.id, tenantId } satisfies Prisma.ForestLothEntryWhereUniqueInput,
        data: {
          diamMayorM: dec(m.diamMayorM),
          diamMenorM: dec(m.diamMenorM),
          lengthM: dec(m.lengthM),
          volumeM3: dec(m.volumeM3),
          medicionCruda: t.accion.marca as unknown as Prisma.InputJsonValue,
          observations: t.accion.observacion,
        },
      });
    }
    if (e.planBaja) {
      await tx.forestPlan.updateMany({
        where: { tenantId, id: e.planBaja.id, deletedAt: null },
        data: { deletedAt: new Date(), isActive: false },
      });
    }
  }

  /** Rastro y caché, después del commit. */
  private static despuesDeDeshacer(
    tenantId: string,
    r: DeshacerImportacion,
    e: Escritura,
    accion: { motivo: string; user: string },
  ): void {
    const user = accion.user;
    const anuladas = e.talas.filter((t) => t.accion.accion === "anular");
    auditLoth({
      tenantId,
      action: "loth_gtf_deshacer_importar",
      entity: "ForestGtf",
      entityId: e.gtfId,
      detail:
        `Deshizo la importación de la GTF ${e.gtfNumber}${r.registro ? ` (registro SERFOR ${r.registro})` : ""}: ` +
        `anuló la guía, ${e.despachos.length} despacho(s)${e.despachos.length ? ` (#${lista(e.despachos.map((d) => d.lineNo))})` : ""}, ` +
        `${e.trozados.length} trozado(s)${e.trozados.length ? ` (#${lista(e.trozados.map((t) => t.lineNo))})` : ""} y ` +
        `${anuladas.length} tala(s) referencial(es)${anuladas.length ? ` (#${lista(anuladas.map((t) => t.lineNo))})` : ""}` +
        `${r.trozadosQueQuedan ? `; ${r.trozadosQueQuedan} trozado(s) de antes quedan` : ""}` +
        `${e.planBaja ? `; dio de baja el permiso ${r.plan?.nombre ?? e.planBaja.id}` : ""}. Motivo: ${accion.motivo}`,
      user,
    });
    for (const t of e.talas) {
      if (t.accion.accion !== "reducir") continue;
      auditLoth({
        tenantId,
        action: "loth_linea_reducir_referencial",
        entity: "ForestLothEntry",
        entityId: t.id,
        detail:
          `Redujo la tala referencial #${t.lineNo} del árbol ${t.treeCode} al deshacer la GTF ${e.gtfNumber}: ` +
          `${fmtM3(t.antes ?? 0)} → ${fmtM3(t.accion.medidas.volumeM3 ?? 0)} m³ (queda con la GTF ${t.accion.otrasGuias.join(", ")})`,
        user,
      });
    }
    if (e.planBaja) {
      auditCtp({
        tenantId,
        action: "ctp_plan_baja",
        entity: "ForestPlan",
        entityId: e.planBaja.id,
        detail:
          `Baja del plan ${e.planBaja.planType} ${e.planBaja.planNumber ?? "(sin N°)"} — ${e.planBaja.titularName}: ` +
          `lo creó la importación de la GTF ${e.gtfNumber} y quedó vacío al deshacerla (ADR-461).`,
        user,
      });
    }
    for (const prefijo of [`forest-loth:${tenantId}`, `forest-gtf:${tenantId}`, `forest-plan:${tenantId}`]) {
      try {
        invalidateByPrefix(prefijo);
      } catch (err) {
        logger.error("[forest-loth-deshacer] no se pudo invalidar la caché", { error: String(err), tenantId, prefijo });
      }
    }
  }
}
