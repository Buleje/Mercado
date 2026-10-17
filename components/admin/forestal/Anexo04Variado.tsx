"use client";

/**
 * Anexo04Variado — el botón «Resaltar Variado» de la vista previa del Anexo 04
 * (Brandon, 2026-10-03): pinta los renglones que vienen de Varios para
 * identificarlos en el papel. Con la marca encendida cuenta cuántas medidas
 * son y explica los dos colores. Sólo pantalla: el papel sale igual.
 */
import { Paintbrush } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { VistaVariado } from "./hooks/use-anexo04-variado";

/**
 * Los colores de los renglones, SÓLO en pantalla (no van en `ANEXO04_CSS`, que
 * es lo que imprime). La hoja es papel blanco en claro y oscuro, así que el
 * tinte se mezcla con blanco: el texto negro se lee igual en los dos temas.
 */
export const ANEXO04_VARIADO_CSS = `
.anx-vr-puro .anx-cell { background: color-mix(in srgb, var(--data-warning-500) 38%, white); }
.anx-vr-mixto .anx-cell { background: color-mix(in srgb, var(--data-warning-500) 14%, white); }
.anx-vr-mixto { outline: 1.5px dashed var(--data-warning-700); outline-offset: -1.5px; }
`;

const CHIP = "inline-flex h-8 items-center gap-1.5 rounded-lg border-2 px-2.5 text-xs font-bold transition";
const MUESTRA = "inline-block h-3 w-5 shrink-0 rounded-sm border border-[var(--rule-base)]";

export default function Anexo04Variado({ variado }: { variado: VistaVariado }) {
  const { resaltar, alternar, resumen } = variado;
  const { medidas, mixtas } = resumen;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <button
        type="button"
        onClick={alternar}
        aria-pressed={resaltar}
        title="Pinta en la hoja las medidas que vienen de la especie Varios (sólo en pantalla)"
        className={`${CHIP} ${resaltar ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"}`}
      >
        <Paintbrush className="h-3.5 w-3.5" aria-hidden />
        Resaltar Variado
      </button>
      {resaltar && (
        <>
          <span className="text-xs font-semibold text-[var(--text-primary)]" aria-live="polite">
            <span className="font-mono font-bold tabular-nums">{medidas}</span>{" "}
            {medidas === 1 ? "medida viene" : "medidas vienen"} de Varios
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className={`${MUESTRA} bg-[color-mix(in_srgb,var(--data-warning-500)_38%,var(--surface-raised))]`} aria-hidden />
            Solo de Varios
          </span>
          {mixtas > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <span
                className={`${MUESTRA} border-dashed border-[var(--data-warning-700)] bg-[color-mix(in_srgb,var(--data-warning-500)_14%,var(--surface-raised))]`}
                aria-hidden
              />
              Mezcla con madera propia ({mixtas})
            </span>
          )}
        </>
      )}
      <InfoTip
        title="Resaltar Variado"
        what="Pinta en la hoja las medidas que salieron de abrir un paquete 6×6 «Variado» y se repartieron entre las especies. Las que juntan Variado y madera propia de la especie llevan borde punteado; pasa el cursor sobre el renglón para ver cuántas piezas son de cada una."
        affects="Solo lo que ves en pantalla. El PDF, el Excel y la impresión salen igual que siempre, sin colores, y los volúmenes no cambian."
        example="Tornillo 2×4×8 de 12 piezas: si 9 vienen de Varios y 3 son de Tornillo, sale con borde punteado."
      />
    </div>
  );
}
