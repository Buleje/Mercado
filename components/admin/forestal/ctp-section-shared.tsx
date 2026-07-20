/**
 * ctp-section-shared — tipos y primitivos de tabla compartidos entre
 * CtpEntriesView (Producción/Despacho) y CtpSaldosView del Libro CTP (ADR-127).
 */

export type CtpSection = "produccion" | "despacho";

export interface CtpEntry {
  id: string; section: CtpSection; lineNo: number; entryDate: string;
  gtfIngreso: string | null; materiaPrimaRef: string | null;
  speciesCommon: string | null; speciesScientific: string | null; cites: boolean;
  productType: string | null; volumeInputM3: string | null; rendimientoPct: string | null;
  quantity: string | null; unit: string | null; pieces: number | null;
  gtfNumber: string | null; destino: string | null; observations: string | null;
  status: "registrado" | "anulado"; annulledReason: string | null;
}

export const n2 = (v: number) => v.toFixed(2);

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}
export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
