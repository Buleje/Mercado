"use client";

/**
 * Los renglones de «Trozar un árbol»: una troza por renglón, medida en la
 * forma fijada en el equipo, y recorrida con el teclado como una planilla
 * (flechas y Enter; en el último campo, Enter va a «Agregar troza», y la troza
 * nueva recibe el foco).
 *
 * A 1280 cada troza es una fila con su cabecera de columnas; a 400 px, una
 * tarjeta con el rótulo en cada campo. Es el MISMO DOM (grilla que se
 * reacomoda): nada se duplica para el celular.
 */

import { useEffect, useRef } from "react";
import { AlertTriangle, Plus, Trash2 } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { FormaMedicion, MedidasTala } from "@/lib/forestal/loth-forma-medicion";
import { camposDeRenglon, type CampoDeRenglon, type RenglonCalculado } from "@/lib/forestal/loth-trozado-multiple";
import { CampoMedida } from "./LothMedicionPartes";
import { enfocarMedida, moverEntreMedidas, SELECTOR_MEDIDA } from "./navegar-medidas";

/** `text-base` en el celular: con menos de 16 px el iPhone hace zoom al enfocar. */
const INPUT =
  "h-11 w-full min-w-0 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-1.5 text-center font-mono text-base tabular-nums sm:text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]";

/** Troza · medidas · volumen · rama · quitar. A 400 px, las medidas bajan a su propia fila. */
const FILA = "grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 sm:grid-cols-[5.5rem_minmax(0,1fr)_5.5rem_3rem_2.75rem]";

/** Las columnas de medidas: a 400 px «Varias medidas» va en 4 + el largo abajo. */
const colsMedidas = (forma: FormaMedicion) => (forma === "promedio" ? "grid-cols-3" : "grid-cols-4 sm:grid-cols-5");

/** Las cabeceras consecutivas iguales se agrupan: «Ø mayor (m)» sobre sus dos medidas. */
function gruposDe(campos: CampoDeRenglon[]): { grupo: string; span: number }[] {
  const out: { grupo: string; span: number }[] = [];
  for (const c of campos) {
    const ult = out[out.length - 1];
    if (ult && ult.grupo === c.grupo) ult.span += 1;
    else out.push({ grupo: c.grupo, span: 1 });
  }
  return out;
}

const SPAN: Record<number, string> = { 1: "col-span-1", 2: "col-span-2" };

export default function LothTrozasRenglones({
  forma,
  renglones,
  onMedidas,
  onRama,
  onQuitar,
  onAgregar,
}: {
  forma: FormaMedicion;
  renglones: RenglonCalculado[];
  onMedidas: (id: number, m: MedidasTala) => void;
  onRama: (id: number, v: boolean) => void;
  onQuitar: (id: number) => void;
  onAgregar: () => void;
}) {
  const campos = camposDeRenglon(forma);
  const cajaRef = useRef<HTMLDivElement>(null);
  const agregarRef = useRef<HTMLButtonElement>(null);
  /** El renglón que recibe el foco cuando cambia la cantidad (agregado o quitado). */
  const enfocarFila = useRef<number | null>(null);

  useEffect(() => {
    const i = enfocarFila.current;
    if (i == null) return;
    enfocarFila.current = null;
    const filas = cajaRef.current?.querySelectorAll<HTMLElement>("[data-renglon]");
    if (!filas || filas.length === 0) return;
    enfocarMedida(filas[Math.min(i, filas.length - 1)].querySelector<HTMLInputElement>(SELECTOR_MEDIDA));
  }, [renglones.length]);

  /** Enter en el último campo: a «Agregar troza» (Enter otra vez agrega y enfoca la nueva). */
  const irAAgregar = () => {
    const boton = agregarRef.current;
    if (!boton) return false;
    boton.focus();
    return true;
  };

  return (
    <div className="space-y-2">
      <div ref={cajaRef} onKeyDown={(e) => moverEntreMedidas(e, irAAgregar)}>
        {/* Cabecera de columnas (≥ sm). Cada campo ya tiene su nombre: esto es para el ojo. */}
        <div aria-hidden="true" className={`hidden border-b border-[var(--rule-base)] pb-1.5 sm:grid ${FILA}`}>
          <span className="text-xs font-bold text-[var(--text-secondary)]">Troza</span>
          <span className={`grid gap-1.5 ${colsMedidas(forma)}`}>
            {gruposDe(campos).map((g) => (
              <span key={g.grupo} className={`${SPAN[g.span] ?? ""} text-center text-xs font-bold text-[var(--text-secondary)]`}>
                {g.grupo}
              </span>
            ))}
          </span>
          <span className="text-right text-xs font-bold text-[var(--text-secondary)]">Volumen</span>
          <span className="text-center text-xs font-bold text-[var(--text-secondary)]">Rama</span>
          <span />
        </div>

        <div className="space-y-2 sm:space-y-0">
          {renglones.map((r, i) => (
            <div
              key={r.id}
              data-renglon={r.codigo}
              role="group"
              aria-label={`Troza ${r.codigo}`}
              className={`${FILA} rounded-xl border border-[var(--rule-base)] p-2.5 sm:rounded-none sm:border-0 sm:border-b sm:border-[var(--rule-soft)] sm:px-0 sm:py-1.5`}
            >
              <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{r.codigo}</span>
              {/* A 400 px, fila propia debajo del código (row-start-2). */}
              <span className={`col-span-4 row-start-2 grid gap-1.5 sm:col-span-1 sm:row-start-auto ${colsMedidas(forma)}`}>
                {campos.map((c) => (
                  <label key={c.clave} className={`block min-w-0 ${c.clave === "largo" && forma === "cruzadas" ? "col-span-2 sm:col-span-1" : ""}`}>
                    <span className="mb-0.5 block truncate text-xs font-semibold text-[var(--text-secondary)] sm:sr-only">{c.corto}</span>
                    <CampoMedida
                      valor={c.leer(r.medidas)}
                      onValor={(v) => onMedidas(r.id, c.escribir(r.medidas, v))}
                      aria-label={`${r.codigo} · ${c.corto}`}
                      placeholder={c.placeholder}
                      className={INPUT}
                    />
                  </label>
                ))}
              </span>
              {/* `span`, no `output`: un `output` es región viva y el lector
                  anunciaría cada volumen en cada tecla. */}
              <span
                className={`text-right font-mono text-sm font-bold tabular-nums ${r.aMedias ? "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-primary)]"}`}
              >
                {r.volumenM3 != null && r.volumenM3 > 0 ? `${fmtM3(r.volumenM3)} m³` : r.aMedias ? (
                  <span className="inline-flex items-center gap-1 font-sans text-xs" title="Faltan medidas: esta troza no se asienta">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> falta
                  </span>
                ) : (
                  "—"
                )}
              </span>
              <label className="flex h-11 items-center justify-center gap-1.5">
                <input
                  type="checkbox"
                  checked={r.isRama}
                  onChange={(e) => onRama(r.id, e.target.checked)}
                  aria-label={`La troza ${r.codigo} viene de una rama`}
                  className="h-5 w-5 cursor-pointer accent-[var(--data-info-600)]"
                />
                <span className="text-xs font-semibold text-[var(--text-secondary)] sm:sr-only">Rama</span>
              </label>
              {renglones.length > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    enfocarFila.current = i;
                    onQuitar(r.id);
                  }}
                  aria-label={`Quitar la troza ${r.codigo}`}
                  className="grid h-11 w-11 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : (
                <span className="h-11 w-11" />
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        ref={agregarRef}
        type="button"
        onClick={() => {
          enfocarFila.current = renglones.length;
          onAgregar();
        }}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-dashed border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
      >
        <Plus className="h-4 w-4" /> Agregar troza
      </button>
    </div>
  );
}
