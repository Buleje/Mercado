"use client";

import { PageTitle } from "@buleje/design-system";
import {
  FlaskConical,
  Rocket,
  Wrench,
  Sparkles,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Package,
  ExternalLink,
} from "@buleje/design-system/icons";

type ChangeType = "feat" | "fix" | "perf" | "security" | "refactor";

type ChangeEntry = {
  type: ChangeType;
  text: string;
};

type Release = {
  version: string;
  date: string;
  status: "current" | "previous" | "planned";
  summary: string;
  changes: ChangeEntry[];
};

const TYPE_META: Record<ChangeType, { label: string; color: string; bg: string }> = {
  feat:     { label: "Feature",    color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",  bg: "bg-[var(--surface-sunken)]" },
  fix:      { label: "Fix",        color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",        bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30" },
  perf:     { label: "Perf",       color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",    bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
  security: { label: "Seguridad",  color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  refactor: { label: "Refactor",   color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",  bg: "bg-[var(--surface-sunken)]" },
};

const RELEASES: Release[] = [
  {
    version: "v1.0.0-beta",
    date: "18 de marzo, 2026",
    status: "current",
    summary: "Lanzamiento beta inicial de la plataforma completa.",
    changes: [
      { type: "feat", text: "Tienda con 500+ productos, categorías y búsqueda fuzzy con tolerancia a errores (Levenshtein)" },
      { type: "feat", text: "Carrito lateral con animaciones, upsell automático y persistencia localStorage" },
      { type: "feat", text: "Panel admin con 30+ módulos: POS, CRM, inventario, finanzas, logística, analytics BI" },
      { type: "feat", text: "Sistema de fidelización: puntos, tiers (Bronce / Plata / Oro / Diamante) y canje" },
      { type: "feat", text: "Pedidos por WhatsApp con integración de estado y notificaciones en tiempo real" },
      { type: "feat", text: "PWA + Service Worker: instalable en móviles, soporte offline parcial" },
      { type: "feat", text: "Checkout modal con Stripe y opción de pago con Yape / efectivo / contra entrega" },
      { type: "feat", text: "Programa de cupones y descuentos con validación por mínimo de compra" },
      { type: "feat", text: "Modo mantenimiento, anuncio bar y dark mode con persistencia" },
      { type: "feat", text: "Panel visitantes y survey de bienvenida beta" },
      { type: "perf", text: "react-window FixedSizeList para virtualización de lista larga de productos" },
      { type: "perf", text: "requestIdleCallback para diferir 21 modales pesados al idle del browser" },
      { type: "perf", text: "ProductCatalog: initialProducts como Server Prop (productos fuera del bundle cliente)" },
      { type: "perf", text: "Imágenes optimizadas con next/image + placeholder blur + sizes correctos por breakpoint" },
      { type: "security", text: "Rate limiting en endpoints sensibles (checkout, auth, newsletter)" },
      { type: "security", text: "Validación de inputs con Zod en todas las rutas API" },
      { type: "security", text: "Roles y permisos granulares por módulo en el panel admin" },
      { type: "refactor", text: "StoreProviders.tsx: 9 context providers consolidados en 1 componente" },
      { type: "refactor", text: "QuickViewModal extraído a dynamic import (~350 líneas fuera del bundle inicial)" },
    ],
  },
  {
    version: "v1.1.0",
    date: "Abril 2026 (planificado)",
    status: "planned",
    summary: "Mejoras de checkout, notificaciones push y accesibilidad.",
    changes: [
      { type: "feat", text: "Notificaciones push via Web Push API para estado de pedidos" },
      { type: "feat", text: "Checkout con Stripe Elements embebido (sin redirección)" },
      { type: "feat", text: "Accesibilidad WCAG 2.1 AA: contraste, focus visible, live regions" },
      { type: "perf", text: "Redis cache para /api/products y /api/settings (reduce DB queries en 80%)" },
      { type: "feat", text: "Página /sobre-nosotros con historia del negocio y fotos del equipo" },
    ],
  },
  {
    version: "v2.0.0",
    date: "2026 Q3 (futuro)",
    status: "planned",
    summary: "Arquitectura multi-tienda, app nativa y IA.",
    changes: [
      { type: "feat", text: "Multi-sede: gestionar múltiples bodegas desde un solo panel" },
      { type: "feat", text: "App móvil nativa con Capacitor (iOS + Android)" },
      { type: "feat", text: "Motor de recomendaciones con IA (collaborative filtering)" },
      { type: "feat", text: "Facturación electrónica SUNAT integrada" },
    ],
  },
];

function TypeBadge({ type }: { type: ChangeType }) {
  const meta = TYPE_META[type];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[length:var(--ts-2xs)] font-bold leading-none shrink-0 ${meta.bg} ${meta.color}`}>
      {meta.label}
    </span>
  );
}

export default function ChangelogModule() {
  const stats = [
    { icon: Package, label: "Versión actual", value: "v1.0.0-beta", color: "text-[var(--text-secondary)]" },
    { icon: Sparkles, label: "Features lanzadas", value: "30+", color: "text-[var(--text-secondary)]" },
    { icon: Zap, label: "Optimizaciones perf.", value: "4", color: "text-[var(--data-warning-500)]" },
    { icon: ShieldCheck, label: "Mejoras de seguridad", value: "3", color: "text-[var(--data-success-500)]" },
  ];

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <PageTitle className="text-xl font-extrabold text-foreground flex flex-wrap items-center gap-2">
            <FlaskConical className="h-5 w-5 text-[var(--data-warning-500)]" />
            Changelog del Proyecto
          </PageTitle>
          <p className="text-sm text-muted mt-0.5">Historial de releases y cambios de versión.</p>
        </div>
        <a
          href="/about"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 sm:px-4 py-1.5 sm:py-2 text-sm font-semibold bg-primary/8 text-primary hover:bg-primary/15 transition-colors border border-primary/20"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Ver página /about
        </a>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border p-4 flex flex-wrap items-center gap-3"
          >
            <s.icon className={`h-5 w-5 shrink-0 ${s.color}`} />
            <div>
              <p className="text-[length:var(--ts-xs)] text-muted leading-none mb-0.5">{s.label}</p>
              <p className="text-lg font-extrabold text-foreground leading-tight">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Release Timeline */}
      <div className="space-y-5">
        {RELEASES.map((release) => (
          <div
            key={release.version}
            className={`rounded-xl border ${
              release.status === "current"
                ? "border-[var(--data-info-500)] dark:border-[var(--data-info-500)] bg-[var(--data-info-50)]/60 dark:bg-indigo-950/20"
                : "border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card"
            } overflow-hidden`}
          >
            {/* Release header */}
            <div className={`flex items-center justify-between px-5 py-4 ${
              release.status === "current"
                ? "border-b border-[var(--rule-base)]"
                : "border-b border-[var(--rule-soft)] dark:border-card-border"
            }`}>
              <div className="flex flex-wrap items-center gap-3">
                {release.status === "current" ? (
                  <Rocket className="h-5 w-5 text-[var(--text-secondary)]" />
                ) : (
                  <Wrench className="h-5 w-5 text-[var(--text-tertiary)]" />
                )}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-base font-extrabold ${
                      release.status === "current" ? "text-[var(--text-secondary)] dark:text-[var(--text-primary)]" : "text-foreground"
                    }`}>
                      {release.version}
                    </span>
                    {release.status === "current" && (
                      <span className="flex items-center gap-1 rounded-full px-2 py-0.5 bg-[var(--data-info-500)] text-white text-[length:var(--ts-2xs)] font-bold">
                        <span className="h-1 w-1 rounded-full bg-white dark:bg-[var(--color-card)] animate-pulse" />
                        Actual
                      </span>
                    )}
                    {release.status === "planned" && (
                      <span className="rounded-full px-2 py-0.5 bg-[var(--rule-soft)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted text-[length:var(--ts-2xs)] font-bold">
                        Planificado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-0.5">{release.summary}</p>
                </div>
              </div>
              <span className="text-xs text-muted font-medium shrink-0">{release.date}</span>
            </div>

            {/* Changes list */}
            <div className="px-5 py-4">
              <ul className="space-y-2.5">
                {release.changes.map((change, i) => (
                  <li key={i} className="flex flex-wrap items-start gap-2.5">
                    <CheckCircle2 className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                      release.status === "current" ? "text-[var(--text-tertiary)]" : "text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]"
                    }`} />
                    <TypeBadge type={change.type} />
                    <span className="text-sm text-foreground/80 leading-relaxed">{change.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
