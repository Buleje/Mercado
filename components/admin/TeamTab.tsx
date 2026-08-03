"use client";

import { LoadingState, SectionTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Field } from '@/components/admin/shared/Field';
import { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  Pencil,
  Trash2,
  ShieldCheck,
  ShoppingCart,
  Package,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useUndoToast } from "@/components/admin/shared/UndoToast";
import { csrfHeaders } from "@/lib/csrf-client";

type Role = "admin" | "cajero" | "almacenero";

interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  cajero: "Cajero",
  almacenero: "Almacenero",
};

const ROLE_ICONS: Record<Role, React.ReactNode> = {
  admin: <ShieldCheck className="w-3.5 h-3.5" />,
  cajero: <ShoppingCart className="w-3.5 h-3.5" />,
  almacenero: <Package className="w-3.5 h-3.5" />,
};

const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  cajero: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]",
  almacenero: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/40 dark:text-[var(--data-warning-500)]",
};

interface FormData {
  username: string;
  name: string;
  role: Role;
  password: string;
  active: boolean;
}

const EMPTY_FORM: FormData = {
  username: "",
  name: "",
  role: "cajero",
  password: "",
  active: true,
};

export default function TeamTab() {
  const { confirm } = useConfirm();
  const { showUndo } = useUndoToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin-users");
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowPassword(false);
    setShowForm(true);
  };

  const openEdit = (u: AdminUser) => {
    setEditingId(u.id);
    setForm({ username: u.username, name: u.name, role: u.role, password: "", active: u.active });
    setShowPassword(false);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return showToast("El nombre es requerido", false);
    if (!editingId && !form.password) return showToast("La contraseña es requerida", false);
    if (form.password && form.password.length < 6)
      return showToast("Contraseña mínima: 6 caracteres", false);

    setSaving(true);
    try {
      const body = editingId
        ? {
            id: editingId,
            name: form.name,
            role: form.role,
            active: form.active,
            ...(form.password ? { password: form.password } : {}),
          }
        : { username: form.username, name: form.name, role: form.role, password: form.password };

      const res = await fetch("/api/admin-users", {
        method: editingId ? "PATCH" : "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");

      showToast(editingId ? "Usuario actualizado" : "Usuario creado");
      setShowForm(false);
      fetchUsers();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: AdminUser) => {
    const ok = await confirm({
      title: "¿Eliminar usuario?",
      description: `"${u.name}" perderá acceso al panel inmediatamente. Sus registros de actividad se mantienen.`,
      intent: "danger",
      confirmLabel: "Eliminar acceso",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin-users?id=${u.id}`, { method: "DELETE", headers: csrfHeaders() });
    if (res.ok) {
      showUndo({ message: `Usuario "${u.name}" eliminado`, duration: 5000 });
      fetchUsers();
    } else {
      showToast("No se pudo eliminar", false);
    }
  };

  const handleToggleActive = async (u: AdminUser) => {
    const res = await fetch("/api/admin-users", {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: u.id, active: !u.active }),
    });
    if (res.ok) fetchUsers();
  };

  return (
    <div className="space-y-3 sm:space-y-6 p-1">
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed top-4 right-4 z-50 flex items-center gap-2 px-2 sm:px-4 py-2 sm:py-3 rounded-xl text-sm font-medium",
            toast.ok
              ? "bg-primary/10 text-white"
              : "bg-[var(--data-error-500)] text-white"
          )}
        >
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <SectionTitle className="text-lg font-bold">Equipo de la tienda</SectionTitle>
          <span className="text-xs text-muted bg-(--color-surface) px-2 py-0.5 rounded-full">
            {users.length} usuario{users.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 bg-primary hover:opacity-90 text-white text-sm font-semibold px-3 py-1.5 rounded-lg"
        >
          <UserPlus className="w-4 h-4" />
          Agregar
        </button>
      </div>

      {/* Role legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {(["admin", "cajero", "almacenero"] as Role[]).map((r) => (
          <span key={r} className={cn("flex items-center gap-1 px-2 py-1 rounded-lg font-medium", ROLE_COLORS[r])}>
            {ROLE_ICONS[r]} {ROLE_LABELS[r]}
          </span>
        ))}
      </div>

      {/* User list */}
      {loading ? (
        <LoadingState />
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-muted text-sm">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
          No hay usuarios aún. Agrega el primer miembro del equipo.
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className={cn(
                "flex items-center justify-between gap-3 p-4 rounded-xl border transition-opacity",
                u.active
                  ? "bg-(--color-card) border-(--color-card-border)"
                  : "opacity-50 bg-(--color-surface) border-(--color-card-border)"
              )}
            >
              {/* Avatar + info */}
              <div className="flex flex-wrap items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] font-bold text-sm flex items-center justify-center shrink-0">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{u.name}</p>
                  <p className="text-xs text-muted">@{u.username}</p>
                </div>
              </div>

              {/* Role badge */}
              <span className={cn("flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium shrink-0", ROLE_COLORS[u.role])}>
                {ROLE_ICONS[u.role]} {ROLE_LABELS[u.role]}
              </span>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggleActive(u)}
                  title={u.active ? "Desactivar" : "Activar"}
                  className="p-1.5 rounded-lg hover:bg-(--color-surface) text-muted hover:text-foreground"
                >
                  {u.active ? <CheckCircle2 className="w-4 h-4 text-[var(--data-success-500)]" /> : <XCircle className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => openEdit(u)}
                  className="p-1.5 rounded-lg hover:bg-(--color-surface) text-muted hover:text-foreground"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(u)}
                  className="p-1.5 rounded-lg hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20 text-muted hover:text-[var(--data-error-500)]"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit form modal */}
      <AdminModal open={showForm} onClose={() => setShowForm(false)} title={editingId ? "Editar usuario" : "Nuevo usuario"} variant="default">
        <div className="p-5 space-y-4">
            {/* Username (only on create) */}
            {!editingId && (
              <Field label="Usuario" labelClassName="text-xs font-semibold text-muted uppercase" className="space-y-1">
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
                  placeholder="ej: cajero1"
                  className="w-full border border-(--color-card-border) rounded-xl px-3 py-2 text-sm bg-(--color-surface)"
                />
              </Field>
            )}

            {/* Name */}
            <Field label="Nombre completo" labelClassName="text-xs font-semibold text-muted uppercase" className="space-y-1">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ej: María García"
                className="w-full border border-(--color-card-border) rounded-xl px-3 py-2 text-sm bg-(--color-surface)"
              />
            </Field>

            {/* Role */}
            <Field label="Rol" labelClassName="text-xs font-semibold text-muted uppercase" className="space-y-1">
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className="w-full border border-(--color-card-border) rounded-xl px-3 py-2 text-sm bg-(--color-surface)"
              >
                <option value="admin">Administrador — acceso total</option>
                <option value="cajero">Cajero — POS + pedidos</option>
                <option value="almacenero">Almacenero — inventario + compras</option>
              </select>
            </Field>

            {/* Password */}
            <Field
              label={<>Contraseña {editingId && <span className="font-normal">(deja vacío para no cambiar)</span>}</>}
              labelClassName="text-xs font-semibold text-muted uppercase"
              className="space-y-1"
            >
              {(id) => (
                <div className="relative">
                  <input
                    id={id}
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editingId ? "Nueva contraseña (opcional)" : "Mínimo 6 caracteres"}
                    className="w-full border border-(--color-card-border) rounded-xl px-3 py-2 text-sm bg-(--color-surface) pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </Field>

            {/* Active toggle (only on edit) */}
            {editingId && (
              <label className="flex flex-wrap items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Usuario activo</span>
              </label>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-lg border border-(--color-card-border) text-sm font-medium hover:bg-(--color-surface)"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editingId ? "Guardar cambios" : "Crear usuario"}
              </button>
            </div>
        </div>
      </AdminModal>
    </div>
  );
}

