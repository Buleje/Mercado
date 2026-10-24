"use client";

/**
 * «Identificar la leyenda» (ADR-465, 03-10): a las zonas del croquis cargadas
 * antes de la leyenda les asigna su componente —qué es: madera, maquinaria,
 * techo…— por su nombre y el número de su código (PT-08 → 8), en UNA
 * escritura. No cambia el tipo, el código ni el dibujo de ninguna.
 */

import { useCallback, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { identificarZona, resumenCategorias } from "@/lib/forestal/croquis-componentes";
import type { PlantaZona } from "@/lib/forestal/planta-zona-types";

const URL_ZONAS = "/api/admin/forestal/ctp/planta/croquis/zonas";

export function useCroquisIdentificar(zonas: PlantaZona[], onChanged: () => void, onAviso: (msg: string) => void) {
  const pendientes = useMemo(() => zonas.filter((z) => !z.componente), [zonas]);
  const [identificando, setIdentificando] = useState(false);

  const identificar = useCallback(async () => {
    if (!pendientes.length || identificando) return;
    const componentes = pendientes.map((z) => ({ id: z.id, componente: identificarZona(z) }));
    setIdentificando(true);
    try {
      const r = await fetch(URL_ZONAS, {
        method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ componentes }),
      });
      const j = (await r.json().catch(() => ({}))) as { actualizadas?: unknown[]; message?: string; error?: string };
      if (!r.ok) {
        onAviso(`No se pudo identificar: ${j.message ?? j.error ?? (r.status === 403 ? "solo el dueño o el administrador configura el plano" : `HTTP ${r.status}`)}`);
        return;
      }
      const n = j.actualizadas?.length ?? 0;
      onAviso(`Identifiqué ${n} ${n === 1 ? "zona" : "zonas"}: ${resumenCategorias(componentes.map((c) => c.componente.categoria))}.`);
      onChanged();
    } catch (e) {
      onAviso(`No se pudo identificar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIdentificando(false);
    }
  }, [pendientes, identificando, onChanged, onAviso]);

  return { pendientes: pendientes.length, identificando, identificar };
}
