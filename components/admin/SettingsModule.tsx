"use client";
/**
 * Configuración (`?tab=config&vista=<sección>`).
 *
 * Auditoría 2026-10-04: eran 20 tarjetas con 91 campos; 36 se guardaban sin
 * que nada del sistema los leyera (series y redondeo de comprobantes, todo
 * Inventario, SMTP, Google Analytics, retención de logs, horarios y
 * repartidores de delivery…), «Restaurar respaldo» siempre fallaba, «Cambiar
 * contraseña» comparaba contra «••••••» y los «Feature Flags» pintaban el
 * envoltorio de la respuesta y guardaban contra un PATCH que no existe. Quedan 8 secciones en un menú
 * agrupado; las columnas siguen en la base (no se borró ningún dato).
 * Las secciones y su buscador: `settings/secciones.ts`.
 */
import { useState, useEffect, useRef, useCallback, useId, useMemo } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { m, AnimatePresence } from "@/components/admin/providers";
import { cn } from "@/lib/utils";
import type { StoreMode } from "@/lib/jsondb";
import { csrfHeaders } from "@/lib/csrf-client";
import { useTenant } from "@/contexts/tenant-context";
import { KeepAliveSwitch } from "@/components/shared/KeepAliveSwitch";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  Store, Phone, MapPin, Clock, AlignLeft, Upload, X, Search, ShoppingCart,
  MessageCircle, AlertTriangle, Download, CheckCircle, Truck, DollarSign, FileText, Zap,
  Landmark, Hash, Percent, Timer, Layers, Mail, Key, ChevronRight,
  Plus, Trash2, Activity, SlidersHorizontal, Palmtree, Eye, EyeOff,
} from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { CardTitle } from "@buleje/design-system";
import { FieldLabel, TextInput, NumberInput, SelectInput, Toggle, SectionCard, SaveButton, Plegable } from "@/components/admin/settings/campos";
import { ImageDropCard, MockHeader, MockStoreCard, MockStorefront } from "@/components/admin/settings/ImageDropCard";
import { TABS, IDS_AJUSTES, filtrarSecciones, type SeccionAjustes } from "@/components/admin/settings/secciones";
import { MenuSeccionesMovil, MenuSeccionesEscritorio, CabeceraSeccion, type FaltaItem } from "@/components/admin/settings/navegacion";
import { useLocalStorage } from "@/hooks/use-local-storage";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });
const StorefrontEditor = dynamic(() => import("@/components/admin/StorefrontEditor"), { ssr: false });
// Componentes que antes vivían sueltos en TabRouter — ahora forman parte
// de la grilla de secciones del SettingsModule (selección + detalle).
const TeamTab = dynamic(() => import("@/components/admin/TeamTab"));
const LoginDevicesCard = dynamic(() => import("@/components/admin/security/LoginDevicesCard"), { ssr: false });
const NavDefaultTabsConfig = dynamic(
  () => import("@/components/admin/NavDefaultTabsConfig").then((m) => ({ default: m.NavDefaultTabsConfig })),
);
const SidebarReorderPanel = dynamic(() => import("@/components/admin/SidebarReorderPanel"));
const PlanTierSelector = dynamic(
  () => import("@/components/admin/PlanTierSelector"),
  { ssr: false },
);

// ── Types ──────────────────────────────────────────────────────────────────────
type DeliveryZone = { name: string; fee: number; estimatedMin: number };
type SocialLinks = { facebook?: string; instagram?: string; tiktok?: string };

type SettingsData = Record<string, unknown>;

// Categoría visible para el panel "Reordenar barra lateral".
// Compat con CategoryItem de components/admin/SidebarReorderPanel.tsx.
type ReorderCategory = { id: string; label: string };

// Secciones que se llenan con /api/settings (Plan, Equipo, Mi panel y Sistema traen lo suyo).
const SECCIONES_CON_DATOS: ReadonlySet<SeccionAjustes> = new Set(["negocio", "cobros", "delivery", "tienda"]);

// Botón que lleva a otra pantalla del panel donde vive el ajuste de verdad.
const LINK_A_OTRA_PANTALLA = "w-full flex items-center gap-3 p-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-left hover:border-primary transition-colors";

// ── Main Component ────────────────────────────────────────────────────────────

interface SettingsModuleProps {
  storeMode: StoreMode;
  onModeChange: (m: StoreMode) => void;
  /** Categorías visibles para el panel "Reordenar barra lateral" (opcional). */
  reorderCategories?: ReorderCategory[];
  /** Callback al guardar el nuevo orden del sidebar. */
  onSaveSidebarOrder?: (categoryIds: string[]) => void;
  /** Callback al click "Repetir tutorial" — reset del onboarding tour. */
  onResetTutorial?: () => void;
  /** Callback para navegar a otro tab (ej. al iniciar tutorial). */
  onNavigateTab?: (tab: string) => void;
}

export default function SettingsModule({
  storeMode,
  onModeChange,
  reorderCategories,
  onSaveSidebarOrder,
  onResetTutorial,
  onNavigateTab,
}: SettingsModuleProps) {
  const [loading, setLoading] = useState(true);
  // El nombre del tenant (no «Mi Bodega», que es el rótulo genérico del vertical).
  const { branding } = useTenant();
  // Si /api/settings no respondió, el formulario tiene valores vacíos: guardar
  // pisaría lo real con vacío. Las secciones que dependen de él se bloquean.
  const [cargaFallida, setCargaFallida] = useState(false);
  const { vista: activeSection, irA: irAVista } = useVistaModulo<SeccionAjustes>("config", IDS_AJUSTES, "negocio");
  const [saving, setSaving] = useState(false);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // Las maquetas de «dónde aparece» de logo, portada y banner: un botón para las tres, recordado.
  const [verMaquetas, setVerMaquetas] = useLocalStorage<boolean>("ajustes-ver-maquetas", false);
  const encontradas = useMemo(() => filtrarSecciones(searchQuery), [searchQuery]);
  const irASeccion = useCallback((id: SeccionAjustes) => { irAVista(id); setSearchQuery(""); }, [irAVista]);
  const tituloSeccionId = useId();

  // ── Settings state (sólo lo que algo del sistema lee) ───────────────────────

  // Store mode
  const [mode, setMode] = useState<StoreMode>(storeMode);

  // Business info
  const [businessName, setBusinessName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const coverImgRef = useRef<HTMLInputElement>(null);
  const bannerImgRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [deliveryZone, setDeliveryZone] = useState("");
  const [businessLat, setBusinessLat] = useState<number | null>(null);
  const [businessLon, setBusinessLon] = useState<number | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [pickerLat, setPickerLat] = useState(-8.38001);
  const [pickerLon, setPickerLon] = useState(-74.53551);
  const [razonSocial, setRazonSocial] = useState("");
  const [ruc, setRuc] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [currency, setCurrency] = useState("PEN");
  const [businessType, setBusinessType] = useState("bodega");
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({});

  // Payment
  const [yapeEnabled, setYapeEnabled] = useState(true);
  const [yapeImage, setYapeImage] = useState("");
  const [yapeName, setYapeName] = useState("");
  const [yapePhone, setYapePhone] = useState("");
  const [cashEnabled, setCashEnabled] = useState(true);
  const [plinEnabled, setPlinEnabled] = useState(false);
  const [plinImage, setPlinImage] = useState("");
  const [plinName, setPlinName] = useState("");
  const [plinPhone, setPlinPhone] = useState("");
  const [transferEnabled, setTransferEnabled] = useState(false);
  const [transferBankName, setTransferBankName] = useState("");
  const [transferAccountNum, setTransferAccountNum] = useState("");
  const [transferAccountHolder, setTransferAccountHolder] = useState("");


  // Tienda: vacaciones y colores
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState("");
  const [bypassLogin, setBypassLogin] = useState(false);
  const [primaryColor, setPrimaryColor] = useState("var(--accent)");
  const [secondaryColor, setSecondaryColor] = useState("#ff6b5b");
  const [slogan, setSlogan] = useState("");

  // Comprobantes y caja
  const [taxRate, setTaxRate] = useState(18);
  const [sunatRuc, setSunatRuc] = useState("");
  const [sunatDenominacion, setSunatDenominacion] = useState("");
  const [cashAlertMax, setCashAlertMax] = useState(500);
  const [autoCloseTime, setAutoCloseTime] = useState("");

  // Delivery
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [freeDeliveryMin, setFreeDeliveryMin] = useState(0);

  // Respaldo
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);

  const mapPickerPanelRef = useRef<HTMLDivElement>(null);
  const mapPickerTitleId = useId();
  const cerrarMapPicker = useCallback(() => setShowMapPicker(false), []);
  useModalAccesible(mapPickerPanelRef, { onCerrar: cerrarMapPicker, activo: showMapPicker });
  /** Ventana: se mueve, se achica y se fija (ADR-420). */
  const ventanaMapPicker = useVentanaDeModal(showMapPicker, {
    ref: mapPickerPanelRef,
    aplicarTranslate: true,
    claveMemoria: "settings-ubicacion-negocio",
  });


  // Custom shortcuts for sidebar
  const [customShortcuts, setCustomShortcuts] = useState<Array<{id: string; label: string; tabId: string}>>(() => {
    try {
      const saved = localStorage.getItem("admin_custom_shortcuts");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const yapeImgRef = useRef<HTMLInputElement>(null);
  const plinImgRef = useRef<HTMLInputElement>(null);
  const logoImgRef = useRef<HTMLInputElement>(null);

  // ── Load settings from API ──────────────────────────────────────────────────

  const cargar = useCallback(() => {
    setLoading(true);
    setCargaFallida(false);
    fetch("/api/settings").then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then((d) => {
      if (d) {
        if (d.mode) setMode(d.mode);
        if (d.businessName) setBusinessName(d.businessName);
        if (d.businessPhone) setBusinessPhone(d.businessPhone);
        if (d.businessAddress) setBusinessAddress(d.businessAddress);
        if (d.logoUrl) setLogoUrl(d.logoUrl);
        if (d.coverUrl) setCoverUrl(d.coverUrl as string);
        if (d.bannerUrl) setBannerUrl(d.bannerUrl as string);
        if (d.description) setDescription(d.description);
        if (d.hours) setHours(d.hours);
        if (d.deliveryZone) setDeliveryZone(d.deliveryZone);
        if (d.businessLat) { setBusinessLat(d.businessLat); setPickerLat(d.businessLat); }
        if (d.businessLon) { setBusinessLon(d.businessLon); setPickerLon(d.businessLon); }
        if (d.razonSocial) setRazonSocial(d.razonSocial);
        if (d.ruc) setRuc(d.ruc);
        if (d.businessEmail) setBusinessEmail(d.businessEmail);
        if (d.currency) setCurrency(d.currency);
        if (d.businessType) setBusinessType(d.businessType);
        if (d.socialLinks) setSocialLinks(d.socialLinks);
        if (d.yapeEnabled !== undefined) setYapeEnabled(d.yapeEnabled);
        if (d.yapeImage) setYapeImage(d.yapeImage);
        if (d.yapeName) setYapeName(d.yapeName);
        if (d.yapePhone) setYapePhone(d.yapePhone);
        if (d.cashEnabled !== undefined) setCashEnabled(d.cashEnabled);
        if (d.plinEnabled !== undefined) setPlinEnabled(d.plinEnabled);
        if (d.plinImage) setPlinImage(d.plinImage);
        if (d.plinName) setPlinName(d.plinName);
        if (d.plinPhone) setPlinPhone(d.plinPhone);
        if (d.transferEnabled !== undefined) setTransferEnabled(d.transferEnabled);
        if (d.transferBankName) setTransferBankName(d.transferBankName);
        if (d.transferAccountNum) setTransferAccountNum(d.transferAccountNum);
        if (d.transferAccountHolder) setTransferAccountHolder(d.transferAccountHolder);
        if (d.maintenanceMode !== undefined) setMaintenanceMode(d.maintenanceMode);
        if (d.maintenanceMessage) setMaintenanceMsg(d.maintenanceMessage);
        if (d.adminBypassLogin !== undefined) setBypassLogin(d.adminBypassLogin);
        if (d.primaryColor) setPrimaryColor(d.primaryColor);
        if (d.secondaryColor) setSecondaryColor(d.secondaryColor);
        if (d.slogan) setSlogan(d.slogan);
        if (d.taxRate !== undefined) setTaxRate(d.taxRate);
        if (d.sunatRuc) setSunatRuc(d.sunatRuc);
        if (d.sunatDenominacion) setSunatDenominacion(d.sunatDenominacion);
        if (d.cashAlertMax !== undefined) setCashAlertMax(d.cashAlertMax);
        if (d.autoCloseTime) setAutoCloseTime(d.autoCloseTime);
        if (d.deliveryZones) setDeliveryZones(d.deliveryZones);
        if (d.freeDeliveryMin !== undefined) setFreeDeliveryMin(d.freeDeliveryMin);
        if (d.lastBackupAt) setLastBackupAt(d.lastBackupAt);
      }
      setLoading(false);
    }).catch((err) => {
      console.warn("[SettingsModule] no se pudo cargar /api/settings", err);
      setCargaFallida(true);
      setLoading(false);
    });
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // «Te falta»: sólo datos que algo del sistema lee (boletas, marketplace,
  // mapa y tienda). El «% completo» de antes contaba campos que nadie leía.
  const faltan = useMemo(() => [
    { id: "settings-businessName", label: "Nombre comercial", vacio: !businessName.trim() },
    { id: "settings-razonSocial", label: "Razón social", vacio: !razonSocial.trim() },
    { id: "settings-ruc", label: "RUC", vacio: !ruc.trim() },
    { id: "settings-businessPhone", label: "WhatsApp", vacio: !businessPhone.trim() },
    { id: "settings-businessEmail", label: "Correo", vacio: !businessEmail.trim() },
    { id: "settings-businessAddress", label: "Dirección", vacio: !businessAddress.trim() },
    { id: "settings-businessAddress", label: "Ubicación en el mapa", vacio: businessLat == null },
    { id: "settings-logo", label: "Logo", vacio: !logoUrl },
  ].filter(f => f.vacio), [businessName, razonSocial, ruc, businessPhone, businessEmail, businessAddress, businessLat, logoUrl]);

  // Cobros: lo que lee el pago de la tienda (número y QR) y la boleta
  // electrónica (RUC y denominación del emisor). Plin y transferencia sólo si
  // están prendidos; Yape apagado se ofrece prender (es el que más se usa).
  const faltanCobros = useMemo(() => {
    const f: FaltaItem[] = [];
    if (!yapeEnabled) f.push({ id: "settings-yapePhone", label: "Activar Yape", antes: () => setYapeEnabled(true) });
    else {
      if (!yapePhone.trim()) f.push({ id: "settings-yapePhone", label: "Número de Yape" });
      if (!yapeImage) f.push({ id: "settings-yape-qr", label: "QR de Yape" });
    }
    if (plinEnabled && !plinPhone.trim()) f.push({ id: "settings-plinPhone", label: "Número de Plin" });
    if (transferEnabled && !transferAccountNum.trim()) f.push({ id: "settings-transferAccountNum", label: "N° de cuenta" });
    if (!sunatRuc.trim()) f.push({ id: "settings-sunatRuc", label: "RUC del emisor" });
    if (!sunatDenominacion.trim()) f.push({ id: "settings-sunatDenominacion", label: "Denominación" });
    return f;
  }, [yapeEnabled, yapePhone, yapeImage, plinEnabled, plinPhone, transferEnabled, transferAccountNum, sunatRuc, sunatDenominacion]);

  // Delivery: el marketplace lee las zonas (tarifa y minutos) para mostrar el envío.
  const faltanDelivery = useMemo((): FaltaItem[] => {
    if (deliveryZones.length === 0) return [{
      id: "settings-zona-0", label: "Al menos una zona",
      antes: () => setDeliveryZones([{ name: "", fee: 0, estimatedMin: 30 }]),
    }];
    const sinNombre = deliveryZones.findIndex(z => !z.name.trim());
    return sinNombre >= 0 ? [{ id: `settings-zona-${sinNombre}`, label: "Nombre de la zona" }] : [];
  }, [deliveryZones]);

  // Tienda web: la tienda muestra el slogan bajo el nombre.
  const faltanTienda = useMemo((): FaltaItem[] => slogan.trim() ? [] : [{ id: "settings-slogan", label: "Slogan" }], [slogan]);

  const pendientes: Partial<Record<SeccionAjustes, number>> = {
    negocio: faltan.length, cobros: faltanCobros.length, delivery: faltanDelivery.length, tienda: faltanTienda.length,
  };

  const irACampo = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) el.focus({ preventScroll: true });
  };

  // «Te falta» vive en la cabecera de la sección (un botón con menú, no una fila de chips).
  const irAFalta = (f: FaltaItem) => {
    if (f.antes) { f.antes(); setTimeout(() => irACampo(f.id), 60); }
    else irACampo(f.id);
  };
  const faltanPorSeccion: Partial<Record<SeccionAjustes, readonly FaltaItem[]>> = {
    negocio: faltan, cobros: faltanCobros, delivery: faltanDelivery, tienda: faltanTienda,
  };

  // ── Save helper ─────────────────────────────────────────────────────────────

  const patch = useCallback(async (data: SettingsData): Promise<boolean> => {
    if (cargaFallida) {
      toast.error("No se guardó", { description: "La configuración no cargó: reintenta antes de guardar." });
      return false;
    }
    setSaving(true);
    const t = toast.loading("Guardando cambios…");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      toast.success("Cambios guardados", { id: t, description: "La configuración se actualizó correctamente." });
      setSavedSection(activeSection);
      setTimeout(() => setSavedSection(null), 2000);
      return true;
    } catch (err) {
      toast.error("No se pudo guardar", {
        id: t,
        description: err instanceof Error ? err.message : "Error desconocido. Prueba de nuevo.",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [activeSection, cargaFallida]);

  // Estados de upload por campo (logo, banner, yape, plin) — para mostrar
  // spinner mientras la imagen se sube a Supabase Storage.
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  /**
   * Sube el archivo a /api/upload (Supabase Storage), recibe la URL pública,
   * y la asigna al campo correspondiente. Antes esto usaba FileReader y
   * guardaba la imagen como base64 dentro del JSON de settings — eso hacía
   * que el guardado fallara silenciosamente con archivos > 1MB y nunca
   * mostraba la imagen real al resto del sistema.
   */
  const handleFileUpload = (setter: (v: string) => void, fieldId: string, folder = "settings") =>
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = ""; // reset para que volver a elegir el mismo archivo dispare onChange
      setUploadingField(fieldId);
      const t = toast.loading(`Subiendo ${fieldId}…`);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", folder);
        // CSRF: el endpoint valida double-submit cookie via header.
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: csrfHeaders(),
          body: fd,
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(errBody.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json() as { url: string };
        setter(data.url);
        toast.success(`${fieldId.charAt(0).toUpperCase() + fieldId.slice(1)} subido`, {
          id: t,
          description: "Click \"Guardar cambios\" para confirmar.",
        });
      } catch (err) {
        toast.error("No se pudo subir la imagen", {
          id: t,
          description: err instanceof Error ? err.message : "Prueba con un archivo más chico o en otro formato.",
        });
      } finally {
        setUploadingField(null);
      }
    };

  // ── Render loading state ────────────────────────────────────────────────────

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-6">
          <div className="flex items-center gap-4"><div className="h-12 w-12 bg-[var(--rule-base)] rounded-xl" /><div className="flex-1 space-y-2"><div className="h-5 bg-[var(--rule-base)] rounded w-1/3" /><div className="h-3 bg-[var(--rule-base)] rounded w-2/3" /></div></div>
        </div>
      ))}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // SECCIONES (8)
  // ══════════════════════════════════════════════════════════════════════════════

  const renderShortcuts = () => {
    const availableTabs = [
      { value: "dashboard", label: "Ventas hoy" },
      { value: "inventario", label: "Inventario" },
      { value: "pos-caja", label: "Caja POS" },
      { value: "pedidos", label: "Pedidos" },
      { value: "productos", label: "Productos" },
      { value: "clientes-crm", label: "Clientes" },
      { value: "compras", label: "Compras" },
      { value: "fiados", label: "Fiados" },
      { value: "reportes", label: "Reportes" },
      { value: "config", label: "Configuración" },
      { value: "chat", label: "Chat" },
      { value: "cotizaciones", label: "Cotizaciones" },
    ];

    const addShortcut = () => {
      if (customShortcuts.length >= 6) return;
      const newId = `shortcut-${Date.now()}`;
      const updated = [...customShortcuts, { id: newId, label: "Nuevo acceso", tabId: "dashboard" }];
      setCustomShortcuts(updated);
      localStorage.setItem("admin_custom_shortcuts", JSON.stringify(updated));
    };

    const removeShortcut = (id: string) => {
      const updated = customShortcuts.filter(s => s.id !== id);
      setCustomShortcuts(updated);
      localStorage.setItem("admin_custom_shortcuts", JSON.stringify(updated));
    };

    const updateShortcut = (id: string, field: "label" | "tabId", value: string) => {
      const updated = customShortcuts.map(s => s.id === id ? { ...s, [field]: value } : s);
      setCustomShortcuts(updated);
      localStorage.setItem("admin_custom_shortcuts", JSON.stringify(updated));
    };

    return (
      <div className="space-y-4">
          {customShortcuts.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)] dark:text-muted text-center py-4">No tienes accesos directos aún. Agrega uno para navegar más rápido.</p>
          )}
          <div className="space-y-3">
            {customShortcuts.map(sc => (
              <div key={sc.id} className="flex items-center gap-3 p-3 bg-[var(--surface-sunken)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                <Zap className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" />
                <input
                  aria-label="Nombre del acceso"
                  value={sc.label}
                  onChange={e => updateShortcut(sc.id, "label", e.target.value)}
                  className="flex-1 px-2 py-1.5 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)]"
                  placeholder="Nombre del acceso"
                />
                <select
                  aria-label="Pantalla a la que apunta el acceso"
                  value={sc.tabId}
                  onChange={e => updateShortcut(sc.id, "tabId", e.target.value)}
                  className="px-2 py-1.5 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)]"
                >
                  {availableTabs.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button aria-label="Eliminar" onClick={() => removeShortcut(sc.id)} className="p-1.5 rounded-xl text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-500)] transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {customShortcuts.length < 6 && (
            <button onClick={addShortcut} className="w-full flex items-center justify-center gap-2 px-4 min-h-11 rounded-xl border border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:text-primary hover:border-primary transition-colors mt-2">
              <Plus className="h-4 w-4" /> Agregar acceso directo
            </button>
          )}
      </div>
    );
  };

  const renderNegocio = () => (
    <div className="space-y-6">
      {/* Business identity — el modo de tienda es un campo más (antes, una tarjeta para 2 botones) */}
      <SectionCard title="Identidad del negocio" desc="Datos legales y de contacto, y cómo te piden tus clientes: por WhatsApp o con checkout en la tienda.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div><FieldLabel icon={<Store className="h-3.5 w-3.5" />} htmlFor="settings-businessName">Nombre comercial</FieldLabel><TextInput id="settings-businessName" value={businessName} onChange={setBusinessName} />
            {!businessName.trim() && branding.name && (
              <button type="button" onClick={() => setBusinessName(branding.name ?? "")} className="mt-1.5 text-xs font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:underline">
                Usar «{branding.name}»
              </button>
            )}
          </div>
          <div><FieldLabel icon={<FileText className="h-3.5 w-3.5" />} htmlFor="settings-razonSocial">Razón social</FieldLabel><TextInput id="settings-razonSocial" value={razonSocial} onChange={setRazonSocial} placeholder="Inversiones San Martín S.A.C." /></div>
          <div><FieldLabel icon={<Hash className="h-3.5 w-3.5" />} htmlFor="settings-ruc">RUC</FieldLabel><TextInput id="settings-ruc" value={ruc} onChange={setRuc} placeholder="20123456789" mono /></div>
          <div><FieldLabel icon={<Phone className="h-3.5 w-3.5" />} htmlFor="settings-businessPhone">WhatsApp</FieldLabel><TextInput id="settings-businessPhone" value={businessPhone} onChange={setBusinessPhone} placeholder="51987654321" mono /></div>
          <div><FieldLabel icon={<Mail className="h-3.5 w-3.5" />} htmlFor="settings-businessEmail">Correo del negocio</FieldLabel><TextInput id="settings-businessEmail" value={businessEmail} onChange={setBusinessEmail} placeholder="ventas@bodega.pe" type="email" /></div>
          <div>
            <FieldLabel htmlFor="settings-businessType" icon={<Store className="h-3.5 w-3.5" />}>Tipo de negocio</FieldLabel>
            <SelectInput id="settings-businessType" value={businessType} onChange={setBusinessType} options={[
              { value: "bodega", label: "Bodega" }, { value: "minimarket", label: "Minimarket" },
              { value: "tienda", label: "Tienda" }, { value: "restaurante", label: "Restaurante" },
            ]} />
          </div>
          <div>
            <FieldLabel htmlFor="settings-currency" icon={<DollarSign className="h-3.5 w-3.5" />}>Moneda</FieldLabel>
            <SelectInput id="settings-currency" value={currency} onChange={setCurrency} options={[
              { value: "PEN", label: "S/ — Sol peruano" }, { value: "USD", label: "$ — Dólar" },
            ]} />
          </div>
          <div role="group" aria-labelledby="settings-mode-label" className="sm:col-span-2">
            <span id="settings-mode-label" className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted mb-1.5">
              <ShoppingCart className="h-3.5 w-3.5" />Cómo te piden tus clientes
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(["whatsapp", "checkout"] as const).map(m => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={cn(
                  "flex items-center justify-center gap-1.5 h-11 px-2 rounded-xl border-2 transition-all",
                  mode === m ? (m === "whatsapp" ? "border-[var(--data-success-500)]/30 bg-primary/10 dark:bg-primary/15" : "border-primary bg-primary/5") : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-[var(--text-tertiary)]"
                )}>
                  {m === "whatsapp" ? <MessageCircle className={cn("h-4 w-4 shrink-0", mode === m ? "text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]")} /> : <ShoppingCart className={cn("h-4 w-4 shrink-0", mode === m ? "text-primary" : "text-[var(--text-tertiary)]")} />}
                  <span className={cn("font-bold text-sm truncate", mode === m ? (m === "whatsapp" ? "text-[var(--data-success-500)]" : "text-primary") : "text-[var(--text-tertiary)]")}>{m === "whatsapp" ? "WhatsApp" : "Checkout"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Location */}
      <SectionCard title="Ubicación" desc="Dirección y zona de entrega">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="settings-businessAddress" icon={<MapPin className="h-3.5 w-3.5" />}>Dirección</FieldLabel>
            <div className="flex gap-2">
              <div className="flex-1"><TextInput id="settings-businessAddress" value={businessAddress} onChange={setBusinessAddress} /></div>
              <button aria-label="Ver ubicación" onClick={() => setShowMapPicker(true)} className="px-3 py-2 rounded-xl text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 hover:bg-primary/10 border border-[var(--data-success-500)]/30 transition-colors shrink-0">
                <MapPin className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  if (!navigator.geolocation) return;
                  navigator.geolocation.getCurrentPosition(
                    pos => {
                      setPickerLat(pos.coords.latitude);
                      setPickerLon(pos.coords.longitude);
                      setBusinessLat(pos.coords.latitude);
                      setBusinessLon(pos.coords.longitude);
                    },
                    () => {},
                    { enableHighAccuracy: true }
                  );
                }}
                className="px-3 py-2 rounded-xl text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 hover:bg-primary/10 border border-[var(--data-success-500)]/30 transition-colors shrink-0 flex items-center gap-1.5"
              >
                <MapPin className="h-4 w-4" /> Mi ubicación
              </button>
            </div>
            {businessLat && businessLon && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-mono mt-1">GPS: {businessLat.toFixed(5)}, {businessLon.toFixed(5)}</p>}
          </div>
          <div><FieldLabel icon={<Truck className="h-3.5 w-3.5" />}>Zona de delivery</FieldLabel><TextInput value={deliveryZone} onChange={setDeliveryZone} /></div>
          <div><FieldLabel icon={<Clock className="h-3.5 w-3.5" />}>Horario</FieldLabel><TextInput value={hours} onChange={setHours} placeholder="Lun - Sáb: 7am - 9pm" /></div>
        </div>
        <div><FieldLabel htmlFor="settings-description" icon={<AlignLeft className="h-3.5 w-3.5" />}>Descripción</FieldLabel>
          <textarea id="settings-description" value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2.5 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
        </div>
      </SectionCard>

      {/* ─── Identidad visual: 3 imágenes (Logo + Portada + Banner) ─── */}
      <SectionCard
        title="Identidad visual"
        desc="Sube 3 imágenes que definen cómo se ve tu negocio en el marketplace y en tu panel"
        accion={
          <button
            type="button"
            onClick={() => setVerMaquetas(v => !v)}
            aria-expanded={verMaquetas}
            className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-xs font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            {verMaquetas ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {verMaquetas ? "Ocultar dónde aparecen" : "Ver dónde aparecen"}
          </button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div id="settings-logo">
          <ImageDropCard
            label="Logo"
            hint="Cuadrado · 200×200"
            whereVisible="Header del panel + ícono pequeño en la card"
            value={logoUrl}
            previewClass="aspect-square"
            inputRef={logoImgRef}
            onChange={setLogoUrl}
            uploading={uploadingField === "logo"}
            onUpload={handleFileUpload(setLogoUrl, "logo", "branding")}
            mockup={<MockHeader logoUrl={logoUrl} />}
            verMaqueta={verMaquetas}
          />
          </div>
          <ImageDropCard
            label="Portada"
            hint="Horizontal · 1200×900 (4:3)"
            whereVisible="Foto principal de tu card en /tiendas"
            value={coverUrl}
            previewClass="aspect-[4/3]"
            inputRef={coverImgRef}
            onChange={setCoverUrl}
            uploading={uploadingField === "portada"}
            onUpload={handleFileUpload(setCoverUrl, "portada", "branding")}
            mockup={<MockStoreCard coverUrl={coverUrl} logoUrl={logoUrl} businessName={businessName} />}
            verMaqueta={verMaquetas}
          />
          <ImageDropCard
            label="Banner"
            hint="Wide · 1600×500 (16:5)"
            whereVisible="Hero gigante al entrar a tu tienda"
            value={bannerUrl}
            previewClass="aspect-[16/5]"
            inputRef={bannerImgRef}
            onChange={setBannerUrl}
            uploading={uploadingField === "banner"}
            onUpload={handleFileUpload(setBannerUrl, "banner", "branding")}
            mockup={<MockStorefront bannerUrl={bannerUrl} logoUrl={logoUrl} businessName={businessName} />}
            verMaqueta={verMaquetas}
          />
        </div>
      </SectionCard>

      {/* Social links */}
      <SectionCard title="Redes sociales" desc="Se muestran en el footer de la tienda">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><FieldLabel>Facebook</FieldLabel><TextInput value={socialLinks.facebook || ""} onChange={v => setSocialLinks(p => ({ ...p, facebook: v }))} placeholder="facebook.com/tubodega" /></div>
          <div><FieldLabel>Instagram</FieldLabel><TextInput value={socialLinks.instagram || ""} onChange={v => setSocialLinks(p => ({ ...p, instagram: v }))} placeholder="@tubodega" /></div>
          <div><FieldLabel>TikTok</FieldLabel><TextInput value={socialLinks.tiktok || ""} onChange={v => setSocialLinks(p => ({ ...p, tiktok: v }))} placeholder="@tubodega" /></div>
        </div>
      </SectionCard>


      <SaveButton saving={saving} saved={savedSection === "negocio"} onClick={() => patch({
        mode, businessName, businessPhone, businessAddress, businessLat, businessLon,
        logoUrl, coverUrl, bannerUrl, description, hours, deliveryZone, razonSocial, ruc, businessEmail,
        currency, businessType, socialLinks,
      }).then(() => onModeChange(mode))} />
    </div>
  );

  const renderCobros = () => (
    <div className="space-y-6">
      <SectionCard title="Métodos de pago" desc="Configura los métodos que aceptas">
        <div className="space-y-3">
          <Toggle enabled={cashEnabled} onChange={setCashEnabled} label="Efectivo" desc="Pago contra entrega" />
          <Toggle enabled={yapeEnabled} onChange={setYapeEnabled} label="Yape" desc="Pago con QR de Yape" />
          {yapeEnabled && (
            <div className="pl-4 border-l-2 border-[var(--rule-base)] space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><FieldLabel>Titular</FieldLabel><TextInput value={yapeName} onChange={setYapeName} placeholder="Juan Pérez" /></div>
                <div><FieldLabel>Número</FieldLabel><TextInput id="settings-yapePhone" value={yapePhone} onChange={setYapePhone} placeholder="987654321" mono /></div>
              </div>
              <div>
                <FieldLabel>QR de Yape</FieldLabel>
                <button id="settings-yape-qr" type="button" onClick={() => yapeImgRef.current?.click()} className="w-full min-h-11 rounded-xl border border-dashed border-[var(--rule-base)] hover:border-[var(--rule-base)]0 text-sm font-semibold text-[var(--text-secondary)] bg-[var(--surface-sunken)] transition-colors"><Upload className="h-4 w-4 inline mr-1.5" />Subir QR</button>
                <input ref={yapeImgRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload(setYapeImage, "yape", "payments")} />
                {yapeImage && <div className="mt-2 flex items-center gap-3 p-2 bg-[var(--surface-sunken)] rounded-lg"><Image src={yapeImage} alt="QR" width={64} height={64} className="rounded-lg object-contain border" unoptimized /><button onClick={() => setYapeImage("")} className="text-xs text-[var(--data-error-500)] hover:text-[var(--data-error-500)]">Quitar</button></div>}
              </div>
            </div>
          )}
          <Toggle enabled={plinEnabled} onChange={setPlinEnabled} label="Plin" desc="Pago con Plin" />
          {plinEnabled && (
            <div className="pl-4 border-l-2 border-[var(--data-success-500)]/30 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><FieldLabel>Titular</FieldLabel><TextInput value={plinName} onChange={setPlinName} /></div>
                <div><FieldLabel>Número</FieldLabel><TextInput id="settings-plinPhone" value={plinPhone} onChange={setPlinPhone} mono /></div>
              </div>
              <div>
                <button onClick={() => plinImgRef.current?.click()} className="w-full py-3 rounded-xl border-2 border-dashed border-[var(--data-success-500)]/30 hover:border-[var(--data-success-500)]/30 text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 transition-colors"><Upload className="h-4 w-4 inline mr-1.5" />Subir QR Plin</button>
                <input ref={plinImgRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload(setPlinImage, "plin", "payments")} />
                {plinImage && <div className="mt-2 flex items-center gap-3 p-2 bg-primary/10 rounded-lg"><Image src={plinImage} alt="QR" width={64} height={64} className="rounded-lg object-contain border" unoptimized /><button onClick={() => setPlinImage("")} className="text-xs text-[var(--data-error-500)]">Quitar</button></div>}
              </div>
            </div>
          )}
          <Toggle enabled={transferEnabled} onChange={setTransferEnabled} label="Transferencia bancaria" desc="Deposito o transferencia" />
          {transferEnabled && (
            <div className="pl-4 border-l-2 border-[var(--data-success-500)]/30 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><FieldLabel icon={<Landmark className="h-3.5 w-3.5" />}>Banco</FieldLabel><TextInput value={transferBankName} onChange={setTransferBankName} placeholder="BCP" /></div>
                <div><FieldLabel>N° de cuenta</FieldLabel><TextInput id="settings-transferAccountNum" value={transferAccountNum} onChange={setTransferAccountNum} mono /></div>
                <div><FieldLabel>Titular</FieldLabel><TextInput value={transferAccountHolder} onChange={setTransferAccountHolder} /></div>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Caja" desc="Aviso de efectivo acumulado y hora de cierre de la tienda">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><FieldLabel htmlFor="settings-cashAlertMax" icon={<AlertTriangle className="h-3.5 w-3.5" />}>Alerta de exceso en caja</FieldLabel><NumberInput id="settings-cashAlertMax" value={cashAlertMax} onChange={setCashAlertMax} min={0} suffix="soles" /></div>
          <div><FieldLabel icon={<Timer className="h-3.5 w-3.5" />}>Hora de cierre</FieldLabel><TextInput value={autoCloseTime} onChange={setAutoCloseTime} placeholder="22:00" /></div>
        </div>
      </SectionCard>

      <SectionCard title="Comprobantes" desc="Emisor e IGV de tus boletas y facturas">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><FieldLabel htmlFor="settings-sunatRuc" icon={<Hash className="h-3.5 w-3.5" />}>RUC del emisor</FieldLabel><TextInput id="settings-sunatRuc" value={sunatRuc} onChange={setSunatRuc} placeholder="20123456789" mono /></div>
          <div><FieldLabel htmlFor="settings-sunatDenominacion" icon={<FileText className="h-3.5 w-3.5" />}>Denominación</FieldLabel><TextInput id="settings-sunatDenominacion" value={sunatDenominacion} onChange={setSunatDenominacion} placeholder="Inversiones San Martín S.A.C." /></div>
          <div><FieldLabel htmlFor="settings-taxRate" icon={<Percent className="h-3.5 w-3.5" />}>IGV</FieldLabel><NumberInput id="settings-taxRate" value={taxRate} onChange={setTaxRate} min={0} max={100} step={0.1} suffix="%" /></div>
        </div>
        <button type="button" onClick={() => onNavigateTab?.("facturacion")} className={LINK_A_OTRA_PANTALLA}>
          <FileText className="h-4 w-4 text-primary shrink-0" />
          <span className="flex-1 min-w-0 text-sm font-semibold text-[var(--text-primary)]">Series, correlativos y conexión con SUNAT</span>
          <span className="text-xs text-[var(--text-secondary)]">en Facturación</span>
          <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
        </button>
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "cobros"} onClick={() => patch({
        cashEnabled, yapeEnabled, yapeImage, yapeName, yapePhone,
        plinEnabled, plinImage, plinName, plinPhone,
        transferEnabled, transferBankName, transferAccountNum, transferAccountHolder,
        cashAlertMax, autoCloseTime, sunatRuc, sunatDenominacion, taxRate,
      })} />
    </div>
  );

  const renderDelivery = () => (
    <div className="space-y-6">
      <SectionCard title="Zonas de delivery" desc="Define zonas con tarifas y tiempos diferentes, y desde qué monto el envío es gratis.">
        <div className="space-y-2">
          {deliveryZones.map((zone, idx) => (
            <div key={idx} className="flex items-center gap-2 p-3 bg-[var(--surface-sunken)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <input id={`settings-zona-${idx}`} aria-label="Nombre de la zona" value={zone.name} onChange={e => setDeliveryZones(p => p.map((z, i) => i === idx ? { ...z, name: e.target.value } : z))} placeholder="Nombre" className="px-2 py-1.5 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm bg-[var(--surface-raised)] outline-none" />
                <div className="flex items-center gap-1">
                  <input type="number" value={zone.fee} onChange={e => setDeliveryZones(p => p.map((z, i) => i === idx ? { ...z, fee: Number(e.target.value) } : z))} min={0} className="w-full px-2 py-1.5 rounded-xl border border-[var(--rule-base)] text-sm font-mono bg-[var(--surface-raised)] outline-none" />
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">S/</span>
                </div>
                <div className="flex items-center gap-1">
                  <input type="number" value={zone.estimatedMin} onChange={e => setDeliveryZones(p => p.map((z, i) => i === idx ? { ...z, estimatedMin: Number(e.target.value) } : z))} min={0} className="w-full px-2 py-1.5 rounded-xl border border-[var(--rule-base)] text-sm font-mono bg-[var(--surface-raised)] outline-none" />
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">min</span>
                </div>
              </div>
              <button aria-label="Eliminar" onClick={() => setDeliveryZones(p => p.filter((_, i) => i !== idx))} className="p-1.5 rounded-xl text-[var(--data-error-500)] hover:text-[var(--data-error-500)]"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button onClick={() => setDeliveryZones(p => [...p, { name: "", fee: 0, estimatedMin: 30 }])} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"><Plus className="h-3.5 w-3.5" /> Agregar zona</button>
        </div>
        {/* Envío gratis: era una tarjeta aparte para un solo campo */}
        <div className="pt-4 border-t border-[var(--rule-soft)]"><div className="sm:max-w-xs"><FieldLabel htmlFor="settings-freeDeliveryMin" icon={<DollarSign className="h-3.5 w-3.5" />}>Envío gratis desde</FieldLabel><NumberInput id="settings-freeDeliveryMin" value={freeDeliveryMin} onChange={setFreeDeliveryMin} min={0} suffix="soles (0 = no aplica)" /></div></div>
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "delivery"} onClick={() => patch({ deliveryZones, freeDeliveryMin })} />
    </div>
  );

  // Vista previa: el nombre del negocio, o el del tenant si todavía no lo escribiste.
  const nombreVisible = businessName.trim() || branding.name || "Tu tienda";

  const renderTienda = () => (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {/* Maintenance mode */}
      <SectionCard title="Modo vacaciones / mantenimiento" desc="Bloquea compras mostrando un banner">
        <Toggle enabled={maintenanceMode} onChange={async v => {
          const previous = maintenanceMode;
          const previousMsg = maintenanceMsg;
          setMaintenanceMode(v);
          const msg = v && !maintenanceMsg ? "Estamos de vacaciones. ¡Volvemos pronto!" : maintenanceMsg;
          if (v && !maintenanceMsg) setMaintenanceMsg(msg);
          try {
            const res = await fetch("/api/settings", { method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ maintenanceMode: v, maintenanceMessage: msg }) });
            if (!res.ok) {
              setMaintenanceMode(previous);
              setMaintenanceMsg(previousMsg);
              toast.error(`No se pudo cambiar el modo mantenimiento (error ${res.status})`);
            }
          } catch (err) {
            setMaintenanceMode(previous);
            setMaintenanceMsg(previousMsg);
            console.warn("[SettingsModule] modo mantenimiento falló", err);
            toast.error("No se pudo cambiar el modo mantenimiento — revisa tu conexión.");
          }
        }} label={maintenanceMode ? "Modo activo — tienda bloqueada" : "Desactivado"} desc="Los clientes ven el catálogo pero no pueden comprar" />
        {maintenanceMode && (
          <div className="space-y-2">
            <FieldLabel>Mensaje para clientes</FieldLabel>
            <TextInput value={maintenanceMsg} onChange={setMaintenanceMsg} placeholder="Ej: Estamos de vacaciones. Volvemos el lunes." />
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]">
              <Palmtree className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" aria-hidden />
              <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-medium flex-1">{maintenanceMsg || "Vista previa..."}</p>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Colores de marca" desc="Personaliza los colores de tu tienda">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel>Color primario</FieldLabel>
            <div className="flex items-center gap-2">
              <input aria-label="Color primario" type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-[var(--rule-base)] cursor-pointer" />
              <TextInput value={primaryColor} onChange={setPrimaryColor} mono />
            </div>
          </div>
          <div>
            <FieldLabel>Color secundario</FieldLabel>
            <div className="flex items-center gap-2">
              <input aria-label="Color secundario" type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-[var(--rule-base)] cursor-pointer" />
              <TextInput value={secondaryColor} onChange={setSecondaryColor} mono />
            </div>
          </div>
          <div className="sm:col-span-2"><FieldLabel>Slogan</FieldLabel><TextInput id="settings-slogan" value={slogan} onChange={setSlogan} placeholder="Productos frescos, precios justos" /></div>
        </div>
        {/* Live preview */}
        <div className="mt-4 p-4 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)]" style={{ background: `linear-gradient(135deg, ${primaryColor}15, ${secondaryColor}15)` }}>
          <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] mb-2">Vista previa</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: primaryColor }}>{nombreVisible.slice(0, 1).toUpperCase()}</div>
            <div><p className="text-sm font-extrabold" style={{ color: primaryColor }}>{nombreVisible}</p><p className="text-xs" style={{ color: secondaryColor }}>{slogan || "Tu slogan"}</p></div>
          </div>
          <div className="mt-3 flex gap-2">
            <span className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: primaryColor }}>Primario</span>
            <span className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: secondaryColor }}>Secundario</span>
          </div>
        </div>
      </SectionCard>

      </div>

      <SaveButton saving={saving} saved={savedSection === "tienda"} label="Guardar colores y mensaje" onClick={() => patch({ primaryColor, secondaryColor, slogan, maintenanceMessage: maintenanceMsg })} />

      <Plegable clave="tienda-secciones-menu" titulo="Secciones y menú de la tienda" resumen="Qué bloques salen en el inicio de tu tienda y en qué orden">
        <StorefrontEditor />
      </Plegable>
    </div>
  );

  const renderEquipo = () => (
    <div className="space-y-6">
      <TeamTab />

      <SectionCard title="Tu acceso" desc="Tu contraseña, la sesión y desde dónde entraste">
        <button type="button" onClick={() => onNavigateTab?.("mi-perfil")} className={LINK_A_OTRA_PANTALLA}>
          <Key className="h-4 w-4 text-primary shrink-0" />
          <span className="flex-1 min-w-0 text-sm font-semibold text-[var(--text-primary)]">Cambiar mi contraseña</span>
          <span className="text-xs text-[var(--text-secondary)]">en Mi perfil</span>
          <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
        </button>
        {/* Mantener sesión activa — no volver al login mientras se trabaja */}
        <KeepAliveSwitch />
        {!cargaFallida && <Toggle enabled={bypassLogin} onChange={async v => {
          const previous = bypassLogin;
          setBypassLogin(v);
          try {
            const res = await fetch("/api/settings", { method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ adminBypassLogin: v }) });
            if (!res.ok) {
              setBypassLogin(previous);
              toast.error(`No se pudo cambiar el acceso sin login (error ${res.status})`);
            }
          } catch (err) {
            setBypassLogin(previous);
            console.warn("[SettingsModule] bypass login falló", err);
            toast.error("No se pudo cambiar el acceso sin login — revisa tu conexión.");
          }
        }} label="Acceso sin login" desc="Permite entrar al panel sin credenciales" danger />}
        {bypassLogin && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]">
            <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)] shrink-0 mt-0.5" />
            <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-medium">RIESGO DE SEGURIDAD: Cualquier persona podrá acceder al panel de administración.</p>
          </div>
        )}
        {/* Dispositivos y accesos (#3a) — desde dónde entró el admin */}
        <LoginDevicesCard embebido />
      </SectionCard>
    </div>
  );

  const renderSidebarOrder = () => {
    if (!reorderCategories || !onSaveSidebarOrder) {
      return (
        <div className="rounded-xl border border-dashed border-[var(--rule-base)] p-8 text-center">
          <p className="text-sm text-[var(--text-secondary)]">El reorden de la barra lateral no está disponible en este contexto.</p>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <SidebarReorderPanel categories={reorderCategories} onSave={onSaveSidebarOrder} />
      </div>
    );
  };

  const renderPanel = () => (
    <div className="space-y-6">
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("open-module-manager"))} className={LINK_A_OTRA_PANTALLA}>
        <Layers className="h-4 w-4 text-primary shrink-0" />
        <span className="flex-1 min-w-0 text-sm font-semibold text-[var(--text-primary)]">Activar u ocultar módulos</span>
        <span className="text-xs text-[var(--text-secondary)]">también limpia datos de ejemplo</span>
        <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
      </button>
      <Plegable clave="pestana-defecto" titulo="Pestaña por defecto" resumen="Qué vista se abre al entrar a cada sección">
        <NavDefaultTabsConfig />
      </Plegable>
      <Plegable clave="barra-lateral" titulo="Orden de la barra lateral" resumen={`${reorderCategories?.length ?? 0} categorías`}>
        {renderSidebarOrder()}
      </Plegable>
      <Plegable clave="accesos-directos" titulo="Accesos directos" resumen={`${customShortcuts.length} de 6 · aparecen como favoritos en tu barra lateral`}>
        {renderShortcuts()}
      </Plegable>
    </div>
  );

  const renderSistema = () => (
    <div className="space-y-6">
      <SectionCard title="Modo de lenguaje" desc="Elige cómo se muestran los términos en el panel">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              try { localStorage.setItem("buleje-vocabulary-mode", "simple"); } catch {}
              window.dispatchEvent(new Event("vocabulary-change"));
            }}
            className={cn(
              "p-4 rounded-xl border-2 text-left transition-all",
              (typeof window !== "undefined" && localStorage.getItem("buleje-vocabulary-mode") !== "technical")
                ? "border-primary bg-primary/5"
                : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-gray-300"
            )}
          >
            <p className="font-bold text-sm">Sencillo</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">Palabras simples y claras. Ideal para dueños de bodega.</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-2 italic">Ejemplo: &ldquo;Ganancia&rdquo; en vez de &ldquo;Margen bruto&rdquo;</p>
          </button>
          <button
            type="button"
            onClick={() => {
              try { localStorage.setItem("buleje-vocabulary-mode", "technical"); } catch {}
              window.dispatchEvent(new Event("vocabulary-change"));
            }}
            className={cn(
              "p-4 rounded-xl border-2 text-left transition-all",
              (typeof window !== "undefined" && localStorage.getItem("buleje-vocabulary-mode") === "technical")
                ? "border-primary bg-primary/5"
                : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-gray-300"
            )}
          >
            <p className="font-bold text-sm">Profesional</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">Terminología técnica. Ideal para contadores y profesionales.</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-2 italic">Ejemplo: &ldquo;Margen bruto&rdquo;, &ldquo;FEFO&rdquo;, &ldquo;SKU&rdquo;, &ldquo;ROI&rdquo;</p>
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Tutorial de bienvenida"
        desc="Vuelve a ver el recorrido guiado del panel cuando quieras."
      >
        <button
          onClick={() => {
            onResetTutorial?.();
            onNavigateTab?.("asistente-ia");
          }}
          className="inline-flex items-center gap-2 px-4 min-h-11 rounded-xl text-sm font-semibold text-white bg-gray-900 dark:bg-white dark:text-[var(--text-primary)] hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
        >
          <Activity className="h-4 w-4" />
          Repetir tutorial de bienvenida
        </button>
      </SectionCard>

      <SectionCard title="Respaldo de datos" desc="Descarga una copia de tus datos">
        {/* Last backup indicator */}
        {(() => {
          const lastDate = lastBackupAt ? new Date(lastBackupAt) : (typeof window !== "undefined" ? (() => { const ls = localStorage.getItem("buleje-last-backup"); return ls ? new Date(ls) : null; })() : null);
          const daysSince = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / 86400000) : null;
          const needsBackup = !lastDate || (daysSince !== null && daysSince > 7);
          return (
            <div className={cn("p-3 rounded-xl border", needsBackup ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border-[var(--data-warning-500)]" : "bg-primary/10 dark:bg-primary/15 border-[var(--data-success-500)]/30")}>
              <div className="flex items-center gap-2.5">
                {needsBackup ? <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" /> : <CheckCircle className="h-4 w-4 text-[var(--data-success-500)] shrink-0" />}
                <p className="text-xs font-medium">{lastDate ? `Último respaldo: hace ${daysSince} día${daysSince !== 1 ? "s" : ""}` : "No hay respaldos recientes"}</p>
              </div>
            </div>
          );
        })()}
        <div className="grid sm:max-w-xs">
          <button onClick={async () => {
            const ts = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
            const link = document.createElement("a");
            link.href = "/api/backup"; link.download = `bodega-backup-${ts}.json`;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            if (typeof window !== "undefined") localStorage.setItem("buleje-last-backup", new Date().toISOString());
            setLastBackupAt(new Date().toISOString());
          }} className="flex items-center justify-center gap-2 px-4 min-h-11 rounded-xl border-2 border-teal-200 bg-[var(--surface-raised)] hover:bg-teal-50 text-sm font-semibold text-[var(--accent-dark)] dark:text-[var(--accent)]">
            <Download className="h-4 w-4" /> Generar respaldo
          </button>
        </div>
      </SectionCard>
    </div>
  );

  const renderSection = () => {
    if (cargaFallida && SECCIONES_CON_DATOS.has(activeSection)) return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-[var(--data-error-500)]">
          <AlertTriangle className="h-4 w-4 shrink-0" /> No se pudo cargar tu configuración
        </p>
        <p className="text-xs text-[var(--text-secondary)]">Para no guardar vacío encima de tus datos, esta sección queda bloqueada hasta que cargue.</p>
        <button type="button" onClick={cargar} className="inline-flex items-center gap-2 px-4 min-h-11 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90">
          Reintentar
        </button>
      </div>
    );
    switch (activeSection) {
      case "negocio": return renderNegocio();
      case "cobros": return renderCobros();
      case "delivery": return renderDelivery();
      case "tienda": return renderTienda();
      case "plan": return <PlanTierSelector />;
      case "equipo": return renderEquipo();
      case "panel": return renderPanel();
      case "sistema": return renderSistema();
    }
  };

  const meta = TABS.find((s) => s.id === activeSection) ?? TABS[0];

  // ══════════════════════════════════════════════════════════════════════════════
  // LAYOUT — menú agrupado a la izquierda (fila deslizable en el celular)
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-5">
      <AdminModuleHeader
        title="Configuración"
        description="Tu negocio, cobros, tienda y panel"
        icon={SlidersHorizontal}
        bgTint="bg-[var(--surface-sunken)] "
        iconColorClass="text-[var(--text-secondary)] "
      >
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            aria-label="Buscar un ajuste"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && encontradas[0]) irASeccion(encontradas[0].id); }}
            placeholder="Buscar: yape, igv, logo…"
            className="w-full pl-9 pr-9 h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
          {searchQuery && (
            <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </AdminModuleHeader>

      <MenuSeccionesMovil secciones={encontradas} activa={activeSection} pendientes={pendientes} onIr={irASeccion} />

      {encontradas.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">Ningún ajuste coincide con «{searchQuery}».</p>
      )}

      <div className="lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-6 lg:items-start">
        <MenuSeccionesEscritorio secciones={encontradas} activa={activeSection} pendientes={pendientes} onIr={irASeccion} />

        <section aria-labelledby={tituloSeccionId} className="min-w-0 mt-4 lg:mt-0">
          <CabeceraSeccion
            meta={meta}
            tituloId={tituloSeccionId}
            faltan={cargaFallida && SECCIONES_CON_DATOS.has(activeSection) ? [] : (faltanPorSeccion[activeSection] ?? [])}
            onIrACampo={irAFalta}
          />
          <AnimatePresence mode="wait">
            <m.div
              key={activeSection}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              {renderSection()}
            </m.div>
          </AnimatePresence>
        </section>
      </div>

      {/* Map picker modal */}
      {showMapPicker && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/60" role="presentation" onClick={(e) => { if (e.target === e.currentTarget && !ventanaMapPicker.fijado) setShowMapPicker(false); }}>
          <m.div
            ref={mapPickerPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={mapPickerTitleId}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-[var(--surface-raised)] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
          >
            <div {...ventanaMapPicker.asaProps} className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <CardTitle id={mapPickerTitleId} className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Ubicación del negocio</CardTitle>
              <span className="ml-auto flex items-center gap-1">
                <ControlesDeVentana ventana={ventanaMapPicker} />
              </span>
              <button aria-label="Cerrar" onClick={() => setShowMapPicker(false)} className="p-1.5 rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--rule-soft)]"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <button onClick={() => { if (!navigator.geolocation) return; navigator.geolocation.getCurrentPosition(pos => { setPickerLat(pos.coords.latitude); setPickerLon(pos.coords.longitude); setBusinessLat(pos.coords.latitude); setBusinessLon(pos.coords.longitude); }); }} className="self-start inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 hover:bg-primary/10 border border-[var(--data-success-500)]/30">
                <MapPin className="h-4 w-4" /> Usar ubicación actual
              </button>
              <LeafletMap lat={pickerLat} lon={pickerLon} zoom={15} height={340} onPick={(lat: number, lon: number, address: string) => { setPickerLat(lat); setPickerLon(lon); setBusinessLat(lat); setBusinessLon(lon); setBusinessAddress(address); }} />
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-[var(--rule-soft)]">
              <button onClick={() => setShowMapPicker(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]">Cancelar</button>
              <button onClick={() => setShowMapPicker(false)} className="px-4 min-h-11 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90">Confirmar</button>
            </div>
            <TiradorDeVentana ventana={ventanaMapPicker} />
          </m.div>
        </div>
      )}
    </div>
  );
}
