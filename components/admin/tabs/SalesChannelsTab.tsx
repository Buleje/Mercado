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
  Megaphone,
  BarChart3,
  Boxes,
  Radio,
  Users,
  Layers,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  ShoppingBag,
  Tag,
} from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import { EMPTY_SALES_CHANNELS, type SalesChannelsConfig } from "@/lib/types/sales-channels";

type Icon = ComponentType<{ className?: string }>;
type Feature = { Icon: Icon; title: string; desc: string };

const META_FEATURES: Feature[] = [
  { Icon: ShoppingBag, title: "Facebook Shop / Instagram Shopping", desc: "Tienda y catálogo en Facebook e Instagram, gestionado desde Commerce Manager." },
  { Icon: Tag, title: "Etiquetado de productos", desc: "Etiquetá productos directamente en publicaciones e historias de Instagram." },
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

const FIELD =
  "w-full h-11 text-sm border-2 border-[var(--rule-base)] rounded-xl px-3 bg-[var(--surface-raised)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

export default function SalesChannelsTab() {
  const [config, setConfig] = useState<SalesChannelsConfig>(EMPTY_SALES_CHANNELS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/sales-channels", { headers: csrfHeaders({}) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { channels?: SalesChannelsConfig } | null) => {
        if (active && d?.channels) setConfig(d.channels);
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
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { channels: SalesChannelsConfig };
      setConfig(d.channels);
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
      <div className="p-10 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-[var(--text-tertiary)]" />
      </div>
    );
  }

  const metaConnected = config.meta.pixelId.trim().length > 0;
  const tiktokConnected = config.tiktok.pixelId.trim().length > 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
          Canales de venta
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Conectá tu tienda con TikTok Shop y Meta (Facebook + Instagram). Pegá tus Pixel IDs y se
          activan los eventos en tu tienda. Las integraciones profundas (catálogo en vivo, checkout
          nativo, live shopping) se habilitan con la app de cada plataforma.
        </p>
      </div>

      {error && (
        <p className="text-sm font-semibold text-[var(--data-error-500)] rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2">
          {error}
        </p>
      )}

      {/* Beneficios combinados */}
      <section className="rounded-2xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] p-4">
        <p className="flex items-center gap-2 text-sm font-extrabold text-[var(--accent)] uppercase tracking-wide">
          <Sparkles className="h-4 w-4" /> Conectando ambos ganás
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {COMBINED.map(({ Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-2.5">
              <Icon className="h-5 w-5 text-[var(--accent)] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]">{title}</p>
                <p className="text-sm text-[var(--text-secondary)]">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

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
      </ChannelCard>

      {/* TikTok */}
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

      <div className="flex items-center gap-3 sticky bottom-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          Guardar canales
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-500)]">
            <CheckCircle2 className="h-4 w-4" /> Guardado · pixels activos en tu tienda
          </span>
        )}
      </div>
    </div>
  );
}

function ChannelCard({
  Brand,
  name,
  connected,
  accent,
  features,
  children,
}: {
  Brand: Icon;
  name: string;
  connected: boolean;
  accent: string;
  features: Feature[];
  children: React.ReactNode;
}) {
  const [showFeatures, setShowFeatures] = useState(false);
  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b-2 border-[var(--rule-soft)]">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "var(--surface-sunken)", color: accent }}
          >
            <Brand className="h-5 w-5" />
          </span>
          <h2 className="text-base font-extrabold text-[var(--text-primary)]">{name}</h2>
        </div>
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full",
            connected
              ? "bg-[var(--data-success-50)] text-[var(--data-success-600)]"
              : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
          )}
        >
          {connected ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
          {connected ? "Conectado" : "Sin conectar"}
        </span>
      </header>

      <div className="p-4 space-y-3">{children}</div>

      <button
        type="button"
        onClick={() => setShowFeatures((s) => !s)}
        className="flex items-center gap-1.5 w-full px-4 py-2.5 border-t-2 border-[var(--rule-soft)] text-sm font-bold text-[var(--text-secondary)] hover:text-primary hover:bg-[var(--surface-sunken)]"
      >
        <Megaphone className="h-4 w-4" /> {showFeatures ? "Ocultar" : "Ver"} qué desbloquea este
        canal
      </button>
      {showFeatures && (
        <ul className="px-4 pb-4 pt-1 grid sm:grid-cols-2 gap-3">
          {features.map(({ Icon, title, desc }) => (
            <li key={title} className="flex items-start gap-2.5">
              <Icon className="h-5 w-5 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]">{title}</p>
                <p className="text-sm text-[var(--text-secondary)]">{desc}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
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
