/**
 * Los cuadros resumen del SNIFFS: la verificación, no el dato.
 *
 * Además de las cinco secciones de detalle, el SNIFFS exporta cuatro cuadros
 * DERIVADOS que el titular ya presentó:
 *
 *     Cuadro 1  Saldos y Movimientos de Trozas
 *     Cuadro 2  Saldos y Movimientos de Producto Transformado
 *     Cuadro 3  Balance de la Transformación Primaria (por lote)
 *     Apartado 1 Fuentes de Origen / Procedencia
 *
 * NO se importan como registros: son el resultado, no los hechos. Su valor es
 * otro y es enorme — dicen cuánto DEBERÍA dar cada total. Cruzar lo que uno
 * calculó del detalle contra lo que el titular declaró es la única forma de
 * saber si el sistema lee el libro igual que el SNIFFS.
 *
 * Medido contra el libro real: el detalle da 1332.196 m³ de producción y el
 * Cuadro 2 declara 1100.217. Esa diferencia existía antes de este módulo; lo
 * que cambia es que ahora se VE, en vez de quedar como un saldo raro que nadie
 * sabe de dónde salió.
 *
 * PURO: recibe los totales de las dos puntas y devuelve el contraste.
 */

/** Los totales que declara el Cuadro 2 (producto transformado). */
export type CuadroProducto = {
  saldoInicial: number;
  ingresos: number;
  consumos: number;
  producido: number;
  salidas: number;
  saldoFinal: number;
};

/** Los totales que declara el Cuadro 1 (trozas). */
export type CuadroTrozas = {
  saldoInicial: number;
  ingresos: number;
  /** Volumen que entró al retrozado y el que salió: la diferencia es merma. */
  retrozadoInicial: number;
  retrozadoFinal: number;
  consumos: number;
  saldoFinal: number;
};

export type Discrepancia = {
  concepto: string;
  /** Lo que declara el cuadro oficial. */
  declarado: number;
  /** Lo que sale de sumar el detalle. */
  calculado: number;
  diferencia: number;
  /** Qué mirar. Vacío si no hay una causa conocida. */
  pista: string;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * ¿La fórmula del propio cuadro cierra?
 *
 * `Saldo Final = A + B + D − C − E`. Es la que imprime el SNIFFS en la cabecera,
 * así que si NO cierra el problema está en el archivo o en cómo se leyó — y
 * conviene saberlo antes de usarlo para juzgar nada.
 */
export function cuadroProductoCierra(c: CuadroProducto): boolean {
  const esperado = c.saldoInicial + c.ingresos + c.producido - c.consumos - c.salidas;
  return Math.abs(esperado - c.saldoFinal) < 0.01;
}

/**
 * Contrasta el detalle contra el cuadro oficial.
 *
 * Sólo se reportan las diferencias que superan el redondeo: perseguir 0.001 m³
 * de decimales entrena al operador a ignorar la lista entera.
 */
export function contrastarProducto(
  cuadro: CuadroProducto,
  detalle: { producidoM3: number; despachadoM3: number; consumoInternoM3: number },
  tolerancia = 0.01,
): Discrepancia[] {
  const salidasDetalle = detalle.despachadoM3 + detalle.consumoInternoM3;
  const filas: Discrepancia[] = [
    {
      concepto: "Producción",
      declarado: r3(cuadro.producido),
      calculado: r3(detalle.producidoM3),
      diferencia: r3(detalle.producidoM3 - cuadro.producido),
      pista:
        "El cuadro cuenta menos que la Sección 3. Suele venir de las filas marcadas P/R (reprocesado) " +
        "o DIV[N] (paquete dividido): si el paquete dividido se declara aparte y el original sigue entero, " +
        "el mismo volumen figura dos veces en el detalle.",
    },
    {
      concepto: "Salidas",
      declarado: r3(cuadro.salidas),
      calculado: r3(salidasDetalle),
      diferencia: r3(salidasDetalle - cuadro.salidas),
      pista: "Incluye lo despachado con guía y lo marcado C/I (consumo interno). El cuadro puede tratarlos distinto.",
    },
    {
      concepto: "Saldo inicial",
      declarado: r3(cuadro.saldoInicial),
      calculado: 0,
      diferencia: r3(-cuadro.saldoInicial),
      pista:
        "El detalle no trae la existencia de apertura: hay que tomarla del cuadro. Sin ella el depósito " +
        "arranca en cero y da negativo apenas se despacha lo que ya estaba.",
    },
  ];
  return filas.filter((f) => Math.abs(f.diferencia) > tolerancia);
}

/** Lo mismo para las trozas. */
export function contrastarTrozas(
  cuadro: CuadroTrozas,
  detalle: { ingresadoM3: number; consumidoM3: number; enPatioM3: number },
  tolerancia = 0.01,
): Discrepancia[] {
  const merma = r3(cuadro.retrozadoInicial - cuadro.retrozadoFinal);
  const filas: Discrepancia[] = [
    {
      concepto: "Ingresos de trozas",
      declarado: r3(cuadro.ingresos),
      calculado: r3(detalle.ingresadoM3),
      diferencia: r3(detalle.ingresadoM3 - cuadro.ingresos),
      pista: "Si el detalle da más, puede haber filas fuera del período del cuadro.",
    },
    {
      concepto: "Consumos de trozas",
      declarado: r3(cuadro.consumos),
      calculado: r3(detalle.consumidoM3),
      diferencia: r3(detalle.consumidoM3 - cuadro.consumos),
      pista: "",
    },
    {
      concepto: "Saldo en patio",
      declarado: r3(cuadro.saldoFinal),
      calculado: r3(detalle.enPatioM3),
      diferencia: r3(detalle.enPatioM3 - cuadro.saldoFinal),
      pista:
        merma > tolerancia
          ? `El retrozado pierde ${merma} m³ al cortar (entra ${r3(cuadro.retrozadoInicial)}, sale ${r3(cuadro.retrozadoFinal)}). ` +
            "Esa merma no está en el detalle y el patio calculado queda por encima."
          : "",
    },
  ];
  return filas.filter((f) => Math.abs(f.diferencia) > tolerancia);
}

/** Un veredicto de una línea. */
export function veredicto(discrepancias: readonly Discrepancia[]): string {
  if (discrepancias.length === 0) return "Todo cuadra con el cuadro oficial del SNIFFS.";
  const peor = [...discrepancias].sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))[0];
  return `${discrepancias.length} diferencia${discrepancias.length === 1 ? "" : "s"} con el cuadro oficial · la mayor: ${peor.concepto} ${peor.diferencia > 0 ? "+" : ""}${peor.diferencia} m³`;
}
