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
import { ArrowRight, Coins, LayoutGrid, Plus } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { especiesDisponibles, type EspecieDisponible } from "@/lib/forestal/especies-catalogo";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";
import { COLUMNAS_CON_PRECIO, COLUMNAS_SIN_PRECIO, FilaDeEspecie, RotulosDeColumnas } from "./LothPlanFormEspecieFila";
import { conNombre, especiesRepetidas, filaEnBlanco, filaVacia, totalM3, type FilaEspecie } from "./loth-plan-especies-api";
import { button } from "@/components/ui-system/button-variants";

export interface PropsDeEspecies {
  filas: FilaEspecie[];
  onFilas: (filas: FilaEspecie[]) => void;
  /** Después del primer intento de guardar: antes, marcar en rojo lo que todavía se está escribiendo molesta. */
  mostrarErrores?: boolean;
  /** Las especies que el plan YA tiene (al agregar desde la pestaña Registro): repetirlas partiría su saldo. */
  yaRegistradas?: readonly string[];
  /** Filas (por `uid`) que entraron leyendo la constancia: llevan una marca para revisarlas contra el papel. */
  leidas?: ReadonlySet<string>;
  /** «Por bloques o zonas» (sólo el alta del plan): reparte lo escrito en bloques (`LothPlanFormBloques`). */
  onPorBloques?: () => void;
}

/** El editor con su catálogo. Los bloques usan `EditorDeEspecies` con UN catálogo para todos. */
export default function LothPlanFormPlantacion(props: PropsDeEspecies) {
  const { catalogo } = useEspeciesCatalogo();
  const disponibles = useMemo(() => especiesDisponibles(catalogo), [catalogo]);
  return <EditorDeEspecies {...props} disponibles={disponibles} />;
}

export function EditorDeEspecies({
  filas,
  onFilas,
  mostrarErrores = false,
  yaRegistradas = [],
  leidas,
  onPorBloques,
  disponibles,
  enBloque,
}: PropsDeEspecies & {
  disponibles: readonly EspecieDisponible[];
  /** El nombre del bloque o zona en el que está este editor: el total pasa a ser del bloque. */
  enBloque?: string;
}) {
  const lista = useId();
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

      <RotulosDeColumnas columnas={columnas} conPrecio={conPrecio} />

      <ul className="space-y-2">
        {filas.map((f, i) => (
          <FilaDeEspecie
            key={f.uid}
            f={f}
            i={i}
            columnas={columnas}
            lista={lista}
            conPrecio={conPrecio}
            mostrarErrores={mostrarErrores}
            leida={leidas?.has(f.uid) ?? false}
            onCambiar={cambiar}
            onNombre={elegirNombre}
            onQuitar={quitar}
          />
        ))}
      </ul>

      {repetidas.length > 0 && (
        <p role="alert" className="text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {repetidas.join(", ")} {repetidas.length === 1 ? "está" : "están"} dos veces
          {enBloque ? ` en «${enBloque}»: deja una sola fila por especie en cada bloque.` : ": el saldo se lleva por especie, deja una sola fila."}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] pt-2">
        <button
          type="button"
          onClick={agregar}
          aria-label={enBloque ? `Agregar especie a «${enBloque}»` : undefined}
          className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Agregar especie
        </button>
        <button
          type="button"
          onClick={() => setConPrecio((v) => !v)}
          aria-pressed={conPrecio}
          className={`inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors ${
            conPrecio
              ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Coins className="h-4 w-4" aria-hidden="true" /> Precio de venta (opcional)
        </button>
        {onPorBloques && (
          <button
            type="button"
            onClick={onPorBloques}
            className={button({ variant: "ghost", className: "rounded-xl" })}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" /> Por bloques o zonas
          </button>
        )}
        {!enBloque && (
          <InfoTip
            title="Especies registradas"
            what="Las especies y los m³ que dice tu registro de plantación. La tala, el trozado y el despacho descuentan de estos m³."
            affects={
              onPorBloques
                ? "Una tala de una especie que no está acá se frena: agrégala primero. Si el registro viene por bloques o zonas, toca «Por bloques o zonas»: la misma especie puede ir en varios bloques con sus árboles, ha y m³."
                : "Una tala de una especie que no está acá se frena: agrégala primero."
            }
            example="Bolaina · 450 árboles · 120 m³ · instalada en 2018 · 12,5 ha."
          />
        )}
        {/* El total en vivo: es la cifra que se compara contra el papel. En un
            bloque ya está al lado de su nombre (m³ · árboles · ha): no se repite. */}
        {!enBloque && (
          <p className="ml-auto text-sm text-[var(--text-secondary)]" aria-live="polite">
            Total registrado <b className="font-mono tabular-nums text-[var(--text-primary)]">{formatNumber(total, 3)} m³</b>
            {conDatos.length > 0 && (
              <span className="text-[var(--text-tertiary)]">
                {" "}· {conDatos.length} {conDatos.length === 1 ? "especie" : "especies"}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
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
          className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
        >
          Ir a Registro y saldo <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
