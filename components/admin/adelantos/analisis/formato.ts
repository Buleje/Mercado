/**
 * Plata para ejes y etiquetas de los gráficos del análisis: «S/ 3.8 mil»,
 * «$ 1.2 mil». Mismo separador que el resto del panel (`solesEje` de Inicio):
 * «3,8» se leería como tres mil ochocientos en una pantalla y como tres coma
 * ocho en otra.
 */
import { numeroEje, solesEje } from "@/lib/admin/inicio/formato-tablero";
import { fmtMon } from "../shared";

export function montoEje(n: number, moneda: string): string {
  return moneda === "USD" ? `$ ${numeroEje(n)}` : solesEje(n);
}

/** «1 persona» · «3 personas». */
export const personas = (n: number): string => `${n} persona${n === 1 ? "" : "s"}`;

/** «1 día» · «36 días». */
export const dias = (n: number): string => `${n} día${n === 1 ? "" : "s"}`;

/**
 * Plata dentro de una frase, sin que el renglón se parta entre «S/» y la
 * cifra (en la columna angosta salía «(S/» arriba y «17,000.00)» abajo).
 */
export const montoEnFrase = (n: number, moneda: string): string => fmtMon(n, moneda).replace(/ /g, "\u00a0");
