import "server-only";

/**
 * Fotos de una carga medida en el monte (16-10, F3) — el lado servidor.
 *
 * La foto se guarda en el Drive AL GUARDAR LA CARGA, no al registrar la guía:
 * si nadie registra (se cortó la señal, se cambió de idea) la foto no se
 * pierde. Va a la carpeta del permiso en el expediente:
 *
 *   Guías forestales (GTF) / <titular> / <permiso> / Cargas medidas
 *
 * Al usar la carga en una guía, sus fotos pasan a la carpeta de ESA guía con
 * sus etiquetas (casillero «Otros», como las que se pasan desde la oficina):
 * así aparecen en los papeles de la guía sin subirlas dos veces.
 */
import { DocumentsDB } from "@/lib/db/documents.db";
import { ForestMedicionCargaDB } from "@/lib/db/forest-medicion-carga.db";
import { auditCtp } from "./ctp-audit";
import { CtpGuiaDocumentosDB, type DatosDeGuia } from "@/lib/db/ctp-guia-documentos.db";
import { buildStoragePath, uploadToStorage } from "@/lib/documents/storage";
import { precalcularMiniatura } from "@/lib/documents/precalcular-miniatura";
import { logger } from "@/lib/logger";
import type { DbDocument } from "@/lib/types/documents";
import type { ArchivoListo } from "./documentos-guia-server";
import {
  CARPETA_GUIAS,
  MAX_DOCS_POR_CASILLERO,
  ROLES_PAPELES_GUIA,
  SIN_PERMISO,
  SIN_TITULAR,
  carpetaGuiaPorTitular,
  casilleroDeDocumento,
  etiquetasDeDocumentoGuia,
  segmentoDeCarpeta,
} from "./documentos-guia";
import { rangoDeCodigos, type CargaMedida, type Firma, type TipoFotoCarga } from "./medicion-carga";

export const CARPETA_CARGAS = "Cargas medidas";
export const PREFIJO_TAG_CARGA = "carga:";
export const tagCarga = (id: string): string => `${PREFIJO_TAG_CARGA}${id}`;

/** El permiso de la carga, para la carpeta: titular y título (o N° del plan). */
export interface PermisoDeCarga {
  titular: string | null;
  permiso: string | null;
}

export function carpetaDeCargas(p: PermisoDeCarga | null): string[] {
  return [CARPETA_GUIAS, segmentoDeCarpeta(p?.titular) || SIN_TITULAR, segmentoDeCarpeta(p?.permiso) || SIN_PERMISO, CARPETA_CARGAS];
}

/** «Carga medida 24 a 37 — 16-10 14.05 (anotada).webp»: dice qué es suelto en el Drive. */
export function nombreDeFotoDeCarga(c: Pick<CargaMedida, "filas" | "creada">, tipo: TipoFotoCarga, ext: string): string {
  const d = new Date(c.creada.en);
  const lima = new Date(d.getTime() - 5 * 3600_000);
  const dd = String(lima.getUTCDate()).padStart(2, "0");
  const mm = String(lima.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(lima.getUTCHours()).padStart(2, "0");
  const mi = String(lima.getUTCMinutes()).padStart(2, "0");
  const codigos = rangoDeCodigos(c.filas).replace(/[\\/:*?"<>|]+/g, " ");
  return `Carga medida ${codigos} — ${dd}-${mm} ${hh}.${mi} (${tipo === "anotada" ? "anotada" : "original"}).${ext}`;
}

async function carpetaId(tenantId: string, ruta: string[]): Promise<string | null> {
  const r = ruta.join("/");
  try {
    return (await DocumentsDB.createFolderTree(tenantId, { rutas: [r] })).idPorRuta[r] ?? null;
  } catch (e) {
    /* Sin carpeta va a la raíz: perder la foto por la carpeta sería cambiar lo
       importante por lo accesorio (mismo criterio que los papeles de la guía). */
    logger.warn("[medicion-carga] carpeta no disponible", { err: String(e) });
    return null;
  }
}

export interface GuardarFotoDeCarga {
  tenantId: string;
  user: string;
  carga: CargaMedida;
  permiso: PermisoDeCarga | null;
  tipo: TipoFotoCarga;
  archivo: Extract<ArchivoListo, { ok: true }>;
  ip?: string;
}

/** Sube la foto al Drive (carpeta del permiso › «Cargas medidas»). `null` si el storage falló. */
export async function guardarFotoDeCarga(o: GuardarFotoDeCarga): Promise<DbDocument | null> {
  const { tenantId, archivo, carga } = o;
  const folderId = await carpetaId(tenantId, carpetaDeCargas(o.permiso));
  const nombre = nombreDeFotoDeCarga(carga, o.tipo, archivo.ext);
  const draft = await DocumentsDB.create(tenantId, {
    folderId,
    name: nombre,
    originalName: nombre,
    mimeType: archivo.mime,
    size: archivo.buffer.length,
    storagePath: "pending",
    category: "otros",
    tags: ["forestal", "carga medida", tagCarga(carga.id)],
    uploadedById: o.user,
    /* Los mismos roles que la ruta: en el Drive general el cajero no la ve. */
    allowedRoles: [...ROLES_PAPELES_GUIA],
  });
  const storagePath = buildStoragePath({ tenantId, documentId: draft.id, versionLabel: "v1", originalName: nombre });
  const up = await uploadToStorage(storagePath, archivo.buffer, archivo.mime);
  if (!up.ok) {
    await DocumentsDB.hardDelete(tenantId, draft.id);
    return null;
  }
  const doc = (await DocumentsDB.update(tenantId, draft.id, { storagePath })) ?? { ...draft, storagePath };
  DocumentsDB.log(tenantId, {
    documentId: doc.id,
    actorId: o.user,
    action: "upload",
    metadata: { origen: "carga-medida", carga: carga.id, tipo: o.tipo },
    ipAddress: o.ip,
  }).catch((err) => logger.warn("[medicion-carga] auditoría del documento falló", { error: String(err) }));
  precalcularMiniatura(storagePath, nombre, archivo.mime, archivo.buffer.length).catch((err) =>
    logger.warn("[medicion-carga] miniatura falló", { error: String(err) }),
  );
  return doc;
}

/** ¿El documento es una foto de ESTA carga? (la etiqueta `carga:<id>` la pone el servidor). */
export function esFotoDeLaCarga(doc: Pick<DbDocument, "tags">, cargaId: string): boolean {
  return doc.tags.some((t) => t.toLowerCase() === tagCarga(cargaId).toLowerCase());
}

/**
 * Las fotos de la carga pasan a la carpeta de la guía con sus etiquetas
 * (casillero «Otros»). Respeta el tope del casillero: lo que no entra se queda
 * en «Cargas medidas» y se cuenta en `sinLugar`. Nunca tira: la guía ya quedó.
 */
export async function pasarFotosALaGuia(
  tenantId: string,
  carga: CargaMedida,
  guia: DatosDeGuia,
  user: string,
  ip?: string,
): Promise<{ pasadas: number; sinLugar: number; fallidas: number }> {
  const out = { pasadas: 0, sinLugar: 0, fallidas: 0 };
  if (carga.fotos.length === 0) return out;
  try {
    const gtf = guia.gtfNumber;
    const ya = await CtpGuiaDocumentosDB.documentosDeGuias(tenantId, [gtf]);
    let enOtros = ya.filter((d) => casilleroDeDocumento(d.tags, gtf) === "otros").length;
    const yaDeLaGuia = new Set(ya.map((d) => d.id));
    const folderId = await carpetaId(tenantId, carpetaGuiaPorTitular({ titular: guia.titular, permiso: guia.permiso, gtfNumber: gtf }));
    for (const f of carga.fotos) {
      if (yaDeLaGuia.has(f.docId)) continue;
      if (enOtros >= MAX_DOCS_POR_CASILLERO) {
        out.sinLugar++;
        continue;
      }
      const doc = await DocumentsDB.getById(tenantId, f.docId);
      if (!doc || !esFotoDeLaCarga(doc, carga.id)) {
        out.fallidas++;
        continue;
      }
      const tags = [...new Set([...doc.tags, ...etiquetasDeDocumentoGuia(gtf, "otros")])];
      const ok = await DocumentsDB.update(tenantId, f.docId, { tags, ...(folderId ? { folderId } : {}) });
      if (!ok) {
        out.fallidas++;
        continue;
      }
      enOtros++;
      out.pasadas++;
      DocumentsDB.log(tenantId, {
        documentId: f.docId,
        actorId: user,
        action: "move",
        metadata: { origen: "carga-medida", carga: carga.id, gtfNumber: gtf },
        ipAddress: ip,
      }).catch((err) => logger.warn("[medicion-carga] auditoría del documento falló", { error: String(err) }));
    }
  } catch (err) {
    logger.error("[medicion-carga] pasar fotos a la guía falló", { error: String(err), tenantId, carga: carga.id });
    out.fallidas = carga.fotos.length - out.pasadas - out.sinLugar;
  }
  return out;
}

/* ── Las cargas en el registro de la guía (security 16-10) ───────────────── */

/** Lo que el despacho marcó antes de escribir el libro: para cerrarlo o soltarlo. */
export interface ReservaCargas {
  gtfNumber: string;
  cargas: CargaMedida[];
  /** Las que ESTE registro pasó de `medida` a `usada` (las únicas que se sueltan si falla). */
  cambiadas: string[];
  firma: Firma;
}

export type ReservaDeGuia =
  | { ok: true; reserva: ReservaCargas | null }
  | { ok: false; status: 404 | 409; error: string; message: string };

const carga = (c: Pick<CargaMedida, "filas"> | undefined): string => (c ? `La carga del monte N° ${rangoDeCodigos(c.filas)}` : "Una carga del monte");

/**
 * Marca `usada` las cargas de la guía ANTES de `despacharConGuia`, todas o
 * ninguna. Si una ya va en otra guía o está descartada, 409 con el motivo y
 * el libro no se escribe; el intento queda en la auditoría (es justo lo que
 * pasa cuando dos PCs registran la misma carga). `ClaveOcupadaError` sube:
 * la ruta contesta «otra PC está guardando».
 */
export async function reservarCargasDeGuia(
  tenantId: string,
  ids: readonly string[],
  gtfNumber: string,
  user: string,
): Promise<ReservaDeGuia> {
  if (ids.length === 0) return { ok: true, reserva: null };
  const r = await ForestMedicionCargaDB.reservar(tenantId, ids, gtfNumber, user);
  if (r.ok) return { ok: true, reserva: { gtfNumber, cargas: r.cargas, cambiadas: r.cambiadas, firma: r.firma } };
  if (r.motivo === "no_existe") {
    return { ok: false, status: 404, error: "carga_no_existe", message: "Una carga del monte de esta guía ya no está: quita sus trozas de «Anotar a mano» y vuelve a registrar." };
  }
  const otra = r.carga?.usada?.gtfNumber;
  const message =
    r.motivo === "otra_guia" && otra
      ? `${carga(r.carga)} ya va en la guía ${otra}: quita sus trozas de «Anotar a mano». Nada se registró.`
      : `${carga(r.carga)} se descartó: quita sus trozas de «Anotar a mano». Nada se registró.`;
  auditCtp({
    tenantId,
    action: "loth_medicion_carga_doble_uso",
    entity: "ForestMedicionCarga",
    entityId: r.id,
    detail: `Se intentó registrar la guía ${gtfNumber} con una carga del monte ${r.motivo === "otra_guia" && otra ? `que ya va en la guía ${otra}` : "descartada"}${r.carga ? ` (N° ${rangoDeCodigos(r.carga.filas)})` : ""}: rechazado, no se escribió el libro.`,
    user,
  });
  return { ok: false, status: 409, error: r.motivo === "otra_guia" ? "carga_en_otra_guia" : "carga_descartada", message };
}

/** La guía no se registró: sus cargas vuelven a `medida`. Nunca tira (se loguea si no pudo). */
export async function soltarCargasDeGuia(tenantId: string, reserva: ReservaCargas | null, user: string): Promise<void> {
  if (!reserva || reserva.cambiadas.length === 0) return;
  try {
    const liberadas = await ForestMedicionCargaDB.liberar(tenantId, reserva.cambiadas, reserva.gtfNumber, reserva.firma, user);
    if (liberadas.length < reserva.cambiadas.length) {
      logger.warn("[medicion-carga] no se soltaron todas las cargas de la guía que no se registró", {
        tenantId,
        gtfNumber: reserva.gtfNumber,
        pedidas: reserva.cambiadas,
        liberadas,
      });
    }
  } catch (err) {
    logger.error("[medicion-carga] soltar las cargas de la guía que no se registró falló: quedan «usadas» sin guía", {
      error: String(err),
      tenantId,
      gtfNumber: reserva.gtfNumber,
      cargas: reserva.cambiadas,
    });
  }
}

export interface CierreCargas {
  usadas: number;
  fotos: { pasadas: number; sinLugar: number; fallidas: number };
}

/**
 * La guía quedó registrada: las fotos de TODAS sus cargas pasan a los papeles
 * de la guía (también las de una carga ya marcada por un reintento:
 * `pasarFotosALaGuia` salta lo que ya está) y las recién usadas se auditan.
 * Nunca tira: la guía ya quedó.
 */
export async function cerrarCargasDeGuia(
  tenantId: string,
  reserva: ReservaCargas | null,
  gtfNumber: string,
  user: string,
  ip?: string,
): Promise<CierreCargas | null> {
  if (!reserva) return null;
  const out: CierreCargas = { usadas: reserva.cargas.length, fotos: { pasadas: 0, sinLugar: 0, fallidas: 0 } };
  try {
    const guia = await CtpGuiaDocumentosDB.datosDeGuia(tenantId, gtfNumber);
    for (const c of reserva.cargas) {
      if (!guia) {
        out.fotos.fallidas += c.fotos.length;
        continue;
      }
      const f = await pasarFotosALaGuia(tenantId, c, guia, user, ip);
      out.fotos.pasadas += f.pasadas;
      out.fotos.sinLugar += f.sinLugar;
      out.fotos.fallidas += f.fallidas;
    }
    if (!guia) logger.warn("[medicion-carga] la guía recién registrada no aparece para pasarle las fotos", { tenantId, gtfNumber });
  } catch (err) {
    logger.error("[medicion-carga] cerrar las cargas de la guía falló", { error: String(err), tenantId, gtfNumber });
  }
  const cambiadas = new Set(reserva.cambiadas);
  for (const c of reserva.cargas) {
    if (!cambiadas.has(c.id)) continue;
    auditCtp({
      tenantId,
      action: "loth_medicion_carga_usar",
      entity: "ForestMedicionCarga",
      entityId: c.id,
      detail: `Carga medida usada en la guía ${gtfNumber}: ${c.trozas} trozas (N° ${rangoDeCodigos(c.filas)})`,
      user,
    });
  }
  return out;
}
