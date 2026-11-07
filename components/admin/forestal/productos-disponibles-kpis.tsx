"use client";

/**
 * Los indicadores de «Productos disponibles», plegables y recordados
 * (`ctp-kpis-v2:disponibles`, la misma clave de siempre).
 *
 * UN criterio (27-09): las cifras principales son lo DISPONIBLE —libre +
 * apartado— y cierran con la fila «Total» de las tablas por permiso, especie y
 * producto. Lo marcado como usado tiene SU tarjeta y no se suma a ninguna otra.
 * Sin comparación contra el mes pasado: un depósito es lo que hay HOY, no un
 * flujo del período (memoria `kpi-contra-que-se-compara`).
 *
 * `emphasis="neutral"`: el verde/rojo del número no llega a 3:1 sobre blanco
 * (axe, 24-09); la alerta va escrita en la línea de abajo.
 */

import { useMemo } from "react";
import {
  BookmarkPlus,
  Boxes,
  Calculator,
  CheckCircle2,
  Clock,
  Coins,
  FileStack,
  Layers,
  PackageOpen,
  TreePine,
  Unlock,
} from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { DIAS_VIEJO, ETIQUETA_TRAMO, TRAMOS_EDAD, fmtEdad } from "@/lib/forestal/edad-del-patio";
import { resumenDeValor } from "@/lib/forestal/valor-del-patio";
import {
  motivoSinDisponible,
  type EstadoProducto,
  type FilaGrupo,
} from "@/lib/forestal/productos-disponibles-resumen";
import CtpKpi, { DesgloseSimple } from "./CtpKpi";
import { productLabel } from "./ctp-shared";
import { useKpisPlegables } from "./kpis-plegables";
import type { EstadoProductosDisponibles } from "./hooks/use-productos-disponibles";

const nf = (n: number) => formatNumber(n);
const plural = (n: number, uno: string, varios: string) => `${nf(n)} ${n === 1 ? uno : varios}`;
const reparto = (grupos: readonly FilaGrupo[], etiqueta: (v: string) => string = (v) => v) =>
  grupos
    .filter((g) => g.disponible.filas > 0)
    .map((g) => ({ value: etiqueta(g.etiqueta), count: g.disponible.filas, volumeM3: g.disponible.m3 }));

export function useKpisProductosDisponibles(e: EstadoProductosDisponibles, filtrosActivos: number) {
  const r = e.resumen;
  const disp = useMemo(() => e.filtradas.filter((f) => f.estado !== "usado"), [e.filtradas]);
  /* Qué vale lo disponible y cuántas guías faltan costear para poder decirlo (ADR-418). */
  const valor = useMemo(
    () => resumenDeValor(disp.map((f) => ({ valor: f.valorCorrida, volumenM3: f.m3Libro }))),
    [disp],
  );
  const especies = reparto(e.grupos.especie);
  const productos = reparto(e.grupos.producto, productLabel);
  const permisos = reparto(e.grupos.permiso);
  const lider = e.grupos.especie.find((g) => g.disponible.m3 > 0) ?? null;
  /* Permisos con TODO marcado como usado: están en la tabla (su usado aparte) y no en la cifra. */
  const soloUsado = e.grupos.permiso.filter((g) => g.clave && g.disponible.filas === 0 && g.usado.filas > 0).length;
  const solo = (estado: EstadoProducto) => e.filtro.estado.length === 1 && e.filtro.estado[0] === estado;
  const alternarEstado = (estado: EstadoProducto) => e.poner("estado", solo(estado) ? [] : [estado]);
  const soloViejos = e.filtro.tramos.length === 1 && e.filtro.tramos[0] === "viejo";
  const u = r.usado;
  const viejo = r.edad.porTramo.viejo;
  /* Sin nada disponible, ningún subtexto afirma una ausencia de dato («Sin especie
     declarada», «Todo dice su permiso»): dice por qué no hay nada (Blas, 27-09). */
  const vacio = motivoSinDisponible(r, filtrosActivos > 0);
  /* Todavía no hay una cifra REAL: ni la primera carga terminó ni, si falló,
     trajo algo. Antes esto se leía «0 pt · Nada disponible» —el mismo texto
     que un depósito de verdad vacío— y el tester lo reportó como bug (27-09). */
  const sinDatosAun = (e.cargando || e.error != null) && e.corridas.length === 0;

  const resumen = sinDatosAun
    ? e.cargando
      ? "Leyendo la planta…"
      : "No se pudo leer la planta"
    : r.disponible.filas === 0
      ? u.filas > 0
        ? `Sin producto disponible · ${fmtM3(u.m3)} m³ marcados como usados`
        : "Sin producto disponible en planta"
      : `${nf(r.disponible.pt)} pt · ${fmtM3(r.disponible.m3)} m³ · ${plural(r.disponible.paquetes, "paquete", "paquetes")}` +
        (u.filas > 0 ? ` · ${nf(u.corridas)} marcadas usadas` : "");

  return useKpisPlegables({
    claveMemoria: "disponibles",
    alto: "md",
    resumen,
    filtrosActivos,
    sinDatosAun,
    tarjetas: [
      <CtpKpi
        key="pt"
        label="Pies tablares"
        value={nf(r.disponible.pt)}
        subValue="Disponibles · m³ × 424"
        icon={Calculator}
        emphasis="neutral"
      />,
      <CtpKpi
        key="m3"
        label="Disponible (m³)"
        value={fmtM3(r.disponible.m3)}
        subValue={
          vacio ??
          (r.descuadre.corridas > 0
            ? `Del libro · ${plural(r.descuadre.corridas, "corrida no cuadra", "corridas no cuadran")} con sus paquetes`
            : `${plural(r.disponible.corridas, "corrida con saldo", "corridas con saldo")}`)
        }
        icon={TreePine}
        emphasis="neutral"
        desglose={especies.length > 0 ? <DesgloseSimple filas={especies} onElegir={(v) => e.alternar("especie", v)} /> : undefined}
        desgloseLabel="Por especie"
      />,
      <CtpKpi
        key="paquetes"
        label="Paquetes"
        value={nf(r.disponible.paquetes)}
        subValue={
          vacio ??
          (r.disponible.paquetes === 0
            ? "Sin paquetes cargados"
            : r.sinEscuadria > 0
              ? `${nf(r.sinEscuadria)} sin escuadría`
              : "Todos con su escuadría") +
            (r.sinPaquete > 0 ? ` · +${plural(r.sinPaquete, "corrida sin paquete", "corridas sin paquete")}` : "")
        }
        icon={Boxes}
      />,
      /* Las PIEZAS: el cliente pide «200 tablas», no «4 m³». */
      <CtpKpi
        key="piezas"
        label="Piezas"
        value={nf(r.disponible.piezas)}
        subValue={vacio ?? (r.disponible.piezas === 0 ? "Los paquetes no dicen sus piezas" : "De todo lo filtrado")}
        icon={Layers}
      />,
      <CtpKpi
        key="libres"
        label="Libres para vender"
        value={`${fmtM3(r.libre.m3)} m³`}
        subValue={`${nf(r.libre.pt)} pt · sin apartar`}
        icon={Unlock}
        onClick={() => alternarEstado("libre")}
        filtrando={solo("libre")}
      />,
      <CtpKpi
        key="apartados"
        label="Apartados"
        value={nf(r.apartado.filas)}
        subValue={
          r.apartado.filas === 0
            ? "Nada reservado"
            : `${fmtM3(r.apartado.m3)} m³ · ${plural(r.apartado.clientes, "cliente", "clientes")}` +
              (r.apartado.vencidos > 0 ? ` · ${nf(r.apartado.vencidos)} vencidos` : "")
        }
        icon={BookmarkPlus}
        onClick={() => alternarEstado("apartado")}
        filtrando={solo("apartado")}
      />,
      /* APARTE: no suma a ninguna otra tarjeta. */
      <CtpKpi
        key="usado"
        label="Marcado como usado"
        value={nf(u.corridas)}
        subValue={u.filas === 0 ? "Ninguna corrida marcada" : `${fmtM3(u.m3)} m³ · no suman arriba`}
        icon={CheckCircle2}
        emphasis="neutral"
        onClick={() => alternarEstado("usado")}
        filtrando={solo("usado")}
      />,
      /* La madera aserrada parada se mancha de hongo azul y pierde precio. */
      <CtpKpi
        key="edad"
        label="Lo más viejo lleva"
        value={r.edad.masViejoDias == null ? "—" : fmtEdad(r.edad.masViejoDias)}
        subValue={
          vacio ??
          (viejo.filas > 0
            ? `${nf(viejo.filas)} con más de ${DIAS_VIEJO} días · ${fmtM3(viejo.volumenM3)} m³`
            : `Nada lleva más de ${DIAS_VIEJO} días`)
        }
        icon={Clock}
        emphasis="neutral"
        onClick={() => e.poner("tramos", soloViejos ? [] : ["viejo"])}
        filtrando={soloViejos}
        desglose={
          <DesgloseSimple
            filas={[...TRAMOS_EDAD]
              .reverse()
              .filter((t) => r.edad.porTramo[t].filas > 0)
              .map((t) => ({ value: ETIQUETA_TRAMO[t], count: r.edad.porTramo[t].filas, volumeM3: r.edad.porTramo[t].volumenM3 }))}
            onElegir={(v) => {
              const t = TRAMOS_EDAD.find((x) => ETIQUETA_TRAMO[x] === v);
              if (t) e.alternar("tramos", t);
            }}
          />
        }
        desgloseLabel="Cuánto hay de cada edad"
      />,
      <CtpKpi
        key="especies"
        label="Especies"
        value={nf(r.especies)}
        subValue={vacio ?? (lider ? `${lider.etiqueta}: ${lider.pctM3} % del m³` : "Sin especie declarada")}
        icon={TreePine}
        desglose={especies.length > 0 ? <DesgloseSimple filas={especies} onElegir={(v) => e.alternar("especie", v)} /> : undefined}
        desgloseLabel="Cuánto hay de cada una"
      />,
      /* Dos especies pueden dar seis productos: es lo que decide qué ofrecer. */
      <CtpKpi
        key="productos"
        label="Tipos de producto"
        value={nf(r.productos)}
        subValue={vacio ?? (r.productos === 1 ? "Un solo tipo en stock" : "Distintos en stock")}
        icon={PackageOpen}
        desglose={productos.length > 0 ? <DesgloseSimple filas={productos} onElegir={(v) => e.alternar("producto", v)} /> : undefined}
        desgloseLabel="Cuánto hay de cada uno"
      />,
      <CtpKpi
        key="permisos"
        label="Permisos"
        value={nf(r.permisos)}
        subValue={
          vacio ??
          (r.sinPermiso.filas > 0 ? `${fmtM3(r.sinPermiso.m3)} m³ sin permiso` : "Todo dice su permiso") +
            (soloUsado > 0 ? ` · +${nf(soloUsado)} solo usado` : "")
        }
        icon={FileStack}
        desglose={permisos.length > 0 ? <DesgloseSimple filas={permisos} onElegir={(v) => e.alternar("permiso", v)} /> : undefined}
        desgloseLabel="Cuánto hay de cada uno"
      />,
      /* Sin factura no hay valor: la tarjeta dice cuántas guías faltan costear, nunca S/ 0. */
      <CtpKpi
        key="valor"
        label="Valor del patio"
        value={vacio ? "—" : valor.filasValorizadas === 0 ? "sin costear" : `S/ ${formatNumber(valor.totalSoles, { max: 0 })}`}
        subValue={
          vacio ??
          (valor.guiasSinCosto.length > 0
            ? `Faltan costear ${plural(valor.guiasSinCosto.length, "guía", "guías")} en Ingresos`
            : valor.filasValorizadas === 0
              ? "Ninguna corrida dice de qué guía salió"
              : `${plural(valor.filasValorizadas, "fila valorizada", "filas valorizadas")} al costo de su guía`)
        }
        icon={Coins}
      />,
    ],
  });
}
