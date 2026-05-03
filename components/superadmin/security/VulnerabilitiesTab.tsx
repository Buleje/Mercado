"use client";

/**
 * VulnerabilitiesTab — Estado de escaneo de vulnerabilidades.
 *
 * Hoy: NO hay escáner conectado (sin Snyk/Dependabot/Trivy integrado).
 * Mostrar números fake como "0 críticas, 4 totales detectadas" sería peor que
 * no tenerlo — genera falsa sensación de cobertura. Por eso mostramos un
 * empty state honesto con CTA para conectar un escáner.
 *
 * Cuando se conecte, este tab consumirá un endpoint real
 * (GET /api/superadmin/security/cves) que devuelva data del proveedor.
 */

import { ShieldAlert, ExternalLink, Cable } from "@buleje/design-system/icons";
import { AdminSection, BodyText, Caption } from "@buleje/design-system";

export function VulnerabilitiesTab() {
  return (
    <div className="space-y-6">
      <AdminSection
        title="Vulnerabilidades de dependencias"
        description="Estado del escaneo automático de paquetes"
      >
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-10 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[var(--surface-sunken)] flex items-center justify-center mb-4">
            <ShieldAlert className="h-7 w-7 text-[var(--text-tertiary)]" aria-hidden />
          </div>
          <BodyText className="font-extrabold text-base">Sin escáner conectado</BodyText>
          <Caption className="block max-w-md mx-auto mt-1 text-[var(--text-tertiary)]">
            Para detectar CVEs en las dependencias del repositorio, conectá un escáner externo (Snyk, GitHub Dependabot,
            Trivy o similar). Mientras no haya integración, este panel no muestra datos para evitar falsos positivos.
          </Caption>
          <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
            <a
              href="https://docs.github.com/en/code-security/dependabot/dependabot-security-updates"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90"
            >
              <Cable className="h-4 w-4" />
              Conectar Dependabot
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </a>
            <a
              href="https://snyk.io/docs/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              Conectar Snyk
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </a>
          </div>
        </div>
      </AdminSection>

      <AdminSection
        title="Mientras tanto"
        description="Acciones manuales que reducen el riesgo"
      >
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-3">
          <ChecklistItem
            label="npm audit local"
            detail={
              <>
                Corré <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs font-mono">npm audit --omit=dev</code> antes de cada deploy.
              </>
            }
          />
          <ChecklistItem
            label="Renovate / Dependabot PRs"
            detail="Aceptá las PRs de actualización de seguridad que aparecen en GitHub. Las críticas no esperan al sprint."
          />
          <ChecklistItem
            label="Lockfile auditado"
            detail="Asegurate de que package-lock.json esté commiteado y sin discrepancias con npm install."
          />
        </div>
      </AdminSection>
    </div>
  );
}

function ChecklistItem({ label, detail }: { label: string; detail: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--accent)] shrink-0" aria-hidden />
      <div className="flex-1 min-w-0">
        <BodyText className="font-medium">{label}</BodyText>
        <Caption className="text-[var(--text-tertiary)]">{detail}</Caption>
      </div>
    </div>
  );
}
