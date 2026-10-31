"use client";

/**
 * Los indicadores de la vista Lotes, detrás del botón «Indicadores».
 *
 * Salieron de `CtpLotesView` (27-09) sin cambios: la vista pasaba de 800
 * líneas. Todos plegados (Brandon, 2026-09-03); el titular va en la línea de
 * resumen, que es lo que se mira de reojo. El botón viaja a la barra del
 * buscador (Brandon, 2026-09-24: «alineado con otros botones... para evitar
 * que ocupe mucho espacio»).
 */

import type { Dispatch, SetStateAction } from "react";
import { Boxes, Gauge, Layers, PackageOpen, TreePine } from "@buleje/design-system/icons";
import CtpKpi from "./CtpKpi";
import { useKpisPlegables } from "./ctp-shared";
import { juzgarRendimientoLote, pieTablarDe, type ResumenLotes } from "@/lib/forestal/lotes-aserrio";
import { formatNumber } from "@/lib/format";

/* Dos decimales y el separador del panel, como las tarjetas: «3.750» al lado
   de «1,590» se leía como tres mil. */
const m3 = (v: number) => formatNumber(v, 2);

export function useLotesIndicadores({
  resumen,
  libresEnPatio,
  estado,
  setEstado,
  onArmar,
}: {
  resumen: ResumenLotes;
  libresEnPatio: number;
  /** El filtro de estado de la vista: el indicador «Lotes abiertos» lo alterna. */
  estado: string[];
  setEstado: Dispatch<SetStateAction<string[]>>;
  onArmar: () => void;
}) {
  const veredicto = juzgarRendimientoLote(resumen.rendimientoPct);
  return useKpisPlegables({
    claveMemoria: "lotes",
    resumen: (
      `${resumen.abiertos} abierto${resumen.abiertos === 1 ? "" : "s"} · ${m3(resumen.volumenApartado)} m³ apartados · ${libresEnPatio} libre${libresEnPatio === 1 ? "" : "s"} en patio` +
      (resumen.margenTotalM3 > 0 ? ` · ${m3(resumen.margenTotalM3)} m³ por declarar` : "")
    ),
    tarjetas: [
      <CtpKpi
        key="abiertos"
        label="Lotes abiertos"
        value={String(resumen.abiertos)}
        subValue={
          estado.includes("abierto")
            ? "Filtrando por estos"
            : /* Los vacíos se DICEN aparte (ADR-357): un lote sin piezas es un
               rótulo esperando madera, no una pila en el patio. */
              `${resumen.piezasApartadas} piezas esperando la sierra${
                resumen.vacios > 0 ? ` · ${resumen.vacios} rótulo(s) sin cargar` : ""
              }`
        }
        icon={Boxes}
        /* La pastilla del KPI alterna ese valor dentro de la lista, no la
           reemplaza: así se puede tener «abierto» y otro estado a la vez. */
        onClick={() =>
          setEstado((e) => (e.includes("abierto") ? e.filter((v) => v !== "abierto") : [...e, "abierto"]))
        }
        filtrando={estado.includes("abierto")}
      />,
      <CtpKpi
        key="volumen"
        label="Volumen apartado"
        value={`${m3(resumen.volumenApartado)} m³`}
        subValue={`${formatNumber(resumen.pieTablarApartado)} pt · listos para el carro`}
        icon={TreePine}
        emphasis="success"
      />,
      <CtpKpi
        key="libres"
        label="Libres en el patio"
        value={String(libresEnPatio)}
        subValue="Piezas sin apartar — arma un lote"
        icon={PackageOpen}
        onClick={onArmar}
        emphasis={libresEnPatio > 0 ? "neutral" : "warning"}
      />,
      <CtpKpi
        key="rendimiento"
        label="Rendimiento aserrado"
        value={resumen.rendimientoPct != null ? `${resumen.rendimientoPct}%` : "—"}
        subValue={
          resumen.rendimientoPct != null
            ? `${resumen.consumidos} lote(s) aserrados · ${veredicto.texto}`
            : resumen.sinRendimiento > 0
              ? `${resumen.sinRendimiento} corrida(s) en otra unidad`
              : "Sin lotes aserrados todavía"
        }
        icon={Gauge}
        emphasis={
          veredicto.tono === "ok"
            ? "success"
            : veredicto.tono === "neutro"
              ? "neutral"
              : "warning"
        }
      />,
      <CtpKpi
        key="sobrante"
        label="Volumen sobrante"
        value={`${m3(resumen.margenTotalM3)} m³`}
        subValue={`${formatNumber(pieTablarDe(resumen.margenTotalM3))} pt · declarable desde Producción`}
        icon={Boxes}
        emphasis={resumen.margenTotalM3 > 0 ? "success" : "neutral"}
      />,
      /**
       * Lo que esta planta YA aserró, que no estaba en ninguna cifra de la
       * pestaña: `volumenAserrado` y `consumidos` los devolvía `resumenLotes`
       * desde siempre y sólo se usaban para el rendimiento. Es el otro lado
       * del «volumen apartado» — cuánto pasó por el carro y cuánto espera.
       */
      <CtpKpi
        key="aserrado"
        label="Ya aserrado"
        value={`${m3(resumen.volumenAserrado)} m³`}
        subValue={
          resumen.consumidos === 0
            ? "Ningún lote entró a la sierra todavía"
            : `${resumen.consumidos} lote${resumen.consumidos === 1 ? "" : "s"} consumido${resumen.consumidos === 1 ? "" : "s"}`
        }
        icon={Layers}
      />,
      /* Un lote es de UNA especie (ADR-337): cuántas hay dice de cuántas
       maderas distintas se está trabajando a la vez. */
      <CtpKpi
        key="especies"
        label="Especies en lotes"
        value={String(resumen.especies)}
        subValue={
          resumen.especies === 1 ? "Una sola especie en el patio" : "Distintas entre los lotes"
        }
        icon={TreePine}
      />,
    ],
    alto: "md",
  });
}
