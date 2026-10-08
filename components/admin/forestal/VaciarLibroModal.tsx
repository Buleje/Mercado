"use client";

/**
 * Confirmar que se vacía el Libro de Operaciones — entero o por partes.
 *
 * Borra el registro que acredita el origen legal de la madera, así que la
 * pantalla no pregunta «¿seguro?» y ya: muestra QUÉ se borra —contado contra
 * la base y recontado cada vez que cambian las casillas— y pide escribir la
 * frase. Un botón de confirmar se aprieta sin leer; una frase hay que copiarla
 * mirando la lista que tiene justo arriba.
 *
 * Meses cerrados (Brandon 2026-10-02, «Solo protege su mes»): con «Todo el
 * libro» ni siquiera ofrece el botón —borraría un mes que ya se presentó ante
 * SERFOR, y reabrirlo es otra decisión, con su motivo y su rastro— y el aviso
 * va SOLO, sin la caja roja de «Esto borra…». Con las demás casillas se borra
 * lo de los meses abiertos y la lista dice qué se queda por ser de uno cerrado.
 *
 * **Varias a la vez (Brandon, 2026-10-02):** las casillas se suman (la unión;
 * una corrida que cae en dos se cuenta una vez). «Todo el libro» no se suma:
 * ya incluye lo demás, y al marcarlo las otras se apagan. Se agregó «Lotes»
 * — qué pasa con lo que cuelga de un lote: `lib/forestal/ctp-purga-plan.ts`.
 */

import { useEffect, useRef, useState } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { AlertTriangle, Trash2, X } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { useVaciarLibro } from "./hooks/use-vaciar-libro";
import {
  AlcancesVaciado,
  ListaDeLoQueSeBorra,
  LoDeMesCerrado,
  LotesQueNoSeBorran,
  TodoConMesCerrado,
} from "./vaciar-libro-partes";

export default function VaciarLibroModal({ onClose, onVaciado }: { onClose: () => void; onVaciado?: () => void }) {
  /* Sin esto el foco se queda atrás del modal: Tab se va a la pantalla
     de abajo y Escape no cierra (hook medido en el módulo, 2026-09-09). */
  const cajaRef = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRef, { onCerrar: onClose });
  /** Ventana: se mueve, se achica y se fija (ADR-420). */
  const ventana = useVentanaDeModal(true, {
    ref: cajaRef,
    aplicarTranslate: true,
    claveMemoria: "ctp-vaciar-libro",
  });
  const v = useVaciarLibro(onVaciado);
  const [escrito, setEscrito] = useState("");

  /* Cambiar las casillas invalida lo escrito: la frase confirma ESTA lista. */
  const alternar = (a: Parameters<typeof v.alternar>[0]) => {
    setEscrito("");
    v.alternar(a);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { resumen, hecho } = v;
  const esTodo = v.elegidos.includes("todo");
  /* Sólo «Todo el libro» se frena por un mes cerrado; lo parcial lo salva. */
  const bloqueado = esTodo && v.periodos.length > 0;
  const nada = v.elegidos.length === 0;
  const vacio = resumen != null && resumen.conteo.total === 0 && resumen.conteo.trozasAlPatio === 0;
  const puedeBorrar = !hecho && !nada && !vacio && !bloqueado && resumen != null && !v.cargando;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !ventana.fijado) onClose(); }}
    >
      <div ref={cajaRef} tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Vaciar el Libro de Operaciones"
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
      >
        <div {...ventana.asaProps} className="flex shrink-0 items-start justify-between gap-3 px-6 pb-3 pt-5">
          <SectionTitle as="h2" className="text-[var(--text-primary)]">Vaciar el Libro de Operaciones</SectionTitle>
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
          </span>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-5 px-5 sm:px-6">
          {hecho ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-[var(--data-success)]/10 p-4">
                <p className="text-base font-extrabold text-[var(--text-primary)]">
                  {hecho.alcances.includes("todo") ? "El libro quedó vacío." : "Listo. Se borró esto:"}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Quedó registrado en la auditoría.</p>
              </div>
              <ListaDeLoQueSeBorra resumen={hecho} hecho />
              <LotesQueNoSeBorran lotes={hecho.lotesBloqueados} />
            </div>
          ) : (
            <>
              <AlcancesVaciado elegidos={v.elegidos} onAlternar={alternar} deshabilitado={v.borrando} />

              {nada && <p className="text-base text-[var(--text-tertiary)]">Marca lo que quieres borrar para ver cuánto es.</p>}
              {v.cargando && <p className="text-base text-[var(--text-tertiary)]">Contando lo que hay…</p>}

              {!v.cargando && resumen && (
                vacio ? (
                  <>
                    <p className="text-base text-[var(--text-secondary)]">
                      {esTodo ? "El libro ya está vacío: no hay nada que borrar." : "No hay nada que borrar con lo que marcaste."}
                    </p>
                    <LoDeMesCerrado salvado={resumen.conteo.deMesCerrado} />
                    <LotesQueNoSeBorran lotes={resumen.lotesBloqueados} />
                  </>
                ) : bloqueado ? (
                  <TodoConMesCerrado periodos={v.periodos} />
                ) : (
                  <>
                    <div className="rounded-xl bg-[var(--data-error)]/10 p-4">
                      <p className="flex items-start gap-2 text-base font-extrabold text-[var(--data-error)]">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                        Esto borra {esTodo ? "el libro entero" : "lo de la lista"} y no se puede deshacer.
                      </p>
                      <p className="mt-2 text-base text-[var(--text-secondary)]">
                        El Libro de Operaciones acredita el origen legal de tu madera ante SERFOR y OSINFOR.
                        {esTodo
                          ? " Si lo vacías, hay que volver a cargarlo o importarlo del SNIFFS."
                          : " Lo que no está en la lista no se toca."}
                      </p>
                    </div>

                    <LotesQueNoSeBorran lotes={resumen.lotesBloqueados} />

                    <div className="space-y-3 rounded-xl border-2 border-[var(--data-error)]/40 p-4">
                      <p className="text-base font-extrabold text-[var(--text-primary)]">Vas a borrar</p>
                      <ListaDeLoQueSeBorra resumen={resumen} />
                      <div>
                        <label htmlFor="confirmar-purga" className="text-base font-semibold text-[var(--text-primary)]">
                          Escribe <strong className="font-mono">{v.palabra}</strong> para confirmar
                        </label>
                        <input
                          id="confirmar-purga"
                          value={escrito}
                          onChange={(e) => setEscrito(e.target.value)}
                          autoComplete="off"
                          placeholder={v.palabra}
                          className="mt-1 h-12 w-full rounded-xl bg-[var(--surface-sunken)] px-4 text-base font-bold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--data-error)]"
                        />
                      </div>
                    </div>
                  </>
                )
              )}
            </>
          )}

          {v.err && (
            <p className="flex items-start gap-2 rounded-xl bg-[var(--data-error)]/10 px-4 py-3 text-base font-semibold text-[var(--data-error)]">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {v.err}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 bg-[var(--surface-sunken)] px-6 py-4">
          <button
            onClick={onClose}
            className="h-12 rounded-xl px-5 text-base font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)]"
          >
            {hecho ? "Cerrar" : "Mejor no"}
          </button>
          {puedeBorrar && (
            <button
              onClick={() => void v.vaciar(escrito)}
              disabled={v.borrando || escrito.trim().toUpperCase() !== v.palabra}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--data-error)] px-5 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Trash2 className="h-5 w-5" /> {v.borrando ? "Vaciando…" : esTodo ? "Vaciar el libro" : "Borrar lo marcado"}
            </button>
          )}
        </div>

        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}
