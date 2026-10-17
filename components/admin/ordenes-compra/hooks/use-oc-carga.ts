import { useEffect, useCallback, useRef } from "react";
import type { DbProduct } from "@/lib/jsondb";
import { useOcEstado } from "@/components/admin/ordenes-compra/hooks/use-oc-estado";
import { useOcRecurrentes } from "@/components/admin/ordenes-compra/hooks/use-oc-recurrentes";
import { useOcModales } from "@/components/admin/ordenes-compra/hooks/use-oc-modales";

/** Carga de órdenes, proveedores y productos, y el proveedor que deja el Comparador. Parte de `useOrdenesCompra`. */
export function useOcCarga(previo: ReturnType<typeof useOcEstado> & ReturnType<typeof useOcRecurrentes> & ReturnType<typeof useOcModales>) {
  const {
    setOrders, setLoading, setShowCreate, suppliers, setSuppliers, setProducts, setSupplierId,
  } = previo;
  // Una carga que salió antes de un cambio de estado trae las órdenes viejas: el
  // GET del doble montaje podía volver después de elegir el estado y el select
  // regresaba al anterior aunque ya estaba guardado (mismo bug que Tareas,
  // 2026-09-14). Sólo aplica lo suyo la carga más nueva y sin cambios de por
  // medio; cada cambio de estado termina con una carga que trae lo guardado.
  const ordenesRef = useRef({ ultima: 0, cambios: 0 });
  const load = useCallback(async (opciones?: { silenciosa?: boolean }) => {
    const esta = ++ordenesRef.current.ultima;
    const cambiosAlSalir = ordenesRef.current.cambios;
    const vigente = () => esta === ordenesRef.current.ultima && cambiosAlSalir === ordenesRef.current.cambios;
    if (!opciones?.silenciosa) setLoading(true);
    try {
      const [poRes, supRes, prodRes] = await Promise.all([
        fetch("/api/purchases"),
        fetch("/api/suppliers"),
        fetch("/api/products"),
      ]);
      if (poRes.ok) { const d = await poRes.json(); if (vigente()) setOrders(Array.isArray(d) ? d : d?.purchases ?? []); }
      if (supRes.ok) { const d = await supRes.json(); if (vigente()) setSuppliers(Array.isArray(d) ? d : d?.suppliers ?? []); }
      if (prodRes.ok) { const d = await prodRes.json(); if (vigente()) setProducts((Array.isArray(d) ? d : []).filter((p: DbProduct) => p.active)); }
    } catch {}
    if (esta === ordenesRef.current.ultima) setLoading(false);
  }, [setLoading, setOrders, setProducts, setSuppliers]);

   
  useEffect(() => { void load(); }, [load]);

  // "Crear OC" desde el Comparador de proveedores deja el proveedor en un stash;
  // al montar (con proveedores ya cargados) abrimos el form de Nueva Orden
  // preseleccionado y limpiamos el stash. Reemplaza el POST roto del comparador.
  useEffect(() => {
    if (suppliers.length === 0) return;
    let stash: { id: string; name: string } | null = null;
    try {
      const raw = localStorage.getItem("bsm-new-oc-supplier");
      if (raw) stash = JSON.parse(raw) as { id: string; name: string };
    } catch { /* ignore */ }
    if (!stash) return;
    try { localStorage.removeItem("bsm-new-oc-supplier"); } catch { /* ignore */ }
    if (suppliers.some(s => s.id === stash!.id)) {
      setSupplierId(stash.id);
      setShowCreate(true);
    }
  }, [suppliers, setShowCreate, setSupplierId]);
  return {
    ordenesRef, load,
  };
}
