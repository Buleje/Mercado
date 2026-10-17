"use client";

/**
 * Los datos de Devoluciones a proveedores: lista con cache SWR (60 s), proveedores,
 * productos del inventario y las tres mutaciones (registrar, avanzar de estado,
 * eliminar). Lo que se manda al backend es lo de siempre: el stock que sale y los
 * montos los calcula el servidor; acá sólo se muestran.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductOption } from "@/components/admin/shared/ProductCombobox";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  ESTADO_LABEL,
  ESTADO_SIGUIENTE,
  mensajeDeError,
  type Devolucion,
  type ItemDevuelto,
  type Proveedor,
} from "./tipos";

const CACHE_KEY = "admin-devoluciones-cache";
const CACHE_TTL = 60 * 1000;
const LOG = "[DevolucionesProveedorModule]";

export interface Aviso { tipo: "error" | "ok"; texto: string }
export interface DatosNuevaDevolucion { proveedorId: string; motivo: string; notas: string; items: ItemDevuelto[] }

export function useDevoluciones() {
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProveedores, setLoadingProveedores] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const { confirm } = useConfirm();

  /**
   * Deja el estado y el cache de localStorage en la misma página. Toma un updater
   * (no una lista ya calculada) para que dos acciones seguidas sobre filas
   * distintas no se pisen: la segunda parte SIEMPRE del estado más reciente.
   */
  const persistir = useCallback((actualizar: (prev: Devolucion[]) => Devolucion[]) => {
    setDevoluciones((prev) => {
      const next = actualizar(prev);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: next, ts: Date.now() })); } catch { /* quota */ }
      return next;
    });
  }, []);

  // Una carga que salió antes de un cambio trae la lista vieja (y la dejaba en el
  // cache): sólo aplica su lista la carga más nueva y sin cambios de por medio;
  // cada cambio termina con una carga silenciosa que trae lo guardado.
  const cargasRef = useRef({ ultima: 0, cambios: 0 });
  const fetchDevoluciones = useCallback(async (forzar = false, opciones?: { silenciosa?: boolean }) => {
    if (!forzar) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, ts } = JSON.parse(cached) as { data: Devolucion[]; ts: number };
          if (Array.isArray(data)) {
            setDevoluciones(data);
            setLoading(false);
            if (Date.now() - ts < CACHE_TTL) return;
          }
        }
      } catch { /* ignore */ }
    }
    const esta = ++cargasRef.current.ultima;
    const cambiosAlSalir = cargasRef.current.cambios;
    if (!opciones?.silenciosa) setLoading(true);
    try {
      const res = await fetch("/api/supplier-returns");
      if (res.ok) {
        const data = await res.json();
        if (esta === cargasRef.current.ultima && cambiosAlSalir === cargasRef.current.cambios) {
          setDevoluciones(data);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota */ }
        }
      } else if (opciones?.silenciosa) {
        console.warn(`${LOG} recarga silenciosa sin éxito:`, res.status);
      } else {
        setAviso({ tipo: "error", texto: await mensajeDeError(res, "cargar las devoluciones") });
      }
    } catch (err) {
      if (opciones?.silenciosa) console.warn(`${LOG} recarga silenciosa falló:`, String(err));
      else setAviso({ tipo: "error", texto: "Sin conexión con el servidor. Revisa tu internet." });
    } finally {
      if (esta === cargasRef.current.ultima) setLoading(false);
    }
  }, []);

  const fetchProveedores = useCallback(async () => {
    setLoadingProveedores(true);
    try {
      const res = await fetch("/api/suppliers");
      if (res.ok) {
        const data = await res.json();
        setProveedores(data.suppliers ?? data ?? []);
      }
    } catch (err) {
      console.warn(`${LOG} proveedores no cargaron:`, String(err));
    }
    setLoadingProveedores(false);
  }, []);

  useEffect(() => { fetchDevoluciones(); }, [fetchDevoluciones]);
  useEffect(() => { fetchProveedores(); }, [fetchProveedores]);

  // Productos del inventario para el combobox (una vez): el producto era texto libre.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : (data as { products?: unknown[] })?.products ?? [];
        const list = (arr as Array<{ id?: number | string; name?: string; stock?: number | null; unit?: string; barcode?: string; costPrice?: number | null }>)
          .filter((p) => !!p.name)
          // `costPrice` se conserva (ADR-379): es lo que se le reclama al proveedor.
          .map((p) => ({ id: p.id ?? p.name!, name: p.name!, stock: p.stock ?? null, unit: p.unit, barcode: p.barcode, costPrice: p.costPrice ?? null }));
        setProducts(list);
      })
      .catch((err) => console.warn(`${LOG} products load failed:`, err));
    return () => { cancelled = true; };
  }, []);

  /** Devuelve true si se registró (el formulario se cierra solo en ese caso). */
  async function registrar({ proveedorId, motivo, notas, items }: DatosNuevaDevolucion): Promise<boolean> {
    const itemsValidos = items.filter((i) => i.nombre.trim() !== "");
    if (!proveedorId || itemsValidos.length === 0) return false;

    cargasRef.current.cambios += 1;
    setGuardando(true);
    setAviso(null);
    let ok = false;
    try {
      const proveedor = proveedores.find((p) => p.id === proveedorId);
      const res = await fetch("/api/supplier-returns", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          proveedorId,
          proveedorNombre: proveedor?.name ?? proveedorId,
          motivo,
          notas: notas.trim() || undefined,
          items: itemsValidos,
        }),
      });
      if (res.ok) {
        const nueva = await res.json();
        persistir((prev) => [nueva, ...prev]);
        setAviso({ tipo: "ok", texto: `Devolución registrada para ${proveedor?.name ?? "el proveedor"}.` });
        ok = true;
      } else {
        setAviso({ tipo: "error", texto: await mensajeDeError(res, "registrar la devolución") });
      }
    } catch {
      setAviso({ tipo: "error", texto: "Sin conexión con el servidor. La devolución no se guardó." });
    } finally {
      setGuardando(false);
      void fetchDevoluciones(true, { silenciosa: true });
    }
    return ok;
  }

  async function avanzarEstado(id: string) {
    const dev = devoluciones.find((d) => d.id === id);
    if (!dev) return;
    const siguiente = ESTADO_SIGUIENTE[dev.estado];
    if (!siguiente) return;

    cargasRef.current.cambios += 1;
    setActionId(id);
    setAviso(null);
    try {
      const res = await fetch(`/api/supplier-returns/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ estado: siguiente }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Devolucion & { avisos?: string[] };
        persistir((prev) => prev.map((d) => (d.id === id ? updated : d)));
        // Al marcar enviada la mercadería sale del stock (ADR-379): decirlo es parte del cambio.
        const salioDelStock = siguiente === "ENVIADA" && !!updated.stockAplicadoAt;
        const pendientes = updated.avisos ?? [];
        setAviso({
          tipo: pendientes.length > 0 ? "error" : "ok",
          texto: [
            `${dev.proveedorNombre}: ${ESTADO_LABEL[siguiente].toLowerCase()}.`,
            salioDelStock ? "La mercadería salió del inventario." : "",
            ...pendientes,
          ].filter(Boolean).join(" "),
        });
      } else {
        setAviso({ tipo: "error", texto: await mensajeDeError(res, "cambiar el estado") });
      }
    } catch {
      setAviso({ tipo: "error", texto: "Sin conexión con el servidor. El estado no cambió." });
    } finally {
      setActionId(null);
      void fetchDevoluciones(true, { silenciosa: true });
    }
  }

  async function eliminar(id: string) {
    // El borrado es definitivo: un click equivocado se llevaba el registro de algo que quizá ya se reclamó.
    const dev = devoluciones.find((d) => d.id === id);
    const detalle = dev ? `la devolución a ${dev.proveedorNombre} (${dev.items.length} item${dev.items.length === 1 ? "" : "s"})` : "esta devolución";
    if (!(await confirm({
      title: `¿Eliminar ${detalle}?`,
      description: "Es definitivo: no queda en la papelera ni se puede deshacer.",
      intent: "danger",
      confirmLabel: "Sí, eliminar",
    }))) return;

    cargasRef.current.cambios += 1;
    setActionId(id);
    setAviso(null);
    try {
      const res = await fetch(`/api/supplier-returns/${id}`, { method: "DELETE", headers: csrfHeaders() });
      if (res.ok) {
        persistir((prev) => prev.filter((d) => d.id !== id));
        setAviso({ tipo: "ok", texto: "Devolución eliminada." });
      } else {
        setAviso({ tipo: "error", texto: await mensajeDeError(res, "eliminar la devolución") });
      }
    } catch {
      setAviso({ tipo: "error", texto: "Sin conexión con el servidor. No se eliminó nada." });
    } finally {
      setActionId(null);
      void fetchDevoluciones(true, { silenciosa: true });
    }
  }

  return {
    devoluciones, proveedores, products, loading, loadingProveedores, actionId, guardando, aviso, setAviso,
    recargar: () => fetchDevoluciones(true), registrar, avanzarEstado, eliminar,
  };
}
