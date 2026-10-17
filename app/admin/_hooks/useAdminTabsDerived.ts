"use client";

/**
 * app/admin/_hooks/useAdminTabsDerived.ts
 *
 * Hook que centraliza los derivados de tabs: allowedTabs, filteredTabs,
 * favoriteTabItems y recentTabItems. Todos memoizados para evitar
 * re-cómputos en cada render.
 *
 * Extraído de app/admin/page.tsx (Sprint A del refactor —
 * ver docs/refactor-giant-files-plan.md).
 */

import { useMemo, useState } from "react";
import { ALL_TABS } from "../_lib/tab-data";
import type { Tab } from "../_lib/tabs.types";
import type { TabCategory } from "../_lib/tab-categories";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { useAdminTemplateOverlay } from "./useAdminTemplateOverlay";
import { useEnabledSpecs } from "@/hooks/use-enabled-specs";
import {
  SIN_FILTRO,
  idsDelPlan,
  idsDelRol,
  idsPermitidos,
  normalizarGuardadas,
  normalizarOcultas,
  pestanaPermitida,
  type ContextoPermiso,
} from "@/lib/admin/permiso-vista";

type Params = {
  userRole: string;
  savedRolePerms: Record<string, string[]> | null;
  hiddenTabs: Set<Tab>;
  visibleCategories: TabCategory[];
  sidebarSearch: string;
  favoriteTabs: Set<Tab>;
  recentTabs: Tab[];
  currentTab: Tab;
  fuzzyMatch: (text: string, query: string) => boolean;
};

/** Los ids que el panel sabe dibujar: contra esto se validan las preferencias guardadas. */
const IDS_DEL_PANEL: readonly string[] = ALL_TABS.map((t) => t.id);
const IDS_CONOCIDOS: ReadonlySet<string> = new Set(IDS_DEL_PANEL);

export function useAdminTabsDerived(params: Params) {
  const {
    userRole,
    savedRolePerms,
    hiddenTabs,
    sidebarSearch,
    favoriteTabs,
    recentTabs,
    currentTab,
    fuzzyMatch,
  } = params;

  // ── Plan tier filtering ─────────────────────────────────────────────────
  // Los tabs se intersectan con los desbloqueados por el plan actual.
  // Cambiar de plan dispara `buleje-plan-change` y este hook re-rendera
  // automáticamente — el sidebar se actualiza sin recargar.
  const { plan: planTier } = usePlanTier();

  // Override DEV-ONLY (localStorage admin_mode_dev_unlock="1"): bypasea el plan
  // gate para que el equipo vea TODOS los módulos al verificar Modo Avanzado.
  // Nunca afecta a un tenant que no haya puesto la key manualmente. Requiere
  // reload para cambiar (alineado con useAdminMode).
  const [devUnlock] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("admin_mode_dev_unlock") === "1"; } catch { return false; }
  });

  // ── Plantilla del superadmin (overlay) ──────────────────────────────────
  // Sobreescribe labels y filtra módulos marcados como no-visibles.
  // Se actualiza reactivamente vía buleje:admin-template-changed.
  const templateOverlay = useAdminTemplateOverlay();
  const { resolveLabel, isHiddenByTemplate } = templateOverlay;

  // ── Especializaciones habilitadas (ADR-124) ────────────────────────────
  // Tabs en SPEC_GATED_MODULE_IDS solo aparecen si la spec del tenant
  // está habilitada. Cache sessionStorage 5min, falla cerrado.
  const { enabledModuleIds: enabledSpecModuleIds } = useEnabledSpecs();

  // Aplica labels custom a ALL_TABS sin mutar el array original.
  const enhancedTabs = useMemo(
    () => ALL_TABS.map((t) => ({ ...t, label: resolveLabel(t.id, t.label) })),
    [resolveLabel],
  );

  // ── Permiso por vista (plan «panel unificado», regla R2) ────────────────
  // Las capas se arman acá y las decide `lib/admin/permiso-vista.ts`: una
  // pestaña se ve si ALGUNA de sus vistas pasa, evaluando cada vista sobre la
  // pestaña de donde vino. Mientras ninguna vista declare otro origen, eso es
  // exactamente lo de antes (lo prueba __tests__/panel-sin-perdida.test.ts).
  //
  // Rol: lo decide `tabsDelRol` (lib/module-permissions.ts). Hoy: admin ve todo;
  // cajero y almacenero, su lista por defecto (o la guardada en Ajustes);
  // cualquier otro rol sin lista guardada ve lo de admin, como siempre.
  const rolVe = useMemo(() => idsDelRol(userRole, savedRolePerms), [userRole, savedRolePerms]);
  // Plan: config, plan y mi-perfil pasan porque todos los planes los
  // desbloquean (el dueño gestiona su suscripción incluso en Básico). Los
  // SPEC-GATED (forestal, cacao…) se saltan el plan: su bandera ES el candado
  // (ADR-124); el gate real lo hace `enabledSpecModuleIds` más abajo.
  const planVe = devUnlock ? null : idsDelPlan(planTier);

  /** Rol + plan, por id: la base de todo lo demás. */
  const capaRolPlan = useMemo<ContextoPermiso>(
    () => ({ ...SIN_FILTRO, rol: rolVe, plan: planVe }),
    [rolVe, planVe],
  );

  // `allowedTabs` sigue siendo POR ID (sin unir vistas): la barra lo usa como la
  // capa de rol + plan de cada origen.
  const allowedTabs = useMemo(
    (): Tab[] => idsPermitidos(capaRolPlan, IDS_DEL_PANEL) as Tab[],
    [capaRolPlan],
  );

  // Ocultos del usuario: sólo los que siguen siendo pestaña (no siguen alias,
  // ver `normalizarOcultas`).
  const ocultos = useMemo(() => normalizarOcultas(hiddenTabs, IDS_CONOCIDOS), [hiddenTabs]);

  /** Menú del celular y Command Palette: rol + plan + plantilla + especialización (sin rubro, como siempre). */
  const capaMovil = useMemo<ContextoPermiso>(
    () => ({ ...capaRolPlan, plantilla: isHiddenByTemplate, especialidades: enabledSpecModuleIds }),
    [capaRolPlan, isHiddenByTemplate, enabledSpecModuleIds],
  );

  /** Favoritos y recientes: rol + plan + plantilla (nunca miraron la especialización). */
  const capaGuardadas = useMemo<ContextoPermiso>(
    () => ({ ...capaRolPlan, plantilla: isHiddenByTemplate }),
    [capaRolPlan, isHiddenByTemplate],
  );

  // Set base de módulos VISIBLES del negocio (rol + plan + ocultos + plantilla +
  // specs), SIN el narrowing por categoría/búsqueda del sidebar. Es "los módulos
  // que se tienen actuales" — lo usa el Command Palette (Brandon 2026-05-29).
  const visibleTabs = useMemo(
    () => enhancedTabs.filter((t) => !ocultos.has(t.id) && pestanaPermitida(capaMovil, t.id)),
    [enhancedTabs, ocultos, capaMovil],
  );

  const filteredTabs = useMemo(() => {
    let result = visibleTabs;

    // (El filtro por categoría se retiró junto con el selector "Todas las
    // categorías" del drawer: era el único que lo seteaba, así que quedaba
    // siempre en null y el filtro no hacía nada. Ahora se filtra por búsqueda.)

    // Fuzzy search en el sidebar
    if (sidebarSearch.trim()) {
      result = result.filter(t => fuzzyMatch(t.label, sidebarSearch.trim()));
    }

    return result;
  }, [visibleTabs, sidebarSearch, fuzzyMatch]);

  // Favoritos y recientes guardados pasan por `resolverDestino`: un id que dejó
  // de ser pestaña lleva a la que lo abre hoy en vez de perderse en silencio.
  const favoritas = useMemo(
    () => new Set(normalizarGuardadas(favoriteTabs, IDS_CONOCIDOS)),
    [favoriteTabs],
  );

  const favoriteTabItems = useMemo(
    () => enhancedTabs.filter((t) => favoritas.has(t.id) && pestanaPermitida(capaGuardadas, t.id)),
    [enhancedTabs, favoritas, capaGuardadas],
  );

  const recentTabItems = useMemo(
    () =>
      normalizarGuardadas(recentTabs, IDS_CONOCIDOS)
        .filter(
          id =>
            id !== currentTab &&
            !favoritas.has(id) &&
            pestanaPermitida(capaGuardadas, id),
        )
        .map(id => enhancedTabs.find(t => t.id === id))
        .filter((t): t is (typeof enhancedTabs)[number] => t !== undefined)
        .slice(0, 5),
    [enhancedTabs, recentTabs, currentTab, favoritas, capaGuardadas],
  );

  return { allowedTabs, filteredTabs, visibleTabs, favoriteTabItems, recentTabItems };
}
