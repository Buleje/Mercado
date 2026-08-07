"use client";

/**
 * Los KPI del ARCHIVO, que no son los de la bandeja (ADR-357).
 *
 * «GTF ingresadas» mostraba las mismas cinco tarjetas que Ingresos: «Ingresos
 * del período», «Pendientes validar», «Fuera de plazo», «Especies CITES». En el
 * archivo dos de ellas **no pueden decir nada**: ahí todo está recepcionado y
 * validado por definición, así que «Pendientes validar» es siempre 0 y el
 * operador aprende a no mirar la fila entera.
 *
 * Lo que sí se pregunta parado en esta pestaña es otra cosa: *¿cuántas guías
 * entraron?, ¿cuánta madera bajó del camión?, ¿cuántas piezas quedaron para la
 * sierra?, ¿alguna no cuadra?*
 *
 * Se calcula de las guías que la tabla ya tiene en memoria: sin un pedido más y
 * sin poder contradecir a la tabla de abajo, que es de donde salen.
 */

import { Boxes, Layers, PackageCheck, Scale, TreePine } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";

import { cuadreDeIngreso, descuadra } from "@/lib/forestal/cuadre-trozas";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import type { WoodEntry } from "./ctp-shared";

const nf = (n: number) => n.toLocaleString("es-PE");

export default function CtpGtfIngresadasKpis({ guias }: { guias: GuiaIngreso<WoodEntry>[] }) {
  const volumen = guias.reduce((a, g) => a + g.volumenM3, 0);
  const piezas = guias.reduce((a, g) => a + g.trozasCount, 0);
  const recibidas = guias.reduce((a, g) => a + g.trozasDecididas, 0);
  const especies = new Set(guias.flatMap((g) => g.especies.map((e) => e.comun))).size;
  const sinCuadrar = guias.filter((g) =>
    descuadra(cuadreDeIngreso(g.volumenM3, g.trozasM3, g.trozasCount)),
  ).length;

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-5">
      <div className="w-[15rem] shrink-0 snap-start sm:w-auto sm:shrink">
        <StatCard
          density="compact"
          label="Guías ingresadas"
          value={nf(guias.length)}
          subValue={`${nf(guias.reduce((a, g) => a + g.lineas.length, 0))} asientos del libro`}
          icon={PackageCheck}
          emphasis="neutral"
        />
      </div>
      <div className="w-[15rem] shrink-0 snap-start sm:w-auto sm:shrink">
        <StatCard
          density="compact"
          label="Volumen recibido"
          value={`${volumen.toFixed(2)} m³`}
          subValue={`${nf(pieTablarDe(volumen))} pt`}
          icon={Boxes}
          emphasis="neutral"
        />
      </div>
      <div className="w-[15rem] shrink-0 snap-start sm:w-auto sm:shrink">
        <StatCard
          density="compact"
          label="Piezas del archivo"
          value={nf(piezas)}
          /* Recibidas vs declaradas: una guía puede traer diez y haber bajado
             ocho (ADR-325). El hueco se ve acá, no en la fila. */
          subValue={piezas > 0 ? `${nf(recibidas)} con recepción cerrada` : "sin lista de piezas"}
          icon={Layers}
          emphasis={piezas > 0 && recibidas < piezas ? "warning" : "neutral"}
        />
      </div>
      <div className="w-[15rem] shrink-0 snap-start sm:w-auto sm:shrink">
        <StatCard
          density="compact"
          label="Especies en el archivo"
          value={nf(especies)}
          subValue="distintas en estas guías"
          icon={TreePine}
          emphasis="neutral"
        />
      </div>
      <div className="w-[15rem] shrink-0 snap-start sm:w-auto sm:shrink">
        <StatCard
          density="compact"
          label="Guías sin cuadrar"
          value={nf(sinCuadrar)}
          subValue={sinCuadrar > 0 ? "no se pueden consumir" : "todas cuadran"}
          icon={Scale}
          emphasis={sinCuadrar > 0 ? "warning" : "success"}
        />
      </div>
    </div>
  );
}
