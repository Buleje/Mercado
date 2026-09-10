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
 *    `CtpBarraDeuda`: un contador de trabajo pendiente no describe el período,
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
import { StatCard } from "@buleje/design-system";
import { CtpKpisPlegables, productLabel } from "./ctp-shared";
import CtpBalanceProduccion, { GaugeRendimiento } from "./CtpBalanceProduccion";
import CtpKpiFiltros, { type CampoKpiFiltro } from "./CtpKpiFiltros";
import type { FiltrosSeccion, facetasDeSeccion } from "@/lib/forestal/ctp-secciones-filtro";
import { juzgarRendimientoLote } from "@/lib/forestal/lotes-aserrio";
import type { CtpSection } from "./ctp-section-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/** Lo que la vista ya calculó del período (ver `use-ctp-secciones`). */
export interface KpisSeccion {
  count: number;
  totalQty: number;
  consumido: number;
  avgRend: number;
  abiertas: number;
  consumidoAbierto: number;
  merma: number;
  mermaSobre: number;
  mermaPct: number;
  sinMateriaPrima: number;
  enPatio: number;
  sinOrigen: number;
  guias: number;
  destinos: number;
  piezas: number;
}

const n2 = (v: number) => v.toFixed(2);
/** Anillo de la tarjeta que está filtrando: si no, nadie sabe por qué la tabla tiene menos filas. */
const ANILLO = "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)]";

export default function CtpSeccionKpis({
  section,
  kpis,
  soloVigentes,
  onSoloVigentes,
  sinAnexo,
  facetas,
  onFacetas,
  opciones,
  trabajoActivo = false,
}: {
  section: CtpSection;
  kpis: KpisSeccion;
  /** El filtro «solo registrados» está activo. */
  soloVigentes: boolean;
  onSoloVigentes: () => void;
  /** Despacho: guías vivas sin su ANEXO N° 04 — sólo para el titular de una
   *  línea. El filtro y la alerta viven en `CtpBarraDeuda`. */
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
}) {
  const veredicto = juzgarRendimientoLote(kpis.avgRend > 0 ? kpis.avgRend : null);

  /* Todas las tarjetas van juntas detrás del botón «Indicadores» (Brandon,
     2026-09-03). Antes la primera fila quedaba fija y la segunda se pedía; con
     ocho tarjetas eso seguía empujando la tabla —que es el trabajo— media
     pantalla abajo en cada carga. El titular viaja en la línea de `resumen`. */
  const tarjetas: ReactNode[] = [];
  tarjetas.push(
      <StatCard
        key="count"
        density="compact"
        label={section === "produccion" ? "Corridas" : "Despachos"}
        value={String(kpis.count)}
        subValue={soloVigentes ? "Filtrando por vigentes" : "Ver solo las vigentes"}
        icon={section === "produccion" ? Boxes : Truck}
        emphasis="neutral"
        onClick={onSoloVigentes}
        className={soloVigentes ? ANILLO : undefined}
      />,
  );

  if (section === "produccion") {
    /* Materia prima, Producido, Rendimiento y Merma YA NO son tarjetas: son
       `CtpBalanceProduccion`, el bloque ancho de arriba. Como tarjetas sueltas
       y contiguas invitaban a restarse entre sí y no cerraban —el universo de
       la merma es un subconjunto del de la materia prima—, y el rendimiento,
       que es LA cifra de la pestaña, se leía igual que un contador cualquiera.

       Y las tres deudas —«Sin declarar», «A medio declarar», «Sin materia
       prima»— salieron de esta grilla a `CtpBarraDeuda`: un contador de trabajo
       pendiente no describe el período, pide que hagas algo, y encima «sin
       materia prima» se repetía literal en el cartel ámbar de abajo. */
    tarjetas.push(
          <StatCard
            key="en-planta"
            density="compact"
            label="En planta"
            value={`${n2(kpis.enPatio)} m³`}
            subValue="producido que todavía no salió"
            icon={Warehouse}
            emphasis={kpis.enPatio > 0 ? "success" : "neutral"}
          />,
    );
  } else {
    tarjetas.push(
          <StatCard
            key="despachado"
            density="compact"
            label="Despachado"
            value={n2(kpis.totalQty)}
            subValue={kpis.piezas > 0 ? `${kpis.piezas.toLocaleString("es-PE")} piezas` : "suma de cantidades"}
            icon={PackageCheck}
            emphasis="success"
          />,
          <StatCard
            key="guias"
            density="compact"
            label="Guías de salida"
            value={String(kpis.guias)}
            subValue="GTF distintas emitidas"
            icon={Truck}
            emphasis="neutral"
          />,
          <StatCard
            key="destinos"
            density="compact"
            label="Destinos"
            value={String(kpis.destinos)}
            subValue="clientes o plantas distintas"
            icon={Warehouse}
            emphasis="neutral"
          />,
    );
    /* «Sin anexo 04» y «Sin origen» se fueron a `CtpBarraDeuda`, igual que en
       Producción: son deuda, no indicadores. «Sin anexo» además estaba por
       triplicado —tarjeta, chip de filtro y pastilla— para un solo concepto. */
  }

  /* El titular de la pestaña en una línea: lo que se mira de reojo sin abrir el
     panel. Sale de las mismas cuentas que las tarjetas — no es un cálculo
     aparte que pueda contradecirlas. */
  const resumen =
    section === "produccion"
      ? `${kpis.count} corrida${kpis.count === 1 ? "" : "s"} · ${n2(kpis.consumido)} m³ → ${n2(kpis.totalQty)} m³` +
        (kpis.avgRend > 0 ? ` · ${kpis.avgRend.toFixed(1)} %` : "") +
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
  const campos: CampoKpiFiltro[] = !opciones || !facetas || !onFacetas
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
      /* El rendimiento contra su techo, visible con el panel cerrado: es la
         cifra que decide si la corrida se puede declarar (ADR-358), y estaba
         escondida detrás del botón «Indicadores» como una más. */
      resumenExtra={
        section === "produccion" && kpis.avgRend > 0 ? (
          <GaugeRendimiento pct={kpis.avgRend} tono={veredicto.tono} veredicto={veredicto.texto} compacto />
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
              onFacetas({ ...facetas, species: undefined, permiso: undefined, product: undefined, destino: undefined })
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
