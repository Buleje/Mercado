"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { tenantFetch } from "@/lib/tenant-fetch";
import { logger } from "@/lib/logger";

/**
 * Enlace de seguimiento para el cliente (17-10, P45). Pide a
 * `POST /api/orders/[id]/tracking/share` un token de 24 h que sólo abre ESE
 * pedido (estado y franja; sin la ruta del repartidor ni otras entregas) y lo
 * copia o lo abre. No manda nada solo: el negocio decide por dónde lo comparte.
 */
export function useEnlaceSeguimiento() {
  const [generando, setGenerando] = useState<string | null>(null);

  const pedir = useCallback(async (orderId: string): Promise<string | null> => {
    setGenerando(orderId);
    try {
      const res = await tenantFetch(`/api/orders/${encodeURIComponent(orderId)}/tracking/share`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        toast.error(res.status === 404 ? "No encontramos ese pedido." : "No se pudo crear el enlace. Intenta de nuevo.");
        return null;
      }
      return json.url;
    } catch (err) {
      logger.warn("[reparto] enlace de seguimiento falló", { error: String(err) });
      toast.error("Sin conexión: no se pudo crear el enlace.");
      return null;
    } finally {
      setGenerando(null);
    }
  }, []);

  const copiar = useCallback(
    async (orderId: string) => {
      const url = await pedir(orderId);
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Enlace copiado: vale 24 horas y sólo muestra este pedido.");
      } catch {
        toast.message("Copia el enlace a mano", { description: url });
      }
    },
    [pedir],
  );

  const abrir = useCallback(
    async (orderId: string) => {
      const url = await pedir(orderId);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    },
    [pedir],
  );

  return { generando, copiar, abrir };
}
