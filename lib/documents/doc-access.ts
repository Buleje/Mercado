/**
 * Control de acceso a documentos por rol (capa ortogonal a la matriz RBAC de
 * `role-permissions.ts` — NO la reemplaza). Cada documento y carpeta puede
 * declarar `allowedRoles`; si está vacío lo ven todos los admins.
 */

/** Roles que ven TODOS los documentos, sin importar los permisos por doc/carpeta. */
export const DOC_PRIVILEGED_ROLES: readonly string[] = ["superadmin", "admin", "owner", "tienda_owner", "manager"];

/** Roles admin que pueden RESTRINGIRSE (aparecen como opciones en el editor de permisos). */
export const DOC_RESTRICTABLE_ROLES: { role: string; label: string }[] = [
  { role: "cajero", label: "Cajero" },
  { role: "almacenero", label: "Almacenero" },
  { role: "analista", label: "Analista" },
  { role: "delivery", label: "Repartidor" },
  { role: "proveedor", label: "Proveedor" },
];

export function isPrivilegedRole(role: string | undefined | null): boolean {
  return !!role && DOC_PRIVILEGED_ROLES.includes(role);
}

/**
 * ¿Puede un rol ver un documento?
 *  - roles privilegiados (dueño/admin/manager) → siempre sí
 *  - si allowedRoles del doc Y de su carpeta están vacíos → sí (todos los admins)
 *  - si no, el rol debe estar en el allowedRoles del doc (si tiene) Y en el de la carpeta (si tiene)
 */
export function canRoleSeeDoc(
  role: string | undefined | null,
  docAllowed: string[] = [],
  folderAllowed: string[] = [],
): boolean {
  if (isPrivilegedRole(role)) return true;
  if (!role) return false;
  const docOk = docAllowed.length === 0 || docAllowed.includes(role);
  const folderOk = folderAllowed.length === 0 || folderAllowed.includes(role);
  return docOk && folderOk;
}
