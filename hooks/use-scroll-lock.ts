/**
 * Compat layer — useScrollLock migro a @buleje/design-system (ADR-069 fase 3).
 * Este re-export mantiene compatibility con los 16 consumidores existentes.
 * Migracion gradual: si tocas un archivo que lo importa, cambia a @buleje/design-system.
 */
export { useScrollLock } from "@buleje/design-system";
