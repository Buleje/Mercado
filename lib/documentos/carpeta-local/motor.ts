"use client";

/**
 * carpeta-local/motor — el ciclo de sincronización, de verdad.
 *
 * Junta las tres piezas: mira el disco (`disco.ts`), mira el panel (los
 * documentos que ya tiene cargados el drive), decide (`decidir.ts`) y ejecuta.
 *
 * Tres decisiones que vienen de haber roto esto antes (ADR-307):
 *  1. **En un conflicto se baja la del panel ANTES de subir la tuya.** Al revés,
 *     la copia "(del panel)" terminaba con el contenido local: se perdía la otra.
 *  2. **El `updatedAt` se relee del servidor al terminar.** Si se guarda `null`
 *     tras subir, la vuelta siguiente cree que el panel cambió y se re-baja todo,
 *     para siempre.
 *  3. **Se guarda también la ruta REAL en disco.** `Reunión 10:30.pdf` se escribe
 *     `Reunión 10_30.pdf`; sin recordar la equivalencia, el escaneo siguiente lo
 *     ve como archivo nuevo y sube un duplicado.
 */

import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { csrfHeaders } from "@/lib/csrf-client";
import { buildChildrenMap, folderPath, descendantIds } from "@/lib/documentos/folder-tree";
import {
  decidirAcciones, aRutasLogicas, nombreDeConflicto, huellaDe, resumirAcciones,
  type Accion, type DocumentoRemoto, type EstadoPrevio,
} from "./decidir";
import { rutaLogica, rutaSegura, rutaUnica, partirRutaLogica } from "./rutas";
import { escanear, escribirArchivo, leerArchivo, borrarArchivo, type EntradaEscaneada } from "./disco";

const BASE = "/api/admin/documents";

export interface PasoCiclo {
  hechas: number;
  total: number;
  ruta: string;
  tipo: Accion["tipo"];
}

export interface ResultadoCiclo {
  acciones: Accion[];
  resumen: ReturnType<typeof resumirAcciones>;
  aplicadas: number;
  /** Rutas que fallaron, con el motivo en castellano. */
  errores: { ruta: string; motivo: string }[];
  /** Conflictos resueltos: se conservaron las dos versiones. */
  conflictos: { ruta: string; copia: string }[];
  estado: Record<string, EstadoPrevio>;
  /** El escaneo se cortó por el tope de archivos. */
  cortado: boolean;
  /** Documentos del panel que comparten ruta y no se pudieron bajar. */
  rutasRepetidas: string[];
}

/**
 * Traduce los documentos del panel a rutas lógicas (`Boletas/2026/enero.pdf`).
 *
 * Con `folderIdRaiz` sólo entra ese subárbol, y las rutas se cuentan desde ahí:
 * vincular la carpeta "Contratos" del panel con una del escritorio no debería
 * crear una carpeta "Contratos" adentro.
 */
export function manifiestoRemoto(
  documentos: DbDocument[],
  carpetas: DbDocumentFolder[],
  folderIdRaiz: string | null,
): { remotos: Map<string, DocumentoRemoto>; repetidas: string[] } {
  const porId = new Map(carpetas.map((f) => [f.id, f]));
  const childrenMap = buildChildrenMap(carpetas);
  const dentro = folderIdRaiz ? descendantIds(childrenMap, folderIdRaiz) : null;

  const remotos = new Map<string, DocumentoRemoto>();
  const repetidas: string[] = [];

  for (const doc of documentos) {
    if (doc.deletedAt) continue;
    if (folderIdRaiz) {
      const suyo = doc.folderId === folderIdRaiz || (doc.folderId ? dentro!.has(doc.folderId) : false);
      if (!suyo) continue;
    }
    const cadena = folderPath(porId, doc.folderId)
      .filter((f) => !folderIdRaiz || f.id !== folderIdRaiz)
      .map((f) => f.name);
    const ruta = rutaSegura(rutaLogica(cadena, doc.name));
    if (remotos.has(ruta)) {
      // Dos documentos con el mismo nombre en la misma carpeta: en el panel
      // conviven, en un disco no. Se sincroniza el primero y el otro se nombra.
      repetidas.push(ruta);
      continue;
    }
    remotos.set(ruta, { ruta, id: doc.id, updatedAt: doc.updatedAt, size: doc.size });
  }
  return { remotos, repetidas };
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const esJson = init?.body && !(init.body instanceof FormData);
  const res = await fetch(url, {
    credentials: "include",
    headers: csrfHeaders(esJson ? { "Content-Type": "application/json" } : {}),
    ...init,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
  return (await res.json()) as T;
}

/** El error crudo, dicho para alguien que no programa. */
function motivo(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/413|too_large/.test(m)) return "pesa más de lo que acepta el drive";
  if (/415|mime_not_allowed/.test(m)) return "el drive no acepta ese tipo de archivo";
  if (/429/.test(m)) return "el servidor pidió esperar (muchos archivos seguidos)";
  if (/401|403/.test(m)) return "la sesión venció, recargá el panel";
  if (/NotAllowedError|permiso/i.test(m)) return "el navegador retiró el permiso sobre la carpeta";
  if (/NotFoundError/.test(m)) return "el archivo ya no está en la carpeta";
  return m.slice(0, 120);
}

/** Asegura las carpetas del panel para una ruta y devuelve el folderId final. */
async function asegurarCarpetaDestino(
  carpetas: string[],
  folderIdRaiz: string | null,
  cache: Map<string, string | null>,
): Promise<string | null> {
  if (carpetas.length === 0) return folderIdRaiz;
  const clave = carpetas.join("/");
  const yaEsta = cache.get(clave);
  if (yaEsta !== undefined) return yaEsta;
  const r = await pedir<{ idPorRuta: Record<string, string> }>(`${BASE}/folders/tree`, {
    method: "POST",
    body: JSON.stringify({ parentId: folderIdRaiz, rutas: [clave] }),
  });
  const id = r.idPorRuta[clave] ?? folderIdRaiz;
  cache.set(clave, id);
  return id;
}

/**
 * Una vuelta completa. Con `soloPlanificar` mira y no toca nada — es lo que
 * usa la pantalla de vinculación para poder decir qué va a pasar ANTES.
 */
export async function correrCiclo(opciones: {
  raiz: FileSystemDirectoryHandle;
  documentos: DbDocument[];
  carpetas: DbDocumentFolder[];
  estadoPrevio: Record<string, EstadoPrevio>;
  folderIdRaiz: string | null;
  soloPlanificar?: boolean;
  señal?: AbortSignal;
  onPaso?: (p: PasoCiclo) => void;
}): Promise<ResultadoCiclo> {
  const { raiz, documentos, carpetas, estadoPrevio, folderIdRaiz, señal } = opciones;

  const { archivos, cortado } = await escanear(raiz, { señal });
  const escaneadas = new Map<string, { size: number; modificado: number }>(
    [...archivos].map(([ruta, e]: [string, EntradaEscaneada]) => [ruta, { size: e.size, modificado: e.modificado }]),
  );
  const locales = aRutasLogicas(escaneadas, estadoPrevio);
  const { remotos, repetidas } = manifiestoRemoto(documentos, carpetas, folderIdRaiz);

  const acciones = decidirAcciones({ locales, remotos, previos: estadoPrevio });
  const resumen = resumirAcciones(acciones);
  const estado: Record<string, EstadoPrevio> = { ...estadoPrevio };
  const errores: { ruta: string; motivo: string }[] = [];
  const conflictos: { ruta: string; copia: string }[] = [];

  if (opciones.soloPlanificar) {
    return { acciones, resumen, aplicadas: 0, errores, conflictos, estado, cortado, rutasRepetidas: repetidas };
  }

  const cacheCarpetas = new Map<string, string | null>();
  const rutasTomadas = new Set([...locales.keys(), ...remotos.keys()]);
  const aBorrarEnPanel: { ruta: string; id: string }[] = [];
  let hechas = 0;

  const bajar = async (ruta: string, documentId: string, destino = ruta): Promise<void> => {
    const res = await fetch(`${BASE}/${documentId}/raw`, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await escribirArchivo(raiz, destino, await res.blob());
  };

  const subir = async (ruta: string, documentId: string | null): Promise<string> => {
    const local = locales.get(ruta);
    const file = await leerArchivo(raiz, local?.rutaLocal ?? ruta);
    if (!file) throw new Error("NotFoundError");
    const form = new FormData();
    form.append("file", file, partirRutaLogica(ruta).nombre);
    if (documentId) {
      form.append("changeNote", "Cambió en tu carpeta del PC");
      await pedir(`${BASE}/${documentId}/versions`, { method: "POST", body: form });
      return documentId;
    }
    const { carpetas: cadena } = partirRutaLogica(ruta);
    const folderId = await asegurarCarpetaDestino(cadena, folderIdRaiz, cacheCarpetas);
    form.append("folderId", folderId ?? "null");
    const r = await pedir<{ document: DbDocument }>(BASE, { method: "POST", body: form });
    return r.document.id;
  };

  for (const accion of acciones) {
    if (señal?.aborted) break;
    opciones.onPaso?.({ hechas, total: acciones.length, ruta: accion.ruta, tipo: accion.tipo });
    try {
      switch (accion.tipo) {
        case "bajar": {
          await bajar(accion.ruta, accion.documentId);
          estado[accion.ruta] = {
            documentId: accion.documentId,
            huella: "",              // se sella al final con lo que quedó en disco
            serverUpdatedAt: accion.updatedAt,
            rutaLocal: rutaSegura(accion.ruta),
          };
          break;
        }
        case "subir": {
          const id = await subir(accion.ruta, accion.documentId);
          const local = locales.get(accion.ruta);
          estado[accion.ruta] = {
            documentId: id,
            huella: local ? huellaDe(local) : "",
            serverUpdatedAt: "",     // se sella al final con el del servidor
            rutaLocal: local?.rutaLocal ?? rutaSegura(accion.ruta),
          };
          break;
        }
        case "conflicto": {
          // El orden NO es negociable: primero se baja la del panel a una copia
          // aparte, después se sube la local como versión nueva.
          const copia = rutaUnica(nombreDeConflicto(accion.ruta), rutasTomadas);
          rutasTomadas.add(copia);
          await bajar(accion.ruta, accion.documentId, copia);
          const id = await subir(accion.ruta, accion.documentId);
          const local = locales.get(accion.ruta);
          estado[accion.ruta] = {
            documentId: id,
            huella: local ? huellaDe(local) : "",
            serverUpdatedAt: "",
            rutaLocal: local?.rutaLocal ?? rutaSegura(accion.ruta),
          };
          conflictos.push({ ruta: accion.ruta, copia });
          break;
        }
        case "borrar-local": {
          await borrarArchivo(raiz, locales.get(accion.ruta)?.rutaLocal ?? accion.ruta);
          delete estado[accion.ruta];
          break;
        }
        case "borrar-remoto": {
          aBorrarEnPanel.push({ ruta: accion.ruta, id: accion.documentId });
          break;
        }
        case "olvidar": {
          delete estado[accion.ruta];
          break;
        }
      }
      hechas += 1;
    } catch (err) {
      errores.push({ ruta: accion.ruta, motivo: motivo(err) });
    }
  }

  // Los borrados del panel van en UNA llamada: cien archivos borrados en tu PC
  // eran cien requests contra el rate limit.
  if (aBorrarEnPanel.length > 0 && !señal?.aborted) {
    try {
      const r = await pedir<{ affected: number }>(`${BASE}/bulk`, {
        method: "POST",
        body: JSON.stringify({ action: "delete", ids: aBorrarEnPanel.map((x) => x.id) }),
      });
      for (const x of aBorrarEnPanel) delete estado[x.ruta];
      if (r.affected !== aBorrarEnPanel.length) {
        errores.push({
          ruta: `${aBorrarEnPanel.length} borrados`,
          motivo: `el panel sólo movió ${r.affected} a la papelera`,
        });
      }
    } catch (err) {
      for (const x of aBorrarEnPanel) errores.push({ ruta: x.ruta, motivo: motivo(err) });
    }
  }

  return {
    acciones, resumen, aplicadas: hechas, errores, conflictos, estado, cortado,
    rutasRepetidas: repetidas,
  };
}

/**
 * Sella el estado con la verdad de los dos lados, después del ciclo.
 *
 * Es el arreglo del bug 2: tras subir no sabemos qué `updatedAt` le quedó al
 * documento, y tras bajar no sabemos con qué fecha lo escribió el disco. Si
 * esos dos huecos quedan vacíos, la vuelta siguiente cree que todo cambió y
 * copia todo otra vez, sin parar nunca.
 */
export async function sellarEstado(
  raiz: FileSystemDirectoryHandle,
  estado: Record<string, EstadoPrevio>,
  documentos: DbDocument[],
): Promise<Record<string, EstadoPrevio>> {
  const porId = new Map(documentos.map((d) => [d.id, d]));
  const { archivos } = await escanear(raiz);
  const salida: Record<string, EstadoPrevio> = {};

  for (const [ruta, previo] of Object.entries(estado)) {
    const doc = porId.get(previo.documentId);
    const enDisco = archivos.get(previo.rutaLocal) ?? archivos.get(rutaSegura(ruta));
    // Si el documento ya no está en el panel y el archivo tampoco en disco, la
    // entrada es basura: se cae sola en el ciclo siguiente ("olvidar").
    salida[ruta] = {
      ...previo,
      serverUpdatedAt: doc?.updatedAt ?? previo.serverUpdatedAt,
      huella: enDisco ? huellaDe(enDisco) : previo.huella,
    };
  }
  return salida;
}
