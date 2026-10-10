"use client";

/**
 * «Ver trasera del camión» (Brandon, 2026-10-03): el registro de las piezas
 * que van en la parte de atrás — las que se ven al abrir la compuerta.
 *
 * Dos lecturas de lo mismo: el CROQUIS (cada pieza a escala, con el color de
 * su especie) y el FORMATO (la tabla con medida, tipo, piezas, PT y m³). Las
 * dos salen de `lib/forestal/camion-croquis.ts`; el PDF también.
 */
import { useMemo, useState } from "react";
import { FileText, Loader2, Trash2, Truck, X } from "@buleje/design-system/icons";
import { BlockTitle, DataTable } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Btn, MODAL_BODY, ModalFooter } from "./ctp-shared";
import { CroquisTrasera, MuestraEspecie } from "./cubicador-trasera-croquis";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { acomodarCroquis, ANCHO_CAMION_M_MAX, ANCHO_CAMION_M_MIN, formatoTrasera, pulgAMetros } from "@/lib/forestal/camion-croquis";
import { exportarTraseraPDF } from "@/lib/forestal/camion-croquis-pdf";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";

const fmtPt = (v: number) => formatNumber(v, 2);
const TH = "px-2 py-1.5 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5";

export function TraseraCamionModal({
  piezas,
  catalogo,
  anchoM,
  onAncho,
  onQuitar,
  onVaciar,
  onAviso,
  onCerrar,
}: {
  /** Las piezas marcadas como trasera, en el orden del lote. */
  piezas: readonly PiezaCubicada[];
  /** Las especies de la planta, en su orden: fijan el color de cada una. */
  catalogo: readonly string[];
  anchoM: number;
  onAncho: (m: number) => void;
  onQuitar: (id: string) => void;
  onVaciar: () => void;
  onAviso: (msg: string, tono: "success" | "error") => void;
  onCerrar: () => void;
}) {
  const [anchoTxt, setAnchoTxt] = useState(() => String(anchoM));
  const [generando, setGenerando] = useState(false);
  const croquis = useMemo(() => acomodarCroquis(piezas, { anchoM, catalogo }), [piezas, anchoM, catalogo]);
  const formato = useMemo(() => formatoTrasera(piezas, catalogo), [piezas, catalogo]);
  const { totales } = formato;

  const cambiarAncho = (txt: string) => {
    setAnchoTxt(txt);
    const n = Number(txt.replace(",", "."));
    if (Number.isFinite(n) && n >= ANCHO_CAMION_M_MIN && n <= ANCHO_CAMION_M_MAX) onAncho(n);
  };
  const descargar = async () => {
    setGenerando(true);
    try {
      await exportarTraseraPDF(piezas, anchoM, catalogo);
      onAviso("PDF de la trasera generado", "success");
    } catch {
      onAviso("No se pudo generar el PDF de la trasera.", "error");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <AdminModal
      aboveModals
      open
      onClose={onCerrar}
      title="Parte trasera del camión"
      icon={Truck}
      variant="info"
      footer={
        <ModalFooter>
          {piezas.length > 0 && (
            <Btn variant="secondary" onClick={onVaciar}>
              <Trash2 className="h-4 w-4" aria-hidden /> Vaciar la trasera
            </Btn>
          )}
          <Btn variant="secondary" onClick={() => void descargar()} disabled={piezas.length === 0 || generando}>
            {generando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />} PDF para imprimir
          </Btn>
          <Btn variant="primary" onClick={onCerrar}>Listo</Btn>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-5`}>
        {piezas.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">
            La trasera está vacía. Marca filas en la tabla y toca «Parte trasera del camión».
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {formatNumber(totales.piezas, 0)} piezas · {fmtPt(totales.pt)} PT · {fmtM3(totales.m3)} m³
                <span className="font-normal text-[var(--text-tertiary)]"> · pila de {formatNumber(pulgAMetros(croquis.altoPulg), 2)} m</span>
              </p>
              <InfoTip
                what="Las piezas que quedan a la vista al abrir la compuerta. El croquis las dibuja vistas desde atrás: cada rectángulo es la sección espesor × ancho de UNA pieza, a escala, con el color de su especie."
                affects="Es sólo un registro: no cambia el lote, el papel ni lo que se envía al libro."
                example="5 tablas 2×8 de tornillo = 5 rectángulos de 2″ × 8″ en teal, acomodadas de las más gruesas (abajo) a las más delgadas."
              />
              <label className="ml-auto inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                Ancho del camión
                <input
                  type="text"
                  inputMode="decimal"
                  value={anchoTxt}
                  onChange={(e) => cambiarAncho(e.target.value)}
                  aria-label="Ancho interno del camión en metros"
                  className="h-9 w-16 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
                m
              </label>
            </div>

            <section className="space-y-2">
              <BlockTitle>Croquis</BlockTitle>
              {/* En el celular el croquis no se achica hasta lo ilegible: se
                  desliza de costado (un camión de 2,40 m en 340 px dejaba los
                  rótulos de 4 px). */}
              <div className="overflow-x-auto rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
                <div style={{ minWidth: 560 }}>
                  <CroquisTrasera croquis={croquis} />
                </div>
              </div>
              {(croquis.sinDibujar > 0 || croquis.noCaben > 0) && (
                <p className="text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  {croquis.sinDibujar > 0 && `+${formatNumber(croquis.sinDibujar, 0)} piezas más que no se dibujan (cuentan en el alto y en la tabla). `}
                  {croquis.noCaben > 0 && `${croquis.noCaben} piezas más anchas que el camión o sin medida: no entran en el croquis.`}
                </p>
              )}
              <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Colores por especie">
                {croquis.leyenda.map((l) => (
                  <li key={l.especie} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                    <MuestraEspecie color={l.color} />
                    {l.especie} <span className="font-mono tabular-nums text-[var(--text-tertiary)]">{l.piezas} pzas</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-2">
              <BlockTitle>Formato</BlockTitle>
              <DataTable className="w-full text-sm" wrapperClassName="rounded-xl">
                  <thead>
                    <tr>
                      <th className={`${TH} text-right`}>N°</th>
                      <th className={TH}>Especie</th>
                      <th className={TH}>Medida <span className="font-normal normal-case">(E×A×L)</span></th>
                      <th className={TH}>Tipo</th>
                      <th className={`${TH} text-right`}>Piezas</th>
                      <th className={`${TH} text-right`}>Pie tablar</th>
                      <th className={`${TH} text-right`}>m³</th>
                      <th className={TH}><span className="sr-only">Quitar</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formato.filas.map((f) => (
                      <tr key={f.id} className="border-t border-[var(--rule-soft)]">
                        <td className={`${TD} text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]`}>{f.n}</td>
                        <td className={TD}>
                          <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                            <MuestraEspecie color={f.color} /> {f.especie}
                          </span>
                        </td>
                        <td className={`${TD} whitespace-nowrap font-mono font-bold tabular-nums text-[var(--text-secondary)]`}>{f.medida}</td>
                        <td className={`${TD} text-[var(--text-secondary)]`}>{f.tipo}</td>
                        <td className={`${TD} text-right font-mono tabular-nums`}>{f.piezas}</td>
                        <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>{fmtPt(f.pt)}</td>
                        <td className={`${TD} text-right font-mono font-bold tabular-nums text-[var(--text-primary)]`}>{fmtM3(f.m3)}</td>
                        <td className={`${TD} text-right`}>
                          <button
                            type="button"
                            onClick={() => onQuitar(f.id)}
                            aria-label={`Sacar ${f.medida} ${f.especie} de la trasera`}
                            title="Sacar de la trasera (la fila sigue en el lote)"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-700)]"
                          >
                            <X className="h-4 w-4" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--rule-base)] bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                      <td className={TD} colSpan={4}>Total · {formato.filas.length} {formato.filas.length === 1 ? "medida" : "medidas"}</td>
                      <td className={`${TD} text-right font-mono tabular-nums`}>{formatNumber(totales.piezas, 0)}</td>
                      <td className={`${TD} text-right font-mono tabular-nums`}>{fmtPt(totales.pt)}</td>
                      <td className={`${TD} text-right font-mono tabular-nums`}>{fmtM3(totales.m3)}</td>
                      <td />
                    </tr>
                  </tfoot>
              </DataTable>
            </section>
          </>
        )}
      </div>
    </AdminModal>
  );
}
