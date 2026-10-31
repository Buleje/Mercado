/**
 * La pastilla «de dónde salió esta guía» de la tabla GTF del Libro TH (07-10):
 * importada de SERFOR (con su N° de registro), importada de una foto o PDF
 * sin verificar, o creada a mano. La regla vive en `lib/forestal/gtf-origen`.
 * El N° de registro tiene su propia columna en la tabla (07-10): acá sólo va
 * en el `title`, para no repetirlo.
 */

import { FileText, PenLine, ShieldCheck } from "@buleje/design-system/icons";
import { ETIQUETA_ORIGEN, type OrigenDeGuia } from "@/lib/forestal/gtf-origen";

const ESTILO: Record<OrigenDeGuia["origen"], { clase: string; corto: string; Icono: typeof ShieldCheck }> = {
  serfor: {
    clase: "bg-[var(--data-success-100)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]",
    corto: "SERFOR",
    Icono: ShieldCheck,
  },
  documento: {
    clase: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]",
    corto: "Foto/PDF",
    Icono: FileText,
  },
  manual: {
    clase: "bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
    corto: "Manual",
    Icono: PenLine,
  },
};

export default function GtfOrigenChip({ origen, registro }: OrigenDeGuia) {
  const e = ESTILO[origen];
  const titulo =
    origen === "manual"
      ? "Creada a mano en el panel: no viene de una importación."
      : `${ETIQUETA_ORIGEN[origen]}${registro ? ` · N° de registro ${registro}` : " · sin N° de registro"}${origen === "documento" ? " (sin verificar en SERFOR)" : ""}`;
  return (
    <span className="inline-flex" title={titulo}>
      <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${e.clase}`}>
        <e.Icono className="h-3.5 w-3.5" aria-hidden="true" />
        {e.corto}
        <span className="sr-only">: {titulo}</span>
      </span>
    </span>
  );
}
