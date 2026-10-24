"use client";

/**
 * usePanelesTalonario — lo que el modal «Imprimir en talonario» recuerda de
 * cómo lo dejaste: los bloques de los costados abiertos o plegados, los
 * nombres de los campos encima de los valores (prendidos de entrada) y la
 * pestaña del celular. Por equipo (localStorage), no por tenant.
 */

import { useCallback, useEffect, useState } from "react";

export type PestanaTalonario = "campos" | "elegido" | "talonario";

interface EstadoPaneles {
  izq: boolean;
  der: boolean;
  nombres: boolean;
  pestana: PestanaTalonario;
}

const CLAVE = "gtf-matricial-paneles";
const INICIAL: EstadoPaneles = { izq: true, der: true, nombres: true, pestana: "elegido" };
const PESTANAS: readonly PestanaTalonario[] = ["campos", "elegido", "talonario"];

function leer(): EstadoPaneles {
  try {
    const j = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Partial<EstadoPaneles> | null;
    if (!j || typeof j !== "object") return INICIAL;
    return {
      izq: typeof j.izq === "boolean" ? j.izq : INICIAL.izq,
      der: typeof j.der === "boolean" ? j.der : INICIAL.der,
      nombres: typeof j.nombres === "boolean" ? j.nombres : INICIAL.nombres,
      pestana: PESTANAS.includes(j.pestana as PestanaTalonario) ? (j.pestana as PestanaTalonario) : INICIAL.pestana,
    };
  } catch {
    return INICIAL;
  }
}

export function usePanelesTalonario() {
  const [e, setE] = useState<EstadoPaneles>(INICIAL);
  const [leido, setLeido] = useState(false);

  useEffect(() => {
    setE(leer());
    setLeido(true);
  }, []);
  useEffect(() => {
    if (!leido) return;
    try {
      localStorage.setItem(CLAVE, JSON.stringify(e));
    } catch {
      /* sin almacenamiento (modo privado, cuota llena): vale hasta cerrar */
    }
  }, [e, leido]);

  const alternarIzq = useCallback(() => setE((p) => ({ ...p, izq: !p.izq })), []);
  const alternarDer = useCallback(() => setE((p) => ({ ...p, der: !p.der })), []);
  const alternarNombres = useCallback(() => setE((p) => ({ ...p, nombres: !p.nombres })), []);
  const setPestana = useCallback((pestana: PestanaTalonario) => setE((p) => ({ ...p, pestana })), []);

  return { ...e, alternarIzq, alternarDer, alternarNombres, setPestana };
}

export type PanelesTalonario = ReturnType<typeof usePanelesTalonario>;
