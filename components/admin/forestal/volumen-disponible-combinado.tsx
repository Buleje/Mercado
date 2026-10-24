"use client";

/**
 * La vista SUMADA de «Volumen disponible» (dos o más pilas elegidas): cómo se
 * reparte por permiso y por especie, una columna por pila.
 *
 * El total y cada pila (con su «Ver →») viven en la fila de tarjetas de arriba
 * (`SelectorDePilas`), que es filtro y resumen a la vez: acá no se repiten
 * (Brandon 17-10). Los filtros de permiso y especie van en la fila de esta
 * tabla, que es lo que filtran.
 *
 * 19-10: «N° trozas» en las dos tablas y un tercer apartado, «Por troza», con
 * el patio pieza por pieza recortado por lo elegido acá (`?sub=por-troza`).
 */

import { useId, useState, type ReactNode } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ProveedorAccionesDeLaVista } from "@/components/admin/shared/libro-acciones-vista";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import {
  ETIQUETA_FUENTE,
  sonTodas,
  type FuenteVolumen,
  type UnidadVolumen,
} from "@/lib/forestal/volumen-disponible";
import CtpApartados, { CtpApartadoPanel, useApartado, type Apartado } from "./ctp-apartados";
import type { EstadoVolumenDisponible } from "./hooks/use-volumen-disponible";
import TablaVolumen from "./volumen-disponible-tabla";

const nf = (n: number) => formatNumber(n);
const PESTANAS: readonly Apartado[] = [
  { id: "permiso", label: "Por permiso" },
  { id: "especie", label: "Por especie" },
];
/** El tercer apartado: no se recuerda en `useApartado`, lo manda `?sub=por-troza`. */
const TROZA = "troza";

const INFO: Record<string, { what: string; affects: string; example: string }> = {
  permiso: {
    what: "Una columna por pila elegida y su total. Cada m³ está en una sola pila: nada se cuenta dos veces. «N° trozas» cuenta las piezas del patio; lo aserrado no tiene.",
    affects:
      "Clic en un permiso: toda la pestaña muestra solo lo suyo, también «Por troza». Los pt aprovechables son un estimado: la troza al 56 %, lo aserrado a m³ × 424.",
    example:
      "Elige solo Trozas y Lotes arriba para ver la madera en troza: Trozas 13.5 + Lotes 8.6 = 22.1 m³.",
  },
  especie: {
    what: "Una columna por pila elegida y su total. Cada m³ está en una sola pila: nada se cuenta dos veces. «N° trozas» cuenta las piezas del patio; lo aserrado no tiene.",
    affects:
      "Clic en una especie: toda la pestaña muestra solo esa, también «Por troza». Los pt aprovechables son un estimado: la troza al 56 %, lo aserrado a m³ × 424.",
    example:
      "Elige solo Trozas y Lotes arriba para ver la madera en troza: Trozas 13.5 + Lotes 8.6 = 22.1 m³.",
  },
  [TROZA]: {
    what: "Las trozas que suman al volumen elegido, pieza por pieza: qué hay parado hoy, qué se puede llevar a la sierra y qué lleva demasiado tiempo esperando.",
    affects:
      "Sigue a las tarjetas de arriba y al permiso y la especie elegidos: son las mismas piezas que cuenta «N° trozas». Toca una fila para ver su ficha y recorrer las demás con ‹ ›.",
    example:
      "Toca un permiso en «Por permiso» y abre «Por troza»: salen solo sus trozas. Filtra «Días» desde 60 para ver las que ya se manchan.",
  },
};

export function VolumenCombinado({
  v,
  fuentes,
  unidad,
  permisos,
  especies,
  filtros,
  onElegirPermiso,
  onElegirEspecie,
  porTroza = false,
  onPorTroza,
  panelPorTroza,
}: {
  v: EstadoVolumenDisponible;
  fuentes: readonly FuenteVolumen[];
  unidad: UnidadVolumen;
  permisos: readonly string[];
  especies: readonly string[];
  /** Permiso y especie: a la derecha de «Por permiso | Por especie». */
  filtros?: ReactNode;
  onElegirPermiso: (clave: string) => void;
  onElegirEspecie: (clave: string) => void;
  /** «Por troza» está abierto: lo manda la URL (`?sub=por-troza`), no la memoria del apartado. */
  porTroza?: boolean;
  onPorTroza?: (si: boolean) => void;
  /** El patio pieza por pieza (`CtpTrozasView` con el alcance de Volumen). */
  panelPorTroza?: ReactNode;
}) {
  const idBase = useId();
  /* Las acciones del patio (Indicadores, plan del día, conteo, actualizar) van
     acá, a la derecha de los apartados, y no al riel del libro: allá ya están
     las del volumen y la fila se partía en dos (medido 19-10, 1280 px). */
  const [hueco, setHueco] = useState<HTMLElement | null>(null);
  const { activo: tabla, ir } = useApartado("volumen-disponible", PESTANAS);
  const conTroza = Boolean(onPorTroza && panelPorTroza);
  const activo = conTroza && porTroza ? TROZA : tabla;
  const irA = (id: string) => {
    onPorTroza?.(id === TROZA);
    if (id !== TROZA) ir(id);
  };
  const r = v.resumen;
  const enPt = unidad === "pt";
  /* Grupos CON nombre (lección de Trozas: «5 permisos» sobre un pie de 4); si
     sólo queda lo que no lo declara, se dice así y no «1 permiso». */
  const apartados: Apartado[] = PESTANAS.map((p) => {
    const filas = p.id === "permiso" ? v.porPermiso : v.porEspecie;
    const n = filas.filter((g) => g.clave !== "").length;
    if (v.sinDatosAun) return { ...p, contador: "…" };
    if (n === 0 && filas.length > 0) return { ...p, contador: `sin ${p.id}` };
    return {
      ...p,
      contador: n,
      unidad:
        p.id === "permiso" ? (n === 1 ? "permiso" : "permisos") : n === 1 ? "especie" : "especies",
    };
  });
  /* El contador es el de «N° trozas»: lo que el apartado va a listar. */
  if (conTroza) {
    apartados.push({
      id: TROZA,
      label: "Por troza",
      ...(v.sinDatosAun
        ? { contador: "…" }
        : { contador: r.trozas, unidad: r.trozas === 1 ? "troza" : "trozas" }),
    });
  }
  const info = INFO[activo] ?? INFO.permiso;
  /* Con dos o tres pilas elegidas, su suma (la que antes era «Total para
     trabajar»): «Todo», arriba, es la de las cuatro. */
  const suma =
    sonTodas(fuentes) || v.sinDatosAun
      ? null
      : `${fuentes.map((f) => ETIQUETA_FUENTE[f]).join(" + ")}: ${enPt ? `${nf(r.total.pt)} pt = ${fmtM3(r.total.m3)} m³` : `${fmtM3(r.total.m3)} m³ ≈ ${nf(r.total.pt)} pt`}`;

  return (
    <section aria-label="Reparto" className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <CtpApartados
            apartados={apartados}
            activo={activo}
            onIr={irA}
            idBase={idBase}
            etiqueta="Reparto del volumen"
            columnas={conTroza ? 3 : 2}
          />
          <InfoTip
            title={apartados.find((a) => a.id === activo)?.label ?? "Por permiso"}
            what={info.what}
            affects={info.affects}
            example={info.example}
          />
          {suma && (
            <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
              {suma}
            </span>
          )}
        </div>
        {activo === TROZA && (
          <div
            ref={setHueco}
            data-acciones-por-troza=""
            className="@container/riel flex flex-[1_1_14rem] flex-wrap items-center justify-end gap-2"
          />
        )}
        {filtros && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto">{filtros}</div>
        )}
      </div>
      <CtpApartadoPanel idBase={idBase} id={activo}>
        {activo === TROZA ? (
          <ProveedorAccionesDeLaVista value={hueco}>{panelPorTroza}</ProveedorAccionesDeLaVista>
        ) : (
          <TablaVolumen
            dim={activo === "especie" ? "especie" : "permiso"}
            filas={activo === "especie" ? v.porEspecie : v.porPermiso}
            fuentes={fuentes}
            activos={activo === "permiso" ? permisos : especies}
            onElegir={activo === "permiso" ? onElegirPermiso : onElegirEspecie}
            unidad={unidad}
            total={r.total}
            trozas={r.trozas}
            cargando={v.sinDatosAun}
          />
        )}
      </CtpApartadoPanel>
    </section>
  );
}
