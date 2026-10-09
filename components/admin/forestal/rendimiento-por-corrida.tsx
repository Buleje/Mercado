"use client";

/**
 * Rendimiento › Por corrida — cada corrida del Libro CTP con su estado contra
 * las OTRAS de su especie («Bajo lo suyo», «Parcial»…), la plata si el rol la
 * ve, y el salto al Libro para abrirla. La que tiene madera sin guía se liga a
 * su compra desde acá mismo (ADR-485): es lo que deja el costo por PT en «Falta».
 */
import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { ExternalLink, Link2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { RendimientoAserraderoDTO } from "@/lib/forestal/rendimiento-especie";
import { fechaConDia } from "@/lib/forestal/loth-plan-costeo";
import CtpCorridaConSuCompra from "./CtpCorridaConSuCompra";
import { CeldaPlata, EstadoCorridaBadge, HREF_PRODUCCION, fmtM3, fmtPct } from "./rendimiento-compartido";

const TH = "px-3 py-2 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-3 py-2 align-middle";

/** Menos de medio litro sin guía no es madera: no ofrece ligar. */
const sinCompra = (m3: number | undefined) => (m3 ?? 0) > 0.0005;
const BOTON_ICONO =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]";

export default function RendimientoPorCorrida({ datos, onCambio }: { datos: RendimientoAserraderoDTO; onCambio?: () => void }) {
  const { hoy, plataVisible } = datos;
  const [ligando, setLigando] = useState<{ id: string; lineNo: number; especie: string; m3: number } | null>(null);
  const [huboCambio, setHuboCambio] = useState(false);
  /* Lo más reciente arriba: es lo que uno viene a mirar. */
  const corridas = [...datos.corridas].reverse();
  if (corridas.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">Todavía no hay corridas de producción en el Libro CTP.</p>;
  }
  const bajas = corridas.filter((c) => c.estado === "bajo_lo_suyo").length;

  return (
    <div className="space-y-2">
      {bajas > 0 && (
        <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {bajas === 1 ? "Una corrida salió bajo lo suyo" : `${bajas} corridas salieron bajo lo suyo`}
          <InfoTip
            title="Bajo lo suyo"
            what="Rindió menos que el rango de las otras corridas terminadas de su misma especie."
            affects="Suele ser producto sin declarar, troza atribuida de más o una sierra que necesita afilado. Ábrela en el Libro para revisar."
          />
        </p>
      )}
      <div className="overflow-x-auto">
        <DataTable className="text-sm">
          <thead className="border-b border-[var(--rule-base)]">
            <tr>
              <th scope="col" className={TH}>N°</th>
              <th scope="col" className={TH}>Fecha</th>
              <th scope="col" className={TH}>Especie · lote</th>
              <th scope="col" className={`${TH} text-right`}>Troza → aserrado (m³)</th>
              <th scope="col" className={`${TH} text-right`}>Rendimiento</th>
              <th scope="col" className={TH}>Estado</th>
              {plataVisible && <th scope="col" className={`${TH} text-right`}>Comercial (PT)</th>}
              {plataVisible && <th scope="col" className={`${TH} text-right`}>Costo por PT</th>}
              <th scope="col" className={TH}><span className="sr-only">Abrir</span></th>
            </tr>
          </thead>
          <tbody>
            {corridas.map((c) => (
              <tr key={c.id}>
                <th scope="row" className={`${TD} text-left font-mono font-bold text-[var(--text-primary)]`}>#{c.lineNo}</th>
                <td className={`${TD} whitespace-nowrap text-[var(--text-secondary)]`}>{fechaConDia(c.fecha, hoy)}</td>
                <td className={TD}>
                  <span className="inline-flex flex-col items-end gap-0.5 sm:items-start">
                    <span className="font-semibold text-[var(--text-primary)]">{c.especie}</span>
                    {c.lote && <span className="whitespace-nowrap font-mono text-xs text-[var(--text-tertiary)]">{c.lote}</span>}
                  </span>
                </td>
                <td className={`${TD} whitespace-nowrap text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                  {fmtM3(c.m3Entrada)} → {c.unidad === "m3" ? fmtM3(c.m3Salida) : `— (${c.unidad})`}
                </td>
                <td className={`${TD} text-right font-mono font-bold tabular-nums text-[var(--text-primary)]`}>{fmtPct(c.rendimientoPct, 2)}</td>
                <td className={TD}>
                  <EstadoCorridaBadge estado={c.estado} rango={c.rango} finProceso={c.finProceso} hoy={hoy} />
                </td>
                {plataVisible && (
                  <td className={`${TD} text-right`}>
                    <CeldaPlata plata={c.plata} campo="comercial" noLeida={!!datos.plataTruncada} />
                  </td>
                )}
                {plataVisible && (
                  <td className={`${TD} text-right`}>
                    <CeldaPlata plata={c.plata} campo="costo" noLeida={!!datos.plataTruncada} />
                  </td>
                )}
                <td className={`${TD} text-right`}>
                  <span className="inline-flex items-center gap-1.5">
                    {c.ligable !== false && sinCompra(c.m3SinAtribuir) && (
                      <button
                        type="button"
                        onClick={() => setLigando({ id: c.id, lineNo: c.lineNo, especie: c.especie, m3: c.m3SinAtribuir ?? 0 })}
                        title={`Ligar la corrida #${c.lineNo} con su compra (${fmtM3(c.m3SinAtribuir ?? 0)} m³ sin guía)`}
                        className={BOTON_ICONO}
                      >
                        <Link2 className="h-4 w-4" aria-hidden />
                        <span className="sr-only">Ligar la corrida #{c.lineNo} con su compra</span>
                      </button>
                    )}
                    <EnlacePanel apariencia="heredada" href={HREF_PRODUCCION} title={`Abrir la corrida #${c.lineNo} en el Libro CTP › Producción`} className={`${BOTON_ICONO} hover:no-underline`}>
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Abrir la corrida #{c.lineNo} en el Libro CTP</span>
                    </EnlacePanel>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
      {ligando && (
        <AdminModal
          open
          onClose={() => {
            setLigando(null);
            /* El rendimiento se vuelve a leer al cerrar: con la compra ligada, el costo por PT cambia. */
            if (huboCambio) onCambio?.();
            setHuboCambio(false);
          }}
          variant="info"
          icon={Link2}
          title={`Corrida #${ligando.lineNo} · ${ligando.especie}`}
          description={`${fmtM3(ligando.m3)} m³ de troza sin guía de compra`}
        >
          <CtpCorridaConSuCompra corridaId={ligando.id} onLigada={() => setHuboCambio(true)} />
        </AdminModal>
      )}
    </div>
  );
}
