"use client";

/**
 * Los datos de Recetas: las recetas, los productos (para costo, margen y stock de
 * los insumos) y los lotes producidos. Todo se pide una vez al abrir el módulo y
 * `recargar` lo vuelve a pedir tras crear una receta o producir un lote.
 */
import { useCallback, useEffect, useState } from "react";
import type { LoteProducido, ProductInfo, Receta } from "./tipos";

export function useRecetasDatos() {
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [productos, setProductos] = useState<Record<number, ProductInfo>>({});
  const [lotes, setLotes] = useState<LoteProducido[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recetasRes, prodsRes, lotesRes] = await Promise.all([
        fetch("/api/recetas"),
        fetch("/api/products?limit=500"),
        fetch("/api/recetas/produccion").catch(() => null),
      ]);
      if (!recetasRes.ok) throw new Error("Error al cargar recetas");
      setRecetas(await recetasRes.json());
      if (prodsRes.ok) {
        const prods: ProductInfo[] = await prodsRes.json();
        const mapa: Record<number, ProductInfo> = {};
        for (const p of prods) mapa[p.id] = p;
        setProductos(mapa);
      }
      // Sin lotes (o el pedido falló) la pantalla sigue: sólo se queda sin historial.
      const lotesData = lotesRes?.ok ? await lotesRes.json() : [];
      setLotes(Array.isArray(lotesData) ? lotesData : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { recargar(); }, [recargar]);

  return { recetas, productos, lotes, loading, error, recargar };
}
