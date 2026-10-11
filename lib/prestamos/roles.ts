import type { AdminRole } from "@/lib/session";

/**
 * Quién usa Préstamos (11-10): plata prestada y por cobrar del negocio, sólo
 * gestión — admin, dueño y encargado. Cajero, almacenero y el resto reciben
 * 403 en TODAS las rutas `/api/prestamos/*` (antes `requireAdmin(req)` sin
 * roles los dejaba listar, ver el resumen y exportar). Los crons van por
 * `withCronAuth`, no por esto.
 */
export const ROLES_PRESTAMOS: readonly AdminRole[] = ["admin", "owner", "manager"];
