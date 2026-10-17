/**
 * El formulario de una guía guardada antes del ingreso (ADR-442) — lógica PURA:
 * cómo se lee la guía en el formulario, qué viaja al guardar y qué se completa
 * solo al elegir un permiso o un titular ya cargado.
 */

import type { Contrato } from "@/lib/forestal/contratos";
import type { GuiaGuardadaInput, GuiaGuardadaVista } from "@/lib/forestal/guias-guardadas";

export interface FormGuia {
  numeroRegistro: string;
  gtfNumber: string;
  gtfDate: string;
  titularNombre: string;
  titularDoc: string;
  permisoCodigo: string;
  contratoId: string;
  notas: string;
}

type CampoForm = keyof FormGuia;
const CAMPOS: readonly CampoForm[] = [
  "numeroRegistro",
  "gtfNumber",
  "gtfDate",
  "titularNombre",
  "titularDoc",
  "permisoCodigo",
  "contratoId",
  "notas",
];

export const FORM_VACIO: FormGuia = {
  numeroRegistro: "",
  gtfNumber: "",
  gtfDate: "",
  titularNombre: "",
  titularDoc: "",
  permisoCodigo: "",
  contratoId: "",
  notas: "",
};

/** Lo que dice la guía guardada, como lo edita el formulario. */
export function formDe(g: GuiaGuardadaVista | null): FormGuia {
  if (!g) return FORM_VACIO;
  return {
    numeroRegistro: g.numeroRegistro ?? "",
    gtfNumber: g.gtfNumber ?? "",
    gtfDate: (g.gtfDate ?? "").slice(0, 10),
    titularNombre: g.titularNombre ?? "",
    titularDoc: g.titularDoc ?? "",
    permisoCodigo: g.permisoCodigo ?? "",
    contratoId: g.contratoId ?? "",
    notas: g.notas ?? "",
  };
}

/**
 * Sólo lo que cambió respecto de `base` (un PATCH parcial no pisa lo que nadie
 * tocó). Vacío viaja como `null` = «borrar el dato». Sin base (alta), todo lo
 * que tenga algo escrito.
 */
export function cambiosDe(form: FormGuia, base: FormGuia | null): GuiaGuardadaInput {
  const out: Record<string, string | null> = {};
  for (const k of CAMPOS) {
    const v = form[k].trim();
    if (base ? v !== base[k].trim() : v !== "") out[k] = v === "" ? null : v;
  }
  return out as GuiaGuardadaInput;
}

const mismo = (a: string, b: string | null | undefined) =>
  a.trim().toUpperCase() === (b ?? "").trim().toUpperCase();

/**
 * Elegir un permiso ya cargado (ADR-421) ata la guía a él y, si el titular
 * está vacío, lo trae del permiso. Elegir un titular con UN solo permiso trae
 * ese permiso. Lo escrito nunca se pisa.
 */
export function conPermiso(form: FormGuia, codigo: string, contratos: readonly Contrato[]): FormGuia {
  const c = contratos.find((x) => mismo(codigo, x.codigo));
  const titularVacio = !form.titularNombre.trim();
  return {
    ...form,
    permisoCodigo: codigo,
    contratoId: c?.id ?? "",
    ...(c && titularVacio
      ? { titularNombre: c.titularNombre, titularDoc: form.titularDoc || c.titularDoc || "" }
      : {}),
  };
}

export function conTitular(form: FormGuia, nombre: string, contratos: readonly Contrato[]): FormGuia {
  const suyos = contratos.filter((x) => mismo(nombre, x.titularNombre));
  const unico = suyos.length === 1 ? suyos[0] : null;
  return {
    ...form,
    titularNombre: nombre,
    ...(unico && !form.titularDoc.trim() && unico.titularDoc ? { titularDoc: unico.titularDoc } : {}),
    ...(unico && !form.permisoCodigo.trim()
      ? { permisoCodigo: unico.codigo, contratoId: unico.id }
      : {}),
  };
}

