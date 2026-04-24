"use client";

/**
 * VulnerabilitiesTab — CVE scanner + historial de scans.
 *
 * Lista de CVEs detectadas (mock tipo Dependabot) con severity chips,
 * acción "Update" por entrada (stub), botón "Run scan" (stub), y
 * historial últimas 10 corridas.
 */

import { useMemo, useState } from "react";
import {
  ShieldAlert,
  Package,
  Play,
  Clock,
  ExternalLink,
  type LucideIcon,
} from "@buleje/design-system/icons";
import {
  AdminGrid,
  AdminSection,
  BadgeStatus,
  BodyText,
  Caption,
  DataTable,
  StatCard,
  SuccessAlert,
  WarningAlert,
} from "@buleje/design-system";
import type { BadgeStatusVariant } from "@buleje/design-system";
import {
  CVE_LIST,
  SCAN_HISTORY,
  type CveEntry,
  type CveSeverity,
  type CveStatus,
  type ScanRun,
} from "@/lib/mocks/cve-list.mock";
import { fmtRelative } from "@/lib/mocks/security-events.mock";

const SEVERITY_BADGE: Record<CveSeverity, { variant: BadgeStatusVariant; label: string }> = {
  critical: { variant: "error", label: "Crítica" },
  high: { variant: "error", label: "Alta" },
  medium: { variant: "warning", label: "Media" },
  low: { variant: "info", label: "Baja" },
};

const STATUS_BADGE: Record<CveStatus, { variant: BadgeStatusVariant; label: string }> = {
  pending: { variant: "warning", label: "Pendiente" },
  in_review: { variant: "info", label: "En revisión" },
  patched: { variant: "success", label: "Parchado" },
  dismissed: { variant: "neutral", label: "Descartado" },
};

export function VulnerabilitiesTab() {
  const [feedback, setFeedback] = useState<
    { kind: "success" | "warning"; title: string; description?: string } | null
  >(null);
  const [running, setRunning] = useState(false);

  /**
   * TODO: reemplazar con POST /api/superadmin/security/cves/scan { trigger: "manual" }
   * Por ahora sólo muestra alerta.
   */
  const handleRunScan = () => {
    setRunning(true);
    setTimeout(() => {
      setRunning(false);
      setFeedback({
        kind: "success",
        title: "Escaneo ejecutado (mock)",
        description:
          "El escaneo completó sin nuevas críticas. Los resultados se refrescarán en la próxima ventana real.",
      });
    }, 900);
  };

  /**
   * TODO: reemplazar con POST /api/superadmin/security/cves/:id/patch
   */
  const handleUpdate = (cve: CveEntry) => {
    setFeedback({
      kind: "warning",
      title: "Actualización solicitada (mock)",
      description: `Se programó la actualización de ${cve.package} → ${cve.fixedInVersion}. Revisa el PR generado.`,
    });
  };

  const counts = useMemo(() => {
    const byStatus = CVE_LIST.reduce<Record<CveStatus, number>>(
      (acc, c) => {
        acc[c.status] = (acc[c.status] ?? 0) + 1;
        return acc;
      },
      { pending: 0, in_review: 0, patched: 0, dismissed: 0 },
    );
    const unpatchedHighCritical = CVE_LIST.filter(
      (c) =>
        (c.severity === "high" || c.severity === "critical") &&
        c.status !== "patched",
    ).length;
    return { byStatus, unpatchedHighCritical };
  }, []);

  return (
    <div className="space-y-6">
      {feedback?.kind === "success" && (
        <SuccessAlert
          title={feedback.title}
          description={feedback.description}
        />
      )}
      {feedback?.kind === "warning" && (
        <WarningAlert
          title={feedback.title}
          description={feedback.description}
        />
      )}

      <AdminGrid cols={4} gap={4}>
        <StatCard
          icon={ShieldAlert}
          label="Críticas abiertas"
          value={counts.unpatchedHighCritical}
          subValue="High + Critical sin parchar"
          emphasis={counts.unpatchedHighCritical > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={Clock}
          label="Pendientes"
          value={counts.byStatus.pending}
          subValue="Sin intervención aún"
        />
        <StatCard
          icon={Package}
          label="En revisión"
          value={counts.byStatus.in_review}
          subValue="Asignadas al equipo"
        />
        <StatCard
          icon={ShieldAlert}
          label="Parchadas"
          value={counts.byStatus.patched}
          subValue="En los últimos 90d"
          emphasis="neutral"
        />
      </AdminGrid>

      <AdminSection
        title="CVEs detectadas"
        description="Resultado del último escaneo de dependencias"
        actions={
          <button
            type="button"
            onClick={handleRunScan}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--text-primary)] px-3 py-2 text-[length:var(--ts-sm)] font-medium text-[var(--surface-canvas)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            {running ? "Ejecutando..." : "Ejecutar scan"}
          </button>
        }
      >
        <DataTable>
          <thead>
            <tr>
              <th>CVE</th>
              <th>Paquete</th>
              <th>Severidad</th>
              <th>Estado</th>
              <th>Detectada</th>
              <th className="text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {CVE_LIST.map((cve) => (
              <tr key={cve.id}>
                <td>
                  <div className="flex flex-col">
                    <span className="font-mono text-[length:var(--ts-xs)] text-[var(--text-primary)]">
                      {cve.id}
                    </span>
                    <Caption className="text-[var(--text-tertiary)]">
                      {cve.title}
                    </Caption>
                  </div>
                </td>
                <td>
                  <div className="flex flex-col">
                    <span className="font-medium text-[var(--text-primary)]">
                      {cve.package}
                    </span>
                    <Caption className="font-mono text-[var(--text-tertiary)]">
                      {cve.version}
                    </Caption>
                  </div>
                </td>
                <td>
                  <BadgeStatus
                    variant={SEVERITY_BADGE[cve.severity].variant}
                    label={SEVERITY_BADGE[cve.severity].label}
                    size="sm"
                  />
                </td>
                <td>
                  <BadgeStatus
                    variant={STATUS_BADGE[cve.status].variant}
                    label={STATUS_BADGE[cve.status].label}
                    size="sm"
                    dot
                  />
                </td>
                <td className="text-[var(--text-secondary)]">
                  {fmtRelative(cve.reportedAt)}
                </td>
                <td className="text-right">
                  {cve.status === "patched" ? (
                    <Caption className="text-[var(--text-tertiary)]">
                      Completado
                    </Caption>
                  ) : cve.fixedInVersion ? (
                    <button
                      type="button"
                      onClick={() => handleUpdate(cve)}
                      className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1 text-[length:var(--ts-xs)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
                    >
                      Actualizar a {cve.fixedInVersion}
                    </button>
                  ) : (
                    <Caption className="text-[var(--text-tertiary)]">
                      Sin fix
                    </Caption>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </AdminSection>

      <AdminSection
        title="Historial de escaneos"
        description="Últimas 10 corridas del scanner"
      >
        <ScanHistoryTable runs={SCAN_HISTORY} />
      </AdminSection>
    </div>
  );
}

// ── Tabla de scans pasados ──────────────────────────────────────────────────
const TRIGGER_ICON: Record<ScanRun["trigger"], LucideIcon> = {
  scheduled: Clock,
  manual: Play,
  ci: Package,
};

function ScanHistoryTable({ runs }: { runs: ScanRun[] }) {
  return (
    <DataTable>
      <thead>
        <tr>
          <th>ID</th>
          <th>Disparador</th>
          <th>Inicio</th>
          <th>Duración</th>
          <th>Findings</th>
          <th>Estado</th>
          <th className="text-right">Ver</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => {
          const Icon = TRIGGER_ICON[r.trigger];
          const totalFindings =
            r.findings.critical +
            r.findings.high +
            r.findings.medium +
            r.findings.low;
          return (
            <tr key={r.id}>
              <td className="font-mono text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                {r.id}
              </td>
              <td>
                <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <Icon
                    className="h-3.5 w-3.5 text-[var(--text-tertiary)]"
                    aria-hidden
                  />
                  {r.trigger === "scheduled"
                    ? "Programado"
                    : r.trigger === "manual"
                      ? "Manual"
                      : "CI"}
                </span>
              </td>
              <td className="text-[var(--text-secondary)]">
                {fmtRelative(r.startedAt)}
              </td>
              <td className="font-mono text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                {r.duration}
              </td>
              <td>
                <BodyText className="text-[var(--text-secondary)]">
                  {totalFindings}
                  {r.findings.high + r.findings.critical > 0 && (
                    <span className="ml-2 text-[var(--data-warning)]">
                      • {r.findings.high + r.findings.critical} severas
                    </span>
                  )}
                </BodyText>
              </td>
              <td>
                <BadgeStatus
                  variant={r.status === "completed" ? "success" : "error"}
                  label={r.status === "completed" ? "Completo" : "Fallido"}
                  size="sm"
                  dot
                />
              </td>
              <td className="text-right">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Detalle
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
