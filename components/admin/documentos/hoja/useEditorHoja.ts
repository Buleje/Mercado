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
import { moverFormulaCruzada } from "@/lib/documentos/xlsx-estructura";
import { aCambiosDeArchivo, aplicar, remapearPendientes, type Accion, type Paso } from "./estado-hoja";
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

  /**
   * Aplica una acción sobre el espejo y fija el resultado en React.
   *
   * Si la acción mueve la estructura, las fórmulas de las OTRAS hojas que
   * referencian a ésta por nombre ("Precios!B4") se corren igual que en el
   * archivo — la pantalla y el guardado cuentan la misma historia.
   * El espejo se actualiza YA: dos acciones en el mismo tick (separar y
   * combinar, por ejemplo) ven cada una el estado de la anterior.
   */
  const aplicarYFijar = useCallback((indice: number, accion: Accion): Paso | null => {
    const previa = hojasRef.current[indice];
    if (!previa) return null;
    const { hoja, inversa } = aplicar(previa, accion);
    const nuevas = hojasRef.current.map((h, i) => {
      if (i === indice) return hoja;
      if (accion.tipo !== "estructura" || !h.tieneFormulas) return h;
      let cambio = false;
      const filas = h.filas.map((fila) => fila.map((c) => {
        if (!c.formula) return c;
        const nueva = moverFormulaCruzada(c.formula, previa.nombre, accion.eje, accion.indice, accion.delta);
        if (nueva === c.formula) return c;
        cambio = true;
        return { ...c, formula: nueva };
      }));
      return cambio ? { ...h, filas } : h;
    });
    hojasRef.current = nuevas;
    setHojas(nuevas);
    return { accion, inversa };
  }, []);

  const ejecutar = useCallback((accion: Accion, hojaIndice = activa) => {
    // Los efectos (historial, pendientes, remapeo) van FUERA del updater de
    // React: en StrictMode el updater corre DOS veces, y una acción de
    // estructura duplicada insertaba dos filas en el archivo.
    let lista = pendientes.current.get(hojaIndice) ?? [];
    // Insertar/eliminar corre las direcciones: lo que ya estaba pendiente
    // se re-expresa en las coordenadas nuevas (el archivo aplica primero
    // TODA la estructura y después los valores).
    if (accion.tipo === "estructura") {
      lista = remapearPendientes(lista, accion.eje, accion.indice, accion.delta);
    }
    const paso = aplicarYFijar(hojaIndice, accion);
    if (!paso) return;
    const pila = pilaDe(hojaIndice);
    pila.hechos.push(paso);
    if (pila.hechos.length > MAX_HISTORIAL) pila.hechos.shift();
    // Una acción nueva corta la rama de rehacer, como en cualquier editor.
    pila.deshechos.length = 0;
    lista.push(accion);
    pendientes.current.set(hojaIndice, lista);
    setSucio(true);
    setVersion((v) => v + 1);
  }, [activa, aplicarYFijar]);

  const deshacer = useCallback(() => {
    const pila = pilaDe(activa);
    const paso = pila.hechos.pop();
    if (!paso) return;
    let lista = pendientes.current.get(activa) ?? [];
    if (paso.inversa.tipo === "estructura") {
      lista = remapearPendientes(lista, paso.inversa.eje, paso.inversa.indice, paso.inversa.delta);
    }
    if (!aplicarYFijar(activa, paso.inversa)) return;
    pila.deshechos.push(paso);
    // El archivo tiene que recibir la inversa: puede que lo deshecho ya se
    // haya guardado en una versión anterior.
    lista.push(paso.inversa);
    pendientes.current.set(activa, lista);
    setSucio(true);
    setVersion((v) => v + 1);
  }, [activa, aplicarYFijar]);

  const rehacer = useCallback(() => {
    const pila = pilaDe(activa);
    const paso = pila.deshechos.pop();
    if (!paso) return;
    let lista = pendientes.current.get(activa) ?? [];
    if (paso.accion.tipo === "estructura") {
      lista = remapearPendientes(lista, paso.accion.eje, paso.accion.indice, paso.accion.delta);
    }
    if (!aplicarYFijar(activa, paso.accion)) return;
    pila.hechos.push(paso);
    lista.push(paso.accion);
    pendientes.current.set(activa, lista);
    setSucio(true);
    setVersion((v) => v + 1);
  }, [activa, aplicarYFijar]);

  /** Todo lo pendiente, listo para escribir en el archivo. */
  const cambiosParaArchivo = useCallback((): Cambios => {
    // OJO: cada tipo de cambio que exista en `Cambios` tiene que agregarse
    // acá — uno que falte se pierde EN SILENCIO al guardar.
    const total: Cambios = {
      estructura: [], celdas: [], estilos: [], anchos: [], combinadas: [],
      altos: [], visibilidad: [], congelados: [],
    };
    for (const [hoja, acciones] of pendientes.current) {
      const parcial = aCambiosDeArchivo(acciones, hoja);
      total.estructura!.push(...(parcial.estructura ?? []));
      total.celdas!.push(...(parcial.celdas ?? []));
      total.estilos!.push(...(parcial.estilos ?? []));
      total.anchos!.push(...(parcial.anchos ?? []));
      total.combinadas!.push(...(parcial.combinadas ?? []));
      total.altos!.push(...(parcial.altos ?? []));
      total.visibilidad!.push(...(parcial.visibilidad ?? []));
      total.congelados!.push(...(parcial.congelados ?? []));
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
    hojasRef.current = [...hojasRef.current, hoja];
    setHojas(hojasRef.current);
    setActiva(indiceNuevo);
    setSucio(true);
    setVersion((v) => v + 1);
  }, []);

  /** Cambia el nombre en pantalla; `reemplazarRef` actualiza las fórmulas que
   *  nombraban a la hoja (el archivo ya se actualizó en xlsx-hojas). */
  const renombrarHojaEnEstado = useCallback((indice: number, nombre: string, reemplazarRef?: (formula: string) => string) => {
    hojasRef.current = hojasRef.current.map((h, i) => {
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
    });
    setHojas(hojasRef.current);
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
    hojasRef.current = hojasRef.current.filter((_, i) => i !== indice);
    setHojas(hojasRef.current);
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
