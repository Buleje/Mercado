"use client";

/**
 * Ubicación: la dirección y el ubigeo en listas (departamento → provincia →
 * distrito) del catálogo INEI, en vez de tres casilleros de texto libre donde
 * «Callería», «CALLERIA» y «Calleria» eran tres distritos distintos.
 *
 * Un nombre guardado antes que no está en el catálogo se muestra igual como
 * opción: abrir la ficha no puede borrar lo que ya estaba.
 */
import {
  findDepartamentoByName,
  findDistritoByName,
  findProvinciaByName,
  listDepartamentos,
  distritosDeProvinciaNombre,
  provinciasDeDepartamentoNombre,
} from "@/lib/peru-ubigeo";
import Plegable from "@/components/admin/shared/Plegable";
import { Field } from "../../shared";
import { CAMPO } from "./clases";
import type { DatosPersona } from "./datos";

type Ubigeo = { departamento: string; provincia: string; distrito: string };

/**
 * Los nombres del padrón («UCAYALI», «CALLERIA») al nombre del catálogo
 * («Ucayali», «Callería»). Lo que no encuentra queda como vino.
 */
export function ubigeoCanonico(u: Partial<Ubigeo>): Partial<Ubigeo> {
  const dep = u.departamento ? findDepartamentoByName(u.departamento) : null;
  const prov = dep && u.provincia ? findProvinciaByName(dep.code, u.provincia) : null;
  const dist = dep && prov && u.distrito ? findDistritoByName(dep.code, prov.code, u.distrito) : null;
  return {
    departamento: dep?.nombre ?? u.departamento,
    provincia: prov?.nombre ?? u.provincia,
    distrito: dist?.nombre ?? u.distrito,
  };
}

/** Si lo guardado no está en la lista, va primero: el select no puede perderlo. */
function conGuardado(nombres: readonly string[], valor: string): string[] {
  const v = valor.trim();
  if (!v) return [...nombres];
  const ya = nombres.some((n) => n.localeCompare(v, "es", { sensitivity: "base" }) === 0);
  return ya ? [...nombres] : [v, ...nombres];
}

function SelectUbigeo({
  label,
  valor,
  opciones,
  onCambio,
  vacio,
}: {
  label: string;
  valor: string;
  opciones: readonly string[];
  onCambio: (v: string) => void;
  vacio: string;
}) {
  const lista = conGuardado(opciones, valor);
  const deshabilitado = lista.length === 0;
  return (
    <Field label={label}>
      <select
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        disabled={deshabilitado}
        className={CAMPO}
      >
        <option value="">{deshabilitado ? vacio : "—"}</option>
        {lista.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </Field>
  );
}

const DEPARTAMENTOS = listDepartamentos().map((d) => d.nombre);

export default function SeccionUbicacion({
  d,
  set,
}: {
  d: DatosPersona;
  set: <K extends keyof DatosPersona>(k: K, v: DatosPersona[K]) => void;
}) {
  const provincias = provinciasDeDepartamentoNombre(d.departamento).map((p) => p.nombre);
  const distritos = distritosDeProvinciaNombre(d.departamento, d.provincia).map((x) => x.nombre);
  const lugar = [d.distrito, d.provincia, d.departamento].filter(Boolean).join(", ");
  const resumen = [d.direccion.trim(), lugar].filter(Boolean).join(" · ") || "Sin dirección todavía";

  return (
    <Plegable clave="adelantos:alta-persona:ubicacion" titulo="Ubicación" resumen={resumen}>
      <div className="space-y-4">
        <Field label="Dirección">
          <input
            value={d.direccion}
            onChange={(e) => set("direccion", e.target.value)}
            placeholder="La trae SUNAT si escribes el RUC"
            autoComplete="street-address"
            className={CAMPO}
          />
        </Field>
        {/* Cada uno a su campo: SUNAT los manda separados, y pegados dentro de
            la dirección no se puede filtrar ni imprimir donde va. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectUbigeo
            label="Departamento"
            valor={d.departamento}
            opciones={DEPARTAMENTOS}
            vacio="—"
            onCambio={(v) => {
              set("departamento", v);
              set("provincia", "");
              set("distrito", "");
            }}
          />
          <SelectUbigeo
            label="Provincia"
            valor={d.provincia}
            opciones={provincias}
            vacio="Primero el departamento"
            onCambio={(v) => {
              set("provincia", v);
              set("distrito", "");
            }}
          />
          <SelectUbigeo
            label="Distrito"
            valor={d.distrito}
            opciones={distritos}
            vacio="Primero la provincia"
            onCambio={(v) => set("distrito", v)}
          />
        </div>
      </div>
    </Plegable>
  );
}
