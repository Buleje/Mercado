/**
 * GTF preliminares de un plan (Brandon 25-10): guías hechas a mano que todavía
 * no se registran en SERFOR ni en el libro. Las reglas viven en
 * `lib/forestal/loth-plan-preliminares.ts` (puro); acá se leen y escriben.
 *
 * Sin schema (la base es la de producción), como el reparto por bloques: una
 * clave de `PlatformSettings` POR PLAN, `loth-plan-preliminares:{tenantId}:{planId}`,
 * con la lista entera. Se escribe con `actualizar` (lee de la base bajo el
 * candado de la clave: dos altas a la vez no se pisan ni repiten el N.º) y
 * `actualizar` invalida el caché de la clave. Nada se borra: anular es baja lógica.
 *
 * El freno legal (T6) no lee esto: lo preliminar sólo se MUESTRA aparte.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { ForestPlanBloquesDB } from "@/lib/db/forest-plan-bloques.db";
import { auditLoth } from "@/lib/forestal/loth-audit";
import { saldoPorBloques, type UsoParaBloques } from "@/lib/forestal/loth-plan-bloques-saldo";
import {
  agregarPreliminar,
  aVista,
  cambiarEstadoPreliminar,
  corregirPreliminar,
  gtfPreliminarGuardadaSchema,
  delLibroDeLaGuia,
  guiaDelLibroDe,
  prepararPreliminar,
  resumenDeLineas,
  textoDeLts,
  resumirPreliminares,
  type AccionDeEstado,
  type DatosPreliminar,
  type EnElLibro,
  type EspecieDelSaldo,
  type GtfPreliminar,
  type GuiaDelLibro,
  type PreliminaresDelPlan,
} from "@/lib/forestal/loth-plan-preliminares";

const KEY_PREFIX = "loth-plan-preliminares:";
const claveDe = (tenantId: string, planId: string) => `${KEY_PREFIX}${tenantId}:${planId}`;

/** Tope de guías del libro que se cruzan por N.º (de este plan y sin plan). */
const MAX_GUIAS_DEL_LIBRO = 5000;

interface Store {
  guias: unknown[];
}

/** Error de negocio con su status y un mensaje que la pantalla muestra tal cual. */
export class PreliminarError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "PreliminarError";
  }
}

/** Lo guardado, separado en lo que se entiende y lo que no (lo que no, se conserva tal cual al escribir). */
function separar(raw: Store | null): { validas: GtfPreliminar[]; rotas: unknown[] } {
  const validas: GtfPreliminar[] = [];
  const rotas: unknown[] = [];
  for (const g of Array.isArray(raw?.guias) ? raw.guias : []) {
    const p = gtfPreliminarGuardadaSchema.safeParse(g);
    if (p.success) validas.push(p.data);
    else rotas.push(g);
  }
  return { validas, rotas };
}

const actor = (user: string) => user || "unknown";

export const ForestPlanPreliminaresDB = {
  /** Las preliminares del plan, de la base (no del caché: se leen justo después de escribir). */
  async listar(tenantId: string, planId: string): Promise<GtfPreliminar[]> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) return [];
    const raw = await PlatformSettingsDB.getFresco<Store>(claveDe(tenantId, planId));
    return separar(raw).validas;
  },

  /** Las guías vivas del libro de este plan y sin plan: con ellas se sabe si una preliminar ya se registró. */
  async guiasDelLibro(tenantId: string, planId: string): Promise<GuiaDelLibro[]> {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestGtf.findMany({
      where: { tenantId, deletedAt: null, status: { not: "anulada" }, OR: [{ planId }, { planId: null }] },
      select: { id: true, gtfNumber: true, planId: true },
      /* Las más nuevas primero: el tope corta las viejas, no las que una preliminar acaba de alcanzar. */
      orderBy: { createdAt: "desc" },
      take: MAX_GUIAS_DEL_LIBRO,
    });
  },

  /**
   * La lista con su cruce contra el libro, el KPI y la columna por especie,
   * contra el saldo que ya midió el freno (`ForestLothSaldoPlanDB.saldo`).
   */
  async delPlan(
    tenantId: string,
    planId: string,
    saldo: {
      especies: readonly (EspecieDelSaldo & { guias?: readonly UsoParaBloques[] })[];
      total: { quedaM3: number };
      sinTecho: boolean;
    },
  ): Promise<PreliminaresDelPlan> {
    if (!tenantId) throw new Error("tenantId is required");
    const [lista, guardadas, reparto] = await Promise.all([
      ForestPlanPreliminaresDB.listar(tenantId, planId),
      ForestPlanPreliminaresDB.guiasDelLibro(tenantId, planId),
      ForestPlanBloquesDB.leer(tenantId, planId),
    ]);
    /* Las guías que el saldo YA cuenta, tengan o no su ForestGtf: un despacho del libro
       con el N.º escrito (POST /loth) descuenta sin guía guardada, y la preliminar con
       ese N.º descontaba otra vez y avisaba «falta registrarla». */
    const contadas: GuiaDelLibro[] = saldo.especies.flatMap((e) =>
      (e.guias ?? []).flatMap((u) => (u.gtfNumber ? [{ id: u.gtfId ?? null, gtfNumber: u.gtfNumber, planId: u.sinPlan ? null : planId }] : [])),
    );
    const delLibro = [...guardadas, ...contadas];
    const guias = [...lista]
      .sort((a, b) => b.creadaAt.localeCompare(a.creadaAt))
      .map((g) => aVista(g, guiaDelLibroDe(g.numeroGtf, delLibro, planId), delLibroDeLaGuia(g.numeroGtf, saldo.especies)));
    const { resumen, porEspecie } = resumirPreliminares(saldo, guias);
    /* El saldo de cada bloque: lo del libro sólo va a un bloque si su preliminar lo dice (ver el módulo). */
    const porBloque = saldoPorBloques(reparto?.bloques ?? [], saldo.especies, guias);
    return { guias, resumen, porEspecie, bloques: reparto?.bloques.map((b) => b.nombre) ?? [], porBloque };
  },

  /** Cruza los datos con las especies y los bloques del plan; 400 legible si algo no cuadra. */
  async preparar(tenantId: string, planId: string, datos: DatosPreliminar) {
    const [especies, reparto] = await Promise.all([ForestPlanDB.listSpecies(tenantId, planId), ForestPlanBloquesDB.leer(tenantId, planId)]);
    const p = prepararPreliminar(datos, especies, reparto?.bloques.map((b) => b.nombre) ?? []);
    if (!p.ok) throw new PreliminarError(400, "validation_error", p.mensaje);
    return p.datos;
  },

  async enElLibro(tenantId: string, planId: string, numeroGtf: string): Promise<EnElLibro | null> {
    return guiaDelLibroDe(numeroGtf, await ForestPlanPreliminaresDB.guiasDelLibro(tenantId, planId), planId);
  },

  /** Anota una preliminar. Si su N.º ya está en el libro de este plan, nace «registrada». */
  async crear(tenantId: string, planId: string, datos: DatosPreliminar, user: string): Promise<{ guia: GtfPreliminar; yaEnElLibro: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) throw new Error("planId is required");
    const listos = await ForestPlanPreliminaresDB.preparar(tenantId, planId, datos);
    const enElLibro = await ForestPlanPreliminaresDB.enElLibro(tenantId, planId, listos.numeroGtf);
    const at = new Date().toISOString();
    const r = await PlatformSettingsDB.actualizar<Store, ReturnType<typeof agregarPreliminar>>(
      claveDe(tenantId, planId),
      (actual) => {
        const { validas, rotas } = separar(actual);
        const res = agregarPreliminar(validas, listos, { id: randomUUID(), por: actor(user), at, enElLibro });
        return res.ok ? { valor: { guias: [...res.lista, ...rotas] }, resultado: res } : { resultado: res };
      },
      actor(user),
    );
    if (!r.ok) throw new PreliminarError(r.status, r.codigo, r.mensaje);
    auditLoth({
      tenantId,
      action: "loth_plan_preliminar_crear",
      entity: "ForestLothGtfPreliminar",
      entityId: r.guia.id,
      detail: `Anotó la GTF preliminar ${r.guia.numeroGtf} (LT ${textoDeLts(r.guia.numerosLt)})${r.yaEnElLibro ? ", ya en el libro: quedó registrada" : ", pendiente de SERFOR"}: ${resumenDeLineas(r.guia.lineas)}`,
      user: actor(user),
    });
    return { guia: r.guia, yaEnElLibro: r.yaEnElLibro };
  },

  /** Corrige N.º, LT, fecha, filas o nota. */
  async corregir(tenantId: string, planId: string, id: string, datos: DatosPreliminar, user: string): Promise<{ guia: GtfPreliminar; yaEnElLibro: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    const listos = await ForestPlanPreliminaresDB.preparar(tenantId, planId, datos);
    const enElLibro = await ForestPlanPreliminaresDB.enElLibro(tenantId, planId, listos.numeroGtf);
    const at = new Date().toISOString();
    const r = await PlatformSettingsDB.actualizar<Store, ReturnType<typeof corregirPreliminar>>(
      claveDe(tenantId, planId),
      (actual) => {
        const { validas, rotas } = separar(actual);
        const res = corregirPreliminar(validas, id, listos, { por: actor(user), at, enElLibro });
        return res.ok ? { valor: { guias: [...res.lista, ...rotas] }, resultado: res } : { resultado: res };
      },
      actor(user),
    );
    if (!r.ok) throw new PreliminarError(r.status, r.codigo, r.mensaje);
    auditLoth({
      tenantId,
      action: "loth_plan_preliminar_corregir",
      entity: "ForestLothGtfPreliminar",
      entityId: id,
      detail: `Corrigió la GTF preliminar ${r.guia.numeroGtf} (LT ${textoDeLts(r.guia.numerosLt)}): ${resumenDeLineas(r.guia.lineas)}`,
      user: actor(user),
    });
    return { guia: r.guia, yaEnElLibro: r.yaEnElLibro };
  },

  /** «Ya la registré», «Anular» (con motivo) o «Volver a pendiente». */
  async cambiarEstado(tenantId: string, planId: string, id: string, accion: AccionDeEstado, user: string): Promise<GtfPreliminar> {
    if (!tenantId) throw new Error("tenantId is required");
    const at = new Date().toISOString();
    /* «Ya la registré» sin guía: si el libro ya tiene ese N.º en este plan, queda atada a ella. */
    let a = accion;
    if (a.accion === "registrada" && !a.gtfId) {
      const actual = (await ForestPlanPreliminaresDB.listar(tenantId, planId)).find((g) => g.id === id);
      const libro = actual ? await ForestPlanPreliminaresDB.enElLibro(tenantId, planId, actual.numeroGtf) : null;
      a = { accion: "registrada", gtfId: libro?.gtfId ?? null };
    }
    const r = await PlatformSettingsDB.actualizar<Store, ReturnType<typeof cambiarEstadoPreliminar>>(
      claveDe(tenantId, planId),
      (actual) => {
        const { validas, rotas } = separar(actual);
        const res = cambiarEstadoPreliminar(validas, id, a, { por: actor(user), at });
        return res.ok ? { valor: { guias: [...res.lista, ...rotas] }, resultado: res } : { resultado: res };
      },
      actor(user),
    );
    if (!r.ok) throw new PreliminarError(r.status, r.codigo, r.mensaje);
    const que = a.accion === "registrada" ? "la marcó como registrada" : a.accion === "anular" ? `la anuló (${a.motivo})` : "la volvió a pendiente";
    auditLoth({
      tenantId,
      action: "loth_plan_preliminar_estado",
      entity: "ForestLothGtfPreliminar",
      entityId: id,
      detail: `GTF preliminar ${r.guia.numeroGtf} (LT ${textoDeLts(r.guia.numerosLt)}): ${que}`,
      user: actor(user),
    });
    return r.guia;
  },
};
