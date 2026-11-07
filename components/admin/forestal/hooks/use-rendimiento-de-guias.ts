"use client";

/**
 * Lo que declaran VARIAS guías a la vez (Guardadas › «Rinde», 24-10): un pedido
 * `?volumen=1&numeros=…` por cada 50 N°. Devuelve las guías leídas por su clave
 * canónica. Una respuesta vieja no pisa a una más nueva (cambia la lista).
 */
import { useEffect, useMemo, useState } from "react";
import type { VolumenDeGuia } from "@/lib/forestal/cubicacion-rendimiento-guia";
import { claveNumeroGtf } from "@/lib/forestal/gtf-talonario";

const POR_PEDIDO = 50;
type Fila = { numero: string } & Partial<VolumenDeGuia>;

export function useRendimientoDeGuias(numeros: readonly string[]): { guias: ReadonlyMap<string, VolumenDeGuia>; cargando: boolean } {
  const clave = numeros.join("|");
  const [res, setRes] = useState<{ de: string; guias: Map<string, VolumenDeGuia> } | null>(null);

  useEffect(() => {
    if (!clave) return;
    let vigente = true;
    const lista = clave.split("|");
    const lotes: string[][] = [];
    for (let i = 0; i < lista.length; i += POR_PEDIDO) lotes.push(lista.slice(i, i + POR_PEDIDO));
    Promise.all(
      lotes.map(async (lote): Promise<Fila[]> => {
        const r = await fetch(`/api/admin/forestal/gtf?volumen=1&numeros=${encodeURIComponent(lote.join(","))}`, { credentials: "same-origin" });
        if (!r.ok) return [];
        return ((await r.json()) as { guias?: Fila[] }).guias ?? [];
      }),
    )
      .catch((): Fila[][] => [])
      .then((tandas) => {
        if (!vigente) return;
        const m = new Map<string, VolumenDeGuia>();
        for (const g of tandas.flat()) {
          const k = claveNumeroGtf(g.numero);
          if (k && g.tipo && Array.isArray(g.volumenPorEspecie) && typeof g.m3Total === "number") {
            m.set(k, { tipo: g.tipo, m3Total: g.m3Total, volumenPorEspecie: g.volumenPorEspecie });
          }
        }
        setRes({ de: clave, guias: m });
      });
    return () => { vigente = false; };
  }, [clave]);

  const vacio = useMemo(() => new Map<string, VolumenDeGuia>(), []);
  if (!clave) return { guias: vacio, cargando: false };
  return res && res.de === clave ? { guias: res.guias, cargando: false } : { guias: vacio, cargando: true };
}
