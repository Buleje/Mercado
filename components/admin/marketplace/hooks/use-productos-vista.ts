"use client";

/**
 * Filtros, orden, conteos, selección y edición de precio en línea de la vista
 * Productos del Marketplace. «Ver todos» limpia también la categoría (11-10:
 * antes la dejaba puesta y la lista seguía vacía después de «Limpiar filtros»).
 */

import { useMemo, useState } from "react";
import type { MarketplaceProduct } from "@/components/admin/marketplace/hooks/use-marketplace-products";

export type FiltroPublicado = "todos" | "publicados" | "inactivos";
export type FiltroStock = "todos" | "ok" | "critico" | "sin-stock";
export type ClaveProducto = "name" | "retailPrice" | "wholesalePrice" | "stock";
export type CampoPrecio = "retailPrice" | "wholesalePrice" | "discountPrice";

/** Hasta cuántas unidades el stock se considera crítico. */
export const STOCK_CRITICO = 5;

export function useProductosVista(products: readonly MarketplaceProduct[]) {
  const [query, setQuery] = useState("");
  const [publicado, setPublicado] = useState<FiltroPublicado>("todos");
  const [stock, setStock] = useState<FiltroStock>("todos");
  const [categoria, setCategoria] = useState("todos");
  const [sortKey, setSortKey] = useState<ClaveProducto>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const conteos = useMemo(
    () => ({
      publicados: products.filter((p) => p.isActive).length,
      inactivos: products.filter((p) => !p.isActive).length,
      critico: products.filter((p) => p.stock > 0 && p.stock <= STOCK_CRITICO).length,
      sinStock: products.filter((p) => p.stock <= 0).length,
    }),
    [products],
  );

  const categorias = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter((c): c is string => !!c))).sort(),
    [products],
  );

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pasan = products.filter((p) => {
      if (publicado === "publicados" && !p.isActive) return false;
      if (publicado === "inactivos" && p.isActive) return false;
      if (stock === "ok" && p.stock <= STOCK_CRITICO) return false;
      if (stock === "critico" && (p.stock <= 0 || p.stock > STOCK_CRITICO)) return false;
      if (stock === "sin-stock" && p.stock > 0) return false;
      if (categoria !== "todos" && p.category !== categoria) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.category?.toLowerCase().includes(q) ?? false);
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return pasan.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return 0;
    });
  }, [products, publicado, stock, categoria, query, sortKey, sortDir]);

  const idsVisibles = filtrados.map((p) => p.id);
  const todos = idsVisibles.length > 0 && idsVisibles.every((id) => seleccion.has(id));
  const algunos = idsVisibles.some((id) => seleccion.has(id));

  function alternar(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function alternarTodos() {
    setSeleccion((prev) => {
      const next = new Set(prev);
      for (const id of idsVisibles) {
        if (todos) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function ordenarPor(clave: ClaveProducto) {
    if (sortKey === clave) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(clave);
      setSortDir(clave === "name" ? "asc" : "desc");
    }
  }

  function limpiar() {
    setQuery("");
    setPublicado("todos");
    setStock("todos");
    setCategoria("todos");
  }

  const filtrosActivos = (query.trim() ? 1 : 0) + (publicado !== "todos" ? 1 : 0) + (stock !== "todos" ? 1 : 0) + (categoria !== "todos" ? 1 : 0);

  return {
    query, setQuery, publicado, setPublicado, stock, setStock, categoria, setCategoria, categorias,
    sortKey, sortDir, ordenarPor, limpiar, filtrosActivos,
    conteos, filtrados, seleccion, setSeleccion, alternar, alternarTodos, todos, algunos,
  };
}

export type ProductosVista = ReturnType<typeof useProductosVista>;

/**
 * El precio que se está editando en la tabla. La oferta admite vacío («sin
 * rebaja», va como `null`); los precios no: un retail vacío es un descarte.
 */
export function useEdicionPrecio(
  updatePrice: (id: string, cambio: Partial<Record<"retailPrice" | "wholesalePrice", number>>) => Promise<{ ok: boolean }>,
  updateOferta: (id: string, cambio: { discountPrice: number | null }) => Promise<{ ok: boolean }>,
) {
  const [editando, setEditando] = useState<{ id: string; field: CampoPrecio; value: string } | null>(null);

  function empezar(id: string, field: CampoPrecio, actual: number | null) {
    setEditando({ id, field, value: actual != null ? actual.toFixed(2) : "" });
  }

  async function confirmar() {
    if (!editando) return;
    const num = Number(editando.value);
    if (editando.field === "discountPrice") {
      const vacio = editando.value.trim() === "";
      if (!vacio && (!Number.isFinite(num) || num <= 0)) return setEditando(null);
      // Si el backend la rechaza (la oferta no baja el precio) queda lo tipeado para corregirlo.
      const r = await updateOferta(editando.id, { discountPrice: vacio ? null : num });
      if (r.ok) setEditando(null);
      return;
    }
    if (!Number.isFinite(num) || num < 0) return setEditando(null);
    const r = await updatePrice(editando.id, editando.field === "retailPrice" ? { retailPrice: num } : { wholesalePrice: num });
    if (r.ok) setEditando(null);
  }

  /** Props comunes de una celda editable de ESTE producto y campo. */
  function celda(id: string, field: CampoPrecio) {
    const activa = editando?.id === id && editando.field === field;
    return {
      isEditing: activa,
      editValue: activa ? editando.value : "",
      onChange: (v: string) => setEditando((prev) => (prev ? { ...prev, value: v } : prev)),
      onCommit: () => void confirmar(),
      onCancel: () => setEditando(null),
    };
  }

  return { editando, empezar, celda };
}
