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
  };
}
