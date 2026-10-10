import { useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DbPromotion, DbCustomer } from "@/lib/jsondb";
import { emptyForm } from "@/components/admin/promociones/promociones-compartido";
import { usePromocionesEstado } from "@/components/admin/promociones/hooks/use-promociones-estado";
import { usePromocionesVentanas } from "@/components/admin/promociones/hooks/use-promociones-ventanas";

/** Carga de promos y clientes; crear, editar, activar y borrar una promo. Parte de `usePromociones`. */
export function usePromocionesCarga(previo: ReturnType<typeof usePromocionesEstado> & ReturnType<typeof usePromocionesVentanas>) {
  const {
    setPromos, setCustomers, setLoading, setShowForm, editingId, setEditingId, form, setForm,
    setSaving, selectedPhones, setSelectedPhones, confirmDeleteId, setConfirmDeleteId, campaigns,
  } = previo;
  // Save campaigns to localStorage whenever they change
  useEffect(() => {
    if (campaigns.length >= 0) {
      localStorage.setItem("scheduled-campaigns", JSON.stringify(campaigns));
    }
  }, [campaigns]);

  // Una carga que salió antes que otra trae la lista vieja: con el doble montaje
  // salen dos GET y, si el primero vuelve después del que sigue a Eliminar, la
  // promo borrada reaparece y el «Cargando…» se apaga antes de tiempo (el mismo
  // bug medido en Tareas el 2026-09-14). Sólo aplica lo suyo la carga más nueva;
  // cada cambio de promo ya termina en load(), por eso no hace falta contar cambios.
  const cargasRef = useRef({ ultima: 0 });
  const load = useCallback(async () => {
    const esta = ++cargasRef.current.ultima;
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        fetch("/api/promotions"),
        fetch("/api/customers"),
      ]);
      if (pRes.ok) {
        const lista = (await pRes.json()) as DbPromotion[];
        if (esta === cargasRef.current.ultima) setPromos(lista);
      }
      if (cRes.ok) {
        const lista = (await cRes.json()) as DbCustomer[];
        if (esta === cargasRef.current.ultima) setCustomers(lista);
      }
    } catch {}
    if (esta === cargasRef.current.ultima) setLoading(false);
  }, [setCustomers, setLoading, setPromos]);

   
  useEffect(() => { load(); }, [load]);

  // ── Create / Edit ──────────────────────────────────────────────────────────
  const openCreate = () => { setForm(emptyForm); setEditingId(null); setSelectedPhones(new Set()); setShowForm(true); };

  const openEdit = (p: DbPromotion) => {
    setForm({
      name: p.name, description: p.description, discountPercent: p.discountPercent,
      minPurchase: p.minPurchase ? String(p.minPurchase) : "",
      imageUrl: p.imageUrl || "", message: p.message || "",
      targetType: p.targetType || "all",
      expiresAt: p.expiresAt ? p.expiresAt.slice(0, 10) : "",
    });
    setSelectedPhones(new Set(p.targetPhones ? p.targetPhones.split(",").filter(Boolean) : []));
    setEditingId(p.id);
    setShowForm(true);
  };

  const savePromo = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      discountPercent: Number(form.discountPercent) || 0,
      minPurchase: form.minPurchase ? Number(form.minPurchase) : undefined,
      imageUrl: form.imageUrl.trim() || undefined,
      message: form.message.trim() || undefined,
      targetType: form.targetType,
      targetPhones: selectedPhones.size > 0 ? Array.from(selectedPhones).join(",") : undefined,
      active: true,
      expiresAt: form.expiresAt || undefined,
    };
    try {
      // El formulario se cerraba pasara lo que pasara: si el servidor
      // rechazaba la promo (fechas inválidas, plan vencido, 503), la pantalla
      // volvía a la lista sin ella y el dueño la cargaba de nuevo desde cero,
      // sin saber por qué no había quedado.
      const res = editingId
        ? await fetch(`/api/promotions/${editingId}`, {
            method: "PATCH",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(payload),
          })
        : await fetch("/api/promotions", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(
          typeof body?.error === "string"
            ? body.error
            : `No se pudo guardar la promoción (error ${res.status})`,
        );
        return;
      }
      setShowForm(false);
      load();
    } catch (err) {
      console.warn("[PromotionsTab] guardar promoción falló", err);
      toast.error("Sin conexión — la promoción no se guardó.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: DbPromotion) => {
    // Prender o apagar una promo cambia lo que la tienda cobra: si el switch
    // vuelve solo a su lugar, hay que decir por qué.
    try {
      const res = await fetch(`/api/promotions/${p.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ active: !p.active }),
      });
      if (!res.ok) {
        toast.error(`No se pudo ${p.active ? "pausar" : "activar"} la promoción (error ${res.status})`);
      }
    } catch (err) {
      console.warn("[PromotionsTab] toggle promoción falló", err);
      toast.error("Sin conexión — la promoción no cambió.");
    }
    load();
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      const res = await fetch(`/api/promotions/${confirmDeleteId}`, {
        method: "DELETE",
        headers: csrfHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(
          typeof body?.error === "string"
            ? body.error
            : `No se pudo eliminar la promoción (error ${res.status})`,
        );
        return;
      }
      setConfirmDeleteId(null);
      load();
    } catch (err) {
      console.warn("[PromotionsTab] eliminar promoción falló", err);
      toast.error("Sin conexión — la promoción NO se eliminó.");
    }
  };
  return {
    cargasRef, load, openCreate, openEdit, savePromo, toggleActive, confirmDelete,
  };
}
