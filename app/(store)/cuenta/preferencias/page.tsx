"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Bell,
  Mail,
  Moon,
  Sun,
  Globe,
  Shield,
  Trash2,
  ChevronRight,
  Smartphone,
  Settings,
  Palette,
  Lock,
  CheckCheck,
  AlertTriangle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));

// ── Toggle moderno ─────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
        disabled && "opacity-50 cursor-not-allowed",
      )}
      style={{
        background: checked
          ? "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)"
          : "var(--color-card-border)",
      }}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

// ── ToggleRow ──────────────────────────────────────────────────────

function ToggleRow({
  label,
  sublabel,
  checked,
  onChange,
  Icon,
  iconColor,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  Icon: typeof Bell;
  iconColor?: string;
}) {
  return (
    <div
      className="flex items-center justify-between py-3 border-b last:border-0"
      style={{ borderColor: "var(--color-card-border)" }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `color-mix(in oklch, ${iconColor ?? "var(--color-primary, #00B4A6)"} 12%, transparent)`,
          }}
        >
          <Icon
            className="h-5 w-5"
            style={{ color: iconColor ?? "var(--color-primary, #00B4A6)" }}
            strokeWidth={2.25}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-[var(--text-primary)]">{label}</p>
          {sublabel && (
            <p className="text-xs text-muted mt-0.5">{sublabel}</p>
          )}
        </div>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

// ── Select Pills ──────────────────────────────────────────────────

function SelectPills<T extends string>({
  label,
  sublabel,
  value,
  options,
  onChange,
  Icon,
}: {
  label: string;
  sublabel?: string;
  value: T;
  options: { value: T; label: string; Icon?: typeof Bell }[];
  onChange: (v: T) => void;
  Icon: typeof Bell;
}) {
  return (
    <div
      className="py-4 border-b last:border-0"
      style={{ borderColor: "var(--color-card-border)" }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background:
              "color-mix(in oklch, var(--color-primary, #00B4A6) 12%, transparent)",
          }}
        >
          <Icon
            className="h-5 w-5 text-primary"
            strokeWidth={2.25}
          />
        </div>
        <div>
          <p className="text-sm font-extrabold text-[var(--text-primary)]">{label}</p>
          {sublabel && <p className="text-xs text-muted">{sublabel}</p>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {options.map((opt) => {
          const active = value === opt.value;
          const OptIcon = opt.Icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-sm font-bold transition-all",
                !active &&
                  "text-muted hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-surface",
              )}
              style={
                active
                  ? {
                      background:
                        "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                      color: "white",
                      boxShadow:
                        "0 4px 10px -2px color-mix(in oklch, var(--color-primary, #00B4A6) 35%, transparent)",
                    }
                  : {
                      background: "var(--color-card)",
                      border: "2px solid var(--color-card-border)",
                    }
              }
            >
              {OptIcon && (
                <OptIcon className="h-5 w-5" strokeWidth={2.25} />
              )}
              <span className="text-sm font-extrabold">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Link Row ──────────────────────────────────────────────────────

function LinkRow({
  label,
  sublabel,
  href,
  Icon,
  danger,
  onClick,
}: {
  label: string;
  sublabel?: string;
  href?: string;
  Icon: typeof Bell;
  danger?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <div
      className={cn(
        "flex items-center gap-3 py-4 border-b last:border-0 group transition-colors",
        href || onClick ? "cursor-pointer hover:bg-[var(--surface-sunken)] dark:hover:bg-surface" : "",
      )}
      style={{
        borderColor: "var(--color-card-border)",
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: danger
            ? "color-mix(in oklch, var(--data-error-500) 12%, transparent)"
            : "color-mix(in oklch, var(--color-primary, #00B4A6) 10%, transparent)",
        }}
      >
        <Icon
          className="h-5 w-5"
          style={{
            color: danger
              ? "var(--data-error-500)"
              : "var(--color-primary, #00B4A6)",
          }}
          strokeWidth={2.25}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-extrabold",
            danger ? "text-[var(--data-error-600)] dark:text-red-400" : "text-[var(--text-primary)]",
          )}
        >
          {label}
        </p>
        {sublabel && (
          <p className="text-xs text-muted mt-0.5">{sublabel}</p>
        )}
      </div>
      <ChevronRight
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          danger
            ? "text-[var(--data-error-500)]/40"
            : "text-muted group-hover:text-[var(--text-primary)]",
        )}
        strokeWidth={2.5}
      />
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full text-left">
        {inner}
      </button>
    );
  }
  return <div>{inner}</div>;
}

// ── Section Card ─────────────────────────────────────────────────

function SectionCard({
  id,
  title,
  description,
  Icon,
  iconColor,
  danger,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  Icon: typeof Bell;
  iconColor?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="rounded-3xl overflow-hidden"
      style={{
        background: "var(--color-card)",
        border: danger
          ? "1px solid color-mix(in oklch, var(--data-error-500) 25%, transparent)"
          : "1px solid var(--color-card-border)",
      }}
    >
      <div
        className="px-6 py-5 border-b"
        style={{
          borderColor: danger
            ? "color-mix(in oklch, var(--data-error-500) 18%, transparent)"
            : "var(--color-card-border)",
          background: danger
            ? "linear-gradient(135deg, color-mix(in oklch, var(--data-error-500) 8%, var(--color-card)) 0%, var(--color-card) 100%)"
            : `linear-gradient(135deg, color-mix(in oklch, ${iconColor ?? "var(--color-primary, #00B4A6)"} 12%, var(--color-card)) 0%, var(--color-card) 100%)`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: danger
                ? "linear-gradient(135deg, var(--data-error-500) 0%, var(--data-error-600) 100%)"
                : `linear-gradient(135deg, ${iconColor ?? "var(--color-primary, #00B4A6)"} 0%, var(--color-primary-dark, #009690) 100%)`,
              boxShadow: danger
                ? "0 4px 10px -2px color-mix(in oklch, var(--data-error-500) 35%, transparent)"
                : `0 4px 10px -2px color-mix(in oklch, ${iconColor ?? "var(--color-primary, #00B4A6)"} 35%, transparent)`,
            }}
          >
            <Icon className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h2
              className="text-lg font-extrabold leading-tight"
              style={{
                color: danger ? "var(--data-error-600)" : "var(--text-primary)",
              }}
            >
              {title}
            </h2>
            {description && (
              <p className="text-sm text-muted mt-0.5">{description}</p>
            )}
          </div>
        </div>
      </div>
      <div className="px-6 py-2">{children}</div>
    </section>
  );
}

// ── Main ───────────────────────────────────────────────────────────

type ThemeOption = "system" | "light" | "dark";
type LangOption = "es" | "en";

const SECTIONS = [
  { key: "notif", label: "Notificaciones", Icon: Bell, anchor: "#notif" },
  { key: "apariencia", label: "Apariencia", Icon: Palette, anchor: "#apariencia" },
  { key: "privacidad", label: "Privacidad", Icon: Lock, anchor: "#privacidad" },
] as const;

export default function PreferenciasPage() {
  const [notifWhatsApp, setNotifWhatsApp] = useState(true);
  const [notifEmail, setNotifEmail] = useState(false);
  const [notifPromos, setNotifPromos] = useState(true);
  const [notifPedidos, setNotifPedidos] = useState(true);
  const [theme, setTheme] = useState<ThemeOption>("system");
  const [lang, setLang] = useState<LangOption>("es");
  const [saved, setSaved] = useState(false);

  const activeChannelsCount =
    Number(notifWhatsApp) + Number(notifEmail);
  const activeNotifsCount =
    Number(notifPedidos) + Number(notifPromos);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div
      className="min-h-screen dark:bg-background"
      style={{
        background:
          "color-mix(in oklch, var(--color-primary, #00B4A6) 4%, var(--surface-canvas, #f9fafb))",
      }}
    >
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi cuenta", url: "https://www.buleje.pe/cuenta" },
          {
            name: "Preferencias",
            url: "https://www.buleje.pe/cuenta/preferencias",
          },
        ]}
      />
      <AnnouncementBar />
      <Header />

      {/* ── Hero compacto ─────────────────────────────────────── */}
      <div
        className="relative overflow-hidden pt-28 sm:pt-32 pb-8"
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary-dark, #009690) 0%, var(--color-primary, #00B4A6) 100%)",
        }}
      >
        <div
          className="absolute -top-20 -right-20 h-80 w-80 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.06)" }}
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-24 -left-12 h-56 w-56 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.04)" }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-15"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
          aria-hidden="true"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end gap-4 flex-wrap">
            <Link
              href="/mi-panel"
              className="h-12 w-12 inline-flex items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm hover:bg-white/25 transition-colors text-white shrink-0 border border-white/20"
              aria-label="Volver a mi cuenta"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
            </Link>
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.18em] text-white/85 mb-1">
                <Settings className="h-3.5 w-3.5" strokeWidth={2.5} />
                Tu cuenta
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight tracking-tight">
                Preferencias
              </h1>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl backdrop-blur-sm"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.22)",
                }}
              >
                <Bell className="h-4 w-4 text-white" strokeWidth={2.5} />
                <div>
                  <p className="text-base font-extrabold text-white tabular-nums leading-none">
                    {activeChannelsCount}/2
                  </p>
                  <p className="text-xs text-white/75 font-bold">Canales</p>
                </div>
              </div>
              <div
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl backdrop-blur-sm"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.22)",
                }}
              >
                <Palette className="h-4 w-4 text-white" strokeWidth={2.5} />
                <div>
                  <p className="text-base font-extrabold text-white capitalize leading-none">
                    {theme === "system"
                      ? "Auto"
                      : theme === "light"
                        ? "Claro"
                        : "Oscuro"}
                  </p>
                  <p className="text-xs text-white/75 font-bold">Tema</p>
                </div>
              </div>
              <div
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl backdrop-blur-sm"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.22)",
                }}
              >
                <Globe className="h-4 w-4 text-white" strokeWidth={2.5} />
                <div>
                  <p className="text-base font-extrabold text-white leading-none">
                    {lang === "es" ? "ES" : "EN"}
                  </p>
                  <p className="text-xs text-white/75 font-bold">Idioma</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────── */}
      <main
        id="main-content"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 pb-28"
      >
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* ─── SIDEBAR ─────────────────────────────────── */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pr-1">
            {/* Navegador rápido */}
            <div
              className="rounded-2xl p-2"
              style={{
                background: "var(--color-card)",
                border: "1px solid var(--color-card-border)",
              }}
            >
              <p className="text-xs font-bold uppercase tracking-wider text-muted px-3 pt-2 pb-3 flex items-center gap-2">
                <Settings className="h-3.5 w-3.5" strokeWidth={2.25} />
                Secciones
              </p>
              <div className="flex flex-col gap-1">
                {SECTIONS.map(({ key, label, Icon, anchor }) => (
                  <a
                    key={key}
                    href={anchor}
                    className="flex items-center justify-between gap-2 px-3 py-3 rounded-xl text-sm font-bold text-muted hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-all"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" strokeWidth={2.25} />
                      {label}
                    </span>
                    <ChevronRight
                      className="h-4 w-4 opacity-50"
                      strokeWidth={2.5}
                    />
                  </a>
                ))}
              </div>
            </div>

            {/* Resumen actual */}
            <div
              className="rounded-2xl p-4 relative overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, color-mix(in oklch, var(--color-primary, #00B4A6) 12%, var(--color-card)) 0%, var(--color-card) 100%)",
                border:
                  "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 28%, transparent)",
              }}
            >
              <div
                className="absolute -top-6 -right-6 w-20 h-20 rounded-full pointer-events-none"
                style={{
                  background:
                    "color-mix(in oklch, var(--color-primary, #00B4A6) 18%, transparent)",
                }}
              />
              <div className="relative">
                <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">
                  Resumen
                </p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center justify-between">
                    <span className="text-muted">Canales activos</span>
                    <span className="font-extrabold text-[var(--text-primary)] tabular-nums">
                      {activeChannelsCount}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-muted">Tipos activados</span>
                    <span className="font-extrabold text-[var(--text-primary)] tabular-nums">
                      {activeNotifsCount}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-muted">Modo</span>
                    <span className="font-extrabold text-[var(--text-primary)] capitalize">
                      {theme === "system" ? "Auto" : theme}
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* CTA Save */}
            <button
              type="button"
              onClick={handleSave}
              className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl text-sm font-extrabold transition-all hover:-translate-y-0.5 active:scale-[0.99]"
              style={{
                background: saved
                  ? "linear-gradient(135deg, var(--data-success-500) 0%, var(--accent-dark) 100%)"
                  : "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                color: "white",
                boxShadow: saved
                  ? "0 6px 14px -4px color-mix(in oklch, var(--data-success-500) 40%, transparent)"
                  : "0 6px 14px -4px color-mix(in oklch, var(--color-primary, #00B4A6) 40%, transparent)",
              }}
            >
              {saved ? (
                <>
                  <CheckCheck className="h-4 w-4" strokeWidth={2.5} />
                  Guardado
                </>
              ) : (
                "Guardar preferencias"
              )}
            </button>
          </aside>

          {/* ─── MAIN ─────────────────────────────────────── */}
          <div className="space-y-6 min-w-0">
            {/* Notificaciones */}
            <SectionCard
              id="notif"
              title="Notificaciones"
              description="Cómo querés que te avisemos"
              Icon={Bell}
            >
              <ToggleRow
                label="WhatsApp"
                sublabel="Actualizaciones de pedido al celular"
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
                iconColor="var(--data-success-500)"
              />
              <ToggleRow
                label="Promociones y ofertas"
                sublabel="Cupones, descuentos y novedades"
                checked={notifPromos}
                onChange={setNotifPromos}
                Icon={Bell}
                iconColor="var(--data-warning-500)"
              />
            </SectionCard>

            {/* Apariencia */}
            <SectionCard
              id="apariencia"
              title="Apariencia"
              description="Tema visual e idioma"
              Icon={Palette}
            >
              <SelectPills<ThemeOption>
                label="Modo de pantalla"
                sublabel="Elegí cómo se ve la app"
                value={theme}
                onChange={setTheme}
                Icon={Moon}
                options={[
                  { value: "system", label: "Auto", Icon: Settings },
                  { value: "light", label: "Claro", Icon: Sun },
                  { value: "dark", label: "Oscuro", Icon: Moon },
                ]}
              />
              <SelectPills<LangOption>
                label="Idioma"
                sublabel="Idioma de la aplicación"
                value={lang}
                onChange={setLang}
                Icon={Globe}
                options={[
                  { value: "es", label: "Español" },
                  { value: "en", label: "English" },
                ]}
              />
            </SectionCard>

            {/* Privacidad */}
            <SectionCard
              id="privacidad"
              title="Privacidad y datos"
              description="Acceso, términos y control de cuenta"
              Icon={Shield}
            >
              <LinkRow
                label="Política de privacidad"
                sublabel="Cómo usamos y protegemos tus datos"
                href="/privacidad"
                Icon={Shield}
              />
              <LinkRow
                label="Términos de servicio"
                sublabel="Condiciones de uso de Buleje"
                href="/terminos"
                Icon={Lock}
              />
            </SectionCard>

            {/* Danger zone */}
            <SectionCard
              title="Zona de peligro"
              description="Acciones que no se pueden deshacer"
              Icon={AlertTriangle}
              danger
            >
              <LinkRow
                label="Eliminar mi cuenta"
                sublabel="Tus datos serán borrados permanentemente"
                Icon={Trash2}
                danger
              />
            </SectionCard>

            {/* Volver */}
            <div>
              <Link
                href="/mi-panel"
                className="inline-flex items-center gap-1.5 text-sm font-extrabold text-muted hover:text-[var(--text-primary)] transition-colors"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
                Volver a mi cuenta
              </Link>
            </div>
          </div>
        </div>
      </main>

      <CartSidebar />
      <MobileBottomNav />
    </div>
  );
}
