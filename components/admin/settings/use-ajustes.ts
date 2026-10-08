import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { StoreMode } from "@/lib/jsondb";
import { csrfHeaders } from "@/lib/csrf-client";
import type { FaltaItem } from "@/components/admin/settings/navegacion";
import type { SeccionAjustes } from "@/components/admin/settings/secciones";

export type DeliveryZone = { name: string; fee: number; estimatedMin: number };
export type SocialLinks = { facebook?: string; instagram?: string; tiktok?: string };
export type SettingsData = Record<string, unknown>;

/**
 * Estado y guardado compartidos de Ajustes: carga de /api/settings, los campos
 * del formulario, «Te falta» por sección, el PUT (`patch`) y la subida de imágenes.
 * Cada sección (`Seccion*.tsx`) lee de aquí lo suyo.
 */
export function useAjustes(storeMode: StoreMode, activeSection: SeccionAjustes) {
  const [loading, setLoading] = useState(true);
  // Si /api/settings no respondió, el formulario tiene valores vacíos: guardar
  // pisaría lo real con vacío. Las secciones que dependen de él se bloquean.
  const [cargaFallida, setCargaFallida] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSection, setSavedSection] = useState<string | null>(null);

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

  return {
    mode, setMode, businessName, setBusinessName, businessPhone, setBusinessPhone, businessAddress, setBusinessAddress, logoUrl, setLogoUrl, coverUrl, setCoverUrl, bannerUrl, setBannerUrl, description, setDescription, hours, setHours, deliveryZone, setDeliveryZone, businessLat, setBusinessLat, businessLon, setBusinessLon, showMapPicker, setShowMapPicker, pickerLat, setPickerLat, pickerLon, setPickerLon, razonSocial, setRazonSocial, ruc, setRuc, businessEmail, setBusinessEmail, currency, setCurrency, businessType, setBusinessType, socialLinks, setSocialLinks, yapeEnabled, setYapeEnabled, yapeImage, setYapeImage, yapeName, setYapeName, yapePhone, setYapePhone, cashEnabled, setCashEnabled, plinEnabled, setPlinEnabled, plinImage, setPlinImage, plinName, setPlinName, plinPhone, setPlinPhone, transferEnabled, setTransferEnabled, transferBankName, setTransferBankName, transferAccountNum, setTransferAccountNum, transferAccountHolder, setTransferAccountHolder, maintenanceMode, setMaintenanceMode, maintenanceMsg, setMaintenanceMsg, bypassLogin, setBypassLogin, primaryColor, setPrimaryColor, secondaryColor, setSecondaryColor, slogan, setSlogan, taxRate, setTaxRate, sunatRuc, setSunatRuc, sunatDenominacion, setSunatDenominacion, cashAlertMax, setCashAlertMax, autoCloseTime, setAutoCloseTime, deliveryZones, setDeliveryZones, freeDeliveryMin, setFreeDeliveryMin, lastBackupAt, setLastBackupAt, uploadingField, setUploadingField, cargar, faltan, faltanCobros, faltanDelivery, faltanTienda, pendientes, irAFalta, faltanPorSeccion, patch, handleFileUpload, loading, cargaFallida, saving, savedSection,
  };
}

export type AjustesEstado = ReturnType<typeof useAjustes>;
