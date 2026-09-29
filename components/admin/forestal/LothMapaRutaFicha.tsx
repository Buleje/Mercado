"use client";

/**
 * LothMapaRutaFicha — lo que aparece al tocar una ruta (o un punto del plano)
 * en el mapa: nombre y tipo, largo, pendiente máxima, inicio y fin en UTM y en
 * lat/lng, y los vértices a un toque. Lo mismo que la fila de «Rutas y
 * puntos» debajo del mapa, dicho por las mismas funciones.
 *
 * Como la ficha del árbol: no es un modal —el mapa sigue vivo detrás—, en la
 * computadora va arriba a la izquierda y en el celular abajo, donde llega el
 * pulgar. Escape la cierra y el foco vuelve a donde estaba.
 */

import { useEffect, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown, Locate, X } from "@buleje/design-system/icons";
import { textoDePunto, textoDeRuta, textoLargo, textoPendiente, type FilaPunto, type FilaRuta } from "@/lib/forestal/loth-rutas-coordenadas";
import { BotonCopiar, BTN_ICONO_RUTA, CoordTexto, ListaVertices, MuestraVia } from "./loth-rutas-ui";

type Props = { onCerrar: () => void; onCentrar: () => void } & ({ ruta: FilaRuta; punto?: undefined } | { ruta?: undefined; punto: FilaPunto });

const DATO = "rounded-lg bg-[var(--surface-sunken)] px-2 py-1.5";
const DATO_ROTULO = "block text-xs font-semibold text-[var(--text-tertiary)]";
const DATO_VALOR = "block text-sm font-bold tabular-nums text-[var(--text-primary)]";

export default function LothMapaRutaFicha({ ruta, punto, onCerrar, onCentrar }: Props) {
  const fichaRef = useRef<HTMLElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const origenRef = useRef<HTMLElement | null>(null);
  const [verVertices, setVerVertices] = useState(false);
  const clave = ruta?.clave ?? punto?.clave ?? "";
  const nombre = ruta?.nombre ?? punto?.nombre ?? "";

  // Al abrir (o pasar a otra ruta) el foco va al título y la ficha a la vista.
  useEffect(() => {
    const activo = document.activeElement;
    if (activo instanceof HTMLElement && !fichaRef.current?.contains(activo)) origenRef.current = activo;
    fichaRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    tituloRef.current?.focus({ preventScroll: true });
    setVerVertices(false);
  }, [clave]);
  useEffect(
    () => () => {
      const origen = origenRef.current;
      if (origen?.isConnected) origen.focus({ preventScroll: true });
    },
    [],
  );

  return (
    <section
      ref={fichaRef}
      aria-labelledby="loth-ficha-ruta-titulo"
      data-ficha-ruta={clave}
      data-tapa-mapa
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        onCerrar();
      }}
      className="absolute left-14 top-3 z-30 max-h-[calc(100%-1.5rem)] w-[21rem] overflow-y-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-[var(--shadow-lg)] max-sm:inset-x-2 max-sm:bottom-2 max-sm:left-2 max-sm:top-auto max-sm:max-h-[62%] max-sm:w-auto"
    >
      <div className="flex items-start gap-2">
        <span className="mt-2.5">
          {ruta ? (
            <MuestraVia color={ruta.color} punteada={ruta.tipo === "trocha" || ruta.tipo === "marginal"} />
          ) : (
            <span aria-hidden="true" className="block h-3 w-3 rounded-full" style={{ backgroundColor: punto?.color }} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle id="loth-ficha-ruta-titulo" ref={tituloRef} tabIndex={-1} className="font-black leading-tight focus:outline-none">
            {nombre}
          </CardTitle>
          <p className="text-sm text-[var(--text-secondary)]">{ruta?.tipoLabel ?? punto?.tipoLabel}</p>
        </div>
        <BotonCopiar
          texto={ruta ? textoDeRuta(ruta, true) : punto ? textoDePunto(punto) : ""}
          que={ruta ? `las coordenadas de ${nombre}` : `la coordenada de ${nombre}`}
          etiqueta={ruta ? "Copiar las coordenadas de la ruta" : "Copiar la coordenada del punto"}
        />
        <button type="button" onClick={onCentrar} aria-label="Llevar el mapa hasta acá" title="Llevar el mapa hasta acá" className={BTN_ICONO_RUTA}>
          <Locate className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={onCerrar} aria-label="Cerrar la ficha" title="Cerrar (Escape)" className={BTN_ICONO_RUTA}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {ruta ? (
        <>
          <dl className="mt-2 grid grid-cols-3 gap-1.5">
            <div className={DATO}>
              <dt className={DATO_ROTULO}>Largo</dt>
              <dd className={DATO_VALOR}>{textoLargo(ruta.largoM)}</dd>
            </div>
            <div className={DATO}>
              <dt className={DATO_ROTULO}>Pend. máx.</dt>
              <dd className={DATO_VALOR}>{textoPendiente(ruta.pendienteMaxPct)}</dd>
            </div>
            <div className={DATO}>
              <dt className={DATO_ROTULO}>Vértices</dt>
              <dd className={DATO_VALOR}>{ruta.vertices.length}</dd>
            </div>
            <div className={`${DATO} col-span-3`}>
              <dt className={DATO_ROTULO}>Inicio</dt>
              <dd>
                <CoordTexto c={ruta.inicio} />
              </dd>
            </div>
            <div className={`${DATO} col-span-3`}>
              <dt className={DATO_ROTULO}>Fin</dt>
              <dd>
                <CoordTexto c={ruta.fin} />
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => setVerVertices((v) => !v)}
            aria-expanded={verVertices}
            aria-controls="loth-ficha-ruta-vertices"
            className="mt-2 inline-flex h-10 w-full items-center justify-between rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            {verVertices ? "Ocultar los vértices" : `Ver los ${ruta.vertices.length} vértices`}
            <ChevronDown className={`h-4 w-4 transition-transform ${verVertices ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {verVertices && (
            <div className="mt-1.5">
              <ListaVertices id="loth-ficha-ruta-vertices" vertices={ruta.vertices} />
            </div>
          )}
        </>
      ) : punto ? (
        <dl className="mt-2 space-y-1.5">
          <div className={DATO}>
            <dt className={DATO_ROTULO}>Coordenada</dt>
            <dd>
              <CoordTexto c={punto.punto} />
            </dd>
          </div>
          {punto.nota && (
            <div className={DATO}>
              <dt className={DATO_ROTULO}>Nota</dt>
              <dd className="text-sm text-[var(--text-primary)]">{punto.nota}</dd>
            </div>
          )}
        </dl>
      ) : null}
    </section>
  );
}
