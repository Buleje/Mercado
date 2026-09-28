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
 *
 * «Tarjetas fáciles de leer» (Brandon, 2026-09-27): arriba un solo botón
 * («Armar lote») y el resto en «Opciones»; los filtros detrás de «Filtros»; y
 * cada tarjeta dice lo que importa en palabras. La vista se partió en piezas
 * (barra, avisos, indicadores, modales) porque pasaba de 800 líneas.
 */

import { useMemo, useState } from "react";
import { Boxes, Loader2, Plus, RefreshCw, ScanBarcode, Truck, Upload } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { libresDelPatio, resumenPatio } from "@/lib/forestal/patio-resumen";
import type { CtpIngresosFiltroRapido } from "./ctp-shared";
import { alertasDeLote, facetasDeLotes, filtrarLotes, ordenarLotes, resumenLotes } from "@/lib/forestal/lotes-aserrio";
import { useLotesAserrio } from "./hooks/use-lotes-aserrio";
import { useEspeciesFotos } from "./hooks/use-especies-fotos";
import { useFiltrosLotes } from "./hooks/use-filtros-lotes";
import { useLotesModales } from "./hooks/use-lotes-modales";
import CtpLoteCard from "./CtpLoteCard";
import CtpPropuestaLotes from "./CtpPropuestaLotes";
import CtpLotesBarra from "./CtpLotesBarra";
import CtpLotesModales, { type AvisoLotes } from "./CtpLotesModales";
import { CtpLotesAvisosArriba, CtpLotesParaRevisar } from "./CtpLotesAvisos";
import { useLotesIndicadores } from "./ctp-lotes-indicadores";
import { lotesQueNoCuadran } from "./CtpCuadreSniffsModal";
import { Btn, PanelSkeleton, VistaHeader } from "./ctp-shared";

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
  const estadoLotes = useLotesAserrio();
  const { lotes, trozas, cargando, recargar } = estadoLotes;
  const { indice: fotos } = useEspeciesFotos();
  const f = useFiltrosLotes();
  const m = useLotesModales();
  const [aviso, setAviso] = useState<AvisoLotes | null>(null);

  /** Una sola marca de tiempo por render: los días de espera no pueden variar entre tarjetas. */
  const ahora = useMemo(() => new Date(), [lotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumen = useMemo(() => resumenLotes(lotes), [lotes]);
  const visibles = useMemo(
    () => ordenarLotes(filtrarLotes(lotes, f.filtro, ahora), f.orden, ahora),
    [lotes, f.filtro, f.orden, ahora],
  );
  /* Cada filtro cuenta sobre los OTROS, no sobre sí mismo: si no, al elegir una
     especie el desplegable dejaría de ofrecer las demás. */
  const facetas = useMemo(() => facetasDeLotes(lotes, f.filtro, ahora), [lotes, f.filtro, ahora]);
  /** Lo que queda en el patio sin apartar: la materia prima de un lote nuevo.
   *  Mismo predicado que Consumos (`estaLibreEnPatio`). */
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
      /* La carga de la pestaña puede ser de hace rato: la pila se arma contra
         el patio de AHORA (revisión 26-09). */
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
      /* La lista entera de una (ADR-398): un CTP que empieza tiene decenas. */
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
        hint="Las trozas de una misma especie que van juntas al carro. El lote se arma acá, se consume en Producción y con él salen los despachos."
      >
        <ActionMenu
          label="Opciones"
          title="Armar escaneando, despachar desde lotes, traer del SNIFFS y recargar"
          actions={opciones}
          size="md"
          compactoEnMovil
        />
        <Btn variant="primary" onClick={() => m.setArmar(true)} className="h-12">
          <Plus className="h-4 w-4" /> Armar lote
        </Btn>
      </VistaHeader>

      <CtpLotesAvisosArriba
        patio={patio}
        descuadres={descuadres}
        error={estadoLotes.error}
        aviso={aviso}
        onCerrarAviso={() => setAviso(null)}
        onRecepcionar={onIr ? () => onIr("ingresos", "pendiente") : undefined}
        onVerCuadre={() => m.setVerCuadre(true)}
      />

      <CtpLotesBarra f={f} facetas={facetas} kpiBoton={kpiBoton} />

      {kpiPanel}

      {!f.filtrando && <CtpLotesParaRevisar cuantos={conAlerta} />}

      {/* Lotes que el sistema propone armar con las trozas libres del patio
          (una especie y un permiso por lote). Se oculta si no hay. */}
      {!f.filtrando && <CtpPropuestaLotes refrescarCon={trozas} onCreado={() => void recargar()} />}

      {cargando && lotes.length === 0 ? (
        /* Tarjetas, no filas: el esqueleto tiene que prometer lo que va a venir. */
        <PanelSkeleton kpis={3} />
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--rule-base)] p-10 text-center">
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
          {lotes.length === 0 ? (
            <span className="mt-4 inline-flex">
              <Btn variant="primary" onClick={() => m.setArmar(true)}>
                <Plus className="h-4 w-4" /> Armar el primero
              </Btn>
            </span>
          ) : (
            <span className="mt-4 inline-flex">
              <Btn variant="secondary" onClick={f.limpiar}>
                Limpiar los filtros
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
                onVer={() => m.setDetalleId(l.id)}
                onAgregar={() => onCargar({ id: l.id, code: l.code })}
                onProducir={() => onProducir({ id: l.id, code: l.code })}
                onDeshacer={() => m.setDetalleId(l.id)}
                onResolverCuadre={() => m.setResolviendoId(l.id)}
                onVerProductos={() => m.setProductosDe({ code: l.code, especie: l.speciesCommon })}
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
