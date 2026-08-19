/**
 * El reporte de lo que pasó al importar el libro.
 *
 * Importar 300 filas y ver «12 con problema» no sirve para nada: hay que saber
 * QUÉ filas, POR QUÉ, y sobre todo QUÉ HACER. Este módulo agrupa los problemas
 * por causa —no por fila— porque las mismas doce fallas suelen ser un solo
 * error repetido, y arreglarlo una vez las cierra todas.
 *
 * Se puede bajar como CSV para abrirlo al lado del Excel y corregir.
 *
 * PURO: recibe los resultados y devuelve el reporte. No sabe de fetch ni de DOM.
 */

import { TITULO_FORMATO, type FormatoCtp } from "./ctp-formatos-serfor";

export type FilaDeResultado = { fila?: number; codigo: string; accion: string; mensaje: string };
export type ResultadoDeSeccion = {
  formato: FormatoCtp;
  respuesta: { resumen: { creados: number; porCrear: number; existen: number; errores: number }; filas: FilaDeResultado[] };
};

/** Un problema y todas las filas donde aparece. */
export type ProblemaAgrupado = {
  formato: FormatoCtp;
  /** El mensaje, sin los datos variables: es lo que agrupa. */
  causa: string;
  /** Un ejemplo completo, con su dato, para que se entienda. */
  ejemplo: string;
  filas: number[];
  codigos: string[];
  /** Qué hacer. Vacío si no sabemos: inventar un consejo es peor que no darlo. */
  comoArreglar: string;
};

export type ReporteImport = {
  /** Lo que efectivamente entró al libro. */
  creados: { formato: FormatoCtp; cantidad: number }[];
  totalCreados: number;
  /** Lo que ya estaba y no se tocó (el importador es insert-only). */
  totalExistentes: number;
  /** Filas que no entraron. */
  totalConError: number;
  problemas: ProblemaAgrupado[];
  /** Filas incompletas detectadas en el archivo, antes de mandar nada. */
  incompletas: { formato: FormatoCtp; fila: number; motivos: string[] }[];
  /** Avisos de la cadena (rendimientos raros, despachos sin respaldo). */
  avisosDeCadena: { lote: string; nivel: "error" | "aviso"; mensaje: string }[];
  /** true si no hay nada que arreglar. */
  limpio: boolean;
};

/**
 * Quita los datos variables del mensaje para poder agrupar.
 *
 * «GTF de ingreso no encontrado: 019-0000004» y «…: 019-0000007» son el MISMO
 * problema. Sin normalizar, un archivo con 40 filas rotas por la misma causa
 * daba 40 líneas distintas y el operador no veía el patrón.
 */
export function causaDe(mensaje: string): string {
  return mensaje
    .replace(/\d+[.,]\d+/g, "N") // volúmenes
    .replace(/\b[\w/-]*\d[\w/-]*\b/g, "X") // códigos, guías, fechas
    .replace(/\s+/g, " ")
    .trim();
}

/** Qué hacer con cada causa conocida. Lo que no está acá no lleva consejo. */
function consejoPara(mensaje: string, formato: FormatoCtp): string {
  const m = mensaje.toLowerCase();
  if (/no existe en el libro|cargá primero el ingreso|no encontrad/.test(m)) {
    return "Falta el ingreso de esa troza. Agregá su fila a la Sección 1 con el mismo Código de CTP, o importá primero esa sección.";
  }
  if (/ya existe|se salta|duplicada/.test(m)) {
    return "No hace falta hacer nada: ya está en el libro y no se sobrescribe.";
  }
  if (/datos distintos/.test(m)) {
    return "El libro tiene esa fila con otros valores. Si los del archivo son los correctos, corregilos desde la ficha — el importador nunca pisa un dato ya registrado.";
  }
  if (/sin especie|sin n° de gtf|sin titular|sin tipo de producto/.test(m)) {
    return `Completá esa columna en la hoja de ${TITULO_FORMATO[formato]}: sin ella la fila no se puede fiscalizar.`;
  }
  if (/fuera de rango|inválid/.test(m)) {
    return "Revisá el número: probablemente tenga un separador de miles o un dígito de más.";
  }
  if (/ya se consumió|ya está en el libro/.test(m)) {
    return "Esa pieza ya se usó. Si el corte es otro, cambiale el código; si es el mismo, no hay nada que importar.";
  }
  if (/período .* cerrado|periodo .* cerrado/.test(m)) {
    return "El mes ya se presentó. Reabrí el período desde el libro si de verdad hay que corregirlo — queda registrado quién y por qué.";
  }
  if (/suman más|supera/.test(m)) {
    return "Los pedazos suman más que la troza madre. Revisá los volúmenes del Apartado 2.";
  }
  return "";
}

export function armarReporte(
  resultados: readonly ResultadoDeSeccion[],
  extras: {
    incompletas?: { formato: FormatoCtp; fila: number; motivos: string[] }[];
    avisosDeCadena?: { lote: string; nivel: "error" | "aviso"; mensaje: string }[];
  } = {},
): ReporteImport {
  const creados: { formato: FormatoCtp; cantidad: number }[] = [];
  let totalExistentes = 0;
  let totalConError = 0;
  const porCausa = new Map<string, ProblemaAgrupado>();

  for (const r of resultados) {
    if (r.respuesta.resumen.creados > 0) {
      creados.push({ formato: r.formato, cantidad: r.respuesta.resumen.creados });
    }
    for (const f of r.respuesta.filas) {
      if (f.accion === "existe") {
        totalExistentes += 1;
        continue;
      }
      if (f.accion !== "error") continue;
      totalConError += 1;

      const causa = causaDe(f.mensaje);
      const clave = `${r.formato}::${causa}`;
      const previo = porCausa.get(clave);
      if (previo) {
        if (f.fila != null) previo.filas.push(f.fila);
        if (f.codigo && f.codigo !== "—") previo.codigos.push(f.codigo);
      } else {
        porCausa.set(clave, {
          formato: r.formato,
          causa,
          ejemplo: f.mensaje,
          filas: f.fila != null ? [f.fila] : [],
          codigos: f.codigo && f.codigo !== "—" ? [f.codigo] : [],
          comoArreglar: consejoPara(f.mensaje, r.formato),
        });
      }
    }
  }

  /* Lo que más se repite va primero: es donde un solo arreglo cierra más filas. */
  const problemas = [...porCausa.values()].sort((a, b) => b.filas.length - a.filas.length);
  const incompletas = extras.incompletas ?? [];
  const avisosDeCadena = extras.avisosDeCadena ?? [];

  return {
    creados,
    totalCreados: creados.reduce((s, c) => s + c.cantidad, 0),
    totalExistentes,
    totalConError,
    problemas,
    incompletas,
    avisosDeCadena,
    limpio: totalConError === 0 && incompletas.length === 0 && avisosDeCadena.length === 0,
  };
}

/** Un resumen de una línea, para el título del reporte. */
export function tituloDelReporte(r: ReporteImport): string {
  if (r.totalCreados === 0 && r.totalConError === 0) {
    return r.totalExistentes > 0 ? "Todo esto ya estaba en el libro" : "No entró nada";
  }
  const partes = [`${r.totalCreados} filas importadas`];
  if (r.totalExistentes > 0) partes.push(`${r.totalExistentes} ya estaban`);
  if (r.totalConError > 0) partes.push(`${r.totalConError} quedaron afuera`);
  return partes.join(" · ");
}

/**
 * El reporte como CSV, para abrirlo al lado del Excel.
 *
 * Separador `;` porque el Excel es-PE usa la coma como decimal: con `,` las
 * columnas se parten mal y el reporte llega ilegible justo a quien lo necesita.
 */
export function reporteACsv(r: ReporteImport, nombreArchivo?: string): string {
  const esc = (v: unknown): string => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas: string[][] = [
    ["Reporte de importación del Libro de Operaciones"],
    ...(nombreArchivo ? [["Archivo", nombreArchivo]] : []),
    [tituloDelReporte(r)],
    [],
    ["Qué entró"],
    ["Sección", "Filas creadas"],
    ...r.creados.map((c) => [TITULO_FORMATO[c.formato], String(c.cantidad)]),
  ];

  if (r.problemas.length > 0) {
    lineas.push([], ["Qué quedó afuera"], ["Sección", "Filas", "Códigos", "Problema", "Cómo arreglarlo"]);
    for (const p of r.problemas) {
      lineas.push([
        TITULO_FORMATO[p.formato],
        p.filas.join(" "),
        p.codigos.slice(0, 20).join(" "),
        p.ejemplo,
        p.comoArreglar,
      ]);
    }
  }

  if (r.incompletas.length > 0) {
    lineas.push([], ["Filas incompletas en el archivo"], ["Sección", "Fila", "Qué falta"]);
    for (const i of r.incompletas) {
      lineas.push([TITULO_FORMATO[i.formato], String(i.fila), i.motivos.join(" · ")]);
    }
  }

  if (r.avisosDeCadena.length > 0) {
    lineas.push([], ["Revisar en el libro"], ["Lote", "Nivel", "Aviso"]);
    for (const a of r.avisosDeCadena) {
      lineas.push([a.lote, a.nivel === "error" ? "Error" : "Aviso", a.mensaje]);
    }
  }

  /* BOM para que Excel abra los acentos bien. Sin él, «Producción» llega rota. */
  return "﻿" + lineas.map((l) => l.map(esc).join(";")).join("\n");
}
