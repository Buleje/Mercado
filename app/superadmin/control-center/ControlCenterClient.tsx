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
  AdminGrid,
  AdminPage,
  AdminSection,
  BodyText,
  Kicker,
  PageTitle,
  cn,
} from "@buleje/design-system";
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
  type LucideIcon,
} from "@buleje/design-system/icons";
import { PlatformCard } from "@/components/superadmin/control-center/PlatformCard";
import { CredentialRow } from "@/components/superadmin/control-center/CredentialRow";
import { SystemInfoCard } from "@/components/superadmin/control-center/SystemInfoCard";
import type { EnvStatus } from "@/lib/superadmin/env-status";
import type { PlatformHealthMap, PlatformHealthStatus } from "@/lib/superadmin/platform-health";

// ── Plataformas del Launchpad ────────────────────────────────────────────────

interface PlatformDef {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const PLATFORMS: readonly PlatformDef[] = [
  {
    id: "superadmin",
    name: "SuperAdmin",
    description: "Plataforma SaaS (este panel).",
    href: "/superadmin",
    icon: ShieldCheck,
  },
  {
    id: "admin",
    name: "Admin Panel",
    description: "ERP de la bodega.",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    id: "tienda",
    name: "Tienda pública principal",
    description: "Storefront de Buleje.",
    href: "/tienda",
    icon: Store,
  },
  {
    id: "marketplace",
    name: "Marketplace",
    description: "Hub público cross-store.",
    href: "/marketplace",
    icon: ShoppingBag,
  },
  {
    id: "vender",
    name: "Vende en Buleje",
    description: "Landing B2B vendor onboarding.",
    href: "/vender",
    icon: Building2,
  },
  {
    id: "descubri",
    name: "Descubrí",
    description: "Meta-landing de features.",
    href: "/descubri",
    icon: Sparkles,
  },
  {
    id: "cuenta",
    name: "Cuenta cliente",
    description: "Dashboard del comprador.",
    href: "/cuenta",
    icon: User,
  },
  {
    id: "storybook",
    name: "Design System",
    description: "Storybook de @buleje/design-system.",
    href: "/storybook",
    icon: Palette,
  },
  {
    id: "socio-buleje",
    name: "Socio Buleje",
    description: "Landing del programa de socios.",
    href: "/socio-buleje",
    icon: HeartHandshake,
  },
  {
    id: "asistente",
    name: "Asistente IA",
    description: "Chat asistido con contexto operativo.",
    href: "/asistente",
    icon: Brain,
  },
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

  return (
    <AdminPage>
      <header className="space-y-1">
        <Kicker>PLATAFORMA</Kicker>
        <PageTitle>Centro de control</PageTitle>
        <BodyText className="text-[var(--text-secondary)]">
          Accesos rápidos a todas las plataformas
        </BodyText>
      </header>

      {/* ── A. Launchpad ────────────────────────────────────────────── */}
      <AdminSection
        title="Plataformas"
        description="Abre cualquier destino en una pestaña nueva. La URL es copiable."
      >
        <AdminGrid cols={3} gap={4}>
          {PLATFORMS.map((p) => {
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
              />
            );
          })}
        </AdminGrid>
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

      {/* ── C. Info del sistema ─────────────────────────────────────── */}
      <SystemInfoCard
        items={[
          { label: "Versión", value: systemInfo.version },
          { label: "Branch", value: systemInfo.branch },
          { label: "Next.js", value: systemInfo.nextVersion },
          { label: "Node", value: systemInfo.nodeVersion },
        ]}
        deployedAt={systemInfo.deployedAt}
      />
    </AdminPage>
  );
}
