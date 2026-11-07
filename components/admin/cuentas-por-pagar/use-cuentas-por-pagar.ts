"use client";

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CuentaPorPagar } from "./resumen-cuentas";

/** `diasCredito` sale de la ficha del proveedor: llena solo el «Vence» de una cuenta nueva. */
export type ProveedorBasico = { id: string; name: string; diasCredito?: number | null };
export type MetodoPago = "efectivo" | "yape" | "plin" | "transferencia";

/** `description` llega armada con su referencia (`armarDescripcion`); `purchaseOrderId` sólo si sale de una orden. */
export type NuevaCuenta = { supplierId: string; description: string; amount: string; dueDate: string; purchaseOrderId?: string };
/** El alta y el vínculo devuelven el motivo del rechazo para mostrarlo DENTRO de la ventana. */
export type ResultadoAccion = { ok: true } | { ok: false; error: string };
export type PagoCuenta = { amount: string; method: MetodoPago; reference: string; salidaDeCaja: boolean };
/** Respuesta del pago según el contrato «sale de la caja» (`caja` sólo si se pidió). */
export type ResultadoPago = { ok: true; caja?: { sinCaja: boolean } } | { ok: false };

/**
 * La cuenta que devuelve una escritura (`DbPayable`, o `{ payable }`). Se aplica
 * a la lista sin volver a pedirla: el GET de `/api/payables` está en caché y la
 * invalidación de PayablesDB es «max» (sirve la versión vieja una vez), así que
 * recargar mostraba la cuenta sin el pago recién hecho.
 */
function cuentaDeRespuesta(j: unknown): CuentaPorPagar | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const c = (typeof o.id === "string" && "amount" in o ? o : o.payable) as CuentaPorPagar | undefined;
  return c && typeof c.id === "string" ? { ...c, amount: Number(c.amount), paidAmount: Number(c.paidAmount), payments: c.payments ?? [] } : null;
}

/** Mensaje legible de una respuesta fallida (antes las mutaciones fallaban en silencio). */
async function leerError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (typeof j?.error === "string") return j.error;
  } catch { /* sin cuerpo JSON */ }
  if (res.status === 403) return "Tu rol no puede ver ni pagar cuentas por pagar.";
  return `No se pudo completar la operación (${res.status}).`;
}

/** Datos y acciones de «Por pagar»: carga, alta, pago y borrado. */
export function useCuentasPorPagar() {
  const [cuentas, setCuentas] = useState<CuentaPorPagar[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorBasico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [payRes, supRes] = await Promise.all([fetch("/api/payables"), fetch("/api/suppliers")]);
      if (payRes.ok) setCuentas(await payRes.json());
      else setError(await leerError(payRes));
      if (supRes.ok) {
        const j = await supRes.json();
        setProveedores(Array.isArray(j) ? j : (j?.suppliers ?? []));
      }
    } catch {
      setError("Sin conexión: no se pudieron cargar las cuentas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const crear = useCallback(async (f: NuevaCuenta): Promise<ResultadoAccion> => {
    const sup = proveedores.find((s) => s.id === f.supplierId);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/payables", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          supplierId: f.supplierId,
          supplierName: sup?.name || "",
          description: f.description,
          amount: Number(f.amount),
          dueDate: f.dueDate ? new Date(f.dueDate).toISOString() : new Date().toISOString(),
          ...(f.purchaseOrderId ? { purchaseOrderId: f.purchaseOrderId } : {}),
        }),
      });
      if (!res.ok) return { ok: false, error: await leerError(res) };
      const nueva = cuentaDeRespuesta(await res.json().catch(() => null));
      if (nueva) setCuentas((prev) => [nueva, ...prev.filter((c) => c.id !== nueva.id)]);
      else await load();
      return { ok: true };
    } catch {
      return { ok: false, error: "Sin conexión: la cuenta no se guardó." };
    } finally {
      setSaving(false);
    }
  }, [proveedores, load]);

  /** C41: la cuenta cargada a mano queda vinculada a la orden que apareció después. */
  const vincular = useCallback(async (id: string, purchaseOrderId: string): Promise<ResultadoAccion> => {
    setSaving(true);
    try {
      const res = await fetch(`/api/payables/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ purchaseOrderId }),
      });
      if (!res.ok) return { ok: false, error: await leerError(res) };
      const actual = cuentaDeRespuesta(await res.json().catch(() => null));
      setCuentas((prev) => prev.map((c) => (c.id === id ? (actual ?? { ...c, purchaseOrderId }) : c)));
      return { ok: true };
    } catch {
      return { ok: false, error: "Sin conexión: no se vinculó la orden." };
    } finally {
      setSaving(false);
    }
  }, []);

  const pagar = useCallback(async (id: string, p: PagoCuenta): Promise<ResultadoPago> => {
    setSaving(true);
    setError(null);
    try {
      const efectivo = p.method === "efectivo";
      const res = await fetch(`/api/payables/${encodeURIComponent(id)}/payments`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          amount: Number(p.amount),
          method: p.method,
          reference: p.reference || undefined,
          // Contrato «sale de la caja»: sólo vale con efectivo.
          ...(efectivo && p.salidaDeCaja ? { salidaDeCaja: true } : {}),
        }),
      });
      if (!res.ok) { setError(await leerError(res)); return { ok: false }; }
      const j = await res.json().catch(() => null);
      const actual = cuentaDeRespuesta(j);
      if (actual) setCuentas((prev) => prev.map((c) => (c.id === actual.id ? actual : c)));
      else await load();
      const caja = j && typeof j === "object" && j.caja && typeof j.caja.sinCaja === "boolean" ? { sinCaja: j.caja.sinCaja as boolean } : undefined;
      return { ok: true, caja };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const eliminar = useCallback(async (id: string) => {
    setError(null);
    const res = await fetch(`/api/payables/${encodeURIComponent(id)}`, { method: "DELETE", headers: csrfHeaders() });
    if (!res.ok) { setError(await leerError(res)); return; }
    setCuentas((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { cuentas, proveedores, loading, error, setError, saving, load, crear, vincular, pagar, eliminar };
}
