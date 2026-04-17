/**
 * Compat layer — undoToast migro a @buleje/design-system (ADR-069 Fase 3).
 * Mantenemos este re-export para no romper imports existentes en components/admin/ux.
 * En el futuro, los consumidores deberian importar directamente de @buleje/design-system.
 */
export { undoToast } from "@buleje/design-system";
