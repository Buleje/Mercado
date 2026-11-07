/**
 * La lógica del formulario «Pedir corrección» (ADR-512), sin React: armar el
 * body del POST a partir de las filas que llenó la persona y decir qué falta.
 *
 * El navegador manda sólo dónde, qué clave y lo correcto (`CambioPedido`); lo
 * que la guía DICE lo lee el servidor. La validación final es la del contrato
 * (`crearCorreccionSchema`): acá sólo se traduce a mensajes por fila.
 */

import {
  crearCorreccionSchema,
  type CrearCorreccionBody,
  type EntityTypeCorreccion,
} from "@/lib/soporte/correccion-guia";
import { claveOpcion, type OpcionCorregible } from "./opciones-de-la-guia";

export const MAX_CAMBIOS = 20;
export const MOTIVO_MIN = 5;
export const MOTIVO_MAX = 1000;
export const CORRECTO_MAX = 300;

/** Una fila del formulario: qué casillero o fila (`claveOpcion`) y qué debería decir. */
export interface LineaCambio {
  id: string;
  opcion: string;
  correcto: string;
}

export interface ErroresPedido {
  lineas: Record<string, { opcion?: string; correcto?: string }>;
  motivo?: string;
  general?: string;
}

export type ResultadoPedido = { ok: true; body: CrearCorreccionBody } | { ok: false; errores: ErroresPedido };

let secuencia = 0;
export function lineaVacia(): LineaCambio {
  secuencia += 1;
  return { id: `c${Date.now().toString(36)}${secuencia}`, opcion: "", correcto: "" };
}

const enBlanco = (l: LineaCambio): boolean => !l.opcion && !l.correcto.trim();

export function armarPedido(o: {
  entityType: EntityTypeCorreccion;
  entityId: string;
  lineas: readonly LineaCambio[];
  motivo: string;
  opciones: readonly OpcionCorregible[];
  /** Ids del Archivo de la evidencia ya subida (foto o PDF en los papeles de la guía). */
  documentoIds?: readonly string[];
}): ResultadoPedido {
  const errores: ErroresPedido = { lineas: {} };
  const porClave = new Map(o.opciones.map((op) => [claveOpcion(op), op]));
  /* Una fila entera en blanco no cuenta (la que se agregó y no se usó), salvo que sea la única. */
  const usadas = o.lineas.filter((l) => !enBlanco(l));
  const filas = usadas.length ? usadas : o.lineas.slice(0, 1);
  if (filas.length > MAX_CAMBIOS) errores.general = `Hasta ${MAX_CAMBIOS} cambios por pedido: manda el resto en otro.`;

  const vistos = new Set<string>();
  const cambios: CrearCorreccionBody["cambios"] = [];
  for (const l of filas) {
    const e: { opcion?: string; correcto?: string } = {};
    const op = porClave.get(l.opcion);
    if (!op) e.opcion = "Elige el casillero o la troza";
    else if (vistos.has(l.opcion)) e.opcion = "Ya está en otra fila de este pedido";
    const correcto = l.correcto.trim();
    if (!correcto) e.correcto = "Escribe lo que debería decir";
    else if (correcto.length > CORRECTO_MAX) e.correcto = `Hasta ${CORRECTO_MAX} letras`;
    else if (op?.dice && op.dice.trim() === correcto) e.correcto = "Es lo mismo que dice hoy";
    if (e.opcion || e.correcto) errores.lineas[l.id] = e;
    if (op) {
      vistos.add(l.opcion);
      cambios.push({ donde: op.donde, clave: op.clave, correcto });
    }
  }

  const motivo = o.motivo.trim();
  if (motivo.length < MOTIVO_MIN) errores.motivo = "Cuenta en una frase por qué hay que corregirla";
  else if (motivo.length > MOTIVO_MAX) errores.motivo = `Hasta ${MOTIVO_MAX} letras`;

  if (Object.keys(errores.lineas).length || errores.motivo || errores.general) return { ok: false, errores };

  const documentoIds = o.documentoIds?.length ? [...new Set(o.documentoIds)] : undefined;
  const check = crearCorreccionSchema.safeParse({ entityType: o.entityType, entityId: o.entityId, cambios, motivo, documentoIds });
  if (!check.success) {
    return { ok: false, errores: { lineas: {}, general: check.error.issues[0]?.message ?? "Revisa el pedido" } };
  }
  return { ok: true, body: check.data };
}

/**
 * La fila del pedido cuya clave el servidor no reconoce (`casillero_desconocido` /
 * `item_desconocido` traen `clave`): para mostrar el error al lado de ESE cambio.
 * El servidor normaliza («(12)» → «12», trozas en mayúsculas), así que se compara igual.
 */
export function lineaDeLaClave(
  lineas: readonly LineaCambio[],
  donde: "casillero" | "item" | undefined,
  clave: string,
): string | null {
  const norma = (c: string) => c.trim().replace(/^\((.*)\)$/, "$1").toLowerCase();
  const buscada = norma(clave);
  const fila = lineas.find((l) => {
    const i = l.opcion.indexOf(":");
    return i > 0 && (!donde || l.opcion.slice(0, i) === donde) && norma(l.opcion.slice(i + 1)) === buscada;
  });
  return fila?.id ?? null;
}

export { diaDelPedido } from "./fecha";
