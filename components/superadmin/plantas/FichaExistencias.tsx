"use client";

import { BadgeStatus, CardTitle, DataTable } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import type { AserradaPlanta, EspecieExistencia } from "@/lib/superadmin/plantas-forestales/tipos";
import { Pt, SinLectura } from "./cifras";
import { m3, NOTA_PT } from "./formato";

interface Props {
  porEspecie: EspecieExistencia[];
  /** false = la conciliación por especie falló: «—», no una tabla vacía. */
  especiesLeidas: boolean;
  aserrada: AserradaPlanta | null;
}

const negativasPrimero = (a: EspecieExistencia, b: EspecieExistencia) =>
  Number(b.existenciaFinalM3 < 0) - Number(a.existenciaFinalM3 < 0) || b.existenciaFinalM3 - a.existenciaFinalM3;

function Especies({ porEspecie, leidas }: { porEspecie: EspecieExistencia[]; leidas: boolean }) {
  if (!leidas) return <p className="text-sm"><SinLectura fuente="conciliacion" /></p>;
  if (porEspecie.length === 0) return <p className="text-sm text-[var(--text-tertiary)]">Sin rolliza registrada en su libro.</p>;
  return (
    <DataTable>
      <thead>
        <tr>
          <th>Especie</th>
          <th className="text-right">Existencia</th>
          <th className="text-right">Movió en el período</th>
        </tr>
      </thead>
      <tbody>
        {[...porEspecie].sort(negativasPrimero).map((e) => {
          const negativa = e.existenciaFinalM3 < 0;
          return (
            <tr key={e.especie}>
              <td>
                <span className="inline-flex flex-wrap items-center gap-2">
                  {e.especie}
                  {negativa && <BadgeStatus variant="error" label="Negativo" size="sm" />}
                </span>
              </td>
              <td className={negativa ? "text-right font-semibold tabular-nums text-[var(--data-error)]" : "text-right tabular-nums"}>{m3(e.existenciaFinalM3)}</td>
              <td className="text-right tabular-nums">{m3(e.movimientoM3)}</td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

function PorProducto({ aserrada }: { aserrada: AserradaPlanta }) {
  if (aserrada.porProducto.length === 0) return <p className="text-sm text-[var(--text-tertiary)]">Nada aserrado disponible en m³.</p>;
  return (
    <DataTable>
      <thead>
        <tr>
          <th>Producto</th>
          <th>Especie</th>
          <th className="text-right">m³</th>
          <th className="text-right">Pies tablares</th>
          <th className="text-right">Corridas</th>
          <th className="text-right">Paquetes</th>
        </tr>
      </thead>
      <tbody>
        {aserrada.porProducto.map((p) => (
          <tr key={`${p.producto}:${p.especie ?? ""}`}>
            <td>{p.producto}</td>
            <td className="text-[var(--text-secondary)]">{p.especie ?? "Varias"}</td>
            <td className="text-right tabular-nums">{m3(p.m3)}</td>
            <td className="text-right tabular-nums"><Pt valor={p.pt} /></td>
            <td className="text-right tabular-nums">{formatNumber(p.corridas, 0)}</td>
            <td className="text-right tabular-nums">{formatNumber(p.paquetes, 0)}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** Lo que hay: rolliza por especie (negativas marcadas) y aserrada por producto. */
export function FichaExistencias({ porEspecie, especiesLeidas, aserrada }: Props) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <CardTitle>Rolliza por especie</CardTitle>
          <InfoTip
            title="Rolliza por especie"
            what="La existencia que sale del libro de operaciones de cada especie, al cierre del período."
            affects="Una existencia negativa significa que salió más de lo que entró: falta una guía de ingreso o sobra un despacho."
          />
        </div>
        <Especies porEspecie={porEspecie} leidas={especiesLeidas} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <CardTitle>Aserrada por producto</CardTitle>
          {aserrada && (
            <InfoTip
              title="Aserrada por producto"
              what="Lo disponible de las corridas medidas en m³."
              affects={NOTA_PT}
              example={`Su libro firma ${m3(aserrada.libroFirmaM3)} como saldo de productos: sirve para conciliar, no es lo que hay en el patio.`}
            />
          )}
        </div>
        {aserrada ? <PorProducto aserrada={aserrada} /> : <p className="text-sm"><SinLectura fuente="disponibles" /></p>}
        {aserrada && aserrada.enOtraUnidad.length > 0 && (
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-sm">
            <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
              En otra unidad (no se suma)
              <InfoTip title="En otra unidad" what="Corridas que se midieron en piezas, kilos u otra unidad." affects="No se convierten a m³ ni se suman: mezclar unidades daba cifras falsas." />
            </div>
            <ul className="mt-1 space-y-0.5 text-[var(--text-secondary)]">
              {aserrada.enOtraUnidad.map((u) => (
                <li key={u.unidad} className="tabular-nums">
                  {formatNumber(u.cantidad, 2)} {u.unidad} · {u.corridas} {u.corridas === 1 ? "corrida" : "corridas"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
