"use client";

/**
 * Security Center — Superadmin
 *
 * Dashboard profesional de seguridad estilo GitHub Security / Vercel Security.
 * Sigue el patrón canónico del superadmin (banners/marca) — hero con
 * border-b + surface-raised + icon accent sólido, tabs horizontales debajo.
 *
 * 6 tabs:
 *   1. Overview       — KPIs hero + timeline + postura
 *   2. Auth & Sesiones — sesiones activas + 2FA + policy + failures chart
 *   3. Permisos       — matriz RBAC 26 recursos × 6 roles (vista documental)
 *   4. Vulnerabilidades — CVE list + scan history (stub)
 *   5. Compliance     — Ley 29733 + OWASP Top 10
 *   6. Audit log      — registro completo con filtros
 */

import { useState, useEffect } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import {
  LayoutDashboard,
  Lock,
  Users,
  ShieldAlert,
  ClipboardCheck,
  ScrollText,
  Target,
} from "@buleje/design-system/icons";
import { SecurityHero } from "@/components/superadmin/security/SecurityHero";
import { OverviewTab } from "@/components/superadmin/security/OverviewTab";
import { ThreatsTab } from "@/components/superadmin/security/ThreatsTab";
import { AuthSessionsTab } from "@/components/superadmin/security/AuthSessionsTab";
import { PermissionsTab } from "@/components/superadmin/security/PermissionsTab";
import { VulnerabilitiesTab } from "@/components/superadmin/security/VulnerabilitiesTab";
import { ComplianceTab } from "@/components/superadmin/security/ComplianceTab";
import { AuditLogTab } from "@/components/superadmin/security/AuditLogTab";
import { SUPERADMIN_PAGE, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";
import { SuperAdminModuleTabs, SEGURIDAD_TABS } from "@/components/superadmin/_shared/ModuleTabs";

type TabKey = "overview" | "threats" | "auth" | "permissions" | "vulnerabilities" | "compliance" | "audit";

interface TabDef {
  key: TabKey;
  label: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "threats", label: "Amenazas", icon: Target },
  { key: "auth", label: "Auth & Sesiones", icon: Lock },
  { key: "permissions", label: "Permisos", icon: Users },
  { key: "vulnerabilities", label: "Vulnerabilidades", icon: ShieldAlert },
  { key: "compliance", label: "Compliance", icon: ClipboardCheck },
  { key: "audit", label: "Audit log", icon: ScrollText },
];

function fmtRelativeFromMs(ms: number): string {
  const diffMin = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (diffMin < 1) return "hace instantes";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  return `hace ${Math.round(diffH / 24)}d`;
}

export default function SecurityCenterPage() {
  const [active, setActive] = useState<TabKey>("overview");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshMs, setLastRefreshMs] = useState<number>(() => Date.now());
  // Tick cada 30s para mantener el label "hace X min" fresco sin re-fetch.
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    // Dispara re-fetch en cualquier tab que escuche este evento.
    // OverviewTab y AuthSessionsTab se re-cargan vía useEffect listener.
    window.dispatchEvent(new CustomEvent("security-overview-refresh"));
    window.dispatchEvent(new CustomEvent("security-sessions-refresh"));
    setLastRefreshMs(Date.now());
    // Animación de spinning durante 600ms — los fetches reales son independientes.
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <div className={SUPERADMIN_PAGE}>
      <SuperAdminModuleTabs tabs={SEGURIDAD_TABS} />
      <SecurityHero
        lastScanLabel={fmtRelativeFromMs(lastRefreshMs)}
        status="healthy"
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      {/* Tabs horizontales — alineadas al patrón superadmin */}
      <nav
        role="tablist"
        aria-label="Secciones del Security Center"
        className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-6 lg:px-8"
      >
        <div className="w-full overflow-x-auto">
          <ul className="inline-flex min-w-full gap-1">
            {TABS.map((tab) => {
              const isActive = active === tab.key;
              const Icon = tab.icon;
              return (
                <li key={tab.key}>
                  <button
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`panel-${tab.key}`}
                    id={`tab-${tab.key}`}
                    onClick={() => setActive(tab.key)}
                    className={`inline-flex items-center gap-2 whitespace-nowrap px-4 py-3 text-[length:var(--ts-sm)] font-bold transition-colors ${
                      isActive
                        ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                        : "border-b-2 border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    {tab.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        className={SUPERADMIN_CONTENT}
      >
        {active === "overview" && <OverviewTab />}
        {active === "threats" && <ThreatsTab />}
        {active === "auth" && <AuthSessionsTab />}
        {active === "permissions" && <PermissionsTab />}
        {active === "vulnerabilities" && <VulnerabilitiesTab />}
        {active === "compliance" && <ComplianceTab />}
        {active === "audit" && <AuditLogTab />}
      </div>
    </div>
  );
}
