"use client";

/**
 * Los datos de Entradas y salidas: productos, movimientos (por páginas) y
 * pérdidas. Un hook por fuente, con su error a la vista: antes un pedido que
 * fallaba dejaba la pantalla en «Sin movimientos», que se lee como un dato.
 */
import { useCallback, useEffect, useState } from "react";
import type { Movimiento, ProductoDeMovimiento } from "./tipos";

async function pedir<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body && typeof body.error === "string" ? body.error : `error ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

type ProductoApi = { id: number | string; name: string; unit?: string; stock?: number | null; category?: string; costPrice?: number | string | null };

export function useProductosDeMovimiento() {
  const [productos, setProductos] = useState<ProductoDeMovimiento[]>([]);
  const recargar = useCallback(async () => {
    try {
      const data = await pedir<ProductoApi[]>("/api/products");
      setProductos(
        Array.isArray(data)
          ? data.map((p) => ({
              id: Number(p.id),
              name: p.name,
              unit: p.unit ?? "und",
              stock: Number(p.stock ?? 0),
              category: p.category ?? "",
              costPrice: Number(p.costPrice ?? 0) || 0,
            }))
          : [],
      );
    } catch (err) {
      console.warn("[movimientos] productos no cargaron", err);
    }
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);
  return { productos, recargarProductos: recargar };
}

type PaginaMov = { items?: Movimiento[]; nextCursor?: string | null; total?: number };

/** El kardex por cursor (`paged=1`): un negocio activo no entra en una página. */
export function useMovimientos() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [totalServidor, setTotalServidor] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await pedir<PaginaMov>("/api/inventory-movements?paged=1&limit=100");
      setMovimientos(Array.isArray(data?.items) ? data.items : []);
      setCursor(data?.nextCursor ?? null);
      setTotalServidor(typeof data?.total === "number" ? data.total : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarMas = useCallback(async () => {
    if (!cursor || cargandoMas) return;
    setCargandoMas(true);
    try {
      const data = await pedir<PaginaMov>(`/api/inventory-movements?paged=1&limit=100&cursor=${encodeURIComponent(cursor)}`);
      if (Array.isArray(data?.items)) {
        setMovimientos((prev) => [...prev, ...data.items!]);
        setCursor(data.nextCursor ?? null);
      }
    } catch (err) {
      console.warn("[movimientos] traer más falló", err);
    } finally {
      setCargandoMas(false);
    }
  }, [cursor, cargandoMas]);

  useEffect(() => { void recargar(); }, [recargar]);
  return { movimientos, cursor, totalServidor, cargando, cargandoMas, error, recargar, cargarMas };
}

type PaginaMermas = { data?: Movimiento[]; total?: number };

/**
 * Las pérdidas (`/api/mermas`, que son los movimientos `merma`). Se piden 200,
 * el tope del endpoint: sin `limit` el servidor devolvía 20 y «Pérdida total»
 * sumaba sólo esas 20 sin decirlo.
 */
export function usePerdidas() {
  const [perdidas, setPerdidas] = useState<Movimiento[]>([]);
  const [totalServidor, setTotalServidor] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await pedir<PaginaMermas>("/api/mermas?limit=200");
      const filas = Array.isArray(data?.data) ? data.data : [];
      // DbMerma trae `registeredBy` y el lote en `batchId`; el resto es el movimiento tal cual.
      setPerdidas(
        filas.map((m) => {
          const extra = m as Movimiento & { registeredBy?: string; batchId?: string };
          return { ...m, type: "merma", createdBy: extra.registeredBy ?? m.createdBy, reference: extra.batchId ?? m.reference };
        }),
      );
      setTotalServidor(typeof data?.total === "number" ? data.total : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void recargar(); }, [recargar]);
  return { perdidas, totalServidor, cargando, error, recargar };
}
