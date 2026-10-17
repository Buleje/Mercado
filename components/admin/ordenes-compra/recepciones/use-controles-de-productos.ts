import { useCallback, useEffect, useState } from "react";
import { controlDeLinea, type ControlDeLinea } from "@/lib/compras/conformidad-recepcion";

type ProductoCorto = { id?: number | string; type?: string | null; category?: string | null };

/**
 * C22 · El control pertinente de cada producto (servicio / perecible) para la
 * ventana de recibir desde una orden, que sólo trae id, nombre y costo de cada
 * línea. Pide `/api/products` una vez al abrir; mientras carga (o si falla)
 * no pide nada extra: la recepción sigue como antes.
 */
export function useControlesDeProductos(): (productId: number | undefined) => ControlDeLinea {
  const [porId, setPorId] = useState<Map<number, ControlDeLinea>>(() => new Map());
  useEffect(() => {
    let vivo = true;
    fetch("/api/products", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: unknown) => {
        if (!vivo) return;
        const lista = (Array.isArray(d) ? d : ((d as { products?: unknown[] })?.products ?? [])) as ProductoCorto[];
        const m = new Map<number, ControlDeLinea>();
        for (const p of lista) if (typeof p.id === "number") m.set(p.id, controlDeLinea(p));
        setPorId(m);
      })
      .catch((err: unknown) => console.warn("[recepcion] sin tipos de producto", err));
    return () => { vivo = false; };
  }, []);
  return useCallback((productId) => (productId == null ? null : porId.get(productId) ?? null), [porId]);
}
