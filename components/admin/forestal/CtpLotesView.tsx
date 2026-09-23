"use client";

/**
 * Lotes de aserrío — la pestaña donde se arma lo que va a la sierra (ADR-334).
 *
 * El «Lote» es la columna con la que el LO-CTP enlaza Consumos, Producción y
 * Salidas. Vive acá y no adentro de Consumos porque es un trabajo propio del
 * patio —se arma en la pila, con la madera delante— y porque lo que se guarda
 * acá lo reusan las otras pestañas: Producción lo elige para declarar su
 * corrida, Trozas dice en qué lote está cada pieza y Consumos avisa cuánto
 * espera la sierra.
 *
 * Las cifras salen de `lib/forestal/lotes-aserrio.ts` (puro y testeado): la
 * pantalla no calcula, muestra.
 */

import { useMemo, useState } from "react";
import {
  ArrowUpDown,Boxes,
  Gauge,
  Layers,
  Loader2,
  PackageOpen,
  Plus,
  RefreshCw,
  ScanText,
  Search,
  TreePine,
  Upload,
  Truck,
  X,
} from "@buleje/design-system/icons";
import CtpKpi from "./CtpKpi";
import { CampoDeFiltro } from "./ctp-filtros-panel";
import { libresDelPatio, resumenPatio } from "@/lib/forestal/patio-resumen";
import type { CtpIngresosFiltroRapido } from "./ctp-shared";
import {
  ESTADO_LOTE,
  alertasDeLote,
  ETIQUETA_ORDEN,
  facetasDeLotes,
  ordenarLotes,
  type OrdenLotes,
  filtrarLotes,
  juzgarRendimientoLote,
  pieTablarDe,
  resumenLotes,
  type EstadoLoteAserrio,
} from "@/lib/forestal/lotes-aserrio";
import { useLotesAserrio } from "./hooks/use-lotes-aserrio";
import { useEspeciesFotos } from "./hooks/use-especies-fotos";
import CtpLoteCard from "./CtpLoteCard";
import CtpLoteArmarModal, { type MaterialDeInventario } from "./CtpLoteArmarModal";
import CtpLoteDetalleModal from "./CtpLoteDetalleModal";
import CtpLoteProductosModal from "./CtpLoteProductosModal";
import CtpDespacharDesdeLotesModal from "./CtpDespacharDesdeLotesModal";
import CtpDespachoGuiaModal from "./CtpDespachoGuiaModal";
import CtpImportarProgramacionesModal from "./CtpImportarProgramacionesModal";
import CtpCuadreSniffsModal, { lotesQueNoCuadran } from "./CtpCuadreSniffsModal";
import CtpDeclararDesdeSniffs from "./CtpDeclararDesdeSniffs";
import CtpRegistrarProduccionModal, {
  type ProduccionRegistrada,
} from "./CtpRegistrarProduccionModal";
import { Btn, CtpKpisPlegables, PanelSkeleton, VistaHeader } from "./ctp-shared";
import { sniffsRefDesdeDetalle } from "@/lib/forestal/sniffs-produccion-parse";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";

const CAMPO =
  "h-12 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

/** El lote elegido para producir viaja al formulario de la pestaña Producción. */
export interface LoteAProducir {
  id: string;
  code: string;
}

export default function CtpLotesView({
  onProducir,
  onCargar,
  onIr,
}: {
  onProducir: (lote: LoteAProducir) => void;
  /** «Cargar»: lleva a Consumos con este lote elegido, que es donde se eligen
   *  las piezas ya filtradas por su especie (ADR-342). */
  onCargar: (lote: LoteAProducir) => void;
  /**
   * Saltar a otra vista del libro. Lo usa el aviso de guías sin recepcionar:
   * decir que hay madera trabada sin llevar a destrabarla es media ayuda.
   */
  onIr?: (vista: string, filtro?: CtpIngresosFiltroRapido) => void;
}) {
  const {
    lotes,
    trozas,
    cargando,
    error,
    recargar,
    crearConTrozas,
    crearInventario,
    quitarTroza,
    editarLote,
    deshacer,
    deshacerForzado,
  } = useLotesAserrio();
  const { indice: fotos } = useEspeciesFotos();

  const [texto, setTexto] = useState("");
  const [especie, setEspecie] = useState<string[]>([]);
  const [estado, setEstado] = useState<string[]>([]);
  /* Los dos ejes nuevos: cuánto le queda al lote y cómo viene con su fecha. */
  const [sobra, setSobra] = useState<string[]>([]);
  const [situacion, setSituacion] = useState<string[]>([]);
  /* El orden del backend es por estado y creación: un orden de base de datos,
     no de trabajo. El default es el que dice qué mirar primero. */
  const [orden, setOrden] = useState<OrdenLotes>("urgencia");
  const [armar, setArmar] = useState(false);
  /** Importar la lista de programaciones del SNIFFS (ADR-398). */
  const [importar, setImportar] = useState(false);
  /** La mesa de lo que no cuadra con el SNIFFS, y el lote que se está resolviendo. */
  const [verCuadre, setVerCuadre] = useState(false);
  const [resolviendoId, setResolviendoId] = useState<string | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  /* Qué salió de un lote y en qué terminó (Brandon, 2026-09-12). */
  const [productosDe, setProductosDe] = useState<{ code: string; especie: string | null } | null>(null);
  /* Armar una guía eligiendo lotes, en vez de producto por producto. */
  const [despachando, setDespachando] = useState(false);
  /* Los `uid`s que van a la guía: `null` = la guía no está abierta. */
  const [uidsParaGuia, setUidsParaGuia] = useState<string[] | null>(null);
  const [aviso, setAviso] = useState<{ tono: "ok" | "aviso"; texto: string } | null>(null);

  /**
   * El material del modo INVENTARIO, entre el paso 1 (especie + volumen
   * consumido) y el paso 2 (los paquetes que produjo). El lote y la corrida
   * nacen juntos recién al confirmar el paso 2 — nada se crea a medias.
   */
  const [materialInventario, setMaterialInventario] = useState<MaterialDeInventario | null>(null);
  const [guardandoInventario, setGuardandoInventario] = useState(false);
  const [errorInventario, setErrorInventario] = useState<string | null>(null);

  async function confirmarInventario(datos: ProduccionRegistrada) {
    if (!materialInventario) return;
    setGuardandoInventario(true);
    setErrorInventario(null);
    try {
      const r = await crearInventario({
        speciesCommon: materialInventario.speciesCommon,
        speciesScientific: materialInventario.speciesScientific,
        volumenConsumidoM3: materialInventario.volumenConsumidoM3,
        fecha: materialInventario.fecha,
        finProceso: materialInventario.finProceso,
        code: materialInventario.code,
        notes: materialInventario.notes,
        /* La foto de lo que declaró el SNIFFS (ADR-398): con ella la tarjeta
           puede decir después si el libro cuadra con lo declarado allá. */
        sniffs: materialInventario.sniffs
          ? sniffsRefDesdeDetalle(materialInventario.sniffs, "captura")
          : null,
        paquetes: datos.paquetes.map((p) => ({
          codigo: p.codigo,
          productType: p.productType,
          presentacion: p.presentacion,
          cantidad: p.cantidad,
          volumenM3: p.volumenM3,
          espesorCm: p.espesorCm,
          anchoCm: p.anchoCm,
          largoM: p.largoM,
          observations: p.observations || null,
        })),
      });
      setAviso({
        tono: "ok",
        texto:
          `Lote ${r.lote.code} declarado como inventario: ${fmtM3(datos.volumen)} m³ producidos ` +
          `en la corrida N° ${r.corrida.lineNo}. Ya se puede despachar y, si queda margen del 56 %, ` +
          `declararle más producción desde la tabla de Producción.`,
      });
      setMaterialInventario(null);
    } catch (e) {
      setErrorInventario(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardandoInventario(false);
    }
  }

  /** Una sola marca de tiempo por render: los días de espera no pueden variar entre tarjetas. */
  const ahora = useMemo(() => new Date(), [lotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumen = useMemo(() => resumenLotes(lotes), [lotes]);
  const veredicto = juzgarRendimientoLote(resumen.rendimientoPct);
  const opcionesEspecie = useMemo(
    () => [...new Set(lotes.map((l) => l.speciesCommon).filter(Boolean))].sort(),
    [lotes],
  );
  const filtro = useMemo(
    () => ({ texto, especie, estado, sobra, situacion }),
    [texto, especie, estado, sobra, situacion],
  );
  const visibles = useMemo(
    () => ordenarLotes(filtrarLotes(lotes, filtro, ahora), orden, ahora),
    [lotes, filtro, orden, ahora],
  );
  /* Cada filtro cuenta sobre los OTROS, no sobre sí mismo: si no, al elegir una
     especie el desplegable dejaría de ofrecer las demás. */
  const facetas = useMemo(() => facetasDeLotes(lotes, filtro, ahora), [lotes, filtro, ahora]);
  /** Lo que queda en el patio sin apartar: es la materia prima de un lote nuevo.
   *  Mismo predicado que la pestaña Consumos (`estaLibreEnPatio`): contaba
   *  también las piezas de guías sin recepcionar y prometía madera que el
   *  picker después no ofrecía. */
  const libresEnPatio = useMemo(() => libresDelPatio(trozas).length, [trozas]);
  /* La madera que está en el patio pero espera un PAPEL, no la sierra. */
  const patio = useMemo(() => resumenPatio(trozas, ahora), [trozas, ahora]);
  /** Los lotes que piden atención: se anuncian arriba, no hay que abrirlos para enterarse. */
  const conAlerta = useMemo(
    () => lotes.filter((l) => alertasDeLote(l, ahora).some((a) => a.tono === "warning")).length,
    [lotes, ahora],
  );
  const detalle = detalleId ? (lotes.find((l) => l.id === detalleId) ?? null) : null;
  const resolviendo = resolviendoId ? (lotes.find((l) => l.id === resolviendoId) ?? null) : null;
  /** Lo que el libro no dice igual que el SNIFFS (ADR-398). */
  const descuadres = useMemo(() => lotesQueNoCuadran(lotes), [lotes]);
  const filtrando =
    Boolean(texto) || especie.length > 0 || estado.length > 0 || sobra.length > 0 || situacion.length > 0;

  return (
    <div className="space-y-3">
      <VistaHeader
        titulo="Lotes de aserrío"
        /* Habla de los LOTES, no del patio: la barra de indicadores de abajo ya
           dice «N abiertos» y «N libres en patio», y tenerlo dos veces en dos
           renglones seguidos hacía dudar de si eran la misma cuenta. */
        meta={
          lotes.length === 0
            ? "todavía ninguno"
            : `${lotes.length} lote${lotes.length === 1 ? "" : "s"} · ` +
              (resumen.abiertos > 0
                ? `${resumen.abiertos} esperando la sierra`
                : "ninguno esperando la sierra") +
              (resumen.vacios > 0 ? ` · ${resumen.vacios} sin piezas` : "")
        }
        hint="Las trozas de una misma especie que van juntas al carro. El lote se arma acá, se consume en Producción y con él salen los despachos."
      >
        <Btn variant="secondary" onClick={() => void recargar()} disabled={cargando}>
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} /> Recargar
        </Btn>
        {/* La lista entera del SNIFFS de una (ADR-398): un CTP que empieza a
            llevar el libro tiene decenas ya declaradas allá. */}
        <Btn variant="secondary" onClick={() => setImportar(true)}>
          <Upload className="h-4 w-4" /> Traer del SNIFFS
        </Btn>
        {/* El despacho entrando por el lote: en el patio se piensa «sacá lo del
            13 y el 15», no producto por producto. Arma la MISMA guía. */}
        <Btn variant="secondary" onClick={() => setDespachando(true)}>
          <Truck className="h-4 w-4" /> Despachar desde lotes
        </Btn>
        <Btn variant="primary" onClick={() => setArmar(true)}>
          <Plus className="h-4 w-4" /> Armar lote
        </Btn>
      </VistaHeader>

      {/**
       * La madera que espera un papel, no la sierra.
       *
       * `estaLibreEnPatio` saca de la cuenta las piezas cuya guía no se
       * recepcionó (ADR-339, que nació de que Lotes dijera 47 y el picker
       * ofreciera 30). Correcto — pero el operador veía «7 libres» con la pila
       * llena delante y no tenía de dónde agarrarse. Medido en el tenant real:
       * 153 de 160 piezas y 181 de 197 m³ estaban así.
       *
       * Va arriba de los filtros porque cambia qué se puede hacer en esta
       * pantalla: sin recepcionar esas guías, no hay lote que armar.
       */}
      {patio.sinRecepcionar > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2.5 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <PackageOpen className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <b className="font-mono tabular-nums">{patio.sinRecepcionar}</b> pieza
            {patio.sinRecepcionar === 1 ? "" : "s"} del patio (
            <b className="font-mono tabular-nums">{fmtM3(patio.volumenSinRecepcionarM3)} m³</b>) todavía
            no se pueden aserrar: su guía está sin recepcionar.
          </span>
          {onIr && (
            <button
              type="button"
              onClick={() => onIr("ingresos", "pendiente")}
              className="font-bold underline underline-offset-2"
            >
              Recepcionar {patio.guiasSinRecepcionar} guía
              {patio.guiasSinRecepcionar === 1 ? "" : "s"}
            </button>
          )}
        </p>
      )}

      {/**
       * Lo que no cuadra con el SNIFFS, arriba de todo (ADR-398).
       *
       * Es la pregunta que se hace antes de una fiscalización y la única deuda
       * de esta pantalla que no se ve abriendo un lote: hay que mirarlos todos.
       * Sólo aparece cuando hay algo — un renglón que siempre dice «0» enseña a
       * no leerlo.
       */}
      {descuadres.length > 0 && (
        <button
          type="button"
          onClick={() => setVerCuadre(true)}
          className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/12 px-3 py-2 text-left text-sm font-bold text-[var(--data-warning-700)] transition-colors hover:bg-[var(--data-warning-500)]/20 dark:text-[var(--data-warning-500)]"
        >
          <ScanText className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            {descuadres.length} lote{descuadres.length === 1 ? "" : "s"} del SNIFFS pide
            {descuadres.length === 1 ? "" : "n"} atención
            {(() => {
              const pend = descuadres.filter(
                (d) => d.cuadre.estado === "pendiente" || d.cuadre.produccionPendiente,
              );
              const m3 = Math.round(pend.reduce((a, d) => a + d.peso, 0) * 10_000) / 10_000;
              return pend.length > 0 ? ` · ${pend.length} sin declarar acá (${fmtM3(m3)} m³)` : "";
            })()}
          </span>
          <span className="shrink-0 underline underline-offset-2">ver cuáles</span>
        </button>
      )}

      {/* Todos detrás del botón «Indicadores» (Brandon, 2026-09-03); el titular
          va en la línea de resumen, que es lo que se mira de reojo. */}
      <CtpKpisPlegables
        claveMemoria="lotes"
        resumen={
          `${resumen.abiertos} abierto${resumen.abiertos === 1 ? "" : "s"} · ${fmtM3(resumen.volumenApartado)} m³ apartados · ${libresEnPatio} libre${libresEnPatio === 1 ? "" : "s"} en patio` +
          (resumen.margenTotalM3 > 0 ? ` · ${fmtM3(resumen.margenTotalM3)} m³ por declarar` : "")
        }
        tarjetas={[
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
            value={`${fmtM3(resumen.volumenApartado)} m³`}
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
            onClick={() => setArmar(true)}
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
            value={`${fmtM3(resumen.margenTotalM3)} m³`}
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
            value={`${fmtM3(resumen.volumenAserrado)} m³`}
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
        ]}
      />

      {error && (
        <p className="rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
          No se pudieron leer los lotes: {error}
        </p>
      )}

      {aviso && (
        <p
          className={`flex items-start gap-2 rounded-2xl border-2 px-4 py-3 text-sm font-bold ${
            aviso.tono === "ok"
              ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]"
              : "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
          }`}
        >
          <span className="flex-1">{aviso.texto}</span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            aria-label="Cerrar el aviso"
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* `w-full` en chico y `flex-1` desde sm: `min-w-*` no emite CSS en este
            proyecto (medido), así que un mínimo declarado ahí no protege nada. */}
        <label className="relative w-full sm:w-auto sm:flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
            aria-hidden
          />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Código de lote, especie, permiso, guía o código de pieza…"
            aria-label="Buscar un lote"
            className={`${CAMPO} w-full pl-9 pr-3`}
          />
        </label>
        {/* Multi-selección con el peso de cada opción, como el resto del libro:
            adentro de un filtro los valores suman y entre filtros se cruzan. Un
            filtro con una sola opción no se dibuja — ocupaba lugar sin filtrar
            nada (los 5 lotes del tenant son todos Tornillo). */}
        {facetas.especie.length > 1 && (
          <CampoDeFiltro
            label="especie"
            placeholder="Todas las especies"
            value={especie}
            options={facetas.especie}
            onChange={setEspecie}
            className="w-full sm:w-48"
            textoVacio="Sin especies"
          />
        )}
        {facetas.estado.length > 1 && (
          <CampoDeFiltro
            label="estado del lote"
            placeholder="Todos los estados"
            value={estado}
            options={facetas.estado}
            onChange={setEstado}
            className="w-full sm:w-44"
            textoVacio="Sin lotes"
          />
        )}
        {/* Los dos ejes nuevos: cuánto queda —lo que dice la etiqueta de cada
            tarjeta— y cómo viene con su fecha de fin. */}
        {facetas.sobra.length > 1 && (
          <CampoDeFiltro
            label="cuánto queda"
            placeholder="Quede lo que quede"
            value={sobra}
            options={facetas.sobra}
            onChange={setSobra}
            className="w-full sm:w-48"
            textoVacio="Sin lotes"
          />
        )}
        {facetas.situacion.length > 1 && (
          <CampoDeFiltro
            label="fecha de fin"
            placeholder="Cualquier fecha"
            value={situacion}
            options={facetas.situacion}
            onChange={setSituacion}
            className="w-full sm:w-48"
            textoVacio="Sin lotes"
          />
        )}
        <label className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <ArrowUpDown className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          <span className="sr-only sm:not-sr-only">Ordenar</span>
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as OrdenLotes)}
            aria-label="Ordenar los lotes"
            className={`${CAMPO} px-2`}
          >
            {(Object.keys(ETIQUETA_ORDEN) as OrdenLotes[]).map((o) => (
              <option key={o} value={o}>
                {ETIQUETA_ORDEN[o]}
              </option>
            ))}
          </select>
        </label>
        {filtrando && (
          <button
            type="button"
            onClick={() => {
              setTexto("");
              setEspecie([]);
              setEstado([]);
              setSobra([]);
              setSituacion([]);
            }}
            className="h-12 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]"
          >
            Limpiar
          </button>
        )}
      </div>

      {conAlerta > 0 && !filtrando && (
        <p className="rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-sm font-bold text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
          {conAlerta} lote{conAlerta === 1 ? "" : "s"} para mirar: madera apartada hace días, piezas
          consumidas por fuera o corridas anuladas. El detalle está en cada tarjeta.
        </p>
      )}

      {cargando && lotes.length === 0 ? (
        /* Tarjetas, no filas: el esqueleto tiene que prometer lo que va a venir. */
        <PanelSkeleton kpis={3} />
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--rule-base)] p-10 text-center">
          <Boxes
            className="mx-auto mb-3 h-10 w-10 text-[var(--text-tertiary)] opacity-40"
            aria-hidden
          />
          <p className="text-base font-bold text-[var(--text-primary)]">
            {lotes.length === 0
              ? "Todavía no hay lotes de aserrío"
              : "Ningún lote coincide con el filtro"}
          </p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-[var(--text-secondary)]">
            {lotes.length === 0
              ? "Un lote son las trozas de una misma especie que entran juntas a la sierra. Ármalo con las piezas del patio y después Producción lo consume de un click."
              : "Prueba con otro estado o limpia la búsqueda."}
          </p>
          {lotes.length === 0 && (
            <span className="mt-4 inline-flex">
              <Btn variant="primary" onClick={() => setArmar(true)}>
                <Plus className="h-4 w-4" /> Armar el primero
              </Btn>
            </span>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((l) => (
            <li key={l.id}>
              <CtpLoteCard
                lote={l}
                fotos={fotos}
                ahora={ahora}
                onVer={() => setDetalleId(l.id)}
                onAgregar={() => onCargar({ id: l.id, code: l.code })}
                onProducir={() => onProducir({ id: l.id, code: l.code })}
                onDeshacer={() => setDetalleId(l.id)}
                onResolverCuadre={() => setResolviendoId(l.id)}
                onVerProductos={() => setProductosDe({ code: l.code, especie: l.speciesCommon })}
              />
            </li>
          ))}
        </ul>
      )}

      {cargando && lotes.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Actualizando…
        </p>
      )}

      {/* La mesa de lo que no cuadra, y el formulario que lo resuelve. */}
      {verCuadre && (
        <CtpCuadreSniffsModal
          lotes={lotes}
          onResolver={(l) => {
            setVerCuadre(false);
            setResolviendoId(l.id);
          }}
          onVer={(l) => {
            setVerCuadre(false);
            setDetalleId(l.id);
          }}
          onClose={() => setVerCuadre(false)}
        />
      )}

      {resolviendo && (
        <CtpDeclararDesdeSniffs
          lote={resolviendo}
          trozas={trozas}
          onListo={(texto) => {
            setAviso({ tono: "ok", texto });
            void recargar();
          }}
          onError={(texto) => setAviso({ tono: "aviso", texto })}
          onClose={() => setResolviendoId(null)}
          onCambioEnElLibro={() => void recargar()}
        />
      )}

      {/* Importar la lista de programaciones (ADR-398): cada fila nace como un
          lote con su consumo declarado y la producción pendiente. */}
      {importar && (
        <CtpImportarProgramacionesModal
          lotes={lotes}
          crearProgramacion={async (input) => {
            const r = await crearInventario({
              code: input.code,
              speciesCommon: input.speciesCommon,
              speciesScientific: input.speciesScientific,
              volumenConsumidoM3: input.volumenConsumidoM3,
              fecha: input.fecha,
              finProceso: input.finProceso,
              notes: input.leida.estado ? `SNIFFS: ${input.leida.estado}` : null,
              /* Vacío = programación: el consumo entra al libro y la producción
                 queda pendiente, que es lo que la lista del SNIFFS afirma. */
              paquetes: [],
              sniffs: {
                lote: input.leida.lote,
                fechaInicio: input.leida.fechaInicio,
                fechaFin: input.leida.fechaFin,
                especieCientifica: input.leida.especieCientifica,
                especieComun: input.leida.especieComun,
                volumenConsumidoM3: input.volumenConsumidoM3,
                productos: [],
                leidoEn: new Date().toISOString(),
                fuente: "lista",
              },
            });
            return { code: r.lote.code, lineNo: r.corrida.lineNo };
          }}
          onListo={({ creados, fallados }) =>
            setAviso({
              tono: fallados.length > 0 ? "aviso" : "ok",
              texto:
                `Entraron ${creados.length} lote${creados.length === 1 ? "" : "s"} del SNIFFS con su consumo declarado ` +
                `(${creados.map((c) => c.code).join(", ")}). La producción de cada uno se declara desde la tabla de Producción.` +
                (fallados.length > 0 ? ` ${fallados.length} no se pudieron importar.` : ""),
            })
          }
          onClose={() => setImportar(false)}
        />
      )}

      {armar && (
        <CtpLoteArmarModal
          trozas={trozas}
          crear={async (input) => {
            const r = await crearConTrozas({ ...input, trozaIds: [] });
            return { code: r.code };
          }}
          onIniciarInventario={(material) => {
            setMaterialInventario(material);
            setArmar(false);
          }}
          onListo={(texto, tono) => setAviso({ texto, tono })}
          onClose={() => setArmar(false)}
        />
      )}

      {/* Paso 2 del modo inventario: los paquetes que produjo esta madera,
          con el MISMO formulario que declara producción desde un lote real —
          el tope del 56 % y el rendimiento se ven igual, no hay una segunda
          versión de esta pantalla. */}
      {materialInventario && (
        <CtpRegistrarProduccionModal
          lote={null}
          titulo={`Inventario declarado — ${materialInventario.speciesCommon}`}
          descripcion={`${materialInventario.speciesCommon} · ${fmtM3(materialInventario.volumenConsumidoM3)} m³ consumidos (declarado, sin trozas reales)`}
          material={{
            especie: materialInventario.speciesCommon,
            especieCientifica: materialInventario.speciesScientific ?? null,
            piezas: 0,
            volumenM3: materialInventario.volumenConsumidoM3,
            permisos: [],
            origenes: [],
          }}
          fecha={materialInventario.fecha}
          productoInicial={materialInventario.productType}
          /* Lo pegado en el paso 1 llega revisado acá: un pegado, un click. */
          sniffsInicial={materialInventario.sniffs}
          guardando={guardandoInventario}
          error={errorInventario}
          ctaLabel="Declarar el inventario"
          onConfirmar={(datos) => void confirmarInventario(datos)}
          onClose={() => {
            setMaterialInventario(null);
            setErrorInventario(null);
          }}
          /* Se anuló un día desde la tira: los lotes releen sin cerrar el modal. */
          onCambioEnElLibro={() => void recargar()}
        />
      )}

      {detalle && (
        <CtpLoteDetalleModal
          lote={detalle}
          ahora={ahora}
          onQuitar={(trozaId) => quitarTroza(detalle.id, trozaId)}
          onEditar={(cambios) => editarLote(detalle.id, cambios)}
          onDeshacer={async () => {
            await deshacer(detalle.id);
            setAviso({
              tono: "ok",
              texto: `Lote ${detalle.code} deshecho: sus piezas volvieron al patio.`,
            });
            setDetalleId(null);
          }}
          onDeshacerForzado={async (motivo, forzar) => {
            const r = await deshacerForzado(detalle.id, motivo, forzar);
            setAviso({
              tono: "ok",
              texto: `Lote ${r.code} eliminado${r.corridaAnulada ? " y su corrida anulada" : ""}: sus piezas volvieron al patio.`,
            });
            setDetalleId(null);
          }}
          onProducir={() => {
            setDetalleId(null);
            onProducir({ id: detalle.id, code: detalle.code });
          }}
          onRecargar={recargar}
          onClose={() => setDetalleId(null)}
        />
      )}

      {/* Qué salió de un lote: lo que queda en patio, lo despachado y lo de uso propio. */}
      {productosDe && (
        <CtpLoteProductosModal
          lote={productosDe}
          onClose={() => setProductosDe(null)}
          onDespachar={(uids) => {
            setProductosDe(null);
            setUidsParaGuia(uids);
          }}
        />
      )}

      {/* Elegir lotes → elegir su madera → la guía, sin salir de la pantalla. */}
      {despachando && (
        <CtpDespacharDesdeLotesModal
          onClose={() => setDespachando(false)}
          onDespachar={(uids) => {
            setDespachando(false);
            setUidsParaGuia(uids);
          }}
        />
      )}

      {/* La MISMA guía que emite «Productos disponibles»: lo elegido entra por
          `presetUids`, así que no hay una segunda forma de declarar una salida. */}
      {uidsParaGuia && (
        <CtpDespachoGuiaModal
          presetUids={uidsParaGuia}
          onClose={() => setUidsParaGuia(null)}
          onSaved={(r) => {
            setUidsParaGuia(null);
            setAviso({
              tono: "ok",
              texto: `Guía emitida con ${r.lineas} línea${r.lineas === 1 ? "" : "s"}${r.offline ? " (queda en cola: se envía al volver la señal)" : ""}.`,
            });
            void recargar();
          }}
        />
      )}
    </div>
  );
}
