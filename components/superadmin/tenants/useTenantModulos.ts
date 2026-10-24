"use client";

import { useEffect, useMemo, useState } from "react";
import type { TenantRow } from "@/lib/superadmin-types";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import { ADMIN_MODULE_CATALOG, ADMIN_MODULE_CATEGORIES, fetchAdminTemplate, type AdminTemplate } from "@/lib/admin-template";
import { planIncludesTab } from "@/lib/billing/plan-tiers";
import { planIdToTier } from "@/lib/billing/plan-mapping";
import { SPEC_GATED_MODULE_IDS } from "@/hooks/use-enabled-specs";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import { csrfHeaders } from "@/lib/csrf-client";

/** Carga, edición y guardado de los módulos a medida de UNA tienda (overrides sobre la plantilla global). */
export function useTenantModulos(tenant: TenantRow, onClose: () => void, onSaved?: (count: number) => void) {
  const [globalTpl, setGlobalTpl] = useState<AdminTemplate | null>(null);
  /** Overrides en edición: tabId → visible forzado. Solo lo que difiere de la plantilla. */
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tenantTier = planIdToTier(tenant.plan);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [tpl, res] = await Promise.all([
          fetchAdminTemplate({ raw: true }),
          fetchSuperadmin(`/api/superadmin/tenants/${tenant.slug}/module-overrides`),
        ]);
        if (!alive) return;
        setGlobalTpl(tpl);
        if (res.ok) {
          const data = (await res.json()) as { overrides: Record<string, { visible: boolean }> };
          const flat: Record<string, boolean> = {};
          for (const [id, ov] of Object.entries(data.overrides ?? {})) {
            if (typeof ov?.visible === "boolean") flat[id] = ov.visible;
          }
          setDraft(flat);
        }
      } catch {
        if (alive) setError("No se pudo cargar la configuración");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tenant.slug]);

  /** Visible heredado de la plantilla global (sin override del tenant). */
  const inheritedVisible = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const m of ADMIN_MODULE_CATALOG) {
      const ov = globalTpl?.overrides[m.id];
      map[m.id] = ov?.visible ?? m.defaultVisible;
    }
    return map;
  }, [globalTpl]);

  const overrideCount = Object.keys(draft).length;

  /** ¿El módulo está dentro del plan del tenant (o es spec-gated)? */
  const isInPlan = (id: string) =>
    SPEC_GATED_MODULE_IDS.has(id) || planIncludesTab(tenantTier, id as Tab);

  /** Cuántos módulos verá efectivamente esta tienda (switch ON ∩ su plan). */
  const effectiveStats = useMemo(() => {
    let visible = 0;
    let inPlanTotal = 0;
    for (const m of ADMIN_MODULE_CATALOG) {
      if (!isInPlan(m.id)) continue;
      inPlanTotal++;
      if (draft[m.id] ?? inheritedVisible[m.id]) visible++;
    }
    return { visible, inPlanTotal };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, inheritedVisible, tenantTier]);

  /**
   * Activar TODO lo que el plan del tenant permite — Brandon 2026-06-05.
   * Spec-gated quedan fuera (su unlock real es la especialización, no esto).
   * Módulos que la plantilla ya muestra no necesitan override (se heredan).
   */
  const enableAllForPlan = () => {
    setDraft((prev) => {
      const next = { ...prev };
      for (const m of ADMIN_MODULE_CATALOG) {
        if (SPEC_GATED_MODULE_IDS.has(m.id)) continue;
        if (!planIncludesTab(tenantTier, m.id as Tab)) continue;
        if (inheritedVisible[m.id]) delete next[m.id];
        else next[m.id] = true;
      }
      return next;
    });
  };

  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (m: (typeof ADMIN_MODULE_CATALOG)[number]) => {
      if (!q) return true;
      const label = globalTpl?.overrides[m.id]?.label || m.defaultLabel;
      return (
        label.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
      );
    };
    const map = new Map<string, typeof ADMIN_MODULE_CATALOG>();
    for (const cat of ADMIN_MODULE_CATEGORIES) map.set(cat, []);
    for (const m of ADMIN_MODULE_CATALOG) {
      if (!matches(m)) continue;
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return [...map.entries()].filter(([, mods]) => mods.length > 0);
  }, [query, globalTpl]);

  const toggle = (id: string) => {
    const inherited = inheritedVisible[id];
    const effective = draft[id] ?? inherited;
    const next = !effective;
    setDraft((prev) => {
      const copy = { ...prev };
      // Si el nuevo valor coincide con lo heredado, el override sobra.
      if (next === inherited) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  };

  const restoreOne = (id: string) => {
    setDraft((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const save = async (overrides: Record<string, boolean>) => {
    setSaving(true);
    setError("");
    try {
      const body = {
        overrides: Object.fromEntries(
          Object.entries(overrides).map(([id, visible]) => [id, { visible }]),
        ),
      };
      const res = await fetchSuperadmin(`/api/superadmin/tenants/${tenant.slug}/module-overrides`, {
        method: "PUT",
        headers: csrfHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch((_e) => null)) as { error?: string } | null;
        setError(data?.error ?? `Error HTTP ${res.status}`);
        return;
      }
      onSaved?.(Object.keys(overrides).length);
      onClose();
    } catch {
      setError("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  };

  return {
    globalTpl, draft, loading, saving, error, tenantTier, inheritedVisible, overrideCount, isInPlan,
    effectiveStats, enableAllForPlan, query, setQuery, grouped, toggle, restoreOne, save,
  };
}

export type TenantModulos = ReturnType<typeof useTenantModulos>;
