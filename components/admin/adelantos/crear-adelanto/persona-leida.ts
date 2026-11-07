/**
 * La persona que salió de la foto o del dictado, ya buscada entre las tuyas.
 * La comparten «Desde la foto» y «Dictar»: los dos ponen un nombre y la
 * pantalla tiene que decir lo mismo — «la elegí», «¿cuál de estas?» o «no está:
 * créala» —, nunca elegir sola entre dos.
 */

import { buscarPersona, personaEnFrase, type PersonaEncontrada } from "@/lib/adelantos/leer-comprobante-persona";
import type { BeneficiarioConSaldo } from "./tipos";

export type PersonaLeida =
  /** Una sola calza: ya quedó elegida en el bloque 2. */
  | { tipo: "una"; dicho: string; id: string; nombre: string }
  /** Dos o más calzan igual: la persona elige con un toque. */
  | { tipo: "varias"; dicho: string; opciones: { id: string; nombre: string }[] }
  /** Nadie se parece: se ofrece crearla con ese nombre. */
  | { tipo: "ninguna"; dicho: string };

function deResultado(dicho: string, r: PersonaEncontrada<BeneficiarioConSaldo>): PersonaLeida {
  if (r.tipo === "una") return { tipo: "una", dicho, id: r.persona.id, nombre: r.persona.nombre };
  if (r.tipo === "varias") return { tipo: "varias", dicho, opciones: r.opciones.map((p) => ({ id: p.id, nombre: p.nombre })) };
  return { tipo: "ninguna", dicho };
}

/** El nombre de un voucher («Yapeaste a Wasaco Servicios E.I.R.L.»). */
export function personaDelNombre(nombre: string | null, personas: readonly BeneficiarioConSaldo[]): PersonaLeida | null {
  if (!nombre?.trim()) return null;
  return deResultado(nombre.trim(), buscarPersona(nombre, personas));
}

/**
 * La de una frase dicha. Si el parser sacó un nombre («a Pedro», «Wasaco me
 * prestó»), se busca SÓLO ese nombre: buscar en la frase entera dejaba que la
 * nota le ganara («le di 30 a Pedro para la luz» elegía a la persona «Luz»,
 * «…por el pasaje a San Martín» a «Martín»; revisión 25-10). Sin nombre
 * («Wasaco 500 por aserrío»), se busca en la frase sin las palabras de la nota.
 */
export function personaDeLaFrase(
  frase: string,
  nombre: string | null,
  nota: string | null,
  personas: readonly BeneficiarioConSaldo[],
): PersonaLeida | null {
  if (nombre?.trim()) return personaDelNombre(nombre, personas);
  const enFrase = personaEnFrase(frase, personas, nota);
  return enFrase.tipo === "ninguna" ? null : deResultado(frase, enFrase);
}

/**
 * ¿Hay que soltar la persona que estaba elegida? Sí cuando lo leído o dicho
 * nombra a OTRA (no calzó o calzó con varias que no son ésta). El alta abre con
 * la primera persona activa ya elegida: sin soltarla, «mil doscientos a la mamá
 * de Alex» dejaba el adelanto a nombre de esa otra y el botón de guardar listo
 * (visto en QA 25-10). Suelta → el bloque 2 pide «Elige a la persona».
 */
export function soltarLaElegida(persona: PersonaLeida | null, elegida: string): boolean {
  if (!persona || persona.tipo === "una" || !elegida) return false;
  return !(persona.tipo === "varias" && persona.opciones.some((o) => o.id === elegida));
}
