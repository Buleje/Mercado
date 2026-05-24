"use client";

/**
 * ComplianceTab — Ley 29733 (Perú) + OWASP Top 10.
 *
 * Mejoras 2026-05-24:
 *  - Toast inline reemplaza feedback alert persistente
 *  - Search debounced en checklists (controles + descripción)
 *  - CSV export de los 16 controles
 *  - Keyboard: / busca · Esc limpia
 *  - Tap targets ≥44px en filter tabs + CTAs
 *  - Tonos rose-700/dark:rose-300 correctos (3 sitios)
 *  - Tonos emerald correctos (sin var(--data-success-500))
 *  - ExportDialog: tap targets + tonos consistentes
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Scale,
  Shield,
  Search,
  Download,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type ComplianceStatus = "pass" | "partial" | "fail" | "na";

const STATUS_META: Record<
  ComplianceStatus,
  { label: string; icon: LucideIcon; cls: string; dot: string }
> = {
  pass: {
    label: "Cumple",
    icon: ShieldCheck,
    cls: "border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  partial: {
    label: "Parcial",
    icon: AlertTriangle,
    cls: "border-amber-300/60 bg-amber-50 text-amber-700 dark:border-amber-700/40 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  fail: {
    label: "No cumple",
    icon: XCircle,
    cls: "border-rose-300/60 bg-rose-50 text-rose-700 dark:border-rose-700/40 dark:bg-rose-500/15 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  na: {
    label: "N/A",
    icon: ClipboardCheck,
    cls: "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)]",
    dot: "bg-[var(--text-tertiary)]",
  },
};

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  status: ComplianceStatus;
}

const LEY_29733: ChecklistItem[] = [
  {
    id: "ley-01",
    title: "Art. 13 — Consentimiento informado",
    description: "El usuario acepta explícitamente el tratamiento de sus datos al registrarse.",
    status: "pass",
  },
  {
    id: "ley-02",
    title: "Art. 18 — Derecho de acceso",
    description: "Exportación de datos por DNI disponible vía skill gdpr-export.",
    status: "pass",
  },
  {
    id: "ley-03",
    title: "Art. 20 — Derecho de rectificación",
    description: "El cliente puede editar sus datos desde /cuenta/perfil.",
    status: "pass",
  },
  {
    id: "ley-04",
    title: "Art. 21 — Derecho de supresión",
    description: "Flujo de baja con retención legal de 5 años para facturación.",
    status: "partial",
  },
  {
    id: "ley-05",
    title: "Art. 24 — Seguridad de la información",
    description: "Aislamiento multi-tenant por tenantId + HTTPS obligatorio + audit log.",
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
    description: "ADRs documentados (68-75). Zona peligrosa marcada en CLAUDE.md.",
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
    description: "Scanner activo. 1 CVE medium pendiente (prisma 7.7 → 7.8).",
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
    description: "CI con lint + tsc + test + build. Dependency lockfile versionado.",
    status: "pass",
  },
  {
    id: "owasp-09",
    title: "A09 — Logging & Monitoring",
    description: "Audit log exhaustivo. Sentry integrado. SLO dashboard activo.",
    status: "pass",
  },
  {
    id: "owasp-10",
    title: "A10 — Server-Side Request Forgery",
    description: "Endpoints externos pasan por whitelist configurado en lib/env.ts.",
    status: "partial",
  },
];

const RETENTION_RULES = [
  { type: "Datos de cuenta", period: "Mientras la cuenta esté activa + 1 año" },
  { type: "Órdenes y facturas", period: "5 años (obligación SUNAT)" },
  { type: "Audit log", period: "2 años" },
  { type: "Logs de seguridad", period: "1 año" },
  { type: "Backups", period: "35 días rotativos" },
];

type FilterStatus = "all" | "pass" | "partial" | "fail";
type ToastTone = "success" | "error" | "info";
type Toast = { id: number; text: string; tone: ToastTone };

// ─── Helpers ────────────────────────────────────────────────────────────────

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportComplianceCSV() {
  const headers = ["Norma", "Control", "Descripción", "Estado"];
  const rows = [
    ...LEY_29733.map((i) => ["Ley 29733", i.title, i.description, i.status]),
    ...OWASP_TOP_10.map((i) => ["OWASP", i.title, i.description, i.status]),
  ];
  const csv =
    "﻿" +
    [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `compliance_checklist_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-bold shadow-lg backdrop-blur",
            t.tone === "success" && "bg-emerald-600 text-white",
            t.tone === "error" && "bg-rose-600 text-white",
            t.tone === "info" && "bg-slate-800 text-white",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ComplianceTab() {
  const [exportOpen, setExportOpen] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [searchRaw, setSearchRaw] = useState("");
  const [search, setSearch] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(1);
  const searchRef = useRef<HTMLInputElement>(null);

  const pushToast = useCallback((text: string, tone: ToastTone = "info") => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw), 150);
    return () => clearTimeout(t);
  }, [searchRaw]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select";
      if (e.key === "Escape" && !inField) {
        if (searchRaw) setSearchRaw("");
        else if (filter !== "all") setFilter("all");
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
  }, [searchRaw, filter]);

  const allItems = useMemo(() => [...LEY_29733, ...OWASP_TOP_10], []);
  const stats = useMemo(() => {
    const total = allItems.length;
    const pass = allItems.filter((i) => i.status === "pass").length;
    const partial = allItems.filter((i) => i.status === "partial").length;
    const fail = allItems.filter((i) => i.status === "fail").length;
    return { total, pass, partial, fail, percentage: Math.round((pass / total) * 100) };
  }, [allItems]);

  const filterItems = useCallback(
    (items: ChecklistItem[]) => {
      const q = search.trim().toLowerCase();
      return items.filter((i) => {
        if (filter !== "all" && i.status !== filter) return false;
        if (!q) return true;
        return (
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q)
        );
      });
    },
    [filter, search],
  );

  const leyFiltered = filterItems(LEY_29733);
  const owaspFiltered = filterItems(OWASP_TOP_10);
  const totalFiltered = leyFiltered.length + owaspFiltered.length;
  const isFiltered = filter !== "all" || search.trim() !== "";

  return (
    <div className="space-y-6">
      <Toasts toasts={toasts} />

      {/* ─── Hero compliance ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-0">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                <ClipboardCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                  Cumplimiento agregado
                </p>
                <h2 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Estado regulatorio
                </h2>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              {stats.pass} de {stats.total} controles en estado{" "}
              <strong className="text-emerald-700 dark:text-emerald-300">cumple</strong>.
              Los controles parciales requieren revisión del equipo legal.
            </p>
            {/* Progress bar */}
            <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)] flex">
              <div
                className="bg-emerald-500 transition-all duration-500"
                style={{ width: `${(stats.pass / stats.total) * 100}%` }}
                title={`${stats.pass} cumplen`}
              />
              <div
                className="bg-amber-500 transition-all duration-500"
                style={{ width: `${(stats.partial / stats.total) * 100}%` }}
                title={`${stats.partial} parciales`}
              />
              <div
                className="bg-rose-500 transition-all duration-500"
                style={{ width: `${(stats.fail / stats.total) * 100}%` }}
                title={`${stats.fail} no cumplen`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                {stats.pass} cumplen
              </span>
              <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                {stats.partial} parciales
              </span>
              <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                {stats.fail} no cumplen
              </span>
            </div>
          </div>
          <div className="flex items-center justify-center border-t md:border-t-0 md:border-l border-[var(--rule-soft)] bg-linear-to-br from-[var(--accent)]/5 via-transparent to-transparent p-8">
            <div className="text-center">
              <p className="font-display text-6xl font-extrabold tabular-nums tracking-tight text-[var(--accent)]">
                {stats.percentage}%
              </p>
              <p className="mt-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                Cumplimiento
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Action bar (filter + search + CSV) ──────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1 self-start">
          {(["all", "pass", "partial", "fail"] as const).map((f) => {
            const isActive = filter === f;
            const count =
              f === "all"
                ? stats.total
                : f === "pass"
                  ? stats.pass
                  : f === "partial"
                    ? stats.partial
                    : stats.fail;
            const label =
              f === "all" ? "Todos" : f === "pass" ? "Cumplen" : f === "partial" ? "Parciales" : "No cumplen";
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={isActive}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-sm font-bold transition",
                  isActive
                    ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
                )}
              >
                {label}
                <span
                  className={cn(
                    "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-[length:var(--ts-2xs)] font-extrabold tabular-nums",
                    isActive
                      ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                      : "bg-[var(--surface-canvas)] text-[var(--text-tertiary)]",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
              aria-hidden
            />
            <input
              ref={searchRef}
              type="search"
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              placeholder="Buscar control…"
              aria-label="Buscar control"
              className="w-full sm:w-64 h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
            />
          </div>
          <button
            onClick={exportComplianceCSV}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition"
          >
            <Download className="h-4 w-4" aria-hidden />
            CSV
          </button>
        </div>
      </div>

      {isFiltered && (
        <p className="text-xs text-[var(--text-tertiary)]">
          Mostrando{" "}
          <strong className="text-[var(--text-primary)]">{totalFiltered}</strong>{" "}
          de {stats.total} controles
        </p>
      )}

      {/* ─── Checklists side-by-side ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChecklistSection
          icon={Scale}
          eyebrow="Ley 29733 — Perú"
          title="Protección de datos personales"
          subtitle="Cumplimiento regulatorio Perú"
          items={leyFiltered}
        />
        <ChecklistSection
          icon={Shield}
          eyebrow="OWASP"
          title="OWASP Top 10 (2021)"
          subtitle="Controles de seguridad recomendados"
          items={owaspFiltered}
        />
      </div>

      {/* ─── Derecho de acceso (Art. 18) ─────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <FileDown className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                Derecho de acceso (Art. 18)
              </h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Genera un JSON con todos los datos personales de un cliente:
                pedidos, comentarios, direcciones, consentimientos y audit trail.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="shrink-0 inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-extrabold uppercase tracking-wider text-white shadow-md transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          >
            <FileDown className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Abrir flujo
          </button>
        </div>
      </section>

      {/* ─── Política de retención ───────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <ClipboardCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              Política de retención
            </h3>
            <p className="text-xs text-[var(--text-tertiary)]">
              Tiempo de conservación por tipo de dato
            </p>
          </div>
        </header>
        <ul className="divide-y divide-[var(--rule-soft)]">
          {RETENTION_RULES.map((r) => (
            <li
              key={r.type}
              className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-[var(--surface-sunken)]/50"
            >
              <p className="font-bold text-sm text-[var(--text-primary)]">{r.type}</p>
              <p className="text-xs font-semibold text-[var(--text-tertiary)]">
                {r.period}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-right">
        Atajos:{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono border border-[var(--rule-soft)]">
          /
        </kbd>{" "}
        buscar ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono border border-[var(--rule-soft)]">
          Esc
        </kbd>{" "}
        limpiar
      </p>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        onSuccess={(msg) => pushToast(msg, "success")}
        onError={(msg) => pushToast(msg, "error")}
      />
    </div>
  );
}

/* ───────────────────────── components ───────────────────────── */

function ChecklistSection({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  items,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  subtitle: string;
  items: ChecklistItem[];
}) {
  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
      <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
            {eyebrow}
          </p>
          <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
            {title}
          </h3>
          <p className="text-xs text-[var(--text-tertiary)]">{subtitle}</p>
        </div>
      </header>
      {items.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">
            Sin controles que coincidan con los filtros
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)]">
          {items.map((item) => {
            const meta = STATUS_META[item.status];
            const StatusIcon = meta.icon;
            return (
              <li key={item.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className={cn(
                        "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                        meta.cls,
                      )}
                    >
                      <StatusIcon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-[var(--text-primary)]">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                        {item.description}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider",
                      meta.cls,
                    )}
                  >
                    <span className={cn("h-1 w-1 rounded-full", meta.dot)} />
                    {meta.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ExportDialog({
  open,
  onOpenChange,
  onSuccess,
  onError,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
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
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-${tenantSlug.trim()}-${dni.trim()}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onSuccess(`Exportación descargada · ${a.download}`);
      onOpenChange(false);
      setTenantSlug("");
      setDni("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al generar export";
      setError(msg);
      onError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-md rounded-3xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] shadow-[var(--shadow-xl)] overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                <FileDown className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </span>
              <Dialog.Title className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                Exportar datos del cliente
              </Dialog.Title>
            </div>
            <Dialog.Close
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="p-5 space-y-3">
            <Dialog.Description className="text-xs text-[var(--text-tertiary)]">
              Genera un JSON con todos los datos personales del cliente. Acción
              auditada bajo Ley 29733 Art. 18-20.
            </Dialog.Description>
            <label className="block">
              <span className="block text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                Tenant slug *
              </span>
              <input
                ref={(el) => {
                  if (el && open) el.focus();
                }}
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="ej: bodega-rosita"
                className="w-full h-11 px-3 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="block">
              <span className="block text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                DNI / Documento del cliente *
              </span>
              <input
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                placeholder="ej: 12345678"
                className="w-full h-11 px-3 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            {error && (
              <p
                role="alert"
                className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-300"
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
            <Dialog.Close asChild>
              <button className="h-11 px-4 rounded-xl text-sm font-bold border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--rule-base)]">
                Cancelar
              </button>
            </Dialog.Close>
            <button
              onClick={submit}
              disabled={loading}
              className="inline-flex h-11 items-center gap-2 px-4 rounded-xl text-sm font-extrabold uppercase tracking-wider text-white bg-[var(--accent)] hover:brightness-110 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" strokeWidth={2.25} />
              )}
              Generar
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
