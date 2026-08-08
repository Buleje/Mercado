"use client";

/**
 * Departamento · Provincia · Distrito, elegidos de una lista y encadenados.
 *
 * Eran tres inputs de texto libre, y el ubigeo es justo lo que un puesto de
 * control cruza contra el padrón: «UCAYALI» y «Ucayali» y «UCAYALY» son la
 * misma provincia para una persona y tres valores distintos para cualquier
 * filtro, reporte o Excel del libro. Elegir de la lista los normaliza en el
 * origen.
 *
 * El padrón es el INEI que ya trae el repo (`lib/peru-ubigeo`), local y sin
 * llamadas: 2095 entradas resueltas en memoria. No hay API que pueda estar
 * caída mientras alguien llena una guía en el patio.
 *
 * La guía guarda NOMBRES, no códigos —es lo que se imprime en el papel—, así
 * que acá se resuelve nombre→código para poblar la lista y se devuelve el
 * nombre elegido.
 */

import { useMemo } from "react";
import {
  findDepartamentoByName,
  findProvinciaByName,
  listDepartamentos,
  listDistritos,
  listProvincias,
} from "@/lib/peru-ubigeo";
import { Field, I } from "./ctp-shared";

/** Lo que el bloque necesita leer y escribir. */
export interface UbigeoValor {
  departamento?: string;
  provincia?: string;
  distrito?: string;
}

/**
 * Un valor guardado que no está en el padrón NO se descarta: se ofrece como
 * opción propia y queda seleccionado.
 *
 * Guías viejas, importaciones y tipeos traen «CALLERIA» sin tilde o nombres que
 * el INEI escribe distinto. Si el `<select>` no tuviera esa opción, el campo se
 * mostraría vacío y el primer guardado borraría un dato que estaba declarado —
 * y en una guía ya emitida eso es cambiar el documento en silencio.
 */
function conValorSuelto(opciones: string[], valor: string | undefined): string[] {
  const v = valor?.trim();
  if (!v) return opciones;
  return opciones.some((o) => o.toLocaleUpperCase("es") === v.toLocaleUpperCase("es"))
    ? opciones
    : [v, ...opciones];
}

/**
 * Qué opción mostrar como elegida.
 *
 * El `<select>` de HTML matchea el `value` EXACTO: con «CALLAO» guardado y
 * «Callao» en el padrón, el campo se dibujaba vacío aunque el dato estuviera —
 * y el primer guardado lo borraba. Se compara sin distinguir mayúsculas y se
 * muestra la opción del padrón; el valor guardado no se toca hasta que alguien
 * elija otro.
 */
function opcionElegida(opciones: string[], valor: string | undefined): string {
  const v = valor?.trim();
  if (!v) return "";
  return opciones.find((o) => o.toLocaleUpperCase("es") === v.toLocaleUpperCase("es")) ?? v;
}

export default function CtpUbigeoSelects({
  valor,
  onChange,
  span = 2,
}: {
  valor: UbigeoValor;
  onChange: (v: UbigeoValor) => void;
  span?: 2 | 3 | 4 | 6;
}) {
  const depCode = useMemo(
    () => (valor.departamento ? findDepartamentoByName(valor.departamento)?.code ?? null : null),
    [valor.departamento],
  );
  const provCode = useMemo(
    () => (depCode && valor.provincia ? findProvinciaByName(depCode, valor.provincia)?.code ?? null : null),
    [depCode, valor.provincia],
  );

  const departamentos = useMemo(() => listDepartamentos().map((d) => d.nombre), []);
  const provincias = useMemo(() => (depCode ? listProvincias(depCode).map((p) => p.nombre) : []), [depCode]);
  const distritos = useMemo(
    () => (depCode && provCode ? listDistritos(depCode, provCode).map((d) => d.nombre) : []),
    [depCode, provCode],
  );

  const opDep = conValorSuelto(departamentos, valor.departamento);
  const opProv = conValorSuelto(provincias, valor.provincia);
  const opDist = conValorSuelto(distritos, valor.distrito);

  return (
    <>
      <Field span={span} label="Departamento">
        <select
          className={I}
          value={opcionElegida(opDep, valor.departamento)}
          /* Cambiar de departamento INVALIDA provincia y distrito: dejarlos
             sería declarar un distrito que no existe en el departamento nuevo. */
          onChange={(e) => onChange({ departamento: e.target.value, provincia: "", distrito: "" })}
        >
          <option value="">Elegí el departamento</option>
          {opDep.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </Field>
      <Field
        span={span}
        label="Provincia"
        hint={valor.departamento ? undefined : "Elegí primero el departamento"}
      >
        <select
          className={I}
          value={opcionElegida(opProv, valor.provincia)}
          disabled={!valor.departamento}
          onChange={(e) => onChange({ provincia: e.target.value, distrito: "" })}
        >
          <option value="">{valor.departamento ? "Elegí la provincia" : "—"}</option>
          {opProv.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </Field>
      <Field
        span={span}
        label="Distrito"
        hint={valor.provincia ? undefined : "Elegí primero la provincia"}
      >
        <select
          className={I}
          value={opcionElegida(opDist, valor.distrito)}
          disabled={!valor.provincia}
          onChange={(e) => onChange({ distrito: e.target.value })}
        >
          <option value="">{valor.provincia ? "Elegí el distrito" : "—"}</option>
          {opDist.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </Field>
    </>
  );
}
