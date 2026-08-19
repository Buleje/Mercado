"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";

export interface CouponItem {
  id: string;
  code: string;
  description: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minPurchase: number | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface CouponForm {
  code: string;
  description: string;
  discountType: "percent" | "fixed";
  discountValue: string;
  minPurchase: string;
  maxUses: string;
  expiresAt: string;
}

const EMPTY_FORM: CouponForm = {
  code: "",
  description: "",
  discountType: "percent",
  discountValue: "",
  minPurchase: "",
  maxUses: "",
  expiresAt: "",
};

export function useMarketplaceCoupons() {
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CouponForm>(EMPTY_FORM);

  const fetchCoupons = useCallback(() => {
    setLoading(true);
    fetch("/api/marketplace/coupons")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.data) setCoupons(d.data); })
      .catch((err) => { /* fire-and-forget */ void err; })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/marketplace/coupons", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          code: form.code,
          description: form.description,
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          minPurchase: form.minPurchase ? Number(form.minPurchase) : null,
          maxUses: form.maxUses ? Number(form.maxUses) : null,
          expiresAt: form.expiresAt || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(typeof body?.error === "string" ? body.error : `No se pudo crear el cupón (error ${res.status})`);
        return;
      }
      toast.success("Cupón creado");
      setShowForm(false);
      setForm(EMPTY_FORM);
      fetchCoupons();
    } catch (err) {
      console.warn("[use-marketplace-coupons] crear cupón falló", err);
      toast.error("No se pudo crear el cupón — revisá tu conexión.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    try {
      const res = await fetch(`/api/marketplace/coupons/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ active: !active }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(typeof body?.error === "string" ? body.error : `No se pudo cambiar el estado del cupón (error ${res.status})`);
        return;
      }
      fetchCoupons();
    } catch (err) {
      console.warn("[use-marketplace-coupons] cambiar estado falló", err);
      toast.error("No se pudo cambiar el estado del cupón — revisá tu conexión.");
    }
  };

  const deleteCoupon = async (id: string) => {
    if (!confirm("¿Eliminar este cupón?")) return;
    try {
      const res = await fetch(`/api/marketplace/coupons/${id}`, {
        method: "DELETE",
        headers: csrfHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(typeof body?.error === "string" ? body.error : `No se pudo eliminar el cupón (error ${res.status})`);
        return;
      }
      toast.success("Cupón eliminado");
      fetchCoupons();
    } catch (err) {
      console.warn("[use-marketplace-coupons] eliminar cupón falló", err);
      toast.error("No se pudo eliminar el cupón — revisá tu conexión.");
    }
  };

  return {
    coupons, loading, showForm, setShowForm,
    saving, form, setForm,
    fetchCoupons, handleCreate, toggleActive, deleteCoupon,
  };
}
