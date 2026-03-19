"use client";

import { useState, useEffect } from "react";
import {
  UserCog, Plus, Pencil, Trash2, KeyRound, X, Check,
  Loader2, ShieldCheck, ShieldAlert, ShieldOff, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AdminUserRow = {
  id: string;
  username: string;
  role: string;
  name: string;
  active: boolean;
  createdAt: string;
};

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  admin: { label: "Administrador", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: ShieldCheck },
  cajero: { label: "Cajero", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: ShieldAlert },
  almacenero: { label: "Almacenero", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: ShieldOff },
};

type FormMode = "create" | "edit-info" | "reset-password" | null;

const EMPTY_FORM = { username: "", password: "", role: "cajero" as string, name: "", active: true };

export default function AdminUsersTab() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showPw, setShowPw] = useState(false);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Initial load via effect — uses .then() chain to avoid React Compiler setState-in-effect warning
  useEffect(() => {
    let active = true;
    fetch("/api/admin-users")
      .then(r => r.ok ? r.json() : null)
      .then((data: AdminUserRow[] | null) => {
        if (active && data) setUsers(data);
        if (active) setLoading(false);
      })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Silent refresh after mutations (no loading spinner; user is mid-action)
  async function refresh() {
    try {
      const res = await fetch("/api/admin-users");
      if (res.ok) setUsers(await res.json());
    } catch { /* silent */ }
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setSelectedUser(null);
    setFormMode("create");
    setError(null);
  }

  function openEditInfo(u: AdminUserRow) {
    setForm({ ...EMPTY_FORM, role: u.role, name: u.name, active: u.active });
    setSelectedUser(u);
    setFormMode("edit-info");
    setError(null);
  }

  function openResetPw(u: AdminUserRow) {
    setForm({ ...EMPTY_FORM });
    setSelectedUser(u);
    setFormMode("reset-password");
    setError(null);
  }

  function closeForm() {
    setFormMode(null);
    setSelectedUser(null);
    setError(null);
    setShowPw(false);
  }

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password,
          role: form.role,
          name: form.name.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : JSON.stringify(data.error?.formErrors ?? data.error);
        setError(msg);
      } else {
        await refresh();
        closeForm();
        flash(`Usuario "${data.username}" creado.`);
      }
    } catch { setError("Error de conexión."); }
    setSaving(false);
  }

  async function handleEditInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin-users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: form.role, name: form.name.trim(), active: form.active }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Error al guardar.");
      } else {
        await refresh();
        closeForm();
        flash("Usuario actualizado.");
      }
    } catch { setError("Error de conexión."); }
    setSaving(false);
  }

  async function handleResetPw(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    if (form.password.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin-users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Error al guardar.");
      } else {
        await refresh();
        closeForm();
        flash("Contraseña actualizada.");
      }
    } catch { setError("Error de conexión."); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin-users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "No se pudo eliminar.");
      } else {
        await refresh();
        flash("Usuario eliminado.");
      }
    } catch { setError("Error de conexión."); }
    setConfirmDeleteId(null);
    setDeleting(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground">Usuarios del Panel</h2>
          <p className="text-sm text-gray-500 dark:text-muted">Gestiona accesos, roles y contraseñas</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" /> Nuevo usuario
        </button>
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-semibold border border-emerald-200 dark:border-emerald-800">
          <Check className="h-4 w-4 shrink-0" /> {successMsg}
        </div>
      )}

      {/* Global error */}
      {error && !formMode && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm font-semibold border border-red-200 dark:border-red-800">
          <X className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Users list */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
          </div>
        ) : users.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-gray-400 dark:text-muted gap-2">
            <UserCog className="h-8 w-8" />
            <p className="text-sm">No hay usuarios registrados</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-card-border bg-gray-50 dark:bg-surface">
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Usuario</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide hidden sm:table-cell">Rol</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide hidden md:table-cell">Estado</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {users.map((u) => {
                const rc = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.cajero;
                const RoleIcon = rc.icon;
                return (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-primary font-extrabold text-sm">{u.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 dark:text-foreground">{u.name}</p>
                          <p className="text-xs text-gray-400 dark:text-muted">@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden sm:table-cell">
                      <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold", rc.color)}>
                        <RoleIcon className="h-3 w-3" /> {rc.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
                        u.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-500 dark:bg-surface dark:text-muted"
                      )}>
                        {u.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => openEditInfo(u)}
                          title="Editar usuario"
                          className="p-2 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-gray-700 dark:hover:text-foreground transition-colors"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openResetPw(u)}
                          title="Cambiar contraseña"
                          className="p-2 rounded-lg text-gray-400 dark:text-muted hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-600 transition-colors"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { setConfirmDeleteId(u.id); setError(null); }}
                          title="Eliminar usuario"
                          className="p-2 rounded-lg text-gray-400 dark:text-muted hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal: Create user ─────────────────────────────────────────────── */}
      {formMode === "create" && (
        <ModalWrapper title="Nuevo usuario" onClose={closeForm}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="Nombre completo">
              <input
                required minLength={1} maxLength={64}
                value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej. María García"
                className={inputCls}
              />
            </Field>
            <Field label="Usuario (login)">
              <input
                required minLength={3} maxLength={32} pattern="[a-z0-9_]+"
                title="Solo letras minúsculas, números y guión bajo"
                value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value.toLowerCase() }))}
                placeholder="Ej. maria_cajero"
                className={inputCls}
              />
            </Field>
            <Field label="Contraseña">
              <div className="relative">
                <input
                  required minLength={8} type={showPw ? "text" : "password"}
                  value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  className={cn(inputCls, "pr-10")}
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-muted hover:text-gray-600 transition-colors">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Field label="Rol">
              <RoleSelect value={form.role} onChange={v => setForm(p => ({ ...p, role: v }))} />
            </Field>
            <FormError msg={error} />
            <FormFooter onCancel={closeForm} saving={saving} label="Crear usuario" />
          </form>
        </ModalWrapper>
      )}

      {/* ── Modal: Edit info ───────────────────────────────────────────────── */}
      {formMode === "edit-info" && selectedUser && (
        <ModalWrapper title={`Editar — @${selectedUser.username}`} onClose={closeForm}>
          <form onSubmit={handleEditInfo} className="space-y-4">
            <Field label="Nombre completo">
              <input
                required minLength={1} maxLength={64}
                value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="Rol">
              <RoleSelect value={form.role} onChange={v => setForm(p => ({ ...p, role: v }))} />
            </Field>
            <Field label="Estado">
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, active: !p.active }))}
                className={cn(
                  "relative w-12 h-6 rounded-full transition-colors",
                  form.active ? "bg-emerald-500" : "bg-gray-300 dark:bg-surface"
                )}
              >
                <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform", form.active && "translate-x-6")} />
              </button>
              <span className="text-sm text-gray-600 dark:text-muted ml-2">{form.active ? "Activo" : "Inactivo"}</span>
            </Field>
            <FormError msg={error} />
            <FormFooter onCancel={closeForm} saving={saving} label="Guardar cambios" />
          </form>
        </ModalWrapper>
      )}

      {/* ── Modal: Reset password ──────────────────────────────────────────── */}
      {formMode === "reset-password" && selectedUser && (
        <ModalWrapper title={`Cambiar contraseña — @${selectedUser.username}`} onClose={closeForm}>
          <form onSubmit={handleResetPw} className="space-y-4">
            <Field label="Nueva contraseña">
              <div className="relative">
                <input
                  required minLength={8} type={showPw ? "text" : "password"}
                  value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  className={cn(inputCls, "pr-10")}
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-muted hover:text-gray-600 transition-colors">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <FormError msg={error} />
            <FormFooter onCancel={closeForm} saving={saving} label="Actualizar contraseña" />
          </form>
        </ModalWrapper>
      )}

      {/* ── Delete confirmation ────────────────────────────────────────────── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="font-extrabold text-gray-900 dark:text-foreground">Eliminar usuario</p>
                <p className="text-xs text-gray-500 dark:text-muted">Esta acción no se puede deshacer</p>
              </div>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => { setConfirmDeleteId(null); setError(null); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const inputCls = "w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-surface border border-gray-200 dark:border-card-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-600 dark:text-muted mb-1.5 uppercase tracking-wide">{label}</label>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      className={inputCls}
    >
      <option value="admin">Administrador</option>
      <option value="cajero">Cajero</option>
      <option value="almacenero">Almacenero</option>
    </select>
  );
}

function FormError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm border border-red-100 dark:border-red-800">
      <X className="h-4 w-4 shrink-0" /> {msg}
    </div>
  );
}

function FormFooter({ onCancel, saving, label }: { onCancel: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel}
        className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">
        Cancelar
      </button>
      <button type="submit" disabled={saving}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {label}
      </button>
    </div>
  );
}

function ModalWrapper({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border">
          <h3 className="font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            {title}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

