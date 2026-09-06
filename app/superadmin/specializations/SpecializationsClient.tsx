"use client";

import { useState, useTransition } from "react";
import {
  Check,
  X,
  Loader2,
  AlertTriangle,
  Filter,
  Search,
  TreePine,
  Building2,
  Layers,
  Zap,
} from "@buleje/design-system/icons";
import type { Specialization, SpecializationKey } from "@/lib/specializations";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import { broadcastSpecsChanged } from "@/hooks/use-enabled-specs";
import { AdminTabShell } from "@/app/admin/_components/_shared";
import { SAStatChip } from "@/components/superadmin/_shared/SAStatChip";

interface TenantWithFlags {
  id: string;
  slug: string;
  name: string;
  industry: string;
  plan: string;
  flags: Record<string, boolean>;
}

interface Props {
  tenants: TenantWithFlags[];
  catalog: Specialization[];
}

export default function SpecializationsClient({
  tenants: initialTenants,
  catalog,
}: Props) {
  const [tenants, setTenants] = useState(initialTenants);
  const [search, setSearch] = useState("");
  const [verticalFilter, setVerticalFilter] = useState<string>("all");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const verticals = Array.from(new Set(catalog.map((c) => c.vertical)));

  const filteredTenants = tenants.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      t.industry.toLowerCase().includes(q)
    );
  });

  const visibleCatalog = catalog.filter(
    (c) => verticalFilter === "all" || c.vertical === verticalFilter,
  );

  async function toggle(tenantId: string, specKey: SpecializationKey, current: boolean) {
    const trackKey = `${tenantId}:${specKey}`;
    setPendingKey(trackKey);
    setError(null);

    try {
      // fetchSuperadmin: inyecta el header x-csrf-token (assertCsrf lo exige) y,
      // ante 401/403 (sesión de plataforma expirada por idle 30 min), redirige
      // solo al login en vez de dejar el error muerto "invalid or expired token".
      const res = await fetchSuperadmin("/api/superadmin/specializations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          specKey,
          enabled: !current,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }

      // Optimistic update
      startTransition(() => {
        setTenants((prev) =>
          prev.map((t) =>
            t.id === tenantId
              ? { ...t, flags: { ...t.flags, [specKey]: !current } }
              : t,
          ),
        );
      });

      // 2026-05-28 — Real-time sync: broadcast a todos los tabs admin del
      // mismo browser para que el sidebar refresque sin reload. Cross-browser
      // queda en visibilitychange (TTL 30s en el hook).
      broadcastSpecsChanged({
        tenantId,
        specKey,
        enabled: !current,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingKey(null);
    }
  }

  // Stats hero (KPIs derivadas)
  const totalEnabled = tenants.reduce(
    (acc, t) => acc + Object.values(t.flags).filter(Boolean).length,
    0,
  );
  const availableSpecs = catalog.filter((c) => c.status === "available").length;

  return (
    <AdminTabShell
      info={{
        what: "Activa módulos verticales (forestal CTP, salud, textil…) por cada negocio.",
        affects: "Aplica en tiempo real al panel admin del tenant: le aparecen los módulos de su vertical.",
        example: "Activás 'forestal' en una maderera → en su panel aparecen los módulos de trazabilidad de madera.",
      }}
      title="Especializaciones"
      kicker="Plataforma · Habilitación por tenant"
      description="Activa módulos verticales (forestal CTP, salud, textil) en cada negocio. Cambios aplican en tiempo real al panel admin del tenant."
      icon={TreePine}
      stats={
        <>
          <SAStatChip icon={Building2} label="Tenants" value={tenants.length} tone="sky" />
          <SAStatChip icon={Layers} label="Especializaciones" value={`${availableSpecs}/${catalog.length}`} hint="disponibles / total" tone="violet" />
          <SAStatChip icon={Zap} label="Activaciones" value={totalEnabled} tone="emerald" />
        </>
      }
    >
      {error && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-[var(--data-error-700)]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <strong>Error al togglear:</strong> {error}
          </div>
        </div>
      )}

      <div>
        {/* Filtros */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 h-12">
            <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tenant por nombre, slug o industry..."
              className="w-full bg-transparent outline-none text-base text-[var(--text-primary)]"
            />
          </div>
          <div className="flex items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 h-12">
            <Filter className="h-4 w-4 text-[var(--text-tertiary)]" />
            <select
              value={verticalFilter}
              onChange={(e) => setVerticalFilter(e.target.value)}
              className="bg-transparent text-base font-medium text-[var(--text-primary)] outline-none"
            >
              <option value="all">Todos los verticales</option>
              {verticals.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Catálogo summary */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visibleCatalog.map((spec) => {
            const enabledCount = tenants.filter((t) => t.flags[spec.key]).length;
            return (
              <div
                key={spec.key}
                className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[var(--text-primary)]">
                      {spec.name}
                    </p>
                    <p className="mt-0.5 text-xs uppercase tracking-wider text-[var(--text-tertiary)]">
                      {spec.vertical}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider ${
                      spec.status === "available"
                        ? "bg-[var(--data-success-100)] text-[var(--data-success-700)]"
                        : spec.status === "beta"
                          ? "bg-[#0d9488] text-[#0d9488]"
                          : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                    }`}
                  >
                    {spec.status === "available"
                      ? "Disponible"
                      : spec.status === "beta"
                        ? "Beta"
                        : "Próximamente"}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-[var(--text-secondary)]">
                  {spec.description}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-[var(--rule-soft)] pt-2">
                  <span className="text-xs text-[var(--text-tertiary)]">Activos</span>
                  <span className="text-sm font-bold text-[var(--text-primary)]">
                    {enabledCount} / {tenants.length}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Matriz tenants × specs */}
        <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-sunken)] text-left">
              <tr>
                <th className="sticky left-0 z-10 bg-[var(--surface-sunken)] px-4 py-3 font-bold text-[var(--text-primary)]">
                  Tenant
                </th>
                {visibleCatalog.map((spec) => (
                  <th
                    key={spec.key}
                    className="px-4 py-3 text-center font-bold text-[var(--text-primary)]"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span>{spec.name}</span>
                      <span className="text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
                        {spec.vertical}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTenants.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-[var(--rule-soft)] hover:bg-[var(--surface-canvas)]/40"
                >
                  <td className="sticky left-0 z-10 bg-[var(--surface-raised)] px-4 py-3">
                    <div className="font-bold text-[var(--text-primary)]">{t.name}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">
                      {t.slug} · {t.industry} · {t.plan}
                    </div>
                  </td>
                  {visibleCatalog.map((spec) => {
                    const enabled = !!t.flags[spec.key];
                    const trackKey = `${t.id}:${spec.key}`;
                    const isPending = pendingKey === trackKey;
                    const isDisabledByStatus = spec.status === "coming-soon";

                    return (
                      <td key={spec.key} className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={isPending || isDisabledByStatus}
                          onClick={() =>
                            toggle(t.id, spec.key, enabled)
                          }
                          aria-label={`${enabled ? "Deshabilitar" : "Habilitar"} ${spec.name} en ${t.name}`}
                          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                            isDisabledByStatus
                              ? "cursor-not-allowed bg-[var(--surface-sunken)]"
                              : enabled
                                ? "bg-[var(--data-success-500)] hover:bg-[var(--data-success-600)]"
                                : "bg-[var(--rule-base)] hover:bg-[var(--text-tertiary)]"
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                              enabled ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                          {isPending && (
                            <Loader2
                              className="absolute inset-0 m-auto h-4 w-4 animate-spin text-white"
                              aria-hidden
                            />
                          )}
                        </button>
                        {enabled && !isPending && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-success-700)]">
                            <Check className="h-3 w-3" />
                            ON
                          </div>
                        )}
                        {!enabled && !isPending && !isDisabledByStatus && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
                            <X className="h-3 w-3" />
                            OFF
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredTenants.length === 0 && (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-12 text-center text-[var(--text-tertiary)]">
            Sin tenants que coincidan con la búsqueda.
          </div>
        )}
      </div>
    </AdminTabShell>
  );
}
