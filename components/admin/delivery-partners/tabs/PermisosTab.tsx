"use client";
import { useState, useEffect, useCallback } from "react";
import { AlertCircle, CheckCircle, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import { TableSkeleton } from "@/components/admin/delivery-partners/shared";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

interface StorePermission {
  id: string;
  storeId: string;
  storeName: string;
  userId: string;
  userType: string;
  userName: string;
  userEmail: string;
  permissions: string[];
  grantedBy: string;
  createdAt: string;
}

// ── Constants ──

const PERMISSION_TYPES = [
  "view_orders",
  "edit_status",
  "view_prices",
  "manage_products",
  "view_analytics",
] as const;
const PERMISSION_LABELS: Record<string, { label: string; short: string; description: string }> = {
  view_orders:     { label: "Ver órdenes",         short: "Órdenes",   description: "Ver listado de pedidos" },
  edit_status:     { label: "Editar estado",       short: "Estado",    description: "Cambiar estado de pedidos" },
  view_prices:     { label: "Ver precios",         short: "Precios",   description: "Acceso a tarifas y costos" },
  manage_products: { label: "Gestionar productos", short: "Productos", description: "Crear y editar inventario" },
  view_analytics:  { label: "Ver analytics",       short: "Analytics", description: "Acceso a reportes" },
};
const USER_TYPE_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  admin:    { label: "Admin",       bg: "bg-primary/10",                  text: "text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  cajero:   { label: "Cajero",      bg: "bg-[var(--data-warning-100)]",   text: "text-[var(--data-warning-500)]" },
  delivery: { label: "Delivery",    bg: "bg-primary/10",        text: "text-[var(--data-success-500)]" },
};


export function PermisosTab() {
  const [permissions, setPermissions] = useState<StorePermission[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [savingId, setSavingId]       = useState<string | null>(null);
  const [filterUserType, setFilterUserType] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await tenantFetch("/api/store-permissions");
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(`${r.status}: ${body.detail ?? body.error ?? "unknown"}`);
      }
      const d = await r.json();
      setPermissions(Array.isArray(d) ? d : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`No se pudieron cargar los permisos — ${msg}`);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const togglePermission = async (permId: string, perm: string) => {
    const target = permissions.find((p) => p.id === permId);
    if (!target) return;
    const has = target.permissions.includes(perm);
    const newPerms = has
      ? target.permissions.filter((p) => p !== perm)
      : [...target.permissions, perm];

    setSavingId(permId);
    setError(null);
    // Optimistic UI
    setPermissions((prev) =>
      prev.map((p) => (p.id === permId ? { ...p, permissions: newPerms } : p)),
    );

    try {
      const res = await tenantFetch(`/api/store-permissions/${permId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: newPerms }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      // Rollback
      setPermissions((prev) =>
        prev.map((p) => (p.id === permId ? { ...p, permissions: target.permissions } : p)),
      );
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error al actualizar permisos — ${msg}`);
    } finally {
      setSavingId(null);
    }
  };

  const userTypes = Array.from(new Set(permissions.map((p) => p.userType)));
  const filtered = filterUserType === "all"
    ? permissions
    : permissions.filter((p) => p.userType === filterUserType);
  const totalGrants = permissions.reduce((acc, p) => acc + p.permissions.length, 0);
  const etiquetaTipo = (ut: string) => USER_TYPE_LABELS[ut]?.label ?? ut;

  // 10-10: sin la tarjeta grande (título, párrafo, «Refrescar» y cuatro
  // cifras) ni la grilla «Permisos disponibles»: vive plegado bajo
  // Asignaciones, el título lo pone el plegable y la lista de permisos va en el ⓘ.
  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-3 py-1 pl-4 pr-1 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-2xl text-sm text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/10">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="font-bold">{error}</span>
          <button aria-label="Quitar"
            type="button"
            onClick={() => setError(null)}
            className="ml-auto inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-[var(--data-error-100)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-[var(--text-secondary)]">
          {permissions.length === 0
            ? "Nadie tiene permisos sobre tu tienda todavía."
            : `${permissions.length} ${permissions.length === 1 ? "usuario" : "usuarios"} · ${totalGrants} ${totalGrants === 1 ? "permiso" : "permisos"}`}
        </p>
        <InfoTip
          title="Permisos de tienda"
          what={PERMISSION_TYPES.map((perm) => `${PERMISSION_LABELS[perm].label}: ${PERMISSION_LABELS[perm].description.toLowerCase()}`).join(" · ")}
          affects="Toca un permiso de la tarjeta de cada usuario para darlo o quitarlo; se guarda al momento."
        />
        {userTypes.length > 1 && (
          <SegmentedControl<string>
            value={filterUserType}
            onChange={setFilterUserType}
            label="Qué usuarios ver"
            size="lg"
            className="ml-auto"
            options={[
              { value: "all", label: "Todos", badge: permissions.length },
              ...userTypes.map((ut) => ({ value: ut, label: etiquetaTipo(ut), badge: permissions.filter((p) => p.userType === ut).length })),
            ]}
          />
        )}
      </div>

      {/* ── 4. Cards de usuarios / Empty / Loading ─────────────────── */}
      {loading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        permissions.length === 0 ? null : (
          <p className="rounded-2xl border border-dashed border-[var(--rule-base)] px-4 py-6 text-center text-sm font-semibold text-[var(--text-secondary)]">
            Nadie de ese tipo: elige «Todos».
          </p>
        )
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const userMeta = USER_TYPE_LABELS[p.userType] ?? { label: p.userType, bg: "bg-[var(--surface-sunken)]", text: "text-[var(--text-secondary)]" };
            const initial = (p.userName || "?").trim().charAt(0).toUpperCase();
            const isSaving = savingId === p.id;
            return (
              <div
                key={p.id}
                className={cn(
                  "bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-5 sm:p-6 shadow-sm transition-opacity",
                  isSaving && "opacity-60",
                )}
              >
                <div className="flex items-start gap-4 mb-5 flex-wrap">
                  <div className={cn(
                    "h-12 w-12 rounded-2xl flex items-center justify-center text-lg font-extrabold shrink-0",
                    userMeta.bg, userMeta.text,
                  )}>
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                        {p.userName}
                      </p>
                      <span className={cn(
                        "inline-flex items-center px-3 py-1 rounded-full text-sm font-bold",
                        userMeta.bg, userMeta.text,
                      )}>
                        {userMeta.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
                      {p.userEmail && (
                        <span className="font-mono">{p.userEmail}</span>
                      )}
                      {p.storeName && p.storeName !== "—" && (
                        <span className="flex items-center gap-1.5 font-bold">
                          <span className="text-[var(--text-tertiary)]">Tienda:</span>
                          {p.storeName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-[var(--text-secondary)]">
                      Permisos
                    </p>
                    <p className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight mt-1">
                      {p.permissions.length}
                      <span className="text-base text-[var(--text-tertiary)] font-bold">/{PERMISSION_TYPES.length}</span>
                    </p>
                  </div>
                </div>

                {/* Toggles de permisos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pt-4 border-t border-[var(--rule-soft)]">
                  {PERMISSION_TYPES.map((perm) => {
                    const meta = PERMISSION_LABELS[perm];
                    const has = p.permissions.includes(perm);
                    return (
                      <button
                        key={perm}
                        type="button"
                        onClick={() => togglePermission(p.id, perm)}
                        disabled={isSaving}
                        title={meta.description}
                        className={cn(
                          "inline-flex items-center justify-between gap-2 px-4 h-12 rounded-xl text-sm font-semibold transition-colors border-2",
                          has
                            ? "bg-primary/10 border-[var(--data-success-500)]/40 text-[var(--data-success-500)]"
                            : "bg-[var(--surface-sunken)] border-[var(--rule-soft)] text-[var(--text-tertiary)] hover:border-primary/30 hover:text-[var(--text-secondary)]",
                          isSaving && "cursor-not-allowed",
                        )}
                      >
                        <span className="truncate">{meta.short}</span>
                        <span className={cn(
                          "inline-flex h-5 w-5 items-center justify-center rounded-full shrink-0",
                          has ? "bg-[var(--data-success-500)]" : "bg-transparent border border-[var(--rule-base)]",
                        )}>
                          {has && <CheckCircle className="h-4 w-4 text-white" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

