import { useState, useEffect, useCallback, useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useUndoToast } from "@/components/admin/shared/UndoToast";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatDateNumeric } from "@/lib/format";
import { useSettingsSafe } from "@/contexts/settings-context";
import { useTenant } from "@/contexts/tenant-context";
import { type Coupon, type AutoRule, type GeneratedCouponLog, getActiveStoreId } from "@/components/admin/cupones/cupones-compartido";

/** Estado y acciones de Cupones: lista, reglas automáticas, plantilla y WhatsApp. Parte de `useCupones`. */
export function useCuponesEstado() {
  const { confirm } = useConfirm();
  const { showUndo } = useUndoToast();
  // El admin no monta SettingsProvider (lo monta la tienda): el nombre sale del tenant, como en Promociones.
  const settings = useSettingsSafe();
  const { branding } = useTenant();
  const storeName = (settings?.storeTheme as { storeName?: string } | null)?.storeName?.trim()
    || settings?.businessName?.trim()
    || branding.name?.trim()
    || "nuestra tienda";
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [couponScope, setCouponScope] = useState<"tienda" | "plataforma">("plataforma");
  const [form, setForm] = useState({ code: "", description: "", discountType: "percent" as "percent" | "fixed" | "giftcard", discountValue: 10, balance: 0, minPurchase: 0, maxUses: 0, expiresAt: "" });

  // Auto-rules state
  const [autoRules, setAutoRules] = useState<AutoRule[]>(() => {
    try {
      const stored = localStorage.getItem("coupon-auto-rules");
      if (stored) return JSON.parse(stored);
    } catch {}
    return [
      { id: "birthday", type: "birthday", enabled: false, config: { discountType: "percent", discountValue: 10, validityDays: 7, autoSend: false } },
      { id: "first-purchase", type: "first-purchase", enabled: false, config: { discountType: "percent", discountValue: 15, validityDays: 30, autoSend: false } },
      { id: "inactive", type: "inactive", enabled: false, config: { discountType: "percent", discountValue: 20, inactiveDays: 30, validityDays: 14, autoSend: false } },
      { id: "min-spend", type: "min-spend", enabled: false, config: { discountType: "fixed", discountValue: 10, minSpend: 100, autoSend: false } },
      { id: "referral", type: "referral", enabled: false, config: { discountType: "percent", discountValue: 10, validityDays: 30, autoSend: false } },
    ];
  });
  const [editingRule, setEditingRule] = useState<AutoRule | null>(null);
  const [showRuleConfig, setShowRuleConfig] = useState(false);
  const [generatedLogs, _setGeneratedLogs] = useState<GeneratedCouponLog[]>(() => {
    try {
      const stored = localStorage.getItem("coupon-generated-logs");
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  });
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [templatePattern, setTemplatePattern] = useState("BDAY{MMDD}{RND3}");
  const [whatsappCoupon, setWhatsappCoupon] = useState<Coupon | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const cajaRegla = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRegla, { onCerrar: () => setShowRuleConfig(false), activo: showRuleConfig && !!editingRule });
  const ventanaRegla = useVentanaDeModal(showRuleConfig && !!editingRule, { ref: cajaRegla, asaAutomatica: true, aplicarTranslate: true, claveMemoria: "cupones-regla" });
  const cajaWhatsapp = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaWhatsapp, { onCerrar: () => setWhatsappCoupon(null), activo: !!whatsappCoupon });
  const ventanaWhatsapp = useVentanaDeModal(!!whatsappCoupon, { ref: cajaWhatsapp, asaAutomatica: true, aplicarTranslate: true, claveMemoria: "cupones-whatsapp" });
  const cajaPlantilla = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaPlantilla, { onCerrar: () => setShowTemplateBuilder(false), activo: showTemplateBuilder });
  const ventanaPlantilla = useVentanaDeModal(showTemplateBuilder, { ref: cajaPlantilla, asaAutomatica: true, aplicarTranslate: true, claveMemoria: "cupones-plantilla" });

  const load = useCallback(() => {
    fetch("/api/coupons").then(r => r.ok ? r.json() : []).then(d => setCoupons(Array.isArray(d) ? d : d?.coupons ?? [])).catch((err) => console.warn("[CouponsTab] /api/coupons failed:", err)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Save auto-rules to localStorage
  useEffect(() => {
    if (autoRules.length > 0) {
      localStorage.setItem("coupon-auto-rules", JSON.stringify(autoRules));
    }
  }, [autoRules]);

  // Save logs to localStorage
  useEffect(() => {
    if (generatedLogs.length >= 0) {
      localStorage.setItem("coupon-generated-logs", JSON.stringify(generatedLogs));
    }
  }, [generatedLogs]);

  const handleCreate = async () => {
    if (!form.code.trim() || !form.discountValue) return;
    const storeId = couponScope === "tienda" ? getActiveStoreId() : null;
    try {
      const res = await fetch("/api/coupons", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          ...form,
          minPurchase: form.minPurchase || undefined,
          maxUses: form.maxUses || undefined,
          expiresAt: form.expiresAt || undefined,
          storeId: storeId || undefined,
        }),
      });
      if (res.ok) {
        load();
        setShowForm(false);
        setCouponScope("plataforma");
        setForm({ code: "", description: "", discountType: "percent", discountValue: 10, balance: 0, minPurchase: 0, maxUses: 0, expiresAt: "" });
      } else {
        const errData = await res.json().catch(() => ({}));
        const msg = errData?.error || `No se pudo crear el cupón (HTTP ${res.status})`;
        showUndo({ message: "Error", detail: msg });
      }
    } catch (e) {
      console.error("[CouponsTab] handleCreate error", e);
      showUndo({ message: "Error de conexión", detail: "No se pudo crear el cupón. Reintenta." });
    }
  };

  // Activar o desactivar cambia qué códigos acepta la caja: si el servidor no lo tomó, hay que
  // decirlo (antes la lista volvía sola a su lugar sin aviso).
  const toggleActive = async (c: Coupon) => {
    try {
      const res = await fetch(`/api/coupons/${c.id}`, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ active: !c.active }) });
      if (!res.ok) toast.error(`No se pudo ${c.active ? "desactivar" : "activar"} el cupón (error ${res.status})`);
    } catch (err) {
      console.warn("[CouponsTab] activar/desactivar cupón falló", err);
      toast.error("Sin conexión: el cupón no cambió.");
    }
    load();
  };

  const handleDelete = async (id: string) => {
    const c = coupons.find((x) => x.id === id);
    const code = c?.code ?? "cupón";
    const ok = await confirm({
      title: "¿Eliminar cupón?",
      description: `El cupón "${code}" dejará de estar disponible para nuevas compras.`,
      intent: "danger",
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    // Antes avisaba «eliminado» aunque el servidor lo rechazara.
    try {
      const res = await fetch(`/api/coupons/${id}`, { method: "DELETE", headers: csrfHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(typeof body?.error === "string" ? body.error : `No se pudo eliminar el cupón (error ${res.status})`);
      } else {
        showUndo({ message: `Cupón "${code}" eliminado`, duration: 5000 });
      }
    } catch (err) {
      console.warn("[CouponsTab] eliminar cupón falló", err);
      toast.error("Sin conexión: el cupón NO se eliminó.");
    }
    load();
  };

  // Auto-rules management
  const toggleRule = (id: string) => {
    setAutoRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const openRuleConfig = (rule: AutoRule) => {
    setEditingRule(rule);
    setShowRuleConfig(true);
  };

  const saveRuleConfig = () => {
    if (!editingRule) return;
    setAutoRules(prev => prev.map(r => r.id === editingRule.id ? editingRule : r));
    setShowRuleConfig(false);
    setEditingRule(null);
  };

  const generateTestCoupon = () => {
    const rnd = Math.random().toString(36).substring(2, 5).toUpperCase();
    const mmdd = new Date().toISOString().slice(5, 10).replace("-", "");
    const code = templatePattern.replace("{MMDD}", mmdd).replace("{RND3}", rnd);
    toast.success(`Código generado: ${code}`);
    return code;
  };

  const buildWhatsappMsg = (c: Coupon) => {
    const descuento = c.discountType === "percent" ? `${c.discountValue}%` : c.discountType === "giftcard" ? `Gift Card S/${c.discountValue}` : `S/${c.discountValue}`;
    const expira = c.expiresAt ? `\nVálido hasta: ${formatDateNumeric(c.expiresAt)}` : "";
    // El mensaje lleva el nombre de TU tienda (antes decía «Buleje» en todos los negocios).
    return `¡Cupón especial de ${storeName}!\nUsa el código: ${c.code}\nDescuento: ${descuento}${expira}\n¡No te lo pierdas!`;
  };

  const sendWhatsapp = (phone: string, msg: string) => {
    const cleanPhone = phone.replace(/\D/g, "");
    const fullPhone = cleanPhone.startsWith("51") ? cleanPhone : `51${cleanPhone}`;
    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const copyWhatsappMsg = (c: Coupon) => {
    navigator.clipboard.writeText(buildWhatsappMsg(c))
      .then(() => toast.success("Mensaje copiado"))
      .catch((err) => console.warn("[CouponsTab] copiar mensaje falló", err));
  };
  return {
    confirm, showUndo, coupons, setCoupons, loading, setLoading, showForm, setShowForm, couponScope,
    setCouponScope, form, setForm, autoRules, setAutoRules, editingRule, setEditingRule,
    showRuleConfig, setShowRuleConfig, generatedLogs, _setGeneratedLogs, showTemplateBuilder,
    setShowTemplateBuilder, templatePattern, setTemplatePattern, whatsappCoupon, setWhatsappCoupon,
    whatsappPhone, setWhatsappPhone, cajaRegla, ventanaRegla, cajaWhatsapp, ventanaWhatsapp,
    cajaPlantilla, ventanaPlantilla, load, handleCreate, toggleActive, handleDelete, toggleRule,
    openRuleConfig, saveRuleConfig, generateTestCoupon, buildWhatsappMsg, sendWhatsapp,
    copyWhatsappMsg,
  };
}
