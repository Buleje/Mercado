/**
 * Lectura genérica de una planilla de campo (conteo, parte de producción, censo):
 * el esquema que se le pide a la IA —armado con las columnas de la planilla— y
 * la normalización de lo que devuelve a `LecturaPlanilla`.
 *
 * Las de cubicar (aserrada, Smalian, Oxapampina) NO pasan por acá: van por
 * `cubicacion-ocr/*`, que devuelven la forma de siempre a sus cubicadores.
 *
 * PURO (sin red ni base): lo usa la ruta `planillas/leer` y lo prueban los tests.
 */

import { z } from "zod";
import { aNumero } from "../cubicacion-import";
import { columnasAMano, encabezadosExcel } from "./catalogo";
import type { FilaLeida, LecturaPlanilla, PlanillaCampo } from "./tipos";

/** Tope de renglones por foto (una hoja tiene 30 a lo sumo; con margen para un cuaderno). */
export const MAX_FILAS_LECTURA = 150;

/** Lo que devuelve la IA, sin interpretar: cada valor llega como venga y se limpia en `normalizarLectura`. */
export interface LecturaCruda {
  cabecera: Record<string, unknown>;
  filas: Record<string, unknown>[];
  advertencia: string;
}

const CrudaSchema: z.ZodType<LecturaCruda> = z.object({
  cabecera: z.record(z.string(), z.unknown()).catch({}),
  filas: z.array(z.record(z.string(), z.unknown())).max(MAX_FILAS_LECTURA),
  advertencia: z.string().catch(""),
});

/**
 * El esquema Zod (validación) y el JSON Schema estricto (lo que Claude respeta
 * al responder) de una planilla. El JSON Schema nombra cada columna y cada
 * casillero: la IA no puede inventar claves ni olvidarse de una.
 */
export function esquemasDeLectura(p: PlanillaCampo): { schema: z.ZodType<LecturaCruda>; jsonSchema: Record<string, unknown> } {
  const cols = columnasAMano(p);
  const claves = cols.map((c) => c.clave);
  const jsonSchema = {
    type: "object",
    properties: {
      cabecera: {
        type: "object",
        properties: Object.fromEntries(p.cabecera.map((c) => [c.clave, { type: "string" }])),
        required: p.cabecera.map((c) => c.clave),
        additionalProperties: false,
      },
      filas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ...Object.fromEntries(claves.map((k) => [k, { type: "string" }])),
            dudosas: { type: "array", items: { type: "string", enum: claves } },
          },
          required: [...claves, "dudosas"],
          additionalProperties: false,
        },
      },
      advertencia: { type: "string" },
    },
    required: ["cabecera", "filas", "advertencia"],
    additionalProperties: false,
  };
  return { schema: CrudaSchema, jsonSchema };
}

const texto = (v: unknown): string => (v == null ? "" : typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/**
 * Lo crudo → `LecturaPlanilla`:
 *  · sólo las columnas a mano (lo calculado no se lee aunque la IA lo mande);
 *  · los números con `aNumero` (acepta «2,5», «2 1/2», «1.234,5»); uno que no se
 *    entiende queda como TEXTO y se marca dudoso — se ve lo que leyó la IA para
 *    corregirlo, en vez de una celda vacía;
 *  · `dudosas` sólo con claves de la planilla, sin repetir;
 *  · los renglones vacíos se descartan (la IA a veces devuelve los de la hoja).
 */
export function normalizarLectura(
  p: PlanillaCampo,
  cruda: LecturaCruda,
  prompt: LecturaPlanilla["prompt"],
): LecturaPlanilla {
  const cols = columnasAMano(p);
  const conocidas = new Set(cols.map((c) => c.clave));

  const cabecera: Record<string, string | null> = {};
  for (const c of p.cabecera) cabecera[c.clave] = texto(cruda.cabecera[c.clave]) || null;

  const filas: FilaLeida[] = [];
  for (const cruda1 of cruda.filas.slice(0, MAX_FILAS_LECTURA)) {
    const marcadas = Array.isArray(cruda1.dudosas) ? cruda1.dudosas : [];
    const dudosas = new Set(marcadas.filter((k): k is string => typeof k === "string" && conocidas.has(k)));
    const valores: FilaLeida["valores"] = {};
    let conDatos = false;
    for (const c of cols) {
      const t = texto(cruda1[c.clave]);
      if (!t) {
        valores[c.clave] = null;
        continue;
      }
      conDatos = true;
      if (c.tipo === "entero" || c.tipo === "decimal") {
        const n = aNumero(t);
        if (n == null) dudosas.add(c.clave);
        valores[c.clave] = n ?? t;
      } else {
        valores[c.clave] = t;
      }
    }
    if (conDatos) filas.push({ valores, dudosas: cols.map((c) => c.clave).filter((k) => dudosas.has(k)) });
  }

  const advertencia = cruda.advertencia.trim();
  return { planillaId: p.id, cabecera, filas, ...(advertencia ? { advertencia } : {}), prompt };
}

/**
 * La lectura como matriz para el importador de su destino: 1.ª fila = los
 * mismos encabezados del Excel de la planilla, después un renglón por fila.
 * Así la foto y el Excel entran por el MISMO importador (con su vista previa).
 * Para el parte de producción, `interpretarProduccion` pide `string[][]`:
 * `matrizDeLecturaTexto`.
 */
export function matrizDeLectura(p: PlanillaCampo, l: Pick<LecturaPlanilla, "filas">): (string | number | null)[][] {
  const cols = columnasAMano(p);
  return [encabezadosExcel(p), ...l.filas.map((f) => cols.map((c) => f.valores[c.clave] ?? null))];
}

export function matrizDeLecturaTexto(p: PlanillaCampo, l: Pick<LecturaPlanilla, "filas">): string[][] {
  return matrizDeLectura(p, l).map((fila) => fila.map((v) => (v == null ? "" : String(v))));
}
