"use client";

/**
 * Lotes de aserrío › Lotes — las tarjetas donde se arma lo que va a la sierra
 * (ADR-334). Era el cuerpo entero de `CtpLotesView`; desde la compactación del
 * libro (17-10) la vista tiene dos pestañas —Lotes e Historia del lote— y esto
 * es la primera.
 *
 * El «Lote» es la columna con la que el LO-CTP enlaza Consumos, Producción y
 * Salidas. Lo que se guarda acá lo reusan las otras vistas: Producción lo elige
 * para declarar su corrida, Trozas dice en qué lote está cada pieza y Consumos
 * avisa cuánto espera la sierra. Las cifras salen de `lib/forestal/lotes-aserrio.ts`
 * (puro y testeado): la pantalla no calcula, muestra.
 *
 * Dentro del libro, Indicadores, la lupa, Filtros, Opciones y «Armar lote» van
 * al riel de las vistas (Brandon, 2026-10-17: «los botones… al lado de las
 * pestañas en la esquina»). Tocar el código de un lote abre su historia.
 */

import { useMemo, useState } from "react";
import { Boxes, Loader2, Plus, RefreshCw, ScanBarcode, Truck, Upload } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { AccionesDeLaVista, ORDEN_ACCION, TextoDeAccion, useEnElLibro } from "@/components/admin/shared/libro-acciones-vista";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { libresDelPatio, resumenPatio } from "@/lib/forestal/patio-resumen";
import { alertasDeLote, facetasDeLotes, filtrarLotes, ordenarLotes, resumenLotes } from "@/lib/forestal/lotes-aserrio";
import { cn } from "@/lib/utils";
import type { CtpIngresosFiltroRapido } from "./ctp-shared";
import { useLotesAserrio } from "./hooks/use-lotes-aserrio";
import { useEspeciesFotos } from "./hooks/use-especies-fotos";
import { useFiltrosLotes } from "./hooks/use-filtros-lotes";
import { useLotesModales } from "./hooks/use-lotes-modales";
import { useSeleccionLotes } from "./hooks/use-seleccion-lotes";
import { claseMadera, maderaDe } from "./ctp-lotes-seleccion";
import CtpLotesSeleccionBarra, { ElegirTodosLotes } from "./CtpLotesSeleccionBarra";
import CtpLoteCard from "./CtpLoteCard";
import CtpPropuestaLotes from "./CtpPropuestaLotes";
import CtpLotesBarra from "./CtpLotesBarra";
import CtpLotesModales, { type AvisoLotes } from "./CtpLotesModales";
import { CtpLotesAvisosArriba, CtpLotesParaRevisar } from "./CtpLotesAvisos";
import { useLotesIndicadores } from "./ctp-lotes-indicadores";
import { lotesQueNoCuadran } from "./CtpCuadreSniffsModal";
import { CLASE_PRINCIPAL_RIEL } from "./ctp-riel-piezas";
import { Btn, PanelSkeleton, VistaHeader } from "./ctp-shared";
import type { LoteAProducir } from "./CtpLotesView";

export default function CtpLotesLista({
  onProducir,
  onCargar,
  onIr,
  onHistoria,
}: {
  onProducir: (lote: LoteAProducir) => void;
  /** «Cargar»: lleva a Consumos con este lote elegido (ADR-342). */
  onCargar: (lote: LoteAProducir) => void;
  /** Saltar a otra vista del libro (el aviso de guías sin recepcionar). */
  onIr?: (vista: string, filtro?: CtpIngresosFiltroRapido) => void;
  /** Tocar el código del lote: su historia, en la pestaña de al lado. */
  onHistoria?: (loteId: string) => void;
}) {
  const estadoLotes = useLotesAserrio();
  const { lotes, trozas, cargando, recargar } = estadoLotes;
  const { indice: fotos } = useEspeciesFotos();
  const f = useFiltrosLotes();
  const m = useLotesModales();
  const enLibro = useEnElLibro();
  const [aviso, setAviso] = useState<AvisoLotes | null>(null);

  /** Una sola marca de tiempo por render: los días de espera no pueden variar entre tarjetas. */
  const ahora = useMemo(() => new Date(), [lotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumen = useMemo(() => resumenLotes(lotes), [lotes]);
  /* El filtro rápido «con / sin madera» va después de los demás: es de la
     pantalla (lee `lote.madera`), no del filtro del libro. */
  const visibles = useMemo(() => {
    const base = ordenarLotes(filtrarLotes(lotes, f.filtro, ahora), f.orden, ahora);
    return f.madera === "todos" ? base : base.filter((l) => claseMadera(l) === f.madera);
  }, [lotes, f.filtro, f.orden, f.madera, ahora]);
  const conMadera = useMemo(() => lotes.some((l) => maderaDe(l) != null), [lotes]);
  /* Tildar varios lotes (2026-10-02): cambiar un filtro o recargar limpia. */
  const claveFiltro = useMemo(() => `${JSON.stringify(f.filtro)}|${f.madera}`, [f.filtro, f.madera]);
  const sel = useSeleccionLotes(lotes, visibles, claveFiltro);
  /* Cada filtro cuenta sobre los OTROS, no sobre sí mismo: si no, al elegir una
     especie el desplegable dejaría de ofrecer las demás. */
  const facetas = useMemo(() => facetasDeLotes(lotes, f.filtro, ahora), [lotes, f.filtro, ahora]);
  /** Lo que queda en el patio sin apartar (mismo predicado que Consumos). */
  const libresEnPatio = useMemo(() => libresDelPatio(trozas).length, [trozas]);
  /* La madera que está en el patio pero espera un PAPEL, no la sierra. */
  const patio = useMemo(() => resumenPatio(trozas, ahora), [trozas, ahora]);
  /** Los lotes que piden atención: se anuncian arriba, no hay que abrirlos para enterarse. */
  const conAlerta = useMemo(
    () => lotes.filter((l) => alertasDeLote(l, ahora).some((a) => a.tono === "warning")).length,
    [lotes, ahora],
  );
  /** Lo que el libro no dice igual que el SNIFFS (ADR-398). */
  const descuadres = useMemo(() => lotesQueNoCuadran(lotes), [lotes]);

  const { boton: kpiBoton, panel: kpiPanel } = useLotesIndicadores({
    resumen,
    libresEnPatio,
    estado: f.estado,
    setEstado: f.setEstado,
    onArmar: () => m.setArmar(true),
  });

  /* A la vista, sólo «Armar lote»: lo de vez en cuando va al menú, con la
     línea que explica cada opción (ley de Brandon, regla 4). */
  const opciones: MenuAccion[] = [
    {
      id: "escanear",
      label: "Armar escaneando",
      hint: "Arma la pila con la pistola, pieza por pieza",
      icon: ScanBarcode,
      /* La carga puede ser de hace rato: la pila se arma contra el patio de AHORA. */
      onSelect: () => {
        void recargar();
        m.setEscaneando(true);
      },
    },
    {
      id: "despachar",
      label: "Despachar desde lotes",
      /* En el patio se piensa «sacá lo del 13 y el 15»: arma la MISMA guía. */
      hint: "Elige lotes y arma la guía con su madera",
      icon: Truck,
      onSelect: () => m.setDespachando(true),
    },
    {
      id: "sniffs",
      label: "Traer del SNIFFS",
      hint: "Importa la lista de programaciones ya declaradas allá",
      icon: Upload,
      onSelect: () => m.setImportar(true),
    },
    {
      id: "recargar",
      label: "Recargar",
      hint: "Vuelve a leer los lotes y el patio",
      icon: RefreshCw,
      busy: cargando,
      disabled: cargando,
      onSelect: () => void recargar(),
    },
  ];

  return (
    <div className="space-y-3" data-vista="lotes">
      <VistaHeader
        titulo="Lotes de aserrío"
        meta={
          lotes.length === 0
            ? "todavía ninguno"
            : `${lotes.length} lote${lotes.length === 1 ? "" : "s"} · ` +
              (resumen.abiertos > 0 ? `${resumen.abiertos} esperando la sierra` : "ninguno esperando la sierra") +
              (resumen.vacios > 0 ? ` · ${resumen.vacios} sin piezas` : "")
        }
        hint="Las trozas de una misma especie que van juntas al carro. El lote se arma acá, se consume en Producción y con él salen los despachos. Toca el código de un lote para ver su historia."
      />
      {kpiBoton}
      <AccionesDeLaVista orden={ORDEN_ACCION.principal}>
        <button
          type="button"
          onClick={() => m.setArmar(true)}
          title="Arma un lote con las trozas libres del patio"
          className={cn(CLASE_PRINCIPAL_RIEL, !enLibro && "rounded-2xl")}
        >
          <Plus className="h-5 w-5" aria-hidden />
          <TextoDeAccion corto="Armar">Armar lote</TextoDeAccion>
        </button>
      </AccionesDeLaVista>

      <CtpLotesAvisosArriba
        patio={patio}
        descuadres={descuadres}
        error={estadoLotes.error}
        aviso={aviso}
        onCerrarAviso={() => setAviso(null)}
        onRecepcionar={onIr ? () => onIr("ingresos", "pendiente") : undefined}
        onVerCuadre={() => m.setVerCuadre(true)}
      />

      <CtpLotesBarra
        f={f}
        facetas={facetas}
        conMadera={conMadera}
        hayLotes={lotes.length > 0}
        elegirTodos={<ElegirTodosLotes sel={sel} total={visibles.length} />}
        menu={
          <ActionMenu
            label="Opciones"
            title="Armar escaneando, despachar desde lotes, traer del SNIFFS y recargar"
            actions={opciones}
            size="md"
            compactoEnMovil
            soloIcono={enLibro}
            className={enLibro ? "w-12!" : ""}
          />
        }
      />

      {kpiPanel}

      {!f.filtrando && <CtpLotesParaRevisar cuantos={conAlerta} />}

      {/* Lotes que el sistema propone armar con las trozas libres del patio
          (una especie y un permiso por lote). Se oculta si no hay. */}
      {!f.filtrando && <CtpPropuestaLotes refrescarCon={trozas} onCreado={() => void recargar()} />}

      {cargando && lotes.length === 0 ? (
        /* Tarjetas, no filas: el esqueleto tiene que prometer lo que va a venir. */
        <PanelSkeleton kpis={3} />
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--rule-base)] p-8 text-center">
          <Boxes className="mx-auto mb-3 h-10 w-10 text-[var(--text-tertiary)] opacity-40" aria-hidden />
          <p className="text-base font-bold text-[var(--text-primary)]">
            {lotes.length === 0 ? "Todavía no hay lotes de aserrío" : "Ningún lote coincide con el filtro"}{" "}
            <InfoTip
              title={lotes.length === 0 ? "Qué es un lote" : "Sin resultados"}
              body={
                lotes.length === 0
                  ? "Las trozas de una misma especie que entran juntas a la sierra. Ármalo con las piezas del patio; Producción lo consume de un click."
                  : "Prueba con otro estado o limpia la búsqueda."
              }
            />
          </p>
          <span className="mt-4 inline-flex">
            {lotes.length === 0 ? (
              <Btn variant="primary" onClick={() => m.setArmar(true)}>
                <Plus className="h-4 w-4" /> Armar el primero
              </Btn>
            ) : (
              <Btn variant="secondary" onClick={f.limpiar}>
                Limpiar los filtros
              </Btn>
            )}
          </span>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((l) => (
            <li key={l.id}>
              <CtpLoteCard
                lote={l}
                fotos={fotos}
                ahora={ahora}
                onVer={() => m.setDetalleId(l.id)}
                onAgregar={() => onCargar({ id: l.id, code: l.code })}
                onProducir={() => onProducir({ id: l.id, code: l.code })}
                onDeshacer={() => m.setDetalleId(l.id)}
                onResolverCuadre={() => m.setResolviendoId(l.id)}
                onVerProductos={() => m.setProductosDe({ code: l.code, especie: l.speciesCommon })}
                onHistoria={onHistoria ? () => onHistoria(l.id) : undefined}
                elegido={sel.elegidos.has(l.id)}
                onElegir={() => sel.alternar(l.id)}
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

      {sel.lista.length > 0 && (
        <CtpLotesSeleccionBarra
          sel={sel}
          todos={lotes}
          onDespachar={m.setUidsParaGuia}
          setAviso={setAviso}
          onCambio={() => void recargar()}
        />
      )}

      <CtpLotesModales
        m={m}
        estado={estadoLotes}
        ahora={ahora}
        onProducir={onProducir}
        onCargar={onCargar}
        setAviso={setAviso}
      />
    </div>
  );
}
