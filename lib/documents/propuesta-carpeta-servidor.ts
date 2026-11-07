import "server-only";
import { DocumentsDB } from "@/lib/db/documents.db";
import { logger } from "@/lib/logger";
import { TAGS_FOTOS_DE_MAQUINA } from "@/lib/documents/fotos-de-maquina";
import { puedeMoverPapel, rolesDeLaCadena, type CarpetaConRoles } from "@/lib/documents/doc-access";
import { nombreDeTercero } from "@/lib/documents/nombre-tercero";
import { leerVinculo, vinculosDeCarpeta, type NombreTercero } from "@/lib/documentos/terceros-vinculo";
import {
  prepararCarpetas, sugerirCarpeta, type CarpetaCandidata, type CarpetaPorProponer, type IndiceCarpetas,
} from "@/lib/documentos/sugerir-carpeta";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";

/**
 * El lado servidor de «Foto que se archiva sola»: arma el índice de carpetas
 * del negocio (las que el rol VE, con sus terceros y sus papeles) y propone
 * carpeta para cada papel pedido. Nunca mueve: sólo responde.
 */

export interface PropuestaDePapel {
  /** Ya tiene texto leído (si no, la UI espera y vuelve a preguntar). */
  leido: boolean;
  candidatas: CarpetaCandidata[];
}

/** Papeles de muestra por negocio: los más recientes, con su texto. */
const PAPELES_DEL_INDICE = 400;
const TERCEROS_DEL_INDICE = 40;
const A_LA_VEZ = 5;
const VIGENCIA_MS = 60_000;
/** Los que ven DNI/RUC del tercero (como la pestaña Terceros): el resto no cruza por su RUC. */
const ROLES_VEN_DETALLE = new Set(["admin", "owner", "manager"]);

interface Contexto {
  indice: IndiceCarpetas;
  roles: Map<string, CarpetaConRoles>;
}

const contextos = new Map<string, { hasta: number; huella: string; contexto: Promise<Contexto> }>();

/** Cambia si alguien crea, renombra, mueve o etiqueta una carpeta: el índice se rearma al toque. */
const huellaDe = (carpetas: readonly DbDocumentFolder[]) =>
  carpetas.map((c) => `${c.id}:${c.parentId ?? ""}:${c.name}:${c.tags.join(",")}`).join("|");

async function de5en5<T, R>(items: readonly T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += A_LA_VEZ) out.push(...(await Promise.all(items.slice(i, i + A_LA_VEZ).map(fn))));
  return out;
}

async function tercerosDe(tenantId: string, role: string, carpetas: readonly DbDocumentFolder[]): Promise<Map<string, NombreTercero>> {
  const claves = [...new Set(carpetas.flatMap((c) => vinculosDeCarpeta(c)))].slice(0, TERCEROS_DEL_INDICE);
  const veDetalle = ROLES_VEN_DETALLE.has(role);
  const nombres = new Map<string, NombreTercero>();
  await de5en5(claves, async (clave) => {
    const v = leerVinculo(clave);
    if (!v) return;
    try {
      const n = await nombreDeTercero(tenantId, v.tipo, v.id);
      if (n) nombres.set(clave, veDetalle ? n : { ...n, detalle: null });
    } catch (err) {
      logger.warn("[documents.proponer-carpeta] no pude leer un tercero", { clave, err: String(err) });
    }
  });
  return nombres;
}

async function armarContexto(tenantId: string, role: string, carpetas: readonly DbDocumentFolder[]): Promise<Contexto> {
  const [papeles, terceros] = await Promise.all([
    DocumentsDB.list(tenantId, { conTextoCompleto: true, sinTags: [...TAGS_FOTOS_DE_MAQUINA], limite: PAPELES_DEL_INDICE }, role),
    tercerosDe(tenantId, role, carpetas),
  ]);
  const porProponer: CarpetaPorProponer[] = carpetas.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    tags: c.tags,
    terceros: vinculosDeCarpeta(c).map((k) => terceros.get(k)).filter((t): t is NombreTercero => !!t),
  }));
  const leidos = papeles
    .filter((d) => d.folderId && d.ocrText?.trim())
    .map((d) => ({ id: d.id, name: d.name, texto: d.ocrText ?? "", folderId: d.folderId }));
  return {
    indice: prepararCarpetas(porProponer, leidos),
    roles: new Map(carpetas.map((c) => [c.id, { parentId: c.parentId, allowedRoles: c.allowedRoles ?? [] }])),
  };
}

async function contextoDe(tenantId: string, role: string): Promise<Contexto> {
  const carpetas = await DocumentsDB.listFolders(tenantId, role);
  const clave = `${tenantId}|${role}`;
  const huella = huellaDe(carpetas);
  const ya = contextos.get(clave);
  if (ya && ya.hasta > Date.now() && ya.huella === huella) return ya.contexto;
  const contexto = armarContexto(tenantId, role, carpetas);
  contextos.set(clave, { hasta: Date.now() + VIGENCIA_MS, huella, contexto });
  // Si falla no se queda pegado el error durante el minuto.
  contexto.catch((err) => {
    contextos.delete(clave);
    logger.warn("[documents.proponer-carpeta] no pude armar el índice", { err: String(err) });
  });
  if (contextos.size > 200) contextos.delete(contextos.keys().next().value ?? "");
  return contexto;
}

const meta = (d: DbDocument) => (d.ocrMetadata ?? {}) as {
  analyzedAt?: unknown;
  structured?: { docType?: unknown } | null;
  sugerencias?: { folderId?: unknown } | null;
};

/**
 * Propuestas para los papeles pedidos que el rol ve. Un papel que no puede
 * mover (restringido, para un rol sin permiso) sale con 0 candidatas: no se
 * le ofrece lo que el lote de mover le va a negar.
 */
export async function proponerCarpetas(tenantId: string, role: string, ids: readonly string[]): Promise<Record<string, PropuestaDePapel>> {
  const [contexto, docs] = await Promise.all([
    contextoDe(tenantId, role),
    de5en5(ids, (id) => DocumentsDB.getById(tenantId, id, role)),
  ]);
  const salida: Record<string, PropuestaDePapel> = {};
  for (const d of docs) {
    if (!d) continue;
    const m = meta(d);
    const leido = !!d.ocrText?.trim() || !!m.analyzedAt;
    const fotoDeMaquina = d.tags.some((t) => TAGS_FOTOS_DE_MAQUINA.includes(t));
    const puede = puedeMoverPapel(role, d.allowedRoles ?? [], rolesDeLaCadena(d.folderId, contexto.roles));
    salida[d.id] = {
      leido,
      candidatas: leido && puede && !fotoDeMaquina && d.ocrText?.trim()
        ? sugerirCarpeta({
          id: d.id,
          name: d.name,
          texto: d.ocrText,
          folderId: d.folderId,
          tipoLeido: typeof m.structured?.docType === "string" ? m.structured.docType : null,
          carpetaIA: typeof m.sugerencias?.folderId === "string" ? m.sugerencias.folderId : null,
        }, contexto.indice)
        : [],
    };
  }
  return salida;
}
