"use client";

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
  X,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  admin: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  cajero: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  almacenero: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
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
        headers: { "Content-Type": "application/json" },
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
    if (!confirm(`¿Eliminar al usuario "${u.name}"?`)) return;
    const res = await fetch(`/api/admin-users?id=${u.id}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Usuario eliminado");
      fetchUsers();
    } else {
      showToast("No se pudo eliminar", false);
    }
  };

  const handleToggleActive = async (u: AdminUser) => {
    const res = await fetch("/api/admin-users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, active: !u.active }),
    });
    if (res.ok) fetchUsers();
  };

  return (
    <div className="space-y-6 p-1">
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium",
            toast.ok
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          )}
        >
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Equipo de la tienda</h2>
          <span className="text-xs text-muted bg-(--color-surface) px-2 py-0.5 rounded-full">
            {users.length} usuario{users.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 bg-primary hover:opacity-90 text-white text-sm font-semibold px-3 py-1.5 rounded-xl"
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
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
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
                "flex items-center justify-between gap-3 p-4 rounded-2xl border transition-opacity",
                u.active
                  ? "bg-(--color-card) border-(--color-card-border)"
                  : "opacity-50 bg-(--color-surface) border-(--color-card-border)"
              )}
            >
              {/* Avatar + info */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0">
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
                  {u.active ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => openEdit(u)}
                  className="p-1.5 rounded-lg hover:bg-(--color-surface) text-muted hover:text-foreground"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(u)}
                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-muted hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-(--color-card) rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            {/* Modal header */}
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">
                {editingId ? "Editar usuario" : "Nuevo usuario"}
              </h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-(--color-surface)">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Username (only on create) */}
            {!editingId && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted uppercase">Usuario</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
                  placeholder="ej: cajero1"
                  className="w-full border border-(--color-card-border) rounded-xl px-3 py-2 text-sm bg-(--color-surface)"
                />
              </div>
            )}

            {/* Name */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted uppercase">Nombre completo</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ej: María García"
                className="w-full border border-(--color-card-border) rounded-xl px-3 py-2 text-sm bg-(--color-surface)"
              />
            </div>

            {/* Role */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted uppercase">Rol</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className="w-full border border-(--color-card-border) rounded-xl px-3 py-2 text-sm bg-(--color-surface)"
              >
                <option value="admin">Administrador — acceso total</option>
                <option value="cajero">Cajero — POS + pedidos</option>
                <option value="almacenero">Almacenero — inventario + compras</option>
              </select>
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted uppercase">
                Contraseña {editingId && <span className="font-normal">(deja vacío para no cambiar)</span>}
              </label>
              <div className="relative">
                <input
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
            </div>

            {/* Active toggle (only on edit) */}
            {editingId && (
              <label className="flex items-center gap-2 cursor-pointer">
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
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-xl border border-(--color-card-border) text-sm font-medium hover:bg-(--color-surface)"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editingId ? "Guardar cambios" : "Crear usuario"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

