"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { csrfHeaders } from "@/lib/csrf-client";
import type { PlatformConversation, PlatformConvStatus } from "./types";

interface Opciones {
  /** La lista ya cargó una vez (el enlace se atiende tras la primera carga). */
  listaCargada: boolean;
  statusTab: PlatformConvStatus | "all";
  setStatusTab: (t: PlatformConvStatus | "all") => void;
  setConversations: (fn: (prev: PlatformConversation[]) => PlatformConversation[]) => void;
  openConversation: (id: string) => Promise<void>;
  setText: (t: string) => void;
  setError: (e: string | null) => void;
}

/**
 * Enlaces al chat desde el resto del superadmin:
 *  · `?c=<conversación>` abre esa conversación.
 *  · `?tenant=<id o slug>&name=` abre la conversación DE SIEMPRE del negocio
 *    (el servidor resuelve slug → id y la reusa; sólo crea si no hay ninguna).
 *  · `?msg=` deja el borrador escrito en la caja, listo para enviar.
 * Después deja la URL en `?c=<id>`: recargar no vuelve a escribir el borrador.
 * SUPMKT-1 (2026-10-09): antes `msg` se perdía y el slug creaba una
 * conversación que el negocio nunca veía.
 */
export function useAbrirChatPorUrl({
  listaCargada,
  statusTab,
  setStatusTab,
  setConversations,
  openConversation,
  setText,
  setError,
}: Opciones): void {
  const searchParams = useSearchParams();
  const atendidoRef = useRef(false);

  useEffect(() => {
    if (atendidoRef.current || !listaCargada) return;
    const c = searchParams.get("c");
    const tenant = searchParams.get("tenant");
    const name = searchParams.get("name");
    const msg = searchParams.get("msg");
    if (!c && !tenant) return;
    atendidoRef.current = true;

    const abrir = async (conv: Pick<PlatformConversation, "id"> & Partial<PlatformConversation>) => {
      if (conv.status) {
        // La conversación tiene que estar en la lista para que se dibuje.
        const completa = conv as PlatformConversation;
        setConversations((prev) => (prev.some((x) => x.id === conv.id) ? prev : [completa, ...prev]));
        if (statusTab !== "all" && conv.status !== statusTab) setStatusTab("all");
      }
      await openConversation(conv.id);
      if (msg) setText(msg);
      window.history.replaceState(window.history.state, "", `/superadmin/chat?c=${encodeURIComponent(conv.id)}`);
    };

    if (c) {
      void abrir({ id: c });
      return;
    }
    fetch("/api/superadmin/chat/conversations", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ tenantId: tenant, tenantName: name ?? undefined, reusar: true }),
    })
      .then(async (r) => {
        const d = (await r.json().catch(() => null)) as { conversation?: PlatformConversation; error?: string } | null;
        if (!r.ok || !d?.conversation) throw new Error(d?.error ?? `HTTP ${r.status}`);
        await abrir(d.conversation);
      })
      .catch((err: unknown) => {
        console.error("[sa-chat] abrir chat por enlace falló", err);
        setError(err instanceof Error && err.message.startsWith("No encontramos") ? err.message : "No se pudo abrir el chat");
      });
  }, [searchParams, listaCargada, statusTab, setStatusTab, setConversations, openConversation, setText, setError]);
}
