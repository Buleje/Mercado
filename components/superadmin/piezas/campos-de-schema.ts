/**
 * De un JSON Schema de opciones (lo que entrega `/api/superadmin/piezas` en
 * `opcionesSchema`) a la lista de campos que el formulario sabe dibujar.
 *
 * Sabe cinco formas, que son las que usan las opciones de las piezas:
 * texto, número, sí/no, elegir una y varias (lista de textos o de opciones).
 * Si una pieza trae algo que no es de esas formas, `camposDeSchema` devuelve
 * `null` y la pantalla cae a un cuadro de JSON: mejor un campo feo que un
 * formulario que calla una opción.
 *
 * Puro y sin React: lo prueba un test.
 */

export type Campo =
  | { tipo: "texto"; clave: string; rotulo: string; ayuda?: string; max?: number; largo: boolean }
  | { tipo: "numero"; clave: string; rotulo: string; ayuda?: string; min?: number; max?: number; entero: boolean }
  | { tipo: "booleano"; clave: string; rotulo: string; ayuda?: string }
  | { tipo: "elegir"; clave: string; rotulo: string; ayuda?: string; opciones: Opcion[] }
  | { tipo: "varias"; clave: string; rotulo: string; ayuda?: string; opciones: Opcion[]; min?: number; max?: number }
  | { tipo: "lista"; clave: string; rotulo: string; ayuda?: string; min?: number; max?: number; maxCadaUna?: number };

export interface Opcion {
  valor: string;
  rotulo: string;
}

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
/** `FilaPieza.opciones` es JSON suelto: sólo un objeto vale como opciones. */
export const comoObjeto = (v: unknown): Record<string, unknown> => (esObj(v) ? v : {});
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

/** `mostrarOrigen` → «Mostrar origen». Sólo cuando la pieza no puso su propio título. */
export function rotuloDeClave(clave: string): string {
  const palabras = clave.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return palabras.charAt(0).toUpperCase() + palabras.slice(1);
}

function opcionesDe(valores: unknown, etiquetas: unknown): Opcion[] | null {
  if (!Array.isArray(valores) || valores.length === 0 || !valores.every((v) => typeof v === "string")) return null;
  const mapa = esObj(etiquetas) ? etiquetas : {};
  return (valores as string[]).map((valor) => ({ valor, rotulo: str(mapa[valor]) ?? rotuloDeClave(valor) }));
}

function campoDe(clave: string, def: unknown): Campo | null {
  if (!esObj(def)) return null;
  const rotulo = str(def.title) ?? rotuloDeClave(clave);
  const ayuda = str(def.description);
  const base = { clave, rotulo, ...(ayuda ? { ayuda } : {}) };

  if (Array.isArray(def.enum)) {
    const opciones = opcionesDe(def.enum, def["x-etiquetas"]);
    return opciones ? { tipo: "elegir", ...base, opciones } : null;
  }
  switch (def.type) {
    case "string":
      return { tipo: "texto", ...base, max: num(def.maxLength), largo: (num(def.maxLength) ?? 0) > 100 };
    case "number":
    case "integer":
      return { tipo: "numero", ...base, min: num(def.minimum), max: num(def.maximum), entero: def.type === "integer" };
    case "boolean":
      return { tipo: "booleano", ...base };
    case "array": {
      const items = esObj(def.items) ? def.items : null;
      if (!items) return null;
      const limites = { min: num(def.minItems), max: num(def.maxItems) };
      if (Array.isArray(items.enum)) {
        const opciones = opcionesDe(items.enum, def["x-etiquetas"]);
        return opciones ? { tipo: "varias", ...base, opciones, ...limites } : null;
      }
      if (items.type === "string") return { tipo: "lista", ...base, ...limites, maxCadaUna: num(items.maxLength) };
      return null;
    }
    default:
      return null;
  }
}

/** `null` = la pieza trae algo que el formulario no sabe dibujar (se edita como JSON). */
export function camposDeSchema(schema: unknown): Campo[] | null {
  if (!esObj(schema) || schema.type !== "object" || !esObj(schema.properties)) return null;
  const campos: Campo[] = [];
  for (const [clave, def] of Object.entries(schema.properties)) {
    const campo = campoDe(clave, def);
    if (!campo) return null;
    campos.push(campo);
  }
  return campos;
}

/**
 * Los valores del formulario → el objeto que se manda. Un texto vacío se OMITE:
 * así el `.default()` de la pieza manda, en vez de guardar un «» que su Zod
 * podría rechazar (`min(1)`).
 */
export function opcionesDeValores(campos: readonly Campo[], valores: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const c of campos) {
    const v = valores[c.clave];
    if (v === undefined || v === null) continue;
    if (c.tipo === "texto" && typeof v === "string" && v.trim() === "") continue;
    if (c.tipo === "numero" && (v === "" || Number.isNaN(v))) continue;
    salida[c.clave] = c.tipo === "texto" && typeof v === "string" ? v.trim() : v;
  }
  return salida;
}
