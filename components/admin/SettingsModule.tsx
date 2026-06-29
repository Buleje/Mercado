"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import { m, AnimatePresence } from "@/components/admin/providers";
import { cn } from "@/lib/utils";
import type { StoreMode } from "@/lib/jsondb";
import { csrfHeaders } from "@/lib/csrf-client";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import {
  Store, Phone, MapPin, Clock, AlignLeft, Upload, Lock, X, Search,
  ShoppingCart, MessageCircle, Check,
  Loader2, Eye, EyeOff, ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle, Download,
  CheckCircle, Palette, User, Truck, Settings, Bell, Package,
  DollarSign, FileText, Zap, Landmark, Globe, Hash, Percent,
  Calendar, Timer, Layers, Mail, Key, Wifi, WifiOff,
  BarChart3, Crown, ChevronRight, ChevronDown, Save,
  Plus, Trash2, Copy, Send, Activity,
  HardDrive, ClipboardList, Monitor, SlidersHorizontal,
} from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { CardTitle, IconBadge } from "@buleje/design-system";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });
const StorefrontEditor = dynamic(() => import("@/components/admin/StorefrontEditor"), { ssr: false });
// Componentes que antes vivían sueltos en TabRouter — ahora forman parte
// de la grilla de secciones del SettingsModule (selección + detalle).
const TeamTab = dynamic(() => import("@/components/admin/TeamTab"));
const NavDefaultTabsConfig = dynamic(
  () => import("@/components/admin/NavDefaultTabsConfig").then((m) => ({ default: m.NavDefaultTabsConfig })),
);
const SidebarReorderPanel = dynamic(() => import("@/components/admin/SidebarReorderPanel"));
const PlanTierSelector = dynamic(
  () => import("@/components/admin/PlanTierSelector"),
  { ssr: false },
);

// ── Types ──────────────────────────────────────────────────────────────────────
type NavLinkItem = { id: string; visible: boolean };
type DeliveryZone = { name: string; fee: number; estimatedMin: number };
type Rider = { name: string; phone: string; zone: string };
type SocialLinks = { facebook?: string; instagram?: string; tiktok?: string };

type SettingsData = Record<string, unknown>;

type SectionId = "business" | "security" | "system" | "sales" | "inventory"
  | "cash" | "delivery" | "notifications" | "integrations" | "appearance"
  | "audit" | "backup" | "modules" | "shortcuts" | "subscription" | "storefront"
  | "team" | "nav-defaults" | "sidebar-order" | "tutorial";

// Setup guiado — orden de prioridad para una bodega: primero lo que la deja
// VENDER y COBRAR, después lo administrativo. El "próximo paso" del overview
// toma la primera sección de esta lista que aún no esté al 100%.
const SETUP_PRIORITY: SectionId[] = [
  "business", "cash", "delivery", "sales", "notifications",
  "integrations", "inventory", "appearance", "security",
];

// Categoría visible para el panel "Reordenar barra lateral".
// Compat con CategoryItem de components/admin/SidebarReorderPanel.tsx.
type ReorderCategory = { id: string; label: string };

const NAV_LABEL: Record<string, string> = {
  inicio: "Inicio", productos: "Productos", beneficios: "Beneficios", contacto: "Contacto",
};
const DEFAULT_NAV_LINKS: NavLinkItem[] = [
  { id: "inicio", visible: true }, { id: "productos", visible: true },
  { id: "beneficios", visible: true }, { id: "contacto", visible: true },
];

// Orden de secciones agrupadas por intención del dueño:
//   1) Negocio + Plan (los 2 más usados al setup inicial)
//   2) Operación diaria (ventas, inventario, caja, delivery)
//   3) Comunicación (notificaciones, integraciones)
//   4) Personalización (apariencia, mi tienda web)
//   5) Sistema avanzado (seguridad, auditoría, backup, módulos, shortcuts)
const SECTION_META: { id: SectionId; icon: React.ReactNode; title: string; desc: string; color: string }[] = [
  // ── Setup inicial ──
  { id: "business", icon: <Store className="h-5 w-5" />, title: "Datos del Negocio", desc: "Nombre, RUC, contacto, redes", color: "text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-orange-950/30" },
  { id: "subscription", icon: <Crown className="h-5 w-5" />, title: "Plan y suscripción", desc: "Básico, Pro, Enterprise o Max — cambiá cuando quieras", color: "text-[var(--accent)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  // ── Operación diaria ──
  { id: "sales", icon: <FileText className="h-5 w-5" />, title: "Ventas y Comprobantes", desc: "Series, SUNAT, descuentos", color: "text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  { id: "inventory", icon: <Package className="h-5 w-5" />, title: "Inventario", desc: "Stock, alertas, unidades", color: "text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  { id: "cash", icon: <DollarSign className="h-5 w-5" />, title: "Caja y Pagos", desc: "Apertura, métodos, devoluciones", color: "text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  { id: "delivery", icon: <Truck className="h-5 w-5" />, title: "Delivery y Envíos", desc: "Zonas, tarifas, repartidores", color: "text-[var(--data-info-500)] bg-[var(--data-info-50)] dark:bg-cyan-950/30" },
  // ── Comunicación ──
  { id: "notifications", icon: <Bell className="h-5 w-5" />, title: "Notificaciones", desc: "Email, WhatsApp, push", color: "text-[var(--text-secondary)] bg-[var(--surface-sunken)]" },
  { id: "integrations", icon: <Zap className="h-5 w-5" />, title: "Integraciones", desc: "Yape, Plin, SUNAT, analytics", color: "text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-amber-950/30" },
  // ── Personalización ──
  { id: "appearance", icon: <Palette className="h-5 w-5" />, title: "Apariencia", desc: "Colores, slogan, tema", color: "text-[var(--text-secondary)] bg-[var(--surface-sunken)]" },
  { id: "storefront", icon: <Monitor className="h-5 w-5" />, title: "Mi Tienda Web", desc: "Secciones visibles y orden del home", color: "text-primary bg-primary/10 dark:bg-primary/20" },
  // ── Sistema avanzado ──
  { id: "system", icon: <Settings className="h-5 w-5" />, title: "Configuración del Sistema", desc: "Formato, moneda, impuestos", color: "text-slate-500 bg-slate-50 dark:bg-slate-950/30" },
  { id: "security", icon: <Lock className="h-5 w-5" />, title: "Usuarios y Seguridad", desc: "Contraseña, sesiones, acceso", color: "text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/30" },
  { id: "audit", icon: <Activity className="h-5 w-5" />, title: "Auditoría y Control", desc: "Logs, retención, alertas", color: "text-[var(--text-secondary)] bg-[var(--surface-sunken)]" },
  { id: "backup", icon: <HardDrive className="h-5 w-5" />, title: "Respaldo y Mantenimiento", desc: "Backups, estado, limpieza", color: "text-[var(--accent)] bg-teal-50 dark:bg-teal-950/30" },
  { id: "modules", icon: <Layers className="h-5 w-5" />, title: "Gestión de Módulos", desc: "Activa, oculta o reorganiza módulos", color: "text-[var(--data-info-500)] bg-[var(--data-info-50)] dark:bg-cyan-950/30" },
  { id: "shortcuts", icon: <Zap className="h-5 w-5" />, title: "Accesos Directos", desc: "Atajos personalizados en la barra lateral", color: "text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-yellow-950/30" },
  // ── Equipo y navegación (antes sueltos en TabRouter) ──
  { id: "team", icon: <User className="h-5 w-5" />, title: "Gestión de Equipo", desc: "Tu equipo y control de acceso por rol", color: "text-[var(--data-info-500)] bg-[var(--data-info-50)] dark:bg-blue-950/30" },
  { id: "nav-defaults", icon: <SlidersHorizontal className="h-5 w-5" />, title: "Navegación", desc: "Qué tab se abre por defecto en cada sección", color: "text-[var(--text-secondary)] bg-[var(--surface-sunken)]" },
  { id: "sidebar-order", icon: <ArrowUpDown className="h-5 w-5" />, title: "Reordenar barra lateral", desc: "Cambia el orden de las secciones en tu menú", color: "text-[var(--text-secondary)] bg-[var(--surface-sunken)]" },
  { id: "tutorial", icon: <ClipboardList className="h-5 w-5" />, title: "Tutorial de bienvenida", desc: "Repasa cómo funciona cada sección del panel", color: "text-[var(--accent)] bg-teal-50 dark:bg-teal-950/30" },
];

// ── Reusable sub-components ───────────────────────────────────────────────────

function FieldLabel({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted mb-1.5">
      {icon}{children}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, mono, type = "text", disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; type?: string; disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        "w-full px-3 py-2.5 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)]",
        "bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm",
        "outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        mono && "font-mono"
      )}
    />
  );
}

function NumberInput({ value, onChange, min, max, step, suffix }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        min={min} max={max} step={step}
        className="flex-1 px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors font-mono"
      />
      {suffix && <span className="text-xs text-[var(--text-secondary)] dark:text-muted font-medium shrink-0">{suffix}</span>}
    </div>
  );
}

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer transition-colors"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Toggle({ enabled, onChange, label, desc, danger }: {
  enabled: boolean; onChange: (v: boolean) => void; label: string; desc?: string; danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 dark:bg-surface border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{label}</p>
        {desc && <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={cn(
          "relative w-11 h-6 rounded-full transition-colors shrink-0",
          enabled ? (danger ? "bg-[var(--data-error-500)]" : "bg-primary") : "bg-gray-300 dark:bg-gray-600"
        )}
      >
        <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white dark:bg-[var(--color-card)] shadow transition-transform", enabled && "translate-x-5")} />
      </button>
    </div>
  );
}

function SectionCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
        <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)]">{title}</h4>
        {desc && <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">{desc}</p>}
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

function SaveButton({ saving, saved, onClick, label = "Guardar cambios" }: {
  saving: boolean; saved: boolean; onClick: () => void; label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className={cn(
        "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all w-full justify-center",
        saved ? "bg-[var(--accent-soft)] text-white" : "bg-gray-900 dark:bg-white dark:text-[var(--text-primary)] text-white hover:bg-gray-800 dark:hover:bg-gray-100"
      )}
    >
      {saving && !saved ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> :
       saved ? <><Check className="h-4 w-4" /> ¡Guardado!</> :
       <><Save className="h-4 w-4" /> {label}</>}
    </button>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-2.5 h-2.5 rounded-full", ok ? "bg-[var(--accent-soft)]" : "bg-[var(--data-error-500)]")} />
      <span className="text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)] font-medium">{label}</span>
      <span className={cn("text-[length:var(--ts-2xs)] font-bold uppercase", ok ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{ok ? "Conectado" : "No configurado"}</span>
    </div>
  );
}

function ProgressBar({ value, max, label, unit }: { value: number; max: number; label: string; unit?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const isHigh = pct > 80;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--text-primary)] dark:text-[var(--text-primary)] font-medium">{label}</span>
        <span className={cn("font-bold", isHigh ? "text-[var(--data-warning-500)]" : "text-[var(--text-secondary)] dark:text-muted")}>{value}/{max} {unit}</span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", isHigh ? "bg-[var(--data-warning-500)]" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function OverviewCard({ section, completionPct, onClick }: {
  section: typeof SECTION_META[number]; completionPct: number; onClick: () => void;
}) {
  return (
    <m.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="relative flex flex-col items-start gap-3 p-4 rounded-xl border-2 border-[var(--rule-soft)] dark:border-[var(--rule-base)] text-left transition-all bg-[var(--surface-raised)] hover:shadow-[var(--shadow-lg)] hover:border-gray-200 dark:hover:border-gray-600"
    >
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", section.color)}>
        {section.icon}
      </div>
      <div>
        <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{section.title}</p>
        <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] dark:text-muted mt-0.5 line-clamp-1">{section.desc}</p>
      </div>
      <div className="w-full flex items-center gap-2 mt-auto">
        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", completionPct === 100 ? "bg-[var(--accent-soft)]" : "bg-primary/60")} style={{ width: `${completionPct}%` }} />
        </div>
        <span className={cn("text-[length:var(--ts-2xs)] font-bold shrink-0", completionPct === 100 ? "text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]")}>{completionPct}%</span>
      </div>
      {completionPct === 100 && (
        <div className="absolute top-2.5 right-2.5">
          <CheckCircle className="h-4 w-4 text-[var(--data-success-500)]" />
        </div>
      )}
    </m.button>
  );
}

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
  const [activeSection, setActiveSection] = useState<SectionId>("business");
  const [saving, setSaving] = useState(false);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [showMobileNav, setShowMobileNav] = useState(false);

  // ── All settings state ──────────────────────────────────────────────────────

  // Store mode
  const [mode, setMode] = useState<StoreMode>(storeMode);

  // Business info
  const [businessName, setBusinessName] = useState("Buleje");
  const [businessPhone, setBusinessPhone] = useState("51929340532");
  const [businessAddress, setBusinessAddress] = useState("Pucallpa, Ucayali");
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const coverImgRef = useRef<HTMLInputElement>(null);
  const bannerImgRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("Productos frescos, precios justos y entrega directa a tu puerta.");
  const [hours, setHours] = useState("Lun - Sáb: 7am - 9pm");
  const [deliveryZone, setDeliveryZone] = useState("Pucallpa");
  const [businessLat, setBusinessLat] = useState<number | null>(null);
  const [businessLon, setBusinessLon] = useState<number | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [pickerLat, setPickerLat] = useState(-8.38001);
  const [pickerLon, setPickerLon] = useState(-74.53551);
  const [razonSocial, setRazonSocial] = useState("");
  const [ruc, setRuc] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [currency, setCurrency] = useState("PEN");
  const [timezone, setTimezone] = useState("America/Lima");
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

  // Nav
  const [navLinks, setNavLinks] = useState<NavLinkItem[]>(DEFAULT_NAV_LINKS);

  // Security
  const [currentPwInput, setCurrentPwInput] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwChangeError, setPwChangeError] = useState("");
  const [storedAdminPw, setStoredAdminPw] = useState("admin2024");
  const [showCredPw, setShowCredPw] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState("");
  const [bypassLogin, setBypassLogin] = useState(false);

  // Appearance
  const [primaryColor, setPrimaryColor] = useState("var(--accent)");
  const [secondaryColor, setSecondaryColor] = useState("#ff6b5b");
  const [slogan, setSlogan] = useState("Productos frescos, precios justos");

  // System config
  const [dateFormat, setDateFormat] = useState("DD/MM/YYYY");
  const [timeFormat, setTimeFormat] = useState("24h");
  const [decimals, setDecimals] = useState(2);
  const [taxRate, setTaxRate] = useState(18);
  const [fiscalYearStart, setFiscalYearStart] = useState(1);

  // Sales & invoicing
  const [invoiceSeries, setInvoiceSeries] = useState<Record<string, string>>({
    factura: "F001", boleta: "B001", ncFactura: "FC01", ncBoleta: "BC01"
  });
  const [invoiceStart, setInvoiceStart] = useState<Record<string, number>>({
    F001: 1, B001: 1, FC01: 1, BC01: 1
  });
  const [enabledDocTypes, setEnabledDocTypes] = useState("factura,boleta,ticket");
  const [roundingMode, setRoundingMode] = useState("none");
  const [maxDiscountPercent, setMaxDiscountPercent] = useState(100);
  const [discountRequiresAuth, setDiscountRequiresAuth] = useState(false);
  const [invoiceFooterText, setInvoiceFooterText] = useState("");
  const [sunatRuc, setSunatRuc] = useState("");
  const [sunatDenominacion, setSunatDenominacion] = useState("");
  const [sunatDireccion, setSunatDireccion] = useState("");

  // Inventory
  const [defaultUnit, setDefaultUnit] = useState("unidad");
  const [globalMinStock, setGlobalMinStock] = useState(5);
  const [stockAlertChannels, setStockAlertChannels] = useState("dashboard");
  const [adjustReasons, setAdjustReasons] = useState<string[]>(["Merma", "Robo", "Vencimiento", "Error de conteo", "Donación"]);
  const [fefoEnabled, setFefoEnabled] = useState(true);
  const [fefoAlertDays, setFefoAlertDays] = useState(15);
  const [inventoryCountFreq, setInventoryCountFreq] = useState("monthly");

  // Cash register
  const [cashOpeningAmount, setCashOpeningAmount] = useState(100);
  const [cashAlertMax, setCashAlertMax] = useState(500);
  const [returnPolicyDays, setReturnPolicyDays] = useState(7);
  const [returnMaxNoAuth, setReturnMaxNoAuth] = useState(50);
  const [autoCloseTime, setAutoCloseTime] = useState("");

  // Delivery
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([
    { name: "Centro", fee: 3, estimatedMin: 30 },
  ]);
  const [freeDeliveryMin, setFreeDeliveryMin] = useState(0);
  const [deliveryMaxRadius, setDeliveryMaxRadius] = useState(10);
  const [deliveryHours, setDeliveryHours] = useState({ morning: "8:00-12:00", afternoon: "12:00-18:00", evening: "18:00-21:00" });
  const [riders, setRiders] = useState<Rider[]>([]);

  // Notifications
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [whatsappApiToken, setWhatsappApiToken] = useState("");
  const [whatsappBusinessNum, setWhatsappBusinessNum] = useState("");
  const [whatsappWebhookUrl, setWhatsappWebhookUrl] = useState("");
  const [notifChannels, setNotifChannels] = useState<Record<string, boolean>>({
    newOrder: true, orderReady: true, abandonedCart: false, lowStock: true
  });
  const [reorderReminderDays, setReorderReminderDays] = useState(0);

  // Integrations
  const [sunatProvider, setSunatProvider] = useState("none");
  const [sunatApiKey, setSunatApiKey] = useState("");
  const [googleAnalyticsId, setGoogleAnalyticsId] = useState("");
  const [googleTagManagerId, setGoogleTagManagerId] = useState("");

  // Audit
  const [logRetentionDays, setLogRetentionDays] = useState(90);
  const [logActions, setLogActions] = useState("sales,edits,access");

  // Backup
  const [backupSchedule, setBackupSchedule] = useState("none");
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<{ date: string; size: string; products: number; orders: number; customers: number } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Subscription
  const [planName, setPlanName] = useState("free");
  const [planExpiresAt, setPlanExpiresAt] = useState("");
  const [maxProducts, setMaxProducts] = useState(500);
  const [maxUsers, setMaxUsers] = useState(3);
  const [maxBranches, setMaxBranches] = useState(1);
  const [enabledModules, setEnabledModules] = useState<string[]>(["inventario", "ventas", "caja"]);

  // Feature flags
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load settings from API ──────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then(r => r.ok ? r.json() : null),
      fetch("/api/settings/feature-flags").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([d, flags]) => {
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
        if (d.yapeEnabled !== undefined) setYapeEnabled(d.yapeEnabled);
        if (d.yapeImage) setYapeImage(d.yapeImage);
        if (d.yapeName) setYapeName(d.yapeName);
        if (d.yapePhone) setYapePhone(d.yapePhone);
        if (d.cashEnabled !== undefined) setCashEnabled(d.cashEnabled);
        if (Array.isArray(d.navLinks) && d.navLinks.length > 0) setNavLinks(d.navLinks);
        // [SECURITY F1] adminPassword nunca viaja al cliente. El GET retorna
        // adminPasswordSet: boolean. Usamos "••••••" como indicador visual.
        if (d.adminPasswordSet !== undefined) setStoredAdminPw(d.adminPasswordSet ? "••••••" : "admin2024");
        if (d.maintenanceMode !== undefined) setMaintenanceMode(d.maintenanceMode);
        if (d.maintenanceMessage) setMaintenanceMsg(d.maintenanceMessage);
        if (d.adminBypassLogin !== undefined) setBypassLogin(d.adminBypassLogin);
        if (d.primaryColor) setPrimaryColor(d.primaryColor);
        if (d.secondaryColor) setSecondaryColor(d.secondaryColor);
        if (d.slogan) setSlogan(d.slogan);
        // New fields
        if (d.razonSocial) setRazonSocial(d.razonSocial);
        if (d.ruc) setRuc(d.ruc);
        if (d.businessEmail) setBusinessEmail(d.businessEmail);
        if (d.currency) setCurrency(d.currency);
        if (d.timezone) setTimezone(d.timezone);
        if (d.businessType) setBusinessType(d.businessType);
        if (d.socialLinks) setSocialLinks(d.socialLinks);
        if (d.dateFormat) setDateFormat(d.dateFormat);
        if (d.timeFormat) setTimeFormat(d.timeFormat);
        if (d.decimals !== undefined) setDecimals(d.decimals);
        if (d.taxRate !== undefined) setTaxRate(d.taxRate);
        if (d.fiscalYearStart !== undefined) setFiscalYearStart(d.fiscalYearStart);
        if (d.invoiceSeries) setInvoiceSeries(d.invoiceSeries);
        if (d.invoiceStart) setInvoiceStart(d.invoiceStart);
        if (d.enabledDocTypes) setEnabledDocTypes(d.enabledDocTypes);
        if (d.roundingMode) setRoundingMode(d.roundingMode);
        if (d.maxDiscountPercent !== undefined) setMaxDiscountPercent(d.maxDiscountPercent);
        if (d.discountRequiresAuth !== undefined) setDiscountRequiresAuth(d.discountRequiresAuth);
        if (d.invoiceFooterText) setInvoiceFooterText(d.invoiceFooterText);
        if (d.sunatRuc) setSunatRuc(d.sunatRuc);
        if (d.sunatDenominacion) setSunatDenominacion(d.sunatDenominacion);
        if (d.sunatDireccion) setSunatDireccion(d.sunatDireccion);
        if (d.defaultUnit) setDefaultUnit(d.defaultUnit);
        if (d.globalMinStock !== undefined) setGlobalMinStock(d.globalMinStock);
        if (d.stockAlertChannels) setStockAlertChannels(d.stockAlertChannels);
        if (d.adjustReasons) setAdjustReasons(d.adjustReasons);
        if (d.fefoEnabled !== undefined) setFefoEnabled(d.fefoEnabled);
        if (d.fefoAlertDays !== undefined) setFefoAlertDays(d.fefoAlertDays);
        if (d.inventoryCountFreq) setInventoryCountFreq(d.inventoryCountFreq);
        if (d.cashOpeningAmount !== undefined) setCashOpeningAmount(d.cashOpeningAmount);
        if (d.cashAlertMax !== undefined) setCashAlertMax(d.cashAlertMax);
        if (d.returnPolicyDays !== undefined) setReturnPolicyDays(d.returnPolicyDays);
        if (d.returnMaxNoAuth !== undefined) setReturnMaxNoAuth(d.returnMaxNoAuth);
        if (d.autoCloseTime) setAutoCloseTime(d.autoCloseTime);
        if (d.deliveryZones) setDeliveryZones(d.deliveryZones);
        if (d.freeDeliveryMin !== undefined) setFreeDeliveryMin(d.freeDeliveryMin);
        if (d.deliveryMaxRadius !== undefined) setDeliveryMaxRadius(d.deliveryMaxRadius);
        if (d.deliveryHours) setDeliveryHours(d.deliveryHours);
        if (d.riders) setRiders(d.riders);
        if (d.smtpHost) setSmtpHost(d.smtpHost);
        if (d.smtpPort !== undefined) setSmtpPort(d.smtpPort);
        if (d.smtpUser) setSmtpUser(d.smtpUser);
        if (d.smtpFrom) setSmtpFrom(d.smtpFrom);
        if (d.whatsappBusinessNum) setWhatsappBusinessNum(d.whatsappBusinessNum);
        if (d.notifChannels) setNotifChannels(d.notifChannels);
        if (d.reorderReminderDays !== undefined) setReorderReminderDays(d.reorderReminderDays);
        if (d.plinEnabled !== undefined) setPlinEnabled(d.plinEnabled);
        if (d.plinImage) setPlinImage(d.plinImage);
        if (d.plinName) setPlinName(d.plinName);
        if (d.plinPhone) setPlinPhone(d.plinPhone);
        if (d.sunatProvider) setSunatProvider(d.sunatProvider);
        if (d.googleAnalyticsId) setGoogleAnalyticsId(d.googleAnalyticsId);
        if (d.googleTagManagerId) setGoogleTagManagerId(d.googleTagManagerId);
        if (d.logRetentionDays !== undefined) setLogRetentionDays(d.logRetentionDays);
        if (d.logActions) setLogActions(d.logActions);
        if (d.backupSchedule) setBackupSchedule(d.backupSchedule);
        if (d.lastBackupAt) setLastBackupAt(d.lastBackupAt);
        if (d.planName) setPlanName(d.planName);
        if (d.planExpiresAt) setPlanExpiresAt(d.planExpiresAt);
        if (d.maxProducts !== undefined) setMaxProducts(d.maxProducts);
        if (d.maxUsers !== undefined) setMaxUsers(d.maxUsers);
        if (d.maxBranches !== undefined) setMaxBranches(d.maxBranches);
        if (d.enabledModules) setEnabledModules(d.enabledModules);
        if (d.transferEnabled !== undefined) setTransferEnabled(d.transferEnabled);
        if (d.transferBankName) setTransferBankName(d.transferBankName);
        if (d.transferAccountNum) setTransferAccountNum(d.transferAccountNum);
        if (d.transferAccountHolder) setTransferAccountHolder(d.transferAccountHolder);
      }
      if (flags) setFeatureFlags(flags);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // ── Save helper ─────────────────────────────────────────────────────────────

  const patch = useCallback(async (data: SettingsData) => {
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
    } catch (err) {
      toast.error("No se pudo guardar", {
        id: t,
        description: err instanceof Error ? err.message : "Error desconocido. Probá de nuevo.",
      });
    }
    setSaving(false);
  }, [activeSection]);

  const patchFlags = useCallback(async (flags: Record<string, boolean>) => {
    await fetch("/api/settings/feature-flags", {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(flags),
    });
  }, []);

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
          description: err instanceof Error ? err.message : "Probá con un archivo más chico o en otro formato.",
        });
      } finally {
        setUploadingField(null);
      }
    };

  // ── Search & Overview ──────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [showOverview, setShowOverview] = useState(true);

  // ── Completion tracking ────────────────────────────────────────────────────
  const sectionCompletion = useMemo(() => {
    const check = (vals: unknown[]) => {
      const filled = vals.filter(v => v !== "" && v !== null && v !== undefined && v !== false).length;
      return Math.round((filled / Math.max(vals.length, 1)) * 100);
    };
    return {
      business: check([businessName, businessPhone, businessAddress, razonSocial, ruc, businessEmail, logoUrl, description, hours]),
      security: check([storedAdminPw !== "admin2024" ? "changed" : ""]),
      system: check([dateFormat, timeFormat, String(taxRate)]),
      sales: check([sunatRuc, sunatDenominacion, sunatDireccion, invoiceFooterText]),
      inventory: check([defaultUnit, String(globalMinStock), fefoEnabled ? "yes" : ""]),
      cash: check([cashEnabled ? "yes" : "", yapeEnabled ? "yes" : ""]),
      delivery: check([deliveryZones.length > 0 ? "yes" : ""]),
      notifications: check([smtpHost, smtpUser, whatsappApiToken]),
      integrations: check([sunatProvider !== "none" ? "yes" : "", googleAnalyticsId]),
      appearance: check([primaryColor, secondaryColor, slogan]),
      audit: check([String(logRetentionDays)]),
      backup: check([backupSchedule !== "none" ? "yes" : "", lastBackupAt]),
      subscription: check([planName]),
      modules: 100,
      shortcuts: customShortcuts.length > 0 ? 100 : 0,
      storefront: 100,
    } as Record<SectionId, number>;
  }, [businessName, businessPhone, businessAddress, razonSocial, ruc, businessEmail, logoUrl, description, hours, storedAdminPw, dateFormat, timeFormat, taxRate, sunatRuc, sunatDenominacion, sunatDireccion, invoiceFooterText, defaultUnit, globalMinStock, fefoEnabled, cashEnabled, yapeEnabled, deliveryZones.length, smtpHost, smtpUser, whatsappApiToken, sunatProvider, googleAnalyticsId, primaryColor, secondaryColor, slogan, logRetentionDays, backupSchedule, lastBackupAt, planName, customShortcuts.length]);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return SECTION_META;
    const q = searchQuery.toLowerCase();
    return SECTION_META.filter(s => s.title.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q));
  }, [searchQuery]);

  const overallCompletion = useMemo(() => {
    const vals = Object.values(sectionCompletion);
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [sectionCompletion]);

  // Próximo paso del setup guiado: 1ª sección prioritaria aún incompleta.
  const nextStep = useMemo(() => {
    const id = SETUP_PRIORITY.find((s) => (sectionCompletion[s] ?? 0) < 100);
    return id ? SECTION_META.find((m) => m.id === id) ?? null : null;
  }, [sectionCompletion]);

  // ── Render loading state ────────────────────────────────────────────────────

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-6">
          <div className="flex items-center gap-4"><div className="h-12 w-12 bg-gray-200 dark:bg-surface rounded-xl" /><div className="flex-1 space-y-2"><div className="h-5 bg-gray-200 dark:bg-surface rounded w-1/3" /><div className="h-3 bg-gray-200 dark:bg-surface rounded w-2/3" /></div></div>
        </div>
      ))}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION RENDERERS (15 sections)
  // ══════════════════════════════════════════════════════════════════════════════

  const renderModules = () => (
    <div className="space-y-6">
      <SectionCard title="Módulos activos" desc="Controla qué módulos ves en tu panel">
        <p className="text-sm text-[var(--text-secondary)] dark:text-muted">Activa, oculta o limpia datos de ejemplo por módulo. Los cambios se aplican inmediatamente.</p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-module-manager"))}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors mt-2"
        >
          <Layers className="h-4 w-4" /> Abrir gestión de módulos
        </button>
      </SectionCard>
    </div>
  );

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
      <div className="space-y-6">
        <SectionCard title="Mis accesos directos" desc="Aparecen como favoritos en tu barra lateral (máx. 6)">
          {customShortcuts.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)] dark:text-muted text-center py-4">No tienes accesos directos aún. Agrega uno para navegar más rápido.</p>
          )}
          <div className="space-y-3">
            {customShortcuts.map(sc => (
              <div key={sc.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-surface rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                <Zap className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" />
                <input
                  value={sc.label}
                  onChange={e => updateShortcut(sc.id, "label", e.target.value)}
                  className="flex-1 px-2 py-1.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)]"
                  placeholder="Nombre del acceso"
                />
                <select
                  value={sc.tabId}
                  onChange={e => updateShortcut(sc.id, "tabId", e.target.value)}
                  className="px-2 py-1.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)]"
                >
                  {availableTabs.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button onClick={() => removeShortcut(sc.id)} className="p-1.5 rounded-lg text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-500)] transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {customShortcuts.length < 6 && (
            <button onClick={addShortcut} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:text-primary hover:border-primary transition-colors mt-2">
              <Plus className="h-4 w-4" /> Agregar acceso directo
            </button>
          )}
        </SectionCard>
        <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/40 rounded-xl p-3">
          <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-medium">Los accesos directos aparecen en la sección &quot;Favoritos&quot; de tu barra lateral. Puedes agregar hasta 6.</p>
        </div>
      </div>
    );
  };

  const renderBusiness = () => (
    <div className="space-y-6">
      {/* Store mode selector */}
      <SectionCard title="Modo de tienda" desc="Cómo reciben pedidos tus clientes">
        <div className="grid grid-cols-2 gap-3">
          {(["whatsapp", "checkout"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={cn(
              "flex flex-col items-center gap-2 py-5 px-3 rounded-xl border-2 transition-all",
              mode === m ? (m === "whatsapp" ? "border-[var(--data-success-500)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" : "border-primary bg-primary/5") : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-gray-300"
            )}>
              {m === "whatsapp" ? <MessageCircle className={cn("h-8 w-8", mode === m ? "text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]")} /> : <ShoppingCart className={cn("h-8 w-8", mode === m ? "text-primary" : "text-[var(--text-tertiary)]")} />}
              <span className={cn("font-bold text-sm", mode === m ? (m === "whatsapp" ? "text-[var(--data-success-500)]" : "text-primary") : "text-[var(--text-tertiary)]")}>{m === "whatsapp" ? "WhatsApp" : "Checkout"}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Business identity */}
      <SectionCard title="Identidad del Negocio" desc="Datos legales y de contacto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><FieldLabel icon={<Store className="h-3.5 w-3.5" />}>Nombre comercial</FieldLabel><TextInput value={businessName} onChange={setBusinessName} /></div>
          <div><FieldLabel icon={<FileText className="h-3.5 w-3.5" />}>Razón social</FieldLabel><TextInput value={razonSocial} onChange={setRazonSocial} placeholder="Inversiones San Martín S.A.C." /></div>
          <div><FieldLabel icon={<Hash className="h-3.5 w-3.5" />}>RUC</FieldLabel><TextInput value={ruc} onChange={setRuc} placeholder="20123456789" mono /></div>
          <div><FieldLabel icon={<Phone className="h-3.5 w-3.5" />}>WhatsApp</FieldLabel><TextInput value={businessPhone} onChange={setBusinessPhone} placeholder="51929340532" mono /></div>
          <div><FieldLabel icon={<Mail className="h-3.5 w-3.5" />}>Correo del negocio</FieldLabel><TextInput value={businessEmail} onChange={setBusinessEmail} placeholder="ventas@bodega.pe" type="email" /></div>
          <div>
            <FieldLabel icon={<Store className="h-3.5 w-3.5" />}>Tipo de negocio</FieldLabel>
            <SelectInput value={businessType} onChange={setBusinessType} options={[
              { value: "bodega", label: "Bodega" }, { value: "minimarket", label: "Minimarket" },
              { value: "tienda", label: "Tienda" }, { value: "restaurante", label: "Restaurante" },
            ]} />
          </div>
        </div>
      </SectionCard>

      {/* Location */}
      <SectionCard title="Ubicación" desc="Dirección y zona de entrega">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <FieldLabel icon={<MapPin className="h-3.5 w-3.5" />}>Dirección</FieldLabel>
            <div className="flex gap-2">
              <div className="flex-1"><TextInput value={businessAddress} onChange={setBusinessAddress} /></div>
              <button onClick={() => setShowMapPicker(true)} className="px-3 py-2 rounded-lg text-xs font-bold text-[var(--data-success-500)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] border border-[var(--data-success-500)]/30 transition-colors shrink-0">
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
                className="px-3 py-2 rounded-lg text-xs font-bold text-[var(--data-success-500)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] border border-[var(--data-success-500)]/30 transition-colors shrink-0 flex items-center gap-1.5"
              >
                <MapPin className="h-4 w-4" /> Mi ubicación
              </button>
            </div>
            {businessLat && businessLon && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-mono mt-1">GPS: {businessLat.toFixed(5)}, {businessLon.toFixed(5)}</p>}
          </div>
          <div><FieldLabel icon={<Truck className="h-3.5 w-3.5" />}>Zona de delivery</FieldLabel><TextInput value={deliveryZone} onChange={setDeliveryZone} /></div>
          <div><FieldLabel icon={<Clock className="h-3.5 w-3.5" />}>Horario</FieldLabel><TextInput value={hours} onChange={setHours} placeholder="Lun - Sáb: 7am - 9pm" /></div>
        </div>
        <div><FieldLabel icon={<AlignLeft className="h-3.5 w-3.5" />}>Descripción</FieldLabel>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
        </div>
      </SectionCard>

      {/* ─── Identidad visual: 3 imágenes (Logo + Portada + Banner) ─── */}
      <SectionCard
        title="Identidad visual"
        desc="Subí 3 imágenes que definen cómo se ve tu negocio en el marketplace y en tu panel"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          />
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

      {/* Currency & timezone */}
      <SectionCard title="Regional">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel icon={<DollarSign className="h-3.5 w-3.5" />}>Moneda</FieldLabel>
            <SelectInput value={currency} onChange={setCurrency} options={[
              { value: "PEN", label: "S/ — Sol peruano" }, { value: "USD", label: "$ — Dólar" },
            ]} />
          </div>
          <div>
            <FieldLabel icon={<Globe className="h-3.5 w-3.5" />}>Zona horaria</FieldLabel>
            <SelectInput value={timezone} onChange={setTimezone} options={[
              { value: "America/Lima", label: "America/Lima (PET)" }, { value: "America/Bogota", label: "America/Bogotá (COT)" },
              { value: "America/Santiago", label: "America/Santiago (CLT)" }, { value: "America/Mexico_City", label: "America/Mexico City (CST)" },
            ]} />
          </div>
        </div>
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "business"} onClick={() => patch({
        mode, businessName, businessPhone, businessAddress, businessLat, businessLon,
        logoUrl, coverUrl, bannerUrl, description, hours, deliveryZone, razonSocial, ruc, businessEmail,
        currency, timezone, businessType, socialLinks,
      }).then(() => onModeChange(mode))} />
    </div>
  );

  const renderSecurity = () => (
    <div className="space-y-6">
      {/* Current credentials display */}
      <SectionCard title="Credenciales de acceso" desc="Usuario y contraseña para iniciar sesión en el panel">
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-surface border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <div className="flex items-center gap-2 mb-1.5">
                <User className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">Usuario</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--text-primary)] font-mono">admin</span>
                <button type="button" onClick={() => { navigator.clipboard.writeText("admin"); }} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Copiar usuario">
                  <Copy className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                </button>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-surface border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <div className="flex items-center gap-2 mb-1.5">
                <Key className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">Contraseña</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--text-primary)] font-mono">{showCredPw ? storedAdminPw : "••••••••"}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setShowCredPw(v => !v)} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title={showCredPw ? "Ocultar" : "Mostrar"}>
                    {showCredPw ? <EyeOff className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /> : <Eye className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />}
                  </button>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(storedAdminPw); }} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Copiar contraseña">
                    <Copy className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          {/* Share credentials button */}
          <button
            type="button"
            onClick={() => {
              const text = `🔐 Credenciales de acceso al panel\n\n👤 Usuario: admin\n🔑 Contraseña: ${storedAdminPw}\n🌐 Link: ${window.location.origin}/admin/login`;
              if (navigator.share) {
                // navigator.share() rechaza la promesa si el user cancela
                // el bottom-sheet del browser — silencio aceptable (best-effort).
                navigator.share({ title: "Credenciales del Panel", text }).catch(() => { /* user cancelled share */ });
              } else {
                navigator.clipboard.writeText(text);
                alert("Credenciales copiadas al portapapeles");
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/5 transition-colors"
          >
            <Send className="h-4 w-4" /> Compartir credenciales
          </button>
          {storedAdminPw === "admin2024" && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]">
              <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)] shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-medium">Estás usando la contraseña por defecto. Te recomendamos cambiarla abajo.</p>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Password change */}
      <SectionCard title="Cambiar contraseña" desc="Contraseña de acceso al panel de administración">
        <form onSubmit={async (e) => {
          e.preventDefault(); setPwChangeError("");
          if (currentPwInput !== storedAdminPw) { setPwChangeError("La contraseña actual es incorrecta"); return; }
          if (newPw.length < 4) { setPwChangeError("Mínimo 4 caracteres"); return; }
          if (newPw !== confirmPw) { setPwChangeError("Las contraseñas no coinciden"); return; }
          await patch({ adminPassword: newPw });
          setStoredAdminPw(newPw); setCurrentPwInput(""); setNewPw(""); setConfirmPw("");
          await fetch("/api/auth/login", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ password: newPw }) });
        }} className="space-y-3">
          <div><FieldLabel icon={<Lock className="h-3.5 w-3.5" />}>Contraseña actual</FieldLabel><TextInput value={currentPwInput} onChange={setCurrentPwInput} type="password" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Nueva contraseña</FieldLabel><TextInput value={newPw} onChange={setNewPw} type="password" placeholder="Mínimo 4 caracteres" /></div>
            <div><FieldLabel>Confirmar</FieldLabel><TextInput value={confirmPw} onChange={setConfirmPw} type="password" /></div>
          </div>
          {/* Password strength bar */}
          {newPw && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map(i => {
                  const strength = (newPw.length >= 4 ? 1 : 0) + (newPw.length >= 8 ? 1 : 0) + (/[A-Z]/.test(newPw) ? 1 : 0) + (/[0-9]/.test(newPw) ? 1 : 0);
                  return <div key={i} className={cn("h-1.5 flex-1 rounded-full", i <= strength ? (strength <= 1 ? "bg-[var(--data-error-500)]" : strength <= 2 ? "bg-[var(--data-warning-500)]" : strength <= 3 ? "bg-[var(--accent-soft)]" : "bg-[var(--accent-soft)]") : "bg-gray-200 dark:bg-surface")} />;
                })}
              </div>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{newPw.length < 4 ? "Muy corta" : newPw.length < 8 ? "Aceptable" : "Fuerte"}</p>
            </div>
          )}
          {pwChangeError && <p className="text-xs text-[var(--data-error-500)] font-semibold">{pwChangeError}</p>}
          <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            <Lock className="h-4 w-4" /> Cambiar contraseña
          </button>
        </form>
      </SectionCard>

      {/* Maintenance mode */}
      <SectionCard title="Modo vacaciones / mantenimiento" desc="Bloquea compras mostrando un banner">
        <Toggle enabled={maintenanceMode} onChange={async v => {
          setMaintenanceMode(v);
          const msg = v && !maintenanceMsg ? "Estamos de vacaciones. ¡Volvemos pronto!" : maintenanceMsg;
          if (v && !maintenanceMsg) setMaintenanceMsg(msg);
          await fetch("/api/settings", { method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ maintenanceMode: v, maintenanceMessage: msg }) });
        }} label={maintenanceMode ? "Modo activo — tienda bloqueada" : "Desactivado"} desc="Los clientes ven el catálogo pero no pueden comprar" />
        {maintenanceMode && (
          <div className="space-y-2">
            <FieldLabel>Mensaje para clientes</FieldLabel>
            <TextInput value={maintenanceMsg} onChange={setMaintenanceMsg} placeholder="Ej: Estamos de vacaciones. Volvemos el lunes." />
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]">
              <span className="text-lg">🏖</span>
              <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-medium flex-1">{maintenanceMsg || "Vista previa..."}</p>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Bypass login — warn */}
      <SectionCard title="Configuración de acceso">
        <Toggle enabled={bypassLogin} onChange={async v => {
          setBypassLogin(v);
          await fetch("/api/settings", { method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ adminBypassLogin: v }) });
        }} label="Acceso sin login" desc="Permite entrar al panel sin credenciales" danger />
        {bypassLogin && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]">
            <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)] shrink-0 mt-0.5" />
            <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-medium">⚠️ RIESGO DE SEGURIDAD: Cualquier persona podrá acceder al panel de administración.</p>
          </div>
        )}
      </SectionCard>

      {/* Nav links */}
      <SectionCard title="Navegación del sitio" desc="Orden y visibilidad del menú">
        <div className="space-y-2">
          {navLinks.map((link, idx) => (
            <div key={link.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-surface rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <div className="flex flex-col gap-0.5">
                <button disabled={idx === 0} onClick={() => { const n = [...navLinks]; [n[idx], n[idx - 1]] = [n[idx - 1], n[idx]]; setNavLinks(n); }} className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-25"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button disabled={idx === navLinks.length - 1} onClick={() => { const n = [...navLinks]; [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; setNavLinks(n); }} className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-25"><ArrowDown className="h-3.5 w-3.5" /></button>
              </div>
              <span className="flex-1 font-semibold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)]">{NAV_LABEL[link.id] || link.id}</span>
              <button onClick={() => setNavLinks(prev => prev.map((l, i) => i === idx ? { ...l, visible: !l.visible } : l))} className={cn("p-1.5 rounded-lg", link.visible ? "text-primary bg-primary/10" : "text-[var(--text-tertiary)]")}>
                {link.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "security"} onClick={() => patch({ navLinks, maintenanceMode, maintenanceMessage: maintenanceMsg })} />
    </div>
  );

  const renderSystem = () => (
    <div className="space-y-6">
      <SectionCard title="Formato y regional" desc="Cómo se muestran fechas, horas y números">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel icon={<Calendar className="h-3.5 w-3.5" />}>Formato de fecha</FieldLabel>
            <SelectInput value={dateFormat} onChange={setDateFormat} options={[
              { value: "DD/MM/YYYY", label: "DD/MM/YYYY (Perú)" }, { value: "MM/DD/YYYY", label: "MM/DD/YYYY (USA)" },
              { value: "YYYY-MM-DD", label: "YYYY-MM-DD (ISO)" },
            ]} />
          </div>
          <div>
            <FieldLabel icon={<Timer className="h-3.5 w-3.5" />}>Formato de hora</FieldLabel>
            <SelectInput value={timeFormat} onChange={setTimeFormat} options={[
              { value: "24h", label: "24 horas (14:30)" }, { value: "12h", label: "12 horas (2:30 PM)" },
            ]} />
          </div>
          <div><FieldLabel icon={<Hash className="h-3.5 w-3.5" />}>Decimales en precios</FieldLabel><NumberInput value={decimals} onChange={setDecimals} min={0} max={4} /></div>
          <div><FieldLabel icon={<Calendar className="h-3.5 w-3.5" />}>Inicio año fiscal (mes)</FieldLabel><NumberInput value={fiscalYearStart} onChange={setFiscalYearStart} min={1} max={12} suffix="mes" /></div>
        </div>
      </SectionCard>

      <SectionCard title="Impuestos" desc="Configuración del IGV / impuesto general">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel icon={<Percent className="h-3.5 w-3.5" />}>Tasa de IGV</FieldLabel>
            <NumberInput value={taxRate} onChange={setTaxRate} min={0} max={100} step={0.1} suffix="%" />
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1">Hoy es 18% en Perú. Se usa para calcular totales en comprobantes.</p>
          </div>
        </div>
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "system"} onClick={() => patch({ dateFormat, timeFormat, decimals, taxRate, fiscalYearStart })} />
    </div>
  );

  const renderSales = () => (
    <div className="space-y-6">
      <SectionCard title="Datos del emisor SUNAT" desc="Aparecen en facturas y boletas">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><FieldLabel icon={<Hash className="h-3.5 w-3.5" />}>RUC del emisor</FieldLabel><TextInput value={sunatRuc} onChange={setSunatRuc} placeholder="20123456789" mono /></div>
          <div><FieldLabel icon={<FileText className="h-3.5 w-3.5" />}>Denominación</FieldLabel><TextInput value={sunatDenominacion} onChange={setSunatDenominacion} placeholder="Inversiones San Martín S.A.C." /></div>
          <div className="sm:col-span-2"><FieldLabel icon={<MapPin className="h-3.5 w-3.5" />}>Dirección fiscal</FieldLabel><TextInput value={sunatDireccion} onChange={setSunatDireccion} placeholder="Jr. San Martín 123, Pucallpa" /></div>
        </div>
      </SectionCard>

      <SectionCard title="Series de comprobantes" desc="Prefijo y correlativo inicial">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(invoiceSeries).map(([key, val]) => (
            <div key={key}>
              <FieldLabel>{key === "factura" ? "Factura" : key === "boleta" ? "Boleta" : key === "ncFactura" ? "NC Factura" : "NC Boleta"}</FieldLabel>
              <TextInput value={val} onChange={v => setInvoiceSeries(p => ({ ...p, [key]: v }))} mono />
              <div className="mt-1">
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Inicio: </span>
                <input type="number" min={1} value={invoiceStart[val] || 1} onChange={e => setInvoiceStart(p => ({ ...p, [val]: Number(e.target.value) }))} className="w-20 px-2 py-1 text-xs font-mono rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface outline-none" />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Tipos de comprobante habilitados">
        <div className="flex flex-wrap gap-2">
          {["factura", "boleta", "ticket", "nota_venta"].map(t => {
            const active = enabledDocTypes.includes(t);
            return (
              <button key={t} onClick={() => {
                const types = enabledDocTypes.split(",").filter(Boolean);
                setEnabledDocTypes(active ? types.filter(x => x !== t).join(",") : [...types, t].join(","));
              }} className={cn("px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all", active ? "border-primary bg-primary/10 text-primary" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-gray-300")}>
                {active ? <Check className="h-3.5 w-3.5 inline mr-1.5" /> : null}
                {t === "nota_venta" ? "Nota de venta" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Descuentos y redondeo">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel icon={<Percent className="h-3.5 w-3.5" />}>Descuento máximo</FieldLabel>
            <NumberInput value={maxDiscountPercent} onChange={setMaxDiscountPercent} min={0} max={100} suffix="%" />
          </div>
          <div>
            <FieldLabel>Regla de redondeo</FieldLabel>
            <SelectInput value={roundingMode} onChange={setRoundingMode} options={[
              { value: "none", label: "Sin redondeo" }, { value: "0.10", label: "Redondear a S/ 0.10" }, { value: "0.50", label: "Redondear a S/ 0.50" },
            ]} />
          </div>
        </div>
        <Toggle enabled={discountRequiresAuth} onChange={setDiscountRequiresAuth} label="Descuentos requieren autorización" desc="Un admin debe aprobar descuentos mayores al 10%" />
      </SectionCard>

      <SectionCard title="Pie de comprobante">
        <FieldLabel>Texto legal / agradecimiento</FieldLabel>
        <textarea value={invoiceFooterText} onChange={e => setInvoiceFooterText(e.target.value)} rows={2} placeholder="Gracias por su compra. Conserve este comprobante." className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "sales"} onClick={() => patch({
        invoiceSeries, invoiceStart, enabledDocTypes, roundingMode, maxDiscountPercent,
        discountRequiresAuth, invoiceFooterText, sunatRuc, sunatDenominacion, sunatDireccion,
      })} />
    </div>
  );

  const renderInventory = () => (
    <div className="space-y-6">
      <SectionCard title="Configuración general" desc="Unidades, stock mínimo y alertas">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel icon={<Package className="h-3.5 w-3.5" />}>Unidad por defecto</FieldLabel>
            <SelectInput value={defaultUnit} onChange={setDefaultUnit} options={[
              { value: "unidad", label: "Unidad" }, { value: "kg", label: "Kilogramo" },
              { value: "litro", label: "Litro" }, { value: "caja", label: "Caja" },
              { value: "docena", label: "Docena" }, { value: "paquete", label: "Paquete" },
            ]} />
          </div>
          <div><FieldLabel icon={<AlertTriangle className="h-3.5 w-3.5" />}>Stock mínimo global</FieldLabel><NumberInput value={globalMinStock} onChange={setGlobalMinStock} min={0} suffix="unidades" /></div>
        </div>
      </SectionCard>

      <SectionCard title="Canales de alerta de stock" desc="Dónde recibes notificaciones de stock bajo">
        <div className="flex flex-wrap gap-2">
          {[{ id: "dashboard", label: "Dashboard", icon: <Monitor className="h-3.5 w-3.5" /> },
            { id: "email", label: "Email", icon: <Mail className="h-3.5 w-3.5" /> },
            { id: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="h-3.5 w-3.5" /> },
            { id: "push", label: "Push", icon: <Bell className="h-3.5 w-3.5" /> },
          ].map(ch => {
            const active = stockAlertChannels.includes(ch.id);
            return (
              <button key={ch.id} onClick={() => {
                const chs = stockAlertChannels.split(",").filter(Boolean);
                setStockAlertChannels(active ? chs.filter(x => x !== ch.id).join(",") : [...chs, ch.id].join(","));
              }} className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all", active ? "border-primary bg-primary/10 text-primary" : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-gray-300")}>
                {ch.icon} {ch.label}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="FEFO (Primero en vencer, primero en salir)">
        <Toggle enabled={fefoEnabled} onChange={setFefoEnabled} label="Sistema FEFO activo" desc="Los productos más próximos a vencer se despachan primero" />
        {fefoEnabled && (
          <div><FieldLabel>Días de alerta antes del vencimiento</FieldLabel><NumberInput value={fefoAlertDays} onChange={setFefoAlertDays} min={1} max={365} suffix="días" /></div>
        )}
      </SectionCard>

      <SectionCard title="Motivos de ajuste de inventario" desc="Razones disponibles al hacer ajustes manuales">
        <div className="space-y-2">
          {adjustReasons.map((reason, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <TextInput value={reason} onChange={v => setAdjustReasons(p => p.map((r, i) => i === idx ? v : r))} />
              <button onClick={() => setAdjustReasons(p => p.filter((_, i) => i !== idx))} className="p-2 rounded-lg text-[var(--data-error-500)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)]"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button onClick={() => setAdjustReasons(p => [...p, ""])} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"><Plus className="h-3.5 w-3.5" /> Agregar motivo</button>
        </div>
      </SectionCard>

      <SectionCard title="Conteo de inventario">
        <FieldLabel>Frecuencia de conteo programado</FieldLabel>
        <SelectInput value={inventoryCountFreq} onChange={setInventoryCountFreq} options={[
          { value: "weekly", label: "Semanal" }, { value: "monthly", label: "Mensual" }, { value: "quarterly", label: "Trimestral" },
        ]} />
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "inventory"} onClick={() => patch({
        defaultUnit, globalMinStock, stockAlertChannels, adjustReasons,
        fefoEnabled, fefoAlertDays, inventoryCountFreq,
      })} />
    </div>
  );

  const renderCash = () => (
    <div className="space-y-6">
      <SectionCard title="Apertura / cierre de caja">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><FieldLabel icon={<DollarSign className="h-3.5 w-3.5" />}>Monto base de apertura</FieldLabel><NumberInput value={cashOpeningAmount} onChange={setCashOpeningAmount} min={0} suffix="soles" /></div>
          <div><FieldLabel icon={<AlertTriangle className="h-3.5 w-3.5" />}>Alerta de exceso en caja</FieldLabel><NumberInput value={cashAlertMax} onChange={setCashAlertMax} min={0} suffix="soles" /></div>
          <div><FieldLabel icon={<Timer className="h-3.5 w-3.5" />}>Cierre automático</FieldLabel><TextInput value={autoCloseTime} onChange={setAutoCloseTime} placeholder="22:00 (vacío = manual)" /></div>
        </div>
      </SectionCard>

      <SectionCard title="Métodos de pago" desc="Configura los métodos que aceptas">
        <div className="space-y-3">
          <Toggle enabled={cashEnabled} onChange={setCashEnabled} label="Efectivo" desc="Pago contra entrega" />
          <Toggle enabled={yapeEnabled} onChange={setYapeEnabled} label="Yape" desc="Pago con QR de Yape" />
          {yapeEnabled && (
            <div className="pl-4 border-l-2 border-[var(--rule-base)] space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><FieldLabel>Titular</FieldLabel><TextInput value={yapeName} onChange={setYapeName} placeholder="Juan Pérez" /></div>
                <div><FieldLabel>Número</FieldLabel><TextInput value={yapePhone} onChange={setYapePhone} placeholder="987654321" mono /></div>
              </div>
              <div>
                <FieldLabel>QR de Yape</FieldLabel>
                <button onClick={() => yapeImgRef.current?.click()} className="w-full py-3 rounded-lg border-2 border-dashed border-[var(--rule-base)] hover:border-[var(--rule-base)]0 text-sm font-semibold text-[var(--text-secondary)] bg-[var(--surface-sunken)] transition-colors"><Upload className="h-4 w-4 inline mr-1.5" />Subir QR</button>
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
                <div><FieldLabel>Número</FieldLabel><TextInput value={plinPhone} onChange={setPlinPhone} mono /></div>
              </div>
              <div>
                <button onClick={() => plinImgRef.current?.click()} className="w-full py-3 rounded-lg border-2 border-dashed border-[var(--data-success-500)]/30 hover:border-[var(--data-success-500)]/30 text-sm font-semibold text-[var(--data-success-500)] bg-[var(--accent-soft)] transition-colors"><Upload className="h-4 w-4 inline mr-1.5" />Subir QR Plin</button>
                <input ref={plinImgRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload(setPlinImage, "plin", "payments")} />
                {plinImage && <div className="mt-2 flex items-center gap-3 p-2 bg-[var(--accent-soft)] rounded-lg"><Image src={plinImage} alt="QR" width={64} height={64} className="rounded-lg object-contain border" unoptimized /><button onClick={() => setPlinImage("")} className="text-xs text-[var(--data-error-500)]">Quitar</button></div>}
              </div>
            </div>
          )}
          <Toggle enabled={transferEnabled} onChange={setTransferEnabled} label="Transferencia bancaria" desc="Deposito o transferencia" />
          {transferEnabled && (
            <div className="pl-4 border-l-2 border-[var(--data-success-500)]/30 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><FieldLabel icon={<Landmark className="h-3.5 w-3.5" />}>Banco</FieldLabel><TextInput value={transferBankName} onChange={setTransferBankName} placeholder="BCP" /></div>
                <div><FieldLabel>N° de cuenta</FieldLabel><TextInput value={transferAccountNum} onChange={setTransferAccountNum} mono /></div>
                <div><FieldLabel>Titular</FieldLabel><TextInput value={transferAccountHolder} onChange={setTransferAccountHolder} /></div>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Política de devoluciones">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><FieldLabel>Plazo máximo para devolver</FieldLabel><NumberInput value={returnPolicyDays} onChange={setReturnPolicyDays} min={0} suffix="días" /></div>
          <div><FieldLabel>Monto máximo sin autorización</FieldLabel><NumberInput value={returnMaxNoAuth} onChange={setReturnMaxNoAuth} min={0} suffix="soles" /></div>
        </div>
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "cash"} onClick={() => patch({
        cashEnabled, yapeEnabled, yapeImage, yapeName, yapePhone,
        plinEnabled, plinImage, plinName, plinPhone,
        transferEnabled, transferBankName, transferAccountNum, transferAccountHolder,
        cashOpeningAmount, cashAlertMax, returnPolicyDays, returnMaxNoAuth, autoCloseTime,
      })} />
    </div>
  );

  const renderDelivery = () => (
    <div className="space-y-6">
      <SectionCard title="Zonas de delivery" desc="Define zonas con tarifas y tiempos diferentes">
        <div className="space-y-2">
          {deliveryZones.map((zone, idx) => (
            <div key={idx} className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-surface rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <input value={zone.name} onChange={e => setDeliveryZones(p => p.map((z, i) => i === idx ? { ...z, name: e.target.value } : z))} placeholder="Nombre" className="px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm bg-[var(--surface-raised)] outline-none" />
                <div className="flex items-center gap-1">
                  <input type="number" value={zone.fee} onChange={e => setDeliveryZones(p => p.map((z, i) => i === idx ? { ...z, fee: Number(e.target.value) } : z))} min={0} className="w-full px-2 py-1.5 rounded-lg border border-[var(--rule-base)] text-sm font-mono bg-white dark:bg-[var(--color-card)] outline-none" />
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">S/</span>
                </div>
                <div className="flex items-center gap-1">
                  <input type="number" value={zone.estimatedMin} onChange={e => setDeliveryZones(p => p.map((z, i) => i === idx ? { ...z, estimatedMin: Number(e.target.value) } : z))} min={0} className="w-full px-2 py-1.5 rounded-lg border border-[var(--rule-base)] text-sm font-mono bg-white dark:bg-[var(--color-card)] outline-none" />
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">min</span>
                </div>
              </div>
              <button onClick={() => setDeliveryZones(p => p.filter((_, i) => i !== idx))} className="p-1.5 rounded-lg text-[var(--data-error-500)] hover:text-[var(--data-error-500)]"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button onClick={() => setDeliveryZones(p => [...p, { name: "", fee: 0, estimatedMin: 30 }])} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"><Plus className="h-3.5 w-3.5" /> Agregar zona</button>
        </div>
      </SectionCard>

      <SectionCard title="Configuración general">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><FieldLabel icon={<DollarSign className="h-3.5 w-3.5" />}>Envío gratis desde</FieldLabel><NumberInput value={freeDeliveryMin} onChange={setFreeDeliveryMin} min={0} suffix="soles (0 = no aplica)" /></div>
          <div><FieldLabel icon={<MapPin className="h-3.5 w-3.5" />}>Radio máximo de cobertura</FieldLabel><NumberInput value={deliveryMaxRadius} onChange={setDeliveryMaxRadius} min={1} suffix="km" /></div>
        </div>
      </SectionCard>

      <SectionCard title="Horarios de delivery">
        <div className="grid grid-cols-3 gap-3">
          <div><FieldLabel>Mañana</FieldLabel><TextInput value={deliveryHours.morning || ""} onChange={v => setDeliveryHours(p => ({ ...p, morning: v }))} placeholder="8:00-12:00" /></div>
          <div><FieldLabel>Tarde</FieldLabel><TextInput value={deliveryHours.afternoon || ""} onChange={v => setDeliveryHours(p => ({ ...p, afternoon: v }))} placeholder="12:00-18:00" /></div>
          <div><FieldLabel>Noche</FieldLabel><TextInput value={deliveryHours.evening || ""} onChange={v => setDeliveryHours(p => ({ ...p, evening: v }))} placeholder="18:00-21:00" /></div>
        </div>
      </SectionCard>

      <SectionCard title="Repartidores" desc="Equipo de delivery">
        <div className="space-y-2">
          {riders.map((rider, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-surface rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <input value={rider.name} onChange={e => setRiders(p => p.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))} placeholder="Nombre" className="px-2 py-1.5 rounded-lg border border-[var(--rule-base)] text-sm bg-white dark:bg-[var(--color-card)] outline-none" />
                <input value={rider.phone} onChange={e => setRiders(p => p.map((r, i) => i === idx ? { ...r, phone: e.target.value } : r))} placeholder="Teléfono" className="px-2 py-1.5 rounded-lg border border-[var(--rule-base)] text-sm font-mono bg-white dark:bg-[var(--color-card)] outline-none" />
                <input value={rider.zone} onChange={e => setRiders(p => p.map((r, i) => i === idx ? { ...r, zone: e.target.value } : r))} placeholder="Zona" className="px-2 py-1.5 rounded-lg border border-[var(--rule-base)] text-sm bg-white dark:bg-[var(--color-card)] outline-none" />
              </div>
              <button onClick={() => setRiders(p => p.filter((_, i) => i !== idx))} className="p-1.5 text-[var(--data-error-500)] hover:text-[var(--data-error-500)]"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button onClick={() => setRiders(p => [...p, { name: "", phone: "", zone: "" }])} className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Plus className="h-3.5 w-3.5" /> Agregar repartidor</button>
        </div>
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "delivery"} onClick={() => patch({
        deliveryZones, freeDeliveryMin, deliveryMaxRadius, deliveryHours, riders,
      })} />
    </div>
  );

  const renderNotifications = () => (
    <div className="space-y-6">
      <SectionCard title="Configuración SMTP (Email)" desc="Servidor para enviar correos automáticos">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><FieldLabel icon={<Mail className="h-3.5 w-3.5" />}>Servidor SMTP</FieldLabel><TextInput value={smtpHost} onChange={setSmtpHost} placeholder="smtp.gmail.com" /></div>
          <div><FieldLabel>Puerto</FieldLabel><NumberInput value={smtpPort} onChange={setSmtpPort} min={1} max={65535} /></div>
          <div><FieldLabel icon={<User className="h-3.5 w-3.5" />}>Usuario</FieldLabel><TextInput value={smtpUser} onChange={setSmtpUser} placeholder="ventas@bodega.pe" /></div>
          <div><FieldLabel icon={<Key className="h-3.5 w-3.5" />}>Contraseña</FieldLabel><TextInput value={smtpPass} onChange={setSmtpPass} type="password" /></div>
          <div className="sm:col-span-2"><FieldLabel>Email remitente</FieldLabel><TextInput value={smtpFrom} onChange={setSmtpFrom} placeholder="Buleje <ventas@bodega.pe>" /></div>
        </div>
        <StatusDot ok={!!(smtpHost && smtpUser)} label="Email" />
      </SectionCard>

      <SectionCard title="WhatsApp Business API" desc="Para enviar mensajes automáticos a clientes">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><FieldLabel icon={<MessageCircle className="h-3.5 w-3.5" />}>Número de negocio</FieldLabel><TextInput value={whatsappBusinessNum} onChange={setWhatsappBusinessNum} placeholder="51929340532" mono /></div>
          <div><FieldLabel icon={<Key className="h-3.5 w-3.5" />}>Token de API</FieldLabel><TextInput value={whatsappApiToken} onChange={setWhatsappApiToken} type="password" placeholder="EAAx..." /></div>
          <div className="sm:col-span-2"><FieldLabel icon={<Globe className="h-3.5 w-3.5" />}>Webhook URL</FieldLabel><TextInput value={whatsappWebhookUrl} onChange={setWhatsappWebhookUrl} placeholder="https://tu-bodega.com/api/whatsapp/webhook" /></div>
        </div>
        <StatusDot ok={!!(whatsappApiToken && whatsappBusinessNum)} label="WhatsApp" />
      </SectionCard>

      <SectionCard title="Avisos automáticos" desc="Qué notificaciones se envían automáticamente">
        {[{ key: "newOrder", label: "Nuevo pedido recibido" }, { key: "orderReady", label: "Pedido listo para recoger/enviar" },
          { key: "abandonedCart", label: "Carrito abandonado (recordatorio)" }, { key: "lowStock", label: "Stock bajo" },
        ].map(ch => (
          <Toggle key={ch.key} enabled={notifChannels[ch.key] ?? false} onChange={v => setNotifChannels(p => ({ ...p, [ch.key]: v }))} label={ch.label} />
        ))}
      </SectionCard>

      <SectionCard title="Recordatorio de recompra">
        <FieldLabel>Enviar recordatorio si el cliente no compra en</FieldLabel>
        <NumberInput value={reorderReminderDays} onChange={setReorderReminderDays} min={0} suffix="días (0 = desactivado)" />
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "notifications"} onClick={() => patch({
        smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom,
        whatsappApiToken, whatsappBusinessNum, whatsappWebhookUrl,
        notifChannels, reorderReminderDays,
      })} />
    </div>
  );

  const renderIntegrations = () => (
    <div className="space-y-6">
      {/* Status dashboard */}
      <SectionCard title="Estado de integraciones" desc="Vista rápida de qué está conectado">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Yape", ok: yapeEnabled && !!yapeName },
            { label: "Plin", ok: plinEnabled && !!plinName },
            { label: "Transferencia", ok: transferEnabled && !!transferBankName },
            { label: "WhatsApp", ok: !!whatsappApiToken },
            { label: "Email/SMTP", ok: !!smtpHost },
            { label: "SUNAT", ok: sunatProvider !== "none" && !!sunatApiKey },
            { label: "Google Analytics", ok: !!googleAnalyticsId },
          ].map(s => (
            <div key={s.label} className={cn("flex items-center gap-2 p-3 rounded-xl border", s.ok ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30" : "bg-gray-50 dark:bg-surface border-[var(--rule-base)] dark:border-[var(--rule-base)]")}>
              {s.ok ? <Wifi className="h-4 w-4 text-[var(--data-success-500)]" /> : <WifiOff className="h-4 w-4 text-[var(--text-tertiary)]" />}
              <span className={cn("text-xs font-semibold", s.ok ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]")}>{s.label}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Facturación electrónica SUNAT" desc="Conecta con un proveedor para emitir comprobantes">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel>Proveedor</FieldLabel>
            <SelectInput value={sunatProvider} onChange={setSunatProvider} options={[
              { value: "none", label: "No configurado" }, { value: "nubefact", label: "Nubefact" },
              { value: "efact", label: "Efact" }, { value: "otro", label: "Otro" },
            ]} />
          </div>
          {sunatProvider !== "none" && (
            <div><FieldLabel icon={<Key className="h-3.5 w-3.5" />}>API Key</FieldLabel><TextInput value={sunatApiKey} onChange={setSunatApiKey} type="password" /></div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Google Analytics / Tag Manager" desc="Mide tráfico y conversiones">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><FieldLabel icon={<BarChart3 className="h-3.5 w-3.5" />}>ID de Google Analytics (GA4)</FieldLabel><TextInput value={googleAnalyticsId} onChange={setGoogleAnalyticsId} placeholder="G-XXXXXXXXXX" mono /></div>
          <div><FieldLabel>ID de Google Tag Manager</FieldLabel><TextInput value={googleTagManagerId} onChange={setGoogleTagManagerId} placeholder="GTM-XXXXXXX" mono /></div>
        </div>
      </SectionCard>

      {/* Feature flags */}
      <SectionCard title="Feature Flags" desc="Activa o desactiva funcionalidades de la plataforma">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(featureFlags).map(([flag, enabled]) => (
            <Toggle key={flag} enabled={enabled} onChange={async v => {
              setFeatureFlags(p => ({ ...p, [flag]: v }));
              await patchFlags({ [flag]: v });
            }} label={flag.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())} />
          ))}
        </div>
        {Object.keys(featureFlags).length === 0 && (
          <p className="text-xs text-[var(--text-tertiary)] text-center py-4">No hay feature flags cargados</p>
        )}
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "integrations"} onClick={() => patch({
        sunatProvider, sunatApiKey, googleAnalyticsId, googleTagManagerId,
      })} />
    </div>
  );

  const renderAppearance = () => (
    <div className="space-y-6">
      <SectionCard title="Colores de marca" desc="Personaliza los colores de tu tienda">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel>Color primario</FieldLabel>
            <div className="flex items-center gap-2">
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-[var(--rule-base)] cursor-pointer" />
              <TextInput value={primaryColor} onChange={setPrimaryColor} mono />
            </div>
          </div>
          <div>
            <FieldLabel>Color secundario</FieldLabel>
            <div className="flex items-center gap-2">
              <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-[var(--rule-base)] cursor-pointer" />
              <TextInput value={secondaryColor} onChange={setSecondaryColor} mono />
            </div>
          </div>
          <div className="sm:col-span-2"><FieldLabel>Slogan</FieldLabel><TextInput value={slogan} onChange={setSlogan} placeholder="Productos frescos, precios justos" /></div>
        </div>
        {/* Live preview */}
        <div className="mt-4 p-4 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)]" style={{ background: `linear-gradient(135deg, ${primaryColor}15, ${secondaryColor}15)` }}>
          <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] mb-2">Vista previa</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: primaryColor }}>Buleje</div>
            <div><p className="text-sm font-extrabold" style={{ color: primaryColor }}>{businessName}</p><p className="text-xs" style={{ color: secondaryColor }}>{slogan}</p></div>
          </div>
          <div className="mt-3 flex gap-2">
            <span className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: primaryColor }}>Primario</span>
            <span className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: secondaryColor }}>Secundario</span>
          </div>
        </div>
      </SectionCard>

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

      <SaveButton saving={saving} saved={savedSection === "appearance"} onClick={() => patch({ primaryColor, secondaryColor, slogan })} />
    </div>
  );

  const renderAudit = () => (
    <div className="space-y-6">
      <SectionCard title="Retención de logs" desc="Cuánto tiempo se guardan los registros de actividad">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel icon={<Clock className="h-3.5 w-3.5" />}>Mantener logs por</FieldLabel>
            <SelectInput value={String(logRetentionDays)} onChange={v => setLogRetentionDays(Number(v))} options={[
              { value: "30", label: "30 días" }, { value: "60", label: "60 días" },
              { value: "90", label: "90 días" }, { value: "180", label: "6 meses" }, { value: "365", label: "1 año" },
            ]} />
          </div>
          <div>
            <FieldLabel icon={<ClipboardList className="h-3.5 w-3.5" />}>Acciones a registrar</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {[{ id: "sales", label: "Ventas" }, { id: "edits", label: "Ediciones" }, { id: "access", label: "Accesos" }, { id: "queries", label: "Consultas" }].map(a => {
                const active = logActions.includes(a.id);
                return (
                  <button key={a.id} onClick={() => {
                    const acts = logActions.split(",").filter(Boolean);
                    setLogActions(active ? acts.filter(x => x !== a.id).join(",") : [...acts, a.id].join(","));
                  }} className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all", active ? "border-primary bg-primary/10 text-primary" : "border-[var(--rule-base)] text-[var(--text-tertiary)]")}>
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "audit"} onClick={() => patch({ logRetentionDays, logActions })} />
    </div>
  );

  const renderBackup = () => (
    <div className="space-y-6">
      <SectionCard title="Respaldo de datos" desc="Protege tu información con backups regulares">
        {/* Last backup indicator */}
        {(() => {
          const lastDate = lastBackupAt ? new Date(lastBackupAt) : (typeof window !== "undefined" ? (() => { const ls = localStorage.getItem("buleje-last-backup"); return ls ? new Date(ls) : null; })() : null);
          const daysSince = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / 86400000) : null;
          const needsBackup = !lastDate || (daysSince !== null && daysSince > 7);
          return (
            <div className={cn("p-3 rounded-xl border", needsBackup ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border-[var(--data-warning-500)]" : "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30")}>
              <div className="flex items-center gap-2.5">
                {needsBackup ? <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" /> : <CheckCircle className="h-4 w-4 text-[var(--data-success-500)] shrink-0" />}
                <p className="text-xs font-medium">{lastDate ? `Último respaldo: hace ${daysSince} día${daysSince !== 1 ? "s" : ""}` : "No hay respaldos recientes"}</p>
              </div>
            </div>
          );
        })()}
        <div className="grid sm:grid-cols-2 gap-3">
          <button onClick={async () => {
            const ts = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
            const link = document.createElement("a");
            link.href = "/api/backup"; link.download = `bodega-backup-${ts}.json`;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            if (typeof window !== "undefined") localStorage.setItem("buleje-last-backup", new Date().toISOString());
            setLastBackupAt(new Date().toISOString());
          }} className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-teal-200 bg-white dark:bg-[var(--color-card)] hover:bg-teal-50 text-sm font-semibold text-[var(--accent-dark)]">
            <Download className="h-4 w-4" /> Generar respaldo
          </button>
          <button onClick={() => setShowRestoreModal(true)} className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-[var(--data-info-500)] bg-white dark:bg-[var(--color-card)] hover:bg-[var(--data-info-50)] text-sm font-semibold text-[var(--data-info-500)]">
            <Upload className="h-4 w-4" /> Restaurar desde respaldo
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Programación automática" desc="Recordatorios periódicos de backup">
        <SelectInput value={backupSchedule} onChange={v => { setBackupSchedule(v); patch({ backupSchedule: v }); }} options={[
          { value: "none", label: "Ninguno" }, { value: "daily", label: "Diario" }, { value: "weekly", label: "Semanal" },
        ]} />
      </SectionCard>

      {/* Restore modal */}
      {showRestoreModal && (
        <div className="modal-backdrop p-4" onClick={() => !restoring && setShowRestoreModal(false)}>
          <div className="bg-[var(--surface-raised)] rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Restaurar Base de Datos</CardTitle>
              {!restoring && <button onClick={() => setShowRestoreModal(false)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-gray-100"><X className="h-5 w-5" /></button>}
            </div>
            <div className="px-6 py-5 space-y-4">
              {!restoreSuccess && !restoreFile && (
                <>
                  <div className="bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)] shrink-0" />
                      <div><p className="text-sm font-bold text-[var(--data-error-500)]">ADVERTENCIA</p><p className="text-xs text-[var(--data-error-500)] mt-1">Esta acción <strong>sobrescribirá todos los datos actuales</strong>.</p></div>
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={async e => {
                    const file = e.target.files?.[0]; if (!file) return; setRestoreError(null);
                    try { const text = await file.text(); const data = JSON.parse(text);
                      if (!data.products || !data.orders) { setRestoreError("Archivo inválido"); return; }
                      setRestoreFile(file); setRestorePreview({ date: data.exportDate || "?", products: data.products?.length || 0, orders: data.orders?.length || 0, customers: data.customers?.length || 0, size: (file.size / 1024).toFixed(2) + " KB" });
                    } catch { setRestoreError("JSON inválido"); }
                  }} />
                  <button onClick={() => fileInputRef.current?.click()} className="w-full py-8 rounded-lg border-2 border-dashed border-[var(--data-info-500)] bg-[var(--data-info-50)] text-[var(--data-info-500)] hover:border-[var(--data-info-500)] hover:bg-[var(--data-info-100)] transition-colors">
                    <Upload className="h-8 w-8 mx-auto mb-2" /><p className="text-sm font-semibold">Seleccionar archivo .json</p>
                  </button>
                  {restoreError && <p className="text-xs text-[var(--data-error-500)] font-semibold bg-[var(--data-error-50)] p-3 rounded-xl">{restoreError}</p>}
                </>
              )}
              {restoreFile && !restoreSuccess && restorePreview && (
                <div className="bg-gray-50 rounded-xl p-4 border border-[var(--rule-base)]">
                  <p className="text-xs font-bold mb-2">Vista previa</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-[var(--text-secondary)] block">Productos:</span><span className="font-semibold">{restorePreview.products}</span></div>
                    <div><span className="text-[var(--text-secondary)] block">Pedidos:</span><span className="font-semibold">{restorePreview.orders}</span></div>
                    <div><span className="text-[var(--text-secondary)] block">Clientes:</span><span className="font-semibold">{restorePreview.customers}</span></div>
                    <div><span className="text-[var(--text-secondary)] block">Tamaño:</span><span className="font-semibold">{restorePreview.size}</span></div>
                  </div>
                </div>
              )}
              {restoreSuccess && (
                <div className="text-center py-6"><CheckCircle className="h-12 w-12 text-[var(--data-success-500)] mx-auto mb-2" /><p className="text-lg font-bold">¡Restauración exitosa!</p><p className="text-sm text-[var(--text-secondary)]">Recargando...</p></div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--rule-soft)]">
              {!restoreSuccess && (<>
                <button onClick={() => { setShowRestoreModal(false); setRestoreFile(null); setRestorePreview(null); setRestoreError(null); }} disabled={restoring} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-[var(--text-secondary)] hover:bg-gray-100">Cancelar</button>
                {restoreFile && <button onClick={async () => {
                  if (!restoreFile) return; setRestoring(true); setRestoreError(null);
                  // [SECURITY F3] /api/restore aún no implementado — bloqueado hasta
                  // crear endpoint con Zod safeParse + requireAdmin(["admin"]) + dry-run mode.
                  setRestoreError("Función de restauración aún no disponible. Contacta soporte para asistencia manual.");
                  setRestoring(false);
                }} disabled={restoring} className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] disabled:opacity-50 flex items-center gap-2">
                  {restoring ? <><Loader2 className="h-4 w-4 animate-spin" /> Restaurando...</> : <><AlertTriangle className="h-4 w-4" /> Confirmar</>}
                </button>}
              </>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderSubscription = () => <PlanTierSelector />;

  // ── Section renderer map ────────────────────────────────────────────────────

  // ── Renders para las 4 secciones absorbidas desde TabRouter ──────────────
  const renderTeam = () => (
    <div className="space-y-6">
      <TeamTab />
    </div>
  );

  const renderNavDefaults = () => (
    <div className="space-y-6">
      <NavDefaultTabsConfig />
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

  const renderTutorial = () => (
    <div className="space-y-4">
      <SectionCard
        title="Tutorial de bienvenida"
        desc="Volvé a ver el recorrido guiado del panel cuando quieras."
      >
        <button
          onClick={() => {
            onResetTutorial?.();
            onNavigateTab?.("asistente-ia");
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-gray-900 dark:bg-white dark:text-[var(--text-primary)] hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
        >
          <Activity className="h-4 w-4" />
          Repetir tutorial de bienvenida
        </button>
      </SectionCard>
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case "business": return renderBusiness();
      case "security": return renderSecurity();
      case "system": return renderSystem();
      case "sales": return renderSales();
      case "inventory": return renderInventory();
      case "cash": return renderCash();
      case "delivery": return renderDelivery();
      case "notifications": return renderNotifications();
      case "integrations": return renderIntegrations();
      case "appearance": return renderAppearance();
      case "audit": return renderAudit();
      case "backup": return renderBackup();
      case "subscription": return renderSubscription();
      case "modules": return renderModules();
      case "shortcuts": return renderShortcuts();
      case "storefront": return <StorefrontEditor />;
      case "team": return renderTeam();
      case "nav-defaults": return renderNavDefaults();
      case "sidebar-order": return renderSidebarOrder();
      case "tutorial": return renderTutorial();
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // MAIN LAYOUT — overview grid + sidebar + content with animations
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-5">
      <AdminModuleHeader
        title="Configuración"
        description="Personaliza tu tienda, pagos, inventario y más"
        icon={SlidersHorizontal}
        bgTint="bg-slate-50 dark:bg-slate-900/20"
        iconColorClass="text-slate-600 dark:text-slate-400"
      >
        {/* Completion badge */}
        <span className={cn(
          "text-xs font-bold px-2 py-0.5 rounded-full",
          overallCompletion === 100
            ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
            : "bg-primary/10 text-primary"
        )}>
          {overallCompletion}% completo
        </span>
        {/* Search bar */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); if (e.target.value) setShowOverview(true); }}
            placeholder="Buscar configuración..."
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </AdminModuleHeader>

      {/* ── Breadcrumb ── */}
      {!showOverview && (
        <m.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 text-sm">
          <button onClick={() => setShowOverview(true)} className="text-primary hover:text-primary/80 font-semibold transition-colors">
            Configuración
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
          <span className="text-[var(--text-primary)] dark:text-[var(--text-primary)] font-medium">
            {SECTION_META.find(s => s.id === activeSection)?.title}
          </span>
        </m.div>
      )}

      {/* ── Overview Grid / Section Detail ── */}
      <AnimatePresence mode="wait">
        {showOverview ? (
          <m.div
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* Setup guiado — próximo paso accionable (1 click abre la sección) */}
            {nextStep && (
              <button
                type="button"
                onClick={() => { setActiveSection(nextStep.id); setShowOverview(false); setSearchQuery(""); }}
                className="group w-full flex items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 p-4 mb-5 text-left transition-colors"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  {nextStep.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-primary">
                    Próximo paso · {overallCompletion}% completo
                  </span>
                  <span className="block text-base font-bold text-[var(--text-primary)] truncate">
                    Configurá: {nextStep.title}
                  </span>
                  <span className="block text-xs text-[var(--text-secondary)] truncate">{nextStep.desc}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-extrabold text-primary">
                  Completar
                  <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </button>
            )}

            {/* Quick stats bar */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 text-center">
                <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Secciones</p>
                <p className="text-2xl font-extrabold text-[var(--text-primary)]">{SECTION_META.length}</p>
              </div>
              <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 text-center">
                <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Completas</p>
                <p className="text-2xl font-extrabold text-[var(--data-success-500)]">{Object.values(sectionCompletion).filter(v => v === 100).length}</p>
              </div>
              <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 text-center">
                <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Pendientes</p>
                <p className="text-2xl font-extrabold text-[var(--data-warning-500)]">{Object.values(sectionCompletion).filter(v => v < 100).length}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredSections.map((s, i) => (
                <m.div key={s.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <OverviewCard
                    section={s}
                    completionPct={sectionCompletion[s.id] || 0}
                    onClick={() => { setActiveSection(s.id); setShowOverview(false); setSearchQuery(""); }}
                  />
                </m.div>
              ))}
            </div>
            {filteredSections.length === 0 && (
              <div className="text-center py-12">
                <Search className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-3" />
                <p className="text-sm text-[var(--text-secondary)]">No se encontraron secciones para &quot;{searchQuery}&quot;</p>
              </div>
            )}
          </m.div>
        ) : (
          <m.div
            key="section-detail"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex gap-6">
              {/* ── Sidebar navigation ── */}
              <div className={cn(
                "shrink-0 space-y-1",
                showMobileNav
                  ? "fixed inset-0 z-40 bg-[var(--surface-raised)] p-4 overflow-y-auto sm:relative sm:inset-auto sm:z-auto sm:bg-transparent sm:p-0 sm:w-60"
                  : "hidden sm:block w-60"
              )}>
                {showMobileNav && (
                  <div className="flex items-center justify-between mb-4 sm:hidden">
                    <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Secciones</CardTitle>
                    <button onClick={() => setShowMobileNav(false)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-gray-100">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                )}
                {/* Back to overview */}
                <button
                  onClick={() => setShowOverview(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-primary hover:bg-primary/5 mb-2 transition-colors"
                >
                  <ChevronDown className="h-3.5 w-3.5 rotate-90" /> Ver todas las secciones
                </button>

                {SECTION_META.map(s => {
                  const pct = sectionCompletion[s.id] || 0;
                  return (
                    <button
                      key={s.id}
                      onClick={() => { setActiveSection(s.id); setShowMobileNav(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group",
                        activeSection === s.id
                          ? "bg-primary/10 text-primary font-bold "
                          : "text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-accent"
                      )}
                    >
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105", s.color)}>
                        {s.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{s.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="flex-1 h-1 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-[var(--accent-soft)]" : "bg-primary/60")}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] shrink-0">{pct}%</span>
                        </div>
                      </div>
                      {activeSection === s.id && <ChevronRight className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* ── Content area ── */}
              <div className="flex-1 min-w-0">
                {/* Section header */}
                <div className="flex items-center gap-3 mb-5">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", SECTION_META.find(s => s.id === activeSection)?.color)}>
                    {SECTION_META.find(s => s.id === activeSection)?.icon}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{SECTION_META.find(s => s.id === activeSection)?.title}</CardTitle>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{SECTION_META.find(s => s.id === activeSection)?.desc}</p>
                  </div>
                  {/* Mobile nav toggle */}
                  <button onClick={() => setShowMobileNav(!showMobileNav)} className="sm:hidden p-2 rounded-lg bg-gray-100 dark:bg-accent">
                    <Settings className="h-5 w-5 text-[var(--text-secondary)]" />
                  </button>
                </div>

                {/* Animated section content */}
                <AnimatePresence mode="wait">
                  <m.div
                    key={activeSection}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.15 }}
                  >
                    {renderSection()}
                  </m.div>
                </AnimatePresence>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Map picker modal */}
      {showMapPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowMapPicker(false)}>
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--surface-raised)] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Ubicación del negocio</CardTitle>
              <button onClick={() => setShowMapPicker(false)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <button onClick={() => { if (!navigator.geolocation) return; navigator.geolocation.getCurrentPosition(pos => { setPickerLat(pos.coords.latitude); setPickerLon(pos.coords.longitude); setBusinessLat(pos.coords.latitude); setBusinessLon(pos.coords.longitude); }); }} className="self-start inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-[var(--data-success-500)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] border border-[var(--data-success-500)]/30">
                <MapPin className="h-4 w-4" /> Usar ubicación actual
              </button>
              <LeafletMap lat={pickerLat} lon={pickerLon} zoom={15} height={340} onPick={(lat: number, lon: number, address: string) => { setPickerLat(lat); setPickerLon(lon); setBusinessLat(lat); setBusinessLon(lon); setBusinessAddress(address); }} />
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-[var(--rule-soft)]">
              <button onClick={() => setShowMapPicker(false)} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-[var(--text-secondary)] hover:bg-gray-100">Cancelar</button>
              <button onClick={() => setShowMapPicker(false)} className="px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary/90">Confirmar</button>
            </div>
          </m.div>
        </div>
      )}
    </div>
  );
}

// ─── Image Drop Card ─────────────────────────────────────────────────────────
//
// Card unificado para subir imágenes (Logo / Portada / Banner). Cada uno
// muestra:
//  - Label + hint del aspect ratio recomendado
//  - Mini-mockup que ANTICIPA dónde va a aparecer la imagen
//  - Dropzone con preview en el aspect-ratio real
//  - Input URL alternativo
//  - Botón "Quitar" sobre el preview

interface ImageDropCardProps {
  label: string;
  hint: string;
  whereVisible: string;
  value: string;
  previewClass: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (v: string) => void;
  uploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  mockup: React.ReactNode;
}

function ImageDropCard({
  label,
  hint,
  whereVisible,
  value,
  previewClass,
  inputRef,
  onChange,
  uploading,
  onUpload,
  mockup,
}: ImageDropCardProps) {
  const safeUrl = value && !value.startsWith("data:") ? value : "";
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] dark:bg-surface p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-base font-extrabold text-[var(--text-primary)] truncate">{label}</h4>
          <p className="text-xs text-[var(--text-tertiary)]">{hint}</p>
        </div>
      </div>

      {/* Donde aparece (mini-mockup) */}
      <div className="rounded-xl bg-gray-50 dark:bg-[var(--surface-sunken)] p-3 border border-[var(--rule-soft)]">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          Aparece en
        </p>
        <p className="text-xs text-[var(--text-secondary)] mb-2">{whereVisible}</p>
        {mockup}
      </div>

      {/* Preview o dropzone */}
      <div className="space-y-2">
        {value ? (
          <div className={`relative w-full overflow-hidden rounded-xl border border-[var(--rule-soft)] bg-gray-50 dark:bg-surface ${previewClass}`}>
            <Image src={value} alt={label} fill className="object-contain" unoptimized onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            <button
              onClick={() => onChange("")}
              className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-black/70 text-white text-xs font-bold hover:bg-black/90 transition-colors"
            >
              Quitar
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/90 text-[var(--text-primary)] text-xs font-bold hover:bg-white dark:bg-[var(--color-card)] transition-colors disabled:opacity-60"
            >
              <Upload className="h-3 w-3" />
              Cambiar
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className={`w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--rule-base)] hover:border-primary text-[var(--text-secondary)] hover:text-primary bg-gray-50 dark:bg-[var(--surface-sunken)] transition-all disabled:opacity-60 disabled:cursor-wait ${previewClass}`}
          >
            {uploading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm font-bold">Subiendo…</span>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6" />
                <span className="text-sm font-bold">Subir imagen</span>
                <span className="text-xs text-[var(--text-tertiary)]">JPG · PNG · WebP</span>
              </>
            )}
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
        <input
          value={safeUrl}
          onChange={(e) => onChange(e.target.value)}
          placeholder="o pegá URL: https://…"
          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
    </div>
  );
}

// ─── Mini-mockups ────────────────────────────────────────────────────────────
// Visualizan dónde aparece cada imagen en su contexto real, en miniatura.

function MockHeader({ logoUrl }: { logoUrl: string }) {
  return (
    <div className="rounded-md bg-[#0b1f2b] text-white/80 px-2 py-1.5 flex items-center gap-1.5 text-[length:var(--ts-2xs)]">
      <div className="w-1 h-3 bg-white/15 rounded-sm" />
      <div className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[color-mix(in_oklab,var(--accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-[color-mix(in_oklab,var(--accent)_70%,white)] font-bold">
        {logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logoUrl} alt="" className="h-3 w-3 rounded object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <Store className="h-2.5 w-2.5" />
        )}
        <span className="truncate max-w-[40px]">Tienda</span>
      </div>
    </div>
  );
}

function MockStoreCard({ coverUrl, logoUrl, businessName }: { coverUrl: string; logoUrl: string; businessName: string }) {
  return (
    <div className="rounded-md overflow-hidden border border-[var(--rule-soft)] bg-white dark:bg-[var(--surface-canvas)]">
      <div className="aspect-[4/3] bg-linear-to-br from-primary/10 to-primary/30 relative">
        {coverUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={coverUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)] text-[length:var(--ts-2xs)]">Portada</div>
        )}
        {logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logoUrl} alt="" className="absolute bottom-1 left-1 h-4 w-4 rounded-md ring-1 ring-white object-cover bg-white dark:bg-[var(--color-card)]" />
        )}
      </div>
      <div className="px-1.5 py-1">
        <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)] truncate">{businessName || "Tu tienda"}</p>
      </div>
    </div>
  );
}

function MockStorefront({ bannerUrl, logoUrl, businessName }: { bannerUrl: string; logoUrl: string; businessName: string }) {
  return (
    <div className="rounded-md overflow-hidden border border-[var(--rule-soft)] bg-white dark:bg-[var(--surface-canvas)]">
      <div className="aspect-[16/5] bg-linear-to-r from-primary/15 via-primary/25 to-primary/10 relative">
        {bannerUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={bannerUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)] text-[length:var(--ts-2xs)]">Banner gigante</div>
        )}
      </div>
      <div className="px-1.5 py-1 flex items-center gap-1">
        {logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logoUrl} alt="" className="h-3 w-3 rounded-sm object-cover" />
        )}
        <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)] truncate">{businessName || "Tu tienda"}</p>
      </div>
    </div>
  );
}