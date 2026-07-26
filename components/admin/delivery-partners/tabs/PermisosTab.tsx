"use client";
import { useState, useEffect, useCallback } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, CheckCircle, RefreshCw, Shield, Star, Truck, Users, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import { TableSkeleton } from "@/components/admin/delivery-partners/shared";

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

  // Derivados para KPIs
  const userTypes = Array.from(new Set(permissions.map((p) => p.userType)));
  const filtered = filterUserType === "all"
    ? permissions
    : permissions.filter((p) => p.userType === filterUserType);
  const adminsCount = permissions.filter((p) => p.userType === "admin").length;
  const cajerosCount = permissions.filter((p) => p.userType === "cajero").length;
  const deliveryCount = permissions.filter((p) => p.userType === "delivery").length;
  const totalGrants = permissions.reduce((acc, p) => acc + p.permissions.length, 0);

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-3 p-4 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-2xl text-sm text-[var(--data-error-500)]">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="font-bold">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto p-1 rounded-lg hover:bg-[var(--data-error-100)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── 1. Hero card con KPIs ──────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
              <Shield className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Permisos de tienda
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                {permissions.length === 0
                  ? "No hay permisos configurados todavía. Asigná accesos granulares por usuario."
                  : `${permissions.length} ${permissions.length === 1 ? "usuario" : "usuarios"} con accesos · ${totalGrants} ${totalGrants === 1 ? "permiso otorgado" : "permisos otorgados"}.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-[var(--surface-sunken)] text-[var(--text-primary)] text-sm font-bold hover:brightness-95 border border-[var(--rule-base)] transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refrescar
          </button>
        </div>

        {permissions.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Total usuarios
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight mt-2">
                {permissions.length}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Con accesos</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Shield className="h-5 w-5 text-primary" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Admins
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-primary leading-tight mt-2">
                {adminsCount}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Acceso total</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--data-warning-100)]">
                  <Star className="h-5 w-5 text-[var(--data-warning-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Cajeros
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--data-warning-500)] leading-tight mt-2">
                {cajerosCount}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Operativos</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Truck className="h-5 w-5 text-[var(--data-success-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Delivery
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--data-success-500)] leading-tight mt-2">
                {deliveryCount}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Repartidores</p>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Leyenda de permisos ─────────────────────────────────── */}
      {permissions.length > 0 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-5 sm:p-6 shadow-sm">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
            Permisos disponibles
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {PERMISSION_TYPES.map((perm) => {
              const meta = PERMISSION_LABELS[perm];
              return (
                <div key={perm} className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4">
                  <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                    {meta.label}
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1 leading-snug">
                    {meta.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. Filtros por tipo de usuario ─────────────────────────── */}
      {permissions.length > 0 && userTypes.length > 1 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mr-2">
              Filtrar por tipo
            </span>
            <button
              type="button"
              onClick={() => setFilterUserType("all")}
              className={cn(
                "inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold transition-colors border",
                filterUserType === "all"
                  ? "bg-primary text-white border-primary"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              Todos
              <span className={cn(
                "inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-extrabold tabular-nums",
                filterUserType === "all" ? "bg-white/25" : "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
              )}>
                {permissions.length}
              </span>
            </button>
            {userTypes.map((ut) => {
              const count = permissions.filter((p) => p.userType === ut).length;
              const meta = USER_TYPE_LABELS[ut] ?? { label: ut, bg: "bg-[var(--surface-sunken)]", text: "text-[var(--text-secondary)]" };
              return (
                <button
                  key={ut}
                  type="button"
                  onClick={() => setFilterUserType(ut)}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold transition-colors border",
                    filterUserType === ut
                      ? "bg-primary text-white border-primary"
                      : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
                  )}
                >
                  {meta.label}
                  <span className={cn(
                    "inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-extrabold tabular-nums",
                    filterUserType === ut ? "bg-white/25" : "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 4. Cards de usuarios / Empty / Loading ─────────────────── */}
      {loading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-12 text-center shadow-sm">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-4">
            <Shield className="h-8 w-8 text-[var(--text-tertiary)]" />
          </span>
          <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">
            {permissions.length === 0 ? "Sin permisos configurados" : "Sin coincidencias"}
          </p>
          <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
            {permissions.length === 0
              ? "Cuando otorgues accesos a usuarios sobre tu tienda, aparecerán acá con detalle por permiso."
              : "Cambiá el filtro para ver permisos de otro tipo."}
          </p>
        </div>
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
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
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
                          "inline-flex items-center justify-between gap-2 px-4 h-11 rounded-xl text-sm font-bold transition-colors border-2",
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

