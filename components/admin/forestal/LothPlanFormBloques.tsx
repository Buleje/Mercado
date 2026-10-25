"use client";

/**
 * Las especies del registro repartidas por bloque o zona (Brandon 24-10: «en un
 * bloque puede haber 30 árboles, tiene su sup ha, su volumen y especie, y en el
 * bloque dos esa misma especie con diferente cantidad de árboles»).
 *
 * Cada bloque es una tarjeta con su nombre, su subtotal y el mismo editor de
 * filas de siempre (`EditorDeEspecies`). Abajo, lo que se registra: una especie
 * por fila, sumada de todos los bloques — es la base del saldo (ADR-459) y no
 * cambia de forma. El reparto se guarda aparte (`plan/bloques`) al crear el plan.
 * Reglas: `loth-plan-bloques-filas.ts` y `lib/forestal/loth-plan-bloques.ts`.
 */

import { useMemo, useState } from "react";
import { BlockTitle } from "@buleje/design-system";
import { List, Plus, Trash2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { especiesDisponibles } from "@/lib/forestal/especies-catalogo";
import { juntarPorEspecie, type SubtotalDelBloque } from "@/lib/forestal/loth-plan-bloques";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";
import { EditorDeEspecies } from "./LothPlanFormPlantacion";
import {
  agregarBloque,
  bloquesConNombreRepetido,
  bloquesParaGuardar,
  conFilasDelBloque,
  filasDelBloque,
  juntarEnUnaLista,
  nombreDelBloque,
  quitarBloque,
  subtotalDeLasFilas,
  type BloqueEnEdicion,
} from "./loth-plan-bloques-filas";
import type { FilaEspecie } from "./loth-plan-especies-api";
import { cls } from "./loth-plan-ui";
import { button } from "@/components/ui-system/button-variants";

const BOTON_FANTASMA = button({ variant: "ghost", className: "rounded-xl" });
const BOTON_SECUNDARIO = button({ variant: "secondary", className: "rounded-xl" });
const BOTON_QUITAR = button({
  variant: "ghost",
  className: "rounded-xl text-[var(--data-error-700)] hover:bg-[var(--data-error-50)] dark:text-[var(--data-error-500)] dark:hover:bg-[var(--data-error-500)]/12",
});

/** «12,500 m³ · 30 árboles · 2,50 ha»: lo que no se escribió no se muestra (no es cero). */
function Cifras({ s }: { s: SubtotalDelBloque }) {
  return (
    <span className="font-mono tabular-nums">
      <b className="text-[var(--text-primary)]">{formatNumber(s.m3, 3)} m³</b>
      {s.arboles != null && ` · ${formatNumber(s.arboles, 0)} ${s.arboles === 1 ? "árbol" : "árboles"}`}
      {s.ha != null && ` · ${formatNumber(s.ha, 2)} ha`}
    </span>
  );
}

/** Lo que el editor usa: el alta le pasa su formulario entero; el editor de «Registro y saldo», su estado. */
export interface EstadoDeBloques {
  especies: FilaEspecie[];
  setEspecies: (filas: FilaEspecie[]) => void;
  bloques: BloqueEnEdicion[] | null;
  setBloques: (bloques: BloqueEnEdicion[] | null) => void;
  intentoGuardar: boolean;
  filasLeidas: ReadonlySet<string>;
  problemaBloques: string | null;
}

export default function LothPlanFormBloques({
  form,
  sinBloques,
}: {
  form: EstadoDeBloques;
  /** El botón de abajo a la izquierda: en el alta junta todo en una lista; en el registro, quita el reparto. */
  sinBloques?: { etiqueta: string; onClick: () => void };
}) {
  const { especies, setEspecies, bloques, setBloques, intentoGuardar, filasLeidas, problemaBloques } = form;
  /* Un catálogo para todos los bloques: cada editor suelto pediría el suyo. */
  const { catalogo } = useEspeciesCatalogo();
  const disponibles = useMemo(() => especiesDisponibles(catalogo), [catalogo]);
  /** El bloque con datos que se está por quitar: se pregunta en la misma tarjeta. */
  const [porQuitar, setPorQuitar] = useState<string | null>(null);
  if (!bloques) return null;

  const repetidos = bloquesConNombreRepetido(bloques);
  const juntas = juntarPorEspecie(bloquesParaGuardar(especies, bloques));
  const total = subtotalDeLasFilas(especies);

  const nombrar = (uid: string, nombre: string) => setBloques(bloques.map((b) => (b.uid === uid ? { ...b, nombre } : b)));

  function agregar() {
    if (!bloques) return;
    const r = agregarBloque(especies, bloques);
    setBloques(r.bloques);
    setEspecies(r.filas);
    /* El foco va al nombre del bloque nuevo: es lo primero que se escribe. */
    requestAnimationFrame(() => document.getElementById(`${r.nuevo.uid}-nombre`)?.focus());
  }

  function quitar(uid: string) {
    if (!bloques) return;
    const r = quitarBloque(especies, bloques, uid);
    setBloques(r.bloques);
    setEspecies(r.filas);
    setPorQuitar(null);
  }

  function juntar() {
    setEspecies(juntarEnUnaLista(especies));
    setBloques(null);
  }

  return (
    <div className="space-y-3" data-especies-por-bloque>
      <ol className="space-y-3">
        {bloques.map((b, i) => {
          const filas = filasDelBloque(especies, bloques, b.uid);
          const sub = subtotalDeLasFilas(filas);
          const nombre = nombreDelBloque(b, i);
          return (
            <li key={b.uid} data-bloque={nombre} className="space-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  {i + 1}
                </span>
                <label className="min-w-0 grow basis-40 sm:max-w-xs">
                  <span className="sr-only">Nombre del bloque {i + 1}</span>
                  <input
                    id={`${b.uid}-nombre`}
                    value={b.nombre}
                    onChange={(e) => nombrar(b.uid, e.target.value)}
                    placeholder={`Bloque ${i + 1}`}
                    maxLength={80}
                    aria-invalid={repetidos.has(b.uid) || undefined}
                    className={`${cls} font-semibold`}
                  />
                </label>
                <span className="text-sm text-[var(--text-secondary)]" aria-live="polite">
                  {sub.especies === 0 ? "Sin especies todavía" : <Cifras s={sub} />}
                </span>
                {porQuitar === b.uid ? (
                  <span role="group" aria-label={`Quitar «${nombre}»`} className="ml-auto inline-flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      ¿Quitarlo con sus {sub.especies} {sub.especies === 1 ? "especie" : "especies"}?
                    </span>
                    <button
                      type="button"
                      onClick={() => quitar(b.uid)}
                      className={BOTON_QUITAR}
                    >
                      Sí, quitar
                    </button>
                    <button type="button" onClick={() => setPorQuitar(null)} className={BOTON_FANTASMA}>
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => (sub.especies > 0 ? setPorQuitar(b.uid) : quitar(b.uid))}
                    aria-label={`Quitar «${nombre}»`}
                    title={`Quitar «${nombre}»`}
                    className={`ml-auto ${BOTON_QUITAR}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span className="max-sm:sr-only">Quitar bloque</span>
                  </button>
                )}
              </div>
              <EditorDeEspecies
                filas={filas}
                onFilas={(nuevas) => setEspecies(conFilasDelBloque(especies, bloques, b.uid, nuevas))}
                mostrarErrores={intentoGuardar}
                leidas={filasLeidas}
                disponibles={disponibles}
                enBloque={nombre}
              />
            </li>
          );
        })}
      </ol>

      {repetidos.size > 0 && problemaBloques && (
        <p role="alert" className="text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {problemaBloques}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={agregar}
          className={BOTON_SECUNDARIO}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Agregar bloque
        </button>
        <button type="button" onClick={sinBloques?.onClick ?? juntar} className={BOTON_FANTASMA}>
          <List className="h-4 w-4" aria-hidden="true" /> {sinBloques?.etiqueta ?? "Sin bloques: una sola lista"}
        </button>
        <InfoTip
          title="Por bloques o zonas"
          what="Cada bloque tiene sus especies con sus árboles, hectáreas y m³. La misma especie puede estar en varios bloques."
          affects="El saldo se lleva por especie: se registra la suma de todos los bloques. El reparto queda guardado con el plan y se ve en «Registro y saldo»."
          example="Bolaina en el Bloque 1 con 30 árboles y 12 m³, y en el Bloque 2 con 18 árboles y 7,5 m³: se registra Bolaina con 48 árboles y 19,5 m³."
        />
      </div>

      {juntas.length > 0 && (
        <section aria-label="Lo que se registra por especie" className="space-y-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
          <BlockTitle className="text-sm font-bold text-[var(--text-primary)]">Lo que se registra (suma de los bloques)</BlockTitle>
          <ul className="divide-y divide-[var(--rule-soft)] text-sm">
            {juntas.map((e) => (
              <li key={e.speciesCommon.toLowerCase()} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
                <span className="font-semibold text-[var(--text-primary)]">
                  {e.speciesCommon}
                  <span className="font-normal text-[var(--text-tertiary)]">
                    {" "}· en {e.bloques} {e.bloques === 1 ? "bloque" : "bloques"}
                  </span>
                </span>
                <span className="text-[var(--text-secondary)]">
                  <Cifras s={{ especies: 1, m3: e.volumenAutorizadoM3, arboles: e.arbolesAutorizados, ha: e.superficieHa }} />
                </span>
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-[var(--rule-base)] pt-1.5 text-sm font-semibold text-[var(--text-primary)]">
            <span>
              Total · {juntas.length} {juntas.length === 1 ? "especie" : "especies"}
            </span>
            <Cifras s={total} />
          </p>
        </section>
      )}
    </div>
  );
}
