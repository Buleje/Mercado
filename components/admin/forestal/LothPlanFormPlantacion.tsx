"use client";

/**
 * «Especies registradas»: lo que dice el registro de la plantación, especie por
 * especie, tipeado una sola vez (ADR-459).
 *
 * Brandon (2-10-2026): «se tiene que hacer poniendo los datos generales del
 * registro de plantación: la especie, nombre científico, cantidad de m³ y otros
 * datos, y con esos m³ y especie se trabaja […] no es necesario poner el
 * censo». Antes, para que una plantación tuviera saldo había que crear el plan,
 * ir a la pestaña Especies y agregarlas de a una en un modal — y en Blas los dos
 * registros de plantación quedaron con 0 especies: sin base, la tala no
 * descontaba de nada.
 *
 * Es un editor de filas CONTROLADO: lo usan el alta del plan (todo viaja en un
 * solo POST) y «Agregar especies» de la pestaña Registro. El nombre se elige del
 * catálogo del negocio (ADR-410) y el científico se completa solo —editable—.
 */

import { useId, useMemo, useState } from "react";
import { ArrowRight, Coins, Plus, ScanText, Trash2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { especiesDisponibles } from "@/lib/forestal/especies-catalogo";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";
import { CitesToggle, cls } from "./loth-plan-ui";
import {
  conCites,
  conNombre,
  especiesRepetidas,
  filaEnBlanco,
  filaVacia,
  problemaDeFila,
  totalM3,
  type FilaEspecie,
} from "./loth-plan-especies-api";

/* Las dos plantillas van escritas enteras: Tailwind sólo genera las clases que
   encuentra literales en el código. */
const COLUMNAS_SIN_PRECIO = "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_5.5rem_7.5rem_5.5rem_6rem_2.75rem]";
const COLUMNAS_CON_PRECIO = "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_5rem_7rem_5rem_5.5rem_6rem_2.75rem]";

const ROTULO = "mb-1 block text-xs font-medium text-[var(--text-secondary)] sm:sr-only";

export default function LothPlanFormPlantacion({
  filas,
  onFilas,
  mostrarErrores = false,
  yaRegistradas = [],
  leidas,
}: {
  filas: FilaEspecie[];
  onFilas: (filas: FilaEspecie[]) => void;
  /** Después del primer intento de guardar: antes, marcar en rojo lo que todavía se está escribiendo molesta. */
  mostrarErrores?: boolean;
  /** Las especies que el plan YA tiene (al agregar desde la pestaña Registro): repetirlas partiría su saldo. */
  yaRegistradas?: readonly string[];
  /** Filas (por `uid`) que entraron leyendo la constancia: llevan una marca para revisarlas contra el papel. */
  leidas?: ReadonlySet<string>;
}) {
  const lista = useId();
  const { catalogo } = useEspeciesCatalogo();
  const disponibles = useMemo(() => especiesDisponibles(catalogo), [catalogo]);
  const cientificoDe = useMemo(() => new Map(disponibles.map((e) => [e.clave, e.cientifico ?? null])), [disponibles]);
  const [conPrecio, setConPrecio] = useState(() => filas.some((f) => f.precioM3.trim()));

  const total = totalM3(filas);
  const conDatos = filas.filter((f) => !filaEnBlanco(f));
  const repetidas = especiesRepetidas(filas, yaRegistradas);

  const cambiar = (uid: string, cambio: (f: FilaEspecie) => FilaEspecie) =>
    onFilas(filas.map((f) => (f.uid === uid ? cambio(f) : f)));

  function elegirNombre(f: FilaEspecie, nombre: string) {
    const clave = disponibles.find((e) => e.nombre.toLowerCase() === nombre.trim().toLowerCase())?.clave;
    cambiar(f.uid, (x) => conNombre(x, nombre, clave ? cientificoDe.get(clave) : null));
  }

  function agregar() {
    const nueva = filaVacia();
    onFilas([...filas, nueva]);
    /* El foco va a la fila nueva: es lo que se va a escribir. */
    requestAnimationFrame(() => document.getElementById(`${nueva.uid}-especie`)?.focus());
  }

  /* La última fila no se borra: se limpia. Un bloque sin filas no deja dónde escribir. */
  const quitar = (uid: string) => onFilas(filas.length > 1 ? filas.filter((f) => f.uid !== uid) : [filaVacia()]);

  const columnas = conPrecio ? COLUMNAS_CON_PRECIO : COLUMNAS_SIN_PRECIO;

  return (
    <div className="space-y-2" data-especies-registradas>
      <datalist id={lista}>
        {disponibles.map((e) => (
          <option key={e.clave} value={e.nombre} />
        ))}
      </datalist>

      {/* Los rótulos de columna, una vez. En el celular cada campo lleva el suyo. */}
      <div
        aria-hidden="true"
        className={`hidden gap-2 px-1 text-xs font-semibold text-[var(--text-secondary)] sm:grid ${columnas}`}
      >
        <span>Especie *</span>
        <span>Nombre científico</span>
        <span className="text-right">N° árboles</span>
        <span className="text-right">Volumen (m³) *</span>
        <span className="text-right">Año inst.</span>
        <span className="text-right">Sup. (ha)</span>
        {conPrecio && <span className="text-right">S/ por m³</span>}
        <span />
      </div>

      <ul className="space-y-2">
        {filas.map((f, i) => {
          const problema = mostrarErrores && !filaEnBlanco(f) ? problemaDeFila(f) : null;
          const errorId = `${f.uid}-error`;
          const nombreFila = f.speciesCommon.trim() || `fila ${i + 1}`;
          return (
            <li
              key={f.uid}
              className={`rounded-xl border p-2 sm:border-0 sm:p-0 ${problema ? "border-[var(--data-error-500)]/60" : "border-[var(--rule-base)]"}`}
            >
              <div className={`grid grid-cols-2 items-start gap-2 ${columnas}`}>
                <label className="col-span-2 block sm:col-span-1">
                  <span className={ROTULO}>Especie *</span>
                  <span className="relative block">
                    <input
                      id={`${f.uid}-especie`}
                      list={lista}
                      value={f.speciesCommon}
                      onChange={(e) => elegirNombre(f, e.target.value)}
                      placeholder="Ej. Bolaina"
                      autoComplete="off"
                      aria-invalid={problema === "Falta la especie" || undefined}
                      aria-describedby={problema ? errorId : undefined}
                      className={`${cls} ${leidas?.has(f.uid) ? "pr-8" : ""}`}
                    />
                    {/* Leída de la constancia: la cifra la puso la IA, se revisa contra el papel. */}
                    {leidas?.has(f.uid) && (
                      <span
                        title="Leída de la constancia: revisa los m³ contra el papel"
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
                      >
                        <ScanText className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Leída de la constancia</span>
                      </span>
                    )}
                  </span>
                </label>
                <label className="col-span-2 block sm:col-span-1">
                  <span className={ROTULO}>Nombre científico</span>
                  <span className="relative block">
                    <input
                      value={f.speciesScientific}
                      onChange={(e) => cambiar(f.uid, (x) => ({ ...x, speciesScientific: e.target.value, cientificoAuto: false }))}
                      placeholder="Se completa solo"
                      className={`${cls} italic pr-20`}
                    />
                    <CitesToggle
                      activo={f.cites}
                      onCambiar={(v) => cambiar(f.uid, (x) => conCites(x, v))}
                      especie={f.speciesCommon}
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                    />
                  </span>
                </label>
                <Numero rotulo="N° de árboles" valor={f.arboles} paso="1" ejemplo="0" onCambio={(v) => cambiar(f.uid, (x) => ({ ...x, arboles: v }))} />
                <Numero
                  rotulo="Volumen (m³) *"
                  valor={f.volumenM3}
                  paso="0.001"
                  ejemplo="0.000"
                  invalido={problema != null && /volumen/i.test(problema)}
                  describe={problema ? errorId : undefined}
                  onCambio={(v) => cambiar(f.uid, (x) => ({ ...x, volumenM3: v }))}
                />
                <Numero rotulo="Año de instalación" valor={f.anioInstalacion} paso="1" ejemplo="aaaa" onCambio={(v) => cambiar(f.uid, (x) => ({ ...x, anioInstalacion: v }))} />
                <Numero rotulo="Superficie (ha)" valor={f.superficieHa} paso="0.01" ejemplo="0.00" onCambio={(v) => cambiar(f.uid, (x) => ({ ...x, superficieHa: v }))} />
                {conPrecio && (
                  <Numero rotulo="Precio S/ por m³" valor={f.precioM3} paso="0.01" ejemplo="0.00" onCambio={(v) => cambiar(f.uid, (x) => ({ ...x, precioM3: v }))} />
                )}
                <button
                  type="button"
                  onClick={() => quitar(f.uid)}
                  aria-label={`Quitar ${nombreFila}`}
                  title={`Quitar ${nombreFila}`}
                  className="col-span-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-[var(--data-error-700)] transition-colors hover:bg-[var(--data-error-50)] dark:text-[var(--data-error-500)] dark:hover:bg-[var(--data-error-500)]/12 sm:col-span-1"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span className="sm:sr-only">Quitar</span>
                </button>
              </div>
              {problema && (
                <p id={errorId} className="mt-1 px-1 text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  {problema}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {repetidas.length > 0 && (
        <p role="alert" className="text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {repetidas.join(", ")} {repetidas.length === 1 ? "está" : "están"} dos veces: el saldo se lleva por especie, deja una sola fila.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] pt-2">
        <button
          type="button"
          onClick={agregar}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Agregar especie
        </button>
        <button
          type="button"
          onClick={() => setConPrecio((v) => !v)}
          aria-pressed={conPrecio}
          className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors ${
            conPrecio
              ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Coins className="h-4 w-4" aria-hidden="true" /> Precio de venta (opcional)
        </button>
        <InfoTip
          title="Especies registradas"
          what="Las especies y los m³ que dice tu registro de plantación. La tala, el trozado y el despacho descuentan de estos m³."
          affects="Una tala de una especie que no está acá se frena: agrégala primero."
          example="Bolaina · 450 árboles · 120 m³ · instalada en 2018 · 12,5 ha."
        />
        {/* El total en vivo: es la cifra que se compara contra el papel. */}
        <p className="ml-auto text-sm text-[var(--text-secondary)]" aria-live="polite">
          Total registrado{" "}
          <b className="font-mono tabular-nums text-[var(--text-primary)]">{formatNumber(total, 3)} m³</b>
          {conDatos.length > 0 && (
            <span className="text-[var(--text-tertiary)]">
              {" "}· {conDatos.length} {conDatos.length === 1 ? "especie" : "especies"}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, paso, ejemplo, onCambio, invalido, describe }: {
  rotulo: string;
  valor: string;
  paso: string;
  ejemplo: string;
  onCambio: (v: string) => void;
  invalido?: boolean;
  describe?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className={ROTULO}>{rotulo}</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step={paso}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={ejemplo}
        aria-invalid={invalido || undefined}
        aria-describedby={describe}
        className={`${cls} text-right font-mono tabular-nums`}
      />
    </label>
  );
}

/**
 * Al EDITAR una plantación el bloque no edita: las especies se corrigen en la
 * pestaña «Registro y saldo», al lado de lo que ya se taló de cada una — ahí se
 * ve qué se lleva puesto bajar un volumen.
 */
export function EspeciesSeCorrigenEnRegistro({ onIr }: { onIr?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5">
      <p className="min-w-0 grow basis-[16rem] text-sm text-[var(--text-secondary)]">
        Las especies se corrigen en la pestaña <b className="text-[var(--text-primary)]">Registro y saldo</b>, al lado de lo que ya se taló de cada una.
      </p>
      {onIr && (
        <button
          type="button"
          onClick={onIr}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
        >
          Ir a Registro y saldo <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
