"use client";

import { useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import { toast } from "sonner";
import { tenantFetch } from "@/lib/tenant-fetch";
import type { DbOrder, OrderStatus } from "@/lib/jsondb";

interface UseOrderActionsProps {
  setOrders: React.Dispatch<React.SetStateAction<DbOrder[]>>;
  setDetailOrder: React.Dispatch<React.SetStateAction<DbOrder | null>>;
  load: () => Promise<void>;
}

export function useOrderActions({ setOrders, setDetailOrder, load }: UseOrderActionsProps) {
  const [adminNote, setAdminNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const updateStatus = async (id: string, status: OrderStatus) => {
    const res = await tenantFetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Error al actualizar" }));
      toast.error(err.error ?? "No se pudo cambiar el estado");
      return;
    }
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    const data = await leerJson<{ whatsappLink?: string; whatsappSent?: boolean }>(res);
    if (data?.whatsappLink && !data.whatsappSent) {
      window.open(data.whatsappLink, "_blank", "noopener,noreferrer");
    }
  };

  const patchOrder = async (id: string, patch: Partial<DbOrder>) => {
    // Snapshot previo para poder revertir si el server falla
    let prevOrders: DbOrder[] = [];
    let prevDetail: DbOrder | null = null;
    setOrders(prev => {
      prevOrders = prev;
      return prev.map(o => o.id === id ? { ...o, ...patch } : o);
    });
    setDetailOrder(prev => {
      prevDetail = prev;
      return prev?.id === id ? { ...prev, ...patch } : prev;
    });

    const res = await tenantFetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      // Revertir optimistic update
      setOrders(prevOrders);
      setDetailOrder(prevDetail);
      const err = await res.json().catch(() => ({ error: "Error al actualizar pedido" }));
      toast.error(err.error ?? "Error al actualizar pedido");
      return;
    }
    // Entregado desde el tablero: el servidor devuelve el enlace para avisar al cliente.
    if (patch.status) {
      const data = await leerJson<{ whatsappLink?: string; whatsappSent?: boolean }>(res);
      if (data?.whatsappLink && !data.whatsappSent) {
        window.open(data.whatsappLink, "_blank", "noopener,noreferrer");
      }
    }
  };

  const verifyYape = (id: string) => patchOrder(id, { status: "confirmado" });

  const rejectYape = async (id: string) => {
    if (!confirm("¿Rechazar este pedido? El Yape es inválido y se eliminará el pedido.")) return;
    await tenantFetch(`/api/orders/${id}`, { method: "DELETE" });
    setOrders(prev => prev.filter(o => o.id !== id));
    setDetailOrder(prev => prev?.id === id ? null : prev);
  };

  const markDeudaPaid = (id: string) => patchOrder(id, { deuda: false });

  /**
   * Nota interna nueva: el servidor la guarda con quién la escribió y la hora
   * (`adminNote` → historial del pedido). Antes se mandaba `adminNotes` con
   * todo el texto junto y el servidor lo descartaba: ninguna nota se guardaba.
   * Devuelve si se guardó, para que el detalle relea su historial.
   */
  const saveAdminNote = async (orderId: string): Promise<boolean> => {
    const texto = adminNote.trim();
    if (!texto) return false;
    setSavingNote(true);
    try {
      const res = await tenantFetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNote: texto }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "No se pudo guardar la nota" }));
        toast.error(err.error ?? "No se pudo guardar la nota");
        return false;
      }
      setAdminNote("");
      return true;
    } catch {
      toast.error("No se pudo guardar la nota: revisa tu conexión");
      return false;
    } finally {
      setSavingNote(false);
    }
  };

  /** Cancelar con motivo: va a `cancelReason` (lo guarda el servidor junto a `cancelledAt` y en el historial). */
  const executeReject = async () => {
    if (!showRejectModal) return;
    const reason = rejectReason.trim() || "Pedido cancelado";
    await patchOrder(showRejectModal, { status: "cancelado", cancelReason: reason } as Partial<DbOrder>);
    setShowRejectModal(null);
    setRejectReason("");
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    await tenantFetch(`/api/orders/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    void load();
  };

  return {
    adminNote,
    setAdminNote,
    savingNote,
    showRejectModal,
    setShowRejectModal,
    rejectReason,
    setRejectReason,
    confirmDeleteId,
    setConfirmDeleteId,
    updateStatus,
    patchOrder,
    verifyYape,
    rejectYape,
    markDeudaPaid,
    saveAdminNote,
    executeReject,
    confirmDelete,
  };
}
