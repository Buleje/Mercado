/**
 * Lo que la IA leyó de una foto → el texto que ya sabe leer el importador.
 *
 * Producción (`CtpProduccionImportModal`) y el censo (`LothCensoImportModal`)
 * ya tienen su cuadro de «pegar la planilla» con vista previa, errores por
 * fila y avisos. En vez de un segundo camino para las filas de la foto, se
 * arma la misma hoja que alguien pegaría (encabezados + filas separadas por
 * tabulador) y se deja en ese cuadro: la persona ve y corrige con la vista
 * previa de siempre, y los guards del importador son los mismos.
 *
 * Las columnas `calculada` no viajan: se calculan al importar, nunca se toma
 * lo que diga la foto (contrato de `PlanillaCampo`).
 */
import { matrizDeLecturaTexto } from "@/lib/forestal/planillas/lectura";
import type { LecturaPlanilla, PlanillaCampo } from "@/lib/forestal/planillas/tipos";

/** Columna muda al principio: el lector de producción recorta cada renglón y
 *  una primera celda vacía corría todas las columnas un lugar. */
const COLUMNA_FILA = "Fila";

function celda(v: string): string {
  return v.replace(/[\t\r\n]+/g, " ").trim();
}

/**
 * La matriz es la del servidor (`matrizDeLecturaTexto`: encabezados del Excel
 * de la planilla, los que reconoce el importador de su destino tal cual). Lo cuida
 * `planillas-lectura-a-texto.test.ts`, que pasa la fila de ejemplo de cada
 * planilla por el lector real.
 */
export function lecturaATexto(planilla: PlanillaCampo, lectura: LecturaPlanilla): string {
  return matrizDeLecturaTexto(planilla, lectura)
    .map((fila, i) => [i === 0 ? COLUMNA_FILA : String(i), ...fila.map(celda)].join("\t"))
    .join("\n");
}

/** «Fila 3: DAP, especie» — lo que la IA no leyó con seguridad, para cotejar con la foto. */
export function dudasDeLaLectura(planilla: PlanillaCampo, lectura: LecturaPlanilla): string[] {
  const titulo = new Map(planilla.columnas.map((c) => [c.clave, c.titulo]));
  return lectura.filas.flatMap((f, i) =>
    f.dudosas.length > 0 ? [`Fila ${i + 1}: ${f.dudosas.map((k) => titulo.get(k) ?? k).join(", ")}`] : [],
  );
}
