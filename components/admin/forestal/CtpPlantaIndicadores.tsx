/**
 * Indicadores de la vista Planta: qué se mueve en la planta AHORA según el
 * Libro (el contexto del mapa). Sacados de CtpPlantaView (2026-10-03) para que
 * la vista quepa en su tope de líneas; el contenido es el mismo.
 */
import type { ReactNode } from "react";
import { StatCard } from "@buleje/design-system";
import { useKpisPlegables } from "./kpis-plegables";
import { Map as MapIcon, Boxes, PackageCheck, Truck } from "@buleje/design-system/icons";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import type { PlantaSaldos } from "./hooks/use-planta-datos";
import { fmtArea } from "./hooks/use-planta-ubicados";

const n2 = (v: number) => v.toFixed(2);

/** Plegables (Brandon 05-10): el botón va en la fila del encabezado, el panel debajo. */
export default function usePlantaIndicadores({ zonas, areaTotal, saldos, period }: { zonas: number; areaTotal: number; saldos: PlantaSaldos | null; period: CtpPeriod }): { boton: ReactNode; panel: ReactNode } {
  return useKpisPlegables({
    claveMemoria: "ctp-planta",
    sinDatosAun: false,
    resumen: `${zonas} zona${zonas === 1 ? "" : "s"}${areaTotal > 0 ? ` (${fmtArea(areaTotal)})` : ""} · saldo ${saldos ? n2(saldos.materiaPrima.saldoM3) : "—"} m³ · terminado ${saldos ? n2(saldos.productoStock) : "—"}`,
    tarjetas: [
        <StatCard key="z" density="compact" label="Zonas mapeadas" value={String(zonas)} subValue={areaTotal > 0 ? `${fmtArea(areaTotal)} en total` : "sin dibujar"} icon={MapIcon} emphasis="neutral" />,
        /*
          ⛔ Esto NO es «el patio»: es el saldo del LIBRO por guía
          (Σ ingresos − Σ consumo declarado). Puede dar negativo cuando una
          corrida declara haber consumido más de lo que la guía trajo, y con la
          etiqueta vieja —«Materia prima en patio · troza sin consumir»— la
          pantalla llegaba a decir «−81.81 m³ de troza sin consumir», que leído
          literal es un patio con volumen negativo.

          El patio de verdad se cuenta PIEZA POR PIEZA en la pestaña Trozas, y da
          otro número a propósito: son dos preguntas distintas. Acá se dice cuál
          de las dos es ésta, y cuando el saldo no cierra se explica en vez de
          disfrazarlo de existencia.
        */
        <StatCard
          key="s"
          density="compact"
          label="Saldo del libro (por guía)"
          value={saldos ? `${n2(saldos.materiaPrima.saldoM3)} m³` : "—"}
          subValue={
            saldos && saldos.materiaPrima.saldoM3 < 0
              ? `se declaró consumir ${n2(saldos.materiaPrima.consumidoM3)} m³ y entraron ${n2(saldos.materiaPrima.ingresoM3)}`
              : "ingresado − consumido"
          }
          icon={Boxes}
          /*
            Ámbar y no rojo cuando no cierra. El rojo dice «esto está roto» y el
            libro ADMITE huecos —lo que no los admite es el certificado
            (`trazabilidadCompleta()`)—: un saldo negativo casi siempre es
            inventario de apertura, madera que ya se estaba aserrando cuando
            arrancó el libro y que nunca entró como ingreso. Pintarlo de error
            hace que el operador aprenda a ignorar el único color que debería
            frenarlo. El subtexto de acá arriba ya dice los dos números.
          */
          emphasis={saldos && saldos.materiaPrima.saldoM3 < 0 ? "warning" : "success"}
        />,
        <StatCard key="p" density="compact" label="Producto terminado" value={saldos ? n2(saldos.productoStock) : "—"} subValue="aserrada lista" icon={PackageCheck} emphasis="neutral" />,
        <StatCard key="d" density="compact" label="Despachado en el período" value={saldos ? n2(saldos.despachado) : "—"} subValue={period.label} icon={Truck} emphasis="neutral" />
    ],
  });
}
