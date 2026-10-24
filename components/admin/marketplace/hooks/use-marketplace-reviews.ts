"use client";

import { useState, useEffect, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

export interface ReviewItem {
  id: string;
  name: string;
  text: string;
  rating: number;
  status: string;
  date: string;
  phone?: string | null;
  storeId?: string | null;
  adminReply?: string | null;
  adminReplyDate?: string | null;
}

function errorAlGuardar(status: number): string {
  return status === 403
    ? "Tu rol no puede moderar reseñas: pídeselo al dueño o al encargado."
    : "No se pudo guardar el cambio. Intenta de nuevo.";
}

export function useMarketplaceReviews() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  /* Antes un 403 o una caída se tragaban: «Aprobar» no hacía nada y la lista
     salía vacía como si no hubiera reseñas (revisión 19-10). */
  const [error, setError] = useState<string | null>(null);

  const loadReviews = useCallback(() => {
    setLoading(true);
    fetch("/api/reviews?all=1")
      .then((r) => {
        if (!r.ok) {
          setError(r.status === 403 ? "Tu rol no puede ver las reseñas para moderarlas." : "No se pudieron cargar las reseñas. Intenta de nuevo.");
          return [];
        }
        setError(null);
        return r.json();
      })
      .then((data: ReviewItem[]) => {
        /* Todas las reseñas de TU negocio (el servidor ya filtra por el tenant
           del JWT), menos los comentarios de producto, que reusan la tabla con
           `status = "comment"` y no se moderan acá. Antes filtraba por
           `storeId`, que `?all=1` nunca devuelve (mapReview no lo trae): la
           lista salía SIEMPRE vacía y las reseñas que deja el cliente en tu
           tienda (POST /api/reviews, «pending») no se aprobaban en ningún lado
           — la tienda sólo muestra las aprobadas (11-10). */
        setReviews(Array.isArray(data) ? data.filter((r) => r.status !== "comment") : []);
      })
      .catch(() => setError("No se pudieron cargar las reseñas: revisa tu conexión."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const handleStatusChange = async (id: string, status: string) => {
    setSaving(id);
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
        setError(null);
      } else {
        setError(errorAlGuardar(res.status));
      }
    } catch {
      setError("No se pudo guardar: revisa tu conexión.");
    }
    setSaving(null);
  };

  const handleReply = async (id: string) => {
    if (!replyText.trim()) return;
    setSaving(id);
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ adminReply: replyText.trim() }),
      });
      if (res.ok) {
        setReviews((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, adminReply: replyText.trim(), adminReplyDate: new Date().toISOString() } : r
          )
        );

        setReplyingTo(null);
        setReplyText("");
        setError(null);
      } else {
        setError(errorAlGuardar(res.status));
      }
    } catch {
      setError("No se pudo guardar: revisa tu conexión.");
    }
    setSaving(null);
  };

  const filtered = filter === "all" ? reviews : reviews.filter((r) => r.status === filter);
  const pendingCount = reviews.filter((r) => r.status === "pending").length;

  return {
    reviews, filtered, loading, filter, setFilter,
    replyingTo, setReplyingTo, replyText, setReplyText,
    saving, pendingCount, loadReviews, error,
    handleStatusChange, handleReply,
  };
}
