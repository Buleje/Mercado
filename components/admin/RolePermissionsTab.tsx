"use client";

import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, Save, CheckCircle, RotateCcw } from "lucide-react";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.rolePermissions) setPerms({ ...DEFAULT_ROLE_TABS, ...d.rolePermissions });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rolePermissions: perms }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
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

  if (loading) return <div className="text-center py-20 text-gray-500">Cargando...</div>;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base sm:text-xl font-bold text-white flex flex-wrap items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-purple-400" />
          Permisos por Rol
        </h2>
        <button
          onClick={save}
          disabled={saving}
          className={`flex items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-medium transition ${
            saved
              ? "bg-green-600 text-white"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          } disabled:opacity-50`}
        >
          {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? "Guardando..." : saved ? "¡Guardado!" : "Guardar"}
        </button>
      </div>

      <p className="text-sm text-gray-400">
        El rol <span className="text-white font-medium">admin</span> siempre tiene acceso total.
        Configura qué pestañas pueden ver los otros roles.
      </p>

      {roles.map((role) => {
        const tabs = perms[role] ?? [];
        return (
          <div key={role} className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white capitalize flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-xs">
                  {role}
                </span>
                <span className="text-gray-500 text-xs font-normal">
                  {tabs.length} / {ALL_TAB_IDS.length} pestañas
                </span>
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => selectAll(role)}
                  className="text-xs px-2 py-1 bg-blue-500/10 text-blue-300 rounded hover:bg-blue-500/20 transition"
                >
                  Seleccionar todo
                </button>
                <button
                  onClick={() => reset(role)}
                  className="text-xs px-2 py-1 bg-amber-500/10 text-amber-300 rounded hover:bg-amber-500/20 transition flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Restaurar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {ALL_TAB_IDS.map((t) => {
                const checked = tabs.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-sm cursor-pointer transition ${
                      checked
                        ? "bg-blue-500/10 border-blue-500/30 text-white"
                        : "bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/10"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(role, t.id)}
                      className="accent-blue-500"
                    />
                    <span className="truncate">{t.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

