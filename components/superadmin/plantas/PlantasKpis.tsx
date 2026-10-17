"use client";

import { StatCard } from "@buleje/design-system";
import { AlertOctagon, Layers, TreePine, Warehouse } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { PlantasListaResponse } from "@/lib/superadmin/plantas-forestales/tipos";
import { m3, NOTA_PT, pies, piezas } from "./formato";

/**
 * Los cuatro números de arriba. Los m³ y los PT son los totales que manda el
 * servidor; las piezas se cuentan acá (un conteo, no plata) y avisan si alguna
 * planta no pudo leer su patio.
 */
export function PlantasKpis({ data }: { data: PlantasListaResponse }) {
  const { totales, plantas } = data;
  const conPatio = plantas.filter((p) => p.trozas != null);
  const sinPatio = plantas.length - conPatio.length;
  const piezasPatio = conPatio.reduce((s, p) => s + (p.trozas?.enPatio.piezas ?? 0), 0);
  const sinAserrada = plantas.filter((p) => p.aserrada == null).length;
  const aviso = (n: number) => (n > 0 ? ` · ${n} sin leer` : "");

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Plantas"
        value={totales.plantas}
        icon={Warehouse}
        subValue="Con el libro forestal activado"
        density="compact"
      />
      <StatCard
        label="Trozas en patio"
        value={m3(totales.trozasM3)}
        icon={TreePine}
        subValue={`${piezas(piezasPatio)}${aviso(sinPatio)}`}
        density="compact"
        info={
          <InfoTip
            title="Trozas en patio"
            what="Rolliza recibida que todavía no entró a una corrida, sumada de todas las plantas."
            affects="Sale de la misma lectura del patio que ve cada planta en su libro."
            example="Si una planta no pudo leer su patio, no se suma y lo verás como «sin leer»."
          />
        }
      />
      <StatCard
        label="Aserrada disponible"
        value={m3(totales.aserradaM3)}
        icon={Layers}
        subValue={`${pies(totales.aserradaPt)}${aviso(sinAserrada)}`}
        density="compact"
        info={
          <InfoTip
            title="Aserrada disponible"
            what="Madera aserrada lista para despachar, sólo de las corridas medidas en m³."
            affects={NOTA_PT}
            example="Las corridas en otra unidad (piezas, kilos) no se suman: se ven en la ficha de cada planta."
          />
        }
      />
      <StatCard
        label="Plantas en rojo"
        value={totales.rojas}
        icon={AlertOctagon}
        emphasis={totales.rojas > 0 ? "error" : "success"}
        subValue={totales.rojas > 0 ? "Con existencia negativa o descuadre" : "Ninguna con descuadre"}
        density="compact"
      />
    </div>
  );
}
