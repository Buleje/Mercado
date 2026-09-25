"use client";

/**
 * use-codigos-planta — avisar de un código repetido MIENTRAS se tipea (ADR-336).
 *
 * El código de planta es la marca física que se pinta sobre la troza: dos
 * piezas con el mismo número no se pueden distinguir en el patio, y el servidor
 * rechaza el ingreso entero cuando pasa. Descubrirlo al apretar «Registrar»
 * —con las sesenta piezas ya cargadas— es descubrirlo tarde, así que se
 * consulta antes contra el libro.
 *
 * Es un AVISO, no un gate: el que decide sigue siendo `WoodEntriesDB.create`
 * dentro de su transacción (dos tablets numerando a la vez pasan las dos por
 * acá y sólo una entra).
 */

import { useEffect, useRef, useState } from "react";

export interface CodigoTomado {
  codigo: string;
  gtfNumber: string;
  codificacion: string | null;
}

/** Cuánto se espera después de la última tecla antes de preguntar. */
const ESPERA_MS = 600;

/**
 * Cuáles de estos códigos ya están usados en el libro.
 *
 * Devuelve un mapa `CÓDIGO EN MAYÚSCULAS → dónde está`, para poder marcar la
 * fila y decir contra qué guía choca (un "ya existe" pelado obliga a buscarlo a
 * mano entre doscientas filas).
 */
export function useCodigosPlantaEnUso(codigos: string[]): {
  enUso: Map<string, CodigoTomado>;
  verificando: boolean;
} {
  const [enUso, setEnUso] = useState<Map<string, CodigoTomado>>(new Map());
  const [verificando, setVerificando] = useState(false);
  // La clave del efecto es el CONTENIDO, no el array: un array nuevo en cada
  // render dispararía una consulta por tecla aunque los códigos no cambien.
  const clave = [...new Set(codigos.map((c) => (c ?? "").trim()).filter(Boolean))].sort().join(",");
  const abortar = useRef<AbortController | null>(null);

  useEffect(() => {
    abortar.current?.abort();
    if (!clave) {
      setEnUso(new Map());
      setVerificando(false);
      return;
    }
    const ctrl = new AbortController();
    abortar.current = ctrl;
    setVerificando(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/forestal/trozas?codigosEnUso=${encodeURIComponent(clave)}`, {
        credentials: "include",
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : { enUso: [] }))
        .then((j: { enUso?: CodigoTomado[] }) => {
          const mapa = new Map<string, CodigoTomado>();
          for (const t2 of j.enUso ?? []) mapa.set((t2.codigo ?? "").trim().toUpperCase(), t2);
          setEnUso(mapa);
        })
        .catch((err) => {
          // Sin señal en el patio no hay verificación previa, y está bien: el
          // guard del servidor sigue estando. Lo que no puede pasar es que la
          // pantalla se rompa por un aviso.
          if ((err as Error)?.name !== "AbortError") {
            console.warn("[codigos-planta] no se pudo verificar", err);
          }
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setVerificando(false);
        });
    }, ESPERA_MS);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [clave]);

  return { enUso, verificando };
}
