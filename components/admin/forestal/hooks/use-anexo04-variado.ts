"use client";

/**
 * «Resaltar Variado» de la vista previa del Anexo 04: el interruptor (apagado
 * por defecto, recordado por negocio en localStorage) y de qué renglones viene
 * cada medida (lógica pura en `lib/forestal/anexo04-variado.ts`). Es SOLO de
 * pantalla: el PDF, el Excel y la impresión no lo leen.
 */
import { useCallback, useMemo, useState } from "react";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { origenVariadoPorFila, resumenVariadoAnexo, type OrigenFila, type ResumenVariadoAnexo } from "@/lib/forestal/anexo04-variado";
import { slugKey } from "@/lib/forestal/sembrar-reparto";

const clave = () => slugKey("-anexo04-resaltar-variado");

function leer(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(clave()) === "1"; } catch { return false; }
}

export interface VistaVariado {
  /** Hay renglones del Variado en este anexo (si no, no se ofrece el botón). */
  hay: boolean;
  resaltar: boolean;
  alternar: () => void;
  resumen: ResumenVariadoAnexo;
  /** Por id de renglón; vacío mientras está apagado (la hoja no pinta nada). */
  marcas: ReadonlyMap<string, OrigenFila>;
}

const SIN_MARCAS: ReadonlyMap<string, OrigenFila> = new Map();

export function useAnexo04Variado(
  filasPapel: readonly PiezaCubicada[],
  referencia: readonly PiezaCubicada[] | undefined,
  especieGlobal: string | undefined,
): VistaVariado {
  const [resaltar, setResaltar] = useState<boolean>(leer);
  const origen = useMemo(
    () => origenVariadoPorFila(filasPapel, referencia ?? [], especieGlobal),
    [filasPapel, referencia, especieGlobal],
  );
  const resumen = useMemo(() => resumenVariadoAnexo(origen), [origen]);
  const alternar = useCallback(() => {
    setResaltar((v) => {
      const n = !v;
      try { localStorage.setItem(clave(), n ? "1" : "0"); } catch { /* modo privado: vale para la sesión */ }
      return n;
    });
  }, []);
  return { hay: origen.size > 0, resaltar, alternar, resumen, marcas: resaltar ? origen : SIN_MARCAS };
}
