"use client";

/**
 * Los datos de Devoluciones a proveedores: lista con cache SWR (60 s), proveedores,
 * productos del inventario y las mutaciones (registrar, avanzar de estado, anular,
 * volver al almacén, poner costo). El stock que sale o vuelve, el tope de lo que se
 * puede devolver y los costos los decide el servidor; acá sólo se muestran.
 *
 * 17-10 (C55): ya no se borra. Anular deja la fila con el motivo y, si la mercadería
 * había salido, pregunta si volvió al almacén.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductOption } from "@/components/admin/shared/ProductCombobox";
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
export interface DatosNuevaDevolucion {
  proveedorId: string;
  motivo: string;
  notas: string;
  items: ItemDevuelto[];
  /** C49: la orden recibida de la que sale lo devuelto. */
  origenOrdenId?: string;
  /** Si lo devuelto no entró de este proveedor por el sistema: por qué. */
  sinOrigenMotivo?: string;
}
/** Resultado de una acción que se hace desde una ventana: si falla, la ventana lo muestra. */
export type ResultadoAccion = { ok: true } | { ok: false; error: string };
type ConAvisos = Devolucion & { avisos?: string[] };

export function useDevoluciones() {
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProveedores, setLoadingProveedores] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

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
  async function registrar({ proveedorId, motivo, notas, items, origenOrdenId, sinOrigenMotivo }: DatosNuevaDevolucion): Promise<boolean> {
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
          origenOrdenId: origenOrdenId || undefined,
          sinOrigenMotivo: sinOrigenMotivo?.trim() || undefined,
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

  /**
   * Una mutación sobre una fila: la marca ocupada, reemplaza la fila con lo que
   * devuelve el servidor y termina con una recarga silenciosa (carga vieja no pisa).
   */
  async function mutar(
    id: string,
    url: string,
    init: { method: "PATCH" | "POST"; body: unknown },
    accion: string,
    exito: (d: ConAvisos) => string,
  ): Promise<ResultadoAccion> {
    cargasRef.current.cambios += 1;
    setActionId(id);
    setAviso(null);
    try {
      const res = await fetch(url, {
        method: init.method,
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(init.body),
      });
      if (!res.ok) return { ok: false, error: await mensajeDeError(res, accion) };
      const updated = (await res.json()) as ConAvisos;
      persistir((prev) => prev.map((d) => (d.id === id ? updated : d)));
      const pendientes = updated.avisos ?? [];
      setAviso({ tipo: pendientes.length > 0 ? "error" : "ok", texto: [exito(updated), ...pendientes].filter(Boolean).join(" ") });
      return { ok: true };
    } catch {
      return { ok: false, error: `Sin conexión con el servidor. No se pudo ${accion}.` };
    } finally {
      setActionId(null);
      void fetchDevoluciones(true, { silenciosa: true });
    }
  }

  /** La de la fila muestra su error en el aviso de arriba; la de una ventana, adentro. */
  const enAviso = (r: ResultadoAccion) => { if (!r.ok) setAviso({ tipo: "error", texto: r.error }); };

  async function avanzarEstado(id: string) {
    const dev = devoluciones.find((d) => d.id === id);
    const siguiente = dev ? ESTADO_SIGUIENTE[dev.estado] : null;
    if (!dev || !siguiente) return;
    enAviso(await mutar(id, `/api/supplier-returns/${id}`, { method: "PATCH", body: { estado: siguiente } }, "cambiar el estado", (u) =>
      // Al marcar enviada la mercadería sale del stock (ADR-379): decirlo es parte del cambio.
      `${dev.proveedorNombre}: ${ESTADO_LABEL[siguiente].toLowerCase()}.${siguiente === "ENVIADA" && u.stockAplicadoAt ? " La mercadería salió del inventario." : ""}`));
  }

  /** C55: reemplaza al borrado. `volvioAlAlmacen` sólo pesa si la mercadería ya había salido. */
  function anular(id: string, motivo: string, volvioAlAlmacen: boolean): Promise<ResultadoAccion> {
    const dev = devoluciones.find((d) => d.id === id);
    const salio = !!dev?.stockAplicadoAt;
    return mutar(id, `/api/supplier-returns/${id}/anular`, { method: "POST", body: { motivo, volvioAlAlmacen } }, "anular la devolución", () =>
      `Devolución a ${dev?.proveedorNombre ?? "el proveedor"} anulada.${salio ? (volvioAlAlmacen ? " La mercadería regresó al inventario." : " La mercadería sigue fuera del almacén: el inventario no cambió.") : ""}`);
  }

  async function reingresar(id: string) {
    enAviso(await mutar(id, `/api/supplier-returns/${id}/reingresar`, { method: "POST", body: {} }, "devolverla al inventario", () =>
      "La mercadería volvió al almacén y regresó al inventario."));
  }

  /** C51: costo para los ítems que quedaron «pendientes de valoración». */
  function valorar(id: string, valores: Array<{ itemId: number; precioUnitario: number }>): Promise<ResultadoAccion> {
    return mutar(id, `/api/supplier-returns/${id}`, { method: "PATCH", body: { valorar: valores } }, "guardar el costo", (u) => {
      const quedan = u.items.filter((i) => i.precioUnitario == null).length;
      return quedan > 0 ? `Costo guardado. Faltan ${quedan === 1 ? "1 ítem" : `${quedan} ítems`} sin costo.` : "Costo guardado: la devolución ya tiene su valor.";
    });
  }

  return {
    devoluciones, proveedores, products, loading, loadingProveedores, actionId, guardando, aviso, setAviso,
    recargar: () => fetchDevoluciones(true), registrar, avanzarEstado, anular, reingresar, valorar,
  };
}
