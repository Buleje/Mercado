/**
 * estado-hoja — las operaciones del editor, como datos.
 *
 * Cada cosa que hace el usuario (escribir, pegar, poner negrita, insertar una
 * fila) se representa como una ACCIÓN. De ahí salen tres cosas a la vez:
 *
 *   · la hoja nueva que se muestra en pantalla,
 *   · la acción INVERSA, que es lo que ejecuta Ctrl+Z,
 *   · el cambio que hay que escribir en el archivo al guardar.
 *
 * Tenerlo como datos —y no como mutaciones sueltas repartidas por el
 * componente— es lo que permite que deshacer funcione siempre, incluso
 * combinando operaciones distintas.
 */

import type { CeldaHoja, EstiloCelda, HojaFormato } from "@/lib/documentos/xlsx-formato";
import { colorLegible, formatearValor } from "@/lib/documentos/xlsx-formato";
import type { CambioFormato } from "@/lib/documentos/xlsx-estilos";
import type { Cambios } from "@/lib/documentos/xlsx-escritura";

export type Accion =
  /** Escribir en una o muchas celdas (escribir, pegar, borrar un rango). */
  | { tipo: "valores"; celdas: { fila: number; columna: number; valor: string }[] }
  /** Aplicar formato a un conjunto de celdas. */
  | { tipo: "formato"; celdas: { fila: number; columna: number }[]; formato: CambioFormato }
  /** Insertar o eliminar una fila/columna. */
  | { tipo: "estructura"; eje: "fila" | "columna"; indice: number; delta: 1 | -1; datos?: CeldaHoja[] }
  /** Cambiar el ancho de una columna. */
  | { tipo: "ancho"; columna: number; anchoPx: number };

/** Una acción ya ejecutada, con lo necesario para deshacerla. */
export interface Paso {
  accion: Accion;
  inversa: Accion;
}

const CELDA_VACIA: CeldaHoja = { texto: "", crudo: "" };

function celdaEn(hoja: HojaFormato, fila: number, columna: number): CeldaHoja {
  return hoja.filas[fila]?.[columna] ?? CELDA_VACIA;
}

/** Agranda la hoja si se escribe fuera de sus límites actuales. */
function asegurarTamano(hoja: HojaFormato, filas: number, columnas: number): HojaFormato {
  const colsActual = Math.max(hoja.filas[0]?.length ?? 0, 1);
  const cols = Math.max(colsActual, columnas);
  const filasNuevas = hoja.filas.map((f) =>
    f.length >= cols ? f : [...f, ...Array.from({ length: cols - f.length }, () => ({ ...CELDA_VACIA }))]);
  while (filasNuevas.length < filas) {
    filasNuevas.push(Array.from({ length: cols }, () => ({ ...CELDA_VACIA })));
  }
  return {
    ...hoja,
    filas: filasNuevas,
    anchos: cols > hoja.anchos.length
      ? [...hoja.anchos, ...new Array(cols - hoja.anchos.length).fill(64)]
      : hoja.anchos,
    altos: filasNuevas.length > hoja.altos.length
      ? [...hoja.altos, ...new Array(filasNuevas.length - hoja.altos.length).fill(20)]
      : hoja.altos,
    columnasOcultas: cols > hoja.columnasOcultas.length
      ? [...hoja.columnasOcultas, ...new Array(cols - hoja.columnasOcultas.length).fill(false)]
      : hoja.columnasOcultas,
    filasOcultas: filasNuevas.length > hoja.filasOcultas.length
      ? [...hoja.filasOcultas, ...new Array(filasNuevas.length - hoja.filasOcultas.length).fill(false)]
      : hoja.filasOcultas,
  };
}

/** Mezcla el formato pedido con el que la celda ya tenía. */
function fusionarEstilo(actual: EstiloCelda | undefined, cambio: CambioFormato): EstiloCelda {
  const e: EstiloCelda = { ...actual };
  if (cambio.negrita !== undefined) e.negrita = cambio.negrita;
  if (cambio.cursiva !== undefined) e.cursiva = cambio.cursiva;
  if (cambio.subrayado !== undefined) e.subrayado = cambio.subrayado;
  if (cambio.color) e.color = cambio.color;
  if (cambio.tamano !== undefined) e.tamano = cambio.tamano;
  if (cambio.alineacion) e.alineacion = cambio.alineacion;
  if (cambio.fondo !== undefined) {
    if (cambio.fondo === null) delete e.fondo;
    else {
      e.fondo = cambio.fondo;
      // Igual que al leer: sobre un relleno, la letra tiene que leerse.
      if (!cambio.color) e.color = colorLegible(cambio.fondo);
    }
  }
  return e;
}

/** El formato que la celda tenía, para poder volver atrás. */
function formatoActual(estilo: EstiloCelda | undefined): CambioFormato {
  return {
    negrita: estilo?.negrita ?? false,
    cursiva: estilo?.cursiva ?? false,
    subrayado: estilo?.subrayado ?? false,
    color: estilo?.color,
    fondo: estilo?.fondo ?? null,
    tamano: estilo?.tamano,
    alineacion: estilo?.alineacion,
  };
}

/**
 * Ejecuta una acción sobre la hoja.
 *
 * @returns la hoja resultante y la acción que la deshace.
 */
export function aplicar(hoja: HojaFormato, accion: Accion): { hoja: HojaFormato; inversa: Accion } {
  switch (accion.tipo) {
    case "valores": {
      const maxFila = Math.max(...accion.celdas.map((c) => c.fila)) + 1;
      const maxCol = Math.max(...accion.celdas.map((c) => c.columna)) + 1;
      let out = asegurarTamano(hoja, maxFila, maxCol);

      const antes = accion.celdas.map((c) => ({
        fila: c.fila, columna: c.columna,
        // Se guarda la fórmula, no su resultado: deshacer tiene que devolver
        // la fórmula, no el número que mostraba.
        valor: celdaEn(out, c.fila, c.columna).formula
          ? `=${celdaEn(out, c.fila, c.columna).formula}`
          : celdaEn(out, c.fila, c.columna).crudo,
      }));

      const porFila = new Map<number, typeof accion.celdas>();
      for (const c of accion.celdas) {
        const lista = porFila.get(c.fila) ?? [];
        lista.push(c);
        porFila.set(c.fila, lista);
      }

      out = {
        ...out,
        filas: out.filas.map((fila, f) => {
          const cambios = porFila.get(f);
          if (!cambios) return fila;
          const copia = [...fila];
          for (const c of cambios) {
            const previa = copia[c.columna] ?? CELDA_VACIA;
            const esFormula = c.valor.trimStart().startsWith("=");
            // Si la celda tiene un formato (moneda, %, decimales), el valor
            // escrito se muestra CON él: al ordenar una columna de precios,
            // los importes tienen que seguir viéndose "S/ 1,250.00" y no 1250.
            const numero = Number(c.valor);
            const texto = esFormula || c.valor.trim() === "" || !previa.numFmt || !Number.isFinite(numero)
              ? c.valor
              : formatearValor(numero, previa.numFmt);
            copia[c.columna] = {
              ...previa,
              crudo: c.valor,
              formula: esFormula ? c.valor.trimStart().slice(1) : undefined,
              texto,
            };
          }
          return copia;
        }),
      };
      return { hoja: out, inversa: { tipo: "valores", celdas: antes } };
    }

    case "formato": {
      const antes = accion.celdas.map((c) => ({ fila: c.fila, columna: c.columna }));
      const previos = accion.celdas.map((c) => formatoActual(celdaEn(hoja, c.fila, c.columna).estilo));
      const objetivo = new Set(accion.celdas.map((c) => `${c.fila}-${c.columna}`));

      const out: HojaFormato = {
        ...hoja,
        filas: hoja.filas.map((fila, f) => fila.map((celda, c) => (
          objetivo.has(`${f}-${c}`)
            ? {
                ...celda,
                estilo: fusionarEstilo(celda.estilo, accion.formato),
                // Al cambiar el formato numérico cambia lo que se muestra, y
                // hay que recordarlo para los recálculos siguientes.
                numFmt: accion.formato.numFmt !== undefined
                  ? (accion.formato.numFmt ?? undefined)
                  : celda.numFmt,
                texto: accion.formato.numFmt !== undefined
                  ? formatearValor(Number(celda.crudo) || celda.crudo, accion.formato.numFmt ?? undefined)
                  : celda.texto,
              }
            : celda))),
      };
      // La inversa de aplicar formato a N celdas que tenían formatos distintos
      // son N acciones; se guarda la del conjunto tal como estaba.
      return {
        hoja: out,
        inversa: { tipo: "formato", celdas: antes, formato: previos[0] ?? {} },
      };
    }

    case "estructura": {
      const { eje, indice, delta } = accion;
      const i = indice - 1; // el archivo cuenta desde 1
      if (eje === "fila") {
        if (delta > 0) {
          const cols = hoja.filas[0]?.length ?? 1;
          const filas = [...hoja.filas];
          // Si la acción trae datos es un deshacer de "eliminar fila": la fila
          // vuelve con su contenido, no vacía.
          filas.splice(i, 0, Array.from({ length: cols }, (_, k) =>
            accion.datos?.[k] ? { ...accion.datos[k] } : { ...CELDA_VACIA }));
          const altos = [...hoja.altos]; altos.splice(i, 0, 20);
          const ocultas = [...hoja.filasOcultas]; ocultas.splice(i, 0, false);
          return {
            hoja: { ...hoja, filas, altos, filasOcultas: ocultas },
            inversa: { tipo: "estructura", eje, indice, delta: -1 },
          };
        }
        const borrada = hoja.filas[i];
        const filas = hoja.filas.filter((_, k) => k !== i);
        const altos = hoja.altos.filter((_, k) => k !== i);
        const ocultas = hoja.filasOcultas.filter((_, k) => k !== i);
        return {
          hoja: { ...hoja, filas, altos, filasOcultas: ocultas },
          inversa: { tipo: "estructura", eje, indice, delta: 1, datos: borrada },
        };
      }

      if (delta > 0) {
        const anchos = [...hoja.anchos]; anchos.splice(i, 0, 64);
        const ocultas = [...hoja.columnasOcultas]; ocultas.splice(i, 0, false);
        return {
          hoja: {
            ...hoja,
            filas: hoja.filas.map((f, k) => {
              const c = [...f];
              c.splice(i, 0, accion.datos?.[k] ? { ...accion.datos[k] } : { ...CELDA_VACIA });
              return c;
            }),
            anchos, columnasOcultas: ocultas,
          },
          inversa: { tipo: "estructura", eje, indice, delta: -1 },
        };
      }
      const borrada = hoja.filas.map((f) => f[i] ?? CELDA_VACIA);
      return {
        hoja: {
          ...hoja,
          filas: hoja.filas.map((f) => f.filter((_, k) => k !== i)),
          anchos: hoja.anchos.filter((_, k) => k !== i),
          columnasOcultas: hoja.columnasOcultas.filter((_, k) => k !== i),
        },
        inversa: { tipo: "estructura", eje, indice, delta: 1, datos: borrada },
      };
    }

    case "ancho": {
      const i = accion.columna - 1;
      const anchos = [...hoja.anchos];
      const previo = anchos[i] ?? 64;
      anchos[i] = accion.anchoPx;
      return {
        hoja: { ...hoja, anchos },
        inversa: { tipo: "ancho", columna: accion.columna, anchoPx: previo },
      };
    }
  }
}

/**
 * Acciones → lo que hay que escribir en el archivo.
 *
 * Se recorre en orden y se agrupa por tipo, respetando que la estructura va
 * primero (mueve las direcciones de todo lo demás).
 */
export function aCambiosDeArchivo(pasos: Accion[], hoja: number): Cambios {
  const cambios: Cambios = { estructura: [], celdas: [], estilos: [], anchos: [] };
  for (const a of pasos) {
    switch (a.tipo) {
      case "valores":
        for (const c of a.celdas) {
          cambios.celdas!.push({ hoja, fila: c.fila + 1, columna: c.columna + 1, valor: c.valor });
        }
        break;
      case "formato":
        for (const c of a.celdas) {
          cambios.estilos!.push({ hoja, fila: c.fila + 1, columna: c.columna + 1, formato: a.formato });
        }
        break;
      case "estructura":
        cambios.estructura!.push({ hoja, eje: a.eje, indice: a.indice, delta: a.delta });
        // Deshacer un "eliminar": la fila/columna vuelve al archivo CON sus
        // valores y su formato, no vacía como una inserción común.
        if (a.delta > 0 && a.datos) {
          a.datos.forEach((celda, k) => {
            const fila = a.eje === "fila" ? a.indice : k + 1;
            const columna = a.eje === "fila" ? k + 1 : a.indice;
            const valor = celda.formula ? `=${celda.formula}` : celda.crudo;
            if (valor !== "") cambios.celdas!.push({ hoja, fila, columna, valor });
            const e = celda.estilo;
            if (e || celda.numFmt) {
              cambios.estilos!.push({
                hoja, fila, columna,
                formato: {
                  negrita: e?.negrita, cursiva: e?.cursiva, subrayado: e?.subrayado,
                  color: e?.color, fondo: e?.fondo ?? undefined, alineacion: e?.alineacion,
                  tamano: e?.tamano, numFmt: celda.numFmt,
                },
              });
            }
          });
        }
        break;
      case "ancho":
        cambios.anchos!.push({ hoja, columna: a.columna, anchoPx: a.anchoPx });
        break;
    }
  }
  return cambios;
}
