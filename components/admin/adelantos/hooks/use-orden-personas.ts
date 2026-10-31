"use client";

/**
 * El orden de Personas desde los encabezados de la tabla (30-10). Antes era un
 * desplegable «Orden: saldo» que, con los chips de situación, bajaba solo a una
 * fila propia. Ahora se ordena como en Adelantos › Lista: clic en la columna
 * (primero en su sentido natural, después al revés, y el tercero vuelve al de
 * siempre: por saldo). Las seis opciones del desplegable siguen: «cerca del
 * tope» es el «Tope» chico bajo Cumplimiento.
 */

import { useCallback, useMemo, useState } from "react";
import type { OrdenDeColumnas } from "@/components/admin/shared/th-columna";
import { ORDENES, SENTIDO_NATURAL, type OrdenPersonas } from "@/lib/adelantos/ordenar-personas";

type Estado = { id: OrdenPersonas; invertido: boolean };
const DE_SIEMPRE: Estado = { id: "saldo", invertido: false };

export function useOrdenPersonas(): {
  orden: OrdenPersonas;
  invertido: boolean;
  columnas: OrdenDeColumnas;
  /** El desplegable del celular, donde no hay encabezados (las filas son tarjetas). */
  elegir: (o: OrdenPersonas) => void;
} {
  const [estado, setEstado] = useState<Estado>(DE_SIEMPRE);
  const elegir = useCallback((o: OrdenPersonas) => setEstado({ id: o, invertido: false }), []);

  const alternar = useCallback((id: string) => {
    if (!(ORDENES as readonly string[]).includes(id)) return;
    const o = id as OrdenPersonas;
    setEstado((e) => (e.id !== o ? { id: o, invertido: false } : !e.invertido ? { id: o, invertido: true } : DE_SIEMPRE));
  }, []);

  const natural = SENTIDO_NATURAL[estado.id];
  const direccion = estado.invertido ? (natural === "asc" ? "desc" : "asc") : natural;
  const columnas = useMemo<OrdenDeColumnas>(
    () => ({
      alternar,
      activa: estado.id,
      direccion,
      ariaSort: (id: string) => (id !== estado.id ? "none" : direccion === "asc" ? "ascending" : "descending"),
    }),
    [alternar, estado.id, direccion],
  );

  return { orden: estado.id, invertido: estado.invertido, columnas, elegir };
}
