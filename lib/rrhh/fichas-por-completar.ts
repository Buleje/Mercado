/**
 * Qué le falta a la ficha de cada persona (RRHH › Personal).
 *
 * Una persona se carga con el nombre y nada más; lo demás «se completa
 * cuando quieras». Medido en Blas (30-10): de 11 activos, 10 sin DNI, 10 sin
 * celular, 9 sin fecha de ingreso, 10 sin contacto de emergencia, 11 sin foto.
 * Esta lista dice QUÉ falta y a QUIÉN, para completarlo de a una persona.
 *
 * No bloquea nada. Sólo mira lo que el DTO trae: con el nivel «marcar» (sin
 * documento ni celular) sólo se revisan puesto y fecha de ingreso.
 */

import type { ColaboradorDTO, ColaboradorMinDTO } from "./tipos";

export type ClaveFaltaPersona = "documento" | "celular" | "fechaIngreso" | "puesto" | "emergencia" | "foto";

export interface FaltaPersona {
  clave: ClaveFaltaPersona;
  /** Corto, para el chip de la fila. */
  label: string;
  /** Con «N sin …» se arma la franja de arriba. */
  resumen: string;
  /** Es un casillero del formulario; la foto se sube desde la ficha. */
  enFormulario: boolean;
}

/** En este orden se revisa y en este orden se enfoca el primer vacío. */
export const FALTAS_PERSONA: readonly FaltaPersona[] = [
  { clave: "documento", label: "DNI", resumen: "sin DNI", enFormulario: true },
  { clave: "celular", label: "Celular", resumen: "sin celular", enFormulario: true },
  { clave: "fechaIngreso", label: "Fecha de ingreso", resumen: "sin fecha de ingreso", enFormulario: true },
  { clave: "puesto", label: "Puesto", resumen: "sin puesto", enFormulario: true },
  { clave: "emergencia", label: "Contacto de emergencia", resumen: "sin contacto de emergencia", enFormulario: true },
  { clave: "foto", label: "Foto", resumen: "sin foto", enFormulario: false },
];

const vacio = (v: string | null | undefined): boolean => !v || !v.trim();
const completo = (c: ColaboradorDTO | ColaboradorMinDTO): c is ColaboradorDTO => "documento" in c;

export function faltasDePersona(c: ColaboradorDTO | ColaboradorMinDTO): FaltaPersona[] {
  const faltan = new Set<ClaveFaltaPersona>();
  if (vacio(c.fechaIngreso)) faltan.add("fechaIngreso");
  if (!c.puesto) faltan.add("puesto");
  if (completo(c)) {
    if (vacio(c.documento)) faltan.add("documento");
    if (vacio(c.celular)) faltan.add("celular");
    if (vacio(c.contactoEmergencia?.nombre) && vacio(c.contactoEmergencia?.celular)) faltan.add("emergencia");
    if (vacio(c.fotoUrl)) faltan.add("foto");
  }
  return FALTAS_PERSONA.filter((f) => faltan.has(f.clave));
}

export interface PersonaPorCompletar {
  id: string;
  nombre: string;
  faltan: FaltaPersona[];
  /** El primer casillero del formulario que está vacío; `null` si sólo falta la foto. */
  primerCampo: ClaveFaltaPersona | null;
}

/** Personas con algo pendiente (sólo activas: un cesado no se completa), las que más les falta primero. */
export function personasPorCompletar(lista: readonly (ColaboradorDTO | ColaboradorMinDTO)[]): PersonaPorCompletar[] {
  return lista
    .filter((c) => c.estado !== "CESADO" && !c.eventual)
    .map((c) => {
      const faltan = faltasDePersona(c);
      return { id: c.id, nombre: c.nombre, faltan, primerCampo: faltan.find((f) => f.enFormulario)?.clave ?? null };
    })
    .filter((p) => p.faltan.length > 0)
    .sort((a, b) => b.faltan.length - a.faltan.length || a.nombre.localeCompare(b.nombre, "es"));
}

/** «10 sin DNI» · «10 sin celular»…, de la falta más repetida a la menos. Sólo las que alguien tiene. */
export function resumenDeFaltas(personas: readonly PersonaPorCompletar[]): { clave: ClaveFaltaPersona; n: number; texto: string }[] {
  return FALTAS_PERSONA.map((f) => {
    const n = personas.filter((p) => p.faltan.some((x) => x.clave === f.clave)).length;
    return { clave: f.clave, n, texto: `${n} ${f.resumen}` };
  })
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
}
