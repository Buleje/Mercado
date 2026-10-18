"use client";

/**
 * Lo que el explorador del Archivo HACE, como en Windows, y cómo se deshace:
 * mover (arrastrar o Cortar + Pegar), eliminar, cambiar el nombre, crear una
 * carpeta, un documento de texto o una hoja de cálculo. Todo con los endpoints
 * de siempre (`useDocuments`); cada acción que se puede dar vuelta queda en la
 * pila de Ctrl+Z y el aviso trae su propio «Deshacer».
 *
 * Sin endpoint, no se puede: copiar (no hay duplicar), deshacer el borrado de
 * una carpeta (no van a la papelera) ni crear un .docx en blanco.
 */

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { escribirXlsx } from "@/lib/documentos/hoja-calculo";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { claveCarpeta, claveDoc } from "./contenido-explorador";
import { arrastreActual, descendientesDe, filtrarQueSeMueven, puedeSoltarEn, type CargaArrastre, type ContextoSoltar } from "./destino-soltar";
import { apilar, etiquetaDeshacer, NoSePuedeDeshacer, revertir, type AccionDeshacer, type ApiDeshacer } from "./pila-deshacer";
import { esClaveCarpeta, idDeClave } from "./use-seleccion-explorador";

export interface DepsAcciones {
  porId: Map<string, DbDocumentFolder>;
  hijos: Map<string | null, DbDocumentFolder[]>;
  docPorId: Map<string, DbDocument>;
  documentos: readonly DbDocument[];
  prompt: ReturnType<typeof useConfirm>["prompt"];
  bulk: (action: "delete" | "move", ids: string[], extra?: Record<string, unknown>) => Promise<number>;
  moveFolder: (id: string, parentId: string | null) => Promise<unknown>;
  updateFolder: (id: string, cambios: { name?: string }) => Promise<unknown>;
  renombrarDoc: (id: string, nombre: string) => Promise<unknown>;
  createFolder: (i: { name: string; parentId: string | null }) => Promise<DbDocumentFolder>;
  deleteFolder: (id: string, o: { conDocumentos?: boolean }) => Promise<unknown>;
  restoreMany: (ids: string[]) => Promise<number>;
  upload: (files: File[], o: { folderId: string | null }) => Promise<DbDocument[]>;
  /** Recarga sin poner la pantalla en «cargando». */
  refrescar: () => unknown;
  /** Las carpetas no van a la papelera: el módulo pregunta antes (y eso no se deshace). */
  eliminarCarpetas: (fs: DbDocumentFolder[]) => void;
  /** Deja resaltado lo recién creado. */
  marcar: (clave: string) => void;
}

const errorDe = (err: unknown) => (err instanceof Error ? err.message.slice(0, 120) : "error");
const cuantos = (n: number, uno: string) => (n === 1 ? uno : `${n} elementos`);
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function useAccionesExplorador(dIn: DepsAcciones) {
  // Lo último siempre: el «Deshacer» de un aviso corre minutos después.
  const ref = useRef(dIn);
  ref.current = dIn;
  // La pila vive en un ref y el estado sólo la dibuja: Ctrl+Z y el «Deshacer»
  // del aviso (o dos Ctrl+Z antes del re-render) no aplican la misma dos veces.
  const [pila, setPilaEstado] = useState<AccionDeshacer[]>([]);
  const pilaRef = useRef<AccionDeshacer[]>([]);
  const setPila = (cambio: (p: AccionDeshacer[]) => AccionDeshacer[]) => {
    pilaRef.current = cambio(pilaRef.current);
    setPilaEstado(pilaRef.current);
  };
  const [portapapeles, setPortapapeles] = useState<CargaArrastre | null>(null);
  // Dónde estaba y cómo se llamaba lo que cortaste: al pegar en otra carpeta la
  // lista ya es la de allá (sin esto, Deshacer lo devolvería a la raíz).
  const conocidos = useRef(new Map<string, { carpeta: string | null; nombre: string }>());
  const docEnCarpeta = (id: string) => {
    const doc = ref.current.docPorId.get(id);
    return doc ? doc.folderId ?? null : conocidos.current.get(id)?.carpeta ?? null;
  };
  const nombreDoc = (id: string) => ref.current.docPorId.get(id)?.name ?? conocidos.current.get(id)?.nombre;

  // Lee `ref.current` al usarse: el mismo objeto sirve en todos los dibujos.
  const [ctx] = useState<ContextoSoltar>(() => ({
    padreDeCarpeta: (id) => ref.current.porId.get(id)?.parentId ?? null,
    carpetaDeDoc: docEnCarpeta,
    descendientes: (id) => descendientesDe(id, (p) => ref.current.hijos.get(p) ?? []),
  }));

  const api: ApiDeshacer = {
    moverDocs: (ids, carpetaId) => ref.current.bulk("move", ids, { folderId: carpetaId }),
    moverCarpeta: (id, padreId) => ref.current.moveFolder(id, padreId),
    renombrarDoc: (id, n) => ref.current.renombrarDoc(id, n),
    renombrarCarpeta: (id, n) => ref.current.updateFolder(id, { name: n }),
    restaurar: async (ids) => { await ref.current.restoreMany(ids); await ref.current.refrescar(); },
    // `documentos` es sólo la carpeta abierta y `documentCount` no se refresca al
    // subir: si no, se borraba con lo subido adentro y el servidor lo soltaba en
    // la raíz (revisión 18-10). Manda el servidor.
    carpetaVacia: async (id) => {
      const d = ref.current;
      if ((d.hijos.get(id)?.length ?? 0) > 0 || d.documentos.some((x) => x.folderId === id)) return false;
      const r = await fetch(`/api/admin/documents?folderId=${encodeURIComponent(id)}`, { credentials: "same-origin" });
      if (!r.ok) return false;
      const j = (await r.json()) as { documents?: unknown[] };
      return Array.isArray(j.documents) && j.documents.length === 0;
    },
    borrarCarpeta: (id) => ref.current.deleteFolder(id, { conDocumentos: false }),
  };

  const deshacer = async (cual?: AccionDeshacer) => {
    const p = pilaRef.current;
    const a = cual ?? p[p.length - 1];
    if (!a) { toast.info("No hay nada que deshacer."); return; }
    if (!p.includes(a)) { toast.info("Eso ya se deshizo."); return; }
    setPila((p) => p.filter((x) => x !== a));
    try {
      toast.success(await revertir(a, api));
    } catch (err) {
      if (err instanceof NoSePuedeDeshacer) toast.info(err.message);
      else toast.error(`No se pudo deshacer: ${errorDe(err)}`);
    }
    if (a.tipo === "mover") void ref.current.refrescar();
  };

  const guardar = (a: AccionDeshacer, texto: string) => {
    setPila((p) => apilar(p, a));
    toast.success(texto, { action: { label: "Deshacer", onClick: () => void deshacer(a) } });
  };

  const nombreCarpeta = (id: string | null) => (id ? ref.current.porId.get(id)?.name ?? "la carpeta" : "Archivo");

  const mover = async (carga: CargaArrastre, destino: string | null) => {
    const v = puedeSoltarEn(carga, destino, ctx);
    if (!v.ok) { toast.info(v.motivo); return false; }
    const real = filtrarQueSeMueven(carga, destino, ctx);
    const d = ref.current;
    const desdeDocs = real.docs.map((id) => ({ id, desde: docEnCarpeta(id) }));
    const desdeCarpetas = new Map(real.carpetas.map((id) => [id, d.porId.get(id)?.parentId ?? null]));
    let docsMovidos = 0;
    const carpetasMovidas: string[] = [];
    let fallo = false;
    try {
      if (real.docs.length > 0) docsMovidos = await d.bulk("move", real.docs, { folderId: destino });
      for (const c of real.carpetas) {
        await d.moveFolder(c, destino);
        carpetasMovidas.push(c);
      }
    } catch (err) {
      fallo = true;
      toast.error(`No se pudo mover: ${errorDe(err)}`);
    } finally {
      // Los contadores de las carpetas los recalcula el servidor.
      void d.refrescar();
    }
    // `bulk` contesta 200 con 0 afectados si el id ya no existe o es ajeno: no
    // se anuncia ni se apila lo que no pasó. Lo que sí se movió antes de un
    // error queda en la pila (si sólo se movieron algunos archivos, deshacer
    // devuelve también los otros a donde ya están: no hace daño).
    const accion: AccionDeshacer = {
      tipo: "mover",
      docs: docsMovidos > 0 ? desdeDocs : [],
      carpetas: carpetasMovidas.map((id) => ({ id, desde: desdeCarpetas.get(id) ?? null })),
      nombreDestino: nombreCarpeta(destino),
    };
    const n = docsMovidos + carpetasMovidas.length;
    if (n === 0) {
      if (!fallo) toast.error("No se movió nada: el servidor no encontró esos archivos. Actualiza y prueba de nuevo.");
      return false;
    }
    const uno = docsMovidos > 0 && real.docs[0] ? nombreDoc(real.docs[0]) : d.porId.get(carpetasMovidas[0])?.name;
    guardar(accion, `Moviste ${cuantos(n, `«${uno ?? "1 elemento"}»`)} a «${accion.nombreDestino}».`);
    return !fallo;
  };

  const cargaDe = (claves: readonly string[]): CargaArrastre => {
    const carga = { docs: claves.filter((c) => !esClaveCarpeta(c)).map(idDeClave), carpetas: claves.filter(esClaveCarpeta).map(idDeClave) };
    for (const id of carga.docs) {
      const doc = ref.current.docPorId.get(id);
      if (doc) conocidos.current.set(id, { carpeta: doc.folderId ?? null, nombre: doc.name });
    }
    return carga;
  };

  const eliminar = async (claves: readonly string[]) => {
    const { docs, carpetas } = cargaDe(claves);
    const d = ref.current;
    if (docs.length > 0) {
      try {
        const nombre = d.docPorId.get(docs[0])?.name ?? "archivo";
        // Con 0 afectados `bulk` ya dice qué pasó: no se apila un «Deshacer» vacío.
        const borrados = await d.bulk("delete", docs);
        if (borrados > 0) {
          guardar(
            { tipo: "eliminar", docs, nombre },
            borrados === 1 && docs.length === 1 ? `«${nombre}» se fue a la papelera.` : `${borrados} archivos se fueron a la papelera.`,
          );
        }
      } catch (err) {
        toast.error(`No se pudo eliminar: ${errorDe(err)}`);
      }
    }
    const fs = carpetas.map((id) => d.porId.get(id)).filter((f): f is DbDocumentFolder => !!f);
    if (fs.length > 0) d.eliminarCarpetas(fs);
  };

  const cortar = (claves: readonly string[]) => {
    if (claves.length === 0) return;
    setPortapapeles(cargaDe(claves));
    toast.info(`Cortaste ${cuantos(claves.length, "1 elemento")}: entra a otra carpeta y pégalo con Ctrl+V.`);
  };

  const pegar = async (destino: string | null) => {
    if (!portapapeles) { toast.info("No hay nada cortado: usa Cortar (Ctrl+X) primero."); return; }
    if (await mover(portapapeles, destino)) setPortapapeles(null);
  };

  const pedirNombre = (titulo: string, defecto: string) =>
    ref.current.prompt({ title: titulo, label: "Nombre", defaultValue: defecto, required: true, confirmLabel: "Crear" });

  const nuevaCarpeta = async (padre: string | null) => {
    const nombre = (await pedirNombre("Nueva carpeta", "Nueva carpeta"))?.trim();
    if (!nombre) return;
    try {
      const f = await ref.current.createFolder({ name: nombre, parentId: padre });
      setPila((p) => apilar(p, { tipo: "crear-carpeta", id: f.id, nombre: f.name }));
      ref.current.marcar(claveCarpeta(f.id));
      toast.success(`Creaste la carpeta «${f.name}».`);
    } catch (err) {
      toast.error(`No se pudo crear la carpeta: ${errorDe(err)}`);
    }
  };

  /** Sube un archivo nuevo y ofrece abrirlo en el editor para escribirlo. */
  const crearArchivo = async (padre: string | null, file: File) => {
    try {
      const [doc] = await ref.current.upload([file], { folderId: padre });
      if (!doc) { toast.error("No se pudo crear el archivo."); return; }
      ref.current.marcar(claveDoc(doc.id));
      toast.success(`Creaste «${doc.name}».`, {
        action: { label: "Escribir", onClick: () => window.open(`/admin/documentos/${doc.id}/editar`, "_blank", "noopener") },
      });
    } catch (err) {
      toast.error(`No se pudo crear el archivo: ${errorDe(err)}`);
    }
  };

  const conExtension = (nombre: string, ext: string) => (nombre.toLowerCase().endsWith(`.${ext}`) ? nombre : `${nombre}.${ext}`);

  const nuevoTexto = async (padre: string | null) => {
    const nombre = (await pedirNombre("Nuevo documento de texto", "Nuevo documento de texto"))?.trim();
    if (!nombre) return;
    // Un archivo de 0 bytes no se sube («está vacío»): va con la marca UTF-8.
    await crearArchivo(padre, new File(["﻿"], conExtension(nombre, "txt"), { type: "text/plain" }));
  };

  const nuevaHoja = async (padre: string | null) => {
    const nombre = (await pedirNombre("Nueva hoja de cálculo", "Nueva hoja de cálculo"))?.trim();
    if (!nombre) return;
    const blob = await escribirXlsx([{ nombre: "Hoja1", filas: [[""]], tieneFormulas: false }]);
    await crearArchivo(padre, new File([blob], conExtension(nombre, "xlsx"), { type: MIME_XLSX }));
  };

  const renombrar = async (clave: string) => {
    const d = ref.current;
    const id = idDeClave(clave);
    const carpeta = esClaveCarpeta(clave);
    const actual = carpeta ? d.porId.get(id)?.name : d.docPorId.get(id)?.name;
    if (actual === undefined) return;
    const nuevo = (await d.prompt({ title: "Cambiar nombre", label: "Nombre", defaultValue: actual, required: true, confirmLabel: "Guardar" }))?.trim();
    if (!nuevo || nuevo === actual) return;
    try {
      if (carpeta) await d.updateFolder(id, { name: nuevo });
      else await d.renombrarDoc(id, nuevo);
      guardar({ tipo: "renombrar", objeto: carpeta ? "carpeta" : "doc", id, antes: actual, despues: nuevo }, `Ahora se llama «${nuevo}».`);
    } catch (err) {
      toast.error(`No se pudo cambiar el nombre: ${errorDe(err)}`);
    }
  };

  /** Mientras se arrastra: ¿esta carpeta lo puede recibir? (pinta el destino). */
  const puedeSoltar = useCallback((destino: string | null) => puedeSoltarEn(arrastreActual(), destino, ctx).ok, [ctx]);

  const cortados = new Set([...(portapapeles?.docs.map(claveDoc) ?? []), ...(portapapeles?.carpetas.map(claveCarpeta) ?? [])]);

  return {
    mover,
    puedeSoltar,
    eliminar,
    cortar,
    pegar,
    hayCortado: !!portapapeles,
    estaCortado: (clave: string) => cortados.has(clave),
    soltarPortapapeles: () => setPortapapeles(null),
    nuevaCarpeta,
    nuevoTexto,
    nuevaHoja,
    renombrar,
    deshacer: () => void deshacer(),
    etiquetaDeshacer: etiquetaDeshacer(pila[pila.length - 1]),
    cargaDe,
  };
}

export type AccionesExplorador = ReturnType<typeof useAccionesExplorador>;
