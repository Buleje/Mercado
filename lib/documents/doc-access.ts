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

// ── Cadena de carpetas ────────────────────────────────────────────────────────
//
// Hasta el 2026-10-04 el Drive miraba SOLO la carpeta directa: una subcarpeta
// sin roles adentro de «Contratos (solo admin)» dejaba ver sus documentos al
// cajero (revisión de seguridad del rescate de ADR-467). Ahora cuenta toda la
// cadena hasta la raíz: cada carpeta con roles es una puerta más, y el rol
// tiene que pasar todas.

/** Lo que hace falta de una carpeta para subir por sus madres. */
export type CarpetaConRoles = { parentId: string | null; allowedRoles: string[] };

/** Tope al subir: corta aunque la base ya tuviera un ciclo. */
const MAX_NIVELES = 200;

/**
 * Los `allowedRoles` NO vacíos de la carpeta y de todas sus madres (de la más
 * cercana a la raíz). Una carpeta que no está en el mapa corta la subida.
 */
export function rolesDeLaCadena(
  folderId: string | null | undefined,
  carpetas: ReadonlyMap<string, CarpetaConRoles>,
): string[][] {
  const puertas: string[][] = [];
  const vistas = new Set<string>();
  let id = folderId ?? null;
  while (id && !vistas.has(id) && vistas.size < MAX_NIVELES) {
    vistas.add(id);
    const c = carpetas.get(id);
    if (!c) break;
    if (c.allowedRoles?.length) puertas.push(c.allowedRoles);
    id = c.parentId ?? null;
  }
  return puertas;
}

/** ¿El documento (o alguna carpeta de su cadena) tiene roles puestos? */
export function estaRestringido(docAllowed: string[] = [], cadena: string[][] = []): boolean {
  return docAllowed.length > 0 || cadena.length > 0;
}

/**
 * Como `canRoleSeeDoc`, pero con la cadena entera de carpetas: el rol tiene
 * que estar en el doc (si tiene roles) y en CADA carpeta con roles hasta la raíz.
 */
export function canRoleSeeEnCadena(
  role: string | undefined | null,
  docAllowed: string[] = [],
  cadena: string[][] = [],
): boolean {
  if (isPrivilegedRole(role)) return true;
  if (!role) return false;
  if (docAllowed.length > 0 && !docAllowed.includes(role)) return false;
  return cadena.every((roles) => roles.includes(role));
}

/**
 * ¿Sigue sirviendo un enlace público? Lo que no tiene roles, sí. Lo
 * restringido, sólo si quien CREÓ el enlace lo puede ver HOY (rol actual;
 * `null` = usuario borrado o inactivo → no). Así un enlace que el cajero sacó
 * de un papel restringido antes de que se cerrara el hueco deja de servir, y
 * uno del dueño sigue andando.
 */
export function enlaceSigueSirviendo(
  rolDelCreador: string | null,
  docAllowed: string[] = [],
  cadena: string[][] = [],
): boolean {
  return !estaRestringido(docAllowed, cadena) || canRoleSeeEnCadena(rolDelCreador, docAllowed, cadena);
}
