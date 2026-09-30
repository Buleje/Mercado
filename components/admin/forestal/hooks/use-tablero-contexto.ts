"use client";

/**
 * Las guías y los planes que el tablero de trozas cruza con el libro.
 *
 * La línea de despacho del libro sólo guarda el N° de GTF: la placa, el
 * transportista, el conductor y el destino viven en la guía (`ForestGtf`), y
 * el N° del plan y la parcela de corta en el plan (`ForestPlan`). Ambas listas
 * ya las devuelve la API con la fila completa.
 *
 * Falla blanda y DICHA: si no se pudieron leer, el tablero sigue con lo del
 * libro y avisa que esas columnas salen vacías — «no lo encontré» y «no lo
 * busqué» no son lo mismo.
 */

import { useEffect, useState } from "react";
import {
  guiaDesdeApi,
  planDesdeApi,
  type ContextoTablero,
  type GuiaTablero,
  type PlanTablero,
} from "@/lib/forestal/loth-tablero-trozas";

export interface ContextoTableroEstado {
  contexto: ContextoTablero;
  cargando: boolean;
  /** Qué no se pudo leer, en palabras del usuario; null si todo llegó. */
  faltante: string | null;
}

async function leer<T>(url: string, clave: string, mapear: (x: unknown) => T | null): Promise<T[]> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  const j: unknown = await r.json();
  const lista = j && typeof j === "object" ? (j as Record<string, unknown>)[clave] : null;
  return Array.isArray(lista) ? lista.map(mapear).filter((x): x is T => x != null) : [];
}

export function useTableroContexto(): ContextoTableroEstado {
  const [estado, setEstado] = useState<ContextoTableroEstado>({ contexto: {}, cargando: true, faltante: null });

  useEffect(() => {
    let vivo = true;
    Promise.allSettled([
      leer<GuiaTablero>("/api/admin/forestal/gtf", "gtfs", guiaDesdeApi),
      leer<PlanTablero>("/api/admin/forestal/plan", "plans", planDesdeApi),
    ]).then(([g, p]) => {
      if (!vivo) return;
      const faltan: string[] = [];
      if (g.status === "rejected") {
        console.warn("[loth-tablero] no se pudieron leer las GTF", g.reason);
        faltan.push("las guías (placa, transportista, destino)");
      }
      if (p.status === "rejected") {
        console.warn("[loth-tablero] no se pudieron leer los planes", p.reason);
        faltan.push("los planes (N° de plan, parcela)");
      }
      setEstado({
        contexto: {
          guias: g.status === "fulfilled" ? g.value : null,
          planes: p.status === "fulfilled" ? p.value : null,
        },
        cargando: false,
        faltante: faltan.length > 0 ? faltan.join(" y ") : null,
      });
    });
    return () => {
      vivo = false;
    };
  }, []);

  return estado;
}
