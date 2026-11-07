"use client";

/**
 * Rendimiento por origen: ¿a qué proveedor, permiso o guía te conviene
 * comprarle? Cada fila contra el promedio de SU especie, en pies y en soles.
 * «Sin origen» = corridas sin guía de ingreso ligada: en gris y al final.
 */
import { CardTitle, DataTable } from "@buleje/design-system";
import { Info } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgruparOrigenPor, PrecioTrozaDTO } from "@/lib/forestal/precio-troza-tipos";
import { fmtDifPt, fmtDifSoles, ordenarOrigen, soloSinOrigen, textoCorridasFuera, tonoDe } from "./precio-troza-formato";
import { Insignia, PILA, PILA_DERECHA, TEXTO_TONO } from "./precio-troza-ui";

const AGRUPAR: { value: AgruparOrigenPor; label: string }[] = [
  { value: "proveedor", label: "Proveedor" },
  { value: "permiso", label: "Permiso" },
  { value: "guia", label: "Guía" },
];
const pct = (v: number | null) => (v == null ? "—" : `${formatNumber(v, 1)} %`);

export default function PrecioTrozaOrigen({
  datos,
  agrupar,
  onAgrupar,
}: {
  datos: PrecioTrozaDTO;
  agrupar: AgruparOrigenPor;
  onAgrupar: (a: AgruparOrigenPor) => void;
}) {
  const filas = ordenarOrigen(datos.porOrigen);
  const t = datos.totalOrigen;
  const fuera = textoCorridasFuera(datos.corridasFuera);
  const sinOrigen = filas.find((f) => f.sinOrigen);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">Rendimiento por origen</CardTitle>
        <InfoTip
          title="¿A quién te conviene comprarle?"
          what="Lo que rindió en la sierra la madera de cada proveedor, permiso o guía, contra el promedio de su misma especie."
          affects="«Repartido» = la corrida mezclaba trozas de varios orígenes: su producción se repartió por m³."
          example="+120 PT y +S/ 420 = sus trozas te dieron 120 pies más que el promedio, que vendidos son S/ 420."
        />
        <SegmentedControl value={agrupar} onChange={onAgrupar} options={AGRUPAR} size="sm" label="Agrupar por" className="w-full sm:ml-auto sm:w-auto" />
      </div>

      {t.corridas > 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-mono tabular-nums">{formatNumber(t.m3Rollo, 3)}</span> m³ de rollo →{" "}
          <span className="font-mono tabular-nums">{formatNumber(t.ptProducidos, 0)}</span> pies · {pct(t.rendimientoPct)} en {t.corridas}{" "}
          {t.corridas === 1 ? "corrida" : "corridas"}
          {fuera ? ` · ${fuera}` : ""}
        </p>
      )}

      {soloSinOrigen(filas) && (
        <p className="flex items-start gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-primary)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-info-ink)]" aria-hidden />
          <span>
            Para saber a quién te conviene comprarle, liga cada corrida a la guía de ingreso de sus trozas.
            {sinOrigen ? ` Hoy ${sinOrigen.corridas} ${sinOrigen.corridas === 1 ? "corrida no tiene" : "corridas no tienen"} guía ligada.` : ""}
          </span>
        </p>
      )}

      {filas.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">Todavía no hay corridas terminadas con m³ de rollo.</p>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th scope="col">Origen</th>
              <th scope="col" className="text-right">Corridas</th>
              <th scope="col" className="text-right">m³ de rollo</th>
              <th scope="col" className="text-right">Pies producidos</th>
              <th scope="col" className="text-right">Rendimiento</th>
              <th scope="col" className="text-right">Contra el promedio</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const gris = f.sinOrigen ? "text-[var(--text-tertiary)]" : "";
              return (
                <tr key={f.clave}>
                  <th scope="row" className="text-left">
                    <span className={PILA}>
                      <span className={cn("font-bold", gris)}>{f.nombre}</span>
                      {f.sinOrigen ? (
                        <span className="text-xs font-normal text-[var(--text-tertiary)]">Corridas sin guía de ingreso ligada</span>
                      ) : (
                        (f.detalle || f.prorrateado) && (
                          <span className="inline-flex flex-wrap items-center gap-1 text-xs font-normal text-[var(--text-tertiary)]">
                            {f.detalle}
                            {f.prorrateado && <Insignia title="Alguna corrida mezclaba orígenes: su parte se repartió por m³">repartido</Insignia>}
                          </span>
                        )
                      )}
                    </span>
                  </th>
                  <td className={cn("text-right font-mono tabular-nums", gris)}>{f.corridas}</td>
                  <td className={cn("text-right font-mono tabular-nums", gris)}>{formatNumber(f.m3Rollo, 3)}</td>
                  <td className={cn("text-right font-mono tabular-nums", gris)}>{formatNumber(f.ptProducidos, 0)}</td>
                  <td className={cn("text-right font-mono font-bold tabular-nums", gris)}>{pct(f.rendimientoPct)}</td>
                  <td className="text-right">
                    {f.sinOrigen ? (
                      <span className="text-[var(--text-tertiary)]">—</span>
                    ) : (
                      <span className={PILA_DERECHA}>
                        <span className={cn("font-mono font-bold tabular-nums", TEXTO_TONO[tonoDe(f.difPtVsPromedio)])}>{fmtDifPt(f.difPtVsPromedio)}</span>
                        <span className={cn("font-mono text-xs tabular-nums", f.difSolesVsPromedio === null ? "text-[var(--text-tertiary)]" : TEXTO_TONO[tonoDe(f.difSolesVsPromedio)])} title={f.difSolesFalta ?? undefined}>
                          {f.difSolesVsPromedio === null ? (f.difSolesFalta ?? "sin precio") : fmtDifSoles(f.difSolesVsPromedio)}
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
