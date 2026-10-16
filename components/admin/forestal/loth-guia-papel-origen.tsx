"use client";

/**
 * (5)–(11c) «DATOS DEL ORIGEN DEL RECURSO O PROCEDENCIA» de la guía del Libro
 * TH, con la cara del talonario (16-10-2026): el (5) son las diez casillas del
 * papel —se marca una, como con la «X»— y debajo, en las filas del papel,
 * (6) N°, (7) titular + (8) rep. legal, (9) resolución + (10) plan y el ubigeo.
 * Los datos y las reglas son los de antes (`origenRecurso`, `titulos[0]`…):
 * cambia sólo la presentación.
 */

import { useId } from "react";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { ORIGENES, ORIGENES_SIN_CASILLA_2024, casilleroGtf2024 } from "@/lib/forestal/ctp-gtf-formato";
import { guiaEsDePlantacion, huecosDelTitulo, rotuloDelTitulo } from "@/lib/forestal/loth-guia-despacho";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import CtpUbigeoSelects from "./CtpUbigeoSelects";
import { Bloque } from "./ctp-guia-bloques";
import { falta } from "./ctp-guia-partes-comun";
import { Btn, Field, I } from "./ctp-shared";
import { CasillaGtf, RotuloGtf } from "./gtf-papel";
import { DatoDelPapel, rotuloGtf2024 } from "./loth-guia-papel-piezas";

/** Rótulo del papel 2024 del campo de clave interna `clave`. */
const R = (clave: string) => rotuloGtf2024(casilleroGtf2024(clave) ?? "");

/** (5) Las casillas del papel: una sola marcada. Radios nativos debajo, para el teclado. */
function CasillasDelOrigen({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const nombre = useId();
  const viejo = ORIGENES_SIN_CASILLA_2024.find((o) => o.clave === valor);
  return (
    <fieldset className="min-w-0 sm:col-span-12">
      <legend className="mb-1 flex w-full flex-wrap items-center gap-2">
        <RotuloGtf n={casilleroGtf2024("5")} dosPuntos>
          {R("5")}
        </RotuloGtf>
        {!valor && <span className="text-sm font-semibold text-[var(--data-warning-ink)]">Sin marcar: elige una casilla</span>}
        {valor && (
          <Btn size="sm" variant="ghost" className="ml-auto h-8 px-2 text-xs" onClick={() => onChange("")}>
            Quitar la marca
          </Btn>
        )}
      </legend>
      <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
        {ORIGENES.map((o) => {
          const marcada = valor === o.clave;
          return (
            <label
              key={o.clave}
              className="flex min-h-10 cursor-pointer items-center rounded-md px-1.5 hover:bg-[var(--gtf-franja)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--gtf-tinta)]"
            >
              <input type="radio" name={nombre} value={o.clave} checked={marcada} onChange={() => onChange(o.clave)} className="sr-only" />
              <CasillaGtf marcada={marcada}>{o.label}</CasillaGtf>
            </label>
          );
        })}
      </div>
      {/* Una guía vieja con una casilla que el formato 2024 ya no tiene: se
          dice lo guardado, pero el papel no cruza ninguna (ADR-494). */}
      {viejo && (
        <p className="mt-1 text-sm text-[var(--data-warning-ink)]">
          Guardada como «{viejo.label}» (formato 2015): el papel 2024 no tiene esa casilla. Elige una.
        </p>
      )}
    </fieldset>
  );
}

/** (5)–(11c): el título habilitante, tal como sale del plan y la carátula. */
export function BloqueOrigenPapel({ g, faltaTitulo }: { g: DespachoGuiaLoth; faltaTitulo: string[] }) {
  const { datos, setDatos } = g;
  const guia = datos.guia;
  const setGuia = (v: Partial<GtfDatos["guia"]>) => setDatos((p) => ({ ...p, guia: { ...p.guia, ...v } }));
  const huecos = huecosDelTitulo(datos);
  /* Una plantación se ampara con su REGISTRO y su constancia (ADR-459): los
     casilleros (6) y (9) no cambian de nombre en el papel; el ⓘ aclara qué va. */
  const plantacion = g.identidad?.esPlantacion || guiaEsDePlantacion(datos);
  const f = g.identidad?.fuentes;
  const procedencia = [
    g.plan ? `el plan ${[g.plan.planNumber || g.plan.planType, g.plan.parcelaCorta].filter(Boolean).join(" · ")}` : "",
    f?.caratula ? "la carátula del libro" : "",
    f?.permiso ? "el permiso cargado" : "",
  ].filter(Boolean);
  return (
    <Bloque
      titulo={rotuloDelTitulo(plantacion)}
      tituloPapel="Datos del origen del recurso o procedencia"
      hint={`Casilleros (5) a (11c). Salen de ${procedencia.length ? procedencia.join(", ") : "lo que cargues acá"}: no se tipean en cada guía.`}
      nota="Lo que el libro no sabe queda en blanco en el papel, para llenarlo a mano sobre el talonario. Se corrige en el plan de manejo y sale bien en la próxima."
      faltan={[...faltaTitulo, ...huecos]}
    >
      <CasillasDelOrigen valor={guia.origenRecurso} onChange={(v) => setGuia({ origenRecurso: v })} />
      <Field
        span={12}
        label={R("6")}
        casillero={casilleroGtf2024("6")}
        required
        hint={plantacion ? "En una plantación va el código de su registro (RNPF)." : "El N° del título habilitante."}
      >
        <input
          type="text"
          className={`${I} font-mono ${falta(datos.titulos[0])}`}
          value={datos.titulos[0] ?? ""}
          onChange={(e) => setDatos((p) => ({ ...p, titulos: e.target.value ? [e.target.value] : [] }))}
        />
      </Field>
      <DatoDelPapel span={8} label={R("7")} casillero={casilleroGtf2024("7")} valor={g.identidad?.titular} falta="en el plan de manejo" />
      <Field span={4} label={R("rep")} casillero={casilleroGtf2024("rep")} hint="Cuando el titular es una empresa o una comunidad.">
        <input type="text" className={I} value={guia.representanteLegal} onChange={(e) => setGuia({ representanteLegal: e.target.value })} />
      </Field>
      <Field
        span={6}
        label={R("8")}
        casillero={casilleroGtf2024("8")}
        hint={plantacion ? "En una plantación va la constancia de inscripción." : undefined}
      >
        <input type="text" className={`${I} ${falta(guia.resolucion)}`} value={guia.resolucion} onChange={(e) => setGuia({ resolucion: e.target.value })} />
      </Field>
      <Field span={6} label={R("9")} casillero={casilleroGtf2024("9")}>
        <input type="text" className={`${I} ${falta(guia.planManejoTipo)}`} value={guia.planManejoTipo} onChange={(e) => setGuia({ planManejoTipo: e.target.value })} />
      </Field>
      <CtpUbigeoSelects
        span={4}
        casilleros={[casilleroGtf2024("10"), casilleroGtf2024("11"), casilleroGtf2024("12")]}
        valor={{ departamento: guia.departamento, provincia: guia.provincia, distrito: guia.distrito }}
        onChange={(v) => setGuia(v)}
      />
    </Bloque>
  );
}
