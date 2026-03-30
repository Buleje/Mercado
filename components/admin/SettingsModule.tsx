"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { StoreMode } from "@/lib/jsondb";
import dynamic from "next/dynamic";
import {
  Store, Phone, MapPin, Clock, AlignLeft, Image as ImageIcon, Upload, Lock, X, Search,
  ShoppingCart, MessageCircle, HandCoins, Link as LinkIcon, Pencil, Check,
  Loader2, Eye, EyeOff, ArrowUp, ArrowDown, AlertTriangle, Shield, Download,
  CheckCircle, UserCog, Palette, User, Truck, Settings, Bell, Package,
  DollarSign, FileText, Zap, CreditCard, Landmark, Globe, Hash, Percent,
  Calendar, Timer, Layers, Smartphone, Mail, Key, Wifi, WifiOff,
  BarChart3, Database, Crown, ChevronRight, ChevronDown, Save, RefreshCw,
  Plus, Minus, Trash2, Copy, Send, ToggleLeft, ToggleRight, Activity,
  HardDrive, ClipboardList, Users, Power, Monitor
} from "lucide-react";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

// ── Types ──────────────────────────────────────────────────────────────────────
type NavLinkItem = { id: string; visible: boolean };
type DeliveryZone = { name: string; fee: number; estimatedMin: number };
type Rider = { name: string; phone: string; zone: string };
type SocialLinks = { facebook?: string; instagram?: string; tiktok?: string };

type SettingsData = Record<string, unknown>;

type SectionId = "business" | "security" | "system" | "sales" | "inventory"
  | "cash" | "delivery" | "notifications" | "integrations" | "appearance"
  | "audit" | "backup" | "subscription";

const NAV_LABEL: Record<string, string> = {
  inicio: "Inicio", productos: "Productos", beneficios: "Beneficios", contacto: "Contacto",
};
const DEFAULT_NAV_LINKS: NavLinkItem[] = [
  { id: "inicio", visible: true }, { id: "productos", visible: true },
  { id: "beneficios", visible: true }, { id: "contacto", visible: true },
];

const SECTION_META: { id: SectionId; icon: React.ReactNode; title: string; desc: string; color: string }[] = [
  { id: "business", icon: <Store className="h-5 w-5" />, title: "Datos del Negocio", desc: "Nombre, RUC, contacto, redes", color: "text-orange-500 bg-orange-50 dark:bg-orange-950/30" },
  { id: "security", icon: <Lock className="h-5 w-5" />, title: "Usuarios y Seguridad", desc: "Contraseña, sesiones, acceso", color: "text-red-500 bg-red-50 dark:bg-red-950/30" },
  { id: "system", icon: <Settings className="h-5 w-5" />, title: "Configuración del Sistema", desc: "Formato, moneda, impuestos", color: "text-slate-500 bg-slate-50 dark:bg-slate-950/30" },
  { id: "sales", icon: <FileText className="h-5 w-5" />, title: "Ventas y Comprobantes", desc: "Series, SUNAT, descuentos", color: "text-blue-500 bg-blue-50 dark:bg-blue-950/30" },
  { id: "inventory", icon: <Package className="h-5 w-5" />, title: "Inventario", desc: "Stock, alertas, unidades", color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" },
  { id: "cash", icon: <DollarSign className="h-5 w-5" />, title: "Caja y Pagos", desc: "Apertura, métodos, devoluciones", color: "text-green-500 bg-green-50 dark:bg-green-950/30" },
  { id: "delivery", icon: <Truck className="h-5 w-5" />, title: "Delivery y Envíos", desc: "Zonas, tarifas, repartidores", color: "text-cyan-500 bg-cyan-50 dark:bg-cyan-950/30" },
  { id: "notifications", icon: <Bell className="h-5 w-5" />, title: "Notificaciones", desc: "Email, WhatsApp, push", color: "text-violet-500 bg-violet-50 dark:bg-violet-950/30" },
  { id: "integrations", icon: <Zap className="h-5 w-5" />, title: "Integraciones", desc: "Yape, Plin, SUNAT, analytics", color: "text-amber-500 bg-amber-50 dark:bg-amber-950/30" },
  { id: "appearance", icon: <Palette className="h-5 w-5" />, title: "Apariencia", desc: "Colores, slogan, tema", color: "text-pink-500 bg-pink-50 dark:bg-pink-950/30" },
  { id: "audit", icon: <Activity className="h-5 w-5" />, title: "Auditoría y Control", desc: "Logs, retención, alertas", color: "text-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" },
  { id: "backup", icon: <HardDrive className="h-5 w-5" />, title: "Respaldo y Mantenimiento", desc: "Backups, estado, limpieza", color: "text-teal-500 bg-teal-50 dark:bg-teal-950/30" },
  { id: "subscription", icon: <Crown className="h-5 w-5" />, title: "Suscripción", desc: "Plan, límites, módulos", color: "text-yellow-500 bg-yellow-50 dark:bg-yellow-950/30" },
];

// ── Reusable sub-components ───────────────────────────────────────────────────

function FieldLabel({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-1.5">
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
        "w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border",
        "bg-white dark:bg-surface text-gray-900 dark:text-foreground text-sm",
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
        className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-900 dark:text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors font-mono"
      />
      {suffix && <span className="text-xs text-gray-500 dark:text-muted font-medium shrink-0">{suffix}</span>}
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
      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-900 dark:text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer transition-colors"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Toggle({ enabled, onChange, label, desc, danger }: {
  enabled: boolean; onChange: (v: boolean) => void; label: string; desc?: string; danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 dark:bg-surface border border-gray-100 dark:border-card-border">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-foreground">{label}</p>
        {desc && <p className="text-xs text-gray-500 dark:text-muted mt-0.5">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={cn(
          "relative w-11 h-6 rounded-full transition-colors shrink-0",
          enabled ? (danger ? "bg-red-500" : "bg-primary") : "bg-gray-300 dark:bg-gray-600"
        )}
      >
        <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", enabled && "translate-x-5")} />
      </button>
    </div>
  );
}

function SectionCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-card-border">
        <h4 className="font-bold text-sm text-gray-900 dark:text-foreground">{title}</h4>
        {desc && <p className="text-xs text-gray-500 dark:text-muted mt-0.5">{desc}</p>}
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
        saved ? "bg-emerald-500 text-white" : "bg-gray-900 dark:bg-white dark:text-gray-900 text-white hover:bg-gray-800 dark:hover:bg-gray-100"
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
      <div className={cn("w-2.5 h-2.5 rounded-full", ok ? "bg-emerald-500" : "bg-red-400")} />
      <span className="text-xs text-gray-700 dark:text-foreground font-medium">{label}</span>
      <span className={cn("text-[10px] font-bold uppercase", ok ? "text-emerald-600" : "text-red-500")}>{ok ? "Conectado" : "No configurado"}</span>
    </div>
  );
}

function ProgressBar({ value, max, label, unit }: { value: number; max: number; label: string; unit?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const isHigh = pct > 80;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-700 dark:text-foreground font-medium">{label}</span>
        <span className={cn("font-bold", isHigh ? "text-amber-600" : "text-gray-500 dark:text-muted")}>{value}/{max} {unit}</span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", isHigh ? "bg-amber-500" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function OverviewCard({ section, completionPct, onClick }: {
  section: typeof SECTION_META[number]; completionPct: number; onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="relative flex flex-col items-start gap-3 p-4 rounded-2xl border-2 border-gray-100 dark:border-card-border text-left transition-all bg-white dark:bg-card hover:shadow-lg hover:border-gray-200 dark:hover:border-gray-600"
    >
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", section.color)}>
        {section.icon}
      </div>
      <div>
        <p className="text-sm font-bold text-gray-900 dark:text-foreground">{section.title}</p>
        <p className="text-[11px] text-gray-400 dark:text-muted mt-0.5 line-clamp-1">{section.desc}</p>
      </div>
      <div className="w-full flex items-center gap-2 mt-auto">
        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", completionPct === 100 ? "bg-emerald-500" : "bg-primary/60")} style={{ width: `${completionPct}%` }} />
        </div>
        <span className={cn("text-[9px] font-bold shrink-0", completionPct === 100 ? "text-emerald-500" : "text-gray-400")}>{completionPct}%</span>
      </div>
      {completionPct === 100 && (
        <div className="absolute top-2.5 right-2.5">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
        </div>
      )}
    </motion.button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SettingsModule({ storeMode, onModeChange }: { storeMode: StoreMode; onModeChange: (m: StoreMode) => void }) {
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
  const [businessPhone, setBusinessPhone] = useState("51916409675");
  const [businessAddress, setBusinessAddress] = useState("Pucallpa, Ucayali");
  const [logoUrl, setLogoUrl] = useState("");
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
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState("");
  const [bypassLogin, setBypassLogin] = useState(false);

  // Appearance
  const [primaryColor, setPrimaryColor] = useState("#0f766e");
  const [secondaryColor, setSecondaryColor] = useState("#f97316");
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
        if (d.adminPassword) setStoredAdminPw(d.adminPassword);
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
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setSavedSection(activeSection);
      setTimeout(() => setSavedSection(null), 2000);
    } catch { /* ignore */ }
    setSaving(false);
  }, [activeSection]);

  const patchFlags = useCallback(async (flags: Record<string, boolean>) => {
    await fetch("/api/settings/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(flags),
    });
  }, []);

  const handleFileUpload = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setter(reader.result as string);
    reader.readAsDataURL(file);
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
    } as Record<SectionId, number>;
  }, [businessName, businessPhone, businessAddress, razonSocial, ruc, businessEmail, logoUrl, description, hours, storedAdminPw, dateFormat, timeFormat, taxRate, sunatRuc, sunatDenominacion, sunatDireccion, invoiceFooterText, defaultUnit, globalMinStock, fefoEnabled, cashEnabled, yapeEnabled, deliveryZones.length, smtpHost, smtpUser, whatsappApiToken, sunatProvider, googleAnalyticsId, primaryColor, secondaryColor, slogan, logRetentionDays, backupSchedule, lastBackupAt, planName]);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return SECTION_META;
    const q = searchQuery.toLowerCase();
    return SECTION_META.filter(s => s.title.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q));
  }, [searchQuery]);

  const overallCompletion = useMemo(() => {
    const vals = Object.values(sectionCompletion);
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [sectionCompletion]);

  // ── Render loading state ────────────────────────────────────────────────────

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-6">
          <div className="flex items-center gap-4"><div className="h-12 w-12 bg-gray-200 dark:bg-surface rounded-xl" /><div className="flex-1 space-y-2"><div className="h-5 bg-gray-200 dark:bg-surface rounded w-1/3" /><div className="h-3 bg-gray-200 dark:bg-surface rounded w-2/3" /></div></div>
        </div>
      ))}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION RENDERERS (13 sections)
  // ══════════════════════════════════════════════════════════════════════════════

  const renderBusiness = () => (
    <div className="space-y-4">
      {/* Store mode selector */}
      <SectionCard title="Modo de tienda" desc="Cómo reciben pedidos tus clientes">
        <div className="grid grid-cols-2 gap-3">
          {(["whatsapp", "checkout"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={cn(
              "flex flex-col items-center gap-2 py-5 px-3 rounded-xl border-2 transition-all",
              mode === m ? (m === "whatsapp" ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20" : "border-primary bg-primary/5") : "border-gray-200 dark:border-card-border hover:border-gray-300"
            )}>
              {m === "whatsapp" ? <MessageCircle className={cn("h-8 w-8", mode === m ? "text-emerald-600" : "text-gray-300")} /> : <ShoppingCart className={cn("h-8 w-8", mode === m ? "text-primary" : "text-gray-300")} />}
              <span className={cn("font-bold text-sm", mode === m ? (m === "whatsapp" ? "text-emerald-700" : "text-primary") : "text-gray-400")}>{m === "whatsapp" ? "WhatsApp" : "Checkout"}</span>
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
          <div><FieldLabel icon={<Phone className="h-3.5 w-3.5" />}>WhatsApp</FieldLabel><TextInput value={businessPhone} onChange={setBusinessPhone} placeholder="51916409675" mono /></div>
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
              <button onClick={() => setShowMapPicker(true)} className="px-3 py-2 rounded-xl text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors shrink-0">
                <MapPin className="h-4 w-4" />
              </button>
            </div>
            {businessLat && businessLon && <p className="text-[10px] text-gray-400 font-mono mt-1">GPS: {businessLat.toFixed(5)}, {businessLon.toFixed(5)}</p>}
          </div>
          <div><FieldLabel icon={<Truck className="h-3.5 w-3.5" />}>Zona de delivery</FieldLabel><TextInput value={deliveryZone} onChange={setDeliveryZone} /></div>
          <div><FieldLabel icon={<Clock className="h-3.5 w-3.5" />}>Horario</FieldLabel><TextInput value={hours} onChange={setHours} placeholder="Lun - Sáb: 7am - 9pm" /></div>
        </div>
        <div><FieldLabel icon={<AlignLeft className="h-3.5 w-3.5" />}>Descripción</FieldLabel>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-900 dark:text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
        </div>
      </SectionCard>

      {/* Logo */}
      <SectionCard title="Logo del negocio">
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => logoImgRef.current?.click()} className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-primary text-sm font-semibold text-gray-500 hover:text-primary bg-gray-50 dark:bg-surface transition-colors">
            <Upload className="h-4 w-4" /> Subir imagen
          </button>
          <input ref={logoImgRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload(setLogoUrl)} />
          <TextInput value={logoUrl.startsWith("data:") ? "" : logoUrl} onChange={setLogoUrl} placeholder="https://… o /logo.png" />
        </div>
        {logoUrl && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-surface rounded-xl border border-gray-100 dark:border-card-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Logo" className="h-14 w-14 object-contain rounded-xl bg-white border border-gray-100" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            <span className="text-xs text-gray-500 flex-1">Vista previa</span>
            <button onClick={() => setLogoUrl("")} className="text-xs text-red-400 hover:text-red-600">Quitar</button>
          </div>
        )}
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
        logoUrl, description, hours, deliveryZone, razonSocial, ruc, businessEmail,
        currency, timezone, businessType, socialLinks,
      }).then(() => onModeChange(mode))} />
    </div>
  );

  const renderSecurity = () => (
    <div className="space-y-4">
      {/* Password change */}
      <SectionCard title="Cambiar contraseña" desc="Contraseña de acceso al panel de administración">
        <form onSubmit={async (e) => {
          e.preventDefault(); setPwChangeError("");
          if (currentPwInput !== storedAdminPw) { setPwChangeError("La contraseña actual es incorrecta"); return; }
          if (newPw.length < 4) { setPwChangeError("Mínimo 4 caracteres"); return; }
          if (newPw !== confirmPw) { setPwChangeError("Las contraseñas no coinciden"); return; }
          await patch({ adminPassword: newPw });
          setStoredAdminPw(newPw); setCurrentPwInput(""); setNewPw(""); setConfirmPw("");
          await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: newPw }) });
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
                  return <div key={i} className={cn("h-1.5 flex-1 rounded-full", i <= strength ? (strength <= 1 ? "bg-red-400" : strength <= 2 ? "bg-amber-400" : strength <= 3 ? "bg-blue-400" : "bg-emerald-400") : "bg-gray-200 dark:bg-surface")} />;
                })}
              </div>
              <p className="text-[10px] text-gray-400">{newPw.length < 4 ? "Muy corta" : newPw.length < 8 ? "Aceptable" : "Fuerte"}</p>
            </div>
          )}
          {pwChangeError && <p className="text-xs text-red-500 font-semibold">{pwChangeError}</p>}
          <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
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
          await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maintenanceMode: v, maintenanceMessage: msg }) });
        }} label={maintenanceMode ? "Modo activo — tienda bloqueada" : "Desactivado"} desc="Los clientes ven el catálogo pero no pueden comprar" />
        {maintenanceMode && (
          <div className="space-y-2">
            <FieldLabel>Mensaje para clientes</FieldLabel>
            <TextInput value={maintenanceMsg} onChange={setMaintenanceMsg} placeholder="Ej: Estamos de vacaciones. Volvemos el lunes." />
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <span className="text-lg">🏖</span>
              <p className="text-xs text-amber-800 dark:text-amber-300 font-medium flex-1">{maintenanceMsg || "Vista previa..."}</p>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Bypass login — warn */}
      <SectionCard title="Configuración de acceso">
        <Toggle enabled={bypassLogin} onChange={async v => {
          setBypassLogin(v);
          await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminBypassLogin: v }) });
        }} label="Acceso sin login" desc="Permite entrar al panel sin credenciales" danger />
        {bypassLogin && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 dark:text-red-400 font-medium">⚠️ RIESGO DE SEGURIDAD: Cualquier persona podrá acceder al panel de administración.</p>
          </div>
        )}
      </SectionCard>

      {/* Nav links */}
      <SectionCard title="Navegación del sitio" desc="Orden y visibilidad del menú">
        <div className="space-y-2">
          {navLinks.map((link, idx) => (
            <div key={link.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-surface rounded-xl border border-gray-100 dark:border-card-border">
              <div className="flex flex-col gap-0.5">
                <button disabled={idx === 0} onClick={() => { const n = [...navLinks]; [n[idx], n[idx - 1]] = [n[idx - 1], n[idx]]; setNavLinks(n); }} className="p-0.5 rounded text-gray-400 hover:text-gray-800 disabled:opacity-25"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button disabled={idx === navLinks.length - 1} onClick={() => { const n = [...navLinks]; [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; setNavLinks(n); }} className="p-0.5 rounded text-gray-400 hover:text-gray-800 disabled:opacity-25"><ArrowDown className="h-3.5 w-3.5" /></button>
              </div>
              <span className="flex-1 font-semibold text-sm text-gray-800 dark:text-foreground">{NAV_LABEL[link.id] || link.id}</span>
              <button onClick={() => setNavLinks(prev => prev.map((l, i) => i === idx ? { ...l, visible: !l.visible } : l))} className={cn("p-1.5 rounded-lg", link.visible ? "text-primary bg-primary/10" : "text-gray-300")}>
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
    <div className="space-y-4">
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
            <p className="text-[10px] text-gray-400 mt-1">Hoy es 18% en Perú. Se usa para calcular totales en comprobantes.</p>
          </div>
        </div>
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "system"} onClick={() => patch({ dateFormat, timeFormat, decimals, taxRate, fiscalYearStart })} />
    </div>
  );

  const renderSales = () => (
    <div className="space-y-4">
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
                <span className="text-[10px] text-gray-400">Inicio: </span>
                <input type="number" min={1} value={invoiceStart[val] || 1} onChange={e => setInvoiceStart(p => ({ ...p, [val]: Number(e.target.value) }))} className="w-20 px-2 py-1 text-xs font-mono rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface outline-none" />
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
              }} className={cn("px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all", active ? "border-primary bg-primary/10 text-primary" : "border-gray-200 dark:border-card-border text-gray-400 hover:border-gray-300")}>
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
        <textarea value={invoiceFooterText} onChange={e => setInvoiceFooterText(e.target.value)} rows={2} placeholder="Gracias por su compra. Conserve este comprobante." className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "sales"} onClick={() => patch({
        invoiceSeries, invoiceStart, enabledDocTypes, roundingMode, maxDiscountPercent,
        discountRequiresAuth, invoiceFooterText, sunatRuc, sunatDenominacion, sunatDireccion,
      })} />
    </div>
  );

  const renderInventory = () => (
    <div className="space-y-4">
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
              }} className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all", active ? "border-primary bg-primary/10 text-primary" : "border-gray-200 text-gray-400 hover:border-gray-300")}>
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
              <button onClick={() => setAdjustReasons(p => p.filter((_, i) => i !== idx))} className="p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
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
    <div className="space-y-4">
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
            <div className="pl-4 border-l-2 border-purple-200 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><FieldLabel>Titular</FieldLabel><TextInput value={yapeName} onChange={setYapeName} placeholder="Juan Pérez" /></div>
                <div><FieldLabel>Número</FieldLabel><TextInput value={yapePhone} onChange={setYapePhone} placeholder="987654321" mono /></div>
              </div>
              <div>
                <FieldLabel>QR de Yape</FieldLabel>
                <button onClick={() => yapeImgRef.current?.click()} className="w-full py-3 rounded-xl border-2 border-dashed border-purple-300 hover:border-purple-500 text-sm font-semibold text-purple-600 bg-purple-50 transition-colors"><Upload className="h-4 w-4 inline mr-1.5" />Subir QR</button>
                <input ref={yapeImgRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload(setYapeImage)} />
                {yapeImage && <div className="mt-2 flex items-center gap-3 p-2 bg-purple-50 rounded-xl">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={yapeImage} alt="QR" className="h-16 w-16 rounded-lg object-contain border" /><button onClick={() => setYapeImage("")} className="text-xs text-red-400 hover:text-red-600">Quitar</button></div>}
              </div>
            </div>
          )}
          <Toggle enabled={plinEnabled} onChange={setPlinEnabled} label="Plin" desc="Pago con Plin" />
          {plinEnabled && (
            <div className="pl-4 border-l-2 border-blue-200 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><FieldLabel>Titular</FieldLabel><TextInput value={plinName} onChange={setPlinName} /></div>
                <div><FieldLabel>Número</FieldLabel><TextInput value={plinPhone} onChange={setPlinPhone} mono /></div>
              </div>
              <div>
                <button onClick={() => plinImgRef.current?.click()} className="w-full py-3 rounded-xl border-2 border-dashed border-blue-300 hover:border-blue-500 text-sm font-semibold text-blue-600 bg-blue-50 transition-colors"><Upload className="h-4 w-4 inline mr-1.5" />Subir QR Plin</button>
                <input ref={plinImgRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload(setPlinImage)} />
                {plinImage && <div className="mt-2 flex items-center gap-3 p-2 bg-blue-50 rounded-xl">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={plinImage} alt="QR" className="h-16 w-16 rounded-lg object-contain border" /><button onClick={() => setPlinImage("")} className="text-xs text-red-400">Quitar</button></div>}
              </div>
            </div>
          )}
          <Toggle enabled={transferEnabled} onChange={setTransferEnabled} label="Transferencia bancaria" desc="Deposito o transferencia" />
          {transferEnabled && (
            <div className="pl-4 border-l-2 border-green-200 space-y-3">
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
    <div className="space-y-4">
      <SectionCard title="Zonas de delivery" desc="Define zonas con tarifas y tiempos diferentes">
        <div className="space-y-2">
          {deliveryZones.map((zone, idx) => (
            <div key={idx} className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-surface rounded-xl border border-gray-100 dark:border-card-border">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <input value={zone.name} onChange={e => setDeliveryZones(p => p.map((z, i) => i === idx ? { ...z, name: e.target.value } : z))} placeholder="Nombre" className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border text-sm bg-white dark:bg-card outline-none" />
                <div className="flex items-center gap-1">
                  <input type="number" value={zone.fee} onChange={e => setDeliveryZones(p => p.map((z, i) => i === idx ? { ...z, fee: Number(e.target.value) } : z))} min={0} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-mono bg-white outline-none" />
                  <span className="text-[10px] text-gray-400 shrink-0">S/</span>
                </div>
                <div className="flex items-center gap-1">
                  <input type="number" value={zone.estimatedMin} onChange={e => setDeliveryZones(p => p.map((z, i) => i === idx ? { ...z, estimatedMin: Number(e.target.value) } : z))} min={0} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-mono bg-white outline-none" />
                  <span className="text-[10px] text-gray-400 shrink-0">min</span>
                </div>
              </div>
              <button onClick={() => setDeliveryZones(p => p.filter((_, i) => i !== idx))} className="p-1.5 rounded-lg text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
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
            <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-surface rounded-xl border border-gray-100 dark:border-card-border">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <input value={rider.name} onChange={e => setRiders(p => p.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))} placeholder="Nombre" className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white outline-none" />
                <input value={rider.phone} onChange={e => setRiders(p => p.map((r, i) => i === idx ? { ...r, phone: e.target.value } : r))} placeholder="Teléfono" className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-mono bg-white outline-none" />
                <input value={rider.zone} onChange={e => setRiders(p => p.map((r, i) => i === idx ? { ...r, zone: e.target.value } : r))} placeholder="Zona" className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white outline-none" />
              </div>
              <button onClick={() => setRiders(p => p.filter((_, i) => i !== idx))} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
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
    <div className="space-y-4">
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
          <div><FieldLabel icon={<MessageCircle className="h-3.5 w-3.5" />}>Número de negocio</FieldLabel><TextInput value={whatsappBusinessNum} onChange={setWhatsappBusinessNum} placeholder="51916409675" mono /></div>
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
    <div className="space-y-4">
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
            <div key={s.label} className={cn("flex items-center gap-2 p-3 rounded-xl border", s.ok ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800" : "bg-gray-50 dark:bg-surface border-gray-200 dark:border-card-border")}>
              {s.ok ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-gray-300" />}
              <span className={cn("text-xs font-semibold", s.ok ? "text-emerald-700 dark:text-emerald-400" : "text-gray-400")}>{s.label}</span>
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
          <p className="text-xs text-gray-400 text-center py-4">No hay feature flags cargados</p>
        )}
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "integrations"} onClick={() => patch({
        sunatProvider, sunatApiKey, googleAnalyticsId, googleTagManagerId,
      })} />
    </div>
  );

  const renderAppearance = () => (
    <div className="space-y-4">
      <SectionCard title="Colores de marca" desc="Personaliza los colores de tu tienda">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel>Color primario</FieldLabel>
            <div className="flex items-center gap-2">
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer" />
              <TextInput value={primaryColor} onChange={setPrimaryColor} mono />
            </div>
          </div>
          <div>
            <FieldLabel>Color secundario</FieldLabel>
            <div className="flex items-center gap-2">
              <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer" />
              <TextInput value={secondaryColor} onChange={setSecondaryColor} mono />
            </div>
          </div>
          <div className="sm:col-span-2"><FieldLabel>Slogan</FieldLabel><TextInput value={slogan} onChange={setSlogan} placeholder="Productos frescos, precios justos" /></div>
        </div>
        {/* Live preview */}
        <div className="mt-4 p-4 rounded-xl border border-gray-200 dark:border-card-border" style={{ background: `linear-gradient(135deg, ${primaryColor}15, ${secondaryColor}15)` }}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Vista previa</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: primaryColor }}>BSM</div>
            <div><p className="text-sm font-extrabold" style={{ color: primaryColor }}>{businessName}</p><p className="text-xs" style={{ color: secondaryColor }}>{slogan}</p></div>
          </div>
          <div className="mt-3 flex gap-2">
            <span className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: primaryColor }}>Primario</span>
            <span className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: secondaryColor }}>Secundario</span>
          </div>
        </div>
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "appearance"} onClick={() => patch({ primaryColor, secondaryColor, slogan })} />
    </div>
  );

  const renderAudit = () => (
    <div className="space-y-4">
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
                  }} className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all", active ? "border-primary bg-primary/10 text-primary" : "border-gray-200 text-gray-400")}>
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
    <div className="space-y-4">
      <SectionCard title="Respaldo de datos" desc="Protege tu información con backups regulares">
        {/* Last backup indicator */}
        {(() => {
          const lastDate = lastBackupAt ? new Date(lastBackupAt) : (typeof window !== "undefined" ? (() => { const ls = localStorage.getItem("bsm-last-backup"); return ls ? new Date(ls) : null; })() : null);
          const daysSince = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / 86400000) : null;
          const needsBackup = !lastDate || (daysSince !== null && daysSince > 7);
          return (
            <div className={cn("p-3 rounded-xl border", needsBackup ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200" : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200")}>
              <div className="flex items-center gap-2.5">
                {needsBackup ? <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" /> : <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />}
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
            if (typeof window !== "undefined") localStorage.setItem("bsm-last-backup", new Date().toISOString());
            setLastBackupAt(new Date().toISOString());
          }} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-teal-200 bg-white hover:bg-teal-50 text-sm font-semibold text-teal-700">
            <Download className="h-4 w-4" /> Generar respaldo
          </button>
          <button onClick={() => setShowRestoreModal(true)} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-cyan-200 bg-white hover:bg-cyan-50 text-sm font-semibold text-cyan-700">
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
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !restoring && setShowRestoreModal(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Restaurar Base de Datos</h3>
              {!restoring && <button onClick={() => setShowRestoreModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>}
            </div>
            <div className="px-6 py-5 space-y-4">
              {!restoreSuccess && !restoreFile && (
                <>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                      <div><p className="text-sm font-bold text-red-800">ADVERTENCIA</p><p className="text-xs text-red-700 mt-1">Esta acción <strong>sobrescribirá todos los datos actuales</strong>.</p></div>
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={async e => {
                    const file = e.target.files?.[0]; if (!file) return; setRestoreError(null);
                    try { const text = await file.text(); const data = JSON.parse(text);
                      if (!data.products || !data.orders) { setRestoreError("Archivo inválido"); return; }
                      setRestoreFile(file); setRestorePreview({ date: data.exportDate || "?", products: data.products?.length || 0, orders: data.orders?.length || 0, customers: data.customers?.length || 0, size: (file.size / 1024).toFixed(2) + " KB" });
                    } catch { setRestoreError("JSON inválido"); }
                  }} />
                  <button onClick={() => fileInputRef.current?.click()} className="w-full py-8 rounded-xl border-2 border-dashed border-cyan-300 bg-cyan-50 text-cyan-600 hover:border-cyan-500 hover:bg-cyan-100 transition-colors">
                    <Upload className="h-8 w-8 mx-auto mb-2" /><p className="text-sm font-semibold">Seleccionar archivo .json</p>
                  </button>
                  {restoreError && <p className="text-xs text-red-600 font-semibold bg-red-50 p-3 rounded-xl">{restoreError}</p>}
                </>
              )}
              {restoreFile && !restoreSuccess && restorePreview && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <p className="text-xs font-bold mb-2">Vista previa</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-gray-500 block">Productos:</span><span className="font-semibold">{restorePreview.products}</span></div>
                    <div><span className="text-gray-500 block">Pedidos:</span><span className="font-semibold">{restorePreview.orders}</span></div>
                    <div><span className="text-gray-500 block">Clientes:</span><span className="font-semibold">{restorePreview.customers}</span></div>
                    <div><span className="text-gray-500 block">Tamaño:</span><span className="font-semibold">{restorePreview.size}</span></div>
                  </div>
                </div>
              )}
              {restoreSuccess && (
                <div className="text-center py-6"><CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-2" /><p className="text-lg font-bold">¡Restauración exitosa!</p><p className="text-sm text-gray-500">Recargando...</p></div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              {!restoreSuccess && (<>
                <button onClick={() => { setShowRestoreModal(false); setRestoreFile(null); setRestorePreview(null); setRestoreError(null); }} disabled={restoring} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancelar</button>
                {restoreFile && <button onClick={async () => {
                  if (!restoreFile) return; setRestoring(true); setRestoreError(null);
                  try { const text = await restoreFile.text(); const res = await fetch("/api/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
                    if (!res.ok) throw new Error(await res.text()); setRestoreSuccess(true); setTimeout(() => window.location.reload(), 2000);
                  } catch (err: unknown) { setRestoreError(err instanceof Error ? err.message : "Error"); setRestoring(false); }
                }} disabled={restoring} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                  {restoring ? <><Loader2 className="h-4 w-4 animate-spin" /> Restaurando...</> : <><AlertTriangle className="h-4 w-4" /> Confirmar</>}
                </button>}
              </>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderSubscription = () => (
    <div className="space-y-4">
      <SectionCard title="Plan actual">
        <div className="flex items-center gap-4 p-4 rounded-xl bg-linear-to-r from-primary/10 to-secondary/10 border border-primary/20">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center"><Crown className="h-7 w-7 text-white" /></div>
          <div className="flex-1">
            <p className="text-lg font-extrabold text-gray-900 dark:text-foreground capitalize">{planName === "free" ? "Plan Gratuito" : `Plan ${planName}`}</p>
            {planExpiresAt && <p className="text-xs text-gray-500">Vence: {new Date(planExpiresAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}</p>}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Límites del plan" desc="Uso actual vs. capacidad contratada">
        <div className="space-y-3">
          <ProgressBar value={0} max={maxProducts} label="Productos" unit="" />
          <ProgressBar value={1} max={maxUsers} label="Usuarios" unit="" />
          <ProgressBar value={1} max={maxBranches} label="Sucursales" unit="" />
        </div>
      </SectionCard>

      <SectionCard title="Módulos activos" desc="Funcionalidades disponibles en tu plan">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {["inventario", "ventas", "caja", "facturacion", "delivery", "ia", "reportes", "crm"].map(m => {
            const active = enabledModules.includes(m);
            return (
              <div key={m} className={cn("flex items-center gap-2 p-3 rounded-xl border", active ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200 opacity-50")}>
                {active ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Lock className="h-4 w-4 text-gray-300" />}
                <span className={cn("text-xs font-semibold capitalize", active ? "text-emerald-700" : "text-gray-400")}>{m}</span>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );

  // ── Section renderer map ────────────────────────────────────────────────────

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
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // MAIN LAYOUT — overview grid + sidebar + content with animations
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-5">
      {/* ── Professional Header ── */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-primary/10 via-white to-secondary/5 dark:from-primary/20 dark:via-card dark:to-secondary/10 border border-primary/10 dark:border-primary/20 px-5 py-5">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
                Configuración
                <span className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded-full",
                  overallCompletion === 100
                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                    : "bg-primary/10 text-primary"
                )}>
                  {overallCompletion}% completo
                </span>
              </h2>
              <p className="text-sm text-gray-500 dark:text-muted">Personaliza tu tienda, pagos, inventario y más</p>
            </div>
          </div>
          {/* Search bar */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); if (e.target.value) setShowOverview(true); }}
              placeholder="Buscar configuración..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm text-gray-900 dark:text-foreground placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {/* Subtle decorative circles */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full -mr-10 -mt-10 blur-2xl" />
        <div className="absolute bottom-0 left-1/2 w-32 h-32 bg-secondary/5 rounded-full -mb-10 blur-2xl" />
      </div>

      {/* ── Breadcrumb ── */}
      {!showOverview && (
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 text-sm">
          <button onClick={() => setShowOverview(true)} className="text-primary hover:text-primary/80 font-semibold transition-colors">
            Configuración
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
          <span className="text-gray-700 dark:text-foreground font-medium">
            {SECTION_META.find(s => s.id === activeSection)?.title}
          </span>
        </motion.div>
      )}

      {/* ── Overview Grid / Section Detail ── */}
      <AnimatePresence mode="wait">
        {showOverview ? (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* Quick stats bar */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase font-bold text-gray-400">Secciones</p>
                <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{SECTION_META.length}</p>
              </div>
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase font-bold text-gray-400">Completas</p>
                <p className="text-2xl font-extrabold text-emerald-600">{Object.values(sectionCompletion).filter(v => v === 100).length}</p>
              </div>
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase font-bold text-gray-400">Pendientes</p>
                <p className="text-2xl font-extrabold text-amber-600">{Object.values(sectionCompletion).filter(v => v < 100).length}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredSections.map((s, i) => (
                <motion.div key={s.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <OverviewCard
                    section={s}
                    completionPct={sectionCompletion[s.id] || 0}
                    onClick={() => { setActiveSection(s.id); setShowOverview(false); setSearchQuery(""); }}
                  />
                </motion.div>
              ))}
            </div>
            {filteredSections.length === 0 && (
              <div className="text-center py-12">
                <Search className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No se encontraron secciones para &quot;{searchQuery}&quot;</p>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
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
                  ? "fixed inset-0 z-40 bg-white dark:bg-card p-4 overflow-y-auto sm:relative sm:inset-auto sm:z-auto sm:bg-transparent sm:p-0 sm:w-60"
                  : "hidden sm:block w-60"
              )}>
                {showMobileNav && (
                  <div className="flex items-center justify-between mb-4 sm:hidden">
                    <h3 className="font-bold text-gray-900 dark:text-foreground">Secciones</h3>
                    <button onClick={() => setShowMobileNav(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                )}
                {/* Back to overview */}
                <button
                  onClick={() => setShowOverview(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-primary hover:bg-primary/5 mb-2 transition-colors"
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
                          ? "bg-primary/10 text-primary font-bold shadow-sm"
                          : "text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-accent"
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
                              className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : "bg-primary/60")}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[9px] font-bold text-gray-400 shrink-0">{pct}%</span>
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
                    <h3 className="text-base font-extrabold text-gray-900 dark:text-foreground">{SECTION_META.find(s => s.id === activeSection)?.title}</h3>
                    <p className="text-xs text-gray-500 dark:text-muted">{SECTION_META.find(s => s.id === activeSection)?.desc}</p>
                  </div>
                  {/* Mobile nav toggle */}
                  <button onClick={() => setShowMobileNav(!showMobileNav)} className="sm:hidden p-2 rounded-xl bg-gray-100 dark:bg-accent">
                    <Settings className="h-5 w-5 text-gray-600" />
                  </button>
                </div>

                {/* Animated section content */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeSection}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.15 }}
                  >
                    {renderSection()}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map picker modal */}
      {showMapPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowMapPicker(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Ubicación del negocio</h3>
              <button onClick={() => setShowMapPicker(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <button onClick={() => { if (!navigator.geolocation) return; navigator.geolocation.getCurrentPosition(pos => { setPickerLat(pos.coords.latitude); setPickerLon(pos.coords.longitude); setBusinessLat(pos.coords.latitude); setBusinessLon(pos.coords.longitude); }); }} className="self-start inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200">
                <MapPin className="h-4 w-4" /> Usar ubicación actual
              </button>
              <LeafletMap lat={pickerLat} lon={pickerLon} zoom={15} height={340} onPick={(lat: number, lon: number, address: string) => { setPickerLat(lat); setPickerLon(lon); setBusinessLat(lat); setBusinessLon(lon); setBusinessAddress(address); }} />
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setShowMapPicker(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={() => setShowMapPicker(false)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90">Confirmar</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}