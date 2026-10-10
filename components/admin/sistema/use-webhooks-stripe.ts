"use client";

/**
 * La cola de webhooks de Stripe que fallaron y esperan reintento.
 *
 * Salió de `app/admin/webhook-queue/page.tsx` (plan «panel unificado», ola 2):
 * la usan la página suelta y el bloque de Configuración › Sistema › Colas. No
 * cambia ningún endpoint. «Descartar» es sólo de la plataforma en el servidor
 * (pentest billing #4): un 403 se ve como error, igual que antes.
 */
import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

export interface QueueItem {
  id: string;
  stripeId: string;
  eventType: string;
  attempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface WebhooksStripe {
  items: QueueItem[];
  loading: boolean;
  replayLoading: boolean;
  deletingId: string | null;
  error: string | null;
  replayResult: { replayed: number; failed: number } | null;
  load: () => Promise<void>;
  triggerReplay: () => Promise<void>;
  dismissItem: (id: string) => Promise<void>;
  pending: QueueItem[];
  abandoned: QueueItem[];
  processed: QueueItem[];
}

export function useWebhooksStripe(): WebhooksStripe {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [replayLoading, setReplayLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replayResult, setReplayResult] = useState<{ replayed: number; failed: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/webhook-queue");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const triggerReplay = useCallback(async () => {
    setReplayLoading(true);
    setReplayResult(null);
    try {
      // SECURITY 2026-05-07 (audit P0-1): usar proxy server-side /api/admin/webhook-replay
      // que valida la sesión admin (cookie httpOnly) y llama al endpoint con CRON_SECRET
      // server-side. Antes el cliente leía NEXT_PUBLIC_CRON_SECRET que terminaba en el
      // bundle público — cualquier usuario podía disparar los crons.
      const res = await fetch("/api/admin/webhook-replay", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReplayResult({ replayed: data.replayed ?? 0, failed: data.failed ?? 0 });
      await load();
    } catch {
      setError("Error al ejecutar replay.");
    } finally {
      setReplayLoading(false);
    }
  }, [load]);

  const dismissItem = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      // El replay de arriba manda CSRF y este DELETE no: devolvía 403 y la
      // fila desaparecía de la pantalla igual, así que el evento seguía en la
      // cola y volvía a aparecer al recargar.
      const res = await fetch(`/api/billing/webhook-queue?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: csrfHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError("Error al eliminar el evento");
    } finally {
      setDeletingId(null);
    }
  }, []);

  const pending = items.filter((i) => !i.processedAt && i.attempts < 6);
  const abandoned = items.filter((i) => !i.processedAt && i.attempts >= 6);
  const processed = items.filter((i) => !!i.processedAt);

  return {
    items, loading, replayLoading, deletingId, error, replayResult,
    load, triggerReplay, dismissItem, pending, abandoned, processed,
  };
}
