"use client";

/**
 * Security Center — Superadmin
 *
 * Dashboard profesional de seguridad estilo GitHub Security / Vercel Security.
 * 6 tabs horizontales:
 *   1. Overview       — KPIs hero + timeline + postura
 *   2. Auth & Sesiones — sesiones activas + 2FA + policy + failures chart
 *   3. Permisos       — matriz RBAC 26 recursos × 6 roles (vista documental)
 *   4. Vulnerabilidades — CVE list + scan history (stub)
 *   5. Compliance     — Ley 29733 + OWASP Top 10
 *   6. Audit log      — registro completo con filtros
 *
 * Acciones concretas son stubs mock — ver cada tab.
 */

import { useState } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import {
  LayoutDashboard,
  Lock,
  Users,
  ShieldAlert,
  ClipboardCheck,
  ScrollText,
} from "@buleje/design-system/icons";
import { AdminPage } from "@buleje/design-system";
import { SecurityHero } from "@/components/superadmin/security/SecurityHero";
import { OverviewTab } from "@/components/superadmin/security/OverviewTab";
import { AuthSessionsTab } from "@/components/superadmin/security/AuthSessionsTab";
import { PermissionsTab } from "@/components/superadmin/security/PermissionsTab";
import { VulnerabilitiesTab } from "@/components/superadmin/security/VulnerabilitiesTab";
import { ComplianceTab } from "@/components/superadmin/security/ComplianceTab";
import { AuditLogTab } from "@/components/superadmin/security/AuditLogTab";

type TabKey =
  | "overview"
  | "auth"
  | "permissions"
  | "vulnerabilities"
  | "compliance"
  | "audit";

interface TabDef {
  key: TabKey;
  label: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "auth", label: "Auth & Sesiones", icon: Lock },
  { key: "permissions", label: "Permisos", icon: Users },
  { key: "vulnerabilities", label: "Vulnerabilidades", icon: ShieldAlert },
  { key: "compliance", label: "Compliance", icon: ClipboardCheck },
  { key: "audit", label: "Audit log", icon: ScrollText },
];

export default function SecurityCenterPage() {
  const [active, setActive] = useState<TabKey>("overview");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    // Dispara re-fetch en cualquier tab que escuche este evento.
    // OverviewTab y AuthSessionsTab se re-cargan vía useEffect listener.
    window.dispatchEvent(new CustomEvent("security-overview-refresh"));
    window.dispatchEvent(new CustomEvent("security-sessions-refresh"));
    // Animación de spinning durante 600ms — los fetches reales son independientes.
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <AdminPage>
      <SecurityHero
        lastScanLabel="hace 2h"
        status="healthy"
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      {/* Tabs horizontales */}
      <nav
        role="tablist"
        aria-label="Secciones del Security Center"
        className="overflow-x-auto border-b border-[var(--rule-base)]"
      >
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
                  className={`flex items-center gap-2 whitespace-nowrap px-4 py-3 text-[length:var(--ts-sm)] font-medium transition-colors ${
                    isActive
                      ? "border-b-2 border-[var(--text-primary)] text-[var(--text-primary)]"
                      : "border-b-2 border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
      >
        {active === "overview" && <OverviewTab />}
        {active === "auth" && <AuthSessionsTab />}
        {active === "permissions" && <PermissionsTab />}
        {active === "vulnerabilities" && <VulnerabilitiesTab />}
        {active === "compliance" && <ComplianceTab />}
        {active === "audit" && <AuditLogTab />}
      </div>
    </AdminPage>
  );
}
