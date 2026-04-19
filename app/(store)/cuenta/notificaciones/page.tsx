"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Package,
  Tag,
  Store,
  AlertCircle,
  Bell,
  Mail,
  Smartphone,
  CheckCheck,
  ChevronRight,
  HelpCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { Kicker } from "@/components/ui-system/Kicker";
import { EmptyState } from "@/components/ui-system/EmptyState";
import { CanastaVacia, CorazonLatiendo } from "@/components/ui-system/illustrations";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import {
  MOCK_NOTIFICATIONS,
  formatTimeAgo,
  type Notification,
  type NotifType,
} from "@/lib/mock-notifications";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));

// ── Types ──────────────────────────────────────────────────────────

type TabKey = "todas" | "sin-leer" | "pedidos" | "ofertas" | "tiendas" | "sistema";

const TABS: { key: TabKey; label: string; type?: NotifType }[] = [
  { key: "todas", label: "Todas" },
  { key: "sin-leer", label: "Sin leer" },
  { key: "pedidos", label: "Pedidos", type: "pedido" },
  { key: "ofertas", label: "Ofertas", type: "oferta" },
  { key: "tiendas", label: "Bodegas", type: "tienda" },
  { key: "sistema", label: "Sistema", type: "sistema" },
];

// ── Helpers ────────────────────────────────────────────────────────

function getIcon(type: NotifType) {
  const cls = "h-4 w-4";
  if (type === "pedido") return <Package className={cls} />;
  if (type === "oferta") return <Tag className={cls} />;
  if (type === "tienda") return <Store className={cls} />;
  return <AlertCircle className={cls} />;
}

function getIconBg(type: NotifType): string {
  if (type === "pedido") return "bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400";
  if (type === "oferta") return "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400";
  if (type === "tienda") return "bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400";
  return "bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-500";
}

function filterNotifications(
  notifications: Notification[],
  tab: TabKey
): Notification[] {
  if (tab === "todas") return notifications;
  if (tab === "sin-leer") return notifications.filter((n) => !n.read);
  const tabDef = TABS.find((t) => t.key === tab);
  if (tabDef?.type) return notifications.filter((n) => n.type === tabDef.type);
  return notifications;
}

// ── ToggleSwitch ───────────────────────────────────────────────────

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
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-primary)]",
        checked ? "bg-[var(--brand-primary)]" : "bg-gray-200 dark:bg-gray-700",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-4.5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

// ── NotifCard ──────────────────────────────────────────────────────

function NotifCard({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
}) {
  const isUnread = !notification.read;

  return (
    <div
      className={cn(
        "relative flex gap-3 p-4 rounded-xl border transition-colors",
        isUnread
          ? "border-l-2 border-l-[var(--brand-primary)] border-t-[var(--rule-soft)] border-r-[var(--rule-soft)] border-b-[var(--rule-soft)] bg-[var(--brand-primary)]/[0.03] dark:bg-[var(--brand-primary)]/[0.06]"
          : "border-[var(--rule-soft)] bg-[var(--surface-canvas)]"
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
          getIconBg(notification.type)
        )}
      >
        {getIcon(notification.type)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-sm leading-snug",
                isUnread
                  ? "font-bold text-[var(--text-primary)]"
                  : "font-semibold text-[var(--text-primary)]"
              )}
            >
              {notification.title}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
              {notification.body}
            </p>
          </div>

          {/* Unread dot + time */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {isUnread && (
              <span className="h-2 w-2 rounded-full bg-[var(--brand-primary)] shrink-0" aria-label="No leído" />
            )}
            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] whitespace-nowrap tabular-nums">
              {formatTimeAgo(notification.timestamp)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-2.5">
          <Link
            href={notification.actionUrl}
            className={cn(
              "inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold px-2.5 py-1 rounded-lg transition-colors",
              "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/20"
            )}
          >
            {notification.actionLabel}
            <ChevronRight className="h-3 w-3" />
          </Link>

          {isUnread && (
            <button
              onClick={() => onMarkRead(notification.id)}
              className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              <CheckCheck className="h-3 w-3" />
              Marcar leído
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── NotifSettingsSection ───────────────────────────────────────────

type ChannelKey = "whatsapp" | "email" | "push";
type TypePrefKey = "ofertas" | "bodegas";

interface SettingsState {
  channels: Record<ChannelKey, boolean>;
  typePrefs: Record<TypePrefKey, boolean>;
}

function NotifSettingsSection({
  settings,
  onChange,
  onSave,
  saved,
}: {
  settings: SettingsState;
  onChange: (next: SettingsState) => void;
  onSave: () => void;
  saved: boolean;
}) {
  function setChannel(key: ChannelKey, val: boolean) {
    onChange({ ...settings, channels: { ...settings.channels, [key]: val } });
  }

  function setTypePref(key: TypePrefKey, val: boolean) {
    onChange({ ...settings, typePrefs: { ...settings.typePrefs, [key]: val } });
  }

  const CHANNEL_ROWS: {
    key: ChannelKey;
    label: string;
    sublabel: string;
    Icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      key: "whatsapp",
      label: "WhatsApp",
      sublabel: "Notificaciones directas al celular",
      Icon: Smartphone,
    },
    {
      key: "email",
      label: "Correo electrónico",
      sublabel: "Resumen y comprobantes por email",
      Icon: Mail,
    },
    {
      key: "push",
      label: "Push del navegador",
      sublabel: "Alertas instantáneas en el navegador",
      Icon: Bell,
    },
  ];

  const TYPE_ROWS: {
    key: TypePrefKey | null;
    label: string;
    sublabel: string;
    disabled?: boolean;
  }[] = [
    {
      key: null,
      label: "Pedidos",
      sublabel: "Estado de tus pedidos — siempre activo",
      disabled: true,
    },
    {
      key: "ofertas",
      label: "Ofertas",
      sublabel: "Cupones, descuentos y precios especiales",
    },
    {
      key: "bodegas",
      label: "Novedades de bodegas",
      sublabel: "Nuevos productos y horarios de apertura",
    },
    {
      key: null,
      label: "Sistema",
      sublabel: "Actualizaciones importantes — siempre activo",
      disabled: true,
    },
  ];

  return (
    <section aria-labelledby="settings-heading">
      <div
        className="bg-[var(--surface-canvas)] border border-[var(--rule-soft)] rounded-xl overflow-hidden"
      >
        {/* Header settings */}
        <div className="px-5 pt-5 pb-4 border-b border-[var(--rule-soft)]">
          <Kicker className="mb-1">PREFERENCIAS</Kicker>
          <h2
            id="settings-heading"
            className="text-lg font-extrabold text-[var(--text-primary)] tracking-tight"
          >
            Cómo querés recibir avisos
          </h2>
        </div>

        {/* Canales */}
        <div className="px-5 py-4 border-b border-[var(--rule-soft)]">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)] mb-3">
            CANALES
          </p>
          <div className="space-y-1">
            {CHANNEL_ROWS.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0"
              >
                <div className="flex items-center gap-2.5">
                  <row.Icon className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
                  <div>
                    <p className="text-sm text-[var(--text-primary)] font-medium">{row.label}</p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{row.sublabel}</p>
                  </div>
                </div>
                <ToggleSwitch
                  checked={settings.channels[row.key]}
                  onChange={(v) => setChannel(row.key, v)}
                  label={row.label}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Por tipo */}
        <div className="px-5 py-4">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)] mb-3">
            POR TIPO
          </p>
          <div className="space-y-1">
            {TYPE_ROWS.map((row, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0"
              >
                <div>
                  <p
                    className={cn(
                      "text-sm font-medium",
                      row.disabled
                        ? "text-[var(--text-tertiary)]"
                        : "text-[var(--text-primary)]"
                    )}
                  >
                    {row.label}
                    {row.disabled && (
                      <span className="ml-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)] opacity-70">
                        requerido
                      </span>
                    )}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{row.sublabel}</p>
                </div>
                <ToggleSwitch
                  checked={row.disabled ? true : settings.typePrefs[row.key as TypePrefKey]}
                  onChange={row.key ? (v) => setTypePref(row.key as TypePrefKey, v) : () => {}}
                  disabled={row.disabled}
                  label={row.label}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Guardar */}
        <div className="px-5 py-4 border-t border-[var(--rule-soft)] bg-gray-50 dark:bg-gray-900/50">
          <button
            onClick={onSave}
            className={cn(
              "w-full py-2.5 rounded-lg text-sm font-bold transition-all",
              saved
                ? "bg-teal-600 text-white"
                : "bg-[var(--brand-primary)] text-white hover:opacity-90 active:scale-[0.99]"
            )}
          >
            {saved ? "Guardado" : "Guardar preferencias"}
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Main Page ──────────────────────────────────────────────────────

export default function NotificacionesPage() {
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [activeTab, setActiveTab] = useState<TabKey>("todas");
  const [settings, setSettings] = useState<SettingsState>({
    channels: { whatsapp: true, email: false, push: false },
    typePrefs: { ofertas: true, bodegas: true },
  });
  const [settingsSaved, setSettingsSaved] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const tabNotifications = useMemo(
    () => filterNotifications(notifications, activeTab),
    [notifications, activeTab]
  );

  // Count per tab for badges
  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = {
      todas: notifications.length,
      "sin-leer": notifications.filter((n) => !n.read).length,
      pedidos: notifications.filter((n) => n.type === "pedido").length,
      ofertas: notifications.filter((n) => n.type === "oferta").length,
      tiendas: notifications.filter((n) => n.type === "tienda").length,
      sistema: notifications.filter((n) => n.type === "sistema").length,
    };
    return counts;
  }, [notifications]);

  function handleMarkRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function handleSaveSettings() {
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
  }

  return (
    <div className="min-h-screen bg-[var(--surface-bg)] dark:bg-background">
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi cuenta", url: "https://www.buleje.pe/cuenta" },
          { name: "Notificaciones", url: "https://www.buleje.pe/cuenta/notificaciones" },
        ]}
      />
      <AnnouncementBar />
      <Header />

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div
        className="pt-32 sm:pt-36 pb-10 border-b border-gray-200 dark:border-gray-800"
        style={{ background: "#060a0d" }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          {/* Breadcrumb */}
          <nav
            aria-label="Migas de pan"
            className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-white/35 mb-6"
          >
            <Link href="/" className="hover:text-white/60 transition-colors">Inicio</Link>
            <span>/</span>
            <Link href="/cuenta" className="hover:text-white/60 transition-colors">Mi cuenta</Link>
            <span>/</span>
            <span className="text-white/55">Notificaciones</span>
          </nav>

          <Kicker className="text-white/40 mb-2">NOTIFICACIONES</Kicker>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight tracking-[-0.02em]">
            Tu centro de avisos
          </h1>
          <p className="text-sm text-white/50 mt-2 max-w-sm leading-relaxed">
            Estado de pedidos, ofertas y novedades
          </p>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-4">
            <span className="text-xs text-white/30 tabular-nums">
              {unreadCount > 0 ? (
                <>
                  <span className="text-[var(--brand-primary)] font-bold">{unreadCount} sin leer</span>
                  {" · "}
                  {notifications.length} total
                </>
              ) : (
                <>{notifications.length} notificaciones · todo leído</>
              )}
            </span>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-semibold text-white/40 hover:text-white/60 transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todo leído
              </button>
            )}
          </div>
        </div>
      </div>

      <main id="main-content" className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-28">

        {/* ── Tabs ──────────────────────────────────────────────── */}
        <section aria-label="Filtros de notificaciones">
          <div
            className="flex gap-1 overflow-x-auto no-scrollbar pb-1"
            role="tablist"
            aria-label="Categorías de notificaciones"
          >
            {TABS.map((tab) => {
              const count = tabCounts[tab.key];
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0",
                    isActive
                      ? "bg-[var(--brand-primary)] text-white"
                      : "bg-[var(--surface-canvas)] border border-[var(--rule-soft)] text-[var(--text-secondary)] hover:border-gray-300 dark:hover:border-gray-600"
                  )}
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={cn(
                        "text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full tabular-nums leading-none",
                        isActive
                          ? "bg-white/20 text-white"
                          : tab.key === "sin-leer"
                          ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                          : "bg-gray-100 dark:bg-gray-800 text-[var(--text-tertiary)]"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Lista ─────────────────────────────────────────────── */}
        <section aria-labelledby="notif-list-heading">
          <h2 id="notif-list-heading" className="sr-only">
            Lista de notificaciones
          </h2>

          {tabNotifications.length === 0 ? (
            <div className="bg-[var(--surface-canvas)] border border-[var(--rule-soft)] rounded-xl">
              <EmptyState
                illustration={
                  activeTab === "sin-leer" ? (
                    <CorazonLatiendo size={160} />
                  ) : (
                    <CanastaVacia size={140} />
                  )
                }
                title={
                  activeTab === "sin-leer"
                    ? "Todo leído"
                    : "Sin notificaciones en esta categoría"
                }
                description={
                  activeTab === "sin-leer"
                    ? "Estás al día. Bien hecho."
                    : "Las notificaciones de esta categoría aparecerán acá."
                }
                size="sm"
              />
            </div>
          ) : (
            <div className="space-y-2">
              {tabNotifications.map((notif) => (
                <NotifCard
                  key={notif.id}
                  notification={notif}
                  onMarkRead={handleMarkRead}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Preferencias de notificaciones ────────────────────── */}
        <NotifSettingsSection
          settings={settings}
          onChange={setSettings}
          onSave={handleSaveSettings}
          saved={settingsSaved}
        />

        {/* ── Footer ayuda ──────────────────────────────────────── */}
        <div
          className={cn(
            "flex items-center justify-between p-4 rounded-xl",
            "bg-[var(--surface-canvas)] border border-[var(--rule-soft)]"
          )}
        >
          <div className="flex items-center gap-2.5">
            <HelpCircle className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
            <p className="text-sm text-[var(--text-secondary)]">
              ¿Alguna duda con las notificaciones?
            </p>
          </div>
          <Link
            href="/ayuda"
            className="flex items-center gap-1 text-xs font-bold text-[var(--brand-primary)] hover:opacity-80 transition-opacity shrink-0"
          >
            Contactanos
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* ── Link volver ───────────────────────────────────────── */}
        <div>
          <Link
            href="/cuenta"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            Volver a mi cuenta
          </Link>
        </div>
      </main>

      <CartSidebar />
      <MobileBottomNav />
    </div>
  );
}
