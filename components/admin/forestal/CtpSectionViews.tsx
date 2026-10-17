/**
 * CtpSectionViews — barrel de re-export (ADR-127).
 *
 * Las vistas de Producción/Despacho y Saldos del Libro CTP viven en archivos
 * propios (CtpEntriesView.tsx / CtpSaldosView.tsx, ≤300 LOC c/u) con sus
 * tipos y primitivos de tabla compartidos en ctp-section-shared.tsx. Este
 * barrel se mantiene para no tocar los importadores existentes
 * (CTPLibroOperaciones, CtpNodeDetailLoader, CtpSeccionCardMobile).
 */

export { CtpEntriesView } from "./CtpEntriesView";
export { CtpSaldosView } from "./CtpSaldosView";
export type { CtpEntry, CtpSection } from "./ctp-section-shared";
