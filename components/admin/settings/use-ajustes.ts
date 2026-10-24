import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import type { StoreMode } from "@/lib/jsondb";
import { csrfHeaders } from "@/lib/csrf-client";
import type { FaltaItem } from "@/components/admin/settings/navegacion";
import type { SeccionAjustes } from "@/components/admin/settings/secciones";
import { TOPE_DESCUENTO_CAJERO_PCT, topeCajeroPct, topeCajeroParaGuardar } from "@/lib/pos/descuento-cajero";
import { useCambiosAjustes, type SettingsData } from "@/components/admin/settings/use-cambios-ajustes";

export type DeliveryZone = { name: string; fee: number; estimatedMin: number };
export type SocialLinks = { facebook?: string; instagram?: string; tiktok?: string };
export type { SettingsData };

/** Pie del ticket (`Settings.invoiceFooterText`): lo que cabe en dos o tres líneas de una térmica de 58 mm. */
export const PIE_TICKET_MAX = 200;

/** ADR-491: el tope del cajero para adelantos, como se guarda. Vacío = `null` (el servidor usa S/ 500). */
export function topeAdelantoParaGuardar(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.min(1_000_000, Math.max(0, Math.round(n * 100) / 100)) : null;
}

const txt = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown, defecto: number) => (typeof v === "number" && Number.isFinite(v) ? v : defecto);
const bool = (v: unknown, defecto: boolean) => (typeof v === "boolean" ? v : defecto);
/** Coordenada guardada; 0 o vacío = sin ubicación (como antes). */
const coord = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v !== 0 ? v : null);

/**
 * Estado y guardado compartidos de Ajustes: carga de /api/settings, los campos
 * del formulario, «Te falta» por sección, el PUT (`patch`) y la subida de imágenes.
 * Cada sección (`Seccion*.tsx`) lee de aquí lo suyo.
 */
export function useAjustes(storeMode: StoreMode) {
  const [loading, setLoading] = useState(true);
  // Si /api/settings no respondió, el formulario tiene valores vacíos: guardar
  // pisaría lo real con vacío. Las secciones que dependen de él se bloquean.
  const [cargaFallida, setCargaFallida] = useState(false);
  const [saving, setSaving] = useState(false);
  // Sube cada vez que el formulario se llena desde el servidor (foto de «lo guardado»).
  const [versionCarga, setVersionCarga] = useState(0);

  // Store mode
  const [mode, setMode] = useState<StoreMode>(storeMode);

  // Business info
  const [businessName, setBusinessName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
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
  // Texto al pie del ticket, la boleta y el recibo (Loyverse lo llama «pie del recibo»).
  const [invoiceFooterText, setInvoiceFooterText] = useState("");

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
  // Tope de descuento del cajero (Settings.maxDiscountPercent). Se carga con la misma
  // regla que aplica POST /api/sales: el 100 de fábrica de la columna se ve como 15.
  const [maxDiscountPercent, setMaxDiscountPercent] = useState(TOPE_DESCUENTO_CAJERO_PCT);
  // Tope del cajero para entregar adelantos (ADR-491, Settings.adelantoTopeCajero). Texto:
  // vacío = sin guardar (el servidor usa S/ 500); 0 = el cajero no entrega adelantos.
  const [adelantoTopeCajero, setAdelantoTopeCajero] = useState("");

  // Delivery
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [freeDeliveryMin, setFreeDeliveryMin] = useState(0);

  // Respaldo
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  // El modo de la tienda cuando la base no lo trae (el que llegó al montar).
  const modoInicial = useRef(storeMode);

  /**
   * Llena el formulario con datos en forma de `/api/settings`. Al cargar, todos
   * los campos (lo que falta queda en su valor de fábrica); con `parcial`, sólo
   * los que vienen — «Descartar» devuelve así lo que tiene el servidor.
   */
  const aplicar = useCallback((d: SettingsData, { parcial = false }: { parcial?: boolean } = {}) => {
    const hay = (k: string) => !parcial || k in d;
    if (hay("mode")) setMode(d.mode === "whatsapp" || d.mode === "checkout" ? d.mode : modoInicial.current);
    if (hay("businessName")) setBusinessName(txt(d.businessName));
    if (hay("businessPhone")) setBusinessPhone(txt(d.businessPhone));
    if (hay("businessAddress")) setBusinessAddress(txt(d.businessAddress));
    if (hay("logoUrl")) setLogoUrl(txt(d.logoUrl));
    if (hay("coverUrl")) setCoverUrl(txt(d.coverUrl));
    if (hay("bannerUrl")) setBannerUrl(txt(d.bannerUrl));
    if (hay("description")) setDescription(txt(d.description));
    if (hay("hours")) setHours(txt(d.hours));
    if (hay("deliveryZone")) setDeliveryZone(txt(d.deliveryZone));
    if (hay("businessLat")) { const lat = coord(d.businessLat); setBusinessLat(lat); if (lat != null) setPickerLat(lat); }
    if (hay("businessLon")) { const lon = coord(d.businessLon); setBusinessLon(lon); if (lon != null) setPickerLon(lon); }
    if (hay("razonSocial")) setRazonSocial(txt(d.razonSocial));
    if (hay("ruc")) setRuc(txt(d.ruc));
    if (hay("businessEmail")) setBusinessEmail(txt(d.businessEmail));
    if (hay("currency")) setCurrency(txt(d.currency) || "PEN");
    if (hay("businessType")) setBusinessType(txt(d.businessType) || "bodega");
    if (hay("socialLinks")) setSocialLinks(d.socialLinks && typeof d.socialLinks === "object" ? { ...(d.socialLinks as SocialLinks) } : {});
    if (hay("invoiceFooterText")) setInvoiceFooterText(txt(d.invoiceFooterText));
    if (hay("yapeEnabled")) setYapeEnabled(bool(d.yapeEnabled, true));
    if (hay("yapeImage")) setYapeImage(txt(d.yapeImage));
    if (hay("yapeName")) setYapeName(txt(d.yapeName));
    if (hay("yapePhone")) setYapePhone(txt(d.yapePhone));
    if (hay("cashEnabled")) setCashEnabled(bool(d.cashEnabled, true));
    if (hay("plinEnabled")) setPlinEnabled(bool(d.plinEnabled, false));
    if (hay("plinImage")) setPlinImage(txt(d.plinImage));
    if (hay("plinName")) setPlinName(txt(d.plinName));
    if (hay("plinPhone")) setPlinPhone(txt(d.plinPhone));
    if (hay("transferEnabled")) setTransferEnabled(bool(d.transferEnabled, false));
    if (hay("transferBankName")) setTransferBankName(txt(d.transferBankName));
    if (hay("transferAccountNum")) setTransferAccountNum(txt(d.transferAccountNum));
    if (hay("transferAccountHolder")) setTransferAccountHolder(txt(d.transferAccountHolder));
    if (hay("maintenanceMode")) setMaintenanceMode(bool(d.maintenanceMode, false));
    if (hay("maintenanceMessage")) setMaintenanceMsg(txt(d.maintenanceMessage));
    if (hay("adminBypassLogin")) setBypassLogin(bool(d.adminBypassLogin, false));
    if (hay("primaryColor")) setPrimaryColor(txt(d.primaryColor) || "var(--accent)");
    if (hay("secondaryColor")) setSecondaryColor(txt(d.secondaryColor) || "#ff6b5b");
    if (hay("slogan")) setSlogan(txt(d.slogan));
    if (hay("taxRate")) setTaxRate(num(d.taxRate, 18));
    if (hay("sunatRuc")) setSunatRuc(txt(d.sunatRuc));
    if (hay("sunatDenominacion")) setSunatDenominacion(txt(d.sunatDenominacion));
    if (hay("cashAlertMax")) setCashAlertMax(num(d.cashAlertMax, 500));
    if (hay("autoCloseTime")) setAutoCloseTime(txt(d.autoCloseTime));
    // Misma regla que POST /api/sales: el 100 de fábrica de la columna se ve como 15.
    if (hay("maxDiscountPercent")) setMaxDiscountPercent(topeCajeroPct(d.maxDiscountPercent));
    if (hay("adelantoTopeCajero")) setAdelantoTopeCajero(typeof d.adelantoTopeCajero === "number" ? String(d.adelantoTopeCajero) : "");
    if (hay("deliveryZones")) setDeliveryZones(Array.isArray(d.deliveryZones) ? (d.deliveryZones as DeliveryZone[]) : []);
    if (hay("freeDeliveryMin")) setFreeDeliveryMin(num(d.freeDeliveryMin, 0));
  }, []);

  const cargar = useCallback(() => {
    setLoading(true);
    setCargaFallida(false);
    fetch("/api/settings").then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then((d: SettingsData | null) => {
      if (d) {
        aplicar(d);
        if (typeof d.lastBackupAt === "string" && d.lastBackupAt) setLastBackupAt(d.lastBackupAt);
        setVersionCarga((v) => v + 1);
      }
      setLoading(false);
    }).catch((err) => {
      console.warn("[SettingsModule] no se pudo cargar /api/settings", err);
      setCargaFallida(true);
      setLoading(false);
    });
  }, [aplicar]);

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
      toast.success("Cambios guardados", { id: t });
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
  }, [cargaFallida]);

  // El formulario en forma de `/api/settings`: lo que guarda «Guardar cambios».
  const formulario: SettingsData = {
    mode, businessName, businessPhone, businessAddress, businessLat, businessLon,
    logoUrl, coverUrl, bannerUrl, description, hours, deliveryZone, razonSocial, ruc, businessEmail,
    currency, businessType, socialLinks, invoiceFooterText,
    cashEnabled, yapeEnabled, yapeImage, yapeName, yapePhone,
    plinEnabled, plinImage, plinName, plinPhone,
    transferEnabled, transferBankName, transferAccountNum, transferAccountHolder,
    cashAlertMax, autoCloseTime, sunatRuc, sunatDenominacion, taxRate,
    maxDiscountPercent: topeCajeroParaGuardar(maxDiscountPercent),
    adelantoTopeCajero: topeAdelantoParaGuardar(adelantoTopeCajero),
    deliveryZones, freeDeliveryMin,
    primaryColor, secondaryColor, slogan, maintenanceMessage: maintenanceMsg,
  };
  const cambios = useCambiosAjustes({ formulario, versionCarga, aplicar, patch });

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
          description: "Toca «Guardar cambios» para que quede.",
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

  return {
    mode, setMode, businessName, setBusinessName, businessPhone, setBusinessPhone, businessAddress, setBusinessAddress, logoUrl, setLogoUrl, coverUrl, setCoverUrl, bannerUrl, setBannerUrl, description, setDescription, hours, setHours, deliveryZone, setDeliveryZone, businessLat, setBusinessLat, businessLon, setBusinessLon, showMapPicker, setShowMapPicker, pickerLat, setPickerLat, pickerLon, setPickerLon, razonSocial, setRazonSocial, ruc, setRuc, businessEmail, setBusinessEmail, currency, setCurrency, businessType, setBusinessType, socialLinks, setSocialLinks, yapeEnabled, setYapeEnabled, yapeImage, setYapeImage, yapeName, setYapeName, yapePhone, setYapePhone, cashEnabled, setCashEnabled, plinEnabled, setPlinEnabled, plinImage, setPlinImage, plinName, setPlinName, plinPhone, setPlinPhone, transferEnabled, setTransferEnabled, transferBankName, setTransferBankName, transferAccountNum, setTransferAccountNum, transferAccountHolder, setTransferAccountHolder, maintenanceMode, setMaintenanceMode, maintenanceMsg, setMaintenanceMsg, bypassLogin, setBypassLogin, primaryColor, setPrimaryColor, secondaryColor, setSecondaryColor, slogan, setSlogan, taxRate, setTaxRate, sunatRuc, setSunatRuc, sunatDenominacion, setSunatDenominacion, cashAlertMax, setCashAlertMax, autoCloseTime, setAutoCloseTime, maxDiscountPercent, setMaxDiscountPercent, adelantoTopeCajero, setAdelantoTopeCajero, deliveryZones, setDeliveryZones, freeDeliveryMin, setFreeDeliveryMin, lastBackupAt, setLastBackupAt, uploadingField, setUploadingField, cargar, faltan, faltanCobros, faltanDelivery, faltanTienda, pendientes, irAFalta, faltanPorSeccion, patch, handleFileUpload, loading, cargaFallida, saving, invoiceFooterText, setInvoiceFooterText, ...cambios,
  };
}

export type AjustesEstado = ReturnType<typeof useAjustes>;
