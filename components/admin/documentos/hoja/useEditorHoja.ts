"use client";

/**
 * useEditorHoja — el estado del editor: las hojas, el historial y la lista de
 * cambios pendientes de guardar.
 *
 * Deshacer no revierte "el último valor": ejecuta la acción inversa que quedó
 * registrada. Por eso Ctrl+Z funciona igual con un pegado de 300 celdas, con
 * una fila insertada o con un color aplicado a un rango.
 *
 * Lo que se guarda en el archivo es la lista de acciones REHECHAS hasta el
 * momento (no el historial entero): si el usuario deshizo algo, eso no tiene
 * que llegar al archivo.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { HojaFormato } from "@/lib/documentos/xlsx-formato";
import { aCambiosDeArchivo, aplicar, type Accion, type Paso } from "./estado-hoja";
import type { Cambios } from "@/lib/documentos/xlsx-escritura";

/** Tope de pasos guardados: suficiente para trabajar, acotado en memoria. */
const MAX_HISTORIAL = 100;

export function useEditorHoja(inicial: HojaFormato[]) {
  const [hojas, setHojas] = useState<HojaFormato[]>(inicial);
  const [activa, setActiva] = useState(0);
  const [sucio, setSucio] = useState(false);

  /** Pasos hechos y deshechos, por hoja: cada pestaña tiene su propio Ctrl+Z. */
  const historial = useRef<Map<number, { hechos: Paso[]; deshechos: Paso[] }>>(new Map());
  /** Acciones que todavía no se escribieron en el archivo, por hoja. */
  const pendientes = useRef<Map<number, Accion[]>>(new Map());
  const [version, setVersion] = useState(0); // fuerza el re-render de los botones

  /** Espejo del estado para las operaciones de hoja (llegan tras un await). */
  const hojasRef = useRef(hojas);
  hojasRef.current = hojas;

  const pilaDe = (hoja: number) => {
    let p = historial.current.get(hoja);
    if (!p) { p = { hechos: [], deshechos: [] }; historial.current.set(hoja, p); }
    return p;
  };

  const ejecutar = useCallback((accion: Accion, hojaIndice = activa) => {
    setHojas((prev) => prev.map((h, i) => {
      if (i !== hojaIndice) return h;
      const { hoja, inversa } = aplicar(h, accion);
      const pila = pilaDe(hojaIndice);
      pila.hechos.push({ accion, inversa });
      if (pila.hechos.length > MAX_HISTORIAL) pila.hechos.shift();
      // Una acción nueva corta la rama de rehacer, como en cualquier editor.
      pila.deshechos.length = 0;
      const lista = pendientes.current.get(hojaIndice) ?? [];
      lista.push(accion);
      pendientes.current.set(hojaIndice, lista);
      return hoja;
    }));
    setSucio(true);
    setVersion((v) => v + 1);
  }, [activa]);

  const deshacer = useCallback(() => {
    const pila = pilaDe(activa);
    const paso = pila.hechos.pop();
    if (!paso) return;
    setHojas((prev) => prev.map((h, i) => {
      if (i !== activa) return h;
      const { hoja } = aplicar(h, paso.inversa);
      return hoja;
    }));
    pila.deshechos.push(paso);
    // El archivo tiene que recibir la inversa: puede que lo deshecho ya se
    // haya guardado en una versión anterior.
    const lista = pendientes.current.get(activa) ?? [];
    lista.push(paso.inversa);
    pendientes.current.set(activa, lista);
    setSucio(true);
    setVersion((v) => v + 1);
  }, [activa]);

  const rehacer = useCallback(() => {
    const pila = pilaDe(activa);
    const paso = pila.deshechos.pop();
    if (!paso) return;
    setHojas((prev) => prev.map((h, i) => (i === activa ? aplicar(h, paso.accion).hoja : h)));
    pila.hechos.push(paso);
    const lista = pendientes.current.get(activa) ?? [];
    lista.push(paso.accion);
    pendientes.current.set(activa, lista);
    setSucio(true);
    setVersion((v) => v + 1);
  }, [activa]);

  /** Todo lo pendiente, listo para escribir en el archivo. */
  const cambiosParaArchivo = useCallback((): Cambios => {
    const total: Cambios = { estructura: [], celdas: [], estilos: [], anchos: [] };
    for (const [hoja, acciones] of pendientes.current) {
      const parcial = aCambiosDeArchivo(acciones, hoja);
      total.estructura!.push(...(parcial.estructura ?? []));
      total.celdas!.push(...(parcial.celdas ?? []));
      total.estilos!.push(...(parcial.estilos ?? []));
      total.anchos!.push(...(parcial.anchos ?? []));
    }
    return total;
  }, []);

  const marcarGuardado = useCallback(() => {
    pendientes.current.clear();
    setSucio(false);
  }, []);

  // ── Operaciones de hoja ───────────────────────────────────────────────────
  // El ARCHIVO ya cambió cuando llegan acá (xlsx-hojas operó sobre el zip);
  // esto pone la pantalla y el historial a la par. No entran al Ctrl+Z: igual
  // que en Excel, borrar una hoja no se deshace (por eso se confirma antes).

  /** Suma una hoja al final. `copiarPendientesDe`: al duplicar, los cambios
   *  sin guardar de la hoja original se re-aplican sobre la copia al guardar. */
  const agregarHoja = useCallback((hoja: HojaFormato, copiarPendientesDe?: number) => {
    const indiceNuevo = hojasRef.current.length;
    if (copiarPendientesDe !== undefined) {
      const origen = pendientes.current.get(copiarPendientesDe);
      if (origen && origen.length > 0) {
        pendientes.current.set(indiceNuevo, JSON.parse(JSON.stringify(origen)) as Accion[]);
      }
    }
    setHojas((prev) => [...prev, hoja]);
    setActiva(indiceNuevo);
    setSucio(true);
    setVersion((v) => v + 1);
  }, []);

  /** Cambia el nombre en pantalla; `reemplazarRef` actualiza las fórmulas que
   *  nombraban a la hoja (el archivo ya se actualizó en xlsx-hojas). */
  const renombrarHojaEnEstado = useCallback((indice: number, nombre: string, reemplazarRef?: (formula: string) => string) => {
    setHojas((prev) => prev.map((h, i) => {
      const conNombre = i === indice ? { ...h, nombre } : h;
      if (!reemplazarRef || !conNombre.tieneFormulas) return conNombre;
      return {
        ...conNombre,
        filas: conNombre.filas.map((fila) => fila.map((c) => {
          if (!c.formula) return c;
          const nueva = reemplazarRef(c.formula);
          return nueva === c.formula ? c : { ...c, formula: nueva };
        })),
      };
    }));
    setSucio(true);
  }, []);

  const quitarHoja = useCallback((indice: number) => {
    // El historial y lo pendiente viven indexados por hoja: al sacar una del
    // medio, todo lo que estaba después corre un lugar.
    const remapear = <T,>(mapa: Map<number, T>): Map<number, T> => {
      const nuevo = new Map<number, T>();
      for (const [k, v] of mapa) {
        if (k === indice) continue;
        nuevo.set(k > indice ? k - 1 : k, v);
      }
      return nuevo;
    };
    historial.current = remapear(historial.current);
    pendientes.current = remapear(pendientes.current);
    const tope = hojasRef.current.length - 2; // el índice máximo tras el borrado
    setHojas((prev) => prev.filter((_, i) => i !== indice));
    setActiva((prev) => Math.max(0, Math.min(prev > indice ? prev - 1 : prev, tope)));
    setSucio(true);
    setVersion((v) => v + 1);
  }, []);

  const puede = useMemo(() => {
    const pila = historial.current.get(activa);
    return { deshacer: (pila?.hechos.length ?? 0) > 0, rehacer: (pila?.deshechos.length ?? 0) > 0 };
    // `version` entra a propósito: el historial vive en un ref, que no dispara
    // render — sin esta dependencia los botones quedarían deshabilitados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activa, version]);

  return {
    hojas, setHojas, activa, setActiva,
    sucio, ejecutar, deshacer, rehacer, puede,
    cambiosParaArchivo, marcarGuardado,
    agregarHoja, renombrarHojaEnEstado, quitarHoja,
  };
}
