"use client";

/**
 * Tiempos y atascados del Análisis (N06).
 *  - Tiempos: cuánto tarda cada paso (mediana, promedio y el 10 % más lento),
 *    con cuántos pedidos se midió; con menos de 5 dice «muestra chica».
 *  - Atascados: pedidos en marcha que llevan más de 2 h en el mismo paso.
 * Cada cifra trae los números de pedido de donde sale.
 */

import { DataTable } from "@buleje/design-system";
import { CheckCircle2, Timer } from "@buleje/design-system/icons";
import { MUESTRA_MINIMA, ROTULO_ESTADO, textoDuracion, type Atascado, type Etapa, type Muestra } from "@/lib/pedidos/analisis-operativo";
import { NumerosDePedido, Vacio } from "@/components/admin/pedidos/preparacion/piezas";

function FilaMuestra({ rotulo, detalle, m }: { rotulo: string; detalle: string; m: Muestra }) {
  const chica = m.n > 0 && m.n < MUESTRA_MINIMA;
  return (
    <tr>
      <td>
        <span className="block font-semibold text-[var(--text-primary)]">{rotulo}</span>
        <span className="block text-xs text-[var(--text-tertiary)]">{detalle}</span>
      </td>
      <td className="text-right font-bold tabular-nums">{textoDuracion(m.medianaMs)}</td>
      <td className="text-right tabular-nums">{textoDuracion(m.promedioMs)}</td>
      <td className="text-right tabular-nums">{textoDuracion(m.p90Ms)}</td>
      <td className="text-right tabular-nums">
        {m.n}
        {chica && <span className="block text-xs font-semibold text-[var(--data-warning-ink)]">muestra chica</span>}
      </td>
      <td>{m.n > 0 ? <NumerosDePedido ids={m.ids.map((id) => ({ id }))} total={m.n} max={3} etiqueta={`Los más lentos en ${rotulo}`} /> : "—"}</td>
    </tr>
  );
}

export function SeccionTiempos({ etapas, hastaEntregar }: { etapas: readonly Etapa[]; hastaEntregar: Muestra }) {
  if (etapas.every((e) => e.muestra.n === 0) && hastaEntregar.n === 0) {
    return <Vacio icono={Timer} texto="Todavía no hay pedidos que hayan pasado de un paso a otro en este período." />;
  }
  return (
    <DataTable>
      <thead>
        <tr>
          <th>Paso</th>
          <th className="text-right">Lo normal</th>
          <th className="text-right">Promedio</th>
          <th className="text-right">Los lentos, más de</th>
          <th className="text-right">Medidos</th>
          <th>Los más lentos</th>
        </tr>
      </thead>
      <tbody>
        {etapas.map((e) => (
          <FilaMuestra
            key={e.clave}
            rotulo={e.rotulo}
            detalle={`De «${ROTULO_ESTADO[e.de] ?? e.de}» a «${ROTULO_ESTADO[e.a] ?? e.a}»`}
            m={e.muestra}
          />
        ))}
        <FilaMuestra rotulo="De punta a punta" detalle="Desde que entra hasta que se entrega" m={hastaEntregar} />
      </tbody>
    </DataTable>
  );
}

export function SeccionAtascados({ atascados }: { atascados: readonly Atascado[] }) {
  if (atascados.length === 0) {
    return <Vacio icono={CheckCircle2} texto="Ningún pedido en marcha lleva más de 2 horas en el mismo paso." />;
  }
  return (
    <DataTable>
      <thead>
        <tr>
          <th>Pedido</th>
          <th>Cliente</th>
          <th>Está en</th>
          <th className="text-right">Hace</th>
        </tr>
      </thead>
      <tbody>
        {atascados.map((a) => (
          <tr key={a.id}>
            <td><NumerosDePedido ids={[{ id: a.id }]} /></td>
            <td className="text-[var(--text-primary)]">{a.cliente}</td>
            <td>{ROTULO_ESTADO[a.estado] ?? a.estado}</td>
            <td className="text-right font-semibold tabular-nums text-[var(--data-warning-ink)]">{textoDuracion(a.ms)}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
