"use client";

import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import type { Destinatario } from "./shared";

interface ClienteApi {
  phone?: string;
  name?: string;
  totalSpent?: number;
  creditBalance?: number;
}

async function leerLista(r: Response | null): Promise<unknown[]> {
  if (!r?.ok) return [];
  const j: unknown = await r.json().catch(() => null);
  if (Array.isArray(j)) return j;
  const cont = j as { orders?: unknown[]; sales?: unknown[]; items?: unknown[] } | null;
  return cont?.orders ?? cont?.sales ?? cont?.items ?? [];
}

/**
 * Clientes con lo que hace falta para segmentar. La API de clientes no trae la última
 * compra ni `debt`: se arma igual que «Mis clientes» (pedidos + ventas de mostrador y
 * `creditBalance`), para que un segmento diga lo mismo en las dos pantallas.
 */
export function useDestinatarios() {
  const [clientes, setClientes] = useState<Destinatario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      const [res, resPedidos, resVentas] = await Promise.all([
        fetch("/api/customers?limit=500"),
        fetch("/api/orders?limit=500").catch(() => null),
        fetch("/api/sales?limit=500").catch(() => null),
      ]);
      if (!res.ok) throw new Error(`clientes ${res.status}`);
      const datos: unknown = await res.json();
      if (!Array.isArray(datos)) throw new Error("respuesta inesperada");

      const compras = new Map<string, { n: number; ultima: string }>();
      const anotar = (tel: unknown, fecha: unknown) => {
        const t = typeof tel === "string" ? tel.trim() : "";
        const f = typeof fecha === "string" ? fecha : "";
        if (!t || !f) return;
        const previo = compras.get(t);
        compras.set(t, { n: (previo?.n ?? 0) + 1, ultima: !previo || f > previo.ultima ? f : previo.ultima });
      };
      for (const o of await leerLista(resPedidos)) {
        const p = o as { customer?: { phone?: string }; customerPhone?: string; createdAt?: string };
        anotar(p.customer?.phone ?? p.customerPhone, p.createdAt);
      }
      for (const v of await leerLista(resVentas)) {
        const p = v as { customerPhone?: string; createdAt?: string; date?: string };
        anotar(p.customerPhone, p.createdAt ?? p.date);
      }

      setClientes(
        (datos as ClienteApi[]).map((c) => {
          const phone = (c.phone ?? "").trim();
          const compra = compras.get(phone);
          return {
            phone,
            name: c.name || "Cliente",
            totalSpent: Number(c.totalSpent ?? 0),
            debt: Number(c.creditBalance ?? 0),
            lastOrderDate: compra?.ultima ?? null,
            orderCount: compra?.n ?? 0,
          };
        }),
      );
    } catch (err) {
      logger.warn("[MassMessageSender] no se pudieron cargar los clientes", { error: String(err) });
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { clientes, cargando, error, recargar: cargar };
}
