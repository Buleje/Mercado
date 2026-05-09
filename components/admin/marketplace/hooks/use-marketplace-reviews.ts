"use client";

import { useState, useEffect, useCallback } from "react";

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

export function useMarketplaceReviews() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const loadReviews = useCallback(() => {
    setLoading(true);
    fetch("/api/reviews?all=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ReviewItem[]) => {
        const storeReviews = data.filter((r) => r.storeId);
        setReviews(storeReviews);
      })
      .catch((err) => { /* fire-and-forget */ void err; })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const handleStatusChange = async (id: string, status: string) => {
    setSaving(id);
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      }
    } catch { /* silencioso */ }
    setSaving(null);
  };

  const handleReply = async (id: string) => {
    if (!replyText.trim()) return;
    setSaving(id);
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
      }
    } catch { /* silencioso */ }
    setSaving(null);
  };

  const filtered = filter === "all" ? reviews : reviews.filter((r) => r.status === filter);
  const pendingCount = reviews.filter((r) => r.status === "pending").length;

  return {
    reviews, filtered, loading, filter, setFilter,
    replyingTo, setReplyingTo, replyText, setReplyText,
    saving, pendingCount, loadReviews,
    handleStatusChange, handleReply,
  };
}
