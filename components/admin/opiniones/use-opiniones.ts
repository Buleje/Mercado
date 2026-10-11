"use client";

import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { canalDe, puntajeDe, type Opinion } from "./shared";

interface FilaApi {
  id: string;
  name?: string;
  location?: string;
  text?: string;
  rating: number;
  date: string;
  status?: string;
  adminReply?: string | null;
}

/**
 * Las reseñas de la tienda (las mismas que se moderan en Marketplace › Reseñas).
 * Las rechazadas y ocultas no cuentan: la tienda no las muestra y ensuciaban el índice.
 */
export function useOpiniones() {
  const [opiniones, setOpiniones] = useState<Opinion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      const r = await fetch("/api/reviews?all=1");
      if (!r.ok) throw new Error(`reseñas ${r.status}`);
      const filas: unknown = await r.json();
      if (!Array.isArray(filas)) throw new Error("respuesta inesperada");
      setOpiniones(
        (filas as FilaApi[])
          .filter((f) => f.status !== "rejected" && f.status !== "hidden")
          .map((f) => ({
            id: f.id,
            cliente: f.name || "Cliente anónimo",
            estrellas: f.rating,
            puntaje: puntajeDe(f.rating),
            comentario: f.text ?? "",
            fecha: f.date,
            canal: canalDe(f.location),
            pendiente: f.status === "pending",
            respuesta: f.adminReply ?? null,
          }))
          .sort((a, b) => b.fecha.localeCompare(a.fecha)),
      );
    } catch (err) {
      logger.warn("[Opiniones] no se pudieron cargar las reseñas", { error: String(err) });
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { opiniones, cargando, error, recargar: cargar };
}
