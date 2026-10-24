import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { DocumentsDB } from "@/lib/db/documents.db";
import { isPrivilegedRole } from "@/lib/documents/doc-access";
import { invalidarCamposPersonalizados } from "@/lib/db/campos-personalizados.db";
import { segmentoDeCarpeta } from "@/lib/forestal/documentos-guia";
import {
  FORMULARIO_CARPETAS_PLAN,
  PREFIJO_FORMULARIO_CARPETA,
  ROLES_LECTURA_DOCS_PLAN,
  TIPO_ARCHIVO,
  TIPO_CARPETA,
  formularioDeCarpeta,
  tagCampo,
  tagCarpetaPlan,
  tagRaizPlan,
  type AdoptarCarpetaInput,
  type CarpetaEditarInput,
  type CarpetaNuevaInput,
  type PlanDocumentosVista,
  type PlantillaCarpetaPatchInput,
  type VincularArchivoInput,
} from "@/lib/forestal/plan-documentos-tipos";
import {
  armarCarpetas,
  claveDeCarpeta,
  claveDeEtiquetas,
  filasDeSemilla,
  folderIdDeClaveSuelta,
  nombreCarpetaDesambiguada,
  resumirCarpetas,
  rutaPropuestaDelPlan,
  type CampoArchivoFila,
  type PlanParaCarpeta,
} from "@/lib/forestal/plan-documentos-semilla";

/**
 * ForestPlanDocumentosDB — «Documentos del plan de manejo» (ADR-467).
 *
 * Cero tablas nuevas: la sección es una VISTA sobre tres cosas que ya existen.
 *
 * 1. **Carpetas del Drive** (`DocumentFolder`). La raíz de un plan es
 *    `Libro TH/<titular>/<N° del plan>` y se ancla por la etiqueta de máquina
 *    `plan:<planId>`; cada subcarpeta, por `plan-carpeta:<clave>`. El camino se
 *    usa sólo para crearla y como respaldo si alguien borró la etiqueta (se
 *    re-etiqueta). Así el dueño puede renombrar o mover la carpeta en el Drive
 *    sin que esta sección cree otra.
 * 2. **La plantilla del negocio** = filas de ADR-427 (`CampoPersonalizado`):
 *    `tipo:"carpeta"` en `forestal.plan.documentos`, y los casilleros
 *    `tipo:"archivo"` dentro de `forestal.plan.documentos.<clave>`. Un casillero
 *    no tiene valor: sus papeles son los documentos de su carpeta con la
 *    etiqueta `campo:<campoId>`.
 * 3. **Vencimientos** = `Document.expiresAt`: el mismo dato que el filtro «Por
 *    vencer» y el cron de avisos del Drive (ADR-119). No hay un campo «Vence».
 *
 * ## El candado
 *
 * Toda escritura corre dentro de una transacción con
 * `pg_advisory_xact_lock(hashtext('plan-documentos:<tenantId>'))`. Es **por
 * negocio y no por plan** a propósito: `Libro TH` y la carpeta del titular son
 * COMPARTIDAS entre planes, y con un candado por plan dos planes del mismo
 * titular preparándose a la vez creaban dos `Libro TH` (nadie ve la carpeta que
 * el otro todavía no confirmó). Preparar pasa una vez por plan: serializar por
 * negocio no se nota.
 *
 * ## Permisos del Drive
 *
 * La raíz y CADA subcarpeta llevan `allowedRoles = admin/almacenero/owner`.
 * Desde el 04-10 el Drive mira la cadena entera de carpetas
 * (`canRoleSeeEnCadena`), pero se siguen poniendo en cada una para que el
 * candado se vea en la UI y nadie lo afloje moviendo una subcarpeta.
 */

type Db = Prisma.TransactionClient;

/** Quién ve los papeles en el Drive: los mismos que leen el plan. */
const ROLES_CARPETA: string[] = [...ROLES_LECTURA_DOCS_PLAN];
/** Tope de carpetas en la plantilla: una sección con 40 carpetas ya no ordena nada. */
const MAX_CARPETAS_PLANTILLA = 40;
/** Tope defensivo de documentos que arma la vista de UN plan. */
const MAX_DOCUMENTOS_VISTA = 2_000;
/** Por el pooler, desde local, cada consulta cuesta ~100 ms: preparar son ~20. */
const OPCIONES_TX = { maxWait: 15_000, timeout: 60_000 } as const;

export type CodigoErrorDocsPlan =
  | "plan_no_encontrado"
  | "carpeta_no_encontrada"
  | "carpeta_repetida"
  | "demasiadas_carpetas"
  | "documento_no_encontrado"
  | "documento_fuera_del_plan"
  | "campo_no_encontrado"
  | "nombre_invalido";

/** Un rechazo con su código y su status: la ruta lo devuelve tal cual. */
export class PlanDocumentosError extends Error {
  constructor(
    public readonly codigo: CodigoErrorDocsPlan,
    public readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "PlanDocumentosError";
  }
}

const planNoEncontrado = () =>
  new PlanDocumentosError("plan_no_encontrado", 404, "Ese plan de manejo no existe en este negocio.");

// ── Lecturas de base ────────────────────────────────────────────────────────

const SELECT_PLAN = {
  id: true,
  planType: true,
  planNumber: true,
  resolucionNumber: true,
  resolucionDate: true,
  titularName: true,
  representanteLegal: true,
  propietarioNombre: true,
  deletedAt: true,
} as const;
type PlanFila = Prisma.ForestPlanGetPayload<{ select: typeof SELECT_PLAN }> & PlanParaCarpeta;

/**
 * El plan, siempre con `tenantId` en el WHERE (un id de otro negocio no vuelve).
 * Para escribir se exige vivo: preparar carpetas de un plan dado de baja
 * dejaría carpetas nuevas colgando de algo que ya no está. Para leer no: los
 * papeles de un plan dado de baja se siguen pudiendo consultar.
 */
async function leerPlan(db: Db, tenantId: string, planId: string, vivo: boolean): Promise<PlanFila | null> {
  return db.forestPlan.findFirst({
    where: { id: planId, tenantId, ...(vivo ? { deletedAt: null } : {}) },
    select: SELECT_PLAN,
  });
}

const SELECT_PLANTILLA = {
  id: true,
  clave: true,
  nombre: true,
  soloParaRegistroId: true,
  orden: true,
  activo: true,
} as const;

/** Las carpetas de la plantilla ACTIVAS que aplican a este plan (permanentes + temporales suyas). */
async function leerPlantilla(db: Db, tenantId: string, planId: string) {
  return db.campoPersonalizado.findMany({
    where: {
      tenantId,
      formulario: FORMULARIO_CARPETAS_PLAN,
      tipo: TIPO_CARPETA,
      deletedAt: null,
      activo: true,
      OR: [{ soloParaRegistroId: null }, { soloParaRegistroId: planId }],
    },
    select: SELECT_PLANTILLA,
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    take: 200,
  });
}

const SELECT_CARPETA = { id: true, name: true, parentId: true, tags: true, allowedRoles: true } as const;
type CarpetaFila = Prisma.DocumentFolderGetPayload<{ select: typeof SELECT_CARPETA }>;

async function raizPorEtiqueta(db: Db, tenantId: string, planId: string): Promise<CarpetaFila | null> {
  return db.documentFolder.findFirst({
    where: { tenantId, tags: { has: tagRaizPlan(planId) } },
    select: SELECT_CARPETA,
    orderBy: { createdAt: "asc" },
  });
}

async function hijas(db: Db, tenantId: string, parentId: string | null): Promise<CarpetaFila[]> {
  return db.documentFolder.findMany({
    where: { tenantId, parentId },
    select: SELECT_CARPETA,
    orderBy: { createdAt: "asc" },
    take: 1_000,
  });
}

/**
 * Las hijas con ese nombre, comparado como `createFolderTree` (sin mayúsculas
 * ni espacios de borde). En JS y no con `mode:"insensitive"`: un titular con
 * `_` o `%` no puede convertirse en comodín.
 */
async function hijasPorNombre(db: Db, tenantId: string, parentId: string | null, nombre: string): Promise<CarpetaFila[]> {
  const buscado = nombre.trim().toLowerCase();
  return (await hijas(db, tenantId, parentId)).filter((f) => f.name.trim().toLowerCase() === buscado);
}

const esRaizDeOtroPlan = (f: CarpetaFila, planId: string): boolean =>
  f.tags.some((t) => t.startsWith("plan:") && t !== tagRaizPlan(planId));

// ── Escrituras del Drive (siempre dentro del candado) ───────────────────────

async function crearCarpetaDrive(
  db: Db,
  tenantId: string,
  parentId: string | null,
  nombre: string,
  tags: string[],
): Promise<CarpetaFila> {
  return db.documentFolder.create({
    data: { tenantId, parentId, name: nombre, tags, allowedRoles: ROLES_CARPETA },
    select: SELECT_CARPETA,
  });
}

/**
 * Roles de una carpeta ADOPTADA: los del plan, sin abrir nunca más de lo que
 * el dueño ya había cerrado. Sin roles → los del plan. Con roles → sólo los
 * que están en los dos (el dueño la había cerrado a «admin»: sigue «admin»;
 * la había abierto a «cajero»: el cajero sale, porque los papeles del plan
 * no los lee). Si no queda ninguno, los privilegiados del plan: una lista
 * vacía significaría «la ven todos» (revisión de seguridad 04-10: antes una
 * carpeta con roles propios se adoptaba tal cual, cajero incluido).
 */
export function rolesDeCarpetaAdoptada(actuales: readonly string[]): string[] {
  if (actuales.length === 0) return [...ROLES_CARPETA];
  const comunes = actuales.filter((r) => ROLES_CARPETA.includes(r));
  return comunes.length > 0 ? comunes : ROLES_CARPETA.filter((r) => isPrivilegedRole(r));
}

const mismosRoles = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

/** Le pone la etiqueta (si no la tiene) y los roles del plan (`rolesDeCarpetaAdoptada`). */
async function etiquetar(db: Db, tenantId: string, carpeta: CarpetaFila, tag: string): Promise<CarpetaFila> {
  const tags = carpeta.tags.includes(tag) ? carpeta.tags : [...carpeta.tags, tag];
  const calculados = rolesDeCarpetaAdoptada(carpeta.allowedRoles);
  const allowedRoles = mismosRoles(calculados, carpeta.allowedRoles) ? carpeta.allowedRoles : calculados;
  if (tags === carpeta.tags && allowedRoles === carpeta.allowedRoles) return carpeta;
  await db.documentFolder.updateMany({ where: { id: carpeta.id, tenantId }, data: { tags, allowedRoles } });
  return { ...carpeta, tags, allowedRoles };
}

/**
 * La raíz del plan: por etiqueta; si no, por camino (y se re-etiqueta); si no,
 * se crea lo que falte de `Libro TH/<titular>/<N°>`.
 *
 * Una carpeta con el mismo camino que ya es raíz de OTRO plan (mismo titular y
 * mismo N°, o dos planes sin N°) no se adopta: se crea una hermana con el final
 * del id, porque juntar los papeles de dos planes es justo lo que no se puede.
 */
async function asegurarRaiz(db: Db, tenantId: string, plan: PlanFila): Promise<{ raiz: CarpetaFila; creadas: number }> {
  const ya = await raizPorEtiqueta(db, tenantId, plan.id);
  if (ya) return { raiz: ya, creadas: 0 };

  const [nLibro, nTitular, nPlan] = rutaPropuestaDelPlan(plan);
  let creadas = 0;
  let libro = (await hijasPorNombre(db, tenantId, null, nLibro))[0];
  if (!libro) {
    libro = await crearCarpetaDrive(db, tenantId, null, nLibro, []);
    creadas++;
  }
  let titular = (await hijasPorNombre(db, tenantId, libro.id, nTitular))[0];
  if (!titular) {
    titular = await crearCarpetaDrive(db, tenantId, libro.id, nTitular, []);
    creadas++;
  }
  for (const nombre of [nPlan, nombreCarpetaDesambiguada(plan)]) {
    const candidatas = await hijasPorNombre(db, tenantId, titular.id, nombre);
    const libre = candidatas.find((c) => !esRaizDeOtroPlan(c, plan.id));
    if (libre) return { raiz: await etiquetar(db, tenantId, libre, tagRaizPlan(plan.id)), creadas };
    if (candidatas.length === 0) {
      const raiz = await crearCarpetaDrive(db, tenantId, titular.id, nombre, [tagRaizPlan(plan.id)]);
      return { raiz, creadas: creadas + 1 };
    }
  }
  // Las dos variantes ya son de otros planes: el id entero no se repite.
  const raiz = await crearCarpetaDrive(db, tenantId, titular.id, segmentoDeCarpeta(`${nPlan.slice(0, 50)} · ${plan.id}`), [
    tagRaizPlan(plan.id),
  ]);
  return { raiz, creadas: creadas + 1 };
}

/**
 * Una subcarpeta por carpeta de la plantilla. Se reconoce por su etiqueta; si
 * falta, se adopta una hija sin etiqueta con el mismo nombre (alguien borró la
 * etiqueta, o la creó a mano con ese nombre) y recién si no hay, se crea.
 */
async function asegurarSubcarpetas(
  db: Db,
  tenantId: string,
  raiz: CarpetaFila,
  plantilla: readonly { clave: string; nombre: string }[],
): Promise<number> {
  const actuales = await hijas(db, tenantId, raiz.id);
  let creadas = 0;
  for (const t of plantilla) {
    const tag = tagCarpetaPlan(t.clave);
    if (actuales.some((h) => h.tags.includes(tag))) continue;
    const nombre = segmentoDeCarpeta(t.nombre) || t.clave;
    const i = actuales.findIndex(
      (h) => claveDeEtiquetas(h.tags) == null && h.name.trim().toLowerCase() === nombre.toLowerCase(),
    );
    if (i >= 0) {
      actuales[i] = await etiquetar(db, tenantId, actuales[i], tag);
      continue;
    }
    actuales.push(await crearCarpetaDrive(db, tenantId, raiz.id, nombre, [tag]));
    creadas++;
  }
  return creadas;
}

/**
 * La semilla (4 carpetas + sus casilleros), UNA vez por negocio: si ya hay
 * cualquier fila de la plantilla —aunque esté dada de baja— el negocio ya la
 * tuvo y lo que borró se queda borrado. `skipDuplicates` por si un casillero
 * con esa clave ya existiera (el índice único parcial lo resuelve en la base).
 */
async function sembrarSiHaceFalta(db: Db, tenantId: string, usuario: string): Promise<number> {
  const ya = await db.campoPersonalizado.count({ where: { tenantId, formulario: FORMULARIO_CARPETAS_PLAN } });
  if (ya > 0) return 0;
  const r = await db.campoPersonalizado.createMany({
    data: filasDeSemilla().map((f) => ({
      ...f,
      tenantId,
      opciones: [],
      soloParaRegistroId: null,
      createdBy: usuario,
    })),
    skipDuplicates: true,
  });
  return r.count;
}

/** Deja la raíz y todas las subcarpetas de la plantilla en su lugar. */
async function asegurarEstructura(
  db: Db,
  tenantId: string,
  plan: PlanFila,
): Promise<{ raiz: CarpetaFila; creadas: number }> {
  const { raiz, creadas } = await asegurarRaiz(db, tenantId, plan);
  const plantilla = await leerPlantilla(db, tenantId, plan.id);
  const sub = await asegurarSubcarpetas(db, tenantId, raiz, plantilla);
  return { raiz, creadas: creadas + sub };
}

function conCandado<T>(tenantId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan-documentos:${tenantId}`}))`;
    return fn(tx);
  }, OPCIONES_TX);
}

function auditar(tenantId: string, action: string, detail: string, planId: string, usuario: string): void {
  logActivity(action, "ForestPlan", detail, planId, usuario || "unknown", undefined, tenantId).catch((err: unknown) =>
    logger.error("[plan-documentos] no se pudo auditar", { error: String(err), action, tenantId }),
  );
}

/** El camino real de la raíz en el Drive (el dueño pudo moverla), hasta 8 niveles. */
async function rutaDe(tenantId: string, carpeta: CarpetaFila): Promise<string> {
  const nombres = [carpeta.name];
  let padreId = carpeta.parentId;
  for (let i = 0; padreId && i < 8; i++) {
    const padre: { name: string; parentId: string | null } | null = await prisma.documentFolder.findFirst({
      where: { id: padreId, tenantId },
      select: { name: true, parentId: true },
    });
    if (!padre) break;
    nombres.unshift(padre.name);
    padreId = padre.parentId;
  }
  return nombres.join("/");
}

/** Siguiente `orden` de la plantilla: al final de lo que ya hay. */
async function siguienteOrden(db: Db, tenantId: string): Promise<number> {
  const r = await db.campoPersonalizado.aggregate({
    where: { tenantId, formulario: FORMULARIO_CARPETAS_PLAN, deletedAt: null },
    _max: { orden: true },
  });
  return (r._max.orden ?? 0) + 1;
}

async function controlarTope(db: Db, tenantId: string): Promise<void> {
  const cuantas = await db.campoPersonalizado.count({
    where: { tenantId, formulario: FORMULARIO_CARPETAS_PLAN, tipo: TIPO_CARPETA, deletedAt: null },
  });
  if (cuantas >= MAX_CARPETAS_PLANTILLA) {
    throw new PlanDocumentosError(
      "demasiadas_carpetas",
      409,
      `Ya hay ${cuantas} carpetas en los documentos del plan, que es el máximo. Apaga alguna antes de crear otra.`,
    );
  }
}

// ── API ─────────────────────────────────────────────────────────────────────

export const ForestPlanDocumentosDB = {
  /**
   * La sección entera de un plan: carpetas (de la plantilla + las hechas a mano
   * en el Drive), casilleros con su estado y «lo que falta».
   *
   * Sólo lee: un plan sin preparar vuelve con `preparada:false` y las carpetas
   * de la plantilla con `folderId:null`. `null` = el plan no es de este negocio.
   */
  async vista(tenantId: string, planId: string): Promise<PlanDocumentosVista | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const plan = await leerPlan(prisma, tenantId, planId, false);
    if (!plan) return null;

    const [plantilla, raiz] = await Promise.all([
      leerPlantilla(prisma, tenantId, plan.id),
      raizPorEtiqueta(prisma, tenantId, plan.id),
    ]);
    const carpetasDrive = raiz ? await hijas(prisma, tenantId, raiz.id) : [];
    const claves = [
      ...new Set([
        ...plantilla.map((t) => t.clave),
        ...carpetasDrive.map((f) => claveDeEtiquetas(f.tags)).filter((c): c is string => Boolean(c)),
      ]),
    ];
    const ids = carpetasDrive.map((f) => f.id);

    const [camposRaw, documentos, nietas] = await Promise.all([
      claves.length === 0
        ? Promise.resolve([])
        : prisma.campoPersonalizado.findMany({
            where: {
              tenantId,
              formulario: { in: claves.map(formularioDeCarpeta) },
              tipo: TIPO_ARCHIVO,
              deletedAt: null,
              activo: true,
              OR: [{ soloParaRegistroId: null }, { soloParaRegistroId: plan.id }],
            },
            select: {
              id: true,
              formulario: true,
              clave: true,
              nombre: true,
              descripcion: true,
              opciones: true,
              soloParaRegistroId: true,
              orden: true,
              activo: true,
            },
            take: 500,
          }),
      ids.length === 0
        ? Promise.resolve([])
        : prisma.document.findMany({
            where: { tenantId, deletedAt: null, folderId: { in: ids } },
            select: {
              id: true,
              name: true,
              mimeType: true,
              size: true,
              expiresAt: true,
              uploadedAt: true,
              folderId: true,
              tags: true,
            },
            orderBy: { uploadedAt: "desc" },
            take: MAX_DOCUMENTOS_VISTA,
          }),
      ids.length === 0
        ? Promise.resolve([])
        : prisma.documentFolder.findMany({
            where: { tenantId, parentId: { in: ids } },
            select: { parentId: true },
          }),
    ]);

    const camposArchivo: CampoArchivoFila[] = camposRaw.map((c) => ({ ...c, tipo: TIPO_ARCHIVO }));
    const subcarpetasPorCarpeta = new Map<string, number>();
    for (const n of nietas) {
      if (n.parentId) subcarpetasPorCarpeta.set(n.parentId, (subcarpetasPorCarpeta.get(n.parentId) ?? 0) + 1);
    }
    const carpetas = armarCarpetas({
      planId: plan.id,
      hoy: limaDateKey(),
      plantilla,
      camposArchivo,
      carpetasDrive,
      documentos,
      subcarpetasPorCarpeta,
    });

    return {
      planId: plan.id,
      planType: plan.planType,
      carpetaRaizId: raiz?.id ?? null,
      rutaRaiz: raiz ? await rutaDe(tenantId, raiz) : rutaPropuestaDelPlan(plan).join("/"),
      preparada: raiz != null,
      carpetas,
      resumen: resumirCarpetas(carpetas),
      delPlan: {
        resolucionNumber: plan.resolucionNumber,
        // Date-only: el día guardado, sin pasarlo por la hora de Lima.
        resolucionDate: plan.resolucionDate ? plan.resolucionDate.toISOString().slice(0, 10) : null,
        representanteLegal: plan.representanteLegal,
        propietarioNombre: plan.propietarioNombre,
      },
    };
  },

  /**
   * Deja lista la carpeta del plan en el Drive: siembra la plantilla la primera
   * vez del negocio, crea (o re-etiqueta) la raíz y una subcarpeta por carpeta
   * de la plantilla. Idempotente: llamarlo dos veces —o dos a la vez— deja UNA
   * raíz.
   */
  async preparar(tenantId: string, planId: string, usuario: string): Promise<PlanDocumentosVista> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await conCandado(tenantId, async (tx) => {
      const plan = await leerPlan(tx, tenantId, planId, true);
      if (!plan) throw planNoEncontrado();
      const sembradas = await sembrarSiHaceFalta(tx, tenantId, usuario);
      const { creadas } = await asegurarEstructura(tx, tenantId, plan);
      return { plan, sembradas, creadas };
    });
    if (r.sembradas > 0) invalidarCamposPersonalizados(tenantId);
    if (r.sembradas > 0 || r.creadas > 0) {
      auditar(
        tenantId,
        "plan_documentos_preparar",
        `Preparó los documentos del plan ${r.plan.planType} ${r.plan.planNumber ?? "(sin N°)"}: ` +
          `${r.creadas} carpeta(s) nuevas en el Drive` +
          (r.sembradas > 0 ? ` y la plantilla sugerida (${r.sembradas} filas)` : ""),
        r.plan.id,
        usuario,
      );
    }
    return (await ForestPlanDocumentosDB.vista(tenantId, planId)) as PlanDocumentosVista;
  },

  /**
   * Una carpeta nueva: entra a la plantilla (todos los planes) o sólo a este
   * plan, y se crea en el Drive de este plan. Si ya había una APAGADA con ese
   * nombre y el mismo alcance, se vuelve a encender en vez de chocar.
   */
  async crearCarpeta(tenantId: string, input: CarpetaNuevaInput, usuario: string): Promise<PlanDocumentosVista> {
    if (!tenantId) throw new Error("tenantId is required");
    const nombre = input.nombre.trim();
    const clave = claveDeCarpeta(nombre);
    if (!clave) {
      throw new PlanDocumentosError("nombre_invalido", 400, "Ese nombre no deja ninguna letra ni número para la carpeta.");
    }
    const plan = await conCandado(tenantId, async (tx) => {
      const p = await leerPlan(tx, tenantId, input.planId, true);
      if (!p) throw planNoEncontrado();
      await sembrarSiHaceFalta(tx, tenantId, usuario);
      const soloPara = input.paraTodosLosPlanes ? null : p.id;
      const mismas = await tx.campoPersonalizado.findMany({
        where: { tenantId, formulario: FORMULARIO_CARPETAS_PLAN, clave, deletedAt: null },
        select: { id: true, nombre: true, activo: true, soloParaRegistroId: true },
      });
      /* Choca con lo que se vería en ESTE plan; si es para todos, además con la
         carpeta sólo-de-otro-plan del mismo nombre (ese plan vería dos). */
      const choca = input.paraTodosLosPlanes
        ? mismas
        : mismas.filter((m) => m.soloParaRegistroId == null || m.soloParaRegistroId === p.id);
      const apagada = choca.length === 1 && !choca[0].activo && choca[0].soloParaRegistroId === soloPara ? choca[0] : null;
      if (apagada) {
        await tx.campoPersonalizado.updateMany({
          where: { id: apagada.id, tenantId, deletedAt: null },
          data: { activo: true, nombre },
        });
      } else if (choca.length > 0) {
        throw new PlanDocumentosError(
          "carpeta_repetida",
          409,
          `Ya hay una carpeta «${choca[0].nombre}»` +
            (choca[0].soloParaRegistroId && choca[0].soloParaRegistroId !== p.id ? " en otro plan" : "") +
            ". Ponle otro nombre.",
        );
      } else {
        await controlarTope(tx, tenantId);
        await tx.campoPersonalizado.create({
          data: {
            tenantId,
            formulario: FORMULARIO_CARPETAS_PLAN,
            clave,
            nombre,
            descripcion: null,
            tipo: TIPO_CARPETA,
            opciones: [],
            soloParaRegistroId: soloPara,
            orden: await siguienteOrden(tx, tenantId),
            createdBy: usuario,
          },
          select: { id: true },
        });
      }
      await asegurarEstructura(tx, tenantId, p);
      return p;
    });
    invalidarCamposPersonalizados(tenantId);
    auditar(
      tenantId,
      "plan_documentos_carpeta_crear",
      `Creó la carpeta «${nombre}» en los documentos del plan ${plan.planNumber ?? plan.id}` +
        (input.paraTodosLosPlanes ? " (para todos los planes)" : " (sólo este plan)"),
      plan.id,
      usuario,
    );
    return (await ForestPlanDocumentosDB.vista(tenantId, plan.id)) as PlanDocumentosVista;
  },

  /**
   * Renombra la carpeta de ESTE plan en el Drive (y la plantilla sólo si la
   * carpeta es de este plan nomás) o le cambia el orden. El orden vive en la
   * plantilla: mover una carpeta que es de todos los planes la mueve en todos.
   *
   * `clave` = la de la plantilla, o `carpeta-<folderId>` para una carpeta hecha
   * a mano en el Drive que todavía no se adoptó.
   */
  async editarCarpeta(tenantId: string, input: CarpetaEditarInput, usuario: string): Promise<PlanDocumentosVista> {
    if (!tenantId) throw new Error("tenantId is required");
    const plan = await conCandado(tenantId, async (tx) => {
      const p = await leerPlan(tx, tenantId, input.planId, true);
      if (!p) throw planNoEncontrado();
      const noEsta = () =>
        new PlanDocumentosError("carpeta_no_encontrada", 404, "Esa carpeta no está en los documentos de este plan.");

      let carpeta: CarpetaFila | null = null;
      let plantilla: { id: string; soloParaRegistroId: string | null } | null = null;
      let raiz: CarpetaFila;
      const suelta = folderIdDeClaveSuelta(input.clave);
      if (suelta) {
        const r = await raizPorEtiqueta(tx, tenantId, p.id);
        if (!r) throw noEsta();
        raiz = r;
        carpeta = await tx.documentFolder.findFirst({
          where: { id: suelta, tenantId, parentId: raiz.id },
          select: SELECT_CARPETA,
        });
      } else {
        plantilla = await tx.campoPersonalizado.findFirst({
          where: {
            tenantId,
            formulario: FORMULARIO_CARPETAS_PLAN,
            tipo: TIPO_CARPETA,
            clave: input.clave,
            deletedAt: null,
            activo: true,
            OR: [{ soloParaRegistroId: null }, { soloParaRegistroId: p.id }],
          },
          select: { id: true, soloParaRegistroId: true },
        });
        if (!plantilla) throw noEsta();
        raiz = (await asegurarEstructura(tx, tenantId, p)).raiz;
        const tag = tagCarpetaPlan(input.clave);
        carpeta = (await hijas(tx, tenantId, raiz.id)).find((h) => h.tags.includes(tag)) ?? null;
      }
      if (!carpeta) throw noEsta();

      if (input.nombre !== undefined) {
        const nombreDrive = segmentoDeCarpeta(input.nombre);
        if (!nombreDrive) {
          throw new PlanDocumentosError("nombre_invalido", 400, "Ese nombre queda vacío en el Drive: usa letras o números.");
        }
        const id = carpeta.id;
        const repetida = (await hijasPorNombre(tx, tenantId, raiz.id, nombreDrive)).some((h) => h.id !== id);
        if (repetida) {
          throw new PlanDocumentosError("carpeta_repetida", 409, `Este plan ya tiene una carpeta «${nombreDrive}».`);
        }
        await tx.documentFolder.updateMany({ where: { id, tenantId }, data: { name: nombreDrive } });
        if (plantilla && plantilla.soloParaRegistroId === p.id) {
          await tx.campoPersonalizado.updateMany({
            where: { id: plantilla.id, tenantId, deletedAt: null },
            data: { nombre: input.nombre.trim() },
          });
        }
      }
      if (input.orden !== undefined) {
        if (!plantilla) {
          throw new PlanDocumentosError(
            "carpeta_no_encontrada",
            409,
            "Esta carpeta se hizo a mano en el Drive: adóptala primero para poder ordenarla.",
          );
        }
        await tx.campoPersonalizado.updateMany({
          where: { id: plantilla.id, tenantId, deletedAt: null },
          data: { orden: input.orden },
        });
      }
      return p;
    });
    invalidarCamposPersonalizados(tenantId);
    auditar(
      tenantId,
      "plan_documentos_carpeta_editar",
      `Editó la carpeta ${input.clave} de los documentos del plan ${plan.planNumber ?? plan.id}: ` +
        [input.nombre !== undefined ? `nombre «${input.nombre.trim()}»` : "", input.orden !== undefined ? `orden ${input.orden}` : ""]
          .filter(Boolean)
          .join(", "),
      plan.id,
      usuario,
    );
    return (await ForestPlanDocumentosDB.vista(tenantId, plan.id)) as PlanDocumentosVista;
  },

  /**
   * Adopta una subcarpeta hecha a mano en el Drive dentro de la raíz del plan:
   * le da clave (la de su etiqueta si ya tenía, o la de su nombre) y la suma a
   * la plantilla —de todos los planes o sólo de éste—. Si la clave ya está en
   * la plantilla, la carpeta pasa a ser la de esa clave (o se reenciende, si
   * estaba apagada).
   */
  async adoptarCarpeta(tenantId: string, input: AdoptarCarpetaInput, usuario: string): Promise<PlanDocumentosVista> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await conCandado(tenantId, async (tx) => {
      const p = await leerPlan(tx, tenantId, input.planId, true);
      if (!p) throw planNoEncontrado();
      const raiz = await raizPorEtiqueta(tx, tenantId, p.id);
      const carpeta = raiz
        ? await tx.documentFolder.findFirst({
            where: { id: input.folderId, tenantId, parentId: raiz.id },
            select: SELECT_CARPETA,
          })
        : null;
      if (!raiz || !carpeta) {
        throw new PlanDocumentosError(
          "carpeta_no_encontrada",
          404,
          "Esa carpeta no está dentro de la carpeta de este plan en el Drive.",
        );
      }
      const clave = claveDeEtiquetas(carpeta.tags) ?? claveDeCarpeta(carpeta.name);
      if (!clave) {
        throw new PlanDocumentosError("nombre_invalido", 400, "El nombre de esa carpeta no deja ninguna letra ni número.");
      }
      const tag = tagCarpetaPlan(clave);
      const otra = (await hijas(tx, tenantId, raiz.id)).find((h) => h.id !== carpeta.id && h.tags.includes(tag));
      if (otra) {
        throw new PlanDocumentosError(
          "carpeta_repetida",
          409,
          `Este plan ya tiene la carpeta «${otra.name}» para eso. Cambia el nombre de una de las dos.`,
        );
      }
      const mismas = await tx.campoPersonalizado.findMany({
        where: { tenantId, formulario: FORMULARIO_CARPETAS_PLAN, clave, deletedAt: null },
        select: { id: true, activo: true, soloParaRegistroId: true, nombre: true },
      });
      const aplica = mismas.find((m) => m.soloParaRegistroId == null || m.soloParaRegistroId === p.id);
      if (aplica) {
        if (!aplica.activo) {
          await tx.campoPersonalizado.updateMany({
            where: { id: aplica.id, tenantId, deletedAt: null },
            data: { activo: true },
          });
        }
      } else if (input.paraTodosLosPlanes && mismas.length > 0) {
        throw new PlanDocumentosError(
          "carpeta_repetida",
          409,
          `Otro plan ya tiene una carpeta «${mismas[0].nombre}» sólo para él. Adóptala sólo para este plan o cambia el nombre.`,
        );
      } else {
        await controlarTope(tx, tenantId);
        await tx.campoPersonalizado.create({
          data: {
            tenantId,
            formulario: FORMULARIO_CARPETAS_PLAN,
            clave,
            nombre: carpeta.name,
            descripcion: null,
            tipo: TIPO_CARPETA,
            opciones: [],
            soloParaRegistroId: input.paraTodosLosPlanes ? null : p.id,
            orden: await siguienteOrden(tx, tenantId),
            createdBy: usuario,
          },
          select: { id: true },
        });
      }
      await etiquetar(tx, tenantId, carpeta, tag);
      return { plan: p, nombre: carpeta.name, clave };
    });
    invalidarCamposPersonalizados(tenantId);
    auditar(
      tenantId,
      "plan_documentos_carpeta_adoptar",
      `Adoptó la carpeta «${r.nombre}» (${r.clave}) en los documentos del plan ${r.plan.planNumber ?? r.plan.id}`,
      r.plan.id,
      usuario,
    );
    return (await ForestPlanDocumentosDB.vista(tenantId, r.plan.id)) as PlanDocumentosVista;
  },

  /**
   * Edita una carpeta de la PLANTILLA (nombre, orden, encendida/apagada).
   * Apagar la saca de la plantilla, nunca borra la carpeta del Drive. Con
   * `renombrarEnPlanes`, el nombre nuevo se aplica también a las carpetas ya
   * creadas en los planes — por etiqueta, no por nombre.
   */
  async editarPlantillaCarpeta(
    tenantId: string,
    input: PlantillaCarpetaPatchInput,
    usuario: string,
  ): Promise<{ id: string; clave: string; nombre: string; orden: number; activo: boolean; renombradas: number } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await conCandado(tenantId, async (tx) => {
      const fila = await tx.campoPersonalizado.findFirst({
        where: { id: input.id, tenantId, formulario: FORMULARIO_CARPETAS_PLAN, tipo: TIPO_CARPETA, deletedAt: null },
        select: SELECT_PLANTILLA,
      });
      if (!fila) return null;
      const data: Prisma.CampoPersonalizadoUpdateManyMutationInput = {};
      if (input.nombre !== undefined) data.nombre = input.nombre.trim();
      if (input.orden !== undefined) data.orden = input.orden;
      if (input.activo !== undefined) data.activo = input.activo;
      if (Object.keys(data).length > 0) {
        await tx.campoPersonalizado.updateMany({ where: { id: fila.id, tenantId, deletedAt: null }, data });
      }

      let renombradas = 0;
      const nombreDrive = input.nombre !== undefined ? segmentoDeCarpeta(input.nombre) : "";
      if (input.renombrarEnPlanes && nombreDrive) {
        const etiquetadas = await tx.documentFolder.findMany({
          where: { tenantId, tags: { has: tagCarpetaPlan(fila.clave) } },
          select: { id: true, parentId: true },
          take: 2_000,
        });
        const padres = await tx.documentFolder.findMany({
          where: { tenantId, id: { in: [...new Set(etiquetadas.map((e) => e.parentId).filter((x): x is string => Boolean(x)))] } },
          select: { id: true, tags: true },
        });
        /* Sólo las que cuelgan de la raíz de un plan (y, si la carpeta es de un
           plan nomás, de la raíz de ESE plan). */
        const raices = new Set(
          padres
            .filter((pd) =>
              fila.soloParaRegistroId
                ? pd.tags.includes(tagRaizPlan(fila.soloParaRegistroId))
                : pd.tags.some((t) => t.startsWith("plan:")),
            )
            .map((pd) => pd.id),
        );
        const ids = etiquetadas.filter((e) => e.parentId && raices.has(e.parentId)).map((e) => e.id);
        if (ids.length > 0) {
          renombradas = (
            await tx.documentFolder.updateMany({ where: { tenantId, id: { in: ids } }, data: { name: nombreDrive } })
          ).count;
        }
      }
      return {
        id: fila.id,
        clave: fila.clave,
        nombre: input.nombre?.trim() ?? fila.nombre,
        orden: input.orden ?? fila.orden,
        activo: input.activo ?? fila.activo,
        renombradas,
      };
    });
    if (!r) return null;
    invalidarCamposPersonalizados(tenantId);
    auditar(
      tenantId,
      "plan_documentos_plantilla_editar",
      `Editó la carpeta «${r.nombre}» de la plantilla de documentos del plan` +
        (input.activo === false ? " (apagada)" : input.activo === true ? " (encendida)" : "") +
        (r.renombradas > 0 ? ` y la renombró en ${r.renombradas} plan(es)` : ""),
      r.id,
      usuario,
    );
    return r;
  },

  /**
   * Mete un documento en un casillero (etiqueta `campo:<id>`) o lo saca
   * (`campoId: null` → queda suelto en su carpeta). Un documento está en UN
   * casillero: se le quitan los `campo:` que tuviera. Si el casillero es de otra
   * carpeta del plan, el documento se MUEVE ahí — la vista busca los papeles de
   * un casillero en la carpeta del casillero.
   *
   * El documento tiene que estar ya en la carpeta del plan (en la raíz o en una
   * subcarpeta directa): esto no trae papeles de otro lado del Drive.
   */
  async vincularArchivo(tenantId: string, input: VincularArchivoInput, usuario: string): Promise<PlanDocumentosVista> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await conCandado(tenantId, async (tx) => {
      const p = await leerPlan(tx, tenantId, input.planId, true);
      if (!p) throw planNoEncontrado();
      const doc = await tx.document.findFirst({
        where: { id: input.documentId, tenantId, deletedAt: null },
        select: { id: true, name: true, folderId: true, tags: true },
      });
      if (!doc) {
        throw new PlanDocumentosError("documento_no_encontrado", 404, "Ese archivo no existe (o está en la papelera).");
      }
      const raiz = await raizPorEtiqueta(tx, tenantId, p.id);
      let carpetas = raiz ? await hijas(tx, tenantId, raiz.id) : [];
      const enElPlan = raiz != null && (doc.folderId === raiz.id || carpetas.some((c) => c.id === doc.folderId));
      if (!raiz || !enElPlan) {
        throw new PlanDocumentosError(
          "documento_fuera_del_plan",
          409,
          "Ese archivo no está en la carpeta de este plan. Súbelo desde la sección o muévelo ahí en Documentos.",
        );
      }

      let destino = doc.folderId;
      if (input.campoId) {
        const campo = await tx.campoPersonalizado.findFirst({
          where: {
            id: input.campoId,
            tenantId,
            tipo: TIPO_ARCHIVO,
            deletedAt: null,
            activo: true,
            formulario: { startsWith: PREFIJO_FORMULARIO_CARPETA },
            OR: [{ soloParaRegistroId: null }, { soloParaRegistroId: p.id }],
          },
          select: { id: true, formulario: true },
        });
        if (!campo) {
          throw new PlanDocumentosError("campo_no_encontrado", 404, "Ese casillero no existe en los documentos de este plan.");
        }
        const tag = tagCarpetaPlan(campo.formulario.slice(PREFIJO_FORMULARIO_CARPETA.length));
        let carpeta = carpetas.find((c) => c.tags.includes(tag));
        if (!carpeta) {
          // La carpeta del casillero todavía no está en el Drive: se crea.
          await asegurarEstructura(tx, tenantId, p);
          carpetas = await hijas(tx, tenantId, raiz.id);
          carpeta = carpetas.find((c) => c.tags.includes(tag));
        }
        if (!carpeta) {
          throw new PlanDocumentosError(
            "carpeta_no_encontrada",
            409,
            "La carpeta de ese casillero está apagada en la plantilla: enciéndela primero.",
          );
        }
        destino = carpeta.id;
      }
      const tags = [...doc.tags.filter((t) => !t.startsWith("campo:")), ...(input.campoId ? [tagCampo(input.campoId)] : [])];
      await tx.document.updateMany({
        where: { id: doc.id, tenantId, deletedAt: null },
        data: { tags, folderId: destino },
      });
      return { plan: p, doc, destino };
    });
    DocumentsDB.log(tenantId, {
      documentId: r.doc.id,
      actorId: usuario,
      action: r.destino !== r.doc.folderId ? "move" : "tag",
      metadata: {
        origen: "plan-documentos",
        planId: r.plan.id,
        campoId: input.campoId,
        folderAntes: r.doc.folderId,
        folderDespues: r.destino,
      },
    }).catch((err: unknown) =>
      logger.error("[plan-documentos] no se pudo auditar el documento", { error: String(err), tenantId }),
    );
    return (await ForestPlanDocumentosDB.vista(tenantId, r.plan.id)) as PlanDocumentosVista;
  },
};
