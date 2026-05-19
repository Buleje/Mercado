"use client";

/**
 * app/superadmin/control-center/ControlCenterClient.tsx
 *
 * Cliente del Centro de Control. Recibe el estado de env vars y la salud de
 * cada plataforma desde el server component padre — nunca lee process.env
 * directamente ni muestra valores de secretos.
 *
 * Estructura:
 *   A) Launchpad de 10 plataformas (grid 3-col desktop).
 *   B) Credenciales del sistema (tabla: existencia + acción).
 *   C) Info del sistema (versión + Next + Node + deploy).
 */

import {
  AdminPage,
  AdminSection,
  BodyText,
  Kicker,
  cn,
} from "@buleje/design-system";
import { AdminTabShell } from "../_components/_shared";
import { Gauge } from "@buleje/design-system/icons";
import {
  Brain,
  Building2,
  HeartHandshake,
  LayoutDashboard,
  Lock,
  Palette,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  User,
  Activity,
  KeyRound,
  Server,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { PlatformCard } from "@/components/superadmin/control-center/PlatformCard";
import { CredentialRow } from "@/components/superadmin/control-center/CredentialRow";
import { SystemInfoCard } from "@/components/superadmin/control-center/SystemInfoCard";
import type { EnvStatus } from "@/lib/superadmin/env-status";
import type { PlatformHealthMap, PlatformHealthStatus } from "@/lib/superadmin/platform-health";

type Tone = "teal" | "violet" | "amber" | "sky" | "rose" | "emerald" | "slate";

// ── Plataformas del Launchpad ────────────────────────────────────────────────

interface PlatformDef {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Categoría agrupable — encabeza grupo en el launchpad. */
  category: "Panel interno" | "Comercial público" | "Cuenta cliente" | "Herramientas devs";
  /** Tono visual del card (gradient + color del icono). */
  tone: Tone;
}

const PLATFORMS: readonly PlatformDef[] = [
  // ── Panel interno ─────────────────────────────────────────────────────
  {
    id: "superadmin",
    name: "SuperAdmin",
    description: "Plataforma SaaS — este panel.",
    href: "/superadmin",
    icon: ShieldCheck,
    category: "Panel interno",
    tone: "teal",
  },
  {
    id: "admin",
    name: "Admin Panel",
    description: "ERP del tenant — operación día a día.",
    href: "/admin",
    icon: LayoutDashboard,
    category: "Panel interno",
    tone: "violet",
  },
  // ── Comercial público ────────────────────────────────────────────────
  {
    id: "tienda",
    name: "Tienda principal",
    description: "Storefront público del tenant Buleje.",
    href: "/tienda",
    icon: Store,
    category: "Comercial público",
    tone: "amber",
  },
  {
    id: "marketplace",
    name: "Marketplace",
    description: "Hub multi-vendor cross-store.",
    href: "/marketplace",
    icon: ShoppingBag,
    category: "Comercial público",
    tone: "sky",
  },
  {
    id: "vender",
    name: "Vende en Buleje",
    description: "Landing B2B para captar vendors.",
    href: "/vender",
    icon: Building2,
    category: "Comercial público",
    tone: "rose",
  },
  {
    id: "descubri",
    name: "Descubrí",
    description: "Meta-landing de features y casos.",
    href: "/descubri",
    icon: Sparkles,
    category: "Comercial público",
    tone: "emerald",
  },
  {
    id: "socio-buleje",
    name: "Socio Buleje",
    description: "Landing del programa de socios.",
    href: "/socio-buleje",
    icon: HeartHandshake,
    category: "Comercial público",
    tone: "rose",
  },
  // ── Cuenta cliente ───────────────────────────────────────────────────
  {
    id: "cuenta",
    name: "Cuenta cliente",
    description: "Dashboard del comprador final.",
    href: "/cuenta",
    icon: User,
    category: "Cuenta cliente",
    tone: "violet",
  },
  // ── Herramientas devs ────────────────────────────────────────────────
  {
    id: "storybook",
    name: "Design System",
    description: "Storybook de @buleje/design-system.",
    href: "/storybook",
    icon: Palette,
    category: "Herramientas devs",
    tone: "slate",
  },
  {
    id: "asistente",
    name: "Asistente IA",
    description: "Chat con contexto operativo del tenant.",
    href: "/asistente",
    icon: Brain,
    category: "Herramientas devs",
    tone: "teal",
  },
];

const CATEGORY_ORDER: readonly PlatformDef["category"][] = [
  "Panel interno",
  "Comercial público",
  "Cuenta cliente",
  "Herramientas devs",
];

// ── Credenciales del sistema ─────────────────────────────────────────────────

interface CredentialDef {
  /** Clave lógica usada para lookup en EnvStatus. */
  envKey: keyof EnvStatus;
  label: string;
  scope: string;
  /** Texto libre de última rotación (cuando configurada). */
  rotatedLabel: string;
  actionKind: "rotate" | "change" | "external" | "configure";
  actionLabel: string;
  /** Cuando está definido, la acción abre este URL en nueva pestaña. */
  actionHref?: string;
  /** Mensaje del alert stub cuando la acción es interna (ADR pendiente). */
  pendingAdr?: string;
}

const CREDENTIALS: readonly CredentialDef[] = [
  {
    envKey: "AUTH_SECRET",
    label: "AUTH_SECRET",
    scope: "JWT signing",
    rotatedLabel: "hace 45d",
    actionKind: "rotate",
    actionLabel: "Rotar",
    pendingAdr: "rotación manual — ADR pendiente",
  },
  {
    envKey: "CRON_SECRET",
    label: "CRON_SECRET",
    scope: "Cron jobs",
    rotatedLabel: "hace 30d",
    actionKind: "rotate",
    actionLabel: "Rotar",
    pendingAdr: "rotación manual — ADR pendiente",
  },
  {
    envKey: "DATABASE_URL",
    label: "DATABASE_URL",
    scope: "Supabase pooler",
    rotatedLabel: "activo",
    actionKind: "external",
    actionLabel: "Ver en Vercel",
    actionHref: "https://vercel.com/dashboard",
  },
  {
    envKey: "DIRECT_URL",
    label: "DIRECT_URL",
    scope: "Supabase direct (migrate)",
    rotatedLabel: "activo",
    actionKind: "external",
    actionLabel: "Ver en Vercel",
    actionHref: "https://vercel.com/dashboard",
  },
  {
    envKey: "SUPERADMIN_PASSWORD",
    label: "SUPERADMIN_PASSWORD",
    scope: "Platform login",
    rotatedLabel: "hace 12d",
    actionKind: "change",
    actionLabel: "Cambiar",
    pendingAdr: "reset via UI — ADR pendiente",
  },
  {
    envKey: "STRIPE_SECRET_KEY",
    label: "STRIPE_SECRET_KEY",
    scope: "Pagos",
    rotatedLabel: "—",
    actionKind: "external",
    actionLabel: "Configurar",
    actionHref: "https://dashboard.stripe.com/apikeys",
  },
  {
    envKey: "RESEND_API_KEY",
    label: "RESEND_API_KEY",
    scope: "Emails transaccionales",
    rotatedLabel: "—",
    actionKind: "external",
    actionLabel: "Configurar",
    actionHref: "https://resend.com/api-keys",
  },
  {
    envKey: "TWILIO_WHATSAPP",
    label: "TWILIO_WHATSAPP",
    scope: "Notificaciones WhatsApp",
    rotatedLabel: "—",
    actionKind: "external",
    actionLabel: "Configurar",
    actionHref: "https://console.twilio.com/",
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ControlCenterClientProps {
  envStatus: EnvStatus;
  healthMap: PlatformHealthMap;
  systemInfo: {
    version: string;
    branch: string;
    nextVersion: string;
    nodeVersion: string;
    deployedAt: string;
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ControlCenterClient({
  envStatus,
  healthMap,
  systemInfo,
}: ControlCenterClientProps) {
  const handlePendingAction = (message: string) => {
    // Stubs mientras no haya ADR — mantener copia profesional.
    window.alert(`Acción pendiente: ${message}.`);
  };

  // Quick stats — overview del estado del Control Center
  const operationalCount = PLATFORMS.filter(
    (p) => (healthMap[p.id]?.status ?? "unknown") === "operational",
  ).length;
  const configuredCreds = CREDENTIALS.filter((c) => envStatus[c.envKey]).length;

  // Agrupa plataformas por categoría manteniendo el orden definido
  const platformsByCategory = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: PLATFORMS.filter((p) => p.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <AdminPage>
      <AdminTabShell
        title="Centro de control"
        description="Acceso rápido a todas las plataformas + estado de credenciales + info del sistema."
        icon={Gauge}
        kicker="Plataforma Buleje"
      >
      {/* ── Quick stats — visión del estado en un golpe ─────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickStat
          icon={Activity}
          label="Plataformas activas"
          value={`${operationalCount}/${PLATFORMS.length}`}
          tone="teal"
          hint={
            operationalCount === PLATFORMS.length
              ? "Todas operativas"
              : `${PLATFORMS.length - operationalCount} con incidencias`
          }
        />
        <QuickStat
          icon={KeyRound}
          label="Credenciales OK"
          value={`${configuredCreds}/${CREDENTIALS.length}`}
          tone="emerald"
          hint={
            configuredCreds === CREDENTIALS.length
              ? "Sin pendientes"
              : `${CREDENTIALS.length - configuredCreds} por configurar`
          }
        />
        <QuickStat
          icon={Server}
          label="Next.js"
          value={systemInfo.nextVersion}
          tone="sky"
          hint={`Node ${systemInfo.nodeVersion}`}
        />
        <QuickStat
          icon={Sparkles}
          label="Versión"
          value={systemInfo.version}
          tone="violet"
          hint={`Branch ${systemInfo.branch}`}
        />
      </div>

      {/* ── A. Launchpad ────────────────────────────────────────────── */}
      <AdminSection
        title="Plataformas"
        description="Abre cualquier destino en una pestaña nueva. La URL es copiable."
      >
        <div className="space-y-6">
          {platformsByCategory.map((group) => (
            <div key={group.category}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
                {group.category}
                <span className="ml-2 text-[var(--text-tertiary)]/60 font-semibold">
                  · {group.items.length}
                </span>
              </p>
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                }}
              >
                {group.items.map((p) => {
                  const status: PlatformHealthStatus =
                    healthMap[p.id]?.status ?? "unknown";
                  return (
                    <PlatformCard
                      key={p.id}
                      id={p.id}
                      name={p.name}
                      description={p.description}
                      href={p.href}
                      icon={p.icon}
                      status={status}
                      tone={p.tone}
                      category={p.category}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </AdminSection>

      {/* ── B. Credenciales ─────────────────────────────────────────── */}
      <AdminSection
        title="Credenciales del sistema"
        description="Los valores nunca se muestran; sólo se reporta existencia y se ofrecen accesos a los dashboards de cada proveedor."
      >
        <div
          className={cn(
            "overflow-hidden rounded-2xl border border-[var(--rule-base)]",
            "bg-[var(--surface-raised)]",
          )}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                <tr>
                  <th className="px-4 py-2.5">
                    <Kicker>Credencial</Kicker>
                  </th>
                  <th className="px-4 py-2.5">
                    <Kicker>Estado</Kicker>
                  </th>
                  <th className="px-4 py-2.5">
                    <Kicker>Última rotación</Kicker>
                  </th>
                  <th className="px-4 py-2.5 text-right">
                    <Kicker>Acción</Kicker>
                  </th>
                </tr>
              </thead>
              <tbody>
                {CREDENTIALS.map((c) => {
                  const configured = envStatus[c.envKey];
                  const showRotated = configured ? c.rotatedLabel : "—";
                  const hasHref = Boolean(c.actionHref);
                  return (
                    <CredentialRow
                      key={c.envKey}
                      label={c.label}
                      scope={c.scope}
                      configured={configured}
                      rotatedLabel={showRotated}
                      actionKind={c.actionKind}
                      actionLabel={c.actionLabel}
                      actionHref={hasHref ? c.actionHref : undefined}
                      onAction={
                        hasHref
                          ? undefined
                          : () => handlePendingAction(c.pendingAdr ?? c.actionLabel)
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            className={cn(
              "flex items-center gap-2 border-t border-[var(--rule-base)]",
              "bg-[var(--surface-sunken)] px-4 py-2.5",
            )}
          >
            <Lock className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
            <BodyText className="text-[var(--text-tertiary)]">
              Ningún secreto se envía al cliente. Solo se expone si la variable
              está presente.
            </BodyText>
          </div>
        </div>
      </AdminSection>

      {/* ── C. Info del sistema (timestamp deploy detallado) ─────────── */}
      <SystemInfoCard
        items={[
          { label: "Versión", value: systemInfo.version },
          { label: "Branch", value: systemInfo.branch },
          { label: "Next.js", value: systemInfo.nextVersion },
          { label: "Node", value: systemInfo.nodeVersion },
        ]}
        deployedAt={systemInfo.deployedAt}
      />
      </AdminTabShell>
    </AdminPage>
  );
}

// ── Quick stat (chip stat ejecutivo) ─────────────────────────────────────
const QUICK_TONE: Record<Tone, { bg: string; text: string; border: string }> = {
  teal:    { bg: "bg-teal-500/10 dark:bg-teal-500/15",       text: "text-teal-700 dark:text-teal-300",       border: "border-teal-500/30" },
  violet:  { bg: "bg-violet-500/10 dark:bg-violet-500/15",   text: "text-violet-700 dark:text-violet-300",   border: "border-violet-500/30" },
  amber:   { bg: "bg-amber-500/10 dark:bg-amber-500/15",     text: "text-amber-700 dark:text-amber-300",     border: "border-amber-500/30" },
  sky:     { bg: "bg-sky-500/10 dark:bg-sky-500/15",         text: "text-sky-700 dark:text-sky-300",         border: "border-sky-500/30" },
  rose:    { bg: "bg-rose-500/10 dark:bg-rose-500/15",       text: "text-rose-700 dark:text-rose-300",       border: "border-rose-500/30" },
  emerald: { bg: "bg-emerald-500/10 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-500/30" },
  slate:   { bg: "bg-slate-500/10 dark:bg-slate-500/15",     text: "text-slate-700 dark:text-slate-300",     border: "border-slate-500/30" },
};

function QuickStat({
  icon: Icon,
  label,
  value,
  hint,
  tone = "teal",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  const t = QUICK_TONE[tone];
  return (
    <div
      className={cn(
        "rounded-2xl border bg-[var(--surface-raised)] p-4 flex items-start gap-3",
        "border-[var(--rule-base)]",
      )}
    >
      <div
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-xl shrink-0 border",
          t.bg,
          t.text,
          t.border,
        )}
        aria-hidden
      >
        <Icon className="h-5 w-5" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </p>
        <p className="mt-0.5 text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] tabular-nums leading-tight truncate">
          {value}
        </p>
        {hint && (
          <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)] truncate">{hint}</p>
        )}
      </div>
    </div>
  );
}
