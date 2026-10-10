"use client";

/**
 * use-plan-documentos — «Documentos del plan» con el plan ya guardado (ADR-467).
 *
 * La vista la manda el servidor y toda escritura la devuelve entera: acá no se
 * arma estado a mano, se reemplaza. Lo único propio de la pantalla son las
 * subidas en curso (cada archivo con su estado: comprimiendo, subiendo, listo,
 * error), que se pintan en su casillero mientras viajan.
 *
 * Tres cosas que se tratan como normales y no como error:
 *   · el plan sin preparar: la primera subida crea las carpetas en el Drive
 *     (nada de carpetas vacías por sólo abrir la pestaña);
 *   · un despliegue sin la función (404) o un rol que no la ve (403):
 *     `disponible: false` y la sección no se muestra;
 *   · la carga vieja que vuelve después de una escritura: no pisa la vista
 *     nueva (misma guarda que `use-campos-personalizados`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subirArchivosAlDrive } from "@/hooks/use-documents";
import { limaDateKey } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";
import type { PlanDocumentosVista } from "@/lib/forestal/plan-documentos-tipos";
import {
  DocumentosNoDisponibles,
  adoptarCarpeta,
  cambiarVencimiento as patchVencimiento,
  crearCarpeta as postCarpeta,
  crearCasilleroArchivo,
  editarCarpeta,
  editarPlantilla,
  etiquetarDocumento,
  leerPlantilla,
  leerVista,
  mandarAPapelera,
  prepararCarpetas,
  type PlantillaCarpeta,
} from "../plan-documentos/plan-documentos-api";
import { SEMILLA_CARPETAS_PLAN } from "@/lib/forestal/plan-documentos-semilla";
import { carpetasDelAlta, carpetasDelServidor, plantillaDeSemilla, type CarpetaVista, type CasilleroVista } from "../plan-documentos/modelo";
import { documentosVacios } from "../plan-documentos/pendientes";

/** La plantilla sugerida, en la forma de pintar: estable entre renders. */
export const SEMILLA = plantillaDeSemilla(SEMILLA_CARPETAS_PLAN);

export type EstadoSubida = "en-cola" | "comprimiendo" | "subiendo" | "listo" | "error";

export interface SubidaEnCurso {
  key: string;
  nombre: string;
  carpetaClave: string;
  /** null = suelto en la carpeta. */
  casilleroClave: string | null;
  estado: EstadoSubida;
  motivo?: string;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
let secuencia = 0;

export function usePlanDocumentos({ planId, activo = true }: { planId: string | null; activo?: boolean }) {
  const [vista, setVista] = useState<PlanDocumentosVista | null>(null);
  /* Arranca «cargando» si hay algo que leer: sin esto el primer cuadro decía
     «Todavía no hay carpetas» antes de preguntar. */
  const [cargando, setCargando] = useState(() => Boolean(planId) && activo);
  const [error, setError] = useState<string | null>(null);
  const [disponible, setDisponible] = useState(true);
  const [subidas, setSubidas] = useState<SubidaEnCurso[]>([]);
  const [trabajando, setTrabajando] = useState(0);
  const cargasRef = useRef({ ultima: 0, escrituras: 0 });

  const cargar = useCallback(async () => {
    if (!planId) return;
    const esta = ++cargasRef.current.ultima;
    const escriturasAlSalir = cargasRef.current.escrituras;
    setCargando(true);
    try {
      const v = await leerVista(planId);
      if (esta === cargasRef.current.ultima && escriturasAlSalir === cargasRef.current.escrituras) {
        setVista(v);
        setError(null);
        setDisponible(true);
      }
    } catch (e) {
      if (esta !== cargasRef.current.ultima) return;
      if (e instanceof DocumentosNoDisponibles) setDisponible(false);
      else setError(mensaje(e));
    } finally {
      if (esta === cargasRef.current.ultima) setCargando(false);
    }
  }, [planId]);

  useEffect(() => {
    if (!activo || !planId) return;
    void cargar();
  }, [activo, planId, cargar]);

  /** Una escritura que devuelve la vista: la reemplaza y avisa a la carga vieja. */
  const aplicar = useCallback((v: PlanDocumentosVista) => {
    cargasRef.current.escrituras += 1;
    setVista(v);
    setError(null);
  }, []);

  /** Envuelve una escritura: cuenta como trabajo en curso y devuelve el motivo si falla. */
  const escribir = useCallback(
    async (fn: () => Promise<PlanDocumentosVista>): Promise<string | null> => {
      setTrabajando((n) => n + 1);
      try {
        aplicar(await fn());
        return null;
      } catch (e) {
        return mensaje(e);
      } finally {
        setTrabajando((n) => n - 1);
      }
    },
    [aplicar],
  );

  const actualizarSubida = useCallback((key: string, cambio: Partial<SubidaEnCurso>) => {
    setSubidas((prev) => prev.map((s) => (s.key === key ? { ...s, ...cambio } : s)));
  }, []);

  /**
   * Sube al Drive con el mismo pipeline del módulo Documentos y, después, pone
   * cada archivo en su casillero. Si el plan todavía no tenía carpetas, las
   * prepara primero.
   */
  const subir = useCallback(
    async (files: File[], carpeta: CarpetaVista, casillero: CasilleroVista | null): Promise<void> => {
      if (!planId || files.length === 0) return;
      const keys = new Map(files.map((f) => [f, `sub-${(secuencia += 1)}`]));
      setSubidas((prev) => [
        ...prev.filter((s) => s.estado !== "listo"),
        ...files.map((f) => ({
          key: keys.get(f) ?? "",
          nombre: f.name,
          carpetaClave: carpeta.clave,
          casilleroClave: casillero?.clave ?? null,
          estado: "en-cola" as EstadoSubida,
        })),
      ]);
      setTrabajando((n) => n + 1);
      try {
        let folderId = carpeta.folderId;
        let campoId = casillero?.campoId ?? null;
        if (!folderId) {
          /* Primera subida del plan: se crean las carpetas en el Drive (y, si el
             negocio nunca preparó un plan, la plantilla sugerida). El casillero
             se busca de nuevo por su clave: en la plantilla sugerida todavía no
             tenía id. */
          const v = await prepararCarpetas(planId);
          aplicar(v);
          const real = v.carpetas.find((c) => c.clave === carpeta.clave);
          folderId = real?.folderId ?? null;
          if (casillero && !campoId) campoId = real?.casilleros.find((k) => k.campo.clave === casillero.clave)?.campo.id ?? null;
        }
        if (!folderId) throw new Error("No se pudo crear la carpeta en Documentos.");
        const llegaron = new Map<File, DbDocument>();
        await subirArchivosAlDrive(files, {
          folderId,
          onEstado: (f, estado, motivo) => actualizarSubida(keys.get(f) ?? "", { estado: estado === "listo" ? "subiendo" : estado, motivo }),
          onSubido: (f, doc) => llegaron.set(f, doc),
        });
        for (const [f, doc] of llegaron) {
          const key = keys.get(f) ?? "";
          try {
            if (campoId) await etiquetarDocumento(doc, { campoId });
            actualizarSubida(key, { estado: "listo" });
          } catch (e) {
            actualizarSubida(key, { estado: "error", motivo: `subió, pero no quedó en su casillero: ${mensaje(e)}` });
          }
        }
      } catch (e) {
        const m = mensaje(e);
        setSubidas((prev) => prev.map((s) => (s.estado !== "listo" && [...keys.values()].includes(s.key) ? { ...s, estado: "error", motivo: m } : s)));
      } finally {
        setTrabajando((n) => n - 1);
        await cargar();
        // Lo que llegó ya está en la vista: su fila de progreso sobra.
        setSubidas((prev) => prev.filter((s) => s.estado !== "listo"));
      }
    },
    [planId, aplicar, actualizarSubida, cargar],
  );

  const descartarSubida = useCallback((key: string) => setSubidas((prev) => prev.filter((s) => s.key !== key)), []);

  const cambiarVencimiento = useCallback(
    async (documentId: string, fecha: string | null): Promise<string | null> => {
      setTrabajando((n) => n + 1);
      try {
        await patchVencimiento(documentId, fecha);
        await cargar();
        return null;
      } catch (e) {
        return mensaje(e);
      } finally {
        setTrabajando((n) => n - 1);
      }
    },
    [cargar],
  );

  const papelera = useCallback(
    async (documentId: string): Promise<string | null> => {
      try {
        await mandarAPapelera(documentId);
        await cargar();
        return null;
      } catch (e) {
        return mensaje(e);
      }
    },
    [cargar],
  );

  /** Devuelve también la clave de la carpeta nueva: la pantalla la deja elegida. */
  const crearCarpeta = useCallback(
    async (nombre: string, paraTodosLosPlanes: boolean): Promise<{ error: string | null; clave: string | null }> => {
      if (!planId) return { error: "Todavía no hay plan.", clave: null };
      const antes = new Set((vista?.carpetas ?? []).map((c) => c.clave));
      let clave: string | null = null;
      const error = await escribir(async () => {
        const v = await postCarpeta({ planId, nombre: nombre.trim(), paraTodosLosPlanes });
        clave = v.carpetas.find((c) => !antes.has(c.clave) && c.nombre.trim() === nombre.trim())?.clave ?? v.carpetas.find((c) => !antes.has(c.clave))?.clave ?? null;
        return v;
      });
      return { error, clave };
    },
    [planId, vista, escribir],
  );

  const renombrarCarpeta = useCallback(
    (clave: string, nombre: string) => (planId ? escribir(() => editarCarpeta({ planId, clave, nombre: nombre.trim() })) : Promise.resolve(null)),
    [planId, escribir],
  );

  /** Subir o bajar un lugar: se reescribe el orden de TODAS con su posición nueva. */
  const moverCarpeta = useCallback(
    async (carpetas: readonly CarpetaVista[], clave: string, paso: -1 | 1): Promise<string | null> => {
      if (!planId) return null;
      const i = carpetas.findIndex((c) => c.clave === clave);
      const j = i + paso;
      if (i < 0 || j < 0 || j >= carpetas.length) return null;
      /* Se intercambian los `orden` de las DOS carpetas: dos PATCH, no uno por
         carpeta. Si tenían el mismo número (plantilla vieja), se renumera todo
         según la posición nueva. */
      const [a, b] = [carpetas[i], carpetas[j]];
      let cambian: { c: CarpetaVista; orden: number }[] = [
        { c: a, orden: b.orden },
        { c: b, orden: a.orden },
      ];
      if (a.orden === b.orden) {
        const nuevas = [...carpetas];
        [nuevas[i], nuevas[j]] = [nuevas[j], nuevas[i]];
        cambian = nuevas.map((c, k) => ({ c, orden: k + 1 })).filter(({ c, orden }) => c.orden !== orden);
      }
      return escribir(async () => {
        let ultima: PlanDocumentosVista | null = null;
        for (const { c, orden } of cambian) ultima = await editarCarpeta({ planId, clave: c.clave, orden });
        return ultima ?? leerVista(planId);
      });
    },
    [planId, escribir],
  );

  /** Sale de la lista de carpetas del plan. La carpeta del Drive y sus archivos NO se tocan. */
  const quitarCarpeta = useCallback(
    (carpeta: CarpetaVista) =>
      planId && carpeta.plantillaId ? escribir(() => editarPlantilla(planId, { id: carpeta.plantillaId ?? "", activo: false, renombrarEnPlanes: false })) : Promise.resolve(null),
    [planId, escribir],
  );

  const adoptar = useCallback(
    (folderId: string, paraTodosLosPlanes: boolean) =>
      planId ? escribir(() => adoptarCarpeta({ planId, folderId, paraTodosLosPlanes })) : Promise.resolve(null),
    [planId, escribir],
  );

  const crearCasillero = useCallback(
    async (carpetaClave: string, input: { nombre: string; descripcion: string; soloEstePlan: boolean }): Promise<string | null> => {
      if (!planId) return null;
      setTrabajando((n) => n + 1);
      try {
        /* La carpeta tiene que estar en la plantilla del negocio (el servidor
           rechaza campos de una carpeta que no existe): con el plan sin
           preparar, se prepara primero. */
        if (!vista?.preparada) aplicar(await prepararCarpetas(planId));
        await crearCasilleroArchivo({ carpetaClave, nombre: input.nombre, descripcion: input.descripcion, soloParaRegistroId: input.soloEstePlan ? planId : null });
        cargasRef.current.escrituras += 1;
        await cargar();
        return null;
      } catch (e) {
        return mensaje(e);
      } finally {
        setTrabajando((n) => n - 1);
      }
    },
    [planId, vista, aplicar, cargar],
  );

  /* Un negocio que nunca preparó un plan todavía no tiene plantilla: se ven las
     carpetas sugeridas (`provisional`) y la primera subida las crea de verdad. */
  const carpetas = useMemo(() => {
    if (!vista) return [];
    if (!vista.preparada && vista.carpetas.length === 0) {
      return carpetasDelAlta(SEMILLA, documentosVacios(), limaDateKey()).map((c) => ({ ...c, provisional: true }));
    }
    return carpetasDelServidor(vista.carpetas);
  }, [vista]);
  const subiendo = subidas.some((s) => s.estado !== "listo" && s.estado !== "error");

  return {
    vista,
    carpetas,
    cargando,
    error,
    disponible,
    subidas,
    /** Hay algo viajando: cerrar ahora cortaría a la mitad. */
    ocupado: subiendo || trabajando > 0,
    recargar: cargar,
    subir,
    descartarSubida,
    cambiarVencimiento,
    papelera,
    crearCarpeta,
    renombrarCarpeta,
    moverCarpeta,
    quitarCarpeta,
    adoptar,
    crearCasillero,
  };
}

export type DocumentosDelPlan = ReturnType<typeof usePlanDocumentos>;

/**
 * Las carpetas de un ALTA: el plan todavía no existe y no hay vista que pedir.
 * Se lee la plantilla del negocio (carpetas y casilleros, ADR-427); si el
 * negocio nunca preparó un plan está vacía y se muestra la semilla, que es lo
 * que el primer `preparar` va a escribir. Al guardar, cada archivo se ubica por
 * la clave de su carpeta y de su casillero (estables aunque se renombren).
 */
export function usePlantillaAlta({ semilla }: { semilla: readonly PlantillaCarpeta[] }) {
  const [plantilla, setPlantilla] = useState<PlantillaCarpeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disponible, setDisponible] = useState(true);
  const hoy = useMemo(() => limaDateKey(), []);

  useEffect(() => {
    let vivo = true;
    leerPlantilla()
      .then((p) => {
        if (vivo) setPlantilla(p.length > 0 ? p : [...semilla]);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        if (e instanceof DocumentosNoDisponibles) setDisponible(false);
        else setError(mensaje(e));
        setPlantilla([...semilla]);
      });
    return () => {
      vivo = false;
    };
  }, [semilla]);

  return { plantilla: plantilla ?? [], cargando: plantilla == null, error, disponible, hoy };
}
