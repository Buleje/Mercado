"use client";

import { useCallback, useEffect, useState } from "react";
import type { DbSupplier } from "@/lib/jsondb";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CompraDeProveedor, CuentaDeProveedor } from "./datos-proveedores";

/**
 * Los datos de la lista de Proveedores: proveedores, sus cuentas por pagar y
 * sus órdenes de compra, más el borrado. Las cuentas y las órdenes sólo
 * adornan la lista (deuda, última compra): si una falla, la lista sigue.
 */
export function useProveedores() {
  const [proveedores, setProveedores] = useState<DbSupplier[]>([]);
  const [cuentas, setCuentas] = useState<CuentaDeProveedor[]>([]);
  const [compras, setCompras] = useState<CompraDeProveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rp, rc, ro] = await Promise.all([fetch("/api/suppliers"), fetch("/api/payables"), fetch("/api/purchases")]);
      if (!rp.ok) throw new Error(`No se pudieron traer tus proveedores (${rp.status})`);
      setProveedores(await rp.json());
      if (rc.ok) setCuentas(await rc.json());
      if (ro.ok) setCompras(await ro.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron traer tus proveedores. Revisa la conexión.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** Devuelve lo que dijo el servidor si no se pudo borrar (antes se perdía y el modal parecía haber borrado). */
  const borrar = useCallback(async (id: string): Promise<string | null> => {
    try {
      // Sin `csrfHeaders` esto devolvía 403 SIEMPRE.
      const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE", headers: csrfHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return typeof body?.error === "string" ? body.error : "No se pudo eliminar el proveedor. Intenta de nuevo.";
      }
      await load();
      return null;
    } catch (err) {
      console.warn("[SuppliersTab] eliminar proveedor falló", err);
      return "No se pudo eliminar el proveedor. Revisa la conexión.";
    }
  }, [load]);

  return { proveedores, cuentas, compras, loading, error, load, borrar };
}
