"use client";

import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import type { Destinatario } from "./shared";

/** GET /api/customers?compras=1: lo mismo que lee «Mis clientes» (`use-crm-clientes`). */
interface ClienteApi {
  phone?: string;
  name?: string;
  creditBalance?: number;
  loyaltyTier?: string | null;
  birthday?: string | null;
  compras?: number;
  gastado?: number;
  ultimaCompra?: string | null;
}

/**
 * Clientes con lo que hace falta para armar cada grupo de «Para quién». Las
 * compras las cuenta el servidor (`?compras=1` → `CustomersDB.comprasPorCliente`:
 * pedidos + ventas del mostrador, sin el tope de 500 de cada lista), igual que
 * «Mis clientes», para que un grupo diga lo mismo en las dos pantallas. Antes
 * se pedían /api/orders y /api/sales y se contaban acá.
 */
export function useDestinatarios(activo = true) {
  const [clientes, setClientes] = useState<Destinatario[]>([]);
  const [cargando, setCargando] = useState(activo);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      const res = await fetch("/api/customers?limit=500&compras=1");
      if (!res.ok) throw new Error(`clientes ${res.status}`);
      const datos: unknown = await res.json();
      if (!Array.isArray(datos)) throw new Error("respuesta inesperada");
      setClientes(
        (datos as ClienteApi[]).map((c) => ({
          phone: (c.phone ?? "").trim(),
          name: c.name || "Cliente",
          totalSpent: Number(c.gastado ?? 0),
          debt: Number(c.creditBalance ?? 0),
          lastOrderDate: c.ultimaCompra ?? null,
          orderCount: Number(c.compras ?? 0),
          tier: c.loyaltyTier ?? null,
          birthday: c.birthday ?? null,
        })),
      );
    } catch (err) {
      logger.warn("[MandarMensaje] no se pudieron cargar los clientes", { error: String(err) });
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (activo) void cargar();
  }, [activo, cargar]);

  return { clientes, cargando, error, recargar: cargar };
}
