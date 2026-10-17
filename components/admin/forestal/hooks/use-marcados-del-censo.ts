"use client";

/**
 * Las casillas de «Ver censo» para talar varios árboles de una vez: lo
 * marcado (en el orden en que se marcó), y la confirmación conjunta de los que
 * no se deben tumbar —semillero o remanente del regente, bajo DMC, reservado
 * por el cálculo del plan— antes de llevarlos a la planilla.
 */

import { useEffect, useRef, useState } from "react";
import type { ArbolParaElegir } from "@/lib/forestal/loth-censo-uso";

export interface ElegirVarios {
  /** El botón del pie: «Talar los 3 elegidos», «Agregar 2 árboles a la planilla». */
  etiqueta: (n: number) => string;
  onElegir: (arboles: ArbolParaElegir[]) => void;
}

export function useMarcadosDelCenso(open: boolean, varios: ElegirVarios | undefined) {
  const [marcados, setMarcados] = useState<ReadonlyMap<string, ArbolParaElegir>>(new Map());
  /** Hay marcados que no se deben tumbar: se confirman juntos. */
  const [confirmando, setConfirmando] = useState(false);
  const seguirRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmando) seguirRef.current?.focus();
  }, [confirmando]);
  /* El modal de la tala sigue montado al cerrarse: abrirlo otra vez arranca sin marcas. */
  useEffect(() => {
    if (open) return;
    setMarcados(new Map());
    setConfirmando(false);
  }, [open]);

  const lista = [...marcados.values()];
  const conReparo = lista.filter((a) => a.reparo);

  function marcar(arboles: readonly ArbolParaElegir[], v: boolean) {
    setConfirmando(false);
    setMarcados((m) => {
      const n = new Map(m);
      for (const a of arboles) {
        if (v) n.set(a.id, a);
        else n.delete(a.id);
      }
      return n;
    });
  }

  function elegir(confirmado = false) {
    if (!varios || lista.length === 0) return;
    if (conReparo.length > 0 && !confirmado) {
      setConfirmando(true);
      return;
    }
    setConfirmando(false);
    setMarcados(new Map());
    varios.onElegir(lista);
  }

  return { ids: new Set(marcados.keys()), lista, conReparo, confirmando, seguirRef, marcar, elegir };
}
