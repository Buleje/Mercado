"use client";

import { StatCard } from "@buleje/design-system";
import { ClipboardCheck, Gauge, Layers, TreePine, Truck, Clock } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { PlantaResumen } from "@/lib/superadmin/plantas-forestales/tipos";
import { Pt, SinLectura } from "./cifras";
import { diaCorto, m3, NOTA_PT, NOTA_PT_ROLLIZA, pct, piezas } from "./formato";

/** Las cifras de volumen de una planta. Lo que no se leyó sale «—» con aviso, nunca 0. */
export function FichaKpis({ resumen }: { resumen: PlantaResumen }) {
  const { trozas, aserrada, movimiento, cumplimiento, lecturas } = resumen;
  const sinLeer = (f: Parameters<typeof SinLectura>[0]["fuente"]) => <SinLectura fuente={f} />;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
      <StatCard
        label="Trozas en patio"
        icon={TreePine}
        density="compact"
        value={trozas ? m3(trozas.enPatio.m3) : sinLeer("patio")}
        subValue={trozas ? <>{piezas(trozas.enPatio.piezas)} · <Pt valor={trozas.enPatio.ptAserrable} nota={NOTA_PT_ROLLIZA} /></> : undefined}
        info={<InfoTip title="Trozas en patio" what="Rolliza recibida que todavía no entró a una corrida." affects={NOTA_PT_ROLLIZA} />}
      />
      <StatCard
        label="Por recepcionar"
        icon={Truck}
        density="compact"
        value={trozas ? m3(trozas.porRecepcionar.m3) : sinLeer("patio")}
        subValue={trozas ? `${piezas(trozas.porRecepcionar.piezas)}${trozas.pendienteSinPiezasM3 > 0 ? ` · ${m3(trozas.pendienteSinPiezasM3)} sin piezas` : ""}` : undefined}
        info={
          <InfoTip
            title="Por recepcionar"
            what="Guías de ingreso que llegaron pero todavía no tienen sus trozas recibidas en el patio."
            example="«sin piezas» son guías con volumen pero sin el detalle de trozas."
          />
        }
      />
      <StatCard
        label="Trozas varadas"
        icon={Clock}
        density="compact"
        emphasis={trozas && trozas.varadas.piezas > 0 ? "warning" : "neutral"}
        value={trozas ? piezas(trozas.varadas.piezas) : sinLeer("patio")}
        subValue={trozas ? `${m3(trozas.varadas.m3)} · más de ${trozas.varadas.dias} días` : undefined}
        info={<InfoTip title="Trozas varadas" what="Trozas que llevan mucho tiempo en el patio sin entrar a una corrida." affects="Se rajan y pierden rendimiento: conviene aserrarlas primero." />}
      />
      <StatCard
        label="Aserrada disponible"
        icon={Layers}
        density="compact"
        value={aserrada ? m3(aserrada.disponibleM3) : sinLeer("disponibles")}
        subValue={aserrada ? <><Pt valor={aserrada.disponiblePt} /> · {aserrada.paquetes} paq.</> : undefined}
        info={<InfoTip title="Aserrada disponible" what="Madera aserrada lista para despachar, de las corridas medidas en m³." affects={NOTA_PT} example="Lo que está en otra unidad (piezas, kilos) va aparte en Existencias y no se suma." />}
      />
      <StatCard
        label="Rendimiento"
        icon={Gauge}
        density="compact"
        value={movimiento ? pct(movimiento.rendimientoPct) : sinLeer(lecturas.rendimiento === "error" ? "rendimiento" : "saldos")}
        subValue={movimiento ? `Producido ${m3(movimiento.producidoM3)}` : undefined}
        info={<InfoTip title="Rendimiento del período" what="Cuánta aserrada salió de la rolliza que entró a corridas en el período, como lo calcula su libro." example="«—» sin corridas en el período: no hay con qué comparar." />}
      />
      <StatCard
        label="Cumplimiento"
        icon={ClipboardCheck}
        density="compact"
        emphasis={cumplimiento ? cumplimiento.tono : "neutral"}
        value={cumplimiento ? `${cumplimiento.score} / 100` : lecturas.cumplimiento === "error" ? sinLeer("cumplimiento") : "Sin medir"}
        subValue={cumplimiento ? `Medido el ${diaCorto(cumplimiento.fecha)}` : undefined}
        info={<InfoTip title="Cumplimiento" what="La última nota del libro CTP frente a lo que pide SERFOR (guías, saldos, formatos)." />}
      />
    </div>
  );
}
