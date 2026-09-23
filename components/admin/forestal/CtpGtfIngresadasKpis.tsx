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

import {
  Boxes,
  CalendarClock,
  FileStack,
  Layers,
  PackageCheck,
  Scale,
  TreePine,
} from "@buleje/design-system/icons";
import CtpKpi, { DesgloseSimple, type FilaDesglose } from "./CtpKpi";

import { cuadreDeIngreso, descuadra } from "@/lib/forestal/cuadre-trozas";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import {
  CtpKpisPlegables,
  estaFueraDePlazo,
  PLAZO_REGISTRO_DIAS,
  type WoodEntry,
} from "./ctp-shared";
import { formatNumber } from "@/lib/format";

const nf = (n: number) => formatNumber(n);

export default function CtpGtfIngresadasKpis({
  guias,
  lateOn,
  onLate,
  filtros,
  filtrosActivos = 0,
}: {
  guias: GuiaIngreso<WoodEntry>[];
  /** El filtro «fuera de plazo» del panel, para que la tarjeta lo refleje. */
  lateOn?: boolean;
  onLate?: () => void;
  /**
   * La fila que recorta estas cifras (ADR-400): los MISMOS filtros de servidor
   * que la bandeja —especie, permiso, proveedor, producto—, porque el archivo
   * es el mismo libro leído del otro lado de la recepción.
   */
  filtros?: React.ReactNode;
  filtrosActivos?: number;
}) {
  const volumen = guias.reduce((a, g) => a + g.volumenM3, 0);
  const piezas = guias.reduce((a, g) => a + g.trozasCount, 0);
  const recibidas = guias.reduce((a, g) => a + g.trozasDecididas, 0);
  const especies = new Set(guias.flatMap((g) => g.especies.map((e) => e.comun))).size;
  const sinCuadrar = guias.filter((g) =>
    descuadra(cuadreDeIngreso(g.volumenM3, g.trozasM3, g.trozasCount)),
  ).length;
  /**
   * Guías con al menos un asiento registrado tarde.
   *
   * En el ARCHIVO esto no es una tarea pendiente —ya pasó— pero sí es el dato
   * que cruza un fiscalizador: el plazo de registro es de 2 días hábiles
   * (RDE D000025-2023). El helper es el mismo que pinta el badge de la fila,
   * así que la cifra y la tabla no pueden decir cosas distintas.
   */
  const tarde = guias.filter((g) => g.lineas.some((l) => estaFueraDePlazo(l))).length;
  /** De cuántos títulos habilitantes / predios vino esta madera. */
  const titulos = new Set(guias.map((g) => (g.originCode ?? "").trim()).filter(Boolean)).size;

  /**
   * Los repartos que hay detrás de cada cifra.
   *
   * Salen de las MISMAS guías que ya están en pantalla: no hay una consulta
   * nueva ni una cuenta paralela, sólo se muestra lo que la tarjeta resume y
   * que antes había que ir a buscar filtrando de a una.
   */
  const juntar = (
    clave: (g: GuiaIngreso<WoodEntry>) => string | null,
    peso: (g: GuiaIngreso<WoodEntry>) => number,
  ): FilaDesglose[] => {
    const map = new Map<string, { count: number; peso: number }>();
    for (const g of guias) {
      const k = (clave(g) ?? "").trim();
      if (!k) continue;
      const prev = map.get(k) ?? { count: 0, peso: 0 };
      map.set(k, { count: prev.count + 1, peso: prev.peso + peso(g) });
    }
    return [...map].map(([value, v]) => ({ value, count: v.count, volumeM3: v.peso }));
  };
  const porProveedor = juntar(
    (g) => g.providerName,
    (g) => g.volumenM3,
  );
  const porTitulo = juntar(
    (g) => g.originCode,
    (g) => g.volumenM3,
  );
  const porEspecie: FilaDesglose[] = (() => {
    const map = new Map<string, { count: number; peso: number }>();
    for (const g of guias) {
      for (const e of g.especies) {
        const k = e.comun.trim();
        if (!k) continue;
        const prev = map.get(k) ?? { count: 0, peso: 0 };
        map.set(k, { count: prev.count + e.piezas, peso: prev.peso + e.volumenM3 });
      }
    }
    return [...map].map(([value, v]) => ({ value, count: v.count, volumeM3: v.peso }));
  })();

  return (
    /* Todas detrás del botón «Indicadores» (Brandon, 2026-09-03); el titular va
       en la línea de resumen. */
    <CtpKpisPlegables
      claveMemoria="gtf-ingresadas"
      filtros={filtros}
      filtrosActivos={filtrosActivos}
      resumen={
        guias.length === 0
          ? "Sin guías en el archivo del período"
          : `${nf(guias.length)} guía${guias.length === 1 ? "" : "s"} · ${volumen.toFixed(2)} m³ · ${nf(piezas)} piezas` +
            (sinCuadrar > 0 ? ` · ${nf(sinCuadrar)} sin cuadrar` : "") +
            (tarde > 0 ? ` · ${nf(tarde)} fuera de plazo` : "")
      }
      tarjetas={[
        <CtpKpi
          key="guias"
          label="Guías ingresadas"
          value={nf(guias.length)}
          subValue={`${nf(guias.reduce((a, g) => a + g.lineas.length, 0))} asientos del libro`}
          icon={PackageCheck}
          desglose={porProveedor.length > 0 ? <DesgloseSimple filas={porProveedor} /> : undefined}
          desgloseLabel="Por proveedor"
        />,
        <CtpKpi
          key="volumen"
          label="Volumen recibido"
          value={`${volumen.toFixed(2)} m³`}
          subValue={`${nf(pieTablarDe(volumen))} pt`}
          icon={Boxes}
          desglose={porEspecie.length > 0 ? <DesgloseSimple filas={porEspecie} /> : undefined}
          desgloseLabel="Por especie"
        />,
        <CtpKpi
          key="piezas"
          density="compact"
          label="Piezas del archivo"
          value={nf(piezas)}
          /* Recibidas vs declaradas: una guía puede traer diez y haber bajado
             ocho (ADR-325). El hueco se ve acá, no en la fila. */
          subValue={piezas > 0 ? `${nf(recibidas)} con recepción cerrada` : "sin lista de piezas"}
          icon={Layers}
          emphasis={piezas > 0 && recibidas < piezas ? "warning" : "neutral"}
        />,
        <CtpKpi
          key="especies"
          label="Especies en el archivo"
          value={nf(especies)}
          subValue="distintas en estas guías"
          icon={TreePine}
          desglose={porEspecie.length > 0 ? <DesgloseSimple filas={porEspecie} /> : undefined}
          desgloseLabel="Cuánto trajo cada una"
        />,
        <CtpKpi
          key="titulos"
          label="Títulos habilitantes"
          value={nf(titulos)}
          subValue={
            titulos === 0
              ? "ninguna guía declara código de origen"
              : `predios o concesiones de origen${titulos < guias.length ? ` · ${nf(guias.length - titulos)} guía(s) sin código` : ""}`
          }
          icon={FileStack}
          desglose={porTitulo.length > 0 ? <DesgloseSimple filas={porTitulo} /> : undefined}
          desgloseLabel="Cuánto vino de cada uno"
          emphasis={titulos === 0 && guias.length > 0 ? "warning" : "neutral"}
        />,
        <CtpKpi
          key="plazo"
          label="Fuera de plazo"
          value={nf(tarde)}
          subValue={
            tarde > 0
              ? lateOn
                ? "Filtrando por estas"
                : `registradas después de los ${PLAZO_REGISTRO_DIAS} días hábiles · ver`
              : "todas se registraron a tiempo"
          }
          icon={CalendarClock}
          /* Registrar más guías tarde es peor, no mejor: el día que esta cifra
             tenga contra qué compararse, el color tiene que decir eso. */
          tono="inverso"
          onClick={tarde > 0 ? onLate : undefined}
          filtrando={lateOn}
          emphasis={tarde > 0 ? "warning" : "success"}
        />,
        <CtpKpi
          key="cuadre"
          label="Guías sin cuadrar"
          value={nf(sinCuadrar)}
          subValue={sinCuadrar > 0 ? "no se pueden consumir" : "todas cuadran"}
          icon={Scale}
          tono="inverso"
          emphasis={sinCuadrar > 0 ? "warning" : "success"}
        />,
      ]}
    />
  );
}
