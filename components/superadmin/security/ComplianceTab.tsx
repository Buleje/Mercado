"use client";

/**
 * ComplianceTab — Ley 29733 (Perú) + OWASP Top 10.
 *
 * Checklist visual del estado de cumplimiento. Render documental —
 * los controles reales viven en multi-tenant-guard, audit logs, etc.
 *
 * Acción de export Art. 18: Dialog que pide tenant slug + DNI y dispara
 * POST /api/superadmin/compliance/data-export. El JSON se descarga como
 * archivo. Cumplimiento real, no mock.
 */

import { useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ClipboardCheck,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  FileDown,
  X,
  Loader2,
  type LucideIcon,
} from "@buleje/design-system/icons";
import {
  AdminGrid,
  AdminSection,
  BadgeStatus,
  BodyText,
  Caption,
  CardTitle,
  InfoAlert,
  SuccessAlert,
} from "@buleje/design-system";
import type { BadgeStatusVariant } from "@buleje/design-system";

type ComplianceStatus = "pass" | "partial" | "fail" | "na";

const STATUS_MAP: Record<
  ComplianceStatus,
  { variant: BadgeStatusVariant; label: string; icon: LucideIcon }
> = {
  pass: { variant: "success", label: "Cumple", icon: ShieldCheck },
  partial: { variant: "warning", label: "Parcial", icon: AlertTriangle },
  fail: { variant: "error", label: "No cumple", icon: XCircle },
  na: { variant: "neutral", label: "N/A", icon: ClipboardCheck },
};

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  status: ComplianceStatus;
}

// ── Ley 29733 — Protección de Datos Personales (Perú) ──────────────────────
const LEY_29733: ChecklistItem[] = [
  {
    id: "ley-01",
    title: "Art. 13 — Consentimiento informado",
    description:
      "El usuario acepta explícitamente el tratamiento de sus datos al registrarse.",
    status: "pass",
  },
  {
    id: "ley-02",
    title: "Art. 18 — Derecho de acceso",
    description:
      "Exportación de datos por DNI disponible vía skill gdpr-export.",
    status: "pass",
  },
  {
    id: "ley-03",
    title: "Art. 20 — Derecho de rectificación",
    description:
      "El cliente puede editar sus datos desde /cuenta/perfil.",
    status: "pass",
  },
  {
    id: "ley-04",
    title: "Art. 21 — Derecho de supresión",
    description:
      "Flujo de baja con retención legal de 5 años para facturación.",
    status: "partial",
  },
  {
    id: "ley-05",
    title: "Art. 24 — Seguridad de la información",
    description:
      "Aislamiento multi-tenant por tenantId + HTTPS obligatorio + audit log.",
    status: "pass",
  },
  {
    id: "ley-06",
    title: "Art. 28 — Flujo transfronterizo",
    description:
      "Hosting en Supabase (AWS US) — requerirá aviso previo para datos sensibles.",
    status: "partial",
  },
];

// ── OWASP Top 10 (2021) ─────────────────────────────────────────────────────
const OWASP_TOP_10: ChecklistItem[] = [
  {
    id: "owasp-01",
    title: "A01 — Broken Access Control",
    description:
      "RBAC con 6 roles y validación en middleware. requireAdmin() en routes protegidas.",
    status: "pass",
  },
  {
    id: "owasp-02",
    title: "A02 — Cryptographic Failures",
    description:
      "AUTH_SECRET validado en startup. Passwords con bcrypt. TLS obligatorio en prod.",
    status: "pass",
  },
  {
    id: "owasp-03",
    title: "A03 — Injection",
    description:
      "Prisma parametriza 100% de queries. Raw SQL sólo con $1/$2, nunca interpolation.",
    status: "pass",
  },
  {
    id: "owasp-04",
    title: "A04 — Insecure Design",
    description:
      "ADRs documentados (68-75). Zona peligrosa marcada en CLAUDE.md.",
    status: "pass",
  },
  {
    id: "owasp-05",
    title: "A05 — Security Misconfiguration",
    description:
      "CSP headers + rate limit + lockout 5 intentos. Env vars validadas al arranque.",
    status: "pass",
  },
  {
    id: "owasp-06",
    title: "A06 — Vulnerable Components",
    description:
      "Scanner activo. 1 CVE medium pendiente (prisma 7.7 → 7.8).",
    status: "partial",
  },
  {
    id: "owasp-07",
    title: "A07 — Identification & Auth Failures",
    description: "TOTP 2FA para superadmin. Lockout automático. Rotación JWT.",
    status: "pass",
  },
  {
    id: "owasp-08",
    title: "A08 — Software & Data Integrity",
    description:
      "CI con lint + tsc + test + build. Dependency lockfile versionado.",
    status: "pass",
  },
  {
    id: "owasp-09",
    title: "A09 — Logging & Monitoring",
    description:
      "Audit log exhaustivo. Sentry integrado. SLO dashboard activo.",
    status: "pass",
  },
  {
    id: "owasp-10",
    title: "A10 — Server-Side Request Forgery",
    description:
      "Endpoints externos pasan por whitelist configurado en lib/env.ts.",
    status: "partial",
  },
];

// ── Retention policy mock ───────────────────────────────────────────────────
const RETENTION_RULES = [
  { type: "Datos de cuenta", period: "Mientras la cuenta esté activa + 1 año" },
  { type: "Órdenes y facturas", period: "5 años (obligación SUNAT)" },
  { type: "Audit log", period: "2 años" },
  { type: "Logs de seguridad", period: "1 año" },
  { type: "Backups", period: "35 días rotativos" },
];

export function ComplianceTab() {
  const [feedback, setFeedback] = useState<
    { title: string; description?: string } | null
  >(null);
  const [exportOpen, setExportOpen] = useState(false);

  const handleExportRequest = () => {
    setExportOpen(true);
  };

  const passCount = [...LEY_29733, ...OWASP_TOP_10].filter(
    (i) => i.status === "pass",
  ).length;
  const totalCount = LEY_29733.length + OWASP_TOP_10.length;
  const percentage = Math.round((passCount / totalCount) * 100);

  return (
    <div className="space-y-6">
      {feedback && (
        <SuccessAlert
          title={feedback.title}
          description={feedback.description}
        />
      )}

      <InfoAlert
        icon={ClipboardCheck}
        title={`Cumplimiento agregado: ${percentage}%`}
        description={`${passCount} de ${totalCount} controles en estado cumple. Los controles parciales requieren revisión del equipo legal.`}
      />

      <AdminGrid cols={2} gap={5}>
        <AdminSection
          title="Ley 29733 — Protección de datos personales"
          description="Cumplimiento regulatorio Perú"
        >
          <ChecklistCard items={LEY_29733} />
        </AdminSection>

        <AdminSection
          title="OWASP Top 10 (2021)"
          description="Controles de seguridad recomendados"
        >
          <ChecklistCard items={OWASP_TOP_10} />
        </AdminSection>
      </AdminGrid>

      <AdminSection
        title="Derecho de acceso (Art. 18)"
        description="Exportación de datos por usuario — cumplimiento Ley 29733"
      >
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle>Herramienta de exportación</CardTitle>
              <BodyText className="mt-1 text-[var(--text-secondary)]">
                Genera un ZIP con todos los datos personales de un cliente:
                pedidos, comentarios, direcciones, consentimientos y audit trail.
              </BodyText>
            </div>
            <button
              type="button"
              onClick={handleExportRequest}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--text-primary)] px-3 py-2 text-[length:var(--ts-sm)] font-medium text-[var(--surface-canvas)] transition-opacity hover:opacity-90"
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden />
              Abrir flujo de exportación
            </button>
          </div>
        </div>
      </AdminSection>

      <AdminSection
        title="Política de retención"
        description="Tiempo de conservación por tipo de dato"
      >
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <ul className="divide-y divide-[var(--rule-soft)]">
            {RETENTION_RULES.map((r) => (
              <li
                key={r.type}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <BodyText className="font-medium">{r.type}</BodyText>
                <Caption className="text-[var(--text-tertiary)]">
                  {r.period}
                </Caption>
              </li>
            ))}
          </ul>
        </div>
      </AdminSection>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        onSuccess={(msg) => setFeedback({ title: "Exportación generada", description: msg })}
      />
    </div>
  );
}

// ─── Export dialog (real) ────────────────────────────────────────────────────
// Pide tenant slug + DNI, llama al endpoint y descarga el JSON como archivo.

function ExportDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: (msg: string) => void;
}) {
  const [tenantSlug, setTenantSlug] = useState("");
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!tenantSlug.trim() || !dni.trim()) {
      setError("Tenant y DNI son obligatorios");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/compliance/data-export", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ tenantSlug: tenantSlug.trim(), dni: dni.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Descargar como archivo JSON.
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-${tenantSlug.trim()}-${dni.trim()}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onSuccess(`Archivo descargado: ${a.download}. Acción registrada en el audit log.`);
      onOpenChange(false);
      setTenantSlug("");
      setDni("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar export");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-md rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-2xl">
          <div className="px-5 py-4 border-b border-[var(--rule-soft)] flex items-center justify-between">
            <Dialog.Title className="text-base font-extrabold text-[var(--text-primary)]">
              Exportar datos del cliente (Art. 18)
            </Dialog.Title>
            <Dialog.Close className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)]" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="p-5 space-y-3">
            <Dialog.Description className="text-xs text-[var(--text-tertiary)]">
              Genera un JSON con todos los datos personales del cliente. Acción auditada
              bajo Ley 29733 Art. 18-20.
            </Dialog.Description>
            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                Tenant slug *
              </span>
              <input
                ref={(el) => { if (el && open) el.focus(); }}
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="ej: bodega-rosita"
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                DNI / Documento del cliente *
              </span>
              <input
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                placeholder="ej: 12345678"
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </label>
            {error && (
              <p role="alert" className="text-xs text-[var(--data-error-500)] flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {error}
              </p>
            )}
          </div>
          <div className="px-5 py-4 border-t border-[var(--rule-soft)] flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="px-4 py-2 rounded-xl text-sm font-medium border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]">
                Cancelar
              </button>
            </Dialog.Close>
            <button
              onClick={submit}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-[var(--accent)] hover:brightness-110 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Generar export
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ChecklistCard({ items }: { items: ChecklistItem[] }) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <ul className="divide-y divide-[var(--rule-soft)]">
        {items.map((item) => {
          const { variant, label, icon: Icon } = STATUS_MAP[item.status];
          return (
            <li key={item.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 shrink-0 rounded-lg bg-[var(--surface-sunken)] p-1.5">
                    <Icon
                      className="h-4 w-4 text-[var(--text-secondary)]"
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0">
                    <BodyText className="font-medium">{item.title}</BodyText>
                    <Caption className="mt-0.5 block text-[var(--text-tertiary)]">
                      {item.description}
                    </Caption>
                  </div>
                </div>
                <BadgeStatus variant={variant} label={label} size="sm" dot />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
