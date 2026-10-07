"use client";

/**
 * «Datos» de una guía IMPORTADA en la vista GTF del Libro TH (ADR-461, 02-10
 * noche): todo lo que la guía decía al importarla —titular, propietario,
 * destinatario, transporte, cuadro de productos (37), estado en SERFOR— con los
 * mismos bloques que la vista previa de la importación (de a dos por fila, con
 * el resumen por especie; 02-10-2026) y su lista de trozas tal como quedó en el
 * libro. Desde el 07-10 (Brandon: «que se separe en sección GTF y Lista de
 * trozas… más amplio para evitar el scroll») son dos pestañas en un modal de
 * casi todo el ancho y 90 % del alto.
 *
 * Sólo se ofrece en las guías que guardaron la ficha (`gtfDatos.fichaSerfor`,
 * desde el 02-10 noche): una anotada a mano no tiene una «ficha de SERFOR».
 */

import { useId, useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { FileText } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { formatNumber } from "@/lib/format";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { piezasDeItems } from "@/lib/forestal/loth-guia-despacho";
import { fichaDeGuiaImportada } from "@/lib/forestal/loth-importar-guia-ficha";
import LothImportarGuiasBloques from "./LothImportarGuiasBloques";
import CtpApartados, { CtpApartadoPanel, type Apartado } from "./ctp-apartados";

const m = (v: number | null) => (v == null ? "—" : formatNumber(v, 2));
const TH =
  "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-[var(--text-tertiary)]";
const TD = "whitespace-nowrap px-3 py-1.5";

/** El modal ancho: casi todo el ancho en escritorio y 90 % del alto (sólo este modal). */
const MODAL_AMPLIO = "sm:max-w-[min(96vw,1400px)] sm:h-[90vh] sm:max-h-[90vh]";

/**
 * El modal «Datos» de una guía importada, en dos pestañas: «GTF» (los casilleros
 * del documento) y «Lista de trozas» (resumen por especie + cada troza). Se
 * monta sólo abierto; lo abre la opción «Datos» del menú ⋯ de la tabla GTF.
 */
export default function ModalFichaImportada({
  gtfDatos,
  gtfNumber,
  items,
  onClose,
}: {
  gtfDatos: unknown;
  gtfNumber: string;
  items: unknown;
  onClose: () => void;
}) {
  const leida = useMemo(() => fichaDeGuiaImportada(gtfDatos), [gtfDatos]);
  const piezas = useMemo(() => piezasDeItems(items), [items]);
  const paraResumen = useMemo(
    () => piezas.map((p) => ({ comun: p.comun, cientifico: p.cientifico, m3: p.volumeM3 })),
    [piezas],
  );
  const [pestana, setPestana] = useState<"gtf" | "trozas">("gtf");
  const idBase = useId();
  if (!leida) return null;
  const volumen = piezas.reduce((a, p) => a + (p.volumeM3 ?? 0), 0);
  const apartados: Apartado[] = [
    { id: "gtf", label: "GTF", hint: "Los casilleros de la guía: titular, propietario, destinatario, transporte y traslado" },
    { id: "trozas", label: "Lista de trozas", contador: piezas.length, unidad: piezas.length === 1 ? "troza" : "trozas" },
  ];
  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      icon={FileText}
      className={MODAL_AMPLIO}
      title={`Datos de la GTF ${gtfNumber}`}
      description={
        leida.verificada
          ? "Como la publicó SERFOR al importarla"
          : "Leída de una foto o PDF al importarla: sin verificar en SERFOR"
      }
    >
      <div className="space-y-3 px-5 py-4 sm:px-6">
        <CtpApartados
          apartados={apartados}
          activo={pestana}
          onIr={(id) => setPestana(id === "trozas" ? "trozas" : "gtf")}
          idBase={idBase}
          etiqueta={`Secciones de la GTF ${gtfNumber}`}
        />
        {pestana === "gtf" ? (
          <CtpApartadoPanel idBase={idBase} id="gtf">
            <LothImportarGuiasBloques ficha={leida.ficha} piezas={paraResumen} partes="datos" />
          </CtpApartadoPanel>
        ) : (
          <CtpApartadoPanel idBase={idBase} id="trozas" className="space-y-3">
            <LothImportarGuiasBloques ficha={leida.ficha} piezas={paraResumen} partes="resumen" />
            {piezas.length === 0 ? (
              <p className="rounded-lg border border-[var(--rule-base)] px-3 py-6 text-center text-sm text-[var(--text-tertiary)]">
                La guía no trajo su lista de trozas.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--rule-base)]">
                <DataTable className="w-full text-sm">
                  <caption className="px-3 py-2 text-left text-sm font-bold text-[var(--text-primary)]">
                    Trozas de la guía ({piezas.length}) ·{" "}
                    <span className="font-mono tabular-nums">{fmtM3(volumen)} m³</span>
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
                        <td className={`${TD} font-mono font-semibold text-[var(--text-primary)]`}>{p.codigo || "—"}</td>
                        <td className={`${TD} text-[var(--text-secondary)]`}>{p.comun ?? "—"}</td>
                        <td className={`${TD} text-right font-mono tabular-nums`}>{m(p.diamMayorM)}</td>
                        <td className={`${TD} text-right font-mono tabular-nums`}>{m(p.diamMenorM)}</td>
                        <td className={`${TD} text-right font-mono tabular-nums`}>{m(p.lengthM)}</td>
                        <td className={`${TD} text-right font-mono tabular-nums`}>
                          {p.volumeM3 == null ? "—" : fmtM3(p.volumeM3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            )}
          </CtpApartadoPanel>
        )}
      </div>
    </AdminModal>
  );
}
