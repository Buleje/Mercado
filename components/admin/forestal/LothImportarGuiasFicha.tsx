"use client";

/**
 * «Datos» de una guía IMPORTADA en la vista GTF del Libro TH (ADR-461, 02-10
 * noche): todo lo que la guía decía al importarla —titular, propietario,
 * destinatario, transporte, cuadro de productos (37), estado en SERFOR— con los
 * mismos bloques que la vista previa de la importación (de a dos por fila, con
 * el resumen por especie; 02-10-2026), y debajo su lista de trozas tal como
 * quedó en el libro.
 *
 * Sólo aparece en las guías que guardaron la ficha (`gtfDatos.fichaSerfor`,
 * desde el 02-10 noche): una anotada a mano no tiene una «ficha de SERFOR».
 */

import { useMemo, useRef, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Eye, FileText } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { formatNumber } from "@/lib/format";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { piezasDeItems } from "@/lib/forestal/loth-guia-despacho";
import { fichaDeGuiaImportada } from "@/lib/forestal/loth-importar-guia-ficha";
import LothImportarGuiasBloques from "./LothImportarGuiasBloques";

const m = (v: number | null) => (v == null ? "—" : formatNumber(v, 2));
const TH =
  "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-[var(--text-tertiary)]";
const TD = "whitespace-nowrap px-3 py-1.5";

export default function BotonFichaImportada({
  gtfDatos,
  gtfNumber,
  items,
}: {
  gtfDatos: unknown;
  gtfNumber: string;
  /** `ForestGtf.items`: las trozas que salieron con la guía. */
  items: unknown;
}) {
  const leida = useMemo(() => fichaDeGuiaImportada(gtfDatos), [gtfDatos]);
  const piezas = useMemo(() => piezasDeItems(items), [items]);
  const paraResumen = useMemo(
    () => piezas.map((p) => ({ comun: p.comun, cientifico: p.cientifico, m3: p.volumeM3 })),
    [piezas],
  );
  const [abierta, setAbierta] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  /* El modal se monta sólo abierto (hay uno por fila de la lista): al cerrarse
     se desmonta y Radix no alcanza a devolver el foco. Se devuelve a mano al botón. */
  const cerrar = () => {
    setAbierta(false);
    window.setTimeout(() => boton.current?.focus({ preventScroll: true }), 0);
  };
  if (!leida) return null;
  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierta(true)}
        title="Todos los datos de la guía como los publica SERFOR: titular, destinatario, transporte y productos"
        aria-label={`Ver los datos de la GTF ${gtfNumber}`}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
      >
        <Eye className="h-3.5 w-3.5" aria-hidden /> Datos
      </button>
      {abierta && (
        <AdminModal
          open
          onClose={cerrar}
          variant="info"
          icon={FileText}
          title={`Datos de la GTF ${gtfNumber}`}
          description={
            leida.verificada
              ? "Como la publicó SERFOR al importarla"
              : "Leída de una foto o PDF al importarla: sin verificar en SERFOR"
          }
        >
          <div className="space-y-3 px-5 py-4 sm:px-6">
            <LothImportarGuiasBloques ficha={leida.ficha} piezas={paraResumen} />
            {piezas.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-[var(--rule-base)]">
                <DataTable className="w-full text-sm">
                  <caption className="px-3 py-2 text-left text-sm font-bold text-[var(--text-primary)]">
                    Trozas de la guía ({piezas.length}) ·{" "}
                    <span className="font-mono tabular-nums">
                      {fmtM3(piezas.reduce((a, p) => a + (p.volumeM3 ?? 0), 0))} m³
                    </span>
                  </caption>
                  <thead className="bg-[var(--surface-sunken)]">
                    <tr>
                      <th className={TH}>Código</th>
                      <th className={TH}>Especie</th>
                      <th className={`${TH} text-right`}>D1 (m)</th>
                      <th className={`${TH} text-right`}>D2 (m)</th>
                      <th className={`${TH} text-right`}>Largo (m)</th>
                      <th className={`${TH} text-right`}>m³</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--rule-soft)]">
                    {piezas.map((p, i) => (
                      <tr key={`${p.codigo}-${i}`}>
                        <td className={`${TD} font-mono font-semibold text-[var(--text-primary)]`}>
                          {p.codigo || "—"}
                        </td>
                        <td className={`${TD} text-[var(--text-secondary)]`}>{p.comun ?? "—"}</td>
                        <td className={`${TD} text-right font-mono tabular-nums`}>
                          {m(p.diamMayorM)}
                        </td>
                        <td className={`${TD} text-right font-mono tabular-nums`}>
                          {m(p.diamMenorM)}
                        </td>
                        <td className={`${TD} text-right font-mono tabular-nums`}>
                          {m(p.lengthM)}
                        </td>
                        <td className={`${TD} text-right font-mono tabular-nums`}>
                          {p.volumeM3 == null ? "—" : fmtM3(p.volumeM3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            )}
          </div>
        </AdminModal>
      )}
    </>
  );
}
