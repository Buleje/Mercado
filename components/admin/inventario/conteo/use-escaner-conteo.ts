"use client";

import { useCallback, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

export interface ProductoBuscado {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  stock: number;
  price: number;
  unit: string;
}

export interface ItemContado {
  productId: number;
  productName: string;
  sku: string;
  barcode: string;
  systemStock: number;
  physicalStock: number;
  price: number;
  unit: string;
}

export type EstadoBusqueda = "idle" | "loading" | "found" | "notfound" | "error";
export type EstadoGuardado = "idle" | "saving" | "saved" | "error";

/** Conteo con escáner: busca por código, junta lo contado y lo manda a `/api/stock/physical-count`. */
export function useEscanerConteo() {
  const codigoRef = useRef<HTMLInputElement>(null);
  const cantidadRef = useRef<HTMLInputElement>(null);

  const [code, setCode] = useState("");
  const [busqueda, setBusqueda] = useState<EstadoBusqueda>("idle");
  const [producto, setProducto] = useState<ProductoBuscado | null>(null);
  const [fisico, setFisico] = useState<number | "">("");
  const [contados, setContados] = useState<ItemContado[]>([]);
  const [guardado, setGuardado] = useState<EstadoGuardado>("idle");
  const [errorBusqueda, setErrorBusqueda] = useState("");

  const buscar = useCallback(async (crudo: string) => {
    const codigo = crudo.trim();
    if (!codigo) return;
    setBusqueda("loading");
    setProducto(null);
    setFisico("");
    setErrorBusqueda("");
    try {
      const res = await fetch(`/api/barcode-lookup?code=${encodeURIComponent(codigo)}`);
      if (!res.ok) {
        if (res.status === 404) setBusqueda("notfound");
        else throw new Error("Error del servidor");
        return;
      }
      setProducto((await res.json()) as ProductoBuscado);
      setBusqueda("found");
      setTimeout(() => cantidadRef.current?.focus(), 50);
    } catch {
      setErrorBusqueda("No se pudo conectar con el servidor.");
      setBusqueda("error");
    }
  }, []);

  const agregar = useCallback(() => {
    if (!producto || fisico === "") return;
    const phys = Number(fisico);
    if (isNaN(phys) || phys < 0) return;
    const nuevo: ItemContado = {
      productId: producto.id,
      productName: producto.name,
      sku: producto.sku,
      barcode: producto.barcode ?? "",
      systemStock: producto.stock,
      physicalStock: phys,
      price: producto.price,
      unit: producto.unit,
    };
    setContados((prev) => {
      const i = prev.findIndex((c) => c.productId === producto.id);
      if (i < 0) return [nuevo, ...prev];
      const next = [...prev];
      next[i] = nuevo;
      return next;
    });
    setCode("");
    setProducto(null);
    setFisico("");
    setBusqueda("idle");
    codigoRef.current?.focus();
  }, [producto, fisico]);

  const quitar = useCallback((productId: number) => {
    setContados((prev) => prev.filter((c) => c.productId !== productId));
  }, []);

  const guardar = useCallback(async () => {
    if (contados.length === 0) return;
    setGuardado("saving");
    try {
      const items = contados.map((c) => ({
        productId: c.productId,
        systemStock: c.systemStock,
        physicalStock: c.physicalStock,
        difference: c.physicalStock - c.systemStock,
      }));
      const res = await fetch("/api/stock/physical-count", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setGuardado("saved");
      setTimeout(() => { setContados([]); setGuardado("idle"); }, 2000);
    } catch (err) {
      console.warn("[QuickStockCounter] no se pudo guardar el conteo:", err);
      setGuardado("error");
      setTimeout(() => setGuardado("idle"), 3000);
    }
  }, [contados]);

  const resumen = contados.reduce(
    (acc, it) => {
      const dif = it.physicalStock - it.systemStock;
      acc.total += 1;
      if (dif !== 0) { acc.conDiferencia += 1; acc.valorDiferencia += dif * it.price; }
      return acc;
    },
    { total: 0, conDiferencia: 0, valorDiferencia: 0 },
  );

  return {
    codigoRef, cantidadRef, code, setCode, busqueda, producto, fisico, setFisico, contados,
    guardado, errorBusqueda, resumen, buscar, agregar, quitar, guardar,
  };
}
