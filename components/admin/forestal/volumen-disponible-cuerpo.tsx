"use client";

/**
 * Volumen disponible › «Volumen» — cuánta madera hay para trabajar (Brandon
 * 2026-10-03), en cuatro pilas con chips. Lo que era la vista entera hasta la
 * compactación del 17-10; la explicación larga vive en `CtpVolumenDisponible`.
 *
 * Cada m³ está en UNA sola pila (`lib/forestal/volumen-disponible`): la suma
 * de «Todo» no cuenta dos veces la troza que está en un lote.
 */

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, FileDown, Scissors } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useEnElLibro } from "@/components/admin/shared/libro-acciones-vista";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import {
  clavePermiso,
  permisoDeCorrida,
  type CorridaDisponible,
} from "@/lib/forestal/productos-disponibles-resumen";
import {
  alternarFuente,
  entraPorEspecie,
  entraPorPermiso,
  fuenteDeTroza,
  type FuentesPedidas,
  type UnidadVolumen,
} from "@/lib/forestal/volumen-disponible";
import CtpAvisoAlcancePermiso from "./CtpAvisoAlcancePermiso";
import CtpProductosDisponibles from "./CtpProductosDisponibles";
import CtpTrozasDisponibles from "./CtpTrozasDisponibles";
import { CabeceraDeVista } from "./ctp-cabecera-vista";
import { useFuentesElegidas, useVolumenDisponible } from "./hooks/use-volumen-disponible";
import { SelectorDePilas } from "./volumen-disponible-chips";
import { VolumenCombinado } from "./volumen-disponible-combinado";
import { FiltroDeVolumen, muestraFiltro } from "./volumen-disponible-filtro";
import { PilaLotes, PilaPorRecepcionar } from "./volumen-disponible-pilas";

const HREF_REPROCESOS = "/admin?tab=ctp-libro-operaciones&vista=reprocesos";

/** La pestaña «Volumen»: las cuatro pilas, sumadas o de a una. */
export default function VolumenDisponibleCuerpo({
  period,
  onIr,
  fuentesPedidas = null,
  onFuentesUsadas,
  onAbrirLote,
}: {
  period: CtpPeriod;
  onIr?: (vista: string) => void;
  /** Un salto desde otra pantalla que pide una pila («Ver trozas disponibles →»). */
  fuentesPedidas?: FuentesPedidas | null;
  onFuentesUsadas?: () => void;
  /** Clic en un lote de aserrío: abre su historia (Lotes › Historia del lote). */
  onAbrirLote?: (loteId: string) => void;
}) {
  const [permisos, setPermisos] = useState<string[]>([]);
  const [especies, setEspecies] = useState<string[]>([]);
  /* Un salto desde otra pantalla (la ficha de un paquete, una reserva vencida)
     busca algo puntual: arrastrar los filtros de antes lo escondería. */
  const [fuentes, setFuentes] = useFuentesElegidas(fuentesPedidas, () => {
    setPermisos([]);
    setEspecies([]);
    onFuentesUsadas?.();
  });
  const v = useVolumenDisponible(period, fuentes, permisos, especies);
  const [errorExcel, setErrorExcel] = useState<string | null>(null);
  /* m³ o pies tablares (Brandon 03-10): se recuerda por dispositivo. */
  const [unidad, setUnidad] = useLocalStorage<UnidadVolumen>("ctp-volumen-disponible:unidad", "m3");
  const una = fuentes.length === 1 ? fuentes[0] : null;
  const enLibro = useEnElLibro();

  /* Las vistas de adentro, recortadas a su pila y al permiso de arriba.
     Identidad estable: cambiarla recalcula toda la vista de abajo. */
  const recorteTrozas = useCallback(
    (t: TrozaConsumible) =>
      fuenteDeTroza(t) === "trozas" &&
      entraPorPermiso(clavePermiso(t.permiso), permisos) &&
      entraPorEspecie(claveEspecie(t.especieComun), especies),
    [permisos, especies],
  );
  const recorteProductos = useMemo(
    () =>
      permisos.length > 0 || especies.length > 0
        ? (c: CorridaDisponible) =>
            entraPorPermiso(permisoDeCorrida(c), permisos) &&
            entraPorEspecie(claveEspecie(c.especie), especies)
        : undefined,
    [permisos, especies],
  );
  const alternarEn = (set: typeof setPermisos) => (clave: string) =>
    set((p) => (p.includes(clave) ? p.filter((x) => x !== clave) : [...p, clave]));
  const alternarPermiso = useCallback((clave: string) => alternarEn(setPermisos)(clave), []);
  const alternarEspecie = useCallback((clave: string) => alternarEn(setEspecies)(clave), []);
  const nombres = (elegidos: string[], opciones: typeof v.opcionesPermiso) =>
    elegidos.map((k) => opciones.find((o) => o.clave === k)?.etiqueta ?? k);
  const filtrosEscritos = [
    ...(permisos.length ? [`Permiso: ${nombres(permisos, v.opcionesPermiso).join(" o ")}`] : []),
    ...(especies.length ? [`Especie: ${nombres(especies, v.opcionesEspecie).join(" o ")}`] : []),
  ];

  /* Permiso y especie filtran las cuatro pilas: van pegados a la tabla. */
  const hayFiltros =
    muestraFiltro(v.opcionesPermiso, permisos) || muestraFiltro(v.opcionesEspecie, especies);
  const filtros = (
    <>
      <FiltroDeVolumen
        titulo="Permiso"
        todos="Todos"
        opciones={v.opcionesPermiso}
        elegidos={permisos}
        onAlternar={alternarPermiso}
        onTodos={() => setPermisos([])}
      />
      <FiltroDeVolumen
        titulo="Especie"
        todos="Todas"
        opciones={v.opcionesEspecie}
        elegidos={especies}
        onAlternar={alternarEspecie}
        onTodos={() => setEspecies([])}
      />
    </>
  );

  const bajarExcel = async () => setErrorExcel(await v.descargarExcel(filtrosEscritos));
  const opciones: MenuAccion[] = [
    ...(una
      ? []
      : [
          {
            id: "excel",
            label: v.descargando ? "Generando el Excel…" : "Bajar el Excel",
            hint: "Resumen por pila, por permiso, por especie y qué se exportó",
            icon: FileDown,
            busy: v.descargando,
            disabled: v.resumen.total.m3 === 0 || v.descargando,
            onSelect: () => void bajarExcel(),
          },
        ]),
    {
      id: "reprocesos",
      label: "Ver los reprocesos declarados",
      hint: "Trazabilidad › Reprocesos: la madera que se volvió a aserrar",
      icon: Scissors,
      onSelect: () => (onIr ? onIr("reprocesos") : irAEnlace(HREF_REPROCESOS)),
    },
  ];

  return (
    <div className="space-y-3" data-vista-volumen>
      <div className="space-y-3">
        <CabeceraDeVista
          titulo="Volumen disponible"
          info={
            <InfoTip
              title="Volumen disponible"
              what="Cuánta madera hay para trabajar, en cuatro pilas que no se pisan: trozas libres, lo que sobra en los lotes, lo por recepcionar y los productos aserrados."
              affects="Toca una tarjeta para ver su pila con todo su detalle (la flecha la deja sola); dos o más se suman. «Todo» suma las cuatro, con su estimado en pt aprovechables (troza al 56 %, aserrado a m³ × 424). La pestaña «Por troza» es el patio pieza por pieza."
              example="Elige Trozas y Lotes para ver toda la madera en troza que puede ir a la sierra."
            />
          }
        >
          <SegmentedControl<UnidadVolumen>
            value={unidad}
            onChange={setUnidad}
            size="lg"
            label="Ver el volumen en"
            options={[
              { value: "m3", label: "m³" },
              { value: "pt", label: "pt" },
            ]}
          />
          {/* Excel y los reprocesos (se declaran desde Productos y se revisan
              en su vista) van juntos en «Opciones»: el riel queda para m³/pt,
              que se toca a cada rato, y las vistas del libro no se tapan. */}
          <ActionMenu
            label="Opciones"
            title="Bajar el Excel y ver los reprocesos declarados"
            actions={opciones}
            size={enLibro ? "md" : "sm"}
            soloIcono={enLibro}
            className={enLibro ? "w-12!" : ""}
          />
        </CabeceraDeVista>
        <SelectorDePilas
          fuentes={fuentes}
          porPila={v.porPila}
          unidad={unidad}
          cargando={v.sinDatosAun}
          onAlternar={(f) => setFuentes(alternarFuente(fuentes, f))}
          onSolo={(f) => setFuentes([f])}
        />
      </div>

      {/* Trozas y Productos traen su propio aviso de alcance y sus errores. */}
      {una !== "trozas" && una !== "productos" && (
        <>
          {v.contratoFiltro && v.codigoPermisoActivo && (
            <CtpAvisoAlcancePermiso
              codigo={v.codigoPermisoActivo}
              acotado={["las pilas", "el total", "las tablas"]}
            />
          )}
          {v.truncado && (
            <p role="status" className="flex items-center gap-2 rounded-2xl border-2 border-[var(--data-warning-500)] px-4 py-3 text-sm text-[var(--text-primary)]">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
              El patio no se leyó entero: las cifras de troza son de lo leído.
            </p>
          )}
          {(v.error || errorExcel) && (
            <p role="alert" className="rounded-2xl border-2 border-[var(--data-error-500)] px-4 py-3 text-sm font-bold text-[var(--text-primary)]">
              {v.error ?? `No se pudo bajar el Excel: ${errorExcel}`}
            </p>
          )}
        </>
      )}

      {/* Con una pila sola, su detalle trae su propia cabecera: los filtros van
          en una fila justo encima. Sumadas, en la fila de su tabla. */}
      {una && hayFiltros && <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{filtros}</div>}

      {una === "trozas" ? (
        <CtpTrozasDisponibles onIr={onIr} recorte={recorteTrozas} />
      ) : una === "productos" ? (
        <CtpProductosDisponibles period={period} recorte={recorteProductos} />
      ) : una === "lotes" ? (
        <PilaLotes
          filas={v.filasLotes}
          cargando={v.cargando}
          onIrLotes={onIr ? () => onIr("lotes") : undefined}
          onAbrirLote={onAbrirLote}
        />
      ) : una === "recepcion" ? (
        <PilaPorRecepcionar
          filas={v.filasRecepcion}
          cargando={v.cargando}
          onIrIngresos={onIr ? () => onIr("ingresos") : undefined}
        />
      ) : (
        <VolumenCombinado
          v={v}
          fuentes={fuentes}
          unidad={unidad}
          permisos={permisos}
          especies={especies}
          filtros={hayFiltros ? filtros : undefined}
          onElegirPermiso={alternarPermiso}
          onElegirEspecie={alternarEspecie}
        />
      )}
    </div>
  );
}
