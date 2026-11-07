"use client";

import { useCallback, useMemo, useState } from "react";
import type { DbPurchaseOrder } from "@/lib/jsondb";

/**
 * use-filtros-ordenes-compra — buscar, acotar por fecha, ordenar y paginar.
 *
 * La pestaña sólo sabía filtrar por proveedor y estado, y pintaba TODAS las
 * órdenes de una: con un año de compras la pantalla se vuelve una tira infinita
 * donde encontrar "la del arroz de marzo" es imposible.
 *
 * Las fechas se comparan como día calendario de Lima, no como instante. Un
 * `new Date("2026-08-11")` es medianoche UTC = las 19:00 del día 10 en Perú, y
 * con eso el rango se come el último día. Convertir a `YYYY-MM-DD` en la zona
 * del negocio y comparar strings evita esa clase entera de bugs.
 */

export type OrdenDeLista = "reciente" | "antigua" | "mayor-monto" | "menor-monto" | "proveedor";
export type FiltroEstado = "todas" | "pendiente" | "parcial" | "recibido" | "cancelado";

export const ORDENES_DE_LISTA: Array<{ id: OrdenDeLista; label: string }> = [
  { id: "reciente", label: "Más recientes" },
  { id: "antigua", label: "Más antiguas" },
  { id: "mayor-monto", label: "Mayor monto" },
  { id: "menor-monto", label: "Menor monto" },
  { id: "proveedor", label: "Proveedor (A-Z)" },
];

export const POR_PAGINA = 10;

/** El día calendario en Pucallpa, como `YYYY-MM-DD`. */
function diaEnLima(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Sin tildes y en minúscula: buscar "distribuidora" encuentra "Distribuídora". */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function useFiltrosOrdenesCompra(orders: DbPurchaseOrder[]) {
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [orden, setOrden] = useState<OrdenDeLista>("reciente");
  const [estado, setEstado] = useState<FiltroEstado>("todas");
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);

  const filtradas = useMemo(() => {
    const q = normalizar(busqueda.trim());

    const resultado = orders.filter((o) => {
      if (proveedorId && o.supplierId !== proveedorId) return false;
      if (estado !== "todas" && o.status !== estado) return false;

      if (desde || hasta) {
        const dia = diaEnLima(o.createdAt);
        if (desde && dia < desde) return false;
        if (hasta && dia > hasta) return false;
      }

      if (q) {
        // Se busca por lo que uno recuerda: el proveedor, el número de la
        // factura, o qué producto era.
        const heno = [
          o.supplierName,
          o.invoiceNumber ?? "",
          o.notes ?? "",
          o.id,
          ...o.items.map((i) => i.name),
        ].join(" ");
        if (!normalizar(heno).includes(q)) return false;
      }

      return true;
    });

    const porFecha = (a: DbPurchaseOrder, b: DbPurchaseOrder) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

    switch (orden) {
      case "antigua":
        return resultado.sort((a, b) => -porFecha(a, b));
      case "mayor-monto":
        return resultado.sort((a, b) => Number(b.total) - Number(a.total));
      case "menor-monto":
        return resultado.sort((a, b) => Number(a.total) - Number(b.total));
      case "proveedor":
        return resultado.sort((a, b) => a.supplierName.localeCompare(b.supplierName, "es"));
      default:
        return resultado.sort(porFecha);
    }
  }, [orders, busqueda, desde, hasta, orden, estado, proveedorId]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  // Si los filtros achican la lista, la página 7 deja de existir: mostrar la
  // última en vez de una pantalla vacía.
  const paginaSegura = Math.min(pagina, totalPaginas);
  const visibles = useMemo(
    () => filtradas.slice((paginaSegura - 1) * POR_PAGINA, paginaSegura * POR_PAGINA),
    [filtradas, paginaSegura],
  );

  /** Cambiar cualquier filtro vuelve a la primera página. */
  const cambiar = useCallback(<T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPagina(1);
  }, []);

  const hayFiltros = Boolean(busqueda || desde || hasta || proveedorId || estado !== "todas");

  const limpiar = useCallback(() => {
    setBusqueda("");
    setDesde("");
    setHasta("");
    setProveedorId(null);
    setEstado("todas");
    setPagina(1);
  }, []);

  return {
    // valores
    busqueda, desde, hasta, orden, estado, proveedorId,
    pagina: paginaSegura, totalPaginas, hayFiltros,
    // resultados
    filtradas, visibles,
    // acciones (todas resetean la paginación)
    setBusqueda: cambiar(setBusqueda),
    setDesde: cambiar(setDesde),
    setHasta: cambiar(setHasta),
    setOrden: cambiar(setOrden),
    setEstado: cambiar(setEstado),
    setProveedorId: cambiar(setProveedorId),
    setPagina,
    limpiar,
  };
}
