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
import { colorLegible, formatearValor, numeroALetra } from "@/lib/documentos/xlsx-formato";
import { moverFormula } from "@/lib/documentos/xlsx-estructura";
import type { CambioFormato } from "@/lib/documentos/xlsx-estilos";
import type { Cambios } from "@/lib/documentos/xlsx-escritura";

/** Un bloque combinado, en coordenadas de pantalla (base 0, normalizado). */
export interface Rect {
  filaIni: number;
  colIni: number;
  filaFin: number;
  colFin: number;
}

export type Accion =
  /** Escribir en una o muchas celdas (escribir, pegar, borrar un rango). */
  | { tipo: "valores"; celdas: { fila: number; columna: number; valor: string }[] }
  /** Aplicar formato a un conjunto de celdas. */
  | { tipo: "formato"; celdas: { fila: number; columna: number }[]; formato: CambioFormato }
  /** Insertar o eliminar una fila/columna. */
  | { tipo: "estructura"; eje: "fila" | "columna"; indice: number; delta: 1 | -1; datos?: CeldaHoja[] }
  /** Cambiar el ancho de una columna. */
  | { tipo: "ancho"; columna: number; anchoPx: number }
  /** Cambiar el alto de una fila (base 1, alto en píxeles de pantalla). */
  | { tipo: "alto"; fila: number; altoPx: number }
  /** Ocultar o mostrar una fila/columna (base 1). */
  | { tipo: "visibilidad"; eje: "fila" | "columna"; indice: number; oculta: boolean }
  /** Congelar paneles: N filas y M columnas quedan fijas (0,0 = descongelar). */
  | { tipo: "congelar"; filas: number; columnas: number }
  /** Combinar un rango en una sola celda visible (la ancla). */
  | ({ tipo: "combinar" } & Rect)
  /** Separar un bloque combinado. */
  | ({ tipo: "descombinar" } & Rect);

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
  if (cambio.bordes !== undefined) {
    if (cambio.bordes === null) delete e.bordes;
    else e.bordes = { arriba: true, abajo: true, izq: true, der: true };
  }
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
    // La inversa es todo-o-nada: una celda con bordes parciales vuelve con
    // los cuatro. Es el precio de no guardar el detalle por lado.
    bordes: estilo?.bordes ? true : null,
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
      // son N acciones; se guarda la del conjunto tal como estaba. `bordes`
      // sólo viaja si la acción los tocó: su inversa es todo-o-nada y pisaría
      // bordes parciales del archivo al deshacer cualquier otro formato.
      const formatoInverso: CambioFormato = { ...(previos[0] ?? {}) };
      if (accion.formato.bordes === undefined) delete formatoInverso.bordes;
      return {
        hoja: out,
        inversa: { tipo: "formato", celdas: antes, formato: formatoInverso },
      };
    }

    case "estructura": {
      const { eje, indice, delta } = accion;
      const i = indice - 1; // el archivo cuenta desde 1
      /**
       * Las fórmulas de la MISMA hoja corren sus referencias, igual que hace
       * el archivo: si el total era `SUM(B2:B3)` y se insertó una fila arriba,
       * en pantalla tiene que decir `SUM(B3:B4)` o el número mostrado miente.
       */
      const correrFormulas = (filas: CeldaHoja[][]): CeldaHoja[][] => filas.map((fila) => fila.map((c) => {
        if (!c.formula) return c;
        const nueva = moverFormula(c.formula, eje, indice, delta);
        return nueva === c.formula ? c : { ...c, formula: nueva };
      }));
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
            hoja: { ...hoja, filas: correrFormulas(filas), altos, filasOcultas: ocultas },
            inversa: { tipo: "estructura", eje, indice, delta: -1 },
          };
        }
        const borrada = hoja.filas[i];
        const filas = hoja.filas.filter((_, k) => k !== i);
        const altos = hoja.altos.filter((_, k) => k !== i);
        const ocultas = hoja.filasOcultas.filter((_, k) => k !== i);
        return {
          hoja: { ...hoja, filas: correrFormulas(filas), altos, filasOcultas: ocultas },
          inversa: { tipo: "estructura", eje, indice, delta: 1, datos: borrada },
        };
      }

      if (delta > 0) {
        const anchos = [...hoja.anchos]; anchos.splice(i, 0, 64);
        const ocultas = [...hoja.columnasOcultas]; ocultas.splice(i, 0, false);
        return {
          hoja: {
            ...hoja,
            filas: correrFormulas(hoja.filas.map((f, k) => {
              const c = [...f];
              c.splice(i, 0, accion.datos?.[k] ? { ...accion.datos[k] } : { ...CELDA_VACIA });
              return c;
            })),
            anchos, columnasOcultas: ocultas,
          },
          inversa: { tipo: "estructura", eje, indice, delta: -1 },
        };
      }
      const borrada = hoja.filas.map((f) => f[i] ?? CELDA_VACIA);
      return {
        hoja: {
          ...hoja,
          filas: correrFormulas(hoja.filas.map((f) => f.filter((_, k) => k !== i))),
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

    case "alto": {
      const i = accion.fila - 1;
      const altos = [...hoja.altos];
      const previo = altos[i] ?? 20;
      altos[i] = accion.altoPx;
      return {
        hoja: { ...hoja, altos },
        inversa: { tipo: "alto", fila: accion.fila, altoPx: previo },
      };
    }

    case "visibilidad": {
      const i = accion.indice - 1;
      if (accion.eje === "fila") {
        const ocultas = [...hoja.filasOcultas];
        const previo = ocultas[i] ?? false;
        ocultas[i] = accion.oculta;
        return {
          hoja: { ...hoja, filasOcultas: ocultas },
          inversa: { ...accion, oculta: previo },
        };
      }
      const ocultas = [...hoja.columnasOcultas];
      const previo = ocultas[i] ?? false;
      ocultas[i] = accion.oculta;
      return {
        hoja: { ...hoja, columnasOcultas: ocultas },
        inversa: { ...accion, oculta: previo },
      };
    }

    case "congelar": {
      const previo = hoja.congelado;
      return {
        hoja: { ...hoja, congelado: { filas: accion.filas, columnas: accion.columnas } },
        inversa: { tipo: "congelar", filas: previo.filas, columnas: previo.columnas },
      };
    }

    /**
     * Combinar marca las celdas con las MISMAS señales que pone la lectura del
     * archivo: el ancla lleva el tamaño del bloque, las de su fila quedan
     * tapadas, y la primera columna de las filas de abajo se dibuja como
     * continuación (vacía, sin borde superior) — nunca rowspan, que desarma
     * la tabla virtualizada. Los valores de las celdas tapadas NO se borran:
     * al separar, vuelven a verse.
     */
    case "combinar": case "descombinar": {
      const { filaIni, colIni, filaFin, colFin } = accion;
      const combinando = accion.tipo === "combinar";
      const nfilas = filaFin - filaIni + 1;
      const ncols = colFin - colIni + 1;
      const out = {
        ...asegurarTamano(hoja, filaFin + 1, colFin + 1),
      };
      out.filas = out.filas.map((fila, f) => {
        if (f < filaIni || f > filaFin) return fila;
        return fila.map((celda, c) => {
          if (c < colIni || c > colFin) return celda;
          const limpia: CeldaHoja = { ...celda };
          delete limpia.colspan;
          delete limpia.rowspan;
          delete limpia.tapada;
          delete limpia.continuaArriba;
          if (!combinando) return limpia;
          if (f === filaIni && c === colIni) {
            return { ...limpia, colspan: ncols > 1 ? ncols : undefined, rowspan: nfilas > 1 ? nfilas : undefined };
          }
          if (f === filaIni) return { ...limpia, tapada: true };
          if (c === colIni) return { ...limpia, continuaArriba: true, colspan: ncols > 1 ? ncols : undefined };
          return { ...limpia, tapada: true };
        });
      });
      return {
        hoja: out,
        inversa: { ...accion, tipo: combinando ? "descombinar" : "combinar" },
      };
    }
  }
}

/** Los bloques combinados de la hoja, reconstruidos desde sus señales. */
export function mergesDe(hoja: HojaFormato): Rect[] {
  const out: Rect[] = [];
  hoja.filas.forEach((fila, f) => {
    fila.forEach((celda, c) => {
      if (celda.tapada || celda.continuaArriba) return;
      const ncols = celda.colspan ?? 1;
      const nfilas = celda.rowspan ?? 1;
      if (ncols > 1 || nfilas > 1) {
        out.push({ filaIni: f, colIni: c, filaFin: f + nfilas - 1, colFin: c + ncols - 1 });
      }
    });
  });
  return out;
}

/**
 * Corre las coordenadas de las acciones PENDIENTES cuando se inserta o
 * elimina una fila/columna.
 *
 * Sin esto, "escribí B5 y después inserté una fila arriba" guardaba el valor
 * en la fila equivocada: el archivo aplica primero TODA la estructura y
 * después los valores, así que todo lo pendiente tiene que quedar expresado
 * en las coordenadas nuevas. Las acciones de estructura no se tocan: son un
 * programa secuencial que el archivo repite en su orden.
 */
export function remapearPendientes(acciones: Accion[], eje: "fila" | "columna", indice: number, delta: 1 | -1): Accion[] {
  const i0 = indice - 1; // la estructura cuenta desde 1; la pantalla desde 0
  /** Corre una coordenada; null si estaba en la línea eliminada. */
  const mover = (v: number): number | null => {
    if (v < i0) return v;
    if (delta < 0 && v === i0) return null;
    return v + delta;
  };
  /** Para el FIN de un rango: si cae en la línea borrada, el rango se achica. */
  const moverFin = (v: number): number => (delta < 0 && v >= i0 ? v - 1 : v >= i0 ? v + delta : v);

  const out: Accion[] = [];
  for (const a of acciones) {
    switch (a.tipo) {
      case "valores": {
        const celdas = a.celdas.flatMap((c) => {
          const v = eje === "fila" ? mover(c.fila) : mover(c.columna);
          if (v === null) return [];
          // Una fórmula pendiente también corre sus referencias.
          const valor = c.valor.trimStart().startsWith("=")
            ? `=${moverFormula(c.valor.trimStart().slice(1), eje, indice, delta)}`
            : c.valor;
          return [eje === "fila" ? { ...c, fila: v, valor } : { ...c, columna: v, valor }];
        });
        if (celdas.length > 0) out.push({ ...a, celdas });
        break;
      }
      case "formato": {
        const celdas = a.celdas.flatMap((c) => {
          const v = eje === "fila" ? mover(c.fila) : mover(c.columna);
          if (v === null) return [];
          return [eje === "fila" ? { ...c, fila: v } : { ...c, columna: v }];
        });
        if (celdas.length > 0) out.push({ ...a, celdas });
        break;
      }
      case "ancho": {
        if (eje === "fila") { out.push(a); break; }
        const v = mover(a.columna - 1);
        if (v !== null) out.push({ ...a, columna: v + 1 });
        break;
      }
      case "alto": {
        if (eje === "columna") { out.push(a); break; }
        const v = mover(a.fila - 1);
        if (v !== null) out.push({ ...a, fila: v + 1 });
        break;
      }
      case "visibilidad": {
        if (a.eje !== eje) { out.push(a); break; }
        const v = mover(a.indice - 1);
        if (v !== null) out.push({ ...a, indice: v + 1 });
        break;
      }
      case "congelar": {
        // Insertar por encima de la línea congelada agranda el panel fijo.
        if (eje === "fila" && i0 < a.filas) out.push({ ...a, filas: Math.max(0, a.filas + delta) });
        else if (eje === "columna" && i0 < a.columnas) out.push({ ...a, columnas: Math.max(0, a.columnas + delta) });
        else out.push(a);
        break;
      }
      case "combinar": case "descombinar": {
        const ini = eje === "fila" ? mover(a.filaIni) : mover(a.colIni);
        const iniVal = ini ?? i0; // el ancla borrada: el bloque arranca donde estaba
        const b = eje === "fila"
          ? { ...a, filaIni: iniVal, filaFin: moverFin(a.filaFin) }
          : { ...a, colIni: iniVal, colFin: moverFin(a.colFin) };
        // Un bloque que quedó de una sola celda ya no es un combinado.
        if (b.filaFin >= b.filaIni && b.colFin >= b.colIni && (b.filaFin > b.filaIni || b.colFin > b.colIni)) {
          out.push(b);
        }
        break;
      }
      case "estructura":
        out.push(a);
        break;
    }
  }
  return out;
}

/**
 * Acciones → lo que hay que escribir en el archivo.
 *
 * Se recorre en orden y se agrupa por tipo, respetando que la estructura va
 * primero (mueve las direcciones de todo lo demás).
 */
export function aCambiosDeArchivo(pasos: Accion[], hoja: number): Cambios {
  const cambios: Cambios = {
    estructura: [], celdas: [], estilos: [], anchos: [], combinadas: [],
    altos: [], visibilidad: [], congelados: [],
  };
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
      case "alto":
        cambios.altos!.push({ hoja, fila: a.fila, altoPx: a.altoPx });
        break;
      case "visibilidad":
        cambios.visibilidad!.push({ hoja, eje: a.eje, indice: a.indice, oculta: a.oculta });
        break;
      case "congelar":
        cambios.congelados!.push({ hoja, filas: a.filas, columnas: a.columnas });
        break;
      case "combinar":
      case "descombinar":
        cambios.combinadas!.push({
          hoja,
          ref: `${numeroALetra(a.colIni + 1)}${a.filaIni + 1}:${numeroALetra(a.colFin + 1)}${a.filaFin + 1}`,
          modo: a.tipo === "combinar" ? "agregar" : "quitar",
        });
        break;
    }
  }
  return cambios;
}
