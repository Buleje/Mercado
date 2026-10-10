"use client";

/**
 * Los KPIs de Producción y Despacho del Libro CTP.
 *
 * En Producción quedaron DOS tarjetas, no nueve. Las otras siete se fueron a
 * donde de verdad pertenecen:
 *
 *  - la física del período —entró, salió, rendimiento, merma— es
 *    `CtpBalanceProduccion`: cuatro tarjetas contiguas que invitaban a restarse
 *    y no cerraban (el universo de la merma es un subconjunto del de la materia
 *    prima) hoy son UNA pieza que dice de qué habla cada número;
 *  - la deuda —sin declarar, a medio declarar, sin materia prima— es
 *    `BarraDeuda`: un contador de trabajo pendiente no describe el período,
 *    pide que hagas algo, y no se lee igual que un indicador.
 *
 * Reglas que los mantienen honestos:
 *  - la MERMA sólo sobre corridas ya declaradas **en m³** (restar `pt` a `m³`
 *    sería sumar peras con manzanas, y una corrida abierta daría merma del 100 %);
 *  - cero no se disfraza: si no hay corridas abiertas, la barra de deuda lo dice
 *    en una línea en vez de mostrar un cero mudo en una tarjeta.
 */

import { Boxes, PackageCheck, Truck, Warehouse } from "@buleje/design-system/icons";
import type { ReactNode } from "react";
import CtpKpi, { DesgloseSimple } from "./CtpKpi";
import { CtpKpisPlegables, productLabel } from "./ctp-shared";
import CtpBalanceProduccion, { GaugeRendimiento } from "./CtpBalanceProduccion";
import CtpKpiFiltros, { type CampoKpiFiltro } from "./CtpKpiFiltros";
import type { FiltrosSeccion, facetasDeSeccion } from "@/lib/forestal/ctp-secciones-filtro";
import { juzgarRendimientoLote } from "@/lib/forestal/lotes-aserrio";
import type { CtpSection } from "./ctp-section-shared";
import type { KpisSeccion } from "@/lib/forestal/ctp-kpis-seccion";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";

/* `KpisSeccion` vive donde vive su fórmula (`lib/forestal/ctp-kpis-seccion`):
   dos definiciones del mismo contrato se desincronizan a la primera cifra
   nueva, y acá el tipo es literalmente la lista de lo que la cuenta devuelve. */
export type { KpisSeccion } from "@/lib/forestal/ctp-kpis-seccion";

const n2 = (v: number) => v.toFixed(2);
export default function CtpSeccionKpis({
  section,
  kpis,
  kpisPrevios,
  etiquetaPrevio,
  soloVigentes,
  onSoloVigentes,
  sinAnexo,
  facetas,
  onFacetas,
  opciones,
  trabajoActivo = false,
  acciones,
}: {
  section: CtpSection;
  kpis: KpisSeccion;
  /** El filtro «solo registrados» está activo. */
  soloVigentes: boolean;
  onSoloVigentes: () => void;
  /** Despacho: guías vivas sin su ANEXO N° 04 — sólo para el titular de una
   *  línea. El filtro y la alerta viven en `BarraDeuda`. */
  sinAnexo?: number;
  /**
   * Los filtros que gobiernan estas cifras (ADR-400) y las opciones que de
   * verdad hay en el período. Opcionales: sin ellos las tarjetas se dibujan
   * como siempre, hablando de todo.
   */
  facetas?: FiltrosSeccion;
  onFacetas?: (f: FiltrosSeccion) => void;
  opciones?: ReturnType<typeof facetasDeSeccion>;
  /** Hay un lote elegido abajo: el panel se repliega para dejarle la pantalla. */
  trabajoActivo?: boolean;
  /**
   * Las MISMAS cifras del período anterior y cómo se llama ese lapso.
   *
   * Sin esto cada tarjeta decía un número que nadie puede juzgar: «8 despachos»
   * no contesta si el mes viene bien o mal. Vienen del hook, calculadas con la
   * misma función sobre la ventana corrida — nunca de una cuenta paralela.
   */
  kpisPrevios?: KpisSeccion | null;
  etiquetaPrevio?: string | null;
  /**
   * Los botones de la barra de la vista (buscador, «Filtros», «Opciones»,
   * el CTA…), en la MISMA fila que «Indicadores» (Brandon, 2026-09-24: «que
   * el botón de KPIs esté alineado con otros botones, para evitar que ocupe
   * mucho espacio»). Sin esto, el botón queda solo — como antes.
   */
  acciones?: ReactNode;
}) {
  const veredicto = juzgarRendimientoLote(kpis.avgRend > 0 ? kpis.avgRend : null);

  /* Todas las tarjetas van juntas detrás del botón «Indicadores» (Brandon,
     2026-09-03). Antes la primera fila quedaba fija y la segunda se pedía; con
     ocho tarjetas eso seguía empujando la tabla —que es el trabajo— media
     pantalla abajo en cada carga. El titular viaja en la línea de `resumen`. */
  /* Tocar una fila del desglose filtra por ella: el reparto contesta «¿de qué
     se compone?» y el clic contesta la que sigue, «¿cuáles son?». Sin las
     facetas cableadas el desglose sigue sirviendo, sólo que no se puede tocar. */
  const elegirEspecie =
    facetas && onFacetas ? (v: string) => onFacetas({ ...facetas, species: [v] }) : undefined;
  const elegirProducto =
    facetas && onFacetas ? (v: string) => onFacetas({ ...facetas, product: [v] }) : undefined;
  const elegirDestino =
    facetas && onFacetas ? (v: string) => onFacetas({ ...facetas, destino: [v] }) : undefined;

  const tarjetas: ReactNode[] = [];
  tarjetas.push(
    <CtpKpi
      key="count"
      label={section === "produccion" ? "Corridas" : "Despachos"}
      value={String(kpis.count)}
      subValue={soloVigentes ? "Filtrando por vigentes" : "Ver solo las vigentes"}
      icon={section === "produccion" ? Boxes : Truck}
      actual={kpis.count}
      previo={kpisPrevios ? kpisPrevios.count : undefined}
      etiquetaPrevio={etiquetaPrevio}
      onClick={onSoloVigentes}
      filtrando={soloVigentes}
      desglose={
        opciones ? <DesgloseSimple filas={opciones.species} onElegir={elegirEspecie} /> : undefined
      }
      desgloseLabel="Por especie"
    />,
  );

  if (section === "produccion") {
    /* Materia prima, Producido, Rendimiento y Merma YA NO son tarjetas: son
       `CtpBalanceProduccion`, el bloque ancho de arriba. Como tarjetas sueltas
       y contiguas invitaban a restarse entre sí y no cerraban —el universo de
       la merma es un subconjunto del de la materia prima—, y el rendimiento,
       que es LA cifra de la pestaña, se leía igual que un contador cualquiera.

       Y las tres deudas —«Sin declarar», «A medio declarar», «Sin materia
       prima»— salieron de esta grilla a `BarraDeuda`: un contador de trabajo
       pendiente no describe el período, pide que hagas algo, y encima «sin
       materia prima» se repetía literal en el cartel ámbar de abajo. */
    tarjetas.push(
      <CtpKpi
        key="en-planta"
        label="En planta"
        value={`${n2(kpis.enPatio)} m³`}
        subValue="producido que todavía no salió"
        icon={Warehouse}
        actual={kpis.enPatio}
        previo={kpisPrevios ? kpisPrevios.enPatio : undefined}
        etiquetaPrevio={etiquetaPrevio}
        /* Más stock parado no es buena noticia por sí solo: es madera
               produciendo costo y sin vender. Tampoco es mala — puede ser un
               pedido armado. Gris. */
        tono="neutral"
        desglose={
          opciones ? (
            <DesgloseSimple filas={opciones.products} onElegir={elegirProducto} />
          ) : undefined
        }
        desgloseLabel="Por producto"
        emphasis={kpis.enPatio > 0 ? "success" : "neutral"}
      />,
    );
  } else {
    tarjetas.push(
      <CtpKpi
        key="despachado"
        label="Despachado"
        value={n2(kpis.totalQty)}
        subValue={
          kpis.piezas > 0 ? `${formatNumber(kpis.piezas)} piezas` : "suma de cantidades"
        }
        icon={PackageCheck}
        actual={kpis.totalQty}
        previo={kpisPrevios ? kpisPrevios.totalQty : undefined}
        etiquetaPrevio={etiquetaPrevio}
        desglose={
          opciones ? (
            <DesgloseSimple filas={opciones.products} onElegir={elegirProducto} />
          ) : undefined
        }
        desgloseLabel="Por producto"
        emphasis="success"
      />,
      <CtpKpi
        key="guias"
        label="Guías de salida"
        value={String(kpis.guias)}
        subValue="GTF distintas emitidas"
        icon={Truck}
        actual={kpis.guias}
        previo={kpisPrevios ? kpisPrevios.guias : undefined}
        etiquetaPrevio={etiquetaPrevio}
        tono="neutral"
      />,
      <CtpKpi
        key="destinos"
        label="Destinos"
        value={String(kpis.destinos)}
        subValue="clientes o plantas distintas"
        icon={Warehouse}
        actual={kpis.destinos}
        previo={kpisPrevios ? kpisPrevios.destinos : undefined}
        etiquetaPrevio={etiquetaPrevio}
        /* Más clientes distintos es mejor que menos: concentrar toda la
               salida en un solo destino es riesgo comercial, no eficiencia. */
        desglose={
          opciones ? (
            <DesgloseSimple filas={opciones.destinos} onElegir={elegirDestino} />
          ) : undefined
        }
        desgloseLabel="Por destino"
      />,
    );
    /* «Sin anexo 04» y «Sin origen» se fueron a `BarraDeuda`, igual que en
       Producción: son deuda, no indicadores. «Sin anexo» además estaba por
       triplicado —tarjeta, chip de filtro y pastilla— para un solo concepto. */
  }

  /* El titular de la pestaña en una línea: lo que se mira de reojo sin abrir el
     panel. Sale de las mismas cuentas que las tarjetas — no es un cálculo
     aparte que pueda contradecirlas. */
  const resumen =
    section === "produccion"
      ? `${kpis.count} corrida${kpis.count === 1 ? "" : "s"} · ${n2(kpis.consumido)} m³ → ${n2(kpis.totalQty)} m³` +
        (kpis.avgRend > 0 ? ` · ${Number(kpis.avgRend).toFixed(1)} %` : "") +
        (kpis.abiertas > 0 ? ` · ${kpis.abiertas} sin declarar` : "")
      : `${kpis.count} despacho${kpis.count === 1 ? "" : "s"} · ${n2(kpis.totalQty)} · ${kpis.guias} guía${kpis.guias === 1 ? "" : "s"}` +
        ((sinAnexo ?? 0) > 0 ? ` · ${sinAnexo} sin anexo` : "");

  /**
   * Los desplegables que recortan estas cifras (ADR-400).
   *
   * Son las MISMAS facetas que filtran la tabla —`filtrarSeccion` corre una
   * sola vez para las dos cosas—, así que el número de arriba y las filas de
   * abajo no se pueden contradecir.
   */
  const campos: CampoKpiFiltro[] =
    !opciones || !facetas || !onFacetas
      ? []
      : [
          {
            key: "species",
            label: "Especie",
            todos: "Todas las especies",
            valor: facetas.species,
            opciones: opciones.species.map((f) => ({
              value: f.value,
              label: f.value,
              hint: f.volumeM3 != null ? `${f.count} · ${fmtM3(f.volumeM3)} m³` : `${f.count}`,
            })),
            onChange: (v) => onFacetas({ ...facetas, species: v }),
          },
          {
            key: "permiso",
            label: "Permiso (título habilitante)",
            todos: "Todos los permisos",
            valor: facetas.permiso,
            opciones: opciones.permisos.map((f) => ({
              value: f.value,
              label: f.value,
              hint: f.volumeM3 != null ? `${f.count} · ${fmtM3(f.volumeM3)} m³` : `${f.count}`,
            })),
            onChange: (v) => onFacetas({ ...facetas, permiso: v }),
          },
          {
            key: "product",
            label: "Producto",
            todos: "Todos los productos",
            valor: facetas.product,
            opciones: opciones.products.map((f) => ({
              value: f.value,
              label: productLabel(f.value),
              hint: f.volumeM3 != null ? `${f.count} · ${fmtM3(f.volumeM3)} m³` : `${f.count}`,
            })),
            onChange: (v) => onFacetas({ ...facetas, product: v }),
          },
          {
            key: "destino",
            label: "Destino",
            todos: "Todos los destinos",
            valor: facetas.destino,
            opciones: opciones.destinos.map((f) => ({
              value: f.value,
              label: f.value,
              hint: f.volumeM3 != null ? `${f.count} · ${fmtM3(f.volumeM3)} m³` : `${f.count}`,
            })),
            onChange: (v) => onFacetas({ ...facetas, destino: v }),
          },
        ];
  const activos = campos.filter((c) => c.valor).length;

  return (
    <CtpKpisPlegables
      claveMemoria={`seccion-${section}`}
      tarjetas={tarjetas}
      resumen={resumen}
      trabajoActivo={trabajoActivo}
      acciones={acciones}
      /* El rendimiento contra su techo, visible con el panel cerrado: es la
         cifra que decide si la corrida se puede declarar (ADR-358), y estaba
         escondida detrás del botón «Indicadores» como una más. */
      resumenExtra={
        section === "produccion" && kpis.avgRend > 0 ? (
          <GaugeRendimiento
            pct={kpis.avgRend}
            tono={veredicto.tono}
            veredicto={veredicto.texto}
            compacto
          />
        ) : undefined
      }
      /* El balance físico manda sobre las tarjetas: es de dónde salen. */
      encabezado={
        section === "produccion" ? (
          <CtpBalanceProduccion
            consumido={kpis.consumido}
            producido={kpis.totalQty}
            piezas={kpis.piezas}
            merma={kpis.merma}
            mermaPct={kpis.mermaPct}
            mermaSobre={kpis.mermaSobre}
            corridas={kpis.count}
            avgRend={kpis.avgRend}
            tono={veredicto.tono}
            veredicto={veredicto.texto}
          />
        ) : undefined
      }
      filtrosActivos={activos}
      filtros={
        campos.length > 0 && facetas && onFacetas ? (
          <CtpKpiFiltros
            campos={campos}
            onLimpiar={() =>
              onFacetas({
                ...facetas,
                species: undefined,
                permiso: undefined,
                product: undefined,
                destino: undefined,
              })
            }
            nota={
              activos > 0
                ? `Los indicadores muestran sólo ${campos
                    .filter((c) => c.valor)
                    .map((c) => `${c.label.toLowerCase()}: ${c.valor}`)
                    .join(" · ")}`
                : null
            }
          />
        ) : undefined
      }
    />
  );
}
