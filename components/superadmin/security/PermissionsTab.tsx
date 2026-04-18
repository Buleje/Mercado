"use client";

/**
 * PermissionsTab — Matriz de permisos RBAC (documental).
 *
 * Vista read-only de la matriz 26 recursos × 6 roles definida en
 * lib/auth/role-permissions.ts. Incluye link al source y listado
 * de cambios de permisos últimos 30d.
 */

import { useMemo, useState } from "react";
import {
  Users,
  Shield,
  FileText,
  ExternalLink,
  Check,
  X,
  Eye,
  Search,
} from "@buleje/design-system/icons";
import {
  AdminSection,
  BadgeStatus,
  BodyText,
  Caption,
  DataTable,
  InfoAlert,
} from "@buleje/design-system";
import {
  RBAC_ROLES,
  RBAC_MATRIX,
  type RbacAccess,
} from "@/lib/mocks/cve-list.mock";
import { fmtRelative } from "@/lib/mocks/security-events.mock";

function AccessCell({ access }: { access: RbacAccess }) {
  if (access === "full") {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--data-success)_14%,transparent)] text-[var(--data-success)]"
        title="Acceso total"
      >
        <Check className="h-3.5 w-3.5" aria-label="Acceso total" />
      </span>
    );
  }
  if (access === "write") {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--data-info)_14%,transparent)] text-[var(--data-info)]"
        title="Lectura + escritura"
      >
        <Check className="h-3.5 w-3.5" aria-label="Lectura y escritura" />
      </span>
    );
  }
  if (access === "read") {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
        title="Solo lectura"
      >
        <Eye className="h-3.5 w-3.5" aria-label="Solo lectura" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
      title="Sin acceso"
    >
      <X className="h-3.5 w-3.5" aria-label="Sin acceso" />
    </span>
  );
}

// Mock de cambios recientes de permisos.
const PERMISSION_CHANGES = [
  {
    id: "pc-001",
    user: "platform@buleje.pe",
    detail: "Rol de user-423 modificado: cajero → admin",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "pc-002",
    user: "platform@buleje.pe",
    detail: "Permiso analytics concedido a role viewer",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
  },
  {
    id: "pc-003",
    user: "automation",
    detail: "Rotación anual de permisos auditada — sin cambios",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString(),
  },
];

export function PermissionsTab() {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return RBAC_MATRIX;
    return RBAC_MATRIX.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.resource.toLowerCase().includes(q) ||
        r.group.toLowerCase().includes(q),
    );
  }, [filter]);

  return (
    <div className="space-y-6">
      <InfoAlert
        icon={Shield}
        title="Vista documental"
        description="La matriz refleja la política vigente en lib/auth/role-permissions.ts. Los cambios se hacen en código y requieren revisión."
        action={
          <a
            href="https://github.com/Buleje/Mercado/blob/master/bodega-san-martin/lib/auth/role-permissions.ts"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[length:var(--ts-sm)] font-medium text-[var(--text-primary)] underline-offset-2 hover:underline"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            Ver código
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        }
      />

      <AdminSection
        title="Matriz de permisos"
        description={`${RBAC_MATRIX.length} recursos × ${RBAC_ROLES.length} roles`}
        actions={
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]"
              aria-hidden
            />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar recurso..."
              className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] py-1.5 pl-8 pr-3 text-[length:var(--ts-sm)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--text-primary)]/20"
            />
          </div>
        }
      >
        <DataTable>
          <thead>
            <tr>
              <th>Recurso</th>
              <th>Grupo</th>
              {RBAC_ROLES.map((role) => (
                <th key={role.role} className="text-center">
                  {role.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.resource}>
                <td>
                  <div className="flex flex-col">
                    <span className="font-medium text-[var(--text-primary)]">
                      {row.label}
                    </span>
                    <Caption className="font-mono text-[var(--text-tertiary)]">
                      {row.resource}
                    </Caption>
                  </div>
                </td>
                <td>
                  <BadgeStatus
                    variant="neutral"
                    label={row.group}
                    size="sm"
                  />
                </td>
                {RBAC_ROLES.map((role) => (
                  <td key={role.role} className="text-center">
                    <AccessCell access={row.access[role.role] ?? "none"} />
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={2 + RBAC_ROLES.length}>
                  <Caption className="block py-6 text-center text-[var(--text-tertiary)]">
                    Sin resultados para "{filter}"
                  </Caption>
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </AdminSection>

      <AdminSection
        title="Cambios recientes"
        description="Modificaciones de permisos últimos 30 días"
      >
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <ul className="divide-y divide-[var(--rule-soft)]">
            {PERMISSION_CHANGES.map((c) => (
              <li
                key={c.id}
                className="flex items-start gap-3 px-4 py-3"
              >
                <div className="mt-0.5 shrink-0 rounded-lg bg-[var(--surface-sunken)] p-1.5">
                  <Users
                    className="h-4 w-4 text-[var(--text-secondary)]"
                    aria-hidden
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <BodyText>{c.detail}</BodyText>
                  <Caption className="text-[var(--text-tertiary)]">
                    {c.user}
                  </Caption>
                </div>
                <time className="shrink-0 whitespace-nowrap text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  {fmtRelative(c.date)}
                </time>
              </li>
            ))}
          </ul>
        </div>
      </AdminSection>

      <AdminSection
        title="Roles personalizados"
        description="Stub — configuración futura de roles custom por tenant"
      >
        <div className="rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center">
          <BodyText className="text-[var(--text-secondary)]">
            Los roles personalizados aún no están disponibles.
          </BodyText>
          <Caption className="mt-1 block text-[var(--text-tertiary)]">
            Actualmente se usan los 6 roles canónicos de la plataforma.
          </Caption>
        </div>
      </AdminSection>
    </div>
  );
}
