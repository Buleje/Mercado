"use client";

import { useState } from "react";
import { tenantFetch } from "@/lib/tenant-fetch";
import type { DbOrder, OrderStatus } from "@/lib/jsondb";

interface UseOrderActionsProps {
  orders: DbOrder[];
  setOrders: React.Dispatch<React.SetStateAction<DbOrder[]>>;
  setDetailOrder: React.Dispatch<React.SetStateAction<DbOrder | null>>;
  load: () => Promise<void>;
}

export function useOrderActions({ orders, setOrders, setDetailOrder, load }: UseOrderActionsProps) {
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
      alert(err.error ?? "No se pudo cambiar el estado");
      return;
    }
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    const data = await res.json().catch(() => null);
    if (data?.whatsappLink && !data.whatsappSent) {
      window.open(data.whatsappLink, "_blank", "noopener,noreferrer");
    }
  };

  const patchOrder = async (id: string, patch: Partial<DbOrder>) => {
    await tenantFetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o));
    setDetailOrder(prev => prev?.id === id ? { ...prev, ...patch } : prev);
  };

  const verifyYape = (id: string) => patchOrder(id, { status: "confirmado" });

  const rejectYape = async (id: string) => {
    if (!confirm("¿Rechazar este pedido? El Yape es inválido y se eliminará el pedido.")) return;
    await tenantFetch(`/api/orders/${id}`, { method: "DELETE" });
    setOrders(prev => prev.filter(o => o.id !== id));
    setDetailOrder(prev => prev?.id === id ? null : prev);
  };

  const markDeudaPaid = (id: string) => patchOrder(id, { deuda: false });

  const saveAdminNote = async (orderId: string) => {
    if (!adminNote.trim()) return;
    setSavingNote(true);
    const o = orders.find(x => x.id === orderId);
    const existingNotes = (o as (typeof o) & { adminNotes?: string })?.adminNotes ?? "";
    const ts = new Date().toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    const updated = existingNotes
      ? `${existingNotes}\n[${ts}] ${adminNote.trim()}`
      : `[${ts}] ${adminNote.trim()}`;
    await patchOrder(orderId, { adminNotes: updated } as Partial<DbOrder>);
    setAdminNote("");
    setSavingNote(false);
  };

  const executeReject = async () => {
    if (!showRejectModal) return;
    const reason = rejectReason.trim() || "Pedido cancelado";
    await patchOrder(showRejectModal, { status: "cancelado", adminNotes: reason } as Partial<DbOrder>);
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
