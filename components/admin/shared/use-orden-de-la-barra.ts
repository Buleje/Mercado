"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { insertarFaltantes, leerOrdenGuardado } from "./orden-pestanas";
import { DIAS_MINIMOS, diasDeDatos, ordenPorUso, type OrdenPorUso } from "@/lib/admin/orden-por-uso";
import {
  fijarModoOrden,
  leerContadorDeUso,
  registrarUsoDePestana,
  useModoOrden,
  type ModoOrden,
} from "@/hooks/use-uso-de-pestanas";

/**
 * El orden de las pestañas de `AdminTabBar`: el que arrastraste a mano
 * (`tab-order-<módulo>`) y, encima, «Menú en tu orden» (Brandon 19-10): las
 * que más abres primero y las que no abres hace un mes, al «Más».
 *
 * El orden por uso se calcula al montar (y si cambian las pestañas), nunca
 * mientras clickeas: una barra que se reacomoda bajo el mouse hace errar el
 * clic. Sólo en la barra del módulo (`conUso`): las anidadas quedan como vienen.
 */

/** La pestaña del panel (`?tab=`): con ella se cuentan las vistas («plata:gastos»). */
const prefijoDelPanel = (moduleId: string) =>
  (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab")) ?? moduleId;

/** Igual que «Abriste hace poco»: se anota cuando te quedas 0,9 s en la vista. */
const QUIETA_MS = 900;

interface Calculo {
  porUso: OrdenPorUso<string>;
  diasQueFaltan: number;
}

export function useOrdenDeLaBarra({
  tabs,
  moduleId,
  activeTab,
  conUso,
}: {
  tabs: readonly { id: string }[];
  moduleId: string;
  activeTab: string;
  conUso: boolean;
}) {
  /**
   * El orden COMPLETO: el guardado tal cual —con las pestañas que todavía no
   * llegaron (una que el usuario movió y aparece tarde conserva su lugar)— más
   * las de ahora que no estaban guardadas.
   */
  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    const deFabrica = tabs.map((tab) => tab.id);
    if (typeof window === "undefined") return deFabrica;
    let guardado: string[] | null = null;
    try {
      guardado = leerOrdenGuardado(localStorage.getItem(`tab-order-${moduleId}`));
    } catch {
      /* modo privado: el orden de fábrica */
    }
    return guardado ? insertarFaltantes(guardado, deFabrica) : deFabrica;
  });
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);

  /**
   * El orden de verdad: el guardado (o el de fábrica) MÁS las pestañas que
   * aparecieron después de montar. `tabOrder` se arma una sola vez, y una
   * pestaña que llega tarde —gateada por algo que se lee async: el rol, las
   * especializaciones, el plan— no estaba en él y no se dibujaba NUNCA (08-10:
   * «Forestal» del Inicio desaparecía al esperar el rol). La nueva entra detrás
   * de la que la precede en `tabs`, no al final.
   */
  const ordenIds = useMemo(
    () =>
      insertarFaltantes(
        tabOrder.filter((id) => tabs.some((tab) => tab.id === id)),
        tabs.map((tab) => tab.id),
      ),
    [tabOrder, tabs],
  );
  const isReordered = JSON.stringify(ordenIds) !== JSON.stringify(tabs.map((tab) => tab.id));

  const handleDrop = (targetId: string) => {
    if (!draggedTab || draggedTab === targetId) return;
    const newOrder = [...ordenIds];
    newOrder.splice(newOrder.indexOf(draggedTab), 1);
    newOrder.splice(newOrder.indexOf(targetId), 0, draggedTab);
    /* Las que hoy no se ven (llegan tarde o el rol las esconde) vuelven a su
       lugar relativo: reordenar sin ellas no puede borrarles el sitio. */
    const completo = insertarFaltantes(newOrder, tabOrder);
    setTabOrder(completo);
    try {
      localStorage.setItem(`tab-order-${moduleId}`, JSON.stringify(completo));
    } catch {
      /* sin espacio: vale para esta carga */
    }
    setDraggedTab(null);
    setDragOverTab(null);
  };

  const resetOrder = () => {
    setTabOrder(tabs.map((tab) => tab.id));
    try {
      localStorage.removeItem(`tab-order-${moduleId}`);
    } catch {
      /* nada que borrar */
    }
  };

  /* ── «Menú en tu orden» ── */
  const modo = useModoOrden();
  const [calculo, setCalculo] = useState<Calculo | null>(null);
  const activaRef = useRef(activeTab);
  useLayoutEffect(() => {
    activaRef.current = activeTab;
  });
  const claveIds = ordenIds.join("|");
  useLayoutEffect(() => {
    if (!conUso || !claveIds) {
      setCalculo(null);
      return;
    }
    const ahora = Date.now();
    const contador = leerContadorDeUso();
    setCalculo({
      porUso: ordenPorUso(claveIds.split("|"), contador, prefijoDelPanel(moduleId), ahora, activaRef.current),
      diasQueFaltan: Math.max(0, DIAS_MINIMOS - diasDeDatos(contador, ahora)),
    });
  }, [conUso, claveIds, moduleId]);

  /* Cuenta la vista abierta (sólo la barra del módulo). */
  useEffect(() => {
    if (!conUso || !activeTab) return;
    const t = setTimeout(() => registrarUsoDePestana(`${prefijoDelPanel(moduleId)}:${activeTab}`), QUIETA_MS);
    return () => clearTimeout(t);
  }, [conUso, activeTab, moduleId]);

  const porUso = calculo?.porUso ?? null;
  /** El orden por uso movería algo: recién ahí vale ofrecer el interruptor. */
  const usoQueMueve =
    porUso?.aplicado && (porUso.aMas.length > 0 || porUso.visiblesEnOrden.join("|") !== claveIds) ? porUso : null;
  const puesto = conUso && modo === "uso" ? usoQueMueve : null;
  const aplicado = puesto !== null;

  /* Lo calculado puede ser de un render anterior: sólo ids de ahora, y los nuevos al final. */
  const vigentes = new Set(ordenIds);
  const delUso = puesto ? [...puesto.visiblesEnOrden, ...puesto.aMas].filter((id) => vigentes.has(id)) : [];
  const idsBarra = puesto ? [...delUso, ...ordenIds.filter((id) => !delUso.includes(id))] : ordenIds;
  const aMas = puesto ? puesto.aMas.filter((id) => vigentes.has(id)) : [];

  return {
    /** El orden en que se dibujan. */
    idsBarra,
    /** Al «Más» aunque entren (no las abres hace un mes). */
    aMas,
    /** El orden por uso está puesto: el arrastre se apaga (mandaría el uso igual). */
    ordenPorUsoPuesto: aplicado,
    /** Para el «Más»: el interruptor y lo que falta para que empiece. */
    orden: conUso
      ? { modo, onModo: (m: ModoOrden) => fijarModoOrden(m), diasQueFaltan: calculo?.diasQueFaltan ?? DIAS_MINIMOS }
      : null,
    /** El «Más» se dibuja aunque todo entre: hay un orden que deshacer o que cambiar. */
    masFijo: isReordered || usoQueMueve !== null,
    isReordered,
    resetOrder,
    handleDrop,
    draggedTab,
    setDraggedTab,
    dragOverTab,
    setDragOverTab,
  };
}
