"use client";

/**
 * Las guías y los planes que el tablero de trozas cruza con el libro.
 *
 * La línea de despacho del libro sólo guarda el N° de GTF: la placa, el
 * transportista, el conductor y el destino viven en la guía (`ForestGtf`), y
 * el N° del plan y la parcela de corta en el plan (`ForestPlan`). Ambas listas
 * ya las devuelve la API con la fila completa.
 *
 * UNA lectura de cada endpoint, cuatro formas: la del tablero (guías vivas,
 * planes), la del cuadre por guía (TODAS las GTF, anuladas incluidas: el cruce
 * tiene que ver la anulada que el libro sigue citando) y la de la ficha de cada
 * plan vivo (vigencia, parcela, estado). Nadie más vuelve a pedir lo mismo.
 *
 * Falla blanda y DICHA: si no se pudieron leer, el tablero sigue con lo del
 * libro y avisa que esas columnas salen vacías — «no lo encontré» y «no lo
 * busqué» no son lo mismo. Por eso cada lista fallida queda en `null`, no en `[]`.
 */

import { useEffect, useState } from "react";
import {
  guiaDesdeApi,
  planDesdeApi,
  type ContextoTablero,
  type GuiaTablero,
  type PlanTablero,
} from "@/lib/forestal/loth-tablero-trozas";
import { gtfRegistradaDesdeApi, type GtfRegistrada } from "@/lib/forestal/loth-cuadre-guias";
import { planFichaDesdeApi, type PlanFichaApi } from "@/lib/forestal/loth-ficha-permiso";
import { leerPlanesDelLibro } from "./planes-del-libro";

export interface ContextoTableroEstado {
  contexto: ContextoTablero;
  /** Todas las GTF (anuladas incluidas) para el cuadre; `null` = no se pudieron leer. */
  gtfs: GtfRegistrada[] | null;
  /** Todos los planes no dados de baja, del más nuevo al más viejo; `null` = no se pudieron leer. */
  planes: PlanFichaApi[] | null;
  cargando: boolean;
  /** Qué no se pudo leer, en palabras del usuario; null si todo llegó. */
  faltante: string | null;
}

async function leerCrudo(url: string, clave: string): Promise<unknown[]> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  const j: unknown = await r.json();
  const lista = j && typeof j === "object" ? (j as Record<string, unknown>)[clave] : null;
  return Array.isArray(lista) ? lista : [];
}

function mapear<T>(lista: unknown[], f: (x: unknown) => T | null): T[] {
  return lista.map(f).filter((x): x is T => x != null);
}

export function useTableroContexto(): ContextoTableroEstado {
  const [estado, setEstado] = useState<ContextoTableroEstado>({
    contexto: {},
    gtfs: null,
    planes: null,
    cargando: true,
    faltante: null,
  });

  useEffect(() => {
    let vivo = true;
    Promise.allSettled([
      leerCrudo("/api/admin/forestal/gtf", "gtfs"),
      // La lista de planes, compartida con el chip del libro y el tablero (04-10).
      leerPlanesDelLibro().then((j) => {
        const lista = j && typeof j === "object" ? (j as Record<string, unknown>).plans : null;
        return Array.isArray(lista) ? lista : [];
      }),
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
      const guias = g.status === "fulfilled" ? g.value : null;
      const planes = p.status === "fulfilled" ? p.value : null;
      setEstado({
        contexto: {
          guias: guias ? mapear<GuiaTablero>(guias, guiaDesdeApi) : null,
          planes: planes ? mapear<PlanTablero>(planes, planDesdeApi) : null,
        },
        gtfs: guias ? mapear(guias, gtfRegistradaDesdeApi) : null,
        planes: planes ? mapear(planes, planFichaDesdeApi) : null,
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
