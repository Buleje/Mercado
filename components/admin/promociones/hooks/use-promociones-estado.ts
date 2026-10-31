import { useState } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { TreePine, Flag, Flower2, GraduationCap, Tag, Sun, Heart, Ghost, type LucideIcon } from "@buleje/design-system/icons";
import type { DbPromotion, DbCustomer } from "@/lib/jsondb";
import { useSettingsSafe } from "@/contexts/settings-context";
import { useTenant } from "@/contexts/tenant-context";
import { type PromoForm, type ScheduledCampaign, emptyForm, emptyCampaign } from "@/components/admin/promociones/promociones-compartido";

/** Estado de Promociones: lista, ventanas, campañas y plantillas de temporada. Parte de `usePromociones`. */
export function usePromocionesEstado() {
  const { confirm, notice } = useConfirm();
  // Brandon mayo 2026 v7: el admin no monta SettingsProvider (lo monta el
  // storefront). Usamos la variante "safe" + fallback.
  const settings = useSettingsSafe();
  const { branding } = useTenant();
  const businessName = settings?.businessName;
  const storeTheme = settings?.storeTheme;
  const storeName = (storeTheme as { storeName?: string } | null)?.storeName?.trim()
    || businessName?.trim()
    // Sin el nombre del tenant, {TIENDA} salía «Tu Tienda» en el WhatsApp de todos los negocios.
    || branding.name?.trim()
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
  const [aiError, setAiError] = useState(false);
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

  // Brandon: iconos del DS, no emoji (se ven distinto por SO/navegador). El
  // emoji SÍ se conserva dentro de `form.message` — eso es el mensaje de
  // WhatsApp que recibe el cliente, contenido, no cromo de nuestra UI.
  const campaignTemplates: { name: string; icon: LucideIcon; description: string; form: PromoForm }[] = [
    { name: "Navidad & Año Nuevo", icon: TreePine, description: "Descuento navideño para fiestas de fin de año",
      form: { name: "Fiestas de Fin de Año", description: "¡Celebra con precios especiales! Descuento en toda tu compra navideña.", discountPercent: 15, minPurchase: "50", imageUrl: "", message: "🎄 {TIENDA} te desea ¡Felices Fiestas! 🎉\nLleva un *15% de descuento* en compras mayores a S/50.\n¡Haz tu pedido ahora!", targetType: "all", expiresAt: "" }},
    { name: "Fiestas Patrias", icon: Flag, description: "Celebración patria con ofertas en canasta de productos peruanos",
      form: { name: "Fiestas Patrias", description: "¡Viva el Perú! Descuentos especiales en tu canasta patriota.", discountPercent: 12, minPurchase: "40", imageUrl: "", message: "🇵🇪 ¡Felices Fiestas Patrias! 🎉\n{TIENDA} tiene *12% de descuento* en compras mayores a S/40.\n¡Arma tu canasta patriota!", targetType: "all", expiresAt: "" }},
    { name: "Día de la Madre", icon: Flower2, description: "Sorprende a mamá con la mejor canasta de productos",
      form: { name: "Día de la Madre", description: "Un detalle especial para mamá con descuento exclusivo.", discountPercent: 10, minPurchase: "30", imageUrl: "", message: "💖 ¡Feliz Día de la Madre! 🌸\n*10% de descuento* en compras mayores a S/30.\n¡Sorpréndela con la mejor canasta de {TIENDA}!", targetType: "all", expiresAt: "" }},
    { name: "Vuelta a Clases", icon: GraduationCap, description: "Ofertas en lonchera saludable y snacks para el colegio",
      form: { name: "Vuelta a Clases", description: "Lonchera saludable con descuento. ¡La mejor nutrición para tus hijos!", discountPercent: 8, minPurchase: "25", imageUrl: "", message: "🎒 *Vuelta a Clases* con {TIENDA} 📚\n*8% de descuento* en tu compra de lonchera mayor a S/25.\n¡Nutrición y ahorro!", targetType: "all", expiresAt: "" }},
    { name: "Black Friday / Cyber", icon: Tag, description: "Super descuento por tiempo limitado",
      form: { name: "Black Friday", description: "¡El descuento más grande del año! Solo por tiempo limitado.", discountPercent: 20, minPurchase: "60", imageUrl: "", message: "🖤 *BLACK FRIDAY* en {TIENDA} 🔥\n¡*20% de descuento* en compras mayores a S/60!\n⏰ Solo por tiempo limitado. ¡No te lo pierdas!", targetType: "all", expiresAt: "" }},
    { name: "Verano", icon: Sun, description: "Refrescos, frutas y ofertas de temporada calurosa",
      form: { name: "Ofertas de Verano", description: "¡Combate el calor! Descuentos en refrescos, frutas y más.", discountPercent: 10, minPurchase: "30", imageUrl: "", message: "🌞 *¡Ofertas de Verano!* 🍉\n*10% de descuento* en compras mayores a S/30.\n¡Refréscate con {TIENDA}!", targetType: "all", expiresAt: "" }},
    { name: "San Valentín", icon: Heart, description: "Ofertas para parejas y celebraciones románticas",
      form: { name: "San Valentín", description: "¡Celebra el amor! Descuento especial para este día.", discountPercent: 10, minPurchase: "35", imageUrl: "", message: "❤️ *¡Feliz San Valentín!* 🌹\n*10% de descuento* en compras mayores a S/35.\n¡Sorprende a esa persona especial con {TIENDA}!", targetType: "all", expiresAt: "" }},
    { name: "Halloween", icon: Ghost, description: "Dulces, snacks y decoración con descuento",
      form: { name: "Halloween", description: "¡Truco o trato! Descuento en dulces y snacks para la noche de brujas.", discountPercent: 8, minPurchase: "20", imageUrl: "", message: "🎃 *¡Halloween en {TIENDA}!* 👻\n*8% de descuento* en compras mayores a S/20.\n¡Prepárate para la noche más divertida!", targetType: "all", expiresAt: "" }},
  ];

  const applyTemplate = (tpl: typeof campaignTemplates[0]) => {
    setForm(tpl.form);
    setEditingId(null);
    setSelectedPhones(new Set());
    setShowTemplates(false);
    setShowForm(true);
  };
  return {
    confirm, notice, settings, businessName, storeTheme, storeName, promos, setPromos, customers,
    setCustomers, loading, setLoading, showForm, setShowForm, editingId, setEditingId, form, setForm,
    saving, setSaving, selectedPhones, setSelectedPhones, customerSearch, setCustomerSearch,
    showAiModal, setShowAiModal, aiSuggestions, setAiSuggestions, aiError, setAiError, loadingAi,
    setLoadingAi, aiContext, setAiContext, sendPromo, setSendPromo, sendPhones, setSendPhones,
    sendSearch, setSendSearch, confirmDeleteId, setConfirmDeleteId, detailPromo, setDetailPromo,
    showTemplates, setShowTemplates, campaigns, setCampaigns, showCampaignForm, setShowCampaignForm,
    editingCampaignId, setEditingCampaignId, campaignForm, setCampaignForm, savingCampaign,
    setSavingCampaign, sendingCampaignId, setSendingCampaignId, campaignFeedback, setCampaignFeedback,
    campaignTemplates, applyTemplate,
  };
}
