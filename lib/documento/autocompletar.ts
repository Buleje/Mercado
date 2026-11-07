/**
 * Fichas que se llenan solas: las reglas puras (sin red, sin `server-only`).
 *
 * Escribes el DNI o el RUC y el padrón devuelve nombre, dirección y distrito.
 * Acá se decide QUÉ se llena solo y QUÉ se pregunta: un campo vacío se llena;
 * uno que ya tiene algo distinto NUNCA se pisa en silencio — la pantalla
 * ofrece «Usar dato de SUNAT» y la persona decide.
 */

import { findDepartamentoByName, findProvinciaByName, findDistritoByName, listDepartamentos, ubigeoDeNombres } from "@/lib/peru-ubigeo";

const norm = (s: string | null | undefined): string =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Código de ubigeo (6 dígitos) por nombres del catálogo INEI.
 *
 * SUNAT manda departamento, provincia y distrito en texto; con los tres sale
 * el código exacto. Si falta el departamento, se busca la provincia + distrito
 * en todo el país y sólo se responde cuando hay UNA coincidencia (dos «San
 * Martín» son dos códigos: elegir uno sería inventar). Sin certeza, vacío.
 */
export function ubigeoPorDistrito(departamento: string | null | undefined, provincia: string | null | undefined, distrito: string | null | undefined): string {
  if (!norm(provincia) || !norm(distrito)) return "";
  if (norm(departamento) && findDepartamentoByName(departamento ?? "")) {
    return ubigeoDeNombres(departamento ?? "", provincia ?? "", distrito ?? "");
  }
  const halladas = new Set<string>();
  for (const dep of listDepartamentos()) {
    const prov = findProvinciaByName(dep.code, provincia ?? "");
    const dist = prov ? findDistritoByName(dep.code, prov.code, distrito ?? "") : null;
    if (prov && dist) halladas.add(`${dep.code}${prov.code}${dist.code}`);
  }
  return halladas.size === 1 ? [...halladas][0] : "";
}

/**
 * SUNAT entrega el domicilio con el lugar pegado al final:
 * «CAL. MORELLI NRO 181 INT. P-2, SAN BORJA, LIMA, LIMA». La ficha ya tiene
 * casilleros de distrito, provincia y departamento; dejarlos también en la
 * calle imprime el lugar dos veces en la guía. Quita sólo lo que coincide con
 * esos tres, y sólo del final.
 */
export function direccionSinLugar(
  direccion: string | null | undefined,
  lugar: { departamento?: string | null; provincia?: string | null; distrito?: string | null },
): string {
  const conocidos = [lugar.distrito, lugar.provincia, lugar.departamento].map(norm).filter(Boolean);
  const partes = (direccion ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let quitadas = 0;
  while (partes.length > 1 && quitadas < 3 && conocidos.includes(norm(partes[partes.length - 1]))) {
    partes.pop();
    quitadas += 1;
  }
  return partes.join(", ");
}

export interface CambioPropuesto {
  campo: string;
  actual: string;
  nuevo: string;
}

export interface PlanDeAutocompletado {
  /** Campos vacíos que se llenan solos. */
  llenar: Record<string, string>;
  /** Campos con algo distinto: se pregunta antes de tocarlos. */
  preguntar: CambioPropuesto[];
}

/** Compara sin importar mayúsculas, tildes ni espacios dobles. */
export const mismoTexto = (a: string | null | undefined, b: string | null | undefined): boolean => norm(a) === norm(b);

/**
 * Qué hacer con cada dato del padrón. Lo vacío se llena; lo igual se ignora;
 * lo distinto se pregunta. Un dato del padrón vacío no cuenta.
 */
export function planDeAutocompletado(actual: Record<string, string | null | undefined>, nuevo: Record<string, string | null | undefined>): PlanDeAutocompletado {
  const llenar: Record<string, string> = {};
  const preguntar: CambioPropuesto[] = [];
  for (const [campo, valor] of Object.entries(nuevo)) {
    const n = (valor ?? "").trim();
    if (!n) continue;
    const a = (actual[campo] ?? "").trim();
    if (!a) llenar[campo] = n;
    else if (!mismoTexto(a, n)) preguntar.push({ campo, actual: a, nuevo: n });
  }
  return { llenar, preguntar };
}

