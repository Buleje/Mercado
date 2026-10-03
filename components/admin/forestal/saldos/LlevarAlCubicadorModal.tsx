"use client";

/**
 * «Llevar al cubicador»: la capacidad filtrada se convierte en bloques de la
 * distribución de rolliza sobre lo aserrado (Brandon, 2026-09-08).
 *
 * El viaje que reemplaza: mirar el número en Saldos, memorizarlo, abrir
 * Herramientas → Resúmenes → Rolliza, y tipearlo a mano. Retipear es como el
 * papel que se firma y el Libro empiezan a decir cifras distintas.
 *
 * Por qué hay un paso intermedio y no un botón que manda todo de una:
 *
 *  · La capacidad son **cuatro fuentes** y no siempre se quieren las cuatro —
 *    «lo que todavía no llegó» rara vez entra en la hoja de hoy.
 *  · Dos de ellas ya vienen en unidades de **aserrada** y dos son **rolliza**.
 *    Verlo antes de mandar evita la pregunta de después: «¿por qué el bloque
 *    dice 4.787 y la tarjeta decía 2.681?».
 *
 * Lo que NO hace: descontar, reservar ni marcar nada. La distribución es un
 * papel de respaldo, no un movimiento del Libro.
 */

import { useMemo, useState, useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import {
  ControlesDeVentana,
  TiradorDeVentana,
} from "@/components/admin/shared/modal-controles-ventana";
import { ArrowRight, Loader2, X } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import {
  bloqueDeCandidato,
  especiesDeCandidatos,
  totalesDeCandidatos,
  type CandidatoDeCapacidad,
} from "@/lib/forestal/capacidad-a-bloques";
import { abrirResumenesDelCubicador, sembrarBloques } from "@/lib/forestal/sembrar-reparto";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import FilaCandidato, { ChipEspecie } from "./llevar-al-cubicador-fila";
import ResumenLlevarAlCubicador from "./resumen-llevar-al-cubicador";

export default function LlevarAlCubicadorModal({
  candidatos,
  recorte,
  onCerrar,
}: {
  candidatos: CandidatoDeCapacidad[];
  /** El recorte en palabras, para que el bloque diga de dónde salió. */
  recorte: string;
  onCerrar: () => void;
}) {
  /* Sin esto el foco se queda atrás del modal: Tab se va a la pantalla
     de abajo y Escape no cierra (hook medido en el módulo, 2026-09-09). */
  const cajaRef = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRef, { onCerrar: onCerrar });
  /** Ventana: se mueve, se achica y se fija (ADR-420). */
  const ventana = useVentanaDeModal(true, {
    ref: cajaRef,
    aplicarTranslate: true,
    claveMemoria: "ctp-llevar-al-cubicador",
  });
  const [elegidos, setElegidos] = useState<Set<string>>(
    () => new Set(candidatos.map((c) => c.clave)),
  );
  const [yendo, setYendo] = useState(false);

  const seleccion = useMemo(
    () => candidatos.filter((c) => elegidos.has(c.clave)),
    [candidatos, elegidos],
  );
  const totales = useMemo(() => totalesDeCandidatos(seleccion), [seleccion]);
  /* Con qué especie llega cada bloque — de lo tildado; sin nada tildado, de
     todo el modal, para que se vea igual qué madera hay. */
  const especies = useMemo(
    () => especiesDeCandidatos(seleccion.length > 0 ? seleccion : candidatos),
    [seleccion, candidatos],
  );
  const pct = Math.round(RENDIMIENTO_META * 100);

  const alternar = (clave: string) =>
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });

  const llevar = () => {
    if (seleccion.length === 0 || yendo) return;
    setYendo(true);
    /* Cada bloque lleva SU especie (`bloqueDeCandidato`): la distribución
       agrupa por ella y no hay que volver a elegirla en la tabla. */
    sembrarBloques(
      seleccion.map(bloqueDeCandidato),
      "capacidad",
    );
    abrirResumenesDelCubicador();
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-system flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !ventana.fijado) onCerrar();
      }}
    >
      <div ref={cajaRef} tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Llevar la madera filtrada al cubicador"
        className="relative max-h-[90vh] w-full max-w-[60rem] overflow-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-lg)]"
      >
        <div {...ventana.asaProps} className="mb-1 flex items-start justify-between gap-3">
          <div>
            <SectionTitle className="text-base font-extrabold text-[var(--text-primary)]">
              Llevar esta madera al cubicador
            </SectionTitle>
            <p className="text-sm text-[var(--text-tertiary)]">
              {recorte ? `Sólo ${recorte}` : "Toda la planta"} · se cargan como bloques en la
              distribución de rolliza sobre lo aserrado, cada uno con su especie
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
          </span>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {candidatos.length === 0 ? (
          <p className="mt-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-6 text-center text-sm text-[var(--text-secondary)]">
            Con este recorte no queda madera para repartir. Quita algún filtro y vuelve a
            intentar.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
            {/* Resumen: arriba en móvil (plegable), al lado en escritorio. */}
            <div className="order-first lg:order-last lg:sticky lg:top-0">
              <ResumenLlevarAlCubicador seleccion={seleccion} candidatos={candidatos} />
            </div>
            <div className="min-w-0">
            <ul className="space-y-1.5">
              {candidatos.map((c) => (
                <li key={c.clave}>
                  <FilaCandidato
                    c={c}
                    elegido={elegidos.has(c.clave)}
                    onAlternar={() => alternar(c.clave)}
                    pct={pct}
                  />
                </li>
              ))}
            </ul>

            <div className="mt-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5 text-sm">
              <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[var(--text-secondary)]">
                <span>
                  Rolliza{" "}
                  <b className="font-mono tabular-nums text-[var(--text-primary)]">
                    {fmtM3(totales.rolliza)} m³
                  </b>
                </span>
                <span>
                  Ya aserrada{" "}
                  <b className="font-mono tabular-nums text-[var(--text-primary)]">
                    {fmtM3(totales.aserrada)} m³
                  </b>
                </span>
                <span className="ml-auto flex items-center gap-1">
                  Ampararía{" "}
                  <b className="font-mono tabular-nums text-[var(--text-primary)]">
                    {fmtM3(totales.amparaM3)} m³
                  </b>
                  {/* Los dos volúmenes no se suman entre sí: troza y tabla no se
                      miden igual. Decirlo acá evita el «¿y el total?». */}
                  <InfoTip
                    icono="ayuda"
                    title="Cómo se lee el amparo"
                    what={`La rolliza y la madera ya aserrada no se suman entre sí: la primera pasa por el ${pct} % antes de amparar.`}
                    affects="Esto no descuenta ni reserva nada del Libro: la distribución es un papel de respaldo."
                  />
                </span>
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--rule-soft)] pt-2 text-[var(--text-secondary)]">
                <span>{seleccion.length > 0 ? "Llegan a la distribución como" : "Especies en el modal"}</span>
                {especies.map((e) => (
                  <ChipEspecie key={e.especie || "sin-especie"} especie={e.especie} bloques={e.bloques} />
                ))}
              </p>
            </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="h-11 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={llevar}
            disabled={seleccion.length === 0 || yendo}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--accent)] bg-primary/10 px-4 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[var(--accent)]"
          >
            {yendo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Llevar {seleccion.length}{" "}
            {seleccion.length === 1 ? "bloque" : "bloques"} al cubicador
          </button>
        </div>

        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}
