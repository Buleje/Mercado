/**
 * Los errores de las opciones de una pieza, en español y con el NOMBRE del campo
 * (el que ve el superadmin en el formulario), no la clave interna ni el texto
 * en inglés de Zod. Sirve igual para lo que valida el navegador antes de enviar
 * y para lo que devuelve el servidor (`issues`).
 */
import { rotuloDeClave } from "./campos-de-schema";

export interface IssueDeOpciones {
  path?: readonly (string | number | symbol)[];
  code?: string;
  message?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  origin?: string;
  expected?: string;
  values?: readonly unknown[];
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

function motivo(i: IssueDeOpciones): string {
  const min = i.minimum === undefined ? undefined : Number(i.minimum);
  const max = i.maximum === undefined ? undefined : Number(i.maximum);
  switch (i.code) {
    case "too_small":
      if (i.origin === "array") return min === 1 ? "elige al menos una opción" : `elige al menos ${plural(min ?? 1, "opción", "opciones")}`;
      if (i.origin === "string") return min === 1 ? "no puede quedar vacío" : `necesita al menos ${plural(min ?? 1, "letra", "letras")}`;
      return `no puede ser menor que ${min}`;
    case "too_big":
      if (i.origin === "array") return `elige como máximo ${plural(max ?? 0, "opción", "opciones")}`;
      if (i.origin === "string") return `admite como máximo ${plural(max ?? 0, "letra", "letras")}`;
      return `no puede ser mayor que ${max}`;
    case "invalid_value":
      return "no es una opción válida";
    case "unrecognized_keys":
      return "trae un dato que esta pieza no usa";
    default:
      return "no es válido";
  }
}

/** `[{ path: ["columnasVentas"], code: "too_small", … }]` → «Columnas de ventas: elige al menos una opción». */
export function explicarIssues(issues: readonly IssueDeOpciones[], rotulos: Readonly<Record<string, string>> = {}): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const i of issues) {
    const clave = typeof i.path?.[0] === "string" ? i.path[0] : undefined;
    const nombre = clave ? (rotulos[clave] ?? rotuloDeClave(clave)) : "Opciones";
    const linea = `${nombre}: ${motivo(i)}`;
    if (!vistos.has(linea)) {
      vistos.add(linea);
      salida.push(linea);
    }
  }
  return salida;
}
