"use client";

/**
 * Los KPIs de Producción y Despacho del Libro CTP.
 *
 * Antes eran tres tarjetas y una de ellas escondía un número de primera: los m³
 * de materia prima consumida vivían como subtítulo del rendimiento. Estos ocho
 * responden lo que se pregunta el aserradero mirando el período:
 *
 *   ¿cuánto entró? ¿cuánto salió? ¿a qué rendimiento? ¿cuánto se perdió?
 *   ¿qué queda en planta? ¿qué me falta declarar? ¿qué no tiene origen?
 *
 * Reglas que los mantienen honestos:
 *  - la MERMA sólo sobre corridas ya declaradas **en m³** (restar `pt` a `m³`
 *    sería sumar peras con manzanas, y una corrida abierta daría merma del 100 %);
 *  - lo que es DEUDA o AGUJERO se pinta de warning/error y lleva a arreglarlo,
 *    no es decorado;
 *  - cero no se disfraza: si no hay corridas abiertas, la tarjeta lo dice en
 *    verde en vez de mostrar un cero mudo.
 */

import {
  AlertTriangle,
  Boxes,
  FileX,
  Layers,
  PackageCheck,
  PackageOpen,
  PackagePlus,
  Scale,
  Scissors,
  Truck,
  Warehouse,
} from "@buleje/design-system/icons";
import type { ReactNode } from "react";
import { StatCard } from "@buleje/design-system";
import { CtpKpisPlegables, productLabel } from "./ctp-shared";
import CtpKpiFiltros, { type CampoKpiFiltro } from "./CtpKpiFiltros";
import type { FiltrosSeccion, facetasDeSeccion } from "@/lib/forestal/ctp-secciones-filtro";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
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

/** El veredicto del rendimiento habla en sus tonos; la tarjeta, en los suyos. */
const TONO_A_EMPHASIS = {
  ok: "success",
  aviso: "warning",
  malo: "error",
  neutro: "neutral",
} as const;

const n2 = (v: number) => v.toFixed(2);
/** Anillo de la tarjeta que está filtrando: si no, nadie sabe por qué la tabla tiene menos filas. */
const ANILLO = "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)]";

export default function CtpSeccionKpis({
  section,
  kpis,
  soloVigentes,
  onSoloVigentes,
  sinAnexo,
  soloSinAnexo,
  onSoloSinAnexo,
  onVerPendientes,
  ampliables = 0,
  facetas,
  onFacetas,
  opciones,
}: {
  section: CtpSection;
  kpis: KpisSeccion;
  /** El filtro «solo registrados» está activo. */
  soloVigentes: boolean;
  onSoloVigentes: () => void;
  /** Despacho: guías vivas sin su ANEXO N° 04. */
  sinAnexo?: number;
  soloSinAnexo?: boolean;
  onSoloSinAnexo?: () => void;
  /** Producción: abrir el menú de corridas sin declarar. */
  onVerPendientes?: () => void;
  /**
   * Producción: corridas que YA declararon y todavía admiten más bajo el tope
   * (ADR-365). Es deuda del libro igual que las abiertas —salió más madera de
   * la misma corrida y falta anotarla— y hasta ahora sólo se veía como un
   * ícono en la fila.
   */
  ampliables?: number;
  /**
   * Los filtros que gobiernan estas cifras (ADR-400) y las opciones que de
   * verdad hay en el período. Opcionales: sin ellos las tarjetas se dibujan
   * como siempre, hablando de todo.
   */
  facetas?: FiltrosSeccion;
  onFacetas?: (f: FiltrosSeccion) => void;
  opciones?: ReturnType<typeof facetasDeSeccion>;
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
    tarjetas.push(
          <StatCard
            key="materia"
            density="compact"
            label="Materia prima"
            value={`${n2(kpis.consumido)} m³`}
            subValue={`${pieTablarDe(kpis.consumido).toLocaleString("es-PE")} pt a la sierra`}
            icon={Layers}
            emphasis="neutral"
          />,
          <StatCard
            key="producido"
            density="compact"
            label="Producido"
            value={`${n2(kpis.totalQty)} m³`}
            subValue={kpis.piezas > 0 ? `${kpis.piezas.toLocaleString("es-PE")} piezas declaradas` : "suma de lo declarado"}
            icon={PackageCheck}
            emphasis="success"
          />,
          <StatCard
            key="rendimiento"
            density="compact"
            label="Rendimiento prom."
            value={`${kpis.avgRend.toFixed(1)}%`}
            /* El veredicto y no sólo el número: 48 % es normal en un aserradero
               y 72 % es una alarma, y eso no se lee de la cifra sola. */
            subValue={kpis.avgRend > 0 ? `ponderado por m³ · ${veredicto.texto}` : "sin corridas declaradas"}
            icon={Scale}
            emphasis={TONO_A_EMPHASIS[veredicto.tono]}
          />,
    );
    tarjetas.push(
          /* Sin corridas comparables NO se dice «0.00 m³»: un cero ahí se lee
             como «no se pierde nada», que es una afirmación distinta de «no
             hay con qué compararlo». */
          <StatCard
            key="merma"
            density="compact"
            label="Merma"
            value={kpis.mermaSobre > 0 ? `${n2(kpis.merma)} m³` : "—"}
            subValue={
              kpis.mermaSobre > 0
                ? `${kpis.mermaPct.toFixed(1)} % · sobre ${kpis.mermaSobre} corrida${kpis.mermaSobre === 1 ? "" : "s"} con entrada y salida en m³`
                : "ninguna corrida declara entrada y salida en m³"
            }
            icon={Scissors}
            emphasis="neutral"
          />,
          <StatCard
            key="en-planta"
            density="compact"
            label="En planta"
            value={`${n2(kpis.enPatio)} m³`}
            subValue="producido que todavía no salió"
            icon={Warehouse}
            emphasis={kpis.enPatio > 0 ? "success" : "neutral"}
          />,
          <StatCard
            key="sin-declarar"
            density="compact"
            label="Sin declarar"
            value={String(kpis.abiertas)}
            subValue={
              kpis.abiertas > 0
                ? `${fmtM3(kpis.consumidoAbierto)} m³ en la sierra — declaralas`
                : "todas las corridas dijeron qué salió"
            }
            icon={PackageOpen}
            emphasis={kpis.abiertas > 0 ? "warning" : "success"}
            onClick={kpis.abiertas > 0 ? onVerPendientes : undefined}
          />,
          /* Dos agujeros distintos y una sola tarjeta: manda el que domina.
              Una corrida que declara SIN materia prima no aporta m³ a «sin
              guía» —no hay nada que atribuir— así que mostrar «0.00 m³» en rojo
             con un subtítulo que habla de corridas era el número grande
             diciendo una cosa y la letra chica otra. */
          /* Deuda gemela de «Sin declarar», y distinta: acá la corrida SÍ
             declaró, pero salió más de la misma madera y el tope todavía lo
             permite (ADR-365). Sin la tarjeta, ese saldo sólo se veía abriendo
             cada fila. */
          <StatCard
            key="a-medio-declarar"
            density="compact"
            label="A medio declarar"
            value={String(ampliables)}
            subValue={
              ampliables > 0
                ? "corridas que admiten más producción — agregala desde la fila"
                : "ninguna corrida quedó a medias"
            }
            icon={PackagePlus}
            emphasis={ampliables > 0 ? "warning" : "success"}
          />,
          <StatCard
            key="sin-origen-prod"
            density="compact"
            label={kpis.sinMateriaPrima > 0 ? "Sin materia prima" : "Sin origen"}
            value={kpis.sinMateriaPrima > 0 ? String(kpis.sinMateriaPrima) : `${n2(kpis.sinOrigen)} m³`}
            subValue={
              kpis.sinMateriaPrima > 0
                ? kpis.sinOrigen > 0
                  ? `corridas sin decir de qué madera salieron · + ${n2(kpis.sinOrigen)} m³ sin guía`
                  : "corridas declaran producto sin decir de qué madera salió"
                : kpis.sinOrigen > 0
                  ? "materia prima sin guía que la ampare"
                  : "toda la materia prima tiene su GTF"
            }
            icon={kpis.sinOrigen > 0 || kpis.sinMateriaPrima > 0 ? AlertTriangle : PackageCheck}
            emphasis={kpis.sinOrigen > 0 || kpis.sinMateriaPrima > 0 ? "error" : "success"}
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
    tarjetas.push(
          <StatCard
            key="sin-anexo"
            density="compact"
            label="Sin anexo 04"
            value={String(sinAnexo ?? 0)}
            subValue={
              (sinAnexo ?? 0) > 0 ? "guías vivas sin su papel emitido" : "todas las guías tienen su anexo"
            }
            icon={FileX}
            emphasis={(sinAnexo ?? 0) > 0 ? "warning" : "success"}
            onClick={(sinAnexo ?? 0) > 0 ? onSoloSinAnexo : undefined}
            className={soloSinAnexo ? ANILLO : undefined}
          />,
          <StatCard
            key="sin-origen-desp"
            density="compact"
            label="Sin origen"
            value={n2(kpis.sinOrigen)}
            subValue={
              kpis.sinOrigen > 0 ? "producto sin corrida que lo ampare" : "todo lo despachado cita su corrida"
            }
            icon={kpis.sinOrigen > 0 ? AlertTriangle : PackageCheck}
            emphasis={kpis.sinOrigen > 0 ? "error" : "success"}
          />,
    );
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
