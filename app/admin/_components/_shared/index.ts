/**
 * Barrel del shared admin layer.
 *
 * Uso:
 *   import { AdminTabShell, AdminButton, AdminInput, ADMIN_TOKENS } from "@/app/admin/_components/_shared";
 */

export { ADMIN_TOKENS } from "./admin-tokens";
export { default as AdminTabShell } from "./AdminTabShell";
export { default as AdminEmptyState } from "./AdminEmptyState";
export { default as AdminButton } from "./AdminButton";
export {
  default as AdminField,
  AdminInput,
  AdminTextarea,
  AdminSelect,
} from "./AdminField";
