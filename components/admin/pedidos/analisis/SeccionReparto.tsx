"use client";

/**
 * Cancelados y reparto del Análisis (N06).
 *  - Cancelados: por motivo (como lo escribieron), cuánto sumaban y en qué
 *    paso estaban al cancelarse.
 *  - Reparto: entregas por repartidor (sólo lo entregado) y por zona. La zona
 *    se deduce del nombre de la zona o de sus barrios escrito en la dirección:
 *    es un derivado, y sin zonas guardadas en Ajustes no se calcula.
 * Montos y sumas vienen del servidor.
 */

import { CardTitle, DataTable } from "@buleje/design-system";
import { Ban, Bike, MapPin } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { ROTULO_ESTADO, textoDuracion, type AnalisisOperativo, type Cancelacion } from "@/lib/pedidos/analisis-operativo";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { NumerosDePedido, Vacio } from "@/components/admin/pedidos/preparacion/piezas";

const enPalabras = (desde: Cancelacion["desde"]) =>
  Object.entries(desde)
    .sort((a, b) => b[1] - a[1])
    .map(([estado, n]) => `${ROTULO_ESTADO[estado] ?? estado} ${n}`)
    .join(" · ");

export function SeccionCancelados({ cancelados }: { cancelados: readonly Cancelacion[] }) {
  if (cancelados.length === 0) return <Vacio icono={Ban} texto="Ningún pedido cancelado en este período." />;
  return (
    <DataTable>
      <thead>
        <tr>
          <th>Motivo</th>
          <th className="text-right">Pedidos</th>
          <th className="text-right">Sumaban</th>
          <th>Estaban en</th>
          <th>Cuáles</th>
        </tr>
      </thead>
      <tbody>
        {cancelados.map((c) => (
          <tr key={c.motivo}>
            <td className="font-semibold text-[var(--text-primary)]">{c.motivo}</td>
            <td className="text-right tabular-nums">{c.pedidos}</td>
            <td className="text-right tabular-nums">{formatCurrency(c.monto)}</td>
            <td className="text-sm">{enPalabras(c.desde)}</td>
            <td><NumerosDePedido ids={c.ids.map((id) => ({ id }))} total={c.pedidos} max={4} etiqueta={`Cancelados por ${c.motivo}`} /></td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

export function SeccionReparto({ a }: { a: AnalisisOperativo }) {
  const { costoReparto: costo } = a;
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Por repartidor</CardTitle>
          <span className="text-sm text-[var(--text-secondary)]">
            {costo.entregadosConTarifa > 0
              ? `Costo de reparto anotado: ${formatCurrency(costo.total)} en ${costo.entregadosConTarifa} de ${costo.entregados} entregados`
              : "Ningún entregado tiene tarifa de reparto anotada"}
          </span>
        </div>
        {a.repartidores.length === 0 ? (
          <Vacio icono={Bike} texto="Ningún pedido entregado en este período." />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Repartidor</th>
                <th className="text-right">Entregados</th>
                <th className="text-right">En camino, lo normal</th>
                <th className="text-right">Tarifas anotadas</th>
                <th>Cuáles</th>
              </tr>
            </thead>
            <tbody>
              {a.repartidores.map((r) => (
                <tr key={r.nombre}>
                  <td className="font-semibold text-[var(--text-primary)]">{r.nombre}</td>
                  <td className="text-right tabular-nums">{r.entregados}</td>
                  <td className="text-right tabular-nums">
                    {textoDuracion(r.enCamino.medianaMs)}
                    {r.enCamino.n > 0 && <span className="block text-xs text-[var(--text-tertiary)]">{r.enCamino.n} medidos</span>}
                  </td>
                  <td className="text-right tabular-nums">{r.costo == null ? "—" : formatCurrency(r.costo)}</td>
                  <td><NumerosDePedido ids={r.ids.map((id) => ({ id }))} total={r.entregados} max={4} etiqueta={`Entregados por ${r.nombre}`} /></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <CardTitle>Por zona</CardTitle>
          <InfoTip
            title="Zona deducida"
            what="Los pedidos no guardan su zona: se reconoce buscando el nombre de cada zona de Ajustes › Delivery, o de sus barrios, dentro de la dirección escrita."
            affects="Es un cálculo aproximado. Una dirección sin el nombre de la zona cae en «Sin zona reconocida»."
            example="«Jr. Ucayali 340, Yarinacocha» cuenta en la zona Yarinacocha."
          />
        </div>
        {a.zonasConfiguradas === 0 ? (
          <Vacio icono={MapPin} texto="Sin zonas guardadas en Ajustes › Delivery: guárdalas para ver los pedidos por zona." />
        ) : a.zonas.length === 0 ? (
          <Vacio icono={MapPin} texto="Ningún pedido en este período." />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Zona</th>
                <th className="text-right">Pedidos</th>
                <th className="text-right">Entregados</th>
                <th className="text-right">Cancelados</th>
                <th>Cuáles</th>
              </tr>
            </thead>
            <tbody>
              {a.zonas.map((z) => (
                <tr key={z.zona}>
                  <td className="font-semibold text-[var(--text-primary)]">{z.zona}</td>
                  <td className="text-right tabular-nums">{z.pedidos}</td>
                  <td className="text-right tabular-nums">{z.entregados}</td>
                  <td className="text-right tabular-nums">{z.cancelados}</td>
                  <td><NumerosDePedido ids={z.ids.map((id) => ({ id }))} total={z.pedidos} max={4} etiqueta={`Pedidos de ${z.zona}`} /></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>
    </div>
  );
}
