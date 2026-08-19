/**
 * trozas-import — cargar la lista de trozas de una guía sin tipearla (ADR-320).
 *
 * ## Por qué existe
 *
 * Hoy la lista de trozas entra por un solo camino: la consulta a SERFOR
 * (ADR-312). Cuando el servicio no responde, la guía es vieja o simplemente el
 * proveedor mandó el detalle en un Excel, el operador se queda con dos opciones
 * malas: tipear ochenta filas a mano o registrar el ingreso **sin trozas** — y
 * un ingreso sin trozas es el que después no se puede cruzar contra el POA.
 *
 * Esto NO abre la puerta a editar trozas existentes: siguen siendo inmutables y
 * se crean con su guía, en la misma transacción. Lo que se agrega es otra fuente
 * para el MISMO momento de carga.
 *
 * ## Lo que verifica antes de dejar pasar
 *
 * · Cada fila tiene que dar un volumen: o viene declarado, o se calcula por
 *   Huber con d1/d2/largo. Sin ninguno de los dos, la fila se rechaza — una
 *   troza sin volumen no suma al libro y desaparecería sin aviso.
 * · Si el volumen viene declarado Y se puede calcular, se comparan: una
 *   diferencia > 5 % es un aviso, no un rechazo. El documento manda (regla
 *   heredada de [[appforestal-proyecto-referencia]]: el volumen del libro tiene
 *   que cuadrar con el papel), pero el operador tiene que enterarse.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { volumenHuber } from "./ctp-retrozado";

export interface TrozaImportada {
  orden: number;
  codificacion: string | null;
  especieComun: string | null;
  especieCientifica: string | null;
  dimensiones: string | null;
  largoM: number | null;
  diametroCm: number | null;
  d1Cm: number | null;
  d2Cm: number | null;
  cantidad: number | null;
  volumenM3: number | null;
  /**
   * El código que ESTE centro le marca a la pieza al recibirla (ADR-335). Se
   * carga en el alta —cuando el camión está en el patio— y no después.
   */
  codigoPlanta?: string | null;
  /**
   * Cuándo bajó ESTA pieza del camión, `YYYY-MM-DD` (ADR-336). Vacío = la
   * fecha de recepción del ingreso. Se guarda por pieza porque una guía grande
   * se descarga en dos viajes y el patio del lunes no puede incluir la madera
   * que llegó el miércoles.
   */
  fechaRecepcion?: string | null;
  /** La guía la declara pero NO bajó del camión (ADR-325). */
  noRecepcionada?: boolean;
}

export interface ResultadoImportTrozas {
  trozas: TrozaImportada[];
  /** Filas que no se pudieron leer, con el motivo y su número de fila. */
  errores: Array<{ fila: number; motivo: string }>;
  /** Cosas que pasaron pero no impiden cargar. */
  avisos: string[];
  /** Σ de los volúmenes: se compara contra lo declarado en la línea del ingreso. */
  volumenTotal: number;
}

/** Columnas que la lista puede traer, y cómo se llaman en la práctica. */
const COLUMNAS: Record<string, string[]> = {
  codificacion: ["codigo", "codificacion", "cod", "codtroza", "codigotroza", "troza", "n"],
  especieComun: ["especie", "nombrecomun", "comun", "especiecomun"],
  especieCientifica: ["cientifico", "nombrecientifico", "especiecientifica"],
  d1: ["d1", "diametromayor", "diammayor", "dmayor", "diametro1"],
  d2: ["d2", "diametromenor", "diammenor", "dmenor", "diametro2"],
  diametro: ["diametro", "diam", "dprom", "diametropromedio"],
  largo: ["largo", "longitud", "l", "largom"],
  cantidad: ["cantidad", "cant", "piezas"],
  volumen: ["volumen", "vol", "m3", "volm3", "volumenm3"],
};

/** Sin tildes, sin espacios ni símbolos, en minúscula — para cotejar encabezados. */
function clave(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Parte el texto pegado en filas y columnas. Acepta lo que sale de un Excel
 * (tabuladores), de un CSV (coma o punto y coma) y de una tabla copiada de un
 * PDF (varios espacios). El separador se decide por fila, no global: una lista
 * copiada a mano mezcla los tres.
 */
export function filasDesdeTexto(texto: string): string[][] {
  return (texto ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((linea) => {
      const sep = linea.includes("\t") ? "\t" : linea.includes(";") ? ";" : linea.includes(",") ? "," : /\s{2,}/;
      return linea.split(sep).map((c) => c.trim());
    });
}

/**
 * Un número escrito como lo escribe la gente: "1,25" (coma decimal), "1.25",
 * con unidades pegadas ("45cm", "2.5 m"). `null` si no hay número.
 */
export function aNumero(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v ?? "").trim();
  if (!t) return null;
  // Con AMBOS separadores, el último que aparece es el decimal y el otro son
  // miles: "1.234,50" son mil doscientos treinta y cuatro con cincuenta, y
  // "1,234.50" lo mismo escrito a la inglesa. Con uno solo, es el decimal
  // ("1,25" y "1.25" son lo mismo en una lista de volúmenes).
  const iComa = t.lastIndexOf(",");
  const iPunto = t.lastIndexOf(".");
  let limpio: string;
  if (iComa >= 0 && iPunto >= 0) {
    const milesEs = iComa > iPunto ? "." : ",";
    const decimalEs = iComa > iPunto ? "," : ".";
    limpio = t.split(milesEs).join("").replace(decimalEs, ".");
  } else {
    limpio = t.replace(",", ".");
  }
  const m = limpio.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** ¿La primera fila son encabezados? Lo es si al menos dos celdas matchean. */
export function esFilaDeEncabezados(fila: string[]): boolean {
  const todos = Object.values(COLUMNAS).flat();
  const aciertos = fila.filter((c) => todos.includes(clave(c))).length;
  return aciertos >= 2;
}

/** Mapa columna→índice a partir de los encabezados. */
function mapearColumnas(encabezados: string[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  encabezados.forEach((celda, i) => {
    const k = clave(celda);
    for (const [campo, alias] of Object.entries(COLUMNAS)) {
      if (mapa[campo] === undefined && alias.includes(k)) mapa[campo] = i;
    }
  });
  return mapa;
}

/**
 * Orden por defecto cuando la lista NO trae encabezados. Es el de la GTF
 * oficial: código · especie · d1 · d2 · largo · volumen.
 */
const ORDEN_POSICIONAL = ["codificacion", "especieComun", "d1", "d2", "largo", "volumen"] as const;

const r4 = (n: number) => Number(n.toFixed(4));

/**
 * Interpreta las filas como trozas.
 *
 * `especiePorDefecto` se usa cuando la lista no trae columna de especie: en una
 * guía de una sola especie es lo normal, y dejarlas sin especie las volvería
 * inservibles para el cruce contra el POA.
 */
export function interpretarTrozas(
  filas: string[][],
  opts: { especiePorDefecto?: string | null; especieCientificaPorDefecto?: string | null } = {},
): ResultadoImportTrozas {
  const errores: ResultadoImportTrozas["errores"] = [];
  const avisos: string[] = [];
  const trozas: TrozaImportada[] = [];

  if (filas.length === 0) {
    return { trozas, errores, avisos: ["No se encontró ninguna fila."], volumenTotal: 0 };
  }

  const conEncabezado = esFilaDeEncabezados(filas[0]!);
  const mapa = conEncabezado ? mapearColumnas(filas[0]!) : {};
  const cuerpo = conEncabezado ? filas.slice(1) : filas;

  if (!conEncabezado) {
    avisos.push("La lista no trae encabezados: se leyó por posición (código · especie · D1 · D2 · largo · volumen).");
  }

  const celda = (fila: string[], campo: string): string => {
    if (conEncabezado) {
      const i = mapa[campo];
      return i === undefined ? "" : (fila[i] ?? "");
    }
    const i = (ORDEN_POSICIONAL as readonly string[]).indexOf(campo);
    return i < 0 ? "" : (fila[i] ?? "");
  };

  let diferenciasGrandes = 0;

  cuerpo.forEach((fila, idx) => {
    const nroFila = idx + (conEncabezado ? 2 : 1);
    // Una fila con una sola celda suele ser un total o una nota al pie.
    if (fila.filter(Boolean).length < 2) {
      errores.push({ fila: nroFila, motivo: "La fila no tiene datos suficientes" });
      return;
    }

    const d1 = aNumero(celda(fila, "d1"));
    const d2 = aNumero(celda(fila, "d2"));
    const diamSuelto = aNumero(celda(fila, "diametro"));
    const largo = aNumero(celda(fila, "largo"));
    const declarado = aNumero(celda(fila, "volumen"));

    // Con un solo diámetro, la troza se trata como cilindro: d1 = d2. Es lo que
    // hace el resto del módulo cuando la guía sólo trae el promedio.
    const dA = d1 ?? diamSuelto;
    const dB = d2 ?? diamSuelto ?? d1;

    let calculado: number | null = null;
    if (dA != null && dB != null && largo != null && dA > 0 && dB > 0 && largo > 0) {
      calculado = volumenHuber(dA, dB, largo);
    }

    const volumen = declarado ?? calculado;
    if (volumen == null || volumen <= 0) {
      errores.push({
        fila: nroFila,
        motivo: "Sin volumen: falta el declarado y no alcanzan los diámetros y el largo para calcularlo",
      });
      return;
    }

    // El documento manda: si el declarado difiere del calculado se conserva el
    // declarado y se avisa. Corregirlo en silencio dejaría el libro sin cuadrar
    // con el papel que un fiscalizador tiene en la mano.
    if (declarado != null && calculado != null && calculado > 0) {
      const dif = Math.abs(declarado - calculado) / calculado;
      if (dif > 0.05) diferenciasGrandes += 1;
    }

    const especie = celda(fila, "especieComun").trim() || opts.especiePorDefecto || null;
    const dims = dA != null && dB != null && largo != null ? `${dA} × ${dB} × ${largo}` : null;

    trozas.push({
      orden: trozas.length + 1,
      codificacion: celda(fila, "codificacion").trim() || null,
      especieComun: especie,
      especieCientifica: opts.especieCientificaPorDefecto ?? null,
      dimensiones: dims,
      largoM: largo,
      // El promedio, que es lo que guarda el schema para mostrar.
      diametroCm: dA != null && dB != null ? r4((dA + dB) / 2) : (dA ?? dB),
      d1Cm: dA,
      d2Cm: dB,
      cantidad: aNumero(celda(fila, "cantidad")) ?? 1,
      volumenM3: r4(volumen),
    });
  });

  if (diferenciasGrandes > 0) {
    avisos.push(
      `${diferenciasGrandes} troza(s) tienen un volumen declarado que difiere más de 5 % del calculado. Se conservó el declarado: el libro tiene que cuadrar con el documento.`,
    );
  }
  if (trozas.length === 0 && errores.length > 0) {
    avisos.push("Ninguna fila se pudo leer. Revisá que las columnas tengan código, diámetros y largo, o el volumen.");
  }

  return {
    trozas,
    errores,
    avisos,
    volumenTotal: r4(trozas.reduce((a, t) => a + (t.volumenM3 ?? 0), 0)),
  };
}

/**
 * Compara el total importado contra el volumen que declara la línea del ingreso.
 * Devuelve el mensaje a mostrar, o `null` si cuadra.
 *
 * No bloquea: la lista de trozas y el volumen de la línea pueden diferir
 * legítimamente (mermas, redondeos del documento). Lo que no puede pasar es que
 * difieran **y nadie se entere**.
 */
export function compararConDeclarado(volumenTrozas: number, volumenLinea: number): string | null {
  if (volumenLinea <= 0 || volumenTrozas <= 0) return null;
  const dif = Math.abs(volumenTrozas - volumenLinea);
  if (dif / volumenLinea <= 0.02) return null;
  const signo = volumenTrozas > volumenLinea ? "más" : "menos";
  return `Las trozas suman ${volumenTrozas.toFixed(4)} m³, ${signo} que los ${volumenLinea.toFixed(4)} m³ declarados en el ingreso (${((dif / volumenLinea) * 100).toFixed(1)} % de diferencia).`;
}
