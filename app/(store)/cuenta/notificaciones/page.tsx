"use client";

import { useState, useMemo, useEffect } from "react";
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
  ArrowLeft,
  Filter,
  Settings,
  Sparkles,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { CanastaVacia, CorazonLatiendo } from "@/components/ui-system/illustrations";
import { EmptyState } from "@/components/ui-system/EmptyState";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import {
  formatTimeAgo,
  type Notification,
  type NotifType,
} from "@/lib/mock-notifications";

// Mapeo del shape del endpoint /api/me/notifications al tipo del cliente.
type ApiNotification = { id: string; type: string; title: string; message?: string; link?: string | null; read: boolean; createdAt: string };
function mapNotifType(t: string): NotifType {
  const s = (t || "").toLowerCase();
  if (s.includes("ped") || s.includes("order")) return "pedido";
  if (s.includes("ofer") || s.includes("promo") || s.includes("deal")) return "oferta";
  if (s.includes("tienda") || s.includes("store") || s.includes("vendor")) return "tienda";
  return "sistema";
}
function mapApiNotification(n: ApiNotification): Notification {
  return {
    id: n.id,
    type: mapNotifType(n.type),
    title: n.title,
    body: n.message ?? "",
    timestamp: new Date(n.createdAt).getTime() || Date.now(),
    read: !!n.read,
    actionUrl: n.link ?? "",
    actionLabel: n.link ? "Ver" : "",
  };
}

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));

// ── Types ──────────────────────────────────────────────────────────

type TabKey =
  | "todas"
  | "sin-leer"
  | "pedidos"
  | "ofertas"
  | "tiendas"
  | "sistema";

type TabDef = {
  key: TabKey;
  label: string;
  type?: NotifType;
  Icon: typeof Bell;
};

const TABS: TabDef[] = [
  { key: "todas", label: "Todas", Icon: Bell },
  { key: "sin-leer", label: "Sin leer", Icon: Sparkles },
  { key: "pedidos", label: "Pedidos", type: "pedido", Icon: Package },
  { key: "ofertas", label: "Ofertas", type: "oferta", Icon: Tag },
  { key: "tiendas", label: "Bodegas", type: "tienda", Icon: Store },
  { key: "sistema", label: "Sistema", type: "sistema", Icon: AlertCircle },
];

// ── Helpers ────────────────────────────────────────────────────────

function getTypeColor(type: NotifType): string {
  if (type === "pedido") return "var(--accent)";
  if (type === "oferta") return "var(--data-warning-500)";
  if (type === "tienda") return "var(--text-secondary)";
  return "var(--text-tertiary)";
}

const TYPE_ICON: Record<NotifType, typeof Bell> = {
  pedido: Package,
  oferta: Tag,
  tienda: Store,
  sistema: AlertCircle,
};

function filterNotifications(
  notifications: Notification[],
  tab: TabKey,
): Notification[] {
  if (tab === "todas") return notifications;
  if (tab === "sin-leer") return notifications.filter((n) => !n.read);
  const tabDef = TABS.find((t) => t.key === tab);
  if (tabDef?.type) return notifications.filter((n) => n.type === tabDef.type);
  return notifications;
}

/**
 * Convierte notificaciones en matriz 4×7 (28 días) de actividad por día.
 */
function computeActivityHeat(items: Notification[]): number[][] {
  const matrix: number[][] = Array.from({ length: 4 }, () => Array(7).fill(0));
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const startMs = now.getTime() - 27 * 24 * 60 * 60 * 1000;
  for (const n of items) {
    const d = new Date(n.timestamp);
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.floor(
      (d.getTime() - startMs) / (24 * 60 * 60 * 1000),
    );
    if (diffDays < 0 || diffDays > 27) continue;
    const week = Math.floor(diffDays / 7);
    const day = diffDays % 7;
    matrix[week][day] = (matrix[week][day] ?? 0) + 1;
  }
  return matrix;
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
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
        disabled && "opacity-50 cursor-not-allowed",
      )}
      style={{
        background: checked
          ? "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)"
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

// ── Filter Pills (sidebar tabs) ───────────────────────────────────

function FilterPills({
  current,
  counts,
  onSelect,
}: {
  current: TabKey;
  counts: Record<TabKey, number>;
  onSelect: (k: TabKey) => void;
}) {
  return (
    <div
      className="rounded-2xl p-2"
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-card-border)",
      }}
    >
      <p className="text-xs font-bold uppercase tracking-wider text-muted px-3 pt-2 pb-3 flex items-center gap-2">
        <Filter className="h-3.5 w-3.5" strokeWidth={2.25} />
        Filtrar
      </p>
      <div className="flex flex-col gap-1">
        {TABS.map(({ key, label, Icon }) => {
          const count = counts[key];
          const active = current === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={cn(
                "flex items-center justify-between gap-2 px-3 py-3 rounded-xl text-sm font-bold transition-all w-full",
                !active &&
                  "text-muted hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-surface",
              )}
              style={
                active
                  ? {
                      background:
                        "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                      color: "white",
                      boxShadow:
                        "0 4px 10px -2px color-mix(in oklch, var(--color-primary, #00A0A0) 35%, transparent)",
                    }
                  : undefined
              }
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" strokeWidth={2.25} />
                {label}
              </span>
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full text-xs font-extrabold",
                  active
                    ? "bg-white/25 text-white"
                    : key === "sin-leer" && count > 0
                      ? "bg-primary/15 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "bg-[var(--surface-sunken)] dark:bg-surface text-muted",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Heat Map ──────────────────────────────────────────────────────

function HeatMap({ items }: { items: Notification[] }) {
  const matrix = useMemo(() => computeActivityHeat(items), [items]);
  const max = Math.max(1, ...matrix.flat());

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-card-border)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          Actividad
        </p>
        <span className="text-xs text-muted">28 días</span>
      </div>
      <div className="flex flex-col gap-1">
        {matrix.map((week, wIdx) => (
          <div key={wIdx} className="flex gap-1">
            {week.map((count, dIdx) => {
              const intensity = count / max;
              return (
                <div
                  key={dIdx}
                  className="flex-1 aspect-square rounded-md"
                  style={{
                    background:
                      count === 0
                        ? "var(--color-card-border)"
                        : `color-mix(in oklch, var(--color-primary, #00A0A0) ${Math.round(intensity * 80) + 20}%, transparent)`,
                  }}
                  title={`${count} ${count === 1 ? "aviso" : "avisos"}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 text-xs text-muted">
        <span>Menos</span>
        <div className="flex gap-1">
          {[0.2, 0.4, 0.6, 0.8, 1].map((i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-sm"
              style={{
                background: `color-mix(in oklch, var(--color-primary, #00A0A0) ${Math.round(i * 80) + 20}%, transparent)`,
              }}
            />
          ))}
        </div>
        <span>Más</span>
      </div>
    </div>
  );
}

// ── NotifCard ─────────────────────────────────────────────────────

function NotifCard({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
}) {
  const isUnread = !notification.read;
  const typeColor = getTypeColor(notification.type);
  const TypeIcon = TYPE_ICON[notification.type] ?? AlertCircle;

  return (
    <div
      className="rounded-3xl p-5 transition-all hover:-translate-y-0.5 relative overflow-hidden"
      style={{
        background: isUnread
          ? `linear-gradient(135deg, color-mix(in oklch, ${typeColor} 8%, var(--color-card)) 0%, var(--color-card) 100%)`
          : "var(--color-card)",
        border: isUnread
          ? `2px solid color-mix(in oklch, ${typeColor} 30%, transparent)`
          : "1px solid var(--color-card-border)",
        boxShadow: isUnread
          ? `0 4px 12px -4px color-mix(in oklch, ${typeColor} 22%, transparent)`
          : undefined,
      }}
    >
      {isUnread && (
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ background: typeColor }}
        />
      )}
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{
            background: `color-mix(in oklch, ${typeColor} 14%, transparent)`,
          }}
        >
          <TypeIcon
            className="h-5 w-5"
            style={{ color: typeColor }}
            strokeWidth={2.25}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {isUnread && (
                  <span
                    className="h-2 w-2 rounded-full shrink-0 animate-pulse"
                    style={{ background: typeColor }}
                    aria-label="No leído"
                  />
                )}
                <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                  {notification.title}
                </p>
              </div>
              <p className="text-sm text-muted leading-relaxed">
                {notification.body}
              </p>
            </div>
            <span className="text-xs text-muted whitespace-nowrap tabular-nums shrink-0 mt-1">
              {formatTimeAgo(notification.timestamp)}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Link
              href={notification.actionUrl}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-extrabold transition-all hover:-translate-y-0.5"
              style={{
                background: isUnread
                  ? "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)"
                  : "var(--color-card-border)",
                color: isUnread ? "white" : "var(--color-muted)",
                boxShadow: isUnread
                  ? "0 4px 10px -2px color-mix(in oklch, var(--color-primary, #00A0A0) 35%, transparent)"
                  : undefined,
              }}
            >
              {notification.actionLabel}
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>

            {isUnread && (
              <button
                type="button"
                onClick={() => onMarkRead(notification.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-muted hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors"
              >
                <CheckCheck className="h-4 w-4" strokeWidth={2.25} />
                Marcar leído
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── NotifSettings ─────────────────────────────────────────────────

type ChannelKey = "whatsapp" | "email" | "push";
type TypePrefKey = "ofertas" | "bodegas";

interface SettingsState {
  channels: Record<ChannelKey, boolean>;
  typePrefs: Record<TypePrefKey, boolean>;
}

function NotifSettings({
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
    onChange({
      ...settings,
      channels: { ...settings.channels, [key]: val },
    });
  }

  function setTypePref(key: TypePrefKey, val: boolean) {
    onChange({
      ...settings,
      typePrefs: { ...settings.typePrefs, [key]: val },
    });
  }

  const CHANNEL_ROWS: {
    key: ChannelKey;
    label: string;
    sublabel: string;
    Icon: typeof Bell;
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
    <section
      className="rounded-3xl overflow-hidden"
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-card-border)",
      }}
      aria-labelledby="settings-heading"
    >
      <div
        className="px-6 py-5 border-b"
        style={{
          borderColor: "var(--color-card-border)",
          background:
            "linear-gradient(135deg, color-mix(in oklch, var(--color-primary, #00A0A0) 12%, var(--color-card)) 0%, var(--color-card) 100%)",
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Settings className="h-4 w-4 text-primary" strokeWidth={2.25} />
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Preferencias
          </span>
        </div>
        <h2
          id="settings-heading"
          className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight"
        >
          Cómo querés recibir avisos
        </h2>
      </div>

      {/* Canales */}
      <div
        className="px-6 py-5 border-b"
        style={{ borderColor: "var(--color-card-border)" }}
      >
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted mb-3">
          CANALES
        </p>
        <div className="space-y-2">
          {CHANNEL_ROWS.map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between py-3 border-b last:border-0"
              style={{ borderColor: "var(--color-card-border)" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background:
                      "color-mix(in oklch, var(--color-primary, #00A0A0) 10%, transparent)",
                  }}
                >
                  <row.Icon
                    className="h-5 w-5 text-primary"
                    strokeWidth={2.25}
                  />
                </div>
                <div>
                  <p className="text-sm font-extrabold text-[var(--text-primary)]">
                    {row.label}
                  </p>
                  <p className="text-xs text-muted">{row.sublabel}</p>
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
      <div className="px-6 py-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted mb-3">
          POR TIPO
        </p>
        <div className="space-y-2">
          {TYPE_ROWS.map((row, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-3 border-b last:border-0"
              style={{ borderColor: "var(--color-card-border)" }}
            >
              <div className="min-w-0 flex-1 pr-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <p
                    className={cn(
                      "text-sm font-extrabold",
                      row.disabled
                        ? "text-muted"
                        : "text-[var(--text-primary)]",
                    )}
                  >
                    {row.label}
                  </p>
                  {row.disabled && (
                    <span
                      className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{
                        background: "var(--color-card-border)",
                        color: "var(--color-muted)",
                      }}
                    >
                      Requerido
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5">{row.sublabel}</p>
              </div>
              <ToggleSwitch
                checked={
                  row.disabled
                    ? true
                    : settings.typePrefs[row.key as TypePrefKey]
                }
                onChange={
                  row.key
                    ? (v) => setTypePref(row.key as TypePrefKey, v)
                    : () => {
                        /* noop */
                      }
                }
                disabled={row.disabled}
                label={row.label}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Guardar */}
      <div
        className="px-6 py-4 border-t"
        style={{
          borderColor: "var(--color-card-border)",
          background:
            "color-mix(in oklch, var(--color-primary, #00A0A0) 4%, transparent)",
        }}
      >
        <button
          type="button"
          onClick={onSave}
          className={cn(
            "w-full h-12 rounded-xl text-sm font-extrabold transition-all",
            "text-white hover:-translate-y-0.5 active:scale-[0.99]",
          )}
          style={{
            background: saved
              ? "linear-gradient(135deg, var(--data-success-500) 0%, var(--accent-dark) 100%)"
              : "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
            boxShadow: saved
              ? "0 6px 14px -4px color-mix(in oklch, var(--data-success-500) 40%, transparent)"
              : "0 6px 14px -4px color-mix(in oklch, var(--color-primary, #00A0A0) 40%, transparent)",
          }}
        >
          {saved ? (
            <span className="inline-flex items-center gap-2">
              <CheckCheck className="h-4 w-4" strokeWidth={2.5} />
              Guardado
            </span>
          ) : (
            "Guardar preferencias"
          )}
        </button>
      </div>
    </section>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function NotificacionesPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(true);

  // Datos reales del inbox (audit 2026-06-26: antes corría 100% con MOCK_NOTIFICATIONS).
  // /api/me/notifications usa requireCustomer; sin sesión de cliente devuelve vacío
  // (estado honesto, no datos fake).
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/me/notifications", { credentials: "include", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const raw = Array.isArray(data?.notifications) ? (data.notifications as ApiNotification[]) : [];
        setNotifications(raw.map(mapApiNotification));
      })
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") {
          console.warn("[cuenta/notificaciones] no se pudo cargar el inbox", err);
        }
      })
      .finally(() => setLoadingNotifs(false));
    return () => ctrl.abort();
  }, []);

  const [activeTab, setActiveTab] = useState<TabKey>("todas");
  const [settings, setSettings] = useState<SettingsState>({
    channels: { whatsapp: true, email: false, push: false },
    typePrefs: { ofertas: true, bodegas: true },
  });
  const [settingsSaved, setSettingsSaved] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const tabNotifications = useMemo(
    () => filterNotifications(notifications, activeTab),
    [notifications, activeTab],
  );

  const tabCounts = useMemo<Record<TabKey, number>>(
    () => ({
      todas: notifications.length,
      "sin-leer": notifications.filter((n) => !n.read).length,
      pedidos: notifications.filter((n) => n.type === "pedido").length,
      ofertas: notifications.filter((n) => n.type === "oferta").length,
      tiendas: notifications.filter((n) => n.type === "tienda").length,
      sistema: notifications.filter((n) => n.type === "sistema").length,
    }),
    [notifications],
  );

  function handleMarkRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function handleSaveSettings() {
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
  }

  // Última notificación para chip "más reciente"
  const mostRecent = notifications[0];

  return (
    <div
      className="min-h-screen dark:bg-background"
      style={{
        background:
          "color-mix(in oklch, var(--color-primary, #00A0A0) 4%, var(--surface-canvas, #f9fafb))",
      }}
    >
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi cuenta", url: "https://www.buleje.pe/cuenta" },
          {
            name: "Notificaciones",
            url: "https://www.buleje.pe/cuenta/notificaciones",
          },
        ]}
      />

      {/* ── Hero compacto ─────────────────────────────────────── */}
      <div
        className="relative overflow-hidden pt-28 sm:pt-32 pb-8"
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary-dark, #009690) 0%, var(--color-primary, #00A0A0) 100%)",
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
              href="/cuenta"
              className="h-12 w-12 inline-flex items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm hover:bg-white/25 transition-colors text-white shrink-0 border border-white/20"
              aria-label="Volver a mi cuenta"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
            </Link>
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.18em] text-white/85 mb-1">
                <Bell className="h-3.5 w-3.5" strokeWidth={2.5} />
                Centro de avisos
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight tracking-tight">
                Tus notificaciones
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
                    {notifications.length}
                  </p>
                  <p className="text-xs text-white/75 font-bold">Total</p>
                </div>
              </div>
              {unreadCount > 0 && (
                <div
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl backdrop-blur-sm"
                  style={{
                    background: "rgba(255,255,255,0.18)",
                    border: "1px solid rgba(255,255,255,0.32)",
                  }}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                  </span>
                  <div>
                    <p className="text-base font-extrabold text-white tabular-nums leading-none">
                      {unreadCount}
                    </p>
                    <p className="text-xs text-white/85 font-bold">Sin leer</p>
                  </div>
                </div>
              )}
              {mostRecent && (
                <div
                  className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-2xl backdrop-blur-sm max-w-xs"
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.22)",
                  }}
                >
                  <Sparkles
                    className="h-4 w-4 text-white shrink-0"
                    strokeWidth={2.5}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-white leading-tight truncate max-w-[160px]">
                      {mostRecent.title}
                    </p>
                    <p className="text-xs text-white/75 font-bold">
                      Más reciente
                    </p>
                  </div>
                </div>
              )}
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
            <FilterPills
              current={activeTab}
              counts={tabCounts}
              onSelect={setActiveTab}
            />

            {/* Mark all */}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-extrabold transition-all hover:-translate-y-0.5"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                  color: "white",
                  boxShadow:
                    "0 6px 14px -4px color-mix(in oklch, var(--color-primary, #00A0A0) 40%, transparent)",
                }}
              >
                <CheckCheck className="h-4 w-4" strokeWidth={2.5} />
                Marcar todo leído
              </button>
            )}

            {/* Mapa de calor — secundario, solo desktop (audit 2026-06-26: en móvil
                apilaba sobre las notificaciones y obligaba a un scroll largo). */}
            {notifications.length > 0 && (
              <div className="hidden lg:block">
                <HeatMap items={notifications} />
              </div>
            )}

            {/* Help — secundario, solo desktop */}
            <div
              className="hidden lg:block rounded-2xl p-4"
              style={{
                background: "var(--color-card)",
                border: "1px solid var(--color-card-border)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <HelpCircle
                  className="h-4 w-4 text-primary"
                  strokeWidth={2.25}
                />
                <p className="text-xs font-bold uppercase tracking-wider text-muted">
                  ¿Necesitás ayuda?
                </p>
              </div>
              <p className="text-sm text-muted leading-relaxed mb-3">
                Si tenés dudas con tus avisos, escribinos.
              </p>
              <Link
                href="/ayuda"
                className="inline-flex items-center gap-1.5 text-sm font-extrabold text-primary hover:underline"
              >
                Contactanos
                <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
            </div>
          </aside>

          {/* ─── MAIN ─────────────────────────────────────── */}
          <div className="space-y-8 min-w-0">
            {/* Lista */}
            <section aria-labelledby="notif-list-heading">
              <div className="flex items-center justify-between mb-4">
                <h2
                  id="notif-list-heading"
                  className="text-lg font-extrabold text-[var(--text-primary)] flex items-center gap-2"
                >
                  <Bell className="h-5 w-5 text-primary" strokeWidth={2.5} />
                  {TABS.find((t) => t.key === activeTab)?.label ?? "Notificaciones"}
                </h2>
                <span className="text-sm text-muted font-bold">
                  {tabNotifications.length}{" "}
                  {tabNotifications.length === 1 ? "aviso" : "avisos"}
                </span>
              </div>

              {loadingNotifs ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-20 rounded-2xl animate-pulse"
                      style={{ background: "var(--color-card)", border: "1px solid var(--color-card-border)" }}
                    />
                  ))}
                </div>
              ) : tabNotifications.length === 0 ? (
                <div
                  className="rounded-3xl"
                  style={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-card-border)",
                  }}
                >
                  <EmptyState
                    illustration={
                      activeTab === "sin-leer" ? (
                        <CorazonLatiendo size={150} />
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
                    size="md"
                  />
                </div>
              ) : (
                <div className="space-y-3">
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

            {/* Settings */}
            <NotifSettings
              settings={settings}
              onChange={setSettings}
              onSave={handleSaveSettings}
              saved={settingsSaved}
            />

            {/* Volver */}
            <div>
              <Link
                href="/cuenta"
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
    </div>
  );
}
