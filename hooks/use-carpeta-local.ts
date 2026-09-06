"use client";

/**
 * use-carpeta-local — vincular una carpeta del escritorio con el drive.
 *
 * Guarda el vínculo, corre el ciclo cada tanto mientras el panel esté abierto y
 * expone lo que la pantalla necesita mostrar: si hay permiso, qué se hizo la
 * última vez y qué está pasando ahora.
 *
 * Deliberadamente NO sincroniza solo la primera vez: `planificar()` devuelve lo
 * que VA a pasar y la pantalla lo muestra para que la persona confirme. Vincular
 * una carpeta vacía con un drive de 264 archivos y otra llena con uno vacío son
 * dos situaciones muy distintas, y sólo el dueño sabe cuál quería.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { elegirCarpeta, permisoDeEscritura, soportado } from "@/lib/documentos/carpeta-local/disco";
import {
  leerVinculo, guardarVinculo, olvidarVinculo, type VinculoGuardado,
} from "@/lib/documentos/carpeta-local/almacen";
import { correrCiclo, sellarEstado, type PasoCiclo, type ResultadoCiclo } from "@/lib/documentos/carpeta-local/motor";

/** Cada cuánto mira la carpeta mientras el panel está abierto. */
const CADA_MS = 60_000;

/**
 * El error crudo del navegador, dicho en castellano.
 *
 * La File System Access API tira `NotFoundError` y compañía con textos en
 * inglés que no significan nada para quien está mirando el panel ("A requested
 * file or directory could not be found at the time an operation was
 * processed."). Se traduce lo que puede pasar de verdad.
 */
function motivoDelNavegador(err: unknown): string {
  const nombre = err instanceof DOMException ? err.name : "";
  const texto = err instanceof Error ? err.message : String(err);
  if (nombre === "NotFoundError" || /could not be found/i.test(texto)) {
    return "No encuentro la carpeta: puede que la hayas movido, renombrado o borrado. Volvé a vincularla.";
  }
  if (nombre === "NotAllowedError" || /permission/i.test(texto)) {
    return "El navegador retiró el permiso sobre la carpeta. Dale permiso de nuevo.";
  }
  if (nombre === "NoModificationAllowedError") return "Otro programa tiene la carpeta abierta y no deja escribir.";
  if (nombre === "QuotaExceededError" || /quota/i.test(texto)) return "No hay espacio en el disco.";
  if (nombre === "SecurityError") return "El navegador bloqueó el acceso a esa carpeta por seguridad.";
  if (/failed to fetch|network/i.test(texto)) return "Se cortó la conexión con el panel.";
  return texto.slice(0, 160);
}

/**
 * El drive tal como está AHORA en el servidor.
 *
 * El ciclo no puede confiar en lo que la pantalla tenga cargado: alguien pudo
 * subir un documento desde el celular, o el listado puede ser de hace rato. Si
 * la consulta falla, el llamador sigue con lo que tenía — mejor un ciclo con
 * datos viejos que ninguno.
 */
async function traerPanel(): Promise<{ documentos: DbDocument[]; carpetas: DbDocumentFolder[] } | null> {
  try {
    const [d, f] = await Promise.all([
      fetch("/api/admin/documents", { credentials: "include" }),
      fetch("/api/admin/documents/folders", { credentials: "include" }),
    ]);
    if (!d.ok || !f.ok) return null;
    const dj = await d.json();
    const fj = await f.json();
    const documentos = (Array.isArray(dj) ? dj : dj?.documents) as DbDocument[] | undefined;
    const carpetas = (Array.isArray(fj) ? fj : fj?.folders) as DbDocumentFolder[] | undefined;
    if (!Array.isArray(documentos) || !Array.isArray(carpetas)) return null;
    return { documentos, carpetas };
  } catch {
    return null;
  }
}

export type EstadoSync = "sin-vincular" | "sin-permiso" | "listo" | "planificando" | "sincronizando" | "error";

export interface UseCarpetaLocal {
  soportado: boolean;
  vinculo: VinculoGuardado | null;
  estado: EstadoSync;
  paso: PasoCiclo | null;
  ultimo: ResultadoCiclo | null;
  error: string | null;
  /** Plan del primer ciclo, para confirmarlo antes de tocar nada. */
  plan: ResultadoCiclo | null;
  vincular: (folderIdRaiz: string | null) => Promise<void>;
  darPermiso: () => Promise<void>;
  planificar: () => Promise<ResultadoCiclo | null>;
  sincronizar: () => Promise<ResultadoCiclo | null>;
  desvincular: () => Promise<void>;
  alternarPausa: () => Promise<void>;
  descartarPlan: () => void;
}

export function useCarpetaLocal(opciones: {
  tenantId: string;
  documentos: DbDocument[];
  carpetas: DbDocumentFolder[];
  /** Se llama al terminar un ciclo que cambió algo, para refrescar el drive. */
  onCambios: () => void;
}): UseCarpetaLocal {
  const { tenantId, onCambios } = opciones;
  const [vinculo, setVinculo] = useState<VinculoGuardado | null>(null);
  const [estado, setEstado] = useState<EstadoSync>("sin-vincular");
  const [paso, setPaso] = useState<PasoCiclo | null>(null);
  const [ultimo, setUltimo] = useState<ResultadoCiclo | null>(null);
  const [plan, setPlan] = useState<ResultadoCiclo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Los documentos cambian en cada refresh del drive; el ciclo tiene que leer
  // los ÚLTIMOS sin volver a crearse (si no, el intervalo se reinicia siempre).
  const datosRef = useRef({ documentos: opciones.documentos, carpetas: opciones.carpetas });
  datosRef.current = { documentos: opciones.documentos, carpetas: opciones.carpetas };
  const corriendoRef = useRef(false);
  const vinculoRef = useRef<VinculoGuardado | null>(null);
  vinculoRef.current = vinculo;

  const puedeVincular = soportado();

  useEffect(() => {
    if (!puedeVincular || !tenantId) return;
    let vivo = true;
    void (async () => {
      const v = await leerVinculo(tenantId).catch(() => null);
      if (!vivo) return;
      if (!v) { setVinculo(null); setEstado("sin-vincular"); return; }
      setVinculo(v);
      // Al reabrir el panel el permiso vuelve a "prompt": hace falta un click
      // de la persona para recuperarlo, así que acá sólo se consulta.
      const permiso = await permisoDeEscritura(v.handle).catch(() => "denied" as const);
      setEstado(permiso === "granted" ? "listo" : "sin-permiso");
    })();
    return () => { vivo = false; };
  }, [tenantId, puedeVincular]);

  const vincular = useCallback(async (folderIdRaiz: string | null) => {
    setError(null);
    try {
      const handle = await elegirCarpeta();
      if (!handle) return; // canceló el selector
      const nuevo: VinculoGuardado = {
        tenantId,
        handle,
        nombre: handle.name,
        folderIdRaiz,
        vinculadaEl: new Date().toISOString(),
        estado: {},
        ultimaSync: null,
        pausado: false,
      };
      await guardarVinculo(nuevo);
      setVinculo(nuevo);
      setEstado("listo");
    } catch (err) {
      setError(motivoDelNavegador(err));
      setEstado("error");
    }
  }, [tenantId]);

  const darPermiso = useCallback(async () => {
    const v = vinculoRef.current;
    if (!v) return;
    const permiso = await permisoDeEscritura(v.handle, { pedir: true }).catch(() => "denied" as const);
    setEstado(permiso === "granted" ? "listo" : "sin-permiso");
    if (permiso !== "granted") setError("El navegador no dio permiso sobre la carpeta.");
  }, []);

  /** Corre una vuelta. Con `soloPlanificar` no toca nada. */
  const correr = useCallback(async (soloPlanificar: boolean): Promise<ResultadoCiclo | null> => {
    const v = vinculoRef.current;
    if (!v || corriendoRef.current) return null;
    const permiso = await permisoDeEscritura(v.handle).catch(() => "denied" as const);
    if (permiso !== "granted") { setEstado("sin-permiso"); return null; }

    corriendoRef.current = true;
    setEstado(soloPlanificar ? "planificando" : "sincronizando");
    setError(null);
    try {
      // El ciclo pide el panel al servidor en vez de mirar lo que la pantalla
      // tenga cargado: si alguien subió un documento desde el celular mientras
      // esta pestaña estaba abierta, el sync lo tiene que ver igual.
      const frescos = await traerPanel();
      const documentosAhora = frescos?.documentos ?? datosRef.current.documentos;
      const carpetasAhora = frescos?.carpetas ?? datosRef.current.carpetas;

      // Si la carpeta del panel con la que se emparejó ya no está, seguir
      // significaría tratar TODO el drive como si fuera esa carpeta: bajaría a
      // la carpeta del escritorio cientos de archivos que no le corresponden.
      if (v.folderIdRaiz && !carpetasAhora.some((f) => f.id === v.folderIdRaiz)) {
        setError("La carpeta del panel con la que estaba emparejada ya no existe. Desvinculá y elegí otra.");
        setEstado("error");
        return null;
      }

      const res = await correrCiclo({
        raiz: v.handle,
        documentos: documentosAhora,
        carpetas: carpetasAhora,
        estadoPrevio: v.estado,
        folderIdRaiz: v.folderIdRaiz,
        soloPlanificar,
        onPaso: setPaso,
      });

      if (soloPlanificar) { setPlan(res); return res; }

      // Sellar con la verdad de los dos lados ANTES de guardar: si el estado
      // queda a medias, el ciclo siguiente copia todo otra vez sin parar.
      let documentos = documentosAhora;
      if (res.aplicadas > 0) {
        onCambios();
        const despues = await traerPanel();
        if (despues) documentos = despues.documentos;
      }
      const estadoFinal = await sellarEstado(v.handle, res.estado, documentos);
      const guardado: VinculoGuardado = { ...v, estado: estadoFinal, ultimaSync: new Date().toISOString() };
      await guardarVinculo(guardado);
      setVinculo(guardado);
      // Se conserva el último ciclo QUE HIZO ALGO: la revisión automática de
      // cada minuto no encuentra nada casi nunca, y si pisara el resumen, el
      // "5 subidos" de hace un rato desaparecería antes de que nadie lo lea.
      setUltimo((previo) => (res.resumen.total > 0 || !previo ? res : previo));
      setPlan(null);
      return res;
    } catch (err) {
      setError(motivoDelNavegador(err));
      setEstado("error");
      return null;
    } finally {
      corriendoRef.current = false;
      setPaso(null);
      setEstado((e) => (e === "error" ? e : "listo"));
    }
  }, [onCambios]);

  const planificar = useCallback(() => correr(true), [correr]);
  const sincronizar = useCallback(() => correr(false), [correr]);

  const desvincular = useCallback(async () => {
    await olvidarVinculo(tenantId);
    setVinculo(null);
    setUltimo(null);
    setPlan(null);
    setEstado("sin-vincular");
  }, [tenantId]);

  const alternarPausa = useCallback(async () => {
    const v = vinculoRef.current;
    if (!v) return;
    const guardado = { ...v, pausado: !v.pausado };
    await guardarVinculo(guardado);
    setVinculo(guardado);
  }, []);

  // Ciclo automático. Sólo con permiso, sin pausa y sin un plan esperando
  // confirmación: no puede empezar a copiar mientras la persona está decidiendo.
  useEffect(() => {
    if (estado !== "listo" || !vinculo || vinculo.pausado || plan) return;
    const t = window.setInterval(() => { void correr(false); }, CADA_MS);
    return () => window.clearInterval(t);
  }, [estado, vinculo, plan, correr]);

  return {
    soportado: puedeVincular,
    vinculo,
    estado,
    paso,
    ultimo,
    error,
    plan,
    vincular,
    darPermiso,
    planificar,
    sincronizar,
    desvincular,
    alternarPausa,
    descartarPlan: () => setPlan(null),
  };
}
