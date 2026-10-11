import { useRef } from "react";
import { toast } from "sonner";
import { useTenant } from "@/contexts/tenant-context";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { ImageDropCard, MockHeader, MockStoreCard, MockStorefront } from "@/components/admin/settings/ImageDropCard";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Store, Phone, MapPin, Clock, AlignLeft, ShoppingCart, MessageCircle, Truck, DollarSign, FileText, Hash, Mail, Eye, EyeOff, Locate } from "@buleje/design-system/icons";
import { FieldLabel, TextInput, TextArea, SelectInput, SectionCard, Plegable } from "@/components/admin/settings/campos";
import { TicketPie } from "@/components/admin/settings/TicketPie";
import type { AjustesEstado } from "@/components/admin/settings/use-ajustes";

const BOTON_ICONO = "grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--accent-ink)] dark:text-[var(--accent)] hover:border-primary transition-colors";
const TIPOS = [
  { value: "bodega", label: "Bodega" }, { value: "minimarket", label: "Minimarket" },
  { value: "tienda", label: "Tienda" }, { value: "restaurante", label: "Restaurante" },
];
const MONEDAS = [{ value: "PEN", label: "S/ — Sol peruano" }, { value: "USD", label: "$ — Dólar" }];

/**
 * Datos del negocio (11-10, patrón del panel): lo que se usa todos los días a
 * la vista —identidad y contacto, el ticket y el logo— en bloques de 2
 * columnas; lo que se llena una vez (cómo te piden, tipo, moneda, horario,
 * descripción) y las redes, plegados con su resumen. Se guarda con la barra
 * de «cambios sin guardar» de Configuración.
 */
export function SeccionNegocio({ aj }: { aj: AjustesEstado }) {
  const { mode, setMode, businessName, setBusinessName, businessPhone, setBusinessPhone, businessAddress, setBusinessAddress, logoUrl, setLogoUrl, coverUrl, setCoverUrl, bannerUrl, setBannerUrl, description, setDescription, hours, setHours, deliveryZone, setDeliveryZone, businessLat, setBusinessLat, businessLon, setBusinessLon, setShowMapPicker, setPickerLat, setPickerLon, razonSocial, setRazonSocial, ruc, setRuc, businessEmail, setBusinessEmail, currency, setCurrency, businessType, setBusinessType, socialLinks, setSocialLinks, invoiceFooterText, setInvoiceFooterText, uploadingField, handleFileUpload } = aj;
  // El nombre del tenant (no «Mi Bodega», que es el rótulo genérico del vertical).
  const { branding } = useTenant();
  // Las maquetas de «dónde aparece» de logo, portada y banner: un botón para las tres, recordado.
  const [verMaquetas, setVerMaquetas] = useLocalStorage<boolean>("ajustes-ver-maquetas", false);
  const coverImgRef = useRef<HTMLInputElement>(null);
  const bannerImgRef = useRef<HTMLInputElement>(null);
  const logoImgRef = useRef<HTMLInputElement>(null);

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) { toast.error("Este equipo no comparte su ubicación"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPickerLat(pos.coords.latitude);
        setPickerLon(pos.coords.longitude);
        setBusinessLat(pos.coords.latitude);
        setBusinessLon(pos.coords.longitude);
        toast.success("Ubicación tomada", { description: "Guarda los cambios para que quede." });
      },
      // Antes se callaba: el botón no hacía nada si negabas el permiso.
      () => toast.error("No se pudo leer tu ubicación", { description: "Dale permiso al navegador o márcala en el mapa." }),
      { enableHighAccuracy: true },
    );
  };

  const redes = [socialLinks.facebook && "Facebook", socialLinks.instagram && "Instagram", socialLinks.tiktok && "TikTok"].filter(Boolean);
  const resumenTienda = [
    mode === "whatsapp" ? "Pedidos por WhatsApp" : "Checkout en la tienda",
    TIPOS.find((t) => t.value === businessType)?.label,
    currency === "USD" ? "Dólares" : "Soles",
    hours.trim() || "sin horario",
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <SectionCard title="Identidad y contacto" desc="Tus datos legales y de contacto. Salen en tus tickets, boletas, cotizaciones y en tu tienda.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <div className="flex items-center gap-2">
              <FieldLabel icon={<Store className="h-3.5 w-3.5" />} htmlFor="settings-businessName">Nombre comercial</FieldLabel>
              {!businessName.trim() && branding.name && (
                <button type="button" onClick={() => setBusinessName(branding.name ?? "")} className="mb-1 ml-auto truncate text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:underline">
                  Usar «{branding.name}»
                </button>
              )}
            </div>
            <TextInput id="settings-businessName" value={businessName} onChange={setBusinessName} />
          </div>
          <div><FieldLabel icon={<FileText className="h-3.5 w-3.5" />} htmlFor="settings-razonSocial">Razón social</FieldLabel><TextInput id="settings-razonSocial" value={razonSocial} onChange={setRazonSocial} placeholder="Inversiones San Martín S.A.C." /></div>
          <div><FieldLabel icon={<Hash className="h-3.5 w-3.5" />} htmlFor="settings-ruc">RUC</FieldLabel><TextInput id="settings-ruc" value={ruc} onChange={setRuc} placeholder="20123456789" mono /></div>
          <div><FieldLabel icon={<Phone className="h-3.5 w-3.5" />} htmlFor="settings-businessPhone">WhatsApp</FieldLabel><TextInput id="settings-businessPhone" value={businessPhone} onChange={setBusinessPhone} placeholder="51987654321" mono /></div>
          <div>
            <FieldLabel icon={<Mail className="h-3.5 w-3.5" />} htmlFor="settings-businessEmail">
              Correo del negocio
              <InfoTip
                title="Correo del negocio"
                what="Sale en tu tienda y te llegan aquí los avisos de uso de tu plan."
                affects="El reporte mensual y el semanal van al correo con el que creaste tu cuenta, no a éste: para cambiarlo, escríbele a soporte."
              />
            </FieldLabel>
            <TextInput id="settings-businessEmail" value={businessEmail} onChange={setBusinessEmail} placeholder="ventas@bodega.pe" type="email" />
          </div>
          <div>
            <FieldLabel htmlFor="settings-businessAddress" icon={<MapPin className="h-3.5 w-3.5" />}>Dirección</FieldLabel>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1"><TextInput id="settings-businessAddress" value={businessAddress} onChange={setBusinessAddress} placeholder="Jr. Ucayali 123, Pucallpa" /></div>
              <button type="button" aria-label="Marcar en el mapa" title="Marcar en el mapa" onClick={() => setShowMapPicker(true)} className={BOTON_ICONO}>
                <MapPin className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Usar mi ubicación" title="Usar mi ubicación" onClick={usarMiUbicacion} className={BOTON_ICONO}>
                <Locate className="h-4 w-4" />
              </button>
            </div>
            {businessLat != null && businessLon != null && <p className="mt-1 text-sm font-mono text-[var(--text-tertiary)]">GPS {businessLat.toFixed(5)}, {businessLon.toFixed(5)}</p>}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Tu ticket" desc="Arriba salen tu nombre, razón social, RUC y dirección; abajo, el texto que escribas aquí. Lo usan tus tickets, recibos, cotizaciones, órdenes de compra y fiados.">
        <TicketPie
          pie={invoiceFooterText}
          onPie={setInvoiceFooterText}
          nombre={businessName.trim() || branding.name || ""}
          razonSocial={razonSocial.trim()}
          ruc={ruc.trim()}
          direccion={businessAddress.trim()}
        />
      </SectionCard>

      {/* ─── Identidad visual: 3 imágenes (Logo + Portada + Banner) ─── */}
      <SectionCard
        title="Logo e imágenes"
        desc="Tu logo sale en el panel y en tu tarjeta del marketplace; la portada, en la lista de tiendas; el banner, arriba de tu tienda."
        accion={
          <button
            type="button"
            onClick={() => setVerMaquetas(v => !v)}
            aria-expanded={verMaquetas}
            aria-label={verMaquetas ? "Ocultar dónde aparecen" : "Ver dónde aparecen"}
            title={verMaquetas ? "Ocultar dónde aparecen" : "Ver dónde aparecen"}
            className="inline-flex items-center gap-1.5 h-12 px-2.5 rounded-lg text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            {verMaquetas ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="hidden sm:inline">{verMaquetas ? "Ocultar dónde aparecen" : "Dónde aparecen"}</span>
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div id="settings-logo">
            <ImageDropCard
              label="Logo"
              hint="Cuadrado · 200×200"
              whereVisible="Cabecera del panel e ícono pequeño en tu tarjeta"
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
            whereVisible="Foto principal de tu tarjeta en /tiendas"
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
            hint="Panorámico · 1600×500 (16:5)"
            whereVisible="La franja grande al entrar a tu tienda"
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

      {/* Lo que se llena una vez: plegado con su resumen (antes, la mitad de «Identidad» y la tarjeta «Ubicación»). */}
      <Plegable clave="negocio-tienda-pedidos" titulo="Pedidos, horario y descripción" resumen={resumenTienda}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <div role="group" aria-labelledby="settings-mode-label">
            <span id="settings-mode-label" className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)] mb-1">
              <ShoppingCart className="h-3.5 w-3.5" />Cómo te piden tus clientes
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(["whatsapp", "checkout"] as const).map(m => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={cn(
                  "flex items-center justify-center gap-1.5 h-12 px-2 rounded-xl border transition-colors text-sm font-semibold",
                  mode === m
                    ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)]",
                )}>
                  {m === "whatsapp" ? <MessageCircle className="h-4 w-4 shrink-0" /> : <ShoppingCart className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{m === "whatsapp" ? "WhatsApp" : "Checkout"}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="settings-businessType" icon={<Store className="h-3.5 w-3.5" />}>Tipo de negocio</FieldLabel>
            <SelectInput id="settings-businessType" value={businessType} onChange={setBusinessType} options={TIPOS} />
          </div>
          <div>
            <FieldLabel htmlFor="settings-currency" icon={<DollarSign className="h-3.5 w-3.5" />}>Moneda</FieldLabel>
            <SelectInput id="settings-currency" value={currency} onChange={setCurrency} options={MONEDAS} />
          </div>
          <div><FieldLabel htmlFor="settings-hours" icon={<Clock className="h-3.5 w-3.5" />}>Horario</FieldLabel><TextInput id="settings-hours" value={hours} onChange={setHours} placeholder="Lun - Sáb: 7am - 9pm" /></div>
          <div><FieldLabel htmlFor="settings-deliveryZone" icon={<Truck className="h-3.5 w-3.5" />}>Zona de delivery</FieldLabel><TextInput id="settings-deliveryZone" value={deliveryZone} onChange={setDeliveryZone} placeholder="Centro de Pucallpa" /></div>
          <div><FieldLabel htmlFor="settings-description" icon={<AlignLeft className="h-3.5 w-3.5" />}>Descripción</FieldLabel><TextArea id="settings-description" value={description} onChange={setDescription} rows={1} /></div>
        </div>
      </Plegable>

      <Plegable clave="negocio-redes" titulo="Redes sociales" resumen={redes.length ? redes.join(" · ") : "Ninguna todavía · salen al pie de tu tienda"}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><FieldLabel htmlFor="settings-facebook">Facebook</FieldLabel><TextInput id="settings-facebook" value={socialLinks.facebook || ""} onChange={v => setSocialLinks(p => ({ ...p, facebook: v }))} placeholder="facebook.com/tubodega" /></div>
          <div><FieldLabel htmlFor="settings-instagram">Instagram</FieldLabel><TextInput id="settings-instagram" value={socialLinks.instagram || ""} onChange={v => setSocialLinks(p => ({ ...p, instagram: v }))} placeholder="@tubodega" /></div>
          <div><FieldLabel htmlFor="settings-tiktok">TikTok</FieldLabel><TextInput id="settings-tiktok" value={socialLinks.tiktok || ""} onChange={v => setSocialLinks(p => ({ ...p, tiktok: v }))} placeholder="@tubodega" /></div>
        </div>
      </Plegable>
    </div>
  );
}
