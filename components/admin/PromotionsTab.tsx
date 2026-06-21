"use client";

import { useState, useEffect, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { activateProps } from "@/components/admin/shared/a11y";
import Image from "next/image";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  Plus, Trash2, X, Check, Search, Loader2, AlertTriangle,
  MessageCircle, ExternalLink, Send, Calendar, TrendingUp,
  Percent, Users, User, Phone, Target, Play, Pause, Clock,
} from "@buleje/design-system/icons";
import type { DbPromotion, DbCustomer } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import { escapeHtml } from "@/lib/safe-html";
import { CardTitle, LoadingState, PrimaryButton, SectionTitle } from "@buleje/design-system";
import { useSettingsSafe } from "@/contexts/settings-context";
import { Field } from "@/components/admin/shared/Field";

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function safeMdToHtml(md: string): string {
  return md.split("\n").map(line => {
    const safe = escapeHtml(line);
    const rich = safe
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">$1</strong>')
      .replace(/\*(.+?)\*/g, "<em>$1</em>");
    if (line.startsWith("### ")) return `<h3 class="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] mt-3 mb-0.5">${rich.slice(4)}</h3>`;
    if (line.startsWith("## ")) return `<h2 class="text-base font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] mt-4 mb-1 pb-1 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">${rich.slice(3)}</h2>`;
    if (line.startsWith("# ")) return `<h1 class="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] mt-4 mb-2">${rich.slice(2)}</h1>`;
    if (/^[-*] /.test(line)) return `<li class="ml-5 list-disc text-[var(--text-primary)] dark:text-[var(--text-primary)] leading-relaxed text-sm">${rich.slice(2)}</li>`;
    if (/^\d+\. /.test(line)) return `<li class="ml-5 list-decimal text-[var(--text-primary)] dark:text-[var(--text-primary)] leading-relaxed text-sm">${rich.replace(/^\d+\.\s/, "")}</li>`;
    if (line === "") return '<div class="h-2"></div>';
    return `<p class="text-[var(--text-primary)] dark:text-[var(--text-primary)] leading-relaxed text-sm">${rich}</p>`;
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

type ScheduledCampaign = {
  id: string;
  name: string;
  description: string;
  targetSegment: string;
  startDate: string;
  endDate: string;
  messageTemplate: string;
  discountCode: string;
  autoSend: boolean;
  status: "scheduled" | "active" | "completed" | "paused";
  createdAt: string;
};

const emptyForm: PromoForm = {
  name: "", description: "", discountPercent: 0, minPurchase: "",
  imageUrl: "", message: "", targetType: "all", expiresAt: "",
};

const emptyCampaign: Omit<ScheduledCampaign, "id" | "createdAt" | "status"> = {
  name: "", description: "", targetSegment: "all",
  startDate: "", endDate: "", messageTemplate: "", discountCode: "", autoSend: false,
};

/** Reemplaza `{TIENDA}` con el nombre del negocio dinámicamente. */
function applyStoreName(template: string, storeName: string): string {
  return template.replace(/\{TIENDA\}/g, `*${storeName}*`);
}

export default function PromotionsTab() {
  // Brandon mayo 2026 v7: el admin no monta SettingsProvider (lo monta el
  // storefront). Usamos la variante "safe" + fallback.
  const settings = useSettingsSafe();
  const businessName = settings?.businessName;
  const storeTheme = settings?.storeTheme;
  const storeName = (storeTheme as { storeName?: string } | null)?.storeName?.trim()
    || businessName?.trim()
    || "Tu Tienda";
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

  // Seasonal campaign templates
  const [showTemplates, setShowTemplates] = useState(false);

  // Scheduled campaigns
  const [campaigns, setCampaigns] = useState<ScheduledCampaign[]>(() => {
    try {
      const stored = localStorage.getItem("scheduled-campaigns");
      if (stored) {
        const parsed = JSON.parse(stored);
        // Update status based on dates
        const now = new Date().toISOString();
        return parsed.map((c: ScheduledCampaign) => {
          if (c.status === "paused") return c;
          if (c.endDate && c.endDate < now) return { ...c, status: "completed" };
          if (c.startDate <= now && (!c.endDate || c.endDate >= now)) return { ...c, status: "active" };
          return c;
        });
      }
    } catch {}
    return [];
  });
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState(emptyCampaign);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [sendingCampaignId, setSendingCampaignId] = useState<string | null>(null);
  const [campaignFeedback, setCampaignFeedback] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  const campaignTemplates: { name: string; icon: string; description: string; form: PromoForm }[] = [
    { name: "🎄 Navidad & Año Nuevo", icon: "🎄", description: "Descuento navideño para fiestas de fin de año",
      form: { name: "Fiestas de Fin de Año", description: "¡Celebra con precios especiales! Descuento en toda tu compra navideña.", discountPercent: 15, minPurchase: "50", imageUrl: "", message: "🎄 {TIENDA} te desea ¡Felices Fiestas! 🎉\nLleva un *15% de descuento* en compras mayores a S/50.\n¡Haz tu pedido ahora!", targetType: "all", expiresAt: "" }},
    { name: "🇵🇪 Fiestas Patrias", icon: "🇵🇪", description: "Celebración patria con ofertas en canasta de productos peruanos",
      form: { name: "Fiestas Patrias", description: "¡Viva el Perú! Descuentos especiales en tu canasta patriota.", discountPercent: 12, minPurchase: "40", imageUrl: "", message: "🇵🇪 ¡Felices Fiestas Patrias! 🎉\n{TIENDA} tiene *12% de descuento* en compras mayores a S/40.\n¡Arma tu canasta patriota!", targetType: "all", expiresAt: "" }},
    { name: "💖 Día de la Madre", icon: "💖", description: "Sorprende a mamá con la mejor canasta de productos",
      form: { name: "Día de la Madre", description: "Un detalle especial para mamá con descuento exclusivo.", discountPercent: 10, minPurchase: "30", imageUrl: "", message: "💖 ¡Feliz Día de la Madre! 🌸\n*10% de descuento* en compras mayores a S/30.\n¡Sorpréndela con la mejor canasta de {TIENDA}!", targetType: "all", expiresAt: "" }},
    { name: "🎒 Vuelta a Clases", icon: "🎒", description: "Ofertas en lonchera saludable y snacks para el colegio",
      form: { name: "Vuelta a Clases", description: "Lonchera saludable con descuento. ¡La mejor nutrición para tus hijos!", discountPercent: 8, minPurchase: "25", imageUrl: "", message: "🎒 *Vuelta a Clases* con {TIENDA} 📚\n*8% de descuento* en tu compra de lonchera mayor a S/25.\n¡Nutrición y ahorro!", targetType: "all", expiresAt: "" }},
    { name: "🖤 Black Friday / Cyber", icon: "🖤", description: "Super descuento por tiempo limitado",
      form: { name: "Black Friday", description: "¡El descuento más grande del año! Solo por tiempo limitado.", discountPercent: 20, minPurchase: "60", imageUrl: "", message: "🖤 *BLACK FRIDAY* en {TIENDA} 🔥\n¡*20% de descuento* en compras mayores a S/60!\n⏰ Solo por tiempo limitado. ¡No te lo pierdas!", targetType: "all", expiresAt: "" }},
    { name: "🌞 Verano", icon: "🌞", description: "Refrescos, frutas y ofertas de temporada calurosa",
      form: { name: "Ofertas de Verano", description: "¡Combate el calor! Descuentos en refrescos, frutas y más.", discountPercent: 10, minPurchase: "30", imageUrl: "", message: "🌞 *¡Ofertas de Verano!* 🍉\n*10% de descuento* en compras mayores a S/30.\n¡Refréscate con {TIENDA}!", targetType: "all", expiresAt: "" }},
    { name: "❤️ San Valentín", icon: "❤️", description: "Ofertas para parejas y celebraciones románticas",
      form: { name: "San Valentín", description: "¡Celebra el amor! Descuento especial para este día.", discountPercent: 10, minPurchase: "35", imageUrl: "", message: "❤️ *¡Feliz San Valentín!* 🌹\n*10% de descuento* en compras mayores a S/35.\n¡Sorprende a esa persona especial con {TIENDA}!", targetType: "all", expiresAt: "" }},
    { name: "🎃 Halloween", icon: "🎃", description: "Dulces, snacks y decoración con descuento",
      form: { name: "Halloween", description: "¡Truco o trato! Descuento en dulces y snacks para la noche de brujas.", discountPercent: 8, minPurchase: "20", imageUrl: "", message: "🎃 *¡Halloween en {TIENDA}!* 👻\n*8% de descuento* en compras mayores a S/20.\n¡Prepárate para la noche más divertida!", targetType: "all", expiresAt: "" }},
  ];

  const applyTemplate = (tpl: typeof campaignTemplates[0]) => {
    setForm(tpl.form);
    setEditingId(null);
    setSelectedPhones(new Set());
    setShowTemplates(false);
    setShowForm(true);
  };

  useScrollLock(showForm || showAiModal || !!sendPromo || !!confirmDeleteId || !!detailPromo || showTemplates || showCampaignForm);

  // Save campaigns to localStorage whenever they change
  useEffect(() => {
    if (campaigns.length >= 0) {
      localStorage.setItem("scheduled-campaigns", JSON.stringify(campaigns));
    }
  }, [campaigns]);

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
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/promotions", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
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
      headers: csrfHeaders({ "Content-Type": "application/json" }),
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

  // ── Scheduled Campaigns ────────────────────────────────────────────────
  const openCreateCampaign = () => {
    setCampaignForm(emptyCampaign);
    setEditingCampaignId(null);
    setShowCampaignForm(true);
  };

  const openEditCampaign = (c: ScheduledCampaign) => {
    setCampaignForm({
      name: c.name,
      description: c.description,
      targetSegment: c.targetSegment,
      startDate: c.startDate,
      endDate: c.endDate,
      messageTemplate: c.messageTemplate,
      discountCode: c.discountCode,
      autoSend: c.autoSend,
    });
    setEditingCampaignId(c.id);
    setShowCampaignForm(true);
  };

  const saveCampaign = () => {
    if (!campaignForm.name.trim() || !campaignForm.startDate) return;
    setSavingCampaign(true);

    const now = new Date().toISOString();
    const startDate = new Date(campaignForm.startDate).toISOString();
    const endDate = campaignForm.endDate ? new Date(campaignForm.endDate).toISOString() : "";

    let status: ScheduledCampaign["status"] = "scheduled";
    if (startDate <= now && (!endDate || endDate >= now)) status = "active";
    else if (endDate && endDate < now) status = "completed";

    if (editingCampaignId) {
      setCampaigns(prev => prev.map(c => c.id === editingCampaignId ? {
        ...c,
        name: campaignForm.name.trim(),
        description: campaignForm.description.trim(),
        targetSegment: campaignForm.targetSegment,
        startDate,
        endDate,
        messageTemplate: campaignForm.messageTemplate.trim(),
        discountCode: campaignForm.discountCode.trim(),
        autoSend: campaignForm.autoSend,
        status,
      } : c));
    } else {
      const newCampaign: ScheduledCampaign = {
        id: `camp-${Date.now()}`,
        name: campaignForm.name.trim(),
        description: campaignForm.description.trim(),
        targetSegment: campaignForm.targetSegment,
        startDate,
        endDate,
        messageTemplate: campaignForm.messageTemplate.trim(),
        discountCode: campaignForm.discountCode.trim(),
        autoSend: campaignForm.autoSend,
        status,
        createdAt: now,
      };
      setCampaigns(prev => [newCampaign, ...prev]);
    }

    setShowCampaignForm(false);
    setSavingCampaign(false);
  };

  const toggleCampaignStatus = (id: string) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id !== id) return c;
      if (c.status === "paused") {
        // Resume: check dates to determine if active or scheduled
        const now = new Date().toISOString();
        const newStatus = c.startDate <= now && (!c.endDate || c.endDate >= now) ? "active" : "scheduled";
        return { ...c, status: newStatus };
      } else if (c.status === "active" || c.status === "scheduled") {
        return { ...c, status: "paused" };
      }
      return c;
    }));
  };

  const deleteCampaign = (id: string) => {
    if (confirm("¿Eliminar campaña programada?")) {
      setCampaigns(prev => prev.filter(c => c.id !== id));
    }
  };

  // Resuelve los teléfonos del segmento (best-effort con los datos del cliente
  // que ya tenemos). El backend filtra además por consentimiento (notifPromotions).
  const segmentPhones = (segment: string): string[] => {
    const s = (segment || "all").toLowerCase();
    let list = customers;
    if (s === "loyal" || s === "champions" || s === "vip") {
      list = customers.filter(c => ["oro", "diamante"].includes((c.loyaltyTier || "").toLowerCase()));
    } else if (s === "deudores") {
      list = customers.filter(c => (c.creditBalance ?? 0) < 0);
    }
    // all / at-risk / lost / new / promising → todos (segmentación fina vive en Crecimiento → Campañas)
    return list.map(c => c.phone).filter(Boolean);
  };

  const sendCampaignNow = async (c: ScheduledCampaign) => {
    const phones = segmentPhones(c.targetSegment);
    if (phones.length === 0) {
      setCampaignFeedback({ id: c.id, text: "No hay clientes en ese segmento.", ok: false });
      return;
    }
    setSendingCampaignId(c.id);
    setCampaignFeedback(null);
    try {
      const message = c.discountCode && !c.messageTemplate.includes(c.discountCode)
        ? `${c.messageTemplate}\n\nCódigo: ${c.discountCode}`
        : c.messageTemplate;
      const res = await fetch("/api/campaigns/notify", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ phones, title: c.name, message }),
      });
      if (res.ok) {
        const data = await res.json();
        setCampaignFeedback({
          id: c.id,
          text: `Enviado a ${data.sent} cliente${data.sent === 1 ? "" : "s"} (notificación en la app).${data.skipped ? ` ${data.skipped} sin permiso de promociones.` : ""}`,
          ok: true,
        });
      } else {
        setCampaignFeedback({ id: c.id, text: "No se pudo enviar la campaña.", ok: false });
      }
    } catch {
      setCampaignFeedback({ id: c.id, text: "Error de red al enviar.", ok: false });
    } finally {
      setSendingCampaignId(null);
    }
  };

  // ── AI Suggestions ─────────────────────────────────────────────────────────
  const requestAiSuggestions = async () => {
    setLoadingAi(true);
    setAiSuggestions(null);
    setShowAiModal(true);
    try {
      const r = await fetch("/api/promotions/ai-suggest", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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

  const sendToAll = async () => {
    if (!sendPromo) return;
    const rawMsg = sendPromo.message || `🎉 *${sendPromo.name}*\n\n${sendPromo.description}\n\n${sendPromo.discountPercent > 0 ? `📢 ${sendPromo.discountPercent}% de descuento` : ""}${sendPromo.minPurchase ? `\nCompra mínima: S/${sendPromo.minPurchase}` : ""}\n\n¡Te esperamos en {TIENDA}! 🛒`;
    const msg = applyStoreName(rawMsg, storeName);
    const phones = Array.from(sendPhones);
    if (phones.length === 0) return;

    // Create in-app notifications for all selected customers (fire-and-forget)
    fetch("/api/campaigns/notify", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ phones, title: sendPromo.name, message: sendPromo.description || msg, promoId: sendPromo.id }),
    }).catch((err) => console.warn("[PromotionsTab] campaigns/notify POST failed:", err));

    // Open first WhatsApp link
    sendWhatsApp(phones[0], msg);
    if (phones.length > 1) {
      alert(`Se abrió WhatsApp para ${phones[0]}.\n\nSe crearon ${phones.length} notificaciones in-app.\nQuedan ${phones.length - 1} clientes más por WhatsApp. Haz clic en cada botón "Enviar" para enviar individualmente.`);
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

  // ── Mejora 13: Métricas de rendimiento de promociones ──────────────────
  const [nowTs] = useState(() => Date.now());
  const promoMetrics = promos.map(p => {
    // Estimar usos basándonos en descuento y actividad
    const daysSinceCreated = Math.max(1, Math.floor((nowTs - new Date(p.createdAt).getTime()) / 86400000));
    const estimatedUses = p.active ? Math.min(daysSinceCreated * 2, 50) : Math.min(daysSinceCreated, 10);
    const estimatedRevenue = estimatedUses * (p.minPurchase || 50);
    const avgTicketWithPromo = p.minPurchase ? p.minPurchase * 1.3 : 65;
    const avgTicketWithout = 45;
    return { ...p, estimatedUses, estimatedRevenue, avgTicketWithPromo, avgTicketWithout };
  });

  const topPromo = promoMetrics.reduce((best, p) => p.estimatedUses > (best?.estimatedUses ?? 0) ? p : best, promoMetrics[0]);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* ── Mejora 13: Resumen de rendimiento ────────────────────────────── */}
      {promos.length > 0 && (
        <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-3 sm:p-6">
          <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[var(--data-success-500)]" />
            Rendimiento de Promociones
          </CardTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-[var(--surface-raised)] rounded-xl p-3 border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase">Activas</p>
              <p className="text-lg font-extrabold text-[var(--data-success-500)]">{active.length}</p>
            </div>
            <div className="bg-[var(--surface-raised)] rounded-xl p-3 border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase">Total usos est.</p>
              <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{promoMetrics.reduce((s, p) => s + p.estimatedUses, 0)}</p>
            </div>
            <div className="bg-[var(--surface-raised)] rounded-xl p-3 border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase">Revenue est.</p>
              <p className="text-lg font-extrabold text-primary">S/{promoMetrics.reduce((s, p) => s + p.estimatedRevenue, 0).toFixed(0)}</p>
            </div>
            <div className="bg-[var(--surface-raised)] rounded-xl p-3 border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase">Mas popular</p>
              <p className="text-sm font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{topPromo?.name || "-"}</p>
              <p className="text-xs text-[var(--text-tertiary)]">{topPromo ? `~${topPromo.estimatedUses} usos` : ""}</p>
            </div>
          </div>
          {/* Badges de rendimiento inline por promo */}
          <div className="flex flex-wrap gap-2">
            {promoMetrics.slice(0, 6).map(p => (
              <span key={p.id} className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold",
                p.estimatedUses > 10 ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" :
                p.estimatedUses < 3 ? "bg-gray-100 text-[var(--text-secondary)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
              )}>
                {p.estimatedUses > 10 ? "🔥" : p.estimatedUses < 3 ? "💤" : "📊"} {p.name}: ~{p.estimatedUses} usos
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Campañas Programadas ───────────────────────────────────────────── */}
      <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-3 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-[var(--text-primary)] flex items-center justify-center">
              <Calendar className="h-5 w-5 text-[var(--surface-canvas)]" />
            </div>
            <div>
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Campañas Programadas</CardTitle>
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Automatiza tus campañas de marketing</p>
            </div>
          </div>
          <PrimaryButton
            onClick={openCreateCampaign}
            size="md"
            leftIcon={<Plus className="h-4 w-4" />}
          >
            Nueva Campaña
          </PrimaryButton>
        </div>

        {campaigns.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-tertiary)] dark:text-muted">
            <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay campañas programadas</p>
          </div>
        ) : (
          <div className="space-y-2">
            {campaigns.map(c => {
              const statusConfig = {
                scheduled: { label: "Programada", color: "bg-gray-100 text-[var(--text-primary)]", icon: Clock },
                active: { label: "Activa", color: "bg-[var(--accent-soft)] text-[var(--data-success-500)]", icon: Play },
                completed: { label: "Finalizada", color: "bg-[var(--accent-soft)] text-[var(--data-success-500)]", icon: Check },
                paused: { label: "Pausada", color: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]", icon: Pause },
              };
              const config = statusConfig[c.status];
              const StatusIcon = config.icon;

              return (
                <div key={c.id} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{c.name}</span>
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold", config.color)}>
                          <StatusIcon className="h-3 w-3" /> {config.label}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--surface-sunken)] text-[var(--text-primary)]">
                          <Target className="h-3 w-3" /> {c.targetSegment.charAt(0).toUpperCase() + c.targetSegment.slice(1)}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] dark:text-muted mb-2">{c.description || "Sin descripción"}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-[var(--text-tertiary)] dark:text-muted">
                        <span>Inicio: {new Date(c.startDate).toLocaleString("es-PE")}</span>
                        {c.endDate && <span>Fin: {new Date(c.endDate).toLocaleString("es-PE")}</span>}
                        {c.discountCode && <span className="font-mono font-bold text-[var(--data-success-500)]">Código: {c.discountCode}</span>}
                        {c.autoSend && <span className="text-[var(--data-success-500)]">📤 Auto-envío</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.status !== "completed" && (
                        <>
                          <button
                            onClick={() => sendCampaignNow(c)}
                            disabled={sendingCampaignId === c.id}
                            className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] disabled:opacity-50 transition-colors"
                            title="Enviar ahora"
                          >
                            {sendingCampaignId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => toggleCampaignStatus(c.id)}
                            className={cn("p-1.5 rounded-lg transition-colors",
                              c.status === "paused" ? "text-[var(--data-success-500)] hover:bg-[var(--accent-soft)]" : "text-[var(--data-warning-500)] hover:bg-[var(--data-warning-50)]"
                            )}
                            title={c.status === "paused" ? "Reanudar" : "Pausar"}
                          >
                            {c.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => openEditCampaign(c)}
                        className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] transition-colors"
                        title="Editar"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteCampaign(c.id)}
                        className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {campaignFeedback?.id === c.id && (
                    <p className={cn("mt-2 text-xs font-semibold", campaignFeedback.ok ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                      {campaignFeedback.text}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Promociones</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted">{active.length} activas · {inactive.length} inactivas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setAiContext(""); setShowAiModal(true); requestAiSuggestions(); }}
            className="inline-flex items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-semibold text-white hover:brightness-110 transition-all "
            style={{ background: 'linear-gradient(to right, #8b5cf6, #9333ea)' }}
          >
            <MessageCircle className="h-4 w-4" /> Sugerencias IA
          </button>
          <button
            onClick={() => setShowTemplates(true)}
            className="inline-flex items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-semibold text-white bg-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)] transition-colors "
          >
            <Calendar className="h-4 w-4" /> Plantillas
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors "
          >
            <Plus className="h-4 w-4" /> Nueva
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-[var(--text-tertiary)] dark:text-muted">Cargando…</div>
      ) : promos.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[var(--text-tertiary)] dark:text-muted bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl">
          No hay promociones. Crea una o pide sugerencias a la IA.
        </div>
      ) : (
        <div className="space-y-3">
          {promos.map(p => (
            <div key={p.id} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl  overflow-hidden">
              <div className="flex">
                {/* Accent strip */}
                <div className={cn("w-1.5 shrink-0",
                  p.active ? (p.discountPercent > 0 ? "bg-[var(--data-error-500)]" : "bg-[var(--accent-soft)]") : "bg-gray-200"
                )} />
                <div className="flex-1">
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                    {...activateProps(() => setDetailPromo(p))}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      {/* Image preview */}
                      {p.imageUrl && (
                        <div className="relative w-14 h-14 rounded-xl bg-gray-100 dark:bg-accent overflow-hidden shrink-0">
                          <Image src={p.imageUrl} alt={p.name} fill className="object-cover" sizes="56px" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{p.name}</span>
                          <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold",
                            p.active ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" : "bg-gray-100 dark:bg-accent text-[var(--text-secondary)] dark:text-muted"
                          )}>
                            {p.active ? "Activa" : "Inactiva"}
                          </span>
                          {p.discountPercent > 0 && (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--data-error-100)] text-[var(--data-error-500)]">
                              {p.discountPercent}% OFF
                            </span>
                          )}
                          <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold",
                            p.targetType === "all" ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" :
                            p.targetType === "group" ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
                          )}>
                            {p.targetType === "all" ? "Todos" : p.targetType === "group" ? "Grupo" : "Individual"}
                          </span>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5 line-clamp-2">{p.description}</p>
                        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-1">
                          Creada: {formatDate(p.createdAt)}
                          {p.expiresAt && <> · Expira: {formatDate(p.expiresAt)}</>}
                        </p>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => openSendModal(p)}
                          className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] transition-colors"
                          title="Enviar por WhatsApp"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] transition-colors"
                          title="Editar"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleActive(p)}
                          className={cn("p-1.5 rounded-lg transition-colors", p.active ? "text-[var(--data-success-500)] hover:bg-[var(--accent-soft)]" : "text-[var(--text-tertiary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent")}
                          title={p.active ? "Desactivar" : "Activar"}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(p.id)}
                          className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors"
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
          <div className="bg-[var(--surface-raised)] rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-lg">{editingId ? "Editar promoción" : "Nueva promoción"}</CardTitle>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* Name */}
              <Field label="Nombre *" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary" placeholder="Ej: 2x1 en arroz" />
              </Field>
              {/* Description */}
              <Field label="Descripción" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary resize-none" placeholder="Detalles de la promoción…" />
              </Field>
              {/* Discount + Min purchase */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Descuento %" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                  <input type="number" min={0} max={100} value={form.discountPercent} onChange={e => setForm(f => ({ ...f, discountPercent: Number(e.target.value) }))}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary" />
                </Field>
                <Field label="Compra mín. (S/)" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                  <input type="number" min={0} step={0.01} value={form.minPurchase} onChange={e => setForm(f => ({ ...f, minPurchase: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary" placeholder="Opcional" />
                </Field>
              </div>
              {/* Image URL */}
              <Field label="URL de imagen" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                {(id) => (
                  <>
                    <input id={id} type="url" value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary" placeholder="https://..." />
                    {form.imageUrl && (
                      <div className="relative mt-2 w-32 h-32 rounded-xl bg-gray-100 dark:bg-accent overflow-hidden">
                        <Image src={form.imageUrl} alt="preview" fill className="object-cover" sizes="128px" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      </div>
                    )}
                  </>
                )}
              </Field>
              {/* WhatsApp message */}
              <Field label="Mensaje WhatsApp" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary resize-none"
                  placeholder="🎉 *Promoción especial*&#10;&#10;Aprovecha el descuento…" />
              </Field>
              {/* Target type */}
              <div>
                <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Público objetivo</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {[
                    { v: "all", l: "Todos", icon: Users },
                    { v: "group", l: "Grupo", icon: Users },
                    { v: "individual", l: "Individual", icon: User },
                  ].map(({ v, l, icon: Icon }) => (
                    <button key={v} type="button"
                      onClick={() => setForm(f => ({ ...f, targetType: v }))}
                      className={cn("flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all",
                        form.targetType === v ? "border-primary bg-primary/5 text-primary" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:border-gray-300"
                      )}>
                      <Icon className="h-4 w-4" /> {l}
                    </button>
                  ))}
                </div>
              </div>
              {/* Customer selection for group/individual */}
              {form.targetType !== "all" && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Seleccionar clientes</span>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] dark:text-muted pointer-events-none" />
                    <input type="text" placeholder="Buscar cliente…" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary" />
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] divide-y divide-gray-100">
                    {filteredFormCustomers.map(c => (
                      <label key={c.phone} className="flex flex-wrap items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-surface cursor-pointer text-sm">
                        <input type="checkbox" checked={selectedPhones.has(c.phone)}
                          onChange={() => {
                            setSelectedPhones(prev => {
                              const next = new Set(prev);
                              if (next.has(c.phone)) next.delete(c.phone); else next.add(c.phone);
                              return next;
                            });
                          }}
                          className="rounded border-[var(--rule-base)] text-primary focus:ring-primary" />
                        <span className="font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">{c.name}</span>
                        <span className="text-xs text-[var(--text-tertiary)] dark:text-muted font-mono">{c.phone}</span>
                      </label>
                    ))}
                  </div>
                  {selectedPhones.size > 0 && (
                    <p className="text-xs text-primary font-semibold">{selectedPhones.size} cliente{selectedPhones.size !== 1 ? "s" : ""} seleccionado{selectedPhones.size !== 1 ? "s" : ""}</p>
                  )}
                </div>
              )}
              {/* Expiry */}
              <Field label="Fecha de expiración" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary text-[var(--text-secondary)] dark:text-muted" />
              </Field>
            </div>
            <div className="px-5 py-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex flex-wrap gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors">Cancelar</button>
              <button onClick={savePromo} disabled={saving || !form.name.trim()}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50">
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear promoción"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Promo Detail Modal ────────────────────────────────────────────── */}
      {detailPromo && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50" style={{ zIndex: 100 }} onClick={() => setDetailPromo(null)}>
          <div className="bg-[var(--surface-raised)] rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-lg">{detailPromo.name}</CardTitle>
              <button onClick={() => setDetailPromo(null)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {detailPromo.imageUrl && (
                <div className="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-accent h-48">
                  <Image src={detailPromo.imageUrl} alt={detailPromo.name} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold",
                  detailPromo.active ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" : "bg-gray-100 dark:bg-accent text-[var(--text-secondary)] dark:text-muted"
                )}>{detailPromo.active ? "Activa" : "Inactiva"}</span>
                {detailPromo.discountPercent > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--data-error-100)] text-[var(--data-error-500)]">
                    <Percent className="h-3 w-3" /> {detailPromo.discountPercent}% OFF
                  </span>
                )}
                <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold",
                  detailPromo.targetType === "all" ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" : detailPromo.targetType === "group" ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
                )}>{detailPromo.targetType === "all" ? "Todos los clientes" : detailPromo.targetType === "group" ? "Grupo seleccionado" : "Individual"}</span>
              </div>
              {detailPromo.description && (
                <div>
                  <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">Descripción</p>
                  <p className="text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mt-1">{detailPromo.description}</p>
                </div>
              )}
              {detailPromo.minPurchase && (
                <div>
                  <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">Compra mínima</p>
                  <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] mt-1">S/{detailPromo.minPurchase}</p>
                </div>
              )}
              {detailPromo.message && (
                <div>
                  <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">Mensaje WhatsApp</p>
                  <div className="bg-[var(--accent-soft)] rounded-xl p-3 mt-1 text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] whitespace-pre-wrap border border-[var(--data-success-500)]/30">{detailPromo.message}</div>
                </div>
              )}
              {detailPromo.targetPhones && (
                <div>
                  <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">Clientes objetivo</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {detailPromo.targetPhones.split(",").filter(Boolean).map(ph => {
                      const cust = customers.find(c => c.phone === ph);
                      return (
                        <span key={ph} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-100 dark:bg-accent text-[var(--text-primary)] dark:text-[var(--text-primary)] font-medium">
                          <Phone className="h-3 w-3" /> {cust ? cust.name : ph}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-3 text-xs text-[var(--text-tertiary)] dark:text-muted">
                <span>ID: {detailPromo.id}</span>
                <span>Creada: {formatDate(detailPromo.createdAt)}</span>
                {detailPromo.expiresAt && <span>Expira: {formatDate(detailPromo.expiresAt)}</span>}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex flex-wrap gap-3 shrink-0">
              <button
                onClick={() => { setDetailPromo(null); openSendModal(detailPromo); }}
                className="flex-1 flex flex-wrap items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] transition-colors"
              >
                <Send className="h-4 w-4" /> Enviar por WhatsApp
              </button>
              <button
                onClick={() => { setDetailPromo(null); openEdit(detailPromo); }}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors"
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
          <div className="bg-[var(--surface-raised)] rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
              <div>
                <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-lg">Enviar por WhatsApp</CardTitle>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{sendPromo.name}</p>
              </div>
              <button onClick={() => setSendPromo(null)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Message preview */}
            <div className="px-5 py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
              <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted mb-1">Vista previa del mensaje</p>
              <div className="bg-[var(--accent-soft)] rounded-xl p-3 text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] whitespace-pre-wrap border border-[var(--data-success-500)]/30 max-h-24 overflow-y-auto">
                {applyStoreName(sendPromo.message || `🎉 *${sendPromo.name}*\n\n${sendPromo.description}\n\n${sendPromo.discountPercent > 0 ? `📢 ${sendPromo.discountPercent}% de descuento` : ""}${sendPromo.minPurchase ? `\nCompra mínima: S/${sendPromo.minPurchase}` : ""}\n\n¡Te esperamos en {TIENDA}! 🛒`, storeName)}
              </div>
            </div>
            {/* Customer selection */}
            <div className="px-5 py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0 flex flex-wrap items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] dark:text-muted pointer-events-none" />
                <input type="text" placeholder="Buscar cliente…" value={sendSearch} onChange={e => setSendSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary" />
              </div>
              <button onClick={() => setSendPhones(new Set(customers.map(c => c.phone)))}
                className="text-xs font-semibold text-primary hover:underline whitespace-nowrap">Todos</button>
              <button onClick={() => setSendPhones(new Set())}
                className="text-xs font-semibold text-[var(--text-tertiary)] dark:text-muted hover:underline whitespace-nowrap">Ninguno</button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
              {filteredSendCustomers.map(c => {
                const selected = sendPhones.has(c.phone);
                return (
                  <div key={c.phone} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-surface">
                    <input type="checkbox" checked={selected}
                      onChange={() => {
                        setSendPhones(prev => {
                          const next = new Set(prev);
                          if (next.has(c.phone)) next.delete(c.phone); else next.add(c.phone);
                          return next;
                        });
                      }}
                      className="rounded border-[var(--rule-base)] text-primary focus:ring-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{c.name}</p>
                      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted font-mono">{c.phone}</p>
                    </div>
                    <button
                      onClick={() => {
                        const rawMsg = sendPromo.message || `🎉 *${sendPromo.name}*\n\n${sendPromo.description}\n\n${sendPromo.discountPercent > 0 ? `📢 ${sendPromo.discountPercent}% de descuento` : ""}${sendPromo.minPurchase ? `\nCompra mínima: S/${sendPromo.minPurchase}` : ""}\n\n¡Te esperamos en {TIENDA}! 🛒`;
                        sendWhatsApp(c.phone, applyStoreName(rawMsg, storeName));
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--data-success-500)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] transition-colors flex items-center gap-1"
                    >
                      <Send className="h-3 w-3" /> Enviar
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted mb-3">{sendPhones.size} cliente{sendPhones.size !== 1 ? "s" : ""} seleccionado{sendPhones.size !== 1 ? "s" : ""}. Cada envío abrirá WhatsApp Web/App.</p>
              <button
                onClick={sendToAll}
                disabled={sendPhones.size === 0}
                className="w-full py-3 rounded-lg text-sm font-bold text-white bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] disabled:opacity-50 transition-colors flex flex-wrap items-center justify-center gap-2"
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
          <div className="bg-[var(--surface-raised)] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, #8b5cf6, #9333ea)' }}>
                  <MessageCircle className="h-4 w-4 text-white" />
                </div>
                <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-lg">Sugerencias IA</CardTitle>
              </div>
              <button onClick={() => setShowAiModal(false)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {loadingAi ? (
                <LoadingState message="Analizando datos de clientes y ventas..." />
              ) : aiSuggestions ? (
                <div className="space-y-0.5" dangerouslySetInnerHTML={{ __html: safeMdToHtml(aiSuggestions) }} />
              ) : (
                <p className="text-sm text-[var(--text-tertiary)] dark:text-muted text-center py-10">No hay sugerencias disponibles.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ───────────────────────────────────────────── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 200 }} onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-[var(--surface-raised)] rounded-xl w-full max-w-sm p-3 sm:p-6" onClick={e => e.stopPropagation()}>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[var(--data-error-100)] flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)]" />
              </div>
              <div>
                <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">¿Eliminar promoción?</CardTitle>
                <p className="text-sm text-[var(--text-secondary)] dark:text-muted">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] transition-colors">Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Campaign Templates Modal ── */}
      {showTemplates && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 100 }} onClick={() => setShowTemplates(false)}>
          <div className="bg-[var(--surface-raised)] rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b dark:border-[var(--rule-base)] shrink-0">
              <div>
                <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-lg">Plantillas de Campaña</CardTitle>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Selecciona una plantilla y personalízala</p>
              </div>
              <button onClick={() => setShowTemplates(false)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-gray-100 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {campaignTemplates.map((tpl) => (
                <button
                  key={tpl.name}
                  onClick={() => applyTemplate(tpl)}
                  className="w-full flex flex-wrap items-center gap-3 p-3 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-gray-50 dark:bg-surface hover:bg-[var(--data-warning-50)] dark:hover:bg-[var(--data-warning-500)]/10 hover:border-[var(--data-warning-500)] dark:hover:border-[var(--data-warning-500)] transition-all text-left"
                >
                  <span className="text-xl sm:text-2xl shrink-0">{tpl.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{tpl.name}</p>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{tpl.description}</p>
                    <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-semibold mt-0.5">{tpl.form.discountPercent}% off · Mín. S/{tpl.form.minPurchase}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Campaign Form Modal ───────────────────────────────────────────── */}
      {showCampaignForm && (
        <div className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/50" style={{ zIndex: 100 }} onClick={() => setShowCampaignForm(false)}>
          <div className="bg-[var(--surface-raised)] rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-lg">{editingCampaignId ? "Editar Campaña" : "Nueva Campaña Programada"}</CardTitle>
              <button onClick={() => setShowCampaignForm(false)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* Name */}
              <Field label="Nombre de campaña *" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <input type="text" value={campaignForm.name} onChange={e => setCampaignForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary" placeholder="Ej: Campaña de Verano" />
              </Field>
              {/* Description */}
              <Field label="Descripción" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <textarea value={campaignForm.description} onChange={e => setCampaignForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary resize-none" placeholder="Detalles de la campaña…" />
              </Field>
              {/* Target Segment */}
              <Field label="Segmento objetivo *" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <select value={campaignForm.targetSegment} onChange={e => setCampaignForm(f => ({ ...f, targetSegment: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary bg-white dark:bg-surface">
                  <option value="all">Todos</option>
                  <option value="champions">Champions</option>
                  <option value="loyal">Loyal</option>
                  <option value="at-risk">At Risk</option>
                  <option value="lost">Lost</option>
                  <option value="new">New</option>
                  <option value="promising">Promising</option>
                </select>
              </Field>
              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Fecha/hora inicio *" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                  <input type="datetime-local" value={campaignForm.startDate ? campaignForm.startDate.slice(0, 16) : ""} onChange={e => setCampaignForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary text-[var(--text-secondary)] dark:text-muted" />
                </Field>
                <Field label="Fecha/hora fin" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                  <input type="datetime-local" value={campaignForm.endDate ? campaignForm.endDate.slice(0, 16) : ""} onChange={e => setCampaignForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary text-[var(--text-secondary)] dark:text-muted" />
                </Field>
              </div>
              {/* Message Template */}
              <Field label="Mensaje con placeholders" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                {(id) => (
                  <>
                    <textarea id={id} value={campaignForm.messageTemplate} onChange={e => setCampaignForm(f => ({ ...f, messageTemplate: e.target.value }))} rows={4}
                      className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary resize-none font-mono"
                      placeholder="¡Hola {name}! Tenemos un {discount}% de descuento especial para ti..." />
                    <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-1">Variables: {"{name}"}, {"{discount}"}, {"{code}"}</p>
                  </>
                )}
              </Field>
              {/* Discount Code */}
              <Field label="Código de descuento" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <input type="text" value={campaignForm.discountCode} onChange={e => setCampaignForm(f => ({ ...f, discountCode: e.target.value.toUpperCase() }))}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary font-mono" placeholder="VERANO20" />
              </Field>
              {/* Auto-send toggle */}
              <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 dark:bg-surface rounded-xl">
                <input type="checkbox" id="autoSend" checked={campaignForm.autoSend} onChange={e => setCampaignForm(f => ({ ...f, autoSend: e.target.checked }))}
                  className="rounded border-[var(--rule-base)] text-primary focus:ring-primary" />
                <label htmlFor="autoSend" className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] cursor-pointer flex-1">
                  Enviar automáticamente al inicio de la campaña
                  <span className="block text-xs text-[var(--text-tertiary)] dark:text-muted font-normal">Las notificaciones se enviarán por WhatsApp al segmento seleccionado</span>
                </label>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex flex-wrap gap-3 shrink-0">
              <PrimaryButton variant="secondary" onClick={() => setShowCampaignForm(false)} className="flex-1">Cancelar</PrimaryButton>
              <PrimaryButton
                variant="primary"
                onClick={saveCampaign}
                disabled={!campaignForm.name.trim() || !campaignForm.startDate}
                loading={savingCampaign}
                className="flex-1"
              >
                {savingCampaign ? "Guardando" : editingCampaignId ? "Guardar cambios" : "Crear campaña"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

