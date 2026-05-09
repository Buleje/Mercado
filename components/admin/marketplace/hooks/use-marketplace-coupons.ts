"use client";

import { useState, useEffect, useCallback } from "react";

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
        headers: { "Content-Type": "application/json" },
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
      if (res.ok) {
        setShowForm(false);
        setForm(EMPTY_FORM);
        fetchCoupons();
      }
    } catch {}
    setSaving(false);
  };

  const toggleActive = async (id: string, active: boolean) => {
    await fetch(`/api/marketplace/coupons/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    fetchCoupons();
  };

  const deleteCoupon = async (id: string) => {
    if (!confirm("¿Eliminar este cupón?")) return;
    await fetch(`/api/marketplace/coupons/${id}`, { method: "DELETE" });
    fetchCoupons();
  };

  return {
    coupons, loading, showForm, setShowForm,
    saving, form, setForm,
    fetchCoupons, handleCreate, toggleActive, deleteCoupon,
  };
}
