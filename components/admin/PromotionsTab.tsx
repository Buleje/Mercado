﻿"use client";

import { useState, useEffect, useCallback } from "react";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  Plus, Trash2, X, Check, Search, Loader2, AlertTriangle,
  MessageCircle, ExternalLink, Send,
  Percent, Users, User, Phone,
} from "lucide-react";
import type { DbPromotion, DbCustomer } from "@/lib/jsondb";
import { cn } from "@/lib/utils";

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function mdToHtml(md: string): string {
  return md.split("\n").map(line => {
    const safe = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rich = safe
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900 dark:text-foreground">$1</strong>')
      .replace(/\*(.+?)\*/g, "<em>$1</em>");
    if (line.startsWith("### ")) return `<h3 class="text-sm font-bold text-gray-800 dark:text-foreground mt-3 mb-0.5">${rich.slice(4)}</h3>`;
    if (line.startsWith("## ")) return `<h2 class="text-base font-bold text-gray-900 dark:text-foreground mt-4 mb-1 pb-1 border-b border-gray-100 dark:border-card-border">${rich.slice(3)}</h2>`;
    if (line.startsWith("# ")) return `<h1 class="text-lg font-extrabold text-gray-900 dark:text-foreground mt-4 mb-2">${rich.slice(2)}</h1>`;
    if (/^[-*] /.test(line)) return `<li class="ml-5 list-disc text-gray-700 dark:text-foreground leading-relaxed text-sm">${rich.slice(2)}</li>`;
    if (/^\d+\. /.test(line)) return `<li class="ml-5 list-decimal text-gray-700 dark:text-foreground leading-relaxed text-sm">${rich.replace(/^\d+\.\s/, "")}</li>`;
    if (line === "") return '<div class="h-2"></div>';
    return `<p class="text-gray-700 dark:text-foreground leading-relaxed text-sm">${rich}</p>`;
  }).join("");
}

type PromoForm = {
  name: string;
  description: string;
  discountPercent: number;
  minPurchase: string;
  imageUrl: string;
  message: string;
  targetType: string;
  expiresAt: string;
};

const emptyForm: PromoForm = {
  name: "", description: "", discountPercent: 0, minPurchase: "",
  imageUrl: "", message: "", targetType: "all", expiresAt: "",
};

export default function PromotionsTab() {
  const [promos, setPromos] = useState<DbPromotion[]>([]);
  const [customers, setCustomers] = useState<DbCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/edit modal
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromoForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Target customer selection
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [customerSearch, setCustomerSearch] = useState("");

  // AI suggestions
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiContext, setAiContext] = useState("");

  // WhatsApp send modal
  const [sendPromo, setSendPromo] = useState<DbPromotion | null>(null);
  const [sendPhones, setSendPhones] = useState<Set<string>>(new Set());
  const [sendSearch, setSendSearch] = useState("");

  // Delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Detail modal
  const [detailPromo, setDetailPromo] = useState<DbPromotion | null>(null);

  useScrollLock(showForm || showAiModal || !!sendPromo || !!confirmDeleteId || !!detailPromo);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        fetch("/api/promotions"),
        fetch("/api/customers"),
      ]);
      if (pRes.ok) setPromos(await pRes.json());
      if (cRes.ok) setCustomers(await cRes.json());
    } catch {}
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
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
      if (editingId) {
        await fetch(`/api/promotions/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/promotions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const toggleActive = async (p: DbPromotion) => {
    await fetch(`/api/promotions/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    load();
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    await fetch(`/api/promotions/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    load();
  };

  // ── AI Suggestions ─────────────────────────────────────────────────────────
  const requestAiSuggestions = async () => {
    setLoadingAi(true);
    setAiSuggestions(null);
    setShowAiModal(true);
    try {
      const r = await fetch("/api/promotions/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: aiContext }),
      });
      const data = await r.json();
      if (data.error) setAiSuggestions(`⚠️ ${data.error}`);
      else setAiSuggestions(data.suggestions);
    } catch { setAiSuggestions("Error al conectar con el servicio de IA."); }
    setLoadingAi(false);
  };

  // ── WhatsApp Send ──────────────────────────────────────────────────────────
  const openSendModal = (p: DbPromotion) => {
    setSendPromo(p);
    // Pre-select target phones if configured
    const preSelected = p.targetPhones ? new Set(p.targetPhones.split(",").filter(Boolean)) : new Set<string>();
    if (p.targetType === "all") {
      setSendPhones(new Set(customers.map(c => c.phone)));
    } else {
      setSendPhones(preSelected);
    }
    setSendSearch("");
  };

  const sendWhatsApp = (phone: string, message: string) => {
    const digits = phone.replace(/\D/g, "");
    const fullPhone = digits.length === 9 ? `51${digits}` : digits;
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${fullPhone}?text=${encoded}`, "_blank");
  };

  const sendToAll = () => {
    if (!sendPromo) return;
    const msg = sendPromo.message || `🎉 *${sendPromo.name}*\n\n${sendPromo.description}\n\n${sendPromo.discountPercent > 0 ? `📢 ${sendPromo.discountPercent}% de descuento` : ""}${sendPromo.minPurchase ? `\nCompra mínima: S/${sendPromo.minPurchase}` : ""}\n\n¡Te esperamos en Bodega San Martín! 🛒`;
    const phones = Array.from(sendPhones);
    if (phones.length === 0) return;
    // Open first one immediately, rest after user interaction
    sendWhatsApp(phones[0], msg);
    if (phones.length > 1) {
      alert(`Se abrió WhatsApp para ${phones[0]}.\n\nQuedan ${phones.length - 1} clientes más. Haz clic en cada botón "Enviar" para enviar individualmente.`);
    }
  };

  const filteredSendCustomers = customers.filter(c => {
    const q = sendSearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const filteredFormCustomers = customers.filter(c => {
    const q = customerSearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const active = promos.filter(p => p.active);
  const inactive = promos.filter(p => !p.active);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground">Promociones</h2>
          <p className="text-sm text-gray-500 dark:text-muted">{active.length} activas · {inactive.length} inactivas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setAiContext(""); setShowAiModal(true); requestAiSuggestions(); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:brightness-110 transition-all shadow-sm"
            style={{ background: 'linear-gradient(to right, #8b5cf6, #9333ea)' }}
          >
            <MessageCircle className="h-4 w-4" /> Sugerencias IA
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" /> Nueva
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted">Cargando…</div>
      ) : promos.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl">
          No hay promociones. Crea una o pide sugerencias a la IA.
        </div>
      ) : (
        <div className="space-y-3">
          {promos.map(p => (
            <div key={p.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm overflow-hidden">
              <div className="flex">
                {/* Accent strip */}
                <div className={cn("w-1.5 shrink-0",
                  p.active ? (p.discountPercent > 0 ? "bg-red-400" : "bg-emerald-400") : "bg-gray-200"
                )} />
                <div className="flex-1">
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                    onClick={() => setDetailPromo(p)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Image preview */}
                      {p.imageUrl && (
                        <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-accent overflow-hidden shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-900 dark:text-foreground">{p.name}</span>
                          <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold",
                            p.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 dark:bg-accent text-gray-500 dark:text-muted"
                          )}>
                            {p.active ? "Activa" : "Inactiva"}
                          </span>
                          {p.discountPercent > 0 && (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">
                              {p.discountPercent}% OFF
                            </span>
                          )}
                          <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold",
                            p.targetType === "all" ? "bg-blue-100 text-blue-700" :
                            p.targetType === "group" ? "bg-purple-100 text-purple-700" : "bg-amber-100 text-amber-700"
                          )}>
                            {p.targetType === "all" ? "Todos" : p.targetType === "group" ? "Grupo" : "Individual"}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-muted mt-0.5 line-clamp-2">{p.description}</p>
                        <p className="text-xs text-gray-400 dark:text-muted mt-1">
                          Creada: {formatDate(p.createdAt)}
                          {p.expiresAt && <> · Expira: {formatDate(p.expiresAt)}</>}
                        </p>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => openSendModal(p)}
                          className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-green-500 hover:bg-green-50 transition-colors"
                          title="Enviar por WhatsApp"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"
                          title="Editar"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleActive(p)}
                          className={cn("p-1.5 rounded-lg transition-colors", p.active ? "text-emerald-500 hover:bg-emerald-50" : "text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent")}
                          title={p.active ? "Desactivar" : "Activar"}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(p.id)}
                          className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create/Edit Modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/50" style={{ zIndex: 100 }} onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">{editingId ? "Editar promoción" : "Nueva promoción"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Nombre *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-card-border outline-none focus:border-primary" placeholder="Ej: 2x1 en arroz" />
              </div>
              {/* Description */}
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Descripción</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-card-border outline-none focus:border-primary resize-none" placeholder="Detalles de la promoción…" />
              </div>
              {/* Discount + Min purchase */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Descuento %</label>
                  <input type="number" min={0} max={100} value={form.discountPercent} onChange={e => setForm(f => ({ ...f, discountPercent: Number(e.target.value) }))}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-card-border outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Compra mín. (S/)</label>
                  <input type="number" min={0} step={0.01} value={form.minPurchase} onChange={e => setForm(f => ({ ...f, minPurchase: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-card-border outline-none focus:border-primary" placeholder="Opcional" />
                </div>
              </div>
              {/* Image URL */}
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">URL de imagen</label>
                <input type="url" value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-card-border outline-none focus:border-primary" placeholder="https://..." />
                {form.imageUrl && (
                  <div className="mt-2 w-32 h-32 rounded-xl bg-gray-100 dark:bg-accent overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.imageUrl} alt="preview" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                )}
              </div>
              {/* WhatsApp message */}
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Mensaje WhatsApp</label>
                <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-card-border outline-none focus:border-primary resize-none"
                  placeholder="🎉 *Promoción especial*&#10;&#10;Aprovecha el descuento…" />
              </div>
              {/* Target type */}
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Público objetivo</label>
                <div className="flex gap-2 mt-1">
                  {[
                    { v: "all", l: "Todos", icon: Users },
                    { v: "group", l: "Grupo", icon: Users },
                    { v: "individual", l: "Individual", icon: User },
                  ].map(({ v, l, icon: Icon }) => (
                    <button key={v} type="button"
                      onClick={() => setForm(f => ({ ...f, targetType: v }))}
                      className={cn("flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all",
                        form.targetType === v ? "border-primary bg-primary/5 text-primary" : "border-gray-200 dark:border-card-border text-gray-500 dark:text-muted hover:border-gray-300"
                      )}>
                      <Icon className="h-4 w-4" /> {l}
                    </button>
                  ))}
                </div>
              </div>
              {/* Customer selection for group/individual */}
              {form.targetType !== "all" && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Seleccionar clientes</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted pointer-events-none" />
                    <input type="text" placeholder="Buscar cliente…" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-card-border outline-none focus:border-primary" />
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 dark:border-card-border divide-y divide-gray-100">
                    {filteredFormCustomers.map(c => (
                      <label key={c.phone} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-surface cursor-pointer text-sm">
                        <input type="checkbox" checked={selectedPhones.has(c.phone)}
                          onChange={() => {
                            setSelectedPhones(prev => {
                              const next = new Set(prev);
                              if (next.has(c.phone)) next.delete(c.phone); else next.add(c.phone);
                              return next;
                            });
                          }}
                          className="rounded border-gray-300 text-primary focus:ring-primary" />
                        <span className="font-medium text-gray-900 dark:text-foreground">{c.name}</span>
                        <span className="text-xs text-gray-400 dark:text-muted font-mono">{c.phone}</span>
                      </label>
                    ))}
                  </div>
                  {selectedPhones.size > 0 && (
                    <p className="text-xs text-primary font-semibold">{selectedPhones.size} cliente{selectedPhones.size !== 1 ? "s" : ""} seleccionado{selectedPhones.size !== 1 ? "s" : ""}</p>
                  )}
                </div>
              )}
              {/* Expiry */}
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Fecha de expiración</label>
                <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-card-border outline-none focus:border-primary text-gray-600 dark:text-muted" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 dark:border-card-border flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-700 dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors">Cancelar</button>
              <button onClick={savePromo} disabled={saving || !form.name.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50">
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear promoción"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Promo Detail Modal ────────────────────────────────────────────── */}
      {detailPromo && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50" style={{ zIndex: 100 }} onClick={() => setDetailPromo(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">{detailPromo.name}</h3>
              <button onClick={() => setDetailPromo(null)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {detailPromo.imageUrl && (
                <div className="rounded-xl overflow-hidden bg-gray-100 dark:bg-accent">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={detailPromo.imageUrl} alt="" className="w-full max-h-48 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold",
                  detailPromo.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 dark:bg-accent text-gray-500 dark:text-muted"
                )}>{detailPromo.active ? "Activa" : "Inactiva"}</span>
                {detailPromo.discountPercent > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-600">
                    <Percent className="h-3 w-3" /> {detailPromo.discountPercent}% OFF
                  </span>
                )}
                <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold",
                  detailPromo.targetType === "all" ? "bg-blue-100 text-blue-700" : detailPromo.targetType === "group" ? "bg-purple-100 text-purple-700" : "bg-amber-100 text-amber-700"
                )}>{detailPromo.targetType === "all" ? "Todos los clientes" : detailPromo.targetType === "group" ? "Grupo seleccionado" : "Individual"}</span>
              </div>
              {detailPromo.description && (
                <div>
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Descripción</p>
                  <p className="text-sm text-gray-700 dark:text-foreground mt-1">{detailPromo.description}</p>
                </div>
              )}
              {detailPromo.minPurchase && (
                <div>
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Compra mínima</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-foreground mt-1">S/{detailPromo.minPurchase}</p>
                </div>
              )}
              {detailPromo.message && (
                <div>
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Mensaje WhatsApp</p>
                  <div className="bg-green-50 rounded-xl p-3 mt-1 text-sm text-gray-700 dark:text-foreground whitespace-pre-wrap border border-green-100">{detailPromo.message}</div>
                </div>
              )}
              {detailPromo.targetPhones && (
                <div>
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Clientes objetivo</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {detailPromo.targetPhones.split(",").filter(Boolean).map(ph => {
                      const cust = customers.find(c => c.phone === ph);
                      return (
                        <span key={ph} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-100 dark:bg-accent text-gray-700 dark:text-foreground font-medium">
                          <Phone className="h-3 w-3" /> {cust ? cust.name : ph}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-3 text-xs text-gray-400 dark:text-muted">
                <span>ID: {detailPromo.id}</span>
                <span>Creada: {formatDate(detailPromo.createdAt)}</span>
                {detailPromo.expiresAt && <span>Expira: {formatDate(detailPromo.expiresAt)}</span>}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 dark:border-card-border flex gap-3 shrink-0">
              <button
                onClick={() => { setDetailPromo(null); openSendModal(detailPromo); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-500 hover:bg-green-600 transition-colors"
              >
                <Send className="h-4 w-4" /> Enviar por WhatsApp
              </button>
              <button
                onClick={() => { setDetailPromo(null); openEdit(detailPromo); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-700 dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors"
              >
                Editar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── WhatsApp Send Modal ───────────────────────────────────────────── */}
      {sendPromo && (
        <div className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/50" style={{ zIndex: 100 }} onClick={() => setSendPromo(null)}>
          <div className="bg-white dark:bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Enviar por WhatsApp</h3>
                <p className="text-xs text-gray-500 dark:text-muted">{sendPromo.name}</p>
              </div>
              <button onClick={() => setSendPromo(null)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Message preview */}
            <div className="px-5 py-3 border-b border-gray-100 dark:border-card-border shrink-0">
              <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide mb-1">Vista previa del mensaje</p>
              <div className="bg-green-50 rounded-xl p-3 text-sm text-gray-700 dark:text-foreground whitespace-pre-wrap border border-green-100 max-h-24 overflow-y-auto">
                {sendPromo.message || `🎉 *${sendPromo.name}*\n\n${sendPromo.description}\n\n${sendPromo.discountPercent > 0 ? `📢 ${sendPromo.discountPercent}% de descuento` : ""}${sendPromo.minPurchase ? `\nCompra mínima: S/${sendPromo.minPurchase}` : ""}\n\n¡Te esperamos en Bodega San Martín! 🛒`}
              </div>
            </div>
            {/* Customer selection */}
            <div className="px-5 py-3 border-b border-gray-100 dark:border-card-border shrink-0 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted pointer-events-none" />
                <input type="text" placeholder="Buscar cliente…" value={sendSearch} onChange={e => setSendSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-card-border outline-none focus:border-primary" />
              </div>
              <button onClick={() => setSendPhones(new Set(customers.map(c => c.phone)))}
                className="text-xs font-semibold text-primary hover:underline whitespace-nowrap">Todos</button>
              <button onClick={() => setSendPhones(new Set())}
                className="text-xs font-semibold text-gray-400 dark:text-muted hover:underline whitespace-nowrap">Ninguno</button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
              {filteredSendCustomers.map(c => {
                const selected = sendPhones.has(c.phone);
                return (
                  <div key={c.phone} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-surface">
                    <input type="checkbox" checked={selected}
                      onChange={() => {
                        setSendPhones(prev => {
                          const next = new Set(prev);
                          if (next.has(c.phone)) next.delete(c.phone); else next.add(c.phone);
                          return next;
                        });
                      }}
                      className="rounded border-gray-300 text-primary focus:ring-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-foreground">{c.name}</p>
                      <p className="text-xs text-gray-400 dark:text-muted font-mono">{c.phone}</p>
                    </div>
                    <button
                      onClick={() => {
                        const msg = sendPromo.message || `🎉 *${sendPromo.name}*\n\n${sendPromo.description}\n\n${sendPromo.discountPercent > 0 ? `📢 ${sendPromo.discountPercent}% de descuento` : ""}${sendPromo.minPurchase ? `\nCompra mínima: S/${sendPromo.minPurchase}` : ""}\n\n¡Te esperamos en Bodega San Martín! 🛒`;
                        sendWhatsApp(c.phone, msg);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-green-600 bg-green-50 hover:bg-green-100 transition-colors flex items-center gap-1"
                    >
                      <Send className="h-3 w-3" /> Enviar
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 dark:border-card-border shrink-0">
              <p className="text-xs text-gray-500 dark:text-muted mb-3">{sendPhones.size} cliente{sendPhones.size !== 1 ? "s" : ""} seleccionado{sendPhones.size !== 1 ? "s" : ""}. Cada envío abrirá WhatsApp Web/App.</p>
              <button
                onClick={sendToAll}
                disabled={sendPhones.size === 0}
                className="w-full py-3 rounded-xl text-sm font-bold text-white bg-green-500 hover:bg-green-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <Send className="h-4 w-4" /> Enviar a todos los seleccionados
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Suggestions Modal ──────────────────────────────────────────── */}
      {showAiModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50" style={{ zIndex: 100 }} onClick={() => setShowAiModal(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, #8b5cf6, #9333ea)' }}>
                  <MessageCircle className="h-4 w-4 text-white" />
                </div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Sugerencias IA</h3>
              </div>
              <button onClick={() => setShowAiModal(false)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {loadingAi ? (
                <div className="h-40 flex flex-col items-center justify-center text-gray-400 dark:text-muted">
                  <Loader2 className="h-6 w-6 animate-spin mb-3" />
                  <p className="text-sm font-semibold">Analizando datos de clientes y ventas…</p>
                </div>
              ) : aiSuggestions ? (
                <div className="space-y-0.5" dangerouslySetInnerHTML={{ __html: mdToHtml(aiSuggestions) }} />
              ) : (
                <p className="text-sm text-gray-400 dark:text-muted text-center py-10">No hay sugerencias disponibles.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ───────────────────────────────────────────── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 200 }} onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">¿Eliminar promoción?</h3>
                <p className="text-sm text-gray-500 dark:text-muted">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-700 dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors">Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
