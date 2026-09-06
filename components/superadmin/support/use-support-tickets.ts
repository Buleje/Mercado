"use client";

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { SupportTicket, TicketStatus, TicketPriority, ReplyTemplate } from "./shared";

const API = "/api/superadmin/support";

export interface UseSupportTickets {
  tickets: SupportTicket[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  reply: (id: string, body: string) => Promise<void>;
  setStatus: (id: string, status: TicketStatus) => void;
  setPriority: (id: string, priority: TicketPriority) => void;
  templates: ReplyTemplate[];
  loadTemplates: () => Promise<void>;
  saveTemplate: (name: string, body: string) => Promise<void>;
}

export function useSupportTickets(): UseSupportTickets {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ReplyTemplate[]>([]);

  // ── Carga inicial ──────────────────────────────────────────────────────────

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API, { headers: csrfHeaders({}) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      setTickets(Array.isArray(data) ? (data as SupportTicket[]) : []);
      setError(null);
    } catch (err) {
      console.error("[sa-support] load failed", err);
      setError("No se pudieron cargar los tickets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // ── Responder ──────────────────────────────────────────────────────────────

  const reply = useCallback(
    async (id: string, body: string) => {
      const newMsg = {
        id: Date.now().toString(36),
        from: "support" as const,
        body,
        createdAt: new Date().toISOString(),
      };

      // Actualización optimista
      setTickets((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                messages: [...t.messages, newMsg],
                lastMessage: body,
                status: "in_progress" as TicketStatus,
              }
            : t,
        ),
      );

      try {
        const res = await fetch(`${API}/${id}/reply`, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ body }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        console.error("[sa-support] reply failed", err);
        await reload(); // revertir al estado real
      }
    },
    [reload],
  );

  // ── Cambiar estado ─────────────────────────────────────────────────────────

  const setStatus = useCallback(
    (id: string, status: TicketStatus) => {
      setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
      fetch(`${API}/${id}/status`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      }).catch((err) => {
        console.error("[sa-support] status change failed", err);
        reload();
      });
    },
    [reload],
  );

  // ── Cambiar prioridad ──────────────────────────────────────────────────────

  const setPriority = useCallback(
    (id: string, priority: TicketPriority) => {
      setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, priority } : t)));
      fetch(`${API}/${id}/priority`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ priority }),
      }).catch((err) => {
        console.error("[sa-support] priority change failed", err);
        reload();
      });
    },
    [reload],
  );

  // ── Plantillas ─────────────────────────────────────────────────────────────

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${API}/templates`, { headers: csrfHeaders({}) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { templates?: ReplyTemplate[] };
      setTemplates(data.templates ?? []);
    } catch (err) {
      console.error("[sa-support] templates load failed", err);
    }
  }, []);

  const saveTemplate = useCallback(
    async (name: string, body: string) => {
      try {
        const res = await fetch(`${API}/templates`, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ name, body }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await loadTemplates();
      } catch (err) {
        console.error("[sa-support] save template failed", err);
      }
    },
    [loadTemplates],
  );

  return {
    tickets,
    loading,
    error,
    reload,
    reply,
    setStatus,
    setPriority,
    templates,
    loadTemplates,
    saveTemplate,
  };
}
