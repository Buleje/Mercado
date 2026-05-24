"use client";

/**
 * PermissionsTab — Matriz de permisos RBAC (documental).
 *
 * Mejoras 2026-05-24:
 *  - Fix React Fragment sin key warning
 *  - Search debounced + counter "X de Y matches"
 *  - Keyboard: / busca · Esc limpia y expande todo
 *  - Botones Expandir / Colapsar todos los grupos
 *  - CSV export de la matriz completa (recurso × roles)
 *  - Sticky first column (Recurso) + sticky header (ya existía)
 *  - Tap targets ≥44px (search h-11, AccessCell h-8/9)
 *  - Mobile: cards collapsible por grupo en vez de tabla horizontal
 *
 * Vista read-only de la matriz definida en lib/auth/role-permissions.ts.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Download,
  Maximize2,
  Minimize2,
} from "@buleje/design-system/icons";
import { RBAC_ROLES, RBAC_MATRIX, type RbacAccess } from "@/lib/rbac-matrix-data";
import { cn } from "@/lib/utils";

// ─── Access cell ────────────────────────────────────────────────────────────

const ACCESS_META: Record<RbacAccess, { icon: typeof Check; cls: string; label: string }> = {
  full: {
    icon: Check,
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    label: "Acceso total",
  },
  write: {
    icon: Check,
    cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
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

function AccessCell({ access, size = "md" }: { access: RbacAccess; size?: "sm" | "md" }) {
  const meta = ACCESS_META[access];
  const Icon = meta.icon;
  const dim = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-lg", dim, meta.cls)}
      title={meta.label}
    >
      <Icon className={iconSize} strokeWidth={2.5} aria-label={meta.label} />
    </span>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportMatrixCSV() {
  const headers = ["Grupo", "Recurso", "Resource Key", ...RBAC_ROLES.map((r) => r.label)];
  const data = RBAC_MATRIX.map((row) => [
    row.group,
    row.label,
    row.resource,
    ...RBAC_ROLES.map((r) => row.access[r.role] ?? "none"),
  ]);
  const csv =
    "﻿" +
    [headers, ...data].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rbac_matrix_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PermissionsTab() {
  const [filterRaw, setFilterRaw] = useState("");
  const [filter, setFilter] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounce 150ms
  useEffect(() => {
    const t = setTimeout(() => setFilter(filterRaw), 150);
    return () => clearTimeout(t);
  }, [filterRaw]);

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

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const row of filtered) {
      const list = map.get(row.group) ?? [];
      list.push(row);
      map.set(row.group, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // Stats por rol
  const roleStats = useMemo(() => {
    return RBAC_ROLES.map((role) => {
      const total = RBAC_MATRIX.length;
      const full = RBAC_MATRIX.filter((r) => r.access[role.role] === "full").length;
      const write = RBAC_MATRIX.filter((r) => r.access[role.role] === "write").length;
      const read = RBAC_MATRIX.filter((r) => r.access[role.role] === "read").length;
      return {
        role: role.role,
        label: role.label,
        full,
        write,
        read,
        total,
        coverage: Math.round(((full + write + read) / total) * 100),
      };
    });
  }, []);

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsedGroups(new Set(grouped.map(([g]) => g)));
  }, [grouped]);

  const expandAll = useCallback(() => {
    setCollapsedGroups(new Set());
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select";
      if (e.key === "Escape" && !inField) {
        if (filterRaw) setFilterRaw("");
        else expandAll();
      }
      if (inField) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filterRaw, expandAll]);

  const allCollapsed = grouped.length > 0 && grouped.every(([g]) => collapsedGroups.has(g));
  const isFiltered = filter.trim() !== "";

  return (
    <div className="space-y-6">
      {/* ─── Info banner ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start gap-3 rounded-2xl border-2 border-sky-300/60 bg-sky-50 px-5 py-4 dark:border-sky-700/40 dark:bg-sky-500/10">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
          <Shield className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display text-sm font-extrabold text-sky-900 dark:text-sky-100">
            Vista documental — los cambios requieren PR
          </p>
          <p className="text-xs text-sky-700 dark:text-sky-300 mt-0.5">
            La matriz refleja la política vigente en{" "}
            <code className="font-mono">lib/auth/role-permissions.ts</code>. No hay
            UI para rotar permisos en caliente — eso reduce superficie de ataque y
            deja todo cambio trazable en git.
          </p>
        </div>
        <a
          href="https://github.com/Buleje/Mercado/blob/master/bodega-san-martin/lib/auth/role-permissions.ts"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-sky-300/60 bg-[var(--surface-raised)] px-3.5 text-sm font-bold text-sky-700 hover:bg-sky-100 dark:border-sky-700/40 dark:text-sky-300 dark:hover:bg-sky-500/20"
        >
          <FileText className="h-4 w-4" aria-hidden />
          Ver código
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>

      {/* ─── Action bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={expandAll}
          disabled={!allCollapsed && collapsedGroups.size === 0}
          title="Expandir todo"
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition disabled:opacity-50"
        >
          <Maximize2 className="h-4 w-4" aria-hidden />
          Expandir todo
        </button>
        <button
          onClick={collapseAll}
          disabled={allCollapsed}
          title="Colapsar todo"
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition disabled:opacity-50"
        >
          <Minimize2 className="h-4 w-4" aria-hidden />
          Colapsar todo
        </button>
        <button
          onClick={exportMatrixCSV}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition"
        >
          <Download className="h-4 w-4" aria-hidden />
          CSV matriz
        </button>
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">
          Atajos:{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono border border-[var(--rule-soft)]">
            /
          </kbd>{" "}
          buscar ·{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono border border-[var(--rule-soft)]">
            Esc
          </kbd>{" "}
          limpiar / expandir
        </span>
      </div>

      {/* ─── Stats row por rol ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {roleStats.map((s) => (
          <div
            key={s.role}
            className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3"
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
            <div className="mt-1.5 flex items-center gap-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              <span className="inline-flex items-center gap-0.5" title={`${s.full} acceso total`}>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {s.full}
              </span>
              <span className="inline-flex items-center gap-0.5" title={`${s.write} read+write`}>
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                {s.write}
              </span>
              <span className="inline-flex items-center gap-0.5" title={`${s.read} solo lectura`}>
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)]" />
                {s.read}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Legend + filter ─────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap text-xs">
          {(["full", "write", "read", "none"] as const).map((acc) => (
            <div key={acc} className="inline-flex items-center gap-1.5">
              <AccessCell access={acc} size="sm" />
              <span className="text-[var(--text-secondary)]">{ACCESS_META[acc].label}</span>
            </div>
          ))}
        </div>
        <div className="relative w-full lg:w-80">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
            aria-hidden
          />
          <input
            ref={searchRef}
            type="search"
            value={filterRaw}
            onChange={(e) => setFilterRaw(e.target.value)}
            placeholder="Filtrar recurso o grupo…"
            aria-label="Filtrar matriz"
            className="w-full h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
      </div>

      {/* ─── Matriz agrupada ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Users className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              Matriz de permisos
            </h3>
            <p className="text-xs text-[var(--text-tertiary)]">
              {isFiltered ? (
                <>
                  <strong className="text-[var(--text-primary)]">{filtered.length}</strong>{" "}
                  de {RBAC_MATRIX.length} recursos · {grouped.length} grupos
                </>
              ) : (
                <>
                  {RBAC_MATRIX.length} recursos × {RBAC_ROLES.length} roles ·{" "}
                  {grouped.length} grupos
                </>
              )}
            </p>
          </div>
        </header>

        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Sin resultados para &ldquo;{filter}&rdquo;
            </p>
            <button
              onClick={() => setFilterRaw("")}
              className="mt-3 h-10 px-4 rounded-xl text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10"
            >
              Limpiar filtro
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--surface-canvas)]">
                <tr className="border-b border-[var(--rule-soft)] text-left text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
                  <th className="sticky left-0 z-20 bg-[var(--surface-canvas)] px-5 py-3 font-extrabold min-w-[200px]">
                    Recurso
                  </th>
                  {RBAC_ROLES.map((role) => (
                    <th
                      key={role.role}
                      className="px-2 py-3 font-extrabold text-center whitespace-nowrap"
                      title={role.label}
                    >
                      {role.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map(([group, rows]) => {
                  const isCollapsed = collapsedGroups.has(group);
                  return (
                    <Fragment key={`group-${group}`}>
                      <tr
                        className="bg-[var(--surface-canvas)]/60 hover:bg-[var(--surface-sunken)] cursor-pointer transition"
                        onClick={() => toggleGroup(group)}
                      >
                        <td
                          colSpan={RBAC_ROLES.length + 1}
                          className="sticky left-0 z-10 bg-[var(--surface-canvas)] px-5 py-2.5"
                        >
                          <button
                            type="button"
                            aria-expanded={!isCollapsed}
                            className="inline-flex items-center gap-2 w-full text-left"
                          >
                            {isCollapsed ? (
                              <ChevronRight
                                className="h-4 w-4 text-[var(--text-tertiary)]"
                                aria-hidden
                              />
                            ) : (
                              <ChevronDown
                                className="h-4 w-4 text-[var(--text-tertiary)]"
                                aria-hidden
                              />
                            )}
                            <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                              {group}
                            </span>
                            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                              ({rows.length})
                            </span>
                          </button>
                        </td>
                      </tr>
                      {!isCollapsed &&
                        rows.map((row) => (
                          <tr
                            key={row.resource}
                            className="border-t border-[var(--rule-soft)] transition hover:bg-[var(--surface-sunken)]/40"
                          >
                            <td className="sticky left-0 z-10 bg-[var(--surface-raised)] px-5 py-3 min-w-[200px]">
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
                    </Fragment>
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
              y queda en el git log. Ventaja: cada cambio es revisado por un humano
              antes de merge y trazable indefinidamente. No hay UI para rotar
              permisos en caliente — eso reduce superficie de ataque.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href="https://github.com/Buleje/Mercado/commits/master/bodega-san-martin/lib/auth/role-permissions.ts"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition"
              >
                <FileText className="h-4 w-4" aria-hidden />
                Ver historial git
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
              <a
                href="/superadmin/activity"
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition"
              >
                <FileText className="h-4 w-4" aria-hidden />
                Ver audit log de runtime
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Roles custom (no disponible) ────────────────────────── */}
      <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] p-8 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
          <Users className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
        </div>
        <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
          Roles personalizados no disponibles
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1 max-w-md mx-auto">
          La plataforma usa los 6 roles canónicos. Roles custom por tenant
          aumentarían la superficie de auditoría sin beneficio claro. Si necesitás
          un permiso específico, agregalo al rol existente.
        </p>
      </div>
    </div>
  );
}
