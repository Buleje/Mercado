"use client";

/**
 * Usuarios del panel (Configuración › Usuarios y acceso).
 *
 * Compactado el 11-10 (patrón del panel): una fila de cabecera con el conteo,
 * la leyenda de roles en el ⓘ y «Agregar usuario» de 48 px; cada usuario una
 * fila de una lista (antes, tarjetas sueltas de 78 px con tres íconos de 32 px);
 * «Editar» a la vista y lo demás en «⋯». Arreglos: el aviso de éxito era
 * blanco sobre turquesa al 10 % (no se leía) → toasts del panel; activar o
 * desactivar a alguien fallaba callado.
 */
import { LoadingState, CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Users, UserPlus, Pencil, Trash2, ShieldCheck, ShoppingCart, Package, MoreHorizontal, UserCheck, UserX } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useUndoToast } from "@/components/admin/shared/UndoToast";
import { csrfHeaders } from "@/lib/csrf-client";
import { NOMBRE_ROL, UsuarioForm, type FormUsuario, type RolUsuario } from "@/components/admin/settings/UsuarioForm";

/** El rol tal como viene de la base: además de los tres asignables hay encargado (`manager`), dueño… */
type Role = string;

interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

// Antes sólo tenía los tres asignables: «QA Encargado» (manager) salía con el rol en inglés.
const ROLE_LABELS: Record<Role, string> = NOMBRE_ROL;

const ROLE_ICONS: Record<RolUsuario, React.ReactNode> = {
  admin: <ShieldCheck className="w-3.5 h-3.5" aria-hidden />,
  cajero: <ShoppingCart className="w-3.5 h-3.5" aria-hidden />,
  almacenero: <Package className="w-3.5 h-3.5" aria-hidden />,
};

// Texto en -ink (texto semántico chico): el -500 sobre su tinte no llegaba a 4,5:1.
const ROLE_COLORS: Record<RolUsuario, string> = {
  admin: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  cajero: "bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]",
  almacenero: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)]",
};

type FormData = FormUsuario;

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
  const showToast = (msg: string, ok = true) => (ok ? toast.success(msg) : toast.error(msg));

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
    setShowForm(true);
  };

  const openEdit = (u: AdminUser) => {
    setEditingId(u.id);
    setForm({ username: u.username, name: u.name, role: u.role, password: "", active: u.active });
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
            // El rol sólo si cambió: editar a un encargado (manager, que la API no
            // asigna) fallaba con «Error al guardar» aunque sólo cambiaras el nombre.
            ...(form.role !== users.find((x) => x.id === editingId)?.role ? { role: form.role } : {}),
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
    if (res.ok) {
      toast.success(u.active ? `${u.name} ya no puede entrar` : `${u.name} puede entrar de nuevo`);
      fetchUsers();
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      toast.error(data.error ?? "No se pudo cambiar el acceso");
    }
  };

  const conteoRoles = new Map<string, number>();
  for (const u of users) conteoRoles.set(u.role, (conteoRoles.get(u.role) ?? 0) + 1);
  const porRol = [...conteoRoles].map(([r, n]) => `${n} ${(ROLE_LABELS[r] ?? r).toLowerCase()}`).join(" · ");

  return (
    <div className="space-y-3">
      {/* Cabecera en una fila: el título de la vista ya lo pone Configuración. */}
      <div className="flex flex-wrap items-center gap-2">
        <Users className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
        <CardTitle className="text-sm font-bold">{users.length} usuario{users.length !== 1 ? "s" : ""}</CardTitle>
        <InfoTip
          title="Roles"
          what="Administrador: todo el panel. Cajero: POS, caja y pedidos. Almacenero: inventario y compras. Encargado y dueño no se asignan desde aquí."
          example={loading ? undefined : porRol}
        />
        <button type="button" onClick={openCreate} className={button({ variant: "primary", className: "ml-auto rounded-xl" })}>
          <UserPlus className="h-4 w-4" aria-hidden /> Agregar usuario
        </button>
      </div>

      {loading ? (
        <LoadingState />
      ) : users.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-secondary)]">Todavía no hay usuarios: agrega al primero de tu equipo.</p>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] dark:divide-[var(--rule-base)]">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-3 sm:px-4">
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold", u.active ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]")} aria-hidden>
                {u.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-semibold", u.active ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>{u.name}</p>
                <p className="truncate text-sm text-[var(--text-secondary)]">@{u.username}{!u.active && " · sin acceso"}</p>
              </div>
              <span className={cn("hidden shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium sm:inline-flex", ROLE_COLORS[u.role as RolUsuario] ?? ROLE_COLORS.admin)}>
                {ROLE_ICONS[u.role as RolUsuario] ?? ROLE_ICONS.admin} {ROLE_LABELS[u.role] ?? u.role}
              </span>
              <button type="button" onClick={() => openEdit(u)} aria-label={`Editar a ${u.name}`} title="Editar" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
                <Pencil className="h-4 w-4" />
              </button>
              <ActionMenu
                label={`Más acciones de ${u.name}`}
                icon={MoreHorizontal}
                soloIcono
                size="md"
                className="w-12 shrink-0"
                actions={[
                  { id: "acceso", label: u.active ? "Quitarle el acceso" : "Devolverle el acceso", icon: u.active ? UserX : UserCheck, onSelect: () => handleToggleActive(u) },
                  { id: "eliminar", label: "Eliminar usuario", icon: Trash2, tone: "danger", onSelect: () => handleDelete(u) },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      <UsuarioForm
        open={showForm}
        editando={editingId !== null}
        form={form}
        setForm={setForm}
        guardando={saving}
        onGuardar={handleSave}
        onCerrar={() => setShowForm(false)}
      />
    </div>
  );
}
