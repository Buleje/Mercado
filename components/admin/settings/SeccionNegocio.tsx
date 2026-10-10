import { useRef } from "react";
import { useTenant } from "@/contexts/tenant-context";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { ImageDropCard, MockHeader, MockStoreCard, MockStorefront } from "@/components/admin/settings/ImageDropCard";
import { cn } from "@/lib/utils";
import { Store, Phone, MapPin, Clock, AlignLeft, ShoppingCart, MessageCircle, Truck, DollarSign, FileText, Hash, Mail, Eye, EyeOff } from "@buleje/design-system/icons";
import { FieldLabel, TextInput, SelectInput, SectionCard, SaveButton } from "@/components/admin/settings/campos";
import type { AjustesEstado } from "@/components/admin/settings/use-ajustes";
import type { StoreMode } from "@/lib/jsondb";

export function SeccionNegocio({ aj, onModeChange }: { aj: AjustesEstado; onModeChange: (m: StoreMode) => void }) {
  const { mode, setMode, businessName, setBusinessName, businessPhone, setBusinessPhone, businessAddress, setBusinessAddress, logoUrl, setLogoUrl, coverUrl, setCoverUrl, bannerUrl, setBannerUrl, description, setDescription, hours, setHours, deliveryZone, setDeliveryZone, businessLat, setBusinessLat, businessLon, setBusinessLon, setShowMapPicker, setPickerLat, setPickerLon, razonSocial, setRazonSocial, ruc, setRuc, businessEmail, setBusinessEmail, currency, setCurrency, businessType, setBusinessType, socialLinks, setSocialLinks, uploadingField, patch, handleFileUpload, saving, savedSection } = aj;
  // El nombre del tenant (no «Mi Bodega», que es el rótulo genérico del vertical).
  const { branding } = useTenant();
  // Las maquetas de «dónde aparece» de logo, portada y banner: un botón para las tres, recordado.
  const [verMaquetas, setVerMaquetas] = useLocalStorage<boolean>("ajustes-ver-maquetas", false);
  const coverImgRef = useRef<HTMLInputElement>(null);
  const bannerImgRef = useRef<HTMLInputElement>(null);
  const logoImgRef = useRef<HTMLInputElement>(null);
  return (
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
}
