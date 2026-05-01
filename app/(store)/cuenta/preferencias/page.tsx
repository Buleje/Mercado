"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft, Bell, Mail, Moon, Globe, Shield, Trash2,
  ChevronRight, Smartphone,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));

// ── Toggle row ─────────────────────────────────────────────────────
function ToggleRow({
  label,
  sublabel,
  checked,
  onChange,
  Icon,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 dark:border-card-border last:border-0">
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        {Icon && (
          <Icon className="h-4 w-4 text-muted shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm text-foreground">{label}</p>
          {sublabel && (
            <p className="text-[length:var(--ts-2xs)] text-muted mt-0.5">{sublabel}</p>
          )}
        </div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
          checked ? "bg-primary" : "bg-gray-200 dark:bg-surface"
        )}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-4.5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

// ── Select row ─────────────────────────────────────────────────────
function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
  Icon,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 dark:border-card-border last:border-0">
      <div className="flex items-center gap-2.5">
        {Icon && <Icon className="h-4 w-4 text-muted shrink-0" />}
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="text-xs font-semibold text-muted bg-gray-50 dark:bg-surface border border-gray-200 dark:border-card-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Link row ───────────────────────────────────────────────────────
function LinkRow({
  label,
  sublabel,
  href,
  Icon,
  danger,
}: {
  label: string;
  sublabel?: string;
  href?: string;
  Icon?: React.ComponentType<{ className?: string }>;
  danger?: boolean;
}) {
  const inner = (
    <div className="flex items-center gap-2.5 py-3 border-b border-gray-50 dark:border-card-border last:border-0 group cursor-pointer">
      <div
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
          danger ? "bg-red-50 dark:bg-red-900/20" : "bg-gray-50 dark:bg-surface"
        )}
      >
        {Icon && (
          <Icon
            className={cn(
              "h-4 w-4",
              danger ? "text-red-500" : "text-muted"
            )}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm",
            danger ? "text-red-600 dark:text-red-400 font-semibold" : "text-foreground"
          )}
        >
          {label}
        </p>
        {sublabel && (
          <p className="text-[length:var(--ts-2xs)] text-muted mt-0.5">{sublabel}</p>
        )}
      </div>
      <ChevronRight
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          danger
            ? "text-red-300"
            : "text-gray-300 group-hover:text-gray-400"
        )}
      />
    </div>
  );

  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return <div>{inner}</div>;
}

// ── Main ───────────────────────────────────────────────────────────
type ThemeOption = "system" | "light" | "dark";
type LangOption = "es" | "en";

export default function PreferenciasPage() {
  const [notifWhatsApp, setNotifWhatsApp] = useState(true);
  const [notifEmail, setNotifEmail] = useState(false);
  const [notifPromos, setNotifPromos] = useState(true);
  const [notifPedidos, setNotifPedidos] = useState(true);
  const [theme, setTheme] = useState<ThemeOption>("system");
  const [lang, setLang] = useState<LangOption>("es");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi cuenta", url: "https://www.buleje.pe/cuenta" },
          { name: "Preferencias", url: "https://www.buleje.pe/cuenta/preferencias" },
        ]}
      />
      <AnnouncementBar />
      <Header />

      {/* Hero */}
      <div
        className="pt-32 sm:pt-36 pb-8 border-b border-gray-200 dark:border-gray-800"
        style={{ background: "#060a0d" }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <nav
            aria-label="Migas de pan"
            className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-white/35 mb-5"
          >
            <Link href="/" className="hover:text-white/60 transition-colors">
              Inicio
            </Link>
            <span>/</span>
            <Link href="/cuenta" className="hover:text-white/60 transition-colors">
              Mi cuenta
            </Link>
            <span>/</span>
            <span className="text-white/55">Preferencias</span>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/cuenta"
              className="p-2 -ml-1 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white"
              aria-label="Volver"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            </Link>
            <div>
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/40">
                TU CUENTA
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-tight tracking-[var(--ls-tight)]">
                Preferencias
              </h1>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-28">

        {/* Seccion: Notificaciones */}
        <section aria-labelledby="notif-heading">
          <div className="mb-2 px-1">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted">
              NOTIFICACIONES
            </span>
          </div>
          <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border px-4">
            <ToggleRow
              label="WhatsApp"
              sublabel="Actualizaciones de pedido por WhatsApp"
              checked={notifWhatsApp}
              onChange={setNotifWhatsApp}
              Icon={Smartphone}
            />
            <ToggleRow
              label="Correo electrónico"
              sublabel="Resumen semanal y comprobantes"
              checked={notifEmail}
              onChange={setNotifEmail}
              Icon={Mail}
            />
            <ToggleRow
              label="Pedidos y delivery"
              sublabel="Estado de tus pedidos en tiempo real"
              checked={notifPedidos}
              onChange={setNotifPedidos}
              Icon={Bell}
            />
            <ToggleRow
              label="Promociones y ofertas"
              sublabel="Cupones, descuentos y novedades"
              checked={notifPromos}
              onChange={setNotifPromos}
              Icon={Bell}
            />
          </div>
        </section>

        {/* Seccion: Apariencia */}
        <section aria-labelledby="appearance-heading">
          <div className="mb-2 px-1">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted">
              APARIENCIA
            </span>
          </div>
          <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border px-4">
            <SelectRow
              label="Modo de pantalla"
              value={theme}
              onChange={setTheme}
              Icon={Moon}
              options={[
                { value: "system", label: "Sistema" },
                { value: "light", label: "Claro" },
                { value: "dark", label: "Oscuro" },
              ]}
            />
            <SelectRow
              label="Idioma"
              value={lang}
              onChange={setLang}
              Icon={Globe}
              options={[
                { value: "es", label: "Espanol" },
                { value: "en", label: "English" },
              ]}
            />
          </div>
        </section>

        {/* Seccion: Privacidad */}
        <section aria-labelledby="privacy-heading">
          <div className="mb-2 px-1">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted">
              PRIVACIDAD
            </span>
          </div>
          <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border px-4">
            <LinkRow
              label="Politica de privacidad"
              sublabel="Como usamos tus datos"
              href="/privacidad"
              Icon={Shield}
            />
            <LinkRow
              label="Terminos de servicio"
              sublabel="Condiciones de uso de Buleje"
              href="/terminos"
              Icon={Shield}
            />
            <LinkRow
              label="Eliminar mi cuenta"
              sublabel="Esta accion no se puede deshacer"
              Icon={Trash2}
              danger
            />
          </div>
        </section>

        {/* Guardar CTA */}
        <button className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
          Guardar preferencias
        </button>
      </main>

      <CartSidebar />
      <MobileBottomNav />
    </div>
  );
}
