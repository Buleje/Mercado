"use client";

/**
 * PermissionsTab — Matriz de permisos RBAC (documental).
 *
 * Mejoras 2026-05-11:
 *  - Stats row: # roles, # recursos, % cobertura full por rol
 *  - Matriz collapsible por grupo (Comercio, Operaciones, Plataforma, etc.)
 *  - Leyenda visual de los niveles (full/write/read/none)
 *  - Filtro de texto + filtro por rol con full access
 *
 * Vista read-only de la matriz definida en lib/auth/role-permissions.ts.
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
  ChevronDown,
  ChevronRight,
  KeyRound,
} from "@buleje/design-system/icons";
import { RBAC_ROLES, RBAC_MATRIX, type RbacAccess } from "@/lib/rbac-matrix-data";

const ACCESS_META: Record<RbacAccess, { icon: typeof Check; cls: string; label: string }> = {
  full: {
    icon: Check,
    cls: "bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]",
    label: "Acceso total",
  },
  write: {
    icon: Check,
    cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
    label: "Lectura + escritura",
  },
  read: {
    icon: Eye,
    cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
    label: "Solo lectura",
  },
  none: {
    icon: X,
    cls: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] opacity-50",
    label: "Sin acceso",
  },
};

function AccessCell({ access }: { access: RbacAccess }) {
  const meta = ACCESS_META[access];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${meta.cls}`}
      title={meta.label}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} aria-label={meta.label} />
    </span>
  );
}

export function PermissionsTab() {
  const [filter, setFilter] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

  // Agrupar por categoría
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const row of filtered) {
      const list = map.get(row.group) ?? [];
      list.push(row);
      map.set(row.group, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // Stats: % full access por rol
  const roleStats = useMemo(() => {
    return RBAC_ROLES.map((role) => {
      const total = RBAC_MATRIX.length;
      const fullCount = RBAC_MATRIX.filter((r) => r.access[role.role] === "full").length;
      const writeCount = RBAC_MATRIX.filter((r) => r.access[role.role] === "write").length;
      const readCount = RBAC_MATRIX.filter((r) => r.access[role.role] === "read").length;
      return {
        role: role.role,
        label: role.label,
        full: fullCount,
        write: writeCount,
        read: readCount,
        total,
        coverage: Math.round(((fullCount + writeCount + readCount) / total) * 100),
      };
    });
  }, []);

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* ─── Info banner ─────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-2xl border border-sky-300/60 bg-sky-50/40 px-5 py-4 dark:border-sky-700/40 dark:bg-sky-950/30">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
          <Shield className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display text-sm font-extrabold text-sky-900 dark:text-sky-100">
            Vista documental
          </p>
          <p className="text-xs text-sky-700 dark:text-sky-300 mt-0.5">
            La matriz refleja la política vigente en{" "}
            <code className="font-mono">lib/auth/role-permissions.ts</code>. Los cambios se hacen
            en código y requieren revisión por PR.
          </p>
        </div>
        <a
          href="https://github.com/Buleje/Mercado/blob/master/bodega-san-martin/lib/auth/role-permissions.ts"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-sky-300/60 bg-[var(--surface-raised)] px-3.5 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100 dark:border-sky-700/40 dark:text-sky-300 dark:hover:bg-sky-900/40"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden />
          Ver código
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>

      {/* ─── Stats row por rol ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {roleStats.map((s) => (
          <div
            key={s.role}
            className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3"
          >
            <div className="flex items-center gap-1.5">
              <KeyRound className="h-3 w-3 text-[var(--text-tertiary)]" aria-hidden />
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] truncate">
                {s.label}
              </p>
            </div>
            <p className="mt-1 font-display text-lg font-extrabold tabular-nums text-[var(--text-primary)]">
              {s.coverage}%
            </p>
            <div className="mt-1.5 flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              <span className="inline-flex items-center gap-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)]" />
                {s.full}
              </span>
              <span className="inline-flex items-center gap-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                {s.write}
              </span>
              <span className="inline-flex items-center gap-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)]" />
                {s.read}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Legend + filter ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap text-xs">
          {(["full", "write", "read", "none"] as const).map((acc) => (
            <div key={acc} className="inline-flex items-center gap-1.5">
              <AccessCell access={acc} />
              <span className="text-[var(--text-secondary)]">{ACCESS_META[acc].label}</span>
            </div>
          ))}
        </div>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]"
            aria-hidden
          />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar recurso o grupo…"
            className="w-64 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
      </div>

      {/* ─── Matriz agrupada ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Users className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              Matriz de permisos
            </h3>
            <p className="text-xs text-[var(--text-tertiary)]">
              {RBAC_MATRIX.length} recursos × {RBAC_ROLES.length} roles
            </p>
          </div>
        </header>

        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-[var(--text-tertiary)]">
              Sin resultados para &ldquo;{filter}&rdquo;
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--surface-canvas)] z-10">
                <tr className="border-b border-[var(--rule-soft)] text-left text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
                  <th className="px-5 py-3 font-extrabold">Recurso</th>
                  {RBAC_ROLES.map((role) => (
                    <th key={role.role} className="px-2 py-3 font-extrabold text-center">
                      {role.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map(([group, rows]) => {
                  const isCollapsed = collapsedGroups.has(group);
                  return (
                    <>
                      <tr
                        key={`group-${group}`}
                        className="bg-[var(--surface-canvas)]/60 hover:bg-[var(--surface-sunken)] cursor-pointer"
                        onClick={() => toggleGroup(group)}
                      >
                        <td
                          colSpan={RBAC_ROLES.length + 1}
                          className="px-5 py-2.5"
                        >
                          <div className="inline-flex items-center gap-2">
                            {isCollapsed ? (
                              <ChevronRight
                                className="h-3.5 w-3.5 text-[var(--text-tertiary)]"
                                aria-hidden
                              />
                            ) : (
                              <ChevronDown
                                className="h-3.5 w-3.5 text-[var(--text-tertiary)]"
                                aria-hidden
                              />
                            )}
                            <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                              {group}
                            </span>
                            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                              ({rows.length})
                            </span>
                          </div>
                        </td>
                      </tr>
                      {!isCollapsed &&
                        rows.map((row) => (
                          <tr
                            key={row.resource}
                            className="border-t border-[var(--rule-soft)] transition hover:bg-[var(--surface-sunken)]/40"
                          >
                            <td className="px-5 py-3">
                              <div className="flex flex-col">
                                <span className="font-bold text-[var(--text-primary)]">
                                  {row.label}
                                </span>
                                <span className="font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                                  {row.resource}
                                </span>
                              </div>
                            </td>
                            {RBAC_ROLES.map((role) => (
                              <td key={role.role} className="px-2 py-3 text-center">
                                <AccessCell access={row.access[role.role] ?? "none"} />
                              </td>
                            ))}
                          </tr>
                        ))}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─── Auditoría de cambios ────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <FileText className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              La matriz vive en código, no en DB
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Cualquier cambio de permisos se hace editando{" "}
              <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs font-mono">
                lib/auth/role-permissions.ts
              </code>{" "}
              y queda en el git log. Ventaja: cada cambio es revisado por un humano antes de
              merge y trazable indefinidamente. No hay UI para rotar permisos en caliente — eso
              reduce superficie de ataque.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href="https://github.com/Buleje/Mercado/commits/master/bodega-san-martin/lib/auth/role-permissions.ts"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Ver historial git
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
              <a
                href="/superadmin/activity"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Ver audit log de runtime
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Roles custom (no disponible) ────────────────────────── */}
      <div className="rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] p-8 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
          <Users className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
        </div>
        <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
          Roles personalizados no disponibles
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1 max-w-md mx-auto">
          La plataforma usa los 6 roles canónicos. Roles custom por tenant aumentarían la
          superficie de auditoría sin beneficio claro. Si necesitás un permiso específico, agregalo
          al rol existente.
        </p>
      </div>
    </div>
  );
}
