"use client";

import { useEffect, useState, type ComponentType } from "react";
import {
  Facebook,
  Video,
  Link2,
  Check,
  CheckCircle2,
  Loader2,
  Save,
  BarChart3,
  Boxes,
  Radio,
  Users,
  Layers,
  ShieldCheck,
  TrendingUp,
  ShoppingBag,
  Tag,
  Share2,
} from "@buleje/design-system/icons";
import { CardTitle, ErrorAlert, LoadingState, SectionTitle } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { PermisoDe } from "@/components/admin/shared/PermisoDe";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import { EMPTY_SALES_CHANNELS, type SalesChannelsConfig } from "@/lib/types/sales-channels";
import SalesChannelsAnalyticsPanel from "./SalesChannelsAnalyticsPanel";

type Icon = ComponentType<{ className?: string }>;
type Feature = { Icon: Icon; title: string; desc: string };

const META_FEATURES: Feature[] = [
  { Icon: ShoppingBag, title: "Facebook Shop / Instagram Shopping", desc: "Tienda y catálogo en Facebook e Instagram, gestionado desde Commerce Manager." },
  { Icon: Tag, title: "Etiquetado de productos", desc: "Etiqueta productos directamente en publicaciones e historias de Instagram." },
  { Icon: BarChart3, title: "Meta Pixel", desc: "Mide cada visitante, optimiza anuncios y permite remarketing a quien ya te visitó." },
  { Icon: ShieldCheck, title: "API de Conversiones (CAPI)", desc: "Envía eventos desde tu servidor: menos afectado por bloqueadores, más control del dato." },
  { Icon: Boxes, title: "Catálogo sincronizado", desc: "Sincroniza el catálogo con Meta para anuncios dinámicos y campañas Advantage+." },
  { Icon: TrendingUp, title: "Embudo completo + Advantage+", desc: "Rastrea vista, carrito, pago y compra; la IA de Meta optimiza la entrega de anuncios." },
];

const TIKTOK_FEATURES: Feature[] = [
  { Icon: Boxes, title: "Catálogo sincronizado", desc: "Inventario, cumplimiento de pedidos y campañas de compra en vivo, coordinados." },
  { Icon: BarChart3, title: "Píxel de TikTok", desc: "Instalación directa para crear y administrar campañas publicitarias de TikTok." },
  { Icon: Layers, title: "Pedidos centralizados", desc: "Consolida pedidos de varios canales, evita sobreventa con stock en tiempo real." },
  { Icon: Radio, title: "Live Shopping", desc: "Transmisiones en vivo donde la gente compra mientras ve, sin salir de TikTok." },
  { Icon: ShoppingBag, title: "Checkout nativo", desc: "Catálogo, pago y servicio dentro de la app — el cliente nunca sale de TikTok." },
  { Icon: Users, title: "Afiliados / creadores", desc: "Creadores promocionan tu producto a cambio de comisión por venta." },
];

const COMBINED: Feature[] = [
  { Icon: Boxes, title: "Inventario único, multi-canal", desc: "Un solo stock se descuenta vendas donde vendas — TikTok, Meta o tu tienda." },
  { Icon: Users, title: "Atribución cruzada", desc: "TikTok capta la compra impulsiva; tu sitio/Meta construye tu base de clientes." },
  { Icon: Radio, title: "Doble fuente de tráfico", desc: "Si una plataforma cambia su algoritmo, la otra sigue funcionando." },
  { Icon: ShieldCheck, title: "Datos propios vs prestados", desc: "Cada pedido en tu sitio es tu dato de cliente — público propio y compras repetidas." },
];

const GA_FEATURES: Feature[] = [
  { Icon: Users, title: "Audiencia y comportamiento", desc: "Cuántos entran, de dónde vienen, qué páginas ven y cuánto se quedan." },
  { Icon: TrendingUp, title: "Embudo de conversión", desc: "Del catálogo al pago: dónde abandonan y qué canal/campaña trae ventas." },
  { Icon: ShoppingBag, title: "Evento de compra automático", desc: "Cada pedido confirmado dispara 'purchase' con el monto — ROI real por canal." },
];

const FIELD =
  "w-full h-12 text-sm border border-[var(--rule-base)] rounded-xl px-3 bg-[var(--surface-raised)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

export default function SalesChannelsTab() {
  const [config, setConfig] = useState<SalesChannelsConfig>(EMPTY_SALES_CHANNELS);
  const [analyticsId, setAnalyticsId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/sales-channels", { headers: csrfHeaders({}) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { channels?: SalesChannelsConfig; analyticsId?: string } | null) => {
        if (!active || !d) return;
        if (d.channels) setConfig(d.channels);
        if (typeof d.analyticsId === "string") setAnalyticsId(d.analyticsId);
      })
      .catch((err) => console.error("[sales-channels] load failed", err))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sales-channels", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...config, analyticsId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { channels: SalesChannelsConfig; analyticsId?: string };
      setConfig(d.channels);
      if (typeof d.analyticsId === "string") setAnalyticsId(d.analyticsId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("[sales-channels] save failed", err);
      setError("No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <LoadingState message={null} className="py-10" />
    );
  }

  const metaConnected = config.meta.pixelId.trim().length > 0;
  const tiktokConnected = config.tiktok.pixelId.trim().length > 0;
  const gaConnected = analyticsId.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Sin cabecera de módulo: el título de la pantalla es el de Tienda
          online. La vista lleva SU título (SectionTitle, como Apariencia y
          Páginas) en la misma fila que el estado de cada red: sin él, los 8
          títulos de abajo quedaban sin jerarquía (medir-orden 10-10: puntaje 6). */}
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle className="mr-2 flex items-center gap-2">
          <Share2 className="h-5 w-5 text-[var(--accent)]" aria-hidden />
          Redes y medición
        </SectionTitle>
        <StatusChip label="Meta" connected={metaConnected} />
        <PermisoDe origen="canales">
          <StatusChip label="TikTok" connected={tiktokConnected} />
        </PermisoDe>
        <StatusChip label="Google Analytics" connected={gaConnected} />
        <InfoTip
          title="Canales de venta"
          ancho="w-96"
          what={<span>Conecta TikTok, Meta y Google Analytics con tus IDs: los eventos de compra se activan solos en tu tienda.</span>}
          body={
            <span className="block space-y-2">
              {COMBINED.map(({ title, desc }) => (
                <span key={title} className="block">
                  <span className="block font-bold text-[var(--text-primary)]">{title}</span>
                  <span className="block">{desc}</span>
                </span>
              ))}
            </span>
          }
        />
      </div>

      {error && <ErrorAlert description={error} />}

      {/* Visitas de la tienda: la única vista de /api/store-page/analytics (10-10) */}
      <SalesChannelsAnalyticsPanel />

      {/* Meta */}
      <ChannelCard
        Brand={Facebook}
        name="Meta — Facebook + Instagram"
        connected={metaConnected}
        accent="var(--data-info-500)"
        features={META_FEATURES}
      >
        <Field
          label="Meta Pixel ID"
          placeholder="Ej. 123456789012345"
          value={config.meta.pixelId}
          onChange={(v) => setConfig((c) => ({ ...c, meta: { ...c.meta, pixelId: v } }))}
        />
        {/* R2 (10-10): el Pixel lo editaba también Mi Tienda (Básico) en
            Avanzado; CAPI, catálogo y TikTok eran sólo de Canales (Pro). */}
        <PermisoDe origen="canales">
          <Field
            label="Token CAPI (opcional)"
            placeholder="Token de la API de Conversiones"
            value={config.meta.capiToken}
            onChange={(v) => setConfig((c) => ({ ...c, meta: { ...c.meta, capiToken: v } }))}
          />
          <Field
            label="ID de Catálogo (opcional)"
            placeholder="Para anuncios dinámicos / Advantage+"
            value={config.meta.catalogId}
            onChange={(v) => setConfig((c) => ({ ...c, meta: { ...c.meta, catalogId: v } }))}
          />
        </PermisoDe>
      </ChannelCard>

      {/* TikTok */}
      <PermisoDe origen="canales">
        <ChannelCard
          Brand={Video}
          name="TikTok Shop"
          connected={tiktokConnected}
          accent="var(--text-primary)"
          features={TIKTOK_FEATURES}
        >
          <Field
            label="TikTok Pixel ID"
            placeholder="Ej. C1A2B3C4D5E6F7G8"
            value={config.tiktok.pixelId}
            onChange={(v) => setConfig((c) => ({ ...c, tiktok: { ...c.tiktok, pixelId: v } }))}
          />
          <Field
            label="ID de Catálogo (opcional)"
            placeholder="Catálogo de TikTok Shop"
            value={config.tiktok.catalogId}
            onChange={(v) => setConfig((c) => ({ ...c, tiktok: { ...c.tiktok, catalogId: v } }))}
          />
        </ChannelCard>
      </PermisoDe>

      {/* Google Analytics 4 — mismo storeTheme.analyticsId que Config/customizer */}
      <ChannelCard
        Brand={BarChart3}
        name="Google Analytics 4"
        connected={gaConnected}
        accent="var(--data-warning-500)"
        features={GA_FEATURES}
        nota="Se edita solo aquí. Apariencia › Avanzado muestra el mismo ID, sin editarlo."
      >
        <Field
          label="ID de medición (GA4)"
          placeholder="G-XXXXXXXXXX"
          value={analyticsId}
          onChange={setAnalyticsId}
        />
      </ChannelCard>

      {/* Sin -mx: el margen negativo sacaba la barra 4 px del ancho (medir-orden 10-10). */}
      <div className="sticky bottom-0 z-10 mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 shadow-[var(--shadow-sm)]">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={button({ variant: "primary", className: "rounded-xl" })}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          Guardar canales
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-ink)]" role="status">
            <CheckCircle2 className="h-4 w-4" /> Guardado · pixels activos en tu tienda
          </span>
        )}
      </div>
    </div>
  );
}

/** Chip compacto de estado por canal (conectado / sin conectar). */
function StatusChip({ label, connected }: { label: string; connected: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold",
        connected
          ? "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-ink)]"
          : "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
      )}
    >
      {connected ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
      {label}
      <span className="opacity-70">· {connected ? "conectado" : "sin conectar"}</span>
    </span>
  );
}

function ChannelCard({
  Brand,
  name,
  connected,
  accent,
  features,
  nota,
  children,
}: {
  Brand: Icon;
  name: string;
  connected: boolean;
  accent: string;
  features: Feature[];
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b-2 border-[var(--rule-soft)]">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "var(--surface-sunken)", color: accent }}
          >
            <Brand className="h-5 w-5" />
          </span>
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">{name}</CardTitle>
          <InfoTip
            title={`Qué desbloquea ${name}`}
            ancho="w-96"
            body={
              <span className="block space-y-2">
                {features.map(({ title, desc }) => (
                  <span key={title} className="block">
                    <span className="block font-bold text-[var(--text-primary)]">{title}</span>
                    <span className="block">{desc}</span>
                  </span>
                ))}
                {nota && <span className="block border-t border-[var(--rule-soft)] pt-2">{nota}</span>}
              </span>
            }
          />
        </div>
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full",
            connected
              ? "bg-[var(--data-success-50)] text-[var(--data-success-ink)]"
              : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
          )}
        >
          {connected ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
          {connected ? "Conectado" : "Sin conectar"}
        </span>
      </header>

      <div className="p-4 space-y-3">{children}</div>

    </section>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold text-[var(--text-secondary)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={FIELD}
      />
    </label>
  );
}
