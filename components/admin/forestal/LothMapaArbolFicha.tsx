"use client";

/**
 * LothMapaArbolFicha — lo que aparece al tocar un árbol del censo en el mapa:
 * código, especie (común · científica · nativa), DAP, altura, volumen,
 * condición del regente, la etapa según el libro y lo que el libro hizo con él
 * (talado, trozado, despachado, en el CTP — `LothMapaArbolCadena`), dónde está
 * (UTM, dentro o fuera del área) y, si el GPS está prendido, a cuántos metros
 * y hacia dónde queda. Si está en pie y se puede talar, el botón «Registrar
 * tala» lleva al libro con el árbol ya elegido.
 *
 * No es un modal: el mapa sigue vivo detrás (se puede tocar otro árbol). En el
 * celular va abajo, a lo ancho, donde llega el pulgar; en la computadora,
 * arriba a la izquierda, junto al zoom. Escape la cierra.
 */

import { useEffect, useRef } from "react";
import { CardTitle } from "@buleje/design-system";
import { Locate, X } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { textoCortoEtapa } from "@/lib/forestal/loth-etapa-arbol";
import {
  CLASE_ARBOL_LABEL,
  claseDelArbol,
  ESTADO_ARBOL_LABEL,
  origenDeLaClase,
  poaDiscrepa,
  rumboCardinal,
  textoDistancia,
  type ArbolCercano,
} from "@/lib/forestal/loth-mapa-arboles";
import LothMapaArbolSimbolo from "./LothMapaArbolSimbolo";
import LothMapaArbolCadena from "./LothMapaArbolCadena";
import LothMapaRegistrarTala from "./LothMapaRegistrarTala";
import type { CensoTree } from "./loth-mapa-shared";

interface Props {
  arbol: CensoTree;
  /** Distancia y rumbo desde tu GPS (null = la búsqueda está apagada). */
  desdeTi: ArbolCercano | null;
  /** Hay polígono declarado y el árbol cae fuera. */
  fuera: boolean;
  /** Todavía se está leyendo lo que hizo el libro con cada árbol. */
  leyendoLibro?: boolean;
  onCerrar: () => void;
  onCentrar: () => void;
}

const DATO = "rounded-lg bg-[var(--surface-sunken)] px-2 py-1.5";
const DATO_ROTULO = "block text-xs font-semibold text-[var(--text-tertiary)]";
const DATO_VALOR = "block text-sm font-bold tabular-nums text-[var(--text-primary)]";
const BTN_ICONO =
  "inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--data-info-500)]";

export default function LothMapaArbolFicha({ arbol, desdeTi, fuera, leyendoLibro = false, onCerrar, onCentrar }: Props) {
  const fichaRef = useRef<HTMLElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const origenRef = useRef<HTMLElement | null>(null);
  const clase = claseDelArbol(arbol);
  const origen = origenDeLaClase(arbol);
  const discrepa = poaDiscrepa(arbol);
  // La etapa según el libro («Trozado ×3»); sin ella, lo que dice el censo.
  const estado = arbol.etapa ? textoCortoEtapa(arbol.etapa, arbol.cadena) : (ESTADO_ARBOL_LABEL[arbol.estado] ?? arbol.estado);

  // Al abrir (o pasar a otro árbol) el foco va al título: con teclado o lector
  // de pantalla se lee la ficha que se acaba de abrir, no el marcador de atrás.
  // Y la ficha a la vista: elegida desde la lista de abajo, en el celular el
  // mapa puede haber quedado arriba, fuera de la pantalla.
  useEffect(() => {
    // De dónde vino (el marcador, la fila de «los más cercanos»): al cerrar, el foco vuelve ahí.
    const activo = document.activeElement;
    if (activo instanceof HTMLElement && !fichaRef.current?.contains(activo)) origenRef.current = activo;
    fichaRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    tituloRef.current?.focus({ preventScroll: true });
  }, [arbol.id]);
  useEffect(
    () => () => {
      const origen = origenRef.current;
      if (origen?.isConnected) origen.focus({ preventScroll: true });
    },
    [],
  );

  // «Otra» muestra lo que escribió el regente tal cual: la hoja manda.
  const condicion =
    origen === "regente"
      ? clase === "otra"
        ? (arbol.condicion ?? CLASE_ARBOL_LABEL.otra)
        : CLASE_ARBOL_LABEL[clase]
      : origen === "poa"
        ? `${CLASE_ARBOL_LABEL[clase]} (según el POA)`
        : CLASE_ARBOL_LABEL.sin_dato;

  return (
    <section
      ref={fichaRef}
      aria-labelledby="loth-ficha-arbol-titulo"
      data-ficha-arbol={arbol.code}
      data-tapa-mapa
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        // Que Escape no saque además de pantalla completa (ese oyente respeta defaultPrevented).
        e.preventDefault();
        onCerrar();
      }}
      className="absolute left-14 top-3 z-30 max-h-[calc(100%-1.5rem)] w-[21rem] overflow-y-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-[var(--shadow-lg)] max-sm:inset-x-2 max-sm:bottom-2 max-sm:left-2 max-sm:top-auto max-sm:w-auto"
    >
      <div className="flex items-start gap-2">
        <span className="mt-1">
          <LothMapaArbolSimbolo clase={clase} estado={arbol.estado} etapa={arbol.etapa} aviso={arbol.conAviso} lado={22} />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle id="loth-ficha-arbol-titulo" ref={tituloRef} tabIndex={-1} className="font-black leading-tight focus:outline-none">
            Árbol {arbol.code}
            {arbol.cites && <span className="ml-1.5 text-xs font-bold text-[var(--data-error-ink)]">CITES</span>}
          </CardTitle>
          <p className="text-sm font-bold text-[var(--text-primary)]">{arbol.species}</p>
          {arbol.speciesScientific && <p className="text-xs italic text-[var(--text-secondary)]">{arbol.speciesScientific}</p>}
          <p className="text-xs text-[var(--text-secondary)]">
            Nombre nativo: <b className="font-bold text-[var(--text-primary)]">{arbol.speciesNative ?? "—"}</b>
          </p>
        </div>
        <button type="button" onClick={onCentrar} aria-label="Centrar el mapa en este árbol" title="Centrar el mapa en este árbol" className={BTN_ICONO}>
          <Locate className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={onCerrar} aria-label="Cerrar la ficha del árbol" title="Cerrar (Escape)" className={BTN_ICONO}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <dl className="mt-2 grid grid-cols-3 gap-1.5">
        <div className={DATO}>
          <dt className={DATO_ROTULO}>DAP</dt>
          <dd className={DATO_VALOR}>{arbol.dapM != null ? `${Number(arbol.dapM).toFixed(2)} m` : "—"}</dd>
        </div>
        <div className={DATO}>
          <dt className={DATO_ROTULO}>Altura</dt>
          <dd className={DATO_VALOR}>{arbol.alturaM != null ? `${Number(arbol.alturaM).toFixed(1)} m` : "—"}</dd>
        </div>
        <div className={DATO}>
          <dt className={DATO_ROTULO}>Volumen</dt>
          <dd className={DATO_VALOR}>{arbol.volumeM3 != null ? `${fmtM3(arbol.volumeM3)} m³` : "—"}</dd>
        </div>
        <div className={`${DATO} col-span-2`}>
          <dt className={DATO_ROTULO}>Condición</dt>
          <dd className={DATO_VALOR}>{condicion}</dd>
        </div>
        <div className={DATO}>
          <dt className={DATO_ROTULO}>Estado</dt>
          <dd className={DATO_VALOR}>{estado}</dd>
        </div>
      </dl>

      {discrepa && (
        <p className="mt-1.5 text-xs font-semibold text-[var(--data-warning-ink)]">El POA lo cuenta como {CLASE_ARBOL_LABEL[discrepa].toLowerCase()}.</p>
      )}

      <p className="mt-2 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
        {arbol.utmZona} · E {Math.round(arbol.utmX)} · N {Math.round(arbol.utmY)}
        {fuera && <span className="ml-1.5 font-sans font-bold text-[var(--data-error-ink)]">fuera del área</span>}
      </p>
      <LothMapaArbolCadena arbol={arbol} leyendo={leyendoLibro} />

      {desdeTi && (
        <p className="mt-1 text-sm font-bold text-[var(--text-primary)]">
          A {textoDistancia(desdeTi.distanciaM)} {rumboCardinal(desdeTi.rumboDeg).largo} de ti
        </p>
      )}

      <LothMapaRegistrarTala arbol={arbol} className="mt-2.5" />
    </section>
  );
}
