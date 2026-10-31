"use client";

import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import type { ClienteConUbicacion, ClienteSinUbicacion } from "./shared";

interface ClienteApi {
  phone?: string;
  name?: string;
  location?: string;
  lat?: number | null;
  lng?: number | null;
}

/** Los clientes con GPS (para el mapa) y los que todavía no tienen ubicación (para pedírsela). */
export function useClientesGeo() {
  const [conUbicacion, setConUbicacion] = useState<ClienteConUbicacion[]>([]);
  const [sinUbicacion, setSinUbicacion] = useState<ClienteSinUbicacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [rGeo, rTodos] = await Promise.all([fetch("/api/customers/geo"), fetch("/api/customers?limit=500").catch(() => null)]);
      const geo: unknown = await rGeo.json().catch(() => null);
      if (!Array.isArray(geo)) {
        throw new Error((geo as { error?: string } | null)?.error ?? `geo ${rGeo.status}`);
      }
      setConUbicacion(
        (geo as Array<Partial<ClienteConUbicacion>>).map((c) => ({
          phone: c.phone ?? null,
          name: c.name || "Cliente",
          lat: Number(c.lat),
          lng: Number(c.lng),
          totalSpent: Number(c.totalSpent ?? 0),
          location: c.location ?? "",
        })),
      );
      // La lista de pendientes es secundaria: si falla, el mapa se muestra igual.
      const todos: unknown = rTodos?.ok ? await rTodos.json().catch(() => null) : null;
      setSinUbicacion(
        Array.isArray(todos)
          ? (todos as ClienteApi[])
              .filter((c) => c.lat == null || c.lng == null)
              .map((c) => ({ phone: (c.phone ?? "").trim(), name: c.name || "Cliente", location: c.location ?? "" }))
          : [],
      );
    } catch (err) {
      logger.warn("[Mapa de clientes] no se pudieron cargar las ubicaciones", { error: String(err) });
      setError("No pudimos cargar las ubicaciones. Revisa tu conexión e inténtalo otra vez.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { conUbicacion, sinUbicacion, cargando, error, recargar: cargar };
}
