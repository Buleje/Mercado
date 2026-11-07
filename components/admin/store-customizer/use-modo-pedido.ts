"use client";
/**
 * «Cómo te piden tus clientes»: WhatsApp o formulario de compra. ÚNICA fuente
 * de verdad = `Settings.mode` (20-10). Lo leen la tienda clásica (CartSidebar)
 * y, desde el 20-10, también la plantilla nueva (`extensiones/pagina-tienda/
 * datos.ts`), que antes tenía su propio `tiendaPlantilla.pedido`.
 * Se guarda al elegir (como el modo vacaciones): PUT parcial `{ mode }`,
 * optimista y con vuelta atrás si falla.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";

export type ModoPedido = "whatsapp" | "checkout";

export type EstadoModo = "cargando" | "listo" | "guardando" | "guardado" | "error";

export interface ModoPedidoApi {
  modo: ModoPedido | null;
  estado: EstadoModo;
  error: string | null;
  cambiar: (m: ModoPedido) => Promise<void>;
  reintentar: () => void;
}

const comoModo = (v: unknown): ModoPedido | null => (v === "whatsapp" || v === "checkout" ? v : null);

export function useModoPedido(): ModoPedidoApi {
  const [modo, setModo] = useState<ModoPedido | null>(null);
  const [estado, setEstado] = useState<EstadoModo>("cargando");
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const slug = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        slug.current = await resolveActiveTenantSlug();
        const res = await fetch("/api/settings", { headers: { "x-tenant-id": slug.current } });
        if (!res.ok) throw new Error(`error ${res.status}`);
        const data: unknown = await res.json();
        if (!vivo) return;
        setModo(comoModo((data as { mode?: unknown } | null)?.mode) ?? "checkout");
        setEstado("listo");
        setError(null);
      } catch (err) {
        if (!vivo) return;
        setEstado("error");
        setError(`No se pudo leer cómo te piden (${err instanceof Error ? err.message : "sin conexión"}).`);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [vuelta]);

  const cambiar = useCallback(
    async (m: ModoPedido) => {
      if (m === modo || estado === "guardando") return;
      const antes = modo;
      setModo(m);
      setEstado("guardando");
      setError(null);
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (slug.current) headers["x-tenant-id"] = slug.current;
        const res = await fetch("/api/settings", { method: "PUT", headers: csrfHeaders(headers), body: JSON.stringify({ mode: m }) });
        if (!res.ok) throw new Error(`error ${res.status}`);
        setEstado("guardado");
      } catch (err) {
        setModo(antes);
        setEstado("error");
        setError(`No se guardó (${err instanceof Error ? err.message : "sin conexión"}). Prueba de nuevo.`);
      }
    },
    [modo, estado],
  );

  const reintentar = useCallback(() => {
    setEstado("cargando");
    setVuelta((n) => n + 1);
  }, []);

  return { modo, estado, error, cambiar, reintentar };
}
