import "server-only";
import { logger } from "@/lib/logger";
import {
  DocumentsDB,
  type CarpetaParaRecrear,
  type DatosParaOrdenar,
  type PapelDeOrdenar,
} from "@/lib/db/documents.db";
import { contenidoIdentico } from "@/lib/documents/contenido-identico";
import { isPrivilegedRole, ROL_CANDADO_DUENO, veTodoElDrive } from "@/lib/documents/doc-access";
import {
  planOrdenar,
  type EntradaOrden,
  type PapelParaOrdenar,
  type PistasDelPapel,
  type PlanOrden,
  type Propuesta,
} from "@/lib/documentos/ordenar-archivo";

/**
 * «Ordenar mi Archivo», lado servidor: arma la entrada de `planOrdenar` con los
 * datos de la base y aplica SÓLO lo que el plan recalculado acá propone (el
 * cliente manda ids, nunca nombres ni carpetas). El «Deshacer» sí trae datos
 * del cliente: se revisan con los permisos de hoy (ver `deshacerOrden`).
 */

/** Repetidos a mirar por pedido: cada uno es bajar el archivo entero. */
const TOPE_GRUPOS = 20;
const TOPE_ARCHIVOS = 60;

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** De dónde sacar un nombre: lo que ya guardó el análisis (sin IA nueva). */
function pistasDe(meta: Record<string, unknown> | null): PistasDelPapel | null {
  if (!meta) return null;
  const s = objeto(meta.structured);
  return {
    descripcionUsuario: texto(meta.descripcionUsuario),
    resumen: texto(meta.description) ?? texto(meta.summary),
    tipo: texto(s.docType),
    numero: texto(s.numero),
    emisor: texto(s.razonSocial),
  };
}

function sugerenciaDe(meta: Record<string, unknown> | null): PapelParaOrdenar["sugerencia"] {
  const s = objeto(meta?.sugerencias);
  const folderId = texto(s.folderId);
  const expiresAt = texto(s.expiresAt);
  return folderId || expiresAt ? { folderId, expiresAt } : null;
}

/** Atado a algo (casillero de la GTF, permiso, colaborador, cliente, enlace): nunca a la papelera. */
function estaProtegido(p: PapelDeOrdenar): boolean {
  return p.atado || p.compartido || p.tags.some((t) => t.includes(":"));
}

export function entradaDesdeDatos(
  d: DatosParaOrdenar,
  extra: Pick<EntradaOrden, "identicos" | "descartadas" | "ahora"> = {},
): EntradaOrden {
  return {
    papeles: d.papeles.map((p) => ({
      id: p.id,
      name: p.name,
      size: p.size,
      folderId: p.folderId,
      uploadedAt: p.uploadedAt,
      tocable: p.ve,
      movible: p.movible,
      protegido: estaProtegido(p),
      tieneVencimiento: !!p.expiresAt,
      pistas: pistasDe(p.ocrMetadata),
      sugerencia: sugerenciaDe(p.ocrMetadata),
      puerta: p.puerta,
    })),
    carpetas: d.carpetas.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      documentos: c.documentos,
      subcarpetas: c.subcarpetas,
      creadaEn: c.creadaEn,
      visible: c.ve,
      borrable: c.borrable,
      compartida: c.compartida,
      sacable: c.sacable,
    })),
    ...extra,
  };
}

/**
 * Repetidos de verdad: candidatos por peso + nombre (`gruposDuplicados`, lo
 * mismo que la vista «Repetidos») y después el contenido byte a byte.
 * `soloCon` limita a los grupos que traen alguno de esos ids (al aplicar).
 */
async function identicosDe(tenantId: string, role: string, soloCon?: ReadonlySet<string>): Promise<string[][]> {
  const grupos = await DocumentsDB.gruposDuplicados(tenantId, { viewerRole: role });
  const elegidos: string[][] = [];
  let archivos = 0;
  for (const g of grupos) {
    const ids = g.docs.map((x) => x.id);
    if (soloCon && !ids.some((id) => soloCon.has(id))) continue;
    if (elegidos.length >= TOPE_GRUPOS) break;
    // Un grupo grande que no entra no corta la búsqueda: los chicos de atrás sí.
    if (archivos + ids.length > TOPE_ARCHIVOS) continue;
    elegidos.push(ids);
    archivos += ids.length;
  }
  if (elegidos.length === 0) return [];
  const { identicos } = await contenidoIdentico(tenantId, elegidos.flat(), role);
  return identicos;
}

export interface OpcionesPlan {
  duplicados?: boolean;
  descartadas?: string[];
  /** Al aplicar: sólo hace falta mirar los repetidos de estos papeles. */
  repetidosDe?: ReadonlySet<string>;
}

export async function armarPlan(tenantId: string, role: string, o: OpcionesPlan = {}): Promise<PlanOrden> {
  const [datos, identicos] = await Promise.all([
    DocumentsDB.datosParaOrdenar(tenantId, role),
    o.duplicados ? identicosDe(tenantId, role, o.repetidosDe) : Promise.resolve([]),
  ]);
  return planOrdenar(entradaDesdeDatos(datos, { identicos, descartadas: new Set(o.descartadas ?? []) }));
}

// ── Aplicar ──────────────────────────────────────────────────────────────────

/**
 * Lo que hace falta para volver atrás. Viaja al cliente y vuelve en «Deshacer»,
 * así que el servidor NO le cree: cada cambio trae lo que el orden dejó
 * (`despues`) y sólo se revierte si el papel todavía lo tiene, con los permisos
 * de hoy (`deshacerOrden`).
 */
export interface DeshacerOrden {
  renombres: { id: string; antes: string; despues: string }[];
  /** Sólo los que de verdad se fueron a la papelera. */
  restaurar: string[];
  /** Sólo las carpetas que de verdad se borraron. */
  carpetas: CarpetaParaRecrear[];
  ia: {
    id: string;
    carpeta?: { antes: string | null; despues: string };
    /** ISO */
    vence?: { antes: string | null; despues: string };
  }[];
}

export interface ResultadoAplicar {
  aplicados: number;
  fallidos: number;
  /** Ids de propuestas que ya no estaban en el plan (alguien cambió algo). */
  vencidas: string[];
  deshacer: DeshacerOrden;
  /** Se cortó a mitad: `deshacer` trae lo que alcanzó a hacerse. */
  interrumpido?: boolean;
}

const avisarAuditoria = (err: unknown) => logger.warn("documents.ordenar.audit_fail", { err: String(err) });

export async function aplicarPlan(
  tenantId: string,
  actor: { role: string; username: string },
  ids: string[],
  o: Pick<OpcionesPlan, "descartadas"> = {},
): Promise<ResultadoAplicar> {
  const pedidos = new Set(ids);
  const repetidosDe = new Set(ids.filter((x) => x.startsWith("duplicado:")).map((x) => x.slice("duplicado:".length)));
  const plan = await armarPlan(tenantId, actor.role, {
    duplicados: repetidosDe.size > 0,
    repetidosDe,
    descartadas: o.descartadas,
  });
  const elegidas = plan.propuestas.filter((p) => pedidos.has(p.id));
  const vencidas = ids.filter((x) => !elegidas.some((p) => p.id === x));
  const deshacer: DeshacerOrden = { renombres: [], restaurar: [], carpetas: [], ia: [] };
  let aplicados = 0;
  let fallidos = 0;
  let interrumpido = false;
  const auditar = (documentId: string, action: "rename" | "move" | "tag", metadata: Record<string, unknown>) =>
    DocumentsDB.log(tenantId, { documentId, actorId: actor.username, action, metadata: { ordenar: true, ...metadata } })
      .catch(avisarAuditoria);

  // Lo que se hizo queda anotado en `deshacer` paso a paso: si algo revienta a
  // mitad, el cliente igual recibe cómo volver atrás lo que alcanzó a hacerse.
  try {
    // Nombres y sugerencias de la IA: uno por uno (cada uno es un PATCH distinto).
    for (const p of elegidas) {
      if (p.tipo !== "nombre" && p.tipo !== "ia") continue;
      if (p.tipo === "nombre") {
        if (!(await renombrar(tenantId, p))) { fallidos++; continue; }
        aplicados++;
        deshacer.renombres.push({ id: p.objetoId, antes: p.antes, despues: p.despues });
        void auditar(p.objetoId, "rename", { from: p.antes, to: p.despues });
        continue;
      }
      const vence = p.expiresAt ? new Date(p.expiresAt) : null;
      if (!(await aplicarSugerencia(tenantId, p, vence))) { fallidos++; continue; }
      aplicados++;
      // La sugerencia sólo se ofrece a lo suelto y sin vencimiento: «antes» es eso.
      deshacer.ia.push({
        id: p.objetoId,
        ...(p.folderId ? { carpeta: { antes: null, despues: p.folderId } } : {}),
        ...(vence ? { vence: { antes: null, despues: vence.toISOString() } } : {}),
      });
      void auditar(p.objetoId, p.folderId ? "move" : "tag", { folderId: p.folderId ?? null, expiresAt: p.expiresAt ?? null });
    }

    // Basura y repetidos: a la papelera de una (se recuperan desde ahí).
    const aPapelera = elegidas.filter((p) => p.tipo === "basura" || p.tipo === "duplicado");
    if (aPapelera.length) {
      const docIds = aPapelera.map((p) => p.objetoId);
      const fueron = await DocumentsDB.aLaPapeleraDevolviendoIds(tenantId, docIds);
      const set = new Set(fueron);
      aplicados += fueron.length;
      fallidos += docIds.length - fueron.length;
      deshacer.restaurar.push(...fueron);
      for (const tipo of ["basura", "duplicado"] as const) {
        const deEste = aPapelera.filter((p) => p.tipo === tipo && set.has(p.objetoId)).map((p) => p.objetoId);
        if (deEste.length === 0) continue;
        DocumentsDB.logMany(tenantId, deEste, {
          actorId: actor.username,
          action: "delete",
          metadata: { ordenar: true, motivo: tipo === "basura" ? "basura" : "repetido", total: deEste.length },
        }).catch(avisarAuditoria);
      }
    }

    // Carpetas vacías: se borran DE VERDAD (no hay papelera de carpetas), sólo
    // si siguen vacías en el mismo borrado; se guarda cómo eran para recrearlas.
    const carpetas = elegidas.filter((p) => p.tipo === "carpeta").map((p) => p.objetoId);
    if (carpetas.length) {
      const borradas = await DocumentsDB.borrarCarpetasVacias(tenantId, carpetas);
      aplicados += borradas.length;
      fallidos += carpetas.length - borradas.length;
      deshacer.carpetas.push(...borradas);
      // Las carpetas no tienen bitácora propia: queda en el log del servidor.
      logger.info("documents.ordenar.carpetas_vacias", {
        tenantId, actor: actor.username, ids: borradas.map((c) => c.id), nombres: borradas.map((c) => c.name),
      });
    }
  } catch (err) {
    interrumpido = true;
    logger.error("documents.ordenar.aplicar_cortado", { tenantId, err: err instanceof Error ? err.message : String(err) });
  }

  return { aplicados, fallidos, vencidas, deshacer, ...(interrumpido ? { interrumpido } : {}) };
}

async function renombrar(tenantId: string, p: Propuesta): Promise<boolean> {
  return !!(await DocumentsDB.update(tenantId, p.objetoId, { name: p.despues }));
}

async function aplicarSugerencia(tenantId: string, p: Propuesta, vence: Date | null): Promise<boolean> {
  return !!(await DocumentsDB.update(tenantId, p.objetoId, {
    ...(p.folderId ? { folderId: p.folderId } : {}),
    ...(vence ? { expiresAt: vence } : {}),
  }));
}

// ── Deshacer ─────────────────────────────────────────────────────────────────

export interface ResultadoDeshacer {
  revertidos: number;
  /** Carpetas: id viejo → id que quedó (para las hijas de la tanda siguiente). */
  carpetas: Record<string, string>;
  /** Se cortó a mitad: reintentar es seguro (nada se revierte dos veces). */
  interrumpido?: boolean;
}

const fecha = (iso: string | null): Date | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : null;
};

/**
 * Vuelve atrás lo que devolvió `aplicarPlan`. El paquete llega del cliente: no
 * se le cree. Cada paso es uno que el panel ya permite a ese rol HOY (renombrar
 * y el vencimiento = verlo; sacar de una carpeta = las reglas del lote de mover;
 * recrear una carpeta = adentro de una que ve) y sólo se revierte lo que sigue
 * como el orden lo dejó (nada se pisa ni se aplica dos veces).
 */
export async function deshacerOrden(
  tenantId: string,
  actor: { role: string; username: string },
  d: DeshacerOrden,
): Promise<ResultadoDeshacer> {
  let revertidos = 0;
  let carpetasQuedaron: Record<string, string> = {};
  try {
    const todos = [...new Set([...d.renombres.map((r) => r.id), ...d.restaurar, ...d.ia.map((x) => x.id)])];
    const estado = await DocumentsDB.estadoParaDeshacer(tenantId, todos, actor.role);
    const ve = (id: string) => estado.get(id)?.ve === true;

    const restaurar = d.restaurar.filter(ve);
    if (restaurar.length) {
      revertidos += await DocumentsDB.bulkRestore(tenantId, restaurar);
      DocumentsDB.logMany(tenantId, restaurar, {
        actorId: actor.username, action: "restore", metadata: { ordenar: true, deshacer: true },
      }).catch(avisarAuditoria);
    }

    for (const r of d.renombres) {
      if (!ve(r.id)) continue;
      if (!(await DocumentsDB.revertirSiSigue(tenantId, r.id, { name: { antes: r.antes, despues: r.despues } }))) continue;
      revertidos++;
      DocumentsDB.log(tenantId, {
        documentId: r.id, actorId: actor.username, action: "rename", metadata: { ordenar: true, deshacer: true, from: r.despues, to: r.antes },
      }).catch(avisarAuditoria);
    }

    // Una carpeta de vuelta sólo si ve el destino: sacar a la raíz es como el lote de mover a la raíz.
    const destinos = [...new Set(d.ia.map((x) => x.carpeta?.antes).filter((x): x is string => !!x))];
    const destinoQueVe = new Set(
      (await Promise.all(destinos.map(async (id) => ((await DocumentsDB.accesoACarpeta(tenantId, id, actor.role)).ve ? id : null))))
        .filter((x): x is string => !!x),
    );
    for (const x of d.ia) {
      const e = estado.get(x.id);
      if (!e?.ve) continue;
      const mover = x.carpeta && e.movible && (x.carpeta.antes === null || destinoQueVe.has(x.carpeta.antes)) ? x.carpeta : undefined;
      const vence = x.vence ? { antes: fecha(x.vence.antes), despues: fecha(x.vence.despues) } : undefined;
      if (!mover && !vence?.despues) continue;
      const ok = await DocumentsDB.revertirSiSigue(tenantId, x.id, {
        ...(mover ? { folderId: { antes: mover.antes, despues: mover.despues } } : {}),
        ...(vence?.despues ? { expiresAt: vence } : {}),
      });
      if (!ok) continue;
      revertidos++;
      DocumentsDB.log(tenantId, {
        documentId: x.id, actorId: actor.username, action: mover ? "move" : "tag",
        metadata: { ordenar: true, deshacer: true, ...(mover ? { folderId: mover.antes } : {}), ...(vence ? { expiresAt: x.vence?.antes ?? null } : {}) },
      }).catch(avisarAuditoria);
    }

    if (d.carpetas.length) {
      const r = await DocumentsDB.recrearCarpetas(tenantId, await carpetasQuePuedeRecrear(tenantId, actor.role, d.carpetas));
      carpetasQuedaron = r.ids;
      revertidos += r.creadas;
      logger.info("documents.ordenar.carpetas_recreadas", { tenantId, actor: actor.username, creadas: r.creadas, ids: r.ids });
    }
  } catch (err) {
    logger.error("documents.ordenar.deshacer_cortado", { tenantId, err: err instanceof Error ? err.message : String(err) });
    return { revertidos, carpetas: carpetasQuedaron, interrumpido: true };
  }
  return { revertidos, carpetas: carpetasQuedaron };
}

/**
 * Las carpetas a recrear, como las podría crear este rol desde el panel: nunca
 * adentro de una madre que no ve (el candado de dueño frena también al
 * encargado) y, si no es encargado o más, sin roles (sólo pudo borrar carpetas
 * sin roles). El encargado no recrea el candado: no lo pudo haber borrado.
 */
async function carpetasQuePuedeRecrear(
  tenantId: string,
  role: string,
  carpetas: CarpetaParaRecrear[],
): Promise<CarpetaParaRecrear[]> {
  const dueno = veTodoElDrive(role);
  const privilegiado = isPrivilegedRole(role);
  const recreables = new Set(carpetas.map((c) => c.id));
  const madres = [...new Set(carpetas.map((c) => c.parentId).filter((x): x is string => !!x && !recreables.has(x)))];
  const madresQueVe = new Set(
    dueno
      ? madres
      : (await Promise.all(madres.map(async (id) => ((await DocumentsDB.accesoACarpeta(tenantId, id, role)).ve ? id : null))))
          .filter((x): x is string => !!x),
  );
  return carpetas.map((c) => ({
    ...c,
    allowedRoles: dueno ? c.allowedRoles : privilegiado ? c.allowedRoles.filter((r) => r !== ROL_CANDADO_DUENO) : [],
    parentId: c.parentId && (recreables.has(c.parentId) || madresQueVe.has(c.parentId)) ? c.parentId : null,
  }));
}
