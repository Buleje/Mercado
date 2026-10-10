/**
 * Lo que se carga en «Documentos» mientras el plan todavía no existe (ADR-467).
 *
 * En un alta no hay id: no hay raíz en el Drive, ni carpeta donde subir, ni
 * plan al que colgar un casillero «sólo de este plan». Todo queda EN MEMORIA
 * —los `File` incluidos— y se escribe recién al guardar, en este orden:
 *
 *   crear plan → preparar → carpetas nuevas → casilleros nuevos → subir cada
 *   archivo (+ etiqueta y vencimiento) → datos de cada carpeta.
 *
 * Cada paso que entra se SACA de los pendientes: si el tercer archivo falla,
 * «Reintentar» vuelve a mandar sólo ese —sin duplicar el plan, las carpetas ni
 * los dos archivos que ya subieron—. Un archivo que subió pero no pudo
 * etiquetarse guarda su `documentId`: el reintento sólo lo etiqueta.
 */

import { claveDesdeNombre } from "@/lib/campos-personalizados";
import {
  guardarValoresPendientes,
  hayPendientes,
  type PendientesCampos,
} from "@/hooks/use-campos-personalizados";
import { subirArchivosAlDrive } from "@/hooks/use-documents";
import { formularioDeCarpeta, type CarpetaDelPlan, type PlanDocumentosVista } from "@/lib/forestal/plan-documentos-tipos";
import { crearCarpeta, crearCasilleroArchivo, etiquetarDocumento, leerVista, prepararCarpetas } from "./plan-documentos-api";

/** A qué casillero va un archivo: por id si ya existe, si no por su clave. */
export interface RefCasillero {
  id: string | null;
  clave: string;
  nombre: string;
}

export interface ArchivoPendiente {
  /** Identidad local (la `key` de la fila). */
  id: string;
  file: File;
  carpetaClave: string;
  /** `null` = suelto en la carpeta, sin casillero. */
  casillero: RefCasillero | null;
  /** `YYYY-MM-DD` o null. */
  vence: string | null;
  /** Subió pero falta etiquetarlo: el reintento no lo vuelve a subir. */
  documentId?: string;
  /** Las etiquetas que le puso la subida: el PATCH reemplaza la lista entera. */
  documentTags?: string[];
  /** El motivo del último intento fallido. */
  error?: string;
}

export interface CarpetaPendiente {
  /** Clave local («nueva-1»): la real la pone el servidor al crearla. */
  clave: string;
  nombre: string;
  paraTodosLosPlanes: boolean;
}

export interface CasilleroPendiente {
  clave: string;
  carpetaClave: string;
  nombre: string;
  descripcion: string;
  soloEstePlan: boolean;
}

export interface PendientesDocumentos {
  carpetas: CarpetaPendiente[];
  casilleros: CasilleroPendiente[];
  archivos: ArchivoPendiente[];
  /** Lo escrito en los campos de texto de cada carpeta, por clave de carpeta. */
  datos: Record<string, PendientesCampos>;
}

export const documentosVacios = (): PendientesDocumentos => ({ carpetas: [], casilleros: [], archivos: [], datos: {} });

export const hayDocumentosPendientes = (p: PendientesDocumentos): boolean =>
  p.carpetas.length > 0 || p.casilleros.length > 0 || p.archivos.length > 0 || Object.values(p.datos).some(hayPendientes);

let secuencia = 0;
export const idLocal = (prefijo: string): string => `${prefijo}-${(secuencia += 1)}`;

export interface PasoGuardado {
  fase: "preparando" | "carpetas" | "subiendo" | "datos";
  hechos: number;
  total: number;
}

export interface ResultadoGuardado {
  /** Lo que NO entró: queda para el reintento. */
  restante: PendientesDocumentos;
  errores: string[];
  subidos: number;
}

/** El casillero de la vista que corresponde a una referencia del alta. */
function casilleroEn(carpeta: CarpetaDelPlan | undefined, ref: RefCasillero, creados: Map<string, string>): string | null {
  if (!carpeta) return null;
  const idNuevo = creados.get(ref.clave);
  if (idNuevo) return idNuevo;
  const hit =
    carpeta.casilleros.find((c) => ref.id != null && c.campo.id === ref.id) ??
    carpeta.casilleros.find((c) => c.campo.clave === ref.clave) ??
    carpeta.casilleros.find((c) => claveDesdeNombre(c.campo.nombre) === claveDesdeNombre(ref.nombre));
  return hit?.campo.id ?? null;
}

/**
 * Escribe todo lo pendiente de un alta, ahora que el plan tiene id.
 *
 * Nunca tira: el plan YA se guardó, así que cada falla se cuenta con su
 * nombre («DNI.jpg: pesa más de lo permitido») y lo que no entró vuelve en
 * `restante` para reintentar.
 */
export async function guardarDocumentosPendientes(
  planId: string,
  pend: PendientesDocumentos,
  onPaso?: (p: PasoGuardado) => void,
): Promise<ResultadoGuardado> {
  const errores: string[] = [];
  const restante: PendientesDocumentos = { carpetas: [], casilleros: [], archivos: [], datos: {} };
  if (!hayDocumentosPendientes(pend)) return { restante, errores, subidos: 0 };

  // 1 · La raíz y las carpetas de la plantilla en el Drive.
  onPaso?.({ fase: "preparando", hechos: 0, total: 1 });
  let vista: PlanDocumentosVista;
  try {
    vista = await prepararCarpetas(planId);
  } catch (e) {
    return { restante: pend, errores: [`No se pudieron preparar las carpetas del plan: ${e instanceof Error ? e.message : String(e)}`], subidos: 0 };
  }

  // 2 · Carpetas nuevas. La clave real la decide el servidor: se reconoce la
  //     que no estaba antes y se llama igual.
  const claveReal = new Map<string, string>();
  const totalCarpetas = pend.carpetas.length + pend.casilleros.length;
  let hechosCarpetas = 0;
  for (const c of pend.carpetas) {
    onPaso?.({ fase: "carpetas", hechos: hechosCarpetas, total: totalCarpetas });
    const antes = new Set(vista.carpetas.map((x) => x.clave));
    try {
      vista = await crearCarpeta({ planId, nombre: c.nombre.trim(), paraTodosLosPlanes: c.paraTodosLosPlanes });
      const nueva =
        vista.carpetas.find((x) => !antes.has(x.clave) && x.nombre.trim() === c.nombre.trim()) ??
        vista.carpetas.find((x) => !antes.has(x.clave));
      if (nueva) claveReal.set(c.clave, nueva.clave);
      else throw new Error("el servidor no la devolvió");
    } catch (e) {
      errores.push(`Carpeta «${c.nombre}»: ${e instanceof Error ? e.message : String(e)}`);
      restante.carpetas.push(c);
    }
    hechosCarpetas += 1;
  }
  const real = (clave: string): string | null => {
    if (!pend.carpetas.some((c) => c.clave === clave)) return clave;
    return claveReal.get(clave) ?? null;
  };
  /* Lo que queda para el reintento apunta a la clave REAL si la carpeta ya se
     creó: la clave local deja de existir cuando sale de `restante.carpetas`. */
  const paraReintento = (clave: string): string => real(clave) ?? clave;

  // 3 · Casilleros nuevos (antes que los archivos que van en ellos).
  const casilleroCreado = new Map<string, string>();
  for (const cas of pend.casilleros) {
    onPaso?.({ fase: "carpetas", hechos: hechosCarpetas, total: totalCarpetas });
    const carpeta = real(cas.carpetaClave);
    if (!carpeta) {
      restante.casilleros.push(cas);
      hechosCarpetas += 1;
      continue;
    }
    try {
      const campo = await crearCasilleroArchivo({
        carpetaClave: carpeta,
        nombre: cas.nombre,
        descripcion: cas.descripcion,
        soloParaRegistroId: cas.soloEstePlan ? planId : null,
      });
      casilleroCreado.set(cas.clave, campo.id);
    } catch (e) {
      errores.push(`Documento «${cas.nombre}»: ${e instanceof Error ? e.message : String(e)}`);
      restante.casilleros.push({ ...cas, carpetaClave: carpeta });
    }
    hechosCarpetas += 1;
  }
  if (pend.carpetas.length > 0 || pend.casilleros.length > 0) {
    vista = await leerVista(planId).catch(() => vista);
  }

  // 4 · Archivos. Cada uno sabe su carpeta (folderId) y su casillero (campoId).
  const destino = new Map<string, { folderId: string; campoId: string | null }>();
  const aSubir: ArchivoPendiente[] = [];
  const soloEtiquetar: ArchivoPendiente[] = [];
  /* El archivo que iba a un casillero recién creado se queda con su id: si
     falla la subida, el reintento lo encuentra sin volver a crearlo. */
  const conIdReal = (a: ArchivoPendiente): ArchivoPendiente => {
    const id = a.casillero && !a.casillero.id ? casilleroCreado.get(a.casillero.clave) : undefined;
    return { ...a, carpetaClave: paraReintento(a.carpetaClave), casillero: id && a.casillero ? { ...a.casillero, id } : a.casillero };
  };
  for (const a of pend.archivos) {
    const clave = real(a.carpetaClave);
    const carpeta = clave ? vista.carpetas.find((c) => c.clave === clave) : undefined;
    const campoId = a.casillero ? casilleroEn(carpeta, a.casillero, casilleroCreado) : null;
    if (!carpeta?.folderId || (a.casillero && !campoId)) {
      restante.archivos.push({ ...conIdReal(a), error: !carpeta?.folderId ? "su carpeta no se pudo crear" : "su casillero no se pudo crear" });
      continue;
    }
    destino.set(a.id, { folderId: carpeta.folderId, campoId });
    (a.documentId ? soloEtiquetar : aSubir).push(a);
  }

  const total = aSubir.length + soloEtiquetar.length;
  let hechos = 0;
  let subidos = 0;
  onPaso?.({ fase: "subiendo", hechos, total });
  const porFile = new Map(aSubir.map((a) => [a.file, a]));
  const motivos = new Map<string, string>();
  const subidosDoc = new Map<string, { id: string; tags: string[] }>();
  if (aSubir.length > 0) {
    await subirArchivosAlDrive(
      aSubir.map((a) => a.file),
      {
        folderIdDe: (f) => destino.get(porFile.get(f)?.id ?? "")?.folderId ?? null,
        onSubido: (f, doc) => {
          const a = porFile.get(f);
          if (a) subidosDoc.set(a.id, { id: doc.id, tags: doc.tags ?? [] });
        },
        onEstado: (f, estado, m) => {
          const a = porFile.get(f);
          if (a && estado === "error") motivos.set(a.id, m ?? "no se pudo subir");
        },
        onProgress: (d) => onPaso?.({ fase: "subiendo", hechos: d, total }),
      },
    ).catch((e: unknown) => {
      for (const a of aSubir) if (!subidosDoc.has(a.id)) motivos.set(a.id, e instanceof Error ? e.message : String(e));
    });
  }
  hechos = aSubir.length;

  for (const a of [...aSubir, ...soloEtiquetar]) {
    const doc = subidosDoc.get(a.id) ?? (a.documentId ? { id: a.documentId, tags: a.documentTags ?? [] } : null);
    if (!doc) {
      const m = motivos.get(a.id) ?? "no se pudo subir";
      errores.push(`${a.file.name}: ${m}`);
      restante.archivos.push({ ...conIdReal(a), error: m });
      continue;
    }
    const d = destino.get(a.id);
    try {
      if (d?.campoId || a.vence) await etiquetarDocumento(doc, { campoId: d?.campoId ?? null, expiresAt: a.vence ?? undefined });
      subidos += 1;
    } catch (e) {
      const m = `subió, pero no se pudo ${d?.campoId ? "poner en su casillero" : "guardar el vencimiento"} (${e instanceof Error ? e.message : String(e)})`;
      errores.push(`${a.file.name}: ${m}`);
      restante.archivos.push({ ...conIdReal(a), documentId: doc.id, documentTags: doc.tags, error: m });
    }
    if (a.documentId) hechos += 1;
    onPaso?.({ fase: "subiendo", hechos: Math.min(hechos, total), total });
  }

  // 5 · Lo escrito en los campos de texto de cada carpeta.
  const conDatos = Object.entries(pend.datos).filter(([, p]) => hayPendientes(p));
  let hechosDatos = 0;
  for (const [clave, datos] of conDatos) {
    onPaso?.({ fase: "datos", hechos: hechosDatos, total: conDatos.length });
    const carpeta = real(clave);
    if (!carpeta) {
      restante.datos[clave] = datos;
      continue;
    }
    const r = await guardarValoresPendientes(planId, { ...datos, formulario: formularioDeCarpeta(carpeta) });
    if (r.errores.length > 0) {
      errores.push(...r.errores);
      /* Los campos que SÍ se crearon no se vuelven a mandar (darían «ya
         existe»); los valores se reintentan enteros: guardarlos dos veces
         escribe lo mismo. */
      const fallidos = datos.nuevos.filter((n) => r.errores.some((e) => e.startsWith(`${n.nombre}:`)));
      restante.datos[carpeta] = { ...datos, formulario: formularioDeCarpeta(carpeta), nuevos: fallidos };
    }
    hechosDatos += 1;
  }

  return { restante, errores, subidos };
}
