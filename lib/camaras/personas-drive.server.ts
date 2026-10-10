import "server-only";
import { z } from "zod";
import { DocumentsDB } from "@/lib/db/documents.db";
import { buildStoragePath, uploadToStorage } from "@/lib/documents/storage";
import { logger } from "@/lib/logger";
import { limaDateKey, STORE_TIMEZONE } from "@/lib/utils";
import type { CajaGuardada } from "@/lib/camaras/apariencia";
import {
  CARPETA_PERSONAS,
  MOTIVOS_FOTO_PERSONA,
  MOTIVO_FOTO_PERSONA_LABEL,
  type MetaFotoPersona,
  type RespuestaFotoPersona,
} from "@/lib/camaras/personas";

/**
 * Fotos del detector de personas → Drive del negocio (Brandon 2026-10-07).
 *
 *   Cámaras / Personas / <cámara> / <AAAA-MM-DD Lima> / <HH-mm-ss> · <motivo> · <n> persona(s).webp
 *
 * Van al Drive y NO al historial de la cámara: ese historial tiene un tope de
 * 800 fotos compartido y cada foto pasa por la IA paga. Acá cada foto se
 * anota con una descripción propia (`ocrMetadata.description`) justamente para
 * que el indexador nocturno de documentos (`pendientesDeIndexar` toma toda
 * imagen sin descripción) NO la mande a la IA.
 *
 * Quién la ve: la carpeta «Personas» queda con los roles que ven el video en
 * vivo (admin, dueño, almacenero); admin/dueño/manager ven todo el Drive igual.
 */

export const ROLES_CARPETA_PERSONAS = ["admin", "owner", "almacenero"] as const;

/** Lo que manda el detector junto a la foto (multipart → todo llega como texto). */
export const metaFotoPersonaSchema = z.object({
  motivo: z.enum(MOTIVOS_FOTO_PERSONA),
  personas: z.coerce.number().int().min(1).max(50),
  confianza: z.coerce.number().min(0).max(1),
});

const SIN_CARACTERES_DE_RUTA = /[\\/:*?"<>|\u0000-\u001f]/g;

/** Nombre de carpeta para una cámara: sin separadores de ruta ni de Windows. */
export function nombreCarpetaCamara(nombre: string): string {
  const limpio = nombre.replace(SIN_CARACTERES_DE_RUTA, "-").replace(/\s+/g, " ").trim().slice(0, 60);
  return limpio || "Cámara";
}

/** `HH-mm-ss` en hora de Lima (a las 20:00 de Pucallpa el UTC ya es «mañana»). */
export function horaLimaParaArchivo(cuando: Date): string {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: STORE_TIMEZONE,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(cuando);
  const dato = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "00";
  return `${dato("hour")}-${dato("minute")}-${dato("second")}`;
}

/** `14-05-33 · Apareció alguien · 2 personas.webp` */
export function nombreArchivoFotoPersona(cuando: Date, meta: Pick<MetaFotoPersona, "motivo" | "personas">): string {
  const n = meta.personas;
  return `${horaLimaParaArchivo(cuando)} · ${MOTIVO_FOTO_PERSONA_LABEL[meta.motivo]} · ${n} ${n === 1 ? "persona" : "personas"}.webp`;
}

/** Carpetas bajo «Personas»: `[<cámara>, <AAAA-MM-DD Lima>]`. */
export function subcarpetasFotoPersona(nombreCamara: string, cuando: Date): [string, string] {
  return [nombreCarpetaCamara(nombreCamara), limaDateKey(cuando)];
}

/* ── Carpetas: se piden muchas veces seguidas (2-4 cámaras a la vez) ──────────
   `createFolderTree` lee todo el árbol y NO es atómico: dos fotos en ráfaga
   creaban la misma carpeta dos veces. Se junta lo que está en vuelo y se
   recuerda el id unos minutos (si borran la carpeta, se reintenta una vez). */
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

/** Crea «Cámaras / Personas» si falta y se asegura de que lleve los roles del video. */
async function asegurarCarpetaPersonas(tenantId: string): Promise<string> {
  return conMemoria(`${tenantId}|personas`, async () => {
    const ruta = CARPETA_PERSONAS.join("/");
    const { idPorRuta } = await DocumentsDB.createFolderTree(tenantId, { parentId: null, rutas: [ruta] });
    const id = idPorRuta[ruta];
    if (!id) throw new Error("carpeta_personas_no_creada");
    const carpeta = (await DocumentsDB.listFolders(tenantId)).find((f) => f.id === id);
    // Sin roles = la ve cualquiera con acceso al Drive (cajero incluido): se cierra.
    if (carpeta && carpeta.allowedRoles.length === 0) {
      await DocumentsDB.updateFolder(tenantId, id, { allowedRoles: [...ROLES_CARPETA_PERSONAS] });
    }
    return id;
  });
}

async function asegurarCarpetaDelDia(tenantId: string, nombreCamara: string, cuando: Date): Promise<{ dia: string; personas: string }> {
  const personas = await asegurarCarpetaPersonas(tenantId);
  const [camara, dia] = subcarpetasFotoPersona(nombreCamara, cuando);
  const ruta = `${camara}/${dia}`;
  const id = await conMemoria(`${tenantId}|${personas}|${ruta}`, async () => {
    const { idPorRuta } = await DocumentsDB.createFolderTree(tenantId, { parentId: personas, rutas: [ruta] });
    const hallada = idPorRuta[ruta];
    if (!hallada) throw new Error("carpeta_del_dia_no_creada");
    return hallada;
  });
  return { dia: id, personas };
}

export interface GuardarFotoPersonaInput {
  camara: { id: string; nombre: string };
  webp: Buffer;
  meta: MetaFotoPersona;
  /** Usuario de la sesión que tiene el mosaico abierto. */
  autor: string;
  cuando?: Date;
  /**
   * Dónde estaba cada persona + la firma de la ropa que calculó el servidor
   * (`apariencia.server.ts`, ADR-479). `null` = cliente viejo: la foto queda
   * «sin cajas» y no entra en el conteo de personas distintas.
   */
  cajas?: CajaGuardada[] | null;
}

export async function guardarFotoPersona(tenantId: string, entrada: GuardarFotoPersonaInput): Promise<RespuestaFotoPersona> {
  const cuando = entrada.cuando ?? new Date();
  const nombre = nombreArchivoFotoPersona(cuando, entrada.meta);
  const mime = "image/webp";
  try {
    let carpetas: { dia: string; personas: string };
    try {
      carpetas = await asegurarCarpetaDelDia(tenantId, entrada.camara.nombre, cuando);
    } catch (err) {
      // Carpeta borrada mientras estaba recordada: una segunda vuelta desde cero.
      logger.warn("[camaras.personas] carpeta recordada ya no sirve, se reintenta", { tenantId, error: String(err) });
      olvidar(tenantId);
      carpetas = await asegurarCarpetaDelDia(tenantId, entrada.camara.nombre, cuando);
    }

    // El id del documento va dentro de la ruta del archivo: se crea la fila primero.
    let borrador;
    try {
      borrador = await DocumentsDB.create(tenantId, {
        folderId: carpetas.dia,
        name: nombre,
        originalName: nombre,
        mimeType: mime,
        size: entrada.webp.length,
        storagePath: "pending",
        tags: ["personas"],
        uploadedById: entrada.autor,
      });
    } catch (err) {
      olvidar(tenantId);
      throw err;
    }

    const storagePath = buildStoragePath({ tenantId, documentId: borrador.id, versionLabel: "v1", originalName: nombre });
    const subida = await uploadToStorage(storagePath, entrada.webp, mime);
    if (!subida.ok) {
      await DocumentsDB.hardDelete(tenantId, borrador.id);
      logger.error("[camaras.personas] storage falló", { tenantId, error: subida.error });
      return { ok: false, error: "storage" };
    }

    const n = entrada.meta.personas;
    await DocumentsDB.update(tenantId, borrador.id, {
      storagePath,
      // Con descripción propia el indexador de documentos no la manda a la IA paga.
      ocrMetadata: {
        description: `${MOTIVO_FOTO_PERSONA_LABEL[entrada.meta.motivo]}: ${n} ${n === 1 ? "persona" : "personas"} en ${entrada.camara.nombre}`,
        origen: "detector-personas",
        camaraId: entrada.camara.id,
        motivo: entrada.meta.motivo,
        personas: n,
        confianza: Math.round(entrada.meta.confianza * 100) / 100,
        // Vive y muere con la foto (misma retención y papelera): nada más se guarda.
        ...(entrada.cajas ? { cajas: entrada.cajas } : {}),
      },
    });

    DocumentsDB.log(tenantId, {
      documentId: borrador.id,
      actorId: entrada.autor,
      action: "upload",
      metadata: { origen: "detector-personas", camaraId: entrada.camara.id, size: entrada.webp.length },
    }).catch((err) => logger.warn("[camaras.personas] audit falló", { error: String(err) }));

    return { ok: true, documentId: borrador.id, carpetaId: carpetas.personas };
  } catch (err) {
    logger.error("[camaras.personas] no se pudo guardar", { tenantId, error: String(err) });
    return { ok: false, error: "no_se_pudo_guardar" };
  }
}

export interface EstadoCarpetaPersonas {
  /** `null` = no existe (o el rol no la ve). Nunca se crea desde acá. */
  carpetaId: string | null;
  /** Fotos de HOY (Lima) por id de cámara. */
  hoy: Record<string, number>;
}

/** Lectura pura: carpeta «Personas» y fotos de hoy por cámara, sin crear nada. */
export async function estadoCarpetaPersonas(
  tenantId: string,
  rol: string,
  camaras: ReadonlyArray<{ id: string; nombre: string }>,
  cuando: Date = new Date(),
): Promise<EstadoCarpetaPersonas> {
  const carpetas = await DocumentsDB.listFolders(tenantId, rol);
  const hijoDe = (padre: string | null, nombre: string) =>
    carpetas.find((f) => (f.parentId ?? null) === padre && f.name.trim().toLowerCase() === nombre.toLowerCase());

  let actual: string | null = null;
  for (const nombre of CARPETA_PERSONAS) {
    const f = hijoDe(actual, nombre);
    if (!f) return { carpetaId: null, hoy: {} };
    actual = f.id;
  }
  const hoy: Record<string, number> = {};
  const dia = limaDateKey(cuando);
  for (const c of camaras) {
    const deCamara = hijoDe(actual, nombreCarpetaCamara(c.nombre));
    const delDia = deCamara ? hijoDe(deCamara.id, dia) : undefined;
    hoy[c.id] = delDia?.documentCount ?? 0;
  }
  return { carpetaId: actual, hoy };
}
