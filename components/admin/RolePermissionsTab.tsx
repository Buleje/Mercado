"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, Save, CheckCircle, RotateCcw, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

const ALL_TAB_IDS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "pos", label: "Punto de Venta" },
  { id: "inventario", label: "Inventario" },
  { id: "pedidos", label: "Pedidos" },
  { id: "proveedores", label: "Proveedores" },
  { id: "compras", label: "Compras" },
  { id: "cuentas", label: "Cuentas" },
  { id: "caja", label: "Caja" },
  { id: "clientes", label: "Clientes" },
  { id: "promociones", label: "Promociones" },
  { id: "reseñas", label: "Reseñas" },
  { id: "actividad", label: "Actividad" },
  { id: "cupones", label: "Cupones" },
  { id: "devoluciones", label: "Devoluciones" },
  { id: "reportes", label: "Reportes" },
  { id: "historial-precios", label: "Historial Precios" },
  { id: "prediccion", label: "Predicción IA" },
  { id: "entregas", label: "Entregas" },
  { id: "chat", label: "Chat Interno" },
  { id: "evaluaciones", label: "Evaluaciones" },
  { id: "fidelizacion", label: "Fidelización" },
  { id: "auto-reorden", label: "Auto-Reorden" },
  { id: "gastos", label: "Gastos" },
  { id: "combos", label: "Combos" },
  { id: "notificaciones", label: "Notificaciones" },
  { id: "pagina-inicio", label: "Página de Inicio" },
  { id: "categorias-editor", label: "Categorías" },
  { id: "combos-editor", label: "Editor Combos" },
  { id: "delivery-horarios", label: "Horarios Delivery" },
  { id: "metricas-conversion", label: "Métricas" },
  { id: "permisos-roles", label: "Permisos Roles" },
  { id: "configuracion", label: "Configuración" },
  { id: "usuarios-admin", label: "Usuarios Admin" },
  { id: "ab-tests", label: "A/B Testing" },
  { id: "encuestas", label: "Encuestas" },
  { id: "abc-analysis", label: "Análisis ABC" },
  { id: "clv", label: "CLV / Cohortes" },
  { id: "margenes", label: "Márgenes" },
  { id: "segmentos", label: "Segmentación" },
] as const;

const DEFAULT_ROLE_TABS: Record<string, string[]> = {
  cajero: ["dashboard", "pos", "caja", "pedidos", "clientes"],
  almacenero: ["dashboard", "inventario", "proveedores", "compras", "cuentas"],
};

type RolePerms = Record<string, string[]>;

export default function RolePermissionsTab() {
  const [perms, setPerms] = useState<RolePerms>(DEFAULT_ROLE_TABS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.rolePermissions) setPerms({ ...DEFAULT_ROLE_TABS, ...d.rolePermissions });
      })
      // Brandon 2026-05-16 (audit P1 regla 7): logger en lugar de silencio.
      .catch((err) => console.warn("[RolePermissionsTab] settings fetch failed:", err))
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ rolePermissions: perms }),
      });
      // [SECURITY F4] Verificar res.ok antes de marcar como guardado.
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Error al guardar permisos");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError("Error al guardar permisos de roles");
      console.error("Error saving role permissions:", e);
    } finally {
      setSaving(false);
    }
  }, [perms]);

  const toggle = (role: string, tabId: string) => {
    setPerms((prev) => {
      const current = prev[role] ?? [];
      const next = current.includes(tabId)
        ? current.filter((t) => t !== tabId)
        : [...current, tabId];
      return { ...prev, [role]: next };
    });
  };

  const selectAll = (role: string) => {
    setPerms((prev) => ({
      ...prev,
      [role]: ALL_TAB_IDS.map((t) => t.id),
    }));
  };

  const reset = (role: string) => {
    setPerms((prev) => ({
      ...prev,
      [role]: DEFAULT_ROLE_TABS[role] ?? [],
    }));
  };

  const roles = Object.keys(perms).filter((r) => r !== "admin");
  const [hasChanges, setHasChanges] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const handleToggle = (role: string, tabId: string) => {
    toggle(role, tabId);
    setHasChanges(true);
  };

  const handleSave = async () => {
    await save();
    setHasChanges(false);
  };

  const handleReset = (role: string) => {
    reset(role);
    setHasChanges(true);
  };

  if (loading) return <div className="text-center py-20 text-[var(--text-secondary)]">Cargando...</div>;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <SectionTitle className="text-base sm:text-xl font-bold text-white flex flex-wrap items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[var(--text-tertiary)]" />
          Permisos por Rol
        </SectionTitle>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-[var(--data-warning-500)] font-medium animate-pulse">Cambios sin guardar</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={cn(
              "flex items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-medium transition disabled:opacity-50",
              saved
                ? "bg-primary/10 text-white"
                : "bg-primary/10 hover:bg-primary/10 text-white"
            )}
          >
            {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? "Guardando..." : saved ? "Guardado!" : "Guardar cambios"}
          </button>
        </div>
      </div>

      <p className="text-sm text-[var(--text-tertiary)]">
        El rol <span className="text-white font-medium">admin</span> siempre tiene acceso total.
        Haz click en las celdas para activar/desactivar permisos.
      </p>

      {saveError && (
        <div className="flex items-center gap-2 bg-[var(--data-error-500)]/10 border border-[var(--data-error-500)]/20 rounded-xl p-3 text-sm text-[var(--data-error-500)]">
          <span>{saveError}</span>
          <button onClick={save} className="ml-auto text-xs font-bold hover:underline">Reintentar</button>
        </div>
      )}

      {/* Mejora 18: Matriz visual de permisos */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className="sticky left-0 z-10 bg-gray-900 px-3 py-2.5 text-left text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] w-36">
                  Modulo
                </th>
                {roles.map(role => (
                  <th key={role} className="px-2 py-2.5 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="px-2 py-0.5 rounded bg-[var(--text-primary)]/20 text-[var(--text-tertiary)] text-xs font-bold capitalize">{role}</span>
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{(perms[role] ?? []).length}/{ALL_TAB_IDS.length}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_TAB_IDS.map((tab, i) => (
                <tr key={tab.id} className={cn("border-b border-white/5 transition-colors", i % 2 === 0 ? "bg-white/[0.02]" : "")}>
                  <td className="sticky left-0 z-10 bg-gray-900 px-3 py-1.5 text-xs font-medium text-[var(--text-tertiary)] whitespace-nowrap">
                    {tab.label}
                  </td>
                  {roles.map(role => {
                    const checked = (perms[role] ?? []).includes(tab.id);
                    const cellKey = `${role}-${tab.id}`;
                    return (
                      <td key={role} className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => handleToggle(role, tab.id)}
                          onMouseEnter={() => setHoveredCell(cellKey)}
                          onMouseLeave={() => setHoveredCell(null)}
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-all duration-[var(--dur-fast)]",
                            checked
                              ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] hover:bg-primary/10 border border-[var(--data-success-500)]/30"
                              : "bg-[var(--data-error-500)]/10 text-[var(--data-error-500)]/50 hover:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)]/10"
                          )}
                          title={`${role} ${checked ? "tiene acceso a" : "NO tiene acceso a"} ${tab.label}`}
                        >
                          {checked ? (
                            <CheckCircle className="w-4 h-4" />
                          ) : (
                            <X className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {hoveredCell === cellKey && (
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] mt-0.5 capitalize">{role} {checked ? "puede ver" : "no ve"}</p>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Role action buttons */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-white/[0.02]">
          <div className="flex flex-wrap gap-2">
            {roles.map(role => (
              <div key={role} className="flex items-center gap-1">
                <button
                  onClick={() => { selectAll(role); setHasChanges(true); }}
                  className="text-[length:var(--ts-2xs)] px-2 py-1 bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] rounded hover:bg-primary/10 transition"
                >
                  Todo ({role})
                </button>
                <button
                  onClick={() => handleReset(role)}
                  className="text-[length:var(--ts-2xs)] px-2 py-1 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-500)] rounded hover:bg-[var(--data-warning-500)]/20 transition flex items-center gap-0.5"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> Reset
                </button>
              </div>
            ))}
          </div>
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{ALL_TAB_IDS.length} modulos</span>
        </div>
      </div>
    </div>
  );
}

