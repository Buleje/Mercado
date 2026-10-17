"use client";

/**
 * Ventana «Nuevo usuario» / «Editar usuario» de Configuración › Usuarios y
 * acceso. Salió de `TeamTab` al compactarlo (11-10): campos de 48 px con
 * rótulo de 14 px (antes 40 px y rótulos en mayúsculas de 12), botones del DS
 * y el ojo de la contraseña con nombre para el lector de pantalla.
 */
import { useState } from "react";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Loader2 } from "@buleje/design-system/icons";
import { CLASE_CAMPO } from "./campos";

/** Los roles que se pueden dar desde aquí (`/api/admin-users` acepta estos tres). */
export type RolUsuario = "admin" | "cajero" | "almacenero";
/** `role` es texto: hay usuarios con roles que se dan por otro lado (encargado, dueño, analista). */
export interface FormUsuario { username: string; name: string; role: string; password: string; active: boolean }

/** Nombre a la vista de cada rol de sesión (`AdminRole` de lib/session). */
export const NOMBRE_ROL: Record<string, string> = {
  admin: "Administrador", cajero: "Cajero", almacenero: "Almacenero", manager: "Encargado",
  owner: "Dueño", tienda_owner: "Dueño de tienda", analista: "Analista", superadmin: "Superadmin",
  proveedor: "Proveedor", delivery: "Repartidor",
};
const ROLES_ASIGNABLES: readonly string[] = ["admin", "cajero", "almacenero"];

const ROTULO = "text-sm font-semibold text-[var(--text-secondary)]";

export function UsuarioForm({ open, editando, form, setForm, guardando, onGuardar, onCerrar }: {
  open: boolean;
  /** `true` = editar (sin usuario, contraseña opcional, con «activo»). */
  editando: boolean;
  form: FormUsuario;
  setForm: (f: FormUsuario) => void;
  guardando: boolean;
  onGuardar: () => void;
  onCerrar: () => void;
}) {
  const [verClave, setVerClave] = useState(false);
  return (
    <AdminModal
      open={open}
      onClose={onCerrar}
      title={editando ? "Editar usuario" : "Nuevo usuario"}
      variant="default"
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary", className: "flex-1 rounded-xl" })}>Cancelar</button>
          <button type="button" onClick={onGuardar} disabled={guardando} className={button({ variant: "primary", className: "flex-1 rounded-xl" })}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {editando ? "Guardar cambios" : "Crear usuario"}
          </button>
        </div>
      }
    >
      <div className={cn("space-y-3", MODAL_BODY)}>
        {!editando && (
          <Field label="Usuario" labelClassName={ROTULO} className="space-y-1">
            <input type="text" autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} placeholder="ej: cajero1" className={cn("w-full", CLASE_CAMPO)} />
          </Field>
        )}
        <Field label="Nombre completo" labelClassName={ROTULO} className="space-y-1">
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ej: María García" className={cn("w-full", CLASE_CAMPO)} />
        </Field>
        <Field label="Rol" labelClassName={ROTULO} className="space-y-1">
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={cn("w-full cursor-pointer", CLASE_CAMPO)}>
            {/* Un rol que no se da desde aquí (p. ej. encargado) se muestra y se conserva. */}
            {!ROLES_ASIGNABLES.includes(form.role) && <option value={form.role}>{NOMBRE_ROL[form.role] ?? form.role} — se queda como está</option>}
            <option value="admin">Administrador — acceso total</option>
            <option value="cajero">Cajero — POS y pedidos</option>
            <option value="almacenero">Almacenero — inventario y compras</option>
          </select>
        </Field>
        <Field label={<>Contraseña {editando && <span className="font-normal">(vacía = no cambia)</span>}</>} labelClassName={ROTULO} className="space-y-1">
          {(id) => (
            <div className="relative">
              <input
                id={id}
                type={verClave ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editando ? "Nueva contraseña (opcional)" : "Mínimo 6 caracteres"}
                className={cn("w-full pr-12", CLASE_CAMPO)}
              />
              <button
                type="button"
                onClick={() => setVerClave((v) => !v)}
                aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              >
                {verClave ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}
        </Field>
        {editando && (
          <label className="flex min-h-12 cursor-pointer items-center gap-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-5 w-5 rounded accent-[var(--accent)]" />
            <span className="text-sm text-[var(--text-primary)]">Usuario activo (puede entrar al panel)</span>
          </label>
        )}
      </div>
    </AdminModal>
  );
}
