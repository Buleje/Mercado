import "server-only";
import { DocumentsDB } from "@/lib/db/documents.db";
import { buildStoragePath, uploadToStorage } from "@/lib/documents/storage";
import { logger } from "@/lib/logger";
import { horaLimaParaArchivo, nombreCarpetaCamara } from "@/lib/camaras/personas-drive.server";
import {
  CARPETA_ASISTENCIA,
  TAG_FOTO_ASISTENCIA,
  tagColaborador,
  tagFecha,
  type FotoAsistencia,
  type RespuestaFotoAsistencia,
} from "@/lib/rrhh/asistencia-fotos";
import { RRHH_MARCAR } from "@/lib/rrhh/roles";

/**
 * «Marcar con foto» → Drive (Brandon 2026-10-09). Mismo patrón que
 * `lib/camaras/personas-drive.server.ts`: carpeta cerrada a los roles de RRHH
 * que marcan, borrador → subir → update, y descripción propia para que el
 * indexador nocturno no mande la foto a la IA paga.
 */

const SEPARADOR = " · ";

/** `07-42-10 · Juan Pérez · Entrada.webp` */
export function nombreArchivoFotoAsistencia(cuando: Date, colaborador: string, camara: string): string {
  return [horaLimaParaArchivo(cuando), nombreCarpetaCamara(colaborador), nombreCarpetaCamara(camara)].join(SEPARADOR) + ".webp";
}

/** Etiquetas del documento (contrato en `asistencia-fotos.ts`). */
export function tagsFotoAsistencia(colaboradorId: string, fecha: string): string[] {
  return [TAG_FOTO_ASISTENCIA, tagColaborador(colaboradorId), tagFecha(fecha)];
}

/** Del nombre del archivo saca `HH:mm` y el nombre de la cámara; `null` si no es de este formato. */
export function leerNombreFotoAsistencia(nombre: string): { hora: string; camara: string } | null {
  const m = /^(\d{2})-(\d{2})-\d{2} · .+? · (.+)\.webp$/.exec(nombre);
  return m ? { hora: `${m[1]}:${m[2]}`, camara: m[3] } : null;
}

export const urlFotoAsistencia = (documentId: string) => `/api/admin/documents/${documentId}/raw`;

/* Dedupe en vuelo + id recordado: createFolderTree no es atómico. */
const TTL_CARPETA_MS = 5 * 60_000;
const enVuelo = new Map<string, Promise<string>>();
const recordadas = new Map<string, { id: string; hasta: number }>();

function conMemoria(clave: string, calcular: () => Promise<string>): Promise<string> {
  const guardada = recordadas.get(clave);
  if (guardada && guardada.hasta > Date.now()) return Promise.resolve(guardada.id);
  const previa = enVuelo.get(clave);
  if (previa) return previa;
  const p = calcular()
    .then((id) => {
      recordadas.set(clave, { id, hasta: Date.now() + TTL_CARPETA_MS });
      return id;
    })
    .finally(() => enVuelo.delete(clave));
  enVuelo.set(clave, p);
  return p;
}

function olvidar(tenantId: string): void {
  for (const k of recordadas.keys()) if (k.startsWith(`${tenantId}|`)) recordadas.delete(k);
}

async function asegurarCarpetaAsistencia(tenantId: string): Promise<string> {
  return conMemoria(`${tenantId}|asistencia`, async () => {
    const ruta = CARPETA_ASISTENCIA.join("/");
    const { idPorRuta } = await DocumentsDB.createFolderTree(tenantId, { parentId: null, rutas: [ruta] });
    const id = idPorRuta[ruta];
    if (!id) throw new Error("carpeta_asistencia_no_creada");
    const carpeta = (await DocumentsDB.listFolders(tenantId)).find((f) => f.id === id);
    if (carpeta && carpeta.allowedRoles.length === 0) {
      await DocumentsDB.updateFolder(tenantId, id, { allowedRoles: [...RRHH_MARCAR] });
    }
    return id;
  });
}

async function asegurarCarpetaDelDia(tenantId: string, fecha: string): Promise<string> {
  const raiz = await asegurarCarpetaAsistencia(tenantId);
  return conMemoria(`${tenantId}|${raiz}|${fecha}`, async () => {
    const { idPorRuta } = await DocumentsDB.createFolderTree(tenantId, { parentId: raiz, rutas: [fecha] });
    const id = idPorRuta[fecha];
    if (!id) throw new Error("carpeta_del_dia_no_creada");
    return id;
  });
}

export interface GuardarFotoAsistenciaInput {
  colaborador: { id: string; nombre: string };
  /** AAAA-MM-DD del día de la marca. */
  fecha: string;
  camara: { id: string; nombre: string };
  imagen: Buffer;
  marcadoPor: string;
  cuando?: Date;
}

export async function guardarFotoAsistencia(tenantId: string, entrada: GuardarFotoAsistenciaInput): Promise<RespuestaFotoAsistencia> {
  const cuando = entrada.cuando ?? new Date();
  const nombre = nombreArchivoFotoAsistencia(cuando, entrada.colaborador.nombre, entrada.camara.nombre);
  const mime = "image/webp";
  try {
    let carpetaDia: string;
    try {
      carpetaDia = await asegurarCarpetaDelDia(tenantId, entrada.fecha);
    } catch (err) {
      logger.warn("[rrhh.asistencia-fotos] carpeta recordada ya no sirve, se reintenta", { tenantId, error: String(err) });
      olvidar(tenantId);
      carpetaDia = await asegurarCarpetaDelDia(tenantId, entrada.fecha);
    }

    let borrador;
    try {
      borrador = await DocumentsDB.create(tenantId, {
        folderId: carpetaDia,
        name: nombre,
        originalName: nombre,
        mimeType: mime,
        size: entrada.imagen.length,
        storagePath: "pending",
        tags: tagsFotoAsistencia(entrada.colaborador.id, entrada.fecha),
        uploadedById: entrada.marcadoPor,
      });
    } catch (err) {
      olvidar(tenantId);
      throw err;
    }

    const storagePath = buildStoragePath({ tenantId, documentId: borrador.id, versionLabel: "v1", originalName: nombre });
    const subida = await uploadToStorage(storagePath, entrada.imagen, mime);
    if (!subida.ok) {
      await DocumentsDB.hardDelete(tenantId, borrador.id);
      logger.error("[rrhh.asistencia-fotos] storage falló", { tenantId, error: subida.error });
      return { ok: false, error: "storage" };
    }

    await DocumentsDB.update(tenantId, borrador.id, {
      storagePath,
      ocrMetadata: {
        description: `Foto de asistencia de ${entrada.colaborador.nombre} el ${entrada.fecha} en ${entrada.camara.nombre}`,
        origen: "asistencia-foto",
        camaraId: entrada.camara.id,
        colaboradorId: entrada.colaborador.id,
      },
    });

    DocumentsDB.log(tenantId, {
      documentId: borrador.id,
      actorId: entrada.marcadoPor,
      action: "upload",
      metadata: { origen: "asistencia-foto", camaraId: entrada.camara.id, size: entrada.imagen.length },
    }).catch((err) => logger.warn("[rrhh.asistencia-fotos] audit falló", { error: String(err) }));

    const leido = leerNombreFotoAsistencia(nombre);
    const foto: FotoAsistencia = {
      id: borrador.id,
      colaboradorId: entrada.colaborador.id,
      fecha: entrada.fecha,
      hora: leido?.hora ?? "",
      camara: entrada.camara.nombre,
      url: urlFotoAsistencia(borrador.id),
    };
    return { ok: true, foto };
  } catch (err) {
    logger.error("[rrhh.asistencia-fotos] no se pudo guardar", { tenantId, error: String(err) });
    return { ok: false, error: "no_se_pudo_guardar" };
  }
}

/** Fotos del día (sin borradas), por hora. `rol` = quien mira (respeta los permisos de carpeta). */
export async function listarFotosAsistencia(tenantId: string, fecha: string, rol?: string): Promise<FotoAsistencia[]> {
  const docs = await DocumentsDB.list(tenantId, { tags: [tagFecha(fecha)] }, rol);
  const fotos: FotoAsistencia[] = [];
  for (const d of docs) {
    if (!d.tags.includes(TAG_FOTO_ASISTENCIA) || d.storagePath === "pending") continue;
    const colaboradorId = d.tags.find((t) => t.startsWith("colaborador:"))?.slice("colaborador:".length);
    const leido = leerNombreFotoAsistencia(d.name);
    if (!colaboradorId || !leido) continue;
    fotos.push({ id: d.id, colaboradorId, fecha, hora: leido.hora, camara: leido.camara, url: urlFotoAsistencia(d.id) });
  }
  return fotos.sort((a, b) => a.hora.localeCompare(b.hora) || a.id.localeCompare(b.id));
}
