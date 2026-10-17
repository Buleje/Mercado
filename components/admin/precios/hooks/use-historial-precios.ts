"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/types/erp";
import { limaDateKey } from "@/lib/utils";
import { FILTROS_VACIOS, variacionPct, type FiltrosPrecios, type PriceRecord } from "../precios-compartido";

/**
 * Historial de cambios de precio: carga (de todos los productos o de uno solo),
 * filtros y las cuentas de los indicadores. Los números son conteos de las filas
 * que ya trae `/api/price-history`; no hay totales de dinero.
 */
export function useHistorialPrecios(productId?: number) {
  const [history, setHistory] = useState<PriceRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosPrecios>({
    ...FILTROS_VACIOS,
    producto: productId != null ? String(productId) : "",
  });

  useEffect(() => {
    let active = true;
    const historyUrl = productId != null ? `/api/products/${productId}/price-history` : "/api/price-history";
    Promise.all([fetch(historyUrl), productId == null ? fetch("/api/products") : Promise.resolve(null)])
      .then(([hRes, pRes]) => {
        if (!hRes.ok) setError(true);
        return Promise.all([hRes.ok ? hRes.json() : [], pRes && pRes.ok ? pRes.json() : []]);
      })
      .then(([h, p]: [PriceRecord[], Product[]]) => {
        if (!active) return;
        setHistory(h);
        setProducts(p);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [productId]);

  const nombres = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.name])), [products]);

  const filas = useMemo(() => {
    const q = filtros.search.trim().toLowerCase();
    const lista = history.filter((h) => {
      if (filtros.producto && h.productId !== Number(filtros.producto)) return false;
      if (filtros.sentido === "subio" && !(h.newPrice > h.oldPrice)) return false;
      if (filtros.sentido === "bajo" && !(h.newPrice < h.oldPrice)) return false;
      const dia = limaDateKey(h.changedAt);
      if (filtros.desde && dia < filtros.desde) return false;
      if (filtros.hasta && dia > filtros.hasta) return false;
      if (q) {
        const nombre = (nombres[h.productId] ?? "").toLowerCase();
        if (!nombre.includes(q) && !(h.changedBy ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
    return lista.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  }, [history, filtros, nombres]);

  const cuentas = useMemo(() => {
    const subas = filas.filter((h) => h.newPrice > h.oldPrice).length;
    const bajas = filas.filter((h) => h.newPrice < h.oldPrice).length;
    const pcts = filas.map(variacionPct).filter((v): v is number => v != null);
    const promedio = pcts.length ? pcts.reduce((s, v) => s + v, 0) / pcts.length : null;
    return { cambios: filas.length, subas, bajas, promedio, productos: new Set(filas.map((h) => h.productId)).size };
  }, [filas]);

  const productosConCambios = useMemo(() => [...new Set(history.map((h) => h.productId))], [history]);
  const hayFiltros = Object.entries(filtros).some(([k, v]) => v && !(k === "producto" && productId != null));

  return {
    loading, error, filas, cuentas, nombres, filtros, setFiltros, productosConCambios, hayFiltros,
    limpiar: () => setFiltros({ ...FILTROS_VACIOS, producto: productId != null ? String(productId) : "" }),
  };
}
